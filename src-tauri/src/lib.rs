use serde::Serialize;
use std::{
    net::UdpSocket,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};
use tauri::{AppHandle, Emitter, State};

const ARTNET_PORT: u16 = 6454;
const ARTNET_HEADER: &[u8; 8] = b"Art-Net\0";
const OP_DMX: u16 = 0x5000;

#[derive(Default)]
struct ArtNetState {
    running: Mutex<Option<Arc<AtomicBool>>>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ArtNetDmxPacket {
    universe: u16,
    sequence: u8,
    physical: u8,
    data: Vec<u8>,
    source: String,
}

fn parse_artdmx(packet: &[u8], source: String) -> Option<ArtNetDmxPacket> {
    if packet.len() < 18 || &packet[0..8] != ARTNET_HEADER {
        return None;
    }

    let opcode = u16::from_le_bytes([packet[8], packet[9]]);
    if opcode != OP_DMX {
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

    // LumaViz presents Art-Net Port-Address 0 as "Universe 1" in the UI.
    Some(ArtNetDmxPacket {
        universe: port_address.saturating_add(1),
        sequence,
        physical,
        data: packet[18..18 + data_length].to_vec(),
        source,
    })
}

#[tauri::command]
fn start_artnet_listener(
    app: AppHandle,
    state: State<'_, ArtNetState>,
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
fn stop_artnet_listener(state: State<'_, ArtNetState>) -> Result<(), String> {
    let mut guard = state
        .running
        .lock()
        .map_err(|_| "Art-Net listener state is unavailable".to_string())?;

    if let Some(running) = guard.take() {
        running.store(false, Ordering::Relaxed);
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(ArtNetState::default())
        .invoke_handler(tauri::generate_handler![
            start_artnet_listener,
            stop_artnet_listener
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
        packet[8..10].copy_from_slice(&OP_DMX.to_le_bytes());
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
    fn rejects_non_dmx_opcodes() {
        let mut packet = vec![0u8; 18];
        packet[0..8].copy_from_slice(ARTNET_HEADER);
        packet[8..10].copy_from_slice(&0x2000u16.to_le_bytes());
        packet[10..12].copy_from_slice(&14u16.to_be_bytes());
        assert!(parse_artdmx(&packet, "source".to_string()).is_none());
    }
}
