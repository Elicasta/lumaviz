export type DisplayFit="fit"|"fill"|"stretch";
export interface DisplaySurface {
 id:string; name:string; sceneObjectId?:string; sourceOutputId:string;
 fit:DisplayFit; brightness:number; flipX:boolean; flipY:boolean; rotation:number; latencyMs:number;
}
export interface StudioMediaFrame {
 type:"lumastudio.media";version:1;outputId:string;timestamp:number;positionSeconds:number;playing:boolean;sectionId?:string;
 program?:{state?:"live"|"black"|"clear"|"freeze";clips:Array<{id:string;name:string;source:{kind:"local";path:string;format:"mp4"|"mov"}|{kind:"youtube";url:string;videoId:string};timelineStartSeconds:number;sourceInSeconds:number;sourceOutSeconds?:number;sectionId?:string;loop:boolean;playbackMode:"timeline"|"section"|"manual";enabled:boolean}>};
}
export function connectStudioMedia(url:string,handlers:{onFrame:(frame:StudioMediaFrame)=>void;onOpen?:()=>void;onClose?:()=>void;onError?:(message:string)=>void}){
 // Native TCP framing is the production transport. WebSocket remains available for browser/dev bridges.
 let socket:WebSocket;
 try{socket=new WebSocket(url);}catch(error){handlers.onError?.(String(error));return()=>{};}
 socket.onopen=()=>handlers.onOpen?.();
 socket.onclose=()=>handlers.onClose?.();
 socket.onerror=()=>handlers.onError?.("LumaStudio media connection error");
 socket.onmessage=e=>{try{const v=JSON.parse(String(e.data)) as StudioMediaFrame;if(v.type==="lumastudio.media")handlers.onFrame(v);}catch{}};
 return()=>socket.close();
}
