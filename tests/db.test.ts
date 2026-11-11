import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {all,put,snapshot,restore,remove,csv,type Profile,type Session} from '../src/db';
import {defaults} from '../src/dsp';
const watch:Profile={id:'fixture',name:'=SUM(1,2)',brand:'A',model:'B',movement:'C',reference:'',serial:'',
  bph:28800,lift:52,mode:'lever',rateTolerance:15,beatTolerance:.8,service:'',notes:'',photo:''};
const row:Session={id:'session',watch:watch.id,watchName:watch.name,date:'2026-11-11T00:00:00Z',source:'simulation',
  position:'Dial up',duration:10,stabilization:0,settings:defaults,calibration:null,device:'Demo',processing:'PCM',sampleRate:48000,
  result:{valid:true,uncertainty:1,rate:-5,beatError:.4,amplitude:null,amplitudeConfidence:0,liftMs:null,bph:28800,confidence:1,variability:0},
  history:[{t:9,rate:-5,beatError:.4}],winding:'Unknown',hours:null,temperature:null,notes:'  @HYPERLINK("file")',tags:'',version:'1.0.0',group:'',weight:1};
test('transactional save, backup, validated merge, duplicates and deletion',async()=>{
  await put('profiles',watch);await put('sessions',row);
  const backup=await snapshot();assert.equal(backup.sessions.length,1);
  assert.deepEqual(await restore(JSON.stringify(backup)),{added:0,skipped:2});
  await assert.rejects(restore(JSON.stringify({...backup,version:99})));
  await assert.rejects(restore(JSON.stringify({...backup,profiles:[watch,watch]})),/Duplicate/);
  await assert.rejects(restore(JSON.stringify({...backup,sessions:[{...row,settings:{...defaults,ppm:99999}}]})));
  await assert.rejects(restore('{'));
  await remove('profiles',watch.id);await remove('sessions',row.id);
  assert.deepEqual(await restore(JSON.stringify(backup)),{added:2,skipped:0});
  assert.equal((await all('profiles'))[0].name,watch.name);
  assert.equal((await all('sessions'))[0].result.rate,-5);
});
test('CSV protects spreadsheet fields while preserving numeric signs',()=>{
  const file=csv([row]);
  assert.ok(file.includes('"\'=SUM(1,2)"'));
  assert.ok(file.includes('"\'  @HYPERLINK(""file"")"'));
  assert.ok(file.includes('"-5"'));
});

