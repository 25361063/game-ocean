// v32b：剩余氧气残留修正
const fs = require("fs");
for (const F of ["潮声之下_深渊潜航3D_v22.html", "潮声之下_深渊潜航3D_手机版.html"]) {
  let html = fs.readFileSync(F, "utf8");
  let n = 0;
  const rep = (f, r, tag) => {
    const c = html.split(f).length - 1;
    if (c !== 1) { console.log(F, tag, "count", c); return; }
    html = html.split(f).join(r); n++;
  };
  rep("G.oxygen=Math.min(G.maxOxygen,G.oxygen+1+runBuild.killOxy+(isBoss?8:0));", "", "kill oxy");
  rep("  const lowOxy = false;   // v24.3 氧气系统已移除（样本低氧加急浮动不再触发）\n", "", "lowOxy var");
  rep("  const freq = lowOxy ? 4 : 2;\n", "", "freq var");
  rep("G.time*freq", "G.time*2", "freq use");
  rep("oxygen:G?G.oxygen:0,maxOxygen:G?G.maxOxygen:0,", "", "qa get");
  rep("killOxy:0,", "", "killOxy field");
  rep("// CSD-H2：死因分支（§1.5）——hp → 生命归零 / oxygen → 氧气耗尽", "// CSD-H2：死因分支（§1.5）——hp → 生命归零", "death comment");
  rep("（v24.3 移除氧气部分）", "", "exec comment");
  fs.writeFileSync(F, html);
  console.log(F, "fixed:", n);
}
