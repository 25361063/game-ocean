/* Original procedural hard-surface scenery. All coordinates stay inside legacy footprints. */
window.ARCH50=(()=>{
 const T=THREE;
 function palette(chapter){return [{metal:0x315057,edge:0x7e9c9b,light:0x74dfd1},{metal:0x625047,edge:0xbda982,light:0xffc075},{metal:0x30483e,edge:0x7c9785,light:0xa8e5a0},{metal:0x493942,edge:0x99828a,light:0xef8195},{metal:0x252f42,edge:0x8b97ae,light:0xbbcbff}][Math.max(0,Math.min(4,chapter))];}
 function kit(chapter){
  const p=palette(chapter),c=document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d');x.fillStyle='#9ba5a4';x.fillRect(0,0,256,256);
  for(let i=0;i<1400;i++){const a=(i*73)%256,b=(i*137)%256;x.fillStyle=i%3?'#88928f':'#b5bab4';x.fillRect(a,b,1+(i%7),1);}
  x.strokeStyle='#566967';x.lineWidth=3;x.strokeRect(9,9,238,238);x.strokeStyle='#d3d2c0';x.lineWidth=1;x.strokeRect(13,13,230,230);
  for(let i=0;i<4;i++){x.fillStyle='#3b4b4b';x.beginPath();x.arc(i%2?236:20,i<2?20:236,3,0,7);x.fill();}
  const map=new T.CanvasTexture(c);map.encoding=T.sRGBEncoding;map.anisotropy=4;
  const mat=(color,roughness,metalness,extra={})=>new T.MeshStandardMaterial({color:new T.Color(color).convertSRGBToLinear(),roughness,metalness,...extra});
  return {shell:mat(p.metal,.62,.48,{map}),edge:mat(p.edge,.43,.65),dark:mat(0x17242b,.78,.35),stone:mat(0x657a78,.93,.08,{map}),gold:mat(0xb6a077,.46,.65),light:mat(p.light,.3,.25,{emissive:p.light,emissiveIntensity:1.2}),glass:mat(0x16343b,.22,.48),p};
 }
 function factory(chapter){
  const k=kit(chapter),g=new T.Group();g.name='Architecture50';
  function mesh(geo,mat,pos=[0,0,0],parent=g){const m=new T.Mesh(geo,mat);m.position.set(...pos);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
  function box(w,h,d,pos,mat=k.shell,parent=g){const r=Math.min(w,h,d)*.12,s=new T.Shape();s.moveTo(-w/2+r,-h/2);s.lineTo(w/2-r,-h/2);s.quadraticCurveTo(w/2,-h/2,w/2,-h/2+r);s.lineTo(w/2,h/2-r);s.quadraticCurveTo(w/2,h/2,w/2-r,h/2);s.lineTo(-w/2+r,h/2);s.quadraticCurveTo(-w/2,h/2,-w/2,h/2-r);s.lineTo(-w/2,-h/2+r);s.quadraticCurveTo(-w/2,-h/2,-w/2+r,-h/2);const geo=new T.ExtrudeGeometry(s,{depth:Math.max(.001,d-r*.4),bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:r*.2,bevelThickness:r*.2,curveSegments:3});geo.translate(0,0,-d/2+r*.2);return mesh(geo,mat,pos,parent);}
  function cylinder(r1,r2,h,pos,mat=k.shell){return mesh(new T.CylinderGeometry(r1,r2,h,32),mat,pos);}
  function ring(r,t,pos,mat=k.edge){const m=mesh(new T.TorusGeometry(r,t,8,48),mat,pos);m.rotation.x=Math.PI/2;return m;}
  function pipe(points,r=.04,mat=k.edge){return mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p))),24,r,8,false),mat);}
  function plateLabel(text,w,h,pos){const c=document.createElement('canvas');c.width=512;c.height=128;const ctx=c.getContext('2d');ctx.fillStyle='#101c23';ctx.fillRect(0,0,512,128);ctx.fillStyle='#d8d8ba';ctx.font='bold 46px monospace';ctx.fillText(text,22,62);ctx.fillStyle='#79b6ad';for(let i=0;i<22;i++)ctx.fillRect(22+i*13,90,3+i%3,17);const tx=new T.CanvasTexture(c);tx.encoding=T.sRGBEncoding;return mesh(new T.PlaneGeometry(w,h),new T.MeshStandardMaterial({map:tx,roughness:.7,metalness:.15}),pos);}
  return {g,k,mesh,box,cylinder,ring,pipe,plateLabel};
 }
 function cargo(w=1.9,h=1,d=1.9,chapter=0){const f=factory(chapter),{g,k,box,plateLabel}=f;g.name='PressureCargo50';box(w*.94,h*.92,d*.94,[0,h*.48,0]);box(w,h*.12,d,[0,h*.94,0],k.edge);box(w,h*.12,d,[0,h*.06,0],k.dark);
  for(const s of [-1,1]){box(w*.10,h*.82,d*.99,[s*w*.35,h*.49,0],k.dark);box(w*.11,h*.19,.026,[s*w*.35,h*.55,d*.505],k.gold);box(w*.16,.055,.025,[s*w*.22,h*.78,d*.503],k.edge);}
  plateLabel('SHIP / 04',w*.45,h*.25,[0,h*.5,d*.503]);box(w*.2,.025,.025,[0,h*.19,d*.51],k.light);return g;
 }
 function wreck(w,h,d,chapter=0){const f=factory(chapter),{g,k,box,pipe,plateLabel}=f;g.name='WreckBulkhead50';box(w*.97,h*.97,d*.95,[0,h*.485,0]);box(w,.07,d,[0,h-.04,0],k.dark);
  for(let i=0;i<5;i++){const px=(i-2)*w*.19;box(w*.025,h*.96,d*.99,[px,h*.5,0],k.edge);box(w*.14,h*.56,.035,[px,h*.45,d*.49],k.dark);}
  for(const s of [-1,1])pipe([[-w*.43,h*.15,s*d*.51],[-w*.2,h*.23,s*d*.51],[w*.15,h*.14,s*d*.51],[w*.42,h*.35,s*d*.51]],.035,k.gold);
  plateLabel('HULL / 7',w*.22,h*.16,[-w*.23,h*.82,d*.51]);return g;
 }
 function landmark(level=1){const chapter=Math.min(4,Math.floor((level-1)/20)),f=factory(chapter),{g,k,box,cylinder,ring,pipe,plateLabel,mesh}=f;g.name='ShipMonument50';
  cylinder(2.65,2.9,.38,[0,.19,0],k.dark);cylinder(2.45,2.65,.24,[0,.50,0],k.edge);ring(2.37,.034,[0,.65,0],k.light);
  const h=chapter===2?7.3:chapter===4?9:6.5;
  cylinder(1.38,1.65,h-.8,[0,h/2+.4,0],k.shell);
  for(let i=0;i<8;i++){const a=i*Math.PI/4,xx=Math.sin(a),zz=Math.cos(a);const rib=box(.18,h,.35,[xx*1.72,h/2+.65,zz*1.72],k.edge);rib.rotation.y=a;
   const panel=box(.7,h*.42,.10,[xx*1.49,h*.55,zz*1.49],k.dark);panel.rotation.y=a;
   const window=box(.07,h*.32,.045,[xx*1.55,h*.55,zz*1.55],k.light);window.rotation.y=a;
   const foot=box(.50,.7,.75,[xx*2.12,.95,zz*2.12],k.shell);foot.rotation.y=a;
   pipe([[xx*2.2,.75,zz*2.2],[xx*2.1,1.4,zz*2.1],[xx*1.75,1.8,zz*1.75]],.07,k.gold);
  }
  for(const yy of [1.6,h*.52,h-.05]){cylinder(1.88,1.88,.16,[0,yy,0],k.dark);ring(1.87,.028,[0,yy+.085,0],k.light);}
  cylinder(1.86,2.04,.32,[0,h+.62,0],k.shell);cylinder(1.62,1.86,.3,[0,h+.93,0],k.edge);
  const crown=new T.Group();crown.position.y=h+1.5;g.add(crown);
  if(chapter===1){for(let i=0;i<3;i++){const disk=mesh(new T.TorusGeometry(1.1+i*.18,.08,10,48),k.gold,[0,0,0],crown);disk.rotation.x=Math.PI/2+i*.3;}}
  else if(chapter===3){for(let s=-1;s<=1;s++){const fin=box(.35,1.6,.9,[s*.72,h+1.65,0],k.shell);fin.rotation.z=-s*.15;}}
  else{const dish=mesh(new T.TorusGeometry(1.05,.09,10,64),k.edge,[0,0,0],crown);dish.rotation.x=.18;const inner=mesh(new T.TorusGeometry(.85,.028,8,48),k.light,[0,0,.03],crown);inner.rotation.x=.18;}
  const orb=mesh(new T.IcosahedronGeometry(.28,2),k.light,[0,h+1.5,0]);
  plateLabel(['ARCHIVE / 01','THERMAL / 02','VAULT / 03','COMMAND / 04','TRANSIT / 05'][chapter],1.8,.45,[0,1.22,1.85]);
  g.userData={kind:'landmark',phase:level*.9,animated:[],coreRing:crown,coreOrb:orb,architecture50:true};return g;
 }
 function reinforce(g,kind,chapter=0){const f=factory(chapter),{k,box,ring,cylinder}=f;g.updateMatrixWorld(true);const bound=new T.Box3();for(const c of g.children){if(c.isMesh){c.geometry.computeBoundingBox();const b=c.geometry.boundingBox.clone().applyMatrix4(c.matrix);bound.union(b);}}if(bound.isEmpty())return;
  const size=bound.getSize(new T.Vector3()),h=bound.max.y,r=Math.min(size.x,size.z)*.45;
  if(kind==='column'){for(let i=0;i<5;i++){const y=.5+(h-.7)*i/4;ring(r*(1-.10*i/4),.045,[0,y,0],k.edge);}for(let i=0;i<8;i++){const a=i*Math.PI/4;const p=box(.10,h*.7,.16,[Math.sin(a)*r*.82,h*.48,Math.cos(a)*r*.82],k.dark);p.rotation.y=a;}}
  if(kind==='platform'){cylinder(r*.98,r*.72,.35,[0,h-.5,0],k.shell);ring(r*.92,.045,[0,h-.05,0],k.edge);for(let i=0;i<10;i++){const a=i*Math.PI/5;const rail=box(.4,.07,.10,[Math.sin(a)*r,h,Math.cos(a)*r],k.light);rail.rotation.y=a;}}
  if(kind==='terrace'){for(let i=0;i<3;i++){ring(3.36-i*.84,.035,[0,i+1.01,0],k.edge);for(let j=0;j<8;j++){const a=j*Math.PI/4;const p=box(.32,.27,.06,[Math.sin(a)*(3.38-i*.85),i+.65,Math.cos(a)*(3.38-i*.85)],k.dark);p.rotation.y=a;}}}
  g.add(f.g);g.userData.architecture50=true;
 }
 function terminal(chapter=0){const f=factory(chapter),{g,k,box,plateLabel}=f;g.name='ArchiveTerminal50';box(.65,.18,.5,[0,.09,0],k.dark);box(.34,.85,.30,[0,.5,0]);const screen=box(.68,.48,.09,[0,1.02,.045],k.edge);screen.rotation.x=-.20;plateLabel('LOG / 07',.56,.30,[0,1.06,.103]);box(.42,.018,.025,[0,.79,.12],k.light);return g;}
 function preview(){const scene=new T.Scene();scene.background=new T.Color(0x101921);scene.add(new T.HemisphereLight(0xc1dfdf,0x30302a,1.3));const sun=new T.DirectionalLight(0xffdfb0,2);sun.position.set(-8,16,12);scene.add(sun);const rim=new T.DirectionalLight(0x5babbf,2);rim.position.set(5,8,-5);scene.add(rim);const models=[landmark(1),landmark(21),landmark(81),cargo(),wreck(3.8,2,2.3),terminal()];models.forEach((m,i)=>{m.position.set((i%3-1)*7,0,i<3?-3:5);scene.add(m);});const floor=new T.Mesh(new T.PlaneGeometry(45,30),new T.MeshStandardMaterial({color:0x26333b,roughness:.85}));floor.rotation.x=-Math.PI/2;floor.position.y=-.05;scene.add(floor);const camera=new T.PerspectiveCamera(45,innerWidth/innerHeight,.1,100);camera.position.set(16,13,24);camera.lookAt(0,3,0);const renderer=new T.WebGLRenderer({antialias:true});renderer.setSize(innerWidth,innerHeight);renderer.outputEncoding=T.sRGBEncoding;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.9;renderer.domElement.id='sceneryPreview50';renderer.domElement.style.cssText='position:fixed;inset:0;z-index:99999';document.body.appendChild(renderer.domElement);renderer.render(scene,camera);return models.length;}
 function habitat(r,h,chapter=0){const f=factory(chapter),{g,k,box,pipe,plateLabel}=f;g.name='BuriedServiceCabin50';const w=r*1.35,d=r*1.25;box(w,h*.9,d,[0,h*.45,0]);box(w*1.04,h*.08,d*1.04,[0,h*.95,0],k.edge);for(const s of [-1,1]){box(w*.08,h*.87,d*1.02,[s*w*.42,h*.44,0],k.dark);box(w*.23,h*.26,.028,[s*w*.24,h*.63,d*.505],k.glass);box(w*.21,.025,.03,[s*w*.24,h*.79,d*.51],k.light);}box(w*.25,h*.65,.045,[0,h*.35,d*.51],k.dark);plateLabel('SERVICE',w*.24,h*.13,[0,h*.58,d*.54]);for(let i=0;i<5;i++)box(.025,h*.10,.03,[w*.19+i*w*.06,h*.23,d*.52],k.edge);pipe([[-w*.44,h*.25,-d*.51],[0,h*.35,-d*.51],[w*.44,h*.22,-d*.51]],.025,k.gold);return g;}
 return {landmark,cargo,wreck,reinforce,terminal,habitat,preview};
})();
