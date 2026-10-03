/* v58.2/v58.3 伤害回归：全局基础伤害 ×5（普攻= v55 基准 ×5）+ 爆头必定暴击并额外 ×2
   默认测源文件；D3D_HTML=潮声之下_深渊潜航3D_单文件版.html 可测单文件版 */
const path=require('node:path'),{pathToFileURL}=require('node:url');
const TARGET=process.env.D3D_HTML||'潮声之下_深渊潜航3D_v22.html';
(async()=>{
 const tabs=await(await fetch('http://127.0.0.1:9238/json')).json();const ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);let seq=0;const errors=[];
 ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);});
 function call(method,params={}){return new Promise((resolve,reject)=>{const id=++seq;const cb=e=>{const m=JSON.parse(e.data);if(m.id!==id)return;ws.removeEventListener('message',cb);m.error?reject(m.error):resolve(m.result);};ws.addEventListener('message',cb);ws.send(JSON.stringify({id,method,params}));});}
 async function ev(expression){const r=await call('Runtime.evaluate',{expression,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description);return r.result.value;}
 const assert=(c,m)=>{if(!c)throw Error('assert failed: '+m);};
 await call('Runtime.enable');await call('Emulation.setTouchEmulationEnabled',{enabled:false});await call('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
 await call('Page.navigate',{url:pathToFileURL(path.resolve(TARGET)).href+'?qa=1&hq=1'});
 for(let i=0;i<80;i++){await new Promise(r=>setTimeout(r,200));if(await ev('!!globalThis.__D3D'))break;}

 /* 基准来源：v55 文档记录的修复前数值——调查角色普攻 2.56 / 开镜 12.8；突击角色普攻 4.4 / 开镜 22 */
 const BASE55={explorer:2.56,hunter:4.4};
 const out=[];let realHeads=null;
 for(const role of ['explorer','hunter']){
  await ev('__D3D.qaStart({level:0,modeId:"campaign",roleId:"'+role+'"});__D3D.qaEquipment53([])');
  await new Promise(r=>setTimeout(r,350));
  if(!realHeads){realHeads=await ev('__D3D.qaHead58()');}   // v58.3：读取真实怪物按模型包围盒算出的头部下沿
  await ev('__D3D.qaShotSetup55()');
  await new Promise(r=>setTimeout(r,300));
  /* 普攻（不开镜）——身体命中 */
  await ev('__D3D.qaFire()');
  let st=await ev('__D3D.qaScopeState55()');
  assert(st.shots.length===1,'normal: exactly one projectile');
  assert(st.shots[0].scoped===false,'normal: not scoped');
  const normalDmg=st.shots[0].dmg;
  const normalHit=await ev('__D3D.qaImpact55()');
  const bodyHit=await ev('__D3D.qaLastHit58()');
  assert(bodyHit&&bodyHit.headshot===false,'body shot must not be headshot');

  /* 普攻抬到头部高度 —— 爆头 */
  await ev('__D3D.qaShotSetup55()');
  await ev('__D3D.qaFire()');
  const headHit=await ev('__D3D.qaImpact55(0.5)');
  const headFlag=await ev('__D3D.qaLastHit58()');
  assert(headFlag&&headFlag.headshot===true,'head-height shot must be flagged headshot');
  assert(headFlag.crit===true,'headshot must force crit');

  /* 开镜单发 */
  await ev('__D3D.qaShotSetup55();__D3D.qaScope55(true)');
  assert(await ev('__D3D.qaScopeState55().fov')===32,'scoped fov 32');
  await ev('__D3D.qaFire()');
  st=await ev('__D3D.qaScopeState55()');
  assert(st.shots.length===1,'scoped: exactly one projectile');
  assert(st.shots[0].scoped===true,'scoped flag set');
  assert(st.active===false,'scope auto-exits after fire');
  assert(st.fov===75,'fov restored');
  const scopeHit=await ev('__D3D.qaImpact55()');

  const expectNormal=Math.round(BASE55[role]*5*100)/100;
  const cfg58=await ev('__D3D.qaHead58()');
  const expectHeadMul=2*(cfg58.mult);   // 爆头 = 暴击×2 × 爆头额外倍率
  out.push({role,normalDmg,normalHit,headHit,scopeHit,expectNormal,vsV55:Math.round(normalHit/BASE55[role]*100)/100,headOverNormal:Math.round(headHit/normalHit*100)/100,scopeOverNormal:Math.round(scopeHit/normalHit*100)/100});
  assert(Math.abs(normalHit-expectNormal)<0.02,'role '+role+': 普攻扣血 '+normalHit+' 应为 v55 基准的 5 倍 = '+expectNormal);
  assert(Math.abs(headHit-normalHit*expectHeadMul)<0.05,'role '+role+': 爆头扣血 '+headHit+' 应为普攻 ×'+expectHeadMul);
  assert(Math.abs(scopeHit-normalHit*5)<1e-6,'role '+role+': 开镜扣血应为普攻 ×5');
 }
 console.log(JSON.stringify(out,null,1));
 console.log('真实怪物头部下沿（相对地面）',JSON.stringify(realHeads.monsters.slice(0,8)));
 console.log('爆头参数',JSON.stringify({fallback:realHeads.fallback,forceCrit:realHeads.forceCrit,mult:realHeads.mult,frac:realHeads.frac}));
 console.log('errors',errors);assert(errors.length===0,'no runtime errors');
 console.log('PASS 全局伤害 ×5 + 爆头必定暴击并在暴击之上再 ×'+realHeads.mult);
 ws.close();process.exit(0);
})().catch(e=>{console.error(e);process.exit(1)});
