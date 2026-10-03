const fs = require("fs"), vm = require("vm");
for (const F of ["潮声之下_深渊潜航3D_v22.html", "潮声之下_深渊潜航3D_手机版.html"]) {
  const html = fs.readFileSync(F, "utf8");
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  blocks.forEach((code, bi) => {
    try { new vm.Script(code, { filename: `b${bi + 1}` }); }
    catch (e) {
      console.log(F, "block", bi + 1, "FAIL:", e.message);
      // 用二分法找有问题的行
      const lines = code.split("\n");
      // 先找所有 let/const 声明的变量名，检测重复
      const decls = {};
      for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(/^\s*(?:let|const)\s+(\w+)/);
        if (m) {
          if (decls[m[1]] !== undefined) {
            console.log(`  DUP ${m[1]}: lines ${decls[m[1]] + 1} and ${i + 1}`);
          } else decls[m[1]] = i;
        }
      }
    }
  });
}
