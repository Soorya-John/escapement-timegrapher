import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import {extname,resolve,sep} from 'node:path';
const base='/escapement-timegrapher/',dist=resolve('dist');
const mime={'.js':'text/javascript','.html':'text/html','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
createServer(async(req,res)=>{
  try{
    const path=new URL(req.url,'http://127.0.0.1').pathname;
    if(!path.startsWith(base))throw Error();
    const file=resolve(dist,decodeURIComponent(path.slice(base.length))||'index.html');
    if(!file.startsWith(dist+sep)||!(await stat(file)).isFile())throw Error();
    res.setHeader('Content-Type',mime[extname(file)]||'application/octet-stream');
    createReadStream(file).pipe(res);
  }catch{res.writeHead(404).end();}
}).listen(4173,'127.0.0.1');

