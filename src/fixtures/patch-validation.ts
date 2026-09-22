import { findMode } from "./profiles";
import type { FixtureDefinition } from "../viz/types";

export interface PatchSpan {
  fixtureId: string;
  fixtureName: string;
  universe: number;
  start: number;
  end: number;
}

export interface PatchConflict {
  universe: number;
  start: number;
  end: number;
  fixtures: Array<{ id: string; name: string }>;
}

export function fixturePatchSpan(fixture: FixtureDefinition): PatchSpan | null {
  if (!fixture.patch.enabled) return null;
  const mode = findMode(fixture.patch.profileId, fixture.patch.modeId);
  const footprint = Math.max(1, mode?.channelCount ?? 1);
  const start = fixture.patch.address;
  return {
    fixtureId: fixture.id,
    fixtureName: fixture.name,
    universe: fixture.patch.universe,
    start,
    end: start + footprint - 1
  };
}

export function validatePatch(fixtures: readonly FixtureDefinition[]) {
  const spans = fixtures.map(fixturePatchSpan).filter((span): span is PatchSpan => Boolean(span));
  const outOfRange = spans.filter((span) => span.start < 1 || span.end > 512);
  const conflicts: PatchConflict[] = [];
  const byUniverse = new Map<number, PatchSpan[]>();
  for (const span of spans) byUniverse.set(span.universe, [...(byUniverse.get(span.universe) ?? []), span]);
  for (const [universe, universeSpans] of byUniverse) {
    const ordered = [...universeSpans].sort((a,b)=>a.start-b.start || a.end-b.end);
    for (let i=0;i<ordered.length;i++) {
      const members=[ordered[i]];
      let overlapEnd=ordered[i].end;
      for (let j=i+1;j<ordered.length && ordered[j].start<=overlapEnd;j++) {
        members.push(ordered[j]);
        overlapEnd=Math.max(overlapEnd,ordered[j].end);
      }
      if (members.length>1) {
        conflicts.push({
          universe,
          start: Math.max(...members.map(member=>member.start)),
          end: Math.min(...members.map(member=>member.end)),
          fixtures: members.map(member=>({id:member.fixtureId,name:member.fixtureName}))
        });
      }
    }
  }
  const unique = conflicts.filter((conflict,index,all)=>all.findIndex(other =>
    other.universe===conflict.universe &&
    other.start===conflict.start &&
    other.end===conflict.end &&
    other.fixtures.map(f=>f.id).sort().join("|")===conflict.fixtures.map(f=>f.id).sort().join("|")
  )===index);
  return { spans, conflicts: unique, outOfRange };
}
