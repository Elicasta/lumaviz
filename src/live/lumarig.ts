import type { FixtureFrame } from "../viz/types";

export interface LumaRigConnection {
  socket: WebSocket;
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
    onClose?: () => void;
    onError?: (message: string) => void;
  }
): LumaRigConnection {
  const socket = new WebSocket(url);

  socket.addEventListener("open", () => {
    socket.send(JSON.stringify({
      type: "lumaviz.hello",
      protocolVersion: 1,
      capabilities: ["fixture-frame-v1"]
    }));
    handlers.onOpen?.();
  });

  socket.addEventListener("message", (event) => {
    try {
      const message = JSON.parse(String(event.data)) as unknown;
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
    close() {
      socket.close(1000, "LumaViz disconnect");
    }
  };
}
