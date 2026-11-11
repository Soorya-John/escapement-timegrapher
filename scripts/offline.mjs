import {readdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const files=(await readdir('dist',{recursive:true,withFileTypes:true})).filter(e=>e.isFile()&&e.name!=='sw.js')
  .map(e=>(e.parentPath??e.path).replaceAll('\\','/').replace(/^dist\/?/,'')+(e.parentPath?.endsWith('dist')||e.path?.endsWith('dist')?'':'/')+e.name).sort();
const hash=createHash('sha256');
for(const f of files)hash.update(await readFile('dist/'+f));
const name='escapement-'+hash.digest('hex').slice(0,16);
await writeFile('dist/sw.js',`const PREFIX="escapement-"+encodeURIComponent(new URL(self.registration.scope).pathname)+"-";
const CACHE=PREFIX+${JSON.stringify(name)};
const FILES=${JSON.stringify(files.map(f=>'./'+f))};
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET'||!e.request.url.startsWith(self.registration.scope))return;
  e.respondWith(caches.open(CACHE).then(async c=>{
    const cached=await c.match(e.request);
    if(cached)return cached;
    if(e.request.mode==='navigate')return (await c.match('./index.html'))||fetch(e.request);
    return fetch(e.request);
  }));
});`);

