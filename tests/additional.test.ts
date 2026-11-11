import test from 'node:test';
import assert from 'node:assert/strict';
import {Analyzer,defaults} from '../src/dsp';
import {synth,scenarios} from '../src/sim';
import {spectrum} from '../src/spectrum';
function analyze(pcm:Float32Array,hz=48000,bph=0){
  const a=new Analyzer(hz,{...defaults,bph});a.push(0,pcm);return a.report();
}
test('ambiguous 4/8 Hz occupancy requires manual selection',()=>{
  const pcm=new Float32Array(48000*16);
  for(let i=0,t=4800;t<pcm.length;t+=6000,i++)if(i%4!==1)pcm[t]=.5;
  const r=analyze(pcm);
  assert.equal(r.ambiguous,true);assert.equal(r.rate,null);assert.equal(r.amplitude,null);
  assert.ok(analyze(pcm,48000,28800).valid);
});
test('custom rate, changing rate and added transient knocks',()=>{
  const pcm=synth(48000,{bph:24000,rate:17,error:1.1,noise:.0005,duration:18});
  const r=analyze(pcm,48000,24000);
  assert.ok(r.valid);assert.ok(Math.abs(r.rate!-17)<1.2);
  const drift=analyze(synth(48000,{...scenarios.drift,duration:20}));
  assert.ok(drift.valid);assert.ok(drift.rate!>15&&drift.rate!<45);
  for(const at of [96000,163201,288901,485601])pcm[at]=.8;
  const knocked=analyze(pcm,48000,24000);
  assert.ok(knocked.valid);assert.ok(Math.abs(knocked.rate!-17)<1.5);
});
test('band-limited weak signal and high noise never synthesize amplitude',()=>{
  const quiet=analyze(synth(48000,{...scenarios.stable,level:.001,single:true,duration:12}));
  assert.equal(quiet.valid,false);assert.equal(quiet.amplitude,null);
  const contaminated=analyze(synth(48000,{...scenarios.stable,noise:.3,duration:12}));
  assert.equal(contaminated.valid,false);assert.equal(contaminated.rate,null);
});
test('FFT identifies audio carrier without replacing mechanical BPH',()=>{
  const n=1024, hz=48000, pcm=Float32Array.from({length:n},(_,i)=>.5*Math.sin(2*Math.PI*64*i/n));
  const bins=spectrum(pcm,0);
  const peak=bins.indexOf(Math.max(...bins));
  assert.equal(peak,64);assert.ok(Math.abs(bins[64]+6.02)<.05);
  assert.equal(peak*hz/n,3000);
});

