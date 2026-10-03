// v28a 补丁：角色专属武器 + 每角色三主动技 + 装备弹道机制
const fs = require("fs");
const F = "潮声之下_深渊潜航3D_v22.html";
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

/* A1：武器表 → 角色专属（远程/范围/近战） */
rep(`const WEAPONS = {
  1:{ name:"声呐脉冲", dmg:1, cool:0.45, speed:24, life:1.0, knock:1.2, hitR:1.6, bossR:2.4 },
  2:{ name:"渊棘之矛", dmg:3, cool:1.5,  speed:40, life:1.0, knock:0.8, hitR:1.6, bossR:2.4, ammoMax:6 },
  3:{ name:"深渊回响", dmg:2, cool:3.0,  radius:7, knock:3.0 }
};`,
`const WEAPONS = {
  1:{ name:"磁轨脉冲", dmg:1.6, cool:0.42, speed:34, life:1.35, knock:1.0, hitR:1.6, bossR:2.4 },   // 浣生 · 远程点射
  2:{ name:"渊棘之矛", dmg:3, cool:1.5,  speed:40, life:1.0, knock:0.8, hitR:1.6, bossR:2.4, ammoMax:6 },
  3:{ name:"榴弹回响", dmg:2.2, cool:0.9,  speed:18, life:1.25, knock:2.4, hitR:1.6, bossR:2.4, blast:2.8 },   // 帕米尔 · 范围（命中爆裂）
  4:{ name:"裂甲重锤", dmg:2.6, cool:0.55, radius:3.4, halfAngle:1.05, knock:2.6, melee:true }   // 迈尔辛 · 近战扇击
};
const ROLE_WEAPON={explorer:1,guardian:4,hunter:3};   // v28：每角色仅一把专属武器`, "A1 weapons");

/* A2：近战元素 */
rep(`const ELEM_OF_WEAPON={1:"tide",2:"corrode",3:"quake"};`,
`const ELEM_OF_WEAPON={1:"tide",2:"corrode",3:"quake",4:"corrode"};`, "A2 elem");

/* A3：fireWeapon 重写（近战分支 + 装备弹道字段） */
rep(`function fireWeapon(wid, px, py, pz, dx, dy, dz){
  if(!G || G.state!==S.PLAYING) return null;
  const w = WEAPONS[wid];
  if(!w) return null;
  if((G.cool[wid]||0) > 0) return null;           // 各武器独立冷却
  if(wid === 2){
    if((G.ammo||0) <= 0) return null;             // 渊棘空弹（槽位置灰 + 提示由 UI 层处理）
    G.ammo--;                                     // 发射成功弹药 -1
  }
  G.cool[wid] = w.cool*(G.weaponCoolMul||1);
  if(wid === 1) G.pulseCool = G.cool[wid];         // 兼容别名同步（pulseCool ≡ cool[1]）
  notePlayerAttack();                             // CSD-SOUL1-P2：攻击热度/计数（贪刀+诱骗判定）
  if(wid === 3) return castEcho(px, py, pz);      // R3：施放即结算，不产生飞行弹丸`,
`function fireWeapon(wid, px, py, pz, dx, dy, dz, yawArg){
  if(!G || G.state!==S.PLAYING) return null;
  const w = WEAPONS[wid];
  if(!w) return null;
  if((G.cool[wid]||0) > 0) return null;           // 各武器独立冷却
  if(wid === 2){
    if((G.ammo||0) <= 0) return null;             // 渊棘空弹（槽位置灰 + 提示由 UI 层处理）
    G.ammo--;                                     // 发射成功弹药 -1
  }
  G.cool[wid] = w.cool*(G.weaponCoolMul||1)*((G.adrenalineT>0)?.55:1);   // v28：肾上腺素射速狂热
  if(wid === 1) G.pulseCool = G.cool[wid];         // 兼容别名同步（pulseCool ≡ cool[1]）
  notePlayerAttack();                             // CSD-SOUL1-P2：攻击热度/计数（贪刀+诱骗判定）
  const yaw=(yawArg!==undefined)?yawArg:Math.atan2(dx||.001,dz||.001);
  if(w.melee){                                    // v28：近战扇击（迈尔辛）——瞬时扇形判定，不产生弹丸
    return meleeCone(px, py, pz, yaw, w.radius, w.halfAngle, w.dmg, w.knock, wid);
  }`, "A3 fireWeapon head");

/* A3b：fireWeapon 返回体（装备弹道：多弹道由调用层展开；贯穿/追踪/爆裂/元素变奏随弹丸携带） */
rep(`  return { wid, x:px, y:py, z:pz,
           vx:dx/len*w.speed*(wid===2?(runBuild.thornSpeed||1):1), vy:dy/len*w.speed, vz:dz/len*w.speed*(wid===2?(runBuild.thornSpeed||1):1),
           life:w.life,r:.35,dmg:damageAmount(w.dmg*1.6*(G.damageMul||1)*(1+contextual+close+bossBonus)*((G.overdrive||0)>0?1.75:1)*(G.perfectDodge>0?1.6:1)),knock:w.knock,
           exempt:spawnExemptObstacles(px, pz, 0.35) };   // CSD-H2：出生重叠豁免
}`,
`  G.shotCount=(G.shotCount||0)+1;
  const altElem=(G.equipElemAlt&&(G.shotCount%2===0))?"corrode":null;   // 阴阳弹匣：隔发蚀元素 → 稳定触发元素反应
  return { wid, x:px, y:py, z:pz,
           vx:dx/len*w.speed*(wid===2?(runBuild.thornSpeed||1):1), vy:dy/len*w.speed, vz:dz/len*w.speed*(wid===2?(runBuild.thornSpeed||1):1),
           life:w.life,r:.35,dmg:damageAmount(w.dmg*1.6*(G.damageMul||1)*(1+contextual+close+bossBonus)*((G.overdrive||0)>0?1.75:1)*(G.perfectDodge>0?1.6:1)),knock:w.knock,
           blast:w.blast||(G.equipBlast?2.6:undefined),
           pierceLeft:((G.equipPierce||0)+((wid===1&&runBuild.sonarPierce)?99:0))||undefined,
           home:(G.equipHome||0)||undefined,
           elem:altElem||undefined,
           hitList:[],
           exempt:spawnExemptObstacles(px, pz, 0.35) };   // CSD-H2：出生重叠豁免
}`, "A3b fireWeapon return");

/* A4：fireCharged（近战蓄力崩地斩 + wid3 蓄力榴弹） */
rep(`function fireCharged(wid, px, py, pz, dx, dy, dz){
  if(!G || G.state!==S.PLAYING){chargeReady=false;return;}
  if(!w || wid===3) return null;`.replace("{chargeReady=false;return;}","{return;}"),
`function fireCharged(wid, px, py, pz, dx, dy, dz, yawArg){
  if(!G || G.state!==S.PLAYING) return null;
  const w = WEAPONS[wid];
  if(!w) return null;`, "A4 charge head (fallback)");
if (failed.length && failed[failed.length-1].startsWith("A4")) {
  // 实际文本不含 chargeReady，回退到直接匹配
  failed.pop();
  rep(`function fireCharged(wid, px, py, pz, dx, dy, dz){
  if(!G || G.state!==S.PLAYING) return null;
  const w = WEAPONS[wid];
  if(!w || wid===3) return null;`,
`function fireCharged(wid, px, py, pz, dx, dy, dz, yawArg){
  if(!G || G.state!==S.PLAYING) return null;
  const w = WEAPONS[wid];
  if(!w) return null;`, "A4 charge head");
}
rep(`  G.cool[wid] = Math.max((G.cool[wid]||0), .35);
  if(wid === 1) G.pulseCool = G.cool[wid];
  notePlayerAttack();
  const len = Math.hypot(dx, dy, dz) || 1;
  const contextual=(runBuild && ((runBuild.lowOxyRage&&G.oxygen/G.maxOxygen<.3)?runBuild.lowOxyRage:0)+((runBuild&&runBuild.lowHpRage&&G.hp/G.maxHp<.35)?runBuild.lowHpRage:0));
  const close=(G.monsters||[]).some(m=>m.hp>0&&Math.hypot(m.x-px,m.z-pz)<5)?(runBuild.closeDamage||0):0;
  const bossBonus=(G.boss&&G.boss.hp>0)?(runBuild.bossDamage||0):0;
  return { wid, x:px, y:py, z:pz,
           vx:dx/len*w.speed*1.15, vy:dy/len*w.speed*1.15, vz:dz/len*w.speed*1.15,
           life:w.life+.25, r:.55, charge:true, knock:2.2,`,
`  G.cool[wid] = Math.max((G.cool[wid]||0), .35)*((G.adrenalineT>0)?.55:1);
  if(wid === 1) G.pulseCool = G.cool[wid];
  notePlayerAttack();
  if(w.melee){                                    // v28：近战蓄力 = 崩地重斩（扇形 ×1.35，伤害 ×2）
    return meleeCone(px, py, pz, (yawArg!==undefined)?yawArg:Math.atan2(dx||.001,dz||.001), w.radius*1.35, w.halfAngle+.35, w.dmg*2, w.knock*1.2, wid);
  }
  const len = Math.hypot(dx, dy, dz) || 1;
  const contextual=(runBuild && ((runBuild.lowOxyRage&&G.oxygen/G.maxOxygen<.3)?runBuild.lowOxyRage:0)+((runBuild&&runBuild.lowHpRage&&G.hp/G.maxHp<.35)?runBuild.lowHpRage:0));
  const close=(G.monsters||[]).some(m=>m.hp>0&&Math.hypot(m.x-px,m.z-pz)<5)?(runBuild.closeDamage||0):0;
  const bossBonus=(G.boss&&G.boss.hp>0)?(runBuild.bossDamage||0):0;
  return { wid, x:px, y:py, z:pz,
           vx:dx/len*w.speed*1.15, vy:dy/len*w.speed*1.15, vz:dz/len*w.speed*1.15,
           life:w.life+.25, r:.55, charge:true, knock:2.2, blast:w.blast?w.blast*1.2:undefined, hitList:[],`, "A4 charge body");

/* A5：meleeCone / ringBurst / lineBurst 原语（插在武器切换注释前） */
rep(`/* 武器切换（设计 §5.4）：切到 1-3，零惩罚（不重置冷却、不损失弹药）；`,
`/* v28：近战扇击（迈尔辛专属武器）——以玩家为圆心的扇形瞬时判定，镜像 castEcho 结算 */
function meleeCone(px, py, pz, yaw, radius, halfAngle, dmgBase, knock, wid){
  const hits=[];
  if(!G) return hits;
  for(const m of G.monsters){
    if(m.hp<=0||m.evade) continue;
    const d=Math.hypot(m.x-px,m.z-pz);
    if(d>radius) continue;
    let ad=Math.atan2(m.x-px,m.z-pz)-yaw;while(ad>Math.PI)ad-=2*Math.PI;while(ad<-Math.PI)ad+=2*Math.PI;
    if(Math.abs(ad)>halfAngle) continue;
    const gm=guardMult(m),wm=consumeWard(m);
    const crit=Math.random()<.12+(G.critBonus||0);
    const dealt=damageAmount(dmgBase*1.6*(G.damageMul||1)*((G.overdrive||0)>0?1.75:1)*gm.dmg*wm*(crit?2:1)*(.88+Math.random()*.24));
    G.dmgByWid=G.dmgByWid||{};G.dmgByWid[wid]=(G.dmgByWid[wid]||0)+dealt;
    let diedInReaction=false;
    {const aliveBefore=m.hp>0;applyElementHit(m,ELEM_OF_WEAPON[wid],hits);diedInReaction=aliveBefore&&m.hp<=0;}
    m.hp-=dealt;m.cd=Math.max(m.cd,hitStaggerCd(m));interruptDart(m);
    const broke=applyPoiseHit(m,wid,gm.poise);if(!broke)interruptMove(m);
    if(!(m.break&&m.break.t>0)&&gm.dmg>=1){m.x+=(m.x-px)/(d||1)*knock;m.z+=(m.z-pz)/(d||1)*knock;}
    if(gm.dmg<1)hits.push({type:"guarded",mx:m.x,mz:m.z,wid});
    if(wm<1)hits.push({type:"warded",mx:m.x,mz:m.z,wid});
    hits.push({type:"hit",mx:m.x,mz:m.z,wid,dmg:dealt,crit});
    if(m.hp<=0&&!diedInReaction){if(m.type==="acid"){G.enemyHazards=G.enemyHazards||[];G.enemyHazards.push({kind:"acidPool",x:m.x,z:m.z,r:3.6,life:7,max:7,dmg:8,tick:0,tickRate:.8});}noteKill(m);hits.push({type:"kill",mx:m.x,mz:m.z,wid,target:m.type,dmg:dealt,crit});}
  }
  if(G.boss&&G.boss.hp>0&&(G.level===undefined||baseObjectiveMet())){
    const d=Math.hypot(G.boss.x-px,G.boss.z-pz);
    if(d<radius+1.6){
      const gm=guardMult(G.boss),crit2=Math.random()<.12+(G.critBonus||0);
      const dealt=damageAmount(dmgBase*1.6*(G.damageMul||1)*((G.overdrive||0)>0?1.75:1)*gm.dmg*(crit2?2:1)*(.88+Math.random()*.24));
      G.boss.hp-=dealt;if(G.boss.poise)applyPoiseHit(G.boss,wid,gm.poise);
      hits.push({type:"boss",bx:G.boss.x,bz:G.boss.z,wid,dmg:dealt,crit:crit2});
      if(G.boss.hp<=0){noteKill(G.boss,{countKill:false});hits.push({type:"bossKill",bx:G.boss.x,bz:G.boss.z,wid});}
    }
  }
  return hits;
}
/* v28：技能伤害原语——环形 AOE（重锤/轰炸/爆裂）与直线贯穿（磁轨贯日） */
function ringBurst(px,pz,radius,dmgBase,knock,wid){
  const hits=[];if(!G)return hits;
  for(const m of G.monsters){
    if(m.hp<=0||m.evade)continue;
    const d=Math.hypot(m.x-px,m.z-pz);if(d>radius)continue;
    const gm=guardMult(m);const crit=Math.random()<.12+(G.critBonus||0);
    const dealt=damageAmount(dmgBase*1.6*(G.damageMul||1)*((G.overdrive||0)>0?1.75:1)*gm.dmg*(crit?2:1)*(.88+Math.random()*.24));
    m.hp-=dealt;m.cd=Math.max(m.cd,hitStaggerCd(m));interruptDart(m);
    if(!(m.break&&m.break.t>0)&&gm.dmg>=1){m.x+=(m.x-px)/(d||1)*knock;m.z+=(m.z-pz)/(d||1)*knock;}
    hits.push({type:"hit",mx:m.x,mz:m.z,wid,dmg:dealt,crit});
    if(m.hp<=0){noteKill(m);hits.push({type:"kill",mx:m.x,mz:m.z,wid,target:m.type,dmg:dealt,crit});}
  }
  if(G.boss&&G.boss.hp>0&&(G.level===undefined||baseObjectiveMet())){
    const d=Math.hypot(G.boss.x-px,G.boss.z-pz);
    if(d<radius+1.6){
      const dealt=damageAmount(dmgBase*1.6*(G.damageMul||1)*((G.overdrive||0)>0?1.75:1));
      G.boss.hp-=dealt;hits.push({type:"boss",bx:G.boss.x,bz:G.boss.z,wid,dmg:dealt});
      if(G.boss.hp<=0){noteKill(G.boss,{countKill:false});hits.push({type:"bossKill",bx:G.boss.x,bz:G.boss.z,wid});}
    }
  }
  return hits;
}
function lineBurst(px,pz,yaw,length,width,dmgBase,wid){
  const hits=[];if(!G)return hits;
  for(const m of G.monsters){
    if(m.hp<=0||m.evade)continue;
    const dx2=m.x-px,dz2=m.z-pz;
    const along=dx2*Math.sin(yaw)+dz2*Math.cos(yaw);
    if(along<0||along>length)continue;
    const perp=Math.abs(dx2*Math.cos(yaw)-dz2*Math.sin(yaw));
    if(perp>width)continue;
    const crit=Math.random()<.12+(G.critBonus||0);
    const dealt=damageAmount(dmgBase*1.6*(G.damageMul||1)*((G.overdrive||0)>0?1.75:1)*(crit?2:1)*(.88+Math.random()*.24));
    m.hp-=dealt;m.cd=Math.max(m.cd,hitStaggerCd(m));interruptDart(m);
    hits.push({type:"hit",mx:m.x,mz:m.z,wid,dmg:dealt,crit});
    if(m.hp<=0){noteKill(m);hits.push({type:"kill",mx:m.x,mz:m.z,wid,target:m.type,dmg:dealt,crit});}
  }
  if(G.boss&&G.boss.hp>0&&(G.level===undefined||baseObjectiveMet())){
    const dx2=G.boss.x-px,dz2=G.boss.z-pz;
    const along=dx2*Math.sin(yaw)+dz2*Math.cos(yaw);
    const perp=Math.abs(dx2*Math.cos(yaw)-dz2*Math.sin(yaw));
    if(along>0&&along<length&&perp<width+1.2){
      const dealt=damageAmount(dmgBase*1.6*(G.damageMul||1)*((G.overdrive||0)>0?1.75:1));
      G.boss.hp-=dealt;hits.push({type:"boss",bx:G.boss.x,bz:G.boss.z,wid,dmg:dealt});
      if(G.boss.hp<=0){noteKill(G.boss,{countKill:false});hits.push({type:"bossKill",bx:G.boss.x,bz:G.boss.z,wid});}
    }
  }
  return hits;
}
/* 武器切换（设计 §5.4）：切到 1-3，零惩罚（不重置冷却、不损失弹药）；`, "A5 melee/ring/line");

/* A6：tickPulses —— 追踪转向 + 贯穿消费 + 爆裂弹头 + 标记加伤 */
rep(`    const p = pulses[i];
    p.x += p.vx*dt; p.y += p.vy*dt; p.z += p.vz*dt; p.life -= dt;
    let consumed = false;`,
`    const p = pulses[i];
    p.x += p.vx*dt; p.y += p.vy*dt; p.z += p.vz*dt; p.life -= dt;
    let consumed = false;
    if(p.home){                                     // v28 狩猎浮标：子弹制导（9 米内最近敌人）
      let bm=null,bd=9;
      for(const hm of G.monsters){if(hm.hp<=0)continue;const hd=Math.hypot(hm.x-p.x,hm.z-p.z);if(hd<bd){bd=hd;bm=hm;}}
      if(bm){const sp=Math.hypot(p.vx,p.vz)||1;const na=Math.atan2(bm.x-p.x,bm.z-p.z);const ca=Math.atan2(p.vx,p.vz);
        let da=na-ca;while(da>Math.PI)da-=2*Math.PI;while(da<-Math.PI)da+=2*Math.PI;
        const wa=ca+da*Math.min(1,dt*4);p.vx=Math.sin(wa)*sp;p.vz=Math.cos(wa)*sp;}
    }`, "A6 homing");
repAll(`applyElementHit(m, ELEM_OF_WEAPON[p.wid], hits);`,
`applyElementHit(m, (p.elem||ELEM_OF_WEAPON[p.wid]), hits);`, "A6 elem monster", 2);
rep(`applyElementHit(G.boss, ELEM_OF_WEAPON[p.wid], hits);`,
`applyElementHit(G.boss, (p.elem||ELEM_OF_WEAPON[p.wid]), hits);`, "A6 elem boss");
rep(`      if(m.hp<=0) continue;
      if(m.evade) continue;   // CSD-SOUL1-P2：闪避 i-frame（弹丸穿透，AOE 不可避）
      const d = Math.sqrt((m.x-p.x)**2+(m.z-p.z)**2);`,
`      if(m.hp<=0) continue;
      if(m.evade) continue;   // CSD-SOUL1-P2：闪避 i-frame（弹丸穿透，AOE 不可避）
      if(p.hitList&&p.hitList.indexOf(m)>=0) continue;   // v28 贯穿：同一目标只结算一次
      const d = Math.sqrt((m.x-p.x)**2+(m.z-p.z)**2);`, "A6 pierce skip");
rep(`        const crit=Math.random()<.12+(G.critBonus||0);
        const dealt=damageAmount(dmg*gm.dmg*wm*breakBonus*markBonus*((m.rust&&m.rust.t>0)?1.25:1)*(crit?2:1)*(.88+Math.random()*.24));`,
`        const crit=Math.random()<.12+(G.critBonus||0);
        const dealt=damageAmount(dmg*gm.dmg*wm*breakBonus*markBonus*((m.rust&&m.rust.t>0)?1.25:1)*((m.marked>0)?1.5:1)*(crit?2:1)*(.88+Math.random()*.24));   // v28 弱点标记 +50%`, "A6 marked");
rep(`        const pierce=(p.wid===1&&runBuild.sonarPierce&&!p.pierced)||(p.wid===2&&p.charge);if(pierce)p.pierced=true;else{PULSES_REMOVED.push(p);pulses.splice(i,1);consumed=true;}
        break;`,
`        if(p.blast&&!p.blasted){   // v28 震荡弹头：命中爆裂（60% 溅射）
          p.blasted=true;
          for(const sm2 of G.monsters){
            if(sm2===m||sm2.hp<=0||sm2.evade)continue;
            const sd2=Math.sqrt((sm2.x-p.x)**2+(sm2.z-p.z)**2);
            if(sd2<p.blast){
              const bdmg=damageAmount(dealt*.6);
              sm2.hp-=bdmg;sm2.cd=Math.max(sm2.cd,hitStaggerCd(sm2));
              if(sm2.hp<=0){noteKill(sm2);hits.push({type:"kill",mx:sm2.x,mz:sm2.z,wid:p.wid||1,target:sm2.type,dmg:bdmg});}
              else hits.push({type:"hit",mx:sm2.x,mz:sm2.z,wid:p.wid||1,dmg:bdmg,splash:true});
            }
          }
          hits.push({type:"blastFx",x:p.x,y:p.y,z:p.z,r:p.blast});
        }
        const pass=(p.pierceLeft!==undefined&&p.pierceLeft>0)||(p.wid===2&&p.charge);
        if(pass){
          if(p.pierceLeft!==undefined)p.pierceLeft--;
          (p.hitList=p.hitList||[]).push(m);
        }else{PULSES_REMOVED.push(p);pulses.splice(i,1);consumed=true;}
        break;`, "A6 pierce/blast");

/* A7：G 初始化（专属武器 + 技能冷却 + cool 表补 4） */
rep(`      weapon:1, ammo:AMMO_START, cool:{1:0, 2:0, 3:0},
      level:levelCfg.id, objective:Object.assign({},levelCfg.objective), boost,`,
`      weapon:1, ammo:AMMO_START, cool:{1:0, 2:0, 3:0, 4:0}, skillCd:[0,0,0], adrenalineT:0, phaseT:0, marked:0,
      level:levelCfg.id, objective:Object.assign({},levelCfg.objective), boost,`, "A7 init1");
rep(`    weapon:1, ammo:AMMO_START, cool:{1:0, 2:0, 3:0}, boost,`,
`    weapon:1, ammo:AMMO_START, cool:{1:0, 2:0, 3:0, 4:0}, skillCd:[0,0,0], adrenalineT:0, phaseT:0, boost,`, "A7 init2");
rep(`  g.critBase=.12;`,
`  g.critBase=.12;
  g.weapon=ROLE_WEAPON[g.roleId]||1;g.cool=g.cool||{};g.cool[4]=0;g.skillCd=[0,0,0];g.adrenalineT=0;g.phaseT=0;   // v28 角色专属武器`, "A7 profile");

/* A8：applyEquipStats 增加弹道机制字段 */
rep(`  let dmg=1,hp=0,mv=1,cool=1,crit=0,od=1,shD=1,shC=1,dash=1,echo=0,poise=1,heal=0,gold=1;
  for(const id of (g.equip||[])){
    const it=EQUIPMENT.find(x=>x.id===id);if(!it)continue;const s=it.s;
    dmg+=s.dmg||0;hp+=s.hp||0;mv+=s.mv||0;cool*=1-(s.cool||0);crit+=s.crit||0;od+=s.od||0;
    shD+=s.shD||0;shC*=1-(s.shC||0);dash*=1-(s.dash||0);echo+=s.echo||0;poise+=s.poise||0;heal+=s.heal||0;gold+=s.gold||0;
  }`,
`  let dmg=1,hp=0,mv=1,cool=1,crit=0,od=1,shD=1,shC=1,dash=1,echo=0,poise=1,heal=0,gold=1;
  let multi=0,pierce=0,home=0,blast=0,elemAlt=0;
  for(const id of (g.equip||[])){
    const it=EQUIPMENT.find(x=>x.id===id);if(!it)continue;const s=it.s;
    dmg+=s.dmg||0;hp+=s.hp||0;mv+=s.mv||0;cool*=1-(s.cool||0);crit+=s.crit||0;od+=s.od||0;
    shD+=s.shD||0;shC*=1-(s.shC||0);dash*=1-(s.dash||0);echo+=s.echo||0;poise+=s.poise||0;heal+=s.heal||0;gold+=s.gold||0;
    multi+=s.multi||0;pierce+=s.pierce||0;home+=s.home||0;blast+=s.blast||0;elemAlt+=s.elemAlt||0;
  }
  g.equipMulti=multi;g.equipPierce=pierce;g.equipHome=home;g.equipBlast=blast;g.equipElemAlt=elemAlt;`, "A8 equip stats");

/* A9：EQUIPMENT 追加五件特效装备（唯一） */
rep(`  {id:"abyssDip",name:"深渊之浸",cost:3900,desc:"伤害 +12% · 移速 +10% · 击杀回复 6",s:{dmg:.12,mv:.10,heal:6}}
];`,
`  {id:"abyssDip",name:"深渊之浸",cost:3900,desc:"伤害 +12% · 移速 +10% · 击杀回复 6",s:{dmg:.12,mv:.10,heal:6}},
  {id:"splitMag",name:"分裂弹匣",cost:4800,desc:"弹道 +1：每次射击多射出一发（两侧扇展）",s:{multi:1},u:1},
  {id:"pierceHead",name:"贯穿弹头",cost:5200,desc:"子弹穿透 +2 名敌人，不因命中消失",s:{pierce:2},u:1},
  {id:"hunterBuoy",name:"狩猎浮标",cost:4500,desc:"子弹制导：自动转向 9 米内最近敌人",s:{home:1},u:1},
  {id:"yinYang",name:"阴阳弹匣",cost:5000,desc:"子弹变奏：隔发附带蚀元素，稳定触发元素反应",s:{elemAlt:1},u:1},
  {id:"shockHead",name:"震荡弹头",cost:5500,desc:"子弹命中后爆裂：2.6 米范围 60% 溅射",s:{blast:1},u:1}
];`, "A9 equip items");

/* A10：buyEquip 唯一校验 */
rep(`function buyEquip(it){if(!G||!it)return;if((G.equip||[]).length>=EQUIP_SLOTS){toast("装备栏已满 · 请先出售");return};`.replace(";{",";{"),
`function buyEquip(it){if(!G||!it)return;if((G.equip||[]).length>=EQUIP_SLOTS){toast("装备栏已满 · 请先出售");return;}if(it.u&&(G.equip||[]).indexOf(it.id)>=0){toast("唯一装备 · 已持有");return;}`, "A10 buy unique");
if (failed.length && failed[failed.length-1].startsWith("A10")) {
  failed.pop();
  rep(`function buyEquip(it){if(!G||!it)return;if((G.equip||[]).length>=EQUIP_SLOTS){toast("装备栏已满 · 请先出售");return;}`,
`function buyEquip(it){if(!G||!it)return;if((G.equip||[]).length>=EQUIP_SLOTS){toast("装备栏已满 · 请先出售");return;}if(it.u&&(G.equip||[]).indexOf(it.id)>=0){toast("唯一装备 · 已持有");return;}`, "A10 buy unique retry");
}

/* A11：渲染开火路径 —— 多弹道展开 + 近战/榴弹分支 */
rep(`  let res;
  if((G.weapon || 1) === 1){
    const p = firePulse(camera.position.x, camera.position.y, camera.position.z, dx, dy, dz);
    res = p;
  } else {
    res = fireWeapon(G.weapon, camera.position.x, camera.position.y, camera.position.z, dx, dy, dz);
  }
  if(!res){
    // 渊棘空弹一次性提示（冷却中不提示）
    if((G.weapon||1) === 2 && G.ammo <= 0 && G.cool[2] <= 0) toast("瓷骨弹药耗尽");
    return;
  }
  if(Array.isArray(res)){
    // 深渊回响：施放即时已结算，此处仅表现（扩散环 0.15s + 命中反馈）
    muzzleFlash();   // v23.3 枪口焰
    spawnEchoRing(camera.position.x, camera.position.y, camera.position.z);
    sound("echo");
    for(const e of res) handleCombatEvent(e);
    return;
  }
  const mesh = buildProjectileMesh(res);
  res.mesh = mesh;
  pulses.push(res);
  muzzleFlash();   // v23.3 枪口焰
  if((G.weapon||1)===1&&runBuild.sonarSpread){for(const ang of [-.16,.16]){const q=Object.assign({},res);q.vx=res.vx*Math.cos(ang)-res.vz*Math.sin(ang);q.vz=res.vx*Math.sin(ang)+res.vz*Math.cos(ang);q.dmg*=.72;q.mesh=buildProjectileMesh(q);pulses.push(q);}}
  if((G.weapon||1)===1)spawnEchoRing(camera.position.x,camera.position.y,camera.position.z);
  sound((G.weapon||1) === 2 ? "thorn" : "shoot");`,
`  // v28：角色专属武器统一入口 + 装备分裂弹匣多弹道展开
  const shots=1+((G&&G.equipMulti)||0);
  const fired=[];
  const yaw=Math.atan2(dx||.001,dz||.001);
  for(let k=0;k<shots;k++){
    const ang=(k-(shots-1)/2)*.13,c=Math.cos(ang),s2=Math.sin(ang);
    const rdx=dx*c-dz*s2,rdz=dx*s2+dz*c;
    const res=fireWeapon(G.weapon,camera.position.x,camera.position.y,camera.position.z,rdx,dy,rdz,yaw);
    if(Array.isArray(res)){muzzleFlash();spawnEchoRing(camera.position.x,camera.position.y,camera.position.z,0xffcf9f,2.4);sound("echo");for(const e of res)handleCombatEvent(e);}
    else if(res)fired.push(res);
  }
  if(!fired.length){
    // 渊棘空弹一次性提示（冷却中不提示）
    if((G.weapon||1) === 2 && G.ammo <= 0 && G.cool[2] <= 0) toast("瓷骨弹药耗尽");
    return;
  }
  for(const res of fired){
    const mesh = buildProjectileMesh(res);
    res.mesh = mesh;
    pulses.push(res);
  }
  muzzleFlash();   // v23.3 枪口焰
  if((G.weapon||1)===1)spawnEchoRing(camera.position.x,camera.position.y,camera.position.z);
  sound((G.weapon||1) === 2 ? "thorn" : "shoot");`, "A11 fire path");

/* A12：蓄力路径（近战分支 + yaw） */
rep(`  const res = fireCharged(G.weapon||1, camera.position.x, camera.position.y, camera.position.z, dir.x, dir.y, dir.z);
  weaponKick=Math.min(1,weaponKick+.9);weaponActionT=.1;weaponActionKind=G.weapon||1;
  if(!res){chargeReady=false;return;}
  const mesh = buildProjectileMesh(res);`,
`  const yaw=Math.atan2(dir.x||.001,dir.z||.001);
  const res = fireCharged(G.weapon||1, camera.position.x, camera.position.y, camera.position.z, dir.x, dir.y, dir.z, yaw);
  weaponKick=Math.min(1,weaponKick+.9);weaponActionT=.1;weaponActionKind=G.weapon||1;
  if(!res){chargeReady=false;return;}
  if(Array.isArray(res)){muzzleFlash();spawnEchoRing(camera.position.x,camera.position.y,camera.position.z,0xffcf9f,3.4);sound("echo");addShake(.4);addHitStop(.06);for(const e of res)handleCombatEvent(e);chargeReady=false;return;}
  const mesh = buildProjectileMesh(res);`, "A12 charged path");

/* A13：榴弹弹体外观 */
rep(`function buildProjectileMesh(p){
  if(p.wid === 2){`,
`const grenadeMat=new THREE.MeshBasicMaterial({color:0xffb37a,fog:false}),grenadeTrailMat=new THREE.MeshBasicMaterial({color:0xff8a4a,transparent:true,opacity:.42,depthWrite:false,blending:THREE.AdditiveBlending,fog:false});
keepRes(grenadeMat,grenadeTrailMat);
function buildProjectileMesh(p){
  if(p.wid === 3){   // v28：帕米尔榴弹——琥珀弹体 + 引信辉光 + 拖尾
    const g=new THREE.Group();g.position.set(p.x,p.y,p.z);
    g.add(new THREE.Mesh(pulseGeo,grenadeMat));
    const glow=new THREE.Sprite(glowMaterial(0xffcf9f));glow.scale.set(1.5,1.5,1);g.add(glow);
    const trail=new THREE.Mesh(thornTrailGeo,grenadeTrailMat);trail.position.set(0,0,-1.0);g.add(trail);
    g.userData.playerProjectile=true;g.userData.spin=5;scene.add(g);return g;
  }
  if(p.wid === 2){`, "A13 grenade mesh");

/* A14：blastFx 表现 */
rep(`  else if(e.type==="chargeBlast"){ burstParticle(e.x,e.y,e.z,0x7fffd4,22); burstParticle(e.x,e.y,e.z,0xffd66b,10); spawnEchoRing(e.x,Math.max(e.y,terrainHeight(e.x,e.z)+.5),e.z,0xffd66b,2.6); addShake(.4); addHitStop(.04); sound("charged"); }`,
`  else if(e.type==="chargeBlast"){ burstParticle(e.x,e.y,e.z,0x7fffd4,22); burstParticle(e.x,e.y,e.z,0xffd66b,10); spawnEchoRing(e.x,Math.max(e.y,terrainHeight(e.x,e.z)+.5),e.z,0xffd66b,2.6); addShake(.4); addHitStop(.04); sound("charged"); }
  else if(e.type==="blastFx"){ const by=terrainHeight(e.x,e.z)+.6; burstParticle(e.x,by,e.z,0xffb37a,14); spawnEchoRing(e.x,by,e.z,0xffb37a,e.r||2.6); addShake(.2); sound("thud"); }`, "A14 blastFx");

/* A15：武器 UI（单槽 + 近战模型映射） */
rep(`  for(const el of weaponSlotEls) el.classList.toggle("cur", Number(el.getAttribute("data-wid")) === w);
  _setETxt(ammoBadgeEl, (G ? (G.ammo||0) : 0) + "/6");   // v23：值变化才写 DOM
  if(weaponSlotEls[1]) weaponSlotEls[1].classList.toggle("empty", !G || (G.ammo||0) <= 0);
  const ui = WEAPON_UI[w] || WEAPON_UI[1];`,
`  for(const el of weaponSlotEls){if(el.id==="dashChip")continue;el.classList.add("cur");const g2=(WEAPON_UI[w]||WEAPON_UI[1]).glyph;if(el.textContent!==g2)el.textContent=g2;}   // v28：单专属武器槽
  const ui = WEAPON_UI[w] || WEAPON_UI[1];`, "A15 weapon ui head");
rep(`  if(typeof viewWeaponAttachments!=="undefined")for(const id of [1,2,3])viewWeaponAttachments[id].visible=id===w;`,
`  if(typeof viewWeaponAttachments!=="undefined"){const shown=w===4?2:w;for(const id of [1,2,3])viewWeaponAttachments[id].visible=id===shown;}   // v28 近战沿用枪刺模型`, "A15 attachment");
rep(`  const sw = _el("btnWeapon");
  if(sw){ _setETxt(sw, ui.glyph); _setEStyle(sw,"borderColor",ui.color); _setEStyle(sw,"color",ui.color); }`,
`  const sw = _el("btnWeapon");
  if(sw){ _setETxt(sw, "技3"); }`, "A15 btnWeapon label");

/* A16：HUD HTML —— 单武器槽 + 三技能芯片 */
rep(`  <div id="weaponSlots" aria-hidden="true">
    <div class="wslot cur" data-wid="1" title="髓震脉冲">◉</div>
    <div class="wslot" data-wid="2" title="瓷骨之矛">▲<span class="wammo" id="ammoBadge">4/6</span></div>
    <div class="wslot" data-wid="3" title="舰髓回响">◌</div>
    <div class="wslot" id="dashChip" title="闪避冲刺（Q）">闪</div>
  </div>
  <div id="skillBar" aria-hidden="true"><div class="skill-chip" id="shieldChip">F · 髓瓷护幕<small>免疫伤害</small></div><div class="skill-chip" id="overdriveChip">R · 神经超频<small>增伤加速</small></div></div>`,
`  <div id="weaponSlots" aria-hidden="true">
    <div class="wslot cur" data-wid="1" title="专属武器">◉</div>
    <div class="wslot" id="dashChip" title="闪避冲刺（Q）">闪</div>
  </div>
  <div id="skillBar" aria-hidden="true"><div class="skill-chip" id="skillChip0">技能 1<small>F / 1</small></div><div class="skill-chip" id="skillChip1">技能 2<small>R / 2</small></div><div class="skill-chip" id="skillChip2">技能 3<small>C / 3</small></div></div>`, "A16 hud html");

/* A17：技能芯片 UI（三芯片 + 冷却） */
rep(`  const sc=_el("shieldChip"),oc=_el("overdriveChip");
  const sa=(G.shield||0)>0,oa=(G.overdrive||0)>0,scd=Math.max(0,G.shieldCool||0),ocd=Math.max(0,G.overdriveCool||0);
  sc.classList.toggle("active",sa);oc.classList.toggle("active",oa);
const rid=G.roleId||runSelection.roleId,shieldName=rid==="guardian"?"量子支撑场":(rid==="hunter"?"雷莫拉护幕":"船长护幕"),overName=rid==="hunter"?"破舰超频":(rid==="guardian"?"工程超频":"调查超频");
  /* v23：技能条文案/按钮字/状态条全部走变化检测，静止时零 DOM 写入 */
  const sct=sa?(shieldName+" "+G.shield.toFixed(1)+"s"):(scd>0?(shieldName+" "+Math.ceil(scd)+"s"):(input.isTouch?shieldName:("F · "+shieldName)));
  if(sc.__tv!==sct){sc.__tv=sct;sc.firstChild.nodeValue=sct;}
  const oct=oa?(overName+" "+G.overdrive.toFixed(1)+"s"):(ocd>0?(overName+" "+Math.ceil(ocd)+"s"):(input.isTouch?overName:("R · "+overName)));
  if(oc.__tv!==oct){oc.__tv=oct;oc.firstChild.nodeValue=oct;}`,
`  /* v28：三技能芯片（每角色独立技能组），文案/冷却走变化检测 */
  const rid=G.roleId||runSelection.roleId,list=ROLE_SKILLS[rid]||ROLE_SKILLS.explorer;
  for(let si3=0;si3<3;si3++){
    const chip=_el("skillChip"+si3);if(!chip)continue;
    const sk=list[si3];if(!sk)continue;
    const cd=(G.skillCd&&G.skillCd[si3]>0)?G.skillCd[si3]:0;
    let label=cd>0?Math.ceil(cd)+"s":sk.name;
    if(si3===0&&rid==="guardian"&&(G.shield||0)>0)label=sk.name+" "+G.shield.toFixed(1)+"s";
    if(si3===2&&rid==="guardian"&&(G.overdrive||0)>0)label=sk.name+" "+G.overdrive.toFixed(1)+"s";
    if(si3===2&&rid!=="guardian"&&(G.overdrive||0)>0)label=sk.name+" "+G.overdrive.toFixed(1)+"s";
    chip.classList.toggle("active",cd<=0);
    if(chip.__tv!==label){chip.__tv=label;chip.firstChild.nodeValue=label;}
  }`, "A17 chips");
rep(`  _setETxt(_el("btnShield"),sa?String(Math.ceil(G.shield)):(scd>0?String(Math.ceil(scd)):"幕"));
  _setETxt(_el("btnOverdrive"),oa?String(Math.ceil(G.overdrive)):(ocd>0?String(Math.ceil(ocd)):"频"));`,
`  {const kb=["btnShield","btnOverdrive","btnWeapon"],kl=["技1","技2","技3"];
   for(let si4=0;si4<3;si4++){const b=_el(kb[si4]);if(!b)continue;const cd=(G.skillCd&&G.skillCd[si4]>0)?Math.ceil(G.skillCd[si4]):0;_setETxt(b,cd>0?String(cd):kl[si4]);}}`, "A17 touch btns");

/* A18：技能队列 + 按键 + 触屏 */
rep(`let shieldQueued=false,overdriveQueued=false;`,
`let shieldQueued=false,overdriveQueued=false;const skillQueued=[false,false,false];`, "A18 queue");
rep(`    if(shieldQueued){activateShield();shieldQueued=false;}
    if(overdriveQueued){activateOverdrive();overdriveQueued=false;}`,
`    if(shieldQueued){activateShield();shieldQueued=false;}
    if(overdriveQueued){activateOverdrive();overdriveQueued=false;}
    for(let si2=0;si2<3;si2++){if(skillQueued[si2]){skillQueued[si2]=false;castRoleSkill(si2);}}   // v28 角色技能`, "A18 loop dispatch");
rep(`  if(e.code==="KeyF"&&!e.repeat){shieldQueued=true;return;}
  if(e.code==="KeyR"&&!e.repeat){overdriveQueued=true;return;}
  if(e.code==="Digit1" || e.code==="Digit2" || e.code==="Digit3") setCurrentWeapon(Number(e.code.slice(5)));`,
`  if(e.code==="KeyF"&&!e.repeat){skillQueued[0]=true;return;}
  if(e.code==="KeyR"&&!e.repeat){skillQueued[1]=true;return;}
  if(e.code==="KeyC"&&!e.repeat){skillQueued[2]=true;return;}
  if(e.code==="Digit1" || e.code==="Digit2" || e.code==="Digit3"){skillQueued[Number(e.code.slice(5))-1]=true;}   // v28：1/2/3 → 技能`, "A18 keys");
rep(`document.getElementById("btnShield").addEventListener("pointerdown",e=>{e.preventDefault();initAudio();if(G&&G.state===S.PLAYING)shieldQueued=true;});
document.getElementById("btnOverdrive").addEventListener("pointerdown",e=>{e.preventDefault();initAudio();if(G&&G.state===S.PLAYING)overdriveQueued=true;});`,
`document.getElementById("btnShield").addEventListener("pointerdown",e=>{e.preventDefault();initAudio();if(G&&G.state===S.PLAYING)skillQueued[0]=true;});
document.getElementById("btnOverdrive").addEventListener("pointerdown",e=>{e.preventDefault();initAudio();if(G&&G.state===S.PLAYING)skillQueued[1]=true;});
document.getElementById("btnWeapon").addEventListener("pointerdown", (e)=>{ e.preventDefault(); initAudio(); if(G && G.state===S.PLAYING) skillQueued[2]=true; });   // v28：技3`, "A18 touch");
rep(`document.getElementById("btnWeapon").addEventListener("pointerdown", (e)=>{ e.preventDefault(); initAudio(); if(G && G.state===S.PLAYING) cycleWeapon(); });`, ``, "A18 btnWeapon legacy");

/* A19：角色技能定义与施放（渲染层，插在 activateShield 前） */
rep(`const shieldBubble=new THREE.Mesh(`,
`/* ============================================================
   v28 角色专属主动技（每角色 3 个，F/R/C 或 1/2/3 施放）
   浣生 · 远程：弱点标记 / 磁轨贯日 / 相位撤离
   迈尔辛 · 近战：髓瓷护幕 / 震荡重锤 / 工程超频
   帕米尔 · 范围：榴弹弹幕 / 火箭轰炸 / 肾上腺素
   ============================================================ */
const ROLE_SKILLS={
  explorer:[
    {name:"弱点标记",desc:"标记最近的敌人 6 秒：对其伤害 +50%",cool:10,cast:castMarkTarget},
    {name:"磁轨贯日",desc:"沿准星释放贯穿光轨：长 30 · 宽 1.2 · 伤害 600%",cool:16,cast:castRailgun},
    {name:"相位撤离",desc:"向后闪现 6 米，并获得 1.5 秒相位虚化（免疫）",cool:12,cast:castPhaseShift}],
  guardian:[
    {name:"髓瓷护幕",desc:"3.5 秒免疫护幕（双层线框旋转）",cool:18,cast:castGuardShield},
    {name:"震荡重锤",desc:"砸地冲击：半径 5 环形伤害 320% + 强击退",cool:14,cast:castSlam},
    {name:"工程超频",desc:"6 秒增伤加速，蒸汽火花缠绕",cool:22,cast:castGuardOverdrive}],
  hunter:[
    {name:"榴弹弹幕",desc:"朝准星扇形抛射 5 枚榴弹，逐发爆裂",cool:12,cast:castBarrage},
    {name:"火箭轰炸",desc:"标记前方 3 处落点，依次延迟轰击",cool:18,cast:castStrike},
    {name:"肾上腺素",desc:"5 秒射速狂热：武器冷却 -45%",cool:20,cast:castAdrenaline}]
};
let skillFxBeams=[];
function castRoleSkill(slot){
  if(!G||G.state!==S.PLAYING)return;
  const list=ROLE_SKILLS[G.roleId]||ROLE_SKILLS.explorer,sk=list[slot];
  if(!sk)return;
  if(G.skillCd&&G.skillCd[slot]>0){toast(sk.name+" 冷却中 · "+Math.ceil(G.skillCd[slot])+"s");return;}
  if(!sk.cast())return;
  G.skillCd=G.skillCd||[0,0,0];G.skillCd[slot]=sk.cool;
  renderSkillChipsToast(slot,sk);
}
function renderSkillChipsToast(slot,sk){showTransmission("技能 · "+sk.name,sk.desc,2600);}
function castMarkTarget(){
  let bm=null,bd=1e9;
  for(const m of G.monsters){if(m.hp<=0)continue;const d=Math.hypot(m.x-player.x,m.z-player.z);if(d<bd){bd=d;bm=m;}}
  if(!bm){toast("无目标可标记");return false;}
  bm.marked=6;
  spawnEchoRing(bm.x,terrainHeight(bm.x,bm.z)+.6,bm.z,0xffd66b,1.8);
  burstParticle(bm.x,terrainHeight(bm.x,bm.z)+1.4,bm.z,0xffd66b,14);
  spawnDmgNum(bm.x,terrainHeight(bm.x,bm.z)+2.4,bm.z,"标记!","#ffd66b",true);
  sound("lock");return true;
}
function castRailgun(){
  const dir=new THREE.Vector3();camera.getWorldDirection(dir);
  const yaw=Math.atan2(dir.x||.001,dir.z||.001);
  const hits=lineBurst(player.x,player.z,yaw,30,1.2,6,1);
  for(const e of hits)handleCombatEvent(e);
  spawnBeamFx(player.x,player.y,player.z,yaw,30,0x7fffd4);
  addShake(.45);addHitStop(.07);sound("charged");return true;
}
function spawnBeamFx(x,y,z,yaw,length,colorHex){
  const grp=new THREE.Group();grp.position.set(x,y,z);
  const mat=new THREE.MeshBasicMaterial({color:colorHex,transparent:true,opacity:.85,depthWrite:false,blending:THREE.AdditiveBlending,fog:false});
  const cyl=new THREE.Mesh(new THREE.CylinderGeometry(.24,.24,length,8,1,true),mat);
  cyl.rotation.x=Math.PI/2;cyl.position.z=length/2;grp.add(cyl);
  const glow=new THREE.Sprite(glowMaterial(colorHex));glow.scale.set(2.4,2.4,1);glow.position.z=length*.4;grp.add(glow);
  grp.lookAt(x+Math.sin(yaw)*2,y,z+Math.cos(yaw)*2);
  scene.add(grp);skillFxBeams.push({mesh:grp,life:.34,max:.34});
}
function castPhaseShift(){
  const yaw=player.yaw||0;
  player.x-=Math.sin(yaw)*6;player.z-=Math.cos(yaw)*6;
  G.phaseT=1.5;
  spawnBeamFx(player.x,player.y,player.z,yaw+Math.PI,6,0xb8fff0);
  burstParticle(player.x,player.y,player.z,0xb8fff0,18);
  sound("dash");toast("相位撤离 · 虚化 1.5s");return true;
}
function castGuardShield(){return activateShield();}
function castSlam(){
  const hits=ringBurst(player.x,player.z,5,3.2,3.2,4);
  for(const e of hits)handleCombatEvent(e);
  spawnEchoRing(player.x,player.y-.3,player.z,0x6fa8ff,5);
  spawnEchoRing(player.x,player.y-.3,player.z,0xbfe8ff,3.4);
  burstParticle(player.x,player.y,player.z,0x9fc8ff,26);
  addShake(.7);addHitStop(.08);sound("charged");return true;
}
function castGuardOverdrive(){return activateOverdrive();}
function castBarrage(){
  const yaw=player.yaw||0;
  for(let k=0;k<5;k++){
    const ang=(k-2)*.22;
    const res=fireWeapon(3,player.x,player.y+.4,player.z,Math.sin(yaw+ang),.12,Math.cos(yaw+ang),yaw+ang);
    if(res&&!Array.isArray(res)){const mesh=buildProjectileMesh(res);res.mesh=mesh;pulses.push(res);}
  }
  muzzleFlash();sound("shoot");addShake(.25);return true;
}
function castStrike(){
  const yaw=player.yaw||0;
  G.strikes=G.strikes||[];
  for(let k=0;k<3;k++){
    const d=6+k*4,a=yaw+(k-1)*.3;
    G.strikes.push({x:player.x+Math.sin(a)*d,z:player.z+Math.cos(a)*d,t:1.0+k*.35});
  }
  toast("火箭轰炸 · 落点标记");sound("lock");return true;
}
function castAdrenaline(){
  G.adrenalineT=5;
  burstParticle(player.x,player.y,player.z,0xff8a4a,24);
  spawnEchoRing(player.x,player.y-.3,player.z,0xff8a4a,2.6);
  sound("overdrive");addShake(.25);toast("肾上腺素 · 射速狂热 5s");return true;
}
const shieldBubble=new THREE.Mesh(`, "A19 skills");

/* A20：tickSkillFx（光轨衰减/轰炸落点/标记与增益计时）挂在主循环 */
rep(`    tickRunRewards(dt);`,
`    tickRunRewards(dt);
    tickSkillFx(dt);   // v28 技能特效与计时`, "A20 loop hook");
rep(`/* v13 战斗奖励循环：击杀回复、独立连杀窗口、里程碑奖励与构筑经验。 */`,
`/* v28：技能特效衰减 + 轰炸落点 + 增益计时 */
function tickSkillFx(dt){
  for(let i=skillFxBeams.length-1;i>=0;i--){
    const b=skillFxBeams[i];b.life-=dt;
    if(b.mesh&&b.mesh.children)for(const o of b.mesh.children){if(o.material&&o.material.opacity!==undefined)o.material.opacity=Math.max(0,b.life/b.max*.85);}
    if(b.life<=0){if(b.mesh){scene.remove(b.mesh);disposeRoots([b.mesh]);}skillFxBeams.splice(i,1);}
  }
  if(!G)return;
  if(G.skillCd)for(let si5=0;si5<3;si5++)if(G.skillCd[si5]>0)G.skillCd[si5]-=dt;
  if(G.strikes&&G.strikes.length){
    for(let i=G.strikes.length-1;i>=0;i--){
      const s2=G.strikes[i];s2.t-=dt;
      if(s2.t>0&&s2.t<.4&&!s2.warned){s2.warned=true;spawnEchoRing(s2.x,terrainHeight(s2.x,s2.z)+.3,s2.z,0xff8a4a,2.2);}
      if(s2.t<=0){
        const hits=ringBurst(s2.x,s2.z,3.2,3.6,2.6,3);
        for(const e of hits)handleCombatEvent(e);
        spawnEchoRing(s2.x,terrainHeight(s2.x,s2.z)+.4,s2.z,0xffb37a,3.4);
        burstParticle(s2.x,terrainHeight(s2.x,s2.z)+1,s2.z,0xff8a4a,22);
        addShake(.5);sound("charged");
        G.strikes.splice(i,1);
      }
    }
  }
  for(const m of (G.monsters||[])){if(m.marked>0)m.marked-=dt;}
  if(G.phaseT>0)G.phaseT-=dt;
  if(G.adrenalineT>0)G.adrenalineT-=dt;
}
/* v13 战斗奖励循环：击杀回复、独立连杀窗口、里程碑奖励与构筑经验。 */`, "A20 tickSkillFx");

/* A21：相位虚化免疫 */
rep(`function playerHit(dmg, chain){
  if((G.dashIFrame||0)>0){`,
`function playerHit(dmg, chain){
  if((G.phaseT||0)>0)return false;   // v28 相位撤离：虚化免疫
  if((G.dashIFrame||0)>0){`, "A21 phase");

fs.writeFileSync(F, html);
console.log("applied:", applied);
if (failed.length) { console.log("FAILED:"); failed.forEach(f => console.log("  " + f)); }
