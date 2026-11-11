import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
test('worklet timestamps and PCM come from sample frames and remain bounded',async()=>{
  const packets:{frame:number;data:Float32Array}[]=[];
  let Constructor:any;
  const sandbox:any={Float32Array,currentFrame:1000,registerProcessor:(_:string,C:any)=>{Constructor=C;},
    AudioWorkletProcessor:class{port={onmessage:undefined,postMessage:(m:any)=>packets.push(m)};}};
  runInNewContext(await readFile('public/capture.js','utf8'),sandbox);
  const worklet=new Constructor();
  for(let n=0;n<32;n++){
    sandbox.currentFrame=1000+128*n;
    assert.equal(worklet.process([[new Float32Array(128).fill(.2)]]),true);
  }
  assert.equal(packets.length,2);assert.equal(packets[0].frame,1000);assert.equal(packets[1].frame,3048);
  assert.equal(packets[0].data.length,2048);assert.ok(Math.abs(packets[0].data[30]-.2)<1e-7);
  worklet.port.onmessage({data:'stop'});assert.equal(worklet.process([]),false);
});

