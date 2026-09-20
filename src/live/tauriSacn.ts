import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { DmxUniversePacket } from "../viz/types";

function isTauriRuntime(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

export async function startSacnReceiver(
  universes: number[],
  onPacket: (packet: DmxUniversePacket) => void,
  onError?: (message: string) => void
): Promise<UnlistenFn | null> {
  if (!isTauriRuntime()) {
    onError?.("sACN listener requires the desktop app.");
    return null;
  }

  const unlistenPacket = await listen<DmxUniversePacket>("sacn-dmx", (event) => {
    onPacket(event.payload);
  });

  const unlistenError = await listen<string>("sacn-error", (event) => {
    onError?.(event.payload);
  });

  try {
    await invoke("start_sacn_listener", { universes });
  } catch (error) {
    await unlistenPacket();
    await unlistenError();
    onError?.(String(error));
    return null;
  }

  return async () => {
    await unlistenPacket();
    await unlistenError();
    try {
      await invoke("stop_sacn_listener");
    } catch {
      // Shutdown can tear down native state first.
    }
  };
}
