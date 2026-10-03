/* v58.1 手机瞄准修复回归：开镜后触屏按键必须显示在瞄准遮罩之上，射击可正常发射×5并自动退镜 */
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url'),assert=require('node:assert/strict');
(async()=>{
 const tabs=await(await fetch('http://127.0.0.1:9238/json')).json();const ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);let seq=0;const errors=[];
 ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);});
 function call(method,params={}){return new Promise((resolve,reject)=>{const id=++seq;const cb=e=>{const m=JSON.parse(e.data);if(m.id!==id)return;ws.removeEventListener('message',cb);m.error?reject(m.error):resolve(m.result);};ws.addEventListener('message',cb);ws.send(JSON.stringify({id,method,params}));});}
 async function ev(expression){const r=await call('Runtime.evaluate',{expression,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description);return r.result.value;}
 await call('Runtime.enable');await call('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
 await call('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:1,mobile:true});
 async function tap(id){const p=await ev('(()=>{const r=document.getElementById('+JSON.stringify(id)+').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()');await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:p.x,y:p.y}]});await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await new Promise(r=>setTimeout(r,220));}
 async function shot(name){const s=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(name,Buffer.from(s.data,'base64'));}
 await call('Page.navigate',{url:pathToFileURL(path.resolve(process.env.D3D_HTML||'潮声之下_深渊潜航3D_v22.html')).href+'?qa=1'});
 for(let i=0;i<100;i++){await new Promise(r=>setTimeout(r,200));if(await ev('!!globalThis.__D3D'))break;}
 assert.ok(await ev('!!globalThis.__D3D'),'__D3D ready');
 await tap('startBtn');
 await ev('__D3D.qaStart({level:0,modeId:"campaign",roleId:"explorer"})');
 await new Promise(r=>setTimeout(r,900));
 assert.equal(await ev('__D3D.get().state'),'PLAYING','must be playing');

 /* 进入瞄准 */
 await tap('btnAim57');
 let st=await ev('__D3D.qaScopeState55()');
 assert.equal(st.active,true,'scope active after aim tap');

 /* 核心：开镜后按键容器层级必须高于遮罩层 */
 const z=await ev('(()=>{const z1=parseInt(getComputedStyle(document.getElementById("touchUI")).zIndex||0),z2=parseInt(getComputedStyle(document.getElementById("scope55")).zIndex||0);return {touchUI:z1,scope:z2};})()');
 assert.ok(z.touchUI>z.scope,'touchUI z('+z.touchUI+') must be above scope overlay z('+z.scope+')');

 /* 核心：射击/瞄准/闪避等战斗键开镜期间仍然可见（未被遮罩盖住） */
 const vis=await ev('(()=>{const ids=["btnPulse","btnAim57","btnDash","btnJump"];const scope=document.getElementById("scope55").getBoundingClientRect();return ids.map(id=>{const el=document.getElementById(id),r=el.getBoundingClientRect(),cs=getComputedStyle(el);return {id,display:cs.display,visible:cs.display!=="none"&&cs.visibility!=="hidden"&&r.width>0&&r.height>0};});})()');
 for(const v of vis)assert.ok(v.visible,'button visible while scoping: '+v.id);

 /* 触屏提示文案 */
 assert.ok(await ev('document.getElementById("scope55").textContent.includes("点「射击」")'),'touch hint text');

 await shot('手机瞄准修复_v58.png');

 /* 射击 → 自动退镜，且产生 scoped55 弹丸（×5） */
 await tap('btnPulse');
 await new Promise(r=>setTimeout(r,300));
 st=await ev('__D3D.qaScopeState55()');
 assert.equal(st.active,false,'scope must exit after fire');
 assert.ok(st.shots.some(s=>s.scoped),'a scoped ×5 shot was fired');
 assert.ok(st.shots.some(s=>s.dmg>0),'scoped shot has positive damage');

 /* 再进一次镜，用瞄准键主动退出（验证退出路径） */
 await tap('btnAim57');
 assert.equal(await ev('__D3D.qaScopeState55().active'),true,'re-enter scope');
 await tap('btnAim57');
 assert.equal(await ev('__D3D.qaScopeState55().active'),false,'exit scope via aim button');

 console.log('PASS scope buttons visible above overlay, fire exits scope, dmg×5 shot ok');
 console.log('errors',errors);assert.equal(errors.length,0);ws.close();
})().catch(e=>{console.error(e);process.exit(1)});
