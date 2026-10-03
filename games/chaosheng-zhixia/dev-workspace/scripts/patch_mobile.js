// 手机版补丁：王者荣耀式键位 + 自动普攻 + 移动端性能特调（只改 手机版.html）
const fs = require("fs");
const F = "潮声之下_深渊潜航3D_手机版.html";
let html = fs.readFileSync(F, "utf8");
let applied = 0, failed = [];
function rep(find, replace, tag) {
  const n = html.split(find).length - 1;
  if (n !== 1) { failed.push(tag + " (出现 " + n + " 次)"); return; }
  html = html.replace(find, replace); applied++;
}

/* M1：标题与版本 */
rep("<title>潮声之下 · 深渊遗物航路 v28</title>", "<title>潮声之下 · 手机版 v28m</title>", "M1 title");
rep(`<div class="version-note">v28 · 角色专属武器与三主动技（远程/近战/范围）· 特效装备（多弹道/贯穿/制导/元素变奏/爆裂）· 多页主页 · 五部 100 关 · 真 HDR 后处理</div>`,
`<div class="version-note">v28m · 手机特别版 · 王者荣耀式键位（左摇杆 · 右大攻击键 + 扇形三技 + 闪现）· 自动普攻 · 触屏性能降档 · 五部 100 关</div>`, "M1 version");

/* M2：触屏一律降档 */
rep(`const lowQ=(isSoftRenderer(renderer)||constrainedDevice)&&location.search.indexOf("hq=1")<0;   // 软渲染/受限移动设备自动降档；hq=1 可强制高画质`,
`const lowQ=(isSoftRenderer(renderer)||constrainedDevice||coarsePointer)&&location.search.indexOf("hq=1")<0;   // v28m 手机版：触屏设备一律降档（hq=1 可强制高画质）`, "M2 lowQ");

/* M3：辉光默认关闭（触屏） */
rep(`        bloomStrength: (settings.bloomStrength !== undefined) ? settings.bloomStrength : 0.55,   // v24.16 默认降档`,
`        bloomStrength: (settings.bloomStrength !== undefined) ? settings.bloomStrength : (((window.matchMedia&&matchMedia("(pointer:coarse)").matches)?0:0.55)),   // v28m 手机版默认关闭辉光`, "M3 bloom meta");
rep(`  postCompMat.uniforms.uStrength.value=(settings.bloomStrength!==undefined)?settings.bloomStrength:.55;   // v24.16 默认降档去炫光`,
`  postCompMat.uniforms.uStrength.value=(settings.bloomStrength!==undefined)?settings.bloomStrength:(coarsePointer?0:.55);   // v24.16/v28m 手机版默认关辉光`, "M3 bloom apply");
rep(`    if(settings.bloomStrength===undefined)settings.bloomStrength=.55;`,
`    if(settings.bloomStrength===undefined)settings.bloomStrength=coarsePointer?0:.55;
    if(coarsePointer&&settings.bloomStrength===.55)settings.bloomStrength=0;   // v28m 旧档迁移`, "M3 bloom load");

/* M4：粒子减量 */
rep(`function burstParticle(x,y,z,color,n){
  particleColorTmp.setHex(Number(color)||0xffffff);`,
`function burstParticle(x,y,z,color,n){
  if(coarsePointer)n=Math.ceil(n*.55);   // v28m 手机版：粒子减量
  particleColorTmp.setHex(Number(color)||0xffffff);`, "M4 particles");

/* M5：王者荣耀式键位 CSS */
rep(`  #btnPulse{right:calc(12px + env(safe-area-inset-right));bottom:calc(12px + env(safe-area-inset-bottom));width:64px;height:64px;font-size:22px;}`,
`  /* v28m 王者荣耀式键位：右下大攻击键 + 扇形三技 + 闪现 */
  #btnPulse{right:calc(24px + env(safe-area-inset-right));bottom:calc(30px + env(safe-area-inset-bottom));width:84px;height:84px;font-size:24px;border-width:2px;}`, "M5 pulse");
rep(`  #btnJump{right:calc(80px + env(safe-area-inset-right));bottom:calc(80px + env(safe-area-inset-bottom));width:52px;height:52px;font-size:18px;}`,
`  #btnJump{right:calc(136px + env(safe-area-inset-right));bottom:calc(30px + env(safe-area-inset-bottom));width:54px;height:54px;font-size:18px;}`, "M5 jump");
rep(`  #btnDash{right:calc(146px + env(safe-area-inset-right));bottom:calc(140px + env(safe-area-inset-bottom));width:50px;height:50px;font-size:16px;}`,
`  #btnDash{right:calc(38px + env(safe-area-inset-right));bottom:calc(196px + env(safe-area-inset-bottom));width:52px;height:52px;font-size:14px;}`, "M5 dash");
rep(`  #btnWeapon{right:calc(150px + env(safe-area-inset-right));bottom:calc(72px + env(safe-area-inset-bottom));width:48px;height:48px;font-size:20px;}`,
`  #btnWeapon{right:calc(106px + env(safe-area-inset-right));bottom:calc(182px + env(safe-area-inset-bottom));width:66px;height:66px;font-size:15px;}`, "M5 skill3");
rep(`  #btnShield{right:calc(10px + env(safe-area-inset-right));top:calc(64px + env(safe-area-inset-top));width:46px;height:46px;font-size:13px;}`,
`  #btnShield{right:calc(226px + env(safe-area-inset-right));bottom:calc(40px + env(safe-area-inset-bottom));width:56px;height:56px;font-size:13px;}`, "M5 skill1");
rep(`  #btnOverdrive{right:calc(10px + env(safe-area-inset-right));top:calc(116px + env(safe-area-inset-top));width:46px;height:46px;font-size:13px;}`,
`  #btnOverdrive{right:calc(186px + env(safe-area-inset-right));bottom:calc(126px + env(safe-area-inset-bottom));width:56px;height:56px;font-size:13px;}`, "M5 skill2");
rep(`  #btnCam{right:calc(10px + env(safe-area-inset-right));top:calc(168px + env(safe-area-inset-top));width:46px;height:46px;font-size:11px;}`,
`  #btnCam{right:calc(16px + env(safe-area-inset-right));bottom:calc(196px + env(safe-area-inset-bottom));width:44px;height:44px;font-size:11px;}`, "M5 cam");
rep(`  #btnShop{right:calc(10px + env(safe-area-inset-right));top:calc(220px + env(safe-area-inset-top));width:46px;height:46px;font-size:15px;}`,
`  #btnShop{right:calc(18px + env(safe-area-inset-right));bottom:calc(128px + env(safe-area-inset-bottom));width:48px;height:48px;font-size:14px;}
  #btnAuto{right:calc(16px + env(safe-area-inset-right));top:calc(64px + env(safe-area-inset-top));width:46px;height:46px;font-size:13px;}
  #btnAuto.on{border-color:var(--acc2);color:var(--acc2);box-shadow:0 0 12px rgba(95,224,176,.5);}
  #rotateHint{display:none;position:fixed;inset:0;z-index:60;background:rgba(2,6,10,.94);color:var(--acc2);align-items:center;justify-content:center;letter-spacing:.3em;font-size:15px;text-align:center;}
  @media (orientation:portrait) and (pointer:coarse){#rotateHint{display:flex;}}`, "M5 shop/auto/rotate");

/* M6：自动普攻按钮 HTML */
rep(`  <button type="button" id="btnShop" class="tbtn" aria-label="装备库">店</button>`,
`  <button type="button" id="btnShop" class="tbtn" aria-label="装备库">店</button>
  <button type="button" id="btnAuto" class="tbtn on" aria-label="自动普攻">自动</button>
  <div id="rotateHint">请横屏游玩<br><span style="font-size:10px;color:#5e736c;letter-spacing:.15em">王者荣耀式键位 · 左手移动 / 右手技能</span></div>`, "M6 auto html");

/* M7：自动普攻逻辑 + 施放入口 */
rep(`    if(act.pulse) fireFromCamera();`,
`    if(act.pulse||autoFireTarget()) fireFromCamera();   // v28m 自动普攻`, "M7 loop");
rep(`function fireFromCamera(){`,
`/* v28m 自动普攻：冷却就绪且前方 26 米内 28° 有目标 → 自动开火（王者荣耀式） */
function autoFireTarget(){
  if(!G||G.state!==S.PLAYING||G.autoFire===false)return false;
  if(G.cool&&G.cool[G.weapon]>0)return false;
  const dir=new THREE.Vector3();camera.getWorldDirection(dir);
  const yaw=Math.atan2(dir.x||.001,dir.z||.001);
  let best=false;
  for(const m of G.monsters){
    if(m.hp<=0)continue;
    const d=Math.hypot(m.x-player.x,m.z-player.z);
    if(d>26)continue;
    let ad=Math.atan2(m.x-player.x,m.z-player.z)-yaw;
    while(ad>Math.PI)ad-=2*Math.PI;while(ad<-Math.PI)ad+=2*Math.PI;
    if(Math.abs(ad)<.5){best=true;break;}
  }
  if(!best&&G.boss&&G.boss.hp>0&&Math.hypot(G.boss.x-player.x,G.boss.z-player.z)<28)best=true;
  return best;
}
(function(){
  const ab=document.getElementById("btnAuto");if(!ab)return;
  ab.addEventListener("pointerdown",e=>{
    e.preventDefault();initAudio();
    if(!G)return;
    G.autoFire=(G.autoFire===false);
    ab.classList.toggle("on",G.autoFire!==false);
    toast(G.autoFire!==false?"自动普攻 开":"自动普攻 关");
  });
})();
function fireFromCamera(){`, "M7 autofire");

/* M8：技能键冷却扇形（conic-gradient 扫描） */
rep(`  {const kb=["btnShield","btnOverdrive","btnWeapon"],kl=["技1","技2","技3"];
   for(let si4=0;si4<3;si4++){const b=_el(kb[si4]);if(!b)continue;const cd=(G.skillCd&&G.skillCd[si4]>0)?Math.ceil(G.skillCd[si4]):0;_setETxt(b,cd>0?String(cd):kl[si4]);}}`,
`  {const kb=["btnShield","btnOverdrive","btnWeapon"],kl=["技1","技2","技3"];
   const rid2=G.roleId||runSelection.roleId,skl=ROLE_SKILLS[rid2]||ROLE_SKILLS.explorer;
   for(let si4=0;si4<3;si4++){
     const b=_el(kb[si4]);if(!b)continue;
     const cd=(G.skillCd&&G.skillCd[si4]>0)?G.skillCd[si4]:0,full=(skl[si4]&&skl[si4].cool)||15;
     _setETxt(b,cd>0?String(Math.ceil(cd)):kl[si4]);
     const pct=cd>0?Math.min(100,Math.round(cd/full*100)):0;
     if(b.__cd!==pct){b.__cd=pct;b.style.background=pct>0?("conic-gradient(rgba(2,8,14,.8) "+pct+"%, rgba(16,34,44,.55) 0)"):"rgba(10,20,30,.55)";}
   }}`, "M8 skill sweep");

/* M9：攻击键冷却扇形 */
rep(`  const btn = _el("btnPulse");
  if(btn){
    _setETxt(btn, ui.glyph);
    _setEStyle(btn,"borderColor",ui.color);
    _setEStyle(btn,"color",ui.color);
    _setEStyle(btn,"opacity",(G && G.cool[w] > 0) ? "0.45" : "1");   // 冷却置灰（沿用 UX §4 冷却指示）
  }`,
`  const btn = _el("btnPulse");
  if(btn){
    _setETxt(btn, ui.glyph);
    _setEStyle(btn,"borderColor",ui.color);
    _setEStyle(btn,"color",ui.color);
    _setEStyle(btn,"opacity",(G && G.cool[w] > 0) ? "0.45" : "1");   // 冷却置灰（沿用 UX §4 冷却指示）
    const pc=(G&&G.cool[w]>0)?Math.min(100,Math.round(G.cool[w]/((WEAPONS[w]&&WEAPONS[w].cool)||.5)*100)):0;   // v28m 冷却扇形
    if(btn.__cd!==pc){btn.__cd=pc;btn.style.background=pc>0?("conic-gradient(rgba(2,8,14,.8) "+pc+"%, rgba(16,34,44,.55) 0)"):"rgba(10,20,30,.55)";}
  }`, "M9 attack sweep");

/* M10：触屏说明 */
rep(`<span>⬡ 补给</span>`, `<span>⬡ 补给</span>`, "M10 noop");

fs.writeFileSync(F, html);
console.log("applied:", applied);
if (failed.length) { console.log("FAILED:"); failed.forEach(f => console.log("  " + f)); }
