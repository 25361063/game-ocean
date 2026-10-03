// v38b 补丁：WiFi 联机（WebSocket 客户端 + 远程玩家渲染 + 房间 UI）
const fs = require("fs");
const F = process.argv[2] === "mobile" ? "潮声之下_深渊潜航3D_手机版.html" : "潮声之下_深渊潜航3D_v22.html";
let html = fs.readFileSync(F, "utf8");
let applied = 0, failed = [];
function rep(find, replace, tag) {
  const n = html.split(find).length - 1;
  if (n !== 1) { failed.push(tag + " (出现 " + n + " 次)"); return; }
  html = html.replace(find, replace); applied++;
}

/* W1：WiFi 联机核心（WebSocket 客户端 + 远程玩家状态 + 房间管理） */
rep(`/* v38 联机 UI */`,
`/* ===== v38b WiFi 联机：WebSocket 客户端 ===== */
let netWs=null,netRoom="",netConnected=false,netSendT=0;
let remotePlayer=null;   // {x,z,y,yaw,mesh,role,hp}
function netConnect(room,cb){
  const proto=location.protocol==="https:"?"wss:":"ws:";
  const url=proto+"//"+location.host+"/ws";
  try{
    netWs=new WebSocket(url);
    netWs.onopen=()=>{
      netConnected=true;netRoom=room;
      netWs.send(JSON.stringify({t:"join",room:room}));
      toast("已连接房间 "+room);
      if(cb)cb(true);
    };
    netWs.onmessage=(ev)=>{
      try{
        const msg=JSON.parse(ev.data);
        if(msg.t==="joined"){netRoom=msg.room;toast("已加入房间 "+msg.room);return;}
        if(msg.t==="state"&&msg.idx!==undefined){
          if(!remotePlayer)remotePlayer={x:0,z:0,y:0,yaw:0,mesh:null,hp:100,role:"guardian"};
          remotePlayer.x=msg.x;remotePlayer.z=msg.z;remotePlayer.y=msg.y||1.7;
          remotePlayer.yaw=msg.yaw||0;remotePlayer.hp=msg.hp||100;
          if(msg.atk){/* 远程攻击表现 */
            burstParticle(msg.ax,msg.ay,msg.az,0x7fffd4,5);
          }
        }
        if(msg.t==="kill"){/* 远程击杀同步 */
          const mi=msg.mi;if(G&&G.monsters[mi]&&G.monsters[mi].hp>0){G.monsters[mi].hp=0;G.kills=(G.kills||0)+1;}
        }
        if(msg.t==="dmg"){/* 远程伤害同步 */
          const mi=msg.mi;if(G&&G.monsters[mi]&&G.monsters[mi].hp>0){G.monsters[mi].hp-=msg.dmg;}
        }
      }catch(e){}
    };
    netWs.onclose=()=>{netConnected=false;toast("联机连接已断开");if(remotePlayer&&remotePlayer.mesh)remotePlayer.mesh.visible=false;};
    netWs.onerror=()=>{toast("联机连接失败");};
  }catch(e){toast("联机连接失败："+e.message);if(cb)cb(false);}
}
function netSendState(){
  if(!netConnected||!netWs||netWs.readyState!==1)return;
  netWs.send(JSON.stringify({t:"state",x:Math.round(player.x*10)/10,z:Math.round(player.z*10)/10,y:Math.round(player.y*10)/10,yaw:Math.round(player.yaw*100)/100,role:runSelection.roleId,hp:G?Math.round(G.hp):0}));
}
function netSendAttack(wid,mx,mz,dmg,mid){
  if(!netConnected||!netWs||netWs.readyState!==1)return;
  netWs.send(JSON.stringify({t:"state",x:Math.round(player.x*10)/10,z:Math.round(player.z*10)/10,yaw:Math.round(player.yaw*100)/100,atk:true,ax:mx,ay:terrainHeight(mx,mz)+1,az:mz}));
  if(mid!==undefined)netWs.send(JSON.stringify({t:"dmg",mi:mid,dmg:Math.round(dmg)}));
}
/* v38 联机 UI */`, "W1 net core");

/* W2：远程玩家网格渲染（tickCoop 内处理） */
rep(`    /* v38 同屏双人合作：P2 初始化/移动/攻击/重生/网格同步 */`,
`    /* v38b WiFi 远程玩家渲染 */
    if(netConnected&&coopEnabled){
      if(!remotePlayer)remotePlayer={x:0,z:0,y:1.7,yaw:0,mesh:null,hp:100,role:"guardian"};
      if(!remotePlayer.mesh){
        remotePlayer.mesh=buildCaptainModel(remotePlayer.role||"guardian");
        remotePlayer.mesh.visible=true;scene.add(remotePlayer.mesh);
      }
      remotePlayer.mesh.visible=true;
      remotePlayer.mesh.position.set(remotePlayer.x,remotePlayer.y,remotePlayer.z);
      remotePlayer.mesh.rotation.y=remotePlayer.yaw;
    } else if(remotePlayer&&remotePlayer.mesh){remotePlayer.mesh.visible=false;}
    /* v38 同屏双人合作：P2 初始化/移动/攻击/重生/网格同步 */`, "W2 remote mesh");

/* W3：本地玩家状态 10 Hz 发送 */
rep(`    tickGamepad(dt);   // v31 手柄`,
`    tickGamepad(dt);   // v31 手柄
    netSendT-=dt;if(netSendT<=0){netSendT=.1;netSendState();}   // v38b WiFi 状态同步 10Hz`, "W3 send");

/* W4：攻击时发送事件 */
rep(`  G.lastCombatT=G.time||0;
  grantCurrency(isBoss?8:1,isBoss?"巨兽赏金":"击杀回收");`,
`  G.lastCombatT=G.time||0;
  grantCurrency(isBoss?8:1,isBoss?"巨兽赏金":"击杀回收");
  if(netConnected){const mi=(G.monsters||[]).findIndex(mm=>mm.hp<=0&&mm.x===x&&mm.z===z);netSendAttack(1,x,z,0,mi>=0?mi:undefined);if(mi>=0)netWs.send(JSON.stringify({t:"state"}));}`, "W4 attack sync");

/* W5：远程攻击对怪物造成伤害 */
rep(`        if(msg.t==="dmg"){/* 远程伤害同步 */
          const mi=msg.mi;if(G&&G.monsters[mi]&&G.monsters[mi].hp>0){G.monsters[mi].hp-=msg.dmg;}
        }`,
`        if(msg.t==="dmg"){/* 远程伤害同步 */
          const mi=msg.mi;if(G&&G.monsters[mi]&&G.monsters[mi].hp>0){
            G.monsters[mi].hp-=msg.dmg;
            burstParticle(G.monsters[mi].x,terrainHeight(G.monsters[mi].x,G.monsters[mi].z)+1,G.monsters[mi].z,0x9fe8ff,6);
            if(G.monsters[mi].hp<=0){G.kills=(G.kills||0)+1;noteKill(G.monsters[mi]);G.monsters[mi].hp=0;}
          }
        }
        if(msg.t==="kill"){/* 远程击杀同步 */
          const mi=msg.mi;if(G&&G.monsters[mi]&&G.monsters[mi].hp>0){
            G.monsters[mi].hp=0;G.kills=(G.kills||0)+1;noteKill(G.monsters[mi]);
            burstParticle(G.monsters[mi].x,terrainHeight(G.monsters[mi].x,G.monsters[mi].z)+1,G.monsters[mi].z,0x9fe8ff,14);
          }
        }`, "W5 remote dmg");

/* W6：联机 UI（房间号输入 + 创建/加入按钮） */
rep(`        <div id="coopP2Role" style="display:none;gap:6px;margin-top:4px">`,
`        <div id="wifiSection" style="display:none;margin-top:6px;padding:8px;border:1px solid #28424c;border-radius:8px">
          <div style="color:#d9c08a;font-size:10px;margin-bottom:4px">WiFi 联机（同一 WiFi 下的两台设备）</div>
          <div style="display:flex;gap:5px;align-items:center">
            <input id="roomCode" placeholder="房间号" style="width:80px;padding:4px 6px;background:#0b1620;border:1px solid #28424c;border-radius:6px;color:var(--ink);font-size:12px;font-family:inherit">
            <button type="button" id="joinRoom" class="shop-cat" style="padding:4px 10px">加入房间</button>
            <button type="button" id="createRoom" class="shop-cat" style="padding:4px 10px">创建房间</button>
          </div>
          <div id="netStatus" style="color:#8fa7a1;font-size:9px;margin-top:3px">未连接 · 需通过联机服务器运行</div>
        </div>
        <div id="coopP2Role" style="display:none;gap:6px;margin-top:4px">`, "W6 wifi ui");

/* W7：房间按钮交互 */
rep(`  if(pr)pr.addEventListener("click",e=>{
    const b=e.target.closest(".p2role");if(!b)return;
    p2Role=b.dataset.role;
    pr.querySelectorAll(".p2role").forEach(x=>{x.classList.remove("on");x.style.borderColor="";x.style.color="";});
    b.classList.add("on");b.style.borderColor="var(--acc2)";b.style.color="var(--acc2)";
  });`,
`  if(pr)pr.addEventListener("click",e=>{
    const b=e.target.closest(".p2role");if(!b)return;
    p2Role=b.dataset.role;
    pr.querySelectorAll(".p2role").forEach(x=>{x.classList.remove("on");x.style.borderColor="";x.style.color="";});
    b.classList.add("on");b.style.borderColor="var(--acc2)";b.style.color="var(--acc2)";
  });
  const roomInput=document.getElementById("roomCode"),joinBtn=document.getElementById("joinRoom"),createBtn=document.getElementById("createRoom"),netStatus=document.getElementById("netStatus");
  if(joinBtn)joinBtn.addEventListener("click",()=>{
    const code=(roomInput?roomInput.value:"").trim();if(!code){toast("请输入房间号");return;}
    netConnect(code);netStatus.textContent="连接中…";
    setTimeout(()=>{netStatus.textContent=netConnected?("已连接房间 "+netRoom):"连接失败（需通过联机服务器运行）";},1000);
  });
  if(createBtn)createBtn.addEventListener("click",()=>{
    const code="ROOM"+Math.floor(Math.random()*9000+1000);
    if(roomInput)roomInput.value=code;
    netConnect(code);netStatus.textContent="创建中…";
    setTimeout(()=>{netStatus.textContent=netConnected?("房间号 "+netRoom+" · 等待玩家加入"):"创建失败（需通过联机服务器运行）";},1000);
  });`, "W7 room buttons");

/* W8：联机模式切换时显示/隐藏 WiFi 区块 */
rep(`    if(pr)pr.style.display=coopEnabled?"flex":"none";
    coopToggle(coopEnabled);`,
`    if(pr)pr.style.display=coopEnabled?"flex":"none";
    const wifi=document.getElementById("wifiSection");if(wifi)wifi.style.display=coopEnabled?"block":"none";
    coopToggle(coopEnabled);`, "W8 wifi toggle");

/* W9：levelIntro 开关（联机模式开启时隐藏 WiFi 区块） */
rep(`    const wifi=document.getElementById("wifiSection");if(wifi)wifi.style.display=coopEnabled?"block":"none";`,
`    const wifi=document.getElementById("wifiSection");if(wifi)wifi.style.display=coopEnabled?"block":"none";
    coopGetEnabled();`, "W9 noop");

fs.writeFileSync(F, html);
console.log(F, "applied:", applied);
if (failed.length) { console.log("FAILED:"); failed.forEach(f => console.log("  " + f)); }
