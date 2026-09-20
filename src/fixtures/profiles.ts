import type { FixtureKind, FixtureState } from "../viz/types";

export interface FixtureProfile {
  id: string;
  name: string;
  kind: FixtureKind;
  footprint: number;
  decode(data: number[], address: number): Omit<FixtureState, "id">;
}

function byte(data: number[], address: number, offset: number): number {
  const index = address - 1 + offset;
  return index >= 0 && index < data.length ? data[index] ?? 0 : 0;
}

function word16(data: number[], address: number, coarseOffset: number, fineOffset: number): number {
  return (byte(data, address, coarseOffset) << 8) | byte(data, address, fineOffset);
}

function hexByte(value: number): string {
  return Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
}

function rgbHex(r: number, g: number, b: number, white = 0): string {
  return `#${hexByte(Math.min(255, r + white))}${hexByte(Math.min(255, g + white))}${hexByte(Math.min(255, b + white))}`;
}

export const FIXTURE_PROFILES: FixtureProfile[] = [
  {
    id: "generic-rgbw-par-5ch",
    name: "Generic RGBW PAR · 5ch",
    kind: "par",
    footprint: 5,
    decode(data, address) {
      const dimmer = byte(data, address, 0) / 255;
      const r = byte(data, address, 1);
      const g = byte(data, address, 2);
      const b = byte(data, address, 3);
      const w = byte(data, address, 4);
      return {
        intensity: dimmer,
        color: rgbHex(r, g, b, w),
        beamAngle: 28
      };
    }
  },
  {
    id: "lumaviz-moving-head-9ch",
    name: "LumaViz Demo Moving Head · 9ch",
    kind: "moving-head",
    footprint: 9,
    decode(data, address) {
      const pan16 = word16(data, address, 0, 1);
      const tilt16 = word16(data, address, 2, 3);
      const dimmer = byte(data, address, 4) / 255;
      const r = byte(data, address, 5);
      const g = byte(data, address, 6);
      const b = byte(data, address, 7);
      const strobe = byte(data, address, 8);
      return {
        intensity: dimmer,
        color: rgbHex(r, g, b),
        pan: (pan16 / 65535) * 540 - 270,
        tilt: (tilt16 / 65535) * 270 - 135,
        beamAngle: 18,
        strobeHz: strobe < 8 ? 0 : 1 + ((strobe - 8) / 247) * 24
      };
    }
  },
  {
    id: "generic-blinder-1ch",
    name: "Generic Blinder · 1ch",
    kind: "blinder",
    footprint: 1,
    decode(data, address) {
      return {
        intensity: byte(data, address, 0) / 255,
        color: "#ffd6a1",
        beamAngle: 48
      };
    }
  }
];

export const PROFILE_BY_ID = new Map(
  FIXTURE_PROFILES.map((profile) => [profile.id, profile] as const)
);
