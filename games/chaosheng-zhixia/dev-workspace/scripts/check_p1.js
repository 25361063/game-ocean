// v30 第一期专项校验：6 元素/新反应/声波扩散/护盾闸门/注入器/下落/连击
const fs = require("fs");
const html = fs.readFileSync(process.argv[2], "utf8");
let bad = 0;
function need(cond, msg) { if (!cond) { bad++; console.log("FAIL " + msg); } }

/* 元素块实跑（logic 段抽取 + 桩） */
const s = html.indexOf("const ELEM_OF_WEAPON="), e = html.indexOf("function bossRadialBurst");
need(s > 0 && e > s, "元素块存在");
const stub = `
  const damageAmount=(x)=>Math.round(x);
  const noteKill=()=>{};
  const applyPoiseHit=()=>false;
  const G={damageMul:1,reactionCount:0,monsters:[],boss:null,time:0,cool:{1:0,2:0,3:0,4:0}};
`;
const box = {};
new Function(stub + html.slice(s, e) + ";this.__x={ELEM_INFO,REACTION_TABLE,applyElementHit,shieldGate,SHIELD_COUNTER,ELEM_OF_WEAPON,G};").call(box);
const { ELEM_INFO, REACTION_TABLE, applyElementHit, shieldGate, SHIELD_COUNTER } = box.__x;

need(Object.keys(ELEM_INFO).length === 6, "6 系元素（实际 " + Object.keys(ELEM_INFO).length + "）");
need(Object.keys(REACTION_TABLE).length === 7, "7 条反应（实际 " + Object.keys(REACTION_TABLE).length + "）");

/* 凝冻：潮附着 → 霜命中 */
const m1 = { x: 0, z: 0, hp: 100, cd: 0, aura: null };
const hits1 = [];
applyElementHit(m1, "tide", hits1);
applyElementHit(m1, "frost", hits1);
need(m1.cd >= 1.5, "凝冻定身 1.5s");
need(hits1.some(h => h.type === "reaction" && h.kind === "freeze"), "凝冻反应触发");

/* 碎晶：震附着 → 霜命中 */
const m2 = { x: 0, z: 0, hp: 100, cd: 0, aura: null, poise: { max: 10, cur: 0 } };
const hits2 = [];
applyElementHit(m2, "quake", hits2);
applyElementHit(m2, "frost", hits2);
need(hits2.some(h => h.type === "reaction" && h.kind === "shattergem"), "碎晶反应触发");

/* 感电：潮附着 → 雷命中，链到 6 米内另一敌人 */
const ma = { x: 0, z: 0, hp: 100, cd: 0, aura: null };
const mb = { x: 3, z: 0, hp: 100, cd: 0, aura: null };
box.__x.G.monsters = [ma, mb];
const hits3 = [];
applyElementHit(ma, "tide", hits3);
applyElementHit(ma, "volto", hits3);
need(hits3.some(h => h.type === "reaction" && h.kind === "conduct"), "感电反应触发");
need(mb.hp < 100, "感电链伤命中邻近敌人");

/* 扩散：潮附着 → 声命中，5 米内敌人获得潮附着 */
const mc = { x: 0, z: 0, hp: 100, cd: 0, aura: null };
const md = { x: 4, z: 0, hp: 100, cd: 0, aura: null };
box.__x.G.monsters = [mc, md];
const hits4 = [];
applyElementHit(mc, "tide", hits4);
applyElementHit(mc, "sonic", hits4);
need(hits4.some(h => h.type === "reaction" && h.kind === "diffuse"), "扩散反应触发");
need(md.aura && md.aura.e === "tide", "扩散传播潮附着");

/* 护盾闸门：霜盾 + 震攻击 = 克制 ×3；霜打霜 ×0.5；生命伤害完全格挡 */
const ms1 = { x: 0, z: 0, hp: 100, eshield: { elem: "frost", hp: 300, max: 300 } };
const r1 = shieldGate(ms1, 100, "quake");
need(r1.hp === 0 && r1.sh === 300 && r1.brk === true, "克制元素 ×3 一次破盾且不扣血");
const ms2 = { x: 0, z: 0, hp: 100, eshield: { elem: "frost", hp: 300, max: 300 } };
const r2 = shieldGate(ms2, 100, "frost");
need(r2.sh === 50, "同元素 ×0.5（实际 " + r2.sh + "）");
const r3 = shieldGate(ms2, 100, "tide");
need(r3.sh === 100, "非克制 ×1");
need(SHIELD_COUNTER.frost === "quake" && SHIELD_COUNTER.volto === "tide", "克制表映射");

/* 注入器 / 连击 / 下落（文本级） */
for (const id of ["injTide", "injFrost", "injVolto", "injSonic"]) need(html.includes('id:"' + id + '"'), "注入器装备 " + id);
need(html.includes("const hitElem=injected||altElem||undefined;"), "注入器优先级高于阴阳弹匣");
need(html.includes("G.meleeCombo=(G.meleeCombo+1)%3"), "近战三段连击");
need(html.includes("G.plungeArm=true;player.vy=-16;"), "下落攻击起跳");
need(html.includes("G.plungeArm=false;"), "下落落地爆发");
need(html.includes('bossShieldWrap'), "巨兽盾条 UI");
need((html.match(/shieldGate\(m,dealt/g) || []).length >= 4, "怪物伤害闸门 ≥4 处");
need((html.match(/shieldGate\(G\.boss,dealt/g) || []).length >= 4, "巨兽伤害闸门 ≥4 处");

console.log(bad ? bad + " 项失败" : "第一期（元素 6 系/护盾/注入器/下落/连击）校验全部通过");
process.exit(bad ? 1 : 0);
