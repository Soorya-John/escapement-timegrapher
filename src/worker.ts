import {Analyzer,type Settings} from './dsp';
import {scenarios,synth} from './sim';
let engine:Analyzer|undefined;
let last=0;
let cursor=0;
let demo:Float32Array|undefined;
let recording:Float32Array[]=[];
let record=false;
let stored=0;
let expectedFrame:number|undefined;
const publish=()=>{if(engine) postMessage({kind:'reading',reading:engine.report()});};
function push(frame:number,data:Float32Array){
  if(expectedFrame!==undefined&&expectedFrame!==frame&&engine){
    engine=new Analyzer(engine.hz,engine.settings);last=0;recording=[];stored=0;
    postMessage({kind:'gap'});
  }
  expectedFrame=frame+data.length;
  engine?.push(frame,data);
  if(record&&engine&&stored<engine.hz*120){
    const part=data.slice(0,engine.hz*120-stored);
    recording.push(part);
    stored+=part.length;
  }
  if(engine&&engine.elapsed-last>=0.35){last=engine.elapsed;publish();}
}
self.onmessage=({data:m})=>{
  try{
    if(m.kind==='init'){
      engine=new Analyzer(m.hz,m.settings as Settings);
      last=cursor=stored=0;expectedFrame=undefined;
      demo=undefined;
      recording=[];
      record=!!m.record;
    }
    if(m.kind==='restart'&&engine){engine=new Analyzer(engine.hz,m.settings);last=0;expectedFrame=undefined;postMessage({kind:'restarted'});}
    if(m.kind==='audio'){push(m.frame,m.data);postMessage({kind:'accepted'});}
    if(m.kind==='demo') demo=synth(48000,scenarios[m.scenario as keyof typeof scenarios]);
    if(m.kind==='advance'&&demo&&engine){
      // Append independently generated audio in chunks. Sample indices remain contiguous.
      if(cursor+4800>demo.length){
        const p=scenarios[m.scenario as keyof typeof scenarios];
        demo=synth(48000,{...p,duration:Math.min(180,Math.ceil(cursor/48000)+24)});
      }
      const data=demo.subarray(cursor,cursor+4800);
      if(data.length){push(cursor,data);cursor+=data.length;}
      postMessage({kind:'advanced',end:!data.length});
    }
    if(m.kind==='file'&&engine){
      for(let i=0;i<m.samples.length;i+=8192){
        engine.push(i,m.samples.subarray(i,i+8192));
        if(engine.elapsed-last>=1){last=engine.elapsed;publish();}
      }
      publish();
      postMessage({kind:'complete'});
    }
    if(m.kind==='recording'&&engine){
      const bytes=new ArrayBuffer(44+stored*2), view=new DataView(bytes);
      const tag=(at:number,value:string)=>{for(let i=0;i<value.length;i++)view.setUint8(at+i,value.charCodeAt(i));};
      tag(0,'RIFF');view.setUint32(4,bytes.byteLength-8,true);tag(8,'WAVE');tag(12,'fmt ');
      view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);
      view.setUint32(24,engine.hz,true);view.setUint32(28,engine.hz*2,true);
      view.setUint16(32,2,true);view.setUint16(34,16,true);tag(36,'data');view.setUint32(40,stored*2,true);
      let offset=44;
      for(const chunk of recording)for(const sample of chunk){
        view.setInt16(offset,Math.round(Math.max(-1,Math.min(1,sample))*32767),true);offset+=2;
      }
      postMessage({kind:'recording',bytes,stored},{transfer:[bytes]});
    }
  } catch(error){postMessage({kind:'error',message:(error as Error).message});}
};

