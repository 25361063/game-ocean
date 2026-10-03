const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('潮声之下_深渊潜航3D_v22.html','utf8');
for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))new vm.Script(m[1]);
const code=html.slice(html.indexOf('let netWs=null'),html.indexOf('/* ===== v44 免服务器直连'));
function make(id){
  const cls={add:()=>{}},out=[];
  const c=vm.createContext({console,Date,document:{getElementById:()=>({classList:cls})},
    G:null,S:{MENU:'MENU',PLAYING:'PLAYING',PAUSED:'PAUSED',OVER:'OVER',WIN:'WIN'},
    LEVELS:Array(100),storyDone:()=>{throw Error('stale callback');},storyPages:[],storyPageIndex:0,
    storyModalActive:true,storyOverlay:{classList:cls},storyMeta:{deepest:0},
    saveStoryMeta:()=>{},input:{setEnabled:()=>{},reset:()=>{}},retryCount:3,
    toast:()=>{},spawnGauntletWave:()=>{},spots:()=>[],out,loads:[],wins:0});
  vm.runInContext(code,c);
  vm.runInContext(`netId='${id}';netHost='host';netConnected=true;
    netSend=m=>{out.push({...m,idx:netId});return true;};
    objectiveMet=()=>G._netObjectiveComplete||G.samples>=3;
    setEnding=s=>{G.ending=s;G.state=s;};
    setOver=win=>{if(win)wins++;G.state=S.OVER;};
    loadLevel=(idx,carry)=>{loads.push(idx);G={...carry,level:idx+1,modeId:'campaign',state:S.PLAYING,samples:0,monsters:[]};};
  `,c);
  return {c,run:s=>vm.runInContext(s,c),deliver:m=>{c.message=JSON.stringify(m);vm.runInContext('netHandleMsg({data:message})',c);}};
}
const host=make('host'),guest=make('guest');
function reset(p,level=1){p.c.G={level,modeId:'campaign',state:'PLAYING',samples:0,kills:0,time:0,score:20,gold:10,objective:{kind:'scan',points:[{},{}]},monsters:[]};}
reset(host);reset(guest);
guest.c.G.scanDone=[true,false];guest.c.G.scanHold=[2.4,1.2];guest.c.G.defendProgress=5;
host.deliver({...guest.run('netMissionSnapshot()'),idx:'guest'});
assert.equal(host.c.G.scanDone[0],true);assert.equal(host.c.G.scanHold[1],1.2);assert.equal(host.c.G.defendProgress,5);
host.deliver({t:'mission',scope:'campaign:9:initial',complete:true});assert.ok(!host.c.G._netObjectiveComplete);
// Guest completes; a paused host accepts the shared completion and commits once.
host.c.G.state='PAUSED';guest.c.G.samples=3;
guest.run('netRequestExit()');host.deliver(guest.c.out.shift());
assert.equal(host.c.G.level,2);assert.equal(host.c.loads.length,1);
const commit=host.c.out.shift();guest.deliver(commit);
assert.equal(guest.c.G.level,2);assert.equal(guest.c.loads.length,1);
assert.equal(host.run('netStageScope()'),guest.run('netStageScope()'));
assert.equal(guest.c.storyDone,null);
guest.deliver(commit);host.deliver({t:'exit_request',scope:commit.scope,mission:{complete:true}});
assert.equal(guest.c.loads.length,1);assert.equal(host.c.loads.length,1);
guest.deliver({t:'mission',scope:commit.scope,complete:true,samples:99});
assert.equal(guest.c.G.samples,0);
// A non-host cannot force a transition.
guest.deliver({t:'stage_exit',idx:'guest',scope:guest.run('netStageScope()'),next:2,epoch:'fake'});
assert.equal(guest.c.G.level,2);
// Final level produces one victory per client, including a dead teammate.
reset(host,100);reset(guest,100);guest.c.G.state='OVER';host.c.G.samples=3;
host.run('netRequestExit()');const end=host.c.out.shift();guest.deliver(end);guest.deliver(end);
assert.equal(host.c.wins,1);assert.equal(guest.c.wins,1);
assert.equal(guest.c.G.ending,'WIN');
// Completion is sticky for every objective; lower or delayed progress cannot
// close a gate that another player has already unlocked.
for(const kind of ['collect','kill','elite','survive','scan','hybrid','defend','gauntlet','gate']){
  reset(host,3);host.c.G.objective.kind=kind;
  host.deliver({t:'mission',scope:host.run('netStageScope()'),idx:'guest',samples:2,kills:7,time:90,defendComplete:true,complete:true});
  host.deliver({t:'mission',scope:host.run('netStageScope()'),idx:'guest',samples:0,kills:0,time:1,complete:false});
  assert.equal(host.c.G.kills,7);assert.equal(host.c.G.time,90);
  assert.equal(host.c.G._netObjectiveComplete,true);assert.equal(host.c.G.winOpen,true);
}
// A guest follows only the host's reinforcement wave.
reset(guest,4);guest.c.G.objective={kind:'gauntlet',waves:3};guest.c.G.gauntletWave=1;
guest.deliver({t:'mission',scope:guest.run('netStageScope()'),idx:'guest',wave:2});
assert.equal(guest.c.G.gauntletWave,1);
guest.deliver({t:'mission',scope:guest.run('netStageScope()'),idx:'host',wave:2});
assert.equal(guest.c.G.gauntletWave,2);
console.log('PASS: shared scan/defend progress, cross-stage isolation, guest-triggered team exit, paused host, duplicate exit, stale callback, final team victory');
