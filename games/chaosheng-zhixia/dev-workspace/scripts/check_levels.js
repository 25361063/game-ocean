// 功能校验：从 HTML 中提取 LEVELS 组装代码实际执行，验证 1-40 关数据完整性
const fs = require("fs");
const html = fs.readFileSync(process.argv[2], "utf8");
const start = html.indexOf("const LEVELS = [");
const lastSplice = html.lastIndexOf("LEVELS.splice(");
const end = html.indexOf(";", lastSplice) + 1;
if (start < 0 || !lastSplice) { console.error("region not found"); process.exit(2); }
let code = html.slice(start, end);
code = code.replace(/^const LEVELS = /, "var LEVELS = "); // 允许后续 splice 重赋长度
const box = {};
new Function(code + ";this.__L=LEVELS;").call(box);
const L = box.__L;
console.log("LEVELS.length = " + L.length);
const kinds = ["collect", "survive", "elite", "scan", "hybrid", "defend", "gauntlet", "kill"];
const bossTypes = ["reefCrab", "kelpLeviathan", "abyssJelly", "voidWhale", "hand", "handX"];
let bad = 0;
const names = new Set();
for (let i = 0; i < L.length; i++) {
  const lv = L[i], errs = [];
  if (lv.id !== i + 1) errs.push("id 不连续: " + lv.id);
  if (!lv.name) errs.push("无名");
  if (names.has(lv.name)) errs.push("关名重复");
  names.add(lv.name);
  const o = lv.objective || {};
  if (!kinds.includes(o.kind)) errs.push("objective.kind 非法: " + o.kind);
  if (o.kind === "kill" && o.n > lv.monsters.length) errs.push("kill n(" + o.n + ") > 怪物数(" + lv.monsters.length + ")");
  if (o.kind === "hybrid" && o.kills > lv.monsters.length) errs.push("hybrid kills(" + o.kills + ") > 怪物数(" + lv.monsters.length + ")");
  if (o.kind === "scan" && !(o.points && o.points.length)) errs.push("scan 无点位");
  if (o.kind === "collect" && o.n > (lv.sampleSpots || []).length) errs.push("collect n > 样本点数");
  if (lv.boss && !bossTypes.includes(lv.boss)) errs.push("boss 类型非法: " + lv.boss);
  if (!lv.beat) errs.push("缺 beat 文案");
  if (!(lv.scoreCap > 0)) errs.push("scoreCap 非法");
  if (errs.length) { bad++; console.log("L" + (i + 1) + " [" + lv.name + "] " + errs.join(" · ")); }
}
const bosses = L.filter(v => v.boss).map(v => "L" + v.id + ":" + v.boss).join(" ");
const byKind = {};
for (const v of L) byKind[v.objective.kind] = (byKind[v.objective.kind] || 0) + 1;
console.log("BOSS 关: " + bosses);
console.log("目标分布: " + JSON.stringify(byKind));
console.log("scoreCap: L1=" + L[0].scoreCap + " L20=" + L[19].scoreCap + " L21=" + L[20].scoreCap + " L40=" + L[39].scoreCap);
console.log("怪物数: L21=" + L[20].monsters.length + " L40=" + L[39].monsters.length);
console.log(bad ? bad + " 关有问题" : "全部 " + L.length + " 关数据校验通过");
process.exit(bad ? 1 : 0);
