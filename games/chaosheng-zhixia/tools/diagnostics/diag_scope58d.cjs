/* 验证：qaStart 后剧情弹窗未正确收尾 → 输入通道关闭 → 经输入模块的左键被吞；跳过剧情后恢复 */
const path=require('node:path'),{pathToFileURL}=require('node:url');
const TARGET=process.env.D3D_HTML||'潮声之下_深渊潜航3D_v22.html';
(async()=>{
 const tabs=await(await fetch('http://127.0.0.1:9238/json')).json();const ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);let seq=0;
 function call(method,params={}){return new Promise((resolve,reject)=>{const id=++seq;const cb=e=>{const m=JSON.parse(e.data);if(m.id!==id)return;ws.removeEventListener('message',cb);m.error?reject(m.error):resolve(m.result);};ws.addEventListener('message',cb);ws.send(JSON.stringify({id,method,params}));});}
 async function ev(x){const r=await call('Runtime.evaluate',{expression:x,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description);return r.result.value;}
 await call('Runtime.enable');await call('Emulation.setTouchEmulationEnabled',{enabled:false});await call('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
 await call('Page.navigate',{url:pathToFileURL(path.resolve(TARGET)).href+'?qa=1&hq=1'});
 for(let i=0;i<200;i++){await new Promise(r=>setTimeout(r,250));if(await ev('!!globalThis.__D3D'))break;}
 const report=async(tag)=>{const s=await ev('({st:__D3D.get().state,modal:!!__D3D.get().story.modal,...__D3D.qaScopeState55()})');console.log(tag.padEnd(22),JSON.stringify({state:s.st,storyModal:s.modal,scope:s.active,shots:s.shots.length}));return s;};
 const rightClick=async()=>{await call('Input.dispatchMouseEvent',{type:'mousePressed',x:640,y:400,button:'right',clickCount:1});await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:640,y:400,button:'right',clickCount:1});await new Promise(r=>setTimeout(r,120));};
 const leftClick=async()=>{await call('Input.dispatchMouseEvent',{type:'mousePressed',x:640,y:400,button:'left',clickCount:1});await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:640,y:400,button:'left',clickCount:1});await new Promise(r=>setTimeout(r,250));};

 await ev('__D3D.qaStart({level:0,modeId:"campaign",roleId:"explorer"});__D3D.qaShotSetup55()');
 await report('qaStart 后');
 await rightClick();await report('右键开镜');
 await leftClick();await report('左键（期望被吞）');
 await ev('__D3D.qaStorySkip();__D3D.qaStart({level:0,modeId:"campaign",roleId:"explorer"});__D3D.qaStorySkip();__D3D.qaShotSetup55()');
 await report('跳剧情+重置后');
 await rightClick();await report('右键开镜');
 await leftClick();await report('左键（期望射击退镜）');
 ws.close();process.exit(0);
})().catch(e=>{console.error(e);process.exit(1)});
