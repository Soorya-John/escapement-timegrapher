import {_electron as electron} from '@playwright/test';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const executablePath=resolve(process.env.DESKTOP_EXE||'release/win-unpacked/Escapement.exe');
const desktop=await electron.launch({executablePath,timeout:90000});
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
  await page.getByRole('button',{name:'Stop',exact:true}).click();
  await page.getByRole('button',{name:'Save session'}).click();
  await page.getByText('Session saved.').waitFor();
  await page.getByRole('link',{name:'Records'}).click();
  assert.match(await page.locator('#rows').textContent(),/simulation/);
  await page.screenshot({path:'release/windows-smoke.png'});
  assert.deepEqual(errors,[]);
  console.log('Windows executable passed offline demo, secure origin, isolated renderer and session persistence.');
}finally{await desktop.close();}

