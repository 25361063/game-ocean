/* 定位 v58.3 后 test_scope55 左键射击不退镜的原因 */
const path=require('node:path'),{pathToFileURL}=require('node:url');
const TARGET=process.env.D3D_HTML||'潮声之下_深渊潜航3D_v22.html';
(async()=>{
 const tabs=await(await fetch('http://127.0.0.1:9238/json')).json();const ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);let seq=0;const errors=[];
 ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')errors.push(String(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text).slice(0,300));});
 function call(method,params={}){return new Promise((resolve,reject)=>{const id=++seq;const cb=e=>{const m=JSON.parse(e.data);if(m.id!==id)return;ws.removeEventListener('message',cb);m.error?reject(m.error):resolve(m.result);};ws.addEventListener('message',cb);ws.send(JSON.stringify({id,method,params}));});}
 async function ev(x){const r=await call('Runtime.evaluate',{expression:x,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description);return r.result.value;}
 await call('Runtime.enable');await call('Emulation.setTouchEmulationEnabled',{enabled:false});await call('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
 await call('Page.navigate',{url:pathToFileURL(path.resolve(TARGET)).href+'?qa=1&hq=1'});
 for(let i=0;i<200;i++){await new Promise(r=>setTimeout(r,250));if(await ev('!!globalThis.__D3D'))break;}
 const st=async(tag)=>{const s=await ev('({state:__D3D.get().state,...__D3D.qaScopeState55()})');console.log(tag,JSON.stringify({state:s.state,active:s.active,fov:s.fov,shots:s.shots.length,ammo:s.ammo,plunge:s.plunge,grounded:s.grounded}));return s;};
 await ev('__D3D.qaStart({level:0,modeId:"campaign",roleId:"explorer"});__D3D.qaEquipment53([]);__D3D.qaShotSetup55()');
 await new Promise(r=>setTimeout(r,500));
 await st('初始');
 /* 右键 → 开镜 */
 await call('Input.dispatchMouseEvent',{type:'mousePressed',x:640,y:400,button:'right',clickCount:1});
 await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:640,y:400,button:'right',clickCount:1});
 await new Promise(r=>setTimeout(r,150));
 await st('右键后');
 /* 左键 → 期望射击并退镜 */
 await call('Input.dispatchMouseEvent',{type:'mousePressed',x:640,y:400,button:'left',clickCount:1});
 await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:640,y:400,button:'left',clickCount:1});
 await new Promise(r=>setTimeout(r,250));
 await st('左键后');
 /* 直接调用 qaFire 作对照 */
 await ev('__D3D.qaFire()');
 await new Promise(r=>setTimeout(r,150));
 await st('qaFire后');
 console.log('errors',errors.slice(0,5));
 ws.close();process.exit(0);
})().catch(e=>{console.error(e);process.exit(1)});
