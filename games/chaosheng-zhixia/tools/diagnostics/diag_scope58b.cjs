/* 复现 test_scope55 完整序列，找出污染状态的那一步 */
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
 const st=async(tag)=>{const s=await ev('({state:__D3D.get().state,...__D3D.qaScopeState55(),eq:(__D3D.qaEquipment53?1:0)})');console.log(tag.padEnd(28),JSON.stringify({state:s.state,active:s.active,shots:s.shots.length,ammo:s.ammo}));return s;};
 for(const role of ['explorer','hunter']){
  await ev('__D3D.qaStart({level:0,modeId:"campaign",roleId:"'+role+'"});__D3D.qaEquipment53([]);__D3D.qaShotSetup55()');
  await ev('__D3D.qaFire()');await ev('__D3D.qaImpact55()');
  await ev('__D3D.qaShotSetup55();__D3D.qaScope55(true)');await ev('__D3D.qaFire()');await ev('__D3D.qaImpact55()');
  await ev('__D3D.qaEquipment53(["splitMag"]);__D3D.qaShotSetup55();__D3D.qaScope55(true);__D3D.qaFire()');
  await ev('__D3D.qaShotSetup55(5);__D3D.qaScope55(true);__D3D.qaFire()');
  if(role==='hunter')await ev('__D3D.qaShotSetup55(0,0,2);__D3D.qaScope55(true);__D3D.qaFire()');
  console.log('-- 循环结束',role,JSON.stringify(await ev('__D3D.qaScopeState55()')));
 }
 await ev('__D3D.qaStart({level:0,modeId:"campaign",roleId:"guardian"})');
 console.log('guardian 开镜返回',await ev('__D3D.qaScope55(true)'));
 await ev('__D3D.qaStart({level:0,modeId:"campaign",roleId:"explorer"});__D3D.qaShotSetup55()');
 await new Promise(r=>setTimeout(r,300));
 await st('qaStart explorer 后');
 await call('Input.dispatchMouseEvent',{type:'mousePressed',x:640,y:400,button:'right',clickCount:1});
 await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:640,y:400,button:'right',clickCount:1});
 await new Promise(r=>setTimeout(r,120));
 await st('右键后');
 await new Promise(r=>setTimeout(r,500));
 await ev('__D3D.qaScopeRay55()');                 // 与测试一致：先做一次射线查询
 await call('Page.captureScreenshot',{format:'png'}).then(()=>{});   // 与测试一致：中间截图
 await st('射线+截图后');
 await call('Input.dispatchMouseEvent',{type:'mousePressed',x:640,y:400,button:'left',clickCount:1});
 await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:640,y:400,button:'left',clickCount:1});
 await new Promise(r=>setTimeout(r,250));
 const after=await st('左键后');
 console.log('弹丸数量',after.shots.length,'scope active',after.active);
 console.log('errors',errors.slice(0,4));
 ws.close();process.exit(0);
})().catch(e=>{console.error(e);process.exit(1)});
