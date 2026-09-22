import type { FixtureFrame } from "../viz/types";

export interface LumaRigConnection {
  socket: WebSocket;
  sendStageChange(change: unknown): void;
  sendPatchUpdate(mutation: unknown): void;
  sendPreviewFrame(dataUrl: string, view?: string): void;
  close(): void;
}

function isFixtureFrame(value: unknown): value is FixtureFrame {
  if (!value || typeof value !== "object") return false;
  const frame = value as Partial<FixtureFrame>;
  return frame.version === 1
    && typeof frame.sequence === "number"
    && typeof frame.timestamp === "number"
    && Array.isArray(frame.fixtures);
}

export function connectToLumaRig(
  url: string,
  handlers: {
    onOpen?: () => void;
    onFrame: (frame: FixtureFrame) => void;
    onStageChange?: (change: unknown) => void;
    onSharedShowSnapshot?: (snapshot: unknown) => void;
    onSharedShowConflict?: (conflict: unknown) => void;
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
    sendPreviewFrame(dataUrl: string, view?: string) {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "preview-frame", dataUrl, view, timestamp: Date.now() }));
    },
    close() {
      socket.close(1000, "LumaViz disconnect");
    }
  };
}
