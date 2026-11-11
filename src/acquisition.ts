import CaptureWorker from './worker?worker';
import type {Reading,Settings} from './dsp';
import type {scenarios} from './sim';
export type Source='microphone'|'simulation'|'import';
export class Acquisition {
  private worker:Worker|undefined;
  private ctx:AudioContext|undefined;
  private stream:MediaStream|undefined;
  private node:AudioWorkletNode|undefined;
  private timer:number|undefined;
  private generation=0;
  private restarting=false;
  private inFlight=0;
  active=false;
  hz=48000;
  device='';
  deviceId='';
  processing='';
  constructor(private reading:(r:Reading)=>void,private state:(s:string)=>void,
    private file:(b:ArrayBuffer)=>void){}
  private workerFor(settings:Settings,record=false){
    this.worker?.terminate();
    const w=new CaptureWorker();
    this.worker=w;
    w.onmessage=({data})=>{
      if(w!==this.worker)return;
      if(data.kind==='accepted')this.inFlight=Math.max(0,this.inFlight-1);
      if(data.kind==='gap')this.state('Acquiring microphone after audio gap · fresh window');
      if(data.kind==='restarted')this.restarting=false;
      if(data.kind==='reading'&&!this.restarting)this.reading(data.reading);
      if(data.kind==='complete'){this.active=false;this.state('Import complete');}
      if(data.kind==='error'){this.stop();this.state(data.message);}
      if(data.kind==='recording'){
        if(data.stored)this.file(data.bytes);
        else this.state('No recorded samples are available.');
      }
    };
    w.onerror=()=>{this.stop();this.state('Analysis worker failed. Reload and retry.');};
    w.postMessage({kind:'init',hz:this.hz,settings,record});
    return w;
  }
  async microphone(settings:Settings,device:string,record:boolean,match:(id:string,hz:number)=>Settings){
    this.stop();
    const generation=this.generation;
    if(!isSecureContext)throw Error('Microphone access requires HTTPS or localhost.');
    if(!navigator.mediaDevices?.getUserMedia||!window.AudioContext)throw Error('This browser does not expose microphone acquisition.');
    const ctx=new AudioContext();
    this.ctx=ctx;
    // Start the context within the explicit user gesture.
    const resumed=ctx.resume().then(()=>null,e=>e);
    let stream:MediaStream;
    try{
      stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:{ideal:1},echoCancellation:false,
        noiseSuppression:false,autoGainControl:false,...(device?{deviceId:{exact:device}}:{})}});
    }catch(e){if(generation===this.generation)this.stop();throw e;}
    if(generation!==this.generation){stream.getTracks().forEach(t=>t.stop());return;}
    this.stream=stream;
    try{
      const resumeError=await resumed;
      if(resumeError)throw resumeError;
      if(!ctx.audioWorklet)throw Error('AudioWorklet is unavailable in this browser.');
      await ctx.audioWorklet.addModule(new URL('capture.js',document.baseURI).href);
      if(generation!==this.generation)return;
      const track=stream.getAudioTracks()[0];
      const actual=track.getSettings();
      this.hz=ctx.sampleRate;
      this.device=track.label||'Audio input';
      this.deviceId=actual.deviceId||device;
      this.processing=(['echoCancellation','noiseSuppression','autoGainControl'] as const)
        .map(k=>k+' '+(actual[k]===undefined?'unreported':actual[k]?'enabled':'disabled')).join(' · ');
      settings=match(this.deviceId,this.hz);
      const worker=this.workerFor(settings,record);
      const node=new AudioWorkletNode(ctx,'escapement-capture');
      this.node=node;
      node.port.onmessage=({data})=>{
        if(!this.active||worker!==this.worker)return;
        if(this.inFlight>=12){
          this.stop();
          this.state('Audio analysis could not keep up. Close other heavy applications and restart.');
          return;
        }
        this.inFlight++;
        worker.postMessage({kind:'audio',...data},[data.data.buffer]);
      };
      const mute=ctx.createGain();
      mute.gain.value=0;
      ctx.createMediaStreamSource(stream).connect(node).connect(mute).connect(ctx.destination);
      this.active=true;
      track.onended=()=>{this.stop();this.state('Microphone disconnected. Select an input and restart.');};
      track.onmute=()=>{this.stop();this.state('Microphone interrupted. Restart after the input recovers.');};
      ctx.onstatechange=()=>{if(this.active&&ctx.state!=='running'){this.stop();this.state('Audio suspended. Restart to acquire continuous timing.');}};
      this.state('Acquiring microphone');
    }catch(e){if(generation===this.generation)this.stop();throw e;}
  }
  demo(settings:Settings,scenario:keyof typeof scenarios){
    this.stop();this.hz=48000;this.device='Synthetic impulse generator';this.processing='Synthetic PCM';
    const w=this.workerFor({...settings,ppm:0});
    this.active=true;
    w.postMessage({kind:'demo',scenario});
    const next=()=>{if(this.active&&this.worker===w)w.postMessage({kind:'advance',scenario});};
    const handler=w.onmessage;
    w.onmessage=e=>{
      handler?.call(w,e);
      if(e.data.kind==='advanced'){
        if(e.data.end){this.active=false;this.state('Demo complete');}
        else this.timer=window.setTimeout(next,65);
      }
    };
    next();
    this.state('Acquiring simulation');
  }
  async imported(file:File,settings:Settings){
    this.stop();
    const generation=this.generation;
    if(file.size>24*1024*1024)throw Error('Audio file exceeds 24 MiB.');
    // Inspect container duration before allocating decoded PCM.
    const url=URL.createObjectURL(file);
    const audio=document.createElement('audio');
    try{
      const duration=await new Promise<number>((resolve,reject)=>{
        const timeout=window.setTimeout(()=>reject(Error('Audio metadata could not be read within 10 seconds.')),10000);
        const done=(value:number|Error)=>{
          clearTimeout(timeout);
          if(value instanceof Error)reject(value);else resolve(value);
        };
        audio.preload='metadata';
        audio.onloadedmetadata=()=>done(audio.duration);
        audio.onerror=()=>done(Error('The browser cannot decode this audio file.'));
        audio.src=url;
      });
      if(!Number.isFinite(duration)||duration<4||duration>120)
        throw Error('Choose an audio recording between 4 and 120 seconds with a readable duration.');
    }finally{
      audio.removeAttribute('src');audio.load();URL.revokeObjectURL(url);
    }
    if(generation!==this.generation)return;
    const ctx=new OfflineAudioContext(1,1,48000);
    const decoded=await ctx.decodeAudioData(await file.arrayBuffer());
    if(generation!==this.generation)return;
    if(decoded.duration>120||decoded.duration<4)throw Error('Choose an audio recording between 4 and 120 seconds.');
    this.hz=decoded.sampleRate;this.device=file.name.slice(0,512);this.processing='Decoded first channel at 48 kHz';
    const w=this.workerFor(settings);
    const samples=decoded.getChannelData(0).slice();
    w.postMessage({kind:'file',samples},[samples.buffer]);
    this.active=true;
    this.state('Analyzing imported audio');
  }
  restartAnalysis(settings:Settings){this.restarting=true;this.worker?.postMessage({kind:'restart',settings});}
  exportAudio(){this.worker?.postMessage({kind:'recording'});}
  stop(retainWorker=false){
    this.generation++;
    this.restarting=false;
    this.inFlight=0;
    this.active=false;
    clearTimeout(this.timer);
    this.node?.port.postMessage('stop');
    this.node?.disconnect();
    this.node=undefined;
    this.stream?.getTracks().forEach(t=>t.stop());
    this.stream=undefined;
    if(this.ctx&&this.ctx.state!=='closed')void this.ctx.close().catch(()=>{});
    this.ctx=undefined;
    if(!retainWorker){this.worker?.terminate();this.worker=undefined;}
  }
}

