// v31 第二/三/四期专项校验：养成/遗章/深井/兴趣点/昼夜风暴/演出/音乐/手柄/照片
const fs = require("fs");
const html = fs.readFileSync(process.argv[2], "utf8");
let bad = 0;
function need(cond, msg) { if (!cond) { bad++; console.log("FAIL " + msg); } }

/* 养成块实跑：charState/charExpNeed/rollRelic */
const s = html.indexOf("function charState(roleId){"), e = html.indexOf("let shopGridEl=null;");
need(s > 0 && e > s, "养成块存在");
const stub = `
  const meta={characters:{},crystals:50,relics:[],relicEquip:{}};
  const saveMeta=()=>{};
  const toast=()=>{};
  const DIVER_ROLES={explorer:{shortName:"浣生"}};
  const runSelection={roleId:"explorer"};
  let G=null;
`;
const box = {};
new Function(stub + html.slice(s, e) + ";this.__x={charState,charExpNeed,rollRelic,RELIC_SLOTS,RELIC_MAIN,RELIC_RARITY,RELIC_SUB_POOL,getMeta:()=>meta};").call(box);
const X = box.__x;
const ch = X.charState("explorer");
need(ch.level === 1 && ch.exp === 0 && ch.broken === 0 && ch.talents.length === 3, "角色初始状态");
need(X.charExpNeed(1) === 90 && X.charExpNeed(10) === 360, "经验曲线");
need(X.RELIC_SLOTS.length === 5 && X.RELIC_MAIN.suit.k === "hpPct", "遗章 5 槽 + 主词条表");
const rel = X.rollRelic(0);
need(rel && rel.slot && rel.subs.length === 4 && rel.rarity >= 0 && rel.rarity <= 2, "遗章生成（4 副词条）");
need(X.getMeta().relics.length === 1, "遗章入库");
for (const sub of rel.subs) need(typeof sub.v === "number", "副词条数值化");

/* 深井 / 词缀 / 掉落 */
need(html.includes("let wellRun=null;") && html.includes("function startWell(){"), "深井状态与入口");
need(html.includes("(wellRun?\"endless\":runSelection.modeId)"), "深井=无尽规则");
need(html.includes("G.wellAffix={hp:"), "词缀系统");
need(html.includes("if(wave>=12){const total=wellRun.stars;"), "12 层通关结算");
need(html.includes("const drel=newRelicRoll(8);"), "每日挑战掉落遗章");
need(html.includes("grantCrystal(6,\"深井供给\")"), "深井结晶掉落");

/* 养成接入战斗数值 */
need(html.includes("g.maxHp=Math.round(g.maxHp*(1+hpPctR/100))+(lv-1)*2+brk*40+hpFlatR;"), "养成/遗章数值接入");
need((html.match(/crit\?2\+\(G\.critDmg\|\|0\):1/g) || []).length >= 4, "暴伤词条生效 ≥4 处");
need(html.includes("G.skillPow=1+.06*((tl[slot]||1)-1);"), "天赋威力倍率");
need(html.includes("G.skillCd[slot]=sk.cool*G.skillCool;"), "天赋冷却倍率");

/* 第三期 */
need(html.includes('kind:"chest"') && html.includes('kind:"beacon"') && html.includes('kind:"rift"'), "三类兴趣点");
need(html.includes("function spawnRiftMonster"), "裂缝运行时刷怪");
need(html.includes("grantGold(250,\"裂缝清剿\")"), "裂缝奖励");
need(html.includes("function tickAtmosphere(dt){"), "昼夜/风暴系统");
need(html.includes("G.stormDmg=1.12;"), "风暴全伤害 +12%");
need(html.includes("G.expBase=1.02*(sig.exp||1);G.fogFarBase=scene.fog.far;"), "曝光/雾距基准");
need(html.includes("__storyTypeTimer") && html.includes("AVATAR_COLORS"), "打字机 + 立绘徽章");

/* 第四期 */
need(html.includes("function musicNote(") && html.includes("function musicTick()"), "分层动态音乐");
need(html.includes("function tickGamepad(dt){") && html.includes("gpPulse=bp(0)||bp(7);"), "手柄支持");
need(html.includes("function photoCam(dt){") && html.includes("function enterPhoto(){"), "照片模式");
need(html.includes("if(photoMode)photoCam(dt);"), "照片相机渲染前接管");

/* 主页集成 */
need(html.includes('data-pane="paneGrow"'), "养成页签");
need(html.includes('id="paneGrow"') && html.includes('id="growTalents"') && html.includes('id="growRelics"'), "养成面板 DOM");
need(html.includes('id="wellBtn"'), "深井入口按钮");
need(html.includes("function renderGrowTab(){"), "养成页渲染");

console.log(bad ? bad + " 项失败" : "第二/三/四期校验全部通过");
process.exit(bad ? 1 : 0);
