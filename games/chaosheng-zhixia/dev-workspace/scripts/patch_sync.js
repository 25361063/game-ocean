// v29 补丁（桌面版 + 手机版同步）：小地图移左上缩小可点按放大 + 触屏按键图标贴图 + 冷却扇形带图标
const fs = require("fs");
const MOBILE = process.argv[2] === "mobile";
const F = MOBILE ? "潮声之下_深渊潜航3D_手机版.html" : "潮声之下_深渊潜航3D_v22.html";
let html = fs.readFileSync(F, "utf8");
let applied = 0, failed = [];
function rep(find, replace, tag) {
  const n = html.split(find).length - 1;
  if (n !== 1) { failed.push(tag + " (出现 " + n + " 次)"); return; }
  html = html.replace(find, replace); applied++;
}

/* S1：小地图 → 左上（桌面基准） */
rep(`  #minimapWrap{position:fixed;right:16px;top:92px;width:184px;z-index:7;`,
`  #minimapWrap{position:fixed;left:16px;top:66px;width:128px;z-index:7;`, "S1 map base");
rep(`  #minimapWrap.expanded{width:min(360px,42vw);border-color:rgba(127,255,212,.72);}`,
`  #minimapWrap.expanded{left:16px;width:min(330px,38vw);border-color:rgba(127,255,212,.72);}`, "S1 map expand");
/* S2：触屏覆盖（更小，更靠上避开顶部状态条） */
rep(`  html.is-touch #minimapWrap{right:66px;top:68px;width:116px;}
  html.is-touch #minimapWrap.expanded{right:66px;width:min(290px,48vw);}`,
`  html.is-touch #minimapWrap{left:10px;top:52px;width:100px;}
  html.is-touch #minimapWrap.expanded{left:10px;width:min(270px,46vw);}`, "S2 map touch");
/* S3：窄屏媒体查询 */
rep(`    #minimapWrap{right:12px;top:96px;width:132px;padding:6px}.minimap-head{font-size:8px;margin-bottom:4px}.minimap-legend{display:none}#minimapToggle{right:7px;bottom:7px}.minimap-north{top:25px}`,
`    #minimapWrap{left:10px;top:56px;width:100px;padding:5px}.minimap-head{font-size:8px;margin-bottom:4px}.minimap-legend{display:none}#minimapToggle{right:6px;bottom:6px}.minimap-north{top:22px}`, "S3 map 760");
rep(`    #minimapWrap,html.is-touch #minimapWrap{right:10px;top:174px;width:104px}#minimapWrap.expanded,html.is-touch #minimapWrap.expanded{right:10px;width:min(300px,76vw)}`,
`    #minimapWrap,html.is-touch #minimapWrap{left:10px;top:120px;width:92px}#minimapWrap.expanded,html.is-touch #minimapWrap.expanded{left:10px;width:min(270px,70vw)}`, "S3 map portrait");
/* S4：地图标题 + 展开按钮文案（触屏=点按放大） */
rep(`<div class="minimap-head"><b>大船战术图</b><span id="minimapLevel">L1 · 阿尔法海</span></div>`,
`<div class="minimap-head"><b>战术图</b><span id="minimapLevel">L1 · 阿尔法海</span></div>`, "S4 head");
rep(`setMinimapExpanded(!minimapExpanded);minimapToggle.textContent=minimapExpanded?"收起 · M":"展开 · M";`,
`setMinimapExpanded(!minimapExpanded);minimapToggle.textContent=minimapExpanded?"收起":(input&&input.isTouch?"点按放大":"展开 · M");`, "S4 toggle text");

/* S5：tbtn 底色改 background-color（避免图标层被简写覆盖）+ 文字投影 */
rep(`    border-radius:50%;border:1px solid rgba(95,224,176,.55);background:rgba(10,20,30,.55);color:var(--acc2);
    font-family:inherit;font-size:18px;user-select:none;-webkit-user-select:none;z-index:9;}
  .tbtn:active{transform:scale(.94);background:rgba(24,60,50,.85);}`,
`    border-radius:50%;border:1px solid rgba(95,224,176,.55);background-color:rgba(10,20,30,.55);color:var(--acc2);
    font-family:inherit;font-size:18px;user-select:none;-webkit-user-select:none;z-index:9;text-shadow:0 1px 3px rgba(0,0,0,.9);}
  .tbtn:active{transform:scale(.94);background-color:rgba(24,60,50,.85);}`, "S5 tbtn");

/* S6：按键图标贴图（程序化 SVG，圆形徽章） */
rep(`(function(){
  const shopBtn=document.getElementById("btnShop");`,
`/* v28m/v29：按键图标贴图（圆形徽章 SVG data URI） */
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
(function(){for(const id of ["btnPulse","btnShield","btnOverdrive","btnWeapon","btnDash","btnJump","btnShop","btnCam"]){const el=document.getElementById(id);if(el)el.dataset.bicon=btnIconSrc(id);}})();
(function(){
  const shopBtn=document.getElementById("btnShop");`, "S6 icons");

/* S7：按键文字清空（图标即按键；冷却数字保留） */
rep(`<button type="button" id="btnPulse" class="tbtn" aria-label="髓震脉冲">髓震</button>`,
`<button type="button" id="btnPulse" class="tbtn" aria-label="普攻"></button>`, "S7 pulse html");
rep(`<button type="button" id="btnJump" class="tbtn" aria-label="跳跃">跳</button>`,
`<button type="button" id="btnJump" class="tbtn" aria-label="跳跃"></button>`, "S7 jump html");
rep(`<button type="button" id="btnShop" class="tbtn" aria-label="装备库">店</button>`,
`<button type="button" id="btnShop" class="tbtn" aria-label="装备库"></button>`, "S7 shop html");
rep(`<button type="button" id="btnCam" class="tbtn" aria-label="切换视角">视角</button>`,
`<button type="button" id="btnCam" class="tbtn" aria-label="切换视角"></button>`, "S7 cam html");
rep(`  dashChip.classList.toggle("cooling",!ready);_setETxt(dashChip,ready?"闪":cd.toFixed(1));   // v23：值变化才写 DOM
  btnDash.classList.toggle("cooling",!ready);_setETxt(btnDash,ready?"闪":String(Math.ceil(cd)));`,
`  dashChip.classList.toggle("cooling",!ready);_setETxt(dashChip,ready?"闪":cd.toFixed(1));   // v23：值变化才写 DOM
  btnDash.classList.toggle("cooling",!ready);_setETxt(btnDash,ready?"":String(Math.ceil(cd)));   // v29 图标即按键`, "S7 dash text");
rep(`  const btn = _el("btnPulse");
  if(btn){
    _setETxt(btn, ui.glyph);`,
`  const btn = _el("btnPulse");
  if(btn){
    _setETxt(btn, "");`, "S7 pulse glyph");

/* S8：技能键冷却扫描（图标层 + 扇形） */
if (MOBILE) {
  rep(`   const rid2=G.roleId||runSelection.roleId,skl=ROLE_SKILLS[rid2]||ROLE_SKILLS.explorer;
   for(let si4=0;si4<3;si4++){
     const b=_el(kb[si4]);if(!b)continue;
     const cd=(G.skillCd&&G.skillCd[si4]>0)?G.skillCd[si4]:0,full=(skl[si4]&&skl[si4].cool)||15;
     _setETxt(b,cd>0?String(Math.ceil(cd)):kl[si4]);
     const pct=cd>0?Math.min(100,Math.round(cd/full*100)):0;
     if(b.__cd!==pct){b.__cd=pct;b.style.background=pct>0?("conic-gradient(rgba(2,8,14,.8) "+pct+"%, rgba(16,34,44,.55) 0)"):"rgba(10,20,30,.55)";}
   }}`,
`   const rid2=G.roleId||runSelection.roleId,skl=ROLE_SKILLS[rid2]||ROLE_SKILLS.explorer;
   for(let si4=0;si4<3;si4++){
     const b=_el(kb[si4]);if(!b)continue;
     const cd=(G.skillCd&&G.skillCd[si4]>0)?G.skillCd[si4]:0,full=(skl[si4]&&skl[si4].cool)||15;
     _setETxt(b,cd>0?String(Math.ceil(cd)):"");
     const pct=cd>0?Math.min(100,Math.round(cd/full*100)):0;
     if(b.__cd!==pct){b.__cd=pct;const ic=b.dataset.bicon;
       b.style.backgroundImage=ic?("url(\\""+ic+"\\")"+(pct>0?",conic-gradient(rgba(2,8,14,.82) "+pct+"%,rgba(0,0,0,0) 0)"):"");
       b.style.backgroundSize=ic?"62% 62%,100% 100%":"";
       b.style.backgroundPosition="center,center";b.style.backgroundRepeat="no-repeat,no-repeat";}
   }}`, "S8 skills mobile");
  rep(`    const pc=(G&&G.cool[w]>0)?Math.min(100,Math.round(G.cool[w]/((WEAPONS[w]&&WEAPONS[w].cool)||.5)*100)):0;   // v28m 冷却扇形
    if(btn.__cd!==pc){btn.__cd=pc;btn.style.background=pc>0?("conic-gradient(rgba(2,8,14,.8) "+pc+"%, rgba(16,34,44,.55) 0)"):"rgba(10,20,30,.55)";}`,
`    const pc=(G&&G.cool[w]>0)?Math.min(100,Math.round(G.cool[w]/((WEAPONS[w]&&WEAPONS[w].cool)||.5)*100)):0;   // v28m/v29 冷却扇形+图标
    if(btn.__cd!==pc){btn.__cd=pc;const ic=btn.dataset.bicon;
      btn.style.backgroundImage=ic?("url(\\""+ic+"\\")"+(pc>0?",conic-gradient(rgba(2,8,14,.82) "+pc+"%,rgba(0,0,0,0) 0)"):"");
      btn.style.backgroundSize=ic?"62% 62%,100% 100%":"";
      btn.style.backgroundPosition="center,center";btn.style.backgroundRepeat="no-repeat,no-repeat";}`, "S8 attack mobile");
} else {
  rep(`  {const kb=["btnShield","btnOverdrive","btnWeapon"],kl=["技1","技2","技3"];
   for(let si4=0;si4<3;si4++){const b=_el(kb[si4]);if(!b)continue;const cd=(G.skillCd&&G.skillCd[si4]>0)?Math.ceil(G.skillCd[si4]):0;_setETxt(b,cd>0?String(cd):kl[si4]);}}`,
`  {const kb=["btnShield","btnOverdrive","btnWeapon"];
   const rid2=G.roleId||runSelection.roleId,skl=ROLE_SKILLS[rid2]||ROLE_SKILLS.explorer;
   for(let si4=0;si4<3;si4++){
     const b=_el(kb[si4]);if(!b)continue;
     const cd=(G.skillCd&&G.skillCd[si4]>0)?G.skillCd[si4]:0,full=(skl[si4]&&skl[si4].cool)||15;
     _setETxt(b,cd>0?String(Math.ceil(cd)):"");
     const pct=cd>0?Math.min(100,Math.round(cd/full*100)):0;
     if(b.__cd!==pct){b.__cd=pct;const ic=b.dataset.bicon;
       b.style.backgroundImage=ic?("url(\\""+ic+"\\")"+(pct>0?",conic-gradient(rgba(2,8,14,.82) "+pct+"%,rgba(0,0,0,0) 0)"):"");
       b.style.backgroundSize=ic?"62% 62%,100% 100%":"";
       b.style.backgroundPosition="center,center";b.style.backgroundRepeat="no-repeat,no-repeat";}
   }}`, "S8 skills desktop");
  rep(`    _setEStyle(btn,"opacity",(G && G.cool[w] > 0) ? "0.45" : "1");   // 冷却置灰（沿用 UX §4 冷却指示）
  }`,
`    _setEStyle(btn,"opacity",(G && G.cool[w] > 0) ? "0.45" : "1");   // 冷却置灰（沿用 UX §4 冷却指示）
    const pc=(G&&G.cool[w]>0)?Math.min(100,Math.round(G.cool[w]/((WEAPONS[w]&&WEAPONS[w].cool)||.5)*100)):0;   // v29 冷却扇形+图标
    if(btn.__cd!==pc){btn.__cd=pc;const ic=btn.dataset.bicon;
      btn.style.backgroundImage=ic?("url(\\""+ic+"\\")"+(pc>0?",conic-gradient(rgba(2,8,14,.82) "+pc+"%,rgba(0,0,0,0) 0)"):"");
      btn.style.backgroundSize=ic?"62% 62%,100% 100%":"";
      btn.style.backgroundPosition="center,center";btn.style.backgroundRepeat="no-repeat,no-repeat";}
  }`, "S8 attack desktop");
}

fs.writeFileSync(F, html);
console.log((MOBILE ? "mobile" : "desktop") + " applied:", applied);
if (failed.length) { console.log("FAILED:"); failed.forEach(f => console.log("  " + f)); }
