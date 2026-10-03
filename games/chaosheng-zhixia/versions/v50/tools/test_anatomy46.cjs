const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('潮声之下_深渊潜航3D_v22.html','utf8');
const scripts=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
const c=vm.createContext({console,lowQ:false,organicBumpTex:null});vm.runInContext(scripts.find(s=>s.includes('THREE={}')&&s.length>100000),c);
vm.runInContext(html.slice(html.indexOf('function buildAnatomy46('),html.indexOf('function buildMonsterMesh(')),c);
for(const q of [true,false])for(const type of ['gray','elite','shield','dart','swarm','spitter','acid','sniper','reefCrab','kelpLeviathan','abyssJelly','voidWhale','handX']){
 c.lowQ=q;c.type=type;vm.runInContext('m=buildAnatomy46(type,false);m.updateMatrixWorld(true);box=new THREE.Box3().setFromObject(m)',c);
 for(const axis of ['x','y','z'])assert.ok(Number.isFinite(c.box.min[axis])&&Number.isFinite(c.box.max[axis]));
 let tris=0;c.m.traverse(o=>{if(o.isMesh){const g=o.geometry;tris+=(g.index?g.index.count:g.attributes.position.count)/3;}});assert.ok(tris<18000,type+' budget '+tris);
}
console.log('PASS: 13 archetypes × 2 quality levels, finite bounds and geometry budget');
