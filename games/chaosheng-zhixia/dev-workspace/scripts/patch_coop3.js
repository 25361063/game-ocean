const fs = require("fs");
for (const F of ["潮声之下_深渊潜航3D_手机版.html", "潮声之下_深渊潜航3D_v22.html"]) {
  let html = fs.readFileSync(F, "utf8");
  let n = 0;
  const rep = (f, r, tag) => {
    const c = html.split(f).length - 1;
    if (c !== 1) { console.log(F, tag, "count", c); return; }
    html = html.split(f).join(r); n++;
  };

  /* 1：logic 段声明 coop 全局变量（block 4 可见） */
  rep("var runBuild = null;",
`var runBuild = null;
var coopEnabled = false;var playerB = null;var p2Role = "guardian";`, "logic vars");

  /* 2：render 段 C1 去掉 let 声明（改用 logic 段变量） */
  rep(`let coopEnabled=false;
let playerB=null;   // {x,z,y,vy,hp,maxHp,role,attackCd,skillCd,mesh,onGround,respawnT}
let p2Role="guardian";`,
`/* coopEnabled/playerB/p2Role 已在 logic 段声明（v38） */`, "render vars cleanup");

  /* 3：nearestPlayerTo + playerBDamage 移到 logic 段（tickMonsters 在 block 4 调用） */
  rep(`function nearestPlayerTo(x,z){
  if(!coopEnabled||!playerB||playerB.hp<=0)return{x:player.x,z:player.z};
  const d1=Math.hypot(x-player.x,z-player.z),d2=Math.hypot(x-playerB.x,z-playerB.z);
  return d2<d1?{x:playerB.x,z:playerB.z}:{x:player.x,z:player.z};
}
function playerBDamage(dmg){
  if(!playerB||playerB.hp<=0)return;
  playerB.hp=Math.max(0,playerB.hp-Math.round(dmg));
  if(playerB.hp<=0){playerB.respawnT=5;toast("P2 倒下 · 5 秒后重生");}
}`,
`/* v38 nearestPlayerTo/playerBDamage 已移到 logic 段 */`, "remove from render");

  /* 4：logic 段添加 nearestPlayerTo + playerBDamage（放在 tickMonsters 之前） */
  rep(`function tickMonsters(dt, px, pz, opts){`,
`/* v38 联机：怪物索敌最近的玩家 */
function nearestPlayerTo(x,z){
  if(!coopEnabled||!playerB||playerB.hp<=0)return{x:player.x,z:player.z};
  const d1=Math.hypot(x-player.x,z-player.z),d2=Math.hypot(x-playerB.x,z-playerB.z);
  return d2<d1?{x:playerB.x,z:playerB.z}:{x:player.x,z:player.z};
}
function playerBDamage(dmg){
  if(!playerB||playerB.hp<=0)return;
  playerB.hp=Math.max(0,playerB.hp-Math.round(dmg));
  if(playerB.hp<=0){playerB.respawnT=5;toast("P2 倒下 · 5 秒后重生");}
}
function tickMonsters(dt, px, pz, opts){`, "logic fns");

  /* 5：逻辑段 coopEnabled 同步（render 段改值后 logic 段也能看到） */
  rep(`  G = createConfiguredLevel(idx, carry);G.solids=[];`,
`  G = createConfiguredLevel(idx, carry);G.solids=[];
  if(coopEnabled&&G){G.p2={hp:0,maxHp:0};}   // v38 P2 标记`, "noop");

  fs.writeFileSync(F, html);
  console.log(F, "fixed:", n);
}
