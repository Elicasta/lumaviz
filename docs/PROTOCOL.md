# LumaRig → LumaViz fixture frame protocol

LumaViz is a listener. It never owns show playback or physical DMX output.

The transport can change without changing the rendering contract. Same-device IPC, LAN WebSocket, Art-Net-derived state, or another transport can all normalize into this frame shape.

## Frame

```json
{
  "version": 1,
  "showId": "sunday-service",
  "sequence": 18422,
  "timestamp": 1789920000000,
  "fixtures": [
    {
      "id": "mh-1",
      "intensity": 0.82,
      "color": "#ff3a2f",
      "pan": -35,
      "tilt": 54,
      "beamAngle": 18,
      "strobeHz": 0
    }
  ]
}
```

## Rules

- `id` is stable across LumaRig and LumaViz.
- `intensity` is normalized from 0 to 1.
- Colors are rendered values, not raw DMX bytes.
- Pan/tilt are physical degrees after fixture-mode decoding.
- Missing optional properties mean “retain the previous rendered value.”
- Sequence numbers are monotonic. Older frames are discarded.
- Rendering must never write back to LumaRig’s live DMX state.
- When connection is lost, LumaViz freezes the last frame and marks the link offline. It does not blackout fixtures.

## Future transports

1. Same-device Tauri IPC/local socket.
2. LAN WebSocket with discovery.
3. Art-Net/sACN listener mode for third-party controllers and diagnostics.

The renderer only consumes normalized frames. Transport-specific code belongs behind an adapter.
