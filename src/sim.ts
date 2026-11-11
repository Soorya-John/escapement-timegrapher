export const scenarios={
  stable:{bph:28800,rate:0,error:0.25,noise:0.0006},
  fast:{bph:21600,rate:24,error:0.65,noise:0.0006},
  slow:{bph:18000,rate:-31,error:0.4,noise:0.0008},
  asymmetry:{bph:28800,rate:3,error:2.4,noise:0.0006},
  noisy:{bph:19800,rate:7,error:0.6,noise:0.014,extra:9},
  missing:{bph:25200,rate:-12,error:0.7,noise:0.0008,missing:11},
  drift:{bph:36000,rate:4,error:0.25,noise:0.0006,drift:2.1}
};
export type Simulation={bph:number;rate:number;error:number;noise:number;missing?:number;extra?:number;drift?:number;level?:number;single?:boolean;clock?:number;duration?:number;liftTime?:number};
export function synth(hz:number,p:Simulation){
  let seed=5737;
  const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296)*2-1;
  const duration=p.duration??24;
  const out=new Float32Array(Math.round(hz*duration));
  for(let i=0;i<out.length;i++) out[i]=random()*p.noise;
  const nominal=3600/p.bph;
  function impulse(time:number, strength:number){
    const start=Math.round(time*hz*(1+(p.clock??0)/1e6));
    for(let j=0;j<Math.ceil(hz*0.00038)&&start+j<out.length;j++){
      out[start+j]+=strength*(p.level??1)*Math.exp(-j/(hz*0.00013))*Math.cos(2*Math.PI*3400*j/hz);
    }
  }
  let t=0.1;
  for(let i=0;t<duration;i++){
    if(!p.missing||i%p.missing!==0){
      impulse(t,0.18);
      if(!p.single){impulse(t+0.0021,0.12);impulse(t+(p.liftTime??0.0074),0.34);}
      if(p.extra&&i%p.extra===0) impulse(t+nominal*0.31,0.20);
    }
    t+=nominal/(1+(p.rate+(p.drift??0)*t)/86400)+(i%2?1:-1)*p.error/1000;
  }
  return out;
}

