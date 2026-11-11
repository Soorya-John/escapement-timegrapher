import test from 'node:test';
import assert from 'node:assert/strict';
import {Analyzer,defaults,rates,correctedSeconds,amplitude,type Settings} from '../src/dsp';
import {synth,scenarios} from '../src/sim';
const near=(got:number|null,expected:number,tolerance:number)=>{
  assert.ok(got!==null&&Math.abs(got-expected)<=tolerance,`expected ${expected} ± ${tolerance}, got ${got}`);
};
function evaluate(hz:number,pcm:Float32Array,settings:Partial<Settings>={}){
  const engine=new Analyzer(hz,{...defaults,...settings});
  for(let at=0;at<pcm.length;at+=2048)engine.push(at,pcm.subarray(at,at+2048));
  return engine;
}
// Independent fixture. 48 kHz, alternating 6006 and 5994 frames;
// exactly 8 beats/s with a 12-frame interval difference.
test('independent sample-frame fixtures establish sign, scale and convention',()=>{
  const hz=48000, samples=new Float32Array(hz*15);
  for(let at=4800,i=0;at<samples.length;at+=i++%2?5994:6006)samples[at]=0.4;
  const r=evaluate(hz,samples).report();
  assert.equal(r.bph,28800);near(r.rate,0,0.08);near(r.beatError,0.125,0.10);assert.equal(r.amplitude,null);
  assert.equal(correctedSeconds(4800480,48000,100),100);
  near(amplitude(52,0.0074,0.125),280.006,0.3);
});
for(const [i,bph] of rates.entries())test('automatic '+bph+' BPH at several sample rates',()=>{
  const hz=[44100,48000,96000][i%3],rate=[-39,0,29][i%3], beat=0.31+i*0.21;
  const r=evaluate(hz,synth(hz,{bph,rate,error:beat,noise:.0005,level:i%2?.22:1,duration:17,liftTime:.0074*28800/bph})).report();
  assert.equal(r.bph,bph);near(r.rate,rate,1.2);near(r.beatError,beat,0.13);
  assert.ok(r.amplitude!==null);assert.ok(r.amplitudeConfidence>=.78);
});
test('clock correction removes a known 150 ppm sampling bias',()=>{
  const hz=48000,pcm=synth(hz,{...scenarios.stable,clock:150,duration:16});
  near(evaluate(hz,pcm).report().rate,-12.958,1.0);
  near(evaluate(hz,pcm,{ppm:150}).report().rate,0,1.0);
  near(evaluate(hz,pcm,{ppm:-150}).report().rate,-25.916,1.0);
});
test('noise, dropped beats and extra impulses',()=>{
  const hz=48000;
  for(const name of ['noisy','missing'] as const){
    const p=scenarios[name],r=evaluate(hz,synth(hz,{...p,duration:17})).report();
    assert.equal(r.bph,p.bph);near(r.rate,p.rate,2);near(r.beatError,p.error,.22);
    assert.ok(r.confidence<.97);
  }
});
test('restricted mode, silence, clipping, gaps and stale detection',()=>{
  const hz=48000,pcm=synth(hz,{...scenarios.stable,duration:12});
  const r=evaluate(hz,pcm,{mode:'restricted'}).report();
  assert.ok(r.valid);assert.equal(r.beatError,null);assert.equal(r.amplitude,null);
  assert.ok(!evaluate(hz,new Float32Array(hz*5)).report().valid);
  assert.ok(!evaluate(hz,pcm.map(x=>x>.1?1:0)).report().valid);
  const engine=evaluate(hz,pcm);
  assert.throws(()=>engine.push(pcm.length+1,new Float32Array(20)),/interrupted/);
  engine.push(pcm.length,new Float32Array(hz*2));
  assert.ok(engine.report().stale);assert.equal(engine.report().rate,null);
});
test('half-rate harmonic is rejected when manually forced',()=>{
  const hz=48000,pcm=synth(hz,{...scenarios.stable,duration:12});
  assert.ok(!evaluate(hz,pcm,{bph:14400}).report().valid);
});
test('Swiss lever amplitude requires a recurrent three-event signature',()=>{
  const hz=48000,pcm=synth(hz,{...scenarios.stable,duration:16});
  near(evaluate(hz,pcm).report().amplitude,280.006,5);
  const single=evaluate(hz,synth(hz,{...scenarios.stable,single:true,duration:16})).report();
  assert.ok(single.valid);assert.equal(single.amplitude,null);
});

