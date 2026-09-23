import { describe, expect, it } from 'vitest';
import { parseSceneFile } from './scene-file';
import { DEFAULT_DIMENSIONS, DEFAULT_FIXTURES, DEFAULT_OBJECTS } from './defaults';
describe('replace scene parsing',()=>{
  it('clears absent collections instead of preserving the previous scene',()=>{const x=parseSceneFile('{}');expect(x.fixtures).toEqual([]);expect(x.objects).toEqual([]);expect(x.customCameras).toEqual([]);expect(x.displaySurfaces).toEqual([]);expect(x.stageRevision).toBe(0);expect(x.stageSyncMode).toBe('locked');});
  it('round trips fixture and scenery transforms',()=>{const input={dimensions:DEFAULT_DIMENSIONS,fixtures:DEFAULT_FIXTURES,objects:DEFAULT_OBJECTS};const x=parseSceneFile(JSON.stringify(input));expect(x.fixtures).toEqual(input.fixtures);expect(x.objects).toEqual(input.objects);});
  it.each([null,[],{objects:[{id:'x',position:null}]},{dimensions:{roomWidth:-1}},{fixtures:[DEFAULT_FIXTURES[0],DEFAULT_FIXTURES[0]]},{activeCustomCameraId:'missing'},{stageRevision:0.2},{displaySurfaces:[{id:'x',brightness:100}]}])('rejects malformed input before applying any state: %j',value=>expect(()=>parseSceneFile(JSON.stringify(value))).toThrow());
});
