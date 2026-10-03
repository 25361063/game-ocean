// 修复 backgroundImage 冷却扇形行（两版文件 × 技能/攻击两处）
const fs = require("fs");
const SKILLS_LINE = String.raw`b.style.backgroundImage=ic?("url(\""+ic+"\")"+(pct>0?",conic-gradient(rgba(2,8,14,.82) "+pct+"%,rgba(0,0,0,0) 0)":"")):"";`;
const ATTACK_LINE = String.raw`btn.style.backgroundImage=ic?("url(\""+ic+"\")"+(pc>0?",conic-gradient(rgba(2,8,14,.82) "+pc+"%,rgba(0,0,0,0) 0)":"")):"";`;

// 先自证两行语法正确
new Function("const ic=1,pct=50,pc=50;let b={style:{}};" + SKILLS_LINE);
new Function("const ic=1,pc=50;let btn={style:{}};const G={cool:{}};const WEAPONS={1:{cool:.5}};let w=1;" + ATTACK_LINE);
console.log("目标行自检 OK");

for (const F of ["潮声之下_深渊潜航3D_v22.html", "潮声之下_深渊潜航3D_手机版.html"]) {
  let html = fs.readFileSync(F, "utf8");
  const lines = html.split("\n");
  let fixed = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("backgroundImage=ic?(")) {
      const isAttack = lines[i].includes("btn.style");
      const indent = lines[i].match(/^\s*/)[0];
      const rebuilt = indent + (isAttack ? ATTACK_LINE : SKILLS_LINE);
      try { new Function("const ic=1,pct=50,pc=50;let btn={style:{}},b={style:{}};const G={cool:{}};const WEAPONS={1:{cool:.5}};let w=1;" + rebuilt); }
      catch (e) { console.log(F, "line", i + 1, "重建仍失败:", e.message); continue; }
      lines[i] = rebuilt; fixed++;
    }
  }
  fs.writeFileSync(F, lines.join("\n"));
  console.log(F, "fixed lines:", fixed);
}
