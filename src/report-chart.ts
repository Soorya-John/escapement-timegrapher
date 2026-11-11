import type {Session} from './db';
import {node} from './ui';
export function reportChart(rows:Session['history']){
  const canvas=node('canvas');
  canvas.width=960;canvas.height=260;
  canvas.style.width='100%';canvas.style.height='auto';
  canvas.setAttribute('role','img');canvas.setAttribute('aria-label','Saved rate and beat-error history');
  const g=canvas.getContext('2d')!;
  g.fillStyle='#fff';g.fillRect(0,0,960,260);
  const values=rows.flatMap(r=>[r.rate,r.beatError]).filter((v):v is number=>v!==null);
  const min=Math.min(-2,...values),max=Math.max(2,...values),end=Math.max(1,rows.at(-1)?.t??1);
  const x=(t:number)=>60+880*t/end,y=(v:number)=>220-180*(v-min)/(max-min);
  g.font='14px sans-serif';g.fillStyle='#334044';
  g.fillText('Saved history · rate (green, s/day) · beat error (amber, ms)',60,24);
  for(let i=0;i<=4;i++){
    const v=min+(max-min)*i/4,t=end*i/4;
    g.strokeStyle='#d9dfe0';g.beginPath();g.moveTo(60,y(v));g.lineTo(940,y(v));g.stroke();
    g.fillStyle='#334044';g.fillText(v.toFixed(1),4,y(v)+4);g.fillText(t.toFixed(0),x(t),242);
  }
  g.fillText('Elapsed (s)',440,258);
  for(const [key,color] of [['rate','#1f6f58'],['beatError','#8d590b']] as const){
    g.strokeStyle=color;g.lineWidth=2;g.beginPath();let connected=false;
    for(const row of rows){
      const value=row[key];if(value===null){connected=false;continue;}
      if(connected)g.lineTo(x(row.t),y(value));else g.moveTo(x(row.t),y(value));
      connected=true;
    }
    g.stroke();
  }
  return canvas;
}
