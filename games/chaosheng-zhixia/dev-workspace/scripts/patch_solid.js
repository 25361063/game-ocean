// v36 补丁：碰撞体全覆盖（巨骨/导管/热泉/地标）+ 玩家碰撞半径 0.55→0.7 + 巨兽本体推挤（两版同步）
const fs = require("fs");
const F = process.argv[2] === "mobile" ? "潮声之下_深渊潜航3D_手机版.html" : "潮声之下_深渊潜航3D_v22.html";
let html = fs.readFileSync(F, "utf8");
let applied = 0, failed = [];
function rep(find, replace, tag) {
  const n = html.split(find).length - 1;
  if (n !== 1) { failed.push(tag + " (出现 " + n + " 次)"); return; }
  html = html.replace(find, replace); applied++;
}
function repAll(find, replace, tag, min) {
  const n = html.split(find).length - 1;
  if (n < (min || 1)) { failed.push(tag + " (出现 " + n + " 次)"); return; }
  html = html.split(find).join(replace); applied++;
}

/* S1：玩家碰撞半径 0.55 → 0.7（三处：主移动 / 冲刺 / 巨兽引力拉扯） */
repAll(`resolveCollision(player.x, player.z, 0.55)`, `resolveCollision(player.x, player.z, 0.7)`, "S1 player r main", 1);
repAll(`resolveCollision(nx,nz,.55)`, `resolveCollision(nx,nz,.7)`, "S1 player r dash", 1);
repAll(`resolveCollision(nx, nz, .55)`, `resolveCollision(nx, nz, .7)`, "S1 player r pull", 1);

/* S2：巨骨拱廊——每根巨肋注册碰撞体（大件视觉必配碰撞） */
rep(`      const s=2.1+((i*53)%17)*.15;
      megaRibs.push({p:[x,y+.15,z],r:[0,detailRand(i,81)*Math.PI*2,0],s:[s,s,s],c:0xb8c2ba});
    }`,
`      const s=2.1+((i*53)%17)*.15;
      megaRibs.push({p:[x,y+.15,z],r:[0,detailRand(i,81)*Math.PI*2,0],s:[s,s,s],c:0xb8c2ba});
      if(G){G.solids=G.solids||[];G.solids.push({x:x,z:z,r:1.7});}   // v36 巨肋碰撞体
    }`, "S2 megaRibs");

/* S3：记忆导管——立柱碰撞体（每根） */
rep(`memoryConduits.push({p:[x,y,z],r:[(detailRand(i,71)-.5)*.28,a,(detailRand(i,72)-.5)*.28],s:[.8,1+Math.min(level,48)*.12,.8],c:level===3?0x75a8ff:(level===5?0xd47ad2:0x63e8cf)});}`,
`memoryConduits.push({p:[x,y,z],r:[(detailRand(i,71)-.5)*.28,a,(detailRand(i,72)-.5)*.28],s:[.8,1+Math.min(level,48)*.12,.8],c:level===3?0x75a8ff:(level===5?0xd47ad2:0x63e8cf)});
   if(G){G.solids=G.solids||[];G.solids.push({x:x,z:z,r:.45});}}   // v36 导管碰撞体`, "S3 conduits");

/* S4：热泉碰撞体 */
rep(`add(g,{kind:"vent",x,z,r:2.4,tick:0,phase:i*1.4});}`,
`add(g,{kind:"vent",x,z,r:2.4,tick:0,phase:i*1.4});(G.solids=G.solids||[]).push({x:x,z:z,r:.55});}   // v36 热泉口碰撞体`, "S4 vents");

/* S5：地标碰撞体加大到贴合视觉 */
rep(`G.solids.push({x:x,z:z,r:2.8});   // v33 地标碰撞体`,
`G.solids.push({x:x,z:z,r:3.3});   // v36 地标碰撞体（贴合视觉展开宽度）`, "S5 landmark");

/* S6：巨兽本体推挤——玩家不再走进巨兽模型（推到 hitR 边缘，接触伤害仍可触发） */
rep(`  [cx, cz] = resolveCollision(cx, cz, 0.7);
  const [bx, bz] = clampToMap(cx, cz);`,
`  if(G.boss&&G.boss.hp>0){
    const bbt=BOSS_TYPES[G.boss.type]||BOSS_TYPES.hand,bodyR=(bbt.hitR||3)*.85;
    const bdx=cx-G.boss.x,bdz=cz-G.boss.z,bd=Math.hypot(bdx,bdz);
    if(bd>0.001&&bd<bodyR){cx=G.boss.x+bdx/bd*bodyR;cz=G.boss.z+bdz/bd*bodyR;}
  }   // v36 巨兽本体推挤
  [cx, cz] = resolveCollision(cx, cz, 0.7);
  const [bx, bz] = clampToMap(cx, cz);`, "S6 boss push");

/* S7：扫描塔芯碰撞体加大（视觉基座更宽） */
rep(`(G.solids=G.solids||[]).push({x:p.x,z:p.z,r:1.05});}`, `(G.solids=G.solids||[]).push({x:p.x,z:p.z,r:1.35});}`, "S7 scan tower");

fs.writeFileSync(F, html);
console.log(F, "applied:", applied);
if (failed.length) { console.log("FAILED:"); failed.forEach(f => console.log("  " + f)); }
