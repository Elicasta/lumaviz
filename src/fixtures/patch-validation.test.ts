import { describe, expect, it } from "vitest";
import { validatePatch } from "./patch-validation";
import type { FixtureDefinition } from "../viz/types";

const fixture=(id:string,address:number,modeId="14ch-common"):FixtureDefinition=>({
  id,name:id,kind:"moving-head",position:{x:0,y:0,z:0},rotation:{x:0,y:0,z:0},
  patch:{enabled:true,universe:1,address,profileId:"generic-moving-head",modeId}
});

describe("patch validation",()=>{
  it("detects overlapping fixture footprints",()=>{
    const result=validatePatch([fixture("a",21),fixture("b",30)]);
    expect(result.conflicts.length).toBeGreaterThan(0);
  });
  it("accepts adjacent fixture footprints",()=>{
    const result=validatePatch([fixture("a",21),fixture("b",35)]);
    expect(result.conflicts).toHaveLength(0);
  });
  it("flags footprints that exceed channel 512",()=>{
    const result=validatePatch([fixture("a",505)]);
    expect(result.outOfRange).toHaveLength(1);
  });
});
