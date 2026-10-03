// v33 补丁：穿模修复——统一固体碰撞（建筑/兴趣点）、怪物间推挤、怪物与玩家分离、巨兽碰撞
const fs = require("fs");
const F = process.argv[2] === "mobile" ? "潮声之下_深渊潜航3D_手机版.html" : "潮声之下_深渊潜航3D_v22.html";
let html = fs.readFileSync(F, "utf8");
let applied = 0, failed = [];
function rep(find, replace, tag) {
  const n = html.split(find).length - 1;
  if (n !== 1) { failed.push(tag + " (出现 " + n + " 次)"); return; }
  html = html.replace(find, replace); applied++;
}

/* C1：resolveCollision 统一固体列表（关卡岩石障碍 + G.solids 建筑碰撞体） */
rep(`function resolveCollision(px, pz, pr){
  const list = (G && G.obstacles) || OBSTACLES;
  for(const o of list){
    const dx = px-o.x, dz = pz-o.z;
    let d = Math.sqrt(dx*dx+dz*dz);
    const min = o.r + pr;
    if(d < min){
      let nx = dx, nz = dz, nd = d;
      if(d < 0.0001){ nx = 1; nz = 0; nd = 1; } // 恰在圆心：向固定方向推出
      const amt = min - d;                      // 用原始距离计算推出量
      px += nx/nd*amt; pz += nz/nd*amt;
    }
  }
  return [px, pz];
}`,
`function resolveCollision(px, pz, pr){
  const list = (G && G.obstacles) || OBSTACLES;
  for(const o of list){
    const dx = px-o.x, dz = pz-o.z;
    let d = Math.sqrt(dx*dx+dz*dz);
    const min = o.r + pr;
    if(d < min){
      let nx = dx, nz = dz, nd = d;
      if(d < 0.0001){ nx = 1; nz = 0; nd = 1; } // 恰在圆心：向固定方向推出
      const amt = min - d;                      // 用原始距离计算推出量
      px += nx/nd*amt; pz += nz/nd*amt;
    }
  }
  /* v33 建筑碰撞体（地标/宝箱/信标等注册进 G.solids）——玩家与怪物同样被推出 */
  for(const o of ((G && G.solids) || [])){
    const dx = px-o.x, dz = pz-o.z;
    let d = Math.sqrt(dx*dx+dz*dz);
    const min = o.r + pr;
    if(d < min){
      let nx = dx, nz = dz, nd = d;
      if(d < 0.0001){ nx = 0; nz = 1; nd = 1; }
      const amt = min - d;
      px += nx/nd*amt; pz += nz/nd*amt;
    }
  }
  return [px, pz];
}`, "C1 resolve solids");

/* C2：G.solids 每关重置 */
rep(`  G = createConfiguredLevel(idx, carry);`,
`  G = createConfiguredLevel(idx, carry);G.solids=[];   // v33 每关重建建筑碰撞体`, "C2 reset");

/* C3：地标雕塑注册碰撞体 */
rep(`  const x=[-22,23,-20,22,0][level-1]||0,z=-38,y=terrainHeight(x,z);g.position.set(x,y,z);g.userData={kind:"landmark",phase:level*.9,animated:[]};`,
`  const x=[-22,23,-20,22,0][level-1]||0,z=-38,y=terrainHeight(x,z);g.position.set(x,y,z);g.userData={kind:"landmark",phase:level*.9,animated:[]};
  if(G){G.solids=G.solids||[];G.solids.push({x:x,z:z,r:2.8});}   // v33 地标碰撞体`, "C3 landmark");

/* C4：兴趣点碰撞体（宝箱/信标；裂缝为地面标记不阻挡） */
rep(`add(g3,{kind:"chest",x:x2,z:z2,r:2.4,opened:false,phase:i});}`,
`add(g3,{kind:"chest",x:x2,z:z2,r:2.4,opened:false,phase:i});(G.solids=G.solids||[]).push({x:x2,z:z2,r:.9});}`, "C4 chest");
rep(`add(g3,{kind:"beacon",x:x2,z:z2,r:2.4,idx:i,gid:Math.floor(lv/2),lit:false,orb:orb});}`,
`add(g3,{kind:"beacon",x:x2,z:z2,r:2.4,idx:i,gid:Math.floor(lv/2),lit:false,orb:orb});(G.solids=G.solids||[]).push({x:x2,z:z2,r:.55});}`, "C4 beacon");

/* C5：怪物间软推挤 + 怪物与玩家本体分离（tickMonsters 末尾统一结算） */
rep(`    tickChase(m, t, (m.type==="shield"?null:boost), dt, px, pz, events, windupT);
  }
  return events;
}`,
`    tickChase(m, t, (m.type==="shield"?null:boost), dt, px, pz, events, windupT);
  }
  /* v33 碰撞补全：怪物间软推挤 + 与玩家本体分离（消除互相穿模） */
  const ms2=G.monsters;
  for(let i2=0;i2<ms2.length;i2++){
    const a=ms2[i2];if(a.hp<=0)continue;
    for(let j2=i2+1;j2<ms2.length;j2++){
      const b2=ms2[j2];if(b2.hp<=0)continue;
      const dx=b2.x-a.x,dz=b2.z-a.z,d=Math.hypot(dx,dz),min=1.3;
      if(d>0.001&&d<min){const push=(min-d)*.5;a.x-=dx/d*push;a.z-=dz/d*push;b2.x+=dx/d*push;b2.z+=dz/d*push;}
      else if(d<=0.001){a.x+=.1;b2.x-=.1;}
    }
    const pdx=a.x-px,pdz=a.z-pz,pd=Math.hypot(pdx,pdz),pmin=1.15;
    if(pd>0.001&&pd<pmin){const push2=pmin-pd;a.x+=pdx/pd*push2;a.z+=pdz/pd*push2;}
    const rc2=resolveCollision(a.x,a.z,0.7);a.x=rc2[0];a.z=rc2[1];
  }
  return events;
}`, "C5 separation");

/* C6：巨兽移动加碰撞（不再碾过岩石与建筑） */
rep(`    b.x += dx/d*speed*dt*speedMult(b)*pm; b.z += dz/d*speed*dt*speedMult(b)*pm;`,
`    b.x += dx/d*speed*dt*speedMult(b)*pm; b.z += dz/d*speed*dt*speedMult(b)*pm;
    const brc=resolveCollision(b.x,b.z,1.5);b.x=brc[0];b.z=brc[1];   // v33 巨兽碰撞`, "C6 boss");

fs.writeFileSync(F, html);
console.log(F, "applied:", applied);
if (failed.length) { console.log("FAILED:"); failed.forEach(f => console.log("  " + f)); }
