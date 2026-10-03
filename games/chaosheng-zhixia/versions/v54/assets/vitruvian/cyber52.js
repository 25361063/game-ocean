/* Original cybernetic accessories and weapon silhouettes; no gameplay changes. */
window.CYBER52=(()=>{
 const T=THREE,accents=[0x43f4e0,0xffbd52,0xff4bad];
 function kit(id=1){const color=accents[id-1]||accents[0],linear=n=>new T.Color(n).convertSRGBToLinear();return {dark:new T.MeshStandardMaterial({color:linear(0x111a22),roughness:.48,metalness:.65}),metal:new T.MeshStandardMaterial({color:linear(0x50606a),roughness:.32,metalness:.85}),glow:new T.MeshBasicMaterial({color,toneMapped:false}),rubber:new T.MeshStandardMaterial({color:linear(0x090e16),roughness:.94}),color};}
 function mesh(g,geo,mat,p=[0,0,0]){const m=new T.Mesh(geo,mat);m.position.set(...p);g.add(m);m.castShadow=true;return m;}
 function box(g,mat,p,s){const [w,h,d]=s,r=Math.min(w,h,d)*.14,shape=new T.Shape();const pts=[[-w/2+r,-h/2],[w/2-r,-h/2],[w/2,-h/2+r],[w/2,h/2-r],[w/2-r,h/2],[-w/2+r,h/2],[-w/2,h/2-r],[-w/2,-h/2+r]];shape.moveTo(...pts[0]);pts.slice(1).forEach(v=>shape.lineTo(...v));shape.closePath();const geo=new T.ExtrudeGeometry(shape,{depth:d-r*.4,steps:1,bevelEnabled:true,bevelThickness:r*.2,bevelSize:r*.2,bevelSegments:2});geo.translate(0,0,-d/2+r*.2);const b=mesh(g,geo,mat,p);return b;}
 function cylinder(g,mat,p,r,h){const m=mesh(g,new T.CylinderGeometry(r,r,h,16),mat,p);m.rotation.x=Math.PI/2;return m;}
 function ring(g,mat,p,r,t=.006){return mesh(g,new T.TorusGeometry(r,t,8,32),mat,p);}
 function cable(g,mat,points,r=.008){return mesh(g,new T.TubeGeometry(new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p))),16,r,6,false),mat);}
 function weapon(id){const g=new T.Group(),k=kit(id);g.name=['NEON-Railgun52','ARC-Breaker52','HEX-Launcher52'][id-1];g.userData.cyber52=true;
  box(g,k.dark,[0,0,-.27],[.16,.15,.48]);box(g,k.rubber,[0,-.135,-.10],[.075,.22,.12]).rotation.x=-.2;
  box(g,k.metal,[0,.088,-.30],[.07,.025,.40]);
  for(const s of [-1,1]){box(g,k.metal,[s*.09,0,-.32],[.035,.115,.36]);box(g,k.glow,[s*.11,.025,-.32],[.006,.012,.28]);for(let i=0;i<5;i++)box(g,k.rubber,[s*.11,-.024,-.18-i*.05],[.008,.04,.014]);}
  if(id===1){for(const s of [-1,1]){box(g,k.metal,[s*.047,0,-.66],[.035,.075,.38]);box(g,k.glow,[s*.026,0,-.66],[.008,.035,.34]);}ring(g,k.glow,[0,0,-.80],.058);cylinder(g,k.dark,[0,.12,-.36],.035,.17);ring(g,k.glow,[0,.12,-.46],.022,.004);}
  if(id===2){box(g,k.dark,[0,0,-.61],[.36,.22,.20]);for(const s of [-1,1]){box(g,k.metal,[s*.21,0,-.61],[.08,.25,.24]);box(g,k.glow,[s*.253,0,-.61],[.007,.17,.17]);}ring(g,k.glow,[0,0,-.73],.063);cable(g,k.glow,[[-.10,-.05,-.2],[-.16,-.1,-.4],[-.16,-.05,-.56]]);}
  if(id===3){cylinder(g,k.dark,[0,-.045,-.28],.145,.20);for(let i=0;i<6;i++){const a=i*Math.PI/3;cylinder(g,k.metal,[Math.sin(a)*.11,Math.cos(a)*.11-.045,-.29],.024,.22);}cylinder(g,k.metal,[0,0,-.63],.085,.34);ring(g,k.glow,[0,0,-.81],.073,.009);ring(g,k.dark,[0,0,-.82],.088,.014);}
  box(g,k.glow,[.085,.082,-.17],[.06,.006,.09]);return g;
 }
 function dress(body,bones,role){const id={explorer:1,guardian:2,hunter:3}[role]||1,k=kit(id),chest=new T.Group();chest.name='CyberHarness52';body.add(chest);
  for(const s of [-1,1]){box(chest,k.rubber,[s*.13,1.31,.135],[.045,.24,.028]).rotation.z=s*.14;cable(chest,k.glow,[[s*.06,1.46,.08],[s*.135,1.37,.14],[s*.14,1.21,.14]],.003);box(chest,k.dark,[s*.12,1.10,.15],[.07,.09,.04]);}
  box(chest,k.metal,[0,1.26,.154],[.075,.075,.035]);ring(chest,k.glow,[0,1.26,.18],.022,.003);
  const spine=new T.Group();body.add(spine);for(let i=0;i<6;i++){box(spine,k.dark,[0,1.10+i*.05,-.125],[.10,.033,.04]);box(spine,k.glow,[0,1.10+i*.05,-.15],[.022,.018,.008]);}
  body.updateMatrixWorld(true);if(bones.Spine2){bones.Spine2.attach(chest);bones.Spine2.attach(spine);}
  if(bones.Head){const implant=new T.Group();body.add(implant);box(implant,k.metal,[-.105,1.635,.035],[.018,.032,.055]);cable(implant,k.glow,[[-.095,1.641,.07],[-.074,1.62,.093],[-.064,1.601,.095]],.002);body.updateMatrixWorld(true);bones.Head.attach(implant);}
  for(const side of ['Left','Right']){const b=bones[side+'ForeArm'];if(b){box(b,k.dark,[0,.12,-.042],[.075,.15,.028]);box(b,k.glow,[0,.12,-.059],[.041,.075,.004]);}}
  // Holstered silhouette is visible in third-person; first-person keeps its own viewmodel.
  if(bones.Spine2){const holster=weapon(id);holster.scale.setScalar(.6);holster.rotation.set(Math.PI/2,0,.30);holster.position.set(.16,1.15,-.20);body.add(holster);body.updateMatrixWorld(true);bones.Spine2.attach(holster);}
 }
 function projectile(p){const g=new T.Group(),k=kit(p.wid||1);g.name='CyberProjectile52';g.userData={playerProjectile:true,cyberProjectile52:true};
  if(p.wid===3){const core=mesh(g,new T.IcosahedronGeometry(.16,1),k.dark);for(let i=0;i<3;i++){const band=ring(g,k.glow,[0,0,0],.175,.014);band.rotation.set(i*Math.PI/3,i*.7,0);}cylinder(g,k.glow,[0,0,.15],.048,.05);}
  else{const core=mesh(g,new T.ConeGeometry(p.wid===2?.085:.045,.35,8),k.glow,[0,0,.10]);core.rotation.x=Math.PI/2;ring(g,k.metal,[0,0,-.02],p.wid===2?.10:.065);}
  const trailMat=new T.MeshBasicMaterial({color:k.color,transparent:true,opacity:.38,depthWrite:false,blending:T.AdditiveBlending});
  for(let i=0;i<3;i++){const tail=mesh(g,new T.ConeGeometry(.05-i*.011,.34,8),trailMat,[0,0,-.23-i*.28]);tail.rotation.x=-Math.PI/2;}
  g.position.set(p.x,p.y,p.z);g.lookAt(p.x+p.vx,p.y+(p.vy||0),p.z+p.vz);return g;
 }
 function preview(){const scene=new T.Scene();scene.background=new T.Color(0x101420);scene.add(new T.HemisphereLight(0xb2d9ed,0x151523,1.7));const light=new T.DirectionalLight(0xe0eaff,2);light.position.set(2,5,3);scene.add(light);for(let i=1;i<=3;i++){const w=weapon(i);w.position.set((i-2)*1.2,.20,0);w.rotation.set(.15,-.6,.05);scene.add(w);const p=projectile({wid:i,x:(i-2)*1.2,y:-.35,z:0,vx:.5,vy:0,vz:1});p.scale.setScalar(.65);scene.add(p);}const camera=new T.PerspectiveCamera(38,innerWidth/innerHeight,.01,30);camera.position.set(1.2,1.6,4.2);camera.lookAt(0,0,-.2);const renderer=new T.WebGLRenderer({antialias:true});renderer.setSize(innerWidth,innerHeight);renderer.outputEncoding=T.sRGBEncoding;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.domElement.id='cyberPreview52';renderer.domElement.style.cssText='position:fixed;inset:0;z-index:99999';document.body.appendChild(renderer.domElement);renderer.render(scene,camera);return true;}
 return {weapon,dress,projectile,preview};
})();
