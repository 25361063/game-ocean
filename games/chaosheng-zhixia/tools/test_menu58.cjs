/* 压缩单文件版菜单冒烟：确认内联 WebP 海报与样式正常渲染 */
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const TARGET=process.env.D3D_HTML||'潮声之下_深渊潜航3D_单文件版.html';
(async()=>{
 const tabs=await(await fetch('http://127.0.0.1:9238/json')).json();const ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);let seq=0;const errors=[];
 ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')errors.push(String(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text).slice(0,200));});
 function call(method,params={}){return new Promise((resolve,reject)=>{const id=++seq;const cb=e=>{const m=JSON.parse(e.data);if(m.id!==id)return;ws.removeEventListener('message',cb);m.error?reject(m.error):resolve(m.result);};ws.addEventListener('message',cb);ws.send(JSON.stringify({id,method,params}));});}
 async function ev(x){const r=await call('Runtime.evaluate',{expression:x,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description);return r.result.value;}
 await call('Runtime.enable');await call('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
 await call('Page.navigate',{url:pathToFileURL(path.resolve(TARGET)).href+'?qa=1'});
 for(let i=0;i<200;i++){await new Promise(r=>setTimeout(r,250));if(await ev('!!globalThis.__D3D'))break;}
 /* 校验海报（WebP data URI）能被浏览器解码 */
 const poster=await ev(`(async()=>{const hero=getComputedStyle(document.querySelector('#menu .menu-hero'),'::before').backgroundImage;const m=hero.match(/url\\("(data:image\\/[a-z]+;base64,[^"]+)"\\)/);if(!m)return {found:false,head:hero.slice(0,80)};
   const ok=await new Promise(r=>{const im=new Image();im.onload=()=>r({w:im.naturalWidth,h:im.naturalHeight});im.onerror=()=>r(null);im.src=m[1];});
   return {found:true,mime:m[1].slice(5,m[1].indexOf(';')).trim(),decoded:ok};})()`);
 console.log('菜单海报',JSON.stringify(poster));
 await new Promise(r=>setTimeout(r,1500));
 const s=await call('Page.captureScreenshot',{format:'png'});
 fs.writeFileSync('单文件版_菜单_v58.png',Buffer.from(s.data,'base64'));
 console.log('errors',errors.length?errors:'[]');
 if(!poster.found||!poster.decoded||errors.length)process.exit(1);
 console.log('PASS 菜单海报（WebP 内联）解码与渲染正常');
 ws.close();process.exit(0);
})().catch(e=>{console.error(e);process.exit(1)});
