# LumaViz roadmap

## v0.1 — Scene foundation

- Production room/stage model
- Real dimensions
- Camera presets
- Fixture placeholders
- Move/rotate tooling
- Material presets
- Normalized fixture frame contract
- Desktop packaging

## v0.2 — Fixture intelligence

- GDTF loader
- Geometry/kinematic chain
- Beam angle and photometric mapping
- Pan/tilt from fixture definition
- Color wheels, gobos, prism, zoom, iris
- Fixture browser/cache

## v0.3 — Existing libraries

- FreeStyler .FXT importer
- FreeStyler .PFF package importer
- Open Fixture Library import
- Mapping UI when imported metadata is incomplete

## v0.4 — LumaRig bridge

- Same-device automatic detection
- LAN discovery
- Normalized fixture-frame streaming
- Connection health and sequence handling
- No control dependency: LumaRig continues if LumaViz disappears

## v0.5 — Production scene exchange

- MVR import
- Scene save/load
- Multiple rooms/venues
- Reusable production templates
- Fixture focus targets and calibration helpers

## Rendering rule

Prefer engine/GDTF capabilities over custom simulation code. LumaViz should assemble proven rendering primitives rather than become its own graphics engine.
