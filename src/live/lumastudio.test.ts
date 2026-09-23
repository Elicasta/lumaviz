import { describe, expect, it } from "vitest";
import { parseDisplaySurfaces, readDisplaySurfaces } from "./lumastudio";

describe("display surface persistence", () => {
  it("sanitizes persisted display routes", () => {
    expect(parseDisplaySurfaces([
      {
        id: "main",
        name: " Main ",
        sceneObjectId: " screen-1 ",
        sourceOutputId: "program-1",
        fit: "fill",
        brightness: 9,
        flipX: true,
        flipY: "yes",
        rotation: 90,
        latencyMs: -50
      },
      { id: "main", sourceOutputId: "duplicate" },
      null,
      { id: "", sourceOutputId: "program-1" }
    ])).toEqual([{
      id: "main",
      name: "Main",
      sceneObjectId: "screen-1",
      sourceOutputId: "program-1",
      fit: "fill",
      brightness: 2,
      flipX: true,
      flipY: false,
      rotation: 90,
      latencyMs: 0
    }]);
  });

  it("recovers from corrupt storage", () => {
    expect(readDisplaySurfaces({ getItem: () => "{not-json" })).toEqual([]);
  });
});
