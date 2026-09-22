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

export const ROSEN_SIGNATURE_2_AD26:LocationPreset={
 id:"rosen-signature-2-ad26",name:"Apostolic Day 2026 - Signature Ballroom 2",venue:"Rosen Centre Hotel · Signature 2",version:1,estimated:true,
 notes:[
  "Official Rosen room footprint: 50 ft x 60 ft (3,000 sq ft).",
  "Room envelope uses 16 ft ceiling from Rosen's room-specific capacity table / 2025 facilities guide; published Rosen pages also contain a conflicting 15 ft Signature 2 ceiling figure.",
  "AD26 stage area begins past the architectural cove. Cove boundary is modeled as the stage-area datum; exact cove depth remains field-adjustable.",
  "Production layout is based on the supplied Signature Ballroom reference and the Apostolic Day 2026 floor-stage plan.",
  "Lighting reference patch is intentionally disabled until the exact AD26 PAR fixture profile/mode and final addresses are confirmed."
 ],
 dimensions:{roomWidth:ft(50),roomDepth:ft(60),ceilingHeight:ft(16),stageWidth:ft(42),stageDepth:ft(12),stageHeight:ft(.67),screenWidth:ft(15),screenHeight:ft(8.44),screenBottom:ft(3),drapeWidth:ft(42),drapeHeight:ft(10)},
 material:"ballroom",
 objects:[
  box("ad26-cove-line","Stage Cove Boundary",0,12,18,50,.08,.08),
  box("ad26-back-drape","10 ft Black Back Drape",0,5,27.5,42,10,.3),
  platform("ad26-pulpit-riser","8 in Pulpit Riser",0,.335,20,8,.67,6),
  box("ad26-screen","180 in Projection Screen",0,7.2,27.15,15,8.44,.2),
  box("ad26-pulpit","Black Pulpit",0,2.4,17.5,2.4,4.2,1.7),
  platform("ad26-choir-riser-a","Choir Riser A",-14,.5,23,14,1,4),
  platform("ad26-choir-riser-b","Choir Riser B",-14,1,25.2,14,2,4),
  platform("ad26-band-pit","Band Pit",14,.25,22.5,14,.5,9),
  box("ad26-piano","Piano / Keys",10,2,19,6,3,2),
  box("ad26-sub-left","Sub Left",-7,1.5,14.5,2.5,3,2.5),
  box("ad26-sub-right","Sub Right",7,1.5,14.5,2.5,3,2.5),
  box("ad26-main-left","Main Left",-20,6.5,16,2.5,4,2.5),
  box("ad26-main-right","Main Right",20,6.5,16,2.5,4,2.5)
 ],
 referenceFixtures:[
  par("ad26-rear-par-l1","Rear PAR Left 1",-18,9.5,26,101),
  par("ad26-rear-par-l2","Rear PAR Left 2",-15,9.5,26,106),
  par("ad26-rear-par-l3","Rear PAR Left 3",-12,9.5,26,111),
  par("ad26-rear-par-r1","Rear PAR Right 1",12,9.5,26,116),
  par("ad26-rear-par-r2","Rear PAR Right 2",15,9.5,26,121),
  par("ad26-rear-par-r3","Rear PAR Right 3",18,9.5,26,126),
  par("ad26-front-wash-left","Front Wash Left",-19,9.5,10,201),
  par("ad26-front-wash-right","Front Wash Right",19,9.5,10,206)
 ],
 cameras:[
  {id:"ad26-foh",name:"AD26 FOH",position:{x:0,y:ft(5.5),z:ft(-20)},target:{x:0,y:ft(5),z:ft(22)}},
  {id:"ad26-center-room",name:"Center Room",position:{x:0,y:ft(6),z:ft(-8)},target:{x:0,y:ft(5),z:ft(22)}},
  {id:"ad26-stage-left",name:"Stage Left",position:{x:ft(-20),y:ft(6),z:ft(15)},target:{x:0,y:ft(5),z:ft(22)}},
  {id:"ad26-stage-right",name:"Stage Right",position:{x:ft(20),y:ft(6),z:ft(15)},target:{x:0,y:ft(5),z:ft(22)}}
 ]
};
export const LOCATION_PRESETS=[CORNERSTONE_MAIN_SANCTUARY,ROSEN_SIGNATURE_2_AD26];
