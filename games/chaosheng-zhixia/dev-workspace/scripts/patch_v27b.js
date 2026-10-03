// v27b 补丁：修复 3 处残留
const fs = require("fs");
const F = "潮声之下_深渊潜航3D_v22.html";
let html = fs.readFileSync(F, "utf8");
let applied = 0, failed = [];
function rep(find, replace, tag) {
  const n = html.split(find).length - 1;
  if (n !== 1) { failed.push(tag + " (出现 " + n + " 次)"); return; }
  html = html.replace(find, replace); applied++;
}
rep('{label:"采集导管液",desc:"护盾冷却 -15%（本局）",apply:()=>{G.shieldCoolMul=(G.shieldCoolMul||1)*.85;}}]},',
    '{label:"采集导管液",desc:"弹药 +4，生命 -8",apply:()=>{G.ammo=Math.min(AMMO_MAX,(G.ammo||0)+4);G.hp=Math.max(1,G.hp-8);}}]},', "ev4");
rep('{label:"关闭裂缝",desc:"护盾冷却 -10%（本局）",apply:()=>{G.shieldCoolMul=(G.shieldCoolMul||1)*.9;}}]},',
    '{label:"关闭裂缝",desc:"立即获得 2.5 秒护幕",apply:()=>{G.shield=Math.max(G.shield||0,2.5*(G.shieldDurationMul||1));}}]},', "ev7");
rep('  fill(grid);\n  document.getElementById("rerollBuildBtn").style.display="none";\n', '  fill(grid);\n', "openNodePanel reroll ref");
fs.writeFileSync(F, html);
console.log("applied:", applied);
if (failed.length) { console.log("FAILED:"); failed.forEach(f => console.log("  " + f)); process.exit(1); }
console.log("all fixed");
