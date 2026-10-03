// 检查：每关裂口位置与固体碰撞体的最小距离（v33 穿模修复是否堵死裂口）
const fs = require("fs");
const html = fs.readFileSync(process.argv[2] || "潮声之下_深渊潜航3D_v22.html", "utf8");
const start = html.indexOf("const LEVELS = [");
const lastSplice = html.lastIndexOf("LEVELS.splice(");
const end = html.indexOf(";", lastSplice) + 1;
let code = html.slice(start, end).replace(/^const LEVELS = /, "var LEVELS = ");
const box = {};
new Function(code + ";this.__L=LEVELS;").call(box);
const L = box.__L;
console.log("levels:", L.length);
const LM_X = [-22, 23, -20, 22, 0];
let blocked = 0, tight = 0;
for (let i = 0; i < L.length; i++) {
  const lv = L[i], g = lv.gatePos;
  const solids = [];
  // 地标
  solids.push({ x: LM_X[(i) % 5], z: -38, r: 2.8, k: "landmark" });
  // 兴趣点：宝箱×2 / 信标×3（奇数关）/ 裂缝（Lv>=5，无实体）
  for (let j = 0; j < 2; j++) { const a = i * 2.6 + j * 3.3, r = 20 + (j % 2) * 9; solids.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, r: .9, k: "chest" }); }
  if ((i + 1) % 2 === 1) for (let j = 0; j < 3; j++) { const a = i * 1.4 + j * 2.1, r = 15 + (j % 3) * 8; solids.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, r: .55, k: "beacon" }); }
  let min = 1e9, mk = "";
  for (const s of solids) { const d = Math.hypot(s.x - g.x, s.z - g.z) - s.r; if (d < min) { min = d; mk = s.k; } }
  // 玩家被推出到 r+0.55；进门判定需 dist<3 → 若 min < 3.55 则裂口不可达
  if (min < 3.0) { blocked++; console.log("BLOCKED L" + (i + 1) + " gate(" + g.x + "," + g.z + ") solid=" + mk + " 余量=" + min.toFixed(2)); }
  else if (min < 3.55) { tight++; console.log("TIGHT   L" + (i + 1) + " gate(" + g.x + "," + g.z + ") solid=" + mk + " 余量=" + min.toFixed(2)); }
}
console.log("完全堵死:", blocked, "  勉强可进:", tight);
