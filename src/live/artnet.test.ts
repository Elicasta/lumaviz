import { describe, expect, it } from "vitest";
import { fixtureFrameFromDmxPacket } from "./artnet";
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
    profileId: "generic-rgbw-par",
    modeId: "5ch-drgbw"
  }
};

describe("network DMX fixture decoding", () => {
  it("maps patched DMX bytes into normalized fixture state", () => {
    const frame = fixtureFrameFromDmxPacket({
      universe: 1,
      sequence: 12,
      physical: 0,
      source: "127.0.0.1",
      data: [128, 255, 0, 0, 0]
    }, [fixture], "artnet");

    expect(frame.fixtures).toHaveLength(1);
    expect(frame.fixtures[0].id).toBe("par-1");
    expect(frame.fixtures[0].intensity).toBeCloseTo(128 / 255);
    expect(frame.fixtures[0].color).toBe("#ff0000");
  });

  it("ignores fixtures patched to another universe", () => {
    const frame = fixtureFrameFromDmxPacket({
      universe: 2,
      sequence: 1,
      physical: 0,
      source: "127.0.0.1",
      data: [255, 255, 255, 255, 255]
    }, [fixture], "sacn");

    expect(frame.fixtures).toHaveLength(0);
  });
});

it('uses the same RGBW, no-dimmer and 16-bit meanings as the Rig semantic stream',()=>{
  const moving: FixtureDefinition={...fixture,id:'moving',kind:'moving-head',patch:{enabled:true,universe:2,address:100,profileId:'generic-moving-head',modeId:'14ch-common'}};
  const noDim:FixtureDefinition={...fixture,id:'hex',patch:{enabled:true,universe:2,address:50,profileId:'adj-mega-hex-par',modeId:'6ch-direct'}};
  const data=Array(512).fill(0);
  data[49]=64;data[50]=32;data[51]=16;data[52]=200;data[53]=70;data[54]=30;
  data[99]=128;data[100]=255;data[101]=64;data[102]=127;data[106]=128;data[107]=200;
  const [hex,mover]=fixtureFrameFromDmxPacket({universe:2,sequence:1,physical:0,source:'loopback',data},[noDim,moving],'artnet').fixtures;
  expect(hex.intensity).toBe(1);
  expect(hex.color).toBe('#402010');
  expect(hex.emitters?.white).toBeCloseTo(70/255);
  expect(hex.emitters?.amber).toBeCloseTo(200/255);
  expect(mover.pan).toBeCloseTo(((128*256+255)/65535-.5)*540,7);
  expect(mover.tilt).toBeCloseTo(((64*256+127)/65535-.5)*270,7);
  expect(mover.strobeHz).toBeCloseTo(128/255*20);
  expect(mover.color).toBe('#ffffff'); // no RGB channels; wheel positions require calibration
  expect(mover.intensity).toBeCloseTo(200/255);
});
it('rejects a missing personality mode instead of visualizing the wrong layout',()=>{
  const invalid={...fixture,patch:{...fixture.patch,modeId:'not-a-real-mode'}};
  const frame=fixtureFrameFromDmxPacket({universe:1,sequence:1,physical:0,source:'loopback',data:Array(512).fill(255)},[invalid],'artnet');
  expect(frame.fixtures).toEqual([]);
});
