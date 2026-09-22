import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
export type DisplayFit="fit"|"fill"|"stretch";
export interface DisplaySurface {id:string;name:string;sceneObjectId?:string;sourceOutputId:string;fit:DisplayFit;brightness:number;flipX:boolean;flipY:boolean;rotation:number;latencyMs:number;}
export interface StudioMediaFrame {type:"lumastudio.media";version:1;outputId:string;timestamp:number;positionSeconds:number;playing:boolean;sectionId?:string;program?:{state?:"live"|"black"|"clear"|"freeze";clips:Array<{id:string;name:string;source:{kind:"local";path:string;format:"mp4"|"mov"}|{kind:"youtube";url:string;videoId:string};timelineStartSeconds:number;sourceInSeconds:number;sourceOutSeconds?:number;sectionId?:string;loop:boolean;playbackMode:"timeline"|"section"|"manual";enabled:boolean}>};}
export async function connectStudioMedia(_url:string,handlers:{onFrame:(frame:StudioMediaFrame)=>void;onOpen?:()=>void;onClose?:()=>void;onError?:(message:string)=>void}){
 let unlistenFrame:UnlistenFn|undefined,unlistenStatus:UnlistenFn|undefined;
 try{
  unlistenFrame=await listen<StudioMediaFrame>("lumastudio-media",e=>handlers.onFrame(e.payload));
  unlistenStatus=await listen<string>("lumastudio-media-status",e=>e.payload==="connected"?handlers.onOpen?.():handlers.onClose?.());
  await invoke("start_lumastudio_media_listener");
 }catch(error){handlers.onError?.(String(error));}
 return()=>{unlistenFrame?.();unlistenStatus?.();};
}
