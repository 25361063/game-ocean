// 语法校验：按 <script> 切分 HTML，node --check 等效编译每个块
const fs = require("fs");
const file = process.argv[2];
if (!file) { console.error("usage: node check_scripts.js <file.html>"); process.exit(2); }
const html = fs.readFileSync(file, "utf8");
const re = /<script>([\s\S]*?)<\/script>/g;
let m, i = 0, bad = 0;
while ((m = re.exec(html)) !== null) {
  i++;
  const code = m[1];
  try {
    new Function(code); // 仅编译，不执行 —— SyntaxError 即失败
    console.log("block " + i + " OK  (" + code.length + " chars)");
  } catch (e) {
    bad++;
    console.log("block " + i + " FAIL: " + e.message);
    const lines = code.split("\n");
    const ln = parseInt((e.message.match(/<anonymous>:(\d+)/) || [])[1] || "0", 10);
    if (ln) {
      console.log("  near line " + ln + ": " + (lines[ln - 2] || "").slice(0, 160));
      console.log("  >>> " + (lines[ln - 1] || "").slice(0, 160));
    }
  }
}
console.log(i + " blocks checked, " + bad + " failed");
process.exit(bad ? 1 : 0);
