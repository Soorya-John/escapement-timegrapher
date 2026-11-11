import {z} from 'zod';
import {VERSION} from './dsp';
const txt=(n:number)=>z.string().max(n);
const id=txt(80).min(1);
const date=txt(40).refine(s=>Number.isFinite(Date.parse(s)));
const number=(low:number,high:number)=>z.number().min(low).max(high);
export const positions=['Dial up','Dial down','Crown up','Crown down','Crown left','Crown right'] as const;
export const profile=z.object({id,name:txt(120).min(1),brand:txt(120),model:txt(120),movement:txt(120),reference:txt(120),
  serial:txt(120),bph:z.number().int().refine(n=>n===0||n>=14400&&n<=36000),lift:number(10,90),
  mode:z.enum(['lever','restricted']),rateTolerance:number(0,1000),beatTolerance:number(0,20),
  service:txt(100),notes:txt(3000),photo:txt(450000).refine(s=>s===''||/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(s))});
export const config=z.object({bph:profile.shape.bph,lift:profile.shape.lift,mode:profile.shape.mode,seconds:number(4,90),
  ppm:number(-5000,5000),gain:number(0.25,32),sensitivity:number(2,15),filter:number(0,8000)});
export const calibration=z.object({id,device:txt(512),label:txt(150),sampleRate:number(8000,192000),ppm:number(-5000,5000),date,provenance:txt(500).min(1)});
export const result=z.object({rate:number(-1200,1200).nullable(),beatError:number(0,100).nullable(),
  amplitude:number(90,360).nullable(),amplitudeConfidence:number(0,1),liftMs:number(0,30).nullable(),
  bph:number(14400,36000).nullable(),confidence:number(0,1),variability:number(0,10000).nullable(),valid:z.boolean()})
  .refine(r=>r.valid ? r.rate!==null&&r.bph!==null&&r.confidence>0 : r.rate===null&&r.beatError===null&&r.amplitude===null&&r.confidence===0);
const point=z.object({t:number(0,86400),rate:number(-1200,1200).nullable(),beatError:number(0,100).nullable()});
export const session=z.object({id,watch:id,watchName:txt(120),date,source:z.enum(['microphone','import','simulation']),
  position:z.enum(positions),duration:number(0,86400),stabilization:number(0,600),settings:config,calibration:calibration.nullable(),
  device:txt(512),processing:txt(500),sampleRate:number(8000,192000),result,history:z.array(point).max(700),
  winding:txt(80),hours:number(0,10000).nullable(),temperature:number(-50,100).nullable(),notes:txt(3000),tags:txt(300),
  version:txt(40),group:txt(80),weight:number(0,100)});
export const observation=z.object({id,watch:id,date,kind:z.enum(['offset','running','stopped','wound']),
  value:number(-1e7,1e7).nullable(),notes:txt(500)});
const schemas={profiles:profile,sessions:session,calibrations:calibration,observations:observation};
type Store=keyof typeof schemas;
export type Row<K extends Store>=z.infer<typeof schemas[K]>;
export type Session=z.infer<typeof session>;
export type Profile=z.infer<typeof profile>;
export type Calibration=z.infer<typeof calibration>;
const backup=z.object({format:z.literal('escapement'),version:z.literal(1),app:txt(40),
  profiles:z.array(profile).max(500),sessions:z.array(session).max(4000),
  calibrations:z.array(calibration).max(250),observations:z.array(observation).max(4000)});
export const stores=Object.keys(schemas) as Store[];
let connection:Promise<IDBDatabase>|undefined;
function open(){
  return connection??=new Promise<IDBDatabase>((resolve,reject)=>{
    const request=indexedDB.open('escapement-workbench',1);
    request.onupgradeneeded=event=>{if(event.oldVersion===0)for(const name of stores)request.result.createObjectStore(name,{keyPath:'id'});};
    request.onsuccess=()=>{request.result.onversionchange=()=>{request.result.close();connection=undefined;};resolve(request.result);};
    request.onerror=()=>{connection=undefined;reject(request.error);};
    request.onblocked=()=>reject(Error('Close other Escapement tabs to open storage.'));
  });
}
export async function all<K extends Store>(name:K):Promise<Row<K>[]>{
  const db=await open();
  return new Promise((resolve,reject)=>{
    const req=db.transaction(name).objectStore(name).getAll();
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });
}
async function write(names:Store[], action:(tx:IDBTransaction)=>void){
  const db=await open();
  return new Promise<void>((resolve,reject)=>{
    const tx=db.transaction(names,'readwrite');
    tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error??Error('Storage transaction was aborted.'));
    try{action(tx);}catch(e){tx.abort();reject(e);}
  });
}
export async function put<K extends Store>(name:K,row:Row<K>){
  const checked=schemas[name].parse(row);
  await write([name],tx=>{tx.objectStore(name).put(checked);});
}
export const remove=(name:Store,key:string)=>write([name],tx=>{tx.objectStore(name).delete(key);});
export const clearSessions=()=>write(['sessions'],tx=>{tx.objectStore('sessions').clear();});
export async function snapshot(){
  const [profiles,sessions,calibrations,observations]=await Promise.all(stores.map(n=>all(n)));
  return backup.parse({format:'escapement',version:1,app:VERSION,profiles,sessions,calibrations,observations});
}
export async function restore(raw:string){
  if(raw.length>25_000_000) throw Error('Backup exceeds 25 MB.');
  const data=backup.parse(JSON.parse(raw));
  for(const name of stores){
    if(new Set(data[name].map(r=>r.id)).size!==data[name].length) throw Error('Duplicate record IDs in backup.');
  }
  let added=0,skipped=0;
  await write(stores,tx=>{
    for(const name of stores)for(const row of data[name]){
      const store=tx.objectStore(name), lookup=store.get(row.id);
      lookup.onsuccess=()=>{if(lookup.result){skipped++;}else{store.add(row);added++;}};
    }
  });
  return {added,skipped};
}
export function csv(rows:Session[]){
  const quote=(x:unknown)=>{
    if(x===null||x===undefined)return '""';
    const value=String(x);
    const safe=typeof x==='string'&&/^[\s\uFEFF]*[=+\-@]|^[\t\r\n]/u.test(value)?"'"+value:value;
    return '"'+safe.replaceAll('"','""')+'"';
  };
  return [['Watch','Date','Source','Position','Duration (s)','Rate (s/day)','Beat error (ms)','Amplitude (°)','BPH','Confidence','Calibration (ppm)','Device','Version','Notes','Tags'],
    ...rows.map(s=>[s.watchName,s.date,s.source,s.position,s.duration,s.result.rate,s.result.beatError,s.result.amplitude,
      s.result.bph,s.result.confidence,s.settings.ppm,s.device,s.version,s.notes,s.tags])]
    .map(row=>row.map(quote).join(',')).join('\r\n');
}

