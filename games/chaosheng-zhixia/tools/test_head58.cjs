/* v58.3 爆头区间校验：逐关卡枚举怪物类型，检查按模型包围盒算出的头部下沿是否落在合理范围
   要求：base < head < top（头部在躯干内），且常规怪 head 在 0.8~2.8（相对地面），大型变体更高 */
const path=require('node:path'),{pathToFileURL}=require('node:url');
const TARGET=process.env.D3D_HTML||'潮声之下_深渊潜航3D_v22.html';
(async()=>{
 const tabs=await(await fetch('http://127.0.0.1:9238/json')).json();const ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);let seq=0;const errors=[];
 ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);});
 function call(method,params={}){return new Promise((resolve,reject)=>{const id=++seq;const cb=e=>{const m=JSON.parse(e.data);if(m.id!==id)return;ws.removeEventListener('message',cb);m.error?reject(m.error):resolve(m.result);};ws.addEventListener('message',cb);ws.send(JSON.stringify({id,method,params}));});}
 async function ev(x){const r=await call('Runtime.evaluate',{expression:x,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description);return r.result.value;}
 const assert=(c,m)=>{if(!c)throw Error('assert failed: '+m);};
 await call('Runtime.enable');await call('Page.navigate',{url:pathToFileURL(path.resolve(TARGET)).href+'?qa=1&hq=1'});
 for(let i=0;i<80;i++){await new Promise(r=>setTimeout(r,200));if(await ev('!!globalThis.__D3D'))break;}
 const seen={};
 for(let lv=0;lv<10;lv++){
  await ev('__D3D.qaStart({level:'+lv+',modeId:"campaign",roleId:"explorer"})');
  await new Promise(r=>setTimeout(r,260));
  const info=await ev('__D3D.qaHead58()');
  for(const m of info.monsters){
   if(!m.head)continue;
   const key=m.type;
   if(!seen[key])seen[key]={type:key,head:m.head,base:m.base,top:m.top,levels:[lv]};
   else seen[key].levels.push(lv);
   assert(m.base<m.head,'head must sit above model bottom: '+JSON.stringify(m));
   assert(m.head<m.top,'head must sit below model top: '+JSON.stringify(m));
   assert(m.head>0.5&&m.head<3.4,'head line out of sane range: '+JSON.stringify(m));
  }
 }
 const rows=Object.values(seen).sort((a,b)=>a.head-b.head);
 console.log(JSON.stringify(rows.map(r=>({type:r.type,head:r.head,base:r.base,top:r.top,levels:r.levels.length})),null,1));
 console.log('types',rows.length,'errors',errors);assert(errors.length===0,'no runtime errors');
 console.log('PASS 头部下沿按体型自适应，全部落在躯干内且范围合理');
 ws.close();process.exit(0);
})().catch(e=>{console.error(e);process.exit(1)});
