import {test,expect} from '@playwright/test';
test('canceling pending permission releases a later stream',async({page})=>{
  await page.addInitScript(()=>{
    const audio=new AudioContext();
    const destination=audio.createMediaStreamDestination();
    const state={calls:0,stream:destination.stream};
    Object.assign(window,{pendingTest:state});
    navigator.mediaDevices.getUserMedia=()=>new Promise(resolve=>{
      state.calls++;
      setTimeout(()=>resolve(destination.stream),900);
    });
  });
  await page.goto('./');
  await page.getByRole('button',{name:'Start microphone'}).click();
  await expect(page.locator('#status')).toHaveText('Waiting for input');
  await page.getByRole('button',{name:'Stop',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {pendingTest:{stream:MediaStream}}).pendingTest.stream.getTracks().every(t=>t.readyState==='ended'))).toBeTruthy();
  await expect(page.locator('#status')).toHaveText('Stopped');
});
test('unsupported and insecure contexts report acquisition limits',async({page})=>{
  await page.addInitScript(()=>Object.defineProperty(window,'isSecureContext',{value:false}));
  await page.goto('./');
  await page.getByRole('button',{name:'Start microphone'}).click();
  await expect(page.locator('#status')).toContainText('requires HTTPS or localhost');
});
test('quota failure and corrupt backup never report success',async({page})=>{
  await page.goto('./#collection');
  await page.evaluate(()=>{
    IDBObjectStore.prototype.put=function(){throw new DOMException('Disk full','QuotaExceededError');};
  });
  await page.getByRole('textbox',{name:'Name',exact:true}).fill('Unsaved fixture');
  await page.getByRole('button',{name:'Save watch'}).click();
  await expect(page.locator('#notice')).toContainText('Local storage is full');
  await expect(page.locator('#watchlist')).not.toContainText('Unsaved fixture');
  await page.getByRole('link',{name:'Records'}).click();
  await page.locator('#restore').setInputFiles({name:'broken.json',mimeType:'application/json',buffer:Buffer.from('{')});
  await expect(page.locator('#notice')).not.toContainText('Restored');
  await expect(page.locator('#rows')).toContainText('No matching sessions');
});

