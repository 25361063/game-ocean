// v43 立体机动专项校验：支撑面查询/高度感知碰撞/下潜/立体弹道/怪物对空/地图立体化
const fs = require("fs");
let bad = 0;
function need(cond, msg) { if (!cond) { bad++; console.log("FAIL " + msg); } }
function chk(file, tag, probes) {
  const s = fs.readFileSync(file, "utf8");
  for (const p of probes) need(s.includes(p), tag + " 缺少: " + p.slice(0, 60));
}
const BOTH = [
  // 核心：高度感知碰撞
  "function resolveCollision(px, pz, pr, py)",
  "if(feet >= o.top - .25) return true;",
  "if(o.base !== undefined && py + .6 <= o.base) return true;",
  // 台地
  "G.plateaus", "const pls = (G && G.plateaus) || null;",
  "function initPlateaus()",
  // 支撑面查询 + 上步 + 下潜
  "function querySupport(x, z, feet, onGround)",
  "v43 自动上步", "act.sink", "keys[\"KeyX\"]", "touchSinkHeld", "btnSink",
  // 地图立体化
  "function buildVerticality()", "buildVerticality();", "海蚀柱", "悬空浮台", "阶梯神龛", "货箱堆", "沉船龙骨", "制高点补给箱",
  "vertAnims.push({kind:\"bob\"", "function tickVerticality(", "tickVerticality(dt);",
  // 怪物对空 + 立体弹道
  "function tickMonsterLeap(", "tickMonsterLeap(m,dt,px,pz,events,", "m.airY||0",
  "vy:dy2/nd3*spit.speed", "p.y += (p.vy||0)*dt", "Math.abs((player.y-.9)-p.y)<1.35",
  "b.aaCd", "p.y > o.top+.35",
  // 冲刺保留高度 + 复活落支撑面
  "player.y=Math.max(player.y,terrainHeight(player.x,player.z)+1.7);",
  "querySupport(player.x,player.z,player.y-1.7,true)+1.7;",
  // 岩石顶面
  "o.top=o.y+o.r*.62;",
  // v41 跳劈去重后只剩一份（计数=1）
];
for (const f of ["潮声之下_深渊潜航3D_v22.html", "潮声之下_深渊潜航3D_手机版.html"]) {
  chk(f, f, BOTH);
  const s = fs.readFileSync(f, "utf8");
  const n = s.split("m.jumpSlam=true;return;").length - 1;
  need(n === 1, f + " v41 跳劈块应只剩 1 份，实际 " + n);
}
console.log(bad === 0 ? "v43 立体机动校验全部通过（双版本）" : "共 " + bad + " 处 FAIL");
process.exit(bad === 0 ? 0 : 1);
