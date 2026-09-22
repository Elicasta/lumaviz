import { describe,expect,it } from "vitest";
import { canAutoApplyStageChange, stageChangeConflicts, type StageChange } from "./stage-sync";
const change:StageChange={id:"c1",entityId:"f1",entityKind:"fixture",category:"fixturePosition",source:"lumarig",baseRevision:4,createdAt:"now",summary:"move",before:null,after:null};
describe("Stage Sync policy",()=>{
  it("detects stale revisions",()=>expect(stageChangeConflicts(5,change)).toBe(true));
  it("only auto-applies safe spatial changes in live mode",()=>{
    expect(canAutoApplyStageChange("live",change)).toBe(true);
    expect(canAutoApplyStageChange("review",change)).toBe(false);
    expect(canAutoApplyStageChange("live",{...change,category:"patch"})).toBe(false);
  });
});
