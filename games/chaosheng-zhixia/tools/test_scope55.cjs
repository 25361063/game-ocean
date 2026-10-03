const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url'),assert=require('node:assert/strict');
(async()=>{
 const tabs=await(await fetch('http://127.0.0.1:9238/json')).json();const ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);let seq=0;const errors=[];
 ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);});
 function call(method,params={}){return new Promise((resolve,reject)=>{const id=++seq;const cb=e=>{const m=JSON.parse(e.data);if(m.id!==id)return;ws.removeEventListener('message',cb);m.error?reject(m.error):resolve(m.result);};ws.addEventListener('message',cb);ws.send(JSON.stringify({id,method,params}));});}
 async function ev(expression){const r=await call('Runtime.evaluate',{expression,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description);return r.result.value;}
 await call('Emulation.setTouchEmulationEnabled',{enabled:false});await call('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
 await call('Runtime.enable');await call('Page.navigate',{url:pathToFileURL(path.resolve('潮声之下_深渊潜航3D_v22.html')).href+'?qa=1&hq=1'});
 for(let i=0;i<50;i++){await new Promise(r=>setTimeout(r,200));if(await ev('!!globalThis.__D3D'))break;}

 const results=[];
 for(const role of ['explorer','hunter']){
  await ev('__D3D.qaStart({level:0,modeId:"campaign",roleId:"'+role+'"});__D3D.qaEquipment53([]);__D3D.qaShotSetup55()');
  await ev('__D3D.qaFire()');let normal=await ev('__D3D.qaScopeState55()');assert.equal(normal.shots.length,1);assert.equal(normal.plunge,false);assert.equal(normal.grounded,true);
  const normalHit=await ev('__D3D.qaImpact55()');assert.ok(normalHit>0);
  await ev('__D3D.qaShotSetup55();__D3D.qaScope55(true)');assert.equal((await ev('__D3D.qaScopeState55()')).fov,32);
  await ev('__D3D.qaFire()');const scoped=await ev('__D3D.qaScopeState55()');assert.equal(scoped.shots.length,1);assert.equal(scoped.active,false);assert.equal(scoped.fov,75);assert.equal(scoped.shots[0].dmg,normal.shots[0].dmg*5);
  const scopeHit=await ev('__D3D.qaImpact55()');assert.ok(Math.abs(scopeHit-normalHit*5)<1e-8);
  results.push({role,normalHit,scopeHit});
  await ev('__D3D.qaEquipment53(["splitMag"]);__D3D.qaShotSetup55();__D3D.qaScope55(true);__D3D.qaFire()');assert.equal((await ev('__D3D.qaScopeState55()')).shots.length,1);
  await ev('__D3D.qaShotSetup55(5);__D3D.qaScope55(true);__D3D.qaFire()');assert.equal((await ev('__D3D.qaScopeState55()')).active,true);assert.equal((await ev('__D3D.qaScopeState55()')).shots.length,0);
  if(role==='hunter'){await ev('__D3D.qaShotSetup55(0,0,2);__D3D.qaScope55(true);__D3D.qaFire()');assert.equal((await ev('__D3D.qaScopeState55()')).active,true);assert.equal((await ev('__D3D.qaScopeState55()')).shots.length,0);}
 }
 await ev('__D3D.qaStart({level:0,modeId:"campaign",roleId:"guardian"})');assert.equal(await ev('__D3D.qaScope55(true)'),false);
 await ev('__D3D.qaStart({level:0,modeId:"campaign",roleId:"explorer"});__D3D.qaShotSetup55()');
 await call('Input.dispatchMouseEvent',{type:'mousePressed',x:640,y:400,button:'right',clickCount:1});await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:640,y:400,button:'right',clickCount:1});assert.equal((await ev('__D3D.qaScopeState55()')).active,true);
 await new Promise(r=>setTimeout(r,500));console.log('ray',await ev('__D3D.qaScopeRay55()'));const shot=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync('瞄准镜实机_v55.png',Buffer.from(shot.data,'base64'));
 await call('Input.dispatchMouseEvent',{type:'mousePressed',x:640,y:400,button:'left',clickCount:1});await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:640,y:400,button:'left',clickCount:1});await new Promise(r=>setTimeout(r,200));/* v58.4：换关时主线程在重建人物模型（65 万顶点），固定延时不足以等到输入被处理 → 改为轮询等待，最多 5s */let fired=false;for(let i=0;i<50;i++){if((await ev('__D3D.qaScopeState55()')).active===false){fired=true;break;}await new Promise(r=>setTimeout(r,100));}assert.ok(fired,'左键射击应当退镜（等待输入被处理）');
 console.log(JSON.stringify({results,checks:'tower fire / real impact x5 / split single shot / cooldown / empty ammo / melee rejection / right mouse and left fire',errors},null,2));assert.equal(errors.length,0);ws.close();
})().catch(e=>{console.error(e);process.exit(1)});
