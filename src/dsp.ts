import {spectrum} from './spectrum';
export const VERSION = '1.0.0';
export const rates = [14400,18000,19800,21600,25200,28800,36000];
export type Settings = {bph:number; lift:number; mode:'lever'|'restricted'; seconds:number; ppm:number; gain:number; sensitivity:number; filter:number};
export const defaults:Settings = {bph:0,lift:52,mode:'lever',seconds:12,ppm:0,gain:1,sensitivity:5,filter:650};
type Beat = {t:number; lift:number|null; peak:number; wave:number[]};
type Point = {t:number; y:number; parity:number};
export const median = (xs:number[]) => {
  const a = [...xs].sort((x,y)=>x-y);
  return a.length ? (a[Math.floor((a.length-1)/2)]+a[Math.floor(a.length/2)])/2 : 0;
};
const mad = (xs:number[], center=median(xs)) => median(xs.map(x=>Math.abs(x-center)));
export const amplitude = (angle:number, lift:number, period:number) => angle/(2*Math.sin(Math.PI*lift/(2*period)));
export const correctedSeconds = (frames:number, hz:number, ppm:number) => frames/(hz*(1+ppm/1e6));

export class Analyzer {
  private base = 0;
  private envelope = 0;
  private floor = 0.0001;
  private pulses:{t:number;peak:number}[] = [];
  private pulseOpen = false;
  private quietUntil = 0;
  private beats:Beat[] = [];
  private group: {t:number;peak:number}[] = [];
  private scope:number[] = [];
  private packet:number[] = [];
  private packetPhase = 0;
  private packetPeak = 0;
  private origin:number|null = null;
  private end:number|null = null;
  private level = 0;
  private clip = 0;
  private lastClip=-Infinity;
  private raw=new Float32Array(1024);
  private rawHead=0;
  private spectral:number[]=[];
  private spectralBeat=-Infinity;
  private recent = 0;
  constructor(readonly hz:number, readonly settings:Settings) {}
  push(frame:number, data:Float32Array) {
    if (this.end !== null && this.end !== frame) throw Error(`Audio frames were interrupted (expected ${this.end}, received ${frame}). Restart to acquire a continuous measurement.`);
    this.origin ??= frame;
    this.end = frame+data.length;
    const s = this.settings;
    const stride = Math.max(1,Math.round(this.hz/12000));
    const hp = 1-Math.exp(-2*Math.PI*s.filter/this.hz);
    const decay = Math.exp(-1/(this.hz*0.00011));
    for (let i=0;i<data.length;i++) {
      const raw=data[i];
      this.level=Math.max(Math.abs(raw),this.level*0.99996);
      this.clip=this.clip*0.99998+(Math.abs(raw)>=0.995?0.00002:0);
      if(Math.abs(raw)>=0.995)this.lastClip=correctedSeconds(frame+i-this.origin,this.hz,s.ppm);
      this.base+=hp*(raw-this.base);
      const value=(raw-(s.filter ? this.base : 0))*s.gain;
      this.raw[this.rawHead++]=value;
      this.rawHead%=this.raw.length;
      if (Math.abs(value)>Math.abs(this.packetPeak)) this.packetPeak=value;
      this.envelope=Math.max(Math.abs(value),this.envelope*decay);
      if (++this.packetPhase<stride) continue;
      this.packetPhase=0;
      this.scope.push(this.packetPeak);
      if (this.scope.length>=384) this.scope.splice(0,1);
      const t=correctedSeconds(frame+i-this.origin,this.hz,s.ppm);
      const threshold=Math.max(0.0015,this.floor*s.sensitivity);
      if (this.group.length) this.packet.push(this.packetPeak);
      this.packetPeak=0;
      if(this.group.length&&t-this.group[0].t>=0.008&&this.group[0].t-this.spectralBeat>0.33){
        this.spectral=spectrum(this.raw,this.rawHead);this.spectralBeat=this.group[0].t;
      }
      if (this.group.length && t-this.group[0].t>0.024) {
        const first=this.group[0], last=this.group.at(-1)!;
        if(first.t>this.spectralBeat&&t-this.spectralBeat>0.33){
          this.spectral=spectrum(this.raw,this.rawHead);this.spectralBeat=first.t;
        }
        const resolved=this.group.length===3 && last.t-first.t>=0.002 &&
          last.t-first.t<=0.016 && last.peak>=first.peak*0.85 &&
          this.group[1].t-first.t>=0.00065 && last.t-this.group[1].t>=0.00065;
        this.beats.push({t:first.t,peak:first.peak,lift:resolved?last.t-first.t:null,wave:this.packet});
        this.group=[];
        this.packet=[];
      }
      if (this.envelope < threshold*0.58) this.pulseOpen=false;
      if (!this.pulseOpen && this.envelope>=threshold && t>=this.quietUntil) {
        const pulse={t,peak:this.envelope};
        this.pulseOpen=true;
        this.quietUntil=t+0.00048;
        this.pulses=[pulse];
        this.group.push(pulse);
        if(this.group.length===1) this.packet=this.scope.slice(-25);
        this.recent=t;
      }
      if (this.pulseOpen && this.pulses[0]) this.pulses[0].peak=Math.max(this.pulses[0].peak,this.envelope);
      if (t-this.recent>0.027 || this.envelope < threshold*0.5) {
        this.floor += (Math.min(this.envelope,threshold*1.5)-this.floor)*0.002;
      }
    }
    const cutoff=this.elapsed-this.settings.seconds-1;
    this.beats=this.beats.filter(x=>x.t>=cutoff);
  }
  get elapsed(){return this.end===null?0:correctedSeconds(this.end-this.origin!,this.hz,this.settings.ppm)}
  report() {
    const elapsed=this.elapsed, s=this.settings;
    const beats=this.beats.filter(b=>b.t>=elapsed-s.seconds);
    const clipped=this.clip>=0.002||elapsed-this.lastClip<0.45;
    const recentBeat=this.beats.at(-1)?.t??-Infinity;
    if(recentBeat>this.spectralBeat&&this.spectral.length===0){this.spectral=spectrum(this.raw,this.rawHead);this.spectralBeat=recentBeat;}
    const common={elapsed,level:this.level,clipping:clipped?Math.max(0.0021,this.clip):this.clip,spectrum:this.spectral,noise:this.floor/s.gain,
      sampleRate:this.hz, scope:this.scope.slice(), tick:beats.at(-1)?.wave??[],
      tock:beats.at(-2)?.wave??[], scopeStep:correctedSeconds(Math.max(1,Math.round(this.hz/12000)),this.hz,s.ppm)*1000};
    const candidates=(s.bph?[s.bph]:rates).map(bph=>candidate(beats,bph)).sort((a,b)=>b.score-a.score);
    const best=candidates[0];
    const stale=!beats.length||elapsed-beats.at(-1)!.t>0.8;
    const ambiguous=best.score>=0.63 && !!candidates[1] && best.score-candidates[1].score<0.13;
    const valid=elapsed>=Math.min(4,s.seconds) && best.score>=0.63 && best.cycles.length>=7 &&
      !ambiguous && !stale && !clipped;
    const reasons=[
      stale?'Waiting for recurring impulses':null,
      ambiguous?'Multiple beat rates fit. Select the movement BPH manually.':null,
      clipped?'Input clipping invalidates timing':null,
      best.score<0.63&&!stale?'Insufficient recurring signal or excess unmatched events':null,
      elapsed<Math.min(4,s.seconds)?'Collecting an initial timing window':null
    ].filter((x):x is string=>!!x);
    const slopes:number[]=[];
    for(let i=0;i<best.chain.length;i++){
      for(let j=i+1;j<best.chain.length;j++){
        const delta=best.indices[j]-best.indices[i];
        if(delta%2===0 && delta*best.nominal>=Math.min(2,elapsed/2))
          slopes.push((best.chain[j].t-best.chain[i].t)/delta);
        if(slopes.length>=12000)break;
      }
      if(slopes.length>=12000)break;
    }
    const period=median(slopes.length?slopes:best.cycles);
    const rate=valid?86400*(best.nominal/period-1):null;
    const d0=median(best.intervals[0]), d1=median(best.intervals[1]);
    const beatError=valid&&s.mode==='lever'&&Math.min(...best.intervals.map(a=>a.length))>=3?Math.abs(d0-d1)*500:null;
    const lifts=best.chain.flatMap(b=>b.lift===null?[]:[b.lift]);
    const center=median(lifts);
    const consistent=lifts.filter(l=>Math.abs(l-center)<=Math.max(0.00025,center*0.065));
    const amplitudeConfidence=consistent.length/Math.max(1,best.chain.length);
    const estimate=valid&&s.mode==='lever'&&amplitudeConfidence>=0.78&&consistent.length>=10?amplitude(s.lift,median(consistent),period):null;
    const trace:Point[]=valid?best.chain.map((b,i)=>({t:b.t,y:(b.t-best.chain[0].t-best.indices[i]*best.nominal)*1000,parity:best.indices[i]%2})):[];
    return {...common,valid,stale,ambiguous,reasons,bph:valid?best.bph:s.bph||null,rate,beatError,
      amplitude:estimate!==null&&estimate>=90&&estimate<=360?estimate:null, amplitudeConfidence,
      liftMs:consistent.length?median(consistent)*1000:null, confidence:valid?best.score:0,
      uncertainty:valid?Math.max(1.4826*86400*mad(slopes,period)/period,86400*Math.max(1,Math.round(this.hz/12000))/this.hz/Math.min(s.seconds,elapsed)):null,
      variability:valid?86400*mad(best.cycles,period)/period:null,
      trace, progress:Math.min(1,elapsed/s.seconds), accepted:best.chain.length,
      detected:beats.length, candidates:candidates.slice(0,3).map(c=>({bph:c.bph,score:c.score}))};
  }
}
export type Reading=ReturnType<Analyzer['report']>;

function candidate(beats:Beat[],bph:number) {
  const nominal=3600/bph;
  const intervals:[number[],number[]]=[[],[]];
  const chain:Beat[]=[];
  const indices:number[]=[];
  const cycles:number[]=[];
  let score=0;
  // Try several anchors so an isolated knock cannot define phase.
  const anchors=beats.slice(0,Math.min(18,beats.length));
  for(const anchor of anchors){
    const slots=new Map<number,Beat>();
    for (const b of beats) {
      const n=Math.round((b.t-anchor.t)/nominal);
      const error=Math.abs(b.t-anchor.t-n*nominal);
      const prior=slots.get(n);
      if(error>Math.min(nominal*0.21,0.014+Math.abs(n)*nominal*0.0025)) continue;
      if(!prior||error<Math.abs(prior.t-anchor.t-n*nominal)) slots.set(n,b);
    }
    const entries=[...slots];
    if(entries.length<5) continue;
    const span=entries.at(-1)![0]-entries[0][0]+1;
    const occupied=entries.length/span, precision=entries.length/beats.length;
    const next:[number[],number[]]=[[],[]];
    const full:number[]=[];
    for(let i=1;i<entries.length;i++){
      const [n,b]=entries[i], [p,a]=entries[i-1];
      if(n-p===1) next[((p%2)+2)%2].push(b.t-a.t);
      if(i>=2&&n-entries[i-2][0]===2) full.push((b.t-entries[i-2][1].t)/2);
      if(n-p===2) full.push((b.t-a.t)/2);
    }
    const center=median(full), spread=mad(full,center);
    const quality=Math.max(0,1-spread/0.0025);
    const coverage=Math.min(1,full.length/12);
    const value=occupied*precision*quality*coverage;
    if(value<=score||Math.abs(center/nominal-1)>0.008) continue;
    score=value;
    chain.splice(0,chain.length,...entries.map(e=>e[1]));
    indices.splice(0,indices.length,...entries.map(e=>e[0]-entries[0][0]));
    cycles.splice(0,cycles.length,...full.filter(x=>Math.abs(x-center)<Math.max(0.00075,5*spread)));
    intervals[0]=next[0];
    intervals[1]=next[1];
  }
  return {bph,nominal,score,chain,indices,cycles,intervals};
}

