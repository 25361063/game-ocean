// 剧情校验：抽取蓝图数组 + 剧情装配段，实跑验证 STORY_CHAPTERS 完整性
const fs = require("fs");
const html = fs.readFileSync(process.argv[2], "utf8");
let pre = "";
for (const n of ["PART_ONE_STAGE_BLUEPRINTS","PART_TWO_STAGE_BLUEPRINTS","PART_THREE_STAGE_BLUEPRINTS","PART_FOUR_STAGE_BLUEPRINTS","PART_FIVE_STAGE_BLUEPRINTS"]) {
  const m = html.match(new RegExp("const " + n + "=\\[[\\s\\S]*?\\n\\];"));
  if (!m) { console.error(n + " not found"); process.exit(2); }
  pre += m[0] + "\n";
}
const tail = "STORY_CHAPTERS.splice(STORY_CHAPTERS.length,0,...PART_THREE_STORY,...PART_FOUR_STORY,...PART_FIVE_STORY);";
const s = html.indexOf("const RUN_MODES=");
const e = html.indexOf(tail);
if (s < 0 || e < 0) { console.error("story region not found"); process.exit(2); }
const box = {};
new Function(pre + html.slice(s, e + tail.length) +
  ";this.__S=STORY_CHAPTERS.length;this.__bad=STORY_CHAPTERS.filter((c,i)=>!c.name||!c.summary||!c.bossDown||!c.intro||c.id!==i+1).length;" +
  "this.__titles={};STORY_CHAPTERS.forEach(c=>{const k=c.title.split(' / ')[0];this.__titles[k]=(this.__titles[k]||0)+1;});").call(box);
console.log("STORY_CHAPTERS = " + box.__S + "，异常条目 = " + box.__bad);
for (const [k, v] of Object.entries(box.__titles)) console.log("  " + k + " × " + v);
process.exit(box.__S === 100 && box.__bad === 0 ? 0 : 1);
