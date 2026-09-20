import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { ArtNetDmxPacket } from "../viz/types";

function isTauriRuntime(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

export async function startArtNetReceiver(
  onPacket: (packet: ArtNetDmxPacket) => void,
  onError?: (message: string) => void
): Promise<UnlistenFn | null> {
  if (!isTauriRuntime()) {
    onError?.("Art-Net listener requires the desktop app.");
    return null;
  }

  const unlisten = await listen<ArtNetDmxPacket>("artnet-dmx", (event) => {
    onPacket(event.payload);
  });

  try {
    await invoke("start_artnet_listener");
  } catch (error) {
    unlisten();
    onError?.(String(error));
    return null;
  }

  return async () => {
    await unlisten();
    try {
      await invoke("stop_artnet_listener");
    } catch {
      // App shutdown can tear down native state before the listener cleanup runs.
    }
  };
}
