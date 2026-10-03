// v28b 补丁：主页四页签 + 动效 + 装备配图 + 角色文案
const fs = require("fs");
const F = "潮声之下_深渊潜航3D_v22.html";
let html = fs.readFileSync(F, "utf8");
let applied = 0, failed = [];
function rep(find, replace, tag) {
  const n = html.split(find).length - 1;
  if (n !== 1) { failed.push(tag + " (出现 " + n + " 次)"); return; }
  html = html.replace(find, replace); applied++;
}

/* B1：页签 CSS */
rep(`  @keyframes waterSweep{from{transform:translate3d(-3%,-1%,0) rotate(-1deg)}to{transform:translate3d(4%,2%,0) rotate(1deg)}}`,
`  @keyframes waterSweep{from{transform:translate3d(-3%,-1%,0) rotate(-1deg)}to{transform:translate3d(4%,2%,0) rotate(1deg)}}
  /* v28 主页：页签 / 动效 / 装备配图 */
  #menuTabs{display:flex;gap:6px;margin:12px 0 2px;border-bottom:1px solid rgba(95,224,176,.18);}
  #menuTabs button{flex:1;position:relative;padding:9px 4px;border:0;background:transparent;color:#7f9a94;font-family:inherit;font-size:13px;letter-spacing:.2em;cursor:pointer;transition:color .2s;}
  #menuTabs button::after{content:"";position:absolute;left:16%;right:16%;bottom:-1px;height:2px;background:linear-gradient(90deg,transparent,var(--acc),transparent);transform:scaleX(0);transition:transform .25s;}
  #menuTabs button:hover{color:var(--acc);}
  #menuTabs button[aria-pressed="true"]{color:var(--acc2);text-shadow:0 0 12px rgba(95,224,176,.55);}
  #menuTabs button[aria-pressed="true"]::after{transform:scaleX(1);}
  .menuPane{display:none;animation:paneIn .35s ease;}
  .menuPane.show{display:block;}
  @keyframes paneIn{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:none;}}
  #menuFx{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:0;}
  .mBubble{position:absolute;bottom:-50px;border-radius:50%;background:radial-gradient(circle at 35% 30%,rgba(255,255,255,.4),rgba(95,224,176,.14) 55%,transparent 72%);animation:mRise linear infinite;pointer-events:none;}
  @keyframes mRise{from{transform:translateY(0);opacity:0;}12%{opacity:.85;}to{transform:translateY(-110vh);opacity:0;}}
  @keyframes titlePulse{0%,100%{text-shadow:0 0 22px rgba(95,224,176,.3);}50%{text-shadow:0 0 44px rgba(95,224,176,.7),0 0 90px rgba(95,224,176,.28);}}
  #menu .menu-title{animation:titlePulse 4.2s ease-in-out infinite;}
  .eqicon{width:34px;height:34px;border-radius:8px;margin-left:6px;box-shadow:0 0 10px rgba(0,0,0,.45);float:right;}
  .armory-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(215px,1fr));gap:8px;margin-top:8px;}
  .armory-item{display:flex;gap:9px;align-items:center;padding:8px;border:1px solid #22343f;border-radius:10px;background:linear-gradient(145deg,rgba(8,22,30,.88),rgba(5,11,19,.88));}
  .armory-item img{width:38px;height:38px;border-radius:8px;flex:0 0 auto;}
  .armory-item b{display:block;color:var(--acc2);font-size:12px;font-weight:400;}
  .armory-item small{display:block;color:#8fa7a1;font-size:10px;line-height:1.5;margin-top:2px;}
  .armory-item em{display:block;color:var(--gold);font-style:normal;font-size:9px;margin-top:2px;}
  .armory-item .uniq{color:#d47dff;}
  .skill-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:8px 0 12px;}
  .skill-card{padding:10px;border:1px solid #28424c;border-radius:10px;background:linear-gradient(145deg,rgba(8,24,33,.9),rgba(5,12,20,.9));}
  .skill-card b{display:block;color:var(--acc2);font-size:12px;font-weight:400;}
  .skill-card small{display:block;color:#8fa7a1;font-size:10px;line-height:1.55;margin-top:3px;}
  .skill-card em{display:block;color:var(--gold);font-style:normal;font-size:9px;margin-top:4px;}
  .pane-h{color:var(--acc2);font-size:13px;letter-spacing:.14em;font-weight:400;margin:10px 0 6px;}
  @media (max-width:760px){.skill-cards{grid-template-columns:1fr;}#archiveTabList{grid-template-columns:1fr 1fr!important;}}`, "B1 css");

/* B2：菜单 HTML —— 页签导航 + 出击 pane 包裹 */
rep(`一份署名首领船长的密令召集精英下潜——但这份命令是真的吗？</div>
    <div class="run-setup">`,
`一份署名首领船长的密令召集精英下潜——但这份命令是真的吗？</div>
    <nav id="menuTabs" role="tablist"><button type="button" data-pane="paneDeploy" aria-pressed="true">出 击</button><button type="button" data-pane="paneArmory" aria-pressed="false">军 备</button><button type="button" data-pane="paneBase" aria-pressed="false">基 地</button><button type="button" data-pane="paneArchive" aria-pressed="false">档 案</button></nav><div id="menuFx" aria-hidden="true"></div>
    <section id="paneDeploy" class="menuPane show">
    <div class="run-setup">`, "B2 tabs open");

rep(`<div id="saveDock" style="margin-top:8px;padding:7px 11px;border:1px solid #16202b;border-radius:9px;background:rgba(5,10,16,.55);font-size:11px;color:#7f9691;text-align:left;line-height:1.8"></div>`,
`<div id="saveDock" style="margin-top:8px;padding:7px 11px;border:1px solid #16202b;border-radius:9px;background:rgba(5,10,16,.55);font-size:11px;color:#7f9691;text-align:left;line-height:1.8"></div>
    </section>
    <section id="paneArmory" class="menuPane">
      <h2 class="pane-h">专属武器（每角色一把）</h2><div id="armoryWeapon" class="armory-grid"></div>
      <h2 class="pane-h">主动技能 · 战斗中按 F / R / C（或 1 / 2 / 3）施放</h2><div id="armorySkills" class="skill-cards"></div>
      <h2 class="pane-h">装备库图鉴 · 局内金币购买，含改变弹道/子弹的特殊装备</h2><div id="armoryEquip" class="armory-grid"></div>
    </section>
    <section id="paneBase" class="menuPane">
      <div id="baseCurrency" class="rest-meta" style="margin:10px 0">船币 0</div>
      <div id="baseGrid" class="rest-grid"></div>
      <h2 style="color:var(--gold);font-size:13px;font-weight:400;letter-spacing:.12em">成就</h2>
      <div id="baseAch" class="achievement-list"></div>
    </section>
    <section id="paneArchive" class="menuPane">
      <p style="color:#8fa7a1;font-size:11px;line-height:1.7;margin:10px 0">《星髓》五部主线 · 100 个战术节点：船 / 髓星 / 首领的椅子 / 荒凉 / 建造者。记忆碎片分“伪造档案”与“可验证证据”，逐层识破笛雾的操纵。</p>
      <div id="archiveTabList" style="max-height:280px;overflow:auto;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px"></div>
      <button class="btn sec" id="archiveTabOpen" style="margin-top:10px">打开完整世界档案</button>
    </section>`, "B2 panes");

/* B3：角色卡文案（远程/近战/范围） */
rep(`<strong>浣生 · 调查路线</strong><em>续航</em><small>外交与现场判断；125 氧气，证据补给更强。</small>`,
`<strong>浣生 · 调查路线</strong><em>远程</em><small>专属武器：磁轨脉冲（高速点射）。外交与现场判断；证据补给更强。</small>`, "B3 role1");
rep(`<strong>迈尔辛 · 工程路线</strong><em>防御</em><small>首席权限与结构学；90 生命，强化量子护盾。</small>`,
`<strong>迈尔辛 · 工程路线</strong><em>近战</em><small>专属武器：裂甲重锤（扇形近战）。首席权限与结构学，强化护幕与冲击。</small>`, "B3 role2");
rep(`<strong>帕米尔 · 突击路线</strong><em>火力</em><small>潜伏与破坏专家；伤害 +25%、移速 +15%。</small>`,
`<strong>帕米尔 · 突击路线</strong><em>范围</em><small>专属武器：榴弹回响（命中爆裂）。潜伏与破坏专家，伤害 +25%。</small>`, "B3 role3");

/* B4：装备配图（EQ_ICON + eqIconSrc）插在商店前 */
rep(`let shopGridEl=null;`,
`/* v28：装备配图（程序化 SVG data URI，离线可用） */
const EQ_ICON={
  dagger:["#0d2b33","#5fe0b0","<path d='M16 3 L20 14 L16 29 L12 14 Z'/>"],
  shell:["#0d2b33","#5fe0b0","<path d='M16 4 L27 9 V17 Q27 26 16 29 Q5 26 5 17 V9 Z'/>"],
  fins:["#0d2b33","#5fe0b0","<path d='M5 24 Q9 8 27 5 Q22 13 24 21 Q15 17 5 27 Z'/>"],
  coil:["#0d2b33","#5fe0b0","<circle cx='16' cy='16' r='9' fill='none' stroke='#5fe0b0' stroke-width='2.4'/><circle cx='16' cy='16' r='4' fill='none' stroke='#5fe0b0' stroke-width='2'/>"],
  turbo:["#12233d","#6fa8ff","<path d='M12 4 h8 v11 l-4 13 -4 -13 Z'/>"],
  hullplate:["#12233d","#6fa8ff","<path d='M16 4 L26 10 V22 L16 28 L6 22 V10 Z'/>"],
  leech:["#12233d","#6fa8ff","<path d='M16 4 Q25 15 16 28 Q7 15 16 4 Z'/><circle cx='16' cy='15' r='3' fill='#0a1526'/>"],
  lens:["#12233d","#6fa8ff","<circle cx='16' cy='16' r='8' fill='none' stroke='#6fa8ff' stroke-width='2.4'/><path d='M16 4 V11 M16 21 V28 M4 16 H11 M21 16 H28' stroke='#6fa8ff' stroke-width='2'/>"],
  ring:["#12233d","#6fa8ff","<circle cx='16' cy='16' r='9' fill='none' stroke='#6fa8ff' stroke-width='4'/>"],
  echoCore:["#12233d","#6fa8ff","<circle cx='16' cy='16' r='4' fill='#6fa8ff'/><circle cx='16' cy='16' r='8' fill='none' stroke='#6fa8ff' stroke-opacity='.6' stroke-width='1.6'/><circle cx='16' cy='16' r='12' fill='none' stroke='#6fa8ff' stroke-opacity='.3' stroke-width='1.2'/>"],
  cap:["#12233d","#6fa8ff","<path d='M18 3 L9 18 h6 L14 29 L24 13 h-7 Z'/>"],
  spear:["#2b1a10","#ffb66d","<path d='M4 28 L22 10 L27 5 L25 12 L8 30 Z'/><path d='M22 10 L27 5 L20 8 Z'/>"],
  heavyarmor:["#2b1a10","#ffb66d","<path d='M16 4 L27 9 V17 Q27 26 16 29 Q5 26 5 17 V9 Z'/><path d='M10 14 h12' stroke='#2b1a10' stroke-width='2'/>"],
  phase:["#2b1a10","#ffb66d","<path d='M14 6 L6 16 L14 26' fill='none' stroke='#ffb66d' stroke-width='3'/><path d='M23 6 L15 16 L23 26' fill='none' stroke='#ffb66d' stroke-width='3'/>"],
  wedge:["#2b1a10","#ffb66d","<path d='M16 4 L25 26 L7 26 Z'/><path d='M10 20 h12' stroke='#2b1a10' stroke-width='2'/>"],
  aegis:["#2b1a10","#ffb66d","<path d='M6 20 A10 10 0 0 1 26 20 Z'/><path d='M4 23 h24' stroke='#ffb66d' stroke-width='2.4'/>"],
  desoEye:["#2a0f1a","#ff617f","<path d='M4 16 Q16 5 28 16 Q16 27 4 16 Z'/><circle cx='16' cy='16' r='4' fill='#2a0f1a' stroke='#ff617f' stroke-width='2'/>"],
  proto:["#2a0f1a","#ff617f","<path d='M16 4 L26 10 V22 L16 28 L6 22 V10 Z' fill='none' stroke='#ff617f' stroke-width='2.4'/><circle cx='16' cy='16' r='4' fill='#ff617f'/>"],
  abyssDip:["#2a0f1a","#ff617f","<path d='M4 12 Q10 6 16 12 T28 12' fill='none' stroke='#ff617f' stroke-width='2.4'/><path d='M4 20 Q10 14 16 20 T28 20' fill='none' stroke='#ff617f' stroke-opacity='.6' stroke-width='2.4'/>"],
  splitMag:["#241333","#b48cff","<path d='M11 4 h6 v11 l-3 13 -3 -13 Z'/><path d='M20 8 h5 v8 l-2.5 10 L20 16 Z'/>"],
  pierceHead:["#241333","#b48cff","<path d='M4 14 h16 V8 l8 8 -8 8 v-6 H4 Z'/>"],
  hunterBuoy:["#241333","#b48cff","<circle cx='16' cy='19' r='7' fill='none' stroke='#b48cff' stroke-width='2.6'/><path d='M16 12 V4 M12 6 L16 3 L20 6' fill='none' stroke='#b48cff' stroke-width='2'/>"],
  yinYang:["#241333","#b48cff","<circle cx='16' cy='16' r='11' fill='none' stroke='#b48cff' stroke-width='2.4'/><path d='M16 5 a11 11 0 0 1 0 22 a5.5 5.5 0 0 1 0 -11 a5.5 5.5 0 0 0 0 -11 Z'/>"],
  shockHead:["#241333","#b48cff","<path d='M16 3 L19 12 L28 10 L21 17 L27 25 L17 21 L16 29 L15 21 L5 25 L11 17 L4 10 L13 12 Z'/>"]
};
function eqIconSrc(id){const e=EQ_ICON[id]||["#122333","#5fe0b0","<circle cx='16' cy='16' r='8' fill='#5fe0b0'/>"];
  return "data:image/svg+xml,"+encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='7' fill='"+e[0]+"'/><rect x='.5' y='.5' width='31' height='31' rx='6.5' fill='none' stroke='"+e[1]+"' stroke-opacity='.5'/><g>"+e[2]+"</g></svg>");}

let shopGridEl=null;`, "B4 icons");

/* B5：商店按钮/槽位加配图 */
rep(`    if(it){slot.innerHTML="<b></b><em></em>";slot.querySelector("b").textContent=it.name;slot.querySelector("em").textContent="出售 +"+Math.round(it.cost*.6)+" 金币";slot.addEventListener("click",()=>sellEquip(i));}`,
`    if(it){slot.innerHTML="<img class='eqicon' alt=''><b></b><em></em>";slot.querySelector("img").src=eqIconSrc(it.id);slot.querySelector("b").textContent=it.name;slot.querySelector("em").textContent="出售 +"+Math.round(it.cost*.6)+" 金币";slot.addEventListener("click",()=>sellEquip(i));}`, "B5 slot icon");
rep(`    b.innerHTML="<b></b><em></em><small></small>";
    b.querySelector("b").textContent=it.name;`,
`    b.innerHTML="<img class='eqicon' alt=''><b></b><em></em><small></small>";
    b.querySelector("img").src=eqIconSrc(it.id);
    b.querySelector("b").textContent=it.name;`, "B5 item icon");

/* B6：主页页签逻辑 + 军备/基地/档案页渲染 */
rep(`applyRoleVisual();`,
`/* v28 主页：页签切换 + 气泡特效 + 军备/基地/档案页 */
const ROLE_NAMES_MAP={explorer:"浣生 · 远程",guardian:"迈尔辛 · 近战",hunter:"帕米尔 · 范围伤害"};
const ROLE_WEAPON_DESC={
  explorer:"远程点射 · 弹速 34 · 射程 34 米（冷却 0.42s）；蓄力 = 强化磁轨弹（溅射）",
  guardian:"近战扇击 · 半径 3.4 米 · 120° 扇形（冷却 0.55s）；蓄力 = 崩地重斩（范围 ×1.35）",
  hunter:"范围榴弹 · 弹速 18 · 命中爆裂 2.8 米（冷却 0.9s）；蓄力 = 重型榴弹（爆裂 ×1.2）"};
function renderArmoryTab(){
  const rid=runSelection.roleId,w=WEAPONS[ROLE_WEAPON[rid]]||WEAPONS[1],list=ROLE_SKILLS[rid]||ROLE_SKILLS.explorer;
  const wEl=document.getElementById("armoryWeapon");
  if(wEl)wEl.innerHTML="<div class='armory-item'><img alt=''><div><b>"+w.name+" · 专属武器</b><em>"+(ROLE_NAMES_MAP[rid]||"")+"</em><small>"+(ROLE_WEAPON_DESC[rid]||"")+"</small></div></div>";
  if(wEl){const img=wEl.querySelector("img");if(img)img.src=eqIconSrc(rid==="guardian"?"wedge":(rid==="hunter"?"shockHead":"turbo"));}
  const sEl=document.getElementById("armorySkills");
  if(sEl)sEl.innerHTML=list.map((sk,i)=>"<div class='skill-card'><b>"+(i+1)+". "+sk.name+"</b><small>"+sk.desc+"</small><em>冷却 "+sk.cool+"s · F/R/C 键位第"+(i+1)+"位</em></div>").join("");
  const eEl=document.getElementById("armoryEquip");
  if(eEl)eEl.innerHTML=EQUIPMENT.slice().sort((a,b)=>a.cost-b.cost).map(it=>"<div class='armory-item'><img alt=''><div><b>"+it.name+(it.u?" <span class='uniq'>唯一</span>":"")+"</b><em>"+it.cost+" 金币</em><small>"+it.desc+"</small></div></div>").join("").replace(/<img alt=''>/g,m=>m);
  if(eEl){const imgs=eEl.querySelectorAll("img");const sorted=EQUIPMENT.slice().sort((a,b)=>a.cost-b.cost);imgs.forEach((im,i)=>{if(sorted[i])im.src=eqIconSrc(sorted[i].id);});}
}
function renderBaseTab(){
  const c=document.getElementById("baseCurrency");if(!c)return;
  c.textContent="船币 "+meta.currency+" · 总击杀 "+meta.totalKills+" · 最高连杀 "+meta.bestStreak;
  const grid=document.getElementById("baseGrid");grid.innerHTML="";
  for(const item of REST_ITEMS){
    const rank=item.unlock?(meta.unlocks[item.id]?1:0):(meta.upgrades[item.id]||0),done=item.unlock?!!meta.unlocks[item.id]:rank>=item.max,cost=item.cost(rank);
    const b=document.createElement("button");b.type="button";b.className="rest-item";b.disabled=done||meta.currency<cost;
    b.innerHTML="<b></b><em></em><small></small>";
    b.querySelector("b").textContent=item.name;
    b.querySelector("em").textContent=done?"已完成":item.tag+" · "+cost+" 船币";
    b.querySelector("small").textContent=item.desc(rank);
    b.addEventListener("click",()=>{buyRestItem(item);renderBaseTab();});
    grid.appendChild(b);
  }
  const ach=document.getElementById("baseAch");ach.innerHTML="";
  for(const [id,a] of Object.entries(ACHIEVEMENTS)){const d=document.createElement("div");d.className="achievement"+(meta.achievements[id]?" done":"");d.textContent=(meta.achievements[id]?"✓ ":"○ ")+a.name+" · "+a.desc+" · 奖励 "+a.reward;ach.appendChild(d);}
}
function renderArchiveTab(){
  const box=document.getElementById("archiveTabList");if(!box)return;
  box.innerHTML="";
  const parts=[["第一部 · 船",0],["第二部 · 髓星",20],["第三部 · 首领的椅子",40],["第四部 · 荒凉",60],["第五部 · 建造者",80]];
  for(const part of parts){
    const card=document.createElement("div");card.className="archive-chapter";
    const rows=STORY_CHAPTERS.slice(part[1],part[1]+20).map((c2,i)=>"<div style='color:#91aaa4;font-size:9px;line-height:1.7'>"+String(part[1]+i+1).padStart(2,"0")+" · "+c2.name+"</div>").join("");
    card.innerHTML="<b>"+part[0]+"</b>"+rows;
    box.appendChild(card);
  }
  const open=document.getElementById("archiveTabOpen");
  if(open&&!open.__wired){open.__wired=true;open.addEventListener("click",()=>{updateArchiveUI();document.getElementById("archiveOverlay").classList.remove("hidden");});}
}
(function(){
  const tabs=document.getElementById("menuTabs");if(!tabs)return;
  tabs.addEventListener("click",e=>{
    const b=e.target.closest("button[data-pane]");if(!b)return;
    for(const t of tabs.querySelectorAll("button"))t.setAttribute("aria-pressed",String(t===b));
    for(const p of document.querySelectorAll("#menu .menuPane"))p.classList.toggle("show",p.id===b.dataset.pane);
    if(b.dataset.pane==="paneArmory")renderArmoryTab();
    if(b.dataset.pane==="paneBase")renderBaseTab();
    if(b.dataset.pane==="paneArchive")renderArchiveTab();
    try{sound("pickup");}catch(err){}
  });
  const fx=document.getElementById("menuFx");
  if(fx)for(let i=0;i<14;i++){
    const b=document.createElement("div");b.className="mBubble";
    const sz=4+Math.random()*16;
    b.style.width=sz+"px";b.style.height=sz+"px";b.style.left=(Math.random()*100)+"%";
    b.style.animationDuration=(9+Math.random()*14)+"s";b.style.animationDelay=(-Math.random()*20)+"s";
    fx.appendChild(b);
  }
})();
applyRoleVisual();`, "B6 tabs js");

/* B7：换角色时刷新军备页 */
rep(`document.getElementById("rolePicker").addEventListener("click",e=>{const b=e.target.closest("[data-role]");if(!b)return;runSelection.roleId=b.dataset.role;persistRunSelection();renderRunSelectionUI();});`,
`document.getElementById("rolePicker").addEventListener("click",e=>{const b=e.target.closest("[data-role]");if(!b)return;runSelection.roleId=b.dataset.role;persistRunSelection();renderRunSelectionUI();if(document.getElementById("paneArmory")&&document.getElementById("paneArmory").classList.contains("show"))renderArmoryTab();});`, "B7 role refresh");

/* B8：操作说明 + 版本注记 */
rep(`1/2/3 切换武器 · <b>B 装备库</b>（金币购买/出售装备，击杀与补给获得金币）。<br>`,
`<b>1/2/3 或 F/R/C</b> 释放角色专属技能（每角色三个）· <b>B 装备库</b>（金币购买/出售装备：击杀、补给与被动收入获得金币；特殊装备可加弹道、贯穿、制导、变奏元素与爆裂弹头）。<br>`, "B8 howto");
rep(`<div class="version-note">v27 · 局内经济装备系统（金币 · 六槽装备库 · B 键商店）· 五部 100 关 · 各部专属机制 · 真 HDR 后处理 · 第三人称 · 攀爬系统</div>`,
`<div class="version-note">v28 · 角色专属武器与三主动技（远程/近战/范围）· 特效装备（多弹道/贯穿/制导/元素变奏/爆裂）· 多页主页 · 五部 100 关 · 真 HDR 后处理</div>`, "B8 version");

fs.writeFileSync(F, html);
console.log("applied:", applied);
if (failed.length) { console.log("FAILED:"); failed.forEach(f => console.log("  " + f)); }
