import { describe, expect, it } from 'vitest';
import { isFixtureFrame } from './lumarig';
const basic = {version:1,sequence:2,timestamp:123456,fixtures:[{id:'front',intensity:1,color:'#aabbcc',universe:1,address:100,emitters:{red:1,green:0,blue:.5,white:0,amber:0,uv:0},pan:25,tilt:-30}]};
describe('native fixture frame boundary',()=>{
 it('accepts a complete semantic fixture',()=>expect(isFixtureFrame(basic)).toBe(true));
 it.each([{...basic,sequence:NaN},{...basic,fixtures:[{...basic.fixtures[0],intensity:Infinity}]},{...basic,fixtures:[{...basic.fixtures[0],color:'red'}]},{...basic,fixtures:[{...basic.fixtures[0],emitters:{...basic.fixtures[0].emitters,uv:2}}]},{...basic,fixtures:[basic.fixtures[0],basic.fixtures[0]]},{...basic,fixtures:[{...basic.fixtures[0],address:513}]}])('rejects malformed or unsafe semantic frames',frame=>expect(isFixtureFrame(frame)).toBe(false));
});
