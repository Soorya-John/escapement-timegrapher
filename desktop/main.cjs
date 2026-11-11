const {app,BrowserWindow,protocol,net,dialog}=require('electron');
const {join,resolve,sep}=require('node:path');
const {pathToFileURL}=require('node:url');
const origin='escapement://workbench';
protocol.registerSchemesAsPrivileged([{scheme:'escapement',privileges:{
  standard:true,secure:true,supportFetchAPI:true,codeCache:true
}}]);
app.setName('Escapement');
const isLocal=value=>{try{const url=new URL(value);return url.protocol==='escapement:'&&url.host==='workbench';}catch{return false;}};
app.whenReady().then(()=>{
  const directory=resolve(app.isPackaged?join(process.resourcesPath,'workbench'):join(__dirname,'../dist'));
  protocol.handle('escapement',async request=>{
    if(!isLocal(request.url)||request.method!=='GET')return new Response('',{status:403});
    const pathname=decodeURIComponent(new URL(request.url).pathname);
    const path=resolve(directory,'.'+(pathname==='/'?'/index.html':pathname));
    if(!path.startsWith(directory+sep))return new Response('',{status:403});
    try{
      const file=await net.fetch(pathToFileURL(path).href);
      const headers=new Headers(file.headers);
      headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'");
      return new Response(file.body,{headers,status:file.status});
    }catch{return new Response('',{status:404});}
  });
  const win=new BrowserWindow({width:1440,height:970,minWidth:440,minHeight:540,title:'Escapement',
    backgroundColor:'#101315',autoHideMenuBar:true,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}});
  const session=win.webContents.session;
  session.setPermissionCheckHandler((contents,permission,url,details)=>
    contents===win.webContents&&isLocal(url)&&permission==='media'&&details.mediaType!=='video');
  session.setPermissionRequestHandler((contents,permission,done,details)=>{
    if(contents!==win.webContents||permission!=='media'||!isLocal(details.requestingUrl)||
       !details.mediaTypes?.includes('audio')||details.mediaTypes.includes('video'))return done(false);
    const choice=dialog.showMessageBoxSync(win,{type:'question',title:'Microphone access',message:'Allow Escapement to use the microphone?',
      detail:'Audio is analyzed on this computer.',buttons:['Allow','Deny'],defaultId:1,cancelId:1});
    done(choice===0);
  });
  session.webRequest.onBeforeRequest((details,done)=>{
    done({cancel:!isLocal(details.url)&&!details.url.startsWith('blob:')&&!details.url.startsWith('data:')});
  });
  win.webContents.on('will-navigate',(event,url)=>{if(!isLocal(url))event.preventDefault();});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.loadURL(origin+'/');
});
app.on('window-all-closed',()=>app.quit());

