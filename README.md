# LumaViz

Standalone production lighting visualizer for **LumaRig**.

LumaViz renders. LumaRig controls.

A visualizer crash, GPU stall, or disconnected monitor must never interrupt DMX output or a running show.

## v0.1

The first usable build is intentionally production-first:

- Babylon.js 9 renderer inside Tauri 2
- Real-world room, stage, screen, and drape dimensions
- Feet/meters display without changing the internal meter-based scene
- FOH, Stage Left, Stage Right, Crowd, Top, Backstage, and Free camera views
- Select, move, and rotate fixture placeholders
- Production Dark, Ballroom, and Black Box material presets
- PAR and moving-head fixture visualization
- Normalized fixture-frame contract ready for LumaRig
- Built-in demo motion/color source for testing without DMX
- macOS APP/DMG and Windows NSIS/MSI packaging workflows
- CI for TypeScript, unit tests, production frontend build, and Rust

## Fixture strategy

LumaViz will not become another hand-maintained fixture database.

Priority order:

1. **GDTF / MVR** for geometry, photometrics, kinematics, gobos, and scene exchange.
2. **FreeStyler .FXT / .PFF compatibility** so existing fixture profiles remain useful.
3. **Open Fixture Library** for open DMX definitions.
4. LumaViz custom profiles only when a fixture does not exist elsewhere.

## Development

```bash
npm install
npm run dev
npm run tauri:dev
```

Web-only development runs at http://localhost:1421.

## Architecture

```
LumaRig
  |
  | normalized fixture frames
  v
LumaViz bridge
  |
  v
Fixture runtime ------> Babylon.js scene
                         |
                         +-- room/stage dimensions
                         +-- fixture geometry
                         +-- materials
                         +-- camera presets
                         +-- beam/light rendering
```

See:

- [docs/PROTOCOL.md](docs/PROTOCOL.md)
- [docs/RELEASES.md](docs/RELEASES.md)
- [docs/ROADMAP.md](docs/ROADMAP.md)
