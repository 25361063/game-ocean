// v43qa：qa 专用立体机动探针（?qa=1 才激活，与既有 qaSetPos 等同模式）
const fs=require("fs");
function patch(file,reps){
  let s=fs.readFileSync(file,"utf8");let fail=0;
  for(const [o,n,label] of reps){
    const c=s.split(o).length-1;
    if(c!==1){console.log("MISS ["+file+"] "+label+" found="+c);fail++;continue;}
    s=s.replace(o,n);
  }
  if(!fail){fs.writeFileSync(file,s);console.log("OK "+file);}
  return !fail;
}
const reps=[[
`  qaEndlessWave:qaEnabled?(wave)=>{if(G&&G.modeId==="endless")prepareEndlessWave(Math.max(1,wave|0),true);return {state:globalThis.__D3D.get(),wave:G?.endless||null};}:undefined
};`,
`  qaEndlessWave:qaEnabled?(wave)=>{if(G&&G.modeId==="endless")prepareEndlessWave(Math.max(1,wave|0),true);return {state:globalThis.__D3D.get(),wave:G?.endless||null};}:undefined,
  /* v43qa 立体机动探针 */
  qaVert:qaEnabled?()=>({
    plateaus:(G.plateaus||[]).map(pl=>({x:Math.round(pl.x),z:Math.round(pl.z),r:+pl.r.toFixed(1),h:+pl.h.toFixed(1)})),
    climbSurfaces:climbSurfaces.length,
    solids:(G.solids||[]).length,
    solidsTop:(G.solids||[]).filter(s=>s.top!==undefined).length,
    obstTop:(G.obstacles||[]).filter(o=>o.top!==undefined).length,
    vertStructs:vertStructs.length,
    vertAnims:vertAnims.length,
    topChest:(typeof worldInteractives!=="undefined")&&worldInteractives.some(it=>it.v43),
    rise:(()=>{if(!G.plateaus||!G.plateaus.length)return null;const pl=G.plateaus[0];return +(terrainHeight(pl.x,pl.z)-terrainHeight(pl.x+pl.r+3,pl.z+pl.r+3)).toFixed(2);})()
  }):undefined,
  qaVertStand:qaEnabled?()=>{
    const s=climbSurfaces.find(s2=>s2.top>terrainHeight(s2.x,s2.z)+2);
    if(!s)return {found:false};
    player.x=s.x;player.z=s.z;player.y=s.top+1.75;player.vy=0;player.onGround=true;
    const g=querySupport(player.x,player.z,player.y-1.7,true);
    return {found:true,top:+s.top.toFixed(2),support:+g.toFixed(2),holds:Math.abs(g-s.top)<.01};
  }:undefined,
  qaVertStep:qaEnabled?()=>{
    const s=climbSurfaces.find(s2=>{const h=s2.top-terrainHeight(s2.x,s2.z);return h>.2&&h<=1.0;});
    if(!s)return {found:false};
    player.x=s.x-2.4;player.z=s.z;player.y=terrainHeight(player.x,player.z)+1.7;player.vy=0;player.onGround=true;
    const sup=querySupport(s.x,s.z,player.y-1.7,true);
    return {found:true,lowTop:+s.top.toFixed(2),supportAtTarget:+sup.toFixed(2),stepUpWorks:sup>=s.top-0.01};
  }:undefined,
  qaVertSpit:qaEnabled?()=>{
    player.x=10;player.z=10;player.y=terrainHeight(10,10)+1.7;
    G.spitPulses=[];
    const sy=terrainHeight(-8,-8)+1,dy=(terrainHeight(10,10)+9-.55)-sy,nd=Math.hypot(18,dy)||1;
    G.spitPulses.push({x:-8,y:sy,z:-8,vx:18/nd*6,vz:0,vy:dy/nd*6,life:3,r:1,dmg:8});
    for(let i=0;i<240;i++)tickSpitPulses(1/60,player.x,player.z);
    return {remaining:G.spitPulses.length,consumed:G.spitPulses.length===0};
  }:undefined
};`,"qa hooks"]];
let ok=true;
for(const f of ["潮声之下_深渊潜航3D_v22.html","潮声之下_深渊潜航3D_手机版.html"])ok=patch(f,reps)&&ok;
process.exit(ok?0:1);
