/* Original fitted captain wardrobe, attached to the imported Vitruvian skeleton. */
window.fitCaptainWardrobe49=function(body,bones,role){
 const T=THREE,leather=role==='hunter',ivory=role==='guardian';
 const base=ivory?0xc6bfa9:leather?0x49232d:0x174c45;
 const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const ctx=canvas.getContext('2d');ctx.fillStyle='#808080';ctx.fillRect(0,0,128,128);
 for(let y=0;y<128;y+=2)for(let x=0;x<128;x+=2){const v=leather?110+((x*17+y*23)%39):((x+y)%4?105:160);ctx.fillStyle=`rgb(${v},${v},${v})`;ctx.fillRect(x,y,1,leather?1:2);}
 const weave=new T.CanvasTexture(canvas);weave.wrapS=weave.wrapT=T.RepeatWrapping;weave.repeat.set(5,5);
 const cloth=new T.MeshStandardMaterial({color:new T.Color(base).convertSRGBToLinear(),roughness:leather?.5:.88,bumpMap:weave,bumpScale:leather?.0006:.00035,side:T.DoubleSide});
 const trim=new T.MeshStandardMaterial({color:new T.Color(ivory?0xaa8950:leather?0xa3a39a:0xb5a071).convertSRGBToLinear(),metalness:.7,roughness:.4});
 const dark=new T.MeshStandardMaterial({color:new T.Color(0x11191a).convertSRGBToLinear(),roughness:.65});
 body.traverse(o=>{if(o.isMesh&&/VitShirt/.test(o.material?.name)){o.material.color.copy(cloth.color);o.material.roughness=cloth.roughness;o.material.bumpMap=weave.clone();o.material.bumpMap.needsUpdate=true;o.material.bumpScale=.0004;}});
 const torso=new T.Group();torso.name='TailoredCaptainDetails';body.add(torso);
 function mesh(parent,name,geo,mat,p){const m=new T.Mesh(geo,mat);m.name=name;if(p)m.position.set(...p);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
 function seam(parent,pts){return mesh(parent,'tailored-piping',new T.TubeGeometry(new T.CatmullRomCurve3(pts.map(p=>new T.Vector3(...p))),18,.0015,4,false),trim);}
 // Fitted stand collar and turned lapels, not rigid armour plates.
 const collar=mesh(torso,'stand-collar',new T.CylinderGeometry(.065,.083,.058,40,2,true,.3,Math.PI*2-.6),cloth,[0,1.475,.003]);collar.scale.z=.84;
 for(const s of [-1,1]){
  const points=[[s*.068,1.49,.072],[s*.142,1.395,.116],[s*.115,1.30,.15],[s*.024,1.355,.15]];
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(points.flat(),3));geo.setAttribute('uv',new T.Float32BufferAttribute([0,1,1,1,1,0,0,0],2));geo.setIndex([0,1,2,0,2,3]);geo.computeVertexNormals();mesh(torso,'folded-lapel',geo,cloth);seam(torso,[points[0],points[1],points[2]]);
  const pocket=mesh(torso,'welt-pocket',new T.BoxGeometry(.068,.014,.009),cloth,[s*.127,1.14,.113]);pocket.rotation.z=-s*.12;
 }
 seam(torso,[[0,1.32,.148],[0,1.20,.14],[0,1.065,.126]]);
 for(let i=0;i<4;i++){const button=mesh(torso,'uniform-button',new T.CylinderGeometry(.0048,.0048,.003,12),trim,[.024,1.10+i*.047,.139]);button.rotation.x=Math.PI/2;}
 const badge=mesh(torso,'captain-insignia',new T.CylinderGeometry(.022,.022,.006,32),trim,[-.123,1.39,.13]);badge.rotation.x=Math.PI/2;
 const insignia=mesh(torso,'insignia-inset',new T.TorusGeometry(.014,.0018,6,28),dark,[-.123,1.39,.135]);
 body.updateMatrixWorld(true);if(bones.Spine2)bones.Spine2.attach(torso);
 const lower=new T.Group();lower.name='SplitLongCoat';body.add(lower);
 const length=ivory?.43:leather?.56:.49,top=1.03,rows=16,cols=64,pos=[],uv=[],idx=[];
 // Front opening and generous hem clearance let the legs step independently.
 for(let r=0;r<=rows;r++){const f=r/rows,rad=.177+.092*f;for(let c=0;c<=cols;c++){const a=.25+c/cols*(Math.PI*2-.5),fold=Math.sin(a*10)*.003*f;pos.push(Math.sin(a)*(rad+fold),top-length*f+Math.pow(Math.max(0,Math.cos(a)),6)*.045*f,Math.cos(a)*(rad*.70+fold)-.01);uv.push(c/cols,f);if(r<rows&&c<cols){const k=r*(cols+1)+c;idx.push(k,k+1,k+cols+1,k+1,k+cols+2,k+cols+1);}}}
 const skirtGeo=new T.BufferGeometry();skirtGeo.setAttribute('position',new T.Float32BufferAttribute(pos,3));skirtGeo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));skirtGeo.setIndex(idx);skirtGeo.computeVertexNormals();const skirt=mesh(lower,'tailored-split-coattails',skirtGeo,cloth);
 const belt=mesh(lower,'leather-belt',new T.CylinderGeometry(.178,.18,.035,48,1,true),dark,[0,1.027,-.01]);belt.scale.z=.7;
 mesh(lower,'belt-clasp',new T.BoxGeometry(.036,.03,.01),trim,[0,1.027,.121]);
 if(bones.Hips){body.updateMatrixWorld(true);bones.Hips.attach(lower);}
 for(const side of ['Left','Right']){
  const elbow=bones[side+'ForeArm'];if(elbow){const cover=mesh(elbow,'soft-elbow-fold',new T.SphereGeometry(.060,20,12),cloth,[0,.018,0]);cover.scale.y=1.05;}
  for(const part of ['Arm','ForeArm']){const b=bones[side+part],next=bones[side+(part==='Arm'?'ForeArm':'Hand')];if(!b||!next)continue;const len=next.position.length(),fore=part==='ForeArm',profile=[[fore?.035:.052,0],[fore?.044:.058,len*.35],[fore?.045:.054,len*.7],[fore?.036:.047,len]].map(p=>new T.Vector2(...p));mesh(b,'fitted-'+side+part,new T.LatheGeometry(profile,24),cloth);if(fore){mesh(b,'tailored-cuff',new T.CylinderGeometry(.038,.04,.035,24),cloth,[0,len-.01,0]);const stud=mesh(b,'cuff-fastener',new T.SphereGeometry(.004,8,6),trim,[.039,len-.014,0]);}}
 }
 return {skirt,update(t,speed){skirt.rotation.x=Math.sin(t*7)*speed*.035;skirt.rotation.z=Math.sin(t*3.5)*speed*.025;}};
};
