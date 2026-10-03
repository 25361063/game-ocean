// v34-F 特效批：F1 元素附着光环 / F2 死亡溶解 / F3 水下氛围 / F4 暴击火花 / F5 枪口焰升级 + 全部钩子（两版同步）
const fs = require("fs");
const F = process.argv[2] === "mobile" ? "潮声之下_深渊潜航3D_手机版.html" : "潮声之下_深渊潜航3D_v22.html";
let html = fs.readFileSync(F, "utf8");
let applied = 0, failed = [];
function rep(find, replace, tag) {
  const n = html.split(find).length - 1;
  if (n !== 1) { failed.push(tag + " (出现 " + n + " 次)"); return; }
  html = html.replace(find, replace); applied++;
}

/* F1：元素附着光环（怪物网格懒创建子环，随 aura.e 变色旋转呼吸） */
rep(`      mm.rotation.y+=yawDiff*Math.min(1,dt*(m.type==="dart"?8:4.5));`,
`      mm.rotation.y+=yawDiff*Math.min(1,dt*(m.type==="dart"?8:4.5));
      if(m.aura){   // v34 F1 元素附着光环
        let ar=mm.userData.auraRing;
        if(!ar){ar=new THREE.Mesh(auraRingGeo,auraRingMat.clone());ar.rotation.x=-Math.PI/2;ar.position.y=-.55;mm.add(ar);mm.userData.auraRing=ar;}
        ar.visible=true;ar.material.color.setHex((ELEM_INFO[m.aura.e]||ELEM_INFO.tide).color);
        ar.rotation.z+=dt*2.2;ar.scale.setScalar(1+.08*Math.sin(G.time*5));
      } else if(mm.userData.auraRing){mm.userData.auraRing.visible=false;}`, "F1 aura");
rep(`const wardAuraGeo=new THREE.SphereGeometry(1.35,12,8);`,
`/* v34 F1 元素附着光环资源 */
const auraRingGeo=new THREE.TorusGeometry(1.05,.05,6,24);
const auraRingMat=new THREE.MeshBasicMaterial({color:0x5fe0ff,transparent:true,opacity:.5,depthWrite:false,blending:THREE.AdditiveBlending,fog:false});
keepRes(auraRingGeo,auraRingMat);
const wardAuraGeo=new THREE.SphereGeometry(1.35,12,8);`, "F1 resources");

/* F2：死亡溶解（按死者最后元素色爆粒子 + 溶解环，叠加既有下沉淡出） */
rep(`      if(m.hp<=0){
        if(m.deathT===undefined)m.deathT=.5;`,
`      if(m.hp<=0){
        if(m.deathT===undefined){m.deathT=.5;   // v34 F2 死亡溶解演出
          const dc=(m.lastElem&&ELEM_INFO[m.lastElem])?ELEM_INFO[m.lastElem].color:0x9fe8ff;
          burstParticle(m.x,terrainHeight(m.x,m.z)+1,m.z,dc,10);
          spawnEchoRing(m.x,terrainHeight(m.x,m.z)+.6,m.z,dc,1.6);
        }`, "F2 dissolve");
rep(`  const isNew=!aura || aura.t<=0;
  m.aura={e:elem,t:6};`,
`  const isNew=!aura || aura.t<=0;
  m.aura={e:elem,t:6};m.lastElem=elem;   // v34 F2 记录最后元素（死亡溶解用）`, "F2 lastElem");

/* F3：水下氛围（悬浮微粒 / 体积光柱 / 呼吸气泡） */
rep(`    tickGamepad(dt);   // v31 手柄`,
`    tickGamepad(dt);   // v31 手柄
    tickFish(dt);   // v34 M4 环境鱼群
    tickAmbient(dt);   // v34 F3 水下氛围`, "F3 hooks");
rep(`/* v34 M4 环境鱼群：2 群 × 10 尾 InstancedMesh 沿椭圆绕玩家巡游（lowQ 关闭） */`,
`/* v34 F3 水下氛围：悬浮微粒 Points + 体积光柱 + 呼吸气泡（lowQ 减量） */
let ambientPack=null,bubbleT=0;
function tickAmbient(dt){
  if(!G||G.state!==S.PLAYING)return;
  const count=lowQ?50:150;
  if(!ambientPack){
    const geo=new THREE.BufferGeometry(),pos=new Float32Array(count*3);
    for(let i=0;i<count;i++){pos[i*3]=(Math.random()-.5)*56;pos[i*3+1]=Math.random()*16+1;pos[i*3+2]=(Math.random()-.5)*56;}
    geo.setAttribute("position",new THREE.BufferAttribute(pos,3));
    const mat=new THREE.PointsMaterial({color:0xbfe8e0,size:.09,transparent:true,opacity:.5,depthWrite:false,blending:THREE.AdditiveBlending,fog:false});
    const pts=new THREE.Points(geo,mat);pts.frustumCulled=false;scene.add(pts);
    const rays=new THREE.Group();
    const rMat=new THREE.MeshBasicMaterial({color:0x9fe8e0,transparent:true,opacity:.045,depthWrite:false,blending:THREE.AdditiveBlending,fog:false,side:THREE.DoubleSide});
    for(let i=0;i<(lowQ?3:6);i++){
      const ray=new THREE.Mesh(new THREE.PlaneGeometry(2.2,16),rMat);
      const a=i/(lowQ?3:6)*Math.PI*2;
      ray.position.set(Math.cos(a)*22,8,Math.sin(a)*22);
      ray.rotation.y=a+Math.PI/2;ray.rotation.z=.12*Math.sin(i*3);
      rays.add(ray);
    }
    scene.add(rays);
    ambientPack={pts:pts,pos:pos,rays:rays};
  }
  const ap=ambientPack,pos=ap.pos,attr=ap.pts.geometry.attributes.position;
  for(let i=0;i<count;i++){
    pos[i*3+1]+=dt*.25;pos[i*3]+=Math.sin(G.time*.6+i)*dt*.12;
    if(pos[i*3+1]>17)pos[i*3+1]=1;
    const wx=pos[i*3]+player.x,wz=pos[i*3+2]+player.z;
    if(wx-player.x>28)pos[i*3]-=56;else if(wx-player.x<-28)pos[i*3]+=56;
    if(wz-player.z>28)pos[i*3+2]-=56;else if(wz-player.z<-28)pos[i*3+2]+=56;
  }
  attr.needsUpdate=true;
  ap.pts.position.set(player.x,0,player.z);
  ap.rays.position.set(player.x,0,player.z);
  ap.rays.rotation.y+=dt*.02;
  bubbleT-=dt;
  if(bubbleT<=0){bubbleT=1.2;burstParticle(player.x,player.y+.6,player.z,0xbfe8e0,2);}
}
/* v34 M4 环境鱼群：2 群 × 10 尾 InstancedMesh 沿椭圆绕玩家巡游（lowQ 关闭） */`, "F3 ambient");

/* F4：暴击微型扩散环 */
rep(`    if(e.crit)sound("crit"); }`,
`    if(e.crit){sound("crit");spawnEchoRing(e.mx,terrainHeight(e.mx,e.mz)+1.2,e.mz,0xffd66b,.85);} }`, "F4 crit ring");

/* F5：枪口焰升级（白青扩散环 + 第二段粒子） */
rep(`function muzzleFlash(){
  toolEmitter.getWorldPosition(_muzzleVec);
  burstParticle(_muzzleVec.x,_muzzleVec.y,_muzzleVec.z,0x7fffd4,5);
  muzzleT=.09;
}`,
`function muzzleFlash(){
  toolEmitter.getWorldPosition(_muzzleVec);
  burstParticle(_muzzleVec.x,_muzzleVec.y,_muzzleVec.z,0x7fffd4,5);
  burstParticle(_muzzleVec.x,_muzzleVec.y,_muzzleVec.z,0xd8fff0,3);
  spawnEchoRing(_muzzleVec.x,_muzzleVec.y,_muzzleVec.z,0xd8fff0,.5);
  muzzleT=.09;
}`, "F5 muzzle");

fs.writeFileSync(F, html);
console.log(F, "applied:", applied);
if (failed.length) { console.log("FAILED:"); failed.forEach(f => console.log("  " + f)); }
