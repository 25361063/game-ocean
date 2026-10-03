// v27 补丁：王者荣耀式局内经济装备系统，移除三选一构筑与遗物增益系统
const fs = require("fs");
const F = "潮声之下_深渊潜航3D_v22.html";
let html = fs.readFileSync(F, "utf8");
let applied = 0, failed = [];
function rep(find, replace, tag) {
  const n = html.split(find).length - 1;
  if (n !== 1) { failed.push(tag + " (出现 " + n + " 次)"); return; }
  html = html.replace(find, replace);
  applied++;
}

/* P1：主区域替换（BUILD_POOL/遗物池/构筑三选一/applyRunProfile → 经济装备模块） */
const startMark = "/* ================= v13 单局构筑系统 ================= */";
const endMark = "function createConfiguredLevel(idx,carry,resetModeBoost){";
const si = html.indexOf(startMark), ei = html.indexOf(endMark);
if (si < 0 || ei < 0 || ei < si) { failed.push("P1 主区域锚点未找到"); }
else {
  const NEW = `/* ================= v27 王者荣耀式局内经济装备 =================
   金币来源：初始 200 · 击杀赏金 · 金币袋 · 证据 · 节点/波次奖励 · 被动收入 2.2/秒；
   装备库：B 键或触屏“店”按钮开关，6 槽位，购买立即生效，出售返还 60%。
   v27 移除：旧版三选一构筑（BUILD_POOL）与遗物系统（RELIC_POOL）。
   ============================================================ */
const EQUIP_SLOTS=6;
const EQUIPMENT=[
  {id:"dagger",name:"破潮匕首",cost:300,desc:"伤害 +8%",s:{dmg:.08}},
  {id:"shell",name:"陶质甲片",cost:280,desc:"生命上限 +12",s:{hp:12}},
  {id:"fins",name:"疾行蛙鞋",cost:260,desc:"移动速度 +8%",s:{mv:.08}},
  {id:"coil",name:"谐振线圈",cost:320,desc:"武器冷却 -8%",s:{cool:.08}},
  {id:"turbo",name:"涡轮弹头",cost:900,desc:"伤害 +16%",s:{dmg:.16}},
  {id:"hullplate",name:"复合潜航壳",cost:850,desc:"生命上限 +26",s:{hp:26}},
  {id:"leech",name:"嗜血贝",cost:950,desc:"被动 · 击杀回复 4 点生命",s:{heal:4}},
  {id:"lens",name:"声呐透镜",cost:1000,desc:"暴击率 +8%",s:{crit:.08}},
  {id:"ring",name:"贪婪指环",cost:800,desc:"被动 · 金币获取 +25%",s:{gold:.25}},
  {id:"echoCore",name:"回响核心",cost:700,desc:"回响半径 +1",s:{echo:1}},
  {id:"cap",name:"过载电容",cost:1100,desc:"神经超频持续 +35%",s:{od:.35}},
  {id:"spear",name:"髓能谐振矛",cost:2100,desc:"伤害 +24% · 冷却 -10%",s:{dmg:.24,cool:.10}},
  {id:"heavyarmor",name:"深渊重甲",cost:2000,desc:"生命上限 +55",s:{hp:55}},
  {id:"phase",name:"相位推进器",cost:1900,desc:"移速 +14% · 冲刺冷却 -25%",s:{mv:.14,dash:.25}},
  {id:"wedge",name:"破盾锥",cost:1600,desc:"韧性伤害 +30%（处决更快）",s:{poise:.3}},
  {id:"aegis",name:"护幕发生器",cost:1800,desc:"护幕持续 +35% · 冷却 -25%",s:{shD:.35,shC:.25}},
  {id:"desoEye",name:"荒凉之眼",cost:3600,desc:"伤害 +20% · 暴击 +12%",s:{dmg:.20,crit:.12}},
  {id:"proto",name:"建造者原型机",cost:4200,desc:"伤害 +15% · 冷却 -15% · 生命 +30 · 超频 +30%",s:{dmg:.15,cool:.15,hp:30,od:.3}},
  {id:"abyssDip",name:"深渊之浸",cost:3900,desc:"伤害 +12% · 移速 +10% · 击杀回复 6",s:{dmg:.12,mv:.10,heal:6}}
];
function applyEquipStats(g){
  if(!g)return;
  const role=DIVER_ROLES[g.roleId]||DIVER_ROLES.explorer;
  let dmg=1,hp=0,mv=1,cool=1,crit=0,od=1,shD=1,shC=1,dash=1,echo=0,poise=1,heal=0,gold=1;
  for(const id of (g.equip||[])){
    const it=EQUIPMENT.find(x=>x.id===id);if(!it)continue;const s=it.s;
    dmg+=s.dmg||0;hp+=s.hp||0;mv+=s.mv||0;cool*=1-(s.cool||0);crit+=s.crit||0;od+=s.od||0;
    shD+=s.shD||0;shC*=1-(s.shC||0);dash*=1-(s.dash||0);echo+=s.echo||0;poise+=s.poise||0;heal+=s.heal||0;gold+=s.gold||0;
  }
  g.damageMul=role.damageMul*dmg;
  g.maxHp=Math.max(20,Math.round((role.maxHp+(storyRun.order||0)*4+(meta.upgrades.hull||0)*5)+hp));
  g.maxOxygen=Math.max(35,Math.round((role.maxOxygen+(storyRun.echo||0)*5+(meta.upgrades.lungs||0)*6)));
  g.moveMul=role.moveMul*mv;g.weaponCoolMul=role.weaponCoolMul*cool;
  g.critBonus=(g.critBase!==undefined?g.critBase:.12)+crit;
  g.overdriveDurationMul=role.overdriveDurationMul*od;
  g.shieldDurationMul=role.shieldDurationMul*shD;g.shieldCoolMul=role.shieldCoolMul*shC;
  g.dashCoolMul=role.dashCoolMul*dash;g.echoBonus=echo;g.poiseMul=poise;g.killHealEquip=heal;g.goldMul=gold;
}
function grantGold(n,why){if(!G)return;const g2=Math.round(n*((G.goldMul||1)));G.gold=(G.gold||0)+g2;G.goldEarned=(G.goldEarned||0)+g2;toast((why?why+" · ":"")+"金币 +"+g2);renderRunBuildStrip();}
function freshRunBuild(){return {kills:0,events:{},routeRewardClaimed:false,routeElitePending:false,pending:false,sigBuildUsed:false,rare:0,killHeal:0,killOxy:0,comboWindow:4.8,comboScore:1,streak:0,streakTimer:0,secondWind:false,damageTaken:1,thornBreak:0,thornSpeed:1,thornPoise:0,thornTwin:false,echoDash:false,execAmmo:0,breakFrenzy:0,comboShield:false,sonarMark:0,lootMagnet:0,lowOxyRage:0,lowHpRage:0,sonarSpread:false,sonarPierce:0,echoField:false,echoRadius:1,echoKnock:1,dashShock:false,shieldPulse:false,overdriveKill:0,closeDamage:0,bossDamage:0,crystalDividend:false,pressureAnchor:false};}
runBuild=freshRunBuild();   // 赋值到逻辑脚本声明的全局 var（跨 <script> 桥接，见逻辑区注释）
function resetRunBuild(){runBuild=freshRunBuild();renderRunBuildStrip();}
function applyRunBuildToG(refill){if(!G)return;applyEquipStats(G);if(refill){G.hp=G.maxHp;G.oxygen=G.maxOxygen;}else{G.hp=Math.min(G.maxHp,G.hp);G.oxygen=Math.min(G.maxOxygen,G.oxygen);}}
function renderRunBuildStrip(){const el=document.getElementById("runBuildStrip");if(!el)return;const eq=(G&&G.equip)||[];const names=eq.map(id=>{const it=EQUIPMENT.find(x=>x.id===id);return it?it.name:id;});el.innerHTML="<b>金币 "+Math.floor((G&&G.gold)||0)+"</b> · 装备 "+eq.length+"/"+EQUIP_SLOTS+(names.length?" · "+names.join(" · "):" · 按 B 打开装备库");}

let shopGridEl=null;
function toggleEquipShop(){
  const ov=document.getElementById("buildOverlay");if(!ov)return;
  if(!ov.classList.contains("hidden")){closeNodePanel();return;}
  if(!G||G.state!==S.PLAYING){toast("当前无法打开装备库");return;}
  openNodePanel("深海装备库","",renderShopGrid);
}
function renderShopGrid(grid){
  shopGridEl=grid;grid.innerHTML="";
  const load=document.createElement("div");load.style.gridColumn="1/-1";load.style.display="grid";load.style.gridTemplateColumns="repeat(6,minmax(0,1fr))";load.style.gap="6px";
  for(let i=0;i<EQUIP_SLOTS;i++){
    const id=(G.equip||[])[i],it=id?EQUIPMENT.find(x=>x.id===id):null;
    const slot=document.createElement("button");slot.type="button";slot.className="build-option";slot.style.minHeight="58px";slot.style.padding="8px";
    if(it){slot.innerHTML="<b></b><em></em>";slot.querySelector("b").textContent=it.name;slot.querySelector("em").textContent="出售 +"+Math.round(it.cost*.6)+" 金币";slot.addEventListener("click",()=>sellEquip(i));}
    else{slot.innerHTML="<b style='color:#5e736c'>空槽</b><em>第 "+(i+1)+" 格</em>";slot.disabled=true;}
    load.appendChild(slot);
  }
  grid.appendChild(load);
  for(const it of EQUIPMENT.slice().sort((a,b)=>a.cost-b.cost)){
    const owned=(G.equip||[]).filter(x=>x===it.id).length;
    const b=document.createElement("button");b.type="button";b.className="build-option";
    if((G.gold||0)<it.cost||G.equip.length>=EQUIP_SLOTS)b.style.opacity=".45";
    b.innerHTML="<b></b><em></em><small></small>";
    b.querySelector("b").textContent=it.name;
    b.querySelector("em").textContent=it.cost+" 金币"+(owned?" · 已持"+owned:"");
    b.querySelector("small").textContent=it.desc;
    b.addEventListener("click",()=>buyEquip(it));
    grid.appendChild(b);
  }
  document.getElementById("buildSub").textContent="金币 "+Math.floor(G.gold||0)+" · 装备 "+((G.equip||[]).length)+"/"+EQUIP_SLOTS+" · 购买立即生效 · 出售返还 60%";
}
function buyEquip(it){if(!G||!it)return;if((G.equip||[]).length>=EQUIP_SLOTS){toast("装备栏已满 · 请先出售");return;}if((G.gold||0)<it.cost){toast("金币不足 · 还差 "+Math.ceil(it.cost-(G.gold||0)));return;}G.gold-=it.cost;G.equip.push(it.id);applyEquipStats(G);G.hp=Math.min(G.maxHp,G.hp);sound("pickup");toast("已装备 · "+it.name);renderShopGrid(shopGridEl||document.getElementById("buildChoices"));}
function sellEquip(slot){if(!G)return;const id=(G.equip||[])[slot];const it=EQUIPMENT.find(x=>x.id===id);if(!it)return;G.equip.splice(slot,1);const refund=Math.round(it.cost*.6);G.gold=(G.gold||0)+refund;applyEquipStats(G);G.hp=Math.min(G.maxHp,G.hp);toast("已出售 · "+it.name+"　金币 +"+refund);renderShopGrid(shopGridEl||document.getElementById("buildChoices"));}

function applyRunProfile(g){
  const mode=RUN_MODES[runSelection.modeId]||RUN_MODES.expedition,role=DIVER_ROLES[runSelection.roleId]||DIVER_ROLES.explorer;
  g.modeId=runSelection.modeId;g.roleId=runSelection.roleId;g.runStartLevel=runSelection.level;
  if(g.gold===undefined){g.gold=200;g.goldEarned=0;g.equip=[];}
  g.critBase=.12;
  g.maxHp=Math.max(20,Math.round(role.maxHp+(storyRun.order||0)*4+(meta.upgrades.hull||0)*5));g.maxOxygen=Math.max(35,Math.round(role.maxOxygen+(storyRun.echo||0)*5+(meta.upgrades.lungs||0)*6));g.hp=g.maxHp;g.oxygen=g.maxOxygen;
  g.oxygenDrainMul=role.oxygenDrainMul;g.sampleOxyMul=role.sampleOxyMul;
  g.dashCoolMul=role.dashCoolMul;g.overdriveDurationMul=role.overdriveDurationMul;
  g.scoreMul=mode.scoreMul;
  if(g.boss&&mode.bossHpMul!==1){g.boss.maxHp=Math.max(1,Math.ceil(g.boss.maxHp*mode.bossHpMul));g.boss.hp=g.boss.maxHp;}
  if(g.modeId==="bossRush")g.monsters=[];
  applyEquipStats(g);   // v27 装备数值结算
  return g;
}
`;
  html = html.slice(0, si) + NEW + html.slice(ei);
  applied++;
}

/* P2：startLevel 跨关携带金币/装备 */
rep("  g.runTime = (carry.runTime !== undefined) ? carry.runTime : (prev ? (prev.runTime||0) : 0);",
"  g.runTime = (carry.runTime !== undefined) ? carry.runTime : (prev ? (prev.runTime||0) : 0);\n  g.gold = (carry.gold !== undefined) ? carry.gold : (prev ? (prev.gold||0) : 200);\n  g.goldEarned = (carry.goldEarned !== undefined) ? carry.goldEarned : (prev ? (prev.goldEarned||0) : 0);\n  g.equip = (carry.equip !== undefined) ? carry.equip.slice() : (prev ? (prev.equip||[]).slice() : []);", "P2 carry");

/* P3：章节切换 carry 带金币装备 */
rep("const completedLevel=G.level||1,carry={score:G.score,ammo:G.ammo,runTime:G.runTime||0},nextIdx=",
"const completedLevel=G.level||1,carry={score:G.score,ammo:G.ammo,runTime:G.runTime||0,gold:G.gold,goldEarned:G.goldEarned,equip:(G.equip||[]).slice()},nextIdx=", "P3 exit carry");

/* P4：qaLoadLevel carry */
rep("loadLevel(Math.max(0,Math.min(99,i|0)),{score:G?G.score:0,ammo:G?G.ammo:4,runTime:G?G.runTime:0});",
"loadLevel(Math.max(0,Math.min(99,i|0)),{score:G?G.score:0,ammo:G?G.ammo:4,runTime:G?G.runTime:0,gold:G?G.gold:undefined,goldEarned:G?G.goldEarned:undefined,equip:G?(G.equip||[]).slice():undefined});", "P4 qa carry");

/* P5：韧性伤害吃装备加成 */
rep("m.poise.cur = Math.min(m.poise.max, m.poise.cur + (POISE_DMG[wid] || 0) * s);",
"m.poise.cur = Math.min(m.poise.max, m.poise.cur + (POISE_DMG[wid] || 0) * s * ((G&&G.poiseMul)||1));", "P5 poise");

/* P6：证据拾取金币 */
rep("G.samples++;",
"G.samples++;{const kg=Math.round(40*((G&&G.goldMul)||1));G.gold=(G.gold||0)+kg;G.goldEarned=(G.goldEarned||0)+kg;}", "P6 sample gold");

/* P7-P9：战利品 relic → 金币袋 */
rep("const LOOT_COLORS={hp:0xff5573,oxy:0x63e8cf,ammo:0x5ca8ff,relic:0xffd66b};",
"const LOOT_COLORS={hp:0xff5573,oxy:0x63e8cf,ammo:0x5ca8ff,gold:0xffd66b};", "P7 loot colors");
rep("const kind=(rareForce||Math.random()<rareChance)?\"relic\":",
"const kind=(rareForce||Math.random()<rareChance)?\"gold\":", "P8 loot kind");
rep("lootDrops.push({mesh:g,x,z,kind,life:20,phase:Math.random()*6.28,baseY});",
"lootDrops.push({mesh:g,x,z,kind,rare:!!rareForce,life:20,phase:Math.random()*6.28,baseY});", "P9 loot rare flag");
rep("else{const relic=grantRandomRelic(\"战斗掉落\");msg=relic?(\"永久遗物 · \"+relic.name):\"重复遗物已转化为船币\";grantCurrency(3+(runBuild.relicCurrency||0),\"遗物回收\");}",
"else{const kg=Math.round((d.rare?150:60)*((G&&G.goldMul)||1));G.gold=(G.gold||0)+kg;G.goldEarned=(G.goldEarned||0)+kg;msg=\"金币袋 +\"+kg;renderRunBuildStrip();}", "P10 loot pickup");

/* P11：击杀赏金（registerRunKill 尾部改造） */
rep("renderRunBuildStrip();\n  if(isBoss){runBuild.nextChoice=Math.max(runBuild.nextChoice,runBuild.kills+1);grantRandomRelic(\"巨兽核心\",\"rare\");showBuildChoice(\"巨兽核心\");}\n  else if(runBuild.kills>=runBuild.nextChoice){runBuild.nextChoice+=3;showBuildChoice(\"击杀经验\");}\n}",
"renderRunBuildStrip();\n  {const kg=Math.round((isBoss?220:16+Math.min(20,(runBuild.streak||0)*2))*((G&&G.goldMul)||1));G.gold=(G.gold||0)+kg;G.goldEarned=(G.goldEarned||0)+kg;}\n  if(isBoss)toast(\"巨兽赏金 · 金币 +220\");\n}", "P11 kill gold");

/* P12：击杀回复合并装备吸血（setKillHeal 字段移除） */
rep("G.hp=Math.min(G.maxHp,G.hp+1.5+runBuild.killHeal+(runBuild.setKillHeal||0)+(isBoss?8:0));",
"G.hp=Math.min(G.maxHp,G.hp+1.5+runBuild.killHeal+(G.killHealEquip||0)+(isBoss?8:0));", "P12 kill heal");

/* P13：tickRunRewards → 被动金币收入 */
rep("function tickRunRewards(dt){if(runBuild.streakTimer>0){runBuild.streakTimer-=dt;if(runBuild.streakTimer<=0){runBuild.streak=0;renderRunBuildStrip();}}if(runBuild.tempTime>0){runBuild.tempTime-=dt;if(runBuild.tempTime<=0){runBuild.tempKind=null;runBuild.tempDamage=1;runBuild.tempMove=1;applyRunBuildToG(false);toast(\"临时遗物增益已消退\");}}}",
"function tickRunRewards(dt){if(runBuild.streakTimer>0){runBuild.streakTimer-=dt;if(runBuild.streakTimer<=0)runBuild.streak=0;}if(G&&G.state===S.PLAYING){const inc=2.2*dt;G.gold=(G.gold||0)+inc;G.goldEarned=(G.goldEarned||0)+inc;}}", "P13 passive income");

/* P14：中继站构筑 → 金币 */
rep("if(sig.build&&!runBuild.sigBuildUsed){runBuild.sigBuildUsed=true;showBuildChoice(\"中继站补给\");}",
"if(sig.build&&!runBuild.sigBuildUsed){runBuild.sigBuildUsed=true;grantGold(300,\"中继站补给\");}", "P14 sig build");

/* P15：精英舱文案 */
rep("toast(\"精英舱 · 强化敌群！清空目标有遗物赏\");",
"toast(\"精英舱 · 强化敌群！清空目标赏金币 +300\");", "P15 elite toast");

/* P16：NODE_EVENTS 增益选项 → 金币/消耗品 */
rep("{label:\"强行切开\",desc:\"获得随机遗物，损失 20% 生命\",apply:()=>{G.hp=Math.max(1,G.hp-Math.ceil((G.maxHp||HP_MAX)*.2));grantRandomRelic(\"货舱遗物\");}},",
"{label:\"强行切开\",desc:\"金币 +220，损失 20% 生命\",apply:()=>{G.hp=Math.max(1,G.hp-Math.ceil((G.maxHp||HP_MAX)*.2));grantGold(220,\"货舱补给\");}},", "P16 ev1");
rep("{label:\"以物易物\",desc:\"花 20 船币换随机遗物\",apply:()=>{if(meta.currency>=20){meta.currency-=20;saveMeta();grantRandomRelic(\"易得遗物\");}else toast(\"船币不足 · 拾荒者耸耸肩\");}},",
"{label:\"以物易物\",desc:\"花 20 船币换金币袋\",apply:()=>{if(meta.currency>=20){meta.currency-=20;saveMeta();grantGold(320,\"易得金币\");}else toast(\"船币不足 · 拾荒者耸耸肩\");}},", "P16 ev2");
rep("{label:\"收集营养液\",desc:\"生命上限 +8（本局）\",apply:()=>{G.maxHp=(G.maxHp||HP_MAX)+8;G.hp=Math.min(G.maxHp,G.hp+8);}},",
"{label:\"收集营养液\",desc:\"金币 +150，恢复 12 生命\",apply:()=>{grantGold(150,\"营养液变卖\");G.hp=Math.min(G.maxHp||HP_MAX,G.hp+12);}},", "P16 ev3");
rep("{label:\"采集导管液\",desc:\"护盾冷却 -15%（本局）\",apply:()=>{G.shieldCoolMul=(G.shieldCoolMul||1)*.85;}},",
"{label:\"采集导管液\",desc:\"弹药 +4，生命 -8\",apply:()=>{G.ammo=Math.min(AMMO_MAX,(G.ammo||0)+4);G.hp=Math.max(1,G.hp-8);}},", "P16 ev4");
rep("{label:\"解码坐标\",desc:\"立刻获得一次构筑三选一\",apply:()=>{closeNodePanel();showBuildChoice(\"幽灵信标\");}},",
"{label:\"解码坐标\",desc:\"出售情报：金币 +280\",apply:()=>{grantGold(280,\"情报赏金\");}},", "P16 ev5");
rep("{label:\"伸手接触\",desc:\"伤害 +15%，承伤 +10%（本局）\",apply:()=>{G.damageMul=(G.damageMul||1)*1.15;runBuild.damageTaken=(runBuild.damageTaken||1)*1.1;}},",
"{label:\"伸手接触\",desc:\"金币 +250，损失 10% 生命\",apply:()=>{G.hp=Math.max(1,G.hp-Math.ceil((G.maxHp||HP_MAX)*.1));grantGold(250,\"镜像馈赠\");}},", "P16 ev6");
rep("{label:\"关闭裂缝\",desc:\"护盾冷却 -10%（本局）\",apply:()=>{G.shieldCoolMul=(G.shieldCoolMul||1)*.9;}},",
"{label:\"关闭裂缝\",desc:\"立即获得 2.5 秒护幕\",apply:()=>{G.shield=Math.max(G.shield||0,2.5*(G.shieldDurationMul||1));}},", "P16 ev7");
rep("{label:\"汲取潮涌\",desc:\"武器冷却 -10%（本局），生命 -6\",apply:()=>{G.weaponCoolMul=(G.weaponCoolMul||1)*.9;G.hp=Math.max(1,G.hp-6);}},",
"{label:\"汲取潮涌\",desc:\"金币 +180，生命 -6\",apply:()=>{G.hp=Math.max(1,G.hp-6);grantGold(180,\"潮涌结晶\");}},", "P16 ev8");

/* P17：MERCHANT_WARES */
rep("{name:\"未知遗物\",desc:\"随机遗物一件\",cost:40,apply:()=>{if(!grantRandomRelic(\"商栈购得\"))toast(\"遗物已饱和 · 折算船币 +15\");}},",
"{name:\"深渊金币袋\",desc:\"金币 +320\",cost:40,apply:()=>{grantGold(320,\"商栈汇兑\");}},", "P17 m1");
rep("{name:\"构筑重扫\",desc:\"立刻获得一次三选一\",cost:25,apply:()=>{closeNodePanel();showBuildChoice(\"商栈构筑\");}},",
"{name:\"打捞情报\",desc:\"金币 +280\",cost:25,apply:()=>{grantGold(280,\"打捞情报\");}},", "P17 m2");

/* P18：closeNodePanel 去掉 reroll 引用 */
rep("  document.getElementById(\"buildOverlay\").classList.add(\"hidden\");\n  document.getElementById(\"rerollBuildBtn\").style.display=\"\";\n  if(G&&G.state===S.PAUSED){G.state=S.PLAYING;input.setEnabled(true);input.reset();}",
"  document.getElementById(\"buildOverlay\").classList.add(\"hidden\");\n  if(G&&G.state===S.PAUSED){G.state=S.PLAYING;input.setEnabled(true);input.reset();}", "P18 close panel");

/* P19：路线节点奖励 */
rep("function applySelectedRouteBonus(){if(runBuild.routeRewardClaimed)return;const node=selectedRouteNode();runBuild.routeRewardClaimed=true;if(node.kind===\"relic\")grantRandomRelic(\"下潜路线 · 遗物舱\");else if(node.kind===\"event\"){runBuild.rerolls++;showTransmission(\"路线收益\",\"未知事件航路 · 本局重扫描 +1\",2800);}else if(node.kind===\"elite\"){runBuild.rare+=.1;runBuild.damageTaken*=1.08;showTransmission(\"精英航路\",\"稀有掉落率 +10% · 承伤 +8%\",2800);}else if(node.kind===\"combat\"){runBuild.killHeal+=.5;runBuild.killOxy+=.5;}}",
"function applySelectedRouteBonus(){if(runBuild.routeRewardClaimed)return;const node=selectedRouteNode();runBuild.routeRewardClaimed=true;if(node.kind===\"relic\")grantGold(300,\"下潜路线 · 补给舱\");else if(node.kind===\"event\")grantGold(150,\"未知事件航路\");else if(node.kind===\"elite\")grantGold(200,\"精英航路\");else if(node.kind===\"combat\")grantGold(120,\"稳定航段\");}", "P19 route bonus");

/* P20：ROUTE_KIND 文案 */
rep("const ROUTE_KIND={combat:{icon:\"●\",label:\"战斗舱\",reward:\"稳定回收\"},merchant:{icon:\"◈\",label:\"星际商栈\",reward:\"船币消费\"},event:{icon:\"?\",label:\"未知事件\",reward:\"额外重扫描\"},relic:{icon:\"⬡\",label:\"遗物舱\",reward:\"开局获得遗物\"},elite:{icon:\"✦\",label:\"精英航路\",reward:\"高危高掉率\"},boss:{icon:\"◆\",label:\"巨兽关口\",reward:\"史诗遗物\"}};",
"const ROUTE_KIND={combat:{icon:\"●\",label:\"战斗舱\",reward:\"金币 +120\"},merchant:{icon:\"◈\",label:\"星际商栈\",reward:\"船币消费\"},event:{icon:\"?\",label:\"未知事件\",reward:\"金币 +150\"},relic:{icon:\"⬡\",label:\"补给舱\",reward:\"开局金币 +300\"},elite:{icon:\"✦\",label:\"精英航路\",reward:\"清空赏金 +300\"},boss:{icon:\"◆\",label:\"巨兽关口\",reward:\"巨额赏金\"}};", "P20 route kind");

/* P21：剧情事件（跨关）金币化 */
rep("if(value===\"relic\"){grantRandomRelic(\"事件回收\");runBuild.nextChoice=Math.max(1,runBuild.nextChoice-1);}else if(value===\"rush\"){runBuild.damage*=1.18;runBuild.damageTaken*=1.1;}else if(value===\"safe\"){G.hp=Math.min(G.maxHp,G.hp+G.maxHp*.3);G.oxygen=Math.min(G.maxOxygen,G.oxygen+G.maxOxygen*.3);}else if(value===\"trade\"){runBuild.rerolls++;}else if(value===\"refuse\"){grantCurrency(4,\"阿尔法拒绝\");}else if(value===\"red\"){runBuild.damage*=1.25;runBuild.oxygenMul*=.9;}else if(value===\"blue\"){runBuild.shieldCool*=.8;runBuild.secondWind=true;}applyRunBuildToG(false);}",
"if(value===\"relic\"){grantGold(250,\"事件回收\");}else if(value===\"rush\"){grantGold(200,\"突袭缴获\");G.ammo=Math.min(AMMO_MAX,(G.ammo||0)+4);}else if(value===\"safe\"){G.hp=Math.min(G.maxHp,G.hp+G.maxHp*.3);G.oxygen=Math.min(G.maxOxygen,G.oxygen+G.maxOxygen*.3);}else if(value===\"trade\"){grantGold(180,\"商路红利\");}else if(value===\"refuse\"){grantCurrency(4,\"阿尔法拒绝\");}else if(value===\"red\"){G.hp=Math.max(1,G.hp-Math.ceil((G.maxHp||HP_MAX)*.15));grantGold(300,\"危险航道\");}else if(value===\"blue\"){G.shield=Math.max(G.shield||0,3*(G.shieldDurationMul||1));}renderRunBuildStrip();", "P21 evV19");

rep("if(value===\"relic\"){grantRandomRelic(\"事件回收\");runBuild.nextChoice=Math.max(1,runBuild.nextChoice-1);}else if(value===\"risk\"){G.hp=Math.max(1,G.hp*.85);runBuild.damage*=1.18;}else if(value===\"rush\"){runBuild.damage*=1.18;runBuild.damageTaken*=1.1;}else if(value===\"safe\"){G.hp=Math.min(G.maxHp,G.hp+G.maxHp*.3);G.oxygen=Math.min(G.maxOxygen,G.oxygen+G.maxOxygen*.3);}else if(value===\"trade\"){runBuild.rerolls++;}else if(value===\"refuse\"){grantCurrency(4,\"阿尔法拒绝\");}else if(value===\"red\"){runBuild.damage*=1.25;runBuild.oxygenMul*=.9;applyRunBuildToG(false);}else if(value===\"blue\"){runBuild.shieldCool*=.8;runBuild.secondWind=true;}}",
"if(value===\"relic\"){grantGold(250,\"事件回收\");}else if(value===\"risk\"){G.hp=Math.max(1,G.hp*.85);grantGold(200,\"涉险而过\");}else if(value===\"rush\"){grantGold(200,\"突袭缴获\");G.ammo=Math.min(AMMO_MAX,(G.ammo||0)+4);}else if(value===\"safe\"){G.hp=Math.min(G.maxHp,G.hp+G.maxHp*.3);G.oxygen=Math.min(G.maxOxygen,G.oxygen+G.maxOxygen*.3);}else if(value===\"trade\"){grantGold(180,\"商路红利\");}else if(value===\"refuse\"){grantCurrency(4,\"阿尔法拒绝\");}else if(value===\"red\"){G.hp=Math.max(1,G.hp-Math.ceil((G.maxHp||HP_MAX)*.15));grantGold(300,\"危险航道\");}else if(value===\"blue\"){G.shield=Math.max(G.shield||0,3*(G.shieldDurationMul||1));}}", "P21 ev");

/* P22：精英清算 → 金币 */
rep("if(G.winOpen&&runBuild.routeElitePending){runBuild.routeElitePending=false;const r=grantRandomRelic(\"精英战利品\");toast(r?(\"精英战利品 · \"+r.name):\"精英战利品 · 折算船币\");grantCurrency(20,\"精英清算\");}",
"if(G.winOpen&&runBuild.routeElitePending){runBuild.routeElitePending=false;grantGold(300,\"精英战利品\");}", "P22 elite clear");

/* P23：无尽波次奖励 → 金币 */
rep("if(!runBuild.pending&&G.state===S.PLAYING)showBuildChoice(\"第 \"+wave+\" 波奖励\");",
"grantGold(150,\"第 \"+wave+\" 波奖励\");", "P23 wave gold");

/* P24：无尽开场文案 */
rep("\"清场即可构筑 · 每五波巨兽里程碑\"", "\"清场即得金币奖励 · 每五波巨兽里程碑\"", "P24 endless text");

/* P25：结算统计行 */
rep("\"<br>局内构筑 <b>\"+runBuild.picks+\"</b> 次　·　遗物 <b>\"+(runBuild.relics||[]).length+\"</b> 件　·　最高连杀 <b>\"+meta.bestStreak+\"</b>　·　永久船币 <b>\"+meta.currency+\"</b>\"+",
"\"<br>金币收入 <b>\"+Math.round(G.goldEarned||0)+\"</b>　·　装备 <b>\"+((G.equip||[]).length)+\"</b> 件　·　最高连杀 <b>\"+meta.bestStreak+\"</b>　·　永久船币 <b>\"+meta.currency+\"</b>\"+", "P25 setOver");

/* P26：重生文案 */
rep("保留全部局内构筑，清空敌方弹幕", "保留全部装备与金币，清空敌方弹幕", "P26 respawn");

/* P27：B 键开关装备库 */
rep("if(e.code===\"KeyV\"&&G&&G.state===S.PLAYING&&!e.repeat)toggleCam();",
"if(e.code===\"KeyV\"&&G&&G.state===S.PLAYING&&!e.repeat)toggleCam();\n  if(e.code===\"KeyB\"&&G&&!e.repeat&&G.state!==S.OVER)toggleEquipShop();", "P27 keyB");

/* P28：QA 遗物接口 → 金币接口 */
rep("qaGrantRelic:qaEnabled?(rarity)=>{const relic=grantRandomRelic(\"QA\",rarity);return {relic:relic&&relic.id,state:globalThis.__D3D.get()};}:undefined,",
"qaGrantGold:qaEnabled?(n)=>{grantGold(n||500,\"QA\");return {gold:G&&G.gold,state:globalThis.__D3D.get()};}:undefined,", "P28 qa");

/* P29：三选一面板 HTML 重 titling + 移除 reroll 按钮 */
rep("<div class=\"panel\"><h1 id=\"buildTitle\">战术构筑 · 三选一</h1><div class=\"sub\" id=\"buildSub\">击杀经验已完成一次适应性重构</div><div class=\"build-grid\" id=\"buildChoices\"></div><button class=\"btn sec\" id=\"rerollBuildBtn\">重新扫描</button></div>",
"<div class=\"panel\"><h1 id=\"buildTitle\">航路节点</h1><div class=\"sub\" id=\"buildSub\"></div><div class=\"build-grid\" id=\"buildChoices\"></div><button class=\"btn\" id=\"shopCloseBtn\">返回战场（B）</button></div>", "P29 panel");

/* P30：面板关闭按钮 */
rep("document.getElementById(\"rerollBuildBtn\").addEventListener(\"click\",()=>{if(runBuild.rerolls<=0)return;runBuild.rerolls--;renderBuildChoices();});",
"document.getElementById(\"shopCloseBtn\").addEventListener(\"click\",()=>closeNodePanel());", "P30 close btn");

/* P31：遗物展示元素移除 */
rep("<div id=\"relicReveal\" role=\"status\" aria-live=\"polite\"><b id=\"relicRevealName\">遗物已回收</b><em id=\"relicRevealTier\">普通遗物</em><span id=\"relicRevealDesc\"></span></div>\n", "", "P31 relic element");
rep("#relicReveal{position:fixed;left:50%;top:88px;z-index:48;width:min(420px,88vw);padding:12px 16px;border:1px solid rgba(255,214,107,.72);border-radius:12px;background:linear-gradient(145deg,rgba(32,28,18,.96),rgba(7,13,20,.96));color:#dcece7;text-align:left;box-shadow:0 14px 40px rgba(0,0,0,.5),0 0 28px rgba(255,214,107,.16);transform:translate(-50%,-18px);opacity:0;pointer-events:none;transition:.22s}#relicReveal.show{transform:translate(-50%,0);opacity:1}#relicReveal b{display:block;color:#ffd66b;font-size:14px;letter-spacing:.08em}#relicReveal em{display:block;margin:3px 0;color:#b99d5f;font:normal 9px ui-monospace,Consolas,monospace}#relicReveal span{font-size:11px;color:#9fb3ad}\n", "", "P31 relic css");

/* P32：HUD 金币显示 */
rep("<div class=\"box right\"><div class=\"lbl\">分数</div><div class=\"score\" id=\"scoreVal\">0</div></div>",
"<div class=\"box right\"><div class=\"lbl\">分数</div><div class=\"score\" id=\"scoreVal\">0</div><div class=\"lbl\" style=\"margin-top:4px\">金币</div><div class=\"score\" id=\"goldVal\" style=\"font-size:15px;color:var(--gold)\">0</div></div>", "P32 hud gold");
rep("    _setTxt(\"scoreVal\", G.score);",
"    _setTxt(\"scoreVal\", G.score);\n    _setTxt(\"goldVal\", Math.floor(G.gold||0));", "P32 hud loop");

/* P33：触屏商店按钮 */
rep("<button type=\"button\" id=\"btnCam\" class=\"tbtn\" aria-label=\"切换视角\">视角</button>",
"<button type=\"button\" id=\"btnCam\" class=\"tbtn\" aria-label=\"切换视角\">视角</button>\n  <button type=\"button\" id=\"btnShop\" class=\"tbtn\" aria-label=\"装备库\">店</button>", "P33 btn html");
rep("#btnCam{right:calc(10px + env(safe-area-inset-right));top:calc(168px + env(safe-area-inset-top));width:46px;height:46px;font-size:11px;}",
"#btnCam{right:calc(10px + env(safe-area-inset-right));top:calc(168px + env(safe-area-inset-top));width:46px;height:46px;font-size:11px;}\n  #btnShop{right:calc(10px + env(safe-area-inset-right));top:calc(220px + env(safe-area-inset-top));width:46px;height:46px;font-size:15px;}", "P33 btn css");
rep("(function(){\n  const camBtn=document.getElementById(\"btnCam\");\n  if(camBtn)camBtn.addEventListener(\"pointerdown\",e=>{e.preventDefault();try{initAudio();}catch(err){}if(G&&G.state===S.PLAYING)toggleCam();});\n})();",
"(function(){\n  const camBtn=document.getElementById(\"btnCam\");\n  if(camBtn)camBtn.addEventListener(\"pointerdown\",e=>{e.preventDefault();try{initAudio();}catch(err){}if(G&&G.state===S.PLAYING)toggleCam();});\n  const shopBtn=document.getElementById(\"btnShop\");\n  if(shopBtn)shopBtn.addEventListener(\"pointerdown\",e=>{e.preventDefault();try{initAudio();}catch(err){}if(G&&!G.storyPause)toggleEquipShop();});\n})();", "P33 btn wire");

/* P34：菜单文案 */
rep("<span>⬡ 遗物</span>", "<span>⬡ 补给</span>", "P34 legend");
rep("1/2/3 切换武器。<br>", "1/2/3 切换武器 · <b>B 装备库</b>（金币购买/出售装备，击杀与补给获得金币）。<br>", "P34 howto");
rep("<div class=\"version-note\">v26 · 五部 100 关（船 / 髓星 / 首领的椅子 / 荒凉 / 建造者）· 反物质喷口 / 液氢寒潮 / 建造者光束 / 大船援助 · 二十五潜层航路 · 真 HDR 后处理 · 第三人称 · 攀爬系统</div>",
"<div class=\"version-note\">v27 · 局内经济装备系统（金币 · 六槽装备库 · B 键商店）· 五部 100 关 · 各部专属机制 · 真 HDR 后处理 · 第三人称 · 攀爬系统</div>", "P34 version");

/* P35：节点注释头 */
rep("   ✦ 精英舱：敌群强化 1.6×，清空目标奖励遗物 + 20 船币",
"   ✦ 精英舱：敌群强化 1.6×，清空目标赏金币 +300", "P35 comment");

fs.writeFileSync(F, html);
console.log("applied:", applied);
if (failed.length) { console.log("FAILED:"); failed.forEach(f => console.log("  " + f)); process.exit(1); }
console.log("all patches applied");
