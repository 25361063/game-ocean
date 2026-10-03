// v32 补丁：彻底移除安全区设定 + 氧气残留大清洗（两版同步）
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

/* ===== A：安全区系统移除（保留高危裂隙作为独立危险物） ===== */

/* A1：tickPressure 重写 → 仅裂隙伤害（纯生命，无氧气/相位/安全区/HUD） */
const tpStart = html.indexOf("function tickPressure(dt){");
const tpEnd = html.indexOf("/* v13.1 无尽深渊");
if (tpStart > 0 && tpEnd > tpStart) {
  html = html.slice(0, tpStart) +
`function tickPressure(dt){
  /* v32：安全区设定移除，仅保留高危裂隙作为环境危害（纯结构伤害） */
  for(const f of pressure.fissures){f.mesh.material.opacity=.42+.22*Math.abs(Math.sin(G.time*3+f.phase));}
  pressure.damageTick=(pressure.damageTick||0)-dt;
  if(pressure.damageTick<=0){
    pressure.damageTick=1;
    if(pressure.fissures.some(f=>Math.hypot(player.x-f.x,player.z-f.z)<f.r)){
      G.hp=Math.max(0,G.hp-5);hurtFlash=1;toast("高危裂隙 · 结构受损");
    }
  }
}

` + html.slice(tpEnd);
  applied++;
} else failed.push("A1 tickPressure 区段");

/* A2：pressure 初始化去掉 safe/damageTick/phase 依赖 */
rep(`pressure={time:0,damageTick:0,safe:{x:Math.sin(lv*1.7)*15,z:Math.cos(lv*1.3)*15,r:15},fissures:[],meshes:[],phase:"calm"};`,
`pressure={time:0,damageTick:0,fissures:[],meshes:[],phase:"calm"};`, "A2 init");
rep(`let pressure={time:0,damageTick:0,safe:{x:0,z:0,r:15},fissures:[],meshes:[],phase:"calm"};`,
`let pressure={time:0,damageTick:0,fissures:[],meshes:[],phase:"calm"};`, "A2 init2");
rep(`/* v13 动态环境压力：循环潮汐、移动安全区和固定高危裂隙。 */`,
`/* v32 高危裂隙：固定环境危害（原安全区收缩设定已移除）。 */`, "A2 comment");
rep(`/* v24.4 潮汐压力视觉重建：能量护幕墙 + 界标光柱 + 程序化熔裂地贴 */`,
`/* v24.4/v32 熔裂地贴：程序化裂隙危险区 */`, "A2 comment2");

/* A3：rebuildPressureEnvironment 移除安全区可视化（双环/护幕墙/顶环/光柱），保留裂隙 */
const sA = html.indexOf("  const sx=pressure.safe.x,sz=pressure.safe.z,sy=terrainHeight(sx,sz);");
const eA = html.indexOf("  /* 高危裂隙：程序化熔裂地贴 + 危险圈线 + 中心辉光");
if (sA > 0 && eA > sA) { html = html.slice(0, sA) + html.slice(eA); applied++; }
else failed.push("A3 safe visuals 区段");

/* A4：小地图去掉安全区圈，保留裂隙三角 */
rep(`  if(pressure&&pressure.safe){const sp=minimapPoint(pressure.safe.x,pressure.safe.z),sr=pressure.safe.r/(MAP_LIMIT*2)*(minimapEl.width-26);ctx.strokeStyle=pressure.phase==="surge"?"rgba(99,232,207,.9)":"rgba(99,232,207,.55)";ctx.lineWidth=1.4;ctx.setLineDash([4,3]);ctx.beginPath();ctx.arc(sp.x,sp.y,sr,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);for(const f of pressure.fissures||[]){const fp=minimapPoint(f.x,f.z);ctx.fillStyle="#ff315d";ctx.beginPath();ctx.moveTo(fp.x,fp.y-4);ctx.lineTo(fp.x+4,fp.y+4);ctx.lineTo(fp.x-4,fp.y+4);ctx.closePath();ctx.fill();}}`,
`  for(const f of (pressure&&pressure.fissures)||[]){const fp=minimapPoint(f.x,f.z);ctx.fillStyle="#ff315d";ctx.beginPath();ctx.moveTo(fp.x,fp.y-4);ctx.lineTo(fp.x+4,fp.y+4);ctx.lineTo(fp.x-4,fp.y+4);ctx.closePath();ctx.fill();}   // v32 仅裂隙`, "A4 minimap");

/* A5：pressureHud 移除 */
rep(`  <div id="pressureHud"><b>潮汐稳定</b> · 安全区正在扫描</div>\n`, "", "A5 hud html");
rep(`  #pressureHud{position:fixed;left:50%;top:118px;transform:translateX(-50%);z-index:7;min-width:250px;padding:5px 11px;text-align:center;border:1px solid rgba(92,168,255,.32);border-radius:14px;background:rgba(4,12,22,.76);color:#a7d6ff;font-size:10px;letter-spacing:.08em;pointer-events:none}#pressureHud b{color:#d8f2ff;font-weight:400}#pressureHud.surge{border-color:#ff5573;color:#ff9daf;box-shadow:0 0 18px rgba(255,70,105,.22)}\n`, "", "A5 hud css");
rep(`#transmission.show{transform:translate(-50%,0)}#pressureHud{top:105px;min-width:210px}.achievement-list{grid-template-columns:1fr}`,
`#transmission.show{transform:translate(-50%,0)}.achievement-list{grid-template-columns:1fr}`, "A5 hud css2");

/* A6：无尽波次重建去氧气/damageTick */
rep(`G.hp=Math.min(G.maxHp,G.hp+Math.ceil(G.maxHp*.18));G.oxygen=Math.min(G.maxOxygen,G.oxygen+Math.ceil(G.maxOxygen*.22));G.ammo=Math.min(AMMO_MAX,G.ammo+2);pressure.damageTick=1;buildMinimapLayer();}`,
`G.hp=Math.min(G.maxHp,G.hp+Math.ceil(G.maxHp*.18));G.ammo=Math.min(AMMO_MAX,G.ammo+2);buildMinimapLayer();}`, "A6 wave rebuild");

/* A7：紧急重生：原地复活（不再传送安全区），文案去安全区/氧气 */
rep(`player.x=pressure.safe.x;player.z=pressure.safe.z;`,
`/* v32 原地复活 */`, "A7 teleport");
rep(`showTransmission("紧急重生舱","已在潮汐安全区重构潜航躯体：保留全部装备与金币，清空敌方弹幕，生命与氧气恢复至 55%，分数扣除 15%。",4400);`,
`showTransmission("紧急重生舱","原地重构潜航躯体：保留全部装备与金币，清空敌方弹幕，生命恢复至 55%，分数扣除 15%。",4400);`, "A7 respawn text");
rep(`G.oxygen=Math.max(1,Math.ceil(G.maxOxygen*.55));`, ``, "A7 continue oxy");

/* A8：裂隙伤害去氧气 + 事件文案 */
rep(`toast("高危裂隙 · 结构与氧气流失");`, ``, "A8 legacy (rewritten in A1)");

/* ===== B：氧气残留大清洗 ===== */

/* B1：G 初始化字段 */
repAll(`state:S.MENU, oxygen:100, maxOxygen:100, hp:HP_MAX, maxHp:HP_MAX,`,
`state:S.MENU, hp:HP_MAX, maxHp:HP_MAX,`, "B1 G init", 2);

/* B2：DIVER_ROLES 字段 */
rep(`maxHp:70,maxOxygen:125,oxygenDrainMul:.78,sampleOxyMul:1.5,`, `maxHp:70,`, "B2 explorer");
rep(`maxHp:90,maxOxygen:105,oxygenDrainMul:.96,sampleOxyMul:1.1,`, `maxHp:90,`, "B2 guardian");
rep(`maxHp:58,maxOxygen:90,oxygenDrainMul:.9,sampleOxyMul:.9,`, `maxHp:58,`, "B2 hunter");

/* B3：applyEquipStats —— 移除氧气行 + 修复养成/遗章块被基础赋值覆盖的顺序 bug */
rep(`  g.maxOxygen=Math.max(35,Math.round((role.maxOxygen+(storyRun.echo||0)*5+(meta.upgrades.lungs||0)*6)));
  g.moveMul=role.moveMul*mv;g.weaponCoolMul=role.weaponCoolMul*cool;`,
`  g.moveMul=role.moveMul*mv;g.weaponCoolMul=role.weaponCoolMul*cool;`, "B3 equipStats oxy");
const blockOld =
`  g.maxHp=Math.round(g.maxHp*(1+hpPctR/100))+(lv-1)*2+brk*40+hpFlatR;
  g.damageMul=g.damageMul*(1+dmgPctR/100)+(lv-1)*.006+brk*.06;
  g.critBonus+=critR/100;g.weaponCoolMul*=1-Math.min(.6,coolR/100);
  g.moveMul*=1+moveR/100;g.goldMul*=1+goldR/100;g.critDmg=critDmgR/100;g.shieldDurationMul+=shR/100;
  g.damageMul=role.damageMul*dmg;
  g.maxHp=Math.max(20,Math.round((role.maxHp+(storyRun.order||0)*4+(meta.upgrades.hull||0)*5)+hp));
  g.moveMul=role.moveMul*mv;g.weaponCoolMul=role.weaponCoolMul*cool;
  g.critBonus=(g.critBase!==undefined?g.critBase:.12)+crit;
  g.overdriveDurationMul=role.overdriveDurationMul*od;
  g.shieldDurationMul=role.shieldDurationMul*shD;g.shieldCoolMul=role.shieldCoolMul*shC;
  g.dashCoolMul=role.dashCoolMul*dash;g.echoBonus=echo;g.poiseMul=poise;g.killHealEquip=heal;g.goldMul=gold;
}`;
const blockNew =
`  g.damageMul=role.damageMul*dmg;
  g.maxHp=Math.max(20,Math.round((role.maxHp+(storyRun.order||0)*4+(meta.upgrades.hull||0)*5)+hp));
  g.moveMul=role.moveMul*mv;g.weaponCoolMul=role.weaponCoolMul*cool;
  g.critBonus=(g.critBase!==undefined?g.critBase:.12)+crit;
  g.overdriveDurationMul=role.overdriveDurationMul*od;
  g.shieldDurationMul=role.shieldDurationMul*shD;g.shieldCoolMul=role.shieldCoolMul*shC;
  g.dashCoolMul=role.dashCoolMul*dash;g.echoBonus=echo;g.poiseMul=poise;g.killHealEquip=heal;g.goldMul=gold;
  /* v31 养成 + 遗章词条（v32 修正：置于基础赋值之后，否则被覆盖） */
  g.maxHp=Math.round(g.maxHp*(1+hpPctR/100))+(lv-1)*2+brk*40+hpFlatR;
  g.damageMul=g.damageMul*(1+dmgPctR/100)+(lv-1)*.006+brk*.06;
  g.critBonus+=critR/100;g.weaponCoolMul*=1-Math.min(.6,coolR/100);
  g.moveMul*=1+moveR/100;g.goldMul*=1+goldR/100;g.critDmg=critDmgR/100;g.shieldDurationMul+=shR/100;
}`;
rep(blockOld, blockNew, "B3 relocate order");

/* B4：applyRunProfile / applyRunBuildToG / 角色字段赋值 */
rep(`g.maxHp=Math.max(20,Math.round(role.maxHp+(storyRun.order||0)*4+(meta.upgrades.hull||0)*5));g.maxOxygen=Math.max(35,Math.round(role.maxOxygen+(storyRun.echo||0)*5+(meta.upgrades.lungs||0)*6));g.hp=g.maxHp;g.oxygen=g.maxOxygen;
  g.oxygenDrainMul=role.oxygenDrainMul;g.sampleOxyMul=role.sampleOxyMul;`,
`g.maxHp=Math.max(20,Math.round(role.maxHp+(storyRun.order||0)*4+(meta.upgrades.hull||0)*5));g.hp=g.maxHp;`, "B4 profile");
rep(`function applyRunBuildToG(refill){if(!G)return;applyEquipStats(G);if(refill){G.hp=G.maxHp;G.oxygen=G.maxOxygen;}else{G.hp=Math.min(G.maxHp,G.hp);G.oxygen=Math.min(G.maxOxygen,G.oxygen);}}`,
`function applyRunBuildToG(refill){if(!G)return;applyEquipStats(G);if(refill){G.hp=G.maxHp;}else{G.hp=Math.min(G.maxHp,G.hp);}}`, "B4 buildToG");

/* B5：拾取/击杀/连杀氧气 */
rep(`  G.oxygen = Math.min(G.maxOxygen||100, G.oxygen+5*(G.sampleOxyMul||1));\n`, ``, "B5 collect");
rep(`G.secondWindUsed=true;G.hp=1;G.oxygen=Math.max(G.oxygen,20);`, `G.secondWindUsed=true;G.hp=1;`, "B5 secondWind");
repAll(`(runBuild.lowOxyRage&&G.oxygen/G.maxOxygen<.3)?runBuild.lowOxyRage:0)+`, ``, "B5 lowOxyRage", 2);
rep(`if(obj.kind === "survive") return G.time >= obj.t && G.oxygen > 0;`,
`if(obj.kind === "survive") return G.time >= obj.t;`, "B5 survive");
rep(`  G.oxygen=Math.min(G.maxOxygen,G.oxygen+1+runBuild.killOxy+(isBoss?8:0));`, ``, "B5 kill oxy");
rep(`  if(runBuild.streak===3){G.oxygen=Math.min(G.maxOxygen,G.oxygen+8);toast("3 连杀 · 氧气回流 +8");}`,
`  if(runBuild.streak===3){G.gold=(G.gold||0)+20;G.goldEarned=(G.goldEarned||0)+20;toast("3 连杀 · 赏金 +20");}`, "B5 streak3");

/* B6：掉落物 oxy → 移除 */
rep(`const kind=(rareForce||Math.random()<rareChance)?"gold":G.hp/(G.maxHp||HP_MAX)<.55?"hp":G.oxygen/(G.maxOxygen||100)<.42?"oxy":G.ammo<3?"ammo":(["hp","oxy","ammo"][Math.floor(Math.random()*3)]);`,
`const kind=(rareForce||Math.random()<rareChance)?"gold":G.hp/(G.maxHp||HP_MAX)<.55?"hp":G.ammo<3?"ammo":(["hp","gold","ammo"][Math.floor(Math.random()*3)]);`, "B6 loot kind");
rep(`      else if(d.kind==="oxy"){G.oxygen=Math.min(G.maxOxygen||100,G.oxygen+16);msg="氧气补给 +16";}\n`, ``, "B6 loot pickup");
rep(`const LOOT_COLORS={hp:0xff5573,oxy:0x63e8cf,ammo:0x5ca8ff,gold:0xffd66b};`,
`const LOOT_COLORS={hp:0xff5573,ammo:0x5ca8ff,gold:0xffd66b};`, "B6 colors");

/* B7：事件文案与分支氧气 */
rep(`{title:"失压回收站",question:"一只未知遗物在裂缝边缘发出求救脉冲。",a:["回收遗物","损失 15% 当前生命，随机构筑 +1"],b:["切断信号","获得 12 氧气与 2 发弹药"]},`,
`{title:"失压回收站",question:"一只未知遗物在裂缝边缘发出求救脉冲。",a:["回收遗物","损失 15% 当前生命，随机构筑 +1"],b:["切断信号","获得 2 发弹药与少量金币"]},`, "B7 ev1");
rep(`b:["稳守安全区","恢复 30% 生命与氧气"]},`,
`b:["稳守通道","恢复 30% 生命"]},`, "B7 ev2");
rep(`a:["按下红键","伤害 +25%，氧气上限 -10%"],b:["按下蓝键","护盾冷却 -20%，获得 1 次续命"]}`,
`a:["按下红键","损失 15% 生命，金币 +300"],b:["按下蓝键","获得 3 秒护幕"]}`, "B7 ev3");
rep(`desc:"生命 +10，氧气余量转化为护盾 2 秒"`,
`desc:"生命 +10，并立即获得 2 秒护幕"`, "B7 ev4");
repAll(`G.hp=Math.min(G.maxHp,G.hp+G.maxHp*.3);G.oxygen=Math.min(G.maxOxygen,G.oxygen+G.maxOxygen*.3);`,
`G.hp=Math.min(G.maxHp,G.hp+G.maxHp*.3);`, "B7 safe branch", 2);
rep(`else{storyRun.echo++;if(G){G.maxOxygen+=5;G.oxygen=Math.min(G.maxOxygen,G.oxygen+5);}}`,
`else{storyRun.echo++;if(G)grantCrystal(2,"洞察印证");}`, "B7 echo");
repAll(`洞察 +1 · 最大氧气 +5`, `洞察 +1 · 结晶 +2`, "B7 story desc", 3);

/* B8：休息站析氧囊移除 */
rep(`  {id:"lungs",name:"深潜析氧囊",tag:"永久升级 · 最高 5 级",desc:r=>"每级使所有角色最大氧气 +6。当前 "+r+"/5",cost:r=>25+r*20,max:5},\n`, ``, "B8 lungs");

/* B9：文案/注释/UI 清洗 */
rep(`<span id="levelIntroSub">本关氧气已补满 · 准备潜航</span>`, `<span id="levelIntroSub">准备潜航</span>`, "B9 intro static");
rep(`"生命与氧气已补满 · "+(lv.beat||("当前状态 "+Math.round(G.oxygen)+"/"+G.maxOxygen))`,
`"战术节点已解锁 · "+(lv.beat||"")`, "B9 intro sub");
rep(`生命条表示重造身体的结构完整度；氧气由潜航装具供应，并在每一关重新补满。`,
`生命条表示重造身体的结构完整度，并在每一关重新补满。`, "B9 archive");
rep(`<div id="lowOxy"></div>`, ``, "B9 lowOxy el");
rep(`  #lowOxy{position:absolute;inset:0;background:radial-gradient(ellipse at center,transparent 40%,rgba(224,80,106,.5));opacity:0;transition:opacity .4s;}\n`, ``, "B9 lowOxy css");
rep(`_setOpacity("lowOxy", Math.max(lowOp, hurtFlash*0.85).toFixed(3));`,
`_setOpacity("lowOxy", Math.max(lowOp, hurtFlash*0.85).toFixed(3));   // v32 低血红光层（仅低生命触发）`, "B9 lowOxy keep");
rep(`G = createConfiguredLevel(idx, carry);   // v9：每关明确补满该角色氧气与生命`,
`G = createConfiguredLevel(idx, carry);`, "B9 comment");
rep(`oxygen: G.oxygen || 0,\n`, ``, "B9 qa get");
rep(`qaSetResources:qaEnabled?(hp,oxygen)=>{if(G){G.hp=Math.max(0,Math.min(G.maxHp,Number(hp)));G.oxygen=Math.max(0,Math.min(G.maxOxygen,Number(oxygen)));}return globalThis.__D3D.get();}:undefined,`,
`qaSetResources:qaEnabled?(hp)=>{if(G){G.hp=Math.max(0,Math.min(G.maxHp,Number(hp)));}return globalThis.__D3D.get();}:undefined,`, "B9 qa set");
rep(`: (dieHp ? "潜航记录中断 · 髓瓷躯崩解" : "潜航记录中断 · 析氧停止");`,
`: "潜航记录中断 · 髓瓷躯崩解";`, "B9 death title");
rep(`"<br>中断原因：<b>" + (dieHp ? "髓瓷结构归零" : "析氧囊耗尽") + "</b>`,
`"<br>中断原因：<b>髓瓷结构归零</b>`, "B9 death detail");

/* B10：低氧样品浮动死代码清洗 */
rep(`  const lowOxy = false;   // v24.3 氧气系统已移除（样本低氧加急浮动不再触发）\n  const freq = lowOxy ? 4 : 2;\n`, ``, "B10 lowOxy var");
repAll(`(lowOxy ? 0.22 : 0.18)`, `0.18`, "B10 a", 1);
repAll(`dt*(lowOxy ? 2.8 : 1.4)`, `dt*1.4`, "B10 b", 1);
repAll(`dt*(lowOxy?2.2:1.1)`, `dt*1.1`, "B10 c", 2);
repAll(`lowOxy?1.06+.12*Math.abs(Math.sin(G.time*5+i)):1+.05*Math.sin(G.time*2+i)`, `1+.05*Math.sin(G.time*2+i)`, "B10 d", 1);
repAll(`const k=lowOxy?.72+.28*Math.abs(Math.sin(G.time*6+i)):1+.06*Math.sin(G.time*2+i)`, `const k=1+.06*Math.sin(G.time*2+i)`, "B10 e", 1);
repAll(`(lowOxy?2.38:2.08)`, `2.08`, "B10 f", 1);

/* B11：注释清洗 */
rep(`/* CSD-H2：HP 血条（复用 BOSS 红色系，与氧气绿条区分；❤ 标签色盲友好） + 低血边框闪烁 */`,
`/* CSD-H2：HP 血条（复用 BOSS 红色系；❤ 标签色盲友好） + 低血边框闪烁 */`, "B11 c1");
rep(`<!-- v24.3 氧气系统已移除（原氧气条） -->\n`, ``, "B11 c2");
rep(` 保留 G.score / G.ammo；重置 oxygen=100、samples/grabbed/cool/hitCool/kills/time/`,
` 保留 G.score / G.ammo；重置 samples/grabbed/cool/hitCool/kills/time/`, "B11 c3");
rep(`/* v24.3 氧气系统移除：不再耗氧、不再缺氧死亡；历史存档中的 oxygen 值保留但永远满格（所有 +氧气 奖励被上限钳制为空操作） */`,
`/* v24.3/v32 氧气系统彻底移除 */`, "B11 c4");
rep(`- 进度：samples/score/oxygen/grabbed/winOpen（+time/kills 供结算与续档）`,
`- 进度：samples/score/grabbed/winOpen（+time/kills 供结算与续档）`, "B11 c5");
rep(`G：逻辑状态（samples/score/oxygen/grabbed/winOpen/time/kills）`,
`G：逻辑状态（samples/score/grabbed/winOpen/time/kills）`, "B11 c6");
rep(`// HUD（v24.3 氧气条已随系统移除；CSD-H2：HP 血条 + 低血警示）`,
`// HUD（CSD-H2：HP 血条 + 低血警示）`, "B11 c7");
rep(`// CSD-H2：低血（HP<25 或 氧<25）共用 lowOxy 红光层（单一层合并条件）；HP<25 追加 #hpBox 边框闪烁 + hpwarn 入场一次`,
`// CSD-H2：低血（HP<25）红光层；追加 #hpBox 边框闪烁 + hpwarn 入场一次`, "B11 c8");
rep(`/* v23.5 元素反应里程碑：每 5 次反应 → 氧气 +6 与奖分，鼓励双武器轮转打反应 */`,
`/* v23.5 元素反应里程碑：每 5 次反应 → 奖分，鼓励元素轮转 */`, "B11 c9");
rep(`runBuild.killOxy||0`, `0`, "B11 killOxy ref");

fs.writeFileSync(F, html);
console.log(F, "applied:", applied);
if (failed.length) { console.log("FAILED:"); failed.forEach(f => console.log("  " + f)); }
