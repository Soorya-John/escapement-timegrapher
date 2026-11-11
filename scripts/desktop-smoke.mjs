import {_electron as electron,expect} from '@playwright/test';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';

const executablePath=resolve(process.env.DESKTOP_EXE||'release/win-unpacked/Escapement.exe');
const testProfile=await mkdtemp(join(tmpdir(),'escapement-smoke-'));
const hz=48000,frames=hz*14,pcm=Buffer.alloc(44+frames*2);
pcm.write('RIFF');pcm.writeUInt32LE(pcm.length-8,4);pcm.write('WAVEfmt ',8);pcm.writeUInt32LE(16,16);
pcm.writeUInt16LE(1,20);pcm.writeUInt16LE(1,22);pcm.writeUInt32LE(hz,24);pcm.writeUInt32LE(hz*2,28);
pcm.writeUInt16LE(2,32);pcm.writeUInt16LE(16,34);pcm.write('data',36);pcm.writeUInt32LE(frames*2,40);
for(let frame=4800;frame<frames-32;frame+=6000){
  for(let i=0;i<20;i++){
    const value=.4*Math.exp(-i/5)*Math.cos(2*Math.PI*3500*i/hz);
    pcm.writeInt16LE(Math.round(value*32767),44+(frame+i)*2);
  }
}
const microphone=join(testProfile,'input.wav');
await writeFile(microphone,pcm);
const args=[
  ...(process.env.DESKTOP_DEV?[resolve('desktop')]:[]),
  '--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream',
  '--use-file-for-fake-audio-capture='+microphone
];
const desktop=await electron.launch({executablePath,env:{...process.env,ESCAPEMENT_TEST_PROFILE:testProfile},args,timeout:90000});
try{
  const page=await desktop.firstWindow();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.getByRole('heading',{name:'Timing workbench'}).waitFor();
  assert.equal(await page.evaluate(()=>isSecureContext),true);
  assert.equal(await page.evaluate(()=>typeof window.require),'undefined');
  await page.getByRole('button',{name:'Try demo'}).click();
  await page.locator('#status').filter({hasText:'Signal locked'}).waitFor({timeout:20000});
  assert.equal(await page.locator('#bph').textContent(),'28,800');
  await page.screenshot({path:'release/windows-workbench.png'});
  await page.getByRole('button',{name:'Stop',exact:true}).click();
  await page.getByRole('button',{name:'Save session'}).click();
  await page.getByText('Session saved.').waitFor();
  await page.getByRole('link',{name:'Records'}).click();
  await expect(page.locator('#rows')).toContainText('simulation');
  await page.reload();
  await expect(page.locator('#rows')).toContainText('simulation');
  await page.screenshot({path:'release/windows-smoke.png'});
  await page.getByRole('link',{name:'Workbench',exact:true}).click();
  await desktop.evaluate(({dialog})=>{dialog.showMessageBoxSync=()=>0;});
  await page.getByRole('button',{name:'Start microphone'}).click();
  await page.locator('#status').filter({hasText:'Signal locked'}).waitFor({timeout:20000});
  assert.equal(await page.locator('#source').textContent(),'MICROPHONE');
  assert.equal(await page.locator('#bph').textContent(),'28,800');
  await page.getByRole('button',{name:'Stop',exact:true}).click();
  assert.deepEqual(errors,[]);
  console.log('Windows executable passed offline demo, secure origin, isolated renderer, reload persistence and synthetic microphone/worklet acquisition.');
}finally{
  await desktop.close();
  await rm(testProfile,{recursive:true,force:true,maxRetries:5,retryDelay:1000});
}

