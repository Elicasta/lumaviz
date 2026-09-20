# LumaRig → LumaViz connection protocol

LumaViz is a **listener and renderer**. It never owns LumaRig show playback or physical DMX output.

All transports normalize into the same virtual fixture state before rendering.

## 1. LumaRig Direct

Preferred path when LumaRig is the controller.

Transport: WebSocket.

Development endpoint:

```
ws://127.0.0.1:9460/lumaviz
```

On connection, LumaViz sends:

```json
{
  "type": "lumaviz.hello",
  "protocolVersion": 1,
  "capabilities": ["fixture-frame-v1"]
}
```

LumaRig sends normalized fixture frames:

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

LumaRig Direct carries semantic state, not raw controller UI state.

## 2. Art-Net

Desktop listener:

- UDP port: 6454
- ArtDMX packets only in v0.1
- Port-Address 0 is displayed as LumaViz Universe 1

Flow:

```
ArtDMX packet
  -> universe + channel bytes
  -> PATCH fixture profile
  -> normalized fixture frame
  -> renderer
```

## 3. sACN / E1.31

Desktop listener:

- UDP port: 5568
- standard data packets
- DMX start code 0
- multicast subscriptions derived from PATCH universes

Flow is identical to Art-Net after the universe byte array enters the patch layer.

## PATCH contract

Each visual fixture stores:

```json
{
  "enabled": true,
  "universe": 1,
  "address": 21,
  "profileId": "lumaviz-moving-head-9ch"
}
```

The profile determines channel semantics and footprint.

GDTF, FreeStyler, and Open Fixture Library imports should eventually resolve into this runtime mapping automatically.

## Rendering rules

- Fixture IDs are stable inside a scene.
- Intensity is normalized 0..1.
- Colors are resolved display colors by the time they reach the renderer.
- Pan and tilt are physical degrees.
- Missing semantic properties retain the previous rendered value.
- A lost connection freezes the last valid rendered frame.
- Disconnecting LumaViz never sends blackout or stop commands to LumaRig.
- Transport code never directly manipulates Babylon meshes.
- PATCH / normalization is the boundary between DMX bytes and fixture semantics.

## Source switching

Only one source is authoritative at a time:

1. LumaRig Direct
2. Art-Net
3. sACN
4. Demo

Switching sources does not change the venue, patch, camera definitions, or saved scene.
