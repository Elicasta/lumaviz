export type ViewPreset =
  | "foh"
  | "stage-left"
  | "stage-right"
  | "crowd"
  | "top"
  | "backstage"
  | "free";

export type TransformTool = "select" | "move" | "rotate";
export type UnitSystem = "ft" | "m";
export type MaterialPreset = "production-dark" | "ballroom" | "black-box";
export type FixtureKind = "par" | "moving-head" | "blinder";
export type SceneObjectKind = "truss" | "platform" | "box";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface SceneDimensions {
  roomWidth: number;
  roomDepth: number;
  ceilingHeight: number;
  stageWidth: number;
  stageDepth: number;
  stageHeight: number;
  screenWidth: number;
  screenHeight: number;
  screenBottom: number;
  drapeWidth: number;
  drapeHeight: number;
}

export interface CustomCamera {
  id: string;
  name: string;
  position: Vec3;
  target: Vec3;
}

export interface SceneObject {
  id: string;
  name: string;
  kind: SceneObjectKind;
  position: Vec3;
  rotation: Vec3;
  size: Vec3;
}

export interface FixturePatch {
  enabled: boolean;
  universe: number;
  address: number;
  profileId: string;
}

export interface FixtureDefinition {
  id: string;
  name: string;
  kind: FixtureKind;
  position: Vec3;
  rotation: Vec3;
  patch: FixturePatch;
}

export interface FixtureState {
  id: string;
  intensity?: number;
  color?: string;
  pan?: number;
  tilt?: number;
  beamAngle?: number;
  strobeHz?: number;
}

export interface FixtureFrame {
  version: 1;
  showId?: string;
  sequence: number;
  timestamp: number;
  fixtures: FixtureState[];
}

export interface DmxUniversePacket {
  universe: number;
  sequence: number;
  physical: number;
  data: number[];
  source: string;
}

export interface SelectionSnapshot extends FixtureDefinition {
  intensity: number;
  color: string;
  pan: number;
  tilt: number;
  beamAngle: number;
}
