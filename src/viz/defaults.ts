import { feetToMeters } from "./units";
import type { FixtureDefinition, SceneDimensions, SceneObject } from "./types";

export const DEFAULT_DIMENSIONS: SceneDimensions = {
  roomWidth: feetToMeters(54),
  roomDepth: feetToMeters(68),
  ceilingHeight: feetToMeters(18),
  stageWidth: feetToMeters(36),
  stageDepth: feetToMeters(18),
  stageHeight: feetToMeters(2),
  screenWidth: feetToMeters(13.1),
  screenHeight: feetToMeters(7.4),
  screenBottom: feetToMeters(4.4),
  drapeWidth: feetToMeters(32),
  drapeHeight: feetToMeters(11.6)
};

const y = feetToMeters(9.8);

export const DEFAULT_FIXTURES: FixtureDefinition[] = [
  {
    id: "front-wash-1",
    name: "Front Wash 1",
    kind: "par",
    position: { x: feetToMeters(-11), y, z: feetToMeters(-8) },
    rotation: { x: -32, y: 16, z: 0 },
    patch: { enabled: true, universe: 1, address: 1, profileId: "generic-rgbw-par", modeId: "5ch-drgbw" }
  },
  {
    id: "front-wash-2",
    name: "Front Wash 2",
    kind: "par",
    position: { x: feetToMeters(11), y, z: feetToMeters(-8) },
    rotation: { x: -32, y: -16, z: 0 },
    patch: { enabled: true, universe: 1, address: 6, profileId: "generic-rgbw-par", modeId: "5ch-drgbw" }
  },
  {
    id: "back-wash-1",
    name: "Back Wash 1",
    kind: "par",
    position: { x: feetToMeters(-12), y: feetToMeters(9.2), z: feetToMeters(13) },
    rotation: { x: -50, y: -6, z: 0 },
    patch: { enabled: true, universe: 1, address: 11, profileId: "generic-rgbw-par", modeId: "5ch-drgbw" }
  },
  {
    id: "back-wash-2",
    name: "Back Wash 2",
    kind: "par",
    position: { x: feetToMeters(12), y: feetToMeters(9.2), z: feetToMeters(13) },
    rotation: { x: -50, y: 6, z: 0 },
    patch: { enabled: true, universe: 1, address: 16, profileId: "generic-rgbw-par", modeId: "5ch-drgbw" }
  },
  {
    id: "moving-head-left",
    name: "Moving Head L",
    kind: "moving-head",
    position: { x: feetToMeters(-9), y: feetToMeters(2.7), z: feetToMeters(11) },
    rotation: { x: 0, y: 0, z: 0 },
    patch: { enabled: true, universe: 1, address: 21, profileId: "generic-moving-head", modeId: "14ch-common" }
  },
  {
    id: "moving-head-right",
    name: "Moving Head R",
    kind: "moving-head",
    position: { x: feetToMeters(9), y: feetToMeters(2.7), z: feetToMeters(11) },
    rotation: { x: 0, y: 0, z: 0 },
    patch: { enabled: true, universe: 1, address: 35, profileId: "generic-moving-head", modeId: "14ch-common" }
  }
];


export const DEFAULT_OBJECTS: SceneObject[] = [
  {
    id: "truss-a",
    name: "Truss A",
    kind: "truss",
    position: { x: 0, y: feetToMeters(11), z: feetToMeters(4) },
    rotation: { x: 0, y: 0, z: 0 },
    size: { x: feetToMeters(28), y: feetToMeters(0.5), z: feetToMeters(0.5) }
  },
  {
    id: "truss-b",
    name: "Truss B",
    kind: "truss",
    position: { x: 0, y: feetToMeters(11), z: feetToMeters(14) },
    rotation: { x: 0, y: 0, z: 0 },
    size: { x: feetToMeters(28), y: feetToMeters(0.5), z: feetToMeters(0.5) }
  },
  {
    id: "band-riser",
    name: "Band Riser",
    kind: "platform",
    position: { x: feetToMeters(10), y: feetToMeters(2.3), z: feetToMeters(10) },
    rotation: { x: 0, y: 0, z: 0 },
    size: { x: feetToMeters(8), y: feetToMeters(0.6), z: feetToMeters(5) }
  }
];
