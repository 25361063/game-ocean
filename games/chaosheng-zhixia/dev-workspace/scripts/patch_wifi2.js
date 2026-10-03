const fs = require("fs");
for (const F of ["潮声之下_深渊潜航3D_v22.html", "潮声之下_深渊潜航3D_手机版.html"]) {
  let html = fs.readFileSync(F, "utf8");
  let n = 0;
  function insertAfter(anchor, insert, tag) {
    if (html.includes(anchor)) { html = html.split(anchor).join(anchor + "\n" + insert); n++; console.log(F, tag, "✓"); }
    else if (html.includes(insert.slice(0, 40))) { console.log(F, tag, "已存在"); }
    else { console.log(F, tag, "✗ 锚点未找到"); }
  }
  function insertBefore(anchor, insert, tag) {
    if (html.includes(anchor)) { html = html.replace(anchor, insert + "\n" + anchor); n++; console.log(F, tag, "✓"); }
    else { console.log(F, tag, "✗ 锚点未找到"); }
  }

  /* W1: WebSocket 核心（插在 let shopGridEl 之前） */
  if (!html.includes("let netWs=null")) {
    insertBefore("let shopGridEl=null;",
`/* ===== v38b WiFi 联机客户端 ===== */
let netWs=null,netConnected=false,netRoom="";
let remotePlayer=null;
function netConnect(room){
  const proto=location.protocol==="https:"?"wss:":"ws:";
  try{
    netWs=new WebSocket(proto+"//"+location.host+"/ws");
    netWs.onopen=()=>{netConnected=true;netRoom=room;netWs.send(JSON.stringify({t:"join",room:room}));toast("已连接房间 "+room);};
    netWs.onmessage=(ev)=>{try{
      const msg=JSON.parse(ev.data);
      if(msg.t==="joined"){netRoom=msg.room;toast("已加入房间 "+msg.room);}
      if(msg.t==="state"&&msg.idx!==undefined){
        if(!remotePlayer)remotePlayer={x:0,z:0,y:1.7,yaw:0,mesh:null,hp:100,role:"guardian"};
        remotePlayer.x=msg.x;remotePlayer.z=msg.z;remotePlayer.y=msg.y||1.7;remotePlayer.yaw=msg.yaw||0;
      }
      if(msg.t==="dmg"&&msg.mi!==undefined&&G&&G.monsters[msg.mi]&&G.monsters[msg.mi].hp>0){
        G.monsters[msg.mi].hp-=msg.dmg;
        if(G.monsters[msg.mi].x!==undefined)burstParticle(G.monsters[msg.mi].x,terrainHeight(G.monsters[msg.mi].x,G.monsters[msg.mi].z)+1,G.monsters[msg.mi].z,0x9fe8ff,6);
        if(G.monsters[msg.mi].hp<=0){G.kills=(G.kills||0)+1;noteKill(G.monsters[msg.mi]);}
      }
      if(msg.t==="kill"&&msg.mi!==undefined&&G&&G.monsters[msg.mi]&&G.monsters[msg.mi].hp>0){
        G.monsters[msg.mi].hp=0;G.kills=(G.kills||0)+1;noteKill(G.monsters[msg.mi]);
        burstParticle(G.monsters[msg.mi].x,terrainHeight(G.monsters[msg.mi].x,G.monsters[msg.mi].z)+1,G.monsters[msg.mi].z,0x9fe8ff,14);
      }
    }catch(e){}};
    netWs.onclose=()=>{netConnected=false;toast("联机已断开");};
    netWs.onerror=()=>{toast("联机连接失败");};
  }catch(e){toast("联机连接失败");}
}
function netSendState(){
  if(!netConnected||!netWs||netWs.readyState!==1)return;
  netWs.send(JSON.stringify({t:"state",x:Math.round(player.x*10)/10,z:Math.round(player.z*10)/10,y:Math.round(player.y*10)/10,yaw:Math.round(player.yaw*100)/100,hp:G?Math.round(G.hp):0}));
}
function netSendAttack(mx,mz,mid){
  if(!netConnected||!netWs||netWs.readyState!==1)return;
  if(mid!==undefined)netWs.send(JSON.stringify({t:"dmg",mi:mid,dmg:1}));
}
/* v34 M1 族谱生物纹理`, "W1 net core");
  }

  /* W2: 远程玩家网格（在 monster sync 前插入） */
  if (!html.includes("remotePlayer.mesh.position.set")) {
    insertBefore("    while(G.monsters.length > monsterMeshes.length){",
`    /* v38b WiFi 远程玩家渲染 */
    if(netConnected&&coopEnabled){
      if(!remotePlayer)remotePlayer={x:0,z:0,y:1.7,yaw:0,mesh:null,hp:100,role:"guardian"};
      if(!remotePlayer.mesh){remotePlayer.mesh=buildCaptainModel(remotePlayer.role||"guardian");remotePlayer.mesh.visible=true;scene.add(remotePlayer.mesh);}
      remotePlayer.mesh.visible=true;
      remotePlayer.mesh.position.set(remotePlayer.x,remotePlayer.y,remotePlayer.z);
      remotePlayer.mesh.rotation.y=remotePlayer.yaw;
    } else if(remotePlayer&&remotePlayer.mesh){remotePlayer.mesh.visible=false;}`, "W2 remote mesh");
  }

  /* W3: 10 Hz 状态发送（已有则跳过） */
  if (!html.includes("netSendT")) {
    insertAfter("    tickGamepad(dt);", "    netSendT=(netSendT||0)-dt;if(netSendT<=0){netSendT=.1;netSendState();}", "W3 send");
  }

  /* W4: 攻击同步（在 registerRunKill 的 lastCombatT 后） */
  if (!html.includes("netSendAttack")) {
    insertAfter("G.lastCombatT=G.time||0;", "\n  if(netConnected&&netWs&&netWs.readyState===1){const mi=(G.monsters||[]).findIndex(mm=>mm.hp<=0);if(mi>=0)netWs.send(JSON.stringify({t:\"dmg\",mi:mi,dmg:1}));}", "W4 attack sync");
  }

  /* W7: 房间按钮交互 */
  if (!html.includes("joinRoom")) {
    insertAfter('if(pr)pr.style.display=coopEnabled?"flex":"none";',
      `\n  const rj=document.getElementById("joinRoom"),rc=document.getElementById("createRoom"),ri=document.getElementById("roomCode"),ns=document.getElementById("netStatus");
  if(rj)rj.addEventListener("click",()=>{const c=(ri?ri.value:"").trim();if(!c){toast("输入房间号");return;}netConnect(c);if(ns)ns.textContent="连接中…";setTimeout(()=>{if(ns)ns.textContent=netConnected?"已连接 "+netRoom:"失败";},1000);});
  if(rc)rc.addEventListener("click",()=>{const c="ROOM"+Math.floor(Math.random()*9000+1000);if(ri)ri.value=c;netConnect(c);if(ns)ns.textContent="创建中…";setTimeout(()=>{if(ns)ns.textContent=netConnected?"房间 "+netRoom:"失败";},1000);});`, "W7 room btns");
  }

  /* W8: 联机切换时显示 WiFi 区块 */
  if (!html.includes('wifi.style.display')) {
    insertAfter('if(pr)pr.style.display=coopEnabled?"flex":"none";',
      '\n  const wifiSec=document.getElementById("wifiSection");if(wifiSec)wifiSec.style.display=coopEnabled?"block":"none";', "W8 wifi toggle");
  }

  fs.writeFileSync(F, html);
  console.log(F, "=== 总修改:", n, "===");
}
