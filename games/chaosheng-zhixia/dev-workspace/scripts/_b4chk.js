
/* 内联: logic.js */
/* ============================================================
   潮声之下 · 深渊潜航 — 纯逻辑模块（零依赖）
   ------------------------------------------------------------
   来源：prototypes/潮声之下_深渊潜航3D_v0.html  LOGIC-START(159) ~ LOGIC-END(372)
   抽取方式：原样拷贝，不改任何函数语义；仅追加文末导出块。
   约束：本文件不得 import THREE/DOM、不得读 DOM、不得碰 localStorage。
   环境自适应导出（ADR-001）：
     - Node   : module.exports（供 node:test 直测，含 _setState 测试钩子）
     - 浏览器 : globalThis.__D3D_LOGIC（与原型 __D3D.logic 对齐）
   ------------------------------------------------------------
   CSD-M2（Sprint 2 怪物+5 关）：纯内容扩展
     - 新增 MONSTER_TYPES / BOSS_TYPES / LEVELS / TERRAIN_PRESETS（权威表，§1/§2）
     - freshRun(levelCfg?)：无参 = 默认灰手配置（既有 92 测试语义不破）
     - startLevel(idx, carry)：跨关保留 score/ammo，重置氧/样本/怪物等
     - tickMonsters 按 m.type 分发（gray/elite 追击分支；dart 扑击；spitter 喷吐）
     - tickSpitPulses：墨鲛喷吐弹（复用 pulses 模式独立数组）
     - checkWin / objectiveMet / nearestTarget 按 objective.kind 分发
     - 击杀得分：tickPulses/castEcho 的 +25 硬编码 → G.score += m.score
     - tickBoss 参数化（hand / handX）
   ============================================================ */

/*==LOGIC-START==*/
const TARGET_SAMPLES = 8;
const BOSS_HP = 12;
/* 武器权威表（武器系统设计 §6 / GDD §6，v1.1 用户已拍板）：
   1=声呐脉冲（修订射程：速度 24×寿命 1.0=射程 24；冷却/伤害/击退不变）
   2=渊棘之矛（伤害 3+冷却 1.5 保守档、射程 40、弹药上限 6/开局 4/样本 +2、击退 0.8）
   3=深渊回响（伤害 2、半径 7 以玩家位置即时结算、冷却 3.0、击退 3.0、不产生飞行弹丸）
   命中半径：灰手 1.6 / BOSS 2.4（复用既有 tickPulses 判定） */
const WEAPONS = {
  1:{ name:"磁轨脉冲", dmg:1.6, cool:0.42, speed:34, life:1.35, knock:1.0, hitR:1.6, bossR:2.4 },   // 浣生 · 远程点射
  2:{ name:"渊棘之矛", dmg:3, cool:1.5,  speed:40, life:1.0, knock:0.8, hitR:1.6, bossR:2.4, ammoMax:6 },
  3:{ name:"榴弹回响", dmg:2.2, cool:0.9,  speed:18, life:1.25, knock:2.4, hitR:1.6, bossR:2.4, blast:2.8 },   // 帕米尔 · 范围（命中爆裂）
  4:{ name:"裂甲重锤", dmg:2.6, cool:0.55, radius:3.4, halfAngle:1.05, knock:2.6, melee:true }   // 迈尔辛 · 近战扇击
};
const ROLE_WEAPON={explorer:1,guardian:4,hunter:3};   // v28：每角色仅一把专属武器
const AMMO_START = 4;   // 渊棘开局弹药
const AMMO_MAX   = 6;   // 渊棘弹药上限
const AMMO_GAIN  = 2;   // 拾取样本回补
/* S6/S7 预警参数（GDD §7 建议 1/2；主循环以 opts 显式启用，默认关闭保持既有语义） */
const MONSTER_WINDUP = 0.4;    // 灰手起手前摇（秒）
const BOSS_WARN_DIST = 4.5;    // BOSS 接触预警距离 = 追击停止半径（距玩家 <3 前红光预警）
const S = { MENU:"MENU", PLAYING:"PLAYING", PAUSED:"PAUSED", OVER:"OVER", WIN:"WIN" };
let G = null;
/* v23 修复：跨脚本桥接。v13 起 fireWeapon/playerHit/tickPulses 引用了渲染层的 runBuild，
   但渲染脚本作用域与逻辑脚本分离 → 命中结算一直抛 ReferenceError（v22 开火实际不生效）。
   此处在逻辑脚本顶层声明 var（全局可见），渲染层启动时直接赋值同一绑定。 */
var runBuild = null;
var G_diffMul = {hp:1,dmg:1,gold:1};   // v39 难度系数


/* ============================================================
   v23.1 深渊元素体系：三武器对应三元素，附着后异元相遇触发反应
   潮(声呐·青) + 蚀(渊棘·紫) = 锈蚀：目标 5s 受伤 +25%
   潮 + 震(回响·金)          = 涌爆：范围爆破（半径 3.2 + 击退）
   蚀 + 震                   = 碎甲：韧性伤害 ×2.5（加速破韧处决）
   附着持续 6s，反应消耗双方附着；BOSS 同样可附着/反应。
   ============================================================ */
const ELEM_OF_WEAPON={1:"tide",2:"corrode",3:"quake",4:"corrode"};
const ELEM_INFO={tide:{name:"潮",color:0x5fe0ff},corrode:{name:"蚀",color:0xc084ff},quake:{name:"震",color:0xffc766},frost:{name:"霜",color:0x9fd8ff},volto:{name:"雷",color:0xff7fb2},sonic:{name:"声",color:0x9fffc2}};   // v30 元素 6 系
const REACTION_TABLE={
  "corrode+tide":{kind:"rust",name:"锈蚀",color:0xa8ffc2},
  "quake+tide":{kind:"surge",name:"涌爆",color:0x7fd0ff},
  "corrode+quake":{kind:"shatter",name:"碎甲",color:0xffd66b},
  "frost+quake":{kind:"shattergem",name:"碎晶",color:0xbfe8ff},
  "frost+tide":{kind:"freeze",name:"凝冻",color:0xd8f3ff},
  "tide+volto":{kind:"conduct",name:"感电",color:0xff9fc0},
  "quake+volto":{kind:"magnet",name:"磁爆",color:0xe8b0ff}
};   // v30：+碎晶/凝冻/感电/磁爆（声波=扩散，见 applyElementHit）
function elemPair(a,b){ return a<b ? a+"+"+b : b+"+"+a; }
/* v30 元素护盾：精英/巨兽的第二条盾条；克制元素 ×3 破盾，同元素 ×0.5，盾在则完全格挡生命伤害 */
const SHIELD_COUNTER={tide:"corrode",corrode:"frost",frost:"quake",quake:"volto",volto:"tide",sonic:"quake"};
const SHIELD_ELEMS=["tide","corrode","quake","frost","volto","sonic"];
function shieldGate(m,dealt,elem){
  if(!m.eshield||m.eshield.hp<=0)return{hp:dealt,sh:0,brk:false};
  const eff=(elem&&SHIELD_COUNTER[m.eshield.elem]===elem)?3:(elem===m.eshield.elem?.5:1);
  const to=Math.min(m.eshield.hp,dealt*eff);
  m.eshield.hp-=to;
  return{hp:0,sh:Math.round(to),brk:m.eshield.hp<=0};
}
function applyElementHit(m, elem, hits){
  if(!elem || !m || m.hp<=0) return;
  const aura=m.aura;
  if(aura && aura.t>0 && aura.e!==elem){
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
    const rx=REACTION_TABLE[elemPair(aura.e,elem)];
    m.aura=null;
    if(rx) triggerReaction(m,rx,hits);
    return;
  }
  const isNew=!aura || aura.t<=0;
  m.aura={e:elem,t:6};m.lastElem=elem;   // v34 F2 记录最后元素（死亡溶解用）
  if(isNew){ const ei=ELEM_INFO[elem]; hits.push({type:"elemTag", mx:m.x, mz:m.z, tag:ei.name, color:ei.color}); }
}
function triggerReaction(m, rx, hits){
  const px=m.x, pz=m.z, base=Math.max(1,Math.round((G.damageMul||1)*2));
  if(rx.kind==="rust"){
    m.rust={t:5}; m.hp-=damageAmount(base);
  } else if(rx.kind==="surge"){
    const ms=G.monsters||[];
    for(const sm of ms){
      if(sm.hp<=0||sm.evade) continue;
      const sd=Math.sqrt((sm.x-px)**2+(sm.z-pz)**2);
      if(sd<3.2){
        const sdmg=damageAmount(base*2);
        sm.hp-=sdmg;
        if(!(sm.break&&sm.break.t>0)){ sm.x+=(sm.x-px)/(sd||1)*1.6; sm.z+=(sm.z-pz)/(sd||1)*1.6; }
        if(sm.hp<=0){ noteKill(sm); hits.push({type:"kill",mx:sm.x,mz:sm.z,wid:1,target:sm.type,dmg:sdmg}); }
      }
    }
    if(G.boss&&G.boss.hp>0){ const bd=Math.sqrt((G.boss.x-px)**2+(G.boss.z-pz)**2); if(bd<3.6) G.boss.hp-=damageAmount(base*1.5); }
  } else if(rx.kind==="shatter"){
    if(m.poise) applyPoiseHit(m, 2, 2.5);
    m.hp-=damageAmount(base);
  }
  else if(rx.kind==="shattergem"){ if(m.poise)applyPoiseHit(m,2,2.5); m.hp-=damageAmount(base*1.5); }
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
  if(rx.kind!=="surge" && m.hp<=0){ noteKill(m); hits.push({type:"kill",mx:m.x,mz:m.z,wid:1,target:m.type,dmg:base}); }
  G.reactionCount=(G.reactionCount||0)+1;   // v23.5：反应计数（渲染层按里程碑发奖）
  hits.push({type:"reaction", kind:rx.kind, name:rx.name, color:rx.color, mx:px, mz:pz});
}
/* v23.1 巨兽阶段机制：环形墨弹幕（P2 入阶段）——由 tickBoss 延迟结算调用 */
function bossRadialBurst(b, count, speed){
  const arr = G.spitPulses = G.spitPulses || [];
  for(let i=0;i<count;i++){
    const a = i/count*Math.PI*2 + Math.random()*.35;
    arr.push({ x:b.x, y:terrainHeight(b.x,b.z)+1.6, z:b.z,
               vx:Math.cos(a)*speed, vz:Math.sin(a)*speed, life:2.6, r:1.0, dmg:8, kind:"ink" });
  }
}
/* ============================================================
   v23.3 巨兽专属技能：按 bossType 独立冷却，蓄能→金色预警圈→结算
   乌娜之盾「壳刺齐射」：扇形三连裂伤棘刺
   锤翅母兽「尾锤横扫」：预警圈落点重击（1.8× 接触伤害）
   洛克镜像「麻痹水雾」：范围减速 + 伤害
   脊柱航鲸「引力吞吸」：把玩家拽向巨兽（拉拽由渲染层结算位移）
   ============================================================ */
const BOSS_SIGNATURE={
  reefCrab:{name:"壳刺齐射",cd:7,windup:.7,ring:2.2,kind:"spikes"},
  kelpLeviathan:{name:"尾锤横扫",cd:9,windup:1.0,ring:4.2,kind:"slam"},
  abyssJelly:{name:"麻痹水雾",cd:8,windup:.9,ring:5,kind:"mist"},
  voidWhale:{name:"引力吞吸",cd:10,windup:.9,ring:7,kind:"pull"}
};
function resolveBossSignature(b, sig, px, pz, dmg, events){
  const tx=b.sigX, tz=b.sigZ;
  if(sig.kind==="spikes"){
    const arr=G.spitPulses=G.spitPulses||[];
    const base=Math.atan2(tz-b.z,tx-b.x);
    for(let i=-1;i<=1;i++){
      const a=base+i*.28;
      arr.push({ x:b.x, y:terrainHeight(b.x,b.z)+2, z:b.z,
                 vx:Math.cos(a)*7, vz:Math.sin(a)*7, life:2.2, r:1, dmg:8, status:"bleed", kind:"blade" });
    }
    events.push({ type:"phaseBurst", bx:b.x, bz:b.z });
  } else if(sig.kind==="slam"){
    if(Math.hypot(px-tx,pz-tz)<sig.ring && playerHit(dmg*1.8)) events.push({ type:"hurt", bx:b.x, bz:b.z });
    events.push({ type:"phaseQuake", bx:tx, bz:tz });
  } else if(sig.kind==="mist"){
    if(Math.hypot(px-tx,pz-tz)<sig.ring){
      G.slow=Math.max(G.slow||0,3);
      if(playerHit(6)) events.push({ type:"hurt", bx:b.x, bz:b.z });
    }
    events.push({ type:"elemTag", mx:tx, mz:tz, tag:"麻痹", color:0xbc83ff });
  } else if(sig.kind==="pull"){
    events.push({ type:"sigPull", bx:b.x, bz:b.z, radius:sig.ring+2, strength:4 });
    events.push({ type:"phaseBurst", bx:b.x, bz:b.z });
  }
}

/* ---- CSD-H2：独立 HP 双资源 + 怪物强化三档（设计 §1/§2） ----
   HP_MAX：生命上限（仅受击扣减 / 样本 +8 回补 / 跨关重置 100）。
   currentBoost：当前强化档（1|2|3，默认 3=大幅；setMonsterBoost 运行时可调）。
   retryCount：连续死亡重试计数（跨局持久；>3 → 下一新局自动降一档；通关/新局重置）。 */
const HP_MAX = 70;   // CSD-SOUL1-HARD：生命上限 100→70（2~3 次失误即倒，更接近魂系容错）
let currentBoost = 3;
let retryCount = 0;

/* ---- CSD-M2：怪物类型权威表（怪物与关卡设计 §1.1；灰手=现有默认路径，92 测试不破） ---- */
const MONSTER_TYPES = {
  /* CSD-SOUL1-AGGRO：索敌范围 ×10（地图 ±62 全图索敌——怪物从地图任意处发现并追击玩家） */
  gray:    { hp:4,  speed:1.8, chaseR:120, patrolR:3,  dmg:13, score:25, windup:0.38 },
  dart:    { hp:3,  speed:2.8, chaseR:140, patrolR:4,  dmg:11, score:20,
             lunge:{ triggerR:8, windup:0.5, dashSpeed:9, dashDur:0.45, cooldown:1.5 } },
  spitter: { hp:3,  speed:1.6, engageR:160, keepDist:10, dmg:9, score:25,
             spit:{ windup:0.6, speed:6, life:3.0, cooldown:2.0 } },
  elite:   { hp:8,  speed:2.2, chaseR:140, patrolR:3,  dmg:17, score:50, windup:0.46, bossBar:true },
  shield:  { hp:10, speed:1.65,chaseR:150, patrolR:2,  dmg:18, score:58, windup:.52, bossBar:true },
  acid:    { hp:6,  speed:1.5, engageR:170, patrolR:3,keepDist:8, dmg:12, score:42, spit:{windup:.7,speed:5.5,life:3.2,cooldown:2.2} },
  sniper:  { hp:5,  speed:1.25,engageR:190,patrolR:4,keepDist:22,dmg:22, score:52, spit:{windup:1.35,speed:15,life:4,cooldown:3.2} },
  swarm:   { hp:1,  speed:4.0, chaseR:170, patrolR:5, dmg:7, score:9, lunge:{triggerR:7,windup:.3,dashSpeed:11,dashDur:.3,cooldown:1.3} }
};
/* BOSS 变体（L5 用 handX；L3 精英走 tickMonsters 不走 tickBoss） */
const BOSS_TYPES = {
  reefCrab:      { hp:18, speed:1.0, dmg:16, guardR:120, warn:5.0, hitR:3.8, score:120 },
  kelpLeviathan: { hp:24, speed:1.5, dmg:18, guardR:120, warn:5.5, hitR:3.4, score:150 },
  abyssJelly:    { hp:28, speed:1.1, dmg:20, guardR:120, warn:6.0, hitR:3.6, score:180 },
  voidWhale:     { hp:34, speed:1.35,dmg:23, guardR:120, warn:6.5, hitR:4.2, score:220 },
  hand:  { hp:12, speed:1.2, dmg:20, guardR:120, warn:4.5, score:100 },  // CSD-SOUL1-AGGRO：guardR ×10（BOSS 全图追击，不再死守裂口）
  handX: { hp:18, speed:1.4, dmg:24, guardR:120, warn:5.5, score:150 }   // 深渊态（新增，§1.6）
};
/* CSD-H2：怪物强化三档权威表（设计 §2.2；T1 = M1 基线，T3 = 默认·大幅）
   结构：MONSTER_BOOST[档位][类型]；未列项（HP/巡逻半径/得分等）沿用 MONSTER_TYPES / BOSS_TYPES。
   - gray/elite 含受击硬直 cd（被击中后 cd 秒内不抬手；T3 0.3 = 频率翻倍真实载体）
   - hand（基础版沉者之手）不强化（GDD §6 权威值不变） */
const MONSTER_BOOST = {
  1: { // T1（基线 = M1 v1.1 原值；L1 教学关恒锁定此档）CSD-SOUL1-AGGRO：chaseR/engageR ×10
    gray:    { hp:4, speed:1.8, chaseR:120, windup:0.38, cd:0.55, dmg:13 },
    dart:    { hp:3, speed:2.8, chaseR:140, dmg:11,
               lunge:{ triggerR:8, windup:0.5, dashSpeed:9, dashDur:0.45, cooldown:1.5 } },
    spitter: { hp:3, engageR:160, dmg:9,
               spit:{ windup:0.6, speed:6, life:3.0, cooldown:2.0 } },
    elite:   { hp:8, speed:2.2, chaseR:140, windup:0.46, cd:0.55, dmg:17 },
    handX:   { hp:18, speed:1.4, dmg:24 }
  },
  2: { // T2（熔断降档：首通率 <50% / 平均重试 >3 → 全局降一档）CSD-SOUL1-AGGRO：×10
    gray:    { hp:5, speed:2.35, chaseR:150, windup:0.3, cd:0.38, dmg:14 },
    dart:    { hp:4, speed:3.0, chaseR:150, dmg:12,
               lunge:{ triggerR:8, windup:0.45, dashSpeed:9, dashDur:0.45, cooldown:1.3 } },
    spitter: { hp:4, engageR:170, dmg:10,
               spit:{ windup:0.55, speed:6, life:3.0, cooldown:1.7 } },
    elite:   { hp:11, speed:2.4, chaseR:150, windup:0.42, cd:0.46, dmg:18 },
    handX:   { hp:20, speed:1.45, dmg:25 }
  },
  3: { // T3（默认·大幅）CSD-SOUL1-HARD：速度/频率/伤害/血量全面上调 + AGGRO：索敌 ×10（L1 教学关仍锁 T1）
    gray:    { hp:6, speed:3.2, chaseR:180, windup:0.23, cd:0.2, dmg:15 },
    dart:    { hp:5, speed:3.35, chaseR:160, dmg:13,
               lunge:{ triggerR:8, windup:0.38, dashSpeed:10.5, dashDur:0.5, cooldown:1.1 } },
    spitter: { hp:5, engageR:180, dmg:11,
               spit:{ windup:0.42, speed:7.0, life:3.0, cooldown:1.3 } },
    elite:   { hp:14, speed:2.75, chaseR:160, windup:0.34, cd:0.34, dmg:20 },
    handX:   { hp:28, speed:1.7, dmg:30 }
  }
};
/* ============================================================
   CSD-SOUL1-P1：魂系怪物系统 P1（招式池 / 三层预警 / 基础韧性）
   ------------------------------------------------------------
   设计源：design/gdd/魂系怪物系统设计.md §2 招式系统 / §2.2 三层预警 / §4 韧性·处决
   兼容铁律（用户已拍板：P1 先行 / 处决 8 保守档）：
   - moves/poise 为【平行配置表】，不写入 MONSTER_TYPES/BOSS_TYPES（既有 deepEqual 快照不破）
   - 运行时经 soulOn 开关（setSoul）挂到类型怪实例 m.moves/m.poise：
       soulOn=false（既有测试默认）→ 原路径零变化（132 测试不破）
   - 基础 dmg/hp/speed/windup/cd 全部保留（H2 权威值不动），魂系化全部经招式倍率+韧性叠加
   ============================================================ */
let soulOn = false;
function setSoul(on){ soulOn = !!on; return soulOn; }
/* 种子 RNG（mulberry32）：招式概率分派 / 冷却抖动用，保证测试确定性；既有 Math.random() 调用不触碰 */
let __seed = 0x9e3779b9;
function __rng(){
  __seed |= 0; __seed = __seed + 0x6D2B79F5 | 0;
  let t = Math.imul(__seed ^ __seed >>> 15, 1 | __seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
}
function setSeed(s){ __seed = (s|0) || 1; return __seed; }
/* 韧性表（设计 §4.1 T3 基线）：max=破韧所需累积韧性伤害；regen=衰减速率；regenDelay=距上次受击后开始衰减
   CSD-SOUL1-HARD：破韧门槛上调（灰手 3→4 / 精英 8→10 / hand 11→13 / handX 16→18）——
   处决机会更难挣，需更持续地压制韧性。 */
const SOUL_POISE = {
  gray:    { max:4,  regen:2.0, regenDelay:2.0 },
  dart:    { max:3,  regen:2.5, regenDelay:2.0 },
  spitter: { max:3,  regen:2.5, regenDelay:2.0 },
  elite:   { max:10, regen:2.0, regenDelay:2.0 },
  shield:  { max:12, regen:1.6, regenDelay:2.4 },
  acid:    { max:5,  regen:2.2, regenDelay:2.0 },
  sniper:  { max:4,  regen:2.4, regenDelay:1.8 },
  swarm:   { max:1,  regen:3.0, regenDelay:1.2 },
  reefCrab:{ max:12,regen:1.7,regenDelay:2.4 },
  kelpLeviathan:{ max:14,regen:1.6,regenDelay:2.4 },
  abyssJelly:{ max:15,regen:1.5,regenDelay:2.5 },
  voidWhale:{ max:17,regen:1.4,regenDelay:2.6 },
  hand:    { max:13, regen:1.5, regenDelay:2.5 },
  handX:   { max:18, regen:1.5, regenDelay:2.5 }
};
/* 韧性伤害（玩家侧固定，不随档位）：声呐 1.5 / 渊棘 2.5 / 回响 3.0（设计 §4.1） */
const POISE_DMG = {
  1:2.4, 2:4.0, 3:4.8   // v24.6：随怪物生命 ×1.6 同步放大，破韧节奏不变
};
/* 处决窗口（设计 §4.2 表）：break 态可处决时长（秒） */
const EXEC_WINDOW = { gray:1.0, dart:1.0, spitter:1.0, elite:1.5, reefCrab:1.7, kelpLeviathan:1.7, abyssJelly:1.8, voidWhale:1.9, hand:1.8, handX:2.0 };
/* 处决伤害（用户拍板保守档）：杂兵即死 / 精英 8 / BOSS 8（0 = 即死） */
const EXEC_DMG = { gray:0, dart:0, spitter:0, elite:13, reefCrab:13, kelpLeviathan:13, abyssJelly:13, voidWhale:13, hand:8, handX:8 };
/* 招式池（设计 §2.3-2.8）：schema {id,type,dmgMult,windup,active,recover,interruptible,
   trigger:{dist,chance,hp,phase}, telegraph:{ring,color,sound}}。
   - chance 0 = 依赖 P2 信号（贪刀/绕背/站桩）才触发，P1 不自动选招（schema 预留）
   - phase [2,3] 的招 = BOSS 多阶段预留（P3），P1 恒 phase=1 → 不选（字段先预留）
   - dash 招附带 dash:{speed,dur}（§2.4/2.6/2.8）；projectile 招附带 shot:{count,fan,speed,life}（§2.5）
   - 「前摇 <0.4s 的招」必须满足 §2.2 裁决：dmgMult≤1.0 且 L3 音效存在（测试校验） */
const SOUL_MOVES = {
  /* 灰手 gray（§2.3）：HP3 / 基础 12 / 速 2.6 T3 */
  gray: [
    { id:"claw", type:"melee", dmgMult:1.0, windup:0.25, active:0.1, recover:0.3, interruptible:true,
      trigger:{ dist:[0,2.4], chance:1.0, hp:[0,1], phase:[1,3] },
      telegraph:{ ring:0, color:0xff2244, sound:"warn" } },
    { id:"combo", type:"combo", dmgMult:0.7, hits:2, windup:0.3, active:0.2, recover:0.5, interruptible:false,
      trigger:{ dist:[0,2.0], chance:0, hp:[0,1], phase:[1,3], signal:"greedy", sigChance:0.7 },   // 贪刀反制
      telegraph:{ ring:0, color:0xff2244, sound:"comboWarn" } },
    { id:"slam", type:"charge", dmgMult:1.5, windup:0.6, active:0.15, recover:0.8, interruptible:false,
      trigger:{ dist:[2.4,4.5], chance:0.3, hp:[0,1], phase:[1,3], signal:"still", sigChance:0.5 },
      telegraph:{ ring:2.2, color:0xff2244, sound:"chargeWarn" } },
    { id:"abyssHowl", type:"buff", dmgMult:0, windup:0.75, active:0.12, recover:1.8, interruptible:true,
      skill:{ kind:"rally", radius:12, duration:6 },
      trigger:{ dist:[3,12], chance:0.22, hp:[0,0.75], phase:[1,3] },
      telegraph:{ ring:3.6, color:0xb05cff, sound:"aoewarn" } },
    { id:"shadowAmbush", type:"blink", dmgMult:1.2, windup:0.55, active:0.12, recover:1.15, interruptible:false,
      trigger:{ dist:[4.5,9], chance:0.18, hp:[0,1], phase:[1,3], signal:"still", sigChance:0.5 },
      telegraph:{ ring:1.5, color:0xb05cff, sound:"chargeWarn" } }
  ],
  /* 刃鳍 dart（§2.4）：HP2 / 基础 10 / 巡航 2.8 T3 */
  dart: [
    { id:"lunge", type:"dash", dmgMult:1.0, windup:0.45, active:0.5, recover:1.2, interruptible:true,
      dash:{ speed:9.5, dur:0.5 },
      trigger:{ dist:[0,8], chance:1.0, hp:[0,1], phase:[1,3] },
      telegraph:{ ring:0, color:0xff2244, sound:"warn" } },
    { id:"pierce", type:"dash", dmgMult:1.5, windup:0.7, active:0.7, recover:1.6, interruptible:false,
      dash:{ speed:11, dur:0.7 },
      trigger:{ dist:[8,14], chance:0.25, hp:[0,1], phase:[1,3], signal:"still", sigChance:0.45 },
      telegraph:{ ring:1.2, color:0xff2244, sound:"chargeWarn" } },   // 直线带（宽 1.2）
    { id:"combo", type:"combo", dmgMult:0.7, hits:1, windup:0.25, active:0.1, recover:0.6, interruptible:false,
      trigger:{ dist:[0,2.0], chance:0, hp:[0,1], phase:[1,3], signal:"greedy", sigChance:0.6 },   // 落空贴脸惩罚
      telegraph:{ ring:0, color:0xff2244, sound:"comboWarn" } },
    { id:"sweep", type:"aoe", dmgMult:1.2, windup:0.5, active:0.15, recover:0.8, interruptible:true,
      trigger:{ dist:[0,2.0], chance:0, hp:[0,1], phase:[1,3], signal:"behind", sigChance:0.6 },   // 绕背惩罚
      telegraph:{ ring:2.0, color:0xff2244, sound:"aoewarn" } },
    { id:"bladeFan", type:"projectile", dmgMult:0.65, windup:0.65, active:0.1, recover:1.45, interruptible:true,
      shot:{ count:5, fan:0.62, speed:10, life:2.2, r:0.55, kind:"blade", status:"bleed" },
      trigger:{ dist:[5,13], chance:0.28, hp:[0,1], phase:[1,3] },
      telegraph:{ ring:5.5, color:0xff6b92, sound:"chargeWarn" } }
  ],
  /* 墨鲛 spitter（§2.5）：HP2 / 基础 8 / 交战 18 T3 */
  spitter: [
    { id:"spit", type:"projectile", dmgMult:1.0, windup:0.5, active:0.1, recover:1.5, interruptible:true,
      shot:{ count:1, fan:0, speed:6.5, life:3.0 },
      trigger:{ dist:[8,18], chance:1.0, hp:[0,1], phase:[1,3] },
      telegraph:{ ring:0, color:0x9fe8ff, sound:"warn" } },
    { id:"tri", type:"projectile", dmgMult:0.7, hits:3, windup:0.8, active:0.1, recover:2.2, interruptible:false,
      shot:{ count:3, fan:0.35, speed:6.5, life:3.0 },
      trigger:{ dist:[10,16], chance:0.2, hp:[0,1], phase:[1,3], signal:"still", sigChance:0.4 },
      telegraph:{ ring:6, color:0x9fe8ff, sound:"chargeWarn" } },   // 前方扇 r=6
    { id:"cannon", type:"projectile", dmgMult:1.5, windup:1.0, active:0.1, recover:2.5, interruptible:false,
      shot:{ count:1, fan:0, speed:9, life:3.0 },
      trigger:{ dist:[12,18], chance:0.2, hp:[0,1], phase:[1,3], signal:"still", sigChance:0.4 },
      telegraph:{ ring:0, color:0x9fe8ff, sound:"chargeWarn" } },
    { id:"tail", type:"melee", dmgMult:1.0, windup:0.4, active:0.1, recover:0.6, interruptible:true,
      trigger:{ dist:[0,2.5], chance:1.0, hp:[0,1], phase:[1,3] },
      telegraph:{ ring:0, color:0x9fe8ff, sound:"warn" } },
    { id:"acidField", type:"hazard", dmgMult:0.45, windup:0.9, active:0.12, recover:2.25, interruptible:true,
      skill:{ kind:"acid", radius:3.2, duration:5.5, tick:0.8 },
      trigger:{ dist:[4,16], chance:0.34, hp:[0,1], phase:[1,3], signal:"still", sigChance:0.55 },
      telegraph:{ ring:3.2, color:0x83ff66, sound:"aoewarn" } }
  ],
  /* 晶化灰手 elite（§2.6）：HP8 / 基础 16 / 速 2.2 T3 */
  elite: [
    { id:"punch", type:"melee", dmgMult:1.0, windup:0.4, active:0.12, recover:0.4, interruptible:true,
      trigger:{ dist:[0,2.4], chance:1.0, hp:[0,1], phase:[1,3] },
      telegraph:{ ring:0, color:0xff2244, sound:"warn" } },
    { id:"shock", type:"aoe", dmgMult:1.25, windup:0.8, active:0.2, recover:1.0, interruptible:false,
      trigger:{ dist:[2,5], chance:0.3, hp:[0,1], phase:[1,3], signal:"behind", sigChance:0.5 },
      telegraph:{ ring:4.0, color:0xff2244, sound:"aoewarn" } },
    { id:"combo", type:"combo", dmgMult:0.6, hits:3, windup:0.35, active:0.3, recover:0.8, interruptible:false,
      trigger:{ dist:[0,2.5], chance:0, hp:[0,1], phase:[1,3], signal:"greedy", sigChance:0.7 },   // 贪刀反制
      telegraph:{ ring:0, color:0xff2244, sound:"comboWarn" } },
    { id:"dash", type:"dash", dmgMult:1.0, windup:0.5, active:0.4, recover:0.9, interruptible:false,
      dash:{ speed:7, dur:0.4 },
      trigger:{ dist:[5,9], chance:0.25, hp:[0,1], phase:[1,3], signal:"still", sigChance:0.45 },
      telegraph:{ ring:1.6, color:0xff2244, sound:"warn" } },   // 直线带（宽 1.6）
    { id:"crystalWard", type:"buff", dmgMult:0, windup:0.7, active:0.12, recover:2.0, interruptible:true,
      skill:{ kind:"ward", radius:7, duration:7, charges:3 },
      trigger:{ dist:[3,14], chance:0.28, hp:[0,0.82], phase:[1,3] },
      telegraph:{ ring:3.0, color:0x62d9ff, sound:"chargeWarn" } },
    { id:"crystalNova", type:"projectile", dmgMult:0.55, windup:0.85, active:0.1, recover:1.8, interruptible:false,
      shot:{ count:9, fan:3.14159, speed:8, life:2.1, r:0.48, kind:"crystal", status:"slow" },
      trigger:{ dist:[2.5,9], chance:0.25, hp:[0,0.68], phase:[1,3] },
      telegraph:{ ring:5.0, color:0x62d9ff, sound:"aoewarn" } }
  ],
  /* 沉者之手 hand（§2.7）：HP12 / 基础 20 / 速 1.2 —— P1 仅选 phase 含 1 的招（P2+/P3 预留） */
  hand: [
    { id:"palm", type:"melee", dmgMult:1.0, windup:0.45, active:0.12, recover:0.5, interruptible:true,
      trigger:{ dist:[0,3], chance:1.0, hp:[0,1], phase:[1,1] },
      telegraph:{ ring:0, color:0xe0506a, sound:"warn" } },
    { id:"sweep", type:"aoe", dmgMult:1.0, windup:0.6, active:0.15, recover:0.7, interruptible:false,
      trigger:{ dist:[0,4], chance:0.35, hp:[0,1], phase:[1,1], signal:"behind", sigChance:0.5 },
      telegraph:{ ring:4.0, color:0xe0506a, sound:"aoewarn" } },
    { id:"double", type:"combo", dmgMult:0.7, hits:2, windup:0.35, active:0.2, recover:0.6, interruptible:false,
      trigger:{ dist:[0,3], chance:0, hp:[0,1], phase:[1,1], signal:"greedy", sigChance:0.7 },   // 贪刀反制
      telegraph:{ ring:0, color:0xe0506a, sound:"comboWarn" } },
    { id:"spike", type:"aoe", dmgMult:0.75, windup:0.6, active:0.2, recover:1.0, interruptible:false,
      trigger:{ dist:[0,6], chance:0.2, hp:[0,1], phase:[2,3] },   // P2+ 预留
      telegraph:{ ring:2.5, color:0xe0506a, sound:"aoewarn" } },
    { id:"wave", type:"aoe", dmgMult:1.0, windup:0.8, active:0.2, recover:1.2, interruptible:false,
      trigger:{ dist:[0,10], chance:0.15, hp:[0,1], phase:[3,3] },   // P3+ 预留
      telegraph:{ ring:4.0, color:0xe0506a, sound:"aoewarn" } }
  ],
  /* 深渊态 handX（§2.8）：HP22 / 基础 26 / 速 1.5 T3 */
  handX: [
    { id:"palm", type:"melee", dmgMult:1.0, windup:0.4, active:0.12, recover:0.5, interruptible:true,
      trigger:{ dist:[0,3], chance:1.0, hp:[0,1], phase:[1,1] },
      telegraph:{ ring:0, color:0xff2244, sound:"warn" } },
    { id:"sweep", type:"aoe", dmgMult:1.0, windup:0.55, active:0.15, recover:0.7, interruptible:false,
      trigger:{ dist:[0,4], chance:0.35, hp:[0,1], phase:[1,1], signal:"behind", sigChance:0.5 },
      telegraph:{ ring:4.0, color:0xff2244, sound:"aoewarn" } },
    { id:"combo", type:"combo", dmgMult:0.5, hits:3, windup:0.3, active:0.3, recover:0.9, interruptible:false,
      trigger:{ dist:[0,3], chance:0, hp:[0,1], phase:[1,1], signal:"greedy", sigChance:0.7 },   // 贪刀反制
      telegraph:{ ring:0, color:0xff2244, sound:"comboWarn" } },
    { id:"spike", type:"aoe", dmgMult:0.75, windup:0.55, active:0.2, recover:1.0, interruptible:false,
      trigger:{ dist:[0,6], chance:0.2, hp:[0,1], phase:[2,3] },   // P2+ 预留
      telegraph:{ ring:2.5, color:0xff2244, sound:"aoewarn" } },
    { id:"rush", type:"dash", dmgMult:1.0, windup:0.7, active:0.5, recover:1.2, interruptible:false,
      dash:{ speed:6, dur:0.5 },
      trigger:{ dist:[4,10], chance:0.25, hp:[0,1], phase:[2,3], signal:"still", sigChance:0.45 },   // P2+ 预留
      telegraph:{ ring:1.6, color:0xff2244, sound:"warn" } },
    { id:"wave", type:"aoe", dmgMult:1.0, windup:0.8, active:0.2, recover:1.2, interruptible:false,
      trigger:{ dist:[0,10], chance:0.15, hp:[0,1], phase:[3,3] },   // P3+ 预留
      telegraph:{ ring:4.0, color:0xff2244, sound:"aoewarn" } }
  ]
};
/* ============================================================
   CSD-SOUL1-P2/P3：AI 行为信号 / 防御·闪避·诱骗 / BOSS 多阶段
   ------------------------------------------------------------
   P2（AI 智能）：玩家遥测（攻击热度/站桩/低血/绕背）→ 信号驱动招式反制 + 防御/闪避/诱骗
   P3（BOSS 多阶段）：血量阈值切 phase → 阶段招式解锁 + 形态切换 + 转阶段演出
   铁律：全部新逻辑仅在 soulOn=true 且实例带 moves/poise 时生效；soulOn=false 零变化。
   ============================================================ */
/* 信号解锁招式（trigger.signal）：chance=0 的招在对应信号激活时可被选中（权重 sigChance）。
   信号名约定：greedy=贪刀 / still=站桩 / low=低血追击 / behind=绕背。 */
/* 玩家遥测阈值（P2 §3） */
const SOUL_SIGNALS = {
  greedyHeat: 2.2,   // atkHeat ≥ 2.2 ≈ 2 秒内连发 3+ 次 → 贪刀（HARD：更易触发反制）
  stillTime: 0.9,    // 站桩 ≥ 0.9s → 站桩（蓄力/狙击触发）（HARD：惩罚更早）
  lowHp: 33,         // 玩家 HP < 33 → 低血（追击/突进强化）（HARD：更早进入猎杀态）
  behindDot: -0.25,  // 怪物朝向 · 玩家方向 < -0.25 且距离 < 5 → 绕背
  behindDist: 5
};
/* 每类型 AI 行为开关（P2 §4-§6）：dodge=闪避 / block=防御 / feint=诱骗 / counter=信号反制 */
const SOUL_AI = {
  gray:    { dodge:false, block:false, feint:false, counter:true  },
  dart:    { dodge:true,  block:false, feint:false, counter:true  },
  spitter: { dodge:false, block:false, feint:false, counter:true  },
  elite:   { dodge:true,  block:true,  feint:false, counter:true  },
  hand:    { dodge:false, block:true,  feint:true,  counter:true  },
  handX:   { dodge:false, block:true,  feint:true,  counter:true  }
};
/* BOSS 多阶段（P3 §2）：血量分数阈值 + 阶段速度/后摇修正 + 转阶段冻结 */
const SOUL_PHASES = {
  thresholds:[0.66, 0.33],      // >0.66=P1 / 0.33~0.66=P2 / <0.33=P3
  speedMult:{ 1:1.0, 2:1.06, 3:1.15 },
  recoverMult:{ 1:1.0, 2:0.9, 3:0.8 },
  transition:0.9                // 转阶段冻结时长（秒）
};
/* ---- CSD-H2：强化档位解析（L1 教学关锁定 T1；其余按 G.boost，默认 T3） ---- */
function currentBoostLevel(){
  if(!G) return Math.max(1, Math.min(3, currentBoost));
  if(G.level === 1) return 1;                      // L1 锁定：教学关恒为 T1 基线值
  const b = G.boost || currentBoost;
  return (b === 1 || b === 2 || b === 3) ? b : 3;
}
function boostFor(type){
  const tbl = MONSTER_BOOST[currentBoostLevel()] || MONSTER_BOOST[3];
  return (tbl && tbl[type]) || null;
}
/* 运行时降档/调档入口（设计 §0.1）：setMonsterBoost(1|2|3)；写 G.boost + 模块 currentBoost */
function setMonsterBoost(v){
  if(v !== 1 && v !== 2 && v !== 3) return false;
  currentBoost = v;
  if(G) G.boost = v;
  return true;
}
/* 受击硬直 cd（设计 §2.2）：灰手/精英按强化档（T3=0.3 / T2=0.4 / T1=0.6）；
   刃鳍/墨鲛沿用既有 0.6（其 AI 不读 m.cd，打断由 interruptDart/喷吐 cd 承担）。 */
function hitStaggerCd(m){
  if(m && (m.type === "dart" || m.type === "spitter")) return 0.6;
  const b = boostFor((m && m.type === "elite") ? "elite" : "gray");
  return (b && typeof b.cd === "number") ? b.cd : 0.6;
}
/* ---- CSD-SOUL1-P1：招式选择 / 执行 / 韧性 / 处决（纯增量；moves/poise 缺省 → 不启用） ---- */
/* 有效基础伤害：与既有 tick 分支同源（强化档 dmg > 类型表 dmg > 缺省 12）；BOSS 走 tickBoss 解析 */
function effectiveDmg(m){
  if(!m) return 12;
  if(m.type === "handX"){ const bb = boostFor("handX"); if(bb && bb.dmg !== undefined) return bb.dmg; }
  if(m.type === "hand") return (m.dmg !== undefined) ? m.dmg : (BOSS_TYPES.hand ? BOSS_TYPES.hand.dmg : 20);
  const t = MONSTER_TYPES[m.type];
  const boost = boostFor(m.type === "dart" ? "dart" : (m.type === "spitter" ? "spitter" : (m.type === "elite" ? "elite" : "gray")));
  if(boost && boost.dmg !== undefined) return boost.dmg;
  return (t && t.dmg !== undefined) ? t.dmg : 12;
}
/* 招式伤害 = 类型基础 dmg × dmgMult（× hits 段数，连击总伤）；取整。
   单段伤害（P2）：连击每段 / 弹丸每发的独立结算基础 = 基础 × dmgMult（不含 hits 倍率）。 */
function moveDamage(m, mv){
  if(!mv) return effectiveDmg(m);
  const mult = (typeof mv.dmgMult === "number") ? mv.dmgMult : 1;
  const hits = mv.hits || 1;
  return Math.round(effectiveDmg(m) * mult * hits);
}
function moveHitDamage(m, mv){
  if(!mv) return effectiveDmg(m);
  const mult = (typeof mv.dmgMult === "number") ? mv.dmgMult : 1;
  return Math.round(effectiveDmg(m) * mult);
}
/* 招式选择（纯函数）：按 trigger 条件（距离/概率/阶段预留）从 m.moves 池选招。
   - m.break 中 / m.cd>0 → null（不选招）
   - 无 moves / 无命中候选 → null（回落既有 AI 默认攻击）
   - 概率：chance 即权重，池内归一化加权随机（__rng 种子化，测试可复现）
   - P2 信号：chance=0 的招在 trigger.signal 命中激活信号时，以 sigChance 权重入池（反制招） */
function tickMove(m, px, pz, opts){
  opts = opts || {};
  if(!m || !Array.isArray(m.moves) || m.moves.length === 0) return null;
  if(m.break && m.break.t > 0) return null;
  if((m.cd||0) > 0) return null;
  const phase = opts.phase || 1;
  const sig = opts.signals || null;
  const d = Math.hypot(px - m.x, pz - m.z) || 1;
  const hpFrac = (m.maxHp > 0) ? (m.hp / m.maxHp) : 1;
  const pool = [];
  for(const mv of m.moves){
    const tr = mv.trigger || {};
    const dist = tr.dist || [0, 1e9];
    const hp = tr.hp || [0, 1];
    const ph = tr.phase || [1, 3];
    const chance = tr.chance || 0;
    if(d < dist[0] || d > dist[1]) continue;
    if(hpFrac < hp[0] || hpFrac > hp[1]) continue;
    if(phase < ph[0] || phase > ph[1]) continue;
    let w = chance;
    const sigName = tr.signal || null;
    if(w <= 0){
      /* chance 0：P2 信号招——仅对应信号激活时以 sigChance 权重入池（否则跳过） */
      if(!sigName || !sig || !sig[sigName]) continue;
      w = (typeof tr.sigChance === "number") ? tr.sigChance : 0.6;
    } else if(sigName && sig && sig[sigName]){
      /* chance>0：信号激活时把基础权重抬到 max(chance, sigChance)——站桩/绕背更易触发对应招 */
      w = Math.max(w, (typeof tr.sigChance === "number") ? tr.sigChance : w);
    }
    pool.push({ mv, w });
  }
  if(pool.length === 0) return null;
  if(pool.length === 1) return pool[0].mv;      // 单候选恒选（chance 仅作门槛）
  /* 概率分派：chance 即权重，池内归一化加权随机（__rng 种子化，测试可复现）。
     例：池内 [chance 0.8, 0.2] → a 约 80%、b 约 20%。 */
  let total = 0;
  for(const it of pool) total += it.w;
  if(total <= 0) return pool[0].mv;
  let roll = __rng() * total;
  for(const it of pool){
    roll -= it.w;
    if(roll <= 0) return it.mv;
  }
  return pool[pool.length - 1].mv;
}
/* 招式开始：写入 m.atk 状态机（windup → active → recover） */
function startMove(m, mv){
  m.atk = { move:mv, phase:"windup", t:0, telegraphDone:false, hitDone:false };
}
/* 招式执行机（纯增量）：推进 m.atk 并在合适时点结算伤害/弹丸/位移。
   - windup：首帧发 telegraph 事件（L2 地面圈 / L3 音效由渲染层消费）
   - active：melee/charge/aoe/combo 接触或半径命中；projectile 生成喷吐弹；dash 位移+贴身命中
   - recover：结束置 m.cd = recover + rng(0,0.3)，蓄力/范围技额外 +0.4（防连招轰炸）
   仅 m.atk 存在时调用；无 m.atk 走既有 AI。 */
function tickMoveExec(m, dt, px, pz, events){
  const atk = m.atk;
  if(!atk) return;
  const mv = atk.move;
  if(atk.phase === "windup"){
    if(!atk.telegraphDone){
      atk.telegraphDone = true;
      if(mv.type==="hazard"){atk.tx=px;atk.tz=pz;}
      events.push({ type:"telegraph", mx:mv.type==="hazard"?atk.tx:m.x, mz:mv.type==="hazard"?atk.tz:m.z, move:mv.id,
                    windup:mv.windup, telegraph:mv.telegraph, moveType:mv.type });
    }
    atk.t += dt;
    if(atk.t >= mv.windup){ atk.phase = "active"; atk.t = 0; }
    return;
  }
  if(atk.phase === "active"){
    atk.t += dt;
    if(mv.type === "blink"){
      if(!atk.hitDone){
        atk.hitDone=true;
        const dd=Math.hypot(px-m.x,pz-m.z)||1,fx=(px-m.x)/dd,fz=(pz-m.z)/dd;
        m.x=px-fx*1.8;m.z=pz-fz*1.8;faceToward(m,px,pz);
        if(Math.hypot(px-m.x,pz-m.z)<2.2&&playerHit(moveHitDamage(m,mv)))events.push({type:"hurt",mx:m.x,mz:m.z,move:mv.id});
        events.push({type:"enemySkill",mx:m.x,mz:m.z,skill:"伏潮突袭"});
      }
    } else if(mv.type === "dash" && mv.dash){
      const mult = speedMult(m);
      const dd = Math.hypot(px-m.x, pz-m.z) || 1;
      m.x += (px-m.x)/dd * mv.dash.speed * mult * dt;
      m.z += (pz-m.z)/dd * mv.dash.speed * mult * dt;
      if(!atk.hitDone && Math.hypot(px-m.x, pz-m.z) < 1.6){
        atk.hitDone = true;
        const dmg = moveHitDamage(m, mv);
        if(playerHit(dmg)) events.push({ type:"hurt", mx:m.x, mz:m.z, move:mv.id });
      }
    } else if(mv.type === "projectile"){
      if(!atk.hitDone){
        atk.hitDone = true;
        spawnMoveProjectiles(m, mv, px, pz, events);
      }
    } else if(mv.type === "hazard"){
      if(!atk.hitDone){
        atk.hitDone=true;const sk=mv.skill||{};
        G.enemyHazards=G.enemyHazards||[];
        G.enemyHazards.push({x:atk.tx===undefined?px:atk.tx,z:atk.tz===undefined?pz:atk.tz,r:sk.radius||3,life:sk.duration||5,
          max:sk.duration||5,tick:0,tickRate:sk.tick||0.8,dmg:moveHitDamage(m,mv),kind:sk.kind||"acid"});
        events.push({type:"enemySkill",mx:atk.tx,mz:atk.tz,skill:"腐蚀领域"});
      }
    } else if(mv.type === "buff"){
      if(!atk.hitDone){
        atk.hitDone=true;const sk=mv.skill||{};
        if(sk.kind==="rally"){
          for(const ally of G.monsters){if(ally.hp>0&&Math.hypot(ally.x-m.x,ally.z-m.z)<(sk.radius||12))ally.rage={t:sk.duration||6,source:"rally"};}
          events.push({type:"enemySkill",mx:m.x,mz:m.z,skill:"深渊号令"});
        }else if(sk.kind==="ward"){
          m.ward={t:sk.duration||7,charges:sk.charges||3,mult:0.45};
          for(const ally of G.monsters){if(ally!==m&&ally.hp>0&&Math.hypot(ally.x-m.x,ally.z-m.z)<(sk.radius||7))ally.ward={t:5,charges:1,mult:0.7};}
          events.push({type:"enemySkill",mx:m.x,mz:m.z,skill:"晶化护阵"});
        }
      }
    } else if(mv.type === "combo"){
      /* P2：连击分段命中——active 窗口均分 hits 段，每段独立判定（可中途拉开距离躲避） */
      const hits = mv.hits || 1;
      const interval = (mv.active || 0.2) / hits;
      atk.hitsDone = atk.hitsDone || 0;
      const d = Math.hypot(px-m.x, pz-m.z);
      while(atk.hitsDone < hits && atk.t >= (atk.hitsDone + 1) * interval){
        atk.hitsDone++;
        if(d < 2.4){
          const dmg = moveHitDamage(m, mv);
          if(playerHit(dmg, true)) events.push({ type:"hurt", mx:m.x, mz:m.z, move:mv.id });   // 连击段穿透 i-frame
        }
      }
    } else {
      if(!atk.hitDone){
        atk.hitDone = true;
        const dmg = moveDamage(m, mv);
        const range = ((mv.telegraph && mv.telegraph.ring > 0) ? mv.telegraph.ring : 2.4);
        const d = Math.hypot(px-m.x, pz-m.z);
        if(d < range){
          if(playerHit(dmg)) events.push({ type:"hurt", mx:m.x, mz:m.z, move:mv.id });
        }
      }
    }
    const dur = (mv.type === "dash" && mv.dash) ? mv.dash.dur : mv.active;
    if(atk.t >= dur){ atk.phase = "recover"; atk.t = 0; }
    return;
  }
  if(atk.phase === "recover"){
    atk.t += dt;
    if(atk.t >= mv.recover){
      const extra = (mv.type === "charge" || mv.type === "aoe" || mv.type === "hazard" || mv.type === "buff") ? 0.4 : 0;
      m.cd = mv.recover + __rng()*0.3 + extra;
      m.atk = null;
    }
    return;
  }
}
/* 墨鲛喷吐弹（复用 G.spitPulses 模式）：单发/三连扇面/蓄力炮按 shot 参数 */
function spawnMoveProjectiles(m, mv, px, pz, events){
  const t = MONSTER_TYPES[m.type];
  const boost = boostFor("spitter");
  const spit = (boost && boost.spit) ? boost.spit : (t && t.spit);
  const speed = (mv.shot && mv.shot.speed) || (spit ? spit.speed : 6);
  const life = (mv.shot && mv.shot.life) || (spit ? spit.life : 3);
  const count = (mv.shot && mv.shot.count) || 1;
  const fan = (mv.shot && mv.shot.fan) || 0;
  const radius=(mv.shot&&mv.shot.r)||1.0,kind=(mv.shot&&mv.shot.kind)||"spit",status=(mv.shot&&mv.shot.status)||null;
  const dmg = moveHitDamage(m, mv);   // P2：弹丸按单发基础结算（不再 ×hits）
  const baseAngle = Math.atan2(pz-m.z, px-m.x);
  G.spitPulses = G.spitPulses || [];
  for(let i=0;i<count;i++){
    const off = (count <= 1) ? 0 : ((i/(count-1)) - 0.5) * 2 * fan;
    const a = baseAngle + off;
    G.spitPulses.push({ x:m.x, y:terrainHeight(m.x,m.z)+1, z:m.z,
                        vx:Math.cos(a)*speed, vz:Math.sin(a)*speed,
                        life, r:radius, dmg, kind, status,
                        exempt:spawnExemptObstacles(m.x, m.z, radius) });
  }
  events.push({ type:"spit", mx:m.x, mz:m.z, move:mv.id });
}
/* 韧性命中（玩家武器）：累积 poise.cur，达到 max → 破韧（breakMonster）。
   返回 true=本次触发破韧；已破韧目标仍累积但不重复触发（break 态「继续累积」）。
   scale（P2）：防御态韧性修正（<1 减韧），默认 1 不变。 */
function applyPoiseHit(m, wid, scale){
  if(!m || !m.poise || m.hp <= 0) return false;
  const s = (typeof scale === "number") ? scale : 1;
  m.poise.lastHit = 0;
  m.poise.cur = Math.min(m.poise.max, m.poise.cur + (POISE_DMG[wid] || 0) * s * ((G&&G.poiseMul)||1));
  if(m.break && m.break.t > 0) return false;
  if(m.poise.cur >= m.poise.max){ breakMonster(m); return true; }
  return false;
}
/* 破韧 → break 态：打断当前招式（interruptDart 超集）、重置韧性累积、开启处决窗口 */
function breakMonster(m){
  m.break = { t: EXEC_WINDOW[m.type] || 1.0 };
  m.poise.cur = 0;
  m.atk = null;
  m.windup = 0;
  m.guard = null; m.feint = null; m.dodge = null; m.evade = false;   // CSD-SOUL1-P2：破韧打断一切 AI 状态
  if(m.type === "dart" && m.lunge) interruptDart(m);
  return true;
}
/* 普通招受击即断：仅 windup 中且 interruptible!==false 的招式被打断（蓄力/范围技需破韧） */
function interruptMove(m){
  if(m && m.atk && m.atk.phase === "windup"){
    const mv = m.atk.move;
    if(!mv || mv.interruptible !== false){
      m.atk = null;
      return true;
    }
  }
  return false;
}
/* 韧性衰减 + 处决窗口推进：距上次受击 regenDelay 后按 regen/s 衰减至 0；
   窗口过期未处决 → 回满韧性 + 15% 速增 3s（设计 §4.2 漏过惩罚） */
function tickPoise(m, dt){
  if(!m || !m.poise) return;
  m.poise.lastHit += dt;
  if(m.break && m.break.t > 0){
    m.break.t -= dt;
    if(m.break.t <= 0){
      m.break = null;
      m.poise.cur = 0;
      m.rage = { t:3.0 };
    }
    return;
  }
  if(m.poise.lastHit >= m.poise.regenDelay && m.poise.cur > 0){
    m.poise.cur = Math.max(0, m.poise.cur - m.poise.regen * dt);
  }
}
/* 漏过惩罚速度增幅（15% 3s）；rage 计时由 tick 层衰减 */
function speedMult(m){
  /* v24.8 狂化 +25% 移速；v24.11 迅捷词缀 ×1.5；v24.20 关卡特征怪速倍率 */
  return (m && m.rage && m.rage.t > 0 ? 1.15 : 1.0) * (m && m.slowT > 0 ? .52 : 1.0) * (m && m.enraged ? 1.25 : 1.0) * (m && m.affix === "swift" ? 1.5 : 1.0) * ((G && G.lvSpeedMul) ? G.lvSpeedMul : 1);
}
function tickEchoFields(dt){if(!G||!G.echoFields)return;for(let i=G.echoFields.length-1;i>=0;i--){const f=G.echoFields[i];f.life-=dt;if(f.life<=0){G.echoFields.splice(i,1);continue;}for(const m of G.monsters||[]){if(m.hp>0&&Math.hypot(m.x-f.x,m.z-f.z)<f.r)m.slowT=Math.max(m.slowT||0,.35);}}}
/* ---- CSD-SOUL1-P2：玩家遥测 / AI 信号 / 防御·闪避·诱骗 / BOSS 多阶段 ---- */
/* 遥测单例（懒初始化，不写入 freshRun 返回体 → 既有快照不破） */
function ensureTele(){
  if(!G) return null;
  if(!G.tele) G.tele = { x:0, z:0, speed:0, standT:0, atkHeat:0, atkCount:0, lastT:-1 };
  return G.tele;
}
/* 遥测推进（每帧一次；由 tickMonsters 顶部调用——主循环恒先 tickMonsters 再 tickBoss） */
function tickTelemetry(dt, px, pz){
  if(!soulOn) return null;
  const t = ensureTele();
  if(!t) return null;
  if(t.lastT >= 0){
    const ds = Math.hypot(px - t.x, pz - t.z);
    const inst = ds / Math.max(dt, 1e-4);
    t.speed = t.speed*0.8 + inst*0.2;                 // EMA 平滑移动速度
    t.standT = (t.speed < 1.6) ? (t.standT + dt) : 0; // 站桩累计
    t.atkHeat = Math.max(0, t.atkHeat - dt*2.2);      // 攻击热度衰减
  }
  t.lastT = (t.lastT < 0) ? 0 : (t.lastT + dt);
  t.x = px; t.z = pz;
  return t;
}
/* 玩家开火（任意武器）→ 热度 + 攻击计数（诱骗「上当」判定用） */
function notePlayerAttack(){
  if(!soulOn) return;
  const t = ensureTele();
  if(!t) return;
  t.atkHeat = Math.min(5, t.atkHeat + 1.1);
  t.atkCount = (t.atkCount || 0) + 1;
}
/* 怪物朝向（追击时写入；绕背判定用） */
function faceToward(m, tx, tz){
  const dd = Math.hypot(tx - m.x, tz - m.z) || 1;
  m.fx = (tx - m.x)/dd; m.fz = (tz - m.z)/dd;
}
/* 信号计算（P2 §3）：贪刀/站桩/低血/绕背 + 距离 */
function computeSignals(m, px, pz){
  const t = ensureTele() || {};
  const d = Math.hypot(px - m.x, pz - m.z) || 1;
  const behind = (m.fx !== undefined)
    ? (((m.fx*(px-m.x) + m.fz*(pz-m.z)) / d) < SOUL_SIGNALS.behindDot && d < SOUL_SIGNALS.behindDist)
    : false;
  return {
    greedy: (t.atkHeat || 0) >= SOUL_SIGNALS.greedyHeat,
    still:  (t.standT  || 0) >= SOUL_SIGNALS.stillTime,
    low:    G.hp / (G.maxHp || HP_MAX) < .36,
    behind,
    dist: d
  };
}
/* 类型 AI 行为开关（缺省全关） */
function aiCfg(m){ return (m && SOUL_AI[m.type]) || null; }
/* 防御（P2 §4）：guard.t>0 时减伤/减韧/免击退；计时由 tick 层衰减 */
function enterGuard(m, dur){ if(!m) return; m.guard = { t: dur }; }
function guardMult(m){ return (m && m.guard && m.guard.t > 0) ? { dmg:0.35, poise:0.4 } : { dmg:1, poise:1 }; }
function projectileGuardMult(m, p){
  const g=guardMult(m);if(!m||m.type!=="shield"||!p)return g;
  const d=Math.hypot(p.x-m.x,p.z-m.z)||1,fx=m.fx===undefined?0:m.fx,fz=m.fz===undefined?1:m.fz;
  return (fx*(p.x-m.x)/d+fz*(p.z-m.z)/d)>.12?{dmg:.08,poise:.48}:g;
}
function tickGuard(m, dt){ if(m && m.guard){ m.guard.t -= dt; if(m.guard.t <= 0) m.guard = null; } }
/* v7 晶甲：按充能次数吸收伤害；与主动格挡相乘。 */
function consumeWard(m){
  if(!m||!m.ward||m.ward.t<=0||m.ward.charges<=0)return 1;
  const mult=(typeof m.ward.mult==="number")?m.ward.mult:0.55;
  m.ward.charges--;if(m.ward.charges<=0)m.ward=null;return mult;
}
/* 闪避（P2 §5）：0.3s 侧向横移，期间 evade=true（弹丸穿透 i-frame，AOE 不可避） */
function enterDodge(m, px, pz){
  if(!m) return;
  const dd = Math.hypot(px-m.x, pz-m.z) || 1;
  const dx = (px-m.x)/dd, dz = (pz-m.z)/dd;
  m.dodge = { t:0.3, dx:-dz, dz:dx, speed:8, side:(__rng()<0.5?1:-1) };
}
function tickDodge(m, dt){
  if(m && m.dodge){
    m.dodge.t -= dt;
    m.x += m.dodge.dx*m.dodge.side*m.dodge.speed*dt;
    m.z += m.dodge.dz*m.dodge.side*m.dodge.speed*dt;
    m.evade = m.dodge.t > 0;
    if(m.dodge.t <= 0){ m.dodge = null; m.evade = false; }
  }
}
/* 诱骗（P2 §6）：假前摇 0.45s——期间玩家开火（atkCount 上升）→ 立即快招反制；
   未上当 → 取消收招（no-op 无惩罚）。返回 true=本帧被反制触发。 */
function enterFeint(m){
  if(!m) return;
  const tel = ensureTele();
  m.feint = { t:0, dur:0.45, atkCount:(tel ? (tel.atkCount||0) : 0) };
}
function tickFeint(m, dt, px, pz, events){
  if(!m || !m.feint) return false;
  const f = m.feint;
  f.t += dt;
  const tel = ensureTele();
  const baited = tel && ((tel.atkCount||0) > f.atkCount);
  if(baited){
    m.feint = null;
    const mv = { id:"feintPunish", type:"melee", dmgMult:0.8, windup:0.16, active:0.08, recover:0.5,
                 interruptible:false, trigger:{}, telegraph:{ ring:0, color:0xff2244, sound:"warn" } };
    startMove(m, mv);
    events.push({ type:"feint", mx:m.x, mz:m.z, baited:true });
    return true;
  }
  if(f.t >= f.dur){
    m.feint = null;
    events.push({ type:"feint", mx:m.x, mz:m.z, baited:false });
  }
  return false;
}
/* BOSS 多阶段（P3 §2）：血量分数 → phase 1/2/3；阶段速度/后摇修正 */
function bossPhase(b){
  if(!b || b.maxHp <= 0) return 1;
  const frac = b.hp / b.maxHp;
  return frac > SOUL_PHASES.thresholds[0] ? 1 : (frac > SOUL_PHASES.thresholds[1] ? 2 : 3);
}
function phaseSpeedMult(b){ return (SOUL_PHASES.speedMult[b.phase] || 1); }
function phaseRecoverMult(b){ return (SOUL_PHASES.recoverMult[b.phase] || 1); }
/* 最近可处决目标（只读，渲染层提示用）：break 态且 hp>0 且半径 3.0 内 */
function findExecutable(px, pz){
  if(!G) return null;
  let best = null, bd = 3.0;
  for(const m of G.monsters){
    if(m.hp<=0 || !(m.break && m.break.t>0)) continue;
    const d = Math.hypot(m.x-px, m.z-pz);
    if(d < bd){ bd = d; best = { target:m, boss:false }; }
  }
  if(G.boss && G.boss.hp>0 && G.boss.break && G.boss.break.t>0){
    const d = Math.hypot(G.boss.x-px, G.boss.z-pz);
    if(d < bd){ bd = d; best = { target:G.boss, boss:true }; }
  }
  return best;
}
/* 处决（复用发射键）：最近可处决目标半径 3.0 内开火 → 自动锁定执行。
   杂兵即死 / 精英 8 / BOSS 8（保守档）；i-frame 0.8s；得分 = 击杀分不双计（未杀不计）。 */
function tryExecute(px, pz){
  if(!G || G.state !== S.PLAYING) return null;
  const best = findExecutable(px, pz);
  if(!best) return null;
  const t = best.target;
  const isTrash = (t.type === "gray" || t.type === "dart" || t.type === "spitter" || t.type === "acid" || t.type === "sniper" || t.type === "swarm");
  let killed = false;
  if(isTrash){
    t.hp = 0;
    killed = true;
  } else {
    const dmg = EXEC_DMG[t.type] || 8;
    t.hp = Math.max(0, t.hp - dmg);
    if(t.hp <= 0) killed = true;
  }
  G.hitCool = Math.max(G.hitCool || 0, 0.8);       // 处决 i-frame 0.8s
  const sc = (t.score !== undefined) ? t.score : 25;
  if(killed){ if(t.type==="acid"){G.enemyHazards=G.enemyHazards||[];G.enemyHazards.push({kind:"acidPool",x:t.x,z:t.z,r:3.6,life:7,max:7,dmg:8,tick:0,tickRate:.8});} noteKill(t, { countKill: !best.boss }); }   // CSD-SOUL1-FUN：处决击杀也计入连杀
  if(killed && !best.boss && runBuild.execAmmo) G.ammo=Math.min(AMMO_MAX,(G.ammo||0)+runBuild.execAmmo);
  t.break = null;
  t.poise = t.poise || { max:1, cur:0, regen:2, regenDelay:2, lastHit:0 };
  t.poise.cur = 0;
  t.atk = null;
  t.guard = null; t.feint = null; t.dodge = null; t.evade = false;   // CSD-SOUL1-P2：处决清空 AI 状态
  return { type:"exec", boss:best.boss, mx:t.x, mz:t.z, target:t.type,
           dmg: isTrash ? "kill" : (EXEC_DMG[t.type] || 8),
           killed, score: killed ? sc : 0 };
}
/* 地形预设（§2 参数化：振幅倍率 + 频率微调；default=现有解析式，向后兼容） */
const TERRAIN_PRESETS = {
  default:{ a1:2.2, f1:0.08,   a2:1.6, f2:0.06,   a3:0.7,  f3:0.031, f4:0.072,  a4:1.1, f5:0.02,  f6:0.045 },
  shallow:{ a1:1.76,f1:0.06,   a2:1.28,f2:0.05,   a3:0.56, f3:0.025, f4:0.058,  a4:0.88,f5:0.016, f6:0.036 },   // ×0.8 低频缓坡
  canyon: { a1:2.2, f1:0.10,   a2:1.6, f2:0.05,   a3:0.7,  f3:0.020, f4:0.090,  a4:1.1, f5:0.024, f6:0.050 },   // ×1.0 双频纵向通道
  twilight:{ a1:2.42,f1:0.09,  a2:1.76,f2:0.07,   a3:0.77, f3:0.045, f4:0.100,  a4:1.21,f5:0.028, f6:0.060 },   // ×1.1 高频微扰
  bathyal:{ a1:2.64,f1:0.055,  a2:1.92,f2:0.05,   a3:0.84, f3:0.030, f4:0.060,  a4:1.32,f5:0.018, f6:0.042 },   // ×1.2 低频陡坡
  abyss:  { a1:2.86,f1:0.07,   a2:2.08,f2:0.055,  a3:0.91, f3:0.040, f4:0.085,  a4:1.43,f5:0.022, f6:0.050 }    // ×1.3 最暗最深
};

/* ---- CSD-M2：关卡配置（怪物与关卡设计 §2，纯数据） ---- */
const LEVELS = [
  { id:1, name:"阿尔法海", theme:"shallow",
    terrain:{ preset:"shallow" },
    obstacles:[
      {x:12,z:-6,r:1.0},{x:-10,z:12,r:1.1},{x:20,z:16,r:0.9},
      {x:-16,z:-10,r:1.0},{x:6,z:22,r:0.9},{x:-4,z:-18,r:1.1}
    ],
    sampleSpots:[ {x:5,z:8},{x:-7,z:12},{x:14,z:-8},{x:-12,z:-6},
                  {x:20,z:10},{x:-18,z:18},{x:8,z:-20},{x:-8,z:22} ],
    sampleTarget:6, gatePos:{x:30,z:-30},
    monsters:[ {type:"gray",x:10,z:14},{type:"gray",x:-14,z:-14} ],
    boss:"reefCrab",
    objective:{ kind:"collect", n:6 },
    scoreCap:110 },
  { id:2, name:"髓星登陆区", theme:"canyon",
    terrain:{ preset:"canyon" },
    obstacles:[
      {x:8,z:-6,r:1.6,kind:"kelp"},{x:-9,z:7,r:1.9,kind:"kelp"},{x:12,z:12,r:1.5},{x:-14,z:-11,r:2.1,kind:"kelp"},
      {x:18,z:-14,r:1.7},{x:-20,z:16,r:1.8,kind:"kelp"},{x:22,z:4,r:1.4},{x:-24,z:-2,r:2.0,kind:"kelp"},
      {x:6,z:20,r:1.6},{x:-6,z:-22,r:1.5},{x:16,z:24,r:1.8},{x:-16,z:24,r:1.6},
      {x:28,z:-22,r:1.5},{x:-28,z:-18,r:1.7}
    ],
    sampleSpots:[ {x:5,z:8},{x:-7,z:12},{x:14,z:-8},{x:-12,z:-6},
                  {x:20,z:10},{x:-18,z:18},{x:8,z:-20},{x:-8,z:22} ],
    sampleTarget:6, gatePos:{x:-30,z:-28},
    monsters:[ {type:"gray",x:10,z:14},{type:"gray",x:-14,z:-14},{type:"gray",x:18,z:-24},{type:"gray",x:-26,z:18},
               {type:"dart",x:20,z:10},{type:"dart",x:-20,z:26},{type:"dart",x:0,z:-28} ],
    boss:"kelpLeviathan",
    objective:{ kind:"kill", n:7 },
    scoreCap:175 },
  { id:3, name:"离奇族秘道", theme:"twilight",
    terrain:{ preset:"twilight" },
    obstacles:[
      {x:10,z:-8,r:1.5},{x:-12,z:8,r:1.7},{x:16,z:14,r:1.3},{x:-16,z:-12,r:1.9},
      {x:20,z:-16,r:1.5},{x:-22,z:18,r:1.6},{x:24,z:6,r:1.4},{x:-26,z:-4,r:1.8},
      {x:8,z:24,r:1.6},{x:-8,z:-24,r:1.5}
    ],
    sampleSpots:[ {x:5,z:8},{x:-7,z:12},{x:14,z:-8},{x:-12,z:-6},
                  {x:20,z:10},{x:-18,z:18},{x:8,z:-20},{x:-8,z:22} ],
    sampleTarget:6, gatePos:{x:32,z:-26},
    monsters:[ {type:"gray",x:10,z:14},{type:"gray",x:-14,z:-14},{type:"gray",x:18,z:-24},
               {type:"spitter",x:20,z:10},{type:"spitter",x:-20,z:26},{type:"spitter",x:-6,z:-28},
               {type:"elite",x:26,z:-20} ],
    boss:"abyssJelly",
    objective:{ kind:"elite", type:"elite" },
    scoreCap:210 },
  { id:4, name:"雷莫拉战线", theme:"bathyal",
    terrain:{ preset:"bathyal" },
    obstacles:[
      {x:6,z:-5,r:1.6},{x:-7,z:8,r:1.9},{x:10,z:12,r:1.5},{x:-12,z:-10,r:2.1},
      {x:16,z:-14,r:1.7},{x:-18,z:16,r:1.8},{x:20,z:4,r:1.4},{x:-22,z:-2,r:2.0},
      {x:4,z:20,r:1.6},{x:-4,z:-22,r:1.5},{x:14,z:24,r:1.8},{x:-14,z:24,r:1.6},
      {x:26,z:-22,r:1.5},{x:-26,z:-18,r:1.7},{x:28,z:18,r:1.9},{x:-28,z:6,r:1.5}
    ],
    sampleSpots:[ {x:5,z:8},{x:-7,z:12},{x:14,z:-8},{x:-12,z:-6},
                  {x:20,z:10},{x:-18,z:18},{x:8,z:-20},{x:-8,z:22} ],
    sampleTarget:6, gatePos:{x:-32,z:26},
    monsters:[ {type:"gray",x:10,z:14},{type:"gray",x:-14,z:-14},
               {type:"dart",x:20,z:10},{type:"dart",x:-20,z:26},{type:"dart",x:26,z:0},
               {type:"spitter",x:18,z:-24},{type:"spitter",x:-24,z:-18} ],
    boss:"voidWhale",
    objective:{ kind:"survive", t:90 },
    scoreCap:175 },
  { id:5, name:"建造者囚室", theme:"abyss",
    terrain:{ preset:"abyss" },
    obstacles:[
      {x:8,z:-6,r:1.4},{x:-9,z:7,r:1.7},{x:12,z:12,r:1.3},{x:-14,z:-11,r:1.9},
      {x:18,z:-14,r:1.5},{x:-20,z:16,r:1.6},{x:22,z:4,r:1.4},{x:-24,z:-2,r:1.8},
      {x:6,z:20,r:1.5},{x:-6,z:-22,r:1.4},{x:16,z:24,r:1.6},{x:-28,z:-18,r:1.7}
    ],
    sampleSpots:[ {x:5,z:8},{x:-7,z:12},{x:14,z:-8},{x:-12,z:-6},
                  {x:20,z:10},{x:-18,z:18},{x:8,z:-20},{x:-8,z:22},
                  {x:24,z:-16},{x:-22,z:-20},{x:26,z:24},{x:-26,z:2} ],
    sampleTarget:8, gatePos:{x:32,z:-28},
    monsters:[ {type:"gray",x:10,z:14},{type:"gray",x:-14,z:-14},
               {type:"dart",x:20,z:10},{type:"dart",x:-26,z:6},
               {type:"spitter",x:-20,z:26},{type:"spitter",x:0,z:-30},
               {type:"elite",x:26,z:24} ],
    boss:"handX",
    objective:{ kind:"gate" },
    scoreCap:375 }
];

/* v14：第一部《船》拆分为 20 个连续战术关卡。保留五套成熟场景模板，逐关重组敌群、目标、路线与 Boss。 */
const PART_ONE_STAGE_BLUEPRINTS=[
  ["沉默的大船","大船拥有意识，却无法向乘员发声。先在生态海完成基础校准。","collect"],
  ["阿尔法海校准","核对这艘行星级客轮的船体尺度、能源流和万族航线。","kill"],
  ["雷莫拉船壳","雷莫拉人终生居住在防护服中，承担真空船壳维修。","scan"],
  ["维修义务","迈尔辛设计的维修制度改变了雷莫拉文化，也积累了长久裂痕。","kill","reefCrab"],
  ["翡尼克斯余烬","浣生曾爱上拒绝永生的翡尼克斯人；一次叛乱留下永久死亡。","elite"],
  ["浣生的旧伤","职责、异族与失去塑造了浣生此后的每一次判断。","hybrid"],
  ["盖亚裁决","帕米尔曾用激进方法处理两个盖亚生命体冲突，并因此被革职。","survive"],
  ["帕米尔归来","失踪事件迫使首领重新启用这位危险而可靠的前船长。","kill","kelpLeviathan"],
  ["首领的召集","数十名精英船长收到一份必须绝对保密的潜伏命令。","scan"],
  ["黑色阿尔法","最高等级协议要求船长切断日常联系，独自前往秘密会合点。","defend"],
  ["失踪的船长们","同一时间离开的船长过多，常规航务记录却被悄然抹平。","elite"],
  ["中微子幽灵","五十三年前的撞击波暴露了来自核心深处的异常中微子流。","kill","abyssJelly"],
  ["空心内核","扫描证明大船内部并非实心，厚重船壳之下存在巨大空腔。","collect"],
  ["二十地球质量","如此庞大的结构仍能航行，现有文明不可能是它的建造者。","survive"],
  ["铁世界信号","空腔中央悬着一颗火星大小、质量惊人的金属行星。","hybrid"],
  ["支撑力场","蓝白量子力场托住铁世界，也会侵蚀生命与机器。","kill","voidWhale"],
  ["髓星命名","首领将那颗隐秘世界命名为髓星，并宣布一次不可公开的远征。","scan"],
  ["密令疑点","全息形象、权限签名和物理源地址之间出现无法忽视的矛盾。","defend"],
  ["秘密基地","登陆队在燃料罐下方集结，桥梁与生物改造方案全部就绪。","gauntlet"],
  ["向髓星下潜","第一部终点：穿过船壳豁口，在骗局尚未显形前踏上髓星。","kill","handX"]
];
const LEGACY_LEVEL_TEMPLATES=LEVELS.slice();
function partOneStageMonsters(stage,kind){const count=Math.min(14,2+Math.ceil(stage*.46)),types=["gray","dart","spitter","shield","acid","sniper","elite"],available=Math.min(types.length,1+Math.ceil(stage/3)),out=[];for(let i=0;i<count;i++){let type=types[(stage+i*2)%available];if(kind==="elite"&&i===0)type="elite";const a=stage*.71+i*2.37,r=13+(i%4)*7;out.push({type,x:Math.round(Math.cos(a)*r),z:Math.round(Math.sin(a)*r)});if(stage>=8&&i===1)for(let s=0;s<Math.min(8,3+Math.floor(stage/4));s++)out.push({type:"swarm",x:Math.round(Math.cos(a+s*.55)*(r+2)),z:Math.round(Math.sin(a+s*.55)*(r+2))});}return out;}
function buildPartOneStages(){return PART_ONE_STAGE_BLUEPRINTS.map((bp,i)=>{const stage=i+1,t=LEGACY_LEVEL_TEMPLATES[i%LEGACY_LEVEL_TEMPLATES.length],kind=bp[2],monsters=partOneStageMonsters(stage,kind),target=Math.min(6,3+Math.floor(stage/6)),sampleSpots=t.sampleSpots.slice(0,8).map((p,j)=>({x:p.x+(i%3-1)*2,z:p.z+((i+j)%3-1)*2}));let objective=kind==="collect"?{kind:"collect",n:target}:kind==="survive"?{kind:"survive",t:24+stage}:kind==="elite"?{kind:"elite",type:"elite"}:kind==="scan"?{kind:"scan",hold:2.4,points:sampleSpots.slice(0,3)}:kind==="hybrid"?{kind:"hybrid",n:target,kills:Math.ceil(monsters.length*.55)}:kind==="defend"?{kind:"defend",x:Math.round(t.gatePos.x*.35),z:Math.round(t.gatePos.z*.35),r:8,t:24+stage}:kind==="gauntlet"?{kind:"gauntlet",waves:3}: {kind:"kill",n:monsters.length};return {id:stage,name:bp[0],theme:t.theme,terrain:Object.assign({},t.terrain),obstacles:t.obstacles.map(o=>Object.assign({},o)),sampleSpots,sampleTarget:target,gatePos:Object.assign({},t.gatePos),monsters,boss:bp[3]||null,objective,scoreCap:120+stage*28,partOne:true,beat:bp[1]};});}
LEVELS.splice(0,LEVELS.length,...buildPartOneStages());
/* v25：第二部 21-40 关蓝图（星髓·下：登陆髓星→力场侵蚀→分裂→重返大船） */
const PART_TWO_STAGE_BLUEPRINTS=[
  ["力场侵蚀","登陆艇穿过蓝白力场，护盾与装甲同时开始剥蚀——这颗星球拒绝一切访客。","kill"],
  ["超纤维桥","先遣队在熔铁河上发现超纤维桥梁，其强度远超登陆队的工艺水平。","scan"],
  ["熔铁河岸","熔化的铁水沿河床奔流，磁暴让仪表全部失灵，只能凭本能在河岸坚守。","survive"],
  ["黑色孢林","黑色孢子林在无光处生长，采集样本的队员开始听见头顶的低语。","collect"],
  ["铁雨","轨道碎片被力场捕获，化作倾泻的铁雨——在风暴中活下来，并还手。","hybrid"],
  ["事变","舰队内乱骤起，炮火从轨道倾泻而下，登陆队在第一夜就成了弃子。","gauntlet"],
  ["四年跋涉","通讯中断后的第四年，幸存者们徒步横穿大陆，只为确认彼此还活着。","survive"],
  ["归营","循着垂降缆的残段回到最初营区，回收遗留的记录与物资。","collect"],
  ["锤翅之赐","锤翅母兽的唾液能中和力场侵蚀——猎群第一次与人类并肩而立。","defend"],
  ["新生代","在髓星出生的新生代正在长成，他们把这里当作唯一的家园。","hybrid"],
  ["分裂","回去，还是留下？营地在这一问上裂成两半，谈判最终破裂。","kill"],
  ["违望者圣像","违望者用船骸铸成巨像，宣称髓星才是应许之地，大船只是谎言。","elite"],
  ["忠诚者高桥","忠诚者开始修造通往轨道的高桥——回家，是他们唯一的教义。","defend"],
  ["空记忆库","大众记忆库被清空了，取而代之的是整齐划一的空白档案。","scan"],
  ["可用记忆库","在伪档之下找到未受损的记忆库，真实历史第一次可以被验证。","collect"],
  ["美德叛逃","最忠诚的美德使也叛逃了，追猎她的人与巨兽一同到来。","elite","kelpLeviathan"],
  ["隐藏结构","深层扫描揭示：大陆之下埋着比大船更古老的结构。","kill"],
  ["炮弹车","违望者把货舱改成电磁炮弹车，要把所有人射回轨道——或射进虚空。","gauntlet","voidWhale"],
  ["坦白","笛雾终于坦白：这场远征从启程那一刻起就是精心编排的骗局。","hybrid"],
  ["重返大船","第二部终点：借炮弹车的轨道冲回大船，向编织谎言者清算。","kill","handX"]
];
function partTwoStageMonsters(stage,kind){const local=stage-20,count=Math.min(18,4+Math.ceil(local*.6)),types=["gray","dart","spitter","shield","acid","sniper","elite"],out=[];for(let i=0;i<count;i++){let type=types[(local+i*2)%types.length];if(kind==="elite"&&i===0)type="elite";if(kind==="gauntlet"&&i%5===4)type="shield";const a=stage*.83+i*2.53,r=13+(i%4)*7;out.push({type,x:Math.round(Math.cos(a)*r),z:Math.round(Math.sin(a)*r)});if(local>=4&&i===1)for(let s=0;s<Math.min(10,4+Math.floor(local/4));s++)out.push({type:"swarm",x:Math.round(Math.cos(a+s*.5)*(r+2)),z:Math.round(Math.sin(a+s*.5)*(r+2))});}return out;}
function buildPartTwoStages(){return PART_TWO_STAGE_BLUEPRINTS.map((bp,i)=>{const stage=i+21,t=LEGACY_LEVEL_TEMPLATES[(i+2)%LEGACY_LEVEL_TEMPLATES.length],kind=bp[2],monsters=partTwoStageMonsters(stage,kind),target=Math.min(7,4+Math.floor(i/6)),sampleSpots=t.sampleSpots.slice(0,8).map((p,j)=>({x:p.x+((i+j)%3-1)*2,z:p.z+(i%3-1)*2}));let objective=kind==="collect"?{kind:"collect",n:target}:kind==="survive"?{kind:"survive",t:34+i}:kind==="elite"?{kind:"elite",type:"elite"}:kind==="scan"?{kind:"scan",hold:2.6,points:sampleSpots.slice(0,3)}:kind==="hybrid"?{kind:"hybrid",n:target,kills:Math.ceil(monsters.length*.6)}:kind==="defend"?{kind:"defend",x:Math.round(t.gatePos.x*.35),z:Math.round(t.gatePos.z*.35),r:8,t:30+i}:kind==="gauntlet"?{kind:"gauntlet",waves:4}:{kind:"kill",n:monsters.length};return {id:stage,name:bp[0],theme:t.theme,terrain:Object.assign({},t.terrain),obstacles:t.obstacles.map(o=>Object.assign({},o)),sampleSpots,sampleTarget:target,gatePos:Object.assign({},t.gatePos),monsters,boss:bp[3]||null,objective,scoreCap:680+(i+1)*32,partTwo:true,beat:bp[1]};});}
LEVELS.splice(LEVELS.length,0,...buildPartTwoStages());
/* v26：第三至五部蓝图（首领的椅子 / 荒凉 / 建造者，各 20 关，L41-100） */
const PART_THREE_STAGE_BLUEPRINTS=[
  ["银表脉冲","帕米尔循着一枚仍在走动的银表信号，潜入离奇族废弃百年的栖息地。","scan"],
  ["停摆之城","整座离奇族之城在同一刻停摆：钟表、流水，以及所有居民的日常生活。","collect"],
  ["封死燃料管","通往核心的燃料管道被人从内侧封死——封管者不想让任何人进去。","kill"],
  ["百年寻人","帕米尔找了一百多年失踪的船长。名单越来越短，他拒绝让它归零。","survive"],
  ["反应堆隧道","违望者用髓星反物质反应堆的能量，几天内打通了数百公里的隧道。","gauntlet"],
  ["违望者登船","提欧率违望者自髓星登船。他们不认为这是入侵——他们说，这是回家。","hybrid"],
  ["圣像之影","巨像的阴影投进船舱，违望者的信仰正在大船内部生根发芽。","kill"],
  ["熔融之梯","反应堆余温熔穿了甲板，梯井深处传来反物质循环的轰鸣。","kill","reefCrab"],
  ["首领的头颅","迈尔辛割下首领的头，以合法首席之名接管控制中心。","defend"],
  ["权限迷宫","控制中心承认她的头衔，却把武器、情报与门禁逐一扣留。","scan"],
  ["选择性服从","命令发出去了——只有一半军队响应。有人在替她筛选忠诚。","elite"],
  ["提欧的容器","提欧把某个更古老的意志称作容器。母亲与儿子隔着舰桥对峙。","kill","kelpLeviathan"],
  ["液氢之海","浣生沉睡在液氢海深处。复生舱的读数还活着，只是很慢。","collect"],
  ["银表铭文","铭文指向浣生的后代——这块表是有人故意留下的求救信。","scan"],
  ["洛克的幻境","洛克不用读心。她用可以验证的幻境，让人自愿说出真相。","hybrid"],
  ["髓星深层","幻境的尽头是髓星更深处的秘密：某种比笛雾更早的意志。","kill","abyssJelly"],
  ["战争地图","雷莫拉人、哈鲁萨鲁与百族的代表秘密集结，摊开作战地图。","defend"],
  ["百族集结","帕米尔以大船法律召集万族——离开名单上的全是身经百战者。","collect"],
  ["首席之位","帕米尔拒绝首领宝座，把首席之位交还给刚刚复生的浣生。","survive"],
  ["秘道决战","最后的守卫使用洛克的作战档案：激光、假目标与近身处决。","kill","handX"]
];
const PART_FOUR_STAGE_BLUEPRINTS=[
  ["雷莫拉战线","违望者进攻船壳城市，雷莫拉人拆下引擎与防护盾的部件当作武器。","defend"],
  ["护盾崩解","防护盾一节一节熄灭。船壳外的真空不再是屏障，而是战场。","gauntlet"],
  ["引擎哀鸣","十四座喷嘴第一次同时变向。大船在痛苦——或者说，在害怕。","kill","reefCrab"],
  ["重返髓星","浣生重返髓星寻找答案：建造者的痕迹正在核心深处发光。","collect"],
  ["物质源头","髓星核心持续创造物质与反物质——整艘大船或许从核心向外生长。","hybrid"],
  ["囚笼力场","量子支撑力场不是桥梁。它是一座维持了一百五十亿年的囚笼。","scan"],
  ["监狱假说","如果大船是监狱，那犯人是谁？答案让所有既有理论瞬间沉默。","elite"],
  ["越狱的低语","荒凉越过力场影响外界：以梦、以信仰、以一份份合理的命令。","kill","kelpLeviathan"],
  ["被污染的命令","笛雾、提欧、甚至引擎——都收到过同一个声音的指示。","defend"],
  ["叛变的守卫","所谓守卫可能早已叛变。它们守护的从来就不是秩序。","survive"],
  ["脊柱之战","违望者的脊柱插进了船体骨架。切断它，才能夺回航向。","gauntlet"],
  ["母亲与儿子","迈尔辛以生命拖住提欧。这一次，她在大船与儿子之间选了大船。","kill","abyssJelly"],
  ["洪水骗局","帕米尔发现液氢洪水是场骗局：威胁是真的，按钮是假的。","hybrid"],
  ["关泵行动","在洪水落下之前关泵——为髓星的数十亿居民保留生路。","defend"],
  ["拒绝屠星","你拒绝用一颗星球的居民换取胜利。战争检验手段，也检验目标。","elite"],
  ["引擎失控","荒凉接管引擎链：大船正擦过红巨星，坠向伴生黑洞。","kill","voidWhale"],
  ["黑洞边缘","黑洞也许毁不掉大船。也许，那正是它越狱的方式。","survive"],
  ["建造者的指纹","船体结构里读出建造者的意图：他们没能摧毁它，只能放逐它。","scan"],
  ["囚室坐标","所有线索指向同一处：比大船更古老的建造者囚室。","collect"],
  ["荒凉苏醒","失控航鲸接入脊柱，正把荒凉的命令转发给全部十四座喷嘴。","kill","handX"]
];
const PART_FIVE_STAGE_BLUEPRINTS=[
  ["囚室开启","建造者囚室的代行体苏醒，同时复制五类怪物的战斗技能。","gauntlet"],
  ["复制之影","它用你的战术打你。只攻击可验证的控制节点，别回应它的许诺。","kill","reefCrab"],
  ["喷嘴阵列","百族小队潜入喷嘴阵列。十四座喷嘴，每一座都有重兵把守。","collect"],
  ["第一阀门","关闭第一座阀门时，大船震了一下——像是想说什么。","defend","kelpLeviathan"],
  ["大船之声","大船拥有意识。它听见了船员的行动，并开始回应他们。","scan"],
  ["船的选择","它第一次主动协助：把正确的阀门位置画进了每个人的视野。","hybrid"],
  ["红巨星逼近","航线尽头是红巨星。荒凉要让大船连同所有证据一起蒸发。","elite"],
  ["引力窗口","借一颗流浪天体改变航向——计算窗口只有一次。","survive","abyssJelly"],
  ["铁镍撞击","一团月球大小的铁镍物质撞上船侧，大船避开了红巨星。","kill"],
  ["黑洞近邻","黑洞近在眼前。囚笼可能被打碎，囚犯可能获得自由。","defend"],
  ["最后的许诺","荒凉开出条件：打开引擎，它许诺万族一场彻底的解脱。","hybrid"],
  ["万族表决","百族表决：不放它出去。自由的承诺，由谎言铸成。","kill","voidWhale"],
  ["重封髓星","浣生下令重新封闭髓星——这一次，是基于完整证据的决定。","collect"],
  ["新任首席","浣生就任首席。档案、权限与记忆库第一次对万族公开。","scan"],
  ["记忆库重光","被清空的记忆库开始重写：真实的历史，包括所有丑陋的部分。","defend"],
  ["喷嘴熄灭","最后一座喷嘴熄灭。大船安静得像一片真正的深海。","elite","hand"],
  ["驶离银河","新航线离开银河：数千年后，抵达室女座星团。","survive"],
  ["千年之林","船上万族开始为千年之后做准备——孩子们种下了第一片林。","collect"],
  ["星髓长歌","髓星在封闭的空腔里明灭，像一颗真正的心脏。","scan"],
  ["潮声之下","大船驶向星系间的黑暗。潮声仍在——这一次，它属于所有人。","kill","handX"]
];
function lateStageMonsters(stage,kind){const local=stage-40,count=Math.min(20,6+Math.ceil(local*.5)),types=["gray","dart","spitter","shield","acid","sniper","elite"],out=[];for(let i=0;i<count;i++){let type=types[(local*2+i*3)%types.length];if(kind==="elite"&&i===0)type="elite";if(kind==="gauntlet"&&i%5===4)type="shield";if(stage>=52&&i===count-1&&type!=="elite")type="sniper";const a=stage*.61+i*2.27,r=14+(i%4)*7;out.push({type,x:Math.round(Math.cos(a)*r),z:Math.round(Math.sin(a)*r)});if(local>=6&&i===1)for(let s=0;s<Math.min(12,5+Math.floor(local/6));s++)out.push({type:"swarm",x:Math.round(Math.cos(a+s*.45)*(r+2)),z:Math.round(Math.sin(a+s*.45)*(r+2))});}return out;}
function buildLaterStages(bps,first,scoreBase,step,surviveBase,defendBase){return bps.map((bp,i)=>{const stage=first+i,t=LEGACY_LEVEL_TEMPLATES[(i+first)%LEGACY_LEVEL_TEMPLATES.length],kind=bp[2],monsters=lateStageMonsters(stage,kind),target=Math.min(8,4+Math.floor((stage-first)/7)),sampleSpots=t.sampleSpots.slice(0,8).map((p,j)=>({x:p.x+((i+j)%3-1)*2,z:p.z+(i%3-1)*2}));let objective=kind==="collect"?{kind:"collect",n:target}:kind==="survive"?{kind:"survive",t:surviveBase+i}:kind==="elite"?{kind:"elite",type:"elite"}:kind==="scan"?{kind:"scan",hold:2.8,points:sampleSpots.slice(0,3)}:kind==="hybrid"?{kind:"hybrid",n:target,kills:Math.ceil(monsters.length*.62)}:kind==="defend"?{kind:"defend",x:Math.round(t.gatePos.x*.35),z:Math.round(t.gatePos.z*.35),r:8,t:defendBase+i}:kind==="gauntlet"?{kind:"gauntlet",waves:5}:{kind:"kill",n:monsters.length};return {id:stage,name:bp[0],theme:t.theme,terrain:Object.assign({},t.terrain),obstacles:t.obstacles.map(o=>Object.assign({},o)),sampleSpots,sampleTarget:target,gatePos:Object.assign({},t.gatePos),monsters,boss:bp[3]||null,objective,scoreCap:scoreBase+(i+1)*step,beat:bp[1]};});}
LEVELS.splice(LEVELS.length,0,...buildLaterStages(PART_THREE_STAGE_BLUEPRINTS,41,1320,34,54,40),...buildLaterStages(PART_FOUR_STAGE_BLUEPRINTS,61,2000,36,64,50),...buildLaterStages(PART_FIVE_STAGE_BLUEPRINTS,81,2720,38,74,60));

/* ---- 关卡配置校验（防软锁：kill 目标 n ≤ 怪物总数） ---- */
function validateLevel(cfg){
  if(!cfg) return null;
  const obj = cfg.objective;
  if(obj && obj.kind === "kill" && obj.n > cfg.monsters.length){
    return "kill 目标 n(" + obj.n + ") 超过怪物总数(" + cfg.monsters.length + ")";
  }
  return null;
}

/* ---- CSD-M2：当前关卡便捷读取（默认回退既有全局，向后兼容） ---- */
function spots(){ return (G && G.sampleSpots) || SAMPLE_SPOTS; }
function sampleTarget(){ return (G && G.sampleTarget !== undefined) ? G.sampleTarget : TARGET_SAMPLES; }
function gatePos(){ return (G && G.gatePos) || GATE_POS; }

function freshRun(levelCfg){
  const boost = currentBoost;   // CSD-H2：当前强化档（默认 T3；L1 锁 T1 在 tick 层生效）
  if(levelCfg){
    const err = validateLevel(levelCfg);
    if(err) throw new Error("非法关卡配置: " + err);
    const gp = levelCfg.gatePos || GATE_POS;
    const monsters = levelCfg.monsters.map(m => {
      const t = MONSTER_TYPES[m.type] || MONSTER_TYPES.gray;
      const spawnBoost = levelCfg.id === 1 ? 1 : boost;   // v7：教学关按 T1 出生，其余关按当前强化档
      const bm = MONSTER_BOOST[spawnBoost] && MONSTER_BOOST[spawnBoost][m.type];
      const hp = (bm && bm.hp !== undefined) ? bm.hp : t.hp;
      const s = { type:m.type, x:m.x, z:m.z, hp, maxHp:hp, cd:0,
                  phase:Math.random()*6.28, score:t.score, base:{x:m.x,z:m.z} };
      if(m.type === "dart" || m.type === "swarm") s.lunge = { phase:"cruise", t:0, cd:0, dx:0, dz:0 };
      if(m.type === "spitter" || m.type === "acid" || m.type === "sniper") s.spit = { windup:0, cd:0 };
      if(t.bossBar) s.bossBar = true;
      /* CSD-SOUL1-P1：soulOn 时挂载招式池/韧性（类型怪；默认关闭 → 既有路径零变化） */
      if(soulOn){
        const sm = SOUL_MOVES[m.type];
        if(sm && sm.length) s.moves = sm;
        const sp = SOUL_POISE[m.type];
        if(sp) s.poise = { max:sp.max, cur:0, regen:sp.regen, regenDelay:sp.regenDelay, lastHit:0 };
      }
      return s;
    });
    const btype = levelCfg.boss ? (BOSS_TYPES[levelCfg.boss] || BOSS_TYPES.hand) : null;
    const bb = (levelCfg.boss === "handX" && MONSTER_BOOST[boost]) ? MONSTER_BOOST[boost].handX : null;   // CSD-H2：仅 handX 继承强化词缀
    const bossHp = (btype && bb && bb.hp !== undefined) ? bb.hp : (btype ? btype.hp : null);
    const boss = levelCfg.boss
      ? Object.assign({}, btype, { type:levelCfg.boss, x:gp.x, z:gp.z, cd:0, hp:bossHp, maxHp:bossHp })
      : null;
    /* CSD-SOUL1-P1：soulOn 时 BOSS 挂载招式池/韧性 */
    if(boss && soulOn){
      const sm = SOUL_MOVES[levelCfg.boss] || SOUL_MOVES.hand;
      if(sm && sm.length) boss.moves = sm;
      const sp = SOUL_POISE[levelCfg.boss] || SOUL_POISE.hand;
      if(sp) boss.poise = { max:sp.max, cur:0, regen:sp.regen, regenDelay:sp.regenDelay, lastHit:0 };
    }
    return {
      state:S.MENU, hp:HP_MAX, maxHp:HP_MAX, deathCause:null, samples:0, score:0, time:0, runTime:0,
      pulseCool:0, hitCool:0, dashCool:0, dashIFrame:0, shield:0, shieldCool:0, overdrive:0, overdriveCool:0,
      slow:0, bleed:0, bleedTick:0, winOpen:false, ending:null,
      grabbed:{}, boss, kills:0,
      weapon:1, ammo:AMMO_START, cool:{1:0, 2:0, 3:0, 4:0}, skillCd:[0,0,0], adrenalineT:0, phaseT:0, marked:0,
      level:levelCfg.id, objective:Object.assign({},levelCfg.objective), boost,
      sampleSpots:levelCfg.sampleSpots, sampleTarget:levelCfg.sampleTarget,
      gatePos:gp, obstacles:levelCfg.obstacles, scoreCap:levelCfg.scoreCap,
      terrain:levelCfg.terrain, partOne:!!levelCfg.partOne,partOneBeat:levelCfg.beat||"",spitPulses:[], enemyHazards:[], echoFields:[], monsters
    };
  }
  return {
    state:S.MENU, hp:HP_MAX, maxHp:HP_MAX, deathCause:null, samples:0, score:0, time:0, runTime:0,
    pulseCool:0, hitCool:0, dashCool:0, dashIFrame:0, shield:0, shieldCool:0, overdrive:0, overdriveCool:0,
    slow:0, bleed:0, bleedTick:0, winOpen:false, ending:null,
    grabbed:{}, boss:null, kills:0,   // S8：灰手击杀计数（结算明细）
    weapon:1, ammo:AMMO_START, cool:{1:0, 2:0, 3:0, 4:0}, skillCd:[0,0,0], adrenalineT:0, phaseT:0, boost,
    spitPulses:[], enemyHazards:[], echoFields:[],
    monsters: MONSTER_SPOTS.map(m=>({ x:m.x, z:m.z, hp:3, cd:0, phase:Math.random()*6.28 }))
  };
}
/* ---- CSD-M2：跨关切换（idx = LEVELS 0 基下标；carry.score/carry.ammo 跨关延续） ----
   保留 G.score / G.ammo；重置 samples/grabbed/cool/hitCool/kills/time/
   monsters/boss/sampleSpots 按新关配置。设置模块 G 并返回（主循环可直接 `G = startLevel(...)`）。 */
function startLevel(idx, carry){
  const cfg = LEVELS[idx];
  if(!cfg) throw new Error("未知关卡索引: " + idx);
  carry = carry || {};
  /* CSD-H2 熔断：新局（idx=0）且连续死亡重试 >3 → 自动降一档（T3→T2→T1），随后重置连续死亡计数；
     计数只在降档后清零，通关（checkWin 推进 / setEnding(WIN)）另在对应处清零——保证「连续死亡」跨局累计。 */
  if(idx === 0 && retryCount > 3){
    currentBoost = Math.max(1, currentBoost - 1);
    retryCount = 0;
  }
  const prev = G;
  const g = freshRun(cfg);
  g.score = (carry.score !== undefined) ? carry.score : (prev ? (prev.score||0) : 0);
  g.ammo  = (carry.ammo  !== undefined) ? carry.ammo  : (prev ? (prev.ammo !== undefined ? prev.ammo : AMMO_START) : AMMO_START);
  g.runTime = (carry.runTime !== undefined) ? carry.runTime : (prev ? (prev.runTime||0) : 0);
  g.gold = (carry.gold !== undefined) ? carry.gold : (prev ? (prev.gold||0) : 200);
  g.goldEarned = (carry.goldEarned !== undefined) ? carry.goldEarned : (prev ? (prev.goldEarned||0) : 0);
  g.equip = (carry.equip !== undefined) ? carry.equip.slice() : (prev ? (prev.equip||[]).slice() : []);
  g.state = S.PLAYING;
  G = g;
  return g;
}
/* 地形高度（解析式，生成地形与玩家站立共用，保证一致）
   preset：显式预设；缺省读当前关 G.terrain.preset；再无 → default（既有解析式） */
function terrainHeight(x, z, preset){
  const key = preset || (G && G.terrain && G.terrain.preset) || "default";
  const p = TERRAIN_PRESETS[key] || TERRAIN_PRESETS.default;
  return p.a1*Math.sin(x*p.f1) + p.a2*Math.cos(z*p.f2)
       + p.a3*Math.sin(x*p.f3+z*p.f4) + p.a4*Math.cos(x*p.f5+z*p.f6);
}
/* 场景障碍（岩石/废墟柱/藻柱）：水平圆碰撞（关卡模式用 G.obstacles，默认回退既有） */
const DEBRIS = [
  {x: 10, z: -4, r:0.9},{x:-10, z: 10, r:0.9},{x: 18, z: 14, r:0.9},
  {x:-16, z: -8, r:0.9},{x:  8, z: 22, r:0.9},{x: -6, z:-20, r:0.9}
];
const OBSTACLES = [
  {x: 8, z:-6, r:1.6},{x:-9, z: 7, r:1.9},{x:12, z:12, r:1.5},{x:-14,z:-11,r:2.1},
  {x:18, z:-14,r:1.7},{x:-20,z: 16, r:1.8},{x:22, z: 4, r:1.4},{x:-24,z:-2, r:2.0},
  {x: 6, z: 20, r:1.6},{x:-6, z:-22, r:1.5},{x:16, z: 24, r:1.8},{x:-16,z: 24, r:1.6},
  {x: 28, z:-22, r:1.5},{x:-28,z:-18, r:1.7},{x: 30, z: 18, r:1.9},{x:-30,z: 6, r:1.5},
  {x: 2, z: 30, r:1.7},{x: 0, z:-30, r:1.6},{x:26, z: 0, r:1.8},{x:-26,z:-10, r:1.6}
].concat(DEBRIS);
/* 地图边界（地形为 ±70，留安全边距防止掉出世界） */
const MAP_LIMIT = 62;
function clampToMap(px, pz){
  return [Math.max(-MAP_LIMIT, Math.min(MAP_LIMIT, px)), Math.max(-MAP_LIMIT, Math.min(MAP_LIMIT, pz))];
}
function resolveCollision(px, pz, pr){
  const list = (G && G.obstacles) || OBSTACLES;
  for(const o of list){
    const dx = px-o.x, dz = pz-o.z;
    let d = Math.sqrt(dx*dx+dz*dz);
    const min = o.r + pr;
    if(d < min){
      let nx = dx, nz = dz, nd = d;
      if(d < 0.0001){ nx = 1; nz = 0; nd = 1; } // 恰在圆心：向固定方向推出
      const amt = min - d;                      // 用原始距离计算推出量
      px += nx/nd*amt; pz += nz/nd*amt;
    }
  }
  /* v33 建筑碰撞体（地标/宝箱/信标等注册进 G.solids）——玩家与怪物同样被推出 */
  for(const o of ((G && G.solids) || [])){
    const dx = px-o.x, dz = pz-o.z;
    let d = Math.sqrt(dx*dx+dz*dz);
    const min = o.r + pr;
    if(d < min){
      let nx = dx, nz = dz, nd = d;
      if(d < 0.0001){ nx = 0; nz = 1; nd = 1; }
      const amt = min - d;
      px += nx/nd*amt; pz += nz/nd*amt;
    }
  }
  return [px, pz];
}
/* ---- CSD-H2：弹丸碰障碍销毁（设计 §3）---- */
/* 出生重叠豁免：弹丸出生点与某障碍重叠（dist < o.r + p.r）→ 记入 exempt，
   该弹丸对这些障碍跳过判定（防贴脸射击被瞬吞；resolveCollision 已把玩家推出障碍，仅兜底）。 */
function spawnExemptObstacles(x, z, r){
  const list = (G && G.obstacles) || OBSTACLES;
  const out = [];
  for(const o of list){
    if(Math.hypot(o.x - x, o.z - z) < o.r + r) out.push(o);
  }
  return out;
}
/* 水平圆碰撞：dist(弹丸, 圆心) < o.r + p.r（玩家弹丸 r=0.35 / 墨弹 r=1.0）；
   返回命中障碍对象（非豁免）或 null。 */
function pulseBlockedByObstacle(p){
  const list = (G && G.obstacles) || OBSTACLES;
  const r = p.r || 0.35;
  const exempt = p.exempt || [];
  for(const o of list){
    if(exempt.indexOf(o) >= 0) continue;              // 出生重叠豁免：跳过该障碍
    if(Math.hypot(o.x - p.x, o.z - p.z) < o.r + r) return o;
  }
  return null;
}
/* 样本与怪物出生点 */
const SAMPLE_SPOTS = [
  {x: 5, z: 8},{x:-7, z: 12},{x:14, z:-8},{x:-12,z:-6},
  {x: 20, z: 10},{x:-18,z: 18},{x: 8, z:-20},{x:-8, z: 22},
  {x: 24, z:-16},{x:-22,z:-20},{x: 26, z: 24},{x:-26,z: 2}
];
const MONSTER_SPOTS = [
  {x: 10, z: 14},{x:-14, z:-14},{x: 18, z:-24},{x:-20, z: 26}
];
const GATE_POS = { x: 32, z: -28 };

/* 资源与计分（纯逻辑） */
/* CSD-SOUL1-FUN：连杀 combo——3 秒内连续击杀叠加，每级 +5 分（渲染层读 G.combo 弹提示） */
function noteKill(m, opts){
  opts = opts || {};
  const base = (m && m.score !== undefined) ? m.score : 25;
  G.combo = (G.combo || 0) + 1;
  if(G.combo > (G.bestCombo || 0)) G.bestCombo = G.combo;   // v24.15 结算统计：最高连杀
  G.comboTimer = 3.0;
  const bonus = Math.max(0, (G.combo - 1) * 5);
  G.score += Math.round((base + bonus) * (G.scoreMul || 1));
  if(opts.countKill !== false) G.kills = (G.kills || 0) + 1;
  /* v24.11 分裂词缀：死亡分裂 2 只幼体（渲染层按 G.monsters 增量补建网格） */
  if(m && m.affix === "splitter" && G.monsters.filter(x=>x.hp>0).length < 16){
    const spawnHp = Math.max(2, Math.ceil((m.maxHp||10)*.15));
    for(let si=0;si<2;si++){
      G.monsters.push({ type:"swarm", x:m.x+(Math.random()-.5)*3, z:m.z+(Math.random()-.5)*3,
                        hp:spawnHp, maxHp:spawnHp, cd:.5, phase:Math.random()*7, score:10 });
    }
  }
  /* v7：同伴倒下会激怒附近怪物，形成群体协同压力。 */
  if(m && G.monsters){
    for(const ally of G.monsters){
      if(ally!==m && ally.hp>0 && Math.hypot(ally.x-m.x,ally.z-m.z)<9){
        ally.rage={t:Math.max(4,(ally.rage&&ally.rage.t)||0),source:"fallen"};
      }
    }
  }
  return { base, bonus, combo: G.combo };
}
function tickCombo(dt){
  if(G.comboTimer > 0){
    G.comboTimer -= dt;
    if(G.comboTimer <= 0) G.combo = 0;
  }
}
function updateResources(dt){
  if(G.state!==S.PLAYING) return;
  G.time += dt;
  G.runTime = (G.runTime || 0) + dt;
  /* v24.3/v32 氧气系统彻底移除 */
  const coolDt=dt*((G.overdrive||0)>0?1.75:1);
  for(const k in G.cool) G.cool[k] = Math.max(0, G.cool[k]-coolDt);
  G.pulseCool = G.cool[1];                                         // 兼容别名：pulseCool ≡ cool[1]
  G.hitCool = Math.max(0, G.hitCool-dt);
  G.dashCool = Math.max(0, (G.dashCool||0)-dt);
  G.dashIFrame = Math.max(0, (G.dashIFrame||0)-dt);
  G.perfectDodge = Math.max(0, (G.perfectDodge||0)-dt);   // v23：完美闪避增伤窗口倒计时
  G.shield = Math.max(0,(G.shield||0)-dt); G.shieldCool=Math.max(0,(G.shieldCool||0)-dt);
  G.overdrive = Math.max(0,(G.overdrive||0)-dt); G.overdriveCool=Math.max(0,(G.overdriveCool||0)-dt);
  G.slow=Math.max(0,(G.slow||0)-dt);
  if((G.bleed||0)>0){
    G.bleed=Math.max(0,G.bleed-dt);G.bleedTick=(G.bleedTick||0)-dt;
    if(G.bleedTick<=0){G.bleedTick=1.0;playerHit(3);}
  }else G.bleedTick=0;
  tickCombo(dt);   // CSD-SOUL1-FUN：连杀窗口倒计时
}
function collectSample(i){
  const s = spots();
  if(i<0 || i>=s.length) return false;
  if(!G || G.samples>=sampleTarget()) return false;
  G.samples++;{const kg=Math.round(40*((G&&G.goldMul)||1));G.gold=(G.gold||0)+kg;G.goldEarned=(G.goldEarned||0)+kg;}
  G.score += Math.round(10*(G.scoreMul||1));
  G.hp = Math.min(G.maxHp||HP_MAX, (G.hp === undefined ? (G.maxHp||HP_MAX) : G.hp) + 5);
  if(G.ammo !== undefined) G.ammo = Math.min(AMMO_MAX, G.ammo + AMMO_GAIN);   // R4：渊棘弹药回补（样本 +2，上限 6）
  if(G.samples>=sampleTarget()){
    // CSD-M2：仅默认单关（无 level 配置）自动刷 BOSS；多关模式的 BOSS 由关卡配置生成
    if(G.level === undefined && (!G.boss || G.boss.hp<=0)){
      G.boss = { hp:BOSS_HP, maxHp:BOSS_HP, x:gatePos().x, z:gatePos().z, cd:0 };
    }
    G.winOpen = !G.boss || G.boss.hp<=0;
  }
  return true;
}
/* 玩家在附近拾取最近样本（管理 grabbed 防重，返回被拾取的样本序号或 -1） */
function tryCollect(px, pz){
  if(!G || G.state!==S.PLAYING || G.samples>=sampleTarget()) return -1;
  const s = spots();
  const scanPts=(G.objective&&G.objective.kind==="scan")?(G.objective.points||[]):null;   // v24.16 扫描点不可拾取
  let best = -1, bd = 3;
  for(let i=0;i<s.length;i++){
    if(G.grabbed[i]) continue;
    if(scanPts && scanPts.indexOf(s[i])>=0) continue;
    const d = Math.hypot(s[i].x-px, s[i].z-pz);
    if(d < bd){ bd = d; best = i; }
  }
  if(best>=0){
    G.grabbed[best] = true;
    collectSample(best);
    return best;
  }
  return -1;
}
function playerHit(dmg, chain){
  if((G.phaseT||0)>0)return false;   // v28 相位撤离：虚化免疫
  dmg=dmg*((G.wellAffix&&G.wellAffix.dmg)||1);   // v31 深井词缀
  if((G.dashIFrame||0)>0){
    /* v23 完美闪避：受击落在冲刺后 0.12s 完美窗口内（dashIFrame>.22）→ 2.5s 增伤窗口 + 冲刺冷却返还。
       逻辑层只写状态；时停/粒子/音效/飘字由渲染层消费 G.perfectDodgeFx 触发。 */
    if((G.dashIFrame||0)>.22 && !(G.perfectDodge>0)){
      G.perfectDodge=2.5;
      G.dashCool=Math.min(G.dashCool||0,.7);
      G.perfectDodgeFx=1;
    }
    return false;   // v5：闪避冲刺期间免疫所有伤害（包括连击段）
  }
  if((G.shield||0)>0) return false;
  if(G.hitCool>0 && !chain) return false;   // chain：连击段无视 i-frame（被连招抓住→吃满全段）
  G.hitCool = 1.0;   // CSD-SOUL1-HARD：受击无敌帧 1.2→1.0s（连续失误更致命）
  /* CSD-H2：受击改扣 HP（原扣氧；数值不变，结算目标改 HP）；HP<=0 → OVER + deathCause="hp"。
     首因锁定：同帧双条件（氧耗尽 + HP 归零）时，先触发者胜，OVER 后不再覆盖死因。 */
  if(G.modeId==="endless"&&G.endless)dmg*=G.endless.damageMul||1;
  dmg *= (runBuild && runBuild.damageTaken) || 1;
  G.hp = Math.max(0, (G.hp === undefined ? HP_MAX : G.hp) - dmg);
  if(G.hp<=0 && G.state !== S.OVER && runBuild.secondWind && !G.secondWindUsed){G.secondWindUsed=true;G.hp=1;if(typeof toast==="function")toast("第二鳃室 · 濒死续命");return true;}
  if(G.hp<=0 && G.state !== S.OVER){ G.hp=0; G.deathCause="hp"; setEnding(S.OVER); }
  return true;
}
function firePulse(px, py, pz, dx, dy, dz){
  return fireWeapon(1, px, py, pz, dx, dy, dz);   // R1：兼容包装 → 统一入口 wid=1（弹速=单位方向×24、寿命 1.0=射程 24）
}
function damageAmount(v){return Math.max(.25,Math.round(v*((G&&G.stormDmg)||1)*100)/100);}   // v31 风暴全局伤害
/* R1（武器系统 v1.1）：统一武器发射入口 fireWeapon(wid, px,py,pz, dx,dy,dz)
   wid=1 声呐脉冲（修正射程）/ wid=2 渊棘之矛（消耗弹药）/ wid=3 深渊回响（即时 AOE）
   返回：
   - wid 1/2 → 弹丸对象 {wid,x,y,z,vx,vy,vz,life,r,dmg,knock}；失败（冷却/空弹/非 PLAYING）→ null
   - wid 3   → 命中事件数组 []（对齐 tickPulses 事件格式；R3 施放瞬间同步结算，不进 pulses 数组）；
               失败（冷却/非 PLAYING）→ null */
function fireWeapon(wid, px, py, pz, dx, dy, dz, yawArg){
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
  if(w.melee){                                    // v28 近战扇击 + v29 三段连击（第三段加大加重）
    const now=G.time||0;
    if(now-(G.meleeLastT||-9)>0.9)G.meleeCombo=0;
    const seg=G.meleeCombo%3,mult=[1,1.1,1.45][seg],third=seg===2;
    G.meleeLastT=now;G.meleeCombo=(G.meleeCombo+1)%3;
    return meleeCone(px, py, pz, yaw, w.radius+(third?.6:0), w.halfAngle+(third?.15:0), w.dmg*mult, w.knock*(third?1.3:1), wid);
  }
  const len = Math.hypot(dx, dy, dz) || 1;
  const contextual=(runBuild && ((runBuild&&runBuild.lowHpRage&&G.hp/G.maxHp<.35)?runBuild.lowHpRage:0));
  const close=(G.monsters||[]).some(m=>m.hp>0&&Math.hypot(m.x-px,m.z-pz)<5)?(runBuild.closeDamage||0):0;
  const bossBonus=(G.boss&&G.boss.hp>0)?(runBuild.bossDamage||0):0;
  G.shotCount=(G.shotCount||0)+1;
  if(G&&G.stormDmg)0;   // v31 风暴加成经 damageAmount 全局生效
  const injected=G.equipElem||null;   // v30 元素注入器（优先级高于阴阳弹匣）
  const altElem=(!injected&&G.equipElemAlt&&(G.shotCount%2===0))?"corrode":null;   // 阴阳弹匣：隔发蚀元素 → 稳定触发元素反应
  const hitElem=injected||altElem||undefined;
  return { wid, x:px, y:py, z:pz,
           vx:dx/len*w.speed*(wid===2?(runBuild.thornSpeed||1):1), vy:dy/len*w.speed, vz:dz/len*w.speed*(wid===2?(runBuild.thornSpeed||1):1),
           life:w.life,r:.35,dmg:damageAmount(w.dmg*1.6*(G.damageMul||1)*(1+contextual+close+bossBonus)*((G.overdrive||0)>0?1.75:1)*(G.perfectDodge>0?1.6:1)),knock:w.knock,
           blast:w.blast||(G.equipBlast?2.6:undefined),
           pierceLeft:((G.equipPierce||0)+((wid===1&&runBuild.sonarPierce)?99:0))||undefined,
           home:(G.equipHome||0)||undefined,
           elem:hitElem,
           hitList:[],
           exempt:spawnExemptObstacles(px, pz, 0.35) };   // CSD-H2：出生重叠豁免
}
/* v23 蓄力重击：按住发射键 ≥0.65s 后松开 → 强化弹丸（1 号 AOE 溅射 / 2 号贯穿），不吃普射冷却。
   与普射同用 WEAPONS 表数值：dmg ×3.2、弹体 r=.55、击退 2.2、寿命 +0.25、速度 ×1.15。 */
function fireCharged(wid, px, py, pz, dx, dy, dz, yawArg){
  if(!G || G.state!==S.PLAYING) return null;
  const w = WEAPONS[wid];
  if(!w) return null;
  if((G.cool[wid]||0) > 0) return null;
  if(wid === 2){
    if((G.ammo||0) <= 0) return null;
    G.ammo--;
  }
  G.cool[wid] = Math.max((G.cool[wid]||0), .35)*((G.adrenalineT>0)?.55:1);
  if(wid === 1) G.pulseCool = G.cool[wid];
  notePlayerAttack();
  if(w.melee){                                    // v28：近战蓄力 = 崩地重斩（扇形 ×1.35，伤害 ×2）
    return meleeCone(px, py, pz, (yawArg!==undefined)?yawArg:Math.atan2(dx||.001,dz||.001), w.radius*1.35, w.halfAngle+.35, w.dmg*2, w.knock*1.2, wid);
  }
  const len = Math.hypot(dx, dy, dz) || 1;
  const contextual=(runBuild && ((runBuild&&runBuild.lowHpRage&&G.hp/G.maxHp<.35)?runBuild.lowHpRage:0));
  const close=(G.monsters||[]).some(m=>m.hp>0&&Math.hypot(m.x-px,m.z-pz)<5)?(runBuild.closeDamage||0):0;
  const bossBonus=(G.boss&&G.boss.hp>0)?(runBuild.bossDamage||0):0;
  return { wid, x:px, y:py, z:pz,
           vx:dx/len*w.speed*1.15, vy:dy/len*w.speed*1.15, vz:dz/len*w.speed*1.15,
           life:w.life+.25, r:.55, charge:true, knock:2.2, blast:w.blast?w.blast*1.2:undefined, hitList:[],
           dmg:damageAmount(w.dmg*3.2*1.6*(G.damageMul||1)*(1+contextual+close+bossBonus)*((G.overdrive||0)>0?1.75:1)*(G.perfectDodge>0?1.6:1)),
           exempt:spawnExemptObstacles(px, pz, 0.55) };
}
/* R3：深渊回响——以玩家位置 (px,pz) 为圆心、半径 7 即时判定范围内怪物+BOSS。
   伤害 2/目标、击退 3.0（仅怪物；BOSS 只结算伤害，避免与 BOSS AI 位移冲突）。
   CSD-M2：击杀得分按 m.score（出生时从类型表写入）；刃鳍被回响击退即打断扑击。
   返回事件数组对齐 tickPulses：{type:"hit"|"kill"|"boss"|"bossKill", wid:3}。 */
function castEcho(px, py, pz){
  const w = WEAPONS[3];
  const radius=w.radius*(runBuild.echoRadius||1)+(G.echoBonus||0), knock=w.knock*(runBuild.echoKnock||1);
  if(runBuild.echoField){G.echoFields=G.echoFields||[];G.echoFields.push({x:px,z:pz,r:radius,life:3});}
  const hits = [];
  for(const m of G.monsters){
    if(m.hp<=0) continue;
    const d = Math.hypot(m.x-px, m.z-pz);
    if(d < radius){
      const gm = guardMult(m);   // CSD-SOUL1-P2：防御态减伤（AOE 不可被闪避规避，只吃格挡减伤）
      const wm=consumeWard(m);
      m.hp-=damageAmount(w.dmg*(G.damageMul||1)*((G.overdrive||0)>0?1.75:1)*gm.dmg*wm);
      m.cd = Math.max(m.cd, hitStaggerCd(m));   // CSD-H2：受击硬直 cd 按强化档
      interruptDart(m);   // CSD-M2：回响击退打断刃鳍扑击
      /* CSD-SOUL1-P1：回响韧性 3.0 累积 → 破韧打断（interruptDart 超集）；未破韧普通招受击即断 */
      const broke = applyPoiseHit(m, 3, gm.poise);
      if(!broke) interruptMove(m);
      /* CSD-SOUL1-P1：break 态免疫击退（防推出处决范围）；P2：防御态免击退 */
      if(!(m.break && m.break.t > 0) && gm.dmg >= 1){
        m.x += (m.x-px)/(d||1)*knock; m.z += (m.z-pz)/(d||1)*knock;
      }
      if(gm.dmg < 1) hits.push({type:"guarded", mx:m.x, mz:m.z, wid:3});
      if(wm < 1) hits.push({type:"warded", mx:m.x, mz:m.z, wid:3});
      hits.push({type:"hit", mx:m.x, mz:m.z, wid:3});
      if(m.hp<=0){ if(m.type==="acid"){G.enemyHazards=G.enemyHazards||[];G.enemyHazards.push({kind:"acidPool",x:m.x,z:m.z,r:3.6,life:7,max:7,dmg:8,tick:0,tickRate:.8});} noteKill(m); if(runBuild.echoDash)G.dashCool=0; hits.push({type:"kill", mx:m.x, mz:m.z, wid:3}); }
    }
  }
  if(G.boss && G.boss.hp>0 && (G.level===undefined||baseObjectiveMet())){
    const d = Math.hypot(G.boss.x-px, G.boss.z-pz);
    if(d < radius){
      const gm = guardMult(G.boss);   // CSD-SOUL1-P2：BOSS 防御态减伤
      G.boss.hp-=damageAmount(w.dmg*(G.damageMul||1)*((G.overdrive||0)>0?1.75:1)*gm.dmg);
      if(G.boss.poise) applyPoiseHit(G.boss, 3, gm.poise);   // CSD-SOUL1-P1：回响对 BOSS 也累积韧性
      if(gm.dmg < 1) hits.push({type:"guarded", bx:G.boss.x, bz:G.boss.z, wid:3});
      hits.push({type:"boss", bx:G.boss.x, bz:G.boss.z, wid:3});
      if(G.boss.hp<=0){ noteKill(G.boss, {countKill:false}); hits.push({type:"bossKill", bx:G.boss.x, bz:G.boss.z, wid:3}); }
    }
  }
  return hits;
}
/* v28：近战扇击（迈尔辛专属武器）——以玩家为圆心的扇形瞬时判定，镜像 castEcho 结算 */
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
    const dealt=damageAmount(dmgBase*(G.skillPow||1)*1.6*(G.damageMul||1)*((G.overdrive||0)>0?1.75:1)*gm.dmg*wm*(crit?2+(G.critDmg||0):1)*(.88+Math.random()*.24));
    G.dmgByWid=G.dmgByWid||{};G.dmgByWid[wid]=(G.dmgByWid[wid]||0)+dealt;
    let diedInReaction=false;
    {const aliveBefore=m.hp>0;applyElementHit(m,ELEM_OF_WEAPON[wid],hits);diedInReaction=aliveBefore&&m.hp<=0;}
    {const sg=shieldGate(m,dealt,ELEM_OF_WEAPON[wid]);m.hp-=sg.hp;if(sg.sh>0)hits.push({type:"shieldHit",mx:m.x,mz:m.z,dmg:sg.sh,elem:m.eshield?m.eshield.elem:"tide",brk:sg.brk});if(sg.brk)m.eshield=null;}
    m.cd=Math.max(m.cd,hitStaggerCd(m));interruptDart(m);
    const broke=applyPoiseHit(m,wid,gm.poise);if(!broke)interruptMove(m);
    if(!(m.break&&m.break.t>0)&&gm.dmg>=1){m.x+=(m.x-px)/(d||1)*knock;m.z+=(m.z-pz)/(d||1)*knock;}
    if(gm.dmg<1)hits.push({type:"guarded",mx:m.x,mz:m.z,wid});
    if(wm<1)hits.push({type:"warded",mx:m.x,mz:m.z,wid});
    hits.push({type:"hit",mx:m.x,mz:m.z,wid,dmg:dealt,crit});
    if(m.affix==="scorch"){G.hp=Math.max(0,G.hp-5);hits.push({type:"hit",mx:player.x,mz:player.z,wid,dmg:5});toast("灼热反伤！");}
    if(m.hp<=0&&!diedInReaction){if(m.type==="acid"){G.enemyHazards=G.enemyHazards||[];G.enemyHazards.push({kind:"acidPool",x:m.x,z:m.z,r:3.6,life:7,max:7,dmg:8,tick:0,tickRate:.8});}noteKill(m);hits.push({type:"kill",mx:m.x,mz:m.z,wid,target:m.type,dmg:dealt,crit});}
  }
  if(G.boss&&G.boss.hp>0&&(G.level===undefined||baseObjectiveMet())){
    const d=Math.hypot(G.boss.x-px,G.boss.z-pz);
    if(d<radius+1.6){
      const gm=guardMult(G.boss),crit2=Math.random()<.12+(G.critBonus||0);
      const dealt=damageAmount(dmgBase*(G.skillPow||1)*1.6*(G.damageMul||1)*((G.overdrive||0)>0?1.75:1)*gm.dmg*(crit2?2+(G.critDmg||0):1)*(.88+Math.random()*.24));
      {const sg=shieldGate(G.boss,dealt,ELEM_OF_WEAPON[wid]);G.boss.hp-=sg.hp;if(sg.sh>0)hits.push({type:"shieldHit",bx:G.boss.x,bz:G.boss.z,dmg:sg.sh,elem:G.boss.eshield?G.boss.eshield.elem:"tide",brk:sg.brk});if(sg.brk)G.boss.eshield=null;}
      if(G.boss.poise)applyPoiseHit(G.boss,wid,gm.poise);
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
    const dealt=damageAmount(dmgBase*(G.skillPow||1)*1.6*(G.damageMul||1)*((G.overdrive||0)>0?1.75:1)*gm.dmg*(crit?2+(G.critDmg||0):1)*(.88+Math.random()*.24));
    {const sg=shieldGate(m,dealt,ELEM_OF_WEAPON[wid]);m.hp-=sg.hp;if(sg.sh>0)hits.push({type:"shieldHit",mx:m.x,mz:m.z,dmg:sg.sh,elem:m.eshield?m.eshield.elem:"tide",brk:sg.brk});if(sg.brk)m.eshield=null;}
    m.cd=Math.max(m.cd,hitStaggerCd(m));interruptDart(m);
    if(!(m.break&&m.break.t>0)&&gm.dmg>=1){m.x+=(m.x-px)/(d||1)*knock;m.z+=(m.z-pz)/(d||1)*knock;}
    hits.push({type:"hit",mx:m.x,mz:m.z,wid,dmg:dealt,crit});
    if(m.hp<=0){noteKill(m);hits.push({type:"kill",mx:m.x,mz:m.z,wid,target:m.type,dmg:dealt,crit});}
  }
  if(G.boss&&G.boss.hp>0&&(G.level===undefined||baseObjectiveMet())){
    const d=Math.hypot(G.boss.x-px,G.boss.z-pz);
    if(d<radius+1.6){
      const dealt=damageAmount(dmgBase*(G.skillPow||1)*1.6*(G.damageMul||1)*((G.overdrive||0)>0?1.75:1));
      {const sg=shieldGate(G.boss,dealt,ELEM_OF_WEAPON[wid]);G.boss.hp-=sg.hp;if(sg.sh>0)hits.push({type:"shieldHit",bx:G.boss.x,bz:G.boss.z,dmg:sg.sh,elem:G.boss.eshield?G.boss.eshield.elem:"tide",brk:sg.brk});if(sg.brk)G.boss.eshield=null;}
      hits.push({type:"boss",bx:G.boss.x,bz:G.boss.z,wid,dmg:dealt});
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
    const dealt=damageAmount(dmgBase*(G.skillPow||1)*1.6*(G.damageMul||1)*((G.overdrive||0)>0?1.75:1)*(crit?2+(G.critDmg||0):1)*(.88+Math.random()*.24));
    {const sg=shieldGate(m,dealt,ELEM_OF_WEAPON[wid]);m.hp-=sg.hp;if(sg.sh>0)hits.push({type:"shieldHit",mx:m.x,mz:m.z,dmg:sg.sh,elem:m.eshield?m.eshield.elem:"tide",brk:sg.brk});if(sg.brk)m.eshield=null;}
    m.cd=Math.max(m.cd,hitStaggerCd(m));interruptDart(m);
    hits.push({type:"hit",mx:m.x,mz:m.z,wid,dmg:dealt,crit});
    if(m.hp<=0){noteKill(m);hits.push({type:"kill",mx:m.x,mz:m.z,wid,target:m.type,dmg:dealt,crit});}
  }
  if(G.boss&&G.boss.hp>0&&(G.level===undefined||baseObjectiveMet())){
    const dx2=G.boss.x-px,dz2=G.boss.z-pz;
    const along=dx2*Math.sin(yaw)+dz2*Math.cos(yaw);
    const perp=Math.abs(dx2*Math.cos(yaw)-dz2*Math.sin(yaw));
    if(along>0&&along<length&&perp<width+1.2){
      const dealt=damageAmount(dmgBase*(G.skillPow||1)*1.6*(G.damageMul||1)*((G.overdrive||0)>0?1.75:1));
      {const sg=shieldGate(G.boss,dealt,ELEM_OF_WEAPON[wid]);G.boss.hp-=sg.hp;if(sg.sh>0)hits.push({type:"shieldHit",bx:G.boss.x,bz:G.boss.z,dmg:sg.sh,elem:G.boss.eshield?G.boss.eshield.elem:"tide",brk:sg.brk});if(sg.brk)G.boss.eshield=null;}
      hits.push({type:"boss",bx:G.boss.x,bz:G.boss.z,wid,dmg:dealt});
      if(G.boss.hp<=0){noteKill(G.boss,{countKill:false});hits.push({type:"bossKill",bx:G.boss.x,bz:G.boss.z,wid});}
    }
  }
  return hits;
}
/* 武器切换（设计 §5.4）：切到 1-3，零惩罚（不重置冷却、不损失弹药）；
   非 PLAYING（暂停/结算/死亡）拒绝（逻辑层守卫）。返回是否成功。 */
function setWeapon(wid){
  if(!G || G.state!==S.PLAYING) return false;
  if(!WEAPONS[wid]) return false;
  G.weapon = wid;
  return true;
}
/* v23 PERF：本帧被移除的弹丸复用数组——渲染层据此回收网格，替代原先每帧 slice+indexOf 全量比对 */
const PULSES_REMOVED=[];
function tickPulses(dt, pulses){
  const hits = [];
  PULSES_REMOVED.length = 0;
  for(let i=pulses.length-1;i>=0;i--){
    const p = pulses[i];
    p.x += p.vx*dt; p.y += p.vy*dt; p.z += p.vz*dt; p.life -= dt;
    let consumed = false;
    if(p.home){                                     // v28 狩猎浮标：子弹制导（9 米内最近敌人）
      let bm=null,bd=9;
      for(const hm of G.monsters){if(hm.hp<=0)continue;const hd=Math.hypot(hm.x-p.x,hm.z-p.z);if(hd<bd){bd=hd;bm=hm;}}
      if(bm){const sp=Math.hypot(p.vx,p.vz)||1;const na=Math.atan2(bm.x-p.x,bm.z-p.z);const ca=Math.atan2(p.vx,p.vz);
        let da=na-ca;while(da>Math.PI)da-=2*Math.PI;while(da<-Math.PI)da+=2*Math.PI;
        const wa=ca+da*Math.min(1,dt*4);p.vx=Math.sin(wa)*sp;p.vz=Math.cos(wa)*sp;}
    }
    /* CSD-H2：玩家弹丸（wid 1/2）命中障碍 → 立即销毁 + block 事件（设计 §3.1）。
       位移后、命中怪/BOSS 判定前；出生重叠豁免（exempt）；障碍后的怪物不受伤。 */
    if(p.wid !== 3 && pulseBlockedByObstacle(p)){
      hits.push({type:"block", wid:p.wid||1, x:p.x, y:p.y, z:p.z});
      PULSES_REMOVED.push(p); pulses.splice(i,1);
      continue;
    }
    const dmg = p.dmg || 1;                        // 命中伤害按武器（声呐1 / 渊棘3；缺省=1 兼容既有手构脉冲）
    const knock = (p.knock === undefined) ? 1.2 : p.knock;   // 击退（声呐1.2 / 渊棘0.8；缺省=1.2）
    for(const m of G.monsters){
      if(m.hp<=0) continue;
      if(m.evade) continue;   // CSD-SOUL1-P2：闪避 i-frame（弹丸穿透，AOE 不可避）
      if(p.hitList&&p.hitList.indexOf(m)>=0) continue;   // v28 贯穿：同一目标只结算一次
      if(m.affix==="phantom"&&Math.random()<.25)continue;   // v39 虚影 25% 闪避
      if(m.affix==="phantom"&&Math.random()<.25)continue;   // v39 虚影 25% 闪避
      const d = Math.sqrt((m.x-p.x)**2+(m.z-p.z)**2);
      if(d < 1.6){
        const gm = projectileGuardMult(m,p);   // 甲壳盾卫正面近乎免伤，绕背或破韧
        const wm=consumeWard(m), breakBonus=(m.break&&m.break.t>0&&p.wid===2)?(1+(runBuild.thornBreak||0)):1, markBonus=(m.sonarMark&&m.sonarMark.t>0)?(1+(runBuild.sonarMark||0)):1;
        /* v24.7：暴击（12% ×2）与 ±12% 浮动，伤害数字有生命 */
        const crit=Math.random()<.12+(G.critBonus||0);
        const dealt=damageAmount(dmg*gm.dmg*wm*breakBonus*markBonus*((m.rust&&m.rust.t>0)?1.25:1)*((m.marked>0)?1.5:1)*(crit?2+(G.critDmg||0):1)*(.88+Math.random()*.24));   // v28 弱点标记 +50%
        G.dmgByWid=G.dmgByWid||{};G.dmgByWid[p.wid||1]=(G.dmgByWid[p.wid||1]||0)+dealt;   // v24.15 结算统计：武器伤害分布
        /* v23.1：元素反应先于伤害结算（处决一击同样触发反应）；反应致死由 reaction 内部计分，主击杀不重复 */
        let diedInReaction=false;
        { const aliveBefore=m.hp>0; applyElementHit(m, (p.elem||ELEM_OF_WEAPON[p.wid]), hits); diedInReaction=aliveBefore&&m.hp<=0; }
        {const sg=shieldGate(m,dealt,(p.elem||ELEM_OF_WEAPON[p.wid]));m.hp-=sg.hp;if(sg.sh>0)hits.push({type:"shieldHit",mx:m.x,mz:m.z,dmg:sg.sh,elem:m.eshield?m.eshield.elem:"tide",brk:sg.brk});if(sg.brk)m.eshield=null;}
        m.cd = Math.max(m.cd, hitStaggerCd(m));   // CSD-H2：受击硬直 cd 按强化档
        interruptDart(m);   // CSD-M2：扑击中被击中 → 打断（cd 重置 0.6）
        /* CSD-SOUL1-P1：韧性累积 → 破韧打断（interruptDart 超集）；未破韧普通招受击即断 */
        const broke = applyPoiseHit(m, p.wid || 1, gm.poise);
        if(!broke) interruptMove(m);
        /* CSD-SOUL1-P1：break 态免疫击退（防推出处决范围）；P2：防御态免击退 */
        if(!(m.break && m.break.t > 0) && gm.dmg >= 1){
          m.x += (m.x-p.x)/(d||1)*knock; m.z += (m.z-p.z)/(d||1)*knock;
        }
        if(gm.dmg < 1) hits.push({type:"guarded", mx:m.x, mz:m.z, wid:p.wid||1});
        if(wm < 1) hits.push({type:"warded", mx:m.x, mz:m.z, wid:p.wid||1});
        if(p.wid===1&&runBuild.sonarMark)m.sonarMark={t:.5};
        applyElementHit(m, (p.elem||ELEM_OF_WEAPON[p.wid]), hits);   // v23.1：元素附着/反应结算
        hits.push({type:"hit", mx:m.x, mz:m.z, wid:p.wid||1, dmg:dealt, crit:crit});
        if(m.affix==="volt"&&Math.random()<.2){G.hp=Math.max(0,G.hp-8);hurtFlash=1;hits.push({type:"hit",mx:player.x,mz:player.z,wid:1,dmg:8});toast("电壳反噬！");}   // v39 电壳 if(m.type==="acid"){G.enemyHazards=G.enemyHazards||[];G.enemyHazards.push({kind:"acidPool",x:m.x,z:m.z,r:3.6,life:7,max:7,dmg:8,tick:0,tickRate:.8});} noteKill(m); hits.push({type:"kill", mx:m.x, mz:m.z, wid:p.wid||1,target:m.type,dmg:dealt,crit:crit}); }   // 酸液踏巢者死亡留池；v23.1 反应致死不重复结算
        /* v23 蓄力重击：声呐蓄力弹命中 → 冲击波 AOE（60% 伤害 + 击退），事件 chargeBlast 供表现层；
           渊棘蓄力弹改为贯穿（pierce 分支不消费，直至撞障碍/过期）。 */
        if(p.charge && p.wid===1){
          for(const sm of G.monsters){
            if(sm===m || sm.hp<=0 || sm.evade) continue;
            const sd = Math.sqrt((sm.x-p.x)**2+(sm.z-p.z)**2);
            if(sd < 2.8){
              const sdmg=damageAmount(dealt*.6);
              sm.hp-=sdmg; sm.cd=Math.max(sm.cd,hitStaggerCd(sm));
              if(!(sm.break && sm.break.t>0)){ sm.x+=(sm.x-p.x)/(sd||1)*1.4; sm.z+=(sm.z-p.z)/(sd||1)*1.4; }
              if(sm.hp<=0){ noteKill(sm); hits.push({type:"kill",mx:sm.x,mz:sm.z,wid:p.wid||1,target:sm.type,dmg:sdmg}); }
              else hits.push({type:"hit",mx:sm.x,mz:sm.z,wid:p.wid||1,dmg:sdmg,splash:true});
            }
          }
          hits.push({type:"chargeBlast", x:p.x, y:p.y, z:p.z});
        }
        if(p.blast&&!p.blasted){   // v28 震荡弹头：命中爆裂（60% 溅射）
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
        break;
      }
    }
    if(!consumed && G.boss && G.boss.hp>0 && (G.level===undefined||baseObjectiveMet())){
      const d = Math.sqrt((G.boss.x-p.x)**2+(G.boss.z-p.z)**2);
      const bossHitR=(BOSS_TYPES[G.boss.type]||BOSS_TYPES.hand).hitR||2.4;
      if(d < bossHitR){
        const gm = guardMult(G.boss);   // CSD-SOUL1-P2：BOSS 防御态减伤
        const crit2=Math.random()<.12+(G.critBonus||0);   // v24.7：BOSS 同享暴击
        const dealt=damageAmount(dmg*gm.dmg*((G.boss.rust&&G.boss.rust.t>0)?1.25:1)*(crit2?2+(G.critDmg||0):1)*(.88+Math.random()*.24));
        /* v23.1：BOSS 元素反应先于伤害结算；反应致死不重复计分 */
        let bossDiedInReaction=false;
        { const aliveBefore=G.boss.hp>0; applyElementHit(G.boss, (p.elem||ELEM_OF_WEAPON[p.wid]), hits); bossDiedInReaction=aliveBefore&&G.boss.hp<=0; }
        {const sg=shieldGate(G.boss,dealt,(p.elem||ELEM_OF_WEAPON[p.wid]));G.boss.hp-=sg.hp;if(sg.sh>0)hits.push({type:"shieldHit",bx:G.boss.x,bz:G.boss.z,dmg:sg.sh,elem:G.boss.eshield?G.boss.eshield.elem:"tide",brk:sg.brk});if(sg.brk)G.boss.eshield=null;}
        if(G.boss.poise) applyPoiseHit(G.boss, p.wid || 1, gm.poise);   // CSD-SOUL1-P1：BOSS 也累积韧性
        if(gm.dmg < 1) hits.push({type:"guarded", bx:G.boss.x, bz:G.boss.z, wid:p.wid||1});
        hits.push({type:"boss", bx:G.boss.x, bz:G.boss.z, wid:p.wid||1, dmg:dealt, crit:crit2});
        if(G.boss.hp<=0 && !bossDiedInReaction){ noteKill(G.boss, {countKill:false}); hits.push({type:"bossKill", bx:G.boss.x, bz:G.boss.z, wid:p.wid||1,dmg:dealt}); }
        PULSES_REMOVED.push(p); pulses.splice(i,1);
        consumed = true;   // PRB-01 修复：BOSS 命中同样短路，防同帧二次 splice 误删存活脉冲
      }
    }
    if(!consumed && p.life<=0){ PULSES_REMOVED.push(p); pulses.splice(i,1); }   // PRB-01 修复：仅未消费且过期才删除
  }
  return hits;
}
/* CSD-M2：墨鲛喷吐弹（复用 pulses 模式独立数组 G.spitPulses）
   直线飞行（速 6 / 寿命 3.0）；命中玩家（<1.0）扣 8 HP（i-frame 节流）；过期/命中清理。
   CSD-H2：命中障碍（r=1.0）→ 销毁 + blockSpit 事件（与玩家弹丸对称，可卡岩石掩体规避）。 */
function tickSpitPulses(dt, px, pz){
  const events = [];
  if(!G || !G.spitPulses) return events;
  for(let i=G.spitPulses.length-1;i>=0;i--){
    const p = G.spitPulses[i];
    p.x += p.vx*dt; p.z += p.vz*dt; p.life -= dt;
    let consumed = false;
    if(pulseBlockedByObstacle(p)){
      events.push({type:"blockSpit", x:p.x, z:p.z});
      G.spitPulses.splice(i,1);
      continue;
    }
    if(Math.hypot(px-p.x, pz-p.z) < (p.r||1.0)){
      if(playerHit(p.dmg)){
        if(p.status==="bleed"){G.bleed=Math.max(G.bleed||0,4);G.bleedTick=1;}
        if(p.status==="slow")G.slow=Math.max(G.slow||0,2.8);
        events.push({type:"hurt", mx:p.x, mz:p.z, spit:true,status:p.status});
      }
      G.spitPulses.splice(i,1);
      consumed = true;
    }
    if(!consumed && p.life<=0) G.spitPulses.splice(i,1);
  }
  return events;
}
/* v7：墨鲛腐蚀领域。持续伤害具备独立地面范围，进入后减速。 */
function tickEnemyHazards(dt,px,pz){
  const events=[];if(!G||!G.enemyHazards)return events;
  for(let i=G.enemyHazards.length-1;i>=0;i--){
    const h=G.enemyHazards[i];h.life-=dt;h.tick-=dt;
    const inside=Math.hypot(px-h.x,pz-h.z)<h.r;
    if(inside){G.slow=Math.max(G.slow||0,0.25);if(h.tick<=0){h.tick=h.tickRate||0.8;if(playerHit(h.dmg))events.push({type:"hurt",mx:h.x,mz:h.z,hazard:true});}}
    if(h.life<=0)G.enemyHazards.splice(i,1);
  }
  return events;
}
/* CSD-M2：刃鳍扑击被打断（受击/回响击退）→ 回巡航态 + 0.6s 冷却 */
function interruptDart(m){
  if(m && m.type === "dart" && m.lunge){
    m.lunge.phase = "cruise";
    m.lunge.t = 0;
    m.lunge.cd = 0.6;
  }
}
/* BOSS：沉者之手（hand/handX），守裂口，缓慢逼近玩家，接触伤害更高
   CSD-M2 参数化：按 b.type 取 BOSS_TYPES（手动构造的旧测试状态无 type → 回落 hand 值）。
   opts.warnDist：S7 接触预警距离（>0 启用；主循环传 BOSS_WARN_DIST=4.5）。
   进入预警区（d<warnDist）输出 {type:"warn"} 事件并置 b.warn；伤害结算时点不变（d<3）。 */
function tickBoss(dt, px, pz, opts){
  opts = opts || {};
  const b = G.boss;
  if(!b || b.hp<=0 || G.state!==S.PLAYING) return [];
  if(G.level!==undefined&&!baseObjectiveMet()) return [];
  const bt = BOSS_TYPES[b.type] || BOSS_TYPES.hand;
  const boostB = (b.type === "handX") ? boostFor("handX") : null;   // CSD-H2：handX 吃强化档；hand 不强化
  const speed = (b.type === "handX" && boostB && boostB.speed !== undefined) ? boostB.speed : ((b.speed !== undefined) ? b.speed : bt.speed);
  const dmg   = (b.type === "handX" && boostB && boostB.dmg !== undefined)   ? boostB.dmg   : ((b.dmg !== undefined)   ? b.dmg   : bt.dmg);
  const guardR = (b.guardR !== undefined) ? b.guardR : bt.guardR;
  const moveR = (b.moveR !== undefined) ? b.moveR : bt.warn;   // 追击停止半径 = 预警距离
  const warnDist = (typeof opts.warnDist === "number" && opts.warnDist > 0) ? opts.warnDist : 0;
  const g = gatePos();
  const dx = px-b.x, dz = pz-b.z;
  const d = Math.sqrt(dx*dx+dz*dz)||1;
  const events = [];
  /* CSD-SOUL1-P1：韧性衰减/破韧窗口 + rage 计时；break 硬直中不移动不选招（处决窗口） */
  if(b.poise) tickPoise(b, dt);
  if(b.rage){ b.rage.t -= dt; if(b.rage.t <= 0) b.rage = null; }
  /* v23.1：BOSS 元素附着与锈蚀倒计时 */
  if(b.aura){ b.aura.t -= dt; if(b.aura.t <= 0) b.aura = null; }
  if(b.rust){ b.rust.t -= dt; if(b.rust.t <= 0) b.rust = null; }
  /* P2：防御/闪避计时（BOSS 不闪避，但 guard 需推进；dodge 恒无） */
  tickGuard(b, dt);
  tickDodge(b, dt);
  /* P3：血量阶段推进 + 转阶段演出（冻结 transition 秒，期间不行动） */
  if(!b.phase) b.phase = 1;
  const ph = bossPhase(b);
  if(ph !== b.phase){
    b.phase = ph;
    b.phaseLock = SOUL_PHASES.transition;
    b.atk = null; b.feint = null; b.guard = null; b.windup = 0;
    events.push({ type:"phaseChange", bx:b.x, bz:b.z, phase:ph, boss:b.type });
    /* v23.1 阶段机制：P2 环形弹幕（0.8s 预警）/ P3 震波（0.9s 预警），延迟结算见下 */
    if(ph === 2){
      b.burstAt = (G.time||0) + 0.8;
      events.push({ type:"telegraph", mx:b.x, mz:b.z, windup:0.8, telegraph:{ ring:2.6, color:0xff2244, sound:"chargeWarn" } });
    } else if(ph === 3){
      b.quakeAt = (G.time||0) + 0.9;
      events.push({ type:"telegraph", mx:b.x, mz:b.z, windup:0.9, telegraph:{ ring:6, color:0xff2244, sound:"aoewarn" } });
    }
  }
  /* v23.1：阶段机制延迟结算（阶段冻结期间也要推进） */
  if(b.burstAt !== undefined && (G.time||0) >= b.burstAt){
    b.burstAt = undefined;
    bossRadialBurst(b, 8, 5.2);
    events.push({ type:"phaseBurst", bx:b.x, bz:b.z });
  }
  if(b.quakeAt !== undefined && (G.time||0) >= b.quakeAt){
    b.quakeAt = undefined;
    if(d < 6 && playerHit(dmg*1.5)) events.push({ type:"hurt", bx:b.x, bz:b.z });
    events.push({ type:"phaseQuake", bx:b.x, bz:b.z });
  }
  if(b.phaseLock > 0){ b.phaseLock -= dt; return events; }
  if(b.break && b.break.t > 0) return events;
  /* CSD-SOUL1-P1：进行中的招式 → 执行机接管（不追击不接触伤；dash 招在 exec 内位移） */
  if(b.atk){
    const had = !!b.atk;
    tickMoveExec(b, dt, px, pz, events);
    if(had && !b.atk) b.cd *= phaseRecoverMult(b);   // P3：高阶段后摇更短（连招更密集）
    return events;
  }
  if(b.dodge) return events;
  if(b.guard && b.guard.t > 0) return events;   // P2：防御中架盾驻守（减伤在伤害端结算）
  /* v23.3 专属技能：独立冷却；蓄能中被打断（受击硬直不中断，破韧/处决窗口冻结） */
  {
    const sig=BOSS_SIGNATURE[b.type];
    if(sig){
      if(b.sigWindup!==undefined && b.sigWindup!==null){
        b.sigWindup-=dt;
        if(b.sigWindup<=0){
          b.sigWindup=null; b.sigCool=sig.cd;
          resolveBossSignature(b, sig, px, pz, dmg, events);
        }
      } else {
        b.sigCool=Math.max(0,(b.sigCool||0)-dt);
        if(b.sigCool<=0 && d<16){
          b.sigWindup=sig.windup; b.sigX=px; b.sigZ=pz;
          events.push({ type:"telegraph", mx:px, mz:pz, windup:sig.windup, telegraph:{ ring:sig.ring, color:0xffd66b, sound:"chargeWarn" } });
          events.push({ type:"elemTag", mx:b.x, mz:b.z, tag:sig.name, color:0xffd66b });
        }
      }
    }
  }
  const ai = aiCfg(b);
  const sig = computeSignals(b, px, pz);
  /* P2：诱骗——中距时假前摇，玩家开火即快招反制 */
  if(ai && ai.feint && !b.feint && d > 3 && d < 9 && (b.cd||0) <= 0 && __rng() < 0.006){   // HARD：诱骗更频繁
    enterFeint(b);
    events.push({ type:"feint", bx:b.x, bz:b.z, baited:null });
    return events;
  }
  if(b.feint){ tickFeint(b, dt, px, pz, events); return events; }
  /* P2：防御——中远距被连打时架盾（减伤+免击退） */
  if(ai && ai.block && !b.guard && d > 5 && d < 13 && sig.greedy && (b.cd||0) <= 0){
    enterGuard(b, 0.9);
    events.push({ type:"guard", bx:b.x, bz:b.z });
    return events;
  }
  /* P2/P3：招式池选招（phase + 信号）——P3 阶段招（spike/rush/wave）随 b.phase 解锁 */
  if(b.moves && b.cd <= 0){
    const mv = tickMove(b, px, pz, { phase: b.phase, signals: sig });
    if(mv){ startMove(b, mv); return events; }
  }
  const pm = phaseSpeedMult(b);   // P3：高阶段移动更快
  if(d > moveR){
    b.x += dx/d*speed*dt*speedMult(b)*pm; b.z += dz/d*speed*dt*speedMult(b)*pm;
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
    }
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
    }   // v33 巨兽碰撞
    faceToward(b, px, pz);
    // 不远离裂口
    const gx = b.x-g.x, gz = b.z-g.z;
    const gd = Math.hypot(gx,gz);
    if(gd > guardR){ b.x = g.x+gx/gd*guardR; b.z = g.z+gz/gd*guardR; }
  }
  b.cd = Math.max(0, b.cd-dt);
  if(warnDist > 0){
    const wasWarn = !!b.warn;
    b.warn = d < warnDist;
    if(b.warn && !wasWarn) events.push({type:"warn", bx:b.x, bz:b.z});
  } else {
    b.warn = false;
  }
  if(d < (bt.hitR||3) && playerHit(dmg)) events.push({type:"hurt", bx:b.x, bz:b.z});

  return events;
}
/* 怪物 AI：按 m.type 分发
   - gray / elite（含默认无 type 灰手）：巡逻 + 追近玩家 + 接触伤害（数值表化）
   - dart：巡航快追 → 扑击（windup 0.5s → dash 9.0×0.45s）→ 后摇 1.5s
   - spitter：保持距离（<8 后撤 1.8 / >14 前压 1.2）+ 喷吐弹（windup 0.6s → 速6/寿命3）
   opts.windup：S6 起手前摇（>0 启用；主循环传 MONSTER_WINDUP=0.4）；类型怪用类型表 windup。 */

/* ===== v39 精英变异词缀：6 种，精英随机携带 ===== */
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
/* ===== v39 精英变异词缀：6 种，精英随机携带 ===== */

function tickMonsters(dt, px, pz, opts){
  opts = opts || {};
  const windupT = (typeof opts.windup === "number" && opts.windup > 0) ? opts.windup : 0;
  const events = [];
  tickTelemetry(dt, px, pz);   // CSD-SOUL1-P2：每帧一次玩家遥测（tickBoss 复用）
  for(const m of G.monsters){
    if(m.hp<=0) continue;
    if(m.sonarMark){m.sonarMark.t-=dt;if(m.sonarMark.t<=0)m.sonarMark=null;}
    /* v23.1：元素附着与锈蚀倒计时 */
    if(m.aura){m.aura.t-=dt;if(m.aura.t<=0)m.aura=null;}
    if(m.rust){m.rust.t-=dt;if(m.rust.t<=0)m.rust=null;}
    /* v24.8 二阶段狂化：半血一次性触发——加速冷却 + 移速（speedMult）；灰手系召唤 1 只援军 */
    if(!m.enraged && m.maxHp>0 && m.hp<=m.maxHp*.5){
      m.enraged=true;
      m.cd=Math.min(m.cd||0,.4);
      events.push({type:"enrage",mx:m.x,mz:m.z,kind:m.type});
      if((m.type==="gray"||m.type==="elite") && G.monsters.filter(x=>x.hp>0).length<14){
        G.monsters.push({type:"gray",x:m.x+(Math.random()-.5)*4,z:m.z+(Math.random()-.5)*4,hp:5,maxHp:5,cd:1,phase:Math.random()*7,score:15,enraged:true});
        events.push({type:"summon",mx:m.x,mz:m.z});
      }
    }
    /* CSD-SOUL1-P1：韧性衰减/破韧窗口倒计时 + rage 计时；break 硬直中不移动不选招（处决窗口） */
    if(m.poise) tickPoise(m, dt);
    if(m.rage){ m.rage.t -= dt; if(m.rage.t <= 0) m.rage = null; }
    if(m.ward){m.ward.t-=dt;if(m.ward.t<=0||m.ward.charges<=0)m.ward=null;}
    if(m.break && m.break.t > 0) continue;
    m.phase += dt*0.8;
    m.cd = Math.max(0, m.cd-dt);
    const t = MONSTER_TYPES[m.type] || null;
    if(m.affix==="swift")m.affixSpd=1.5;else m.affixSpd=1;   // v39 迅捷词缀
    if(m.affix==="swift")m.affixSpd=1.5;else m.affixSpd=1;   // v39 迅捷词缀
    const baseKind=(m.type==="dart"||m.type==="swarm")?"dart":((m.type==="spitter"||m.type==="acid"||m.type==="sniper")?"spitter":((m.type==="elite"||m.type==="shield")?"elite":"gray"));
    const boost = boostFor(baseKind);   // 新原型继承成熟的强化曲线
    if((m.type === "dart"||m.type==="swarm") && t){ tickDart(m, t, m.type==="dart"?boost:null, dt, px, pz, events); continue; }
    if((m.type === "spitter"||m.type==="acid"||m.type==="sniper") && t){ tickSpitter(m, t, m.type==="spitter"?boost:null, dt, px, pz, events); continue; }
    tickChase(m, t, (m.type==="shield"?null:boost), dt, px, pz, events, windupT);
  }
  /* v33 碰撞补全：怪物间软推挤 + 与玩家本体分离（消除互相穿模） */
  const ms2=G.monsters;
  for(let i2=0;i2<ms2.length;i2++){
    const a=ms2[i2];if(a.hp<=0)continue;
    for(let j2=i2+1;j2<ms2.length;j2++){
      const b2=ms2[j2];if(b2.hp<=0)continue;
      const dx=b2.x-a.x,dz=b2.z-a.z,d=Math.hypot(dx,dz),min=1.3;
      if(d>0.001&&d<min){const push=(min-d)*.5;a.x-=dx/d*push;a.z-=dz/d*push;b2.x+=dx/d*push;b2.z+=dz/d*push;}
      else if(d<=0.001){a.x+=.1;b2.x-=.1;}
    }
    const pdx=a.x-px,pdz=a.z-pz,pd=Math.hypot(pdx,pdz),pmin=1.15;
    if(pd>0.001&&pd<pmin){const push2=pmin-pd;a.x+=pdx/pd*push2;a.z+=pdz/pd*push2;}
    const rc2=resolveCollision(a.x,a.z,0.7);a.x=rc2[0];a.z=rc2[1];
  }
  return events;
}
/* 灰手/精英：现有追击分支 + 数值从类型表取（默认无 type → 与 v0 完全一致）；
   CSD-H2：boost 按当前档覆盖 speed/chaseR/windup/cd/dmg（L1 锁定 T1） */
function tickChase(m, t, boost, dt, px, pz, events, windupT){
  const base = m.base || MONSTER_SPOTS[G.monsters.indexOf(m)] || {x:m.x,z:m.z};
  const dx = px-m.x, dz = pz-m.z;
  const d = Math.sqrt(dx*dx+dz*dz) || 1;
  /* P2：防御/闪避计时衰减（招前推进，避免状态残留） */
  tickGuard(m, dt);
  tickDodge(m, dt);
  /* CSD-SOUL1-P1：进行中的招式 → 执行机接管（不追击不移动；dash 招在 exec 内位移） */
  if(m.atk){
    tickMoveExec(m, dt, px, pz, events);
    return;
  }
  if(m.dodge) return;                        // P2：闪避中不再追击/选招
  if(m.guard && m.guard.t > 0) return;       // P2：防御中架盾驻守（减伤在伤害端结算）
  const speed = (boost && boost.speed !== undefined) ? boost.speed : (t ? t.speed : 1.6);
  const chaseR = (boost && boost.chaseR !== undefined) ? boost.chaseR : (t ? t.chaseR : 12);
  const patrolR = t ? t.patrolR : 3;
  const dmg = (boost && boost.dmg !== undefined) ? boost.dmg : (t ? t.dmg : 12);
  const effW = (boost && boost.windup !== undefined) ? boost.windup
             : ((m.type && t && t.windup) ? t.windup : windupT);   // 强化档前摇 > 类型表前摇 > opts
  const ai = aiCfg(m);
  const sig = computeSignals(m, px, pz);
  let tx = base.x + Math.sin(m.phase)*patrolR, tz = base.z + Math.cos(m.phase*0.8)*patrolR;
  /* v41 三连弹：墨鲛每第 3 发速度 ×1.5（m.spitCount 计数） */
  if(m.type==="spitter"||m.type==="acid"){m.spitCount=(m.spitCount||0)+1;if(m.spitCount%3===0)m.spitBoost=1.5;else m.spitBoost=1;}——近距贪刀反制（侧闪拉开，惩罚过度贴身输出） */
  /* v41 跳劈：灰手近距离 30% 概率跃起 AOE */
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
  /* v41 跳劈：灰手近距离 30% 概率跃起 AOE */
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
  if(ai && ai.dodge && !m.dodge && d < 3.5 && sig.greedy && (m.cd||0) <= 0){
    enterDodge(m, px, pz);
    events.push({ type:"dodge", mx:m.x, mz:m.z });
    return;
  }
  /* P2：精英防御——中距被远程连打时架盾（减伤+免击退） */
  if(ai && ai.block && !m.guard && d > 4 && d < 12 && sig.greedy && (m.cd||0) <= 0){
    enterGuard(m, 1.0);
    events.push({ type:"guard", mx:m.x, mz:m.z });
    return;
  }
  if(d < chaseR){ // 追击
    const s = speed*dt*speedMult(m);   // CSD-SOUL1-P1：漏过惩罚 15% 速增
    m.x += dx/d*s; m.z += dz/d*s;
    faceToward(m, px, pz);             // P2：写入朝向（绕背判定）
  } else {
    m.x += (tx-m.x)*Math.min(1, 0.8*dt);
    m.z += (tz-m.z)*Math.min(1, 0.8*dt);
  }
  const [cx, cz] = resolveCollision(m.x, m.z, 0.7);
  m.x = cx; m.z = cz;
  /* CSD-SOUL1-P1：招式池选招（cd 就绪时按 trigger 条件选招；无 moves → 回落既有抬手循环） */
  if(m.moves && (m.cd||0) <= 0){
    const mv = tickMove(m, px, pz, { phase:1, signals:sig });
    if(mv){ startMove(m, mv); return; }
  }
  if(d < 2.4){
    if(m.cd > 0){
      m.windup = 0;   // CSD-H2：受击硬直 cd 内不抬手（T3 cd 0.3 = 频率翻倍真实载体）
    } else if(effW > 0){
      const prev = m.windup || 0;
      if(prev < effW){
        m.windup = Math.min(effW, prev + dt);
        if(prev <= 0) events.push({type:"windup", mx:m.x, mz:m.z});
        if(m.windup >= effW){
          if(playerHit(dmg)) events.push({type:"hurt", mx:m.x, mz:m.z});
          m.windup = 0;   // 一次抬手循环结束（重新抬手，命中节流由 hitCool 保证）
        }
      }
    } else {
      if(playerHit(dmg)){
        events.push({type:"hurt", mx:m.x, mz:m.z});
      }
    }
  } else {
    m.windup = 0;
  }
}
/* 刃鳍：巡航（速 2.6 / 追击 14）→ 8 内触发扑击（前摇 0.5s 闪红后拉）→ dash 速 9 直线 0.45s
   → 后摇 1.5s（减速 1.2）。巡航无接触伤；仅扑击命中扣 10 氧；受击打断（interruptDart）。
   CSD-H2：boost 覆盖 speed/chaseR/lunge（T3 = 速 2.8 / 扑击 9.5×0.5s / 后摇 1.2）。 */
function tickDart(m, t, boost, dt, px, pz, events){
  const l = m.lunge || (m.lunge = { phase:"cruise", t:0, cd:0, dx:0, dz:0 });
  const base = m.base || {x:m.x,z:m.z};
  const dx = px-m.x, dz = pz-m.z;
  const d = Math.sqrt(dx*dx+dz*dz) || 1;
  const speed = (boost && boost.speed !== undefined) ? boost.speed : t.speed;
  const chaseR = (boost && boost.chaseR !== undefined) ? boost.chaseR : t.chaseR;
  const dmg = (boost && boost.dmg !== undefined) ? boost.dmg : t.dmg;
  const lu = (boost && boost.lunge) ? boost.lunge : t.lunge;
  const tx = base.x + Math.sin(m.phase)*t.patrolR, tz = base.z + Math.cos(m.phase*0.8)*t.patrolR;
  /* P2：闪避计时（dart 无防御/诱骗；dodge 在巡航中触发） */
  tickGuard(m, dt);
  tickDodge(m, dt);
  /* CSD-SOUL1-P1：进行中的招式（pierce/sweep/combo 等非基础 lunge）→ 执行机接管 */
  if(m.atk){
    tickMoveExec(m, dt, px, pz, events);
    return;
  }
  if(m.dodge) return;   // P2：闪避中不选招不追击（i-frame 期间）
  /* CSD-SOUL1-P1：招式池选招（仅 cruise 态且 cd 就绪）：lunge 走既有状态机（保持既有语义），
     其余招式（pierce/sweep…）走 m.atk 执行机；无 moves → 回落既有 lunge 行为。 */
  if(m.moves && l.phase === "cruise" && (m.cd||0) <= 0){
    const sig = computeSignals(m, px, pz);
    const mv = tickMove(m, px, pz, { phase:1, signals:sig });
    if(mv && mv.id !== "lunge"){ startMove(m, mv); return; }
  }
  if(l.phase === "cruise"){
    /* P2：闪避——贪刀被反击 / 周期性侧闪，令弹道更难命中（evade i-frame 由 tickDodge 置位） */
    const ai = aiCfg(m);
    const sig = computeSignals(m, px, pz);
    if(ai && ai.dodge && !m.dodge && d > 4 && d < 10 && (sig.greedy || __rng() < 0.7*dt) && l.cd <= 0){   // HARD：闪避更频繁
      enterDodge(m, px, pz);
      events.push({ type:"dodge", mx:m.x, mz:m.z });
      return;
    }
    if(d < chaseR){
      const s = speed*dt*speedMult(m);   // CSD-SOUL1-P1：漏过惩罚 15% 速增
      m.x += dx/d*s; m.z += dz/d*s;
      faceToward(m, px, pz);             // P2：写入朝向（绕背判定）
    } else {
      m.x += (tx-m.x)*Math.min(1, 0.8*dt);
      m.z += (tz-m.z)*Math.min(1, 0.8*dt);
    }
    l.cd = Math.max(0, l.cd - dt);
    if(d < lu.triggerR && l.cd <= 0){
      l.phase = "windup"; l.t = 0;
      events.push({type:"dartWindup", mx:m.x, mz:m.z});
    }
  } else if(l.phase === "windup"){
    l.t += dt;
    if(l.t >= lu.windup){
      l.phase = "dash"; l.t = 0;
      const dd = Math.hypot(px-m.x, pz-m.z) || 1;
      l.dx = (px-m.x)/dd; l.dz = (pz-m.z)/dd;   // 锁定直线冲刺方向
    }
  } else if(l.phase === "dash"){
    m.x += l.dx*lu.dashSpeed*dt*speedMult(m);
    m.z += l.dz*lu.dashSpeed*dt*speedMult(m);
    l.t += dt;
    if(Math.hypot(px-m.x, pz-m.z) < 1.6){
      if(playerHit(dmg)) events.push({type:"hurt", mx:m.x, mz:m.z});
    }
    if(l.t >= lu.dashDur){
      /* v24.8 狂化二连突进：首段冲刺结束→半前摇再突进一次，之后恢复常规冷却 */
      if(m.enraged && !m.l2){ m.l2 = true; l.phase = "windup"; l.t = lu.windup*.5; events.push({type:"dartWindup", mx:m.x, mz:m.z}); }
      else { m.l2 = false; l.phase = "cooldown"; l.t = 0; }
    }
  } else { // cooldown（后摇减速 1.2）
    const s = 1.2*dt;
    m.x += dx/d*s; m.z += dz/d*s;
    l.t += dt;
    if(l.t >= lu.cooldown){ l.phase = "cruise"; l.t = 0; l.cd = 0; }
  }
  const [cx, cz] = resolveCollision(m.x, m.z, 0.7);
  m.x = cx; m.z = cz;
}
/* 墨鲛：不近身。交战 16 内保持 10 距离（<8 后撤 1.8 / >14 前压 1.2）；
   喷吐前摇 0.6s → 墨弹（速 6 / 寿命 3）入 G.spitPulses；喷吐 cd 2.0s；无近战接触伤。
   CSD-H2：boost 覆盖 engageR/spit/dmg（T3 = 交战 18 / 前摇 0.5 / 弹速 6.5 / cd 1.5）。 */
function tickSpitter(m, t, boost, dt, px, pz, events){
  const st = m.spit || (m.spit = { windup:0, cd:0 });
  const base = m.base || {x:m.x,z:m.z};
  const dx = px-m.x, dz = pz-m.z;
  const d = Math.sqrt(dx*dx+dz*dz) || 1;
  const engageR = (boost && boost.engageR !== undefined) ? boost.engageR : t.engageR;
  const dmg = (boost && boost.dmg !== undefined) ? boost.dmg : t.dmg;
  const spit = (boost && boost.spit) ? boost.spit : t.spit;
  const tx = base.x + Math.sin(m.phase)*t.patrolR, tz = base.z + Math.cos(m.phase*0.8)*t.patrolR;
  /* CSD-SOUL1-P1：进行中的招式 → 执行机接管（不保持距离；projectile 在 exec 内生成弹丸） */
  if(m.atk){
    tickMoveExec(m, dt, px, pz, events);
    return;
  }
  /* CSD-SOUL1-P1：招式池选招（交战圈内、cd 就绪、无既有喷吐 cd）：spit/tri/cannon/tail */
  if(m.moves && d <= engageR && (m.cd||0) <= 0 && st.cd <= 0){
    const sig = computeSignals(m, px, pz);   // CSD-SOUL1-P2：站桩信号解锁 tri/cannon
    const mv = tickMove(m, px, pz, { phase:1, signals:sig });
    if(mv){ startMove(m, mv); return; }
  }
  if(d > engageR){
    m.x += (tx-m.x)*Math.min(1, 0.8*dt);
    m.z += (tz-m.z)*Math.min(1, 0.8*dt);
    st.windup = 0;
  } else {
    let sp = 0, dir = 1;
    const keep=t.keepDist||10;
    if(d < keep-2){ sp = 1.8; dir = -1; }          // 太近 → 后撤
    else if(d > keep+4){ sp = 1.2; dir = 1; }     // 太远 → 前压
    if(sp > 0){
      m.x += dx/d*sp*dt*dir*speedMult(m); m.z += dz/d*sp*dt*dir*speedMult(m);   // CSD-SOUL1-P1：rage 15%
    }
    st.cd = Math.max(0, st.cd - dt);
    if(st.cd <= 0){
      st.windup += dt;
      if(st.windup >= spit.windup){
        st.windup = 0;
        st.cd = spit.cooldown;
        G.spitPulses = G.spitPulses || [];
        const nd = Math.hypot(px-m.x, pz-m.z) || 1;
        if(m.enraged){
          /* v24.8 狂化三连扇面弹：±0.22rad 三发 */
          const baseA = Math.atan2(px-m.x, pz-m.z);
          for(const off of [-.22, 0, .22]){
            const a2 = baseA + off;
            G.spitPulses.push({ x:m.x, y:terrainHeight(m.x,m.z)+1, z:m.z,
                                vx:Math.sin(a2)*spit.speed, vz:Math.cos(a2)*spit.speed,
                                life:spit.life, r:1.0, dmg,
                                exempt:spawnExemptObstacles(m.x, m.z, 1.0) });
          }
        } else {
          G.spitPulses.push({ x:m.x, y:terrainHeight(m.x,m.z)+1, z:m.z,
                              vx:(px-m.x)/nd*spit.speed, vz:(pz-m.z)/nd*spit.speed,
                              life:spit.life, r:1.0, dmg,
                              exempt:spawnExemptObstacles(m.x, m.z, 1.0) });   // CSD-H2：出生重叠豁免
        }
        events.push({type:m.type==="sniper"?"sniperShot":"spit", mx:m.x, mz:m.z});
      }
    } else {
      st.windup = 0;
    }
  }
  const [cx, cz] = resolveCollision(m.x, m.z, 0.7);
  m.x = cx; m.z = cz;
}
/* 胜负 */
function setEnding(st){
  /* CSD-H2：连续死亡重试计数（OVER 增 / WIN 清零；防重复结算重复计数用状态守卫） */
  if(st === S.WIN){ retryCount = 0; }
  else if(st === S.OVER && G && G.state !== S.OVER){ retryCount++; }
  G.state = st;
  G.ending = st;
}
/* CSD-M2：目标完成判定（objective.kind 分发；无 objective = 经典单关语义）
   collect/gate → winOpen 且（无 BOSS 或已死）；kill → kills≥n；elite → 目标怪 hp≤0；
   survive → time≥t 且氧>0。 */
function eliteTargetDead(){
  const obj = G.objective;
  if(!obj || !obj.type) return false;
  for(const m of G.monsters){
    if(m.type === obj.type && m.hp <= 0) return true;
  }
  return false;
}
function baseObjectiveMet(){
  if(G.modeId==="bossRush") return true;
  const obj = G.objective;
  if(!obj) return G.samples>=sampleTarget();
  if(obj.kind === "kill") return (G.kills||0) >= obj.n;
  if(obj.kind === "elite") return eliteTargetDead();
  if(obj.kind === "survive") return G.time >= obj.t;
  if(obj.kind === "scan") return (G.scanDone||[]).filter(Boolean).length >= (obj.points||[]).length;
  if(obj.kind === "hybrid") return G.samples>=obj.n&&(G.kills||0)>=obj.kills;
  if(obj.kind === "defend") return !!G.defendComplete||(G.defendProgress||0)>=obj.t;
  if(obj.kind === "gauntlet") return (G.gauntletWave||1)>=obj.waves&&(G.monsters||[]).every(m=>m.hp<=0);
  return G.samples>=sampleTarget();
}
function objectiveMet(){
  return baseObjectiveMet() && (!G.boss||G.boss.hp<=0);
}
/* 胜负判定（CSD-M2：按 objective.kind 分发 + 未达标进门拒绝 + 多关推进）
   - 非终关（G.level < 5）：达标进门 → 置 G.nextLevel 并返回 true（主循环据此 startLevel），不置 WIN
   - 终关（L5 gate）/ 默认单关：达标进门 → setEnding(WIN) */
function checkWin(px, pz){
  if(G.state!==S.PLAYING) return false;
  if(G.modeId==="endless")return false;
  const g = gatePos();
  const d = Math.sqrt((px-g.x)**2 + (pz-g.z)**2);
  if(d >= 3) return false;                // 未到门前
  if(!objectiveMet()) return false;       // 未达标进门拒绝
  if(G.modeId==="stage"){
    setEnding(S.WIN);retryCount=0;return true;
  }
  if(G.level !== undefined && G.level < LEVELS.length){
    G.nextLevel = G.level + 1;            // 推进下一关（1 基）
    retryCount = 0;                       // CSD-H2：通关重置连续死亡计数
    return true;
  }
  setEnding(S.WIN);
  return true;
}
/* 罗盘：世界方位角（与相机 yaw 同系） */
function dirTo(px, pz, tx, tz){ return Math.atan2(tx-px, tz-pz); }
/* 罗盘目标（CSD-M2：按 objective.kind 映射）
   collect/gate → 现逻辑（达标指门 / 未达标指最近样本）；
   kill → 最近存活怪；elite → 精英位置；survive → 最近样本（回氧导向）。 */
function nearestTarget(px, pz){
  const obj = G.objective;
  const kind = obj ? obj.kind : null;
  const win = !!G.winOpen;
  if(G.boss&&G.boss.hp>0&&baseObjectiveMet()) return {x:G.boss.x,z:G.boss.z,kind:"boss"};
  if(kind === "survive") return nearestSampleSpot(px, pz);
  if(kind === "scan"&&!win){const done=G.scanDone||[],p=(obj.points||[]).find((q,i)=>!done[i]);return p?{x:p.x,z:p.z,kind:"scan"}:nearestAliveMonster(px,pz);}
  if(kind === "defend"&&!win)return {x:obj.x,z:obj.z,kind:"defend"};
  if(kind === "hybrid"&&!win)return G.samples<obj.n?nearestSampleSpot(px,pz):nearestAliveMonster(px,pz);
  if((kind === "kill"||kind==="gauntlet") && !win) return nearestAliveMonster(px, pz);
  if(kind === "elite" && !win) return eliteTargetPos(px, pz);
  if(win) return { x:gatePos().x, z:gatePos().z, kind:"gate" };
  return nearestSampleSpot(px, pz);
}
function nearestSampleSpot(px, pz){
  const s = spots();
  let best = null, bd = 1e9;
  for(let i=0;i<s.length;i++){
    if(G.grabbed[i]) continue;
    const d = Math.hypot(s[i].x-px, s[i].z-pz);
    if(d < bd){ bd = d; best = { x:s[i].x, z:s[i].z, kind:"sample" }; }
  }
  return best;
}
function nearestAliveMonster(px, pz){
  let best = null, bd = 1e9;
  for(const m of G.monsters){
    if(m.hp<=0) continue;
    const d = Math.hypot(m.x-px, m.z-pz);
    if(d < bd){ bd = d; best = { x:m.x, z:m.z, kind:"monster" }; }
  }
  return best;
}
function eliteTargetPos(px, pz){
  const obj = G.objective;
  for(const m of G.monsters){
    if(m.type === (obj && obj.type) && m.hp>0) return { x:m.x, z:m.z, kind:"elite" };
  }
  return null;
}
/* S9：触屏辅助瞄准（UX §2.4 / GDD §7 建议 4）——计算吸附方向（命中判定用）。
   相机位置 (px,py,pz) + 相机前向 (fdx,fdy,fdz,单位向量) + 可命中目标列表
   [{x,y,z,hp}] + 夹角阈值（度，默认 3）。
   返回：吸附后的单位方向向量；无可吸附目标（夹角 ≥ 阈值 / 全部死亡 / 无目标）返回 null。
   纯函数：不读 G、不依赖 THREE/DOM；PC 路径不调用（PC 命中判定不变）。 */
function computeAimAssist(px, py, pz, fdx, fdy, fdz, targets, angDeg){
  if(!targets || !Array.isArray(targets) || targets.length === 0) return null;
  const thr = Math.cos((angDeg === undefined ? 3 : angDeg) * Math.PI / 180);
  let best = null, bd = Infinity;
  for(const t of targets){
    if(!t || !(t.hp > 0)) continue;                     // 死亡/无效目标不可命中
    const dx = t.x - px, dy = (t.y === undefined ? py : t.y) - py, dz = t.z - pz;
    const d = Math.sqrt(dx*dx + dy*dy + dz*dz);
    if(d < 1e-6) continue;                              // 与目标中心重合，无需吸附
    const dot = (dx*fdx + dy*fdy + dz*fdz) / d;         // cos(相机朝向, 目标方向)
    if(dot < thr) continue;                             // 夹角 ≥ 阈值
    if(d < bd){ bd = d; best = t; }
  }
  if(!best) return null;
  const dx = best.x - px, dy = (best.y === undefined ? py : best.y) - py, dz = best.z - pz;
  const d = Math.sqrt(dx*dx + dy*dy + dz*dz) || 1;
  return { x: dx/d, y: dy/d, z: dz/d };
}
/*==LOGIC-END==*/

/* ============================================================
   导出（环境自适应，ADR-001）
   - Node 环境：CommonJS 导出 + _setState/_getState 测试钩子
     （对应浏览器 __D3D.state/get；G 为模块级单例，测试用钩子注入）
   - 浏览器环境：挂 globalThis.__D3D_LOGIC（与原型 __D3D.logic 对齐）
   ============================================================ */
const exports_ = {
  /* 常量 */
  TARGET_SAMPLES, BOSS_HP, S, HP_MAX,
  WEAPONS, AMMO_START, AMMO_MAX, AMMO_GAIN,
  OBSTACLES, DEBRIS, SAMPLE_SPOTS, MONSTER_SPOTS, GATE_POS, MAP_LIMIT,
  MONSTER_WINDUP, BOSS_WARN_DIST,
  /* CSD-M2：类型表 / 关卡配置 / 地形预设 */
  MONSTER_TYPES, BOSS_TYPES, LEVELS, TERRAIN_PRESETS,
  /* CSD-H2：怪物强化三档 + 弹丸障碍辅助 */
  MONSTER_BOOST, currentBoostLevel, boostFor, setMonsterBoost, hitStaggerCd,
  spawnExemptObstacles, pulseBlockedByObstacle,
  /* CSD-SOUL1-P1：招式池 / 韧性配置 + 纯函数 */
  SOUL_MOVES, SOUL_POISE, POISE_DMG, EXEC_WINDOW, EXEC_DMG,
  setSoul, setSeed,
  effectiveDmg, moveDamage, moveHitDamage, tickMove, startMove, tickMoveExec, spawnMoveProjectiles,
  applyPoiseHit, breakMonster, interruptMove, tickPoise, speedMult,
  findExecutable, tryExecute,
  /* CSD-SOUL1-P2/P3：AI 信号 / 防御·闪避·诱骗 / BOSS 多阶段 */
  SOUL_SIGNALS, SOUL_AI, SOUL_PHASES,
  tickTelemetry, notePlayerAttack, computeSignals, faceToward, aiCfg,
  enterGuard, guardMult, tickGuard, enterDodge, tickDodge, enterFeint, tickFeint,
  bossPhase, phaseSpeedMult, phaseRecoverMult,
  /* 逻辑函数 */
  freshRun, startLevel, terrainHeight, clampToMap, resolveCollision,
  updateResources, collectSample, tryCollect, playerHit,
  noteKill, tickCombo,
  firePulse, fireWeapon, setWeapon, tickPulses, tickBoss, tickMonsters,
  tickSpitPulses, tickEnemyHazards, baseObjectiveMet, objectiveMet, validateLevel,
  setEnding, checkWin, dirTo, nearestTarget,
  computeAimAssist,
  /* 测试钩子（Node 直测用；浏览器下 __D3D.state/get 等价） */
  _setState: (g) => { G = g; },
  _getState: () => G,
  /* CSD-H2 测试钩子：重置跨局熔断状态（连续死亡计数 / 自动降档累计），保证测试确定性 */
  _resetBoost: () => { retryCount = 0; currentBoost = 3; },
  /* CSD-SOUL1-P1 测试钩子：重置魂系开关 + RNG 种子（与 _resetBoost 并列；保证测试确定性） */
  _resetSoul: () => { soulOn = false; __seed = 0x9e3779b9; return true; }
};
if (typeof module !== "undefined" && module.exports) {
  module.exports = exports_;
}
if (typeof globalThis !== "undefined") {
  globalThis.__D3D_LOGIC = exports_;
}

