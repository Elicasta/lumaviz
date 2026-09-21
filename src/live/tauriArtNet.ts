import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { DmxUniversePacket } from "../viz/types";

function isTauriRuntime(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

export async function startArtNetReceiver(
  onPacket: (packet: DmxUniversePacket) => void,
  onError?: (message: string) => void,
  onStatus?: (status: string) => void
): Promise<UnlistenFn | null> {
  if (!isTauriRuntime()) {
    onError?.("Art-Net listener requires the desktop app.");
    return null;
  }

  const unlistenPacket = await listen<DmxUniversePacket>("artnet-dmx", (event) => {
    onPacket(event.payload);
  });

  const unlistenError = await listen<string>("artnet-error", (event) => {
    onError?.(event.payload);
  });

  const unlistenStatus = await listen<string>("artnet-status", (event) => {
    onStatus?.(event.payload);
  });

  try {
    await invoke("start_artnet_listener");
  } catch (error) {
    await unlistenPacket();
    await unlistenError();
    await unlistenStatus();
    onError?.(String(error));
    return null;
  }

  return async () => {
    await unlistenPacket();
    await unlistenError();
    await unlistenStatus();
    try {
      await invoke("stop_artnet_listener");
    } catch {
      // App shutdown can tear down native state before listener cleanup runs.
    }
  };
}
