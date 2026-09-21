import type { DmxUniversePacket } from "../viz/types";

export type VizBridgeCallbacks = {
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (message: string) => void;
  onPacket: (packet: DmxUniversePacket) => void;
};

export function connectVizBridge(
  url: string,
  callbacks: VizBridgeCallbacks
): () => void {
  const socket = new WebSocket(url);
  socket.addEventListener("open", () => callbacks.onOpen?.());
  socket.addEventListener("close", () => callbacks.onClose?.());
  socket.addEventListener("error", () => callbacks.onError?.("VizBridge WebSocket connection failed."));
  socket.addEventListener("message", (event) => {
    try {
      const payload = JSON.parse(String(event.data));
      if (payload?.type !== "dmx-frame" || !payload.frame) return;
      const frame = payload.frame;
      callbacks.onPacket({
        universe: Number(frame.universe),
        sequence: Number(frame.sequence ?? 0),
        physical: 0,
        data: Array.isArray(frame.data) ? frame.data : [],
        source: String(frame.source ?? "VizBridge")
      });
    } catch {
      callbacks.onError?.("VizBridge sent an invalid DMX frame.");
    }
  });
  return () => socket.close();
}
