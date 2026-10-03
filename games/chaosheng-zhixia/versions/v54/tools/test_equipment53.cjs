const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url'),assert=require('node:assert/strict');
(async()=>{
 const tabs=await(await fetch('http://127.0.0.1:9238/json')).json();const ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);let seq=0;const errors=[];
 ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);});
 function call(method,params={}){return new Promise((resolve,reject)=>{const id=++seq;const cb=e=>{const m=JSON.parse(e.data);if(m.id!==id)return;ws.removeEventListener('message',cb);m.error?reject(m.error):resolve(m.result);};ws.addEventListener('message',cb);ws.send(JSON.stringify({id,method,params}));});}
 async function ev(expression){const r=await call('Runtime.evaluate',{expression,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description);return r.result.value;}
 await call('Runtime.enable');await call('Page.navigate',{url:pathToFileURL(path.resolve('潮声之下_深渊潜航3D_v22.html')).href+'?qa=1&hq=1'});
 for(let i=0;i<50;i++){await new Promise(r=>setTimeout(r,200));if(await ev('!!globalThis.__D3D'))break;}
 await ev('__D3D.qaStart({level:0,roleId:"explorer"})');
 const base=await ev('__D3D.qaEquipment53([])');assert.equal(base.crit,.12);
 const lens=await ev('__D3D.qaEquipment53(["lens"])');assert.ok(Math.abs(lens.crit-.20)<1e-6);
 const cat=await ev('__D3D.qaEquipmentCatalog53()');
 for(const item of cat){const stat=await ev(`__D3D.qaEquipment53(${JSON.stringify([item.id])})`);for(const k of ['damageBonus','hpBonus','moveBonus','cooldown','crit','poise','heal','gold','shieldDuration','shieldCooldown','overdrive','dash','radius','shots'])assert.ok(Number.isFinite(stat[k]),item.id+':'+k);}
 await ev('__D3D.qaEquipment53(["turbo","grindstone","shell","fins","coil","lens"]);__D3D.qaBuy53("spear")');
 let info=await ev('__D3D.qaEquipInspect53()');assert.ok(info.equip.includes('spear'));assert.equal(info.equip.length,5);assert.ok(!info.equip.includes('turbo'));
 await ev('__D3D.qaEquipment53(["injTide"]);__D3D.qaBuy53("injFrost")');info=await ev('__D3D.qaEquipInspect53()');assert.deepEqual(info.equip,['injTide']);
 await ev('__D3D.qaEquipment53([],0);__D3D.qaBuy53("dagger")');info=await ev('__D3D.qaEquipInspect53()');assert.equal(info.equip.length,0);
 await ev('__D3D.qaStart({level:0,roleId:"guardian"});__D3D.qaEquipment53([]);__D3D.qaBuy53("splitMag")');info=await ev('__D3D.qaEquipInspect53()');assert.equal(info.equip.length,0);
 await ev('__D3D.qaStart({level:0,roleId:"explorer"});__D3D.qaEquipment53(["splitMag","pierceHead","hunterBuoy","injFrost","echoCore","leech"]);__D3D.qaFire()');
 info=await ev('__D3D.qaEquipInspect53()');assert.equal(info.projectiles.length,2);assert.ok(info.projectiles.every(p=>p.pierce===2&&p.home===1&&p.elem==='frost'&&p.blast>0));
 await new Promise(r=>setTimeout(r,4500));assert.equal(await ev('__D3D.get().projectileMeshes'),0);
 const shot=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync('装备实效_v53.png',Buffer.from(shot.data,'base64'));
 console.log(JSON.stringify({catalog:cat.length,baselineCrit:base.crit,lensCrit:lens.crit,checks:'finite stats / synthesis / conflict / gold / melee compatibility / split projectile modifiers / cleanup',errors},null,2));assert.equal(errors.length,0);ws.close();
})().catch(e=>{console.error(e);process.exit(1)});
