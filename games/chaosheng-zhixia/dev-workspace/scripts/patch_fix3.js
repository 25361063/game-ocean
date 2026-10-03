// v33b 补丁：obst 关卡崩溃修复（rebuildObstacles 桥接）+ 武器动画残留引用清理
const fs = require("fs");
const F = process.argv[2] === "mobile" ? "潮声之下_深渊潜航3D_手机版.html" : "潮声之下_深渊潜航3D_v22.html";
let html = fs.readFileSync(F, "utf8");
let applied = 0, failed = [];
function rep(find, replace, tag) {
  const n = html.split(find).length - 1;
  if (n !== 1) { failed.push(tag + " (出现 " + n + " 次)"); return; }
  html = html.replace(find, replace); applied++;
}

/* F1：桥接 rebuildObstacles（v24.20 obst 特征分支引用了从未定义的函数——obst 关卡加载即崩） */
rep(`/* v23.2：顶点扰动巨岩（三套共享变体；确定性位移，重合顶点同步形变不破面） */`,
`rebuildObstacles = buildObstacles;   // v33b 桥接：applyLevelSignature 的 obst 关卡在场景建成后重建障碍网格
/* v23.2：顶点扰动巨岩（三套共享变体；确定性位移，重合顶点同步形变不破面） */`, "F1 bridge");

/* F2：M2 重构后残留的 echoRingA/B 动画引用 → 移除 */
rep(`    echoRingA.rotation.z+=dt*1.1;echoRingB.rotation.z-=dt*.8;`,
`    /* v33b：echoRingA/B 已随武器模型 v2 移除 */`, "F2 echo ref");

fs.writeFileSync(F, html);
console.log(F, "applied:", applied);
if (failed.length) { console.log("FAILED:"); failed.forEach(f => console.log("  " + f)); }
