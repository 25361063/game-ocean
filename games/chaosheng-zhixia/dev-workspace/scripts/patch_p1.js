// v30 第一期补丁：元素 6 系扩展 + 元素注入器 + 敌人元素护盾 + 下落攻击 + 近战三段连击（两版同步）
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

/* A：元素 6 系 */
rep(`const ELEM_INFO={tide:{name:"潮",color:0x5fe0ff},corrode:{name:"蚀",color:0xc084ff},quake:{name:"震",color:0xffc766}};`,
`const ELEM_INFO={tide:{name:"潮",color:0x5fe0ff},corrode:{name:"蚀",color:0xc084ff},quake:{name:"震",color:0xffc766},frost:{name:"霜",color:0x9fd8ff},volto:{name:"雷",color:0xff7fb2},sonic:{name:"声",color:0x9fffc2}};   // v30 元素 6 系`, "A1 elem info");
rep(`const REACTION_TABLE={
  "corrode+tide":{kind:"rust",name:"锈蚀",color:0xa8ffc2},
  "quake+tide":{kind:"surge",name:"涌爆",color:0x7fd0ff},
  "corrode+quake":{kind:"shatter",name:"碎甲",color:0xffd66b}
};`,
`const REACTION_TABLE={
  "corrode+tide":{kind:"rust",name:"锈蚀",color:0xa8ffc2},
  "quake+tide":{kind:"surge",name:"涌爆",color:0x7fd0ff},
  "corrode+quake":{kind:"shatter",name:"碎甲",color:0xffd66b},
  "frost+quake":{kind:"shattergem",name:"碎晶",color:0xbfe8ff},
  "frost+tide":{kind:"freeze",name:"凝冻",color:0xd8f3ff},
  "volto+tide":{kind:"conduct",name:"感电",color:0xff9fc0},
  "volto+quake":{kind:"magnet",name:"磁爆",color:0xe8b0ff}
};   // v30：+碎晶/凝冻/感电/磁爆（声波=扩散，见 applyElementHit）`, "A2 reactions");

/* A3：声波扩散（附着异元的声波命中 → 传播附着 + 小额伤害） */
rep(`  if(aura && aura.t>0 && aura.e!==elem){
    const rx=REACTION_TABLE[elemPair(aura.e,elem)];`,
`  if(aura && aura.t>0 && aura.e!==elem){
    if(elem==="sonic"||aura.e==="sonic"){   // v30 扩散：把另一元素传播给 5 米内敌人并造成小额伤害
      const spread=(elem==="sonic")?aura.e:elem;
      for(const sm of G.monsters||[]){
        if(sm===m||sm.hp<=0||sm.evade)continue;
        const sd=Math.hypot(sm.x-m.x,sm.z-m.z);
        if(sd<5){if(!sm.aura||sm.aura.t<=0||sm.aura.e===spread)sm.aura={e:spread,t:6};sm.hp-=damageAmount(Math.max(1,Math.round((G.damageMul||1))));
          if(sm.hp<=0){noteKill(sm);hits.push({type:"kill",mx:sm.x,mz:sm.z,wid:1,target:sm.type});}}
      }
      m.aura=null;G.reactionCount=(G.reactionCount||0)+1;
      hits.push({type:"reaction",kind:"diffuse",name:"扩散",color:0x9fffc2,mx:m.x,mz:m.z});
      return;
    }
    const rx=REACTION_TABLE[elemPair(aura.e,elem)];`, "A3 diffuse");

/* A4：新反应结算 */
rep(`  if(rx.kind!=="surge" && m.hp<=0){ noteKill(m); hits.push({type:"kill",mx:m.x,mz:m.z,wid:1,target:m.type,dmg:base}); }`,
`  else if(rx.kind==="shattergem"){ if(m.poise)applyPoiseHit(m,2,2.5); m.hp-=damageAmount(base*1.5); }
  else if(rx.kind==="freeze"){ m.cd=Math.max(m.cd||0,1.5); m.hp-=damageAmount(base); }
  else if(rx.kind==="conduct"){
    const dmg=damageAmount(base*2);m.hp-=dmg;
    let best=null,bd=7;
    for(const cm of G.monsters||[]){if(cm===m||cm.hp<=0||cm.evade)continue;const cd2=Math.hypot(cm.x-px,cm.z-pz);if(cd2<bd){bd=cd2;best=cm;}}
    if(best){const cdmg=damageAmount(base*1.2);best.hp-=cdmg;hits.push({type:"hit",mx:best.x,mz:best.z,wid:1,dmg:cdmg});
      if(best.hp<=0){noteKill(best);hits.push({type:"kill",mx:best.x,mz:best.z,wid:1,target:best.type,dmg:cdmg});}}
  }
  else if(rx.kind==="magnet"){
    for(const sm of G.monsters||[]){if(sm===m||sm.hp<=0||sm.evade)continue;const sd=Math.hypot(sm.x-px,sm.z-pz);
      if(sd<2.6){sm.hp-=damageAmount(base*1.2);if(sm.hp<=0){noteKill(sm);hits.push({type:"kill",mx:sm.x,mz:sm.z,wid:1,target:sm.type,dmg:damageAmount(base*1.2)});}}}
    if(G.boss&&G.boss.hp>0&&Math.hypot(G.boss.x-px,G.boss.z-pz)<3)G.boss.hp-=damageAmount(base);
  }
  if(rx.kind!=="surge" && m.hp<=0){ noteKill(m); hits.push({type:"kill",mx:m.x,mz:m.z,wid:1,target:m.type,dmg:base}); }`, "A4 reactions");

/* B：元素护盾（克制表 + 闸门） */
rep(`function elemPair(a,b){ return a<b ? a+"+"+b : b+"+"+a; }`,
`function elemPair(a,b){ return a<b ? a+"+"+b : b+"+"+a; }
/* v30 元素护盾：精英/巨兽的第二条盾条；克制元素 ×3 破盾，同元素 ×0.5，盾在则完全格挡生命伤害 */
const SHIELD_COUNTER={tide:"corrode",corrode:"frost",frost:"quake",quake:"volto",volto:"tide",sonic:"quake"};
const SHIELD_ELEMS=["tide","corrode","quake","frost","volto","sonic"];
function shieldGate(m,dealt,elem){
  if(!m.eshield||m.eshield.hp<=0)return{hp:dealt,sh:0,brk:false};
  const eff=(elem&&SHIELD_COUNTER[elem]===m.eshield.elem)?3:(elem===m.eshield.elem?.5:1);
  const to=Math.min(m.eshield.hp,dealt*eff);
  m.eshield.hp-=to;
  return{hp:0,sh:Math.round(to),brk:m.eshield.hp<=0};
}`, "B1 shield tables");

/* B2：护盾闸门接入 5 处怪物伤害 + 4 处巨兽伤害 */
rep(`        m.hp-=dealt;
        m.cd = Math.max(m.cd, hitStaggerCd(m));   // CSD-H2：受击硬直 cd 按强化档
        interruptDart(m);   // CSD-M2：扑击中被击中 → 打断（cd 重置 0.6）`,
`        {const sg=shieldGate(m,dealt,(p.elem||ELEM_OF_WEAPON[p.wid]));m.hp-=sg.hp;if(sg.sh>0)hits.push({type:"shieldHit",mx:m.x,mz:m.z,dmg:sg.sh,elem:m.eshield?m.eshield.elem:"tide",brk:sg.brk});if(sg.brk)m.eshield=null;}
        m.cd = Math.max(m.cd, hitStaggerCd(m));   // CSD-H2：受击硬直 cd 按强化档
        interruptDart(m);   // CSD-M2：扑击中被击中 → 打断（cd 重置 0.6）`, "B2 tickPulses");
rep(`    m.hp-=dealt;m.cd=Math.max(m.cd,hitStaggerCd(m));interruptDart(m);
    const broke=applyPoiseHit(m,wid,gm.poise);if(!broke)interruptMove(m);`,
`    {const sg=shieldGate(m,dealt,ELEM_OF_WEAPON[wid]);m.hp-=sg.hp;if(sg.sh>0)hits.push({type:"shieldHit",mx:m.x,mz:m.z,dmg:sg.sh,elem:m.eshield?m.eshield.elem:"tide",brk:sg.brk});if(sg.brk)m.eshield=null;}
    m.cd=Math.max(m.cd,hitStaggerCd(m));interruptDart(m);
    const broke=applyPoiseHit(m,wid,gm.poise);if(!broke)interruptMove(m);`, "B2 meleeCone");
rep(`    const dealt=damageAmount(dmgBase*1.6*(G.damageMul||1)*((G.overdrive||0)>0?1.75:1)*gm.dmg*(crit?2:1)*(.88+Math.random()*.24));
    m.hp-=dealt;m.cd=Math.max(m.cd,hitStaggerCd(m));interruptDart(m);`,
`    const dealt=damageAmount(dmgBase*1.6*(G.damageMul||1)*((G.overdrive||0)>0?1.75:1)*gm.dmg*(crit?2:1)*(.88+Math.random()*.24));
    {const sg=shieldGate(m,dealt,ELEM_OF_WEAPON[wid]);m.hp-=sg.hp;if(sg.sh>0)hits.push({type:"shieldHit",mx:m.x,mz:m.z,dmg:sg.sh,elem:m.eshield?m.eshield.elem:"tide",brk:sg.brk});if(sg.brk)m.eshield=null;}
    m.cd=Math.max(m.cd,hitStaggerCd(m));interruptDart(m);`, "B2 ringBurst");
rep(`    const dealt=damageAmount(dmgBase*1.6*(G.damageMul||1)*((G.overdrive||0)>0?1.75:1)*(crit?2:1)*(.88+Math.random()*.24));
    m.hp-=dealt;m.cd=Math.max(m.cd,hitStaggerCd(m));interruptDart(m);
    hits.push({type:"hit",mx:m.x,mz:m.z,wid,dmg:dealt,crit});`,
`    const dealt=damageAmount(dmgBase*1.6*(G.damageMul||1)*((G.overdrive||0)>0?1.75:1)*(crit?2:1)*(.88+Math.random()*.24));
    {const sg=shieldGate(m,dealt,ELEM_OF_WEAPON[wid]);m.hp-=sg.hp;if(sg.sh>0)hits.push({type:"shieldHit",mx:m.x,mz:m.z,dmg:sg.sh,elem:m.eshield?m.eshield.elem:"tide",brk:sg.brk});if(sg.brk)m.eshield=null;}
    m.cd=Math.max(m.cd,hitStaggerCd(m));interruptDart(m);
    hits.push({type:"hit",mx:m.x,mz:m.z,wid,dmg:dealt,crit});`, "B2 lineBurst");
rep(`        G.boss.hp-=dealt;
        if(G.boss.poise) applyPoiseHit(G.boss, p.wid || 1, gm.poise);   // CSD-SOUL1-P1：BOSS 也累积韧性`,
`        {const sg=shieldGate(G.boss,dealt,(p.elem||ELEM_OF_WEAPON[p.wid]));G.boss.hp-=sg.hp;if(sg.sh>0)hits.push({type:"shieldHit",bx:G.boss.x,bz:G.boss.z,dmg:sg.sh,elem:G.boss.eshield?G.boss.eshield.elem:"tide",brk:sg.brk});if(sg.brk)G.boss.eshield=null;}
        if(G.boss.poise) applyPoiseHit(G.boss, p.wid || 1, gm.poise);   // CSD-SOUL1-P1：BOSS 也累积韧性`, "B2 boss tickPulses");
rep(`      G.boss.hp-=dealt;if(G.boss.poise)applyPoiseHit(G.boss,wid,gm.poise);`,
`      {const sg=shieldGate(G.boss,dealt,ELEM_OF_WEAPON[wid]);G.boss.hp-=sg.hp;if(sg.sh>0)hits.push({type:"shieldHit",bx:G.boss.x,bz:G.boss.z,dmg:sg.sh,elem:G.boss.eshield?G.boss.eshield.elem:"tide",brk:sg.brk});if(sg.brk)G.boss.eshield=null;}
      if(G.boss.poise)applyPoiseHit(G.boss,wid,gm.poise);`, "B2 boss meleeCone");
repAll(`      G.boss.hp-=dealt;hits.push({type:"boss",bx:G.boss.x,bz:G.boss.z,wid,dmg:dealt});`,
`      {const sg=shieldGate(G.boss,dealt,ELEM_OF_WEAPON[wid]);G.boss.hp-=sg.hp;if(sg.sh>0)hits.push({type:"shieldHit",bx:G.boss.x,bz:G.boss.z,dmg:sg.sh,elem:G.boss.eshield?G.boss.eshield.elem:"tide",brk:sg.brk});if(sg.brk)G.boss.eshield=null;}
      hits.push({type:"boss",bx:G.boss.x,bz:G.boss.z,wid,dmg:dealt});`, "B2 boss ring/line", 2);

/* B3：护盾归属（精英 / 巨兽） */
rep(`    for(const m of G.monsters){m.hp=Math.ceil(m.hp*1.6);m.maxHp=Math.ceil(m.maxHp*1.6);}`,
`    for(const m of G.monsters){m.hp=Math.ceil(m.hp*1.6);m.maxHp=Math.ceil(m.maxHp*1.6);
      if(m.type==="elite"){const se=SHIELD_ELEMS[(Math.random()*SHIELD_ELEMS.length)|0];const shp=Math.ceil(m.maxHp*.35);m.eshield={elem:se,hp:shp,max:shp};}}   // v30 精英元素盾`, "B3 elite");
rep(`const g=applyRunProfile(startLevel(idx,carry));if(g.modeId==="campaign"&&g.boss){const mul=1+Math.floor(idx/4)*.16;g.boss.maxHp=Math.ceil(g.boss.maxHp*mul);g.boss.hp=g.boss.maxHp;}return g;`,
`const g=applyRunProfile(startLevel(idx,carry));if(g.modeId==="campaign"&&g.boss){const mul=1+Math.floor(idx/4)*.16;g.boss.maxHp=Math.ceil(g.boss.maxHp*mul);g.boss.hp=g.boss.maxHp;
  const se=SHIELD_ELEMS[(g.level||1)%SHIELD_ELEMS.length];const shp=Math.ceil(g.boss.maxHp*.3);g.boss.eshield={elem:se,hp:shp,max:shp};}   // v30 巨兽元素盾
return g;`, "B3 boss");

/* B4：盾命中表现 */
rep(`  else if(e.type==="blastFx"){ const by=terrainHeight(e.x,e.z)+.6; burstParticle(e.x,by,e.z,0xffb37a,14); spawnEchoRing(e.x,by,e.z,0xffb37a,e.r||2.6); addShake(.2); sound("thud"); }`,
`  else if(e.type==="blastFx"){ const by=terrainHeight(e.x,e.z)+.6; burstParticle(e.x,by,e.z,0xffb37a,14); spawnEchoRing(e.x,by,e.z,0xffb37a,e.r||2.6); addShake(.2); sound("thud"); }
  else if(e.type==="shieldHit"){
    const gx=(e.mx!==undefined)?e.mx:e.bx, gz=(e.mz!==undefined)?e.mz:e.bz, gy=terrainHeight(gx,gz)+1.6;
    const sc=ELEM_INFO[e.elem]?ELEM_INFO[e.elem].color:0x9fd8ff;
    burstParticle(gx,gy,gz,sc,8); spawnDmgNum(gx,gy+.6,gz,"盾 "+e.dmg,"#"+sc.toString(16).padStart(6,"0"),false); sound("thud");
    if(e.brk){spawnEchoRing(gx,gy,gz,0xffffff,2.4);burstParticle(gx,gy,gz,0xffffff,20);addShake(.3);toast("元素盾破碎！");sound("kill");}
  }`, "B4 shieldHit fx");

/* B5：巨兽盾条 UI */
rep(`  <div id="bossWrap"><div class="lbl" id="bossLabel">五指门 · 核心协议强度</div><div class="bar"><div class="f" id="bossBar"></div></div><div id="poiseWrap"><div class="f" id="poiseBar"></div></div></div>`,
`  <div id="bossWrap"><div class="lbl" id="bossLabel">五指门 · 核心协议强度</div><div class="bar"><div class="f" id="bossBar"></div></div><div id="bossShieldWrap" style="display:none;margin-top:3px;height:4px;background:rgba(11,18,25,.8);border-radius:2px;overflow:hidden;"><div class="f" id="bossShieldBar" style="height:100%;width:100%;background:linear-gradient(90deg,#2a4a6a,#9fd8ff);transition:width .15s;"></div></div><div id="poiseWrap"><div class="f" id="poiseBar"></div></div></div>`, "B5 bar html");
rep(`      } else {
        _el("poiseWrap").classList.remove("show");
      }`,
`      } else {
        _el("poiseWrap").classList.remove("show");
      }
      if(barBoss.eshield && barBoss.eshield.hp>0){
        _el("bossShieldWrap").classList.add("show");
        _setBarW("bossShieldBar", Math.max(0, barBoss.eshield.hp/barBoss.eshield.max*100));
      } else {
        _el("bossShieldWrap").classList.remove("show");
      }   // v30 元素盾条`, "B5 bar update");

/* C：元素注入器装备 ×4 */
rep(`  {id:"shockHead",name:"震荡弹头",cost:5500,desc:"子弹命中后爆裂：2.6 米范围 60% 溅射",s:{blast:1},u:1}
];`,
`  {id:"shockHead",name:"震荡弹头",cost:5500,desc:"子弹命中后爆裂：2.6 米范围 60% 溅射",s:{blast:1},u:1},
  {id:"injTide",name:"注入器 · 潮",cost:5600,desc:"武器附魔：弹道附带潮元素（锈蚀/涌爆/凝冻/感电）",s:{elem:"tide"},u:1},
  {id:"injFrost",name:"注入器 · 霜",cost:5600,desc:"武器附魔：弹道附带霜元素（凝冻/碎晶）",s:{elem:"frost"},u:1},
  {id:"injVolto",name:"注入器 · 雷",cost:5600,desc:"武器附魔：弹道附带雷元素（感电/磁爆）",s:{elem:"volto"},u:1},
  {id:"injSonic",name:"注入器 · 声",cost:5600,desc:"武器附魔：弹道附带声元素，命中即扩散附着周身敌人",s:{elem:"sonic"},u:1}
];`, "C1 injectors");
rep(`  let multi=0,pierce=0,home=0,blast=0,elemAlt=0;`,
`  let multi=0,pierce=0,home=0,blast=0,elemAlt=0,elemInj=null;`, "C2 stats init");
rep(`    multi+=s.multi||0;pierce+=s.pierce||0;home+=s.home||0;blast+=s.blast||0;elemAlt+=s.elemAlt||0;`,
`    multi+=s.multi||0;pierce+=s.pierce||0;home+=s.home||0;blast+=s.blast||0;elemAlt+=s.elemAlt||0;elemInj=s.elem||elemInj;`, "C2 stats loop");
rep(`  g.equipMulti=multi;g.equipPierce=pierce;g.equipHome=home;g.equipBlast=blast;g.equipElemAlt=elemAlt;`,
`  g.equipMulti=multi;g.equipPierce=pierce;g.equipHome=home;g.equipBlast=blast;g.equipElemAlt=elemAlt;g.equipElem=elemInj;`, "C2 stats out");
rep(`  const altElem=(G.equipElemAlt&&(G.shotCount%2===0))?"corrode":null;   // 阴阳弹匣：隔发蚀元素 → 稳定触发元素反应`,
`  const injected=G.equipElem||null;   // v30 元素注入器（优先级高于阴阳弹匣）
  const altElem=(!injected&&G.equipElemAlt&&(G.shotCount%2===0))?"corrode":null;   // 阴阳弹匣：隔发蚀元素 → 稳定触发元素反应
  const hitElem=injected||altElem||undefined;`, "C3 fire elem");
rep(`           elem:altElem||undefined,`,
`           elem:hitElem,`, "C3 elem field");

/* D：下落攻击 */
rep(`function fireFromCamera(){
  weaponKick = Math.min(1,weaponKick+.72);`,
`function fireFromCamera(){
  /* v30 下落攻击：滞空（高于地面 2.2m）按攻击 → 高速下坠，落地环形爆发 */
  if(G&&G.state===S.PLAYING&&!player.climb&&(player.y>terrainHeight(player.x,player.z)+2.2)){
    G.plungeArm=true;player.vy=-16;player.onGround=false;
    toast("下坠攻击！");
    return;
  }
  weaponKick = Math.min(1,weaponKick+.72);`, "D1 plunge arm");
rep(`  if(player.y <= ground+1.7){
    player.y = ground+1.7;
    player.vy = 0;
    player.onGround = true;
  }`,
`  if(player.y <= ground+1.7){
    if(G&&G.plungeArm){   // v30 落地爆发
      G.plungeArm=false;
      const phits=ringBurst(player.x,player.z,3.8,3.4,3,4);
      for(const pe of phits)handleCombatEvent(pe);
      spawnEchoRing(player.x,ground+.3,player.z,0xffd66b,4.2);
      spawnEchoRing(player.x,ground+.3,player.z,0xffffff,2.8);
      burstParticle(player.x,ground+1,player.z,0xffd66b,24);
      addShake(.8);addHitStop(.08);sound("charged");fovPunch=6;
    }
    player.y = ground+1.7;
    player.vy = 0;
    player.onGround = true;
  }`, "D2 plunge land");

/* E：近战三段连击 */
rep(`  if(w.melee){                                    // v28：近战扇击（迈尔辛）——瞬时扇形判定，不产生弹丸
    return meleeCone(px, py, pz, yaw, w.radius, w.halfAngle, w.dmg, w.knock, wid);
  }`,
`  if(w.melee){                                    // v28 近战扇击 + v29 三段连击（第三段加大加重）
    const now=G.time||0;
    if(now-(G.meleeLastT||-9)>0.9)G.meleeCombo=0;
    const seg=G.meleeCombo%3,mult=[1,1.1,1.45][seg],third=seg===2;
    G.meleeLastT=now;G.meleeCombo=(G.meleeCombo+1)%3;
    return meleeCone(px, py, pz, yaw, w.radius+(third?.6:0), w.halfAngle+(third?.15:0), w.dmg*mult, w.knock*(third?1.3:1), wid);
  }`, "E1 combo");

fs.writeFileSync(F, html);
console.log(F, "applied:", applied);
if (failed.length) { console.log("FAILED:"); failed.forEach(f => console.log("  " + f)); }
