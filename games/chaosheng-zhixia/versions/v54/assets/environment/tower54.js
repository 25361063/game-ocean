/* Shared tower geometry, support and route. World-space heights throughout. */
(function(root){
 'use strict';
 const TAU=Math.PI*2, api={towers:[]};
 const mix=(a,b,t)=>a+(b-a)*t;
 api.floor=(m,terrain)=>Number.isFinite(m.floor54)?m.floor54:terrain(m.x,m.z);
 api.point=(t,u)=>({x:t.x+Math.cos(t.ang0+u*TAU)*t.R,z:t.z+Math.sin(t.ang0+u*TAU)*t.R,y:t.base+u*t.height});
 api.support=function(t,x,z,feet,grounded){
  const dx=x-t.x,dz=z-t.z,d=Math.hypot(dx,dz),tops=[];
  if(d<t.inner+.12)tops.push(t.top);
  if(d>=t.inner&&d<=t.outer){const a=((Math.atan2(dz,dx)-t.ang0)%TAU+TAU)%TAU;tops.push(t.base+a/TAU*t.height);if(a<.025)tops.push(t.top);}
  const c=Math.cos(t.ang0),s=Math.sin(t.ang0),along=dx*c+dz*s,side=-dx*s+dz*c;
  if(along>=0&&along<=t.R+.1&&Math.abs(side)<.40)tops.push(t.top);
  if(along>=t.R-.2&&along<=t.outer+4.2&&Math.abs(side)<1.35)tops.push(mix(t.base,t.entry.y,Math.max(0,Math.min(1,(along-t.outer)/4))));
  let best=-Infinity;for(const h of tops)if(h<=feet+(grounded?.18:.15))best=Math.max(best,h);return best;
 };
 api.locate=(x,z,y)=>api.towers.find(t=>Math.hypot(x-t.x,z-t.z)<t.outer+.3&&y>t.base+.35&&Math.abs(api.support(t,x,z,y,true)-y)<.65);
 api.nearest=function(t,p){let best=0,score=Infinity;for(let i=0;i<t.path.length;i++){const q=t.path[i],v=(q.x-p.x)**2+(q.z-p.z)**2+4*(q.y-p.y)**2;if(v<score){best=i;score=v;}}return best;};
 api.navigate=function(m,player,dt,G,terrain,collision,hit,events){
  m.routing54=false;const floor=api.floor(m,terrain),target=api.locate(player.x,player.z,player.y-1.7),own=api.locate(m.x,m.z,floor),t=own||api.towers[m.routeTower54]||target;
  if(!t||Math.hypot(m.x-t.x,m.z-t.z)>36)return false;
  if(own===target&&own&&floor>t.top-.05&&player.y-1.7>t.top-.05&&Math.hypot(m.x-t.x,m.z-t.z)<t.inner-.2){delete m.routeTower54;return false;}
  m.routeTower54=api.towers.indexOf(t);
  if(own)m.enteredTower54=true;
  m.routing54=true;m.leap=null;m.airY=0;m.atk=null;m.windup=0;
  if(Math.abs(floor-(player.y-1.7))<1.2&&Math.hypot(m.x-player.x,m.z-player.z)<2.2){
   m.towerAttack54=(m.towerAttack54||0)+dt;
   if(m.towerAttack54>=.65){m.towerAttack54=-1;if(hit(8))events.push({type:'hurt',mx:m.x,mz:m.z});}return true;
  }
  m.towerAttack54=0;
  const here=api.nearest(t,{x:m.x,z:m.z,y:floor}),goal=target===t?api.nearest(t,{x:player.x,z:player.z,y:player.y-1.7}):0;
  const q=t.path[here],distance=Math.hypot(q.x-m.x,q.z-m.z),idx=distance>1.2?here:Math.max(0,Math.min(t.path.length-1,here+Math.sign(goal-here)));let next=t.path[idx];
  if(!m.enteredTower54){
   if(Math.hypot(m.x-t.entry.x,m.z-t.entry.z)<.4)m.enteredTower54=true;
   else{const a=Math.atan2(m.z-t.z,m.x-t.x),delta=Math.atan2(Math.sin(t.ang0-a),Math.cos(t.ang0-a)),rad=Math.hypot(m.x-t.x,m.z-t.z);next=Math.abs(delta)>.18?{x:t.x+Math.cos(a+Math.sign(delta)*Math.min(Math.abs(delta),.22))*(t.outer+4),z:t.z+Math.sin(a+Math.sign(delta)*Math.min(Math.abs(delta),.22))*(t.outer+4)}:t.entry;if(rad>13)next={x:t.x+Math.cos(a)*(t.outer+4),z:t.z+Math.sin(a)*(t.outer+4)};}
  }
  if(!target&&goal===0&&here===0&&distance<.45){m.floor54=terrain(m.x,m.z);m.routing54=false;delete m.routeTower54;delete m.enteredTower54;return false;}
  const dx=next.x-m.x,dz=next.z-m.z,len=Math.hypot(dx,dz),step=Math.min(len,dt*(m.type==='dart'||m.type==='swarm'?3.6:2.8)*(m.rust?.slow||1));
  if(len>.01){const pos=collision(m.x+dx/len*step,m.z+dz/len*step,.7,floor+1.7);m.x=pos[0];m.z=pos[1];m.facing=Math.atan2(dx,dz);}
  let ground=terrain(m.x,m.z);const sup=api.support(t,m.x,m.z,floor,true);if(Number.isFinite(sup))ground=Math.max(ground,sup);
  m.floor54=ground;return true;
 };
 api.build=function(x,z,ang0,terrain){
  const T=root.THREE,g=new T.Group(),R=4.3,height=6.4,inner=3.0,outer=5.6;let base=-Infinity;
  for(let i=0;i<64;i++)base=Math.max(base,terrain(x+Math.cos(i/64*TAU)*outer,z+Math.sin(i/64*TAU)*outer));base+=.12;
  const t={x,z,ang0,R,height,inner,outer,base,top:base+height,g,pos:{x,z},turns:1};
  t.entry={x:x+Math.cos(ang0)*(outer+4),z:z+Math.sin(ang0)*(outer+4)};t.entry.y=terrain(t.entry.x,t.entry.z)+.08;
  const steel=new T.MeshStandardMaterial({color:0x304f62,metalness:.65,roughness:.38}),dark=new T.MeshStandardMaterial({color:0x172d3b,metalness:.75,roughness:.48}),gold=new T.MeshStandardMaterial({color:0xbd9160,metalness:.65,roughness:.35}),glow=new T.MeshBasicMaterial({color:0x65f4de,toneMapped:false});
  function mesh(geo,mat,px,py,pz){const m=new T.Mesh(geo,mat);m.position.set(px,py,pz);m.castShadow=m.receiveShadow=true;g.add(m);return m;}
  function beam(a,b,r,mat){const d=new T.Vector3().subVectors(b,a),m=mesh(new T.CylinderGeometry(r,r,d.length(),8),mat,(a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2);m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());return m;}
  function v(r,a,y){return new T.Vector3(Math.cos(a)*r,y,Math.sin(a)*r);}
  mesh(new T.CylinderGeometry(2.1,2.55,height,16),dark,0,height/2,0);
  for(let i=0;i<8;i++){const a=i/8*TAU;beam(v(2.35,a,0),v(2.05,a,height),.10,gold);for(let j=1;j<4;j++)mesh(new T.BoxGeometry(.08,.48,.16),glow,Math.cos(a)*2.22,j*1.4,Math.sin(a)*2.22);}
  // Wedge treads share exactly the same angular domain as the smooth support ramp.
  for(let i=0;i<80;i++){const a=ang0+i/80*TAU,b=ang0+(i+1)/80*TAU,h=(i+1)/80*height;
   const shape=new T.Shape();shape.moveTo(Math.cos(a)*inner,Math.sin(a)*inner);shape.lineTo(Math.cos(a)*outer,Math.sin(a)*outer);shape.absarc(0,0,outer,a,b,false);shape.lineTo(Math.cos(b)*inner,Math.sin(b)*inner);shape.absarc(0,0,inner,b,a,true);
   const geo=new T.ExtrudeGeometry(shape,{depth:.14,bevelEnabled:false,curveSegments:2});geo.rotateX(Math.PI/2);mesh(geo,steel,0,h,0);
   beam(v(inner,a,h+.025),v(outer,a,h+.025),.025,i%5===0?gold:glow);
   if(i%4===0){for(const r of [inner,outer])beam(v(r,a,h),v(r,a,h+.92),.045,steel);}
   if(i<79){beam(v(outer,a,h+.92),v(outer,b,h+height/80+.92),.035,glow);beam(v(inner,a,h+.92),v(inner,b,h+height/80+.92),.035,gold);}
  }
  mesh(new T.CylinderGeometry(inner,inner,.20,64),steel,0,height-.10,0);
  const bridge=mesh(new T.BoxGeometry(1.55,.20,1.0),steel,Math.cos(ang0)*3.65,height-.1,Math.sin(ang0)*3.65);bridge.rotation.y=-ang0;
  for(let i=3;i<61;i++){const a=ang0+i/64*TAU,b=ang0+(i+1)/64*TAU;beam(v(inner,a,height+.95),v(inner,b,height+.95),.045,glow);if(i%4===0)beam(v(inner,a,height),v(inner,a,height+.95),.06,steel);}
  // Foundation piles reach the sampled ground; no floating feet.
  for(let i=0;i<8;i++){const a=i/8*TAU,r=2.5,low=terrain(x+Math.cos(a)*r,z+Math.sin(a)*r)-base;beam(v(r,a,low),v(r,a,.08),.28,steel);mesh(new T.CylinderGeometry(.48,.62,.18,8),dark,Math.cos(a)*r,low,Math.sin(a)*r);}
  const start=api.point(t,0),lip={x:x+Math.cos(ang0)*outer,z:z+Math.sin(ang0)*outer,y:base},end=t.entry,mid=new T.Vector3((lip.x+end.x)/2-x,(lip.y+end.y)/2-base,(lip.z+end.z)/2-z),ramp=mesh(new T.BoxGeometry(2.7,.16,Math.hypot(4,lip.y-end.y)),steel,mid.x,mid.y-.08,mid.z);ramp.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),new T.Vector3(end.x-lip.x,end.y-lip.y,end.z-lip.z).normalize());
  mesh(new T.CylinderGeometry(.5,.7,.7,10),gold,0,height+.35,0);mesh(new T.OctahedronGeometry(.3),glow,0,height+1,0);
  t.path=[];for(let i=0;i<=16;i++)t.path.push({x:mix(end.x,lip.x,i/16),z:mix(end.z,lip.z,i/16),y:mix(end.y,lip.y,i/16)});for(let i=1;i<=4;i++)t.path.push({x:mix(lip.x,start.x,i/4),z:mix(lip.z,start.z,i/4),y:base});for(let i=1;i<=80;i++)t.path.push(api.point(t,i/80));for(let i=1;i<=12;i++)t.path.push({x:mix(start.x,x,i/12),z:mix(start.z,z,i/12),y:t.top});
  // Batch static treads/rails by material: four draw calls instead of hundreds.
  g.updateMatrixWorld(true);const batches=new Map();for(const m of g.children){if(!m.isMesh)continue;const geo=m.geometry.index?m.geometry.toNonIndexed():m.geometry.clone();geo.applyMatrix4(m.matrixWorld);if(!batches.has(m.material))batches.set(m.material,[]);batches.get(m.material).push(geo);m.geometry.dispose();}g.clear();
  for(const [mat,geos] of batches){const joined=new T.BufferGeometry();for(const name of ['position','normal','uv']){const size=geos[0].getAttribute(name).itemSize,array=new Float32Array(geos.reduce((n,q)=>n+q.getAttribute(name).array.length,0));let offset=0;for(const q of geos){array.set(q.getAttribute(name).array,offset);offset+=q.getAttribute(name).array.length;}joined.setAttribute(name,new T.BufferAttribute(array,size));}for(const q of geos)q.dispose();joined.computeBoundingSphere();mesh(joined,mat,0,0,0);}
  g.position.set(x,base,z);g.name='AbyssRelayTower54';return t;
 };
 root.TOWER54=api;
})(globalThis);
