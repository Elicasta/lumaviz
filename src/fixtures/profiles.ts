import type { FixtureKind, FixtureState } from "../viz/types";

export type FixtureParameter =
  | "dimmer" | "red" | "green" | "blue" | "white" | "amber" | "uv" | "strobe"
  | "pan" | "panFine" | "tilt" | "tiltFine" | "movementSpeed" | "colorWheel"
  | "gobo" | "focus" | "prism" | "zoom" | "iris" | "goboRotate" | "prismRotate" | "macro";

export interface FixtureChannel { offset:number; label:string; parameter?:FixtureParameter; defaultValue?:number }
export interface FixtureMode { id:string; name:string; channelCount:number; channels:FixtureChannel[] }
export interface FixtureProfile {
  id:string; manufacturer:string; model:string; name:string; kind:FixtureKind; verified:boolean; note:string;
  movement?:{ panRangeDegrees:number; tiltRangeDegrees:number };
  optics?:{ beamAngleMinDegrees:number; beamAngleMaxDegrees:number; defaultBeamAngleDegrees:number };
  modes:FixtureMode[];
}
const ch=(offset:number,label:string,parameter?:FixtureParameter):FixtureChannel=>({offset,label,parameter});
const mode=(id:string,name:string,channels:FixtureChannel[]):FixtureMode=>({id,name,channelCount:channels.length,channels});
export const FIXTURE_PROFILES:FixtureProfile[]=[
 {id:"adj-mega-par-profile-plus",manufacturer:"ADJ",model:"Mega Par Profile Plus",name:"ADJ Mega Par Profile Plus",kind:"par",verified:true,note:"Ch05 verified against LumaRig fixture definition.",modes:[mode("ch05","Ch05 · RGB UV Dimmer",[ch(0,"Red","red"),ch(1,"Green","green"),ch(2,"Blue","blue"),ch(3,"UV","uv"),ch(4,"Master dimmer","dimmer")])]},
 {id:"adj-mega-hex-par",manufacturer:"ADJ",model:"Mega Hex Par",name:"ADJ Mega Hex Par",kind:"par",verified:false,note:"Starter profile. Verify exact fixture personality.",modes:[mode("6ch-direct","6ch · RGBAW+UV direct",[ch(0,"Red","red"),ch(1,"Green","green"),ch(2,"Blue","blue"),ch(3,"Amber","amber"),ch(4,"White","white"),ch(5,"UV","uv")])]},
 {id:"adj-pocket-pro",manufacturer:"ADJ",model:"Pocket Pro Moving Head",name:"ADJ Pocket Pro Moving Head",kind:"moving-head",verified:false,note:"Starter profile. Verify revision.",movement:{panRangeDegrees:540,tiltRangeDegrees:270},optics:{beamAngleMinDegrees:13,beamAngleMaxDegrees:13,defaultBeamAngleDegrees:13},modes:[mode("11ch-starter","11ch · starter personality",[ch(0,"Pan","pan"),ch(1,"Pan fine","panFine"),ch(2,"Tilt","tilt"),ch(3,"Tilt fine","tiltFine"),ch(4,"Movement speed","movementSpeed"),ch(5,"Color wheel","colorWheel"),ch(6,"Gobo","gobo"),ch(7,"Shutter / strobe","strobe"),ch(8,"Dimmer","dimmer"),ch(9,"Focus","focus"),ch(10,"Programs","macro")])]},
 {id:"shehds-7x18w-par",manufacturer:"SHEHDS",model:"7×18W RGBWA+UV Par",name:"SHEHDS 7×18W RGBWA+UV Par",kind:"par",verified:false,note:"Starter profile. Verify exact manual and mode.",modes:[mode("10ch-starter","10ch · Dimmer RGBWA+UV",[ch(0,"Master dimmer","dimmer"),ch(1,"Red","red"),ch(2,"Green","green"),ch(3,"Blue","blue"),ch(4,"White","white"),ch(5,"Amber","amber"),ch(6,"UV","uv"),ch(7,"Strobe","strobe"),ch(8,"Macro","macro"),ch(9,"Speed")])]},
 {id:"shehds-spot-moving-head",manufacturer:"SHEHDS",model:"Spot Moving Head",name:"SHEHDS Spot Moving Head",kind:"moving-head",verified:false,note:"Starter profile. SHEHDS revisions differ.",movement:{panRangeDegrees:540,tiltRangeDegrees:270},optics:{beamAngleMinDegrees:10,beamAngleMaxDegrees:18,defaultBeamAngleDegrees:12},modes:[mode("14ch-starter","14ch · Pan/Tilt/Color/Gobo",[ch(0,"Pan","pan"),ch(1,"Pan fine","panFine"),ch(2,"Tilt","tilt"),ch(3,"Tilt fine","tiltFine"),ch(4,"Movement speed","movementSpeed"),ch(5,"Color wheel","colorWheel"),ch(6,"Gobo","gobo"),ch(7,"Strobe","strobe"),ch(8,"Dimmer","dimmer"),ch(9,"Focus","focus"),ch(10,"Prism","prism"),ch(11,"Prism rotation","prismRotate"),ch(12,"Programs","macro"),ch(13,"Reset")])]},
 {id:"generic-rgb-par",manufacturer:"Generic / Amazon",model:"RGB Par",name:"Generic RGB Par",kind:"par",verified:false,note:"Generic template.",modes:[mode("4ch-rgbd","4ch · RGB Dimmer",[ch(0,"Red","red"),ch(1,"Green","green"),ch(2,"Blue","blue"),ch(3,"Dimmer","dimmer")]),mode("4ch-drgb","4ch · Dimmer RGB",[ch(0,"Dimmer","dimmer"),ch(1,"Red","red"),ch(2,"Green","green"),ch(3,"Blue","blue")]),mode("7ch-common","7ch · Dimmer RGB Strobe Macro Speed",[ch(0,"Dimmer","dimmer"),ch(1,"Red","red"),ch(2,"Green","green"),ch(3,"Blue","blue"),ch(4,"Strobe","strobe"),ch(5,"Macro","macro"),ch(6,"Speed")])]},
 {id:"generic-rgbw-par",manufacturer:"Generic / Amazon",model:"RGBW Par",name:"Generic RGBW Par",kind:"par",verified:false,note:"Generic template.",modes:[mode("5ch-drgbw","5ch · Dimmer RGBW",[ch(0,"Dimmer","dimmer"),ch(1,"Red","red"),ch(2,"Green","green"),ch(3,"Blue","blue"),ch(4,"White","white")])]},
 {id:"generic-led-bar",manufacturer:"Generic / Amazon",model:"RGB LED Bar",name:"Generic RGB LED Bar",kind:"bar",verified:false,note:"Whole-bar template.",modes:[mode("7ch-common","7ch · Dimmer RGB Strobe Macro Speed",[ch(0,"Dimmer","dimmer"),ch(1,"Red","red"),ch(2,"Green","green"),ch(3,"Blue","blue"),ch(4,"Strobe","strobe"),ch(5,"Macro","macro"),ch(6,"Speed")])]},
 {id:"generic-moving-head",manufacturer:"Generic / Amazon",model:"LED Moving Head",name:"Generic LED Moving Head",kind:"moving-head",verified:false,note:"Starter template.",movement:{panRangeDegrees:540,tiltRangeDegrees:270},optics:{beamAngleMinDegrees:8,beamAngleMaxDegrees:22,defaultBeamAngleDegrees:12},modes:[mode("14ch-common","14ch · common starter layout",[ch(0,"Pan","pan"),ch(1,"Pan fine","panFine"),ch(2,"Tilt","tilt"),ch(3,"Tilt fine","tiltFine"),ch(4,"Movement speed","movementSpeed"),ch(5,"Color wheel","colorWheel"),ch(6,"Gobo","gobo"),ch(7,"Strobe","strobe"),ch(8,"Dimmer","dimmer"),ch(9,"Focus","focus"),ch(10,"Prism","prism"),ch(11,"Prism rotation","prismRotate"),ch(12,"Programs","macro"),ch(13,"Reset")])]}
];
export const PROFILE_BY_ID=new Map(FIXTURE_PROFILES.map(p=>[p.id,p] as const));
export function registerFixtureProfile(profile:FixtureProfile):FixtureProfile {
  const index=FIXTURE_PROFILES.findIndex(item=>item.id===profile.id);
  if(index>=0) FIXTURE_PROFILES[index]=profile;
  else FIXTURE_PROFILES.push(profile);
  PROFILE_BY_ID.set(profile.id,profile);
  return profile;
}
export function defaultMode(profile:FixtureProfile):FixtureMode { return profile.modes[0]; }
export function findMode(profileId:string,modeId?:string):FixtureMode|undefined { const p=PROFILE_BY_ID.get(profileId); return modeId ? p?.modes.find(m=>m.id===modeId) : p?.modes[0]; }
function byte(data:number[],address:number,offset:number){return data[address-1+offset]??0}
function value(mode:FixtureMode,data:number[],address:number,p:FixtureParameter){const c=mode.channels.find(x=>x.parameter===p);return c?byte(data,address,c.offset):0}
function word(mode:FixtureMode,data:number[],address:number,c:FixtureParameter,f:FixtureParameter){return (value(mode,data,address,c)<<8)|value(mode,data,address,f)}
function hx(v:number){return Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,"0")}
export function decodeFixture(profile:FixtureProfile,mode:FixtureMode,data:number[],address:number):Omit<FixtureState,"id">{
 const has=(p:FixtureParameter)=>mode.channels.some(c=>c.parameter===p);
 const r=has("red")?value(mode,data,address,"red"):255,g=has("green")?value(mode,data,address,"green"):255,b=has("blue")?value(mode,data,address,"blue"):255,w=value(mode,data,address,"white"),a=value(mode,data,address,"amber"),uv=value(mode,data,address,"uv");
 const hasDim=mode.channels.some(c=>c.parameter==="dimmer");
 const intensity=hasDim?value(mode,data,address,"dimmer")/255:1;
 const panFine=mode.channels.some(c=>c.parameter==="panFine"),tiltFine=mode.channels.some(c=>c.parameter==="tiltFine");
 const panRaw=panFine?word(mode,data,address,"pan","panFine"):value(mode,data,address,"pan")*257;
 const tiltRaw=tiltFine?word(mode,data,address,"tilt","tiltFine"):value(mode,data,address,"tilt")*257;
 const pan=mode.channels.some(c=>c.parameter==="pan")?(panRaw/65535)*(profile.movement?.panRangeDegrees??540)-(profile.movement?.panRangeDegrees??540)/2:undefined;
 const tilt=mode.channels.some(c=>c.parameter==="tilt")?(tiltRaw/65535)*(profile.movement?.tiltRangeDegrees??270)-(profile.movement?.tiltRangeDegrees??270)/2:undefined;
 const zoom=value(mode,data,address,"zoom")/255;
 const min=profile.optics?.beamAngleMinDegrees??18,max=profile.optics?.beamAngleMaxDegrees??profile.optics?.defaultBeamAngleDegrees??28;
 const beamAngle=mode.channels.some(c=>c.parameter==="zoom")?min+(max-min)*zoom:(profile.optics?.defaultBeamAngleDegrees??28);
 return {intensity,color:`#${hx(r)}${hx(g)}${hx(b)}`,emitters:{red:r/255,green:g/255,blue:b/255,white:w/255,amber:a/255,uv:uv/255},pan,tilt,beamAngle,strobeHz:value(mode,data,address,"strobe")/255*20,profileId:profile.id,modeId:mode.id,manufacturer:profile.manufacturer,model:profile.model,capabilities:mode.channels.flatMap(c=>c.parameter?[c.parameter]:[])};
}
