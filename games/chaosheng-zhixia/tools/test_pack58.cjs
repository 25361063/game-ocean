/* v58.4 压缩包完整性验证：模型解压 → 三职业建模 → 贴图解码 → 渲染对照截图
   用法：D3D_HTML=<文件名> D3D_SHOT=<截图名> node test_pack58.cjs */
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const TARGET=process.env.D3D_HTML||'潮声之下_深渊潜航3D_单文件版.html';
const SHOT=process.env.D3D_SHOT||'人物压缩对照_压缩版.png';
(async()=>{
 const tabs=await(await fetch('http://127.0.0.1:9238/json')).json();const ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);let seq=0;const errors=[];
 ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);});
 function call(method,params={}){return new Promise((resolve,reject)=>{const id=++seq;const cb=e=>{const m=JSON.parse(e.data);if(m.id!==id)return;ws.removeEventListener('message',cb);m.error?reject(m.error):resolve(m.result);};ws.addEventListener('message',cb);ws.send(JSON.stringify({id,method,params}));});}
 async function ev(x){const r=await call('Runtime.evaluate',{expression:x,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description);return r.result.value;}
 const assert=(c,m)=>{if(!c)throw Error('assert failed: '+m);};

 console.log('目标文件',TARGET,'大小',(fs.statSync(TARGET).size/1048576).toFixed(2),'MB');
 await call('Runtime.enable');await call('Page.navigate',{url:pathToFileURL(path.resolve(TARGET)).href+'?qa=1&hq=1'});
 for(let i=0;i<200;i++){await new Promise(r=>setTimeout(r,250));if(await ev('!!globalThis.__D3D'))break;}
 assert(await ev('!!globalThis.__D3D'),'game booted');
 const compressed=await ev('typeof window.__vit49Inflate==="function"');   // 只有压缩构建才有解压钩子
 console.log('构建方式',compressed?'压缩包（gzip+量化+WebP）':'原样内联');

 /* 1) 解压状态：压缩版应执行过 gzip 解压（__vit49Gz 由解压钩子写入）；
      源版本加载后 characters49.js 会把 VIT49_DATA 置空，故只看标记 */
 const gz=await ev('window.__vit49Gz||0');
 console.log('解压钩子执行次数',gz,'· 期望',compressed?'≥1':'0');
 assert(compressed?gz>=1:gz===0,'解压钩子应与构建方式匹配');
 if(compressed)assert(await ev('!!(window.THREE&&window.VIT49&&VIT49.build)'),'VIT49 API 就绪');

 /* 2) 三职业建模 + 贴图解码（不加入场景，只看几何/材质） */
 for(const role of ['explorer','guardian','hunter']){
  const st=await ev(`(()=>{const g=VIT49.build('${role}');let meshes=0,verts=0,tris=0,withMap=0,drewTex=0,bones=0;
    g.traverse(o=>{if(o.isBone)bones++;if(o.isMesh){meshes++;const p=o.geometry.attributes.position;if(p)verts+=p.count;if(o.geometry.index)tris+=o.geometry.index.count/3;
      const mats=Array.isArray(o.material)?o.material:[o.material];for(const mt of mats){if(!mt)continue;if(mt.map)withMap++;if(mt.map&&mt.map.image&&mt.map.image.width>0)drewTex++;}}});
    return {meshes,verts,tris,bones,withMap,drewTex};})()`);
  console.log(role,JSON.stringify(st));
  assert(st.meshes>0&&st.verts>1000,'模型几何存在 '+role);
  assert(st.bones>20,'骨骼存在 '+role);
  assert(st.withMap>0&&st.drewTex===st.withMap,'贴图已解码为图片 '+role+'（'+st.drewTex+'/'+st.withMap+'）');
 }

 /* 3) 队长特写渲染对照：qaCaptainPreview(true) 会全屏渲染三名队长 + 探员特写 */
 await ev('__D3D.qaStart({level:0,modeId:"campaign",roleId:"explorer"})');
 await new Promise(r=>setTimeout(r,900));
 await ev('__D3D.qaCaptainPreview(true)');
 await new Promise(r=>setTimeout(r,2500));
 const s=await call('Page.captureScreenshot',{format:'png'});
 fs.writeFileSync(SHOT,Buffer.from(s.data,'base64'));
 console.log('截图',SHOT);
 console.log('errors',errors);assert(errors.length===0,'no runtime errors');
 console.log('PASS 压缩包解密/建模/贴图/渲染全部正常');
 ws.close();process.exit(0);
})().catch(e=>{console.error(e);process.exit(1)});
