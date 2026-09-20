use serde::Serialize;
use std::{
    net::{Ipv4Addr, UdpSocket},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};
use tauri::{AppHandle, Emitter, State};

const ARTNET_PORT: u16 = 6454;
const ARTNET_HEADER: &[u8; 8] = b"Art-Net\0";
const ARTNET_OP_DMX: u16 = 0x5000;

const SACN_PORT: u16 = 5568;
const SACN_ACN_ID: &[u8; 12] = b"ASC-E1.17\0\0\0";

#[derive(Default)]
struct ListenerState {
    running: Mutex<Option<Arc<AtomicBool>>>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DmxPacket {
    universe: u16,
    sequence: u8,
    physical: u8,
    data: Vec<u8>,
    source: String,
}

fn parse_artdmx(packet: &[u8], source: String) -> Option<DmxPacket> {
    if packet.len() < 18 || &packet[0..8] != ARTNET_HEADER {
        return None;
    }

    let opcode = u16::from_le_bytes([packet[8], packet[9]]);
    if opcode != ARTNET_OP_DMX {
        return None;
    }

    let protocol_version = u16::from_be_bytes([packet[10], packet[11]]);
    if protocol_version < 14 {
        return None;
    }

    let sequence = packet[12];
    let physical = packet[13];
    let port_address = u16::from_le_bytes([packet[14], packet[15]]);
    let declared_length = u16::from_be_bytes([packet[16], packet[17]]) as usize;
    let available_length = packet.len().saturating_sub(18);
    let data_length = declared_length.min(available_length).min(512);

    // Art-Net Port-Address 0 is displayed as Universe 1 in LumaViz.
    Some(DmxPacket {
        universe: port_address.saturating_add(1),
        sequence,
        physical,
        data: packet[18..18 + data_length].to_vec(),
        source,
    })
}

fn parse_sacn(packet: &[u8], socket_source: String) -> Option<DmxPacket> {
    if packet.len() < 126 {
        return None;
    }

    if u16::from_be_bytes([packet[0], packet[1]]) != 0x0010 {
        return None;
    }

    if &packet[4..16] != SACN_ACN_ID {
        return None;
    }

    if u32::from_be_bytes([packet[18], packet[19], packet[20], packet[21]]) != 0x0000_0004 {
        return None;
    }

    if u32::from_be_bytes([packet[40], packet[41], packet[42], packet[43]]) != 0x0000_0002 {
        return None;
    }

    if packet[117] != 0x02 || packet[118] != 0xa1 {
        return None;
    }

    let universe = u16::from_be_bytes([packet[113], packet[114]]);
    if !(1..=63_999).contains(&universe) {
        return None;
    }

    let property_count = u16::from_be_bytes([packet[123], packet[124]]) as usize;
    if property_count == 0 || packet[125] != 0 {
        return None;
    }

    let requested_slots = property_count.saturating_sub(1).min(512);
    let available_slots = packet.len().saturating_sub(126);
    let slot_count = requested_slots.min(available_slots);
    let sequence = packet[111];

    let source_name_bytes = &packet[44..108];
    let source_end = source_name_bytes
        .iter()
        .position(|byte| *byte == 0)
        .unwrap_or(source_name_bytes.len());
    let source_name = String::from_utf8_lossy(&source_name_bytes[..source_end]).trim().to_string();

    Some(DmxPacket {
        universe,
        sequence,
        physical: 0,
        data: packet[126..126 + slot_count].to_vec(),
        source: if source_name.is_empty() {
            socket_source
        } else {
            format!("{source_name} · {socket_source}")
        },
    })
}

fn sacn_multicast_addr(universe: u16) -> Ipv4Addr {
    Ipv4Addr::new(239, 255, (universe >> 8) as u8, (universe & 0xff) as u8)
}

#[tauri::command]
fn start_artnet_listener(
    app: AppHandle,
    state: State<'_, ListenerState>,
) -> Result<(), String> {
    let mut guard = state
        .running
        .lock()
        .map_err(|_| "Art-Net listener state is unavailable".to_string())?;

    if guard.as_ref().is_some_and(|flag| flag.load(Ordering::Relaxed)) {
        return Ok(());
    }

    let running = Arc::new(AtomicBool::new(true));
    *guard = Some(running.clone());
    drop(guard);

    std::thread::spawn(move || {
        let socket = match UdpSocket::bind(("0.0.0.0", ARTNET_PORT)) {
            Ok(socket) => socket,
            Err(error) => {
                let _ = app.emit(
                    "artnet-error",
                    format!("Could not bind UDP port {ARTNET_PORT}: {error}"),
                );
                running.store(false, Ordering::Relaxed);
                return;
            }
        };

        let _ = socket.set_broadcast(true);
        let _ = socket.set_read_timeout(Some(Duration::from_millis(250)));
        let _ = app.emit("artnet-status", "listening");

        let mut buffer = [0u8; 530];

        while running.load(Ordering::Relaxed) {
            match socket.recv_from(&mut buffer) {
                Ok((count, source)) => {
                    if let Some(frame) = parse_artdmx(&buffer[..count], source.to_string()) {
                        let _ = app.emit("artnet-dmx", frame);
                    }
                }
                Err(error)
                    if matches!(
                        error.kind(),
                        std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut
                    ) => {}
                Err(error) => {
                    let _ = app.emit("artnet-error", error.to_string());
                    break;
                }
            }
        }

        running.store(false, Ordering::Relaxed);
        let _ = app.emit("artnet-status", "stopped");
    });

    Ok(())
}

#[tauri::command]
fn stop_artnet_listener(state: State<'_, ListenerState>) -> Result<(), String> {
    let mut guard = state
        .running
        .lock()
        .map_err(|_| "Art-Net listener state is unavailable".to_string())?;

    if let Some(running) = guard.take() {
        running.store(false, Ordering::Relaxed);
    }

    Ok(())
}

#[tauri::command]
fn start_sacn_listener(
    app: AppHandle,
    state: State<'_, ListenerState>,
    universes: Vec<u16>,
) -> Result<(), String> {
    let mut guard = state
        .running
        .lock()
        .map_err(|_| "sACN listener state is unavailable".to_string())?;

    if guard.as_ref().is_some_and(|flag| flag.load(Ordering::Relaxed)) {
        return Ok(());
    }

    let universes: Vec<u16> = universes
        .into_iter()
        .filter(|universe| (1..=63_999).contains(universe))
        .collect();

    if universes.is_empty() {
        return Err("Choose at least one valid sACN universe.".to_string());
    }

    let running = Arc::new(AtomicBool::new(true));
    *guard = Some(running.clone());
    drop(guard);

    std::thread::spawn(move || {
        let socket = match UdpSocket::bind(("0.0.0.0", SACN_PORT)) {
            Ok(socket) => socket,
            Err(error) => {
                let _ = app.emit(
                    "sacn-error",
                    format!("Could not bind UDP port {SACN_PORT}: {error}"),
                );
                running.store(false, Ordering::Relaxed);
                return;
            }
        };

        for universe in &universes {
            let group = sacn_multicast_addr(*universe);
            if let Err(error) = socket.join_multicast_v4(&group, &Ipv4Addr::UNSPECIFIED) {
                let _ = app.emit(
                    "sacn-error",
                    format!("Could not join sACN universe {universe} ({group}): {error}"),
                );
            }
        }

        let _ = socket.set_read_timeout(Some(Duration::from_millis(250)));
        let _ = app.emit("sacn-status", "listening");

        let mut buffer = [0u8; 640];

        while running.load(Ordering::Relaxed) {
            match socket.recv_from(&mut buffer) {
                Ok((count, source)) => {
                    if let Some(frame) = parse_sacn(&buffer[..count], source.to_string()) {
                        let _ = app.emit("sacn-dmx", frame);
                    }
                }
                Err(error)
                    if matches!(
                        error.kind(),
                        std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut
                    ) => {}
                Err(error) => {
                    let _ = app.emit("sacn-error", error.to_string());
                    break;
                }
            }
        }

        for universe in &universes {
            let group = sacn_multicast_addr(*universe);
            let _ = socket.leave_multicast_v4(&group, &Ipv4Addr::UNSPECIFIED);
        }

        running.store(false, Ordering::Relaxed);
        let _ = app.emit("sacn-status", "stopped");
    });

    Ok(())
}

#[tauri::command]
fn stop_sacn_listener(state: State<'_, ListenerState>) -> Result<(), String> {
    stop_artnet_listener(state)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(ListenerState::default())
        .invoke_handler(tauri::generate_handler![
            start_artnet_listener,
            stop_artnet_listener,
            start_sacn_listener,
            stop_sacn_listener
        ])
        .run(tauri::generate_context!())
        .expect("error while running LumaViz");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_artdmx_into_one_based_universe() {
        let mut packet = vec![0u8; 23];
        packet[0..8].copy_from_slice(ARTNET_HEADER);
        packet[8..10].copy_from_slice(&ARTNET_OP_DMX.to_le_bytes());
        packet[10..12].copy_from_slice(&14u16.to_be_bytes());
        packet[12] = 7;
        packet[13] = 2;
        packet[14..16].copy_from_slice(&0u16.to_le_bytes());
        packet[16..18].copy_from_slice(&5u16.to_be_bytes());
        packet[18..23].copy_from_slice(&[255, 1, 2, 3, 4]);

        let parsed = parse_artdmx(&packet, "127.0.0.1:6454".to_string()).unwrap();
        assert_eq!(parsed.universe, 1);
        assert_eq!(parsed.sequence, 7);
        assert_eq!(parsed.data, vec![255, 1, 2, 3, 4]);
    }

    #[test]
    fn rejects_non_dmx_artnet_opcodes() {
        let mut packet = vec![0u8; 18];
        packet[0..8].copy_from_slice(ARTNET_HEADER);
        packet[8..10].copy_from_slice(&0x2000u16.to_le_bytes());
        packet[10..12].copy_from_slice(&14u16.to_be_bytes());
        assert!(parse_artdmx(&packet, "source".to_string()).is_none());
    }

    #[test]
    fn parses_sacn_data_packet() {
        let mut packet = vec![0u8; 131];
        packet[0..2].copy_from_slice(&0x0010u16.to_be_bytes());
        packet[4..16].copy_from_slice(SACN_ACN_ID);
        packet[18..22].copy_from_slice(&0x0000_0004u32.to_be_bytes());
        packet[40..44].copy_from_slice(&0x0000_0002u32.to_be_bytes());
        packet[44..52].copy_from_slice(b"LumaRig\0");
        packet[111] = 9;
        packet[113..115].copy_from_slice(&1u16.to_be_bytes());
        packet[117] = 0x02;
        packet[118] = 0xa1;
        packet[123..125].copy_from_slice(&6u16.to_be_bytes());
        packet[125] = 0;
        packet[126..131].copy_from_slice(&[255, 10, 20, 30, 40]);

        let parsed = parse_sacn(&packet, "127.0.0.1:5568".to_string()).unwrap();
        assert_eq!(parsed.universe, 1);
        assert_eq!(parsed.sequence, 9);
        assert_eq!(parsed.data, vec![255, 10, 20, 30, 40]);
        assert!(parsed.source.starts_with("LumaRig"));
    }

    #[test]
    fn calculates_sacn_multicast_address() {
        assert_eq!(sacn_multicast_addr(1), Ipv4Addr::new(239, 255, 0, 1));
        assert_eq!(sacn_multicast_addr(258), Ipv4Addr::new(239, 255, 1, 2));
    }
}
