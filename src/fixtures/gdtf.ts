import type { FixtureProfile, FixtureMode, FixtureParameter } from "./profiles";

const ATTRIBUTES: Array<[RegExp, FixtureParameter]> = [
  [/^Dimmer|^Intensity/i,"dimmer"],[/ColorAdd_R|Red/i,"red"],[/ColorAdd_G|Green/i,"green"],
  [/ColorAdd_B|Blue/i,"blue"],[/ColorAdd_W|White/i,"white"],[/ColorAdd_A|Amber/i,"amber"],
  [/ColorAdd_UV|UV/i,"uv"],[/Shutter|Strobe/i,"strobe"],[/Pan$/i,"pan"],[/Pan.*fine/i,"panFine"],
  [/Tilt$/i,"tilt"],[/Tilt.*fine/i,"tiltFine"],[/Color/i,"colorWheel"],[/Gobo/i,"gobo"],
  [/Focus/i,"focus"],[/Prism/i,"prism"],[/Zoom/i,"zoom"],[/Iris/i,"iris"]
];
function parameter(attribute:string):FixtureParameter|undefined { return ATTRIBUTES.find(([rx])=>rx.test(attribute))?.[1]; }
function text(el:Element|null,name:string,fallback=""){ return el?.getAttribute(name) ?? fallback; }
function slug(value:string){return value.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");}

export function parseGdtfDescription(xmlText:string):FixtureProfile {
  const xml=new DOMParser().parseFromString(xmlText,"application/xml");
  const error=xml.querySelector("parsererror"); if(error) throw new Error("Invalid GDTF description.xml");
  const fixture=xml.querySelector("FixtureType"); if(!fixture) throw new Error("GDTF has no FixtureType");
  const manufacturer=text(fixture,"Manufacturer","GDTF");
  const model=text(fixture,"Name",text(fixture,"ShortName","Imported Fixture"));
  const modeEls=[...xml.querySelectorAll("DMXModes > DMXMode")];
  const modes:FixtureMode[]=modeEls.map((m,mi)=>{
    const channelEls=[...m.querySelectorAll(":scope > DMXChannels > DMXChannel")];
    const channels=channelEls.map((channel,index)=>{
      const logical=channel.querySelector("LogicalChannel");
      const fn=logical?.querySelector("ChannelFunction");
      const attribute=text(logical,"Attribute",text(fn,"Attribute",text(logical,"Name","")));
      const offsetRaw=text(channel,"Offset",String(index+1)).split(",")[0];
      const offset=Math.max(0,(Number(offsetRaw)||index+1)-1);
      return {offset,label:attribute||`Channel ${offset+1}`,parameter:parameter(attribute)};
    }).sort((a,b)=>a.offset-b.offset);
    const footprint=channels.reduce((max,c)=>Math.max(max,c.offset+1),0);
    return {id:slug(text(m,"Name",`mode-${mi+1}`)),name:text(m,"Name",`Mode ${mi+1}`),channelCount:footprint,channels};
  });
  const moving=modes.some(m=>m.channels.some(c=>c.parameter==="pan"||c.parameter==="tilt"));
  return {id:`gdtf-${slug(manufacturer)}-${slug(model)}`,manufacturer,model,name:`${manufacturer} ${model}`,kind:moving?"moving-head":"par",verified:true,note:"Imported from GDTF description.xml.",movement:moving?{panRangeDegrees:540,tiltRangeDegrees:270}:undefined,modes:modes.length?modes:[{id:"default",name:"Default",channelCount:1,channels:[{offset:0,label:"Dimmer",parameter:"dimmer"}]}]};
}

export async function importGdtfFile(file:File):Promise<FixtureProfile> {
  // GDTF is a ZIP container. Browser-native DecompressionStream does not support ZIP,
  // so XML description files can be imported directly here; packaged .gdtf extraction
  // is delegated to the Tauri native importer.
  if(file.name.toLowerCase().endsWith(".xml")) return parseGdtfDescription(await file.text());
  throw new Error("Packaged .gdtf selected. Use the desktop GDTF importer to extract description.xml.");
}
