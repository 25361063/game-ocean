// v29b 修复：内层三元缺 else + S4/S6 锚点
const fs = require("fs");
const MOBILE = process.argv[2] === "mobile";
const F = MOBILE ? "潮声之下_深渊潜航3D_手机版.html" : "潮声之下_深渊潜航3D_v22.html";
let html = fs.readFileSync(F, "utf8");
let applied = 0, failed = [];
function repAll(find, replace, tag, min) {
  const n = html.split(find).length - 1;
  if (n < (min || 1)) { failed.push(tag + " (出现 " + n + " 次)"); return; }
  html = html.split(find).join(replace); applied++;
}
function rep(find, replace, tag) {
  const n = html.split(find).length - 1;
  if (n !== 1) { failed.push(tag + " (出现 " + n + " 次)"); return; }
  html = html.replace(find, replace); applied++;
}

/* F1：内层三元补 else（4 处：技能×1 + 攻击×1 = 每文件 2 处） */
repAll(`(pct>0?",conic-gradient(rgba(2,8,14,.82) "+pct+"%,rgba(0,0,0,0) 0)")`,
`(pct>0?",conic-gradient(rgba(2,8,14,.82) "+pct+"%,rgba(0,0,0,0) 0)":"")`, "F1 ternary", 2);

/* F2：S4 展开按钮文案（实际锚点） */
rep(`minimapToggle.textContent=minimapExpanded?"收起 · M":"展开 · M";`,
`minimapToggle.textContent=minimapExpanded?"收起":(input&&input.isTouch?"点按放大":"展开 · M");`, "F2 toggle");

/* F3：S6 图标（锚点改为 IIFE 内 shopBtn 行之前） */
rep(`  const shopBtn=document.getElementById("btnShop");`,
`/* v29 触屏按键图标贴图（圆形徽章 SVG data URI） */
const BTN_ICON={
  btnPulse:["#0d2b33","#7fffd4","<path d='M16 3 L20 12 L28 16 L20 20 L16 29 L12 20 L4 16 L12 12 Z'/>"],
  btnShield:["#0d2233","#6fa8ff","<path d='M16 4 L26 8 V17 Q26 25 16 28 Q6 25 6 17 V8 Z'/>"],
  btnOverdrive:["#2b2410","#ffd66b","<path d='M18 3 L9 18 h6 L14 29 L24 13 h-7 Z'/>"],
  btnWeapon:["#241333","#b48cff","<path d='M16 3 L19 12 L28 10 L21 17 L27 25 L17 21 L16 29 L15 21 L5 25 L11 17 L4 10 L13 12 Z'/>"],
  btnDash:["#0d2b33","#9fe8ff","<path d='M8 6 L16 16 L8 26' fill='none' stroke='#9fe8ff' stroke-width='3.4'/><path d='M17 6 L25 16 L17 26' fill='none' stroke='#9fe8ff' stroke-width='3.4'/>"],
  btnJump:["#0d2b33","#63e8cf","<path d='M16 4 L27 16 h-7 V28 h-8 V16 H5 Z'/>"],
  btnShop:["#2b2410","#d9c08a","<path d='M8 12 h16 l-2 16 H10 Z'/><path d='M12 12 V9 a4 4 0 0 1 8 0 v3' fill='none' stroke='#d9c08a' stroke-width='2.4'/>"],
  btnCam:["#122333","#8fa7a1","<rect x='4' y='10' width='17' height='13' rx='3'/><path d='M21 14 L28 10 V23 L21 19 Z'/>"]
};
function btnIconSrc(id){const e=BTN_ICON[id]||BTN_ICON.btnPulse;
  return "data:image/svg+xml,"+encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><circle cx='16' cy='16' r='15.4' fill='"+e[0]+"'/><circle cx='16' cy='16' r='14.6' fill='none' stroke='"+e[1]+"' stroke-opacity='.75' stroke-width='1.6'/><g>"+e[2]+"</g></svg>");}
(function(){for(const bid of ["btnPulse","btnShield","btnOverdrive","btnWeapon","btnDash","btnJump","btnShop","btnCam"]){const bel=document.getElementById(bid);if(bel)bel.dataset.bicon=btnIconSrc(bid);}})();
  const shopBtn=document.getElementById("btnShop");`, "F3 icons");

fs.writeFileSync(F, html);
console.log((MOBILE ? "mobile" : "desktop") + " applied:", applied);
if (failed.length) { console.log("FAILED:"); failed.forEach(f => console.log("  " + f)); }
