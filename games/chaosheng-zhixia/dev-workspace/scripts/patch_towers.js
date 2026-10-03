// v35 补丁：角色碰撞体积补全 + 传送塔删除 + 楼梯攀爬塔（两版同步）
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

/* T1：传送塔系统整体移除 → 替换为楼梯攀爬塔 */
rep(`let transitTowers=[],transitCool=0,transitLine=null;`,
`let stairTowers=[],stairSurfaces=[];`, "T1 vars");
const btStart = html.indexOf("function buildTransitTowers(){");
const btEnd = html.indexOf("/* v24.22 攀爬系统");
if (btStart > 0 && btEnd > btStart) {
  html = html.slice(0, btStart) +
`/* v35 楼梯攀爬塔：螺旋阶梯沿外墙走上去（无需挂壁），顶部平台可站立俯瞰；每关 2 座 */
let stairTowers=[],stairSurfaces=[];
function buildStairTowers(){
  stairTowers.forEach(t=>disposeRoots([t.g]));stairTowers=[];stairSurfaces=[];
  if(!G||G.modeId!=="campaign")return;
  const lv=G.level||1;
  const spots=[{a:lv*1.1,r:26},{a:lv*2.3+1.2,r:30}];
  for(let si=0;si<2;si++){
    const sp=spots[si],p={x:Math.cos(sp.a)*sp.r,z:Math.sin(sp.a)*sp.r};
    const g=new THREE.Group(),y=terrainHeight(p.x,p.z);
    const H=7.2,R=2.2,turns=1.25,steps=26;
    const mat=new THREE.MeshStandardMaterial({color:0x2f4a52,roughness:.55,metalness:.45});
    const core=new THREE.Mesh(new THREE.CylinderGeometry(R-.95,R-.75,H,10),mat);core.position.y=H/2;g.add(core);
    const cap=new THREE.Mesh(new THREE.CylinderGeometry(R+.35,R+.35,.18,14),new THREE.MeshStandardMaterial({color:0x35545e,roughness:.5,metalness:.5}));cap.position.y=H;g.add(cap);
    const rail=new THREE.Mesh(new THREE.TorusGeometry(R+.28,.05,6,26),new THREE.MeshBasicMaterial({color:0x7fffd4,transparent:true,opacity:.75,fog:false}));rail.rotation.x=Math.PI/2;rail.position.y=H+.7;g.add(rail);
    const stepMat=new THREE.MeshStandardMaterial({color:0x3a5a63,roughness:.5,metalness:.4});
    for(let i2=0;i2<steps;i2++){
      const a2=sp.a+i2/steps*Math.PI*2*turns;
      const sx=Math.cos(a2)*R,sz=Math.sin(a2)*R,sy=(i2+1)/steps*(H-.2);
      const step=new THREE.Mesh(new THREE.BoxGeometry(.95,.14,.62),stepMat);
      step.position.set(sx,sy-.07,sz);step.rotation.y=-a2+Math.PI/2;
      g.add(step);
      if(i2%3===0){const post=new THREE.Mesh(new THREE.BoxGeometry(.06,.7,.06),stepMat);post.position.set(Math.cos(a2)*(R+.3),sy+.32,Math.sin(a2)*(R+.3));g.add(post);}
    }
    const beacon=new THREE.Mesh(new THREE.SphereGeometry(.2,8,6),new THREE.MeshBasicMaterial({color:0xffe9a8,fog:false}));beacon.position.y=H+.95;g.add(beacon);
    g.position.set(p.x,y,p.z);scene.add(g);
    stairTowers.push({g:g,pos:p,top:H,ang0:sp.a,turns:turns});
    stairSurfaces.push({x:p.x,z:p.z,r:R+.35,base:y,top:H,ang0:sp.a,turns:turns});
    if(G){G.solids=G.solids||[];G.solids.push({x:p.x,z:p.z,r:R-1.0});}   // 塔芯碰撞体
  }
}

` + html.slice(btEnd);
  applied++;
} else failed.push("T1 transit builder 区段");

/* T2：攀爬面注册表——传送塔行移除，换成楼梯塔顶部平台 + 扫描塔/楼梯塔芯碰撞体 */
rep(`function refreshClimbSurfaces(){
  climbSurfaces=[];
  for(const t of scanTowers){const p=t.g.position;climbSurfaces.push({x:p.x,z:p.z,r:1.8,top:p.y+5.5});}
  for(const t of transitTowers){const p=t.g.position;climbSurfaces.push({x:p.x,z:p.z,r:2.1,top:p.y+5.7});}
  for(const w of climbWalls){climbSurfaces.push({x:w.x,z:w.z,r:w.r,top:w.top});}
}`,
`function refreshClimbSurfaces(){
  climbSurfaces=[];
  for(const t of scanTowers){const p=t.g.position;climbSurfaces.push({x:p.x,z:p.z,r:1.8,top:p.y+5.5});(G.solids=G.solids||[]).push({x:p.x,z:p.z,r:1.05});}   // v35 扫描塔芯碰撞
  for(const t of stairTowers){climbSurfaces.push({x:t.pos.x,z:t.pos.z,r:2.55,top:t.top});}   // v35 楼梯塔顶平台可站立
  for(const w of climbWalls){climbSurfaces.push({x:w.x,z:w.z,r:w.r,top:w.top});}
}`, "T2 surfaces");

/* T3：传送逻辑块移除 */
rep(`    /* v24.18 传送塔：踏入基座平台 → 传送至孪生塔（4 秒共享冷却） */
    transitCool=Math.max(0,transitCool-dt);
    if(transitLine)transitLine.material.opacity=.22+.14*Math.sin(G.time*2.2);   // v24.19 连线呼吸提示
    if(transitCool<=0)for(const t of transitTowers){
      if(Math.hypot(player.x-t.pos.x,player.z-t.pos.z)<1.7){
        const tw=t.twin;
        burstParticle(player.x,player.y,player.z,0x9fe8ff,18);spawnEchoRing(player.x,player.y-.3,player.z,0x9fe8ff,2);
        player.x=tw.x;player.z=tw.z;player.y=terrainHeight(player.x,player.z)+1.7;
        burstParticle(player.x,player.y,player.z,0x9fe8ff,18);spawnEchoRing(player.x,player.y-.3,player.z,0x9fe8ff,2);
        transitCool=4;sound("dash");vibrate(20);toast("传送塔 · 已抵达孪生塔");
        break;
      }
    }
`, ``, "T3 teleport block");

/* T4：清理函数与调用点 */
rep(`transitTowers.forEach(t=>disposeRoots([t.g]));transitTowers=[];climbWalls.forEach(w=>disposeRoots([w.g]));climbWalls=[];if(transitLine){disposeRoots([transitLine]);transitLine=null;}`,
`stairTowers.forEach(t=>disposeRoots([t.g]));stairTowers=[];stairSurfaces=[];climbWalls.forEach(w=>disposeRoots([w.g]));climbWalls=[];`, "T4 cleanup");
rep(`buildScanTowers();buildTransitTowers();buildClimbWalls();refreshClimbSurfaces();`,
`buildScanTowers();buildStairTowers();buildClimbWalls();refreshClimbSurfaces();`, "T4 call");

/* T5：楼梯地面高度（movement 地面查询加楼梯分支） */
rep(`  let ground = terrainHeight(player.x, player.z);
  for(const s of climbSurfaces){
    if(Math.hypot(player.x-s.x, player.z-s.z)<s.r+.3 && player.y>=s.top+1.35){ ground=s.top; break; }
  }`,
`  let ground = terrainHeight(player.x, player.z);
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
  }`, "T5 stair ground");

/* T6：角色本体碰撞体积——移动后推开重叠的活体怪物（贴脸接触攻击不受影响） */
rep(`  const [cx, cz] = resolveCollision(player.x, player.z, 0.55);
  const [bx, bz] = clampToMap(cx, cz);
  player.x = bx; player.z = bz;`,
`  let [cx, cz] = resolveCollision(player.x, player.z, 0.55);
  for(const m of G.monsters){   // v35 角色本体碰撞体积：与活体怪物保持间距（推开玩家一半量，另一半由怪物推挤完成）
    if(m.hp<=0)continue;
    const mdx=cx-m.x,mdz=cz-m.z,md=Math.hypot(mdx,mdz);
    if(md>0.001&&md<1.15){const k=(1.15-md)*.6;cx+=mdx/md*k;cz+=mdz/md*k;}
  }
  [cx, cz] = resolveCollision(cx, cz, 0.55);
  const [bx, bz] = clampToMap(cx, cz);
  player.x = bx; player.z = bz;`, "T6 player body");

/* T7：氛围函数改名（避免覆盖既有环境音频 tickAmbient） */
rep(`function tickAmbient(dt){
  if(!G||G.state!==S.PLAYING)return;
  const count=lowQ?50:150;`,
`function tickSky(dt){
  if(!G||G.state!==S.PLAYING)return;
  const count=lowQ?50:150;`, "T7 sky rename");
rep(`    tickAmbient(dt);   // v34 F3 水下氛围`,
`    tickSky(dt);   // v34 F3 水下氛围`, "T7 hook");

fs.writeFileSync(F, html);
console.log(F, "applied:", applied);
if (failed.length) { console.log("FAILED:"); failed.forEach(f => console.log("  " + f)); }
