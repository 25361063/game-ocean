// 经济装备模块单测：从 HTML 抽取 EQUIPMENT/applyEquipStats 实跑验证数值叠加与系数还原
const fs = require("fs");
const html = fs.readFileSync(process.argv[2], "utf8");
const s = html.indexOf("const EQUIP_SLOTS=6;");
const e = html.indexOf("function toggleEquipShop(){");
if (s < 0 || e < 0) { console.error("econ region not found"); process.exit(2); }
const code = html.slice(s, e);
const box = {};
const stubs = `
  const DIVER_ROLES={explorer:{damageMul:1,maxHp:70,moveMul:1,weaponCoolMul:1,overdriveDurationMul:1,shieldDurationMul:1,shieldCoolMul:1,dashCoolMul:1}};
  const storyRun={order:0,echo:0};const meta={upgrades:{hull:0,lungs:0}};
  let G=null;
`;
new Function(stubs + code + `;this.__x={EQUIPMENT,applyEquipStats,getG:()=>G,setG:v=>G=v};`).call(box);
const { EQUIPMENT, applyEquipStats } = box.__x;
let bad = 0;
function expect(name, got, want) {
  const ok = Math.abs(got - want) < 1e-6;
  if (!ok) { bad++; console.log("FAIL " + name + ": got " + got + " want " + want); }
}
const g = { roleId: "explorer", critBase: .12, equip: [] };
applyEquipStats(g);
expect("基础 damageMul", g.damageMul, 1);
expect("基础 maxHp", g.maxHp, 70);
expect("基础 crit", g.critBonus, .12);
g.equip = ["dagger", "turbo", "leech"];
applyEquipStats(g);
expect("三件套 damageMul", g.damageMul, 1 + .08 + .16);
expect("击杀吸血", g.killHealEquip, 4);
g.equip = ["spear", "coil", "aegis"];
applyEquipStats(g);
expect("长枪 damageMul", g.damageMul, 1 + .24);
expect("冷却叠乘", g.weaponCoolMul, .90 * .92);
expect("护幕冷却", g.shieldCoolMul, .75);
expect("护幕持续", g.shieldDurationMul, 1.35);
g.equip = ["ring", "turbo", "turbo", "desoEye", "heavyarmor", "proto"];
applyEquipStats(g);
expect("贪婪金币系数", g.goldMul, 1.25);
expect("重复购买 damageMul", g.damageMul, 1 + .16 * 2 + .20 + .15);
expect("六槽 maxHp", g.maxHp, 70 + 55 + 30);
expect("原型机超频", g.overdriveDurationMul, 1.3);
console.log("装备条目数 = " + EQUIPMENT.length + "（期望 36）");
if (EQUIPMENT.length !== 36) bad++;
console.log(bad ? bad + " 项失败" : "经济装备数值校验全部通过");
process.exit(bad ? 1 : 0);
