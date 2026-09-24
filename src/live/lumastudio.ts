import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
export type DisplayFit="fit"|"fill"|"stretch";
export interface DisplaySurface {id:string;name:string;sceneObjectId?:string;sourceOutputId:string;fit:DisplayFit;brightness:number;flipX:boolean;flipY:boolean;rotation:number;latencyMs:number;}
export interface StudioMediaFrame {type:"lumastudio.media";version:1;outputId:string;timestamp:number;positionSeconds:number;playing:boolean;sectionId?:string;program?:{state?:"live"|"black"|"clear"|"freeze";clips:Array<{id:string;name:string;source:{kind:"local";path:string;format:"mp4"|"mov"}|{kind:"youtube";url:string;videoId:string};timelineStartSeconds:number;sourceInSeconds:number;sourceOutSeconds?:number;sectionId?:string;loop:boolean;playbackMode:"timeline"|"section"|"manual";enabled:boolean}>};}
function isTauriRuntime(){ return "__TAURI_INTERNALS__" in window; }
export async function connectStudioMedia(_url:string,handlers:{onFrame:(frame:StudioMediaFrame)=>void;onOpen?:()=>void;onClose?:()=>void;onError?:(message:string)=>void}){
 let unlistenFrame:UnlistenFn|undefined,unlistenStatus:UnlistenFn|undefined;
 if(!isTauriRuntime()){ handlers.onError?.("Studio media bridge requires the desktop app."); return()=>{}; }
 try{
  unlistenFrame=await listen<StudioMediaFrame>("lumastudio-media",e=>handlers.onFrame(e.payload));
  unlistenStatus=await listen<string>("lumastudio-media-status",e=>e.payload==="connected"?handlers.onOpen?.():handlers.onClose?.());
  await invoke("start_lumastudio_media_listener");
 }catch(error){handlers.onError?.(String(error));}
 return()=>{unlistenFrame?.();unlistenStatus?.();};
}

const DISPLAY_FITS = new Set<DisplayFit>(["fit","fill","stretch"]);
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const finite = (value: unknown, fallback: number) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function parseDisplaySurfaces(value: unknown): DisplaySurface[] {
 const source = Array.isArray(value) ? value : [];
 const ids = new Set<string>();
 const surfaces: DisplaySurface[] = [];
 for (const item of source.slice(0, 100)) {
  if (!record(item)) continue;
  const id = typeof item.id === "string" ? item.id.trim() : "";
  const sourceOutputId = typeof item.sourceOutputId === "string" ? item.sourceOutputId.trim() : "";
  if (!id || ids.has(id) || !sourceOutputId) continue;
  ids.add(id);
  const fit = typeof item.fit === "string" && DISPLAY_FITS.has(item.fit as DisplayFit) ? item.fit as DisplayFit : "fit";
  const sceneObjectId = typeof item.sceneObjectId === "string" && item.sceneObjectId.trim() ? item.sceneObjectId.trim() : undefined;
  surfaces.push({
   id,
   name: typeof item.name === "string" && item.name.trim() ? item.name.trim() : id,
   sceneObjectId,
   sourceOutputId,
   fit,
   brightness: clamp(finite(item.brightness, 1), 0, 2),
   flipX: item.flipX === true,
   flipY: item.flipY === true,
   rotation: finite(item.rotation, 0),
   latencyMs: clamp(finite(item.latencyMs, 0), 0, 60_000)
  });
 }
 return surfaces;
}

export function readDisplaySurfaces(storage: Pick<Storage, "getItem">): DisplaySurface[] {
 try {
  const raw = storage.getItem("lumaviz.display-surfaces");
  return raw ? parseDisplaySurfaces(JSON.parse(raw)) : [];
 } catch {
  return [];
 }
}
