// v43b：作用域修复 —— player 提升为逻辑块全局；tickMonsterLeap 移入逻辑块；Boss 专属招式去重
const fs = require("fs");
function patch(file, reps) {
  let s = fs.readFileSync(file, "utf8");
  let fail = 0, applied = 0;
  for (const [oldS, newS, label] of reps) {
    const n = s.split(oldS).length - 1;
    if (n !== 1) { console.log("ANCHOR MISS [" + file + "] " + label + " found=" + n); fail++; continue; }
    s = s.replace(oldS, newS);
    applied++;
  }
  if (!fail) { fs.writeFileSync(file, s); console.log("OK " + file + " (" + applied + " edits)"); }
  else console.log("FAIL " + file + " (" + fail + " misses, 未写入)");
  return fail === 0;
}
const LEAP = `/* ===== v43 反制立体机动：玩家登高/滞空时怪物跳跃扑击（防高台无敌） ===== */
function tickMonsterLeap(m, dt, px, pz, events, dmg){
  if(m.leapCd)m.leapCd=Math.max(0,m.leapCd-dt);
  const gY=terrainHeight(m.x,m.z);
  if(m.leap){
    const L=m.leap;
    m.x+=L.vx*dt;m.z+=L.vz*dt;m.airY=(m.airY||0)+L.vy*dt;L.vy-=16*dt;
    const rc=resolveCollision(m.x,m.z,.7,gY+m.airY+1.7);m.x=rc[0];m.z=rc[1];
    if(m.airY<=0){
      m.airY=0;m.leap=null;
      events.push({type:"chargeBlast",x:m.x,y:terrainHeight(m.x,m.z)+.4,z:m.z});
      if(Math.hypot(player.x-m.x,player.z-m.z)<2.7){if(playerHit(Math.round(dmg*1.2)))events.push({type:"hurt",mx:m.x,mz:m.z});}
    }
    return true;
  }
  const feetDiff=(player.y-1.7)-gY;
  if(feetDiff>2.4){
    const d=Math.hypot(px-m.x,pz-m.z);
    if(d<10&&(m.leapCd||0)<=0){
      m.leapCd=5.5;
      const dd=d||1;
      m.leap={vx:(px-m.x)/dd*6.4,vz:(pz-m.z)/dd*6.4,vy:7.6};
      events.push({type:"telegraph",mx:m.x,mz:m.z,windup:.4,telegraph:{ring:1.8,color:0xff9a3a,sound:"aoewarn"}});
      return true;
    }
  }
  return false;
}
`;
const BOSS_UNIQUE = `    /* v41 BOSS 专属招式：每种 BOSS 独有特殊攻击 */
    b.uniqueCd=Math.max(0,(b.uniqueCd||8)-dt);
    if(b.uniqueCd<=0&&d<(bt.hitR||3)+8){
      b.uniqueCd=12;
      if(b.type==="reefCrab"){       // 蟹：横扫钳击（180° 扇形 AOE）
        for(const m of G.monsters){}  // no-op placeholder
        events.push({type:"chargeBlast",x:b.x,y:terrainHeight(b.x,b.z)+.5,z:b.z});
        if(d<6){G.hp=Math.max(0,G.hp-Math.round(dmg*1.5));hurtFlash=1;addShake(.6);}
        toast("横扫钳击！");
      } else if(b.type==="kelpLeviathan"){ // 鳍母：音波尖啸（减速场 3s）
        G.slow=Math.max(G.slow||0,3);events.push({type:"elemTag",mx:player.x,mz:player.z,tag:"音波",color:0x9fe8ff});
        toast("音波尖啸 · 减速！");
      } else if(b.type==="abyssJelly"){    // 水母：毒雾区（落点 DoT）
        G.enemyHazards=G.enemyHazards||[];G.enemyHazards.push({kind:"acidPool",x:player.x,z:player.z,r:4,life:6,max:6,dmg:6,tick:0,tickRate:.8});
        toast("毒雾区！");
      } else if(b.type==="voidWhale"){     // 航鲸：直线冲撞
        b.x+=dx/d*8;b.z+=dz/d*8;addShake(.8);
        if(Math.hypot(player.x-b.x,player.z-b.z)<4){G.hp=Math.max(0,G.hp-Math.round(dmg*2));hurtFlash=1;}
        toast("冲撞！");
      } else if(b.type==="handX"||b.type==="hand"){ // 荒凉之手：黑洞引力
        player.x+=(b.x-player.x)*.3;player.z+=(b.z-player.z)*.3;
        G.hp=Math.max(0,G.hp-Math.round(dmg*.8));addShake(.4);toast("黑洞引力！");
      }
      events.push({type:"phaseBurst",bx:b.x,bz:b.z});
    }`;
function reps(){
  return [
// E2 先行：删除 boot 局部 player（上下文唯一）
[`let lockWarned = false;
let player = { x:0, y:6, z:0, vy:0, yaw:0, pitch:0, onGround:true };
let pulses = [];`,
`let lockWarned = false;
/* v43b：player 提升为逻辑块全局 let（与 G 同模式跨 <script> 桥接）——
   修复逻辑块（怪物 AI/BOSS 招式/词缀）引用 player 抛 ReferenceError 的潜伏问题 */
let pulses = [];`,"E2 remove boot player"],
// E1：逻辑块全局 player
[`let G = null;`,
`let G = null;
let player = { x:0, y:6, z:0, vy:0, yaw:0, pitch:0, onGround:true };   // v43b 全局玩家对象`,"E1 global player"],
// E3a：从 boot 删除 tickMonsterLeap
[LEAP+`function buildClimbWalls(){`,
`function buildClimbWalls(){`,"E3a remove leap from boot"],
// E3b：移入逻辑块（tickChase 之前）
[`function tickChase(m, t, boost, dt, px, pz, events, windupT){`,
LEAP+`function tickChase(m, t, boost, dt, px, pz, events, windupT){`,"E3b leap into logic"],
// E4：Boss 专属招式去重（v41 误插两份）
[BOSS_UNIQUE+`
    /* v41 BOSS 专属招式：每种 BOSS 独有特殊攻击 */
    b.uniqueCd=Math.max(0,(b.uniqueCd||8)-dt);
    if(b.uniqueCd<=0&&d<(bt.hitR||3)+8){
      b.uniqueCd=12;
      if(b.type==="reefCrab"){       // 蟹：横扫钳击（180° 扇形 AOE）
        for(const m of G.monsters){}  // no-op placeholder
        events.push({type:"chargeBlast",x:b.x,y:terrainHeight(b.x,b.z)+.5,z:b.z});
        if(d<6){G.hp=Math.max(0,G.hp-Math.round(dmg*1.5));hurtFlash=1;addShake(.6);}
        toast("横扫钳击！");
      } else if(b.type==="kelpLeviathan"){ // 鳍母：音波尖啸（减速场 3s）
        G.slow=Math.max(G.slow||0,3);events.push({type:"elemTag",mx:player.x,mz:player.z,tag:"音波",color:0x9fe8ff});
        toast("音波尖啸 · 减速！");
      } else if(b.type==="abyssJelly"){    // 水母：毒雾区（落点 DoT）
        G.enemyHazards=G.enemyHazards||[];G.enemyHazards.push({kind:"acidPool",x:player.x,z:player.z,r:4,life:6,max:6,dmg:6,tick:0,tickRate:.8});
        toast("毒雾区！");
      } else if(b.type==="voidWhale"){     // 航鲸：直线冲撞
        b.x+=dx/d*8;b.z+=dz/d*8;addShake(.8);
        if(Math.hypot(player.x-b.x,player.z-b.z)<4){G.hp=Math.max(0,G.hp-Math.round(dmg*2));hurtFlash=1;}
        toast("冲撞！");
      } else if(b.type==="handX"||b.type==="hand"){ // 荒凉之手：黑洞引力
        player.x+=(b.x-player.x)*.3;player.z+=(b.z-player.z)*.3;
        G.hp=Math.max(0,G.hp-Math.round(dmg*.8));addShake(.4);toast("黑洞引力！");
      }
      events.push({type:"phaseBurst",bx:b.x,bz:b.z});
    }   // v33 巨兽碰撞`,
BOSS_UNIQUE+`
    }   // v33 巨兽碰撞（v43b 去重：原误插两份）`,"E4 boss unique dedupe"]
  ];
}
let ok=true;
for(const f of ["潮声之下_深渊潜航3D_v22.html","潮声之下_深渊潜航3D_手机版.html"])ok=patch(f,reps())&&ok;
process.exit(ok?0:1);
