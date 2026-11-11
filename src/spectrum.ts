export function spectrum(samples:Float32Array,head:number){
  const n=samples.length,re=new Float64Array(n),im=new Float64Array(n);
  for(let i=0,j=0;i<n;i++){
    re[j]=samples[(head+i)%n]*(0.5-0.5*Math.cos(2*Math.PI*i/(n-1)));
    let bit=n>>1;
    while(j&bit){j^=bit;bit>>=1;}
    j^=bit;
  }
  for(let width=2;width<=n;width*=2){
    for(let j=0;j<width/2;j++){
      const cos=Math.cos(-2*Math.PI*j/width),sin=Math.sin(-2*Math.PI*j/width);
      for(let i=j;i<n;i+=width){
        const k=i+width/2,r=re[k]*cos-im[k]*sin,q=re[k]*sin+im[k]*cos;
        re[k]=re[i]-r;im[k]=im[i]-q;re[i]+=r;im[i]+=q;
      }
    }
  }
  return Array.from({length:n/2},(_,i)=>Math.max(-100,20*Math.log10(Math.max(1e-6,4*Math.hypot(re[i],im[i])/n))));
}
