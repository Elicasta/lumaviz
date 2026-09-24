import type { FixtureFrame } from "../viz/types";

export interface LumaRigConnection {
  socket: WebSocket;
  sendStageChange(change: unknown): void;
  sendPatchUpdate(mutation: unknown): void;
  sendPreviewFrame(dataUrl: string, view?: string): void;
  sendSharedShowAck(ack: unknown): void;
  close(): void;
}

const record = (value: unknown): value is Record<string,unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const unit = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
const optional = (value: unknown, valid: (value: unknown) => boolean) => value === undefined || valid(value);
export function isFixtureFrame(value: unknown): value is FixtureFrame {
  if (!record(value) || value.version !== 1 || !Number.isSafeInteger(value.sequence) || (value.sequence as number) < 0
    || !Number.isSafeInteger(value.timestamp) || (value.timestamp as number) < 0 || !Array.isArray(value.fixtures) || value.fixtures.length > 8192
    || !optional(value.showId, v => typeof v === 'string' && v.length <= 256)) return false;
  const ids = new Set<string>();
  for (const fixture of value.fixtures) {
    if (!record(fixture) || typeof fixture.id !== 'string' || !fixture.id || fixture.id.length > 256 || ids.has(fixture.id)) return false;
    ids.add(fixture.id);
    if (!optional(fixture.universe, v => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 32767)
      || !optional(fixture.address, v => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 512)
      || !optional(fixture.intensity, unit)
      || !optional(fixture.color, v => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v))
      || !optional(fixture.pan, v => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 1440)
      || !optional(fixture.tilt, v => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 1440)
      || !optional(fixture.beamAngle, v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 360)
      || !optional(fixture.strobeHz, v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1000)
      || !optional(fixture.capabilities, v => Array.isArray(v) && v.length <= 64 && v.every(k => typeof k === 'string' && k.length <= 64))
      || !optional(fixture.emitters, v => record(v) && ['red','green','blue','white','amber','uv'].every(k => unit(v[k])))) return false;
  }
  return true;
}

export function connectToLumaRig(
  url: string,
  handlers: {
    onOpen?: () => void;
    onFrame: (frame: FixtureFrame) => void;
    onStageChange?: (change: unknown) => void;
    onSharedShowSnapshot?: (snapshot: unknown) => void;
    onSharedShowConflict?: (conflict: unknown) => void;
    onSharedShowActivation?: (activation: unknown) => void;
    onClose?: () => void;
    onError?: (message: string) => void;
  }
): LumaRigConnection {
  const socket = new WebSocket(url);

  socket.addEventListener("open", () => {
    socket.send(JSON.stringify({
      type: "lumaviz.hello",
      protocolVersion: 1,
      capabilities: ["fixture-frame-v1", "preview-frame-v1", "shared-show-v1"]
    }));
    handlers.onOpen?.();
  });

  socket.addEventListener("message", (event) => {
    try {
      const message = JSON.parse(String(event.data)) as unknown;
      if (message && typeof message === "object" && (message as { type?: string }).type === "shared-show.activate") { handlers.onSharedShowActivation?.(message); return; }
      if (message && typeof message === "object" && (message as { type?: string }).type === "shared-show.conflict") {
        handlers.onSharedShowConflict?.(message);
        return;
      }
      if (message && typeof message === "object" && (message as { type?: string }).type === "shared-show.snapshot") {
        handlers.onSharedShowSnapshot?.(message);
        return;
      }
      if (message && typeof message === "object" && (message as { type?: string }).type === "stage-change") {
        handlers.onStageChange?.((message as { change?: unknown }).change);
        return;
      }

      if (isFixtureFrame(message)) {
        handlers.onFrame(message);
        return;
      }

      if (
        message &&
        typeof message === "object" &&
        (message as { type?: string }).type === "fixture-frame"
      ) {
        const frame = (message as { frame?: unknown }).frame;
        if (isFixtureFrame(frame)) handlers.onFrame(frame);
        else handlers.onError?.("LumaRig sent an invalid fixture frame; visualization output was held.");
      }
    } catch (error) {
      handlers.onError?.(`Invalid LumaRig frame: ${String(error)}`);
    }
  });

  socket.addEventListener("error", () => {
    handlers.onError?.("Could not connect to the LumaRig session.");
  });

  socket.addEventListener("close", () => {
    handlers.onClose?.();
  });

  return {
    socket,
    sendStageChange(change: unknown) {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "stage-change", change }));
    },
    sendPatchUpdate(mutation: unknown) {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(mutation));
    },
    sendSharedShowAck(ack: unknown) { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(ack)); },
    sendPreviewFrame(dataUrl: string, view?: string) {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "preview-frame", dataUrl, view, timestamp: Date.now() }));
    },
    close() {
      socket.close(1000, "LumaViz disconnect");
    }
  };
}
