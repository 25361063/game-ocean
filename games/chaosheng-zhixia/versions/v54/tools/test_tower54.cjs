const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url'),assert=require('node:assert/strict');
(async()=>{
 const tabs=await(await fetch('http://127.0.0.1:9238/json')).json();const ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);let seq=0;const errors=[];
 ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);});
 function call(method,params={}){return new Promise((resolve,reject)=>{const id=++seq;const cb=e=>{const m=JSON.parse(e.data);if(m.id!==id)return;ws.removeEventListener('message',cb);m.error?reject(m.error):resolve(m.result);};ws.addEventListener('message',cb);ws.send(JSON.stringify({id,method,params}));});}
 async function ev(expression){const r=await call('Runtime.evaluate',{expression,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description);return r.result.value;}
 await call('Runtime.enable');await call('Page.navigate',{url:pathToFileURL(path.resolve('潮声之下_深渊潜航3D_v22.html')).href+'?qa=1&hq=1'});
 for(let i=0;i<50;i++){await new Promise(r=>setTimeout(r,200));if(await ev('!!globalThis.__D3D'))break;}

 const results=[];
 for(const level of [...Array(20).keys(),40,80]){
  await ev('__D3D.qaStart({level:'+level+',modeId:"campaign",roleId:"explorer"})');
  const towers=await ev('__D3D.qaTowers54()');assert.equal(towers.length,2,'tower count level '+level);
  for(let index=0;index<towers.length;index++)for(const down of [false,true]){
   const result=await ev('__D3D.qaWalkTower54('+index+','+down+')');console.log('walk',level,index,down,result.maxError);assert.ok(result.maxError<.5);results.push(result);
  }
  if(level===0)for(const type of ['gray','dart','spitter','shield','sniper','swarm'])for(const down of [false,true]){
   const r=await ev('__D3D.qaChaseTower54(0,"'+type+'",'+down+')');console.log('chase',type,down,r);assert.ok(r.reached,type+' chase failed');
  }
  if(level===0)for(const angle of [0,Math.PI/2,Math.PI,-Math.PI/2]){const r=await ev('__D3D.qaTowerApproach54('+angle+')');console.log('approach',angle,r);assert.ok(r.reached);}
  if(level===0){const r=await ev('__D3D.qaTowerCrowd54()');console.log('crowd',r);assert.equal(r.arrived,6);}
 }
 await ev('__D3D.qaStart({level:0,modeId:"campaign",roleId:"explorer"});__D3D.qaTowerView54()');await new Promise(r=>setTimeout(r,700));const shot=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync('攀塔实机_v54.png',Buffer.from(shot.data,'base64'));
 console.log('errors',errors);assert.equal(errors.length,0);ws.close();
})().catch(e=>{console.error(e);process.exit(1)});
