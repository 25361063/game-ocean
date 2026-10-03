// v31 补丁：第二期（养成/遗章/深井）+ 第三期（兴趣点/昼夜风暴/演出）+ 第四期（音乐/手柄/照片模式）
const fs = require("fs");
const F = process.argv[2] === "mobile" ? "潮声之下_深渊潜航3D_手机版.html" : "潮声之下_深渊潜航3D_v22.html";
let html = fs.readFileSync(F, "utf8");
let applied = 0, failed = [];
function rep(find, replace, tag) {
  const n = html.split(find).length - 1;
  if (n !== 1) { failed.push(tag + " (出现 " + n + " 次)"); return; }
  html = html.replace(find, replace); applied++;
}
function repAll(find, replace, tag, min) {
  const n = html.split(find).length - 1;
  if (n < (min || 1)) { failed.push(tag + " (出现 " + n + " 次)"); return; }
  html = html.split(find).join(replace); applied++;
}

/* ===== 第二期 · 养成与终局 ===== */
rep(`const META_DEFAULT={currency:0,totalKills:0,bestStreak:0,continues:0,upgrades:{hull:0,lungs:0,salvage:0},unlocks:{reroll:false,scanner:false,lifePod:false},bestiary:{},achievements:{firstBlood:false,streak10:false,deepDive:false,reborn:false,builder:false}};`,
`const META_DEFAULT={currency:0,crystals:0,characters:{},relics:[],relicEquip:{},wellBest:0,totalKills:0,bestStreak:0,continues:0,upgrades:{hull:0,lungs:0,salvage:0},unlocks:{reroll:false,scanner:false,lifePod:false},bestiary:{},achievements:{firstBlood:false,streak10:false,deepDive:false,reborn:false,builder:false}};   // v31 养成/遗章/深井`, "R1 meta");

rep(`let shopGridEl=null;`,
`/* ===== v31 养成系统：角色等级/突破/天赋 + 髓能结晶 ===== */
function charState(roleId){
  meta.characters=meta.characters||{};
  if(!meta.characters[roleId])meta.characters[roleId]={level:1,exp:0,broken:0,talents:[1,1,1]};
  return meta.characters[roleId];
}
function charExpNeed(level){return 60+level*30;}
function gainCharExp(n){
  if(!G)return;
  const ch=charState(G.roleId);
  ch.exp+=n;
  let up=false;
  while(ch.exp>=charExpNeed(ch.level)&&ch.level<ch.broken*20+20){ch.exp-=charExpNeed(ch.level);ch.level++;up=true;}
  if(ch.level>=ch.broken*20+20)ch.exp=Math.min(ch.exp,charExpNeed(ch.level)-1);
  if(up){toast("角色升级 · "+((DIVER_ROLES[G.roleId]||DIVER_ROLES.explorer).shortName||"")+" Lv"+ch.level);if(ch.level%20===0)toast("已达突破等级 · 主页-养成可突破");saveMeta();}
}
function grantCrystal(n,why){meta.crystals=(meta.crystals||0)+n;saveMeta();if(why)toast("髓能结晶 +"+n+" · "+why);}
function charBreakthrough(){
  const ch=charState(runSelection.roleId);
  if(ch.broken>=2){toast("已达最高突破");return;}
  if(ch.level<ch.broken*20+20){toast("需先升到 Lv"+(ch.broken*20+20));return;}
  const cost=[40,100,200][ch.broken]||200;
  if((meta.crystals||0)<cost){toast("结晶不足 · 需要 "+cost);return;}
  meta.crystals-=cost;ch.broken++;saveMeta();
  toast("突破成功 · 等级上限提升至 "+(ch.broken*20+20));renderGrowTab();
}
function talentUp(slot){
  const ch=charState(runSelection.roleId);
  if(ch.talents[slot]>=5){toast("天赋已满级");return;}
  const cost=12*ch.talents[slot];
  if((meta.crystals||0)<cost){toast("结晶不足 · 需要 "+cost);return;}
  meta.crystals-=cost;ch.talents[slot]++;saveMeta();
  toast("天赋强化 · Lv"+ch.talents[slot]);renderGrowTab();
}
/* ===== v31 深潜遗章：5 槽圣遗物（主词条 + 4 随机副词条） ===== */
const RELIC_SLOTS=["suit","fin","lens","core","emblem"];
const RELIC_SLOT_NAMES={suit:"潜服",fin:"鳍片",lens:"镜片",core:"核心",emblem:"舱徽"};
const RELIC_MAIN={suit:{k:"hpPct",v:[8,12,16]},fin:{k:"dmgPct",v:[6,9,12]},lens:{k:"crit",v:[5,8,12]},core:{k:"cool",v:[6,9,12]},emblem:{k:"gold",v:[10,16,22]}};
const RELIC_SUB_POOL=[{k:"hp",n:"生命",v:[15,30,50]},{k:"dmgPct",n:"伤害",v:[2,3.5,5]},{k:"crit",n:"暴击",v:[1.5,2.5,4]},{k:"critDmg",n:"暴伤",v:[5,9,14]},{k:"cool",n:"冷却",v:[1.5,2.5,4]},{k:"move",n:"移速",v:[1.5,2.5,4]},{k:"gold",n:"金币",v:[3,6,9]},{k:"shield",n:"护幕",v:[3,6,10]}];
const RELIC_RARITY=[{name:"普通",color:"#6fa8ff",crystal:4},{name:"稀有",color:"#b48cff",crystal:10},{name:"史诗",color:"#ffd66b",crystal:20}];
function rollRelic(bonus){
  const slot=RELIC_SLOTS[(Math.random()*5)|0];
  const roll=Math.random()*100-(bonus||0);
  const rarity=roll<12?2:roll<44?1:0;
  const main=RELIC_MAIN[slot];
  const subs=[];const pool=RELIC_SUB_POOL.slice();
  for(let i=0;i<4;i++){const p2=pool.splice((Math.random()*pool.length)|0,1)[0];subs.push({k:p2.k,n:p2.n,v:+(p2.v[rarity]*(0.75+Math.random()*.5)).toFixed(1)});}
  const rel={id:"r"+Date.now()+"_"+((Math.random()*1e5)|0),slot,rarity,main:{k:main.k,v:main.v[rarity]},subs};
  meta.relics=meta.relics||[];
  if(meta.relics.length>=60)meta.relics.shift();
  meta.relics.push(rel);saveMeta();
  return rel;
}
let wellRun=null;
function startWell(){
  if(G&&G.state===S.PLAYING)return;
  wellRun={wave:0,stars:0,waveStart:0};
  try{initAudio();}catch(e2){}
  startGame();
  toast("回响深井 · 12 层限时挑战");
}
let shopGridEl=null;`, "R2 char/relic/well core");

/* R3：养成数值与遗章词条接入 applyEquipStats */
rep(`  g.equipMulti=multi;g.equipPierce=pierce;g.equipHome=home;g.equipBlast=blast;g.equipElemAlt=elemAlt;g.equipElem=elemInj;`,
`  g.equipMulti=multi;g.equipPierce=pierce;g.equipHome=home;g.equipBlast=blast;g.equipElemAlt=elemAlt;g.equipElem=elemInj;
  /* v31 角色养成 + 遗章词条 */
  const ch=meta.characters?meta.characters[g.roleId]:null;
  const lv=ch?ch.level:1,brk=ch?ch.broken:0;
  const rq=meta.relicEquip||{};
  let hpPctR=0,dmgPctR=0,critR=0,coolR=0,moveR=0,goldR=0,critDmgR=0,shR=0,hpFlatR=0;
  for(const slot of RELIC_SLOTS){
    const rid2=rq[slot];if(!rid2)continue;
    const rel=(meta.relics||[]).find(r=>r.id===rid2);if(!rel)continue;
    for(const st of [rel.main].concat(rel.subs||[])){
      if(st.k==="hpPct")hpPctR+=st.v;else if(st.k==="dmgPct")dmgPctR+=st.v;else if(st.k==="crit")critR+=st.v;
      else if(st.k==="cool")coolR+=st.v;else if(st.k==="move")moveR+=st.v;else if(st.k==="gold")goldR+=st.v;
      else if(st.k==="critDmg")critDmgR+=st.v;else if(st.k==="shield")shR+=st.v;else if(st.k==="hp")hpFlatR+=st.v;
    }
  }
  g.maxHp=Math.round(g.maxHp*(1+hpPctR/100))+(lv-1)*2+brk*40+hpFlatR;
  g.damageMul=g.damageMul*(1+dmgPctR/100)+(lv-1)*.006+brk*.06;
  g.critBonus+=critR/100;g.weaponCoolMul*=1-Math.min(.6,coolR/100);
  g.moveMul*=1+moveR/100;g.goldMul*=1+goldR/100;g.critDmg=critDmgR/100;g.shieldDurationMul+=shR/100;`, "R3 apply");

repAll(`(crit?2:1)`, `(crit?2+(G.critDmg||0):1)`, "R3 critDmg crit", 4);
repAll(`(crit2?2:1)`, `(crit2?2+(G.critDmg||0):1)`, "R3 critDmg crit2", 2);

/* R4：天赋倍率（技能冷却/威力） */
rep(`  if(G.skillCd&&G.skillCd[slot]>0){toast(sk.name+" 冷却中 · "+Math.ceil(G.skillCd[slot])+"s");return;}
  if(!sk.cast())return;
  G.skillCd=G.skillCd||[0,0,0];G.skillCd[slot]=sk.cool;`,
`  if(G.skillCd&&G.skillCd[slot]>0){toast(sk.name+" 冷却中 · "+Math.ceil(G.skillCd[slot])+"s");return;}
  const tl=(meta.characters&&meta.characters[G.roleId]&&meta.characters[G.roleId].talents)||[1,1,1];
  G.skillPow=1+.06*((tl[slot]||1)-1);G.skillCool=1-.04*((tl[slot]||1)-1);   // v31 天赋
  if(!sk.cast())return;
  G.skillCd=G.skillCd||[0,0,0];G.skillCd[slot]=sk.cool*G.skillCool;`, "R4 talent cd");
repAll(`const dealt=damageAmount(dmgBase*1.6*`, `const dealt=damageAmount(dmgBase*(G.skillPow||1)*1.6*`, "R4 skill pow", 4);

/* R5：结晶/经验掉落 + 深井词缀伤害 */
rep(`grantCurrency(isBoss?8:1,isBoss?"巨兽赏金":"击杀回收");unlockAchievement("firstBlood");`,
`grantCurrency(isBoss?8:1,isBoss?"巨兽赏金":"击杀回收");unlockAchievement("firstBlood");
  gainCharExp(1);
  if(isBoss)grantCrystal(25,"巨兽核心");else if(Math.random()<.06)grantCrystal(1,"结晶析出");   // v31 养成掉落`, "R5 drops");
rep(`function playerHit(dmg, chain){
  if((G.phaseT||0)>0)return false;   // v28 相位撤离：虚化免疫`,
`function playerHit(dmg, chain){
  if((G.phaseT||0)>0)return false;   // v28 相位撤离：虚化免疫
  dmg=dmg*((G.wellAffix&&G.wellAffix.dmg)||1);   // v31 深井词缀`, "R5 playerHit");
rep(`  G.hp=Math.min(G.maxHp,G.hp+1.5+runBuild.killHeal+(G.killHealEquip||0)+(isBoss?8:0));`,
`  G.hp=Math.min(G.maxHp,G.hp+(1.5+runBuild.killHeal+(G.killHealEquip||0)+(isBoss?8:0))*((G.wellAffix&&G.wellAffix.heal)||1));   // v31 深井词缀`, "R5 heal affix");
rep(`function grantGold(n,why){if(!G)return;const g2=Math.round(n*((G.goldMul||1)));`,
`function grantGold(n,why){if(!G)return;const g2=Math.round(n*((G.goldMul||1))*((G.wellAffix&&G.wellAffix.gold)||1));`, "R5 gold affix");
rep(`  const injected=G.equipElem||null;   // v30 元素注入器（优先级高于阴阳弹匣）`,
`  if(G&&G.stormDmg)0;   // v31 风暴加成经 damageAmount 全局生效
  const injected=G.equipElem||null;   // v30 元素注入器（优先级高于阴阳弹匣）`, "R5 noop anchor");

/* R6：回响深井（无尽规则 + 词缀 + 掉落 + 12 层） */
rep(`  g.modeId=runSelection.modeId;g.roleId=runSelection.roleId;g.runStartLevel=runSelection.level;`,
`  g.modeId=(wellRun?"endless":runSelection.modeId);g.roleId=runSelection.roleId;g.runStartLevel=runSelection.level;   // v31 深井=无尽规则`, "R6 mode");
rep(`  const wave=G.endless.pendingWave;G.endless.pendingWave=0;prepareEndlessWave(wave,true);`,
`  const wave=G.endless.pendingWave;G.endless.pendingWave=0;
  if(wellRun){wellRun.wave=wave;wellRun.waveStart=G.time;
    const AFF=[{k:"hp",v:1.25,t:"敌群强化 · 生命 +25%"},{k:"dmg",v:1.2,t:"敌群强化 · 伤害 +20%"},{k:"heal",v:.5,t:"削弱 · 击杀回复 -50%"},{k:"gold",v:1.5,t:"赏金 · 金币 +50%"}];
    const a1=AFF[wave%AFF.length],a2=AFF[(wave*2+1)%AFF.length];
    G.wellAffix={hp:(a1.k==="hp"?a1.v:(a2.k==="hp"?a2.v:1)),dmg:(a1.k==="dmg"?a1.v:1)*(a2.k==="dmg"?a2.v:1),heal:(a1.k==="heal"?a1.v:1)*(a2.k==="heal"?a2.v:1),gold:(a1.k==="gold"?a1.v:1)*(a2.k==="gold"?a2.v:1)};
    showTransmission("回响深井 · 第 "+wave+" 层",a1.t+(a2.t!==a1.t?" / "+a2.t:""),3400);
  }
  prepareEndlessWave(wave,true);`, "R6 affix");
rep(`grantGold(150,"第 "+wave+" 波奖励");`,
`grantGold(150,"第 "+wave+" 波奖励");
  if(wellRun){
    const dtw=(G.time||0)-(wellRun.waveStart||0);
    wellRun.stars+=dtw<40+wave*4?3:dtw<60+wave*6?2:1;
    if(wave%3===0){const rel=newRelicRoll(wellRun.wave);if(rel)toast("深井掉落 · "+RELIC_RARITY[rel.rarity].name+" "+RELIC_SLOT_NAMES[rel.slot]);grantCrystal(6,"深井供给");}
    if(wave>=12){const total=wellRun.stars;meta.wellBest=Math.max(meta.wellBest||0,12);wellRun=null;G.wellAffix=null;toast("回响深井通关 · 累计 ★"+total);setOver(true);return;}
  }`, "R6 rewards");

/* R7：每日挑战掉落遗章 */
rep(`if(dailyActive&&G){dailyActive=false;meta.daily=meta.daily||{day:DAILY_KEY,score:0};if((G.score||0)>(meta.daily.score||0))meta.daily.score=G.score||0;saveMeta();unlockAchievement("daily1");refreshDailyBtn();}`,
`if(dailyActive&&G){dailyActive=false;meta.daily=meta.daily||{day:DAILY_KEY,score:0};if((G.score||0)>(meta.daily.score||0))meta.daily.score=G.score||0;const drel=newRelicRoll(8);if(drel)toast("每日挑战掉落 · "+RELIC_SLOT_NAMES[drel.slot]+" 遗章");saveMeta();unlockAchievement("daily1");refreshDailyBtn();}`, "R7 daily drop");
rep(`  const od=document.getElementById("overDetail");
      if(od){`,
`  if(wellRun){meta.wellBest=Math.max(meta.wellBest||0,wellRun.wave||0);wellRun=null;G&&(G.wellAffix=null);saveMeta();}
      const od=document.getElementById("overDetail");
      if(od){`, "R7 well settle");

/* ===== 第三期 ===== */
/* P1：兴趣点（宝箱舱 / 信标解谜 / 裂缝挑战） */
rep(`  /* v25 铁雨：轨道碎片弹着点，红圈预警后轰击，落点持续追踪玩家 */`,
`  /* v31 兴趣点：宝箱舱 / 信标解谜（3 座全激活）/ 深渊裂缝挑战 */
  for(let i=0;i<2;i++){const a2=lv*2.6+i*3.3,r2=20+(i%2)*9,x2=Math.cos(a2)*r2,z2=Math.sin(a2)*r2;
    const g3=new THREE.Group();
    g3.add(new THREE.Mesh(new THREE.BoxGeometry(1.1,.7,.7),new THREE.MeshStandardMaterial({color:0x8a6a2f,metalness:.5,roughness:.4,emissive:0x3a2a08,emissiveIntensity:.5})));
    const lid=new THREE.Mesh(new THREE.BoxGeometry(1.14,.16,.74),new THREE.MeshBasicMaterial({color:0xffd66b,fog:false}));lid.position.y=.45;g3.add(lid);
    add(g3,{kind:"chest",x:x2,z:z2,r:2.4,opened:false,phase:i});}
  if(lv%2===1)for(let i=0;i<3;i++){const a2=lv*1.4+i*2.1,r2=15+(i%3)*8,x2=Math.cos(a2)*r2,z2=Math.sin(a2)*r2;
    const g3=new THREE.Group();g3.add(new THREE.Mesh(new THREE.CylinderGeometry(.34,.5,2.2,7),new THREE.MeshStandardMaterial({color:0x2c4a52,metalness:.6,roughness:.3})));
    const orb=new THREE.Mesh(new THREE.SphereGeometry(.26,8,6),new THREE.MeshBasicMaterial({color:0x7fd0ff,fog:false}));orb.position.y=1.5;g3.add(orb);
    add(g3,{kind:"beacon",x:x2,z:z2,r:2.4,idx:i,gid:Math.floor(lv/2),lit:false,orb:orb});}
  if(lv>=5){const a2=lv*3.1,r2=23,x2=Math.cos(a2)*r2,z2=Math.sin(a2)*r2;
    const g3=new THREE.Group();const ring3=new THREE.Mesh(new THREE.RingGeometry(3.2,3.7,30),new THREE.MeshBasicMaterial({color:0xff5573,transparent:true,opacity:.5,side:THREE.DoubleSide,depthWrite:false,fog:false}));ring3.rotation.x=-Math.PI/2;ring3.position.y=.18;g3.add(ring3);
    const shard=new THREE.Mesh(new THREE.OctahedronGeometry(.5,0),new THREE.MeshBasicMaterial({color:0xff8da0,fog:false}));shard.position.y=1.2;g3.add(shard);
    add(g3,{kind:"rift",x:x2,z:z2,r:3.6,started:false,phase:lv});}
  /* v25 铁雨：轨道碎片弹着点，红圈预警后轰击，落点持续追踪玩家 */`, "P1 poi build");
rep(`    else if(it.kind==="gift"){`,
`    else if(it.kind==="chest"&&!it.opened&&Math.hypot(player.x-it.x,player.z-it.z)<it.r){it.opened=true;grantGold(120+(G.level||1)*4,"宝箱舱");G.ammo=Math.min(AMMO_MAX,(G.ammo||0)+2);grantCrystal(1,"宝箱");if(it.mesh&&it.mesh.children[1])it.mesh.children[1].visible=false;burstParticle(it.x,terrainHeight(it.x,it.z)+1,it.z,0xffd66b,16);}
    else if(it.kind==="beacon"&&!it.lit&&Math.hypot(player.x-it.x,player.z-it.z)<it.r){it.lit=true;if(it.orb)it.orb.material.color.setHex(0xffe9a8);sound("pickup");
      const sets2=(G.beaconSets=G.beaconSets||{});const st2=sets2[it.gid]=sets2[it.gid]||{n:0};
      st2.n++;toast("信标激活 "+st2.n+"/3");
      if(st2.n>=3){grantGold(300,"信标解谜");grantCrystal(3,"解谜完成");}}
    else if(it.kind==="rift"&&!it.started&&Math.hypot(player.x-it.x,player.z-it.z)<it.r){it.started=true;toast("裂缝挑战 · 90 秒清剿！");
      G.rift={t:90,spawned:false};
      const n3=4+Math.floor((G.level||1)/12);
      for(let si6=0;si6<n3;si6++){const aa=Math.random()*Math.PI*2,rr2=3+Math.random()*4;spawnRiftMonster(it.x+Math.cos(aa)*rr2,it.z+Math.sin(aa)*rr2);}
      G.rift.spawned=true;
    }
    else if(it.kind==="gift"){`, "P1 poi tick");
rep(`/* v31：技能特效衰减 + 轰炸落点 + 增益计时 */`,
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
/* v31：技能特效衰减 + 轰炸落点 + 增益计时 */`, "P1 spawnRiftMonster");
rep(`  if(G.phaseT>0)G.phaseT-=dt;
  if(G.adrenalineT>0)G.adrenalineT-=dt;
}`,
`  if(G.phaseT>0)G.phaseT-=dt;
  if(G.adrenalineT>0)G.adrenalineT-=dt;
  if(G.rift){
    G.rift.t-=dt;
    const left2=(G.monsters||[]).filter(m3=>m3.rift&&m3.hp>0).length;
    if(left2===0){grantGold(250,"裂缝清剿");grantCrystal(3,"裂缝清剿");G.rift=null;}
    else if(G.rift.t<=0){G.rift=null;toast("裂缝挑战超时 · 敌群散去");}
  }
}`, "P1 rift tick");

/* P2：昼夜呼吸 + 粒子风暴 */
rep(`renderer.toneMappingExposure=1.02*(sig.exp||1);`,
`G.expBase=1.02*(sig.exp||1);G.fogFarBase=scene.fog.far;renderer.toneMappingExposure=G.expBase;   // v31 昼夜/风暴基准`, "P2 exp base");
rep(`function damageAmount(v){return Math.max(.25,Math.round(v*100)/100);}`,
`function damageAmount(v){return Math.max(.25,Math.round(v*((G&&G.stormDmg)||1)*100)/100);}   // v31 风暴全局伤害`, "P2 storm dmg");
rep(`    tickRunRewards(dt);
    tickSkillFx(dt);   // v28 技能特效与计时`,
`    tickRunRewards(dt);
    tickSkillFx(dt);   // v28 技能特效与计时
    tickAtmosphere(dt);   // v31 昼夜/风暴
    tickGamepad(dt);   // v31 手柄`, "P2 loop hooks");
rep(`/* v31 裂缝挑战刷怪（运行时生成：逻辑对象 + 渲染网格） */`,
`/* v31 昼夜呼吸 + 粒子风暴（每 150s 一轮明暗；风暴 22s：视野压缩 + 全伤害 +12%） */
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
/* v31 裂缝挑战刷怪（运行时生成：逻辑对象 + 渲染网格） */`, "P2 atmosphere");

/* P3：剧情演出（打字机 + 立绘徽章） */
rep(`<div class="story-speaker" id="storySpeaker">首领档案室</div>`,
`<div class="story-speaker" id="storySpeaker">首领档案室</div><div id="storyAvatar" aria-hidden="true"></div>`, "P3 avatar html");
rep(`  #storyOverlay .panel{position:relative;`,
`  #storyAvatar{position:absolute;right:26px;top:22px;width:64px;height:64px;border-radius:50%;border:2px solid var(--acc);box-shadow:0 0 18px rgba(95,224,176,.35);background:radial-gradient(circle at 35% 30%,#1a3a44,#0a141d 70%);text-align:center;line-height:60px;color:var(--acc2);font-size:26px;overflow:hidden;}
  #storyOverlay .panel{position:relative;`, "P3 avatar css");
rep(`storyBodyEl.textContent=p.body||"";`,
`storyBodyEl.textContent="";
  const AVATAR_COLORS={"浣生":"#5fe0b0","迈尔辛":"#6fa8ff","帕米尔":"#ff8a72","书记官":"#d9c08a","大船":"#7fd0ff","笛雾":"#b48cff","洛克":"#9fe8ff","提欧":"#ff7fb2","荒凉":"#8a7fff"};
  const storyAvatarEl=document.getElementById("storyAvatar");
  if(storyAvatarEl){const acol=AVATAR_COLORS[p.speaker]||"#7fa9a2";storyAvatarEl.style.borderColor=acol;storyAvatarEl.style.color=acol;storyAvatarEl.textContent=(p.speaker||"?").slice(0,1);}
  const bodyText=p.body||"";
  let ti=0;
  if(window.__storyTypeTimer)clearInterval(window.__storyTypeTimer);
  storyBodyEl.onclick=()=>{if(window.__storyTypeTimer){clearInterval(window.__storyTypeTimer);window.__storyTypeTimer=null;storyBodyEl.textContent=bodyText;}};
  window.__storyTypeTimer=setInterval(()=>{ti+=2;storyBodyEl.textContent=bodyText.slice(0,ti);if(ti>=bodyText.length){clearInterval(window.__storyTypeTimer);window.__storyTypeTimer=null;}},24);`, "P3 typewriter");

/* ===== 第四期 ===== */
/* M1：分层动态音乐 */
rep(`function initAudio(){ try{ if(!ac) ac = new (window.AudioContext||window.webkitAudioContext)(); if(ac.state==="suspended") ac.resume(); }catch(e){ ac=null; } }`,
`function initAudio(){ try{ if(!ac) ac = new (window.AudioContext||window.webkitAudioContext)(); if(ac.state==="suspended") ac.resume(); }catch(e){ ac=null; } }
/* v31 分层动态音乐：探索/战斗/巨兽三段程序化 loop（2s 小节，按战场状态切换） */
const MUSIC={bar:0};
function musicNote(freq,t,dur,type,gain){
  if(!ac||settings.mute)return;
  try{const o=ac.createOscillator(),g2=ac.createGain();o.type=type||"sine";o.frequency.value=freq;
    g2.gain.setValueAtTime(0,t);g2.gain.linearRampToValueAtTime(gain||.05,t+.05);g2.gain.exponentialRampToValueAtTime(.001,t+dur);
    o.connect(g2).connect(ac.destination);o.start(t);o.stop(t+dur+.05);}catch(err){}
}
function musicTick(){
  if(!ac||settings.mute||!G||G.state!==S.PLAYING)return;
  const combat=(G.time-(G.lastCombatT||-9)<4)||(G.monsters||[]).some(m=>m.hp>0&&Math.hypot(m.x-player.x,m.z-player.z)<14);
  const boss=G.boss&&G.boss.hp>0;
  const t=ac.currentTime+.05,bar=MUSIC.bar++%4;
  const scale=[220,261.6,293.7,329.6,392,440];
  if(boss){musicNote(scale[bar%3]*.5,t,.5,"sawtooth",.05);musicNote(scale[(bar+2)%6]*2,t+.25,.3,"square",.028);}
  else if(combat){musicNote(scale[bar%6],t,.35,"triangle",.05);if(bar%2)musicNote(scale[(bar+3)%6]*.5,t,.4,"sine",.04);}
  else{musicNote(scale[bar]*.5,t,1.6,"sine",.03);musicNote(scale[(bar+2)%6]*.5,t+.8,1.4,"sine",.024);}
}
setInterval(()=>{try{musicTick();}catch(e){}},2000);`, "M1 music");
rep(`  grantCurrency(isBoss?8:1,isBoss?"巨兽赏金":"击杀回收");unlockAchievement("firstBlood");`,
`  G.lastCombatT=G.time;
  grantCurrency(isBoss?8:1,isBoss?"巨兽赏金":"击杀回收");unlockAchievement("firstBlood");`, "M1 combat tag");

/* M2：手柄 */
rep(`    if(act.pause){ setPaused(true); }`,
`    if(act.pause||gpPauseEdge){gpPauseEdge=false;setPaused(true);}`, "M2 pause");
rep(`  const act = input.getActions();`,
`  const act = input.getActions();
  if(G&&G.gpMove){act.move.x+=G.gpMove.x;act.move.z+=G.gpMove.z;}   // v31 手柄左摇杆
  if(gpPulse){act.pulse=true;}   // v31 手柄普攻
  if(GP.jumpHeld){act.jump=true;}`, "M2 act merge");
rep(`  if(act.jump && player.onGround){ player.vy = 5.4; player.onGround = false; }
  if(act.jump && !player.onGround && player.vy < 2.2) player.vy += 9*dt;   // v24.22 水下推进器：按住空格持续上浮`,
`  if((act.jump||GP.jumpLatch) && player.onGround){ player.vy = 5.4; player.onGround = false; GP.jumpLatch=false; }   // v31 手柄跳跃
  if((act.jump||GP.jumpHeld) && !player.onGround && player.vy < 2.2) player.vy += 9*dt;   // v24.22 水下推进器：按住空格持续上浮`, "M2 jump");
rep(`/* v31 昼夜呼吸 + 粒子风暴（每 150s 一轮明暗；风暴 22s：视野压缩 + 全伤害 +12%） */`,
`/* v31 手柄支持（Gamepad API）：左摇杆移动 / 右摇杆视角 / A 攻击 / B,X,Y 技能 / RB 闪现 / LB 跳跃 / Start 暂停 / Select 商店 */
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
/* v31 昼夜呼吸 + 粒子风暴（每 150s 一轮明暗；风暴 22s：视野压缩 + 全伤害 +12%） */`, "M2 gamepad");

/* M3：照片模式 */
rep(`  if(e.code==="KeyB"&&G&&!e.repeat&&G.state!==S.OVER)toggleEquipShop();`,
`  if(e.code==="KeyP"&&G&&!e.repeat&&G.state===S.PLAYING&&!photoMode){enterPhoto();return;}
  if(e.code==="KeyP"&&!e.repeat&&photoMode){exitPhoto();return;}
  if(photoMode){
    if(e.code==="ArrowLeft")photo.yaw+=.18;
    else if(e.code==="ArrowRight")photo.yaw-=.18;
    else if(e.code==="ArrowUp")photo.pitch=Math.min(1.2,photo.pitch+.1);
    else if(e.code==="ArrowDown")photo.pitch=Math.max(-.6,photo.pitch-.1);
    else if(e.code==="BracketRight"){photoFilter=(photoFilter+1)%4;applyPhotoFilter();}
    else if(e.code==="BracketLeft"){photo.dist=Math.max(2.5,Math.min(14,photo.dist+(e.shiftKey?1:-1)));}
    return;
  }
  if(e.code==="KeyB"&&G&&!e.repeat&&G.state!==S.OVER)toggleEquipShop();`, "M3 photo keys");
rep(`  if(POST.enabled)renderPost();else renderer.render(scene, camera);`,
`  if(photoMode)photoCam(dt);   // v31 照片模式自由相机
  if(POST.enabled)renderPost();else renderer.render(scene, camera);`, "M3 photo cam");
rep(`/* v31 手柄支持（Gamepad API）：左摇杆移动 / 右摇杆视角 / A 攻击 / B,X,Y 技能 / RB 闪现 / LB 跳跃 / Start 暂停 / Select 商店 */`,
`/* v31 照片模式：P 进入（时停+自由相机），方向键运镜，[ 距离，] 滤镜，P 退出 */
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
/* v31 手柄支持（Gamepad API）：左摇杆移动 / 右摇杆视角 / A 攻击 / B,X,Y 技能 / RB 闪现 / LB 跳跃 / Start 暂停 / Select 商店 */`, "M3 photo impl");
rep(`  #storyOverlay .panel{position:relative;`,
`  body.photo #hud,body.photo .run-build-strip,body.photo #minimapWrap,body.photo #cross{opacity:.05!important;}
  #storyOverlay .panel{position:relative;`, "M3 photo css");

fs.writeFileSync(F, html);
console.log(F, "applied:", applied);
if (failed.length) { console.log("FAILED:"); failed.forEach(f => console.log("  " + f)); }
