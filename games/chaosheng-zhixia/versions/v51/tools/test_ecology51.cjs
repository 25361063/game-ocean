const fs=require('node:fs'),{pathToFileURL}=require('node:url'),path=require('node:path');
(async()=>{
 const tabs=await(await fetch('http://127.0.0.1:9238/json')).json(),ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
 await new Promise(r=>ws.onopen=r);let seq=0;const errors=[];
 ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text+': '+(m.params.exceptionDetails.exception?.description||''));});
 function call(method,params={}){return new Promise((resolve,reject)=>{const id=++seq;const cb=e=>{const m=JSON.parse(e.data);if(m.id!==id)return;ws.removeEventListener('message',cb);m.error?reject(m.error):resolve(m.result);};ws.addEventListener('message',cb);ws.send(JSON.stringify({id,method,params}));});}
 async function evaluate(expression){const r=await call('Runtime.evaluate',{expression,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description);return r.result.value;}
 await call('Runtime.enable');await call('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
 await call('Page.navigate',{url:pathToFileURL(path.resolve('潮声之下_深渊潜航3D_v22.html')).href+'?qa=1&hq=1'});
 for(let i=0;i<30;i++){await new Promise(r=>setTimeout(r,300));if(await evaluate('!!globalThis.__D3D'))break;}
 console.log(await evaluate('JSON.stringify(__D3D.qaStart({level:0,roleId:"explorer"}))'));
 await new Promise(r=>setTimeout(r,1500));
 const shot=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync('场景实机_v50.png',Buffer.from(shot.data,'base64'));
 for(const level of [0,20,40,60,80,99]){console.log('stage',level+1,await evaluate(`__D3D.qaStart({level:${level},roleId:'explorer'}).state`));await new Promise(r=>setTimeout(r,150));}
 console.log('bounds',await evaluate(`(()=>{const out=[];for(const level of [1,21,41,61,81]){const g=ARCH50.landmark(level),b=new THREE.Box3().setFromObject(g);if(b.min.y<-.01||b.max.x>3.3||b.min.x<-3.3||b.max.z>3.3||b.min.z<-3.3)throw Error('Landmark footprint '+level);out.push([level,b.max.y]);}return out;})()`));
 console.log('contact tests',await evaluate(`(()=>{const height=(x,z)=>.23*x+Math.sin(z*.7)*.4;for(const yaw of [0,.6,1.8]){const g=ARCH50.cargo();g.position.set(4,height(4,5),5);g.rotation.y=yaw;ECO51.foundation(g,height,[.95,.95]);if(g.userData.groundContacts51.some(p=>p.bottom>p.ground+.0001))throw Error('Floating foundation');const f=ECO51.skeleton(4,5,yaw,2,height);if(f.userData.feet51.some(p=>Math.abs(p.base-height(p.x,p.z))>.0001))throw Error('Floating rib');}return 'slopes, rotated foundations and 42 rib feet PASS';})()`));
 console.log('plant roots',await evaluate(`(()=>{const h=(x,z)=>x*.25+z*.08;for(const scale of [.65,1,1.7]){const g=ECO51.kelp(1,3);g.position.set(4,h(4,5),5);g.rotation.y=.7;g.scale.setScalar(scale);ECO51.rootPlant(g,h);g.updateMatrixWorld(true);for(const leaf of g.children){const p=leaf.getWorldPosition(new THREE.Vector3());if(Math.abs(p.y-h(p.x,p.z)+.025*scale)>.0001)throw Error('Plant root detached');}}return 'scaled and rotated roots PASS';})()`));
 await evaluate('__D3D.qaEcologyPreview()');await new Promise(r=>setTimeout(r,500));
 const gallery=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync('海草鱼骨贴地预览_v51.png',Buffer.from(gallery.data,'base64'));
 console.log('render',await evaluate('JSON.stringify(__D3D.visual())'));
 console.log('errors',JSON.stringify(errors));if(errors.length)process.exitCode=1;ws.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
