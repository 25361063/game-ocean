const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('潮声之下_深渊潜航3D_v22.html','utf8');
for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))new vm.Script(m[1]);
const diag=fs.readFileSync('联机诊断.html','utf8');
for(const m of diag.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))new vm.Script(m[1]);
const code=html.slice(html.indexOf('let netWs=null'),html.indexOf('/* ===== v44 免服务器直连'));
const base=process.env.TEST_BASE||'http://127.0.0.1:18123';
function client(fetchImpl){
  const nodes={netStatus:{textContent:''},dcStatus:{textContent:''}};
  const ctx=vm.createContext({console,WebSocket,AbortController,setTimeout,clearTimeout,setInterval,clearInterval,
    fetch:fetchImpl||((path,opts)=>fetch(base+path,opts)),location:new URL(base),
    document:{getElementById:id=>nodes[id]},toast:()=>{},scene:{remove:()=>{}},disposeRoots:()=>{},G:null});
  vm.runInContext(code,ctx);
  return {ctx,nodes,run:s=>vm.runInContext(s,ctx)};
}
async function until(check){
  for(let i=0;i<100;i++){if(check())return;await new Promise(r=>setTimeout(r,30));}
  throw Error('timeout');
}
(async()=>{
  const a=client(),b=client(),c=client();
  try{
    await a.run("netConnect('UI-TEST')");
    await until(()=>a.nodes.netStatus.textContent.includes('1/2'));
    assert.match(a.nodes.netStatus.textContent,/连接成功/);
    await b.run("netConnect('UI-TEST')");
    await until(()=>a.nodes.netStatus.textContent.includes('2/2')&&b.nodes.netStatus.textContent.includes('2/2'));
    await c.run("netConnect('UI-TEST')");
    await until(()=>c.nodes.netStatus.textContent.includes('房间已满'));
    a.run('netDisconnect(true)');
    await until(()=>b.nodes.netStatus.textContent.includes('1/2'));
    await a.run("netConnect('UI-TEST')");
    await until(()=>a.nodes.netStatus.textContent.includes('2/2'));
    // A delayed health response must not resurrect a cancelled connection.
    let release;
    const slow=client(()=>new Promise(r=>release=r));
    const pending=slow.run("netConnect('CANCEL')");
    slow.run('netDisconnect(true)');
    release({ok:true,json:async()=>({service:'tide-coop',protocol:2})});
    await pending;
    assert.equal(slow.run('netWs'),null);
    const old=client(async()=>({ok:false,status:404}));
    await old.run("netConnect('TEST')");
    assert.match(old.nodes.netStatus.textContent,/版本不匹配/);
    const wrong=client(async()=>({ok:true,json:async()=>({service:'other',protocol:2})}));
    await wrong.run("netConnect('TEST')");
    assert.match(wrong.nodes.netStatus.textContent,/不是兼容/);
    console.log('PASS: all inline script syntax; real frontend joins, full room, leave/rejoin, stale callback, old/wrong server');
  }finally{for(const p of [a,b,c])p.run('netDisconnect(true)');}
})().catch(e=>{console.error(e);process.exitCode=1;});
