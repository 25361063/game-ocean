// v38 补丁：同屏双人合作模式（本地联机）
// P1 = 键鼠（不变）；P2 = 手柄（左摇杆移动 / A 攻击 / RB 闪避），独立角色/生命
// 怪物索敌最近玩家；共享金币装备；相机跟 P1（P2 距离 >18m 自动归位）
const fs = require("fs");
const F = process.argv[2] === "mobile" ? "潮声之下_深渊潜航3D_手机版.html" : "潮声之下_深渊潜航3D_v22.html";
let html = fs.readFileSync(F, "utf8");
let applied = 0, failed = [];
function rep(find, replace, tag) {
  const n = html.split(find).length - 1;
  if (n !== 1) { failed.push(tag + " (出现 " + n + " 次)"); return; }
  html = html.replace(find, replace); applied++;
}

/* C1：联机状态与 P2 对象（渲染层） */
rep(`let playerModel=null,camMode="fps";`,
`let playerModel=null,camMode="fps";
/* ===== v38 同屏双人合作（本地联机） =====
   P2 通过手柄控制：左摇杆移动 / A 攻击 / RB 闪避
   P2 独立生命/角色/武器；共享金币/装备/关卡目标
   怪物索敌最近的玩家；相机跟 P1（P2 距离>18m 自动归位） */
let coopEnabled=false;
let playerB=null;   // {x,z,y,vy,hp,maxHp,role,attackCd,skillCd,mesh,onGround,respawnT}
let p2Role="guardian";
function coopToggle(on){
  coopEnabled=on;
  try{localStorage.setItem("coop_enabled",on?"1":"0");}catch(e){}
}
function coopGetEnabled(){try{return localStorage.getItem("coop_enabled")==="1";}catch(e){return false;}}

function initPlayerB(){
  if(!coopEnabled){if(playerB&&playerB.mesh){scene.remove(playerB.mesh);disposeRoots([playerB.mesh]);}playerB=null;return;}
  const role=p2Role;
  const bp2=DIVER_ROLES[role]||DIVER_ROLES.guardian;
  playerB={
    x:player.x+2,z:player.z+2,y:player.y,vy:0,
    hp:bp2.maxHp,maxHp:bp2.maxHp,
    role:role,attackCd:0,skillCd:[0,0,0],
    onGround:true,respawnT:0,mesh:null,yaw:0
  };
  if(playerB.mesh){scene.remove(playerB.mesh);disposeRoots([playerB.mesh]);}
  playerB.mesh=buildCaptainModel(role);
  playerB.mesh.visible=true;
  playerB.mesh.position.set(playerB.x,playerB.y,playerB.z);
  scene.add(playerB.mesh);
}
function nearestPlayerTo(x,z){
  if(!coopEnabled||!playerB||playerB.hp<=0)return{x:player.x,z:player.z};
  const d1=Math.hypot(x-player.x,z-player.z),d2=Math.hypot(x-playerB.x,z-playerB.z);
  return d2<d1?{x:playerB.x,z:playerB.z}:{x:player.x,z:player.z};
}
function playerBDamage(dmg){
  if(!playerB||playerB.hp<=0)return;
  playerB.hp=Math.max(0,playerB.hp-Math.round(dmg));
  if(playerB.hp<=0){playerB.respawnT=5;toast("P2 倒下 · 5 秒后重生");}
}`, "C1 coop core");

/* C2：菜单 UI —— 联机模式开关 + P2 角色选择 */
rep(`    <div class="run-setup">
      <section class="setup-group"><h2>潜航模式</h2>`,
`    <div class="run-setup">
      <section class="setup-group"><h2>联机模式</h2>
        <div style="display:flex;gap:8px;align-items:center;padding:6px 0">
          <button type="button" id="coopToggle" class="shop-cat" style="padding:6px 16px">单人模式</button>
          <span style="color:#8fa7a1;font-size:10px">开启后 P2 可用手柄加入（左摇杆移动 · A 攻击 · RB 闪避）</span>
        </div>
        <div id="coopP2Role" style="display:none;gap:6px;margin-top:4px">
          <button type="button" class="shop-cat p2role" data-role="explorer" style="padding:4px 10px">浣生</button>
          <button type="button" class="shop-cat p2role on" data-role="guardian" style="padding:4px 10px;border-color:var(--acc2);color:var(--acc2)">迈尔辛</button>
          <button type="button" class="shop-cat p2role" data-role="hunter" style="padding:4px 10px">帕米尔</button>
        </div>
      </section>
      <section class="setup-group"><h2>潜航模式</h2>`, "C2 menu");

/* C3：菜单交互（开关 + P2 角色选择 + 状态持久化） */
rep(`applyRoleVisual();`,
`(function(){
  const ct=document.getElementById("coopToggle"),pr=document.getElementById("coopP2Role");
  if(!ct)return;
  const saved=coopGetEnabled();
  if(saved){coopEnabled=true;ct.textContent="联机模式 ✓";ct.classList.add("on");if(pr)pr.style.display="flex";}
  ct.addEventListener("click",()=>{
    coopEnabled=!coopEnabled;
    ct.textContent=coopEnabled?"联机模式 ✓":"单人模式";
    ct.classList.toggle("on",coopEnabled);
    if(pr)pr.style.display=coopEnabled?"flex":"none";
    coopToggle(coopEnabled);
    try{initAudio();}catch(e){}
  });
  if(pr)pr.addEventListener("click",e=>{
    const b=e.target.closest(".p2role");if(!b)return;
    p2Role=b.dataset.role;
    pr.querySelectorAll(".p2role").forEach(x=>{x.classList.remove("on");x.style.borderColor="";x.style.color="";});
    b.classList.add("on");b.style.borderColor="var(--acc2)";b.style.color="var(--acc2)";
  });
})();
applyRoleVisual();`, "C3 menu js");

/* C4：CSS */
rep(`  .shop-cat{padding:4px 12px;`,
`  #coopToggle.on{border-color:var(--acc2);color:var(--acc2);background:rgba(17,51,48,.85);box-shadow:0 0 9px rgba(95,224,176,.25);}
  .p2role.on{border-color:var(--acc2);color:var(--acc2);}
  .shop-cat{padding:4px 12px;`, "C4 css");

/* C5：关卡加载时初始化 P2 */
rep(`  G = createConfiguredLevel(idx, carry);G.solids=[];   // v33 每关重建建筑碰撞体`,
`  G = createConfiguredLevel(idx, carry);G.solids=[];   // v33 每关重建建筑碰撞体
  if(coopEnabled){/* P2 位置在 boot 渲染帧由 initPlayerB 设置 */}`, "C5 noop");

/* C6：主循环——P2 初始化/同步/手柄控制/攻击 */
rep(`    tickSky(dt);   // v34 F3 水下氛围`,
`    tickSky(dt);   // v34 F3 水下氛围
    tickCoop(dt);   // v38 同屏双人`, "C6 hook");

/* C7：tickCoop 主函数（P2 移动/攻击/重生/网格同步） */
rep(`/* v31 手柄支持（Gamepad API）：左摇杆移动 / 右摇杆视角 / A 攻击 / B,X,Y 技能 / RB 闪现 / LB 跳跃 / Start 暂停 / Select 商店 */`,
`/* ===== v38 同屏双人合作：P2 初始化/移动/攻击/重生/网格同步 ===== */
function tickCoop(dt){
  if(!coopEnabled||!G||G.state!==S.PLAYING)return;
  if(!playerB)initPlayerB();
  if(!playerB)return;
  const gp=navigator.getGamepads?navigator.getGamepads():null;
  const pad=gp&&gp[0];
  const dz=v=>Math.abs(v)>.18?v:0;
  /* 重生倒计时 */
  if(playerB.hp<=0){
    playerB.respawnT-=dt;
    if(playerB.respawnT<=0){
      const bp2=DIVER_ROLES[playerB.role]||DIVER_ROLES.guardian;
      playerB.hp=bp2.maxHp;playerB.x=player.x+2;playerB.z=player.z+2;playerB.y=terrainHeight(playerB.x,playerB.z)+1.7;
      toast("P2 已重生");if(playerB.mesh)playerB.mesh.visible=true;
    } else {if(playerB.mesh)playerB.mesh.visible=false;return;}
  }
  /* 手柄左摇杆 → P2 移动 */
  let mvx=0,mvz=0;
  if(pad&&pad.axes){
    mvx=dz(pad.axes[0]||0);mvz=dz(pad.axes[1]||0);
  }
  const sp2=(DIVER_ROLES[playerB.role]||DIVER_ROLES.guardian).moveMul*6.5;
  const mlen=Math.hypot(mvx,mvz);
  if(mlen>0.1){
    playerB.x+=mvx/mlen*sp2*dt;playerB.z+=mvz/mlen*sp2*dt;
    playerB.yaw=Math.atan2(mvx,mvz);
    playerB.moving=true;
  } else playerB.moving=false;
  /* 距离 P1 >18m 自动归位 */
  const dP1=Math.hypot(playerB.x-player.x,playerB.z-player.z);
  if(dP1>18){playerB.x=player.x+2;playerB.z=player.z+2;toast("P2 已归队");}
  /* 地形碰撞 */
  const ground2=terrainHeight(playerB.x,playerB.z);
  playerB.y=ground2+1.2;
  /* 边界 */
  playerB.x=Math.max(-62,Math.min(62,playerB.x));
  playerB.z=Math.max(-62,Math.min(62,playerB.z));
  /* 攻击冷却 */
  playerB.attackCd=Math.max(0,playerB.attackCd-dt);
  /* 手柄 A → 自动索敌最近怪并射击 */
  const attacking=pad&&pad.buttons&&pad.buttons[0]&&pad.buttons[0].pressed;
  if(attacking&&playerB.attackCd<=0){
    let bm=null,bd=30;
    for(const m of G.monsters){if(m.hp<=0)continue;const d=Math.hypot(m.x-playerB.x,m.z-playerB.z);if(d<bd){bd=d;bm=m;}}
    if(bm){
      const w=WEAPONS[ROLE_WEAPON[playerB.role]]||WEAPONS[1];
      const dx=(bm.x-playerB.x)/bd,dz=(bm.z-playerB.z)/bd;
      const res=fireWeapon(ROLE_WEAPON[playerB.role],playerB.x,playerB.y,playerB.z,dx,0,dz,Math.atan2(dx,dz));
      playerB.attackCd=w.cool;
      if(res&&!Array.isArray(res)){
        const mesh=buildProjectileMesh(res);res.mesh=mesh;pulses.push(res);
        sound("shoot");
      } else if(Array.isArray(res)){for(const e2 of res)handleCombatEvent(e2);sound("echo");}
    }
  }
  /* P2 网格同步 */
  if(playerB.mesh){
    playerB.mesh.position.set(playerB.x,playerB.y,playerB.z);
    if(playerB.moving)playerB.mesh.rotation.y=playerB.yaw;
    else playerB.mesh.rotation.y=Math.atan2(player.x-playerB.x,player.z-playerB.z)+Math.PI;
  }
}
/* v31 手柄支持（Gamepad API）：左摇杆移动 / 右摇杆视角 / A 攻击 / B,X,Y 技能 / RB 闪现 / LB 跳跃 / Start 暂停 / Select 商店 */`, "C7 tickCoop");

/* C8：怪物索敌最近的玩家（tickMonsters 内 tickChase 调用前覆盖 px/pz） */
rep(`    tickChase(m, t, (m.type==="shield"?null:boost), dt, px, pz, events, windupT);`,
`    const tp2=coopEnabled&&playerB&&playerB.hp>0?nearestPlayerTo(m.x,m.z):{x:px,z:pz};
    tickChase(m, t, (m.type==="shield"?null:boost), dt, tp2.x, tp2.z, events, windupT);`, "C8 chase target");
rep(`    if((m.type === "dart"||m.type==="swarm") && t){ tickDart(m, t, m.type==="dart"?boost:null, dt, px, pz, events); continue; }
    if((m.type === "spitter"||m.type==="acid"||m.type==="sniper") && t){ tickSpitter(m, t, m.type==="spitter"?boost:null, dt, px, pz, events); continue; }`,
`    const tpN=coopEnabled&&playerB&&playerB.hp>0?nearestPlayerTo(m.x,m.z):{x:px,z:pz};
    if((m.type === "dart"||m.type==="swarm") && t){ tickDart(m, t, m.type==="dart"?boost:null, dt, tpN.x, tpN.z, events); continue; }
    if((m.type === "spitter"||m.type==="acid"||m.type==="sniper") && t){ tickSpitter(m, t, m.type==="spitter"?boost:null, dt, tpN.x, tpN.z, events); continue; }`, "C8 dart/spit target");

/* C9：P2 生命条 HUD */
rep(`  <div id="bossWrap"><div class="lbl" id="bossLabel">`,
`  <div id="p2Hud" style="display:none;position:fixed;left:16px;top:110px;z-index:6;min-width:130px;padding:5px 10px;border:1px solid rgba(95,224,176,.3);border-radius:8px;background:rgba(8,13,20,.7)">
    <div class="lbl" style="font-size:9px;color:var(--acc2);letter-spacing:.1em">P2 · <span id="p2RoleName">迈尔辛</span></div>
    <div class="bar" style="height:6px;margin-top:3px"><div class="f" id="p2HpBar" style="height:100%;width:100%;background:linear-gradient(90deg,#2a5a3a,#63e8cf);transition:width .2s"></div></div>
  </div>
  <div id="bossWrap"><div class="lbl" id="bossLabel">`, "C9 p2 hud html");
rep(`    if(barBoss.eshield && barBoss.eshield.hp>0){`,
`    if(coopEnabled&&playerB){
      const p2el=document.getElementById("p2Hud");
      if(p2el){p2el.style.display="block";document.getElementById("p2RoleName").textContent=(DIVER_ROLES[playerB.role]||DIVER_ROLES.guardian).shortName||"P2";
        const p2bar=document.getElementById("p2HpBar");if(p2bar)p2bar.style.width=Math.max(0,playerB.hp/playerB.maxHp*100)+"%";}
    } else {const p2el=document.getElementById("p2Hud");if(p2el)p2el.style.display="none";}
    if(barBoss.eshield && barBoss.eshield.hp>0){`, "C9 p2 hud update");

/* C10：怪物攻击也能打 P2（AOE 类检查双玩家距离） */
rep(`  if(d < (bt.hitR||3) && playerHit(dmg)) events.push({ type:"hurt", bx:b.x, bz:b.z });`,
`  if(d < (bt.hitR||3) && playerHit(dmg)) events.push({ type:"hurt", bx:b.x, bz:b.z });
  if(coopEnabled&&playerB&&playerB.hp>0){
    const d2=Math.hypot(playerB.x-b.x,playerB.z-b.z);
    if(d2<(bt.hitR||3)*.8)playerBDamage(dmg*.7);
  }`, "C10 boss hit p2");

/* C11：关卡加载时重建 P2 */
rep(`  rebuildPlayerModel();   // v24.21 按角色重建第三人称模型`,
`  rebuildPlayerModel();   // v24.21 按角色重建第三人称模型
  if(coopEnabled)initPlayerB();`, "C11 rebuild p2");

fs.writeFileSync(F, html);
console.log(F, "applied:", applied);
if (failed.length) { console.log("FAILED:"); failed.forEach(f => console.log("  " + f)); }
