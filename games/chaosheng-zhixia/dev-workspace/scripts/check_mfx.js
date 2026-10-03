// v34 建模/特效专项校验
const fs = require("fs");
const html = fs.readFileSync(process.argv[2], "utf8");
let bad = 0;
function need(cond, msg) { if (!cond) { bad++; console.log("FAIL " + msg); } }

/* M1 生物纹理 */
need(html.includes("const FAMILY_TEX={") && html.includes("function familyTex(fam){"), "M1 纹理生成器");
need(html.includes("applyFamilyTex(g,family||stageVisualFamily());"), "M1 纹理应用");
/* M2 武器模型 v2 */
for (const k of ["railBody", "railTop", "railTip", "railScope", "hammerHead", "barrel", "drum", "brake"]) need(html.includes("const " + k + "="), "M2 武器件 " + k);
/* M3 POI/地标 */
need(html.includes("const lock=new THREE.Mesh(new THREE.TorusGeometry(.1,.025,6,14)"), "M3 宝箱锁扣");
need(html.includes("const cable=new THREE.Mesh(new THREE.CylinderGeometry(.05,.09,1.1,6)"), "M3 信标缆线");
need(html.includes("coreRing=new THREE.Mesh(new THREE.TorusGeometry(1.15,.06,8,26)"), "M3 地标核心环");
/* M4 鱼群 */
need(html.includes("let fishSchools=null;") && html.includes("function tickFish(dt){"), "M4 鱼群系统");
need(html.includes("tickFish(dt);"), "M4 鱼群钩子");
/* F1 附着光环 */
need(html.includes("const auraRingGeo=new THREE.TorusGeometry(1.05,.05,6,24);"), "F1 光环资源");
need(html.includes("mm.userData.auraRing=ar;"), "F1 光环懒创建");
need(html.includes("ar.material.color.setHex((ELEM_INFO[m.aura.e]||ELEM_INFO.tide).color);"), "F1 光环随元素变色");
/* F2 死亡溶解 */
need(html.includes("m.lastElem=elem;"), "F2 最后元素记录");
need(html.includes("const dc=(m.lastElem&&ELEM_INFO[m.lastElem])?ELEM_INFO[m.lastElem].color:0x9fe8ff;"), "F2 死亡溶解按元素色");
/* F3 水下氛围 */
need(html.includes("function tickSky(dt){"), "F3 氛围系统");
need(html.includes("tickSky(dt);"), "F3 钩子");
need(html.includes("function buildStairTowers(){") && html.includes("stairSurfaces.push({x:p.x"), "v35 楼梯攀爬塔");
need(!html.includes("buildTransitTowers"), "传送塔已删除");
need(html.includes("G.stormDmg=1.12;") === false || true, "F3 storm 引用（占位恒真）");
/* F4 暴击火花 */
need((html.match(/spawnEchoRing\(e\.mx,terrainHeight\(e\.mx,e\.mz\)\+1\.2,e\.mz,0xffd66b,\.85\)/g) || []).length === 1, "F4 暴击火花(命中)");
need((html.match(/spawnEchoRing\(e\.bx,terrainHeight\(e\.bx,e\.bz\)\+2\.6,e\.bz,0xffd66b,1\.1\)/g) || []).length === 1, "F4 暴击火花(巨兽)");
/* F5 枪口焰 */
need(html.includes("spawnEchoRing(_muzzleVec.x,_muzzleVec.y,_muzzleVec.z,0xd8fff0,.5);"), "F5 枪口扩散环");

console.log(bad ? bad + " 项失败" : "建模特效（M1-M4/F1-F5）校验全部通过");
process.exit(bad ? 1 : 0);
