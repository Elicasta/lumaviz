# LumaViz

Standalone production lighting visualizer for **LumaRig**.

**LumaRig owns programming and playback. LumaViz owns the world.**

A LumaViz crash, GPU stall, monitor disconnect, or closed visualizer must never interrupt physical DMX output or a running show.

## Workflow

### BUILD
Construct the virtual production space:

- venue / room
- stage
- truss
- screen
- drape
- production objects
- real-world dimensions and materials

### PATCH
Define how network DMX maps into the world:

- fixture profile
- universe
- start address
- enabled state

### VISUALIZE
Main editable 3D environment.

### CAMERAS
Production views:

- FOH
- crowd
- stage left
- stage right
- backstage
- top
- free camera
- custom cameras planned next

### CONNECT
Choose one input source:

- LumaRig Direct
- Art-Net
- sACN / E1.31
- local demo source

### MONITOR
Clean fullscreen rendering output with minimal operator chrome.

## Control boundary

```
LumaRig
  programming / songs / cues / FX / playback
         |
         | semantic frames OR DMX-over-network
         v
LumaViz CONNECT
         |
         v
PATCH / normalization
         |
         v
virtual fixture state
         |
         v
Babylon.js production world
         |
         +-- VISUALIZE
         +-- CAMERAS
         +-- MONITOR
```

## v0.1 input paths

### LumaRig Direct

WebSocket fixture-frame protocol. This is preferred when both apps are Luma products because no raw DMX re-decoding is required.

Default development endpoint:

```
ws://127.0.0.1:9460/lumaviz
```

### Art-Net

Native desktop UDP listener on port 6454. Art-Net Port-Address 0 is presented as **Universe 1** in the LumaViz UI.

### sACN / E1.31

Native desktop UDP listener on port 5568. LumaViz joins multicast groups for universes currently used by PATCH.

## Fixture strategy

LumaViz will not become another hand-maintained fixture database.

Priority order:

1. **GDTF / MVR** for geometry, photometrics, kinematics, gobos, and scene exchange.
2. **FreeStyler .FXT / .PFF compatibility** so existing fixture profiles remain useful.
3. **Open Fixture Library** for open DMX definitions.
4. Native custom profiles only when a fixture does not exist elsewhere.

v0.1 includes a small generic profile set only to prove the patch/runtime pipeline. The fixture-library import layer comes next.

## Development

```bash
npm install
npm run dev
npm run tauri:dev
```

Web-only scene development runs at http://localhost:1421.

## Packaging

GitHub workflows are included for:

- universal macOS APP + DMG
- Windows x64 NSIS EXE + MSI

Updater publishing is intentionally not pointed at a fake endpoint. A dedicated release repository and signing keys should be added after the first launch-tested builds.

See:

- [docs/PROTOCOL.md](docs/PROTOCOL.md)
- [docs/RELEASES.md](docs/RELEASES.md)
- [docs/ROADMAP.md](docs/ROADMAP.md)
