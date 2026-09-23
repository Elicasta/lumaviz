import { describe, expect, it } from "vitest";
import { DmxSequenceGate } from "./dmx-sequence";

describe("DmxSequenceGate", () => {
  it("rejects duplicates and late packets", () => {
    const gate = new DmxSequenceGate();
    expect(gate.accept("artnet", "rig", 1, 10)).toBe(true);
    expect(gate.accept("artnet", "rig", 1, 10)).toBe(false);
    expect(gate.accept("artnet", "rig", 1, 9)).toBe(false);
    expect(gate.accept("artnet", "rig", 1, 11)).toBe(true);
  });

  it("accepts sequence wraparound", () => {
    const gate = new DmxSequenceGate();
    expect(gate.accept("sacn", "rig", 1, 254)).toBe(true);
    expect(gate.accept("sacn", "rig", 1, 255)).toBe(true);
    expect(gate.accept("sacn", "rig", 1, 0)).toBe(true);
    expect(gate.accept("sacn", "rig", 1, 1)).toBe(true);
  });

  it("treats Art-Net sequence zero as sequencing disabled", () => {
    const gate = new DmxSequenceGate();
    expect(gate.accept("artnet", "rig", 1, 12)).toBe(true);
    expect(gate.accept("artnet", "rig", 1, 0)).toBe(true);
    expect(gate.accept("artnet", "rig", 1, 11)).toBe(false);
  });

  it("tracks sources and universes independently", () => {
    const gate = new DmxSequenceGate();
    expect(gate.accept("artnet", "a", 1, 20)).toBe(true);
    expect(gate.accept("artnet", "a", 2, 4)).toBe(true);
    expect(gate.accept("artnet", "b", 1, 3)).toBe(true);
  });
});
