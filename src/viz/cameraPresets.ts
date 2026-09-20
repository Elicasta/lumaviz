import type { SceneDimensions, ViewPreset, Vec3 } from "./types";

export interface CameraPose {
  position: Vec3;
  target: Vec3;
}

export function getCameraPose(
  preset: Exclude<ViewPreset, "free">,
  d: SceneDimensions
): CameraPose {
  const audienceRearZ = d.stageDepth - d.roomDepth;
  const roomCenterZ = d.stageDepth - d.roomDepth / 2;
  const stageEyeY = d.stageHeight + 1.7;
  const stageTarget: Vec3 = {
    x: 0,
    y: d.stageHeight + Math.min(1.9, d.ceilingHeight * 0.45),
    z: d.stageDepth * 0.38
  };

  switch (preset) {
    case "foh":
      return {
        position: {
          x: 0,
          y: Math.min(d.ceilingHeight - 0.5, 2.35),
          z: audienceRearZ + Math.max(2.5, d.roomDepth * 0.18)
        },
        target: stageTarget
      };
    case "stage-left":
      return {
        position: {
          x: d.stageWidth * 0.48,
          y: stageEyeY,
          z: d.stageDepth * 0.5
        },
        target: { ...stageTarget, x: -d.stageWidth * 0.18 }
      };
    case "stage-right":
      return {
        position: {
          x: -d.stageWidth * 0.48,
          y: stageEyeY,
          z: d.stageDepth * 0.5
        },
        target: { ...stageTarget, x: d.stageWidth * 0.18 }
      };
    case "crowd":
      return {
        position: { x: 0, y: stageEyeY, z: d.stageDepth * 0.12 },
        target: { x: 0, y: 1.45, z: audienceRearZ * 0.58 }
      };
    case "top":
      return {
        position: {
          x: 0,
          y: Math.max(d.ceilingHeight + 7, d.roomWidth * 0.85),
          z: roomCenterZ
        },
        target: { x: 0, y: 0, z: roomCenterZ }
      };
    case "backstage":
      return {
        position: {
          x: 0,
          y: stageEyeY,
          z: Math.max(0.2, d.stageDepth - 0.6)
        },
        target: { x: 0, y: 1.35, z: audienceRearZ * 0.62 }
      };
  }
}
