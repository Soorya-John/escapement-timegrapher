import {ZodError} from 'zod';
export const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
export const field=(id:string)=>el<HTMLInputElement>(id);
export const val=(id:string)=>field(id).value;
export const btn=(id:string)=>el<HTMLButtonElement>(id);
export const say=(id:string,value:string)=>{el(id).textContent=value;};
export const option=(value:string,label=value)=>new Option(label,value);
export const number=(id:string)=>val(id).trim()===''?NaN:Number(val(id));
export const optional=(id:string)=>val(id).trim()===''?null:number(id);
export const fmt=(n:number|null|undefined,d=1,signed=false)=>n==null?'—':(signed&&n>0?'+':'')+n.toFixed(d);
export function node<K extends keyof HTMLElementTagNameMap>(tag:K,text=''){const e=document.createElement(tag);e.textContent=text;return e;}
export function button(text:string,action:()=>void){const b=node('button',text);b.type='button';b.onclick=action;return b;}
export function download(content:BlobPart,name:string,type:string){
  const url=URL.createObjectURL(new Blob([content],{type}));
  const a=node('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
let timeout:number;
export function notice(message:string){say('notice',message);el('notice').hidden=false;clearTimeout(timeout);timeout=window.setTimeout(()=>{el('notice').hidden=true;},7000);}
export function error(e:unknown){
  if(e instanceof ZodError){
    const details=e.issues.slice(0,3).map(issue=>(issue.path.join('.')||'Data')+' '+issue.message).join('. ');
    return 'Validation failed. '+details+(e.issues.length>3?' (additional errors omitted)':'');
  }
  if(e instanceof DOMException){
    if(e.name==='NotAllowedError')return 'Microphone permission was denied or blocked by the system.';
    if(e.name==='NotFoundError'||e.name==='OverconstrainedError')return 'The selected audio input is unavailable. Refresh and choose an input.';
    if(e.name==='NotReadableError')return 'The microphone is busy or blocked by the operating system.';
    if(e.name==='QuotaExceededError')return 'Local storage is full. Export a backup and free storage.';
  }
  return e instanceof Error?e.message:String(e);
}
export function task(f:()=>Promise<void>){return ()=>void f().catch(e=>notice(error(e)));}
export function entry(title:string,body:string,...children:HTMLElement[]){
  const e=node('div');e.className='entry';e.append(node('strong',title),node('p',body),...children);return e;
}
