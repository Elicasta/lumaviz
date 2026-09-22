import { feetToMeters as ft } from "../viz/units";
import type { CustomCamera, FixtureDefinition, MaterialPreset, SceneDimensions, SceneObject } from "../viz/types";

export interface LocationPreset {
  id:string; name:string; venue:string; version:number; estimated:boolean; notes:string[];
  dimensions:SceneDimensions; material:MaterialPreset; objects:SceneObject[]; referenceFixtures:FixtureDefinition[]; cameras:CustomCamera[];
}
const box=(id:string,name:string,x:number,y:number,z:number,w:number,h:number,d:number):SceneObject=>({id,name,kind:"box",position:{x:ft(x),y:ft(y),z:ft(z)},rotation:{x:0,y:0,z:0},size:{x:ft(w),y:ft(h),z:ft(d)}});
const platform=(id:string,name:string,x:number,y:number,z:number,w:number,h:number,d:number):SceneObject=>({id,name,kind:"platform",position:{x:ft(x),y:ft(y),z:ft(z)},rotation:{x:0,y:0,z:0},size:{x:ft(w),y:ft(h),z:ft(d)}});
const par=(id:string,name:string,x:number,y:number,z:number,address:number):FixtureDefinition=>({id,name,kind:"par",position:{x:ft(x),y:ft(y),z:ft(z)},rotation:{x:-90,y:0,z:0},patch:{enabled:false,universe:1,address,profileId:"generic-rgbw-par",modeId:"5ch-drgbw"}});

export const CORNERSTONE_MAIN_SANCTUARY:LocationPreset={
 id:"cornerstone-main-sanctuary",name:"Cornerstone - Main Sanctuary",venue:"Cornerstone Christian Fellowship",version:1,estimated:true,
 notes:["Geometry is photo-derived and intentionally marked estimated until field measurements are entered.","Reference fixtures are placement markers only; Sunday template patch remains authoritative."],
 dimensions:{roomWidth:ft(30),roomDepth:ft(48),ceilingHeight:ft(10),stageWidth:ft(24),stageDepth:ft(9),stageHeight:ft(1.25),screenWidth:ft(9),screenHeight:ft(5.1),screenBottom:ft(5.5),drapeWidth:ft(0),drapeHeight:ft(0)},
 material:"ballroom",
 objects:[
  platform("cs-stage","Main Platform",0,.625,19.5,24,1.25,9),
  box("cs-backwall","Blue Rear Accent Wall",0,5,23.7,24,10,.25),
  box("cs-center-screen","Center Projection Screen",0,7.6,23.35,9,5.1,.18),
  box("cs-tv-left","Left Display",-8,6.6,23.2,5,3,.22),
  box("cs-tv-right","Right Display",8,6.6,23.2,5,3,.22),
  box("cs-door-left","Stage Left Door",-10.4,3.5,23.05,3,7,.25),
  box("cs-door-right","Stage Right Door",10.4,3.5,23.05,3,7,.25),
  box("cs-drum-shield","Drum Shield",-6.5,3.2,20.8,5.5,5.2,.08),
  box("cs-keyboard","Keyboard",6.7,3,19.8,5,3,.8),
  box("cs-pulpit","Glass Pulpit",0,2.6,15.8,3.2,4.2,1.5),
  box("cs-speaker-left","Wall Speaker Left",-14.3,7.2,13,2.2,3.8,1.8),
  box("cs-speaker-right","Wall Speaker Right",14.3,7.2,13,2.2,3.8,1.8),
  box("cs-projector","Ceiling Projector",0,9.2,6.5,1.8,.7,1.5),
  box("cs-front-monitor-left","Floor Monitor Left",-5.8,1.3,15.2,2.8,1.2,1.8),
  box("cs-front-monitor-right","Floor Monitor Right",5.8,1.3,15.2,2.8,1.2,1.8)
 ],
 referenceFixtures:[
  par("cs-ceiling-1","Ceiling Wash 1",-7.5,9.4,9,401),par("cs-ceiling-2","Ceiling Wash 2",-2.5,9.4,9,406),par("cs-ceiling-3","Ceiling Wash 3",2.5,9.4,9,411),par("cs-ceiling-4","Ceiling Wash 4",7.5,9.4,9,416),
  par("cs-ceiling-5","Ceiling Wash 5",-7.5,9.4,14,421),par("cs-ceiling-6","Ceiling Wash 6",-2.5,9.4,14,426),par("cs-ceiling-7","Ceiling Wash 7",2.5,9.4,14,431),par("cs-ceiling-8","Ceiling Wash 8",7.5,9.4,14,436)
 ],
 cameras:[
  {id:"cs-foh",name:"FOH Center",position:{x:0,y:ft(5.2),z:ft(-20)},target:{x:0,y:ft(4),z:ft(20)}},
  {id:"cs-rear",name:"Rear Room",position:{x:0,y:ft(6),z:ft(-22)},target:{x:0,y:ft(4.5),z:ft(20)}},
  {id:"cs-stage-left",name:"Stage Left",position:{x:ft(-12),y:ft(5),z:ft(15)},target:{x:0,y:ft(4),z:ft(18)}}
 ]
};
export const LOCATION_PRESETS=[CORNERSTONE_MAIN_SANCTUARY];
