const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url'),assert=require('node:assert/strict');
(async()=>{
 const tabs=await(await fetch('http://127.0.0.1:9238/json')).json();const ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);let seq=0;const errors=[];
 ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);});
 function call(method,params={}){return new Promise((resolve,reject)=>{const id=++seq;const cb=e=>{const m=JSON.parse(e.data);if(m.id!==id)return;ws.removeEventListener('message',cb);m.error?reject(m.error):resolve(m.result);};ws.addEventListener('message',cb);ws.send(JSON.stringify({id,method,params}));});}
 async function ev(expression){const r=await call('Runtime.evaluate',{expression,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description);return r.result.value;}

 await call('Runtime.enable');await call('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
 async function size(w,h){await call('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:true});}
 async function tap(id){const p=await ev('(()=>{const r=document.getElementById('+JSON.stringify(id)+').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()');await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:p.x,y:p.y}]});await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await new Promise(r=>setTimeout(r,180));}
 async function shot(name){const s=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(name,Buffer.from(s.data,'base64'));}
 await size(844,390);await call('Page.navigate',{url:pathToFileURL(path.resolve('潮声之下_深渊潜航3D_v22.html')).href+'?qa=1'});
 for(let i=0;i<80;i++){await new Promise(r=>setTimeout(r,200));if(await ev('!!globalThis.__D3D'))break;}
 await shot('手机横屏主页_v57.png');
 await tap('startBtn');assert.notEqual(await ev('__D3D.get().state'),'MENU','start button must leave menu');
 for(const [w,h] of [[844,390],[740,360],[667,375],[932,430]]){
  await size(w,h);await ev('__D3D.qaStart({level:0,modeId:"campaign",roleId:"explorer"})');await new Promise(r=>setTimeout(r,900));
  const bounds=await ev(`(()=>{const ids=['btnPulse','btnDash','btnJump','btnShield','btnOverdrive','btnWeapon','btnAim57','btnInfo57','btnPause'];return ids.map(id=>{const el=document.getElementById(id),r=el.getBoundingClientRect();return {id,x:r.x,y:r.y,w:r.width,h:r.height,display:getComputedStyle(el).display};});})()`);
  for(const b of bounds){assert.ok(b.x>=0&&b.y>=0&&b.x+b.w<=w+.1&&b.y+b.h<=h+.1,JSON.stringify(b));assert.ok(b.w>=44&&b.h>=44);}
  for(let i=0;i<bounds.length;i++)for(let j=i+1;j<bounds.length;j++){const a=bounds[i],b=bounds[j];assert.ok(!(a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y),'Overlap '+a.id+' '+b.id);}
  assert.equal(await ev('document.getElementById("equipmentLive53").open'),false);
  await tap('btnInfo57');assert.equal(await ev('document.getElementById("mobilePanel57").classList.contains("open")'),true);
  if(w===844){await shot('手机横屏折叠面板_v57.png');await tap('btnShop');assert.equal(await ev('document.getElementById("buildOverlay").classList.contains("hidden")'),false);await tap('shopCloseBtn');await tap('btnInfo57');}
  await tap('btnInfo57');assert.equal(await ev('document.getElementById("mobilePanel57").classList.contains("open")'),false);
  await tap('btnAim57');assert.equal(await ev('__D3D.qaScopeState55().active'),true);await tap('btnPulse');assert.equal(await ev('__D3D.qaScopeState55().active'),false);
  await tap('minimapToggle');assert.equal(await ev('document.getElementById("minimapWrap").classList.contains("expanded")'),true);await tap('minimapToggle');
  await tap('btnPause');assert.equal(await ev('__D3D.get().state'),'PAUSED');await tap('resumeBtn');assert.equal(await ev('__D3D.get().state'),'PLAYING');
  if(w===844)await shot('手机战斗横屏_v57.png');console.log('layout pass',w,h,bounds);
 }
 await size(393,852);await new Promise(r=>setTimeout(r,300));assert.equal(await ev('getComputedStyle(document.getElementById("rotate57")).display'),'grid');assert.equal(await ev('__D3D.get().state'),'PAUSED');await shot('手机旋转提示_v57.png');
 console.log('errors',errors);assert.equal(errors.length,0);ws.close();
})().catch(e=>{console.error(e);process.exit(1)});
