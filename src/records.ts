import {reportChart} from './report-chart';
import {all,put,remove,clearSessions,snapshot,restore,csv,positions,type Calibration,type Profile,type Session,type Row} from './db';
import {rates} from './dsp';
import {el,field,val,btn,say,option,number,optional,fmt,node,button,download,notice,error,task,entry} from './ui';
export const data={profiles:[] as Profile[],sessions:[] as Session[],calibrations:[] as Calibration[],observations:[] as Row<'observations'>[],
  lastInput:undefined as {device:string;id:string;hz:number}|undefined,compared:new Set<string>()};
let editing:Profile|undefined, photo='', report:Session|undefined;
const form=el<HTMLFormElement>('profileform');
const fields=[['name','Name'],['brand','Brand'],['model','Model'],['movement','Movement'],['reference','Reference'],['serial','Serial number'],
  ['bph','Beat rate (0 = auto)',0,36000,1,28800],['lift','Lift angle (°)',10,90,.1,52],
  ['rateTolerance','Rate tolerance (s/day)',0,1000,.1,15],['beatTolerance','Beat-error tolerance (ms)',0,20,.01,.8]] as const;
export function applyProfile(p?:Profile){
  if(!p)return;
  field('ratepick').value=p.bph===0||rates.includes(p.bph)?String(p.bph):'-1';
  field('custom').value=String(p.bph||28800);el('customwrap').hidden=val('ratepick')!=='-1';
  field('mode').value=p.mode;field('lift').value=String(p.lift);
}
function edit(p?:Profile){
  editing=p;form.reset();photo=p?.photo??'';btn('deletewatch').disabled=!p;
  if(p)for(const key of [...fields.map(f=>f[0]),'mode','service','notes'] as const)
    (form.elements.namedItem(key) as HTMLInputElement).value=String(p[key]);
  say('profiletitle',p?'Edit '+p.name:'New watch profile');paintPhoto();
}
function paintPhoto(){
  const image=el<HTMLImageElement>('watchphoto');image.hidden=!photo;
  if(photo)image.src=photo;else image.removeAttribute('src');
}
function renderProfiles(){
  for(const id of ['watch','observewatch']){
    const select=el<HTMLSelectElement>(id),old=select.value;
    select.replaceChildren(option('',id==='watch'?'Unassigned watch':'Choose a watch'),...data.profiles.map(p=>option(p.id,p.name)));
    select.value=data.profiles.some(p=>p.id===old)?old:'';
  }
  el('watchlist').replaceChildren(...data.profiles.map(p=>entry(p.name,[p.brand,p.model,p.movement,p.bph?p.bph+' BPH':'Auto BPH']
    .filter(Boolean).join(' · '),button('Edit',()=>edit(p)))));
  if(!data.profiles.length)el('watchlist').append(node('p','No watches saved.'));
}
function renderCalibrations(){
  const old=val('calpick');
  field('calpick').replaceChildren(option('','Manual correction'),...data.calibrations.map(c=>option(c.id,c.label+' · '+fmt(c.ppm,2,true)+' ppm')));
  if(data.calibrations.some(c=>c.id===old))field('calpick').value=old;
  el('callist').replaceChildren(...data.calibrations.map(c=>entry(c.label,fmt(c.ppm,3,true)+' ppm · '+c.sampleRate+' Hz · '+c.date+' · '+c.provenance)));
}
function renderObservations(){
  const watch=val('observewatch');
  const log=data.observations.filter(o=>!watch||o.watch===watch).sort((a,b)=>b.date.localeCompare(a.date));
  const items:HTMLElement[]=[];
  const wound=log.find(o=>o.kind==='wound');
  if(wound&&watch){
    const since=log.filter(o=>o.date>wound.date).reverse(), stopped=since.find(o=>o.kind==='stopped');
    const running=since.filter(o=>o.kind==='running'&&(!stopped||o.date<=stopped.date)).at(-1);
    const hours=(d:string)=>((Date.parse(d)-Date.parse(wound.date))/3600000).toFixed(2);
    items.push(entry('Latest power reserve',(running?'At least '+hours(running.date)+' h. ':'')+(stopped?'Stopped by '+hours(stopped.date)+' h.':'Stop time pending.')));
  }
  const offsets=log.filter(o=>o.kind==='offset'&&o.value!==null);
  if(watch&&offsets.length>=2){
    const [a,b]=offsets, days=(Date.parse(a.date)-Date.parse(b.date))/86400000;
    const match=data.sessions.filter(s=>s.watch===watch&&real(s)&&s.date>=b.date&&s.date<=a.date).sort((x,y)=>y.date.localeCompare(x.date))[0];
    if(days>0)items.push(entry('Observed drift',fmt((a.value!-b.value!)/days,2,true)+' s/day over '+fmt(days,2)+' days.'+
      (match?' Latest acoustic estimate in this interval '+fmt(match.result.rate,2,true)+' s/day.':'')));
  }
  for(const o of log.slice(0,100))items.push(entry(o.kind+' · '+new Date(o.date).toLocaleString(),[data.profiles.find(p=>p.id===o.watch)?.name,
    o.value===null?'':fmt(o.value,2,true)+' s',o.notes].filter(Boolean).join(' · ')));
  el('obslist').replaceChildren(...(items.length?items:[node('p','No observations saved.')]));
}
const real=(s:Session)=>s.source!=='simulation'&&s.result.valid&&s.result.rate!==null;
function filtered(){
  const query=val('search').trim().toLowerCase();
  return data.sessions.filter(s=>(!val('sourcefilter')||s.source===val('sourcefilter'))&&(!val('posfilter')||s.position===val('posfilter'))&&
    [s.watchName,s.notes,s.tags,s.position].some(v=>v.toLowerCase().includes(query)))
    .sort((a,b)=>val('sort')==='rate'?(a.result.rate??Infinity)-(b.result.rate??Infinity):val('sort')==='old'?a.date.localeCompare(b.date):b.date.localeCompare(a.date));
}
export function refreshRecords(){
  const list=filtered();
  el('rows').replaceChildren(...list.map(s=>{
    const row=node('tr'),select=node('input');select.type='checkbox';select.checked=data.compared.has(s.id);
    select.setAttribute('aria-label','Compare '+s.watchName+' '+s.position+' '+s.date);
    select.onchange=()=>{if(select.checked)data.compared.add(s.id);else data.compared.delete(s.id);renderComparison();};
    const first=node('td');first.append(select);row.append(first);
    for(const text of [s.watchName+' · '+new Date(s.date).toLocaleString(),s.source,s.position,fmt(s.result.rate,1,true),fmt(s.result.beatError,2)])row.append(node('td',text));
    const last=node('td');last.append(button('Details',()=>showReport(s)));row.append(last);return row;
  }));
  if(!list.length){const r=node('tr'),td=node('td','No matching sessions.');td.colSpan=7;r.append(td);el('rows').append(r);}
  renderComparison();renderTrends();
}
function renderComparison(){
  const rows=data.sessions.filter(s=>data.compared.has(s.id));
  if(!rows.length){el('comparebody').replaceChildren(node('p','Select sessions to compare. Completed position tests are selected automatically.'));return;}
  const valid=rows.filter(s=>s.result.valid),values=valid.map(s=>s.result.rate!);
  const weightSum=valid.reduce((n,s)=>n+s.weight,0);
  const weighted=weightSum?valid.reduce((n,s)=>n+s.result.rate!*s.weight,0)/weightSum:null;
  const groupIds=new Set(rows.map(s=>s.group).filter(Boolean));
  const missing=groupIds.size===1?positions.filter(p=>!valid.some(s=>s.position===p&&groupIds.has(s.group))):[];
  const summary=node('p',values.length?'Mean '+fmt(values.reduce((a,b)=>a+b,0)/values.length,2,true)+' s/day · spread '+
    fmt(Math.max(...values)-Math.min(...values),2)+' s/day · weighted mean '+fmt(weighted,2,true)+' s/day. Positional bench estimate.':'No valid positions in the selection.');
  const items=rows.map(s=>{
    const weight=node('input');weight.type='number';weight.min='0';weight.max='100';weight.step='.1';weight.value=String(s.weight);
    const label=node('label','Comparison weight');label.append(weight);
    weight.onchange=task(async()=>{
      if(!weight.checkValidity()||!weight.value)throw Error('Enter a weight from 0 to 100.');
      await update({...s,weight:Number(weight.value)});renderComparison();
    });
    return entry(s.position+' · '+s.watchName,s.source+' · '+(s.result.valid?fmt(s.result.rate,2,true)+' s/day · '+
      fmt(s.result.beatError,2)+' ms · '+fmt(s.result.amplitude,0)+'° · '+Math.round(s.result.confidence*100)+'% confidence':'Rejected timing window'),label);
  });
  const repeats=positions.flatMap(p=>{
    const first=valid.find(s=>s.position===p);
    const values=valid.filter(s=>s.position===p&&s.watch===first?.watch&&s.source===first?.source&&
      s.result.bph===first?.result.bph&&s.device===first?.device&&s.settings.ppm===first?.settings.ppm&&s.settings.mode===first?.settings.mode).map(s=>s.result.rate!);
    return values.length>1?[p+' repeat spread '+fmt(Math.max(...values)-Math.min(...values),2)+' s/day']:[];
  });
  el('comparebody').replaceChildren(summary,...(missing.length?[node('p','Missing or rejected · '+missing.join(', '))]:[]),
    ...(repeats.length?[node('p',repeats.join(' · '))]:[]),...items);
}
function renderTrends(){
  const groups=new Map<string,Session[]>(),list=filtered().filter(real);
  for(const s of list){
    const key=JSON.stringify([s.watch,s.position,s.winding,s.result.bph,s.settings.mode,s.settings.ppm,s.source,s.device,s.sampleRate]);
    const group=groups.get(key)??[];group.push(s);groups.set(key,group);
  }
  const output:HTMLElement[]=[];
  for(const group of groups.values()){
    if(group.length<2||group[0].watch==='unassigned')continue;
    const ordered=group.sort((a,b)=>a.date.localeCompare(b.date)),first=ordered[0],last=ordered.at(-1)!;
    const values=group.map(s=>s.result.rate!),delta=last.result.rate!-first.result.rate!;
    const tolerance=data.profiles.find(p=>p.id===first.watch)?.rateTolerance??15;
    output.push(entry(last.watchName+' · '+last.position+' · '+last.winding,group.length+' comparable sessions · first-to-last change '+
      fmt(delta,2,true)+' s/day · range '+fmt(Math.max(...values)-Math.min(...values),2)+' s/day.'+
      (Math.abs(delta)>tolerance?' Change exceeds the ±'+tolerance+' s/day tolerance. Repeat under the same conditions.':'')+
      (last.tags?' Latest tags: '+last.tags+'.':'')));
  }
  for(const watch of data.profiles){
    const recent=list.filter(s=>s.watch===watch.id).sort((a,b)=>b.date.localeCompare(a.date));
    const runs=new Map<string,Session[]>();
    for(const s of recent.filter(s=>s.group)){const run=runs.get(s.group)??[];run.push(s);runs.set(s.group,run);}
    for(const group of runs.values()){
      if(new Set(group.map(s=>s.position)).size<2)continue;
      const values=group.map(s=>s.result.rate!),spread=Math.max(...values)-Math.min(...values);
      output.push(entry(watch.name+' · positional variation',fmt(spread,2)+' s/day spread across '+group.length+' valid positions.'+
        (spread>watch.rateTolerance?' Spread exceeds the chosen rate tolerance.':'')));break;
    }
    const winding=recent.filter(s=>s.hours!==null),last=winding[0];
    const match=last&&winding.find(s=>s.position===last.position&&s.id!==last.id&&s.result.bph===last.result.bph&&s.source===last.source);
    if(match)output.push(entry(watch.name+' · elapsed running',fmt(match.hours,1)+' h: '+fmt(match.result.rate,2,true)+' s/day · '+
      fmt(last.hours,1)+' h: '+fmt(last.result.rate,2,true)+' s/day. Compare winding and setup before attributing a cause.'));
  }
  for(const watch of data.profiles){
    const dates=watch.service.match(/\d{4}-\d{2}-\d{2}/g)??[];
    for(const date of dates){
      if(!Number.isFinite(Date.parse(date)))continue;
      const comparable=list.filter(s=>s.watch===watch.id).sort((a,b)=>a.date.localeCompare(b.date));
      const before=comparable.filter(s=>s.date<date).at(-1);
      const after=before&&comparable.find(s=>s.date>=date&&s.position===before.position&&s.winding===before.winding&&
        s.result.bph===before.result.bph&&s.device===before.device&&s.settings.ppm===before.settings.ppm&&s.source===before.source);
      if(before&&after)output.push(entry(watch.name+' · service '+date,
        'Comparable '+after.position+' estimates changed '+fmt(after.result.rate!-before.result.rate!,2,true)+' s/day across the recorded service date. Bench observations do not isolate the cause.'));
    }
  }
  el('trends').replaceChildren(...(output.length?output:[node('p','Comparable valid microphone or imported sessions will appear here. Simulations and invalid measurements are excluded.')]));
}
const dialog=el<HTMLDialogElement>('detail');
function showReport(s:Session){
  report=s;
  const values:Record<string,string>={Watch:s.watchName,Date:new Date(s.date).toLocaleString(),Source:s.source,Position:s.position,
    Duration:fmt(s.duration,1)+' s · '+s.stabilization+' s stabilization',Rate:fmt(s.result.rate,2,true)+' s/day',
    'Beat error':fmt(s.result.beatError,2)+' ms',Amplitude:s.result.amplitude===null?'Unavailable':fmt(s.result.amplitude,0)+'°',
    'Lift evidence':fmt(s.result.liftMs,2)+' ms · '+Math.round(s.result.amplitudeConfidence*100)+'% signature agreement',
    'Beat rate':String(s.result.bph??'Unavailable'),Confidence:Math.round(s.result.confidence*100)+'% · '+(s.result.valid?'valid':'invalid'),
    'Rate-fit uncertainty':fmt(s.result.uncertainty,2)+' s/day, excluding unknown clock error','Timing scatter':fmt(s.result.variability,2)+' s/day',Input:s.device+' · '+s.sampleRate+' Hz',Processing:s.processing,
    'Audio clock':fmt(s.settings.ppm,3,true)+' ppm · '+(s.calibration?s.calibration.date+' · '+s.calibration.provenance:s.settings.ppm?'manual correction':'uncalibrated'),
    Settings:[s.settings.mode,s.settings.lift+'° lift',s.settings.seconds+' s integration',s.settings.filter+' Hz filter',s.settings.gain+'× gain',
      s.settings.sensitivity+'× threshold',s.settings.bph?'Manual '+s.settings.bph+' BPH':'Auto BPH'].join(' · '),
    Winding:s.winding+' · '+fmt(s.hours,1)+' h · '+fmt(s.temperature,1)+' °C',Tags:s.tags||'—',
    'Algorithm version':s.version,Limitations:'Acoustic bench estimate. Clock, pickup, escapement signature and mounting affect results.',Notes:s.notes||'—'};
  const dl=node('dl');for(const [key,value] of Object.entries(values))dl.append(node('dt',key),node('dd',value));
  const edit=node('textarea');edit.id='reportnotes';edit.maxLength=3000;edit.value=s.notes;edit.setAttribute('aria-label','Session notes');
  el('report').replaceChildren(dl,reportChart(s.history),edit);if(!dialog.open)dialog.showModal();
}
async function update(s:Session){await put('sessions',s);data.sessions=data.sessions.map(r=>r.id===s.id?s:r);}
async function reload(){
  [data.profiles,data.sessions,data.calibrations,data.observations]=await Promise.all([all('profiles'),all('sessions'),all('calibrations'),all('observations')]);
  renderProfiles();renderCalibrations();renderObservations();refreshRecords();
}
function submit(id:string,f:()=>Promise<void>){el<HTMLFormElement>(id).onsubmit=e=>{e.preventDefault();task(f)();};}
export function setupRecords(){
  for(const [key,label,min,max,step,initial] of fields){
    const wrapper=node('label',label),input=node('input');input.name=key;input.maxLength=120;
    if(key==='name')input.required=true;
    if(min!==undefined){input.type='number';input.min=String(min);input.max=String(max);input.step=String(step);input.defaultValue=String(initial);input.required=true;}
    wrapper.append(input);el('profilefields').append(wrapper);
  }
  const mode=node('select');mode.name='mode';mode.append(option('lever','Swiss lever'),option('restricted','Other · rate only'));
  const label=node('label','Escapement');label.append(mode);el('profilefields').append(label);
  btn('newwatch').onclick=()=>edit();
  btn('deletewatch').onclick=task(async()=>{
    if(!editing||!confirm('Delete this watch profile? Saved sessions keep their watch identity.'))return;
    await remove('profiles',editing.id);data.profiles=await all('profiles');renderProfiles();edit();notice('Watch profile deleted.');
  });
  btn('removephoto').onclick=()=>{photo='';field('photo').value='';paintPhoto();};
  submit('profileform',async()=>{
    const raw=Object.fromEntries(new FormData(form)), file=field('photo').files?.[0];
    if(file){
      if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>307200)throw Error('Choose a PNG, JPEG or WebP up to 300 KiB.');
      photo=await new Promise<string>((resolve,reject)=>{
        const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(file);
      });
    }
    const p={...raw,id:editing?.id??crypto.randomUUID(),photo,name:String(raw.name).trim(),bph:Number(raw.bph),lift:Number(raw.lift),
      rateTolerance:Number(raw.rateTolerance),beatTolerance:Number(raw.beatTolerance)} as Profile;
    await put('profiles',p);data.profiles=await all('profiles');renderProfiles();
    if(!field('watch').disabled){field('watch').value=p.id;applyProfile(p);}
    edit(p);notice('Watch profile saved.');
  });
  const now=new Date();field('obsdate').value=new Date(now.getTime()-now.getTimezoneOffset()*60000).toISOString().slice(0,16);
  field('obskind').onchange=()=>{el('offsetlabel').hidden=val('obskind')!=='offset';};
  field('observewatch').onchange=renderObservations;
  submit('observe',async()=>{
    const kind=val('obskind') as Row<'observations'>['kind'],value=kind==='offset'?optional('offset'):null;
    if(kind==='offset'&&value===null)throw Error('Enter the observed time offset.');
    await put('observations',{id:crypto.randomUUID(),watch:val('observewatch'),kind,value,date:new Date(val('obsdate')).toISOString(),notes:val('obsnotes')});
    data.observations=await all('observations');renderObservations();notice('Observation saved.');
  });
  for(const id of ['search','sourcefilter','sort','posfilter'])field(id).oninput=refreshRecords;
  btn('csv').onclick=()=>download(csv(filtered()),'escapement-measurements.csv','text/csv;charset=utf-8');
  btn('backup').onclick=task(async()=>download(JSON.stringify(await snapshot(),null,2),'escapement-backup.json','application/json'));
  field('restore').onchange=task(async()=>{
    const file=field('restore').files?.[0];field('restore').value='';if(!file)return;
    if(file.size>25_000_000)throw Error('Backup exceeds 25 MB.');
    const r=await restore(await file.text());await reload();notice('Restored '+r.added+' records. Skipped '+r.skipped+' existing IDs.');
  });
  btn('bulk').onclick=task(async()=>{
    if(!confirm('Delete all measurement sessions? This cannot be undone without a backup.'))return;
    await clearSessions();data.sessions=[];data.compared.clear();refreshRecords();notice('All measurement sessions deleted.');
  });
  btn('closedetail').onclick=()=>dialog.close();btn('print').onclick=()=>window.print();
  btn('updatenotes').onclick=task(async()=>{
    if(!report)return;
    const row={...report,notes:val('reportnotes')};await update(row);showReport(row);refreshRecords();notice('Session notes saved.');
  });
  btn('deletesession').onclick=task(async()=>{
    if(!report||!confirm('Delete this measurement session?'))return;
    const id=report.id;await remove('sessions',id);data.sessions=data.sessions.filter(s=>s.id!==id);data.compared.delete(id);
    dialog.close();refreshRecords();notice('Session deleted.');
  });
  submit('calform',async()=>{
    const input=data.lastInput;
    if(!input?.id)throw Error('Acquire from an identifiable microphone before saving an input calibration.');
    if(number('calhz')!==input.hz)throw Error('Calibration sample rate must match the acquired input sample rate.');
    const ppm=(number('calframes')/(number('calhz')*number('caltime'))-1)*1e6;
    if(!Number.isFinite(ppm)||Math.abs(ppm)>5000)throw Error('Correction exceeds ±5000 ppm. Check the reference duration and frame count.');
    const c:Calibration={id:crypto.randomUUID(),device:input.id,label:input.device,sampleRate:input.hz,ppm,date:new Date().toISOString(),provenance:val('calprovenance').trim()};
    await put('calibrations',c);data.calibrations=await all('calibrations');renderCalibrations();
    if(!field('calpick').disabled)field('calpick').value=c.id;notice('Calibration saved · '+fmt(ppm,3,true)+' ppm.');
  });
  edit();void reload().catch(e=>notice('Local storage unavailable. '+error(e)));
}

