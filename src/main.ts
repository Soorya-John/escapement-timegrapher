import './style.css';
import {Acquisition,type Source} from './acquisition';
import {rates,VERSION,type Reading,type Settings} from './dsp';
import {scenarios} from './sim';
import {put,positions,config,type Calibration,type Session} from './db';
import {draw} from './charts';
import {setupRecords, data, applyProfile, refreshRecords} from './records';
import {el,field,val,btn,say,option,number,optional,fmt,download,notice,error,task} from './ui';

let reading:Reading|undefined, history:Session['history']=[], source:Source|undefined;
let settings:Settings, activeCal:Calibration|null=null, retained=false, starting=false, state='Ready to acquire', lastFrame=0;
let request=0;
const acquisition=new Acquisition(onReading,onState,b=>download(b,'escapement-recording.wav','audio/wav'));
const names={stable:'Stable watch',fast:'Fast watch',slow:'Slow watch',asymmetry:'Increased beat error',noisy:'Noisy recording',missing:'Missing beats',drift:'Gradually changing rate'};
const orientations=['Face upward, caseback toward the bench.','Face downward on a clean padded support.',
  'Watch vertical, crown toward the ceiling.','Watch vertical, crown toward the bench.',
  'Watch vertical, crown pointing left as viewed from the dial.','Watch vertical, crown pointing right as viewed from the dial.'];
type Sequence={id:string;index:number;settle:number;measure:number;phase:'move'|'settle'|'measure'|'save';kind:'microphone'|'simulation'};
let sequence:Sequence|undefined;
for(const id of ['position','posfilter'])for(const p of positions)field(id).append(option(p));
for(const r of rates)field('ratepick').append(option(String(r),r.toLocaleString()+' BPH'));
for(const [key,name] of Object.entries(names))field('scenario').append(option(key,name));
field('ratepick').onchange=()=>{el('customwrap').hidden=val('ratepick')!=='-1';};
field('watch').onchange=()=>applyProfile(data.profiles.find(p=>p.id===val('watch')));
function readSettings():Settings{
  return config.parse({bph:val('ratepick')==='-1'?number('custom'):number('ratepick'),lift:number('lift'),mode:val('mode'),
    seconds:sequence?.measure??number('seconds'),ppm:number('ppm'),gain:number('gain'),sensitivity:number('sensitivity'),filter:number('filter')});
}
function page(){
  const name=location.hash.slice(1), active=['workbench','collection','records','guide'].includes(name)?name:'workbench';
  document.querySelectorAll<HTMLElement>('.page').forEach(e=>{e.hidden=e.id!==active;});
  document.querySelectorAll<HTMLElement>('[data-tab]').forEach(e=>{if(e.dataset.tab===active)e.setAttribute('aria-current','page');else e.removeAttribute('aria-current');});
  if(active==='workbench')render();
  if(active==='records')refreshRecords();
}
window.addEventListener('hashchange',page);
window.addEventListener('resize',()=>draw(reading,history));
function onState(message:string){
  state=message;
  if(message.includes('after audio gap')){
    reading=undefined;history=[];
    notice('Audio gap detected. Timing and optional recording restarted with a fresh window.');
    if(sequence?.phase==='measure')sequence.phase='settle';
  }
  if(message.startsWith('Acquiring')){
    lastFrame=performance.now();
    if(source==='microphone'){
      data.lastInput={device:acquisition.device,id:acquisition.deviceId,hz:acquisition.hz};
      say('calactive',acquisition.device+' · '+acquisition.hz+' Hz');
      field('calhz').value=String(acquisition.hz);
    }
  }else if(!['Import complete','Demo complete','Analyzing imported audio'].includes(message)){
    reading=undefined;retained=false;
    if(sequence)endSequence('Position interrupted. Restart after restoring the input.');
  }
  render();
}
function onReading(r:Reading){
  lastFrame=performance.now();
  if(sequence?.phase==='settle'){
    if(r.elapsed>=sequence.settle){
      sequence.phase='measure';
      // Start a fresh analysis window at the next complete acquisition frame.
      acquisition.restartAnalysis(settings);
    }
    return;
  }
  reading=r;
  if(!history.length||r.elapsed-history.at(-1)!.t>=0.95){
    history.push({t:r.elapsed,rate:r.rate,beatError:r.beatError});if(history.length>700)history.shift();
  }
  if(sequence?.phase==='measure'){
    say('sequenceStatus',positions[sequence.index]+' · '+Math.min(sequence.measure,r.elapsed).toFixed(1)+' / '+sequence.measure+' s');
    if(r.elapsed>=sequence.measure)void finishPosition(r);
  }
  render();
}
function render(){
  const r=reading;
  say('source',source==='simulation'?'SIMULATION · SYNTHETIC AUDIO':source==='import'?'IMPORTED AUDIO':source==='microphone'?'MICROPHONE':'NO INPUT');
  say('format',r?r.sampleRate.toLocaleString()+' Hz · '+Math.round(r.progress*100)+'% integrated':'');
  const status=starting?'Waiting for input':acquisition.active&&r?.valid?'Signal locked':
    acquisition.active&&r&&!r.valid&&r.elapsed>=4?'Invalid · '+(r.ambiguous?'ambiguous beat rate':'insufficient signal'):state;
  if(el('status').textContent!==status)say('status',status);
  for(const [id,value] of Object.entries({rate:fmt(r?.rate,1,true),beat:fmt(r?.beatError,2),amplitude:fmt(r?.amplitude,0),
    bph:r?.bph?.toLocaleString()??'—',confidence:r?.valid?Math.round(r.confidence*100)+'%':'—'}))say(id,value);
  el<HTMLMeterElement>('level').value=r?.level??0;
  say('leveltext',r?(r.clipping>0.002?'CLIPPING · ':'')+fmt(20*Math.log10(Math.max(0.00001,r.level)),0)+' dBFS':'—');
  say('processing',source==='microphone'&&acquisition.processing?acquisition.processing+
    (activeCal?' · '+fmt(activeCal.ppm,2,true)+' ppm calibrated':settings?.ppm?' · '+fmt(settings.ppm,2,true)+' ppm manual':' · uncalibrated'):
    'Processing settings appear after permission.');
  say('traceinfo',r?r.accepted+' matched / '+r.detected+' impulses':'Awaiting input');
  const watch=data.profiles.find(p=>p.id===val('watch'));
  const evidence=r?[...r.reasons]:[];
  if(source==='microphone'&&acquisition.processing.includes(' enabled'))evidence.push('Input processing remains enabled and can alter acoustic pulse timing.');
  if(r?.valid){
    evidence.push('Rate-fit uncertainty '+fmt(r.uncertainty,2)+' s/day, excluding audio-clock error.');
    evidence.push('Timing scatter '+fmt(r.variability,1)+' s/day (robust short-interval dispersion).');
    evidence.push(r.amplitude===null?'Amplitude unavailable for this signal or escapement mode.':
      'Lift '+fmt(r.liftMs,2)+' ms · '+Math.round(r.amplitudeConfidence*100)+'% matching signatures.');
    if(r.level<0.01||r.noise>r.level/10)evidence.push('Weak or contaminated signal relative to the noise floor.');
    if((r.variability??0)>25)evidence.push('Timing is unstable across short intervals.');
    if(watch&&r.beatError!==null&&r.beatError>watch.beatTolerance)evidence.push('Beat error exceeds this watch’s '+watch.beatTolerance+' ms tolerance.');
    if(watch&&r.rate!==null&&Math.abs(r.rate)>watch.rateTolerance)evidence.push('Rate exceeds this watch’s ±'+watch.rateTolerance+' s/day tolerance.');
    if(r.amplitude!==null&&r.amplitudeConfidence>=0.85&&r.amplitude<180)evidence.push('Low estimated amplitude. Recheck winding, lift angle and pickup placement.');
  }
  if(r?.ambiguous)evidence.push(r.candidates.map(c=>c.bph+' BPH '+Math.round(c.score*100)+'%').join(' · '));
  if(r)evidence.push('Noise floor '+fmt(20*Math.log10(Math.max(0.00001,r.noise)),0)+' dBFS.');
  say('diagnostics',evidence.join(' ')||'Start the microphone or try a labeled simulation to see timing evidence.');
  say('projection',r?.rate==null?'':'Constant-rate projection · '+fmt(r.rate,1,true)+' s / day · '+fmt(r.rate*7,1,true)+' s / week · '+fmt(r.rate*30,1,true)+' s / 30 days. Assumes the measured rate remains constant.');
  btn('stop').disabled=!acquisition.active&&!starting;
  btn('save').disabled=!r||r.elapsed<4||!!sequence||starting;
  btn('audioexport').disabled=!retained;
  btn('start').disabled=starting||!!sequence;btn('demo').disabled=starting||!!sequence;
  for(const id of ['device','watch','ratepick','custom','lift','seconds','mode','gain','sensitivity','filter','ppm','calpick','record','scenario','audiofile'])
    field(id).disabled=acquisition.active||starting||!!sequence;
  draw(r,history);
}
async function start(kind:Source,guided=false,file?:File){
  if(sequence&&!guided)return;
  const token=++request;
  try{
    settings=readSettings();
    if(kind==='simulation')settings={...settings,ppm:0};
    reading=undefined;history=[];source=kind;activeCal=null;retained=false;starting=true;state='';
    render();
    if(kind==='simulation')acquisition.demo(settings,val('scenario') as keyof typeof scenarios);
    else if(kind==='import'&&file)await acquisition.imported(file,settings);
    else {
      const record=field('record').checked&&!guided;
      await acquisition.microphone(settings,val('device'),record,(id,hz)=>{
        const profile=data.calibrations.find(c=>c.id===val('calpick'));
        if(profile){
          if(!id||profile.device!==id||profile.sampleRate!==hz)throw Error('Saved calibration does not match the active input and sample rate.');
          activeCal=profile;settings={...settings,ppm:profile.ppm};
        }
        return settings;
      });
      if(token!==request)return;
      retained=record&&acquisition.active;
      void refreshDevices().catch(()=>{});
    }
  }catch(e){
    if(token!==request)return;
    acquisition.stop();state=error(e);notice(state);
    if(sequence)endSequence('Unable to start this position.');
  }finally{if(token===request){starting=false;render();}}
}
btn('start').onclick=()=>void start('microphone');
btn('demo').onclick=()=>void start('simulation');
btn('stop').onclick=()=>{
  request++;acquisition.stop(retained);starting=false;state=reading?'Stopped · captured window':'Stopped';
  if(sequence)endSequence('Sequence stopped.');render();
};
btn('reset').onclick=()=>{
  request++;acquisition.stop();reading=undefined;history=[];source=undefined;retained=false;
  starting=false;state='Ready to acquire';if(sequence)endSequence('Sequence reset.');render();
};
btn('audioexport').onclick=()=>acquisition.exportAudio();
field('audiofile').onchange=()=>{
  const f=field('audiofile').files?.[0];field('audiofile').value='';if(f)void start('import',false,f);
};
for(const id of ['view','span'])field(id).onchange=()=>draw(reading,history);
btn('chart').onclick=()=>el<HTMLCanvasElement>('trace').toBlob(b=>{if(b)download(b,'escapement-timing-trace.png','image/png');});
for(const [id,canvas] of [['historyexport','history'],['waveexport','wave']]){
  btn(id).onclick=()=>el<HTMLCanvasElement>(canvas).toBlob(b=>{if(b)download(b,'escapement-'+canvas+'.png','image/png');});
}
field('scenario').onchange=groundTruth;
function groundTruth(){
  const p=scenarios[val('scenario') as keyof typeof scenarios];
  say('ground','Simulation inputs · '+p.bph+' BPH · '+fmt(p.rate,1,true)+' s/day initial · '+p.error+' ms beat error.');
}
async function refreshDevices(){
  if(!navigator.mediaDevices?.enumerateDevices){notice('Input selection requires a secure browser context.');return;}
  const select=el<HTMLSelectElement>('device'), old=select.value;
  const devices=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='audioinput'&&d.deviceId&&d.deviceId!=='default');
  select.replaceChildren(option('','System default'),...devices.map((d,i)=>option(d.deviceId,d.label||'Audio input '+(i+1))));
  if(devices.some(d=>d.deviceId===old))select.value=old;
}
btn('refresh').onclick=task(refreshDevices);
navigator.mediaDevices?.addEventListener('devicechange',task(refreshDevices));
function invalidate(message:string){
  request++;acquisition.stop(retained);starting=false;reading=undefined;state=message;
  if(sequence)endSequence('Sequence interrupted.');render();
}
document.addEventListener('visibilitychange',()=>{
  if(document.hidden&&source==='microphone'&&(acquisition.active||starting))invalidate('Paused · tab hidden. Restart to reacquire.');
});
setInterval(()=>{
  if(source==='microphone'&&acquisition.active&&performance.now()-lastFrame>2000)invalidate('Invalid · audio frames stopped arriving. Restart input.');
},500);
function makeSession(r:Reading,group='',stabilization=0):Session{
  const watch=data.profiles.find(p=>p.id===val('watch'));
  return {id:crypto.randomUUID(),watch:watch?.id??'unassigned',watchName:watch?.name??'Unassigned watch',date:new Date().toISOString(),
    source:source!,position:val('position') as Session['position'],duration:r.elapsed,stabilization,settings:{...settings},
    calibration:activeCal,device:acquisition.device,processing:acquisition.processing,sampleRate:acquisition.hz,
    result:{rate:r.rate,beatError:r.beatError,amplitude:r.amplitude,amplitudeConfidence:r.amplitudeConfidence,liftMs:r.liftMs,
      bph:r.bph,confidence:r.confidence,uncertainty:r.uncertainty,variability:r.variability,valid:r.valid},
    history:history.slice(),winding:val('winding'),hours:optional('hours'),temperature:optional('temperature'),
    notes:val('notes'),tags:val('tags'),version:VERSION,group,weight:1};
}
btn('save').onclick=task(async()=>{
  if(!reading||reading.elapsed<4)return;
  const row=makeSession(reading);await put('sessions',row);data.sessions.push(row);notice('Session saved.');
});
btn('sequence').onclick=()=>{
  if(!data.profiles.some(p=>p.id===val('watch'))){notice('Choose a watch profile before starting a six-position test.');return;}
  const settle=number('settle'),measure=number('measure');
  if(!(settle>=0&&settle<=600&&measure>=4&&measure<=90)){notice('Settle time must be 0–600 s and measurement time 4–90 s.');return;}
  if(source==='simulation'&&settle+measure>165){notice('Simulation stabilization and measurement must total 165 s or less.');return;}
  acquisition.stop();reading=undefined;history=[];retained=false;state='Waiting for repositioning';
  sequence={id:crypto.randomUUID(),index:0,settle,measure,phase:'move',kind:source==='simulation'?'simulation':'microphone'};
  nextPosition();
};
function nextPosition(){
  if(!sequence)return;
  const i=sequence.index;
  field('position').value=positions[i];field('position').disabled=true;
  say('orientation',positions[i]+' · '+orientations[i]);
  say('sequenceStatus','Position '+(i+1)+' of 6. Reposition the watch, then start.');
  btn('sequence').disabled=true;btn('step').disabled=false;btn('cancel').disabled=false;render();
}
btn('step').onclick=()=>{
  if(sequence?.phase!=='move')return;
  btn('step').disabled=true;sequence.phase=sequence.settle?'settle':'measure';
  say('sequenceStatus',sequence.settle?'Stabilizing for '+sequence.settle+' s…':'Measuring '+positions[sequence.index]+'…');
  void start(sequence.kind,true);
};
btn('cancel').onclick=()=>{request++;starting=false;acquisition.stop();endSequence('Sequence ended. Completed positions remain in Records.');render();};
async function finishPosition(r:Reading){
  if(!sequence)return;
  const current=sequence;current.phase='save';acquisition.stop();state='Position captured';
  try{
    const row=makeSession(r,current.id,current.settle);
    await put('sessions',row);data.sessions.push(row);data.compared.add(row.id);
    if(sequence!==current)return;
    if(++current.index>=positions.length){
      endSequence('Six positions captured. Open Records for the comparison.');location.hash='records';
    }else{current.phase='move';nextPosition();}
  }catch(e){endSequence('Position could not be saved. '+error(e));render();}
}
function endSequence(message:string){
  sequence=undefined;btn('sequence').disabled=false;btn('step').disabled=true;btn('cancel').disabled=true;
  field('position').disabled=false;say('sequenceStatus',message);
}
groundTruth();setupRecords();page();
if(navigator.mediaDevices)void refreshDevices().catch(()=>{});
if(import.meta.env.PROD&&'serviceWorker' in navigator&&location.protocol!=='escapement:'){
  void navigator.serviceWorker.register(new URL('sw.js',document.baseURI)).catch(e=>notice('Offline cache unavailable. '+error(e)));
}

