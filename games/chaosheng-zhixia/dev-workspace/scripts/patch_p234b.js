// v31b 补丁：修复 8 处失配（锚点为长行中段/多行块）
const fs = require("fs");
const F = process.argv[2] === "mobile" ? "潮声之下_深渊潜航3D_手机版.html" : "潮声之下_深渊潜航3D_v22.html";
let html = fs.readFileSync(F, "utf8");
let applied = 0, failed = [];
function rep(find, replace, tag) {
  const n = html.split(find).length - 1;
  if (n !== 1) { failed.push(tag + " (出现 " + n + " 次)"); return; }
  html = html.replace(find, replace); applied++;
}

/* F1：击杀回复吃深井词缀（长行中段锚点） */
rep(`G.hp=Math.min(G.maxHp,G.hp+1.5+runBuild.killHeal+(G.killHealEquip||0)+(isBoss?8:0));`,
`G.hp=Math.min(G.maxHp,G.hp+(1.5+runBuild.killHeal+(G.killHealEquip||0)+(isBoss?8:0))*((G.wellAffix&&G.wellAffix.heal)||1));`, "F1 heal");

/* F2：深井词缀（无缩进锚点） */
rep(`const wave=G.endless.pendingWave;G.endless.pendingWave=0;prepareEndlessWave(wave,true);`,
`const wave=G.endless.pendingWave;G.endless.pendingWave=0;
  if(wellRun){wellRun.wave=wave;wellRun.waveStart=G.time||0;
    const AFF=[{k:"hp",v:1.25,t:"敌群强化 · 生命 +25%"},{k:"dmg",v:1.2,t:"敌群强化 · 伤害 +20%"},{k:"heal",v:.5,t:"削弱 · 击杀回复 -50%"},{k:"gold",v:1.5,t:"赏金 · 金币 +50%"}];
    const a1=AFF[wave%AFF.length],a2=AFF[(wave*2+1)%AFF.length];
    G.wellAffix={hp:(a1.k==="hp"?a1.v:(a2.k==="hp"?a2.v:1)),dmg:(a1.k==="dmg"?a1.v:1)*(a2.k==="dmg"?a2.v:1),heal:(a1.k==="heal"?a1.v:1)*(a2.k==="heal"?a2.v:1),gold:(a1.k==="gold"?a1.v:1)*(a2.k==="gold"?a2.v:1)};
    showTransmission("回响深井 · 第 "+wave+" 层",a1.t+(a2.t!==a1.t?" / "+a2.t:""),3400);
  }
  prepareEndlessWave(wave,true);`, "F2 affix");

/* F3：每日挑战掉落遗章（多行块锚点） */
rep(`      saveMeta();
      unlockAchievement("daily1");
      refreshDailyBtn();
    }`,
`      saveMeta();
      unlockAchievement("daily1");
      refreshDailyBtn();
      const drel=newRelicRoll(8);if(drel)toast("每日挑战掉落 · "+RELIC_SLOT_NAMES[drel.slot]+" 遗章");
    }`, "F3 daily");

/* F4：战斗标记（音乐层切换用） */
rep(`grantCurrency(isBoss?8:1,isBoss?"巨兽赏金":"击杀回收");unlockAchievement("firstBlood");`,
`G.lastCombatT=G.time||0;grantCurrency(isBoss?8:1,isBoss?"巨兽赏金":"击杀回收");unlockAchievement("firstBlood");`, "F4 combat tag");

/* F5：裂缝刷怪 + 大气 + 手柄 + 照片（级联锚点修正：v28 注释为真实锚） */
rep(`/* v28：技能特效衰减 + 轰炸落点 + 增益计时 */`,
`/* v31 裂缝挑战刷怪（运行时生成：逻辑对象 + 渲染网格） */
function spawnRiftMonster(x,z){
  const types=["gray","dart","spitter","gray"];
  const type=types[(Math.random()*types.length)|0],t=MONSTER_TYPES[type]||MONSTER_TYPES.gray;
  const hp=Math.max(1,Math.ceil((t.hp||3)*1.2));
  const m={type,x:Math.round(x),z:Math.round(z),hp:hp,maxHp:hp,cd:0,phase:Math.random()*6.28,score:t.score||20,base:{x:Math.round(x),z:Math.round(z)},rift:true};
  G.monsters.push(m);
  if(typeof spawnMonsterMeshAt==="function")spawnMonsterMeshAt(m);
  return m;
}
/* v31 昼夜呼吸 + 粒子风暴（每 150s 一轮明暗；风暴 22s：视野压缩 + 全伤害 +12%） */
let stormFxT=0;
function tickAtmosphere(dt){
  if(!G||G.state!==S.PLAYING)return;
  const dayF=.84+.16*Math.sin((G.time||0)*Math.PI*2/150);
  if(G.expBase)renderer.toneMappingExposure=G.expBase*dayF*(G.stormT>0?.94:1);
  if(G.fogFarBase&&scene.fog)scene.fog.far=G.fogFarBase*(G.stormT>0?.6:1);
  if(G.stormT>0){
    G.stormT-=dt;G.stormDmg=1.12;
    stormFxT-=dt;
    if(stormFxT<=0){stormFxT=.25;burstParticle(player.x+(Math.random()-.5)*10,player.y+1+Math.random()*2,player.z+(Math.random()-.5)*10,0x9fc8ff,2);}
  } else {
    G.stormDmg=1;
    G.stormCd=(G.stormCd===undefined?60+Math.random()*60:G.stormCd)-dt;
    if(G.stormCd<=0){G.stormT=22;G.stormCd=95+Math.random()*60;toast("粒子风暴 · 全伤害 +12%");showTransmission("深渊气象","粒子风暴来袭：能见度骤降，所有伤害提升 12%。",3600);}
  }
}
/* v31 手柄支持（Gamepad API）：左摇杆移动 / 右摇杆视角 / A 攻击 / B,X,Y 技能 / RB 闪现 / LB 跳跃 / Start 暂停 / Select 商店 */
let gpPulse=false,gpPauseEdge=false;
const GP={prev:{},jumpHeld:false,jumpLatch:false};
function tickGamepad(dt){
  let gps=null;
  try{gps=navigator.getGamepads?navigator.getGamepads():null;}catch(e){}
  const gp=gps&&gps[0];if(!gp)return;
  const ax=gp.axes||[];
  const dz=v=>Math.abs(v)>.18?v:0;
  if(G)G.gpMove={x:dz(ax[0]||0),z:dz(ax[1]||0)};
  const bp=i=>!!(gp.buttons[i]&&gp.buttons[i].pressed);
  const edge=i=>{const p=bp(i);const e2=p&&!GP.prev[i];GP.prev[i]=p;return e2;};
  gpPulse=bp(0)||bp(7);
  GP.jumpHeld=bp(4);if(edge(4))GP.jumpLatch=true;
  if(edge(1))skillQueued[0]=true;
  if(edge(2))skillQueued[1]=true;
  if(edge(3))skillQueued[2]=true;
  if(edge(5))dashQueued=true;
  if(edge(8))toggleEquipShop();
  if(edge(9))gpPauseEdge=true;
  if(!photoMode&&G&&G.state===S.PLAYING){
    player.yaw-=dz(ax[2]||0)*dt*2.6;
    player.pitch=Math.max(-1.2,Math.min(1.2,(player.pitch||0)-dz(ax[3]||0)*dt*2));
  }
}
/* v31 照片模式：P 进入（时停+自由相机），方向键运镜，[ 距离，] 滤镜，P 退出 */
let photoMode=false,photo={yaw:0,dist:6,pitch:.35},photoFilter=0,photoPrevExp=null;
function applyPhotoFilter(){
  const presets=[{exp:1.02,b:.55},{exp:1.3,b:1.25},{exp:.72,b:0},{exp:1.1,b:.9}];
  const p3=presets[photoFilter];
  if(G)G.expBase=p3.exp;
  renderer.toneMappingExposure=p3.exp;
  if(typeof postCompMat!=="undefined"&&postCompMat)postCompMat.uniforms.uStrength.value=p3.b;
  toast("滤镜 "+(photoFilter+1)+"/4");
}
function enterPhoto(){
  if(!G)return;
  photoMode=true;photo.yaw=player.yaw+Math.PI;photo.dist=6;photo.pitch=.35;photoPrevExp=renderer.toneMappingExposure;
  G.prevState=G.state;G.state=S.PAUSED;document.body.classList.add("photo");
  input.setEnabled(false);try{if(document.pointerLockElement)document.exitPointerLock();}catch(e){}
  toast("照片模式 · 方向键运镜 · [ 距离 · ] 滤镜 · P 退出");
}
function exitPhoto(){
  photoMode=false;document.body.classList.remove("photo");
  if(G){G.state=G.prevState||S.PLAYING;}
  if(photoPrevExp!==null)renderer.toneMappingExposure=photoPrevExp;
  input.setEnabled(true);input.reset();
}
function photoCam(dt){
  const cx=player.x+Math.sin(photo.yaw)*Math.cos(photo.pitch)*photo.dist;
  const cz=player.z+Math.cos(photo.yaw)*Math.cos(photo.pitch)*photo.dist;
  const cy=Math.max(terrainHeight(cx,cz)+.4,player.y+Math.sin(photo.pitch)*photo.dist);
  camera.position.set(cx,cy,cz);
  camera.lookAt(player.x,player.y,player.z);
}
/* v28：技能特效衰减 + 轰炸落点 + 增益计时 */`, "F5 cascade");

fs.writeFileSync(F, html);
console.log(F, "applied:", applied);
if (failed.length) { console.log("FAILED:"); failed.forEach(f => console.log("  " + f)); }
