import test from 'node:test';
import assert from 'node:assert/strict';
import {Analyzer,defaults} from '../src/dsp';
import {synth,scenarios} from '../src/sim';
test('rolling trace retains acquisition reference when the window advances',()=>{
  const hz=48000,pcm=synth(hz,{...scenarios.fast,error:0,duration:24});
  const a=new Analyzer(hz,{...defaults,seconds:4});
  a.push(0,pcm.subarray(0,hz*8));
  const first=a.report().trace.at(-1)!;
  for(let i=hz*8;i<pcm.length;i+=2048)a.push(i,pcm.subarray(i,i+2048));
  const last=a.report().trace.at(-1)!;
  const expected=-(last.t-first.t)*24/86400*1000;
  assert.ok(Math.abs(last.y-first.y-expected)<.25);
});
