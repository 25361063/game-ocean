// v43 立体机动改造：可站立表面 + 高度感知碰撞 + 游泳下潜 + 地图立体化 + 怪物对空
// 用法：node patch_v43.js
const fs = require("fs");

function patch(file, reps) {
  let s = fs.readFileSync(file, "utf8");
  let fail = 0, applied = 0;
  for (const [oldS, newS, label, want] of reps) {
    const n = s.split(oldS).length - 1;
    if (n !== (want || 1)) { console.log("ANCHOR MISS [" + file + "] " + label + " found=" + n + " want=" + (want || 1)); fail++; continue; }
    s = s.replace(oldS, newS);
    applied++;
  }
  if (!fail) { fs.writeFileSync(file, s); console.log("OK " + file + " (" + applied + "/" + reps.length + " edits)"); }
  else console.log("FAIL " + file + " (" + fail + " misses, 未写入)");
  return fail === 0;
}

/* ---------- 共用替换对 ---------- */
function commonReps() {
  return [

// R1 terrainHeight + 台地
[`function terrainHeight(x, z, preset){
  const key = preset || (G && G.terrain && G.terrain.preset) || "default";
  const p = TERRAIN_PRESETS[key] || TERRAIN_PRESETS.default;
  return p.a1*Math.sin(x*p.f1) + p.a2*Math.cos(z*p.f2)
       + p.a3*Math.sin(x*p.f3+z*p.f4) + p.a4*Math.cos(x*p.f5+z*p.f6);
}`,
`function terrainHeight(x, z, preset){
  const key = preset || (G && G.terrain && G.terrain.preset) || "default";
  const p = TERRAIN_PRESETS[key] || TERRAIN_PRESETS.default;
  let h = p.a1*Math.sin(x*p.f1) + p.a2*Math.cos(z*p.f2)
       + p.a3*Math.sin(x*p.f3+z*p.f4) + p.a4*Math.cos(x*p.f5+z*p.f6);
  const pls = (G && G.plateaus) || null;   // v43 高地台地：平顶 + 陡坡过渡的真实立体地形
  if(pls && pls.length){
    for(let pi=0;pi<pls.length;pi++){
      const pl=pls[pi], pd=Math.hypot(x-pl.x, z-pl.z);
      if(pd<pl.r){
        let k=Math.max(0,Math.min(1,(pd/pl.r-.42)/.5)); k=1-k*k*(3-2*k);
        const hh=pl.y+pl.h*k;
        if(hh>h)h=hh;
      }
    }
  }
  return h;
}`,"R1 terrainHeight"],

// R2 resolveCollision 高度感知
[`function resolveCollision(px, pz, pr){
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
}`,
`function resolveCollision(px, pz, pr, py){
  const feet = (py === undefined) ? null : py - 1.7;
  const vertSkip = (o) => {   // v43 高度感知碰撞：顶部可站立 / 悬下可穿越
    if(feet === null || o.top === undefined) return false;
    if(feet >= o.top - .25) return true;                          // 已在其顶面上
    if(o.base !== undefined && py + .6 <= o.base) return true;    // 整体低于结构底部
    return false;
  };
  const list = (G && G.obstacles) || OBSTACLES;
  for(const o of list){
    if(vertSkip(o))continue;
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
    if(vertSkip(o))continue;
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
}`,"R2 resolveCollision"],

// R3 buildObstacles 岩石顶面
[`  for(let oi=0;oi<list.length;oi++){
    const o=list[oi]; let r;
    if(o.kind === "kelp"){`,
`  for(let oi=0;oi<list.length;oi++){
    const o=list[oi]; let r;
    if(o.top===undefined&&o.kind!=="kelp"){o.y=terrainHeight(o.x,o.z);o.top=o.y+o.r*.62;}   // v43 岩石顶面可站（跳跃/高台登陆）
    if(o.kind === "kelp"){`,"R3 buildObstacles tops"],

// R4 updatePlayer 地面查询统一
[`  // 跳跃与地形跟随（v24.22：塔顶/墙顶可站立 + 水下推进器）
  let ground = terrainHeight(player.x, player.z);
  for(const s of climbSurfaces){
    if(Math.hypot(player.x-s.x, player.z-s.z)<s.r+.3 && player.y>=s.top+1.35){ ground=s.top; break; }
  }
  for(const st of stairSurfaces){   // v35 螺旋楼梯：沿阶梯行走自动升降（可上 0.65 步高）
    const dx2=player.x-st.x,dz2=player.z-st.z,d2=Math.hypot(dx2,dz2);
    if(d2<st.r+.25){
      let a2=Math.atan2(dx2,dz2)-st.ang0;
      const full=Math.PI*2*st.turns;
      a2=((a2%full)+full)%full;
      const h=st.base+(a2/full)*(st.top-st.base);
      if(player.y>=h+1.05){ ground=Math.max(ground,h); break; }
    }
  }`,
`  // 跳跃与地形跟随（v24.22：塔顶/墙顶可站立 + 水下推进器；v43 统一支撑面查询：结构顶/台地/岩石皆可站）
  let ground = querySupport(player.x, player.z, player.y-1.7, player.onGround);`,"R4 ground query"],

// R5 自动上步 + 碰撞传 Y
[`  const len = Math.hypot(mx, mz)||1;
  player.x += mx/len*sp*dt;
  player.z += mz/len*sp*dt;
  let [cx, cz] = resolveCollision(player.x, player.z, 0.7);`,
`  const len = Math.hypot(mx, mz)||1;
  player.x += mx/len*sp*dt;
  player.z += mz/len*sp*dt;
  if(player.onGround && len>.1){   // v43 自动上步：朝向处有 ≤1.05m 台阶 → 预抬升（箱堆/神龛/岩石直接走上）
    const look=Math.max(.55, sp*dt*2.6);
    const sup=querySupport(player.x+mx/len*look, player.z+mz/len*look, player.y-1.7, true);
    if(sup>player.y-1.7 && sup<=player.y-1.7+1.05) player.y=sup+1.7;
  }
  let [cx, cz] = resolveCollision(player.x, player.z, 0.7, player.y);`,"R5 step-up"],

// R6 二次碰撞传 Y
[`  [cx, cz] = resolveCollision(cx, cz, 0.7);`,
`  [cx, cz] = resolveCollision(cx, cz, 0.7, player.y);`,"R6 collide2 py"],

// R7 下潜控制
[`  if((act.jump||GP.jumpHeld) && !player.onGround && player.vy < 2.2) player.vy += 9*dt;   // v24.22 水下推进器：按住空格持续上浮
  player.vy -= 12*dt;`,
`  if((act.jump||GP.jumpHeld) && !player.onGround && player.vy < 2.2) player.vy += 9*dt;   // v24.22 水下推进器：按住空格持续上浮
  if(act.sink && !player.onGround && player.vy > -3.4) player.vy -= 15*dt;   // v43 下潜：X 键/触屏下潜按钮主动下沉
  player.vy -= 12*dt;`,"R7 sink"],

// R8 大块插入：querySupport / tickVerticality / initPlateaus / buildVerticality / vertClear / tickMonsterLeap
[`function buildClimbWalls(){
  climbWalls.forEach(w=>disposeRoots([w.g]));climbWalls=[];`,
`/* ===== v43 立体机动：统一支撑面查询（结构顶 + 台地 + 楼梯 + 岩石） ===== */
function querySupport(x, z, feet, onGround){
  let ground = terrainHeight(x, z);
  const consider=(top)=>{ if(onGround){ if(top <= feet+1.05) ground=Math.max(ground, top); } else if(feet >= top-.35){ ground=Math.max(ground, top); } };
  for(const s of climbSurfaces){
    if(Math.hypot(x-s.x, z-s.z) < (s.r||2)+.3) consider(s.top);
  }
  for(const st of stairSurfaces){
    const dx2=x-st.x, dz2=z-st.z, d2=Math.hypot(dx2,dz2);
    if(d2<st.r+.25){
      let a2=Math.atan2(dx2,dz2)-st.ang0;
      const full=Math.PI*2*st.turns;
      a2=((a2%full)+full)%full;
      consider(st.base+(a2/full)*(st.top-st.base));
    }
  }
  for(const o of ((G&&G.obstacles)||OBSTACLES)){
    if(o.top===undefined)continue;
    if(Math.hypot(x-o.x, z-o.z) < o.r+.55) consider(o.top);
  }
  return ground;
}
/* ===== v43 悬台浮动动画 ===== */
let vertStructs=[], vertAnims=[];
function tickVerticality(dt){
  if(vertAnims && vertAnims.length){
    const t2=(G&&G.time)||0;
    for(const a of vertAnims){
      if(a.kind==="bob"){
        const v=Math.sin(t2*a.spd+a.ph)*a.amp;
        if(a.surf)a.surf.top=a.top0+v;
        if(a.mesh)a.mesh.position.y=a.y0+v;
      } else if(a.kind==="spin"&&a.mesh){ a.mesh.rotation.y+=dt*a.spd; }
    }
  }
}
/* ===== v43 台地：先于场景重建初始化（地形/障碍/生物以含台地的高度场摆放） ===== */
function initPlateaus(){
  if(!G)return;
  G.plateaus=[];
  const lv=G.level||1, gp=gatePos();
  for(let i=0;i<2;i++){
    const a=lv*1.37+i*2.63+detailRand(lv,811+i)*1.5, r=23+detailRand(lv,821+i)*15;
    const x=Math.cos(a)*r, z=Math.sin(a)*r;
    if(Math.hypot(x,z)<14)continue;
    if(gp&&Math.hypot(x-gp.x,z-gp.z)<12)continue;
    if(Math.hypot(x-Math.sin(lv*1.7)*15, z-Math.cos(lv*1.3)*15)<18)continue;
    const pl={x:x, z:z, r:9.5+detailRand(lv,831+i)*4.5, h:4.5+detailRand(lv,841+i)*3};
    pl.y=terrainHeight(x,z);   // 以原始地形为基（此时 G.plateaus 尚为空）
    G.plateaus.push(pl);
  }
}
/* ===== v43 地图立体化：海蚀柱/悬空浮台/阶梯神龛/货箱堆/沉船龙骨 + 制高点补给箱 ===== */
let vertTop=null;
function vertClear(){
  for(const v of vertStructs)disposeRoots([v]);
  vertStructs=[];vertAnims=[];
  if(typeof worldInteractives!=="undefined")worldInteractives=worldInteractives.filter(it=>!it.v43);
}
function buildVerticality(){
  vertClear();
  if(!G||!scene)return;
  const lv=G.level||1, isEndless=G.modeId==="endless";
  const budget=isEndless?5:9;
  const used=[];vertTop=null;
  const okPlace=(x,z)=>{
    if(Math.hypot(x,z)<12)return false;
    const gp=gatePos();if(gp&&Math.hypot(x-gp.x,z-gp.z)<10)return false;
    if(Math.hypot(x-Math.sin(lv*1.7)*15,z-Math.cos(lv*1.3)*15)<17)return false;
    if(x>-14&&x<14&&z<-26&&z>-50)return false;   // 地标区（z=-38 一带）
    for(const u of used)if(Math.hypot(x-u.x,z-u.z)<u.c+6.5)return false;
    for(const pl of (G.plateaus||[]))if(Math.hypot(x-pl.x,z-pl.z)<pl.r+3)return false;
    return true;
  };
  const rockMatV=new THREE.MeshStandardMaterial({color:0x43606c,roughness:.88,metalness:.08,flatShading:true});
  const ruinMatV=new THREE.MeshStandardMaterial({color:0x3c5a64,roughness:.6,metalness:.35});
  const crateMatV=new THREE.MeshStandardMaterial({color:0x5d6b4e,roughness:.75,metalness:.15});
  const deckMatV=new THREE.MeshStandardMaterial({color:0x2e4a55,roughness:.5,metalness:.55});
  const rimMatV=new THREE.MeshBasicMaterial({color:0x7fe8d0,transparent:true,opacity:.8,fog:false});
  const reg=(g,surf,solid)=>{
    scene.add(g);vertStructs.push(g);
    if(surf)climbSurfaces.push(surf);
    if(solid){G.solids=G.solids||[];G.solids.push(solid);}
  };
  const solidPush=(x,z,r,top,base)=>{G.solids=G.solids||[];G.solids.push({x,z,r,top,base});};
  let placed=0,gi=0;
  for(let i=0;i<budget*9&&placed<budget;i++,gi++){
    const kind=gi%5;
    const a=lv*.83+gi*2.399+detailRand(gi,lv)*1.3, r=15+detailRand(gi,lv+3)*36;
    const x=Math.cos(a)*r, z=Math.sin(a)*r;
    if(!okPlace(x,z))continue;
    const y=terrainHeight(x,z);
    const dr=detailRand(gi,lv+7), dr2=detailRand(gi,lv+13);
    if(kind===0){   // 海蚀柱：顶面可站 + 侧面可攀
      const g=new THREE.Group();g.position.set(x,y,z);
      const h=4+dr*4.5, r0=1.7+dr2*.9;
      const body=new THREE.Mesh(new THREE.CylinderGeometry(r0*.72,r0*1.08,h,7),rockMatV);body.position.y=h/2;body.castShadow=!lowQ;g.add(body);
      const cap=new THREE.Mesh(new THREE.CylinderGeometry(r0+.28,r0+.34,.3,9),rockMatV);cap.position.y=h+.1;g.add(cap);
      const rim=new THREE.Mesh(new THREE.TorusGeometry(r0+.18,.05,5,18),rimMatV);rim.rotation.x=Math.PI/2;rim.position.y=h+.28;g.add(rim);
      reg(g,{x,z,r:r0+.5,top:y+h},{x,z,r:r0*.78,top:y+h,base:y});
      if(!vertTop||h>vertTop.h)vertTop={x,z,top:y+h,h:h};
    } else if(kind===1){   // 悬空浮台：链悬薄片随涌浪浮动，可从下方穿行
      const g=new THREE.Group();g.position.set(x,y,z);
      const top0=3.6+dr*4, r0=2.1+dr2*.9;
      const deck=new THREE.Mesh(new THREE.CylinderGeometry(r0,r0*1.12,.32,12),deckMatV);deck.position.y=top0;deck.castShadow=!lowQ;g.add(deck);
      const rim=new THREE.Mesh(new THREE.TorusGeometry(r0*.98,.06,6,22),rimMatV);rim.rotation.x=Math.PI/2;rim.position.y=top0+.2;g.add(rim);
      for(const s of [-1,1]){const ch=new THREE.Mesh(new THREE.CylinderGeometry(.05,.05,top0-.2,5),deckMatV);ch.position.set(s*r0*.55,top0/2,0);g.add(ch);}
      const surf={x,z,r:r0+.35,top:y+top0};
      reg(g,surf,null);
      vertAnims.push({kind:"bob",surf:surf,top0:y+top0,mesh:g,y0:y,amp:.4,spd:.45+dr*.3,ph:gi});
      if(!vertTop||top0>vertTop.h)vertTop={x,z,top:y+top0,h:top0};
    } else if(kind===2){   // 阶梯神龛：三层台直接走上去（每层 1.0m ≤ 上步阈）
      const g=new THREE.Group();g.position.set(x,y,z);
      const rs=[3.4,2.5,1.7];
      for(let t2=0;t2<3;t2++){
        const tier=new THREE.Mesh(new THREE.CylinderGeometry(rs[t2],rs[t2]+.3,1.0,10),ruinMatV);tier.position.y=.5+t2;tier.receiveShadow=true;g.add(tier);
        climbSurfaces.push({x,z,r:rs[t2]+.55,top:y+1.0*(t2+1)});
        solidPush(x,z,rs[t2]-.12,y+1.0*(t2+1),y);
      }
      const glyph=new THREE.Mesh(new THREE.TorusGeometry(1.15,.05,5,16),rimMatV);glyph.rotation.x=Math.PI/2;glyph.position.y=3.2;g.add(glyph);
      reg(g,null,null);
      if(!vertTop||3>vertTop.h)vertTop={x,z,top:y+3,h:3};
    } else if(kind===3){   // 货箱堆：1-3 级箱体，上步/跳跃练习
      const n2=2+Math.floor(dr*2);
      for(let c2=0;c2<n2;c2++){
        const bx=x+(c2?Math.cos(gi+c2*2.1)*1.35:0), bz=z+(c2?Math.sin(gi+c2*2.1)*1.35:0);
        const by=terrainHeight(bx,bz);
        const cg=new THREE.Group();cg.position.set(bx,by,bz);
        const bm=new THREE.Mesh(new THREE.BoxGeometry(1.9,1.0,1.9),crateMatV);bm.position.y=.5;bm.castShadow=!lowQ;cg.add(bm);
        const band=new THREE.Mesh(new THREE.BoxGeometry(1.94,.12,1.94),deckMatV);band.position.y=.5;cg.add(band);
        scene.add(cg);vertStructs.push(cg);
        climbSurfaces.push({x:bx,z:bz,r:1.55,top:by+1.0});
        solidPush(bx,bz,1.05,by+1.0,by);
        if(c2===n2-1&&!vertTop)vertTop={x:bx,z:bz,top:by+1.0,h:1};
      }
    } else {   // 沉船龙骨：三段脊板（低→高→中），可走可跳
      const dir=detailRand(gi,lv+21)*Math.PI*2, cA=Math.cos(dir), sA=Math.sin(dir);
      for(const seg of [[-3.6,.95],[0,2.0],[3.4,1.45]]){
        const sx=x+cA*seg[0], sz=z+sA*seg[0], sy=terrainHeight(sx,sz);
        const sg=new THREE.Group();sg.position.set(sx,sy,sz);sg.rotation.y=dir;
        const hull=new THREE.Mesh(new THREE.BoxGeometry(3.8,seg[1],2.3),ruinMatV);hull.position.y=seg[1]/2;hull.castShadow=!lowQ;sg.add(hull);
        const rib=new THREE.Mesh(new THREE.BoxGeometry(3.9,.16,.3),deckMatV);rib.position.set(0,seg[1]+.08,0);sg.add(rib);
        scene.add(sg);vertStructs.push(sg);
        climbSurfaces.push({x:sx,z:sz,r:2.45,top:sy+seg[1]});
        solidPush(sx,sz,1.95,sy+seg[1],sy);
        if(seg[1]>=2&&!vertTop)vertTop={x:sx,z:sz,top:sy+2.0,h:2};
      }
    }
    placed++;used.push({x:x,z:z,c:6.5});
  }
  /* 制高点补给箱：登顶奖励（额外金币） */
  if(vertTop&&G.modeId!=="endless"){
    const cg=new THREE.Group();cg.position.set(vertTop.x,vertTop.top+.02,vertTop.z);
    const base2=new THREE.Mesh(new THREE.BoxGeometry(1.05,.6,.78),crateMatV);base2.position.y=.3;cg.add(base2);
    const lid=new THREE.Mesh(new THREE.BoxGeometry(1.09,.18,.82),ruinMatV);lid.position.y=.68;cg.add(lid);
    const gl=new THREE.Mesh(new THREE.SphereGeometry(.09,6,5),new THREE.MeshBasicMaterial({color:0xffd66b,fog:false}));gl.position.y=.92;cg.add(gl);
    scene.add(cg);vertStructs.push(cg);
    worldInteractives.push({kind:"chest",x:vertTop.x,z:vertTop.z,r:2.4,opened:false,mesh:cg,v43:true});
  }
}
/* ===== v43 反制立体机动：玩家登高/滞空时怪物跳跃扑击（防高台无敌） ===== */
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
function buildClimbWalls(){
  climbWalls.forEach(w=>disposeRoots([w.g]));climbWalls=[];`,"R8 big insert"],

// R9 tickChase 跳跃扑击
[`function tickChase(m, t, boost, dt, px, pz, events, windupT){
  const base = m.base || MONSTER_SPOTS[G.monsters.indexOf(m)] || {x:m.x,z:m.z};
  const dx = px-m.x, dz = pz-m.z;
  const d = Math.sqrt(dx*dx+dz*dz) || 1;`,
`function tickChase(m, t, boost, dt, px, pz, events, windupT){
  const base = m.base || MONSTER_SPOTS[G.monsters.indexOf(m)] || {x:m.x,z:m.z};
  const dx = px-m.x, dz = pz-m.z;
  const d = Math.sqrt(dx*dx+dz*dz) || 1;
  if(tickMonsterLeap(m,dt,px,pz,events,(t&&t.dmg)||12))return;   // v43 对空跳跃扑击`,"R9 chase leap"],

// R9b tickChase 重复跳劈块去重（v41 插入两份 → 保留一份）
[`  /* v41 跳劈：灰手近距离 30% 概率跃起 AOE */
  if(m.type==="gray"&&!m.atk&&(m.cd||0)<=0&&d<2.5&&Math.random()<.3){
    m.atk={phase:"windup",t:.5,move:{windup:.5}};
    events.push({type:"telegraph",mx:m.x,mz:m.z,windup:.5,telegraph:{ring:2.5,color:0xff6a3a,sound:"aoewarn"}});
    m.jumpSlam=true;return;
  }
  if(m.jumpSlam&&m.atk&&m.atk.phase==="exec"){
    m.jumpSlam=false;
    for(const sm of G.monsters){}  // no-op
    if(Math.hypot(player.x-m.x,player.z-m.z)<2.5){G.hp=Math.max(0,G.hp-Math.round(dmg*1.5));hurtFlash=1;}
    events.push({type:"chargeBlast",x:m.x,y:terrainHeight(m.x,m.z)+.5,z:m.z});
    events.push({type:"hit",mx:player.x,mz:player.z,wid:1,dmg:dmg*1.5});
  }
  /* v41 跳劈：灰手近距离 30% 概率跃起 AOE */
  if(m.type==="gray"&&!m.atk&&(m.cd||0)<=0&&d<2.5&&Math.random()<.3){
    m.atk={phase:"windup",t:.5,move:{windup:.5}};
    events.push({type:"telegraph",mx:m.x,mz:m.z,windup:.5,telegraph:{ring:2.5,color:0xff6a3a,sound:"aoewarn"}});
    m.jumpSlam=true;return;
  }
  if(m.jumpSlam&&m.atk&&m.atk.phase==="exec"){
    m.jumpSlam=false;
    for(const sm of G.monsters){}  // no-op
    if(Math.hypot(player.x-m.x,player.z-m.z)<2.5){G.hp=Math.max(0,G.hp-Math.round(dmg*1.5));hurtFlash=1;}
    events.push({type:"chargeBlast",x:m.x,y:terrainHeight(m.x,m.z)+.5,z:m.z});
    events.push({type:"hit",mx:player.x,mz:player.z,wid:1,dmg:dmg*1.5});
  }`,
`  /* v41 跳劈：灰手近距离 30% 概率跃起 AOE（v43 去重：原误插两份导致触发率翻倍） */
  if(m.type==="gray"&&!m.atk&&(m.cd||0)<=0&&d<2.5&&Math.random()<.3){
    m.atk={phase:"windup",t:.5,move:{windup:.5}};
    events.push({type:"telegraph",mx:m.x,mz:m.z,windup:.5,telegraph:{ring:2.5,color:0xff6a3a,sound:"aoewarn"}});
    m.jumpSlam=true;return;
  }
  if(m.jumpSlam&&m.atk&&m.atk.phase==="exec"){
    m.jumpSlam=false;
    for(const sm of G.monsters){}  // no-op
    if(Math.hypot(player.x-m.x,player.z-m.z)<2.5){G.hp=Math.max(0,G.hp-Math.round(dmg*1.5));hurtFlash=1;}
    events.push({type:"chargeBlast",x:m.x,y:terrainHeight(m.x,m.z)+.5,z:m.z});
    events.push({type:"hit",mx:player.x,mz:player.z,wid:1,dmg:dmg*1.5});
  }`,"R9b dedupe jumpSlam"],

// R10 tickDart 跳跃扑击
[`function tickDart(m, t, boost, dt, px, pz, events){
  const l = m.lunge || (m.lunge = { phase:"cruise", t:0, cd:0, dx:0, dz:0 });
  const base = m.base || {x:m.x,z:m.z};
  const dx = px-m.x, dz = pz-m.z;
  const d = Math.sqrt(dx*dx+dz*dz) || 1;`,
`function tickDart(m, t, boost, dt, px, pz, events){
  const l = m.lunge || (m.lunge = { phase:"cruise", t:0, cd:0, dx:0, dz:0 });
  const base = m.base || {x:m.x,z:m.z};
  const dx = px-m.x, dz = pz-m.z;
  const d = Math.sqrt(dx*dx+dz*dz) || 1;
  if(tickMonsterLeap(m,dt,px,pz,events,t.dmg))return;   // v43 对空跳跃扑击`,"R10 dart leap"],

// R11 tickSpitter 立体瞄准
[`        const nd = Math.hypot(px-m.x, pz-m.z) || 1;
        if(m.enraged){
          /* v24.8 狂化三连扇面弹：±0.22rad 三发 */
          const baseA = Math.atan2(px-m.x, pz-m.z);
          for(const off of [-.22, 0, .22]){
            const a2 = baseA + off;
            G.spitPulses.push({ x:m.x, y:terrainHeight(m.x,m.z)+1, z:m.z,
                                vx:Math.sin(a2)*spit.speed, vz:Math.cos(a2)*spit.speed,
                                life:spit.life, r:1.0, dmg,
                                exempt:spawnExemptObstacles(m.x, m.z, 1.0) });
          }
        } else {
          G.spitPulses.push({ x:m.x, y:terrainHeight(m.x,m.z)+1, z:m.z,
                              vx:(px-m.x)/nd*spit.speed, vz:(pz-m.z)/nd*spit.speed,
                              life:spit.life, r:1.0, dmg,
                              exempt:spawnExemptObstacles(m.x, m.z, 1.0) });   // CSD-H2：出生重叠豁免
        }`,
`        const nd = Math.hypot(px-m.x, pz-m.z) || 1;
        const sy2=terrainHeight(m.x,m.z)+1, dy2=(player.y-.55)-sy2, nd3=Math.hypot(nd,dy2)||1;   // v43 立体瞄准（高台不再免疫）
        if(m.enraged){
          /* v24.8 狂化三连扇面弹：±0.22rad 三发 */
          const baseA = Math.atan2(px-m.x, pz-m.z);
          for(const off of [-.22, 0, .22]){
            const a2 = baseA + off;
            G.spitPulses.push({ x:m.x, y:sy2, z:m.z,
                                vx:Math.sin(a2)*spit.speed*(nd/nd3), vz:Math.cos(a2)*spit.speed*(nd/nd3), vy:dy2/nd3*spit.speed,
                                life:spit.life, r:1.0, dmg,
                                exempt:spawnExemptObstacles(m.x, m.z, 1.0) });
          }
        } else {
          G.spitPulses.push({ x:m.x, y:sy2, z:m.z,
                              vx:(px-m.x)/nd3*spit.speed, vz:(pz-m.z)/nd3*spit.speed, vy:dy2/nd3*spit.speed,
                              life:spit.life, r:1.0, dmg,
                              exempt:spawnExemptObstacles(m.x, m.z, 1.0) });   // CSD-H2：出生重叠豁免
        }`,"R11 spitter 3D"],

// R12 招式弹丸立体瞄准
[`    G.spitPulses.push({ x:m.x, y:terrainHeight(m.x,m.z)+1, z:m.z,
                        vx:Math.cos(a)*speed, vz:Math.sin(a)*speed,
                        life, r:radius, dmg, kind, status,
                        exempt:spawnExemptObstacles(m.x, m.z, radius) });`,
`    const sy3=terrainHeight(m.x,m.z)+1, dy3=(player.y-.55)-sy3, ndh=Math.hypot(px-m.x,pz-m.z), nd3=Math.hypot(ndh,dy3)||1;   // v43 立体瞄准
    G.spitPulses.push({ x:m.x, y:sy3, z:m.z,
                        vx:Math.cos(a)*speed*(ndh/nd3), vz:Math.sin(a)*speed*(ndh/nd3), vy:dy3/nd3*speed,
                        life, r:radius, dmg, kind, status,
                        exempt:spawnExemptObstacles(m.x, m.z, radius) });`,"R12 move projectile 3D"],

// R13 Boss 壳刺立体瞄准
[`      arr.push({ x:b.x, y:terrainHeight(b.x,b.z)+2, z:b.z,
                 vx:Math.cos(a)*7, vz:Math.sin(a)*7, life:2.2, r:1, dmg:8, status:"bleed", kind:"blade" });`,
`      const sy5=terrainHeight(b.x,b.z)+2, dy5=(player.y-.9)-sy5, ndh5=Math.hypot(tx-b.x,tz-b.z), nd5=Math.hypot(ndh5,dy5)||1;   // v43 立体瞄准
      arr.push({ x:b.x, y:sy5, z:b.z,
                 vx:Math.cos(a)*7*(ndh5/nd5), vz:Math.sin(a)*7*(ndh5/nd5), vy:dy5/nd5*7, life:2.2, r:1, dmg:8, status:"bleed", kind:"blade" });`,"R13 boss spikes 3D"],

// R14 Boss 齐射按玩家高度
[`    arr.push({ x:b.x, y:terrainHeight(b.x,b.z)+1.6, z:b.z,
               vx:Math.cos(a)*speed, vz:Math.sin(a)*speed, life:2.6, r:1.0, dmg:8, kind:"ink" });`,
`    arr.push({ x:b.x, y:(player.y||2)-.9, z:b.z,   // v43 按玩家高度发射（对空压制）
               vx:Math.cos(a)*speed, vz:Math.sin(a)*speed, life:2.6, r:1.0, dmg:8, kind:"ink" });`,"R14 boss ink height"],

// R15 tickSpitPulses 立体弹道
[`    const p = G.spitPulses[i];
    p.x += p.vx*dt; p.z += p.vz*dt; p.life -= dt;
    let consumed = false;
    if(pulseBlockedByObstacle(p)){
      events.push({type:"blockSpit", x:p.x, z:p.z});
      G.spitPulses.splice(i,1);
      continue;
    }
    if(Math.hypot(px-p.x, pz-p.z) < (p.r||1.0)){`,
`    const p = G.spitPulses[i];
    p.x += p.vx*dt; p.z += p.vz*dt; p.y += (p.vy||0)*dt; p.life -= dt;   // v43 立体弹道
    let consumed = false;
    if(p.y < terrainHeight(p.x,p.z)+.22){   // v43 触底溅落
      events.push({type:"blockSpit", x:p.x, z:p.z});
      G.spitPulses.splice(i,1);
      continue;
    }
    if(pulseBlockedByObstacle(p)){
      events.push({type:"blockSpit", x:p.x, z:p.z});
      G.spitPulses.splice(i,1);
      continue;
    }
    if(Math.hypot(px-p.x, pz-p.z) < (p.r||1.0) && Math.abs((player.y-.9)-p.y)<1.35){`,"R15 projectile 3D tick"],

// R16 弹丸障碍高度豁免
[`  for(const o of list){
    if(exempt.indexOf(o) >= 0) continue;              // 出生重叠豁免：跳过该障碍
    if(Math.hypot(o.x - p.x, o.z - p.z) < o.r + r) return o;
  }
  return null;`,
`  for(const o of list){
    if(exempt.indexOf(o) >= 0) continue;              // 出生重叠豁免：跳过该障碍
    if(o.top!==undefined && p.y!==undefined && p.y > o.top+.35) continue;   // v43 弹丸高于岩石顶：不阻挡
    if(Math.hypot(o.x - p.x, o.z - p.z) < o.r + r) return o;
  }
  return null;`,"R16 bullet height skip"],

// R17 怪物网格离地
[`      const my = terrainHeight(m.x,m.z) + (m.type==="spitter" ? 1.15 : 0.9) + Math.sin(G.time*3+i)*0.15;`,
`      const my = terrainHeight(m.x,m.z) + (m.airY||0) + (m.type==="spitter" ? 1.15 : 0.9) + Math.sin(G.time*3+i)*0.15;   // v43 跳跃离地`,"R17 mesh airY"],

// R18 loadLevel：台地先行 + 立体结构
[`  G = createConfiguredLevel(idx, carry);G.solids=[];
   // v33 每关重建建筑碰撞体
  
  G.state = S.PLAYING;
  rebuildScene();`,
`  G = createConfiguredLevel(idx, carry);G.solids=[];
   // v33 每关重建建筑碰撞体
  initPlateaus();   // v43 台地先行：地形/障碍/生物以含台地的高度场摆放
  
  G.state = S.PLAYING;
  rebuildScene();`,"R18a initPlateaus"],

[`  rebuildPressureEnvironment();
  rebuildMissionMarkers();`,
`  rebuildPressureEnvironment();
  rebuildMissionMarkers();
  buildVerticality();   // v43 立体结构（海蚀柱/浮台/神龛/箱堆/龙骨）注册攀爬面与支撑面`,"R18b buildVerticality call",2],

// R18c startGame 台地（loadLevel 与 startGame 双入口）
[`  if(G.modeId==="endless")prepareEndlessWave(1,false);
  saveGame();   // S5：新局进度快照 + 设置持久化
  rebuildScene();`,
`  if(G.modeId==="endless")prepareEndlessWave(1,false);
  saveGame();   // S5：新局进度快照 + 设置持久化
  initPlateaus();   // v43 台地先行：地形/障碍/生物以含台地的高度场摆放
  rebuildScene();`,"R18c startGame plateaus"],

// R19 主循环推进悬台动画
[`    tickAtmosphere(dt);   // v31 昼夜/风暴`,
`    tickAtmosphere(dt);   // v31 昼夜/风暴
    tickVerticality(dt);   // v43 悬台浮动`,"R19 loop tick"],

// R20 冲刺保留高度
[`  player.y=terrainHeight(player.x,player.z)+1.7;player.vy=0;
  G.dashCool=2.4*(G.dashCoolMul||1);G.dashIFrame=.34;`,
`  player.y=Math.max(player.y,terrainHeight(player.x,player.z)+1.7);player.vy=0;   // v43 冲刺保留高度（空中冲刺不再拍回地面）
  G.dashCool=2.4*(G.dashCoolMul||1);G.dashIFrame=.34;`,"R20 dash height"],

// R21a 触屏下潜变量
[`    let touchJumpHeld = false;`,
`    let touchJumpHeld = false;
    let touchSinkHeld = false;   // v43 触屏下潜`,"R21a sink var"],

// R21b 动作对象 sink
[`        jump: !!(keys["Space"] || touchJumpHeld),`,
`        jump: !!(keys["Space"] || touchJumpHeld),
        sink: !!(keys["KeyX"] || touchSinkHeld),   // v43 下潜`,"R21b act sink"],

// R21c 下潜按钮绑定
[`    if (buttons.jump) {
      wireButton(buttons.jump, () => { touchJumpHeld = true; });
      const rel = () => { touchJumpHeld = false; };
      buttons.jump.addEventListener("pointerup", rel);
      buttons.jump.addEventListener("pointercancel", rel);
    }`,
`    if (buttons.jump) {
      wireButton(buttons.jump, () => { touchJumpHeld = true; });
      const rel = () => { touchJumpHeld = false; };
      buttons.jump.addEventListener("pointerup", rel);
      buttons.jump.addEventListener("pointercancel", rel);
    }
    if (buttons.sink) {   // v43 下潜按钮
      wireButton(buttons.sink, () => { touchSinkHeld = true; });
      const relS = () => { touchSinkHeld = false; };
      buttons.sink.addEventListener("pointerup", relS);
      buttons.sink.addEventListener("pointercancel", relS);
    }`,"R21c sink wire"],

// R21d 失能清空（setEnabled / reset 两处，上下文唯一）
[`      if (!enabled) {
        edgePickup = false; edgePulse = false; edgePause = false;
        touchJumpHeld = false;`,
`      if (!enabled) {
        edgePickup = false; edgePulse = false; edgePause = false;
        touchJumpHeld = false;
        touchSinkHeld = false;`,"R21d1 sink reset enabled"],
[`    function reset() {
      edgePickup = false; edgePulse = false; edgePause = false;
      touchJumpHeld = false;`,
`    function reset() {
      edgePickup = false; edgePulse = false; edgePause = false;
      touchJumpHeld = false;
      touchSinkHeld = false;`,"R21d2 sink reset fn"],

// R21e 输入配置注册
[`    pause: document.getElementById("btnPause")
  },`,
`    pause: document.getElementById("btnPause"),
    sink: document.getElementById("btnSink")
  },`,"R21e input cfg"],

// R22a HTML 下潜按钮
[`  <button type="button" id="btnJump" class="tbtn" aria-label="跳跃"></button>`,
`  <button type="button" id="btnJump" class="tbtn" aria-label="跳跃"></button>
  <button type="button" id="btnSink" class="tbtn" aria-label="下潜" style="right:calc(142px + env(safe-area-inset-right));bottom:calc(84px + env(safe-area-inset-bottom));"></button>`,"R22a html sink btn"],

// R22b 图标注册
[`  btnJump:["#0d2b33","#63e8cf","<path d='M16 4 L27 16 h-7 V28 h-8 V16 H5 Z'/>"],`,
`  btnJump:["#0d2b33","#63e8cf","<path d='M16 4 L27 16 h-7 V28 h-8 V16 H5 Z'/>"],
  btnSink:["#0d2b33","#63e8cf","<path d='M16 28 L5 16 h7 V4 h8 V16 h7 Z'/>"],   // v43 下潜（向下箭头）`,"R22b icon"],

// R22c 按钮列表
[`(function(){for(const bid of ["btnPulse","btnShield","btnOverdrive","btnWeapon","btnDash","btnJump","btnShop","btnCam"]){const bel=document.getElementById(bid);if(bel)bel.dataset.bicon=btnIconSrc(bid);}})();`,
`(function(){for(const bid of ["btnPulse","btnShield","btnOverdrive","btnWeapon","btnDash","btnJump","btnSink","btnShop","btnCam"]){const bel=document.getElementById(bid);if(bel)bel.dataset.bicon=btnIconSrc(bid);}})();`,"R22c btn list"],

// R26 原地复活落在支撑面
[`  /* v32 原地复活 */player.y=terrainHeight(player.x,player.z)+1.7;player.vy=0;player.onGround=true;`,
`  /* v32 原地复活 */player.y=querySupport(player.x,player.z,player.y-1.7,true)+1.7;player.vy=0;player.onGround=true;   // v43 落在当前支撑面（平台/台地）而非海床`,"R26 respawn support"],

// R27 Boss 对空砲
[`  const pm = phaseSpeedMult(b);   // P3：高阶段移动更快`,
`  /* v43 对空砲：玩家占据高点（脚离地 >2.8）时投掷髓壳弹 */
  if(player.y-1.7-terrainHeight(b.x,b.z)>2.8&&d<20){
    b.aaCd=Math.max(0,(b.aaCd||0)-dt);
    if((b.aaCd||0)<=0){
      b.aaCd=4.2;
      const sy6=terrainHeight(b.x,b.z)+(bt.hitR||3)*.7, sx6=px-b.x, sz6=pz-b.z, dy6=(player.y-.6)-sy6, sd6=Math.hypot(Math.hypot(sx6,sz6),dy6)||1;
      (G.spitPulses=G.spitPulses||[]).push({x:b.x,y:sy6,z:b.z,vx:sx6/sd6*8.5,vy:dy6/sd6*8.5,vz:sz6/sd6*8.5,life:3.2,r:1.5,dmg:Math.round(dmg*1.1),exempt:spawnExemptObstacles(b.x,b.z,1.5)});
      events.push({type:"spit",mx:b.x,mz:b.z});
    }
  }
  const pm = phaseSpeedMult(b);   // P3：高阶段移动更快`,"R27 boss antiair"],

  ];
}

/* ---------- 帮助文案（桌面/手机内容不同，宽容处理） ---------- */
function helpReps() {
  const out = [];
  const old = `空格 跳跃/上浮（按住持续上浮）· `;
  const neu = `空格 跳跃/上浮（按住持续上浮）· <b>X 下潜</b> · 可站上/攀爬海蚀柱、浮台、货箱与遗迹顶端（v43 立体机动）· `;
  out.push([old, neu, "help text", 1]);
  return out;
}

const F1 = "潮声之下_深渊潜航3D_v22.html";
const F2 = "潮声之下_深渊潜航3D_手机版.html";
let all = commonReps().concat(helpReps());
const ok1 = patch(F1, all);
const ok2 = patch(F2, all);
process.exit(ok1 && ok2 ? 0 : 1);
