export type StageSyncMode = "locked" | "review" | "live";
export type StageChangeCategory = "fixturePosition" | "scenery" | "patch" | "fixtureProfile" | "calibration";
export type StageChangeStatus = "pending" | "applied" | "approved" | "rejected" | "conflict";

export interface StageChange {
  id: string;
  entityId: string;
  entityKind: "fixture" | "object" | "stage";
  category: StageChangeCategory;
  source: "lumarig" | "lumaviz";
  baseRevision: number;
  createdAt: string;
  summary: string;
  before: unknown;
  after: unknown;
  status?: StageChangeStatus;
}

export function stageChangeConflicts(currentRevision:number,change:StageChange):boolean {
  return change.baseRevision !== currentRevision;
}

export function canAutoApplyStageChange(mode:StageSyncMode,change:StageChange):boolean {
  if(mode!=="live") return false;
  return change.category==="fixturePosition" || change.category==="scenery";
}
