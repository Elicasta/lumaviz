import { DEFAULT_DIMENSIONS } from './defaults';
import type { CustomCamera, FixtureDefinition, MaterialPreset, SceneDimensions, SceneObject, ViewPreset } from './types';
import type { DisplaySurface } from '../live/lumastudio';
import type { StageSyncMode } from '../core/stage-sync';
export interface SavedScene {
  dimensions: SceneDimensions; fixtures: FixtureDefinition[]; objects: SceneObject[];
  material: MaterialPreset; activeView: ViewPreset; customCameras: CustomCamera[];
  activeCustomCameraId: string | null; displaySurfaces: DisplaySurface[];
  visualizerMode: '3d' | '2d'; activeLocationId: string; sharedShowName: string;
  sharedShowRevision: number; stageSyncMode: StageSyncMode; stageRevision: number;
}
const record = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const text = (x: unknown): x is string => typeof x === 'string' && x.length > 0 && x.length <= 1024;
const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const vec = (x: unknown) => record(x) && ['x','y','z'].every(k=>finite(x[k]));
function list<T>(value: unknown, label: string, valid: (item: Record<string,unknown>)=>boolean): T[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 10000) throw new Error(`Invalid ${label} list.`);
  const ids = new Set<string>();
  for (const item of value) {
    if (!record(item) || !text(item.id) || ids.has(item.id) || !valid(item)) throw new Error(`Invalid or duplicate ${label} item.`);
    ids.add(item.id);
  }
  return value as T[];
}
function choice<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !allowed.includes(value as T)) throw new Error('Invalid scene option.');
  return value as T;
}
function revision(value: unknown): number {
  if (value === undefined) return 0;
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error('Invalid scene revision.');
  return value as number;
}
/** Parse completely before changing any live scene state. Missing lists mean empty, never merge. */
export function parseSceneFile(raw: string): SavedScene {
  if (raw.length > 20_000_000) throw new Error('Scene file exceeds 20 MB.');
  const data: unknown = JSON.parse(raw);
  if (!record(data)) throw new Error('Invalid scene file.');
  const dimensions = { ...DEFAULT_DIMENSIONS };
  if (data.dimensions !== undefined) {
    if (!record(data.dimensions)) throw new Error('Invalid dimensions.');
    for (const key of Object.keys(dimensions) as (keyof SceneDimensions)[]) {
      const value = data.dimensions[key];
      if (value !== undefined) { if (!finite(value) || value < 0 || value > 10000) throw new Error(`Invalid ${key}.`); dimensions[key] = value; }
    }
  }
  const fixtures = list<FixtureDefinition>(data.fixtures,'fixture',x=>text(x.name) && ['par','moving-head','blinder','bar'].includes(String(x.kind)) && vec(x.position) && vec(x.rotation) && record(x.patch) && typeof x.patch.enabled === 'boolean' && text(x.patch.profileId) && Number.isInteger(x.patch.universe) && (x.patch.universe as number)>=0 && (x.patch.universe as number)<=32767 && Number.isInteger(x.patch.address) && (x.patch.address as number)>=1 && (x.patch.address as number)<=512 && (x.patch.modeId===undefined||text(x.patch.modeId)));
  const objects = list<SceneObject>(data.objects,'object',x=>text(x.name) && ['truss','platform','box','display','speaker','pulpit','scenery'].includes(String(x.kind)) && vec(x.position) && vec(x.rotation) && vec(x.size) && Object.values(x.size as object).every(v=>v>0));
  const entityIds = new Set(fixtures.map(x=>x.id));
  if (objects.some(x=>entityIds.has(x.id))) throw new Error('Fixture and object IDs overlap.');
  const customCameras = list<CustomCamera>(data.customCameras,'camera',x=>text(x.name)&&vec(x.position)&&vec(x.target));
  const displaySurfaces = list<DisplaySurface>(data.displaySurfaces,'display',x=>text(x.name)&&text(x.sourceOutputId)&&['fit','fill','stretch'].includes(String(x.fit))&&finite(x.brightness)&&x.brightness>=0&&x.brightness<=1&&typeof x.flipX==='boolean'&&typeof x.flipY==='boolean'&&finite(x.rotation)&&finite(x.latencyMs)&&x.latencyMs>=0);
  const activeCustomCameraId = data.activeCustomCameraId ?? null;
  if (activeCustomCameraId !== null && !customCameras.some(x=>x.id===activeCustomCameraId)) throw new Error('Active camera is missing.');
  if (data.sharedShowName !== undefined && !text(data.sharedShowName)) throw new Error('Invalid show name.');
  if (data.activeLocationId !== undefined && typeof data.activeLocationId !== 'string') throw new Error('Invalid location.');
  return {dimensions,fixtures,objects,customCameras,displaySurfaces,activeCustomCameraId:activeCustomCameraId as string|null,
    material:choice(data.material,['production-dark','ballroom','black-box'],'production-dark'),
    activeView:choice(data.activeView,['foh','stage-left','stage-right','crowd','top','backstage','free'],'foh'),
    visualizerMode:choice(data.visualizerMode,['3d','2d'],'3d'),activeLocationId:data.activeLocationId as string??'',
    sharedShowName:data.sharedShowName as string??'Untitled show',sharedShowRevision:revision(data.sharedShowRevision),
    stageSyncMode:choice(data.stageSyncMode,['locked','review','live'],'locked'),stageRevision:revision(data.stageRevision)};
}
