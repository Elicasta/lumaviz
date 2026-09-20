import { describe, expect, it } from "vitest";
import { getCameraPose } from "./cameraPresets";
import { DEFAULT_DIMENSIONS } from "./defaults";

describe("production camera presets", () => {
  it("places FOH in the audience facing the stage", () => {
    const pose = getCameraPose("foh", DEFAULT_DIMENSIONS);
    expect(pose.position.z).toBeLessThan(0);
    expect(pose.target.z).toBeGreaterThan(pose.position.z);
  });

  it("keeps stage left and stage right mirrored", () => {
    const left = getCameraPose("stage-left", DEFAULT_DIMENSIONS);
    const right = getCameraPose("stage-right", DEFAULT_DIMENSIONS);
    expect(left.position.x).toBeCloseTo(-right.position.x);
    expect(left.position.z).toBeCloseTo(right.position.z);
  });

  it("puts top view above the ceiling", () => {
    const pose = getCameraPose("top", DEFAULT_DIMENSIONS);
    expect(pose.position.y).toBeGreaterThan(DEFAULT_DIMENSIONS.ceilingHeight);
  });
});
