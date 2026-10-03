// v34-M 建模批：M1 生物纹理 / M2 武器模型 v2 / M3 POI 精修 / M4 环境鱼群（两版同步）
const fs = require("fs");
const F = process.argv[2] === "mobile" ? "潮声之下_深渊潜航3D_手机版.html" : "潮声之下_深渊潜航3D_v22.html";
let html = fs.readFileSync(F, "utf8");
let applied = 0, failed = [];
function rep(find, replace, tag) {
  const n = html.split(find).length - 1;
  if (n !== 1) { failed.push(tag + " (出现 " + n + " 次)"); return; }
  html = html.replace(find, replace); applied++;
}

/* M1：族谱生物纹理（Canvas 程序化灰阶斑纹，乘色保留；按族缓存） */
rep(`function buildMonsterMesh(type,family){
  let g;`,
`/* v34 M1：族谱生物纹理——Canvas 程序化灰阶斑纹（map 与材质色相乘，保留族色） */
const FAMILY_TEX={};
function familyTex(fam){
  const key=(fam&&fam.id)||"x";
  if(FAMILY_TEX[key])return FAMILY_TEX[key];
  const cv=document.createElement("canvas");cv.width=128;cv.height=128;const c=cv.getContext("2d");
  c.fillStyle="#bcbcbc";c.fillRect(0,0,128,128);
  for(let i=0;i<46;i++){c.fillStyle="rgba(58,58,58,"+(0.08+Math.random()*.16)+")";c.beginPath();c.arc(Math.random()*128,Math.random()*128,4+Math.random()*14,0,7);c.fill();}
  for(let i=0;i<26;i++){c.strokeStyle="rgba(40,40,40,"+(0.1+Math.random()*.14)+")";c.lineWidth=1+Math.random()*1.5;c.beginPath();const sx=Math.random()*128,sy=Math.random()*128;c.moveTo(sx,sy);c.quadraticCurveTo(sx+(Math.random()-.5)*40,sy+(Math.random()-.5)*40,sx+(Math.random()-.5)*50,sy+(Math.random()-.5)*50);c.stroke();}
  for(let i=0;i<10;i++){c.fillStyle="rgba(255,255,255,"+(0.25+Math.random()*.3)+")";c.beginPath();c.arc(Math.random()*128,Math.random()*128,2+Math.random()*3.5,0,7);c.fill();}
  const t=new THREE.CanvasTexture(cv);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(2,2);
  FAMILY_TEX[key]=t;return t;
}
function applyFamilyTex(g,fam){
  const tex=familyTex(fam);
  g.traverse(ch=>{if(ch.isMesh&&ch.material&&ch.material.isMeshStandardMaterial&&!ch.material.map){ch.material.map=tex;ch.material.needsUpdate=true;}});
}
function buildMonsterMesh(type,family){
  let g;`, "M1 tex fns");
rep(`  decorateMonsterFamily(g,family||stageVisualFamily(),type,stageVisualVariant());
  return stylizeCreature(g,type,false);`,
`  applyFamilyTex(g,family||stageVisualFamily());   // v34 M1 生物纹理
  decorateMonsterFamily(g,family||stageVisualFamily(),type,stageVisualVariant());
  return stylizeCreature(g,type,false);`, "M1 apply");

/* M2：专属武器模型 v2（FPS 持械三把重建） */
rep(`const sonarAttachment=new THREE.Group(),thornAttachment=new THREE.Group(),echoAttachment=new THREE.Group();
const sonarDish=new THREE.Mesh(new THREE.TorusGeometry(.165,.018,6,24),viewEmitterMat);sonarDish.position.z=-.49;sonarAttachment.add(sonarDish);
for(const side of [-1,1]){const blade=new THREE.Mesh(new THREE.ConeGeometry(.028,.38,6),viewEmitterMat);blade.rotation.x=Math.PI/2;blade.position.set(side*.14,.055,-.36);thornAttachment.add(blade);}
const echoRingA=new THREE.Mesh(new THREE.TorusGeometry(.16,.018,6,24),viewEmitterMat),echoRingB=new THREE.Mesh(new THREE.TorusGeometry(.215,.012,6,28),viewEmitterMat);echoRingA.position.z=-.5;echoRingB.position.z=-.475;echoAttachment.add(echoRingA,echoRingB);
viewTool.add(sonarAttachment,thornAttachment,echoAttachment);const viewWeaponAttachments={1:sonarAttachment,2:thornAttachment,3:echoAttachment};`,
`const sonarAttachment=new THREE.Group(),thornAttachment=new THREE.Group(),echoAttachment=new THREE.Group();
/* v34 M2 武器模型 v2 */
const gunMat=new THREE.MeshStandardMaterial({color:0x22343c,roughness:.42,metalness:.72});
const gunDark=new THREE.MeshStandardMaterial({color:0x111c22,roughness:.5,metalness:.55});
const gunGlow=new THREE.MeshBasicMaterial({color:0x7fffd4,fog:false});
/* 磁轨脉冲：轨身 + 三道加速环 + 磁轨导槽 + 消焰尖 + 握把 + 瞄具 */
const railBody=new THREE.Mesh(new THREE.BoxGeometry(.07,.09,.52),gunMat);railBody.position.z=-.34;sonarAttachment.add(railBody);
const railTop=new THREE.Mesh(new THREE.CylinderGeometry(.028,.028,.4,8),gunDark);railTop.rotation.x=Math.PI/2;railTop.position.set(0,.07,-.36);sonarAttachment.add(railTop);
for(let i=0;i<3;i++){const coil=new THREE.Mesh(new THREE.TorusGeometry(.075,.014,6,18),viewEmitterMat);coil.position.z=-.2-i*.13;sonarAttachment.add(coil);}
const railTip=new THREE.Mesh(new THREE.ConeGeometry(.045,.12,8),gunGlow);railTip.rotation.x=-Math.PI/2;railTip.position.z=-.66;sonarAttachment.add(railTip);
const railGrip=new THREE.Mesh(new THREE.BoxGeometry(.05,.14,.07),gunDark);railGrip.position.set(0,-.11,-.12);railGrip.rotation.x=.3;sonarAttachment.add(railGrip);
const railScope=new THREE.Mesh(new THREE.CylinderGeometry(.032,.032,.12,8),gunDark);railScope.rotation.x=Math.PI/2;railScope.position.set(0,.115,-.28);sonarAttachment.add(railScope);
/* 近战锤（迈尔辛沿用）：杆身 + 晶头 + 双翼 + 缠绕能量索 */
const shaft=new THREE.Mesh(new THREE.CylinderGeometry(.035,.045,.58,8),gunDark);shaft.rotation.x=Math.PI/2;shaft.position.z=-.3;thornAttachment.add(shaft);
const hammerHead=new THREE.Mesh(new THREE.OctahedronGeometry(.11,0),viewEmitterMat);hammerHead.position.z=-.62;hammerHead.scale.set(1,1,1.7);thornAttachment.add(hammerHead);
for(const side of [-1,1]){const wing=new THREE.Mesh(new THREE.ConeGeometry(.05,.22,4),gunMat);wing.rotation.x=Math.PI/2;wing.rotation.z=side*.5;wing.position.set(side*.09,-.02,-.5);thornAttachment.add(wing);}
for(let i=0;i<4;i++){const wrap=new THREE.Mesh(new THREE.TorusGeometry(.05,.011,5,14),viewEmitterMat);wrap.position.z=-.14-i*.12;thornAttachment.add(wrap);}
/* 榴弹回响：粗炮管 + 转膛鼓（5 发光孔）+ 消焰环 + 准星块 */
const barrel=new THREE.Mesh(new THREE.CylinderGeometry(.06,.07,.5,10),gunMat);barrel.rotation.x=Math.PI/2;barrel.position.z=-.36;echoAttachment.add(barrel);
const drum=new THREE.Mesh(new THREE.CylinderGeometry(.095,.095,.16,8),gunDark);drum.rotation.x=Math.PI/2;drum.position.z=-.08;echoAttachment.add(drum);
for(let i=0;i<5;i++){const hole=new THREE.Mesh(new THREE.CylinderGeometry(.03,.03,.18,6),gunGlow);hole.rotation.x=Math.PI/2;const aa=i/5*Math.PI*2;hole.position.set(Math.cos(aa)*.055,Math.sin(aa)*.055,-.08);echoAttachment.add(hole);}
const brake=new THREE.Mesh(new THREE.TorusGeometry(.085,.016,6,18),viewEmitterMat);brake.position.z=-.62;echoAttachment.add(brake);
const sight=new THREE.Mesh(new THREE.BoxGeometry(.02,.05,.1),gunDark);sight.position.set(0,.1,-.3);echoAttachment.add(sight);
viewTool.add(sonarAttachment,thornAttachment,echoAttachment);const viewWeaponAttachments={1:sonarAttachment,2:thornAttachment,3:echoAttachment};`, "M2 weapons");

/* M3：POI/地标精修 */
rep(`add(g3,{kind:"chest",x:x2,z:z2,r:2.4,opened:false,phase:i});(G.solids=G.solids||[]).push({x:x2,z:z2,r:.9});}`,
`add(g3,{kind:"chest",x:x2,z:z2,r:2.4,opened:false,phase:i});(G.solids=G.solids||[]).push({x:x2,z:z2,r:.9});
    const lock=new THREE.Mesh(new THREE.TorusGeometry(.1,.025,6,14),new THREE.MeshBasicMaterial({color:0xffe9a8,fog:false}));lock.position.set(0,.2,.38);g3.add(lock);
    const strip=new THREE.Mesh(new THREE.BoxGeometry(1.16,.05,.78),new THREE.MeshBasicMaterial({color:0xffd66b,fog:false}));strip.position.y=.1;g3.add(strip);}`, "M3 chest");
rep(`add(g3,{kind:"beacon",x:x2,z:z2,r:2.4,idx:i,gid:Math.floor(lv/2),lit:false,orb:orb});}`,
`add(g3,{kind:"beacon",x:x2,z:z2,r:2.4,idx:i,gid:Math.floor(lv/2),lit:false,orb:orb});
    const cable=new THREE.Mesh(new THREE.CylinderGeometry(.05,.09,1.1,6),new THREE.MeshStandardMaterial({color:0x22343c,metalness:.6,roughness:.4}));cable.position.y=.55;g3.add(cable);
    const ringB=new THREE.Mesh(new THREE.TorusGeometry(.62,.03,6,20),new THREE.MeshBasicMaterial({color:0x7fd0ff,fog:false}));ringB.rotation.x=Math.PI/2;ringB.position.y=.06;g3.add(ringB);}`, "M3 beacon");
rep(`  if(G){G.solids=G.solids||[];G.solids.push({x:x,z:z,r:2.8});}   // v33 地标碰撞体`,
`  if(G){G.solids=G.solids||[];G.solids.push({x:x,z:z,r:2.8});}   // v33 地标碰撞体
  const coreRing=new THREE.Mesh(new THREE.TorusGeometry(1.15,.06,8,26),new THREE.MeshBasicMaterial({color:0x7fffd4,transparent:true,opacity:.75,fog:false}));coreRing.position.y=3.2;g.add(coreRing);g.userData.coreRing=coreRing;
  const coreOrb=new THREE.Mesh(new THREE.SphereGeometry(.4,10,8),new THREE.MeshBasicMaterial({color:0xd8fff0,fog:false}));coreOrb.position.y=3.2;g.add(coreOrb);g.userData.coreOrb=coreOrb;   // v34 地标能量核心`, "M3 landmark");

/* M4：环境鱼群（lowQ 关闭；渲染函数，钩子在特效批统一接入） */
rep(`/* v34 M1：族谱生物纹理——Canvas 程序化灰阶斑纹（map 与材质色相乘，保留族色） */`,
`/* v34 M4 环境鱼群：2 群 × 10 尾 InstancedMesh 沿椭圆绕玩家巡游（lowQ 关闭） */
let fishSchools=null;
function tickFish(dt){
  if(!G||G.state!==S.PLAYING||lowQ)return;
  if(!fishSchools){
    fishSchools=[];
    const geo=new THREE.ConeGeometry(.06,.3,4),mat=new THREE.MeshBasicMaterial({color:0x8fd8c8,transparent:true,opacity:.6,fog:false});
    for(let s2=0;s2<2;s2++){
      const mesh=new THREE.InstancedMesh(geo,mat,10);mesh.frustumCulled=false;scene.add(mesh);
      fishSchools.push({mesh:mesh,phase:s2*Math.PI,rx:14+s2*7,rz:10+s2*5,spd:.25+s2*.12,y:2.5+s2*1.6});
    }
  }
  const dm=new THREE.Matrix4(),qq=new THREE.Quaternion(),eu=new THREE.Euler(),sv=new THREE.Vector3(1,1,1),pv=new THREE.Vector3();
  for(const sch of fishSchools){
    const t2=(G.time||0)*sch.spd+sch.phase;
    for(let i=0;i<10;i++){
      const a=t2+i/10*Math.PI*2;
      const x=player.x+Math.cos(a)*sch.rx,z=player.z+Math.sin(a)*sch.rz;
      const y=Math.max(terrainHeight(x,z)+1.2,sch.y+Math.sin(t2*2+i)*.8);
      pv.set(x,y,z);eu.set(0,-a+Math.PI/2,0);qq.setFromEuler(eu);
      dm.compose(pv,qq,sv);sch.mesh.setMatrixAt(i,dm);
    }
    sch.mesh.instanceMatrix.needsUpdate=true;
  }
}
/* v34 M1：族谱生物纹理——Canvas 程序化灰阶斑纹（map 与材质色相乘，保留族色） */`, "M4 fish");

fs.writeFileSync(F, html);
console.log(F, "applied:", applied);
if (failed.length) { console.log("FAILED:"); failed.forEach(f => console.log("  " + f)); }
