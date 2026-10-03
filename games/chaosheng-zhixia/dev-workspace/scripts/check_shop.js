// v37 合成/分类/推荐出装专项校验（实跑合成数学）
const fs = require("fs");
const html = fs.readFileSync(process.argv[2], "utf8");
let bad = 0;
function need(cond, msg) { if (!cond) { bad++; console.log("FAIL " + msg); } }

const s = html.indexOf("const EQUIP_SLOTS=6;"), e = html.indexOf("function applyRunProfile(g){");
need(s > 0 && e > s, "装备/合成块存在");
const stub = `
  const meta={characters:{},crystals:9999,relics:[],relicEquip:{},upgrades:{hull:0,lungs:0,salvage:0}};const RUN_MODES={campaign:{scoreMul:1}};const ROLE_WEAPON={explorer:1,guardian:4,hunter:3};const LEVELS=[];const levelSigFor=()=>({});
  const saveMeta=()=>{};const toast=()=>{};const sound=()=>{};const vibrate=()=>{};const mkEl=()=>({style:{},classList:{add:()=>{},remove:()=>{},toggle:()=>{}},querySelector:()=>({style:{},addEventListener:()=>{}}),querySelectorAll:()=>[],appendChild:()=>{},addEventListener:()=>{},setAttribute:()=>{}});const document={getElementById:()=>mkEl(),createElement:()=>mkEl()};
  const DIVER_ROLES={explorer:{shortName:"浣生",damageMul:1,maxHp:70,moveMul:1,weaponCoolMul:1,overdriveDurationMul:1,shieldDurationMul:1,shieldCoolMul:1,dashCoolMul:1}};
  const runSelection={roleId:"explorer"};
  const storyRun={order:0,echo:0};let G=null;
`;
const box = {};
new Function(stub + html.slice(s, e) + `
  ;this.__x={EQUIPMENT,EQUIP_CAT,EQUIP_FROM,REC_BUILDS,equipFromOwned,buyEquip,EQUIP_SLOTS,getG:()=>G,setG:v=>G=v};`).call(box);
const X = box.__x;
need(X.EQUIPMENT.length === 36, "36 件装备（实际 " + X.EQUIPMENT.length + "）");
need(Object.keys(X.EQUIP_CAT).length === 36, "全部分类（实际 " + Object.keys(X.EQUIP_CAT).length + "）");
need(Object.keys(X.EQUIP_FROM).length === 13, "13 条合成路线（实际 " + Object.keys(X.EQUIP_FROM).length + "）");
for (const [id, from] of Object.entries(X.EQUIP_FROM)) {
  for (const fid of from) need(!!X.EQUIPMENT.find(x => x.id === fid), "合成组件存在 " + id + "<-" + fid);
  const it = X.EQUIPMENT.find(x => x.id === id);
  const sum = from.reduce((a, fid) => a + (X.EQUIPMENT.find(x => x.id === fid) || { cost: 0 }).cost, 0);
  need(it && it.cost > sum, "合成有差价 " + id + "（" + it.cost + " > " + sum + "）");
}
for (const [rid, rec] of Object.entries(X.REC_BUILDS)) {
  need(rec.ids.length === 6, "推荐出装 6 件 " + rid);
  for (const fid of rec.ids) need(!!X.EQUIPMENT.find(x => x.id === fid), "推荐件存在 " + rid + "/" + fid);
}

/* 合成购买实跑：持有小件 → 购买大件 → 小件被消耗、只付差价 */
X.setG({ roleId: "explorer", gold: 200, equip: ["dagger", "grindstone"], critBase: .12, skillCd: [0, 0, 0], adrenalineT: 0, phaseT: 0, shieldCool: 0 });
const turbo = X.EQUIPMENT.find(x => x.id === "turbo");
X.buyEquip(turbo);
const g1 = X.getG();
need(g1.equip.indexOf("turbo") >= 0, "大件已入栏");
need(g1.equip.indexOf("dagger") < 0 && g1.equip.indexOf("grindstone") < 0, "小件已被消耗合成");
need(g1.gold === 200 - (900 - 750), "只付差价 150（实际花 " + (200 - g1.gold) + "）");
/* 二级合成：涡轮弹头+磨刃石 → 髓能谐振矛（缺磨刃石 → 只抵扣涡轮） */
X.setG(Object.assign(X.getG(),{gold:2000}));const g2before = 2000;
X.buyEquip(X.EQUIPMENT.find(x => x.id === "spear"));
const g2 = X.getG();
need(g2.equip.indexOf("spear") >= 0, "长枪合成入栏");
need(g2before - g2.gold === 1200, "缺件时不误抵扣（实付 1200）");
console.log(bad ? bad + " 项失败" : "合成体系（分类/路线/推荐/差价购买）校验全部通过");
process.exit(bad ? 1 : 0);
