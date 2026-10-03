// v44 免服务器直连：WebRTC 数据通道 + 邀请码互换，嵌进游戏文件（点开联机模式即可用）
// 用法：node patch_v44.js
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

/* ---------- HTML：直连面板（插在 WiFi 房间提示行之后、section 结束前） ---------- */
function htmlReps() {
  const oldHtml = `      <div style="color:#5e736c;font-size:9px;margin-top:3px">主机运行 <b>python 联机服务器.py</b> → 两台设备访问 <b>http://主机IP:8123</b> → 创建/加入同一房间号 → 开始下潜</div>
    </section>`;
  const newHtml = `      <div style="color:#5e736c;font-size:9px;margin-top:3px">主机运行 <b>python 联机服务器.py</b> → 两台设备访问 <b>http://主机IP:8123</b> → 创建/加入同一房间号 → 开始下潜</div>
      <div style="border-top:1px dashed #28424c;margin-top:8px;padding-top:8px">
        <div style="color:#8cf4d4;font-size:10px;margin-bottom:4px"><b>免服务器直连（推荐）</b> · 无需运行任何服务，互换邀请码即连</div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <button type="button" id="dcHostBtn" class="btn sec" style="width:auto;padding:5px 12px;font-size:11px;margin:0">① 生成邀请码</button>
          <button type="button" id="dcGuestBtn" class="btn sec" style="width:auto;padding:5px 12px;font-size:11px;margin:0">② 粘对方码·回应</button>
          <button type="button" id="dcAcceptBtn" class="btn sec" style="width:auto;padding:5px 12px;font-size:11px;margin:0">③ 粘回应·接通</button>
          <span id="dcStatus" style="color:#8fa7a1;font-size:10px">未直连</span>
        </div>
        <textarea id="dcCode" placeholder="邀请码区域：①生成后把本框内容发给对方 → 对方粘入本框点② → 把回应码发回 → 你粘入本框点③" style="width:100%;box-sizing:border-box;height:44px;margin-top:5px;background:#0b1620;border:1px solid #28424c;border-radius:6px;color:var(--ink);font-size:10px;font-family:inherit;resize:vertical"></textarea>
        <div style="color:#5e736c;font-size:9px;margin-top:3px">流程：一人点①把码发给朋友 → 朋友粘码点②把回应码发回 → 第一人粘回应码点③ → 双方显示「已直连」→ 各自开始下潜。同一 WiFi 直连最稳，无需任何服务器。</div>
      </div>
    </section>`;
  return [[oldHtml, newHtml, "HTML dc panel"]];
}

/* ---------- JS：共享消息处理 + 直连实现 ---------- */
function jsReps() {
  const netHandleMsg = `function netHandleMsg(ev){   /* v44 消息处理抽为共享（WiFi 房间与免服务器直连共用） */
  try{
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
  }catch(e){}
}
`;

  const directCode = `/* ===== v44 免服务器直连（WebRTC 数据通道 + 邀请码互换） ===== */
let dcPc=null;
globalThis.__NET_DIRECT={open:false,rx:0,tx:0};
function dcPackCode(t,sdp){
  const keep=/^(v=|o=|s=|t=|m=|c=|b=|a=mid:|a=ice-|a=fingerprint|a=setup|a=candidate|a=end-of-candidates|a=group|a=sctp-port|a=max-message-size|a=sendrecv|a=sendonly|a=recvonly|a=msid)/;
  const lines=sdp.split(/\\r?\\n/).filter(l=>keep.test(l.trim())).join('\\n');
  return 'TC1-'+btoa(unescape(encodeURIComponent(JSON.stringify({t:t,s:lines}))));
}
function dcUnpackCode(txt){
  const s=(txt||'').trim().replace(/\\s+/g,'');
  if(s.indexOf('TC1-')!==0)throw new Error('不是有效的邀请码');
  const obj=JSON.parse(decodeURIComponent(escape(atob(s.slice(4)))));
  if(!obj||!obj.s)throw new Error('邀请码内容为空');
  return {t:obj.t,sdp:obj.s};
}
function dcIceDone(pc){
  return new Promise(res=>{
    if(pc.iceGatheringState==='complete')return res();
    const to=setTimeout(res,3000);
    pc.addEventListener('icegatheringstatechange',()=>{ if(pc.iceGatheringState==='complete'){clearTimeout(to);res();} });
  });
}
function dcWire(dc,pc){
  const shim={_dc:dc,readyState:1,
    send:function(d){ if(dc.readyState==='open'){try{dc.send(d);globalThis.__NET_DIRECT.tx++;}catch(e){}} },
    close:function(){ try{dc.close();}catch(e){} }};
  dc.onopen=()=>{ netConnected=true;netRoom='直连';netWs=shim;globalThis.__NET_DIRECT.open=true;
    const ds=document.getElementById('dcStatus');if(ds){ds.textContent='已直连 · 可开玩';ds.style.color='#63e8cf';}
    toast('直连已建立 · 双方各自开始下潜'); try{sound('start');}catch(e){} };
  dc.onmessage=(ev)=>{ globalThis.__NET_DIRECT.rx++; try{netHandleMsg({data:ev.data});}catch(e){} };
  dc.onclose=()=>{ netConnected=false;globalThis.__NET_DIRECT.open=false;
    const ds=document.getElementById('dcStatus');if(ds){ds.textContent='已断开';ds.style.color='#8fa7a1';}
    toast('直连已断开'); };
  dcPc=pc;
}
async function dcHost(){
  try{
    const pc=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]});
    const dc=pc.createDataChannel('game',{ordered:true});
    dcWire(dc,pc);
    await pc.setLocalDescription(await pc.createOffer());
    await dcIceDone(pc);
    const el=document.getElementById('dcCode');
    if(el)el.value=dcPackCode('offer',pc.localDescription.sdp);
    const ds=document.getElementById('dcStatus');if(ds){ds.textContent='邀请码已生成 · 发给对方';ds.style.color='#ffd66b';}
    toast('① 邀请码已生成 · 发给对方');
  }catch(e){toast('直连创建失败：'+e.message);}
}
async function dcGuest(){
  try{
    const el=document.getElementById('dcCode');
    const obj=dcUnpackCode(el?el.value:'');
    if(obj.t!=='offer'){toast('请先粘贴对方（①）生成的邀请码');return;}
    const pc=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]});
    pc.ondatachannel=(ev)=>dcWire(ev.channel,pc);
    await pc.setRemoteDescription({type:'offer',sdp:obj.sdp});
    await pc.setLocalDescription(await pc.createAnswer());
    await dcIceDone(pc);
    if(el)el.value=dcPackCode('answer',pc.localDescription.sdp);
    const ds=document.getElementById('dcStatus');if(ds){ds.textContent='回应码已生成 · 发回给对方';ds.style.color='#ffd66b';}
    toast('② 回应码已生成 · 发回给对方');
  }catch(e){toast('回应失败：'+e.message);}
}
async function dcAccept(){
  try{
    if(!dcPc){toast('请先点 ① 生成邀请码');return;}
    const el=document.getElementById('dcCode');
    const obj=dcUnpackCode(el?el.value:'');
    if(obj.t!=='answer'){toast('请粘贴对方（②）生成的回应码');return;}
    await dcPc.setRemoteDescription({type:'answer',sdp:obj.sdp});
    const ds=document.getElementById('dcStatus');if(ds){ds.textContent='接通中…';ds.style.color='#ffd66b';}
    toast('接通中…');
  }catch(e){toast('接通失败：'+e.message);}
}
(function(){
  const hb=document.getElementById('dcHostBtn'),gb=document.getElementById('dcGuestBtn'),ab=document.getElementById('dcAcceptBtn');
  if(hb)hb.addEventListener('click',()=>dcHost());
  if(gb)gb.addEventListener('click',()=>dcGuest());
  if(ab)ab.addEventListener('click',()=>dcAccept());
})();

function netSendState(){`;

  return [
// 1) netConnect 的内联 onmessage → 共享 netHandleMsg
[`    netWs.onmessage=(ev)=>{try{
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
    }catch(e){}};`,
`    netWs.onmessage=netHandleMsg;   // v44 共享消息处理`,"netConnect onmessage shared"],

// 2) 在 netSendState 前插入 netHandleMsg + 直连实现
[`function netSendState(){
  if(!netConnected||!netWs||netWs.readyState!==1)return;`,
netHandleMsg+directCode+`
  if(!netConnected||!netWs||netWs.readyState!==1)return;`,"insert direct code"],
  ];
}

let ok = true;
for (const f of ["潮声之下_深渊潜航3D_v22.html", "潮声之下_深渊潜航3D_手机版.html"]) {
  ok = patch(f, htmlReps().concat(jsReps())) && ok;
}
process.exit(ok ? 0 : 1);
