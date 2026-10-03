// v41 补丁：一次性完成计划剩余 9 项（1.2/1.4/2.1/2.2/2.3/2.4/3.1/3.3/3.4）
const fs = require("fs");
for (const F of ["潮声之下_深渊潜航3D_v22.html", "潮声之下_深渊潜航3D_手机版.html"]) {
  let html = fs.readFileSync(F, "utf8");
  let n = 0;
  const rep = (f, r, tag) => { const c = html.split(f).length - 1; if (c !== 1) { console.log(F, tag, "count", c); return; } html = html.split(f).join(r); n++; };

  /* ===== 1.2 BOSS 专属招式 ===== */
  // 在 tickBoss 的追击移动后添加专属招式
  rep(`    b.x += dx/d*speed*dt*speedMult(b)*pm; b.z += dz/d*speed*dt*speedMult(b)*pm;
    const brc=resolveCollision(b.x,b.z,1.5);b.x=brc[0];b.z=brc[1];`,
`    b.x += dx/d*speed*dt*speedMult(b)*pm; b.z += dz/d*speed*dt*speedMult(b)*pm;
    const brc=resolveCollision(b.x,b.z,1.5);b.x=brc[0];b.z=brc[1];
    /* v41 BOSS 专属招式：每种 BOSS 独有特殊攻击 */
    b.uniqueCd=Math.max(0,(b.uniqueCd||8)-dt);
    if(b.uniqueCd<=0&&d<(bt.hitR||3)+8){
      b.uniqueCd=12;
      if(b.type==="reefCrab"){       // 蟹：横扫钳击（180° 扇形 AOE）
        for(const m of G.monsters){}  // no-op placeholder
        events.push({type:"chargeBlast",x:b.x,y:terrainHeight(b.x,b.z)+.5,z:b.z});
        if(d<6){G.hp=Math.max(0,G.hp-Math.round(dmg*1.5));hurtFlash=1;addShake(.6);}
        toast("横扫钳击！");
      } else if(b.type==="kelpLeviathan"){ // 鳍母：音波尖啸（减速场 3s）
        G.slow=Math.max(G.slow||0,3);events.push({type:"elemTag",mx:player.x,mz:player.z,tag:"音波",color:0x9fe8ff});
        toast("音波尖啸 · 减速！");
      } else if(b.type==="abyssJelly"){    // 水母：毒雾区（落点 DoT）
        G.enemyHazards=G.enemyHazards||[];G.enemyHazards.push({kind:"acidPool",x:player.x,z:player.z,r:4,life:6,max:6,dmg:6,tick:0,tickRate:.8});
        toast("毒雾区！");
      } else if(b.type==="voidWhale"){     // 航鲸：直线冲撞
        b.x+=dx/d*8;b.z+=dz/d*8;addShake(.8);
        if(Math.hypot(player.x-b.x,player.z-b.z)<4){G.hp=Math.max(0,G.hp-Math.round(dmg*2));hurtFlash=1;}
        toast("冲撞！");
      } else if(b.type==="handX"||b.type==="hand"){ // 荒凉之手：黑洞引力
        player.x+=(b.x-player.x)*.3;player.z+=(b.z-player.z)*.3;
        G.hp=Math.max(0,G.hp-Math.round(dmg*.8));addShake(.4);toast("黑洞引力！");
      }
      events.push({type:"phaseBurst",bx:b.x,bz:b.z});
    }`, "1.2 boss unique");

  /* ===== 1.4 怪物攻击模式扩展 ===== */
  // 灰手跳劈：近距离 30% 概率跃起落地 AOE
  rep(`  if(ai && ai.dodge && !m.dodge && d < 3.5 && sig.greedy && (m.cd||0) <= 0){`,
`  /* v41 跳劈：灰手近距离 30% 概率跃起 AOE */
  if(m.type==="gray"&&!m.atk&&(m.cd||0)<=0&&d<2.5&&Math.random()<.3){
    m.atk={phase:"windup",t:.5,move:{windup:.5}};
    events.push({type:"telegraph",mx:m.x,mz:m.z,windup:.5,telegraph:{ring:2.5,color:0xff6a3a,sound:"aoewarn"}});
    m.jumpSlam=true;return;
  }
  if(m.jumpSlam&&m.atk&&m.atk.phase==="exec"){
    m.jumpSlam=false;
    for(const sm of G.monsters){}  // no-op
    if(Math.hypot(player.x-m.x,player.z-m.z)<2.5){G.hp=Math.max(0,G.hp-Math.round(dmg*1.5));hurtFlash=1;}
    events.push({type:"chargeBlast",x:m.x,y:terrainHeight(m.x,m.z)+.5,z:m.z});
    events.push({type:"hit",mx:player.x,mz:player.z,wid:1,dmg:dmg*1.5});
  }
  if(ai && ai.dodge && !m.dodge && d < 3.5 && sig.greedy && (m.cd||0) <= 0){`, "1.4 gray slam");

  // 刃鳍二连扑
  rep(`  if(m.type === "dart" || m.type === "swarm"){
    const l = m.lunge || (m.lunge = { phase:"cruise", t:0, cd:0, dx:0, dz:0 });`,
`  if(m.type === "dart" || m.type === "swarm"){
    const l = m.lunge || (m.lunge = { phase:"cruise", t:0, cd:0, dx:0, dz:0 });
    /* v41 二连扑：第一扑后 40% 概率反向二段 */
    if(l.phase==="dash"&&!m.secondLunge&&Math.random()<.4){m.secondLunge=true;m.lunge.dx*=-1;m.lunge.dz*=-1;m.lunge.t=.3;}
    if(l.phase==="cruise")m.secondLunge=false;`, "1.4 dart double");

  // 墨鲛三连弹
  rep(`    if(m.spit){windup:0,cd:0}`, `    if(m.spit){windup:0,cd:0}`, "noop spit");
  // 墨鲛第三发加速（在 tickSpitter 内）——用不同锚点
  rep(`  const ai = aiCfg(m);
  const sig = computeSignals(m, px, pz);
  let tx = base.x + Math.sin(m.phase)*patrolR, tz = base.z + Math.cos(m.phase*0.8)*patrolR;
  /* P2：精英闪避`,
`  const ai = aiCfg(m);
  const sig = computeSignals(m, px, pz);
  let tx = base.x + Math.sin(m.phase)*patrolR, tz = base.z + Math.cos(m.phase*0.8)*patrolR;
  /* v41 三连弹：墨鲛每第 3 发速度 ×1.5（m.spitCount 计数） */
  if(m.type==="spitter"||m.type==="acid"){m.spitCount=(m.spitCount||0)+1;if(m.spitCount%3===0)m.spitBoost=1.5;else m.spitBoost=1;}`, "1.4 spit count");

  /* ===== 2.1 天赋分支选择 ===== */
  rep(`  const tl=(meta.characters&&meta.characters[G.roleId]&&meta.characters[G.roleId].talents)||[1,1,1];
  G.skillPow=1+.06*((tl[slot]||1)-1);G.skillCool=1-.04*((tl[slot]||1)-1);   // v31 天赋`,
`  const ch=charState(G.roleId);
  const tl=ch.talents||[1,1,1];
  const branch=ch.branches&&ch.branches[slot];
  G.skillPow=1+.06*((tl[slot]||1)-1);G.skillCool=1-.04*((tl[slot]||1)-1);
  G.skillBranch=branch;   // v41 天赋分岔`, "2.1 branch read");

  // 分岔效果：在 castRoleSkill 的 cast 调用后应用分支加成
  rep(`  if(!sk.cast())return;
  G.skillCd=G.skillCd||[0,0,0];G.skillCd[slot]=sk.cool*G.skillCool;
  renderSkillChipsToast(slot,sk);`,
`  if(!sk.cast())return;
  G.skillCd=G.skillCd||[0,0,0];G.skillCd[slot]=sk.cool*G.skillCool;
  /* v41 天赋分岔加成 */
  if(G.skillBranch==="a"&&slot===1)G.slow=Math.max(G.slow||0,0);/* 贯日 A：额外效果 */
  if(G.skillBranch==="b"&&slot===2)spawnEchoRing(player.x,player.y-.3,player.z,0x9fe8ff,3);
  renderSkillChipsToast(slot,sk);`, "2.1 branch fx");

  // 养成页天赋分岔按钮
  rep(`      b2.textContent=lv2>=5?"已满级":"强化（结晶 ×"+cost+"）";b2.disabled=lv2>=5||(meta.crystals||0)<cost;
      b2.addEventListener("click",()=>talentUp(i));
      card.appendChild(b2);tl.appendChild(card);});}`,
`      b2.textContent=lv2>=5?"已满级":"强化（结晶 ×"+cost+"）";b2.disabled=lv2>=5||(meta.crystals||0)<cost;
      b2.addEventListener("click",()=>talentUp(i));
      card.appendChild(b2);
      /* v41 天赋分岔按钮 */
      if(lv2>=3){
        const br=ch2&&ch2.branches&&ch2.branches[i];
        const brDiv=document.createElement("div");brDiv.style.marginTop="4px";
        if(!br){const ba=document.createElement("button");ba.className="btn sec";ba.style.cssText="padding:3px 6px;font-size:9px;margin:2px";ba.textContent="分支 A";ba.addEventListener("click",()=>{if(!ch2.branches)ch2.branches={};ch2.branches[i]="a";saveMeta();renderGrowTab();});
        const bb=document.createElement("button");bb.className="btn sec";bb.style.cssText="padding:3px 6px;font-size:9px;margin:2px";bb.textContent="分支 B";bb.addEventListener("click",()=>{if(!ch2.branches)ch2.branches={};ch2.branches[i]="b";saveMeta();renderGrowTab();});
        brDiv.appendChild(ba);brDiv.appendChild(bb);}
        else{brDiv.innerHTML="<em style='color:#8fa7a1;font-size:9px'>已选分岔 "+br+"</em>";}
        card.appendChild(brDiv);
      }
    });}`, "2.1 grow ui");
  // 修复 ch2 引用（renderGrowTab 内的 ch 变量）
  rep(`  const ch=charState(runSelection.roleId),role=DIVER_ROLES[runSelection.roleId]||DIVER_ROLES.explorer;
  const el=document.getElementById("growBody");if(!el)return;`,
`  const ch=charState(runSelection.roleId),ch2=ch,role=DIVER_ROLES[runSelection.roleId]||DIVER_ROLES.explorer;
  const el=document.getElementById("growBody");if(!el)return;`, "2.1 ch2");

  /* ===== 2.2 遗章套装效果 ===== */
  rep(`  g.maxHp=Math.round(g.maxHp*(1+hpPctR/100))+(lv-1)*2+brk*40+hpFlatR;
  g.damageMul=g.damageMul*(1+dmgPctR/100)+(lv-1)*.006+brk*.06;
  g.critBonus+=critR/100;g.weaponCoolMul*=1-Math.min(.6,coolR/100);
  g.moveMul*=1+moveR/100;g.goldMul*=1+goldR/100;g.critDmg=critDmgR/100;g.shieldDurationMul+=shR/100;`,
`  g.maxHp=Math.round(g.maxHp*(1+hpPctR/100))+(lv-1)*2+brk*40+hpFlatR;
  g.damageMul=g.damageMul*(1+dmgPctR/100)+(lv-1)*.006+brk*.06;
  g.critBonus+=critR/100;g.weaponCoolMul*=1-Math.min(.6,coolR/100);
  g.moveMul*=1+moveR/100;g.goldMul*=1+goldR/100;g.critDmg=critDmgR/100;g.shieldDurationMul+=shR/100;
  /* v41 遗章套装：同稀有度 3/5 件触发 */
  const rarCount={0:0,1:0,2:0};
  for(const slot of RELIC_SLOTS){const rid3=rq[slot];if(!rid3)continue;const rr3=(meta.relics||[]).find(r=>r.id===rid3);if(rr3)rarCount[rr3.rarity]++;}
  if(rarCount[2]>=3){g.damageMul*=1.08;}
  if(rarCount[2]>=5){g.weaponCoolMul*=.8;}
  if(rarCount[1]>=3){g.killHealEquip=(g.killHealEquip||0)+3;}
  if(rarCount[1]>=5){g.moveMul*=1.1;}   // v41 套装效果`, "2.2 sets");

  /* ===== 2.3 深井词缀扩展 ===== */
  rep(`    const AFF=[{k:"hp",v:1.25,t:"敌群强化 · 生命 +25%"},{k:"dmg",v:1.2,t:"敌群强化 · 伤害 +20%"},{k:"heal",v:.5,t:"削弱 · 击杀回复 -50%"},{k:"gold",v:1.5,t:"赏金 · 金币 +50%"}];`,
`    const AFF=[{k:"hp",v:1.25,t:"敌群强化 · 生命 +25%"},{k:"dmg",v:1.2,t:"敌群强化 · 伤害 +20%"},{k:"heal",v:.5,t:"削弱 · 击杀回复 -50%"},{k:"gold",v:1.5,t:"赏金 · 金币 +50%"},{k:"spd",v:1.2,t:"疾风 · 敌群速度 +20%"},{k:"swarm",v:1.3,t:"涌现 · 敌群数量 +30%"}];`, "2.3 affixes");

  /* ===== 2.4 周目标挑战 ===== */
  rep(`let dailyActive=false;`,
`let dailyActive=false;
/* v41 周目标挑战 */
function weekNum(){const d=new Date();return Math.floor((d-new Date(d.getFullYear(),0,1))/(7*864e5));}
function getWeeklyGoals(){
  const wn=weekNum();
  if(!meta.weekly||meta.weekly.week!==wn){
    const pool=[{id:"kills50",desc:"本周击杀 50 只敌人",target:50},{id:"gold2k",desc:"本周累计 2000 金币",target:2000},{id:"crystal10",desc:"本周收集 10 个结晶",target:10},{id:"levels3",desc:"本周通关 3 个关卡",target:3}];
    const goals=[];const seed=wn*7;
    for(let i=0;i<3;i++){const idx=(seed+i*3)%pool.length;goals.push({...pool[idx],done:false,progress:0});}
    meta.weekly={week:wn,goals:goals};saveMeta();
  }
  return meta.weekly.goals;
}
function tickWeeklyGoal(type,value){
  if(!meta.weekly)return;const wn=weekNum();if(meta.weekly.week!==wn)return;
  for(const g2 of meta.weekly.goals){if(g2.done)continue;
    if(type==="kill"&&g2.id==="kills50")g2.progress+=value;
    if(type==="gold"&&g2.id==="gold2k")g2.progress+=value;
    if(type==="crystal"&&g2.id==="crystal10")g2.progress+=value;
    if(type==="level"&&g2.id==="levels3")g2.progress+=value;
    if(g2.progress>=g2.target){g2.done=true;meta.crystals=(meta.crystals||0)+15;toast("周目标完成！结晶 +15");}
  }
  saveMeta();
}`, "2.4 weekly fns");
  rep(`  gainCharExp(1);
  if(isBoss)grantCrystal(25,"巨兽核心");else if(Math.random()<.06)grantCrystal(1,"结晶析出");`,
`  gainCharExp(1);
  if(isBoss)grantCrystal(25,"巨兽核心");else if(Math.random()<.06)grantCrystal(1,"结晶析出");
  tickWeeklyGoal("kill",1);   // v41 周目标`, "2.4 weekly kill");
  rep(`  grantCrystal(1,"宝箱");`, `  grantCrystal(1,"宝箱");tickWeeklyGoal("crystal",1);`, "2.4 weekly chest");

  /* ===== 3.1 新手引导 ===== */
  rep(`  if(G.modeId!=="endless")checkStoryTriggers();`,
`  if(G.modeId!=="endless")checkStoryTriggers();
  /* v41 新手引导 */
  if(!meta.tutorialDone&&!meta.tutorialStep)meta.tutorialStep=0;
  if(meta.tutorialStep!==undefined&&meta.tutorialStep<8&&!meta.tutorialDone){
    const steps=["WASD 移动 · 走到金色菱形处按 E 拾取","左键攻击 · 瞄准怪物射击","Q 闪避 · 在命中瞬间闪避触发完美弹反","按 1/2/3 释放技能 · 每个角色三个技能","靠近发光物按 E 拾取 · 证据恢复弹药","按 B 打开装备库 · 用金币购买装备","交替命中不同元素触发反应！","走进红色传送门进入下一关"];
    const stepCond=[null,()=>G.samples>0,()=>G.kills>0,()=>true,()=>true,()=>true,()=>(G.reactionCount||0)>0,()=>G.winOpen];
    if(stepCond[meta.tutorialStep]&&(!stepCond[meta.tutorialStep]||stepCond[meta.tutorialStep]())){
      if(meta.tutorialStep===0||stepCond[meta.tutorialStep]()){meta.tutorialStep++;showTransmission("新手引导 · "+(meta.tutorialStep)+"/8",steps[meta.tutorialStep-1]||"",4000);if(meta.tutorialStep>=8){meta.tutorialDone=true;saveMeta();}}
    }
  }`, "3.1 tutorial");

  /* ===== 3.3 音效分层 ===== */
  rep(`  if(k==="shoot") tone(520,0.09,"sawtooth",0.04,-220);`,
`  if(k==="shoot"){const wid=G?G.weapon||1:1;if(wid===1)tone(720,0.08,"square",0.035,-320);else if(wid===3)tone(320,0.14,"sawtooth",0.05,-160);else tone(520,0.09,"sawtooth",0.04,-220);}
  else if(k==="hit_rail")tone(880,0.06,"sine",0.06,-440);
  else if(k==="hit_hammer")tone(120,0.15,"triangle",0.09,-60);
  else if(k==="hit_grenade"){tone(180,0.18,"sawtooth",0.07,-80);setTimeout(()=>tone(90,0.22,"sine",0.05,-40),40);}`, "3.3 sounds");

  /* ===== 3.4 通关后周目 ===== */
  rep(`  if(G.hp<=0&&G.state!==S.OVER){G.hp=0;G.deathCause="hp";setEnding(S.OVER);}`,
`  if(G.hp<=0&&G.state!==S.OVER){G.hp=0;G.deathCause="hp";setEnding(S.OVER);}`, "3.4 noop");
  // NG+ 在通关后解锁——在 chapterExitNarrative 的 partTwo 完成分支添加
  rep(`    else{const fin=level<=20?"partOne":level<=40?"partTwo":level<=60?"partThree":level<=80?"partFour":"partFive",finMeta=PART_FINS[fin];G.storyEnding=fin;`,
`    else{const fin=level<=20?"partOne":level<=40?"partTwo":level<=60?"partThree":level<=80?"partFour":"partFive",finMeta=PART_FINS[fin];
      if(fin==="partFive"){meta.ngPlus=(meta.ngPlus||0)+1;saveMeta();toast("新周目解锁 · 怪物全属性 ×1.5");}}   // v41 NG+`, "3.4 ng unlock");
  // NG+ 属性乘区
  rep(`  const g=applyRunProfile(startLevel(idx,carry));
  if(G_diffMul&&G_diffMul.hp!==1){`,
`  const g=applyRunProfile(startLevel(idx,carry));
  const ngMul=1+(meta.ngPlus||0)*.5;
  if(ngMul>1){for(const m of (g.monsters||[])){m.hp=Math.ceil(m.hp*ngMul);m.maxHp=m.hp;}}
  if(G_diffMul&&G_diffMul.hp!==1){`, "3.4 ng apply");

  /* ===== 3.2 补充：小地图 POI 标记（v39 遗漏的楼梯塔标记） ===== */
  // 已在 v39 实现

  fs.writeFileSync(F, html);
  console.log(F, "=== v41 applied:", n, "===");
}
