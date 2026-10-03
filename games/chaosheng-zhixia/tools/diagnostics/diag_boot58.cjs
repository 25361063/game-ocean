/* 诊断：抓取页面控制台/异常与加载面板文案 */
const path=require('node:path'),{pathToFileURL}=require('node:url');
const TARGET=process.env.D3D_HTML||'潮声之下_深渊潜航3D_单文件版.html';
(async()=>{
 const tabs=await(await fetch('http://127.0.0.1:9238/json')).json();const ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);let seq=0;
 const logs=[];
 ws.addEventListener('message',e=>{const m=JSON.parse(e.data);
  if(m.method==='Runtime.consoleAPICalled')logs.push('console.'+m.params.type+': '+m.params.args.map(a=>a.value!==undefined?a.value:(a.description||a.type)).join(' ').slice(0,300));
  if(m.method==='Runtime.exceptionThrown')logs.push('EXCEPTION: '+String(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text).slice(0,500));
  if(m.method==='Log.entryAdded')logs.push('log['+m.params.entry.level+']: '+String(m.params.entry.text).slice(0,300));
 });
 function call(method,params={}){return new Promise((resolve,reject)=>{const id=++seq;const cb=e=>{const m=JSON.parse(e.data);if(m.id!==id)return;ws.removeEventListener('message',cb);m.error?reject(m.error):resolve(m.result);};ws.addEventListener('message',cb);ws.send(JSON.stringify({id,method,params}));});}
 async function ev(x){try{const r=await call('Runtime.evaluate',{expression:x,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)return 'EVAL-ERR: '+String(r.exceptionDetails.exception?.description).slice(0,300);return r.result.value;}catch(e){return 'CALL-ERR '+e.message;}}
 await call('Runtime.enable');await call('Log.enable');
 const t0=Date.now();
 await call('Page.navigate',{url:pathToFileURL(path.resolve(TARGET)).href+'?qa=1&hq=1'});
 for(let i=0;i<60;i++){
   await new Promise(r=>setTimeout(r,1000));
   const st=await ev('({d3d:!!globalThis.__D3D,vit:typeof window.VIT49,vitReady:!!(window.VIT49&&window.VIT49.build),gz:window.__vit49Gz||0,title:(document.getElementById("loadTitle")||{}).textContent,msg:String((document.getElementById("loadMsg")||{}).textContent||"").slice(0,160),note:(document.getElementById("loadNote")||{className:""}).className})');
   if(i%5===0||typeof st==='object'&&st.title&&st.title.indexOf('无法')>=0)console.log(((Date.now()-t0)/1000).toFixed(0)+'s',JSON.stringify(st));
   if(typeof st==='object'&&st.d3d){console.log('booted at '+((Date.now()-t0)/1000).toFixed(1)+'s');break;}
 }
 console.log('--- logs ---');logs.slice(0,25).forEach(l=>console.log(l));
 ws.close();process.exit(0);
})().catch(e=>{console.error(e);process.exit(1)});
