/* Vitruvian CC0 geometry. Original procedural locomotion; no Mixamo clips. */
window.VIT49={ready:null,build:null};
VIT49.ready=(async()=>{
 const T=THREE,D=window.VIT49_DATA;if(!D)throw Error('Vitruvian asset package missing');
 const loader=new T.GLTFLoader(),sources={},maps={};
 await Promise.all(Object.entries(D.models).map(async([key,b64])=>{const bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));sources[key]=await new Promise((r,j)=>loader.parse(bytes.buffer,'',r,j));}));
 await Promise.all(Object.entries(D.textures).map(async([key,url])=>{maps[key]=await new T.TextureLoader().loadAsync(url);maps[key].flipY=false;maps[key].encoding=key==='opacity'?T.LinearEncoding:T.sRGBEncoding;maps[key].anisotropy=4;}));
 function clone(source){const out=source.clone(true),lookup=new Map();function pair(a,b){lookup.set(a,b);a.children.forEach((c,i)=>pair(c,b.children[i]));}pair(source,out);out.traverse(o=>{if(!o.isMesh)return;o.geometry=o.geometry.clone();if(o.isSkinnedMesh){const original=[...lookup].find(p=>p[1]===o)[0];o.skeleton=original.skeleton.clone();o.skeleton.bones=original.skeleton.bones.map(b=>lookup.get(b));o.bind(o.skeleton,original.bindMatrix.clone());}o.frustumCulled=false;o.castShadow=true;o.receiveShadow=true;});return out;}
 function tex(key){const t=maps[key].clone();t.needsUpdate=true;return t;}
 VIT49.build=function(role){
  const g=new T.Group(),body=clone(sources.body.scene),head=clone(sources.head.scene),hair=clone(sources.hair.scene),skinTint=role==='guardian'?0xe4d4c6:role==='hunter'?0xe8c9b7:0xffffff;
  g.name='Vitruvian-'+role;g.add(body);body.add(head,hair);
  const colors={explorer:0x194f4a,guardian:0xb5b0a0,hunter:0x552c3b};
  function material(m){const n=m.name;let p={name:n,roughness:.7,metalness:0};
   if(/VitSkin/.test(n))Object.assign(p,{map:tex('face'),color:new T.Color(skinTint).convertSRGBToLinear(),roughness:.65});
   else if(/VitBody/.test(n))Object.assign(p,{map:tex('body'),color:new T.Color(skinTint).convertSRGBToLinear(),roughness:.65});
   else if(/Iris/.test(n))Object.assign(p,{color:0x24382e,roughness:.3});
   else if(/Sclera/.test(n))Object.assign(p,{map:tex('sclera'),roughness:.27});
   else if(/Shirt/.test(n))Object.assign(p,{color:new T.Color(colors[role]||colors.explorer).convertSRGBToLinear(),roughness:.86});
   else if(/Pants|Shoes/.test(n))Object.assign(p,{color:new T.Color(0x182229).convertSRGBToLinear(),roughness:.83});
   else if(/Mouth|Caruncle|Tear/.test(n))Object.assign(p,{color:0x693b35,roughness:.5});
   else Object.assign(p,{color:0x201c1b});
   return new T.MeshStandardMaterial(p);
  }
  body.traverse(o=>{if(o.isMesh)o.material=Array.isArray(o.material)?o.material.map(material):material(o.material);});
  head.traverse(o=>{if(/Cornea|Eyeshadow|EyeBack/.test(o.name)||o.isMesh&&/Cornea|Eyeshadow|EyeBack/.test(o.material.name))o.visible=false;});
  hair.traverse(o=>{if(o.isMesh)o.material=new T.MeshStandardMaterial({name:'Vitruvian hair',map:tex('hair'),alphaMap:tex('opacity'),alphaTest:.32,side:T.DoubleSide,color:new T.Color(role==='guardian'?0xc8c6bc:0x51423b).convertSRGBToLinear(),roughness:.9,depthWrite:true});});
  if(role==='guardian')hair.traverse(o=>{if(o.isMesh){o.material.map=null;o.material.color.setHex(0x777b80).convertSRGBToLinear();}});
  // The upstream eyeballs expect a Godot procedural shader, not ordinary UV mapping.
  head.traverse(o=>{if(o.isMesh&&/Eye_|Eyeshadow|Tearline|Lacrimal/.test(o.name))o.visible=false;});
  for(const side of [-1,1]){
   const eye=new T.Mesh(new T.SphereGeometry(.0118,20,12),new T.MeshStandardMaterial({color:0xd0c5b7,roughness:.35}));eye.position.set(side*.03347,1.634408,.04676);head.add(eye);
   const ir=new T.Mesh(new T.SphereGeometry(.0062,20,12),new T.MeshStandardMaterial({color:new T.Color(role==='guardian'?0x544832:0x293d39).convertSRGBToLinear(),roughness:.43}));ir.scale.z=.32;ir.position.set(side*.03347,1.634408,.0576);head.add(ir);
   const pupil=new T.Mesh(new T.SphereGeometry(.0026,12,8),new T.MeshStandardMaterial({color:0x080a0b,roughness:.25}));pupil.scale.z=.35;pupil.position.set(side*.03347,1.634408,.0594);head.add(pupil);
  }
  body.updateMatrixWorld(true);const bones={};body.traverse(o=>{if(o.isBone)bones[o.name.replace(/[^a-zA-Z]/g,'').replace('mixamorig','')]=o;});
  if(bones.Head){bones.Head.attach(head);bones.Head.attach(hair);}
  const wardrobe=fitCaptainWardrobe49(body,bones,role);
  const rest={};Object.entries(bones).forEach(([k,b])=>rest[k]=b.quaternion.clone());
  function rotate(name,axis,angle){const b=bones[name];if(b)b.quaternion.copy(rest[name]).multiply(new T.Quaternion().setFromAxisAngle(axis,angle));}
  const x=new T.Vector3(1,0,0),z=new T.Vector3(0,0,1);
  function aim(name,dir){const b=bones[name];if(!b)return;b.quaternion.copy(rest[name]);body.updateMatrixWorld(true);const parentQ=b.parent.getWorldQuaternion(new T.Quaternion()),current=b.getWorldQuaternion(new T.Quaternion()),worldY=new T.Vector3(0,1,0).applyQuaternion(current),desired=dir.clone().applyQuaternion(g.getWorldQuaternion(new T.Quaternion())).normalize();b.quaternion.copy(parentQ.invert().multiply(new T.Quaternion().setFromUnitVectors(worldY,desired).multiply(current)));}
  function animate(t,speed){const swing=Math.sin(t*7)*speed*.48;rotate('Spine2',x,Math.sin(t*1.7)*.008);aim('LeftArm',new T.Vector3(.12,-1,swing));aim('RightArm',new T.Vector3(-.12,-1,-swing));aim('LeftForeArm',new T.Vector3(.02,-1,.12+swing));aim('RightForeArm',new T.Vector3(-.02,-1,.12-swing));rotate('LeftUpLeg',x,swing);rotate('RightUpLeg',x,-swing);rotate('LeftLeg',x,-Math.max(0,-swing)*.8);rotate('RightLeg',x,-Math.max(0,swing)*.8);}
  const update=(t,speed)=>{animate(t,speed);wardrobe.update(t,speed);};update(0,0);g.userData={human49:true,animate:update,armL:new T.Group(),armR:new T.Group(),legL:new T.Group(),legR:new T.Group(),accent:colors[role],lamp:new T.Object3D()};
  return g;
 };
 window.VIT49_DATA=null;
})();
