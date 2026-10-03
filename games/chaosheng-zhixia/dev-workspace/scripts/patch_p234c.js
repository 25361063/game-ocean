// v31c 补丁：主页集成（养成页签 + 面板 + 深井入口）
const fs = require("fs");
const F = process.argv[2] === "mobile" ? "潮声之下_深渊潜航3D_手机版.html" : "潮声之下_深渊潜航3D_v22.html";
let html = fs.readFileSync(F, "utf8");
let applied = 0, failed = [];
function rep(find, replace, tag) {
  const n = html.split(find).length - 1;
  if (n !== 1) { failed.push(tag + " (出现 " + n + " 次)"); return; }
  html = html.replace(find, replace); applied++;
}

/* C1：页签加"养成" */
rep(`<button type="button" data-pane="paneDeploy" aria-pressed="true">出 击</button><button type="button" data-pane="paneArmory" aria-pressed="false">军 备</button>`,
`<button type="button" data-pane="paneDeploy" aria-pressed="true">出 击</button><button type="button" data-pane="paneGrow" aria-pressed="false">养 成</button><button type="button" data-pane="paneArmory" aria-pressed="false">军 备</button>`, "C1 tab");

/* C2：养成面板（角色/突破/天赋/遗章） */
rep(`    </section>
    <section id="paneArmory" class="menuPane">`,
`    </section>
    <section id="paneGrow" class="menuPane">
      <h2 class="pane-h">角色养成 · 髓能结晶来自击杀、宝箱与深井</h2>
      <div id="growBody" class="armory-grid"></div>
      <button class="btn" id="growBreak" style="margin:8px 0">突破</button>
      <h2 class="pane-h">天赋强化 · 战斗中 F / R / C 技能随等级成长</h2>
      <div id="growTalents" class="skill-cards"></div>
      <h2 class="pane-h">深潜遗章 · 5 槽（回响深井与每日挑战掉落，点击装备）</h2>
      <div id="growRelics" class="armory-grid"></div>
    </section>
    <section id="paneArmory" class="menuPane">`, "C2 pane");

/* C3：页签路由加 paneGrow */
rep(`    if(b.dataset.pane==="paneArmory")renderArmoryTab();`,
`    if(b.dataset.pane==="paneGrow")renderGrowTab();
    if(b.dataset.pane==="paneArmory")renderArmoryTab();`, "C3 route");

/* C4：renderGrowTab（角色+突破+天赋+遗章） */
rep(`function renderBaseTab(){`,
`function renderGrowTab(){
  const ch=charState(runSelection.roleId),role=DIVER_ROLES[runSelection.roleId]||DIVER_ROLES.explorer;
  const el=document.getElementById("growBody");if(!el)return;
  const cap=ch.broken*20+20,need2=charExpNeed(ch.level);
  el.innerHTML="<div class='armory-item'><img alt=''><div><b>"+role.shortName+" · Lv"+ch.level+"</b><em>结晶 "+(meta.crystals||0)+" · 突破 "+ch.broken+"/2 · 等级上限 "+cap+"</em><small>经验 "+Math.min(ch.exp,need2)+"/"+need2+"（击杀与结算获取）</small></div></div>";
  const img=el.querySelector("img");if(img)img.src=eqIconSrc(runSelection.roleId==="guardian"?"wedge":(runSelection.roleId==="hunter"?"shockHead":"turbo"));
  const bt=document.getElementById("growBreak");
  if(bt){const btReady=ch.level>=cap&&ch.broken<2,btCost=[40,100,200][ch.broken]||200;
    bt.disabled=!(btReady&&(meta.crystals||0)>=btCost);
    bt.textContent=ch.broken>=2?"突破已完成（Lv60）":(btReady?"突破（结晶 ×"+btCost+"）":"升级到 Lv"+cap+" 后可突破");
    if(!bt.__wired){bt.__wired=true;bt.addEventListener("click",()=>{charBreakthrough();});}}
  const tl=document.getElementById("growTalents");
  if(tl){tl.innerHTML="";const list=ROLE_SKILLS[runSelection.roleId]||ROLE_SKILLS.explorer;
    list.forEach((sk,i)=>{
      const lv2=(ch.talents&&ch.talents[i])||1,cost=12*lv2;
      const card=document.createElement("div");card.className="skill-card";
      card.innerHTML="<b></b><small></small><em></em>";
      card.querySelector("b").textContent=(i+1)+". "+sk.name+" · Lv"+lv2;
      card.querySelector("small").textContent=sk.desc;
      card.querySelector("em").textContent="效果 +6%/级 · 冷却 -4%/级";
      const b2=document.createElement("button");b2.className="btn sec";b2.style.marginTop="6px";b2.style.padding="6px";b2.style.fontSize="11px";
      b2.textContent=lv2>=5?"已满级":"强化（结晶 ×"+cost+"）";b2.disabled=lv2>=5||(meta.crystals||0)<cost;
      b2.addEventListener("click",()=>talentUp(i));
      card.appendChild(b2);tl.appendChild(card);});}
  const rl=document.getElementById("growRelics");
  if(rl){rl.innerHTML="";
    const eq=meta.relicEquip||{};
    const head=document.createElement("div");head.style.gridColumn="1/-1";head.style.color="#8fa7a1";head.style.fontSize="10px";
    head.textContent="已装备："+RELIC_SLOTS.map(s2=>RELIC_SLOT_NAMES[s2]+(eq[s2]?"✓":"∅")).join(" · ")+" · 分解返还结晶";
    rl.appendChild(head);
    if(!(meta.relics||[]).length){const empty=document.createElement("div");empty.style.gridColumn="1/-1";empty.style.color="#5e736c";empty.style.fontSize="11px";empty.textContent="尚无遗章 —— 进入回响深井或完成每日挑战获取";rl.appendChild(empty);}
    (meta.relics||[]).slice().reverse().forEach(rel=>{
      const d=document.createElement("div");d.className="armory-item";
      const rar=RELIC_RARITY[rel.rarity];
      const subsTxt=(rel.subs||[]).map(s2=>s2.n+"+"+s2.v).join(" / ");
      d.innerHTML="<div style='width:8px;height:38px;border-radius:4px;background:"+rar.color+"'></div><div><b style='color:"+rar.color+"'></b><em></em><small></small></div>";
      d.querySelector("b").textContent=RELIC_SLOT_NAMES[rel.slot]+" · "+rar.name;
      d.querySelector("em").textContent="主词条："+rel.main.v+"";
      d.querySelector("small").textContent=(rel.subs||[]).map(s2=>s2.n+"+"+s2.v).join(" / ");
      const box2=document.createElement("div");box2.style.marginLeft="auto";box2.style.display="flex";box2.style.flexDirection="column";box2.style.gap="4px";
      const be=document.createElement("button");be.className="btn sec";be.style.padding="3px 8px";be.style.fontSize="10px";
      be.textContent=eq[rel.slot]===rel.id?"已装备":"装备";be.disabled=eq[rel.slot]===rel.id;
      be.addEventListener("click",()=>{meta.relicEquip=meta.relicEquip||{};meta.relicEquip[rel.slot]=rel.id;saveMeta();renderGrowTab();toast("遗章已装备");});
      const bd=document.createElement("button");bd.className="btn sec";bd.style.padding="3px 8px";bd.style.fontSize="10px";
      bd.textContent="分解 +"+RELIC_RARITY[rel.rarity].crystal;
      bd.addEventListener("click",()=>{meta.relics=meta.relics.filter(r2=>r2.id!==rel.id);for(const k2 in (meta.relicEquip||{}))if(meta.relicEquip[k2]===rel.id)delete meta.relicEquip[k2];meta.crystals=(meta.crystals||0)+RELIC_RARITY[rel.rarity].crystal;saveMeta();renderGrowTab();});
      box2.appendChild(be);box2.appendChild(bd);d.appendChild(box2);
      rl.appendChild(d);
    });
  }
}
function renderBaseTab(){`, "C4 grow tab");

/* C5：深井入口（基地页 + wiring） */
rep(`      <div id="baseCurrency" class="rest-meta" style="margin:10px 0">船币 0</div>`,
`      <div id="baseCurrency" class="rest-meta" style="margin:10px 0">船币 0</div>
      <button class="btn" id="wellBtn" style="margin:10px 0">进入回响深井 · 12 层限时挑战</button>`, "C5 well html");
rep(`  c.textContent="船币 "+meta.currency+" · 总击杀 "+meta.totalKills+" · 最高连杀 "+meta.bestStreak;
  const grid=document.getElementById("baseGrid");grid.innerHTML="";`,
`  c.textContent="船币 "+meta.currency+" · 结晶 "+(meta.crystals||0)+" · 总击杀 "+meta.totalKills+" · 最高连杀 "+meta.bestStreak;
  const wb=document.getElementById("wellBtn");
  if(wb){wb.textContent="进入回响深井 · 12 层限时挑战（最佳 "+(meta.wellBest||0)+" 波 · 累计 ★"+(meta.wellStars||0)+"）";
    if(!wb.__wired){wb.__wired=true;wb.addEventListener("click",()=>{startWell();});}}
  const grid=document.getElementById("baseGrid");grid.innerHTML="";`, "C5 well wire");

/* C6：深井结算累计星数（wellStars 存 meta） */
rep(`    if(wave>=12){const total=wellRun.stars;meta.wellBest=Math.max(meta.wellBest||0,12);wellRun=null;G.wellAffix=null;toast("回响深井通关 · 累计 ★"+total);setOver(true);return;}`,
`    if(wave>=12){const total=wellRun.stars;meta.wellBest=Math.max(meta.wellBest||0,12);meta.wellStars=(meta.wellStars||0)+total;wellRun=null;G.wellAffix=null;toast("回响深井通关 · 本次 ★"+total);unlockAchievement("well12");setOver(true);return;}`, "C6 stars");
rep(`      achievements:{firstBlood:false,streak10:false,deepDive:false,reborn:false,builder:false}};`,
`      achievements:{firstBlood:false,streak10:false,deepDive:false,reborn:false,builder:false,well12:false}};`, "C6 ach init");
rep(`  combo15:{name:"连镇深港",desc:"达成 15 连杀",reward:25},`,
`  combo15:{name:"连镇深港",desc:"达成 15 连杀",reward:25},
  well12:{name:"深井征服者",desc:"通关回响深井 12 层",reward:120},`, "C6 ach def");
rep(`  if(meta.currency>=200)unlockAchievement("rich");`,
`  if(meta.currency>=200)unlockAchievement("rich");
  if(meta.wellBest>=12)unlockAchievement("well12");`, "C6 ach trigger");

fs.writeFileSync(F, html);
console.log(F, "applied:", applied);
if (failed.length) { console.log("FAILED:"); failed.forEach(f => console.log("  " + f)); }
