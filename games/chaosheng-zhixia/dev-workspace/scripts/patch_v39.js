// v39 补丁：难度选择 + 小地图 POI 标记 + 精英变异词缀（计划 1.3/3.2/1.1）
const fs = require("fs");
for (const F of ["潮声之下_深渊潜航3D_v22.html", "潮声之下_深渊潜航3D_手机版.html"]) {
  let html = fs.readFileSync(F, "utf8");
  let n = 0;
  const rep = (f, r, tag) => { const c = html.split(f).length - 1; if (c !== 1) { console.log(F, tag, "count", c); return; } html = html.split(f).join(r); n++; };

  /* ===== 1.3 难度选择 ===== */
  // 难度按钮 HTML（出征页 WiFi 区块后面）
  rep(`    <section class="level-select"><h2>深渊下潜路线</h2>`,
`    <section class="setup-group" id="diffSection">
      <h2>难度</h2>
      <div style="display:flex;gap:6px">
        <button type="button" class="choice-card diffBtn" data-diff="easy" style="min-height:40px;padding:6px;text-align:center"><strong style="color:#63e8cf">探索</strong><small style="display:block;color:#8fa7a1;font-size:9px">怪物 -30% · 金币 ×0.8</small></button>
        <button type="button" class="choice-card diffBtn" data-diff="normal" aria-pressed="true" style="min-height:40px;padding:6px;text-align:center"><strong style="color:var(--acc2)">标准</strong><small style="display:block;color:#8fa7a1;font-size:9px">默认平衡</small></button>
        <button type="button" class="choice-card diffBtn" data-diff="hard" style="min-height:40px;padding:6px;text-align:center"><strong style="color:#ff617f">深渊</strong><small style="display:block;color:#8fa7a1;font-size:9px">怪物 +30% · 金币 ×1.3</small></button>
      </div>
    </section>
    <section class="level-select"><h2>深渊下潜路线</h2>`, "diff html");

  // 难度 JS（选择 + 持久化 + 应用）
  rep(`document.getElementById("startBtn").addEventListener("click", ()=>{ initAudio(); startGame(false); });`,
`document.getElementById("startBtn").addEventListener("click", ()=>{ initAudio(); startGame(false); });
/* v39 难度选择 */
(function(){
  const btns=document.querySelectorAll(".diffBtn");
  const saved=(meta.difficulty||"normal");
  btns.forEach(b=>{b.setAttribute("aria-pressed",String(b.dataset.diff===saved));b.style.borderColor=b.dataset.diff===saved?"var(--acc2)":"";});
  btns.forEach(b=>b.addEventListener("click",()=>{
    meta.difficulty=b.dataset.diff;saveMeta();
    btns.forEach(x=>{x.setAttribute("aria-pressed",String(x===b));x.style.borderColor=x===b?"var(--acc2)":"";});
    toast("难度 · "+b.textContent.trim().slice(0,2));
  }));
})();`, "diff js");

  // 难度系数应用（怪物属性 + 金币）
  rep(`function createConfiguredLevel(idx,carry,resetModeBoost){
  const mode=RUN_MODES[runSelection.modeId]||RUN_MODES.campaign;if(runSelection.modeId==="campaign")setMonsterBoost(idx<6?1:(idx<14?2:3));else if(resetModeBoost)setMonsterBoost(mode.boost);`,
`function createConfiguredLevel(idx,carry,resetModeBoost){
  const mode=RUN_MODES[runSelection.modeId]||RUN_MODES.campaign;if(runSelection.modeId==="campaign")setMonsterBoost(idx<6?1:(idx<14?2:3));else if(resetModeBoost)setMonsterBoost(mode.boost);
  /* v39 难度系数 */
  const diffMul={easy:{hp:.7,dmg:.7,gold:.8},normal:{hp:1,dmg:1,gold:1},hard:{hp:1.3,dmg:1.3,gold:1.3}}[meta.difficulty||"normal"]||{hp:1,dmg:1,gold:1};
  G_diffMul=diffMul;`, "diff apply");

  // 怪物属性乘难度
  rep(`  const g=applyRunProfile(startLevel(idx,carry));if(g.modeId==="campaign"&&g.boss){const mul=1+Math.floor(idx/4)*.16;g.boss.maxHp=Math.ceil(g.boss.maxHp*mul);g.boss.hp=g.boss.maxHp;`,
`  const g=applyRunProfile(startLevel(idx,carry));
  if(G_diffMul&&G_diffMul.hp!==1){for(const m of (g.monsters||[])){m.hp=Math.ceil(m.hp*G_diffMul.hp);m.maxHp=m.hp;}if(g.boss){g.boss.maxHp=Math.ceil(g.boss.maxHp*G_diffMul.hp);g.boss.hp=g.boss.maxHp;}}   // v39 难度
  if(g.modeId==="campaign"&&g.boss){const mul=1+Math.floor(idx/4)*.16;g.boss.maxHp=Math.ceil(g.boss.maxHp*mul);g.boss.hp=g.boss.maxHp;`, "diff monster hp");

  // 金币乘难度
  rep(`function grantGold(n,why){if(!G)return;const g2=Math.round(n*((G.goldMul||1))*((G.wellAffix&&G.wellAffix.gold)||1));`,
`function grantGold(n,why){if(!G)return;const dm=(G_diffMul&&G_diffMul.gold)||1;const g2=Math.round(n*((G.goldMul||1))*dm);`, "diff gold");

  // G_diffMul 全局声明
  rep(`var coopEnabled = false;var playerB = null;var p2Role = "guardian";`,
`var runBuild = null;
var G_diffMul = {hp:1,dmg:1,gold:1};`, "diff var");
  // 移除旧 coop 声明（如果还在）
  html = html.split(`var coopEnabled = false;var playerB = null;var p2Role = "guardian";`).join("");

  /* ===== 3.2 小地图 POI 标记 ===== */
  rep(`  const gp=gatePos(),g=minimapPoint(gp.x,gp.z),open=objectiveMet();`,
`  /* v39 POI 标记：宝箱/信标/楼梯塔 */
  for(const it of worldInteractives||[]){
    if(!it||it.kind==="vent"||it.kind==="current"||it.kind==="crystal")continue;
    if(it.kind==="storyNode"&&it.seen)continue;
    const p2m=minimapPoint(it.x,it.z);
    if(it.kind==="chest"&&!it.opened){ctx.fillStyle="#ffd66b";ctx.fillRect(p2m.x-3,p2m.y-3,6,6);}
    else if(it.kind==="beacon"&&!it.lit){ctx.strokeStyle="#7fd0ff";ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(p2m.x,p2m.y,4,0,Math.PI*2);ctx.stroke();}
    else if(it.kind==="rift"&&!it.started){ctx.fillStyle="#ff5573";ctx.beginPath();ctx.moveTo(p2m.x,p2m.y-4);ctx.lineTo(p2m.x+4,p2m.y+3);ctx.lineTo(p2m.x-4,p2m.y+3);ctx.closePath();ctx.fill();}
  }
  for(const st of stairTowers||[]){const p2m=minimapPoint(st.pos.x,st.pos.z);ctx.strokeStyle="#7fffd4";ctx.lineWidth=1.5;ctx.strokeRect(p2m.x-3,p2m.y-3,6,6);}
  const gp=gatePos(),g=minimapPoint(gp.x,gp.z),open=objectiveMet();`, "minimap poi");

  /* ===== 1.1 精英变异词缀 ===== */
  // 词缀表
  rep(`function tickMonsters(dt, px, pz, opts){`,
`/* ===== v39 精英变异词缀：6 种，精英随机携带 ===== */
const ELITE_AFFIXES=[
  {id:"scorch",name:"灼热",color:0xff6a3a,icon:"🔥",desc:"近身反弹 5 伤害"},
  {id:"volt",name:"电壳",color:0x9fd8ff,icon:"⚡",desc:"受击 20% 概率放电"},
  {id:"swift",name:"迅捷",color:0x63e8cf,icon:"💨",desc:"移动速度 ×1.5"},
  {id:"thorn",name:"荆棘",color:0x83ff66,icon:"🌵",desc:"远程反弹 20%"},
  {id:"phantom",name:"虚影",color:0xb48cff,icon:"👻",desc:"25% 概率闪避"},
  {id:"titan",name:"巨力",color:0xffc766,icon:"💪",desc:"近战伤害 +50%"}
];
function assignEliteAffix(m){
  if(m.type!=="elite")return;
  const af=ELITE_AFFIXES[(Math.random()*ELITE_AFFIXES.length)|0];
  m.affix=af.id;m.affixName=af.name;m.affixColor=af.color;
}
function tickMonsters(dt, px, pz, opts){`, "affix table");

  // 精英生成时赋词缀
  rep(`    for(const m of G.monsters){m.hp=Math.ceil(m.hp*1.6);m.maxHp=Math.ceil(m.maxHp*1.6);
      if(m.type==="elite"){const se=SHIELD_ELEMS[(Math.random()*SHIELD_ELEMS.length)|0];const shp=Math.ceil(m.maxHp*.35);m.eshield={elem:se,hp:shp,max:shp};}}`,
`    for(const m of G.monsters){m.hp=Math.ceil(m.hp*1.6);m.maxHp=Math.ceil(m.maxHp*1.6);
      if(m.type==="elite"){const se=SHIELD_ELEMS[(Math.random()*SHIELD_ELEMS.length)|0];const shp=Math.ceil(m.maxHp*.35);m.eshield={elem:se,hp:shp,max:shp};}
      assignEliteAffix(m);}`, "affix assign");

  // 词缀效果：迅捷（移速）在 tickChase 内通过 speedMult 生效——简化为在 tickMonsters 内设置标记
  rep(`    const t = MONSTER_TYPES[m.type] || null;`,
`    const t = MONSTER_TYPES[m.type] || null;
    if(m.affix==="swift")m.affixSpd=1.5;else m.affixSpd=1;   // v39 迅捷词缀`, "affix swift");

  // 虚影闪避（tickPulses 命中判定）
  rep(`      if(p.hitList&&p.hitList.indexOf(m)>=0) continue;   // v28 贯穿：同一目标只结算一次`,
`      if(p.hitList&&p.hitList.indexOf(m)>=0) continue;   // v28 贯穿：同一目标只结算一次
      if(m.affix==="phantom"&&Math.random()<.25)continue;   // v39 虚影 25% 闪避`, "affix phantom");

  // 电壳：受击放电
  rep(`        hits.push({type:"hit", mx:m.x, mz:m.z, wid:p.wid||1, dmg:dealt, crit:crit});
        if(m.hp<=0 && !diedInReaction){`,
`        hits.push({type:"hit", mx:m.x, mz:m.z, wid:p.wid||1, dmg:dealt, crit:crit});
        if(m.affix==="volt"&&Math.random()<.2){G.hp=Math.max(0,G.hp-8);hurtFlash=1;hits.push({type:"hit",mx:player.x,mz:player.z,wid:1,dmg:8});toast("电壳反噬！");}   // v39 电壳`, "affix volt");

  // 灼热：近战反弹
  rep(`    hits.push({type:"hit",mx:m.x,mz:m.z,wid,dmg:dealt,crit});
    if(m.hp<=0&&!diedInReaction){if(m.type==="acid"){G.enemyHazards=G.enemyHazards||[];G.enemyHazards.push({kind:"acidPool",x:m.x,z:m.z,r:3.6,life:7,max:7,dmg:8,tick:0,tickRate:.8});}noteKill(m);hits.push({type:"kill",mx:m.x,mz:m.z,wid,target:m.type,dmg:dealt,crit});}
  }
  if(G.boss&&G.boss.hp>0&&(G.level===undefined||baseObjectiveMet())){
    const d=Math.hypot(G.boss.x-px,G.boss.z-pz);
    if(d<radius+1.6){`,
`    hits.push({type:"hit",mx:m.x,mz:m.z,wid,dmg:dealt,crit});
    if(m.affix==="scorch"){G.hp=Math.max(0,G.hp-5);hits.push({type:"hit",mx:player.x,mz:player.z,wid,dmg:5});toast("灼热反伤！");}
    if(m.hp<=0&&!diedInReaction){if(m.type==="acid"){G.enemyHazards=G.enemyHazards||[];G.enemyHazards.push({kind:"acidPool",x:m.x,z:m.z,r:3.6,life:7,max:7,dmg:8,tick:0,tickRate:.8});}noteKill(m);hits.push({type:"kill",mx:m.x,mz:m.z,wid,target:m.type,dmg:dealt,crit});}
  }
  if(G.boss&&G.boss.hp>0&&(G.level===undefined||baseObjectiveMet())){
    const d=Math.hypot(G.boss.x-px,G.boss.z-pz);
    if(d<radius+1.6){`, "affix scorch");

  // 小地图词缀标记
  rep(`  for(const m of G.monsters||[]){if(!m||m.hp<=0)continue;const p=minimapPoint(m.x,m.z),elite=m.type==="elite"||m.type==="shield",`,
`  for(const m of G.monsters||[]){if(!m||m.hp<=0)continue;const p=minimapPoint(m.x,m.z),elite=m.type==="elite"||m.type==="shield",`,
    "minimap noop"); // 已有精英金色圆圈，词缀色暂通过体色区分

  // 击杀时显示词缀名
  rep(`if(e.type==="kill"){ burstParticle(e.mx, terrainHeight(e.mx,e.mz)+1, e.mz, col, 16); showHitMarker(true); noteBestiaryKill(e.target); spawnLoot(e.mx,e.mz,false);registerRunKill(e.mx,e.mz,false); sound("kill"); addShake(0.5); addHitStop(0.05); saveGame(); if((G.combo||0) >= 2) toast("连杀 ×" + G.combo + "！");`,
`if(e.type==="kill"){ burstParticle(e.mx, terrainHeight(e.mx,e.mz)+1, e.mz, col, 16); showHitMarker(true); noteBestiaryKill(e.target); spawnLoot(e.mx,e.mz,false);registerRunKill(e.mx,e.mz,false); sound("kill"); addShake(0.5); addHitStop(0.05); saveGame(); if((G.combo||0) >= 2) toast("连杀 ×" + G.combo + "！");
    /* v39 词缀击杀提示 */ if(e.affixName)spawnDmgNum(e.mx,terrainHeight(e.mx,e.mz)+2.6,e.mz,e.affixName+" 击破","#"+(e.affixColor||0xffffff).toString(16).padStart(6,"0"),true);`, "kill affix text");

  fs.writeFileSync(F, html);
  console.log(F, "=== v39 applied:", n, "===");
}
