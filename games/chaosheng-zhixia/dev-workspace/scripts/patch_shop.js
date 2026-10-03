// v37 补丁：装备合成体系（小件→大件差价合成）+ 五大分类 + 每角色推荐出装（两版同步）
const fs = require("fs");
const F = process.argv[2] === "mobile" ? "潮声之下_深渊潜航3D_手机版.html" : "潮声之下_深渊潜航3D_v22.html";
let html = fs.readFileSync(F, "utf8");
let applied = 0, failed = [];
function rep(find, replace, tag) {
  const n = html.split(find).length - 1;
  if (n !== 1) { failed.push(tag + " (出现 " + n + " 次)"); return; }
  html = html.replace(find, replace); applied++;
}

/* S1：分类表 + 合成路线表 + 8 件新装备（小件/中件，扩充种类） */
rep(`let shopGridEl=null;`,
`/* ===== v37 装备分类与合成（王者荣耀式：小件抵扣差价合成大件） ===== */
const EQUIP_CATS=[["all","全部","#+8fa7a1"],["atk","攻击","#ff8a72"],["def","防御","#6fa8ff"],["mov","移动","#63e8cf"],["util","功能","#d9c08a"],["spc","特殊","#b48cff"]];
const EQUIP_CAT={dagger:"atk",grindstone:"atk",fang:"atk",crystalFang:"atk",turbo:"atk",spear:"atk",lens:"atk",desoEye:"atk",wedge:"atk",
  shell:"def",hardplate:"def",hullplate:"def",heavyarmor:"def",thornCoat:"def",aegis:"def",abyssDip:"def",
  fins:"mov",lightfin:"mov",phase:"mov",swiftFins:"mov",
  coil:"util",cap:"util",leech:"util",ring:"util",luckShell:"util",echoCore:"util",
  splitMag:"spc",pierceHead:"spc",hunterBuoy:"spc",yinYang:"spc",shockHead:"spc",injTide:"spc",injFrost:"spc",injVolto:"spc",injSonic:"spc"};
const EQUIP_FROM={turbo:["dagger","grindstone"],hullplate:["shell","hardplate"],phase:["fins","lightfin"],ring:["luckShell"],
  spear:["turbo","grindstone"],heavyarmor:["hullplate","hardplate"],crystalFang:["fang","grindstone"],thornCoat:["shell","hardplate"],
  swiftFins:["fins","lightfin"],desoEye:["turbo","lens"],proto:["cap","hullplate"],abyssDip:["leech","fins"],aegis:["coil","shell"]};
const REC_BUILDS={
  explorer:{name:"浣生 · 远程狙击流",ids:["spear","lens","desoEye","pierceHead","aegis","hullplate"]},
  guardian:{name:"迈尔辛 · 重装破盾流",ids:["heavyarmor","wedge","leech","phase","aegis","desoEye"]},
  hunter:{name:"帕米尔 · 弹幕覆盖流",ids:["splitMag","shockHead","spear","heavyarmor","cap","desoEye"]}
};
let shopCat="all";
function equipFromOwned(it){   // 已持有的合成小件（索引列表）
  const out=[];
  for(const fid of (EQUIP_FROM[it.id]||[])){
    const idx=(G.equip||[]).indexOf(fid);
    if(idx>=0){const comp=EQUIPMENT.find(x=>x.id===fid);out.push({idx:idx,id:fid,cost:comp?comp.cost:0});}
  }
  return out;
}
let shopGridEl=null;`, "S1 data");

/* S2：新增 8 件装备（小件/中件，扩充种类） */
rep(`  {id:"injSonic",name:"注入器 · 声",cost:5600,desc:"武器附魔：弹道附带声元素，命中即扩散附着周身敌人",s:{elem:"sonic"},u:1}
];`,
`  {id:"injSonic",name:"注入器 · 声",cost:5600,desc:"武器附魔：弹道附带声元素，命中即扩散附着周身敌人",s:{elem:"sonic"},u:1},
  {id:"grindstone",name:"磨刃石",cost:450,desc:"伤害 +5% · 暴击 +3%（合成小件）",s:{dmg:.05,crit:.03}},
  {id:"hardplate",name:"硬壳片",cost:260,desc:"生命上限 +10（合成小件）",s:{hp:10}},
  {id:"lightfin",name:"轻量鳍尖",cost:240,desc:"移动速度 +5%（合成小件）",s:{mv:.05}},
  {id:"luckShell",name:"幸运贝壳",cost:350,desc:"金币获取 +10%（合成小件）",s:{gold:.1}},
  {id:"fang",name:"长牙",cost:700,desc:"伤害 +12%",s:{dmg:.12}},
  {id:"crystalFang",name:"淬晶长牙",cost:1500,desc:"伤害 +18% · 暴击 +5%",s:{dmg:.18,crit:.05}},
  {id:"thornCoat",name:"棘刺外套",cost:1300,desc:"生命 +18 · 韧性伤害 +15%",s:{hp:18,poise:.15}},
  {id:"swiftFins",name:"疾风双鳍",cost:1500,desc:"移速 +12% · 冲刺冷却 -30%",s:{mv:.12,dash:.3}}
];`, "S2 items");

/* S3：合成式购买（小件抵扣差价，失败不消耗） */
rep(`function buyEquip(it){if(!G||!it)return;if((G.equip||[]).length>=EQUIP_SLOTS){toast("装备栏已满 · 请先出售");return;}if(it.u&&(G.equip||[]).indexOf(it.id)>=0){toast("唯一装备 · 已持有");return;}if((G.gold||0)<it.cost){toast("金币不足 · 还差 "+Math.ceil(it.cost-(G.gold||0)));return;}G.gold-=it.cost;G.equip.push(it.id);applyEquipStats(G);G.hp=Math.min(G.maxHp,G.hp);sound("pickup");toast("已装备 · "+it.name);renderShopGrid(shopGridEl||document.getElementById("buildChoices"));}`,
`function buyEquip(it){
  if(!G||!it)return;
  if((G.equip||[]).length>=EQUIP_SLOTS){toast("装备栏已满 · 请先出售");return;}
  if(it.u&&(G.equip||[]).indexOf(it.id)>=0){toast("唯一装备 · 已持有");return;}
  /* v37 合成：已持有的路线小件折价抵扣，购买时被消耗（合成进大件） */
  const comps=equipFromOwned(it);
  let credit=0;for(const c of comps)credit+=c.cost;
  const pay=Math.max(0,it.cost-credit);
  if((G.gold||0)<pay){toast("金币不足 · 还差 "+Math.ceil(pay-(G.gold||0))+(credit?"（已抵扣 "+credit+"）":""));return;}
  for(const c of comps){const idx=(G.equip||[]).indexOf(c.id);if(idx>=0)G.equip.splice(idx,1);}
  G.gold-=pay;G.equip.push(it.id);applyEquipStats(G);G.hp=Math.min(G.maxHp,G.hp);
  sound("pickup");
  toast(comps.length?("合成 · "+it.name+"（小件抵扣 "+credit+"）"):"已装备 · "+it.name);
  renderShopGrid(shopGridEl||document.getElementById("buildChoices"));
}`, "S3 buy");

/* S4：商店界面重构（分类筛选 / 合成路线 / 推荐出装条） */
const rgStart = html.indexOf("function renderShopGrid(grid){");
const rgEnd = html.indexOf("function buyEquip(it){");
if (rgStart > 0 && rgEnd > rgStart) {
  html = html.slice(0, rgStart) +
`function renderShopGrid(grid){
  shopGridEl=grid;grid.innerHTML="";
  const load=document.createElement("div");load.style.gridColumn="1/-1";load.style.display="grid";load.style.gridTemplateColumns="repeat(6,minmax(0,1fr))";load.style.gap="6px";
  for(let i=0;i<EQUIP_SLOTS;i++){
    const id=(G.equip||[])[i],it=id?EQUIPMENT.find(x=>x.id===id):null;
    const slot=document.createElement("button");slot.type="button";slot.className="build-option";slot.style.minHeight="58px";slot.style.padding="8px";
    if(it){slot.innerHTML="<img class='eqicon' alt=''><b></b><em></em>";slot.querySelector("img").src=eqIconSrc(it.id);slot.querySelector("b").textContent=it.name;slot.querySelector("em").textContent="出售 +"+Math.round(it.cost*.6)+" 金币";slot.addEventListener("click",()=>sellEquip(i));}
    else{slot.innerHTML="<b style='color:#5e736c'>空槽</b><em>第 "+(i+1)+" 格</em>";slot.disabled=true;}
    load.appendChild(slot);
  }
  grid.appendChild(load);
  /* 分类筛选（王者荣耀式品类页签） */
  const catRow=document.createElement("div");catRow.style.gridColumn="1/-1";catRow.style.display="flex";catRow.style.gap="5px";catRow.style.margin="2px 0 4px";
  for(const ck of EQUIP_CATS){
    const cb=document.createElement("button");cb.type="button";cb.className="shop-cat"+(shopCat===ck[0]?" on":"");
    cb.textContent=ck[1];cb.style.borderColor=ck[2];
    cb.addEventListener("click",()=>{shopCat=ck[0];renderShopGrid(shopGridEl);});
    catRow.appendChild(cb);
  }
  grid.appendChild(catRow);
  /* 推荐出装条（按当前角色） */
  const rec=REC_BUILDS[G.roleId]||REC_BUILDS.explorer;
  const recRow=document.createElement("div");recRow.style.gridColumn="1/-1";recRow.style.display="flex";recRow.style.alignItems="center";recRow.style.gap="6px";recRow.style.padding="6px 8px";recRow.style.border="1px solid rgba(217,192,138,.35)";recRow.style.borderRadius="9px";recRow.style.background="rgba(25,20,9,.55)";
  const recLab=document.createElement("span");recLab.style.color="#d9c08a";recLab.style.fontSize="10px";recLab.style.whiteSpace="nowrap";recLab.textContent="推荐出装 · "+rec.name;
  recRow.appendChild(recLab);
  for(const rid2 of rec.ids){
    const rit=EQUIPMENT.find(x=>x.id===rid2);
    if(!rit)continue;
    const ib=document.createElement("img");ib.src=eqIconSrc(rit.id);ib.title=rit.name+" · "+rit.cost+" 金币";ib.style.width="30px";ib.style.height="30px";ib.style.borderRadius="7px";ib.style.cursor="pointer";
    ib.addEventListener("click",()=>buyEquip(rit));
    recRow.appendChild(ib);
  }
  grid.appendChild(recRow);
  const list=EQUIPMENT.filter(it=>shopCat==="all"||EQUIP_CAT[it.id]===shopCat).sort((a,b)=>a.cost-b.cost);
  for(const it of list){
    const owned=(G.equip||[]).filter(x=>x===it.id).length;
    const comps=equipFromOwned(it);
    let credit=0;for(const c of comps)credit+=c.cost;
    const pay=Math.max(0,it.cost-credit);
    const b=document.createElement("button");b.type="button";b.className="build-option";
    const noRoom=(G.equip||[]).length>=EQUIP_SLOTS&&!comps.length;
    if((G.gold||0)<pay||noRoom)b.style.opacity=".45";
    b.innerHTML="<img class='eqicon' alt=''><b></b><em></em><small></small>";
    b.querySelector("img").src=eqIconSrc(it.id);
    b.querySelector("b").textContent=(EQUIP_FROM[it.id]?"⚙ ":"")+(REC_BUILDS[G.roleId]&&REC_BUILDS[G.roleId].ids.indexOf(it.id)>=0?"★ ":"")+it.name;
    b.querySelector("em").textContent=it.cost+" 金币"+(owned?" · 已持"+owned:"")+(credit>0?" · 合成差价 "+pay:"");
    b.querySelector("small").textContent=it.desc;
    b.addEventListener("click",()=>buyEquip(it));
    grid.appendChild(b);
  }
  const fromHint=(G.equip||[]).length?(" · 持有小件自动抵扣合成差价"):"";
  document.getElementById("buildSub").textContent="金币 "+Math.floor(G.gold||0)+" · 装备 "+((G.equip||[]).length)+"/"+EQUIP_SLOTS+" · 出售返还 60%"+fromHint;
}
` + html.slice(rgEnd);
  applied++;
} else failed.push("S4 renderShopGrid 区段");

/* S5：商店 CSS（分类页签/合成行/推荐条） */
rep(`  .eqicon{width:34px;height:34px;border-radius:8px;margin-left:6px;box-shadow:0 0 10px rgba(0,0,0,.45);float:right;}`,
`  .eqicon{width:34px;height:34px;border-radius:8px;margin-left:6px;box-shadow:0 0 10px rgba(0,0,0,.45);float:right;}
  .shop-cat{padding:4px 12px;border:1px solid #28424c;border-radius:14px;background:rgba(8,18,26,.8);color:#8fa7a1;font-family:inherit;font-size:11px;cursor:pointer;}
  .shop-cat.on{border-color:var(--acc2);color:var(--acc2);background:rgba(17,51,48,.85);box-shadow:0 0 9px rgba(95,224,176,.25);}`, "S5 css");

fs.writeFileSync(F, html);
console.log(F, "applied:", applied);
if (failed.length) { console.log("FAILED:"); failed.forEach(f => console.log("  " + f)); }
