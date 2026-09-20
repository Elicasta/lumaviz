import { describe, expect, it } from "vitest";
import { fixtureFrameFromArtNet } from "./artnet";
import type { FixtureDefinition } from "../viz/types";

const fixture: FixtureDefinition = {
  id: "par-1",
  name: "PAR 1",
  kind: "par",
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  patch: {
    enabled: true,
    universe: 1,
    address: 1,
    profileId: "generic-rgbw-par-5ch"
  }
};

describe("Art-Net fixture decoding", () => {
  it("maps patched DMX bytes into normalized fixture state", () => {
    const frame = fixtureFrameFromArtNet({
      universe: 1,
      sequence: 12,
      physical: 0,
      source: "127.0.0.1:6454",
      data: [128, 255, 0, 0, 0]
    }, [fixture]);

    expect(frame.fixtures).toHaveLength(1);
    expect(frame.fixtures[0].id).toBe("par-1");
    expect(frame.fixtures[0].intensity).toBeCloseTo(128 / 255);
    expect(frame.fixtures[0].color).toBe("#ff0000");
  });

  it("ignores fixtures patched to another universe", () => {
    const frame = fixtureFrameFromArtNet({
      universe: 2,
      sequence: 1,
      physical: 0,
      source: "127.0.0.1:6454",
      data: [255, 255, 255, 255, 255]
    }, [fixture]);

    expect(frame.fixtures).toHaveLength(0);
  });
});
