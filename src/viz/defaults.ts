import { feetToMeters } from "./units";
import type { FixtureDefinition, SceneDimensions } from "./types";

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
  { id: "front-wash-1", name: "Front Wash 1", kind: "par", position: { x: feetToMeters(-11), y, z: feetToMeters(-8) }, rotation: { x: -32, y: 16, z: 0 } },
  { id: "front-wash-2", name: "Front Wash 2", kind: "par", position: { x: feetToMeters(11), y, z: feetToMeters(-8) }, rotation: { x: -32, y: -16, z: 0 } },
  { id: "back-wash-1", name: "Back Wash 1", kind: "par", position: { x: feetToMeters(-12), y: feetToMeters(9.2), z: feetToMeters(13) }, rotation: { x: -50, y: -6, z: 0 } },
  { id: "back-wash-2", name: "Back Wash 2", kind: "par", position: { x: feetToMeters(12), y: feetToMeters(9.2), z: feetToMeters(13) }, rotation: { x: -50, y: 6, z: 0 } },
  { id: "moving-head-left", name: "Moving Head L", kind: "moving-head", position: { x: feetToMeters(-9), y: feetToMeters(2.7), z: feetToMeters(11) }, rotation: { x: 0, y: 0, z: 0 } },
  { id: "moving-head-right", name: "Moving Head R", kind: "moving-head", position: { x: feetToMeters(9), y: feetToMeters(2.7), z: feetToMeters(11) }, rotation: { x: 0, y: 0, z: 0 } }
];
