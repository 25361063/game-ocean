window.MOBILE57={init(api){
 if(!document.documentElement.classList.contains('is-touch'))return;
 const $=id=>document.getElementById(id),ui=$('touchUI'),hud=$('hud');
 const create=(id,text,label)=>{const b=document.createElement('button');b.type='button';b.id=id;b.className='tbtn';b.textContent=text;b.setAttribute('aria-label',label);ui.appendChild(b);return b;};
 const more=create('btnInfo57','更多','展开战况、装备和辅助操作'),aim=create('btnAim57','⊕','切换瞄准镜');more.setAttribute('aria-controls','mobilePanel57');more.setAttribute('aria-expanded','false');aim.setAttribute('aria-pressed','false');
 const moveHint=document.createElement('div');moveHint.id='moveHint57';moveHint.textContent='拖动移动';ui.appendChild(moveHint);
 for(const id of ['btnJump','btnDash','btnCam','btnShop','btnSink']){const b=$(id);if(b.dataset.bicon){b.style.backgroundImage='url("'+b.dataset.bicon+'")';b.style.backgroundSize='56% 56%';b.style.backgroundPosition='center 28%';b.style.backgroundRepeat='no-repeat';b.textContent='';}}
 for(const [selector,label] of [['.premise-card','世界背景'],['.mode-intel','模式说明']]){const el=document.querySelector('#menu '+selector);if(el){const fold=document.createElement('details');fold.className='mobile-fold57';const summary=document.createElement('summary');summary.textContent=label;el.before(fold);fold.append(summary,el);}}
 const dock=document.createElement('div');dock.id='mobileLaunch57';$('menu').appendChild(dock);dock.appendChild($('startBtn'));
 const background=document.querySelector('.mobile-fold57:has(.premise-card)');if(background&&$('paneArchive'))$('paneArchive').prepend(background);
 const modeGroup=document.querySelector('#menu .run-setup>.setup-group:first-child');if(modeGroup){const fold=document.createElement('details');fold.className='mobile-fold57 mode-fold57';fold.innerHTML='<summary>下潜模式 · 100 层分岔航路</summary>';modeGroup.before(fold);fold.appendChild(modeGroup);}
 const rotate=document.createElement('div');rotate.id='rotate57';rotate.innerHTML='<div><span style="font-size:40px;color:#97e8d3">↻</span><h2>横屏下潜</h2><p>请将手机横过来，左右手分别控制移动与战斗。</p><button type="button" id="rotateButton57">进入横屏</button><small id="rotateNote57">若未自动旋转，请关闭手机的屏幕方向锁定。</small></div>';document.body.appendChild(rotate);
 $('rotateButton57').addEventListener('click',async()=>{try{if(!document.fullscreenElement&&document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();if(screen.orientation?.lock)await screen.orientation.lock('landscape');}catch(e){$('rotateNote57').textContent='此浏览器不支持自动横屏，请手动旋转手机。';}});
 const modeFold=document.querySelector('.mode-fold57');if(modeFold)document.querySelector('#menu .run-setup').appendChild(modeFold);
 const wifi=$('wifiMulti');if(wifi){const fold=document.createElement('details');fold.className='mobile-fold57';fold.innerHTML='<summary>联机 · 房间与邀请码</summary>';wifi.before(fold);fold.appendChild(wifi);}
 for(const id of ['btnSink','btnJump']){const b=$(id);b.addEventListener('pointerdown',e=>{try{b.setPointerCapture(e.pointerId);}catch(_){}});}
 const panel=document.createElement('section');panel.id='mobilePanel57';panel.setAttribute('aria-label','战况与辅助操作');panel.innerHTML='<h3>战况与装备</h3><div class="tools57"></div>';hud.appendChild(panel);
 for(const [id,label] of [['btnCam','视角'],['btnShop','装备库'],['btnSink','下潜']]){panel.querySelector('.tools57').appendChild($(id));$(id).dataset.label57=label;$(id).setAttribute('aria-label',label);}
 const first=hud.querySelector('.top>div:first-child');panel.appendChild(first.children[2]);panel.appendChild(hud.querySelector('.top>.right'));panel.appendChild($('runBuildStrip'));
 function close(){panel.classList.remove('open');document.body.classList.remove('mobile-more57');more.setAttribute('aria-expanded','false');more.textContent='更多';}
 more.addEventListener('pointerdown',e=>{e.preventDefault();const open=panel.classList.toggle('open');document.body.classList.toggle('mobile-more57',open);more.setAttribute('aria-expanded',String(open));more.textContent=open?'收起':'更多';});
 aim.addEventListener('pointerdown',e=>{e.preventDefault();api.scope(!api.scoped());});
 // Stop gestures over HUD controls from reaching the joystick/look router.
 for(const el of [panel,$('objectiveCard'),$('minimapWrap')])for(const type of ['pointerdown','pointermove','pointerup','pointercancel'])el.addEventListener(type,e=>e.stopPropagation());
 $('objectiveCard').setAttribute('role','button');$('objectiveCard').tabIndex=0;$('objectiveCard').setAttribute('aria-expanded','false');
 const objectiveToggle=()=>{const open=$('objectiveCard').classList.toggle('expanded57');$('objectiveCard').setAttribute('aria-expanded',String(open));};$('objectiveCard').addEventListener('click',objectiveToggle);$('objectiveCard').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();objectiveToggle();}});
 $('minimapWrap').title='轻触展开战术地图';$('minimapToggle').setAttribute('aria-label','展开或收起战术地图');
 for(const [id,label] of [['btnPulse','射击'],['btnDash','闪避'],['btnJump','上浮'],['btnAim57','瞄准']]){$(id).dataset.label57=label;$(id).setAttribute('aria-label',label);}
 const observer=new MutationObserver(()=>{const eq=$('equipmentLive53');if(eq&&eq.parentElement!==panel){eq.open=false;panel.appendChild(eq);}});observer.observe(hud,{childList:true});
 let stamp=0;
 this.tick=()=>{const state=api.state(),playing=state.playing;if(playing&&innerHeight>innerWidth){api.pause();return;}document.body.classList.toggle('mobile-playing57',playing);ui.setAttribute('aria-hidden',String(!playing));if(!playing){close();return;}aim.hidden=!state.ranged;aim.style.display=state.ranged?'flex':'none';aim.setAttribute('aria-pressed',String(api.scoped()));if(performance.now()-stamp<200)return;stamp=performance.now();
  ['btnShield','btnOverdrive','btnWeapon'].forEach((id,i)=>{const label=state.skills[i]||'技能';$(id).dataset.label57=label;$(id).setAttribute('aria-label',label);});
 };
 window.addEventListener('resize',close);this.close=close;
}};
