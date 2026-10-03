const fs=require('node:fs'),{pathToFileURL}=require('node:url'),path=require('node:path');
(async()=>{
 const tabs=await(await fetch('http://127.0.0.1:9235/json')).json(),ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
 await new Promise(r=>ws.onopen=r);let seq=0;const errors=[];
 ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text+': '+(m.params.exceptionDetails.exception?.description||''));});
 function call(method,params={}){return new Promise((resolve,reject)=>{const id=++seq;const cb=e=>{const m=JSON.parse(e.data);if(m.id!==id)return;ws.removeEventListener('message',cb);m.error?reject(m.error):resolve(m.result);};ws.addEventListener('message',cb);ws.send(JSON.stringify({id,method,params}));});}
 async function evaluate(expression){const r=await call('Runtime.evaluate',{expression,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description);return r.result.value;}
 await call('Runtime.enable');await call('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
 await call('Page.navigate',{url:pathToFileURL(path.resolve('潮声之下_深渊潜航3D_v22.html')).href+'?qa=1&hq=1'});
 for(let i=0;i<30;i++){await new Promise(r=>setTimeout(r,300));if(await evaluate('!!globalThis.__D3D'))break;}
 console.log(await evaluate('JSON.stringify(__D3D.qaStart({level:0,roleId:"explorer"}))'));
 await new Promise(r=>setTimeout(r,1500));
 const shot=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync('美术实机_v45.png',Buffer.from(shot.data,'base64'));
 console.log('render',await evaluate('JSON.stringify(__D3D.visual())'));
 console.log('errors',JSON.stringify(errors));if(errors.length)process.exitCode=1;ws.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
