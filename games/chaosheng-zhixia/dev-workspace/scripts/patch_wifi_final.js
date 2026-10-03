// v40: 恢复 WiFi 联机（仅 WebSocket 房间联机，不含同屏双人）
const fs = require("fs");
for (const F of ["潮声之下_深渊潜航3D_v22.html", "潮声之下_深渊潜航3D_手机版.html"]) {
  let html = fs.readFileSync(F, "utf8");
  let n = 0;
  function insB(anchor, insert, tag) {
    if (html.includes(insert.slice(0, 40))) { console.log(F, tag, "已存在"); return; }
    if (!html.includes(anchor)) { console.log(F, tag, "✗ 锚点缺失"); return; }
    html = html.replace(anchor, insert + "\n" + anchor); n++;
    console.log(F, tag, "✓");
  }
  function insA(anchor, insert, tag) {
    if (html.includes(insert.slice(0, 40))) { console.log(F, tag, "已存在"); return; }
    if (!html.includes(anchor)) { console.log(F, tag, "✗ 锚点缺失"); return; }
    html = html.replace(anchor, anchor + "\n" + insert); n++;
    console.log(F, tag, "✓");
  }

  // 1: 联机 HTML 区块（出征页 level-select 之前）
  insB(`    <section class="level-select"><h2>深渊下潜路线</h2>`,
`    <section class="setup-group" id="wifiMulti">
      <h2 style="color:#8cf4d4">WiFi 联机 · 同一 WiFi 两台设备</h2>
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
        <input id="roomCode" placeholder="房间号" style="width:90px;padding:5px 8px;background:#0b1620;border:1px solid #28424c;border-radius:6px;color:var(--ink);font-size:12px;font-family:inherit">
        <button type="button" id="createRoomBtn" class="btn sec" style="width:auto;padding:5px 12px;font-size:11px;margin:0">创建房间</button>
        <button type="button" id="joinRoomBtn" class="btn sec" style="width:auto;padding:5px 12px;font-size:11px;margin:0">加入房间</button>
        <span id="netStatus" style="color:#8fa7a1;font-size:10px">未连接</span>
      </div>
      <div style="color:#5e736c;font-size:9px;margin-top:3px">主机运行 <b>python 联机服务器.py</b> → 两台设备访问 <b>http://主机IP:8123</b> → 创建/加入同一房间号 → 开始下潜</div>
    </section>
    `, "wifi html");

  // 2: 联机核心函数
  insB(`let shopGridEl=null;`,
`/* ===== v40 WiFi 联机（WebSocket 房间联机） ===== */
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
        if(G.monsters[msg.mi].hp<=0){G.kills=(G.kills||0)+1;noteKill(G.monsters[msg.mi]);}
      }
      if(msg.t==="kill"&&msg.mi!==undefined&&G&&G.monsters[msg.mi]&&G.monsters[msg.mi].hp>0){
        G.monsters[msg.mi].hp=0;G.kills=(G.kills||0)+1;noteKill(G.monsters[msg.mi]);
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
let shopGridEl=null;`, "wifi fns");

  // 3: 主页联机按钮交互
  insA(`document.getElementById("startBtn").addEventListener("click", ()=>{ initAudio(); startGame(false); });`,
`(function(){
  const jbtn=document.getElementById("joinRoomBtn"),cbtn=document.getElementById("createRoomBtn"),ri=document.getElementById("roomCode"),ns=document.getElementById("netStatus");
  if(jbtn)jbtn.addEventListener("click",()=>{const c=(ri?ri.value:"").trim();if(!c){toast("输入房间号");return;}netConnect(c);if(ns)ns.textContent="连接中…";setTimeout(()=>{if(ns)ns.textContent=netConnected?"已连接 "+netRoom:"连接失败";},1000);});
  if(cbtn)cbtn.addEventListener("click",()=>{const c="ROOM"+Math.floor(Math.random()*9000+1000);if(ri)ri.value=c;netConnect(c);if(ns)ns.textContent="创建中…";setTimeout(()=>{if(ns)ns.textContent=netConnected?"房间 "+netRoom:"连接失败";},1000);});
})();`, "wifi btns");

  // 4: 远程玩家渲染（主循环怪物同步前）
  insB(`    while(G.monsters.length > monsterMeshes.length){`,
`    /* v40 WiFi 远程玩家渲染 */
    if(netConnected&&remotePlayer){
      if(!remotePlayer.mesh){remotePlayer.mesh=buildCaptainModel("guardian");remotePlayer.mesh.visible=true;scene.add(remotePlayer.mesh);}
      remotePlayer.mesh.visible=true;
      remotePlayer.mesh.position.set(remotePlayer.x,remotePlayer.y,remotePlayer.z);
      remotePlayer.mesh.rotation.y=remotePlayer.yaw;
    } else if(remotePlayer&&remotePlayer.mesh){remotePlayer.mesh.visible=false;}`, "wifi render");

  // 5: 10 Hz 状态发送
  insA(`    tickGamepad(dt);`,
`    netSendT=(netSendT||0)-dt;if(netSendT<=0){netSendT=.1;netSendState();}   // v40 WiFi 10Hz`, "wifi send");

  // 6: 击杀同步
  insA(`unlockAchievement("firstBlood");`,
`if(netConnected&&netWs&&netWs.readyState===1){const mi=(G.monsters||[]).findIndex(mm=>mm.hp<=0);if(mi>=0)netWs.send(JSON.stringify({t:"kill",mi:mi}));}`, "wifi kill sync");

  fs.writeFileSync(F, html);
  console.log(F, "=== WiFi 联机恢复完成，修改:", n, "===");
}
