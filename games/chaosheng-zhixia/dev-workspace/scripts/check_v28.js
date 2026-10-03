// v28 专项校验：角色武器映射 / 九技能 / 弹道装备 / 图标映射实跑
const fs = require("fs");
const html = fs.readFileSync(process.argv[2], "utf8");
let bad = 0;
function need(cond, msg) { if (!cond) { bad++; console.log("FAIL " + msg); } }

/* 1. 武器表 + 角色映射（逻辑段） */
const wStart = html.indexOf("const WEAPONS = {");
const rwIdx = html.indexOf("const ROLE_WEAPON=");
const wCode = html.slice(wStart, html.indexOf(";", rwIdx) + 1);
const wBox = {};
new Function(wCode + ";this.__x={WEAPONS,ROLE_WEAPON};").call(wBox);
const { WEAPONS, ROLE_WEAPON } = wBox.__x;
need(WEAPONS[1] && WEAPONS[1].speed === 34, "浣生远程武器 speed 34");
need(WEAPONS[3] && WEAPONS[3].blast === 2.8, "帕米尔榴弹爆裂 2.8");
need(WEAPONS[4] && WEAPONS[4].melee === true && WEAPONS[4].radius === 3.4, "迈尔辛近战扇形 3.4");
need(ROLE_WEAPON.explorer === 1 && ROLE_WEAPON.guardian === 4 && ROLE_WEAPON.hunter === 3, "角色→武器映射");
need(!html.includes("if(wid === 3) return castEcho(px, py, pz);"), "wid3 不再走旧回响施放");

/* 2. 九技能（渲染段）：三角色 × 3，均有名称/冷却/cast 函数 */
const skStart = html.indexOf("const ROLE_SKILLS={"), skEnd = html.indexOf("let skillFxBeams=[];");
need(skStart > 0 && skEnd > skStart, "ROLE_SKILLS 存在");
const skCode = html.slice(skStart, skEnd);
const castNames = [...skCode.matchAll(/cast:(cast[A-Za-z]+)/g)].map(m => m[1]);
need(castNames.length === 9, "9 个技能 cast 引用（实际 " + castNames.length + "）");
for (const fn of castNames) need(new RegExp("function " + fn + "\\(").test(html), "cast 函数存在 " + fn);
need((skCode.match(/cool:/g) || []).length === 9, "9 个技能冷却");

/* 3. 弹道装备：5 件唯一特效装 + applyEquipStats 字段透传 */
for (const id of ["splitMag", "pierceHead", "hunterBuoy", "yinYang", "shockHead"])
  need(html.includes('id:"' + id + '"'), "特效装备存在 " + id);
need(html.includes("g.equipMulti=multi;g.equipPierce=pierce;g.equipHome=home;"), "applyEquipStats 透传弹道字段");
need(html.includes("if(p.home){"), "tickPulses 制导转向");
need(html.includes("p.pierceLeft!==undefined&&p.pierceLeft>0"), "tickPulses 贯穿消费");
need(html.includes("if(p.blast&&!p.blasted){"), "tickPulses 爆裂弹头");
need(html.includes("(p.elem||ELEM_OF_WEAPON[p.wid])"), "元素变奏覆盖");
need((html.match(/applyElementHit\(m, \(p\.elem\|\|ELEM_OF_WEAPON\[p\.wid\]\), hits\)/g) || []).length === 2, "怪物双重元素结算点均覆盖");

/* 4. 图标映射：24 件全有配图 */
const iconStart = html.indexOf("const EQ_ICON={");
need(iconStart > 0, "EQ_ICON 存在");
const iconCode = html.slice(iconStart, html.indexOf("function eqIconSrc"));
for (const it of ["dagger","shell","fins","coil","turbo","hullplate","leech","lens","ring","echoCore","cap","spear","heavyarmor","phase","wedge","aegis","desoEye","proto","abyssDip","splitMag","pierceHead","hunterBuoy","yinYang","shockHead"])
  need(iconCode.includes(it + ":["), "配图 " + it);

/* 5. 主页页签 + 旧系统清除 */
need(html.includes('id="menuTabs"') && (html.match(/data-pane=/g) || []).length === 5, "四页签按钮");
need(html.includes("paneArmory") && html.includes("paneBase") && html.includes("paneArchive"), "三功能页存在");
need(!html.includes("cycleWeapon(); })") , "切换武器触屏监听已移除");
need(html.includes('id="skillChip0"') && html.includes('id="skillChip1"') && html.includes('id="skillChip2"'), "三技能芯片");

console.log(bad ? bad + " 项失败" : "v28 专项校验全部通过");
process.exit(bad ? 1 : 0);
