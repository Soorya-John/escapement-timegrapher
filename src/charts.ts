import type {Reading} from './dsp';
import type {Session} from './db';
import {el,val,say} from './ui';
const mint='#9ce8c8', gold='#e8b778';
function chart(id:string,xLabel:string,yLabel:string,x0:number,x1:number,y0:number,y1:number){
  const canvas=el<HTMLCanvasElement>(id), w=canvas.clientWidth,h=canvas.clientHeight;
  if(!w||!h)return;
  const scale=Math.min(devicePixelRatio||1,2), g=canvas.getContext('2d')!;
  canvas.width=w*scale;canvas.height=h*scale;
  g.scale(scale,scale);g.fillStyle='#111618';g.fillRect(0,0,w,h);
  const l=48,r=w-15,t=17,b=h-31;
  const x=(v:number)=>l+(v-x0)/(x1-x0)*(r-l), y=(v:number)=>b-(v-y0)/(y1-y0)*(b-t);
  g.font='10px monospace';g.lineWidth=1;
  for(let i=0;i<=4;i++){
    const sx=x(x0+(x1-x0)*i/4), sy=y(y0+(y1-y0)*i/4);
    g.strokeStyle='#293235';g.beginPath();g.moveTo(sx,t);g.lineTo(sx,b);g.moveTo(l,sy);g.lineTo(r,sy);g.stroke();
    g.fillStyle='#a4afb1';g.textAlign='center';g.fillText((x0+(x1-x0)*i/4).toFixed(x1-x0<5?1:0),sx,b+12);
    g.textAlign='right';g.fillText((y0+(y1-y0)*i/4).toFixed(y1-y0<=2?2:y1-y0<=20?1:0),l-5,sy+3);
  }
  g.textAlign='left';g.fillText(yLabel,l,11);g.textAlign='center';g.fillText(xLabel,(l+r)/2,h-4);
  g.beginPath();g.rect(l,t,r-l,b-t);g.clip();
  return {g,x,y};
}
export function draw(r:Reading|undefined,history:Session['history']){
  const span=Number(val('span')),right=Math.max(span,r?.elapsed??0);
  const points=r?.trace.filter(p=>p.t>=right-span)??[], ys=points.map(p=>p.y);
  const c=chart('trace','Elapsed (s)','Offset (ms)',right-span,right,Math.min(-2,...ys),Math.max(2,...ys));
  if(c)for(const p of points){c.g.fillStyle=p.parity?gold:mint;c.g.fillRect(c.x(p.t)-1,c.y(p.y)-1,2.4,2.4);}
  const frequency=val('view')==='spectrum';
  const key=val('view') as 'scope'|'tick'|'tock';
  const wave=r?.[key]??[],step=r?.scopeStep??0.0833;
  const limit=Math.max(0.003,...wave.map(Math.abs))*1.03;
  const v=frequency?chart('wave','Frequency (kHz)','Level (dBFS)',0,(r?.sampleRate??48000)/2000,-100,0):
    chart('wave','Window (ms)','Relative level',0,Math.max(1,(wave.length-1)*step),-limit,limit);
  if(v&&frequency&&r?.spectrum.length){
    v.g.strokeStyle=mint;v.g.beginPath();
    r.spectrum.forEach((value,i)=>i?v.g.lineTo(v.x(i*r.sampleRate/1024000),v.y(value)):v.g.moveTo(v.x(0),v.y(value)));
    v.g.stroke();
  }else if(v&&wave.length){
    v.g.strokeStyle=mint;v.g.beginPath();
    wave.forEach((s,i)=>i?v.g.lineTo(v.x(i*step),v.y(s)):v.g.moveTo(v.x(0),v.y(s)));v.g.stroke();
  }
  say('scopeinfo',frequency?'Recent impulse · 1,024-point Hann FFT':wave.length?((wave.length-1)*step).toFixed(1)+' ms · peak-preserved samples':'Peak-preserved samples');
  const start=Math.max(0,(history.at(-1)?.t??0)-60),data=history.filter(p=>p.t>=start);
  const values=data.flatMap(p=>[p.rate,p.beatError]).filter((x):x is number=>x!==null);
  const h=chart('history','Elapsed (s)','s/day · ms',start,Math.max(start+12,data.at(-1)?.t??0),Math.min(-2,...values),Math.max(2,...values));
  if(h)for(const [key,color] of [['rate',mint],['beatError',gold]] as const){
    h.g.strokeStyle=color;h.g.beginPath();let started=false;
    for(const p of data){if(p[key]===null){started=false;continue;}if(started)h.g.lineTo(h.x(p.t),h.y(p[key]!));else h.g.moveTo(h.x(p.t),h.y(p[key]!));started=true;}h.g.stroke();
  }
}
