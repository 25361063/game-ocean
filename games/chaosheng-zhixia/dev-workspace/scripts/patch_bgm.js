// v42 补丁：程序化 BGM 系统（和弦进行 + 旋律 + 贝斯，三状态动态切换）
const fs = require("fs");
for (const F of ["潮声之下_深渊潜航3D_v22.html", "潮声之下_深渊潜航3D_手机版.html"]) {
  let html = fs.readFileSync(F, "utf8");
  let n = 0;
  const rep = (f, r, tag) => { const c = html.split(f).length - 1; if (c !== 1) { console.log(F, tag, "count", c); return; } html = html.split(f).join(r); n++; };

  /* 替换整个 musicTick（保留 musicNote 基础设施） */
  rep(`function musicTick(){
  if(!ac||settings.mute||!G||G.state!==S.PLAYING)return;
  const combat=(G.time-(G.lastCombatT||-9)<4)||(G.monsters||[]).some(m=>m.hp>0&&Math.hypot(m.x-player.x,m.z-player.z)<14);
  const boss=G.boss&&G.boss.hp>0;
  const t=ac.currentTime+.05,bar=MUSIC.bar++%4;
  const scale=[220,261.6,293.7,329.6,392,440];
  if(boss){musicNote(scale[bar%3]*.5,t,.5,"sawtooth",.05);musicNote(scale[(bar+2)%6]*2,t+.25,.3,"square",.028);}
  else if(combat){musicNote(scale[bar%6],t,.35,"triangle",.05);if(bar%2)musicNote(scale[(bar+3)%6]*.5,t,.4,"sine",.04);}
  else{musicNote(scale[bar]*.5,t,1.6,"sine",.03);musicNote(scale[(bar+2)%6]*.5,t+.8,1.4,"sine",.024);}
}`,
`/* ===== v42 程序化 BGM：和弦进行 + 旋律 + 贝斯线，三状态动态切换 ===== */
/* A 小调，100 BPM，16 分音符调度。探索=稀疏琶音 / 战斗=推进和声 / 巨兽=重低音+不协和 */
const BGM={
  bpm:100, step:0, nextTime:0, running:false,
  chords:{
    explore:[[0,2,4],[3,5,1],[4,0,2],[2,4,5]],
    combat:[[0,4,1],[4,0,3],[3,5,0],[0,2,4]],
    boss:[[0,1,4],[1,4,0],[0,3,5],[4,1,3]]
  },
  scales:{
    explore:[220,246.9,261.6,293.7,329.6,349.2,392,440],
    combat:[220,233.1,261.6,277.2,329.6,349.2,415.3,440],
    boss:[220,233.1,246.9,261.6,311.1,329.6,349.2,415.3]
  },
  bassPat:[1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,1,0],
  melodyChance:{explore:.25,combat:.55,boss:.7}
};
function bgmNote(freq,t,dur,type,vol){
  if(!ac||settings.mute)return;
  try{
    const o=ac.createOscillator(),g=ac.createGain();
    o.type=type;o.frequency.value=freq;
    g.gain.setValueAtTime(0,t);
    g.gain.linearRampToValueAtTime(vol,t+.02);
    g.gain.exponentialRampToValueAtTime(.001,t+dur);
    o.connect(g);g.connect(ac.destination);
    o.start(t);o.stop(t+dur+.05);
  }catch(e){}
}
function bgmState(){
  if(!G||G.state!==S.PLAYING)return null;
  if(G.boss&&G.boss.hp>0)return "boss";
  const combat=(G.time-(G.lastCombatT||-9)<5)||(G.monsters||[]).some(m=>m.hp>0&&Math.hypot(m.x-player.x,m.z-player.z)<14);
  return combat?"combat":"explore";
}
function musicTick(){
  if(!ac||settings.mute||!G||G.state!==S.PLAYING){BGM.running=false;return;}
  const st2=bgmState();
  if(!st2){BGM.running=false;return;}
  if(!BGM.running){BGM.running=true;BGM.step=0;BGM.nextTime=ac.currentTime+.1;}
  const stepDur=60/BGM.bpm/4;   // 16 分音符
  const state=st2;
  const scale=BGM.scales[state]||BGM.scales.explore;
  const chords=BGM.chords[state]||BGM.chords.explore;
  const stepDurAdj=state==="combat"?stepDur*.85:state==="boss"?stepDur*1.1:stepDur;
  while(BGM.nextTime<ac.currentTime+.15){
    const bar=Math.floor(BGM.step/16)%4, beat=BGM.step%16;
    const chord=chords[bar];
    const root=scale[0];
    const vol=state==="boss"?.06:state==="combat"?.045:.032;
    /* 贝斯线：根音（低八度）在 1/9/13 步 */
    if(BGM.bassPat[beat]){
      bgmNote(root*.5*(beat>=8?1.19:1),BGM.nextTime,stepDurAdj*3.5,"triangle",vol*.9);
    }
    /* 和声：和弦音（中八度，全音符持续） */
    if(beat===0){
      for(const ci of chord){
        bgmNote(scale[ci]*2,BGM.nextTime,stepDurAdj*14,"sine",vol*.35);
      }
    }
    /* 旋律：从音阶中选音（概率随状态密度变化） */
    const chance=BGM.melodyChance[state]||.3;
    if(Math.random()<chance&&beat%2===0){
      const ni=chord[(BGM.step%chord.length)]+((BGM.step%7)<3?0:2);
      const note=scale[ni%scale.length]*(state==="boss"?1:Math.random()<.3?2:1);
      bgmNote(note,BGM.nextTime,stepDurAdj*(state==="explore"?2.8:1.2),state==="boss"?"sawtooth":"triangle",vol*.55);
    }
    /* 打击感：战斗/巨兽每 4 步一个短噪声脉冲 */
    if(state!=="explore"&&beat%4===0){
      bgmNote(root*4,BGM.nextTime,.06,"square",.018);
    }
    BGM.step++;
    BGM.nextTime+=stepDurAdj;
  }
}
setInterval(()=>{try{musicTick();}catch(e){}},50);`, "bgm upgrade");

  fs.writeFileSync(F, html);
  console.log(F, "applied:", n);
  
}
