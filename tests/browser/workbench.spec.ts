import {test,expect,chromium} from '@playwright/test';
import {mkdtemp,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {synth,scenarios} from '../../src/sim';
function wav(){
  const hz=48000,data=synth(hz,{...scenarios.fast,duration:15}),b=Buffer.alloc(44+data.length*2);
  b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);
  b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(hz,24);b.writeUInt32LE(hz*2,28);
  b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(b.length-44,40);
  data.forEach((n,i)=>b.writeInt16LE(Math.round(n*32767),44+i*2));return b;
}
test('demo, watch creation, reload persistence and JSON/CSV export',async({page})=>{
  await page.addInitScript(()=>{navigator.mediaDevices.getUserMedia=()=>Promise.reject(Error('Unexpected microphone request'));});
  await page.goto('./');
  await page.getByRole('link',{name:'Collection'}).click();
  await page.getByRole('textbox',{name:'Name',exact:true}).fill('Workbench fixture');
  await page.getByRole('button',{name:'Save watch'}).click();
  await expect(page.getByText('Watch profile saved.')).toBeVisible();
  await page.getByRole('link',{name:'Workbench',exact:true}).click();
  await page.getByRole('button',{name:'Try demo'}).click();
  await expect(page.locator('#source')).toHaveText(/SIMULATION/);
  await expect(page.locator('#status')).toHaveText('Signal locked',{timeout:15000});
  await expect(page.locator('#bph')).toHaveText('28,800');
  await page.getByRole('button',{name:'Stop',exact:true}).click();
  await page.getByRole('button',{name:'Save session'}).click();
  await expect(page.getByText('Session saved.')).toBeVisible();
  await page.getByRole('link',{name:'Records'}).click();
  await expect(page.locator('#rows')).toContainText('Workbench fixture');
  await page.reload();
  await expect(page.locator('#rows')).toContainText('simulation');
  await page.getByRole('button',{name:'Details'}).click();
  await expect(page.getByRole('dialog')).toContainText('Algorithm version');
  await page.getByRole('textbox',{name:'Session notes'}).fill('Saved by browser test');
  await page.getByRole('button',{name:'Save notes'}).click();
  await expect(page.getByText('Session notes saved.')).toBeVisible();
  await page.getByRole('button',{name:'Close',exact:true}).click();
  const file=page.waitForEvent('download');
  await page.getByRole('button',{name:'Backup JSON'}).click();
  const json=await readFile((await (await file).path())!);
  await page.locator('#restore').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:json});
  await expect(page.getByText('Restored 0 records. Skipped 2 existing IDs.')).toBeVisible();
  const exportFile=page.waitForEvent('download');
  await page.getByRole('button',{name:'Export CSV'}).click();
  const csv=await readFile((await (await exportFile).path())!,'utf8');expect(csv).toContain('Saved by browser test');
});
test('guided position test keeps each acquisition separate',async({page})=>{
  await page.goto('./#collection');
  await page.getByRole('textbox',{name:'Name',exact:true}).fill('Position fixture');
  await page.getByRole('button',{name:'Save watch'}).click();
  await expect(page.getByText('Watch profile saved.')).toBeVisible();
  await page.getByRole('link',{name:'Workbench',exact:true}).click();
  await page.getByRole('button',{name:'Try demo'}).click();
  await page.getByText('Six-position test').click();
  await page.locator('#settle').fill('1');
  await page.locator('#measure').fill('4');
  await page.getByRole('button',{name:'Begin sequence'}).click();
  for(let i=1;i<=6;i++){
    await expect(page.locator('#sequenceStatus')).toContainText('Position '+i+' of 6');
    await page.getByRole('button',{name:'Measure position'}).click();
  }
  await expect(page).toHaveURL(/#records$/,{timeout:15000});
  await expect(page.locator('#rows tr')).toHaveCount(6);
  await expect(page.locator('#comparison')).toContainText('weighted mean');
});
test('mobile layout, audio import and offline subpath reload',async({page,context})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('./');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
  await page.reload();
  await context.setOffline(true);await page.reload();
  await expect(page.getByRole('heading',{name:'Timing workbench'})).toBeVisible();
  await page.getByText('Demo and file input').click();
  await page.locator('#audiofile').setInputFiles({name:'fixture.wav',mimeType:'audio/wav',buffer:wav()});
  await expect(page.locator('#status')).toHaveText('Import complete',{timeout:15000});
  await expect(page.locator('#bph')).toHaveText('21,600');
  expect(Math.abs(Number(await page.locator('#rate').textContent())-24)).toBeLessThan(2);
});
test('denied and missing microphone are actionable',async({page})=>{
  await page.addInitScript(()=>{let n=0;navigator.mediaDevices.getUserMedia=()=>Promise.reject(new DOMException('',n++?'NotFoundError':'NotAllowedError'));});
  await page.goto('./');
  await page.getByRole('button',{name:'Start microphone'}).click();
  await expect(page.locator('#status')).toContainText('permission was denied');
  await page.getByRole('button',{name:'Start microphone'}).click();
  await expect(page.locator('#status')).toContainText('audio input is unavailable');
});
test('synthetic browser microphone traverses worklet, worker and stop',async({baseURL})=>{
  const dir=await mkdtemp(join(tmpdir(),'escapement-')),path=join(dir,'fixture.wav');
  await writeFile(path,wav());
  const browser=await chromium.launch({args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-audio-capture='+path]});
  try{
    const page=await browser.newPage();
    await page.addInitScript(()=>{
      const get=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia=async options=>{
        const stream=await get(options);Object.assign(window,{testStream:stream});return stream;
      };
    });
    const requests:string[]=[];page.on('response',r=>{if(r.ok())requests.push(r.url());});
    await page.goto(baseURL!);
    await page.getByText('Signal and clock settings').click();
    await page.getByRole('checkbox',{name:/Enable local WAV/}).check();
    await page.getByRole('button',{name:'Start microphone'}).click();
    await expect(page.locator('#status')).toHaveText('Signal locked',{timeout:20000});
    await expect(page.locator('#bph')).toHaveText('21,600');
    expect((await page.request.get(new URL('capture.js',baseURL).href)).ok()).toBeTruthy();
    const worker=page.workers().find(w=>/\/assets\/worker-.+\.js/.test(w.url()));
    expect(worker).toBeTruthy();
    expect((await page.request.get(worker!.url())).ok()).toBeTruthy();
    await page.getByRole('button',{name:'Stop',exact:true}).click();
    expect(await page.evaluate(()=>(window as unknown as {testStream:MediaStream}).testStream.getTracks().every(t=>t.readyState==='ended'))).toBeTruthy();
    const pending=page.waitForEvent('download');
    await page.getByRole('button',{name:'Export recorded WAV'}).click();
    const buffer=await readFile((await (await pending).path())!);
    expect(buffer.subarray(0,4).toString()).toBe('RIFF');expect(buffer.length).toBeGreaterThan(10000);
  }finally{await browser.close();await rm(dir,{recursive:true,force:true});}
});

