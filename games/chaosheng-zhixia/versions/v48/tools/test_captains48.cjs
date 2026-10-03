const fs=require('node:fs'),{pathToFileURL}=require('node:url'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const tabs=await(await fetch('http://127.0.0.1:9238/json')).json(),ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
 await new Promise(r=>ws.onopen=r);let seq=0;const errors=[];
 ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);});
 function call(method,params={}){return new Promise((resolve,reject)=>{const id=++seq;const cb=e=>{const m=JSON.parse(e.data);if(m.id!==id)return;ws.removeEventListener('message',cb);m.error?reject(m.error):resolve(m.result);};ws.addEventListener('message',cb);ws.send(JSON.stringify({id,method,params}));});}
 async function ev(expression){const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description);return r.result.value;}
 async function shot(name){const s=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(name,Buffer.from(s.data,'base64'));}
 await call('Runtime.enable');await call('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});
 await call('Page.navigate',{url:pathToFileURL(path.resolve('潮声之下_深渊潜航3D_v22.html')).href+'?qa=1&hq=1'});
 for(let i=0;i<40;i++){await new Promise(r=>setTimeout(r,250));if(await ev('!!globalThis.__D3D'))break;}
 assert.equal(await ev(`new Promise(resolve=>{const i=new Image();i.onload=()=>resolve(i.naturalWidth>0);i.onerror=()=>resolve(false);i.src='assets/posters/captains-v48.png';})`),true);
 await shot('开始界面_v48.png');
 await ev(`document.querySelector('.hero-deploy48').click()`);
 assert.equal(await ev(`document.activeElement.id`),'startBtn');
 assert.equal(await ev(`document.querySelector('#menu .panel').scrollWidth<=document.querySelector('#menu .panel').clientWidth+1`),true);
 await ev(`document.querySelector('.captain-select48').scrollIntoView({block:'center'})`);await new Promise(r=>setTimeout(r,300));await shot('角色选择_v48.png');
 for(const role of ['explorer','guardian','hunter']){await ev(`document.querySelector('[data-role=${role}]').click()`);assert.equal(await ev(`document.querySelector('[data-role=${role}]').getAttribute('aria-pressed')`),'true');console.log(role,await ev(`JSON.stringify(__D3D.qaStart({roleId:'${role}',level:0}))`));await new Promise(r=>setTimeout(r,300));await ev('__D3D.toMenu()');}
 await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await ev(`document.querySelector('.captain-select48').scrollIntoView({block:'start'})`);await new Promise(r=>setTimeout(r,250));await shot('角色选择_手机_v48.png');
 await call('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});await ev('__D3D.qaCaptainPreview()');await new Promise(r=>setTimeout(r,300));await shot('人物模型_v48.png');
 console.log('errors',errors);assert.equal(errors.length,0);ws.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
