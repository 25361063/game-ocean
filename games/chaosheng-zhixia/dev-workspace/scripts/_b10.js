
"use strict";
/* ============================================================
   潮声之下 · 深渊潜航（第一人称 3D）— 迁移版（Sprint1-S1）
   结构：Three.js 渲染层 + 逻辑模块 src/logic/logic.js（ADR-001）
   - 逻辑段已从原型迁出为独立模块，由上方
     <script src="../logic/logic.js"> 先行加载（浏览器形态挂 globalThis.__D3D_LOGIC）
   - 本脚本沿用 v0 词法引用（freshRun/updateResources/tick* 系列 / S / G 等），
     这些常量/函数现由逻辑模块的全局词法作用域提供，行为与 v0 一致
   ============================================================ */



/* ================= 引擎守卫（加载失败不白屏） ================= */
function webglOk(){
  try{
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl") || c.getContext("experimental-webgl")));
  }catch(e){ return false; }
}
function engineFail(msg){
  const note=document.getElementById("loadNote"),dismiss=document.getElementById("dismissErrorBtn");
  if(note)note.classList.remove("hidden");if(dismiss)dismiss.style.display="none";
  document.getElementById("loadTitle").textContent = "无法启动 3D 引擎";
  document.getElementById("loadMsg").textContent = msg;
}

/* ================= 渲染层（Three.js） ================= */
function showErr(msg){
  const note = document.getElementById("loadNote");
  const t = document.getElementById("loadTitle");
  const m = document.getElementById("loadMsg");
  const dismiss=document.getElementById("dismissErrorBtn");
  if(!note || !t || !m) return;
  globalThis.__D3D_RUNTIME_ERRORS=globalThis.__D3D_RUNTIME_ERRORS||[];
  globalThis.__D3D_RUNTIME_ERRORS.push({time:Date.now(),message:String(msg)});
  if(globalThis.__D3D && note.classList.contains("hidden")){
    if(typeof toast==="function")toast("检测到非致命错误，已自动继续运行");
    if(window.console&&console.warn)console.warn("[runtime-recovered]",msg);
    return;
  }
  note.classList.remove("hidden");
  t.textContent = "运行出错";
  m.innerHTML = String(msg) + "<br>可点击下方按钮重新加载。";
  if(dismiss)dismiss.style.display="block";
}
document.getElementById("dismissErrorBtn").addEventListener("click",()=>{document.getElementById("loadNote").classList.add("hidden");});
window.addEventListener("error", (e)=>{ if(e && e.message) showErr(e.message); });
window.addEventListener("unhandledrejection", (e)=>{ if(e && e.reason && e.reason.message) showErr(e.reason.message); });

/* 逻辑模块引用守卫（ADR-001）：src/logic/logic.js 未加载时快速失败并给出可读提示 */
if (!globalThis.__D3D_LOGIC) {
  engineFail("逻辑模块未加载：请确认已通过 <script src=\"../logic/logic.js\"> 引入 src/logic/logic.js");
  throw new Error("__D3D_LOGIC missing");
}
/* 输入抽象引用守卫（ADR-003）：src/input/ 未加载时快速失败（PC 键鼠也不可用） */
if (!globalThis.__D3D_INPUT) {
  engineFail("输入模块未加载：请确认已按序引入 src/input/virtual-joystick.js → touch-look.js → pointer.js");
  throw new Error("__D3D_INPUT missing");
}

function isSoftRenderer(r){
  try{
    const gl = r.getContext();
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    if(!ext) return false;
    const name = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)||"").toLowerCase();
    return /swiftshader|llvmpipe|software|basic render|microsoft basic/i.test(name);
  }catch(e){ return false; }
}

function boot(){
  if(!webglOk()){ engineFail("当前环境不支持 WebGL，无法运行 3D 游戏。"); return; }
  const STATE = S;
/* HOTFIX-IFRAME：内嵌预览环境标记 + Pointer Lock 失败提示防抖（仅 iframe 生效；PC 正常环境恒 false，行为零变化） */
const IS_IFRAME = (function(){ try{ return window.self !== window.top; }catch(e){ return false; } })();
let lockWarned = false;
let player = { x:0, y:6, z:0, vy:0, yaw:0, pitch:0, onGround:true };
let pulses = [];
/* v11：小地图使用独立 2D Canvas。静态海床仅在换关时重建，动态标记限频刷新。 */
const minimapEl=document.getElementById("minimap"),minimapCtx=minimapEl.getContext("2d"),minimapWrap=document.getElementById("minimapWrap"),minimapToggle=document.getElementById("minimapToggle"),minimapLevel=document.getElementById("minimapLevel");
const minimapLayer=document.createElement("canvas");minimapLayer.width=minimapEl.width;minimapLayer.height=minimapEl.height;
let minimapLastDraw=0,minimapExpanded=false;
let hi = 0;
let shownErr = false;
let hpWarned = false;   // CSD-H2：低血 hpwarn 一次性（进入低血瞬间提醒一次，防音频轰炸）
/* CSD-SOUL1-FUN：打击感状态——镜头震动 / 命中顿帧（慢动作）/ 受击红闪 */
let shake = 0;
let hitstop = 0;
let hurtFlash = 0;
let fovPunch=0;
function addShake(a){ shake = Math.min(1.2, Math.max(shake, a)); }
function addHitStop(t){ hitstop = Math.max(hitstop, t); }
try{ hi = parseInt(localStorage.getItem("chaosheng_dive3d_hi")||"0",10)||0; }catch(e){}
/* CSD-SOUL1-P1：魂系模式开——真实游戏启用招式池/三层预警/韧性·处决。
   注意：测试环境不调用此开关（soulOn=false 走原路径，132 测试不破）。 */
try{ globalThis.__D3D_LOGIC.setSoul(true); }catch(e){}
/* 存档（S5）：localStorage 读入 + 设置恢复。save.js 提供读写（__D3D_SAVE），
   无 localStorage / 损坏 JSON 均安全兜底（返回 null），不抛错。 */
const SAVE = globalThis.__D3D_SAVE || null;
const storage = (()=>{ try{ return (typeof localStorage !== "undefined" && localStorage) ? localStorage : null; }catch(e){ return null; } })();
const saved = SAVE ? SAVE.loadSave(storage) : null;
const settings = { sensitivity: 0.45, mute: false, vibrate: true, reduceFlicker: false, aimAssist: true };
/* v9：可实际改变通关路径与角色数值的运行配置。单独存储，兼容旧版存档。 */
const RUN_MODES={
  campaign:{name:"主线闯关",short:"主线",rule:"百关连续推进《星髓》五部主线：船、髓星、首领的椅子、荒凉、建造者；每四关出现阶段巨兽，每部各具专属机制，第100关见证大船驶向室女座。",scoreMul:1,boost:1,bossHpMul:1},
  endless:{name:"无尽深渊",short:"无尽",rule:"无限波次生存；每波结束三选一，每五波出现巨型 Boss，敌人、潮压与奖励同步升级。",scoreMul:1.15,boost:1,bossHpMul:1},
  expedition:{name:"星髓远征",short:"远征",rule:"完整体验原著五部主线；物证与洞察共同解锁原著结局。",scoreMul:1,boost:2,bossHpMul:1},
  stage:{name:"书记官复演",short:"复演",rule:"重演所选历史节点，击败守卫后直接生成校订档案。",scoreMul:1.2,boost:2,bossHpMul:1.08},
  bossRush:{name:"守卫协议",short:"协议",rule:"跳过调查目标，连续突破五个星髓守卫。",scoreMul:1.5,boost:3,bossHpMul:1.22}
};
const MODE_UI={
  campaign:{icon:"◈",label:"推荐",risk:"标准",flow:"100 关",text:"百关连续推进《星髓》五部。第二部起各部专属机制：力场侵蚀、反物质喷口、液氢寒潮、建造者光束。"},
  endless:{icon:"∞",label:"纪录挑战",risk:"递增",flow:"无限",text:"清空波次后立刻三选一构筑，敌群、潮压、掉落与巨兽强度无限成长。"},
  expedition:{icon:"✦",label:"完整叙事",risk:"较高",flow:"五部",text:"体验《星髓》五部主线，以物证与洞察塑造路线并解锁不同结局。"},
  stage:{icon:"◎",label:"自由复演",risk:"可控",flow:"单章",text:"从已解锁节点出发，快速练习任务、武器、角色技能与守卫战。"},
  bossRush:{icon:"⚠",label:"高危协议",risk:"极高",flow:"五战",text:"跳过调查与收集，连续挑战五类核心守卫，获得最高分数倍率。"}
};
const DIVER_ROLES={
  explorer:{name:"浣生 · 调查路线",shortName:"浣生",voice:"浣生",maxHp:70,moveMul:1,damageMul:1,weaponCoolMul:1,dashCoolMul:1,shieldDurationMul:1,shieldCoolMul:1,overdriveDurationMul:1,accent:0x63e8cf},
  guardian:{name:"迈尔辛 · 工程路线",shortName:"迈尔辛",voice:"迈尔辛",maxHp:90,moveMul:.92,damageMul:.95,weaponCoolMul:1.04,dashCoolMul:1.08,shieldDurationMul:1.42,shieldCoolMul:.72,overdriveDurationMul:1,accent:0x6fa8ff},
  hunter:{name:"帕米尔 · 突击路线",shortName:"帕米尔",voice:"帕米尔",maxHp:58,moveMul:1.15,damageMul:1.25,weaponCoolMul:.76,dashCoolMul:.68,shieldDurationMul:.82,shieldCoolMul:1.12,overdriveDurationMul:1.4,accent:0xff8a72}
};
/* v12：依据用户提供的《星髓》全文校订。战斗场景由书记官将原著事件映射为潜航复演。 */
const STORY_PROLOGUE=[
  {kicker:"大船 · 银河商业航线",title:"一艘会思考却不会说话的世界",speaker:"书记官",body:"人类在银河之外发现了大船：它有二十颗地球的质量，内部拥有海洋、城市与万族栖息地。首领船长把它经营成跨越银河的客轮，却没人知道是谁建造了它，也没人听见这艘船沉默的意识。"},
  {kicker:"核心异常 · 中微子记录",title:"悬在空腔里的铁世界",speaker:"迈尔辛",body:"巨船中央并非实心。超纤维空腔里悬着一颗火星大小的铁世界，髓星。它周期性膨胀、收缩，腔壁的量子力场托住它。署名首领的密令要求最优秀的船长秘密登陆。"},
  {kicker:"证据规则",title:"每一份命令都可能是武器",speaker:"浣生",body:"这不是寻找‘记忆碎片’的任务。你要回收物证、比对能量读数并询问证人。档案、神话、全息船长乃至你亲眼见到的异象，都可能是有人刻意制造的。"}
];
const ROLE_STORY={
  explorer:{intro:"我叫浣生。直觉能救命，但直觉必须接受证据的检验。先确认命令来自谁，再决定要为谁冒险。",death:"浣生的身体可以重生；若她的判断失败，大船上的万族却未必有第二次机会。",epilogue:"浣生成为首领的首席，并命人重新封闭通往髓星的豁口。"},
  guardian:{intro:"我是迈尔辛，首席副首领。工程不会讨好任何人：结构要么承重，要么崩塌。可权力比超纤维更容易让人误判。",death:"迈尔辛曾从一个头颅重生，也曾因看错自己的儿子而失去一切。",epilogue:"这一次，迈尔辛在权力与儿子之前选择了大船，亲手切断脊柱。"},
  hunter:{intro:"帕米尔。一级船长，麻烦制造者，也是最不肯放弃的人。找不到路，我就挖一条；没人敢反抗，我就先开火。",death:"帕米尔曾把自己封进远征船换取登船资格。疼痛从来不是他停下来的理由。",epilogue:"帕米尔联合雷莫拉人、哈鲁萨鲁和百族，拒绝首领宝座，把首席之位交给浣生。"}
};
const STORY_CHAPTERS=[
  {id:1,title:"第一部 · 船",name:"阿尔法海",summary:"大船、雷莫拉人与一份来历可疑的秘密命令。",intro:"在阿尔法海与船壳维护层完成战术校准。大船比任何国家都庞大；雷莫拉人终生住在真空船壳上维修超纤维。收集六份中微子与权限证据，核验那份‘首领密令’。",sample:["证据 01：大船从银河外飞来，现有船员不是建造者。","证据 02：密令使用首领全息形象，但通信源没有首领驻地的物理签名。","证据 03：核心中微子流呈球形扩散，源头被近两百公里厚的超纤维包围。"],bossAwake:"船壳清道夫把你识别成未授权钻探者。它守护的不是秘密，而是足以承受二十颗地球质量的结构。",bossDown:"清道夫停止攻击。权限日志证明：有人伪造首领身份，把浣生、迈尔辛等船长引向核心。",question:"面对尚未证实的密令，你选择什么调查原则？",seal:{label:"坚持物证",desc:"物证 +1 · 最大生命 +4",result:"你拒绝把全息形象当成授权，保存了源地址、材料年代与中微子读数。"},echo:{label:"追踪直觉",desc:"洞察 +1 · 结晶 +2",result:"你保留对异常的敏感，没有因为现有理论解释不了髓星就停止追查。"}},
  {id:2,title:"第二部 · 髓星",name:"髓星登陆区",summary:"事变、四千年文明，以及笛雾制造的建造者神话。",intro:"登陆队穿过蓝白支撑力场抵达髓星。‘事变’令力场合并，机械尽毁，幸存者被困近五千年。忠诚者与违望者在铁世界建立文明；你必须穿过锤翅兽群，找出神话背后的操纵者。",sample:["证据 04：所谓首领密令是笛雾伪造；真正的首领从未批准登陆。","证据 05：记忆库、建造者遗物与‘荒凉’故事由笛雾委托娱乐制造者伪造。","证据 06：提欧早已破解笛雾的存储器，却仍利用神话组织违望者。"],bossAwake:"锤翅母兽在永久白昼中进化了数百万代。它的攻击不是邪恶，而是髓星残酷生态的生存答案。",bossDown:"生态巨兽倒下，笛雾的供词浮出：他诱骗船长、培育文明，只为让自己的后代夺取大船。",question:"骗局已经被揭穿，为什么违望者仍然相信？",seal:{label:"拆穿伪证",desc:"物证 +1 · 最大生命 +4",result:"你逐条对照材料年代、权限链和制造记录，确认建造者档案是人为伪造。"},echo:{label:"追问梦的来源",desc:"洞察 +1 · 结晶 +2",result:"你注意到一个未解之处：笛雾最初的梦从何而来，提欧为何把骗子称作容器？"}},
  {id:3,title:"第三部 · 首领的椅子",name:"离奇族秘道",summary:"帕米尔寻人、迈尔辛夺船，洛克留下钟表线索。",intro:"帕米尔寻找失踪船长一百余年，在废弃的离奇族栖息地发现浣生的银表，并沿封死的燃料管道挖向核心。与此同时，提欧率违望者登船，迈尔辛割下首领的头，夺取控制中心。",sample:["证据 07：银表铭文来自浣生的后代，是洛克故意留下的求救线索。","证据 08：违望者从髓星反物质反应堆取得能量，几天内打通数百公里隧道。","证据 09：迈尔辛以合法首席自居，但她的军队、情报和权限均被提欧选择性控制。"],bossAwake:"潜伏在秘道的守卫使用洛克的作战档案：激光、假目标与近身处决。击败它，救出沉睡在液氢海中的浣生。",bossDown:"浣生复生。她判断提欧不是单纯利用宗教——某种比笛雾更早的意志，可能正透过梦影响违望者。",question:"夺船战争即将开始，你如何组织抵抗？",seal:{label:"联合百族",desc:"物证 +1 · 最大生命 +4",result:"帕米尔以大船法律召集雷莫拉人、哈鲁萨鲁、逃亡船长和人工智能。"},echo:{label:"说服洛克",desc:"洞察 +1 · 结晶 +2",result:"浣生没有读心，而是用可验证的幻境让洛克自愿说出提欧和髓星深层的秘密。"}},
  {id:4,title:"第四部 · 荒凉",name:"雷莫拉战线",summary:"内战、防护盾崩溃，以及监狱假说。",intro:"违望者进攻船壳城市，雷莫拉人破坏引擎与防护盾反抗。浣生返回髓星提出新假说：大船不是由行星改造而来，而是早期宇宙的建造者从物质源头逐层制造的监狱。撑过九十秒战争潮，切断违望者脊柱。",sample:["证据 10：髓星核心持续创造物质与反物质，整艘大船可能从核心向外生长。","证据 11：量子支撑力场不是桥梁，而是维持一百五十亿年的囚笼。","证据 12：‘荒凉’能越过囚笼影响笛雾、提欧和大船引擎；所谓守卫可能早已叛变。"],bossAwake:"失控航鲸接入脊柱，正在把荒凉的命令转发给全部十四座喷嘴。它会冲撞、召唤护航群并释放反物质脉冲。",bossDown:"脊柱断裂，迈尔辛以生命拖住提欧。帕米尔关停液氢洪水；浣生拒绝用数十亿髓星居民换取胜利。",question:"战争中，目标与手段必须同时受检验。",seal:{label:"保护大船",desc:"物证 +1 · 最大生命 +4",result:"你破坏引擎控制链，却保留船体承重、防护与生命维持系统。"},echo:{label:"拒绝屠星",desc:"洞察 +1 · 结晶 +2",result:"液氢威胁只是一场骗局。你在洪水落下前关泵，为髓星居民保留生路。"}},
  {id:5,title:"第五部 · 建造者",name:"建造者囚室",summary:"阻止恒星撞击，重封髓星，大船驶向室女座。",intro:"荒凉已控制引擎，要让大船擦过红巨星并坠入伴生黑洞。黑洞也许毁不掉它，反而会释放它。击溃最后的控制代行体，让百族破坏喷嘴、关闭阀门，并帮助会思考的大船第一次发出自己的选择。",sample:["证据 13：大船拥有意识；它听见了船员的行动，并在最后协助他们关闭正确的阀门。","证据 14：一团月球大小的铁镍物质撞击船侧，使大船避开红巨星。","证据 15：新的航线将离开银河，数千年后驶向室女座星团；髓星必须重新封闭。"],bossAwake:"建造者囚室代行体同时复制五类怪物技能，并借引擎震波改变战场。不要回应它的许诺，只攻击可验证的控制节点。",bossDown:"最后的喷嘴熄灭。大船避开恒星与黑洞，主动驶向星系间的黑暗。髓星上方等待着最后一道封闭命令。",question:"你要为这艘船选择怎样的未来？"}
];
const PART_ONE_RESOLUTIONS=[
  "校准完成。记录仪捕捉到一种无法归类的船体反馈，仿佛大船在注视船员。","阿尔法海航图恢复，万族城市与行星级管线在同一张图上展开。","雷莫拉维护日志证明，船壳上的生命并非附属品，而是大船不可替代的守护者。","失控清道夫停止运转；维修义务带来的贡献与伤痕都被写入档案。","翡尼克斯遗物被安全回收，浣生拒绝让永久死亡只剩一个统计数字。","浣生重新接过调查权限，但保留了对最高命令的怀疑。","盖亚冲突复演结束；帕米尔的方案危险，却阻止了更大的灭绝。","帕米尔通过复职校验，首领需要他的直觉来寻找失踪者。","召集名单完成核验，离开的全是最有经验、也最难被替代的船长。","黑色阿尔法协议被确认，它要求绝对服从，也切断了所有外部见证。","被抹去的航务痕迹重新出现：这不是普通任务，而是一场精心隐藏的集体消失。","中微子守卫崩解，信号源明确位于大船最深处。","空腔模型完成，所谓行星改造理论第一次出现致命裂缝。","结构压力测试通过；二十颗地球质量背后的建造技术仍无法解释。","铁世界的质量与尺寸得到交叉确认，它不是幻象，也不是普通行星。","支撑场中继关闭，通往空腔的安全窗口短暂出现。","髓星之名写入绝密档案，一支精英登陆队正式成形。","权限核验留下疑点：命令看似来自首领，却缺少应有的物理来源链。","秘密基地完成接驳，船员接受为登陆而设计的身体改造。","豁口守卫倒下，登陆桥伸向髓星。第一部结束，而真正的骗局刚刚开始。"
];
const PART_ONE_STORY=PART_ONE_STAGE_BLUEPRINTS.map((bp,i)=>({id:i+1,title:"第一部 · 船 / "+String(i+1).padStart(2,"0"),name:bp[0],summary:bp[1],intro:bp[1]+" 本关完成战术节点后，沿下行舱门继续推进。",sample:["现场证据："+bp[1],"书记官核验：该记录与大船的结构、航务和船长档案相互印证。","风险提示：任何最高权限命令都必须同时通过来源、物证与行为逻辑校验。"],bossAwake:bp[3]?"章节核心守卫封锁了本段航路。击败它才能继续调查。":"本段防卫协议已进入最高警戒。",bossDown:PART_ONE_RESOLUTIONS[i],question:"继续沿第一部航线推进。"}));
STORY_CHAPTERS.splice(0,STORY_CHAPTERS.length,...PART_ONE_STORY);
/* v25：第二部剧情章节点（21-40），与 PART_TWO_STAGE_BLUEPRINTS 一一对应 */
const PART_TWO_RESOLUTIONS=[
  "力场侵蚀数据被记录：它同时侵蚀生命与机器，却对超纤维无效。","超纤维桥的年代远早于登陆队——有人更早抵达，或从未离开。","磁暴记录拼出熔铁河的流向，河床之下埋着规则的几何结构。","黑色孢林样本证实：髓星生态以船体泄漏物为食，四千年的适应从这里开始。","轨道铁雨的成分与大船船壳一致——碎片来自事变之夜被撕碎的舰队。","事变的炮火轨迹指向大船：抛弃登陆队的命令，来自船上。","四年的足迹被完整复原，幸存者用最原始的方式延续了文明的火种。","营区记录显示：通讯中断并非事故，笛雾在第一夜就切断了真相。","锤翅唾液样本入库——中和力场的生物学方案成为两族合作的起点。","新生代的语言、记忆与忠诚都指向髓星；大船对他们只是传说。","分裂的谈判记录被保存：回去派与留下派都有不可辩驳的理由。","圣像的材料来自大船船骸——违望者用谎言的碎片建造了信仰。","高桥的每一根缆索都朝轨道生长：回家，是忠诚者唯一的教义。","空记忆库的空白过于整齐：这不是遗失，是有组织的删除。","可用记忆库的第一层档案被验证：伪造与真实第一次有了分界线。","美德使的叛逃路线被复原，她带走了指控笛雾的最后物证。","深层扫描确认隐藏结构的年代——比大船更古老的建造者确实存在。","炮弹车的弹道计算完成：它真能把人射回轨道，也能射进虚空。","笛雾的坦白被完整记录：远征、密令与神话，全是他一手编排。","炮弹车撕开轨道封锁，归航舱冲进大船豁口。第二部结束，清算开始。"
];
const PART_TWO_STORY=PART_TWO_STAGE_BLUEPRINTS.map((bp,i)=>({id:i+21,title:"第二部 · 髓星 / "+String(i+1).padStart(2,"0"),name:bp[0],summary:bp[1],intro:bp[1]+" 本关完成战术节点后，沿下行舱门继续推进。",sample:["现场证据："+bp[1],"书记官核验：该记录与登陆队日志、锤翅猎群行为和记忆库残档相互对照。","风险提示：记忆碎片分‘伪造档案’与‘可验证证据’，采集越多，越接近笛雾的操纵链。"],bossAwake:bp[3]?"髓星生态的顶级猎手封锁了本段大陆。击败它才能继续跋涉。":"本段防卫协议已进入最高警戒。",bossDown:PART_TWO_RESOLUTIONS[i],question:"继续沿第二部航线推进。"}));
STORY_CHAPTERS.splice(STORY_CHAPTERS.length,0,...PART_TWO_STORY);
/* v26：第三至五部剧情章节点（41-100） */
const PART_THREE_RESOLUTIONS=[
  "银表仍在走动。停摆之城的心脏，为一位百年后的访客重新跳动。","离奇族的全城日志被回收：他们记载的最后一条命令，来自‘首领’本人。","管道内壁的切割痕迹是近期留下的——封锁核心的，是船上自己人。","失踪船长名录完成核验：帕米尔的名字旁边，多了一行‘仍在寻找’。","反物质隧道的走向被测绘完毕：违望者的工程学，源自笛雾的存储器。","登船仪式的誓词被录下：违望者把大船称作‘被偷走的应许之地’。","巨像投下的阴影经过测绘：它指向的‘圣地’，正是大船的控制中心。","熔融梯井底部找到锻造残渣——违望者已经在船上开始了武装。","首领的头颅仍在低语。迈尔辛以首席权限，第一次听见了大船的静默。","权限迷宫的第三层留有后门：提欧的钥匙，比迈尔辛的官印更老。","服从筛选的名单被截获：被扣留的军队，收到的都是伪造的放弃令。","提欧退入隧道深处。他把母亲的名字，从‘亲人’划进了‘障碍’。","液氢海中的复生舱开始升温：浣生的体征曲线，重新爬出深渊。","铭文全文破译：浣生的后代要她去问洛克——钟表匠知道所有齿轮。","幻境验证通过：洛克交出了第一批齿轮账本，用证据交换了信任。","深层读数确认：比笛雾更早的意志确实存在，而且一直在做梦。","作战地图摊开的第一夜，万族的代表第一次坐在了同一张桌前。","集结名册完成：雷莫拉人负责真空，哈鲁萨鲁负责深海，百族负责其余。","首席之位交还浣生。帕米尔只要了一项头衔：找路的人。","秘道守卫的作战档案被清空。通往囚室的路，第一次完整地亮起。"
];
const PART_FOUR_RESOLUTIONS=[
  "雷莫拉战线稳住了第一夜。船壳上的真空里，守卫者们学会了把爆炸当武器。","崩解的护盾板块被重新编组：防线从‘不可破’改成了‘可修补’。","喷嘴的哀鸣被录进档案：大船的痛苦是真实的，它听得见自己。","核心深处的光被采样：那不是矿藏，是某种正在呼吸的结构。","物质源头的观测记录归档：大船从核心生长的理论，第一次有了数据。","力场谐振频率被测出：一百五十亿年，它只做一件事——关住某个东西。","监狱假说进入档案：犯人的名字还空着，但牢房的形状已经清楚。","越狱低语的载体被定位：梦、信仰与命令，共用同一条无线电路。","被污染命令的签名比对完成：同一个声音，躲在每一个‘合理’背后。","叛变守卫的巡逻表被破译：它们绕开的坐标，正是囚室的入口。","脊柱被切断。船体骨架上的第一道胜利伤疤，属于百族联军。","迈尔辛的抉择写入档案：大船保住了，母亲的位置永远空了一格。","洪水骗局的证据链闭合：威胁是真的，按钮从来没接过管线。","泄洪泵停止了倒计时。髓星的天空下，数十亿居民继续耕作。","‘拒绝屠星’写入作战条例：从这一刻起，胜利有了新的定义。","引擎链的控制权被夺回一半：坠向黑洞的曲线，第一次出现转折。","黑洞边缘的引力数据完成采样：越狱的假设，需要一座新的牢房。","建造者的指纹被读出：他们试过摧毁、试过谈判，最后只剩放逐。","囚室坐标锁定：它比大船更古老，像一颗蛋壳里的针。","荒凉醒了。十四座喷嘴同时转向，大船的深海里传来第一次心跳。"
];
const PART_FIVE_RESOLUTIONS=[
  "囚室代行体的复制列表被截获：五类技能，对应五类曾被放逐的战术。","复制之影熄灭。它最后的讯息是一句许诺——没有人回应。","喷嘴阵列的布防图完成：十四座阀门，十四条通往停机的路。","第一座阀门关闭。大船的震颤被录下：那是它第一次表达感受。","大船之声的波形被分离：它不是荒凉，也不是建造者——它是它自己。","阀门位置进入了每个人的视野：大船把选择权，连同地图一起给出。","红巨星逼近的轨道被确认：留给大船的时间，以小时计。","引力窗口捕捉成功：一颗流浪天体被写进了大船的航向。","铁镍物质撞上船侧的瞬间，全船的灯闪了一下——像一次眨眼。","黑洞近邻的引力梯度完成测绘：牢房可以被打开，也可以更坚固。","最后的许诺被公开播放。万族听完，把表决器握得更紧。","表决结果归档：不放。囚笼继续存在，自由必须由真实铸成。","髓星重封命令下达。这一次，命令的每一个字节都经得起核验。","新任首席的第一道政令：档案、权限与记忆库，对万族公开。","重写的记忆库开馆：真实的历史里，有荣耀，也有无法删除的丑陋。","最后一座喷嘴熄灭。代行体的核心归于沉寂，像一场漫长的退潮。","新航线写入船钟：目标室女座星团，预计抵达时间——数千年。","第一片林种下。孩子们问千年后的海是什么样子，没有人知道。","髓星在空腔里明灭，节律与大船的心跳同步——两颗心脏，一个身体。","大船驶向星系间的黑暗。潮声之下，所有的故事都成了新的档案。"
];
const PART_THREE_STORY=PART_THREE_STAGE_BLUEPRINTS.map((bp,i)=>({id:i+41,title:"第三部 · 首领的椅子 / "+String(i+1).padStart(2,"0"),name:bp[0],summary:bp[1],intro:bp[1]+" 本关完成战术节点后，沿下行舱门继续推进。",sample:["现场证据："+bp[1],"书记官核验：该记录与帕米尔的寻人名录、迈尔辛的权限日志和洛克的齿轮账本相互对照。","风险提示：提欧的钥匙比官印更老——凡是被‘合理’解释过的命令，都要再查一遍来源。"],bossAwake:bp[3]?"登船者的精锐封锁了本段舱段。击败它才能继续深入。":"本段防卫协议已进入最高警戒。",bossDown:PART_THREE_RESOLUTIONS[i],question:"继续沿第三部航线推进。"}));
const PART_FOUR_STORY=PART_FOUR_STAGE_BLUEPRINTS.map((bp,i)=>({id:i+61,title:"第四部 · 荒凉 / "+String(i+1).padStart(2,"0"),name:bp[0],summary:bp[1],intro:bp[1]+" 本关完成战术节点后，沿下行舱门继续推进。",sample:["现场证据："+bp[1],"书记官核验：该记录与雷莫拉战报、力场谐振数据和被污染命令的签名比对相互印证。","风险提示：荒凉会借‘合理’说话——越是无法拒绝的命令，越要核对量子噪点。"],bossAwake:bp[3]?"战争巨兽拦在战线的关口。击败它才能守住或夺回这一段船体。":"本段防卫协议已进入最高警戒。",bossDown:PART_FOUR_RESOLUTIONS[i],question:"继续沿第四部航线推进。"}));
const PART_FIVE_STORY=PART_FIVE_STAGE_BLUEPRINTS.map((bp,i)=>({id:i+81,title:"第五部 · 建造者 / "+String(i+1).padStart(2,"0"),name:bp[0],summary:bp[1],intro:bp[1]+" 本关完成战术节点后，沿下行舱门继续推进。",sample:["现场证据："+bp[1],"书记官核验：该记录与大船之声的波形、阀门阵列的布防图和万族表决记录相互对照。","风险提示：囚室代行体会许诺一切——只攻击可验证的控制节点。"],bossAwake:bp[3]?"囚室的代行体与它的护卫拦在最后的航段。击败它们，才能抵达终点。":"本段防卫协议已进入最高警戒。",bossDown:PART_FIVE_RESOLUTIONS[i],question:"见证大船的最终选择。"}));
STORY_CHAPTERS.splice(STORY_CHAPTERS.length,0,...PART_THREE_STORY,...PART_FOUR_STORY,...PART_FIVE_STORY);
/* v26：各部通关演出配置（章名/进度/叙事者/收束词） */
const PART_FINS={
  partOne:{t:"第一部 · 船",s:"二十关完成",who:"大船",tail:"\n\n登陆桥已经伸向髓星。下一部的灾难，将从这次下潜开始。"},
  partTwo:{t:"第二部 · 髓星",s:"四十关完成",who:"浣生",tail:"\n\n炮弹车撕开轨道封锁，归航舱冲进大船豁口。清算，开始了。"},
  partThree:{t:"第三部 · 首领的椅子",s:"六十关完成",who:"帕米尔",tail:"\n\n违望者的隧道仍在延伸，而大船的权力已经易主。战争，近在眼前。"},
  partFour:{t:"第四部 · 荒凉",s:"八十关完成",who:"浣生",tail:"\n\n脊柱已断，洪水未落。比建造者更古老的存在，正在囚笼深处睁开眼睛。"},
  partFive:{t:"第五部 · 建造者",s:"百关完成",who:"百族",tail:"\n\n喷嘴熄灭，航向室女座。潮声之下，大船第一次选择了自己的未来。"}
};
const STORY_ENDINGS={
  partOne:{tag:"第一部完成 · 髓星之前",title:"登陆桥伸向铁世界",sub:"二十个战术节点全部解除。精英船长穿过大船内核的豁口，向被量子力场托住的髓星下降；那份密令仍带着无法解释的疑点。",choice:"继续登陆髓星",detail:"《星髓》第一部二十关闯关完成。"},
  partTwo:{tag:"第二部完成 · 谎言清算",title:"归航舱冲入大船",sub:"炮弹车撕开轨道封锁，归航舱穿过船壳豁口。笛雾的建造者神话已经破产，可提欧早已破解骗子的存储器——他把谎言变成了信仰，把信仰带回了大船。",choice:"继续第三部航程",detail:"《星髓》第二部二十关闯关完成。"},
  partThree:{tag:"第三部完成 · 权力易主",title:"首席之位归还浣生",sub:"帕米尔联合百族拒绝首领宝座，把首席之位交还复生的浣生。可提欧的违望者已经登船——战争只剩一个引爆点。",choice:"迎接第四部风暴",detail:"《星髓》第三部二十关闯关完成。"},
  partFour:{tag:"第四部完成 · 囚笼真相",title:"荒凉睁开了眼睛",sub:"监狱假说被证实：大船是放逐荒凉的囚笼。浣生拒绝屠星、拒绝释放，把整个战局的残局带进了最后的囚室。",choice:"直面建造者",detail:"《星髓》第四部二十关闯关完成。"},
  partFive:{tag:"原著结局 · 潮声之下",title:"大船驶向室女座",sub:"百族与人工智能共同关闭引擎，大船第一次主动帮助船员。髓星重封，航线离开银河——数千年的航行，从此开始。",choice:"见证新航程",detail:"《星髓》第五部二十关闯关完成 · 全部章节达成。"},
  seal:{tag:"结局 I · 重封髓星",title:"监狱重新闭合",sub:"你切断脊柱、封死腔壁豁口，让荒凉再次与大船隔绝。旧首领复生，浣生担任首席；危险暂时结束，但关于建造者的问题仍无答案。",choice:"重封髓星",detail:"优先隔离荒凉并修复大船。"},
  release:{tag:"结局 II · 荒凉航路",title:"囚犯接管了航向",sub:"你误把荒凉的声音当成建造者启示。引擎重新点火，大船朝黑洞坠落；建造者当年不愿摧毁、只能放逐的东西即将获得自由。",choice:"接受荒凉",detail:"高风险非正史结局。"},
  chorus:{tag:"原著结局 · 驶向室女座",title:"大船选择星系间的黑暗",sub:"百族与人工智能共同关闭引擎，大船也第一次主动帮助船员。髓星被重新封闭，浣生任首席；航线离开银河，驶向遥远的室女座星团。",choice:"联合百族并重封监狱",detail:"物证与洞察并重时解锁的完整结局。"},
  archive:{tag:"书记官复演 · 单章",title:"历史节点复演完成",sub:"本章证据已写入书记官档案。完整远征会把五部事件连成一条可核验的因果链。",choice:"完成复演",detail:"未改变完整远征记录。"},
  protocol:{tag:"战斗结算 · 守卫协议",title:"五类守卫已清除",sub:"你打通了战斗路径，但跳过的证据仍决定着大船真正的敌人是谁。",choice:"协议完成",detail:"战斗记录已归档。"}
};
const STORY_META_KEY="chaosheng_dive3d_story_v1";
let storyMeta={endings:[],deepest:0};
try{const raw=storage&&storage.getItem(STORY_META_KEY),m=raw?JSON.parse(raw):null;if(m&&Array.isArray(m.endings))storyMeta={endings:m.endings.filter(k=>STORY_ENDINGS[k]),deepest:Math.max(0,Math.min(99,Number(m.deepest)||0))};}catch(e){}
let storyRun={order:0,echo:0,choices:{},ending:null,startLevel:0,roleId:"explorer",modeId:"expedition"};
function resetStoryRun(){storyRun={order:0,echo:0,choices:{},ending:null,startLevel:runSelection.level,roleId:runSelection.roleId,modeId:runSelection.modeId};}
function saveStoryMeta(){try{if(storage)storage.setItem(STORY_META_KEY,JSON.stringify(storyMeta));}catch(e){}}
/* v13 元游戏进程：船币、永久升级、功能解锁与一次性成就奖励。 */
const META_KEY="chaosheng_dive3d_meta_v13";
const META_DEFAULT={currency:0,crystals:0,characters:{},relics:[],relicEquip:{},wellBest:0,totalKills:0,bestStreak:0,continues:0,upgrades:{hull:0,lungs:0,salvage:0},unlocks:{reroll:false,scanner:false,lifePod:false},bestiary:{},achievements:{firstBlood:false,streak10:false,deepDive:false,reborn:false,builder:false}};   // v31 养成/遗章/深井
function cloneMetaDefault(){return JSON.parse(JSON.stringify(META_DEFAULT));}
let meta=cloneMetaDefault();
try{const raw=storage&&storage.getItem(META_KEY),m=raw?JSON.parse(raw):null;if(m){meta=Object.assign(cloneMetaDefault(),m);meta.upgrades=Object.assign({},META_DEFAULT.upgrades,m.upgrades||{});meta.unlocks=Object.assign({},META_DEFAULT.unlocks,m.unlocks||{});meta.achievements=Object.assign({},META_DEFAULT.achievements,m.achievements||{});}}catch(e){}
function saveMeta(){try{if(storage)storage.setItem(META_KEY,JSON.stringify(meta));}catch(e){}}
function grantCurrency(n,reason){n=Math.max(0,Math.floor(n||0));if(!n)return;meta.currency+=n;saveMeta();if(meta.currency>=200)unlockAchievement("rich");if(reason)toast("船币 +"+n+" · "+reason);}
const ACHIEVEMENTS={firstBlood:{name:"第一滴血",desc:"首次击败敌人",reward:10},perfectDodge:{name:"狭缝之舞",desc:"在攻击命中瞬间完成完美闪避",reward:15},streak10:{name:"毫不停息",desc:"达成 10 连杀",reward:25},deepDive:{name:"髓星深潜",desc:"抵达第五关",reward:35},reborn:{name:"重生许可",desc:"首次使用续命",reward:20},builder:{name:"建造者之问",desc:"发现任一完整结局",reward:50}};
/* v24.14 成就扩充（+14 → 共 20）：触发点已接入各玩法 */
Object.assign(ACHIEVEMENTS,{
  reactions20:{name:"潮汐学者",desc:"累计触发 20 次元素反应",reward:30},
  elements10:{name:"单场炼金",desc:"一局内触发 10 次元素反应",reward:20},
  executes10:{name:"处刑人",desc:"累计处决 10 次",reward:25},
  echoKill:{name:"回声葬礼",desc:"用深渊回响完成一次击杀",reward:15},
  bossSlayer:{name:"弑巨者",desc:"击败任意巨兽守卫",reward:25},
  wave10:{name:"无尽深耕",desc:"无尽模式抵达第 10 波",reward:30},
  rich:{name:"舱币大户",desc:"持有 200 船币",reward:20},
  kills100:{name:"深渊清道夫",desc:"累计击杀 100 只",reward:30},
  daily1:{name:"今日已下潜",desc:"完成一次每日挑战",reward:25},
  score1k:{name:"千分航迹",desc:"单局得分达到 1000",reward:20},
  combo15:{name:"连镇深港",desc:"达成 15 连杀",reward:25},
  well12:{name:"深井征服者",desc:"通关回响深井 12 层",reward:120},
  dodgeMaster:{name:"虚影舞者",desc:"累计 5 次完美闪避",reward:25},
  relic8:{name:"遗物收藏家",desc:"同时持有 8 件遗物",reward:25},
  depth10:{name:"越过中继层",desc:"抵达第 10 层",reward:20}
});
function unlockAchievement(id){const a=ACHIEVEMENTS[id];if(!a||meta.achievements[id])return;meta.achievements[id]=true;meta.currency+=a.reward;saveMeta();showTransmission("成就解锁",a.name+" · 船币 +"+a.reward,4200);}
const RUN_SELECTION_KEY="chaosheng_dive3d_v14_selection";
let runSelection={modeId:"campaign",roleId:"explorer",level:0,routeId:"s0-entry"};
try{
  const raw=storage&&storage.getItem(RUN_SELECTION_KEY),s=raw?JSON.parse(raw):null;
  if(s&&RUN_MODES[s.modeId]&&DIVER_ROLES[s.roleId]&&Number.isInteger(s.level))runSelection={modeId:s.modeId,roleId:s.roleId,level:Math.max(0,Math.min(99,s.level)),routeId:typeof s.routeId==="string"?s.routeId:("s"+Math.max(0,Math.min(99,s.level))+"-entry")};
}catch(e){}
/* v21：模式收束为唯一的二十层深渊下潜，旧存档中的其他模式自动迁移。 */
runSelection.modeId="campaign";
function persistRunSelection(){try{if(storage)storage.setItem(RUN_SELECTION_KEY,JSON.stringify(runSelection));}catch(e){}}
/* ============================================================
   v24.14 每日挑战：日期散列种子 → 固定层/角色 + 全程固定随机（setSeed）
   当日完成（任意结算）标记 meta.daily，按钮显示状态
   ============================================================ */
let dailyActive=false;
/* v41 周目标挑战 */
function weekNum(){const d=new Date();return Math.floor((d-new Date(d.getFullYear(),0,1))/(7*864e5));}
function getWeeklyGoals(){
  const wn=weekNum();
  if(!meta.weekly||meta.weekly.week!==wn){
    const pool=[{id:"kills50",desc:"本周击杀 50 只敌人",target:50},{id:"gold2k",desc:"本周累计 2000 金币",target:2000},{id:"crystal10",desc:"本周收集 10 个结晶",target:10},{id:"levels3",desc:"本周通关 3 个关卡",target:3}];
    const goals=[];const seed=wn*7;
    for(let i=0;i<3;i++){const idx=(seed+i*3)%pool.length;goals.push({...pool[idx],done:false,progress:0});}
    meta.weekly={week:wn,goals:goals};saveMeta();
  }
  return meta.weekly.goals;
}
function tickWeeklyGoal(type,value){
  if(!meta.weekly)return;const wn=weekNum();if(meta.weekly.week!==wn)return;
  for(const g2 of meta.weekly.goals){if(g2.done)continue;
    if(type==="kill"&&g2.id==="kills50")g2.progress+=value;
    if(type==="gold"&&g2.id==="gold2k")g2.progress+=value;
    if(type==="crystal"&&g2.id==="crystal10")g2.progress+=value;
    if(type==="level"&&g2.id==="levels3")g2.progress+=value;
    if(g2.progress>=g2.target){g2.done=true;meta.crystals=(meta.crystals||0)+15;toast("周目标完成！结晶 +15");}
  }
  saveMeta();
}
/* v41 周目标挑战 */
function weekNum(){const d=new Date();return Math.floor((d-new Date(d.getFullYear(),0,1))/(7*864e5));}
function getWeeklyGoals(){
  const wn=weekNum();
  if(!meta.weekly||meta.weekly.week!==wn){
    const pool=[{id:"kills50",desc:"本周击杀 50 只敌人",target:50},{id:"gold2k",desc:"本周累计 2000 金币",target:2000},{id:"crystal10",desc:"本周收集 10 个结晶",target:10},{id:"levels3",desc:"本周通关 3 个关卡",target:3}];
    const goals=[];const seed=wn*7;
    for(let i=0;i<3;i++){const idx=(seed+i*3)%pool.length;goals.push({...pool[idx],done:false,progress:0});}
    meta.weekly={week:wn,goals:goals};saveMeta();
  }
  return meta.weekly.goals;
}
function tickWeeklyGoal(type,value){
  if(!meta.weekly)return;const wn=weekNum();if(meta.weekly.week!==wn)return;
  for(const g2 of meta.weekly.goals){if(g2.done)continue;
    if(type==="kill"&&g2.id==="kills50")g2.progress+=value;
    if(type==="gold"&&g2.id==="gold2k")g2.progress+=value;
    if(type==="crystal"&&g2.id==="crystal10")g2.progress+=value;
    if(type==="level"&&g2.id==="levels3")g2.progress+=value;
    if(g2.progress>=g2.target){g2.done=true;meta.crystals=(meta.crystals||0)+15;toast("周目标完成！结晶 +15");}
  }
  saveMeta();
}
const DAILY_KEY=(()=>{const d=new Date();return d.getFullYear()+"-"+(d.getMonth()+1)+"-"+d.getDate();})();
function dailySeedFromKey(k){let h=2166136261;for(let i=0;i<k.length;i++){h^=k.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0)%1000000000+1;}
function dailyParams(){const seed=dailySeedFromKey(DAILY_KEY);const lv=(seed%94)+3;const roles=["explorer","guardian","hunter"];return {level:lv,role:roles[seed%3],seed};}
function refreshDailyBtn(){
  const btn=document.getElementById("dailyBtn");
  if(!btn)return;
  const done=meta.daily&&meta.daily.day===DAILY_KEY;
  btn.textContent=done?"每日挑战 · 今日已完成 ✓":("每日挑战 · 第"+(dailyParams().level+1)+"层");
}
(function(){
  const dailyBtn=document.getElementById("dailyBtn");
  if(!dailyBtn)return;
  refreshDailyBtn();
  dailyBtn.addEventListener("click",()=>{
    if(dailyActive)return;
    const p=dailyParams();
    setSeed(p.seed);
    runSelection.level=p.level;runSelection.roleId=p.role;persistRunSelection();
    dailyActive=true;
    startGame();
    toast("每日挑战 · 种子 "+p.seed+" · 结算即记录");
  });
  /* 结算钩子：包装 setOver，记录当日成绩 */
  const _origSetOver=setOver;
  setOver=function(win){
    _origSetOver(win);
    /* v24.15 结算统计：武器伤害分布 / 元素反应次数 / 最高连杀 */
    if(G){
      if(wellRun){meta.wellBest=Math.max(meta.wellBest||0,wellRun.wave||0);wellRun=null;G&&(G.wellAffix=null);saveMeta();}
      const od=document.getElementById("overDetail");
      if(od){
        const dw=G.dmgByWid||{};
        const total=(dw[1]||0)+(dw[2]||0);
        const pct=w=>total>0?Math.round((dw[w]||0)/total*100):0;
        od.innerHTML+="<div style='margin-top:8px;padding-top:6px;border-top:1px solid #1c303b;color:#8fa7a1;font-size:11px;line-height:1.8'>"+
          "武器伤害分布 · 声呐 "+pct(1)+"% / 渊棘 "+pct(2)+"%<br>元素反应 "+(G.reactionCount||0)+" 次 · 最高连杀 ×"+(G.bestCombo||0)+"</div>";
      }
    }
    if(dailyActive&&G){
      dailyActive=false;
      meta.daily=meta.daily||{day:DAILY_KEY,score:0};
      if((G.score||0)>(meta.daily.score||0))meta.daily.score=G.score||0;
      saveMeta();
      unlockAchievement("daily1");
      refreshDailyBtn();
      const drel=newRelicRoll(8);if(drel)toast("每日挑战掉落 · "+RELIC_SLOT_NAMES[drel.slot]+" 遗章");
    }
  };
})();
/* ============================================================
   v24.19 存档码头（多槽位）：自动存档为工作档，3 个手动槽位可存入/读取
   存入 = 把当前自动档快照复制进槽位；读取 = 把槽位写回自动档并刷新续潜
   ============================================================ */
(function(){
  const dock=document.getElementById("saveDock");
  if(!dock)return;
  const AUTO_KEY="chaosheng_dive3d_save";
  const SLOT_KEYS=[1,2,3].map(n=>"chaosheng_dive3d_slot"+n);
  const readAuto=()=>{try{return (globalThis.__D3D_SAVE&&storage)?globalThis.__D3D_SAVE.loadSave(storage):null;}catch(e){return null;}};
  const slotData=i=>{try{const raw=storage.getItem(SLOT_KEYS[i]);return raw?JSON.parse(raw):null;}catch(e){return null;}};
  const fmtT=t=>{t=Math.round(t||0);return Math.floor(t/60)+":"+String(t%60).padStart(2,"0");};
  function render(){
    const auto=readAuto();
    const hasAuto=!!(auto&&auto.progress&&((auto.progress.time||0)>20||(auto.progress.samples||0)>0||(auto.progress.score||0)>0));
    let html="自动存档 · "+(hasAuto?("得分 "+(auto.progress.score||0)+" · 证据 "+(auto.progress.samples||0)+" · 用时 "+fmtT(auto.progress.time)+"（刷新页面续潜）"):"暂无进行中的下潜")+"<br>";
    SLOT_KEYS.forEach((k,i)=>{
      const sd=slotData(i);
      const btnStyle="display:inline-block;width:auto;min-width:0;margin:0 3px;padding:2px 9px;font-size:10px;";
      if(sd&&sd.progress){
        html+="槽位"+(i+1)+" · 得分 "+(sd.progress.score||0)+" · 证据 "+(sd.progress.samples||0)+" · 用时 "+fmtT(sd.progress.time)+
          " <button class='btn sec' data-act='load' data-slot='"+i+"' style='"+btnStyle+"'>读取</button>"+
          " <button class='btn sec' data-act='save' data-slot='"+i+"' style='"+btnStyle+"'>覆盖存入</button><br>";
      } else {
        html+="槽位"+(i+1)+" · （空）"+(hasAuto?" <button class='btn sec' data-act='save' data-slot='"+i+"' style='"+btnStyle+"'>存入</button>":"")+"<br>";
      }
    });
    dock.innerHTML=html;
  }
  dock.addEventListener("click",ev=>{
    const btn=ev.target.closest("button[data-act]");
    if(!btn)return;
    const i=Number(btn.dataset.slot),act=btn.dataset.act;
    if(act==="save"){
      const auto=readAuto();
      if(!auto){toast("暂无自动存档可存入");return;}
      try{storage.setItem(SLOT_KEYS[i],JSON.stringify(auto));toast("已存入槽位 "+(i+1));}catch(e){toast("存入失败（存储空间不足）");}
      render();
    } else if(act==="load"){
      const sd=slotData(i);
      if(!sd){toast("槽位为空");return;}
      try{storage.setItem(AUTO_KEY,JSON.stringify(sd));}catch(e){}
      location.reload();   // 走既有启动续潜链路
    }
  });
  /* 回到菜单时刷新码头（包装 toMenu） */
  const _origToMenu=toMenu;
  toMenu=function(){_origToMenu();render();};
  render();
})();
function runRecordKey(modeId,startLevel){return "chaosheng_dive3d_hi_v10_"+modeId+"_L"+(Number(startLevel)+1);}
function readRunRecord(modeId,startLevel){try{const raw=storage&&storage.getItem(runRecordKey(modeId,startLevel));if(raw!==null)return parseInt(raw||"0",10)||0;if(modeId==="expedition"&&Number(startLevel)===0)return parseInt((storage&&storage.getItem("chaosheng_dive3d_hi"))||"0",10)||0;}catch(e){}return 0;}
function saveGame(){
  if(!G || !SAVE) return;
  SAVE.saveGame(storage, SAVE.buildSaveData(G, settings));
}

const canvas = document.getElementById("game");
let renderer = null;
try{ renderer = new THREE.WebGLRenderer({ canvas, antialias:true, powerPreference:"high-performance", alpha:false }); }
catch(err){ engineFail("WebGL 初始化失败：" + (err && err.message ? err.message : "未知错误")); return; }
const coarsePointer=!!(window.matchMedia&&matchMedia("(pointer:coarse)").matches),deviceMemory=Number(navigator.deviceMemory||8),mobilePixelLoad=innerWidth*innerHeight*Math.pow(devicePixelRatio||1,2);
const constrainedDevice=coarsePointer&&(deviceMemory<=4||mobilePixelLoad>2500000);
const lowQ=(isSoftRenderer(renderer)||constrainedDevice)&&location.search.indexOf("hq=1")<0;   // 软渲染/受限移动设备自动降档；hq=1 可强制高画质
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(lowQ ? 1 : Math.min(devicePixelRatio||1, 2));
renderer.shadowMap.enabled = !lowQ;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.02;   // v23.4：压曝光去灰雾，保高光对比
renderer.outputEncoding = THREE.sRGBEncoding;

/* v20：离线可用的轻量 Bloom。Three.js 核心版不依赖 EffectComposer，
   这里将场景中的发光实体投影到 2D 加法层，低画质设备自动关闭。 */
const bloomCanvas=document.getElementById("bloomLayer"),bloomCtx=bloomCanvas&&bloomCanvas.getContext("2d");
const bloomWorld=new THREE.Vector3();
const bloomColorCache=new Map();
function resizeBloomLayer(){if(!bloomCanvas||!bloomCtx)return;bloomCanvas.width=innerWidth;bloomCanvas.height=innerHeight;bloomCanvas.style.display=lowQ?"none":"block";}
function bloomRgb(hex){const key=Number(hex)||0x7fffd4;if(bloomColorCache.has(key))return bloomColorCache.get(key);const c=new THREE.Color(key),rgb=[Math.round(c.r*255),Math.round(c.g*255),Math.round(c.b*255)];bloomColorCache.set(key,rgb);return rgb;}
function addBloomPoint(obj,hex,base,energy){
  if(!bloomCtx||!obj||!obj.visible)return;
  obj.getWorldPosition(bloomWorld);const dist=camera.position.distanceTo(bloomWorld);bloomWorld.project(camera);
  if(bloomWorld.z<-1||bloomWorld.z>1||Math.abs(bloomWorld.x)>1.2||Math.abs(bloomWorld.y)>1.2)return;
  const x=(bloomWorld.x*.5+.5)*bloomCanvas.width,y=(-bloomWorld.y*.5+.5)*bloomCanvas.height;
  const radius=Math.max(5,Math.min(42,base*(18/Math.max(4,dist))));
  const rgb=bloomRgb(hex),g=bloomCtx.createRadialGradient(x,y,0,x,y,radius);
  g.addColorStop(0,"rgba("+rgb.join(",")+","+Math.min(.55,energy*.34)+")");g.addColorStop(.25,"rgba("+rgb.join(",")+","+Math.min(.22,energy*.14)+")");g.addColorStop(1,"rgba("+rgb.join(",")+",0)");
  bloomCtx.fillStyle=g;bloomCtx.beginPath();bloomCtx.arc(x,y,radius,0,Math.PI*2);bloomCtx.fill();
}
let bloomCleared=false;
function renderBloomLayer(){
  if(POST.enabled){if(bloomCanvas)bloomCanvas.style.display="none";return;}   // v24：真 Bloom 接管
  if(!bloomCtx||lowQ){if(bloomCanvas)bloomCanvas.style.display="none";return;}
  if(bloomCanvas.width!==innerWidth||bloomCanvas.height!==innerHeight)resizeBloomLayer();
  if(!G||G.state===S.MENU){
    /* v23 PERF：菜单态只在有残留时清屏一次，跳过每帧全屏 clearRect。 */
    if(!bloomCleared){bloomCtx.clearRect(0,0,bloomCanvas.width,bloomCanvas.height);bloomCtx.globalCompositeOperation="lighter";bloomCleared=true;}
    return;
  }
  bloomCleared=false;
  bloomCtx.clearRect(0,0,bloomCanvas.width,bloomCanvas.height);bloomCtx.globalCompositeOperation="lighter";
  addBloomPoint(G.state===S.PLAYING?toolEmitter:null,0x7fffd4,24,1.0);
  for(const m of monsterMeshes||[])if(m.visible){addBloomPoint(m.userData&&m.userData.renderGlow,m.userData&&m.userData.renderAccent,30,1);if(m.userData&&m.userData.eye)addBloomPoint(m.userData.eye,CREATURE_ACCENTS[m.userData.archetype]||0xff5573,15,1.1);}
  for(const s of sampleMeshes||[])if(s.visible)addBloomPoint(s.userData&&s.userData.glow,s.userData&&s.userData.color,26,1);
  if(gateGroup&&gateGroup.visible)addBloomPoint(gateGroup,currentVisualPalette.accent,34,.9);
  if(bossMesh&&bossMesh.visible)addBloomPoint(bossMesh.userData&&bossMesh.userData.renderGlow,bossMesh.userData&&bossMesh.userData.renderAccent,54,1.2);
}
resizeBloomLayer();

/* ============================================================
   v24 真 HDR 后处理管线（无外部依赖）：场景 → 亮部提取 → 半分辨率
   可分离高斯模糊(H/V) → 合成(Bloom+暗角+色差+S曲线调色) → 屏幕。
   高画质设备自动启用；lowQ/软渲染保持原直渲染路径。
   ============================================================ */
const POST={enabled:!lowQ,rt:null,rtA:null,rtB:null,quad:null,scene:null,cam:null,W:0,H:0};
function postRT(w,h){
  const type=(renderer.capabilities.isWebGL2||renderer.extensions.get("OES_texture_half_float"))?THREE.HalfFloatType:THREE.UnsignedByteType;
  const rt=new THREE.WebGLRenderTarget(Math.max(2,w|0),Math.max(2,h|0),{minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,format:THREE.RGBAFormat,type});
  if(renderer.capabilities.isWebGL2)rt.samples=4;
  return rt;
}
const postBrightMat=new THREE.ShaderMaterial({depthWrite:false,depthTest:false,
  uniforms:{tDiffuse:{value:null},uThresh:{value:.72}},
  vertexShader:"varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}",
  fragmentShader:"uniform sampler2D tDiffuse;uniform float uThresh;varying vec2 vUv;void main(){vec4 c=texture2D(tDiffuse,vUv);float l=dot(c.rgb,vec3(.2126,.7152,.0722));float w=smoothstep(uThresh,uThresh+.38,l);gl_FragColor=vec4(c.rgb*w,1.);}"});
const postBlurMat=new THREE.ShaderMaterial({depthWrite:false,depthTest:false,
  uniforms:{tDiffuse:{value:null},uDir:{value:new THREE.Vector2(1,0)},uTexel:{value:new THREE.Vector2(1/512,1/512)}},
  vertexShader:"varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}",
  fragmentShader:"uniform sampler2D tDiffuse;uniform vec2 uDir;uniform vec2 uTexel;varying vec2 vUv;void main(){vec2 o1=uDir*uTexel*1.333,o2=uDir*uTexel*2.666;vec4 c=texture2D(tDiffuse,vUv)*.227;c+=texture2D(tDiffuse,vUv+o1)*.194+texture2D(tDiffuse,vUv-o1)*.194;c+=texture2D(tDiffuse,vUv+o2)*.121+texture2D(tDiffuse,vUv-o2)*.121;c+=texture2D(tDiffuse,vUv+o1*2.)*.054+texture2D(tDiffuse,vUv-o1*2.)*.054;c+=texture2D(tDiffuse,vUv+o2*2.)*.016+texture2D(tDiffuse,vUv-o2*2.)*.016;gl_FragColor=c;}"});
const postCompMat=new THREE.ShaderMaterial({depthWrite:false,depthTest:false,
  uniforms:{tScene:{value:null},tBloom:{value:null},uStrength:{value:.55},uVig:{value:.42}},
  vertexShader:"varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}",
  fragmentShader:"uniform sampler2D tScene;uniform sampler2D tBloom;uniform float uStrength;uniform float uVig;varying vec2 vUv;void main(){vec2 d=vUv-.5;float r2=dot(d,d);float ca=.0035*r2*2.6;vec3 col;col.r=texture2D(tScene,vUv+d*ca).r;col.g=texture2D(tScene,vUv).g;col.b=texture2D(tScene,vUv-d*ca).b;col+=texture2D(tBloom,vUv).rgb*uStrength;col*=mix(1.,smoothstep(.92,.32,r2*1.9),uVig);col=mix(col,col*col*(3.-2.*col),.2);col*=vec3(.985,1.,1.045);gl_FragColor=vec4(pow(max(col,vec3(0.)),vec3(.4545)),1.);}"});
function initPost(){
  if(!POST.enabled||POST.rt)return;
  POST.W=innerWidth;POST.H=innerHeight;
  POST.rt=postRT(POST.W,POST.H);POST.rtA=postRT(POST.W/2,POST.H/2);POST.rtB=postRT(POST.W/2,POST.H/2);
  POST.cam=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  POST.quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),postBrightMat);
  POST.quad.frustumCulled=false;
  POST.scene=new THREE.Scene();POST.scene.add(POST.quad);
  postCompMat.uniforms.uStrength.value=(settings.bloomStrength!==undefined)?settings.bloomStrength:.55;   // v24.16 默认降档去炫光
  if(settings.bloomStrength===undefined)settings.bloomStrength=.55;
  glowMaterialCache.forEach(m=>{m.opacity*=.65;});   // v24.16 真 Bloom 接管后压暗辉光 Sprite（避免双层叠加炫光）
  if(bloomCanvas)bloomCanvas.style.display="none";   // 真 Bloom 接管，停用 2D 假 Bloom 层
}
function resizePost(){
  if(!POST.rt)return;
  POST.W=innerWidth;POST.H=innerHeight;
  POST.rt.setSize(POST.W,POST.H);POST.rtA.setSize(POST.W/2,POST.H/2);POST.rtB.setSize(POST.W/2,POST.H/2);
}
function postPass(mat,target){
  POST.quad.material=mat;
  renderer.setRenderTarget(target);
  renderer.render(POST.scene,POST.cam);
}
function renderPost(){
  initPost();
  if(!POST.rt){renderer.render(scene,camera);return;}
  /* 场景先渲染进 HDR 离屏目标（v24.1 修复：缺失此步导致亮部提取读到空纹理 → 黑屏） */
  renderer.setRenderTarget(POST.rt);
  renderer.render(scene,camera);
  postBrightMat.uniforms.tDiffuse.value=POST.rt.texture;
  postBlurMat.uniforms.uTexel.value.set(1/(POST.W/2),1/(POST.H/2));
  postCompMat.uniforms.tScene.value=POST.rt.texture;
  postCompMat.uniforms.tBloom.value=POST.rtA.texture;
  postPass(postBrightMat,POST.rtA);                                  // 亮部提取
  postBlurMat.uniforms.tDiffuse.value=POST.rtA.texture;postBlurMat.uniforms.uDir.value.set(1,0);postPass(postBlurMat,POST.rtB);   // 横向模糊
  postBlurMat.uniforms.tDiffuse.value=POST.rtB.texture;postBlurMat.uniforms.uDir.value.set(0,1);postPass(postBlurMat,POST.rtA);   // 纵向模糊
  postPass(postCompMat,null);                                        // 合成上屏
}

/* v8：本地 CC0 PBR 贴图。资源随游戏发布，断网也能渲染；加载失败时自动退回纯色材质。 */
const surfaceLoader = new THREE.TextureLoader();
const surfaceAnisotropy = lowQ ? 1 : Math.min(8, renderer.capabilities.getMaxAnisotropy());
function loadSurfaceTexture(path, repeat, srgb){
  let tex;
  tex = surfaceLoader.load(path, undefined, undefined, ()=>{
    tex.userData.failed = true;
    for(const slot of tex.userData.slots||[]){ slot.material[slot.prop]=null; slot.material.needsUpdate=true; }
    if(window.console&&console.warn) console.warn("[v8] 材质加载失败，已使用程序化备用材质："+path);
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = surfaceAnisotropy;
  if(srgb) tex.encoding = THREE.sRGBEncoding;
  tex.userData.slots=[];
  return tex;
}
function attachSurfaceTexture(material, prop, tex){
  if(!tex || tex.userData.failed) return;
  material[prop]=tex; tex.userData.slots.push({material,prop}); material.needsUpdate=true;
}
const SURFACE_TEX={
  floorDiff:loadSurfaceTexture("assets/textures/low_tide_rocks_diff_1k.jpg",10,true),
  floorNorm:loadSurfaceTexture("assets/textures/low_tide_rocks_nor_gl_1k.jpg",10,false),
  floorRough:loadSurfaceTexture("assets/textures/low_tide_rocks_rough_1k.jpg",10,false),
  rockDiff:loadSurfaceTexture("assets/textures/rock_3_diff_1k.jpg",2.4,true),
  rockNorm:loadSurfaceTexture("assets/textures/rock_3_nor_gl_1k.jpg",2.4,false)
};
let currentVisualPalette={ground:0x8ca6a8,rock:0x71888a,accent:0x55d8ca,water:0x4eb9b6,rim:0x3c8fff};

/* v9：程序化生物细节图与柔光纹理。共享一套 GPU 资源，所有怪物/BOSS/弹丸复用。 */
function makeOrganicTexture(){
  const c=document.createElement("canvas");c.width=c.height=256;const x=c.getContext("2d"),im=x.createImageData(256,256);
  for(let i=0;i<im.data.length;i+=4){const n=150+Math.random()*78|0;im.data[i]=n;im.data[i+1]=n+4;im.data[i+2]=n+2;im.data[i+3]=255;}x.putImageData(im,0,0);
  x.globalAlpha=.18;x.strokeStyle="#35464a";x.lineWidth=2;
  for(let i=0;i<28;i++){x.beginPath();x.moveTo(Math.random()*256,Math.random()*256);for(let j=0;j<4;j++)x.lineTo(Math.random()*256,Math.random()*256);x.stroke();}
  const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(2.5,2.5);t.anisotropy=surfaceAnisotropy;t.encoding=THREE.sRGBEncoding;return t;
}
function makeRadialGlowTexture(){
  const c=document.createElement("canvas");c.width=c.height=128;const x=c.getContext("2d"),g=x.createRadialGradient(64,64,0,64,64,64);
  g.addColorStop(0,"rgba(255,255,255,1)");g.addColorStop(.16,"rgba(255,255,255,.92)");g.addColorStop(.48,"rgba(255,255,255,.26)");g.addColorStop(1,"rgba(255,255,255,0)");x.fillStyle=g;x.fillRect(0,0,128,128);return new THREE.CanvasTexture(c);
}
const organicDetailTex=makeOrganicTexture(),organicBumpTex=organicDetailTex.clone(),radialGlowTex=makeRadialGlowTexture();
organicBumpTex.encoding=THREE.LinearEncoding;
const glowMaterialCache=new Map();
function glowMaterial(hex){
  const key=Number(hex)||0xffffff;if(glowMaterialCache.has(key))return glowMaterialCache.get(key);
  const m=new THREE.SpriteMaterial({map:radialGlowTex,color:key,transparent:true,opacity:.68,depthWrite:false,blending:THREE.AdditiveBlending,fog:true});
  glowMaterialCache.set(key,m);if(typeof keepRes==="function")keepRes(m);return m;
}
const CREATURE_ACCENTS={gray:0xe27788,elite:0x54b9ff,dart:0x74e4ff,spitter:0x92ffbd,shield:0x54d9ff,acid:0x83ff66,sniper:0xff426e,swarm:0xd2ff72,reefCrab:0xff9d6d,kelpLeviathan:0x69f0b1,abyssJelly:0xbc83ff,voidWhale:0xff658f,hand:0xf06c83,handX:0xf07bd5};
function addCreatureRim(mat,accent,boss){
  if(!mat||!mat.isMeshStandardMaterial||mat.userData.v9Rim)return;
  mat.userData.v9Rim=true;mat.userData.rimColor=new THREE.Color(accent);mat.userData.rimStrength=boss?.22:.13;
  mat.onBeforeCompile=shader=>{
    shader.uniforms.v9RimColor={value:mat.userData.rimColor};shader.uniforms.v9RimStrength={value:mat.userData.rimStrength};
    shader.fragmentShader=shader.fragmentShader.replace("#include <common>","#include <common>\nuniform vec3 v9RimColor;\nuniform float v9RimStrength;")
      .replace("#include <emissivemap_fragment>","#include <emissivemap_fragment>\nfloat v9Fresnel=pow(1.0-max(0.0,dot(normalize(normal),normalize(vViewPosition))),2.6);totalEmissiveRadiance+=v9RimColor*v9Fresnel*v9RimStrength;");
    mat.userData.rimShader=shader;
  };
  mat.customProgramCacheKey=()=>"v9-creature-rim";
}
function stylizeCreature(root,type,boss){
  const accent=CREATURE_ACCENTS[type]||0x7fffd4;
  let shadowBudget=boss?4:2;
  /* v23.4 质感收敛：有机纹理只上不透明主体件——透明膜/鳍不再被亮纹理罩白；
     膜质件提高粗糙度压高光，恢复深色剪影读感 */
  root.traverse(o=>{if(!o.isMesh)return;const list=Array.isArray(o.material)?o.material:[o.material];let opaque=false;for(const m of list){if(!m||!m.isMeshStandardMaterial)continue;const thin=!!m.transparent;opaque=opaque||!thin;m.fog=true;m.metalness=Math.min(.12,m.metalness||0);m.roughness=thin?Math.max(.72,Math.min(.95,m.roughness||.55)):Math.max(.3,Math.min(.72,m.roughness||.55));if(!m.map&&!thin)m.map=organicDetailTex;if(!m.bumpMap&&!thin){m.bumpMap=organicBumpTex;m.bumpScale=boss?.035:.018;}addCreatureRim(m,accent,boss);m.needsUpdate=true;}o.castShadow=!lowQ&&opaque&&shadowBudget-->0;o.receiveShadow=true;});
  const aura=new THREE.Sprite(glowMaterial(accent));keepRes(aura.geometry);const s=boss?5.5:2.15;aura.scale.set(s,s,1);aura.position.y=boss?1.1:.28;aura.material=glowMaterial(accent);root.add(aura);root.userData.renderGlow=aura;
  if(boss){const light=new THREE.PointLight(accent,.62,13,1.8);light.position.y=1.2;root.add(light);root.userData.renderLight=light;}
  root.userData.renderAccent=accent;return root;
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x02070c);
scene.fog = new THREE.Fog(0x07151b, lowQ ? 18 : 24, lowQ ? 64 : 94);

/* v8：关卡重建时释放独占 GPU 资源，避免连续游玩五关后显存持续上涨。 */
const persistentRes=new Set();
function keepRes(...xs){for(const x of xs)if(x)persistentRes.add(x);}
function disposeRoots(roots){
  const geometries=new Set(),materials=new Set(),instanced=new Set();
  for(const root of roots||[]){
    if(!root)continue;
    root.traverse(o=>{
      if(o.geometry)geometries.add(o.geometry);
      if(o.isInstancedMesh&&o.dispose)instanced.add(o);
      const list=Array.isArray(o.material)?o.material:[o.material];
      for(const m of list)if(m)materials.add(m);
    });
    if(root.parent)root.parent.remove(root);
  }
  instanced.forEach(m=>m.dispose());
  geometries.forEach(g=>{if(!persistentRes.has(g)&&g.dispose)g.dispose();});
  materials.forEach(m=>{
    if(persistentRes.has(m)||!m.dispose)return;
    for(const key in m){const t=m[key];if(t&&t.isTexture&&t.userData&&t.userData.slots)t.userData.slots=t.userData.slots.filter(s=>s.material!==m);}
    m.dispose();
  });
}

const camera = new THREE.PerspectiveCamera(75, innerWidth/innerHeight, 0.1, 200);
camera.rotation.order = "YXZ";
scene.add(camera);

/* v8 光照：冷暖半球光 + 高位散射光 + 潜航灯 + 侧后轮廓光（v23.4 对比重调：主光更挺、环境更沉） */
const hemiLight=new THREE.HemisphereLight(0x4fa8bc, 0x04090e, 0.5);scene.add(hemiLight);
const ambientLight=new THREE.AmbientLight(0x0e2430, 0.18);scene.add(ambientLight);
const sun = new THREE.DirectionalLight(0xaef2e4, 1.18);
sun.position.set(30, 45, 20);
sun.castShadow = !lowQ;
sun.shadow.mapSize.set(lowQ?512:2048, lowQ?512:2048);
sun.shadow.camera.left = -50; sun.shadow.camera.right = 50;
sun.shadow.camera.top = 50; sun.shadow.camera.bottom = -50;
sun.shadow.camera.far = 120;
sun.shadow.bias=-.00025;sun.shadow.normalBias=.035;
scene.add(sun,sun.target);
const rimLight=new THREE.PointLight(0x3c8fff,lowQ?.16:.28,44,1.55);rimLight.position.set(-18,8,-24);scene.add(rimLight);
const headlight = new THREE.SpotLight(0xb8fff0, 0.92, 58, Math.PI/7, 0.68, 1.2);
headlight.position.set(0.18, -0.08, 0);
headlight.target.position.set(0, -0.04, -1);
camera.add(headlight, headlight.target);
const lampFill = new THREE.PointLight(0x5fe0b0, 0.12, 10);
camera.add(lampFill);
/* 半透明光锥只在高画质显示，提供水体体积感 */
if(!lowQ){
  const beam = new THREE.Mesh(new THREE.ConeGeometry(5.4, 18, 24, 1, true),
    new THREE.MeshBasicMaterial({color:0x73dfd1,transparent:true,opacity:0.026,depthWrite:false,
      side:THREE.BackSide,blending:THREE.AdditiveBlending,fog:false}));
  beam.rotation.x = Math.PI/2; beam.position.set(0,-0.05,-9); beam.renderOrder = 2;
  camera.add(beam);
}

/* 深海穹顶：比纯色背景更有纵深，同时保持完全离线 */
const abyssDome = new THREE.Mesh(
  new THREE.SphereGeometry(145, lowQ?20:32, lowQ?12:20),
  new THREE.ShaderMaterial({
    side:THREE.BackSide,depthWrite:false,depthTest:false,
    uniforms:{ top:{value:new THREE.Color(0x123843)}, bottom:{value:new THREE.Color(0x010308)} },
    vertexShader:"varying float vH;void main(){vH=normalize(position).y*.5+.5;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
    fragmentShader:"uniform vec3 top;uniform vec3 bottom;varying float vH;void main(){float h=smoothstep(.08,.92,vH);vec3 c=mix(bottom,top,h);c+=vec3(.01,.035,.04)*pow(h,3.0);gl_FragColor=vec4(c,1.0);}"
  })
);
abyssDome.renderOrder = -100;
scene.add(abyssDome);

/* v8：水面薄膜与远处体积光束，营造真实的上下水层次；低画质只保留水面。 */
const waterSurfaceMat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,fog:false,
  uniforms:{uTime:{value:0},uColor:{value:new THREE.Color(0x4eb9b6)},uOpacity:{value:lowQ?.08:.16}},
  vertexShader:"uniform float uTime;varying vec3 vW;void main(){vec3 p=position;p.z+=sin(p.x*.10+uTime*.42)*.18+sin(p.y*.13-uTime*.31)*.11;vec4 w=modelMatrix*vec4(p,1.0);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}",
  fragmentShader:"uniform float uTime;uniform vec3 uColor;uniform float uOpacity;varying vec3 vW;void main(){vec2 p=vW.xz*.09;float w=.5+.5*sin(p.x*1.7+p.y+uTime*.55)*sin(p.y*1.3-p.x*.7-uTime*.38);float glint=pow(w,6.0);gl_FragColor=vec4(uColor*(.62+glint*.8),uOpacity+glint*.10);}"
});
const waterSurface=new THREE.Mesh(new THREE.PlaneGeometry(180,180,lowQ?1:24,lowQ?1:24),waterSurfaceMat);
waterSurface.rotation.x=-Math.PI/2;waterSurface.position.y=16.5;waterSurface.renderOrder=-10;scene.add(waterSurface);
const lightShafts=new THREE.Group();
if(!lowQ){
  const shaftMat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,fog:false,
    uniforms:{uColor:{value:new THREE.Color(0x78e6dc)},uOpacity:{value:.04},uPhase:{value:0}},
    vertexShader:"varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
    fragmentShader:"uniform vec3 uColor;uniform float uOpacity;uniform float uPhase;varying vec2 vUv;void main(){float hw=mix(.48,.035,vUv.y);float edge=1.0-smoothstep(hw*.32,hw,abs(vUv.x-.5));float fade=smoothstep(0.0,.18,vUv.y)*(1.0-smoothstep(.72,1.0,vUv.y));float ripple=.8+.2*sin(vUv.y*13.0+uPhase);gl_FragColor=vec4(uColor,edge*fade*ripple*uOpacity);}"
  });
  [[-22,5,-18,4.5,.12],[19,4,-31,6,-.10],[3,5,28,3.8,.06],[-39,3,24,5.4,-.08]].forEach((d,i)=>{
    const s=new THREE.Group(),mats=[];
    for(const ry of [0,Math.PI/2]){const mat=shaftMat.clone();mat.uniforms.uPhase.value=i*1.7;const card=new THREE.Mesh(new THREE.PlaneGeometry(d[3]*2,28),mat);card.rotation.y=ry;s.add(card);mats.push(mat);}
    s.position.set(d[0],d[1],d[2]);s.rotation.z=d[4];s.rotation.x=(i%2?-.05:.04);s.userData={phase:i*1.7,materials:mats};lightShafts.add(s);
  });
  scene.add(lightShafts);
}

/* ===== 地形（可重建：关卡预设；terrainHeight 自动读 G.terrain.preset） ===== */
let terrainMesh = null, causticMesh = null;
function buildTerrain(){
  const SIZE = 140, SEG = lowQ ? 40 : 64;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI/2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count*3);
  for(let i=0;i<pos.count;i++){
    const x = pos.getX(i), z = pos.getZ(i);
    const h = terrainHeight(x, z);
    pos.setY(i, h);
    /* v23.4 海床顶点色重做：高度分区（谷冷丘暖）+ 大尺度有机色斑，替代原先的均匀微噪 */
    const hn = Math.max(-1, Math.min(1, (h+3.2)/6.4));
    const blotch = .5+.5*Math.sin(x*.11+Math.sin(z*.13)*2.2)*Math.sin(z*.09+x*.07);
    const v = (0.62+0.2*hn)*(0.84+0.24*blotch)+0.05*Math.sin(x*2.1+z*1.7);
    colors[i*3] = Math.min(1, v*(0.88+0.16*blotch));
    colors[i*3+1] = Math.min(1, v*(0.97+0.06*hn));
    colors[i*3+2] = Math.min(1, v*(1.12-0.2*hn));
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const terrainMat=new THREE.MeshStandardMaterial({color:currentVisualPalette.ground,vertexColors:true,roughness:.94,metalness:.015,normalScale:new THREE.Vector2(.62,.62)});
  attachSurfaceTexture(terrainMat,"map",SURFACE_TEX.floorDiff);
  attachSurfaceTexture(terrainMat,"normalMap",SURFACE_TEX.floorNorm);
  attachSurfaceTexture(terrainMat,"roughnessMap",SURFACE_TEX.floorRough);
  const mesh = new THREE.Mesh(geo, terrainMat);
  mesh.receiveShadow = true;
  if(terrainMesh||causticMesh)disposeRoots([terrainMesh,causticMesh]);
  causticMesh=null;
  terrainMesh = mesh;
  mesh.matrixAutoUpdate=false;mesh.updateMatrix();   // v24.15 静态网格矩阵冻结（省每帧矩阵合成）
  scene.add(mesh);
  /* 程序化焦散覆盖层：双频水纹随时间缓慢漂移 */
  if(!lowQ){
    const mat = new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
      uniforms:{uTime:{value:0},uTint:{value:new THREE.Color(currentVisualPalette.accent)}},
      vertexShader:"varying vec3 vW;void main(){vec4 w=modelMatrix*vec4(position,1.0);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}",
      fragmentShader:"uniform float uTime;uniform vec3 uTint;varying vec3 vW;void main(){vec2 p=vW.xz*.30;float a=sin(p.x+p.y+uTime*.54);float b=sin(p.x*1.67-p.y*1.23-uTime*.41);float c=sin(length(p*.76)+uTime*.31);float d=sin(p.x*2.31+p.y*.73-uTime*.27);float k=pow(max(0.0,(a+b+c+d)*.25),5.5);float haze=.015*(.5+.5*sin(p.x*.22-p.y*.19+uTime*.08));gl_FragColor=vec4(uTint,k*.15+haze);}"
    });
    causticMesh = new THREE.Mesh(geo,mat); causticMesh.position.y=.045; causticMesh.renderOrder=1;
    causticMesh.matrixAutoUpdate=false;causticMesh.updateMatrix();   // v24.15 静态矩阵冻结
    scene.add(causticMesh);
  }
}

/* ===== 障碍（可重建：每关独立配置；L2 藻柱 kind:"kelp"） ===== */
const rockGeo = new THREE.IcosahedronGeometry(1, 0);
const rockMat = new THREE.MeshStandardMaterial({ color:currentVisualPalette.rock, roughness:0.94, metalness:0.025,flatShading:true,normalScale:new THREE.Vector2(.52,.52) });
const rockSideMat = new THREE.MeshStandardMaterial({ color:0x40595c, roughness:.98, metalness:0.015,flatShading:true,normalScale:new THREE.Vector2(.42,.42) });
attachSurfaceTexture(rockMat,"map",SURFACE_TEX.rockDiff);attachSurfaceTexture(rockMat,"normalMap",SURFACE_TEX.rockNorm);
attachSurfaceTexture(rockSideMat,"map",SURFACE_TEX.rockDiff);attachSurfaceTexture(rockSideMat,"normalMap",SURFACE_TEX.rockNorm);
const kelpMat = new THREE.MeshStandardMaterial({ color:0x22604f, emissive:0x061c16, roughness:0.78, metalness:0.02 });
const kelpTipMat = new THREE.MeshStandardMaterial({ color:0x58a978, emissive:0x0c2a1b, roughness:0.72 });
const coralMat = new THREE.MeshStandardMaterial({ color:0x9b526d, emissive:0x2a0b18, roughness:0.7 });
keepRes(rockGeo,rockMat,rockSideMat,kelpMat,kelpTipMat,coralMat);
let obstacleMeshes = [];
function buildKelpObstacle(o, seed){
  const g = new THREE.Group();
  const stems=[];
  for(let s=0;s<3;s++){
    const stem = new THREE.Group();
    const sx=(s-1)*o.r*.28, phase=seed*.7+s*1.9;
    for(let j=0;j<4;j++){
      const seg=new THREE.Mesh(new THREE.CylinderGeometry(.09+(.03*j),.13+(.035*j),1.9,6),kelpMat);
      seg.position.set(Math.sin(phase+j*.8)*.16,j*1.55+.85,0);
      seg.rotation.z=Math.sin(phase+j*.65)*.10;
      stem.add(seg);
    }
    const tip=new THREE.Mesh(new THREE.ConeGeometry(.38,1.4,5),kelpTipMat);
    tip.position.set(Math.sin(phase+3.2)*.22,6.45,0); tip.rotation.z=Math.sin(phase)*.18;
    stem.add(tip); stem.position.x=sx; stem.scale.setScalar(.88+o.r*.1);
    stem.userData={phase,baseX:sx}; g.add(stem); stems.push(stem);
  }
  g.userData={kind:"kelp",stems,seed};
  return g;
}
var rebuildObstacles = buildObstacles;   // v33b 桥接：applyLevelSignature 的 obst 关卡在场景建成后重建障碍网格
/* v23.2：顶点扰动巨岩（三套共享变体；确定性位移，重合顶点同步形变不破面） */
const boulderGeos=(()=>{
  const arr=[];
  for(let v=0;v<3;v++){
    const geo=new THREE.IcosahedronGeometry(1,1),pos=geo.attributes.position;
    for(let i=0;i<pos.count;i++){
      const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
      const n=.8+.4*((Math.sin(x*3.1+v*7.3)+Math.sin(y*4.3+v*11.7)*.6+Math.sin(z*3.7+v*5.1)*.6)/2.2+.5);
      pos.setXYZ(i,x*n,y*n*.8,z*n);
    }
    geo.computeVertexNormals();arr.push(geo);
  }
  return arr;
})();
keepRes(...boulderGeos);
function buildObstacles(list){
  list = list || OBSTACLES;
  disposeRoots(obstacleMeshes);
  obstacleMeshes = [];
  for(let oi=0;oi<list.length;oi++){
    const o=list[oi]; let r;
    if(o.kind === "kelp"){
      r = buildKelpObstacle(o,oi+1);
      r.position.set(o.x,terrainHeight(o.x,o.z),o.z);
    } else {
      r = new THREE.Group();
      const main=new THREE.Mesh(boulderGeos[oi%3],rockMat);
      main.scale.set(o.r,o.r*.72,o.r); main.position.y=o.r*.36;
      main.rotation.set(oi*.73,oi*1.17,oi*.41); r.add(main);
      const side=new THREE.Mesh(boulderGeos[(oi+1)%3],rockSideMat);
      side.scale.set(o.r*.48,o.r*.32,o.r*.42); side.position.set(o.r*.7,o.r*.18,-o.r*.18); side.rotation.y=oi;
      r.add(side);
      const pebbles=new THREE.InstancedMesh(boulderGeos[(oi+2)%3],rockSideMat,4),pbM=new THREE.Matrix4();
      for(let pb=0;pb<4;pb++){const pa=oi*.9+pb*1.7;pbM.makeScale(.14,.11,.14);pbM.setPosition(Math.cos(pa)*o.r*.95,.06,Math.sin(pa)*o.r*.95);pebbles.setMatrixAt(pb,pbM);}pebbles.instanceMatrix.needsUpdate=true;r.add(pebbles);
      if(oi%3===0){
        for(let c=0;c<3;c++){
          const bud=new THREE.Mesh(new THREE.SphereGeometry(.12+c*.035,6,4),coralMat);
          bud.position.set(-o.r*.42+c*.17,o.r*.72+c*.08,o.r*.2); r.add(bud);
        }
      }
      r.position.set(o.x,terrainHeight(o.x,o.z),o.z);
    }
    r.traverse(ch=>{if(ch.isMesh){ch.castShadow=!lowQ;ch.receiveShadow=true;}});
    scene.add(r);
    obstacleMeshes.push(r);
  }
  /* 废墟残骸（柱 + 横梁 + 拱门）——遗留默认单关路径；关卡模式障碍已含残骸布局 */
  if(list === OBSTACLES){
    const debrisMat = new THREE.MeshStandardMaterial({ color:0x5a6e70, roughness:0.9, metalness:0.1 });
    for(const d of DEBRIS){
      const x = d.x, z = d.z;
      const g = new THREE.Group();
      const col = new THREE.Mesh(new THREE.BoxGeometry(1.2, 5, 1.2), debrisMat);
      col.position.y = terrainHeight(x,z)+2.5; col.castShadow = true;
      const beam = new THREE.Mesh(new THREE.BoxGeometry(6, 0.8, 0.8), debrisMat);
      beam.position.set(0, terrainHeight(x,z)+5.2, 0); beam.castShadow = true;
      const slab = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.7, 3.4), debrisMat);
      slab.position.set(2, terrainHeight(x,z)+0.35, 1.5); slab.castShadow = true;
      g.add(col, beam, slab);
      g.position.set(x, 0, z);
      scene.add(g);
      obstacleMeshes.push(g);
    }
  }
}

/* v4：非碰撞海床生态，填补大面积空地；使用共享几何保持性能 */
const grassGeo = new THREE.ConeGeometry(.075,1.45,5);
const grassMat = new THREE.MeshStandardMaterial({color:0x2f7b68,emissive:0x061c18,roughness:.82});
let grassShader=null;
grassMat.onBeforeCompile=shader=>{
  grassShader=shader;shader.uniforms.uV9Time={value:0};
  shader.vertexShader=shader.vertexShader.replace("#include <common>","#include <common>\nuniform float uV9Time;")
    .replace("#include <begin_vertex>","#include <begin_vertex>\nfloat v9Blade=smoothstep(-0.72,0.72,position.y);transformed.x+=sin(uV9Time*1.25+position.y*2.8)*0.11*v9Blade;transformed.z+=cos(uV9Time*.82+position.y*2.1)*0.045*v9Blade;");
};
grassMat.customProgramCacheKey=()=>"v9-swaying-seagrass";
const anemoneMat = new THREE.MeshStandardMaterial({color:0x685786,emissive:0x17102a,roughness:.62});
const glowBudMat = new THREE.MeshBasicMaterial({color:0x68e8d0,transparent:true,opacity:.72,fog:false});
const ventMat = new THREE.MeshStandardMaterial({color:0x26343a,roughness:.95,metalness:.12,flatShading:true});
const ecoCoreGeo=new THREE.SphereGeometry(.34,8,6),ecoArmGeo=new THREE.CylinderGeometry(.025,.055,.72,5);
const ecoBudGeo=new THREE.SphereGeometry(.07,6,4),ventGeo=new THREE.CylinderGeometry(.18,.42,1.15,6);
const ventLipGeo=new THREE.TorusGeometry(.2,.05,5,10),ventGlowGeo=new THREE.ConeGeometry(.24,1.8,8,1,true);
const ventGlowMat=new THREE.MeshBasicMaterial({color:0x4bb8aa,transparent:true,opacity:.07,depthWrite:false,blending:THREE.AdditiveBlending});
/* v9：贝壳、骨片、珊瑚扇与潮晶全部使用 InstancedMesh；数量大、提交次数仍固定。 */
const shellGeo=new THREE.TorusGeometry(.22,.065,5,12,Math.PI*1.55),boneDetailGeo=new THREE.CylinderGeometry(.035,.075,.85,5);
const coralFanGeo=new THREE.CircleGeometry(.46,9,0,Math.PI),detailCrystalGeo=new THREE.OctahedronGeometry(.22,0);
/* v10：让“海底位于古舰内部”的真相直接进入建模——船肋、舱板与记忆导管仍采用批渲染。 */
const hullRibGeo=new THREE.TorusGeometry(5.2,.13,6,22,Math.PI),hullPanelGeo=new THREE.BoxGeometry(3.4,.12,1.05),memoryConduitGeo=new THREE.CylinderGeometry(.045,.08,2.6,6);
const shellDetailMat=new THREE.MeshStandardMaterial({color:0xb7a68c,roughness:.58,metalness:.08,map:organicDetailTex,bumpMap:organicBumpTex,bumpScale:.012});
const boneDetailMat=new THREE.MeshStandardMaterial({color:0x9aa6a0,roughness:.72,metalness:.04,map:organicDetailTex});
const coralFanMat=new THREE.MeshStandardMaterial({color:0xba5e82,emissive:0x210916,roughness:.66,side:THREE.DoubleSide,map:organicDetailTex});
const detailCrystalMat=new THREE.MeshStandardMaterial({color:0x5bd8d0,emissive:0x184a4d,emissiveIntensity:.68,roughness:.22,metalness:.28});
const hullRibMat=new THREE.MeshStandardMaterial({color:0x34454f,emissive:0x07131b,roughness:.44,metalness:.68,map:organicDetailTex}),hullPanelMat=new THREE.MeshStandardMaterial({color:0x263a43,emissive:0x061219,roughness:.38,metalness:.74}),memoryConduitMat=new THREE.MeshStandardMaterial({color:0x63e8cf,emissive:0x2b8d7f,emissiveIntensity:1.15,roughness:.2,metalness:.35});
keepRes(grassGeo,grassMat,anemoneMat,glowBudMat,ventMat,ecoCoreGeo,ecoArmGeo,ecoBudGeo,ventGeo,ventLipGeo,ventGlowGeo,ventGlowMat,shellGeo,boneDetailGeo,coralFanGeo,detailCrystalGeo,hullRibGeo,hullPanelGeo,memoryConduitGeo,shellDetailMat,boneDetailMat,coralFanMat,detailCrystalMat,hullRibMat,hullPanelMat,memoryConduitMat);
let detailMeshes=[];
function detailRand(i,k){const v=Math.sin(i*12.9898+k*78.233)*43758.5453;return v-Math.floor(v);}
const ecoMatrix=new THREE.Matrix4(),ecoQuat=new THREE.Quaternion(),ecoEuler=new THREE.Euler(),ecoPos=new THREE.Vector3(),ecoScale=new THREE.Vector3();
function addEcoBatch(root,geo,mat,specs,shadows){
  if(!specs.length)return null;
  const mesh=new THREE.InstancedMesh(geo,mat,specs.length);
  for(let i=0;i<specs.length;i++){
    const s=specs[i];ecoPos.set(s.p[0],s.p[1],s.p[2]);ecoEuler.set(s.r[0],s.r[1],s.r[2]);ecoQuat.setFromEuler(ecoEuler);ecoScale.set(s.s[0],s.s[1],s.s[2]);
    ecoMatrix.compose(ecoPos,ecoQuat,ecoScale);mesh.setMatrixAt(i,ecoMatrix);
    if(s.c)mesh.setColorAt(i,new THREE.Color(s.c));
  }
  mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
  mesh.castShadow=!!shadows&&!lowQ;mesh.receiveShadow=true;root.add(mesh);return mesh;
}
function buildLevelLandmark(level){
  const g=new THREE.Group(),accent=currentVisualPalette.accent||0x62e6d2;
  const glow=new THREE.MeshStandardMaterial({color:accent,emissive:accent,emissiveIntensity:.72,roughness:.28,metalness:.06,transparent:true,opacity:.86});
  const dark=new THREE.MeshStandardMaterial({color:currentVisualPalette.rock||0x65777a,roughness:.86,metalness:.08});
  const x=[-22,23,-20,22,0][level-1]||0,z=-38,y=terrainHeight(x,z);g.position.set(x,y,z);g.userData={kind:"landmark",phase:level*.9,animated:[]};
  if(G){G.solids=G.solids||[];G.solids.push({x:x,z:z,r:3.3});}   // v33 地标碰撞体
  const coreRing=new THREE.Mesh(new THREE.TorusGeometry(1.15,.06,8,26),new THREE.MeshBasicMaterial({color:0x7fffd4,transparent:true,opacity:.75,fog:false}));coreRing.position.y=3.2;g.add(coreRing);g.userData.coreRing=coreRing;
  const coreOrb=new THREE.Mesh(new THREE.SphereGeometry(.4,10,8),new THREE.MeshBasicMaterial({color:0xd8fff0,fog:false}));coreOrb.position.y=3.2;g.add(coreOrb);g.userData.coreOrb=coreOrb;   // v34 地标能量核心
  if(level===1){
    for(const side of [-1,1]){const p=new THREE.Mesh(new THREE.CylinderGeometry(.8,1.25,7,8),rockMat);p.position.set(side*3.5,3.2,0);p.rotation.z=side*.12;g.add(p);}
    const arch=new THREE.Mesh(new THREE.TorusGeometry(3.55,.72,8,28,Math.PI),rockMat);arch.position.y=6.15;g.add(arch);
    for(let i=0;i<7;i++){const c=new THREE.Mesh(new THREE.ConeGeometry(.18+.05*(i%3),1.2+i*.12,6),glow);c.position.set(-2.6+i*.86,.45,Math.sin(i)*.65);g.add(c);}
  }else if(level===2){
    for(let i=0;i<7;i++){const h=8+(i%3)*1.7,stem=new THREE.Mesh(new THREE.CylinderGeometry(.16,.38,h,7),kelpMat);stem.position.set((i-3)*1.05,h*.5,Math.sin(i*1.4));stem.rotation.z=(i-3)*.035;g.add(stem);g.userData.animated.push(stem);const tip=new THREE.Mesh(new THREE.ConeGeometry(.72,2.7,7),kelpTipMat);tip.position.set(stem.position.x,h+.7,stem.position.z);g.add(tip);g.userData.animated.push(tip);}
  }else if(level===3){
    for(let i=0;i<9;i++){const c=new THREE.Mesh(new THREE.OctahedronGeometry(.68+(i%3)*.2,0),i%3===0?glow:dark);c.scale.y=2.3+(i%4)*.55;c.position.set((i-4)*1.05,c.scale.y*.55,Math.sin(i*1.7)*1.5);c.rotation.z=(i-4)*.055;g.add(c);g.userData.animated.push(c);}
  }else if(level===4){
    for(let i=0;i<6;i++){const rib=new THREE.Mesh(new THREE.TorusGeometry(3.5-i*.16,.18,6,18,Math.PI*1.62),dark);rib.position.set(0,3.2,i*1.15-3);rib.rotation.z=Math.PI*.19;g.add(rib);}
    const keel=new THREE.Mesh(new THREE.BoxGeometry(.48,.55,10),dark);keel.position.set(-2.6,.65,0);keel.rotation.z=.12;g.add(keel);
    const lamp=new THREE.Mesh(new THREE.SphereGeometry(.28,8,6),glow);lamp.position.set(1.6,2.3,-1.6);g.add(lamp);g.userData.animated.push(lamp);
  }else{
    for(let i=0;i<7;i++){const a=i/7*Math.PI*2,h=4.8+(i%3)*1.3,m=new THREE.Mesh(new THREE.BoxGeometry(.72,h,.72),dark);m.position.set(Math.cos(a)*4.6,h*.5,Math.sin(a)*2.2);m.rotation.y=-a;m.rotation.z=(i%2?-.035:.035);g.add(m);const rune=new THREE.Mesh(new THREE.BoxGeometry(.12,h*.46,.76),glow);rune.position.set(m.position.x,h*.55,m.position.z+.03);rune.rotation.y=m.rotation.y;g.add(rune);g.userData.animated.push(rune);}
  }
  for(const a of g.userData.animated){a.userData.baseRotZ=a.rotation.z;a.userData.baseScale=a.scale.clone();}
  g.traverse(o=>{if(o.isMesh){o.castShadow=!lowQ;o.receiveShadow=true;}});return g;
}
const megaRibGeo=new THREE.TorusGeometry(3.4,.42,6,14,Math.PI);keepRes(megaRibGeo);   // v23：巨骨拱廊共享几何（半环拱）
function buildEnvironmentDetails(){
  disposeRoots(detailMeshes);
  detailMeshes=[];
  const root=new THREE.Group(),blades=[],cores=[],arms=[],buds=[],vents=[],lips=[],glows=[],pebbles=[],shells=[],bones=[],fans=[],crystals=[],hullRibs=[],hullPanels=[],memoryConduits=[];
  root.userData={kind:"ecoBatch"};const count=lowQ?24:72, level=(G&&G.level)||1;
  for(let i=0;i<count;i++){
    let x=(detailRand(i+level*17,1)-.5)*116, z=(detailRand(i+level*23,2)-.5)*116;
    if(Math.hypot(x,z)<7){x+=x<0?-8:8;z+=z<0?-8:8;}
    const kind=(i+level)%4,y=terrainHeight(x,z),yaw=detailRand(i,11)*Math.PI*2,s=.7+detailRand(i,7)*.85;
    if(kind<2){
      for(let b=0;b<3+(i%3);b++){
        const a=b*2.2+i, rr=.18+.12*b;
        blades.push({p:[x+Math.cos(a+yaw)*rr,y+.68*s,z+Math.sin(a+yaw)*rr],r:[0,yaw,(detailRand(i,b+5)-.5)*.32],s:[s,s*(.65+detailRand(i,b+9)*.7),s],c:(i+b)%3===0?0x70a878:0x4d8a72});
      }
    }else if(kind===2){
      cores.push({p:[x,y+.22*s,z],r:[0,yaw,0],s:[s,s*.58,s]});
      for(let b=0;b<6;b++){
        const a=b/6*Math.PI*2+yaw;arms.push({p:[x+Math.cos(a)*.18*s,y+.63*s,z+Math.sin(a)*.18*s],r:[Math.sin(a)*.34,yaw,Math.cos(a)*.34],s:[s,s,s]});
      }
      buds.push({p:[x,y+.98*s,z],r:[0,0,0],s:[s,s,s]});
    }else{
      vents.push({p:[x,y+.55*s,z],r:[0,yaw,0],s:[s,s,s]});lips.push({p:[x,y+1.13*s,z],r:[Math.PI/2,yaw,0],s:[s,s,s]});glows.push({p:[x,y+2*s,z],r:[0,yaw,0],s:[s,s,s]});
    }
  }
  const pebbleCount=lowQ?64:220;
  for(let i=0;i<pebbleCount;i++){let x=(detailRand(i+level*41,31)-.5)*122,z=(detailRand(i+level*47,32)-.5)*122;if(Math.hypot(x,z)<5)continue;const s=.08+detailRand(i,33)*.34;pebbles.push({p:[x,terrainHeight(x,z)+s*.2,z],r:[detailRand(i,34)*3,detailRand(i,35)*6.28,detailRand(i,36)*3],s:[s*(.8+detailRand(i,37)),s*.55,s],c:i%4===0?0x8a9891:0x697a76});}
  const relicCount=lowQ?18:58;
  for(let i=0;i<relicCount;i++){
    let x=(detailRand(i+level*59,51)-.5)*116,z=(detailRand(i+level*67,52)-.5)*116;if(Math.hypot(x,z)<6){x+=9;z-=7;}
    const y=terrainHeight(x,z),s=.42+detailRand(i,53)*.82,yaw=detailRand(i,54)*Math.PI*2,kind=(i+level*2)%4;
    if(kind===0)shells.push({p:[x,y+.08,z],r:[-Math.PI/2,yaw,detailRand(i,55)*.5],s:[s,s,s],c:level===4?0x91a4ad:0xc2aa8f});
    else if(kind===1)bones.push({p:[x,y+.11,z],r:[Math.PI/2+(detailRand(i,56)-.5)*.25,yaw,0],s:[s,s*(.75+detailRand(i,57)),s],c:level===4?0xb8c0b8:0x899792});
    else if(kind===2)fans.push({p:[x,y+.38*s,z],r:[0,yaw,(detailRand(i,58)-.5)*.22],s:[s,s*(.7+detailRand(i,59)*.6),s],c:level===2?0x67b883:(level===5?0xc16daf:0xb45f7e)});
    else crystals.push({p:[x,y+.24*s,z],r:[detailRand(i,60),yaw,detailRand(i,61)],s:[s*.42,s*(1.1+detailRand(i,62)),s*.42],c:level===3?0x6dafff:(level===5?0xd77cd6:0x5ed8c4)});
  }
/* 深度越高，生态舱下暴露出的大船结构越多；L5 几乎完全进入囚室机械层。 */
  const ribCount=(lowQ?3:5)+level*2;
  for(let i=0;i<ribCount;i++){const side=i%2?-1:1,z=-48+(i/(Math.max(1,ribCount-1)))*96,x=side*(47-level*1.2),y=terrainHeight(x,z)+2.8;hullRibs.push({p:[x,y,z],r:[Math.PI/2,side*Math.PI/2,side*.18],s:[.72+level*.055,.72+level*.055,.72+level*.055],c:level>=4?0x6d5965:0x3d5360});}
  const panelCount=lowQ?8:12+Math.min(level,48)*4;
  for(let i=0;i<panelCount;i++){const lane=i%2?-1:1,x=lane*(12+(i%5)*6),z=-42+Math.floor(i/2)*7.5,y=terrainHeight(x,z)+.04;hullPanels.push({p:[x,y,z],r:[0,(i%3)*.34,0],s:[1+Math.min(level,48)*.045,1,1],c:level===5?0x593f5f:0x2e4650});}
  const conduitCount=lowQ?6:10+Math.min(level,48)*3;
  for(let i=0;i<conduitCount;i++){const a=i/conduitCount*Math.PI*2,r=28+(i%3)*6,x=Math.cos(a)*r,z=Math.sin(a)*r,y=terrainHeight(x,z)+1.3;memoryConduits.push({p:[x,y,z],r:[(detailRand(i,71)-.5)*.28,a,(detailRand(i,72)-.5)*.28],s:[.8,1+Math.min(level,48)*.12,.8],c:level===3?0x75a8ff:(level===5?0xd47ad2:0x63e8cf)});
   if(G){G.solids=G.solids||[];G.solids.push({x:x,z:z,r:.45});}}   // v36 导管碰撞体
  addEcoBatch(root,grassGeo,grassMat,blades,false);addEcoBatch(root,ecoCoreGeo,anemoneMat,cores,false);addEcoBatch(root,ecoArmGeo,anemoneMat,arms,false);addEcoBatch(root,ecoBudGeo,glowBudMat,buds,false);
  addEcoBatch(root,ventGeo,ventMat,vents,false);addEcoBatch(root,ventLipGeo,coralMat,lips,false);addEcoBatch(root,ventGlowGeo,ventGlowMat,glows,false);addEcoBatch(root,rockGeo,rockSideMat,pebbles,false);
  addEcoBatch(root,shellGeo,shellDetailMat,shells,false);addEcoBatch(root,boneDetailGeo,boneDetailMat,bones,false);addEcoBatch(root,coralFanGeo,coralFanMat,fans,false);addEcoBatch(root,detailCrystalGeo,detailCrystalMat,crystals,false);
  addEcoBatch(root,hullRibGeo,hullRibMat,hullRibs,true);addEcoBatch(root,hullPanelGeo,hullPanelMat,hullPanels,false);addEcoBatch(root,memoryConduitGeo,memoryConduitMat,memoryConduits,false);
  /* v23：巨骨拱廊——沉眠巨兽的巨型肋骨半环，随深度增多，撑起远景天际线（低画质关闭） */
  if(!lowQ){
    const megaRibs=[],mc=3+Math.min(level,48);
    for(let i=0;i<mc;i++){
      const a=(i/mc)*Math.PI*2+level*1.3,r=33+((i*37)%23),x=Math.cos(a)*r,z=Math.sin(a)*r,y=terrainHeight(x,z);
      const s=2.1+((i*53)%17)*.15;
      megaRibs.push({p:[x,y+.15,z],r:[0,detailRand(i,81)*Math.PI*2,0],s:[s,s,s],c:0xb8c2ba});
      if(G){G.solids=G.solids||[];G.solids.push({x:x,z:z,r:1.7});}   // v36 巨肋碰撞体
    }
    addEcoBatch(root,megaRibGeo,boneDetailMat,megaRibs,true);
  }
  root.matrixAutoUpdate=false;   // v24.15 生态批根组静态冻结（子件动画各自保有自动矩阵）
  scene.add(root);const landmark=buildLevelLandmark(level);scene.add(landmark);detailMeshes.push(root,landmark);
}

/* v25 第二部创新：记忆碎片——伪造档案与可验证证据成对出现，玩家逐步识破笛雾的操纵 */
const MEMORY_FRAGMENTS=[
  {fake:"伪造档案：建造者留言称髓星为‘应许之地’，字迹崭新如昨。",real:"可验证证据：铭文氧化层只有数十年——它是登陆之后才被刻上的。"},
  {fake:"伪造档案：‘荒凉’神话来自建造者的警告，一字未改。",real:"可验证证据：神话文本的语序与娱乐制造者的模板完全一致。"},
  {fake:"伪造档案：远征队全员在事变之夜自愿留下。",real:"可验证证据：返航舱的解锁记录显示舱门被远程锁死。"},
  {fake:"伪造档案：记忆库毁于陨石撞击，不可恢复。",real:"可验证证据：空白档案的删除批次号连续，是人为清洗。"},
  {fake:"伪造档案：锤翅兽袭击是天性，无法沟通。",real:"可验证证据：唾液样本显示它们会主动回避被标记的营地。"},
  {fake:"伪造档案：首领亲自批准了髓星登陆。",real:"可验证证据：签名能量特征与笛雾的存储器完全匹配。"},
  {fake:"伪造档案：违望者的信仰源自建造者遗物。",real:"可验证证据：圣像内衬用的是事变之后的大船残骸。"},
  {fake:"伪造档案：轨道高桥从未通过结构校验。",real:"可验证证据：忠诚者的缆索应力数据全部合格且仍在更新。"}
];
/* v26：第三至五部记忆碎片池（银表与钟表匠 / 战争与监狱 / 建造者与大船） */
const MEMORY_FRAGMENTS_P3=[
  {fake:"伪造档案：银表是离奇族的圣物，代代相传。",real:"可验证证据：表壳内侧刻着浣生后代的族徽，年代不超过百年。"},
  {fake:"伪造档案：离奇族毁于大船的净化命令。",real:"可验证证据：全城钟表停在同一刻——他们是在恐慌中集体撤离的。"},
  {fake:"伪造档案：燃料管道是建造者封死的。",real:"可验证证据：切口留有熔刀痕迹——建造者从不需要熔刀。"},
  {fake:"伪造档案：提欧的钥匙来自首领的传承。",real:"可验证证据：钥匙齿纹与笛雾存储器的锻造批次完全一致。"},
  {fake:"伪造档案：迈尔辛的加冕获得了万族代表签署。",real:"可验证证据：墨迹未干时，代表们已离开大船三年。"},
  {fake:"伪造档案：洛克天生会读心。",real:"可验证证据：她的‘读心’记录里全是可验证的幻境脚本。"},
  {fake:"伪造档案：浣生的复生失败过十七次。",real:"可验证证据：十七次记录全部来自同一台故障复生舱的日志误写。"},
  {fake:"伪造档案：深层意志就是建造者的声音。",real:"可验证证据：它的梦语结构比建造者档案的语言更古老。"}
];
const MEMORY_FRAGMENTS_P4=[
  {fake:"伪造档案：雷莫拉人拆盾是为了投靠违望者。",real:"可验证证据：拆下的盾板全部装在了平民避难舱的外壁。"},
  {fake:"伪造档案：大船的哀鸣只是反应堆超载的噪音。",real:"可验证证据：噪音波形与疼觉神经信号同构。"},
  {fake:"伪造档案：支撑力场是托住髓星的桥。",real:"可验证证据：髓星夜间收缩时力场反而增强——桥不需要锁紧。"},
  {fake:"伪造档案：监狱假说来自违望者的宣传。",real:"可验证证据：假说的第一条论据出自笛雾之前的船务日志。"},
  {fake:"伪造档案：荒凉的命令都带首领签章。",real:"可验证证据：所有签章的量子噪点完全相同——同一只手的复写。"},
  {fake:"伪造档案：守卫叛变是哈鲁萨鲁的谣言。",real:"可验证证据：守卫巡逻表的绕行坐标与囚室入口完全重合。"},
  {fake:"伪造档案：液氢洪水的阀门连着主水管。",real:"可验证证据：阀门后是一段断头管，从未接入任何水源。"},
  {fake:"伪造档案：放逐是建造者对人类的惩罚。",real:"可验证证据：放逐协议的收件人一栏，写的不是人类的名字。"}
];
const MEMORY_FRAGMENTS_P5=[
  {fake:"伪造档案：大船的意识是荒凉的伪装。",real:"可验证证据：意识波形的应答延迟恒定——伪装撑不过四十年。"},
  {fake:"伪造档案：阀门位置是陷阱。",real:"可验证证据：按图关闭的喷嘴无一反噬——陷阱不会替你省力气。"},
  {fake:"伪造档案：建造者放逐荒凉只是随手为之。",real:"可验证证据：囚室有十四层冗余锁，随手不会造十四层。"},
  {fake:"伪造档案：铁镍撞击是天灾。",real:"可验证证据：撞击点的成分与船体储备库的配重完全一致。"},
  {fake:"伪造档案：黑洞航向是百族表决的结果。",real:"可验证证据：表决记录的哈希值在结果公布前就已生成。"},
  {fake:"伪造档案：重封髓星需要献祭生命。",real:"可验证证据：封印楔片的能量来自反物质余料，不需要牺牲。"},
  {fake:"伪造档案：记忆库重写会删除战败记录。",real:"可验证证据：新档案的校验码把‘不可删除’写进了底层协议。"},
  {fake:"伪造档案：驶向室女座是笛雾的遗愿。",real:"可验证证据：航线由百族与大船共同拟定，笛雾的名字在弃案列表里。"}
];
/* v19：场景交互层——热泉、洋流、可击碎潮晶与环境档案。全部是轻量程序网格，随关卡重建。 */
let interactiveMeshes=[],worldInteractives=[];
function clearInteractiveDetails(){disposeRoots(interactiveMeshes);interactiveMeshes=[];worldInteractives=[];}
function buildInteractiveDetails(){
  clearInteractiveDetails();if(!G)return;
  const lv=G.level||1, accent=stageVisualFamily().accent||0x7fffd4;
  const lvSig=levelSigFor(G&&G.level||1);   // v24.20/v25 关卡特征：额外热泉/力场/记忆碎片/铁雨
  const add=(mesh,data)=>{mesh.position.set(data.x,terrainHeight(data.x,data.z)+.12,data.z);mesh.userData=data;data.mesh=mesh;scene.add(mesh);interactiveMeshes.push(mesh);worldInteractives.push(data);};
  for(let i=0;i<3+(lvSig.vents||0);i++){const a=lv*.8+i*2.1,r=18+(i%2)*13,x=Math.cos(a)*r,z=Math.sin(a)*r;const g=new THREE.Group();g.add(new THREE.Mesh(new THREE.CylinderGeometry(.3,.62,.7,8),new THREE.MeshStandardMaterial({color:0x334248,metalness:.45,roughness:.45})));const plume=new THREE.Mesh(new THREE.ConeGeometry(.36,.95,8),new THREE.MeshBasicMaterial({color:0x71ffd7,transparent:true,opacity:.3,depthWrite:false,blending:THREE.AdditiveBlending}));plume.position.y=.75;g.add(plume);add(g,{kind:"vent",x,z,r:2.4,tick:0,phase:i*1.4});(G.solids=G.solids||[]).push({x:x,z:z,r:.55});}   // v36 热泉口碰撞体
  /* v25 力场侵蚀：蓝白量子力场柱，踏入持续剥蚀护盾与船体 */
  if(lvSig.force)for(let i=0;i<lvSig.force;i++){const a=lv*1.9+i*2.4,r=17+(i%3)*9,x=Math.cos(a)*r,z=Math.sin(a)*r;const g=new THREE.Group();const shell=new THREE.Mesh(new THREE.CylinderGeometry(2.6,2.9,5.2,18,1,true),new THREE.MeshBasicMaterial({color:0x9fc8ff,transparent:true,opacity:.15,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending}));shell.position.y=2.6;g.add(shell);const ringT=new THREE.Mesh(new THREE.TorusGeometry(2.75,.08,6,32),new THREE.MeshBasicMaterial({color:0xd8ecff,transparent:true,opacity:.7,fog:false}));ringT.rotation.x=Math.PI/2;ringT.position.y=5.1;g.add(ringT);const core=new THREE.Mesh(new THREE.SphereGeometry(.34,8,6),new THREE.MeshBasicMaterial({color:0xeaf4ff,fog:false}));core.position.y=2.6;g.add(core);add(g,{kind:"force",x,z,r:2.8,phase:i});}
  /* v25 记忆碎片：悬空档案板，靠近即读取（伪造/证据对照） */
  if(lvSig.memory)for(let i=0;i<lvSig.memory;i++){const a=lv*1.3+i*2.9,r=12+(i%4)*8,x=Math.cos(a)*r,z=Math.sin(a)*r;const g=new THREE.Group();g.add(new THREE.Mesh(new THREE.CylinderGeometry(.5,.66,.5,8),new THREE.MeshStandardMaterial({color:0x2c3f4a,metalness:.55,roughness:.35})));const slab=new THREE.Mesh(new THREE.PlaneGeometry(.62,.88),new THREE.MeshBasicMaterial({color:0xffe9a8,transparent:true,opacity:.85,fog:false,side:THREE.DoubleSide}));slab.position.y=1.05;g.add(slab);add(g,{kind:"memory",x,z,r:2.6,idx:i,seen:false,phase:i*1.7,slab});}
  /* v31 兴趣点：宝箱舱 / 信标解谜（3 座全激活）/ 深渊裂缝挑战 */
  for(let i=0;i<2;i++){const a2=lv*2.6+i*3.3,r2=20+(i%2)*9,x2=Math.cos(a2)*r2,z2=Math.sin(a2)*r2;
    const g3=new THREE.Group();
    g3.add(new THREE.Mesh(new THREE.BoxGeometry(1.1,.7,.7),new THREE.MeshStandardMaterial({color:0x8a6a2f,metalness:.5,roughness:.4,emissive:0x3a2a08,emissiveIntensity:.5})));
    const lid=new THREE.Mesh(new THREE.BoxGeometry(1.14,.16,.74),new THREE.MeshBasicMaterial({color:0xffd66b,fog:false}));lid.position.y=.45;g3.add(lid);
    add(g3,{kind:"chest",x:x2,z:z2,r:2.4,opened:false,phase:i});(G.solids=G.solids||[]).push({x:x2,z:z2,r:.9});
    const lock=new THREE.Mesh(new THREE.TorusGeometry(.1,.025,6,14),new THREE.MeshBasicMaterial({color:0xffe9a8,fog:false}));lock.position.set(0,.2,.38);g3.add(lock);
    const strip=new THREE.Mesh(new THREE.BoxGeometry(1.16,.05,.78),new THREE.MeshBasicMaterial({color:0xffd66b,fog:false}));strip.position.y=.1;g3.add(strip);}
  if(lv%2===1)for(let i=0;i<3;i++){const a2=lv*1.4+i*2.1,r2=15+(i%3)*8,x2=Math.cos(a2)*r2,z2=Math.sin(a2)*r2;
    const g3=new THREE.Group();g3.add(new THREE.Mesh(new THREE.CylinderGeometry(.34,.5,2.2,7),new THREE.MeshStandardMaterial({color:0x2c4a52,metalness:.6,roughness:.3})));
    const orb=new THREE.Mesh(new THREE.SphereGeometry(.26,8,6),new THREE.MeshBasicMaterial({color:0x7fd0ff,fog:false}));orb.position.y=1.5;g3.add(orb);
    add(g3,{kind:"beacon",x:x2,z:z2,r:2.4,idx:i,gid:Math.floor(lv/2),lit:false,orb:orb});(G.solids=G.solids||[]).push({x:x2,z:z2,r:.55});
    const cable=new THREE.Mesh(new THREE.CylinderGeometry(.05,.09,1.1,6),new THREE.MeshStandardMaterial({color:0x22343c,metalness:.6,roughness:.4}));cable.position.y=.55;g3.add(cable);
    const ringB=new THREE.Mesh(new THREE.TorusGeometry(.62,.03,6,20),new THREE.MeshBasicMaterial({color:0x7fd0ff,fog:false}));ringB.rotation.x=Math.PI/2;ringB.position.y=.06;g3.add(ringB);}
  if(lv>=5){const a2=lv*3.1,r2=23,x2=Math.cos(a2)*r2,z2=Math.sin(a2)*r2;
    const g3=new THREE.Group();const ring3=new THREE.Mesh(new THREE.RingGeometry(3.2,3.7,30),new THREE.MeshBasicMaterial({color:0xff5573,transparent:true,opacity:.5,side:THREE.DoubleSide,depthWrite:false,fog:false}));ring3.rotation.x=-Math.PI/2;ring3.position.y=.18;g3.add(ring3);
    const shard=new THREE.Mesh(new THREE.OctahedronGeometry(.5,0),new THREE.MeshBasicMaterial({color:0xff8da0,fog:false}));shard.position.y=1.2;g3.add(shard);
    add(g3,{kind:"rift",x:x2,z:z2,r:3.6,started:false,phase:lv});}
  /* v25 铁雨：轨道碎片弹着点，红圈预警后轰击，落点持续追踪玩家 */
  if(lvSig.rain){const ax=Math.cos(lv*2.2)*10,az=Math.sin(lv*2.2)*10;const g=new THREE.Group();const warn=new THREE.Mesh(new THREE.RingGeometry(2.2,2.8,28),new THREE.MeshBasicMaterial({color:0xffb37a,transparent:true,opacity:.55,side:THREE.DoubleSide,depthWrite:false,fog:false}));warn.rotation.x=-Math.PI/2;warn.position.y=.16;g.add(warn);const bead=new THREE.Mesh(new THREE.SphereGeometry(.3,8,6),new THREE.MeshBasicMaterial({color:0xffd9b0,fog:false}));bead.position.y=.4;g.add(bead);add(g,{kind:"rain",x:ax,z:az,r:2.8,tick:2.6,phase:0});}
  /* v26 反物质喷口：紫环 stationary，蓄能 1.4s 变白爆喷（第三部·反应堆） */
  if(lvSig.am)for(let i=0;i<lvSig.am;i++){const a=lv*1.6+i*2.7,r=16+(i%3)*10,x=Math.cos(a)*r,z=Math.sin(a)*r;const g=new THREE.Group();const ring=new THREE.Mesh(new THREE.RingGeometry(2.3,2.9,28),new THREE.MeshBasicMaterial({color:0xb26bff,transparent:true,opacity:.5,side:THREE.DoubleSide,depthWrite:false,fog:false}));ring.rotation.x=-Math.PI/2;ring.position.y=.16;g.add(ring);const orb=new THREE.Mesh(new THREE.SphereGeometry(.32,8,6),new THREE.MeshBasicMaterial({color:0xd9b0ff,fog:false}));orb.position.y=1.1;g.add(orb);add(g,{kind:"am",x,z,r:2.9,tick:2+Math.random()*2,armed:false,phase:i});}
  /* v26 液氢寒潮：低温雾区，踏入持续减速（第四部·洪水） */
  if(lvSig.cold)for(let i=0;i<lvSig.cold;i++){const a=lv*1.1+i*2.9,r=14+(i%3)*11,x=Math.cos(a)*r,z=Math.sin(a)*r;const g=new THREE.Group();const disc=new THREE.Mesh(new THREE.CircleGeometry(3.4,26),new THREE.MeshBasicMaterial({color:0xbfe8ff,transparent:true,opacity:.13,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending}));disc.rotation.x=-Math.PI/2;disc.position.y=.14;g.add(disc);const rim=new THREE.Mesh(new THREE.RingGeometry(3.1,3.4,28),new THREE.MeshBasicMaterial({color:0xdff4ff,transparent:true,opacity:.42,side:THREE.DoubleSide,depthWrite:false,fog:false}));rim.rotation.x=-Math.PI/2;rim.position.y=.16;g.add(rim);add(g,{kind:"cold",x,z,r:3.4,phase:i});}
  /* v26 建造者光束：双端旋转光梁，触碰即伤（第五部·囚室） */
  if(lvSig.flare)for(let i=0;i<lvSig.flare;i++){const a=lv*.9+i*3.1,r=18+(i%3)*9,x=Math.cos(a)*r,z=Math.sin(a)*r;const g=new THREE.Group();const pylon=new THREE.Mesh(new THREE.CylinderGeometry(.4,.62,2.6,8),new THREE.MeshStandardMaterial({color:0x3c4c58,metalness:.6,roughness:.35}));pylon.position.y=1.3;g.add(pylon);const beam=new THREE.Mesh(new THREE.BoxGeometry(.22,.22,14.4),new THREE.MeshBasicMaterial({color:0xffe27a,transparent:true,opacity:.5,depthWrite:false,blending:THREE.AdditiveBlending,fog:false}));beam.position.y=2.7;g.add(beam);const tipA=new THREE.Mesh(new THREE.SphereGeometry(.2,6,5),new THREE.MeshBasicMaterial({color:0xfff6cf,fog:false}));tipA.position.set(0,2.7,7.2);g.add(tipA);const tipB=tipA.clone();tipB.position.z=-7.2;g.add(tipB);add(g,{kind:"flare",x,z,r:1.1,tick:0,phase:i});}
  /* v26 大船援助：金色馈赠环，靠近即得生命/超频/弹药（第五部·觉醒） */
  if(lvSig.gift)for(let i=0;i<lvSig.gift;i++){const a=lv*1.7+i*2.5,r=12+(i%4)*8,x=Math.cos(a)*r,z=Math.sin(a)*r;const g=new THREE.Group();const halo=new THREE.Mesh(new THREE.TorusGeometry(1.1,.09,6,26),new THREE.MeshBasicMaterial({color:0xffe9a8,transparent:true,opacity:.85,fog:false}));halo.rotation.x=Math.PI/2;halo.position.y=.9;g.add(halo);const heart=new THREE.Mesh(new THREE.OctahedronGeometry(.34,0),new THREE.MeshBasicMaterial({color:0xfff6cf,fog:false}));heart.position.y=.9;g.add(heart);add(g,{kind:"gift",x,z,r:2.4,phase:i});}
  for(let i=0;i<2;i++){const z=-26+i*32,mesh=new THREE.Mesh(new THREE.PlaneGeometry(18,4),new THREE.MeshBasicMaterial({color:0x4eb9d8,transparent:true,opacity:.12,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending}));mesh.rotation.x=-Math.PI/2;add(mesh,{kind:"current",x:0,z,r:9,dir:(i?1:-1),phase:i});}
  for(let i=0;i<5;i++){const a=lv*1.7+i*1.22,r=10+(i%3)*11,x=Math.cos(a)*r,z=Math.sin(a)*r,mesh=new THREE.Mesh(new THREE.OctahedronGeometry(.58,1),new THREE.MeshStandardMaterial({color:accent,emissive:accent,emissiveIntensity:1.2,roughness:.2,metalness:.35,transparent:true,opacity:.9}));add(mesh,{kind:"crystal",x,z,hp:2,maxHp:2,r:1.2,value:12,phase:i});}
  const tx=Math.sin(lv*2.4)*25,tz=Math.cos(lv*1.8)*25,terminal=new THREE.Group();terminal.add(new THREE.Mesh(new THREE.BoxGeometry(.65,1.1,.25),new THREE.MeshStandardMaterial({color:0x354f58,metalness:.65,roughness:.3})));const screen=new THREE.Mesh(new THREE.PlaneGeometry(.42,.3),new THREE.MeshBasicMaterial({color:accent,transparent:true,opacity:.9,fog:false}));screen.position.set(0,.18,.14);terminal.add(screen);add(terminal,{kind:"storyNode",x:tx,z:tz,r:3,seen:false,level:lv});
}
function tickWorldInteractives(dt){
  if(!G||!worldInteractives.length)return;
  for(const it of worldInteractives){
    if(it.kind==="vent"){it.tick-=dt;if(it.tick<=0&&Math.hypot(player.x-it.x,player.z-it.z)<it.r){it.tick=1.1;playerHit(5);burstParticle(it.x,terrainHeight(it.x,it.z)+1,it.z,0x71ffd7,5);}}
    else if(it.kind==="current"&&Math.hypot(player.x-it.x,player.z-it.z)<it.r){player.x+=it.dir*dt*1.4;player.z+=Math.sin(G.time+it.phase)*dt*.5;}
    else if(it.kind==="storyNode"&&!it.seen&&Math.hypot(player.x-it.x,player.z-it.z)<it.r){it.seen=true;showTransmission("环境档案 · " + String(it.level).padStart(2,"0"),"终端回放：这片海床并非自然形成。船体记忆正在把登陆者写回原位。",5200);grantCurrency(1,"环境档案");}
    else if(it.kind==="force"&&Math.hypot(player.x-it.x,player.z-it.z)<it.r){G.forceTick=(G.forceTick||0)-dt;if(G.forceTick<=0){G.forceTick=.55;playerHit(6);burstParticle(player.x,terrainHeight(player.x,player.z)+1.4,player.z,0x9fc8ff,5);}}
    else if(it.kind==="memory"&&!it.seen&&Math.hypot(player.x-it.x,player.z-it.z)<it.r){it.seen=true;if(it.slab)it.slab.visible=false;const lvNow=G.level||1,pool=lvNow<=40?MEMORY_FRAGMENTS:lvNow<=60?MEMORY_FRAGMENTS_P3:lvNow<=80?MEMORY_FRAGMENTS_P4:MEMORY_FRAGMENTS_P5,frag=pool[(lvNow+it.idx)%pool.length];showTransmission("记忆碎片 · 已核验",frag.fake+"\n"+frag.real,6200);grantCurrency(2,"记忆碎片");G.score=(G.score||0)+60;}
    else if(it.kind==="rain"){it.tick-=dt;if(it.tick<=0){const hit=Math.hypot(player.x-it.x,player.z-it.z)<it.r;if(hit){playerHit(11);burstParticle(it.x,terrainHeight(it.x,it.z)+1,it.z,0xffb37a,16);toast("铁雨命中！");}else burstParticle(it.x,terrainHeight(it.x,it.z)+.8,it.z,0xff8a4a,9);const na=Math.random()*Math.PI*2,nr=7+Math.random()*9;it.x=Math.round(player.x+Math.cos(na)*nr);it.z=Math.round(player.z+Math.sin(na)*nr);if(it.mesh)it.mesh.position.set(it.x,terrainHeight(it.x,it.z)+.1,it.z);it.tick=3.4+Math.random()*2.6;}}
    else if(it.kind==="am"){it.tick-=dt;if(it.tick<=0){if(it.armed){if(Math.hypot(player.x-it.x,player.z-it.z)<it.r){playerHit(13);burstParticle(it.x,terrainHeight(it.x,it.z)+1,it.z,0xc07aff,18);}it.armed=false;it.tick=3.8;if(it.mesh)it.mesh.children[1].material.color.setHex(0xd9b0ff);}else{it.armed=true;it.tick=1.4;if(it.mesh)it.mesh.children[1].material.color.setHex(0xffffff);}}}
    else if(it.kind==="cold"&&Math.hypot(player.x-it.x,player.z-it.z)<it.r){G.slow=Math.max(G.slow||0,.3);}
    else if(it.kind==="flare"){const a=it.mesh.rotation.y,dx=player.x-it.x,dz=player.z-it.z,along=dx*Math.sin(a)+dz*Math.cos(a),perp=Math.abs(dx*Math.cos(a)-dz*Math.sin(a));if(perp<1.15&&Math.abs(along)<7.2){it.tick-=dt;if(it.tick<=0){it.tick=.5;playerHit(9);burstParticle(player.x,terrainHeight(player.x,player.z)+1.2,player.z,0xffe27a,6);}}}
    else if(it.kind==="chest"&&!it.opened&&Math.hypot(player.x-it.x,player.z-it.z)<it.r){it.opened=true;grantGold(120+(G.level||1)*4,"宝箱舱");G.ammo=Math.min(AMMO_MAX,(G.ammo||0)+2);grantCrystal(1,"宝箱");if(it.mesh&&it.mesh.children[1])it.mesh.children[1].visible=false;burstParticle(it.x,terrainHeight(it.x,it.z)+1,it.z,0xffd66b,16);}
    else if(it.kind==="beacon"&&!it.lit&&Math.hypot(player.x-it.x,player.z-it.z)<it.r){it.lit=true;if(it.orb)it.orb.material.color.setHex(0xffe9a8);sound("pickup");
      const sets2=(G.beaconSets=G.beaconSets||{});const st2=sets2[it.gid]=sets2[it.gid]||{n:0};
      st2.n++;toast("信标激活 "+st2.n+"/3");
      if(st2.n>=3){grantGold(300,"信标解谜");grantCrystal(3,"解谜完成");}}
    else if(it.kind==="rift"&&!it.started&&Math.hypot(player.x-it.x,player.z-it.z)<it.r){it.started=true;toast("裂缝挑战 · 90 秒清剿！");
      G.rift={t:90,spawned:false};
      const n3=4+Math.floor((G.level||1)/12);
      for(let si6=0;si6<n3;si6++){const aa=Math.random()*Math.PI*2,rr2=3+Math.random()*4;spawnRiftMonster(it.x+Math.cos(aa)*rr2,it.z+Math.sin(aa)*rr2);}
      G.rift.spawned=true;
    }
    else if(it.kind==="gift"){if(it.hideT>0){it.hideT-=dt;if(it.hideT<=0&&it.mesh)it.mesh.visible=true;}else if(Math.hypot(player.x-it.x,player.z-it.z)<it.r){it.hideT=15;G.hp=Math.min(G.maxHp||HP_MAX,(G.hp||0)+20);G.overdrive=Math.max(G.overdrive||0,4);G.ammo=Math.min(AMMO_MAX,(G.ammo||0)+2);toast("大船的援助 · 生命 +20 · 超频 4s · 弹药 +2");burstParticle(it.x,terrainHeight(it.x,it.z)+1.4,it.z,0xffe9a8,16);if(it.mesh)it.mesh.visible=false;}}
  }
  for(const it of worldInteractives){if(it.mesh&&it.kind!=="storyNode"){it.mesh.rotation.y+=dt*(it.kind==="current"?.12:.35);if(it.kind==="crystal")it.mesh.scale.setScalar(1+.08*Math.sin(G.time*4+it.phase));}if(it.kind!=="crystal"||it.hp<=0)continue;for(let i=pulses.length-1;i>=0;i--){const p=pulses[i];if(Math.hypot(p.x-it.x,p.z-it.z)<it.r){it.hp--;disposeRoots([p.mesh]);pulses.splice(i,1);burstParticle(it.x,terrainHeight(it.x,it.z)+.8,it.z,stageVisualFamily().accent,8);if(it.hp<=0){it.mesh.visible=false;G.score+=it.value;G.ammo=Math.min(AMMO_MAX,(G.ammo||0)+1);grantCurrency(runBuild.crystalDividend?2:1,"潮晶回收");toast("潮晶破碎 · 弹药 +1");}}}}
}

/* ===== 裂口（终点门，可重建：每关 gatePos） ===== */
const gateGroup = new THREE.Group();
{
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(3, 0.35, 10, 28),
    new THREE.MeshBasicMaterial({ color:0xe0506a, fog:false })   // S3：目标网格不受雾影响
  );
  ring.rotation.x = Math.PI/2;
  const inner = new THREE.Mesh(
    new THREE.TorusGeometry(2.2, 0.12, 8, 24),
    new THREE.MeshBasicMaterial({ color:0x7fffd4, fog:false })   // S3：目标网格不受雾影响
  );
  inner.rotation.x = Math.PI/2;
  gateGroup.add(ring, inner);
  /* v23.2 建模补强：环绕符文碎片 + 环面刻度（children[0]/[1] 契约不变，环色逻辑不受影响） */
  const shardGeo=new THREE.OctahedronGeometry(.24,0);
  for(let sh=0;sh<8;sh++){
    const a=sh/8*Math.PI*2,shard=new THREE.Mesh(shardGeo,new THREE.MeshBasicMaterial({color:sh%2?0x7fffd4:0xd9c08a,fog:false}));
    shard.position.set(Math.cos(a)*4.15,(sh%2?.55:-.55),Math.sin(a)*4.15);
    shard.rotation.set(sh*.7,sh*1.3,0);shard.scale.setScalar(.8+(sh%3)*.2);
    gateGroup.add(shard);
  }
  const tickGeo=new THREE.BoxGeometry(.42,.1,.14),ticks=new THREE.InstancedMesh(tickGeo,new THREE.MeshBasicMaterial({color:0x7fffd4,transparent:true,opacity:.5,fog:false}),12),tkM=new THREE.Matrix4();
  for(let tk=0;tk<12;tk++){const a2=tk/12*Math.PI*2;tkM.makeRotationY(-a2);tkM.setPosition(Math.cos(a2)*3.55,0,Math.sin(a2)*3.55);ticks.setMatrixAt(tk,tkM);}ticks.instanceMatrix.needsUpdate=true;gateGroup.add(ticks);
  scene.add(gateGroup);
}
let gateBeam = new THREE.Mesh(
  new THREE.CylinderGeometry(0.7, 2.8, 26, 12, 1, true),
  new THREE.MeshBasicMaterial({ color:0x7fffd4, transparent:true, opacity:0.14, side:THREE.DoubleSide, depthWrite:false, fog:false })  // S3：裂口光柱不受雾影响
);
gateBeam.visible = false;
scene.add(gateBeam);
/* S7：BOSS 接触预警红光环（0.5s 周期闪动；近距效果，不参与雾免疫目标计数） */
let bossRing = new THREE.Mesh(
  new THREE.RingGeometry(2.6, 3.0, 24),
  new THREE.MeshBasicMaterial({ color:0xe0506a, transparent:true, opacity:0.5, side:THREE.DoubleSide })
);
bossRing.rotation.x = -Math.PI/2;
bossRing.visible = false;
scene.add(bossRing);
function positionGate(pos){
  gateGroup.position.set(pos.x, terrainHeight(pos.x, pos.z)+2.4, pos.z);
  gateBeam.position.set(pos.x, terrainHeight(pos.x, pos.z)+13, pos.z);
}

/* ===== 样本（发光晶簇，可重建：每关 sampleSpots） ===== */
const sampleCoreGeo=new THREE.OctahedronGeometry(.46,2),sampleInnerGeo=new THREE.IcosahedronGeometry(.25,1),sampleShardGeo=new THREE.ConeGeometry(.13,.72,6),sampleHaloGeo=new THREE.TorusGeometry(.68,.028,6,32);
const sampleCoreMat=new THREE.MeshStandardMaterial({color:0x7fffd4,emissive:0x2f9c86,emissiveIntensity:1.55,roughness:.18,metalness:.32,fog:false,map:organicDetailTex});
const sampleInnerMat=new THREE.MeshBasicMaterial({color:0xd8fff8,transparent:true,opacity:.62,depthWrite:false,blending:THREE.AdditiveBlending,fog:false});
const sampleShardMat=new THREE.MeshStandardMaterial({color:0x58d7c2,emissive:0x174f48,emissiveIntensity:1.1,roughness:.22,metalness:.38,fog:false});
const sampleHaloMat=new THREE.MeshBasicMaterial({color:0x7fffd4,transparent:true,opacity:.42,depthWrite:false,blending:THREE.AdditiveBlending,fog:false});
keepRes(sampleCoreGeo,sampleInnerGeo,sampleShardGeo,sampleHaloGeo,sampleCoreMat,sampleInnerMat,sampleShardMat,sampleHaloMat);
/* v16：每四关更换一次怪物生态与证据品谱系。无尽模式按波次循环五套视觉族谱。 */
const STAGE_VISUAL_FAMILIES=[
  {id:"ship",name:"大船航务层",monster:"船壳寄生体",pickup:"航务记忆信标",color:0x7fffd4,accent:0xd7fff5},
  {id:"remora",name:"雷莫拉维护层",monster:"雷莫拉清道兽",pickup:"雷莫拉义务甲片",color:0xffb66d,accent:0xffe0a3},
  {id:"alpha",name:"黑色阿尔法层",monster:"阿尔法缄默体",pickup:"黑色阿尔法密钥",color:0xe16cff,accent:0xffb0ff},
  {id:"core",name:"中微子内核层",monster:"中微子畸变体",pickup:"中微子航迹线圈",color:0x67bfff,accent:0xd6f3ff},
  {id:"marrow",name:"髓星接驳层",monster:"髓星裂隙兽",pickup:"髓星核心碎片",color:0xff617f,accent:0xffcf9f},
  /* v25：第二部生态族谱（21-40），与 DESCENT_CHAPTERS[5..9] 对应 */
  {id:"ironfield",name:"熔铁荒原",monster:"熔铁游荡体",pickup:"力场侵蚀样本",color:0xffa14e,accent:0xffe2b8},
  {id:"sporewood",name:"黑色孢林",monster:"孢林低语者",pickup:"黑色孢子样本",color:0x9fffc2,accent:0xd9ffe9},
  {id:"schism",name:"事变大陆",monster:"事变残响体",pickup:"事变弹片残档",color:0xff7fb2,accent:0xffd3e5},
  {id:"bridge",name:"忠诚者大桥",monster:"高桥守誓体",pickup:"高桥缆索样本",color:0x7fd0ff,accent:0xd4efff},
  {id:"cannon",name:"炮弹车发射场",monster:"炮弹车卫戍体",pickup:"电磁炮弹残芯",color:0xc0ff6b,accent:0xeaffc4},
  /* v26：第三至五部生态族谱（41-100），与 DESCENT_CHAPTERS[10..24] 对应 */
  {id:"clockcity",name:"离奇族秘道",monster:"钟摆残影体",pickup:"停摆机芯",color:0xd9c08a,accent:0xf3e3b8},
  {id:"renounce",name:"违望者登船",monster:"圣像扈从体",pickup:"圣像金箔",color:0xff9d5c,accent:0xffd0ad},
  {id:"chair",name:"首领的椅子",monster:"权限巡守体",pickup:"首席印鉴",color:0xff5f9e,accent:0xffb3d1},
  {id:"hydrosea",name:"液氢之海",monster:"低温凝滞体",pickup:"液氢晶簇",color:0x9fd8ff,accent:0xd8efff},
  {id:"eveofwar",name:"夺船前夜",monster:"战备装配体",pickup:"作战地图残片",color:0xff7d4d,accent:0xffc0a3},
  {id:"remorafront",name:"雷莫拉战线",monster:"真空壳卫体",pickup:"战损义务甲片",color:0x6fe8c8,accent:0xb2f5e2},
  {id:"prison",name:"监狱假说",monster:"囚笼谐振体",pickup:"力场测探计",color:0xb48cff,accent:0xdecfff},
  {id:"spine",name:"脊柱之战",monster:"脊柱附着体",pickup:"脊柱断刺",color:0xff5f7d,accent:0xffb3c2},
  {id:"flood",name:"液氢洪水",monster:"洪流漂流体",pickup:"泄洪阀芯",color:0x86e3ff,accent:0xc8f3ff},
  {id:"desolation",name:"荒凉苏醒",monster:"低语容器体",pickup:"黑釉梦屑",color:0x8a7fff,accent:0xc9c2ff},
  {id:"prisoncell",name:"建造者囚室",monster:"代行复制体",pickup:"囚室晶格",color:0xa5ff7a,accent:0xdcffbe},
  {id:"awaken",name:"大船觉醒",monster:"觉醒神经束",pickup:"意识回波瓶",color:0x5fffe0,accent:0xb2fff0},
  {id:"starflee",name:"恒星回避",monster:"耀斑耐受体",pickup:"恒温样本",color:0xffc94e,accent:0xffe7b0},
  {id:"reseal",name:"重封髓星",monster:"封印卫戍体",pickup:"封印楔片",color:0xff8fb2,accent:0xffc9da},
  {id:"virgo",name:"驶向室女座",monster:"深空航伴体",pickup:"星图残页",color:0x9fd0ff,accent:0xd8ebff}
];
function stageVisualFamily(){const wave=G&&G.endless&&G.endless.wave,level=wave||((G&&G.level)||1),index=Math.floor((Math.max(1,level)-1)/4);return STAGE_VISUAL_FAMILIES[wave?index%STAGE_VISUAL_FAMILIES.length:Math.min(index,STAGE_VISUAL_FAMILIES.length-1)];}
function stageVisualVariant(){const wave=G&&G.endless&&G.endless.wave,level=wave||((G&&G.level)||1);return (Math.max(1,level)-1)%4;}
const STAGE_VARIANT_TAGS=["原型","强化","裂变","王冠"];
const pickupPlateGeo=new THREE.BoxGeometry(.65,.12,.48),pickupAntennaGeo=new THREE.CylinderGeometry(.035,.06,.9,6),pickupRingGeo=new THREE.TorusGeometry(.42,.055,6,24),pickupKeyGeo=new THREE.TetrahedronGeometry(.42,0),pickupCoilGeo=new THREE.TorusKnotGeometry(.28,.055,36,6,2,3),pickupRockGeo=new THREE.DodecahedronGeometry(.43,1);
keepRes(pickupPlateGeo,pickupAntennaGeo,pickupRingGeo,pickupKeyGeo,pickupCoilGeo,pickupRockGeo);
let sampleMeshes = [];
function buildSamples(spotsList){
  disposeRoots(sampleMeshes);
  sampleMeshes = [];
  const family=stageVisualFamily(),familyIndex=STAGE_VISUAL_FAMILIES.indexOf(family),variant=stageVisualVariant();
  for(let i=0;i<spotsList.length;i++){
    const s = spotsList[i];
    const isScanPt=G&&G.objective&&G.objective.kind==="scan"&&(G.objective.points||[]).indexOf(s)>=0;   // v24.16 扫描点金色标识（区别于可拾取样本）
    const root=new THREE.Group(),solid=new THREE.MeshStandardMaterial({color:isScanPt?0xd9c08a:family.color,emissive:isScanPt?0x4a3a10:family.color,emissiveIntensity:.42,roughness:.3,metalness:.55,fog:false}),light=new THREE.MeshBasicMaterial({color:isScanPt?0xffd66b:family.accent,transparent:true,opacity:.78,depthWrite:false,fog:false}),haloMat=new THREE.MeshBasicMaterial({color:isScanPt?0xd9c08a:family.color,transparent:true,opacity:.48,depthWrite:false,blending:THREE.AdditiveBlending,fog:false});
    let core,inner;
    /* v23.2 五族拾取物造型差异化（core/inner 动画契约不变） */
    if(familyIndex===0){          /* 信标浮标：球形浮体 + 鞭状天线 + 信标帽 + 浮环 */
      core=new THREE.Mesh(new THREE.SphereGeometry(.3,10,7),solid);core.position.y=.1;core.scale.set(1,.82,1);
      inner=new THREE.Mesh(pickupAntennaGeo,light);inner.position.y=.52;inner.rotation.z=.12;
      const cap=new THREE.Mesh(sampleInnerGeo,light);cap.position.y=.92;cap.scale.setScalar(.9);
      const floatRing=new THREE.Mesh(pickupRingGeo,light);floatRing.rotation.x=Math.PI/2;floatRing.position.y=.02;floatRing.scale.setScalar(.8);
      root.add(core,inner,cap,floatRing);
    } else if(familyIndex===1){   /* 晶簇基座：中央晶柱 + 三片围岩 + 基环 */
      core=new THREE.Mesh(sampleShardGeo,solid);core.scale.set(.6,1.35,.6);core.position.y=.15;
      inner=new THREE.Mesh(pickupRingGeo,light);inner.rotation.x=Math.PI/2;inner.position.y=.2;
      for(let c=0;c<3;c++){const plate=new THREE.Mesh(pickupPlateGeo,solid);plate.scale.set(.55,.7,.3);plate.position.set((c-1)*.36,-.34,(c%2-.5)*.25);plate.rotation.z=(c-1)*.3;root.add(plate);}
      root.add(core,inner);
    } else if(familyIndex===2){   /* 封印钥石：钥石 + 双斜环 + 顶棘 */
      core=new THREE.Mesh(pickupKeyGeo,solid);core.scale.set(.72,1.5,.72);core.position.y=.1;
      inner=new THREE.Mesh(pickupRingGeo,light);inner.rotation.set(Math.PI/2,.3,.2);
      const ring3=new THREE.Mesh(pickupRingGeo,light);ring3.rotation.set(Math.PI/2,-.35,-.2);ring3.scale.setScalar(.85);
      const spike=new THREE.Mesh(sampleShardGeo,light);spike.position.y=.72;
      root.add(core,inner,ring3,spike);
    } else if(familyIndex===3){   /* 线圈反应堆：扭结环芯 + 芯球 + 外环 + 游珠两枚 */
      core=new THREE.Mesh(pickupCoilGeo,solid);core.position.y=.12;
      inner=new THREE.Mesh(new THREE.SphereGeometry(.15,8,6),light);inner.position.y=.42;
      const ring2=new THREE.Mesh(pickupRingGeo,light);ring2.rotation.x=Math.PI/2;ring2.scale.set(1.25,1.25,1.25);
      const n1=new THREE.Mesh(VARIANT_GEO.node,light);n1.position.set(.5,.28,0);
      const n2=new THREE.Mesh(VARIANT_GEO.node,light);n2.position.set(-.42,.05,.3);
      root.add(core,inner,ring2,n1,n2);
    } else {                      /* 骨化岩：岩心 + 五向骨棘 + 芯光 */
      core=new THREE.Mesh(pickupRockGeo,solid);core.scale.set(.9,1.25,.9);core.position.y=.05;
      inner=new THREE.Mesh(sampleInnerGeo,light);inner.position.y=.3;
      for(let c=0;c<5;c++){const shard=new THREE.Mesh(sampleShardGeo,solid),a=c/5*Math.PI*2;shard.position.set(Math.cos(a)*.42,-.22,Math.sin(a)*.42);shard.rotation.z=(c-2)*.22;root.add(shard);}
      root.add(core,inner);
    }
    for(let c=0;c<variant;c++){const satellite=new THREE.Mesh(c%2?VARIANT_GEO.node:sampleShardGeo,c%2?light:solid),a=c/Math.max(1,variant)*Math.PI*2+i*.4;satellite.position.set(Math.cos(a)*(.58+c*.08),-.04+c*.2,Math.sin(a)*(.58+c*.08));satellite.scale.setScalar(.58+c*.12);root.add(satellite);}
    const halo=new THREE.Mesh(sampleHaloGeo,haloMat);halo.rotation.x=Math.PI/2;halo.position.y=-.34;halo.scale.setScalar(1+variant*.1);root.add(halo);
    const glow=new THREE.Sprite(glowMaterial(family.color));glow.scale.set(2.15,2.15,1);glow.position.y=.04;root.add(glow);
    root.userData={halo,core,inner,glow,coreBaseScale:core.scale.clone(),phase:i*.83,pickupKind:family.id+"-"+(variant+1),pickupName:family.pickup+"·"+STAGE_VARIANT_TAGS[variant],color:family.color,visualVariant:variant,groundY:terrainHeight(s.x,s.z)};   // v23：缓存静态地形高度
    root.position.set(s.x,terrainHeight(s.x,s.z)+1.2,s.z);scene.add(root);sampleMeshes.push(root);
  }
}

/* ===== 怪物网格（CSD-SOUL1-MODEL：高模构造 + 部位动画引用；userData.eye 供预警红眼用） ===== */
/* v9：灰手/领主的所有骨骼几何跨个体共享；七只怪仍可独立换材质和做手指动画。 */
const HAND_GEO={
  palm:new THREE.SphereGeometry(.58,16,11),ridge:new THREE.SphereGeometry(.42,12,8),wrist:new THREE.CylinderGeometry(.38,.52,.72,10),cuff:new THREE.TorusGeometry(.43,.09,6,14),plate:new THREE.OctahedronGeometry(.34,0),armor:new THREE.OctahedronGeometry(.12,0),vein:new THREE.CylinderGeometry(.012,.018,.6,4),
  digit:new THREE.LatheGeometry([new THREE.Vector2(.105,.02),new THREE.Vector2(.11,.24),new THREE.Vector2(.092,.32),new THREE.Vector2(.084,.43),new THREE.Vector2(.064,.56),new THREE.Vector2(.058,.64),new THREE.Vector2(.036,.79),new THREE.Vector2(.025,.82)],9),claw:new THREE.ConeGeometry(.045,.24,6),
  eye:new THREE.SphereGeometry(.15,10,7),eyeSmall:new THREE.SphereGeometry(.07,7,5),iris:new THREE.TorusGeometry(.205,.035,6,18),crystal:new THREE.OctahedronGeometry(1,0),core:new THREE.SphereGeometry(.2,8,6)
};
keepRes(...Object.values(HAND_GEO));
/* 指节组（三节 + 关节球 + 爪；沿 +Y 生长） */
function buildFingerGroup(mat, boneMat, clawMat){
  const fg = new THREE.Group();
  const digit=new THREE.Mesh(HAND_GEO.digit,mat),claw=new THREE.Mesh(HAND_GEO.claw,clawMat);claw.position.y=.91;
  fg.add(digit,claw);
  return fg;
}
function buildHandGroup(scale, opts){
  opts = opts || {};
  const base = opts.color || 0x9fb4b0;
  const mat = new THREE.MeshStandardMaterial({ color:base, emissive:0x071010, roughness:0.56, metalness:0.12, fog:false });
  const boneMat = new THREE.MeshStandardMaterial({ color:0x617872, emissive:0x060b0a, roughness:0.74, metalness:0.08, fog:false });
  const clawMat = new THREE.MeshStandardMaterial({ color:0xdff4ed, emissive:0x17231f, roughness:0.28, metalness:0.38, fog:false });
  const membraneHandMat=new THREE.MeshStandardMaterial({color:0x87a49d,emissive:0x0a1412,roughness:.6,metalness:.06,transparent:true,opacity:.5,side:THREE.DoubleSide,depthWrite:false});
  const g = new THREE.Group();
  /* 掌（拍扁球 + 指根脊） */
  const palm = new THREE.Mesh(HAND_GEO.palm,mat);
  palm.scale.set(1.0, 0.62, 1.18);
  g.add(palm);
  const ridge = new THREE.Mesh(HAND_GEO.ridge,mat);
  ridge.scale.set(0.9, 0.5, 0.5);
  ridge.position.set(0, 0.26, 0.06);
  g.add(ridge);
  /* 腕骨、甲片与掌心纹路强化剪影 */
  const wrist=new THREE.Mesh(HAND_GEO.wrist,boneMat);wrist.position.set(0,-.55,-.16);g.add(wrist);
  const cuff=new THREE.Mesh(HAND_GEO.cuff,clawMat);cuff.rotation.x=Math.PI/2;cuff.position.set(0,-.82,-.16);g.add(cuff);
  const plate=new THREE.Mesh(HAND_GEO.plate,boneMat);plate.scale.set(1.1,.42,.75);plate.position.set(0,.13,-.48);g.add(plate);
  const armor=new THREE.InstancedMesh(HAND_GEO.armor,boneMat,6),am=new THREE.Matrix4(),ap=new THREE.Vector3(),aq=new THREE.Quaternion(),ae=new THREE.Euler(),as=new THREE.Vector3();
  for(let a=0;a<6;a++){const row=a<3?0:1,col=a%3;ap.set((col-1)*.28,.34-row*.24,-.48+row*.05);ae.set(.2+row*.18,(col-1)*.24,(col-1)*-.16);aq.setFromEuler(ae);as.set(1.15-row*.16,.55,.75);am.compose(ap,aq,as);armor.setMatrixAt(a,am);}armor.instanceMatrix.needsUpdate=true;g.add(armor);
  const veinMat=new THREE.MeshBasicMaterial({color:opts.eyeColor||0xe0506a,transparent:true,opacity:.42,fog:false});
  const veins=[];
  for(let v=0;v<3;v++){
    const vein=new THREE.Mesh(HAND_GEO.vein,veinMat);
    vein.position.set((v-1)*.18,.1,.57);vein.rotation.z=(v-1)*.48;g.add(vein);veins.push(vein);
  }
  /* 五根三节指 + 爪（扇形展开） */
  const fingers = [];
  for(let f=0; f<5; f++){
    const fg = buildFingerGroup(mat, boneMat, clawMat);
    const a = -Math.PI/2 + (f-2)*0.42;
    const bx = Math.cos(a)*0.46, bz = Math.sin(a)*0.46;
    const bzr = -Math.cos(a)*0.32, bxr = Math.sin(a)*0.32;
    fg.position.set(bx, 0.2, bz);
    fg.rotation.z = bzr; fg.rotation.x = bxr;
    fg.userData = { baseZ:bzr, baseX:bxr };
    g.add(fg);
    fingers.push(fg);
  }
  /* 三只发光眼（主眼 + 双副眼） */
  const eyeMat = new THREE.MeshBasicMaterial({ color: opts.eyeColor || 0xe0506a, fog:false });
  const eye = new THREE.Mesh(HAND_GEO.eye,eyeMat);
  eye.position.set(0, 0.26, 0.44);
  g.add(eye);
  const irisRing=new THREE.Mesh(HAND_GEO.iris,clawMat);irisRing.position.set(0,.26,.43);g.add(irisRing);
  const eye2 = new THREE.Mesh(HAND_GEO.eyeSmall,eyeMat);
  eye2.position.set(-0.2, 0.18, 0.34);
  const eye3 = eye2.clone(); eye3.position.x = 0.2;
  g.add(eye2, eye3);
  /* v23.2 建模补强：指根关节珠 + 对生拇指 + 前臂骨节 + 指蹼 + 背侧骨刺 */
  const knuckleGeo=new THREE.SphereGeometry(.085,7,5),knuckles=new THREE.InstancedMesh(knuckleGeo,boneMat,5),km2=new THREE.Matrix4();
  for(let f=0;f<5;f++){const a2=-Math.PI/2+(f-2)*0.42;km2.makeTranslation(Math.cos(a2)*.5,.28,Math.sin(a2)*.5);knuckles.setMatrixAt(f,km2);}knuckles.instanceMatrix.needsUpdate=true;g.add(knuckles);
  const thumb=buildFingerGroup(mat,boneMat,clawMat);
  thumb.position.set(-.52,.08,.1);thumb.rotation.z=1.25;thumb.rotation.x=-.3;thumb.scale.setScalar(.72);
  thumb.userData={baseZ:-.3,baseX:1.25};g.add(thumb);fingers.push(thumb);
  const forearm=new THREE.Mesh(new THREE.CylinderGeometry(.3,.38,.5,9),boneMat);forearm.position.set(0,-1.02,-.16);g.add(forearm);
  const elbow=new THREE.Mesh(new THREE.SphereGeometry(.2,8,6),boneMat);elbow.position.set(0,-1.3,-.16);g.add(elbow);
  const webGeo=new THREE.CircleGeometry(.22,8,0,Math.PI*.62);
  for(const fw of [-1,0,1]){
    const web=new THREE.Mesh(webGeo,membraneHandMat);
    const a3=-Math.PI/2+(fw-1)*0.42;
    web.position.set(Math.cos(a3)*.34,.14,Math.sin(a3)*.34);
    web.rotation.set(-.9,0,(fw-1)*.36);web.scale.set(1.5,1.15,1);g.add(web);
  }
  for(const sp2 of [-1,1]){
    const spur=new THREE.Mesh(new THREE.ConeGeometry(.07,.3,5),boneMat);
    spur.position.set(sp2*.3,.42,-.42);spur.rotation.z=sp2*-.9;g.add(spur);
  }
  g.userData = { eye, eyeMat, bodyMat:mat, fingers, palm, veins, irisRing, wrist, armor };
  g.scale.setScalar(scale);
  return g;
}
/* 精英：晶化灰手（体型 1.4× + 蓝晶簇 + 红光核心，复用灰手结构） */
function addCrystals(g){
  const cryMat = new THREE.MeshStandardMaterial({ color:0x3aa6ff, emissive:0x1a4a7a, roughness:0.3, metalness:0.5 });
  const crystals = [];
  for(let i=0;i<7;i++){
    const c = new THREE.Mesh(HAND_GEO.crystal,cryMat);c.scale.setScalar(.16+Math.random()*.14);
    const a = Math.random()*Math.PI*2, r = 0.62;
    c.position.set(Math.cos(a)*r, 0.25+Math.random()*0.7, Math.sin(a)*r);
    c.rotation.set(Math.random()*3, Math.random()*3, Math.random()*3);
    g.add(c);
    crystals.push(c);
  }
  const core = new THREE.Mesh(HAND_GEO.core,new THREE.MeshBasicMaterial({color:0xff2244}));
  core.position.set(0, 0.26, 0.4);
  g.add(core);
  g.userData.elite = true;
  g.userData.crystals = crystals;
  g.userData.core = core;
}
/* 刃鳍：Lathe 连续船体重建（v23.2）——鼻锥到尾柄一体化无接缝，叉形尾鳍/胸鳍/背鳍膜 + 侧线光点 */
function buildDartMesh(){
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color:0x6f9cab, emissive:0x07141a, roughness:0.42, metalness:0.42 });
  const bellyMat = new THREE.MeshStandardMaterial({ color:0x1d3945, roughness:0.72, metalness:0.18 });
  const membraneMat = new THREE.MeshStandardMaterial({ color:0x2c5563, emissive:0x0a1c22, roughness:.5, metalness:.2, transparent:true, opacity:.82, side:THREE.DoubleSide });
  /* 船体：旋转曲面（剖面从鼻尖到尾柄），绕 X 轴 +90° 使 +Y 指向 +Z（游动方向） */
  const hullPts=[.001,.13,.29,.41,.46,.455,.40,.315,.195,.115,.062].map((r,i)=>new THREE.Vector2(r,i*.185));
  const hull=new THREE.Mesh(new THREE.LatheGeometry(hullPts,14),bodyMat);
  hull.rotation.x=Math.PI/2; hull.position.z=-.95; hull.scale.set(1,.8,1);
  /* 腹甲（浅色龙骨） */
  const keel=new THREE.Mesh(new THREE.SphereGeometry(.42,10,7),bellyMat);
  keel.rotation.x=Math.PI/2;keel.scale.set(.72,.52,1.9);keel.position.set(0,-.2,.05);
  /* 上下颌 + 齿列 */
  const jaw=new THREE.Mesh(new THREE.ConeGeometry(.21,.5,6),bellyMat);jaw.rotation.x=Math.PI/2+.12;jaw.position.set(0,-.13,1.06);
  const teethMat=new THREE.MeshBasicMaterial({color:0xdff4ed,fog:false});
  const toothGeo=new THREE.ConeGeometry(.03,.11,4),teeth=new THREE.InstancedMesh(toothGeo,teethMat,6),tm2=new THREE.Matrix4();
  for(let t2=0;t2<6;t2++){const s2=t2<3?-1:1,j2=t2%3;tm2.makeTranslation(s2*.09,-.06+j2*.02,1.08+j2*.13);teeth.setMatrixAt(t2,tm2);}teeth.instanceMatrix.needsUpdate=true;
  /* 背鳍（膜质，微后掠）+ 尾柄与叉形尾鳍（尾组整体绕根部摆动） */
  const fin = new THREE.Mesh(new THREE.ConeGeometry(0.2, 1.05, 3), membraneMat);
  fin.position.set(0, 0.62, -0.22); fin.rotation.z = Math.PI; fin.scale.set(1, 1, 0.2);
  const tailGrp = new THREE.Group(); tailGrp.position.set(0,.02,-1.02);
  const peduncle=new THREE.Mesh(new THREE.CylinderGeometry(.09,.13,.34,7),bodyMat);peduncle.rotation.x=Math.PI/2;tailGrp.add(peduncle);
  const lobeGeo=new THREE.ConeGeometry(.2,.72,3);
  const lobeU=new THREE.Mesh(lobeGeo,membraneMat);lobeU.position.set(0,.26,-.3);lobeU.rotation.set(2.62,0,Math.PI*.94);lobeU.scale.set(1,1,.16);
  const lobeD=new THREE.Mesh(lobeGeo,membraneMat);lobeD.position.set(0,-.24,-.3);lobeD.rotation.set(-2.62,0,-Math.PI*.94);lobeD.scale.set(1,1,.16);
  tailGrp.add(lobeU,lobeD);
  /* 胸鳍一对（后掠三角膜） */
  const finL = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.72, 3), membraneMat);
  finL.position.set(-0.4, -0.05, 0.18); finL.rotation.z = Math.PI/2+.35; finL.rotation.y=-.5; finL.scale.set(1,1,.22);
  const finR = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.72, 3), membraneMat);
  finR.position.set(0.4, -0.05, 0.18); finR.rotation.z = -Math.PI/2-.35; finR.rotation.y=.5; finR.scale.set(1,1,.22);
  /* 眼（主对 + 上副眼） */
  const eyeMat = new THREE.MeshBasicMaterial({ color:0xff5544 });
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.12, 7, 5), eyeMat);
  eye.position.set(0, 0.24, 0.62);
  const eye2 = eye.clone(); eye2.position.set(0, 0.3, 0.3); eye2.scale.setScalar(0.55);
  /* 侧线发光点（左右各 3） */
  const stripeMat=new THREE.MeshBasicMaterial({color:0x7fffd4,transparent:true,opacity:.7,depthWrite:false,blending:THREE.AdditiveBlending,fog:false}),stripeGeo=new THREE.SphereGeometry(.05,6,4),stripes=new THREE.InstancedMesh(stripeGeo,stripeMat,6),sm=new THREE.Matrix4();
  for(let s=0;s<6;s++){sm.makeTranslation((s%2?-.4:.4),.02,.5-Math.floor(s/2)*.5);stripes.setMatrixAt(s,sm);}stripes.instanceMatrix.needsUpdate=true;
  g.add(hull, keel, jaw, teeth, fin, tailGrp, finL, finR, eye, eye2, stripes);
  g.userData = { type:"dart", bodyMat, eyeMat, tail:tailGrp, fin, finL, finR,
                 stripes, finBaseZ:Math.PI, tailBaseX:0, finLBaseZ:Math.PI/2+.35, finRBaseZ:-Math.PI/2-.35 };
  return g;
}
/* 墨鲛：Lathe 潜艇形船体 + 鼓腮 + 触手尖端珠光（v23.2 重建） */
function buildSpitterMesh(){
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color:0x425d52, emissive:0x06120f, roughness:0.72, metalness:0.18 });
  const shellMat = new THREE.MeshStandardMaterial({ color:0x263d38, roughness:.9, metalness:.1 });
  /* 潜艇形船体：前钝后收的旋转曲面（+Z 朝前） */
  const hullPts=[.30,.44,.52,.55,.545,.515,.46,.38,.27,.14,.05].map((r,i)=>new THREE.Vector2(r,i*.22));
  const body=new THREE.Mesh(new THREE.LatheGeometry(hullPts,14),bodyMat);
  body.rotation.x=Math.PI/2;body.position.z=-1.05;body.scale.set(1,.9,1);
  const glowMat = new THREE.MeshBasicMaterial({ color:0x9fe8ff });
  const sac = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 6), glowMat);
  sac.position.set(0, 0.28, 0.7); sac.scale.set(0.9, 0.9, 0.7);
  /* 眶上脊（双条）与背棘 */
  const brow=new THREE.Mesh(new THREE.TorusGeometry(.2,.05,5,10,Math.PI*.9),shellMat);brow.position.set(0,.42,.5);brow.rotation.set(.35,0,Math.PI*.05);g.add(brow);
  const spineGeo=new THREE.ConeGeometry(.06,.34,5),spines=new THREE.InstancedMesh(spineGeo,shellMat,5),spm=new THREE.Matrix4();
  for(let sp=0;sp<5;sp++){spm.makeRotationX(Math.PI/2.3);spm.setPosition(0,.42,-.15-sp*.3);spines.setMatrixAt(sp,spm);}spines.instanceMatrix.needsUpdate=true;
  const gill1 = new THREE.Mesh(new THREE.SphereGeometry(0.26, 7, 5), bodyMat);
  gill1.position.set(0.42, -0.12, 0.22); gill1.scale.set(0.8, 0.9, 0.8);
  const gill2 = gill1.clone(); gill2.position.x = -0.42;
  const membraneMat=new THREE.MeshStandardMaterial({color:0x6ca58c,emissive:0x0b2b24,transparent:true,opacity:.54,depthWrite:false,side:THREE.DoubleSide,roughness:.38});
  const membraneL=new THREE.Mesh(new THREE.CircleGeometry(.34,12),membraneMat);membraneL.position.set(.5,-.1,.18);membraneL.rotation.y=Math.PI/2;membraneL.scale.y=1.35;
  const membraneR=membraneL.clone();membraneR.position.x=-.5;membraneR.rotation.y=-Math.PI/2;
  const eyeMat = new THREE.MeshBasicMaterial({ color:0x9fe8ff });
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.15, 7, 5), eyeMat);
  eye.position.set(0, 0.34, 0.86);
  const mouth=new THREE.Mesh(new THREE.TorusGeometry(.22,.055,6,16),shellMat);mouth.position.set(0,-.05,.86);g.add(mouth);
  const ridges=[];
  for(let r=0;r<3;r++){
    const ridge=new THREE.Mesh(new THREE.TorusGeometry(.49-r*.045,.035,5,16),shellMat);
    ridge.position.z=-.28+r*.28;ridge.scale.y=.82;g.add(ridge);ridges.push(ridge);
  }
  /* 触手：渐细管体 + 尖端珠光（珠为触手子件，随摆动一致） */
  const tentacles = [];
  const beadGeo=new THREE.SphereGeometry(.055,6,4);
  for(let i=0;i<7;i++){
    const a = i/7*Math.PI*2;
    const curve=new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(Math.cos(a)*.38,-.26,Math.sin(a)*.38),
      new THREE.Vector3(Math.cos(a)*.66,-.58,Math.sin(a)*.66),
      new THREE.Vector3(Math.cos(a)*.72,-1.05,Math.sin(a)*.72));
    const t = new THREE.Mesh(new THREE.TubeGeometry(curve,8,.045,5,false),bodyMat);
    const bead=new THREE.Mesh(beadGeo,glowMat);bead.position.copy(curve.getPoint(1));t.add(bead);
    t.userData = { baseX:0, baseZ:0, seed:i*1.73 };
    g.add(t);
    tentacles.push(t);
  }
  g.add(body, sac, gill1, gill2, membraneL, membraneR, eye, brow, spines);
  g.userData = { type:"spitter", bodyMat, eyeMat, sac, tentacles, mouth, ridges, membranes:[membraneL,membraneR] };
  return g;
}
const VARIANT_GEO={plate:new THREE.BoxGeometry(.46,.12,.6),fin:new THREE.ConeGeometry(.3,.9,4),crystal:new THREE.OctahedronGeometry(.3,0),coil:new THREE.TorusGeometry(.48,.06,6,18),tendril:new THREE.ConeGeometry(.08,.85,6),node:new THREE.SphereGeometry(.1,7,5)};
keepRes(...Object.values(VARIANT_GEO));
function decorateMonsterFamily(g,family,type,variant){
  variant=variant||0;const fi=Math.max(0,STAGE_VISUAL_FAMILIES.indexOf(family)),mat=new THREE.MeshStandardMaterial({color:family.color,emissive:family.color,emissiveIntensity:.3+variant*.1,roughness:.42,metalness:fi===1?.18:.55,fog:false}),glow=new THREE.MeshBasicMaterial({color:family.accent,fog:false}),parts=[];
  if(fi===0){for(const side of [-1,1]){const plate=new THREE.Mesh(VARIANT_GEO.plate,mat);plate.position.set(side*.52,.34,-.08);plate.rotation.z=side*.32;g.add(plate);parts.push(plate);}const node=new THREE.Mesh(VARIANT_GEO.node,glow);node.position.set(0,.7,0);g.add(node);parts.push(node);}
  else if(fi===1){for(const side of [-1,1]){const fin=new THREE.Mesh(VARIANT_GEO.fin,mat);fin.position.set(side*.64,.08,-.15);fin.rotation.z=side*-Math.PI/2;g.add(fin);parts.push(fin);}for(let j=0;j<3;j++){const barb=new THREE.Mesh(VARIANT_GEO.fin,mat);barb.scale.set(.42,.55,.42);barb.position.set(0,.5,-.34+j*.32);g.add(barb);parts.push(barb);}}
  else if(fi===2){for(let j=0;j<5;j++){const crystal=new THREE.Mesh(VARIANT_GEO.crystal,mat),a=j/5*Math.PI*2;crystal.scale.set(.55,1.15,.55);crystal.position.set(Math.cos(a)*.52,.28+Math.sin(j)*.15,Math.sin(a)*.52);crystal.rotation.z=(j-2)*.22;g.add(crystal);parts.push(crystal);}}
  else if(fi===3){for(let j=0;j<2;j++){const coil=new THREE.Mesh(VARIANT_GEO.coil,mat);coil.rotation.set(Math.PI/2,j*Math.PI/2,0);coil.scale.setScalar(1+j*.2);g.add(coil);parts.push(coil);}for(const x of [-.36,.36]){const node=new THREE.Mesh(VARIANT_GEO.node,glow);node.position.set(x,.54,.26);g.add(node);parts.push(node);}}
  else{for(let j=0;j<6;j++){const t=new THREE.Mesh(VARIANT_GEO.tendril,mat),a=j/6*Math.PI*2;t.position.set(Math.cos(a)*.48,-.38,Math.sin(a)*.48);t.rotation.z=Math.cos(a)*.72;t.rotation.x=Math.sin(a)*.72;g.add(t);parts.push(t);}const node=new THREE.Mesh(VARIANT_GEO.node,glow);node.scale.setScalar(1.55);node.position.set(0,.54,.34);g.add(node);parts.push(node);}
  if(variant===3){const crown=new THREE.Mesh(VARIANT_GEO.coil,glow);crown.scale.set(.72,.72,.72);crown.rotation.x=Math.PI/2;crown.position.y=.82;g.add(crown);parts.push(crown);}parts.forEach((p,pi)=>{p.scale.multiplyScalar(1+variant*.08);if(variant===2)p.rotation.y+=(pi%2?-.22:.22);});
  g.userData=g.userData||{};g.userData.visualFamily=family.id;g.userData.visualVariant=family.id+"-"+(variant+1);g.userData.familyName=family.monster+"·"+STAGE_VARIANT_TAGS[variant];g.userData.variantParts=parts;g.userData.variantMaterial=mat;g.userData.variantGlow=glow;return g;
}
/* v34 F3 水下氛围：悬浮微粒 Points + 体积光柱 + 呼吸气泡（lowQ 减量） */
let ambientPack=null,bubbleT=0;
function tickSky(dt){
  if(!G||G.state!==S.PLAYING)return;
  const count=lowQ?50:150;
  if(!ambientPack){
    const geo=new THREE.BufferGeometry(),pos=new Float32Array(count*3);
    for(let i=0;i<count;i++){pos[i*3]=(Math.random()-.5)*56;pos[i*3+1]=Math.random()*16+1;pos[i*3+2]=(Math.random()-.5)*56;}
    geo.setAttribute("position",new THREE.BufferAttribute(pos,3));
    const mat=new THREE.PointsMaterial({color:0xbfe8e0,size:.09,transparent:true,opacity:.5,depthWrite:false,blending:THREE.AdditiveBlending,fog:false});
    const pts=new THREE.Points(geo,mat);pts.frustumCulled=false;scene.add(pts);
    const rays=new THREE.Group();
    const rMat=new THREE.MeshBasicMaterial({color:0x9fe8e0,transparent:true,opacity:.045,depthWrite:false,blending:THREE.AdditiveBlending,fog:false,side:THREE.DoubleSide});
    for(let i=0;i<(lowQ?3:6);i++){
      const ray=new THREE.Mesh(new THREE.PlaneGeometry(2.2,16),rMat);
      const a=i/(lowQ?3:6)*Math.PI*2;
      ray.position.set(Math.cos(a)*22,8,Math.sin(a)*22);
      ray.rotation.y=a+Math.PI/2;ray.rotation.z=.12*Math.sin(i*3);
      rays.add(ray);
    }
    scene.add(rays);
    ambientPack={pts:pts,pos:pos,rays:rays};
  }
  const ap=ambientPack,pos=ap.pos,attr=ap.pts.geometry.attributes.position;
  for(let i=0;i<count;i++){
    pos[i*3+1]+=dt*.25;pos[i*3]+=Math.sin(G.time*.6+i)*dt*.12;
    if(pos[i*3+1]>17)pos[i*3+1]=1;
    const wx=pos[i*3]+player.x,wz=pos[i*3+2]+player.z;
    if(wx-player.x>28)pos[i*3]-=56;else if(wx-player.x<-28)pos[i*3]+=56;
    if(wz-player.z>28)pos[i*3+2]-=56;else if(wz-player.z<-28)pos[i*3+2]+=56;
  }
  attr.needsUpdate=true;
  ap.pts.position.set(player.x,0,player.z);
  ap.rays.position.set(player.x,0,player.z);
  ap.rays.rotation.y+=dt*.02;
  bubbleT-=dt;
  if(bubbleT<=0){bubbleT=1.2;burstParticle(player.x,player.y+.6,player.z,0xbfe8e0,2);}
}
/* v34 M4 环境鱼群：2 群 × 10 尾 InstancedMesh 沿椭圆绕玩家巡游（lowQ 关闭） */
let fishSchools=null;
function tickFish(dt){
  if(!G||G.state!==S.PLAYING||lowQ)return;
  if(!fishSchools){
    fishSchools=[];
    const geo=new THREE.ConeGeometry(.06,.3,4),mat=new THREE.MeshBasicMaterial({color:0x8fd8c8,transparent:true,opacity:.6,fog:false});
    for(let s2=0;s2<2;s2++){
      const mesh=new THREE.InstancedMesh(geo,mat,10);mesh.frustumCulled=false;scene.add(mesh);
      fishSchools.push({mesh:mesh,phase:s2*Math.PI,rx:14+s2*7,rz:10+s2*5,spd:.25+s2*.12,y:2.5+s2*1.6});
    }
  }
  const dm=new THREE.Matrix4(),qq=new THREE.Quaternion(),eu=new THREE.Euler(),sv=new THREE.Vector3(1,1,1),pv=new THREE.Vector3();
  for(const sch of fishSchools){
    const t2=(G.time||0)*sch.spd+sch.phase;
    for(let i=0;i<10;i++){
      const a=t2+i/10*Math.PI*2;
      const x=player.x+Math.cos(a)*sch.rx,z=player.z+Math.sin(a)*sch.rz;
      const y=Math.max(terrainHeight(x,z)+1.2,sch.y+Math.sin(t2*2+i)*.8);
      pv.set(x,y,z);eu.set(0,-a+Math.PI/2,0);qq.setFromEuler(eu);
      dm.compose(pv,qq,sv);sch.mesh.setMatrixAt(i,dm);
    }
    sch.mesh.instanceMatrix.needsUpdate=true;
  }
}
/* v34 M1：族谱生物纹理——Canvas 程序化灰阶斑纹（map 与材质色相乘，保留族色） */
const FAMILY_TEX={};
function familyTex(fam){
  const key=(fam&&fam.id)||"x";
  if(FAMILY_TEX[key])return FAMILY_TEX[key];
  const cv=document.createElement("canvas");cv.width=128;cv.height=128;const c=cv.getContext("2d");
  c.fillStyle="#bcbcbc";c.fillRect(0,0,128,128);
  for(let i=0;i<46;i++){c.fillStyle="rgba(58,58,58,"+(0.08+Math.random()*.16)+")";c.beginPath();c.arc(Math.random()*128,Math.random()*128,4+Math.random()*14,0,7);c.fill();}
  for(let i=0;i<26;i++){c.strokeStyle="rgba(40,40,40,"+(0.1+Math.random()*.14)+")";c.lineWidth=1+Math.random()*1.5;c.beginPath();const sx=Math.random()*128,sy=Math.random()*128;c.moveTo(sx,sy);c.quadraticCurveTo(sx+(Math.random()-.5)*40,sy+(Math.random()-.5)*40,sx+(Math.random()-.5)*50,sy+(Math.random()-.5)*50);c.stroke();}
  for(let i=0;i<10;i++){c.fillStyle="rgba(255,255,255,"+(0.25+Math.random()*.3)+")";c.beginPath();c.arc(Math.random()*128,Math.random()*128,2+Math.random()*3.5,0,7);c.fill();}
  const t=new THREE.CanvasTexture(cv);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(2,2);
  FAMILY_TEX[key]=t;return t;
}
function applyFamilyTex(g,fam){
  const tex=familyTex(fam);
  g.traverse(ch=>{if(ch.isMesh&&ch.material&&ch.material.isMeshStandardMaterial&&!ch.material.map){ch.material.map=tex;ch.material.needsUpdate=true;}});
}
function buildMonsterMesh(type,family){
  let g;
  if(type === "dart" || type === "swarm") g=buildDartMesh();
  else if(type === "spitter" || type === "acid" || type === "sniper") g=buildSpitterMesh();
  else if(type === "elite" || type === "shield"){ g=buildHandGroup(type==="shield"?1.55:1.4);g.userData=g.userData||{};addCrystals(g); }
  else g=buildHandGroup(1);
  g.userData=g.userData||{};g.userData.archetype=type;
  if(type==="swarm")g.scale.setScalar(.48);
  if(type==="acid"){
    const acid=new THREE.Mesh(new THREE.SphereGeometry(.75,10,7),new THREE.MeshBasicMaterial({color:0x83ff66,transparent:true,opacity:.22,depthWrite:false,blending:THREE.AdditiveBlending}));acid.position.y=.25;g.add(acid);g.userData.acidAura=acid;
  } else if(type==="sniper"){
    const lens=new THREE.Mesh(new THREE.CylinderGeometry(.16,.28,.7,8),new THREE.MeshBasicMaterial({color:0xff426e,fog:false}));lens.rotation.x=Math.PI/2;lens.position.set(0,.65,1.05);g.add(lens);g.userData.sniperLens=lens;
  } else if(type==="shield"){
    const shield=new THREE.Mesh(new THREE.CircleGeometry(1.05,12),new THREE.MeshBasicMaterial({color:0x69d8ff,transparent:true,opacity:.24,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending}));shield.position.set(0,.7,1.0);g.add(shield);g.userData.frontShield=shield;
  }
  applyFamilyTex(g,family||stageVisualFamily());   // v34 M1 生物纹理
  decorateMonsterFamily(g,family||stageVisualFamily(),type,stageVisualVariant());
  return stylizeCreature(g,type,false);
}
/* v34 F1 元素附着光环资源 */
const auraRingGeo=new THREE.TorusGeometry(1.05,.05,6,24);
const auraRingMat=new THREE.MeshBasicMaterial({color:0x5fe0ff,transparent:true,opacity:.5,depthWrite:false,blending:THREE.AdditiveBlending,fog:false});
keepRes(auraRingGeo,auraRingMat);
const wardAuraGeo=new THREE.SphereGeometry(1.35,12,8);
const wardAuraMat=new THREE.MeshBasicMaterial({color:0x62d9ff,transparent:true,opacity:.12,side:THREE.BackSide,depthWrite:false,blending:THREE.AdditiveBlending,fog:false});
keepRes(wardAuraGeo,wardAuraMat);
/* v24.8：为单只怪物补建渲染网格（召唤/中途加怪用；与 buildMonsters 同一套预收集流程） */
function spawnMonsterMeshAt(cfg){
  const mesh=buildMonsterMesh(cfg.type,stageVisualFamily());
  mesh.userData.baseScale=cfg.type==="elite"?1.4:(cfg.type==="shield"?1.55:(cfg.type==="swarm"?.48:1));
  const aura=new THREE.Mesh(wardAuraGeo,wardAuraMat);aura.visible=false;mesh.add(aura);mesh.userData.wardAura=aura;
  mesh.traverse(ch=>{if(ch.isMesh)ch.receiveShadow=true;});
  const fadeMats=[],fadeOps=[],rimMats=[];
  mesh.traverse(ch=>{
    const list=Array.isArray(ch.material)?ch.material:(ch.material?[ch.material]:[]);
    for(const mt of list){
      if(!mt||fadeMats.indexOf(mt)>=0)continue;
      if(!persistentRes.has(mt)){fadeMats.push(mt);fadeOps.push({op:mt.opacity,tr:mt.transparent});}
      if(mt.userData&&mt.userData.rimColor&&rimMats.indexOf(mt)<0)rimMats.push(mt);
    }
  });
  mesh.userData.fadeMats=fadeMats;mesh.userData.fadeOps=fadeOps;mesh.userData.rimMats=rimMats;
  mesh.position.set(cfg.x,terrainHeight(cfg.x,cfg.z)+.8,cfg.z);
  scene.add(mesh);monsterMeshes.push(mesh);
  burstParticle(cfg.x,terrainHeight(cfg.x,cfg.z)+1,cfg.z,0x7fffd4,10);
  return mesh;
}
let monsterMeshes = [];
function buildMonsters(monsters){
  disposeRoots(monsterMeshes);
  monsterMeshes = [];
  const family=stageVisualFamily();
  for(const cfg of monsters){
    /* v24.6：怪物生命全局 ×1.6（__hpScaled 防重复放大；精英节点等后置加成叠加在其上） */
    if(!cfg.__hpScaled){const f=1.6;cfg.hp=Math.ceil((cfg.hp||1)*f);cfg.maxHp=Math.ceil((cfg.maxHp||cfg.hp)*f);cfg.__hpScaled=true;}
    const mesh = buildMonsterMesh(cfg.type,family);
    cfg.visualFamily=family.id;cfg.visualVariant=family.id+"-"+(stageVisualVariant()+1);cfg.familyName=family.monster+"·"+STAGE_VARIANT_TAGS[stageVisualVariant()];
    mesh.userData.baseScale=cfg.type==="elite"?1.4:(cfg.type==="shield"?1.55:(cfg.type==="swarm"?.48:1));
    const aura=new THREE.Mesh(wardAuraGeo,wardAuraMat);aura.visible=false;mesh.add(aura);mesh.userData.wardAura=aura;
    /* v9：stylizeCreature 已按体量限制投影网格，避免高模小部件把 draw call 推爆。 */
    mesh.traverse(ch=>{if(ch.isMesh)ch.receiveShadow=true;});
    /* v23 PERF：一次性预收集材质表（死亡淡出 fadeMats / 描边 rimMats），主循环不再每帧 traverse 整棵子树。
       fadeMats 排除 persistentRes 共享材质（如 glowMaterial 缓存）——同时修复旧问题：
       死亡淡出曾把共享辉光材质一起拉暗，导致全场景同色光晕闪烁。 */
    const fadeMats=[],fadeOps=[],rimMats=[];
    mesh.traverse(ch=>{
      const list=Array.isArray(ch.material)?ch.material:(ch.material?[ch.material]:[]);
      for(const mt of list){
        if(!mt||fadeMats.indexOf(mt)>=0)continue;
        if(!persistentRes.has(mt)){fadeMats.push(mt);fadeOps.push({op:mt.opacity,tr:mt.transparent});}
        if(mt.userData&&mt.userData.rimColor&&rimMats.indexOf(mt)<0)rimMats.push(mt);
      }
    });
    mesh.userData.fadeMats=fadeMats;mesh.userData.fadeOps=fadeOps;mesh.userData.rimMats=rimMats;
    mesh.position.set(cfg.x, terrainHeight(cfg.x, cfg.z)+0.8, cfg.z);
    scene.add(mesh);
    monsterMeshes.push(mesh);
  }
}
/* v20：生物情绪状态。巡逻微脉动、索敌转青绿、蓄力炽红、受击闪白，
   用发光强度让玩家无需盯着预警圈也能读懂攻击节奏。 */
function updateMonsterMood(m,mm,dt){
  if(!m||!mm||m.hp<=0)return;
  const ud=mm.userData||{},d=Math.hypot(player.x-m.x,player.z-m.z),cfg=MONSTER_TYPES[m.type]||MONSTER_TYPES.gray;
  const charging=!!((m.atk&&m.atk.phase==="windup")||(m.spit&&m.spit.windup>0)||(m.windup>0));
  const alert=charging||!!m.rage||d<((cfg.chaseR||130)*.62);
  const hurt=(m.hitReact||0)>.04;
  const mood=hurt?"hurt":(charging?"charge":(alert?"alert":"patrol"));
  const accent=CREATURE_ACCENTS[m.type]||0x7fffd4;
  const moodHex=mood==="hurt"?0xffffff:(mood==="charge"?0xff274f:(mood==="alert"?0x48ffc7:accent));
  const pulse=.5+.5*Math.sin(G.time*(mood==="charge"?15:(mood==="alert"?5:2.1))+m.phase);
  if(ud.bodyMat){ud.bodyMat.emissive.setHex(moodHex);ud.bodyMat.emissiveIntensity=(mood==="patrol"?.1:(mood==="alert"?.3:(mood==="charge"?.62:.85)))+.12*pulse;}
  if(ud.eyeMat){ud.eyeMat.color.setHex(moodHex);ud.eyeMat.opacity=1;}
  if(ud.eye){const k=mood==="charge"?1.2:(mood==="alert"?1.08:1);ud.eye.scale.setScalar(k+.08*pulse);}
  if(ud.renderGlow&&ud.renderGlow.material)ud.renderGlow.material.opacity=(mood==="charge"?.86:(mood==="alert"?.72:.52))+.12*pulse;
  ud.mood=mood;
}
/* v6：五关巨型 BOSS 独立轮廓 */
function buildCrabBoss(){
  const g=new THREE.Group(),shellMat=new THREE.MeshStandardMaterial({color:0x8e4f43,emissive:0x210a08,roughness:.55,metalness:.28}),jointMat=new THREE.MeshStandardMaterial({color:0x432a27,roughness:.8}),glow=new THREE.MeshBasicMaterial({color:0xffb36b,fog:false});
  const shell=new THREE.Mesh(new THREE.SphereGeometry(1.25,18,12),shellMat);shell.scale.set(1.8,.72,1.35);g.add(shell);
  const ridgeMat=new THREE.MeshStandardMaterial({color:0xb96d55,emissive:0x29100b,roughness:.48,metalness:.22}),ridgeGeo=new THREE.TorusGeometry(.94,.08,6,24),ridges=new THREE.InstancedMesh(ridgeGeo,ridgeMat,3),rm=new THREE.Matrix4(),rp=new THREE.Vector3(),rq=new THREE.Quaternion(),re=new THREE.Euler(),rs=new THREE.Vector3();
  for(let i=0;i<3;i++){rp.set(0,.36-i*.22,.22-i*.18);re.set(Math.PI/2,0,0);rq.setFromEuler(re);rs.set(1.35-i*.13,.78-i*.08,1);rm.compose(rp,rq,rs);ridges.setMatrixAt(i,rm);}ridges.instanceMatrix.needsUpdate=true;g.add(ridges);
  const barnGeo=new THREE.ConeGeometry(.12,.28,7),barnacles=new THREE.InstancedMesh(barnGeo,jointMat,9),bm=new THREE.Matrix4();
  for(let i=0;i<9;i++){const a=i/9*Math.PI*2,r=.55+.38*(i%2);rp.set(Math.cos(a)*r,.72-Math.abs(Math.cos(a))*.18,Math.sin(a)*r*.72);re.set((Math.random()-.5)*.4,a,(Math.random()-.5)*.35);rq.setFromEuler(re);rs.setScalar(.72+(i%3)*.15);bm.compose(rp,rq,rs);barnacles.setMatrixAt(i,bm);}barnacles.instanceMatrix.needsUpdate=true;g.add(barnacles);
  const claws=[],legs=[];
  for(const side of [-1,1]){const cg=new THREE.Group(),arm=new THREE.Mesh(new THREE.CylinderGeometry(.28,.38,1.8,8),jointMat);arm.rotation.z=Math.PI/2;arm.position.x=side*1.45;const c1=new THREE.Mesh(new THREE.ConeGeometry(.48,1.4,7),shellMat);c1.rotation.z=side*-Math.PI/2;c1.position.x=side*2.45;const c2=c1.clone();c2.position.y=.5;c2.rotation.z=side*-.9;cg.add(arm,c1,c2);g.add(cg);claws.push(cg);}
  for(let i=0;i<6;i++){const side=i<3?-1:1,row=i%3,leg=new THREE.Mesh(new THREE.CylinderGeometry(.1,.16,2.2,6),jointMat);leg.position.set(side*(1.2+row*.25),-.7,(row-1)*.75);leg.rotation.z=side*-.85;leg.rotation.x=(row-1)*.28;leg.userData.baseRotX=leg.rotation.x;g.add(leg);legs.push(leg);}
  for(const x of [-.48,.48]){const stalk=new THREE.Mesh(new THREE.CylinderGeometry(.07,.1,.72,6),jointMat);stalk.position.set(x,.92,.72);const eye=new THREE.Mesh(new THREE.SphereGeometry(.14,8,6),glow);eye.position.set(x,1.28,.72);g.add(stalk,eye);}
  /* v23.2 建模补强：背甲棘列 + 螯关节球 + 螯齿 + 尾扇 + 口器颚 */
  const spikeGeo=new THREE.ConeGeometry(.14,.5,6),spikes=new THREE.InstancedMesh(spikeGeo,shellMat,7),spM=new THREE.Matrix4(),spP=new THREE.Vector3(),spQ=new THREE.Quaternion(),spE=new THREE.Euler(),spS=new THREE.Vector3();
  for(let i=0;i<7;i++){spP.set(Math.sin(i*2.4)*.5,.78-i*.02,-.9+i*.32);spE.set(-.5,0,(i%2?-.3:.3));spQ.setFromEuler(spE);spS.setScalar(.8+(i%3)*.22);spM.compose(spP,spQ,spS);spikes.setMatrixAt(i,spM);}spikes.instanceMatrix.needsUpdate=true;g.add(spikes);
  for(const side of [-1,1]){
    const joint=new THREE.Mesh(new THREE.SphereGeometry(.3,9,7),jointMat);joint.position.set(side*2.15,.1,0);g.add(joint);
    for(const t2 of [-1,1]){const tooth=new THREE.Mesh(new THREE.ConeGeometry(.09,.34,5),jointMat);tooth.position.set(side*2.72,.42+t2*.02,t2*.2);tooth.rotation.x=t2*-.6;tooth.rotation.z=side*-.4;g.add(tooth);}
  }
  for(let tf=0;tf<3;tf++){const fan=new THREE.Mesh(new THREE.ConeGeometry(.22,.7,3),shellMat);fan.position.set((tf-1)*.3,.15,-1.9);fan.rotation.x=Math.PI/2+(tf-1)*.3;fan.scale.set(1,1,.24);g.add(fan);}
  for(const mx of [-.2,.2]){const mand=new THREE.Mesh(new THREE.ConeGeometry(.12,.5,6),jointMat);mand.position.set(mx,-.15,1.15);mand.rotation.x=1.9;mand.rotation.z=mx*2.2;g.add(mand);}
  g.userData={bossType:"reefCrab",claws,legs,ridges,barnacles,baseScale:1.25,hover:1.25};return g;
}
function buildLeviathanBoss(){
  const g=new THREE.Group(),bodyMat=new THREE.MeshStandardMaterial({color:0x315f4f,emissive:0x071b15,roughness:.48,metalness:.24}),finMat=new THREE.MeshStandardMaterial({color:0x16372f,roughness:.72}),glow=new THREE.MeshBasicMaterial({color:0x83ffd0,fog:false}),segments=[];
  for(let i=0;i<8;i++){const s=new THREE.Mesh(new THREE.SphereGeometry(1,14,9),bodyMat),k=1-i*.075,baseX=Math.sin(i*.82)*i*.22;s.scale.set(k*.88,k*.68,1.2);s.position.set(baseX,0,-i*1.35);s.userData.baseX=baseX;g.add(s);segments.push(s);}
  const head=new THREE.Mesh(new THREE.SphereGeometry(1.25,16,10),bodyMat);head.scale.set(1.15,.82,1.35);head.position.z=1.3;g.add(head);
  const jaw=new THREE.Mesh(new THREE.ConeGeometry(.72,1.6,8),finMat);jaw.rotation.x=Math.PI/2;jaw.position.set(0,-.28,2.35);g.add(jaw);
  for(const side of [-1,1]){const fin=new THREE.Mesh(new THREE.ConeGeometry(.65,2.3,4),finMat);fin.position.set(side*1.1,0,-1.2);fin.rotation.z=side*-Math.PI/2;g.add(fin);}
  const crownMat=new THREE.MeshStandardMaterial({color:0x4baa72,emissive:0x123c29,emissiveIntensity:.9,roughness:.38,metalness:.16}),crownGeo=new THREE.ConeGeometry(.24,1.25,5),crown=new THREE.InstancedMesh(crownGeo,crownMat,11),cm=new THREE.Matrix4(),cp=new THREE.Vector3(),cq=new THREE.Quaternion(),ce=new THREE.Euler(),cs=new THREE.Vector3();
  for(let i=0;i<11;i++){const z=1.45-i*.92,scale=1-(i*.035),si=i*.68,x=Math.sin(si*.82)*si*.22;cp.set(x,.78,z);ce.set((i%2?-.12:.12),0,0);cq.setFromEuler(ce);cs.set(scale,scale*(.7+(i%3)*.14),scale);cm.compose(cp,cq,cs);crown.setMatrixAt(i,cm);}crown.instanceMatrix.needsUpdate=true;g.add(crown);
  const eye=new THREE.Mesh(new THREE.SphereGeometry(.22,8,6),glow);eye.position.set(0,.42,2.22);g.add(eye);
  /* v23.2 建模补强：鳃裂 + 尾鳍 + 腹鳍对 + 头角 */
  for(const gs of [-1,1])for(let gi=0;gi<3;gi++){const slit=new THREE.Mesh(new THREE.BoxGeometry(.05,.5,.14),finMat);slit.position.set(gs*1.0,.05,1.15-gi*.3);slit.rotation.z=gs*-.25;g.add(slit);}
  const flukeU=new THREE.Mesh(new THREE.ConeGeometry(.55,1.5,3),finMat);flukeU.position.set(0,.5,-11.2);flukeU.rotation.set(2.7,0,Math.PI*.06);flukeU.scale.set(1,1,.16);
  const flukeD=new THREE.Mesh(new THREE.ConeGeometry(.45,1.1,3),finMat);flukeD.position.set(0,-.35,-11.2);flukeD.rotation.set(-2.7,0,-Math.PI*.06);flukeD.scale.set(1,1,.16);
  g.add(flukeU,flukeD);
  for(const side of [-1,1]){const pelvic=new THREE.Mesh(new THREE.ConeGeometry(.34,1.3,4),finMat);pelvic.position.set(side*.75,-.7,-3.4);pelvic.rotation.z=side*-2.1;pelvic.scale.set(1,1,.2);g.add(pelvic);}
  for(let h2=0;h2<2;h2++){const horn=new THREE.Mesh(new THREE.ConeGeometry(.16,.9,5),crownMat);horn.position.set((h2?-1:1)*.55,.95,1.75);horn.rotation.z=(h2?-1:1)*-.7;g.add(horn);}
  g.userData={bossType:"kelpLeviathan",segments,eye,crown,baseScale:.82,hover:2.1};return g;
}
function buildJellyBoss(){
  const g=new THREE.Group(),domeMat=new THREE.MeshStandardMaterial({color:0x6b5a9c,emissive:0x24164d,transparent:true,opacity:.78,roughness:.2,metalness:.08,depthWrite:false,side:THREE.DoubleSide}),glow=new THREE.MeshBasicMaterial({color:0xb28cff,transparent:true,opacity:.9,depthWrite:false,fog:false});
  const dome=new THREE.Mesh(new THREE.SphereGeometry(2.15,20,12,0,Math.PI*2,0,Math.PI*.62),domeMat);dome.scale.y=.72;g.add(dome);
  dome.renderOrder=5;
  const inner=new THREE.Mesh(new THREE.SphereGeometry(1.45,16,10,0,Math.PI*2,0,Math.PI*.72),new THREE.MeshBasicMaterial({color:0x8e6dff,transparent:true,opacity:.19,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,fog:true}));inner.scale.y=.86;inner.position.y=-.16;inner.renderOrder=4;g.add(inner);
  const core=new THREE.Mesh(new THREE.SphereGeometry(.62,12,8),glow);core.position.y=-.05;core.renderOrder=6;g.add(core);const tentacles=[];
  for(let i=0;i<10;i++){const a=i/10*Math.PI*2,r=.55+(i%2)*.62,curve=new THREE.QuadraticBezierCurve3(new THREE.Vector3(Math.cos(a)*r,-.2,Math.sin(a)*r),new THREE.Vector3(Math.cos(a)*r*1.3,-1.8,Math.sin(a)*r*1.3),new THREE.Vector3(Math.cos(a)*r*.8,-3.5,Math.sin(a)*r*.8));const t=new THREE.Mesh(new THREE.TubeGeometry(curve,12,.07,5,false),domeMat);const tip=new THREE.Mesh(new THREE.SphereGeometry(.11,7,5),glow);tip.position.copy(curve.getPoint(1));t.add(tip);t.userData.seed=i*1.4;g.add(t);tentacles.push(t);}
  /* v23.2 建模补强：伞缘褶边 + 四条口腕 + 内核光环 */
  const frill=new THREE.Mesh(new THREE.TorusGeometry(2.02,.12,6,28),new THREE.MeshStandardMaterial({color:0x8f7cc4,emissive:0x2e2158,transparent:true,opacity:.6,roughness:.35,side:THREE.DoubleSide,depthWrite:false}));
  frill.rotation.x=Math.PI/2;frill.position.y=-.62;frill.scale.set(1,.72,1);frill.renderOrder=5;g.add(frill);
  const oralCurve=new THREE.QuadraticBezierCurve3(new THREE.Vector3(0,-.7,0),new THREE.Vector3(.3,-1.9,.25),new THREE.Vector3(.12,-3.1,.15));
  for(let oa=0;oa<4;oa++){
    const arm=new THREE.Mesh(new THREE.TubeGeometry(oralCurve,8,.13,6,false),domeMat);
    const a4=oa/4*Math.PI*2+Math.PI/4;arm.rotation.y=a4;arm.position.set(Math.cos(a4)*.3,0,Math.sin(a4)*.3);
    arm.userData.seed=3+oa;g.add(arm);tentacles.push(arm);
  }
  const halo=new THREE.Mesh(new THREE.TorusGeometry(.95,.05,6,22),glow);halo.rotation.x=Math.PI/2;halo.position.y=-.15;halo.renderOrder=6;g.add(halo);
  g.userData={bossType:"abyssJelly",tentacles,core,baseScale:1.15,hover:4.3};return g;
}
function buildWhaleBoss(){
  const g=new THREE.Group(),bodyMat=new THREE.MeshStandardMaterial({color:0x384759,emissive:0x080b16,roughness:.52,metalness:.3}),boneMat=new THREE.MeshStandardMaterial({color:0x9aa7a2,roughness:.68}),glow=new THREE.MeshBasicMaterial({color:0xff5b83,fog:false});
  const body=new THREE.Mesh(new THREE.SphereGeometry(1.45,18,12),bodyMat);body.scale.set(1.35,.85,3.35);g.add(body);
  const skull=new THREE.Mesh(new THREE.SphereGeometry(1.35,16,10),boneMat);skull.scale.set(1.15,.78,1.25);skull.position.z=3.65;g.add(skull);
  const jaw=new THREE.Mesh(new THREE.BoxGeometry(1.8,.28,2.15),boneMat);jaw.position.set(0,-.72,4.0);jaw.rotation.x=-.12;g.add(jaw);
  const ribGeo=new THREE.TorusGeometry(1,.075,6,22,Math.PI*1.68),ribs=new THREE.InstancedMesh(ribGeo,boneMat,8),rm=new THREE.Matrix4(),rp=new THREE.Vector3(),rq=new THREE.Quaternion(),re=new THREE.Euler(),rs=new THREE.Vector3();
  for(let i=0;i<8;i++){const z=2.15-i*.62,k=1-Math.abs(i-3.5)*.055;rp.set(0,-.05,z);re.set(0,0,.18);rq.setFromEuler(re);rs.set(1.38*k,.92*k,1);rm.compose(rp,rq,rs);ribs.setMatrixAt(i,rm);}ribs.instanceMatrix.needsUpdate=true;g.add(ribs);
  const toothGeo=new THREE.ConeGeometry(.055,.32,5),teeth=new THREE.InstancedMesh(toothGeo,boneMat,12),tm=new THREE.Matrix4();
  for(let i=0;i<12;i++){const side=i<6?-1:1,j=i%6;rp.set(side*(.18+j*.13),-.79,3.38+j*.24);re.set(side > 0 ? .16 : -.16,0,side*.08);rq.setFromEuler(re);rs.setScalar(.8+(j%2)*.18);tm.compose(rp,rq,rs);teeth.setMatrixAt(i,tm);}teeth.instanceMatrix.needsUpdate=true;g.add(teeth);
  const fins=[];for(const side of [-1,1]){const fin=new THREE.Mesh(new THREE.ConeGeometry(.75,3.3,4),bodyMat);fin.position.set(side*1.45,-.15,.3);fin.rotation.z=side*-Math.PI/2;g.add(fin);fins.push(fin);}
  const eye=new THREE.Mesh(new THREE.SphereGeometry(.2,8,6),glow);eye.position.set(0,.38,4.82);g.add(eye);
  /* v23.2 建模补强：尾鳍对 + 背脊板列 + 鲸须线 */
  const flukeA=new THREE.Mesh(new THREE.ConeGeometry(.95,2.6,3),boneMat);flukeA.position.set(-.8,.1,-4.7);flukeA.rotation.set(Math.PI/2,0,.5);flukeA.scale.set(1,1,.12);
  const flukeB=flukeA.clone();flukeB.position.x=.8;flukeB.rotation.z=-.5;g.add(flukeA,flukeB);
  const plateGeo=new THREE.BoxGeometry(.5,.16,.9),plates=new THREE.InstancedMesh(plateGeo,bodyMat,7),plM=new THREE.Matrix4();
  for(let i=0;i<7;i++){plM.makeRotationZ((i%2?-.14:.14));plM.setPosition(0,1.28-i*.03,-2.2+i*.75);plates.setMatrixAt(i,plM);}plates.instanceMatrix.needsUpdate=true;g.add(plates);
  for(const side of [-1,1])for(let bi=0;bi<4;bi++){const baleen=new THREE.Mesh(new THREE.BoxGeometry(.03,.5,.16),boneMat);baleen.position.set(side*1.05,-.45,3.3+bi*.28);baleen.rotation.z=side*-.3;g.add(baleen);}
  g.userData={bossType:"voidWhale",fins,eye,ribs,teeth,baseScale:.82,hover:2.5};return g;
}
const BOSS_NAMES={reefCrab:"乌娜之盾 · 船壳清道夫",kelpLeviathan:"锤翅母兽 · 永昼猎群",abyssJelly:"洛克镜像 · 秘道守卫",voidWhale:"脊柱航鲸 · 引擎中继",hand:"荒凉之手 · 囚室代行体",handX:"荒凉之手 · 黑洞航向态"};
function buildBossMesh(type){
  let g;
  if(type==="reefCrab")g=buildCrabBoss();else if(type==="kelpLeviathan")g=buildLeviathanBoss();else if(type==="abyssJelly")g=buildJellyBoss();else if(type==="voidWhale")g=buildWhaleBoss();
  else{g=buildHandGroup(1);g.userData.baseScale=type==="handX"?3.38:2.6;g.userData.hover=2.4;g.userData.bossType=type;}
  return stylizeCreature(g,type,true);
}
let bossMesh=null;
function rebuildBossMesh(type){if(bossMesh)disposeRoots([bossMesh]);bossMesh=buildBossMesh(type||"handX");bossMesh.traverse(ch=>{if(ch.isMesh)ch.receiveShadow=true;});bossMesh.visible=false;scene.add(bossMesh);}
rebuildBossMesh("handX");

/* CSD-M2：墨鲛墨弹（速 6 弹丸 + 拖尾）渲染网格 */
const spitGeo = new THREE.SphereGeometry(0.22, 6, 4);
const spitBladeGeo=new THREE.OctahedronGeometry(.28,0),spitCrystalGeo=new THREE.IcosahedronGeometry(.25,1),spitShellGeo=new THREE.SphereGeometry(.36,8,6),spitTrailGeo=new THREE.ConeGeometry(.13,.78,6);
const spitInkMat=new THREE.MeshBasicMaterial({color:0x45636b,fog:false}),spitBladeMat=new THREE.MeshBasicMaterial({color:0xff6b92,fog:false}),spitCrystalMat=new THREE.MeshBasicMaterial({color:0x8aeaff,fog:false});
const spitInkShellMat=new THREE.MeshBasicMaterial({color:0x375762,transparent:true,opacity:.25,depthWrite:false,blending:THREE.AdditiveBlending,fog:false}),spitBladeShellMat=new THREE.MeshBasicMaterial({color:0xff6b92,transparent:true,opacity:.28,depthWrite:false,wireframe:true,blending:THREE.AdditiveBlending,fog:false}),spitCrystalShellMat=new THREE.MeshBasicMaterial({color:0x62d9ff,transparent:true,opacity:.3,depthWrite:false,wireframe:true,blending:THREE.AdditiveBlending,fog:false});
const spitInkTrailMat=new THREE.MeshBasicMaterial({color:0x1f363e,transparent:true,opacity:.44,depthWrite:false,fog:false}),spitBladeTrailMat=new THREE.MeshBasicMaterial({color:0xff6b92,transparent:true,opacity:.42,depthWrite:false,blending:THREE.AdditiveBlending,fog:false}),spitCrystalTrailMat=new THREE.MeshBasicMaterial({color:0x62d9ff,transparent:true,opacity:.42,depthWrite:false,blending:THREE.AdditiveBlending,fog:false});
keepRes(spitGeo,spitBladeGeo,spitCrystalGeo,spitShellGeo,spitTrailGeo,spitInkMat,spitBladeMat,spitCrystalMat,spitInkShellMat,spitBladeShellMat,spitCrystalShellMat,spitInkTrailMat,spitBladeTrailMat,spitCrystalTrailMat);
let spitMeshes = [];
function buildSpitMesh(p){
  const g=new THREE.Group(),kind=p&&p.kind,blade=kind==="blade",crystal=kind==="crystal";
  const col=blade?0xff6b92:(crystal?0x62d9ff:0x45636b),geo=blade?spitBladeGeo:(crystal?spitCrystalGeo:spitGeo),coreMat=blade?spitBladeMat:(crystal?spitCrystalMat:spitInkMat),shellMat=blade?spitBladeShellMat:(crystal?spitCrystalShellMat:spitInkShellMat),trailMat=blade?spitBladeTrailMat:(crystal?spitCrystalTrailMat:spitInkTrailMat);
  g.add(new THREE.Mesh(geo,coreMat));const shell=new THREE.Mesh(spitShellGeo,shellMat);shell.scale.set(blade?1.15:1,blade ? .65 : 1,blade ? .65 : 1);g.add(shell);
  const trail = new THREE.Mesh(spitTrailGeo,trailMat);
  trail.rotation.x = Math.PI/2;      // 尖端朝后（组局部 -Z）
  trail.position.z=-.42;g.add(trail);
  const glow=new THREE.Sprite(glowMaterial(col));glow.scale.set(blade?1.25:1.05,blade?1.25:1.05,1);g.add(glow);
  return g;
}
function syncSpitMeshes(){
  if(!G || !G.spitPulses){
    disposeRoots(spitMeshes.map(e=>e.mesh));
    spitMeshes = [];
    return;
  }
  for(let i=spitMeshes.length-1;i>=0;i--){
    const e = spitMeshes[i];
    if(G.spitPulses.indexOf(e.pulse) < 0){ disposeRoots([e.mesh]); spitMeshes.splice(i,1); }
  }
  for(const p of G.spitPulses){
    if(!p.mesh){
      const mesh = buildSpitMesh(p);
      mesh.position.set(p.x, p.y, p.z);
      mesh.lookAt(p.x+p.vx, p.y, p.z+p.vz);
      scene.add(mesh);
      p.mesh = mesh;
      spitMeshes.push({ pulse:p, mesh });
    } else {
      p.mesh.position.set(p.x, p.y, p.z);
      p.mesh.lookAt(p.x+p.vx, p.y, p.z+p.vz);
    }
  }
}
/* v7：腐蚀领域地面模型。 */
let hazardMeshes=[];
function syncHazardMeshes(){
  const list=(G&&G.enemyHazards)||[];
  for(let i=hazardMeshes.length-1;i>=0;i--){const e=hazardMeshes[i];if(list.indexOf(e.h)<0){disposeRoots([e.mesh]);hazardMeshes.splice(i,1);}}
  for(const h of list){
    if(!h.mesh){
      const mat=new THREE.MeshBasicMaterial({color:0x67e04f,transparent:true,opacity:.18,side:THREE.DoubleSide,depthWrite:false,fog:false});
      const ring=new THREE.Mesh(new THREE.RingGeometry(h.r*.58,h.r,36),mat);ring.rotation.x=-Math.PI/2;ring.position.set(h.x,terrainHeight(h.x,h.z)+.1,h.z);
      scene.add(ring);h.mesh=ring;hazardMeshes.push({h,mesh:ring});
    }
    const k=.94+.06*Math.sin(G.time*5);h.mesh.scale.setScalar(k);h.mesh.rotation.z+=.004;h.mesh.material.opacity=.12+.12*(h.life/(h.max||h.life));
  }
}

/* CSD-M2：关卡场景重建（地形/障碍/样本/怪物/门位）+ 跨关加载 */
function applyLevelPalette(){
  const palettes=[
    {fog:0x0b2228,top:0x174c53,bottom:0x02070a,light:0xa8fff0,ground:0x93aaa7,rock:0x708984,accent:0x62e6d2,water:0x55c8c0,rim:0x3e9de0,near:22,far:98,ex:1.02},
    {fog:0x26150c,top:0x5d2e16,bottom:0x090304,light:0xffe4c2,ground:0x9f7a66,rock:0x7c5a4c,accent:0xffaa62,water:0x9e5a3e,rim:0xff9b52,near:18,far:86,ex:1.0},
    {fog:0x061a17,top:0x0c3e32,bottom:0x010807,light:0x8fffc2,ground:0x627f74,rock:0x38594e,accent:0x52cfa7,water:0x276f5a,rim:0x42d3a5,near:17,far:80,ex:.96},
    {fog:0x1f080e,top:0x581421,bottom:0x090205,light:0xff9a8a,ground:0x80636b,rock:0x6b424a,accent:0xff5b78,water:0x81394f,rim:0xe04c65,near:15,far:74,ex:.98},
    {fog:0x03040a,top:0x0a0b1c,bottom:0x000001,light:0xc8d8ff,ground:0x454c60,rock:0x2b3245,accent:0x728cff,water:0x283c68,rim:0x8a6cff,near:11,far:56,ex:.90}
  ];
  const p=palettes[Math.max(0,Math.floor((((G&&G.level)||1)-1)/4)%palettes.length)];
  currentVisualPalette=p;
  scene.fog.color.setHex(p.fog);scene.background.setHex(p.bottom);
  scene.fog.near=lowQ?Math.max(9,p.near-4):p.near;scene.fog.far=lowQ?p.far*.76:p.far;
  abyssDome.material.uniforms.top.value.setHex(p.top);abyssDome.material.uniforms.bottom.value.setHex(p.bottom);
  sun.color.setHex(p.light);sun.intensity=lowQ?.72:.94;renderer.toneMappingExposure=p.ex;
  hemiLight.color.setHex(p.water);rimLight.color.setHex(p.rim);headlight.color.setHex(p.light);
  waterSurfaceMat.uniforms.uColor.value.setHex(p.water);
  for(const s of lightShafts.children)for(const m of s.userData.materials||[])m.uniforms.uColor.value.setHex(p.accent);
  rockMat.color.setHex(p.rock);rockSideMat.color.copy(rockMat.color).multiplyScalar(.62);
  marineSnow.material.color.setHex(p.light);
}
function rebuildScene(){
  applyLevelPalette();
  buildTerrain();
  buildObstacles(G && G.obstacles);
  buildEnvironmentDetails();
  buildInteractiveDetails();
  buildSamples((G && G.sampleSpots) || SAMPLE_SPOTS);
  buildMonsters(G ? G.monsters : []);
  rebuildBossMesh(G&&G.boss?G.boss.type:"handX");
  positionGate((G && G.gatePos) || GATE_POS);
  gateGroup.visible = true;
  bossMesh.visible = false;
  bossRing.visible = false;
  gateBeam.visible = false;
  document.getElementById("bossWrap").classList.remove("show");
  disposeRoots(pulses.map(p=>p.mesh).filter(Boolean));
  pulses = [];
  disposeRoots(echoRings.map(r=>r.mesh));echoRings=[];
  clearEchoFieldMeshes();
  clearLoot();
  disposeRoots(spitMeshes.map(e=>e.mesh));
  spitMeshes = [];
  disposeRoots(hazardMeshes.map(e=>e.mesh));
  hazardMeshes=[];
  particles=[];syncParticlePoints();
  clearTelegraphRings();   // CSD-SOUL1-P1：清场时移除地面预警圈
  gateGroup.rotation.y = 0;
  buildMinimapLayer();
}

/* ================= v11 程序化战术小地图 ================= */
function minimapPoint(x,z){
  const pad=13,span=minimapEl.width-pad*2;
  return {x:pad+(Math.max(-MAP_LIMIT,Math.min(MAP_LIMIT,x))+MAP_LIMIT)/(MAP_LIMIT*2)*span,y:pad+(Math.max(-MAP_LIMIT,Math.min(MAP_LIMIT,z))+MAP_LIMIT)/(MAP_LIMIT*2)*span};
}
function minimapHex(n){return "#"+(Number(n||0)&0xffffff).toString(16).padStart(6,"0");}
function minimapDiamond(ctx,x,y,r,fill,stroke){ctx.beginPath();ctx.moveTo(x,y-r);ctx.lineTo(x+r,y);ctx.lineTo(x,y+r);ctx.lineTo(x-r,y);ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1.5;ctx.stroke();}}
function buildMinimapLayer(){
  if(!minimapCtx||!G)return;
  const ctx=minimapLayer.getContext("2d"),w=minimapLayer.width,h=minimapLayer.height,cells=40,cell=(w-26)/cells;
  ctx.clearRect(0,0,w,h);ctx.fillStyle="#020910";ctx.fillRect(0,0,w,h);
  const ground=minimapHex(currentVisualPalette.ground),water=minimapHex(currentVisualPalette.water),accent=minimapHex(currentVisualPalette.accent);
  for(let iz=0;iz<cells;iz++)for(let ix=0;ix<cells;ix++){
    const wx=-MAP_LIMIT+(ix+.5)/cells*MAP_LIMIT*2,wz=-MAP_LIMIT+(iz+.5)/cells*MAP_LIMIT*2,ht=terrainHeight(wx,wz),shade=Math.max(0,Math.min(1,(ht+3.2)/6.4));
    const a=0.13+shade*.25;ctx.fillStyle="rgba("+parseInt(ground.slice(1,3),16)+","+parseInt(ground.slice(3,5),16)+","+parseInt(ground.slice(5,7),16)+","+a+")";ctx.fillRect(13+ix*cell,13+iz*cell,cell+1,cell+1);
  }
  const grd=ctx.createRadialGradient(w*.5,h*.5,20,w*.5,h*.5,w*.68);grd.addColorStop(0,"rgba(74,165,170,.08)");grd.addColorStop(1,"rgba(0,3,8,.62)");ctx.fillStyle=grd;ctx.fillRect(0,0,w,h);
  ctx.strokeStyle="rgba(127,255,212,.075)";ctx.lineWidth=1;
  for(let v=-40;v<=40;v+=20){let a=minimapPoint(v,-MAP_LIMIT),b=minimapPoint(v,MAP_LIMIT);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();a=minimapPoint(-MAP_LIMIT,v);b=minimapPoint(MAP_LIMIT,v);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}
  const obs=(G&&G.obstacles)||OBSTACLES;for(const o of obs){const p=minimapPoint(o.x,o.z),r=Math.max(2,(o.r||1.8)/(MAP_LIMIT*2)*(w-26));ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fillStyle=o.kind==="kelp"?"rgba(67,143,102,.72)":"rgba(113,132,138,.72)";ctx.fill();ctx.strokeStyle="rgba(205,238,229,.22)";ctx.stroke();}
  ctx.strokeStyle=accent+"77";ctx.lineWidth=2;ctx.strokeRect(13,13,w-26,h-26);ctx.fillStyle=water;ctx.globalAlpha=.42;ctx.font="9px serif";ctx.fillText("船体扫描 / 124m",18,h-18);ctx.globalAlpha=1;
  const chapter=STORY_CHAPTERS[((G.level||1)-1)]||STORY_CHAPTERS[0];minimapLevel.textContent="L"+(G.level||1)+" · "+chapter.name;
  drawMinimap(performance.now(),true);
}
function drawMinimap(ts,force){
  if(!minimapCtx||!G||(!force&&ts-minimapLastDraw<80))return;minimapLastDraw=ts;
  const ctx=minimapCtx,w=minimapEl.width,h=minimapEl.height,t=(G.time||0),pulse=.5+.5*Math.sin(t*4);
  ctx.clearRect(0,0,w,h);ctx.drawImage(minimapLayer,0,0);
  ctx.save();ctx.beginPath();ctx.rect(13,13,w-26,h-26);ctx.clip();
  const sweep=t*.42-Math.PI*.5,sg=ctx.createLinearGradient(w*.5,h*.5,w*.5+Math.cos(sweep)*w*.5,h*.5+Math.sin(sweep)*h*.5);sg.addColorStop(0,"rgba(95,224,176,.13)");sg.addColorStop(1,"rgba(95,224,176,0)");ctx.strokeStyle=sg;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(w*.5,h*.5);ctx.lineTo(w*.5+Math.cos(sweep)*w,h*.5+Math.sin(sweep)*h);ctx.stroke();
  const spots=G.sampleSpots||SAMPLE_SPOTS,family=stageVisualFamily(),familyColor="#"+family.color.toString(16).padStart(6,"0"),familyAccent="#"+family.accent.toString(16).padStart(6,"0");for(let i=0;i<spots.length;i++){if(G.grabbed&&G.grabbed[i])continue;const p=minimapPoint(spots[i].x,spots[i].z);minimapDiamond(ctx,p.x,p.y,3.2,familyColor,familyAccent);}
  const mission=G.objective||{};if(mission.kind==="scan"){for(let i=0;i<(mission.points||[]).length;i++){const q=mission.points[i],p=minimapPoint(q.x,q.z),done=!!(G.scanDone&&G.scanDone[i]);ctx.strokeStyle=done?"#63e8cf":"#ffd66b";ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y,5,0,Math.PI*2);ctx.stroke();ctx.fillStyle=done?"#63e8cf":"#ffd66b";ctx.fillRect(p.x-1,p.y-1,2,2);}}else if(mission.kind==="defend"){const p=minimapPoint(mission.x,mission.z),r=mission.r/(MAP_LIMIT*2)*(w-26);ctx.strokeStyle="#63e8cf";ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.stroke();}
  for(const m of G.monsters||[]){if(!m||m.hp<=0)continue;const p=minimapPoint(m.x,m.z),elite=m.type==="elite"||m.type==="shield",spitter=m.type==="spitter"||m.type==="acid"||m.type==="sniper";ctx.beginPath();ctx.arc(p.x,p.y,elite?5:3.5,0,Math.PI*2);ctx.fillStyle=m.type==="shield"?"#54d9ff":m.type==="acid"?"#83ff66":m.type==="sniper"?"#ff426e":m.type==="swarm"?"#d2ff72":elite?"#ffb14f":spitter?"#c875ff":"#ff7187";ctx.fill();if(m.atk&&m.atk.phase==="windup"){ctx.strokeStyle="rgba(255,80,100,"+(.35+.5*pulse)+")";ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y,7+pulse*3,0,Math.PI*2);ctx.stroke();}}
  for(const it of worldInteractives||[]){if(!it||it.kind!=="crystal"||it.hp<=0)continue;const p=minimapPoint(it.x,it.z);ctx.fillStyle="#7fffd4";ctx.fillRect(p.x-2,p.y-2,4,4);}
  if(G.boss&&G.boss.hp>0){const p=minimapPoint(G.boss.x,G.boss.z),active=baseObjectiveMet();minimapDiamond(ctx,p.x,p.y,7+pulse*2,active?"#ff315d":"#6e3948",active?"#ffd3dc":"#b68b96");ctx.font="bold 9px serif";ctx.textAlign="center";ctx.fillStyle=active?"#ffd3dc":"#ad9199";ctx.fillText(active?"BOSS":"封锁",p.x,p.y-11);}
  for(const f of (pressure&&pressure.fissures)||[]){const fp=minimapPoint(f.x,f.z);ctx.fillStyle="#ff315d";ctx.beginPath();ctx.moveTo(fp.x,fp.y-4);ctx.lineTo(fp.x+4,fp.y+4);ctx.lineTo(fp.x-4,fp.y+4);ctx.closePath();ctx.fill();}   // v32 仅裂隙
  /* v39 POI 标记：宝箱/信标/楼梯塔 */
  for(const it of worldInteractives||[]){
    if(!it||it.kind==="vent"||it.kind==="current"||it.kind==="crystal")continue;
    if(it.kind==="storyNode"&&it.seen)continue;
    const p2m=minimapPoint(it.x,it.z);
    if(it.kind==="chest"&&!it.opened){ctx.fillStyle="#ffd66b";ctx.fillRect(p2m.x-3,p2m.y-3,6,6);}
    else if(it.kind==="beacon"&&!it.lit){ctx.strokeStyle="#7fd0ff";ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(p2m.x,p2m.y,4,0,Math.PI*2);ctx.stroke();}
    else if(it.kind==="rift"&&!it.started){ctx.fillStyle="#ff5573";ctx.beginPath();ctx.moveTo(p2m.x,p2m.y-4);ctx.lineTo(p2m.x+4,p2m.y+3);ctx.lineTo(p2m.x-4,p2m.y+3);ctx.closePath();ctx.fill();}
  }
  for(const st of stairTowers||[]){const p2m=minimapPoint(st.pos.x,st.pos.z);ctx.strokeStyle="#7fffd4";ctx.lineWidth=1.5;ctx.strokeRect(p2m.x-3,p2m.y-3,6,6);}
  /* v39 POI 标记：宝箱/信标/楼梯塔 */
  for(const it of worldInteractives||[]){
    if(!it||it.kind==="vent"||it.kind==="current"||it.kind==="crystal")continue;
    if(it.kind==="storyNode"&&it.seen)continue;
    const p2m=minimapPoint(it.x,it.z);
    if(it.kind==="chest"&&!it.opened){ctx.fillStyle="#ffd66b";ctx.fillRect(p2m.x-3,p2m.y-3,6,6);}
    else if(it.kind==="beacon"&&!it.lit){ctx.strokeStyle="#7fd0ff";ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(p2m.x,p2m.y,4,0,Math.PI*2);ctx.stroke();}
    else if(it.kind==="rift"&&!it.started){ctx.fillStyle="#ff5573";ctx.beginPath();ctx.moveTo(p2m.x,p2m.y-4);ctx.lineTo(p2m.x+4,p2m.y+3);ctx.lineTo(p2m.x-4,p2m.y+3);ctx.closePath();ctx.fill();}
  }
  for(const st of stairTowers||[]){const p2m=minimapPoint(st.pos.x,st.pos.z);ctx.strokeStyle="#7fffd4";ctx.lineWidth=1.5;ctx.strokeRect(p2m.x-3,p2m.y-3,6,6);}
  const gp=gatePos(),g=minimapPoint(gp.x,gp.z),open=objectiveMet();ctx.lineWidth=2.4;ctx.strokeStyle=open?"#7fffd4":"#e0506a";ctx.beginPath();ctx.arc(g.x,g.y,7+pulse*1.8,0,Math.PI*2);ctx.stroke();ctx.lineWidth=1;ctx.beginPath();ctx.arc(g.x,g.y,3.2,0,Math.PI*2);ctx.stroke();
  const pp=minimapPoint(player.x,player.z);ctx.save();ctx.translate(pp.x,pp.y);ctx.rotate(-player.yaw);ctx.shadowColor="#7fffd4";ctx.shadowBlur=7;ctx.fillStyle="#e7fff8";ctx.strokeStyle="#174f4b";ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(0,-9);ctx.lineTo(6,7);ctx.lineTo(0,4);ctx.lineTo(-6,7);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
  ctx.restore();
}
function setMinimapExpanded(on){minimapExpanded=!!on;minimapWrap.classList.toggle("expanded",minimapExpanded);minimapToggle.textContent=minimapExpanded?"收起":(input&&input.isTouch?"点按放大":"展开 · M");minimapToggle.setAttribute("aria-expanded",String(minimapExpanded));drawMinimap(performance.now(),true);}
minimapToggle.addEventListener("click",e=>{e.stopPropagation();setMinimapExpanded(!minimapExpanded);});minimapEl.addEventListener("click",()=>setMinimapExpanded(!minimapExpanded));
window.addEventListener("keydown",e=>{if(e.code==="KeyM"&&!e.repeat&&!storyModalActive){e.preventDefault();setMinimapExpanded(!minimapExpanded);}});
/* ================= v27 王者荣耀式局内经济装备 =================
   金币来源：初始 200 · 击杀赏金 · 金币袋 · 证据 · 节点/波次奖励 · 被动收入 2.2/秒；
   装备库：B 键或触屏“店”按钮开关，6 槽位，购买立即生效，出售返还 60%。
   v27 移除：旧版三选一构筑（BUILD_POOL）与遗物系统（RELIC_POOL）。
   ============================================================ */
const EQUIP_SLOTS=6;
const EQUIPMENT=[
  {id:"dagger",name:"破潮匕首",cost:300,desc:"伤害 +8%",s:{dmg:.08}},
  {id:"shell",name:"陶质甲片",cost:280,desc:"生命上限 +12",s:{hp:12}},
  {id:"fins",name:"疾行蛙鞋",cost:260,desc:"移动速度 +8%",s:{mv:.08}},
  {id:"coil",name:"谐振线圈",cost:320,desc:"武器冷却 -8%",s:{cool:.08}},
  {id:"turbo",name:"涡轮弹头",cost:900,desc:"伤害 +16%",s:{dmg:.16}},
  {id:"hullplate",name:"复合潜航壳",cost:850,desc:"生命上限 +26",s:{hp:26}},
  {id:"leech",name:"嗜血贝",cost:950,desc:"被动 · 击杀回复 4 点生命",s:{heal:4}},
  {id:"lens",name:"声呐透镜",cost:1000,desc:"暴击率 +8%",s:{crit:.08}},
  {id:"ring",name:"贪婪指环",cost:800,desc:"被动 · 金币获取 +25%",s:{gold:.25}},
  {id:"echoCore",name:"回响核心",cost:700,desc:"回响半径 +1",s:{echo:1}},
  {id:"cap",name:"过载电容",cost:1100,desc:"神经超频持续 +35%",s:{od:.35}},
  {id:"spear",name:"髓能谐振矛",cost:2100,desc:"伤害 +24% · 冷却 -10%",s:{dmg:.24,cool:.10}},
  {id:"heavyarmor",name:"深渊重甲",cost:2000,desc:"生命上限 +55",s:{hp:55}},
  {id:"phase",name:"相位推进器",cost:1900,desc:"移速 +14% · 冲刺冷却 -25%",s:{mv:.14,dash:.25}},
  {id:"wedge",name:"破盾锥",cost:1600,desc:"韧性伤害 +30%（处决更快）",s:{poise:.3}},
  {id:"aegis",name:"护幕发生器",cost:1800,desc:"护幕持续 +35% · 冷却 -25%",s:{shD:.35,shC:.25}},
  {id:"desoEye",name:"荒凉之眼",cost:3600,desc:"伤害 +20% · 暴击 +12%",s:{dmg:.20,crit:.12}},
  {id:"proto",name:"建造者原型机",cost:4200,desc:"伤害 +15% · 冷却 -15% · 生命 +30 · 超频 +30%",s:{dmg:.15,cool:.15,hp:30,od:.3}},
  {id:"abyssDip",name:"深渊之浸",cost:3900,desc:"伤害 +12% · 移速 +10% · 击杀回复 6",s:{dmg:.12,mv:.10,heal:6}},
  {id:"splitMag",name:"分裂弹匣",cost:4800,desc:"弹道 +1：每次射击多射出一发（两侧扇展）",s:{multi:1},u:1},
  {id:"pierceHead",name:"贯穿弹头",cost:5200,desc:"子弹穿透 +2 名敌人，不因命中消失",s:{pierce:2},u:1},
  {id:"hunterBuoy",name:"狩猎浮标",cost:4500,desc:"子弹制导：自动转向 9 米内最近敌人",s:{home:1},u:1},
  {id:"yinYang",name:"阴阳弹匣",cost:5000,desc:"子弹变奏：隔发附带蚀元素，稳定触发元素反应",s:{elemAlt:1},u:1},
  {id:"shockHead",name:"震荡弹头",cost:5500,desc:"子弹命中后爆裂：2.6 米范围 60% 溅射",s:{blast:1},u:1},
  {id:"injTide",name:"注入器 · 潮",cost:5600,desc:"武器附魔：弹道附带潮元素（锈蚀/涌爆/凝冻/感电）",s:{elem:"tide"},u:1},
  {id:"injFrost",name:"注入器 · 霜",cost:5600,desc:"武器附魔：弹道附带霜元素（凝冻/碎晶）",s:{elem:"frost"},u:1},
  {id:"injVolto",name:"注入器 · 雷",cost:5600,desc:"武器附魔：弹道附带雷元素（感电/磁爆）",s:{elem:"volto"},u:1},
  {id:"injSonic",name:"注入器 · 声",cost:5600,desc:"武器附魔：弹道附带声元素，命中即扩散附着周身敌人",s:{elem:"sonic"},u:1},
  {id:"grindstone",name:"磨刃石",cost:450,desc:"伤害 +5% · 暴击 +3%（合成小件）",s:{dmg:.05,crit:.03}},
  {id:"hardplate",name:"硬壳片",cost:260,desc:"生命上限 +10（合成小件）",s:{hp:10}},
  {id:"lightfin",name:"轻量鳍尖",cost:240,desc:"移动速度 +5%（合成小件）",s:{mv:.05}},
  {id:"luckShell",name:"幸运贝壳",cost:350,desc:"金币获取 +10%（合成小件）",s:{gold:.1}},
  {id:"fang",name:"长牙",cost:700,desc:"伤害 +12%",s:{dmg:.12}},
  {id:"crystalFang",name:"淬晶长牙",cost:1500,desc:"伤害 +18% · 暴击 +5%",s:{dmg:.18,crit:.05}},
  {id:"thornCoat",name:"棘刺外套",cost:1300,desc:"生命 +18 · 韧性伤害 +15%",s:{hp:18,poise:.15}},
  {id:"swiftFins",name:"疾风双鳍",cost:1500,desc:"移速 +12% · 冲刺冷却 -30%",s:{mv:.12,dash:.3}}
];
function applyEquipStats(g){
  if(!g)return;
  const role=DIVER_ROLES[g.roleId]||DIVER_ROLES.explorer;
  let dmg=1,hp=0,mv=1,cool=1,crit=0,od=1,shD=1,shC=1,dash=1,echo=0,poise=1,heal=0,gold=1;
  let multi=0,pierce=0,home=0,blast=0,elemAlt=0,elemInj=null;
  for(const id of (g.equip||[])){
    const it=EQUIPMENT.find(x=>x.id===id);if(!it)continue;const s=it.s;
    dmg+=s.dmg||0;hp+=s.hp||0;mv+=s.mv||0;cool*=1-(s.cool||0);crit+=s.crit||0;od+=s.od||0;
    shD+=s.shD||0;shC*=1-(s.shC||0);dash*=1-(s.dash||0);echo+=s.echo||0;poise+=s.poise||0;heal+=s.heal||0;gold+=s.gold||0;
    multi+=s.multi||0;pierce+=s.pierce||0;home+=s.home||0;blast+=s.blast||0;elemAlt+=s.elemAlt||0;elemInj=s.elem||elemInj;
  }
  g.equipMulti=multi;g.equipPierce=pierce;g.equipHome=home;g.equipBlast=blast;g.equipElemAlt=elemAlt;g.equipElem=elemInj;
  /* v31 角色养成 + 遗章词条 */
  const ch=meta.characters?meta.characters[g.roleId]:null;
  const lv=ch?ch.level:1,brk=ch?ch.broken:0;
  const rq=meta.relicEquip||{};
  let hpPctR=0,dmgPctR=0,critR=0,coolR=0,moveR=0,goldR=0,critDmgR=0,shR=0,hpFlatR=0;
  for(const slot of RELIC_SLOTS){
    const rid2=rq[slot];if(!rid2)continue;
    const rel=(meta.relics||[]).find(r=>r.id===rid2);if(!rel)continue;
    for(const st of [rel.main].concat(rel.subs||[])){
      if(st.k==="hpPct")hpPctR+=st.v;else if(st.k==="dmgPct")dmgPctR+=st.v;else if(st.k==="crit")critR+=st.v;
      else if(st.k==="cool")coolR+=st.v;else if(st.k==="move")moveR+=st.v;else if(st.k==="gold")goldR+=st.v;
      else if(st.k==="critDmg")critDmgR+=st.v;else if(st.k==="shield")shR+=st.v;else if(st.k==="hp")hpFlatR+=st.v;
    }
  }
  g.damageMul=role.damageMul*dmg;
  g.maxHp=Math.max(20,Math.round((role.maxHp+(storyRun.order||0)*4+(meta.upgrades.hull||0)*5)+hp));
  g.moveMul=role.moveMul*mv;g.weaponCoolMul=role.weaponCoolMul*cool;
  g.critBonus=(g.critBase!==undefined?g.critBase:.12)+crit;
  g.overdriveDurationMul=role.overdriveDurationMul*od;
  g.shieldDurationMul=role.shieldDurationMul*shD;g.shieldCoolMul=role.shieldCoolMul*shC;
  g.dashCoolMul=role.dashCoolMul*dash;g.echoBonus=echo;g.poiseMul=poise;g.killHealEquip=heal;g.goldMul=gold;
  /* v31 养成 + 遗章词条（v32 修正：置于基础赋值之后，否则被覆盖） */
  g.maxHp=Math.round(g.maxHp*(1+hpPctR/100))+(lv-1)*2+brk*40+hpFlatR;
  g.damageMul=g.damageMul*(1+dmgPctR/100)+(lv-1)*.006+brk*.06;
  g.critBonus+=critR/100;g.weaponCoolMul*=1-Math.min(.6,coolR/100);
  g.moveMul*=1+moveR/100;g.goldMul*=1+goldR/100;g.critDmg=critDmgR/100;g.shieldDurationMul+=shR/100;
  /* v41 遗章套装：同稀有度 3/5 件触发 */
const rarCount={0:0,1:0,2:0};
  for(const slot of RELIC_SLOTS){const rid3=rq[slot];if(!rid3)continue;const rr3=(meta.relics||[]).find(r=>r.id===rid3);if(rr3)rarCount[rr3.rarity]++;}
  if(rarCount[2]>=3){g.damageMul*=1.08;}
  if(rarCount[2]>=5){g.weaponCoolMul*=.8;}
  if(rarCount[1]>=3){g.killHealEquip=(g.killHealEquip||0)+3;}
  if(rarCount[1]>=5){g.moveMul*=1.1;}   // v41 套装效果
  /* v41 遗章套装：同稀有度 3/5 件触发 */
  }   // v41 套装效果
}
function grantGold(n,why){if(!G)return;const dm=(G_diffMul&&G_diffMul.gold)||1;const g2=Math.round(n*((G.goldMul||1))*dm);G.gold=(G.gold||0)+g2;G.goldEarned=(G.goldEarned||0)+g2;toast((why?why+" · ":"")+"金币 +"+g2);renderRunBuildStrip();}
function freshRunBuild(){return {kills:0,events:{},routeRewardClaimed:false,routeElitePending:false,pending:false,sigBuildUsed:false,rare:0,killHeal:0,comboWindow:4.8,comboScore:1,streak:0,streakTimer:0,secondWind:false,damageTaken:1,thornBreak:0,thornSpeed:1,thornPoise:0,thornTwin:false,echoDash:false,execAmmo:0,breakFrenzy:0,comboShield:false,sonarMark:0,lootMagnet:0,lowOxyRage:0,lowHpRage:0,sonarSpread:false,sonarPierce:0,echoField:false,echoRadius:1,echoKnock:1,dashShock:false,shieldPulse:false,overdriveKill:0,closeDamage:0,bossDamage:0,crystalDividend:false,pressureAnchor:false};}
runBuild=freshRunBuild();   // 赋值到逻辑脚本声明的全局 var（跨 <script> 桥接，见逻辑区注释）
function resetRunBuild(){runBuild=freshRunBuild();renderRunBuildStrip();}
function applyRunBuildToG(refill){if(!G)return;applyEquipStats(G);if(refill){G.hp=G.maxHp;}else{G.hp=Math.min(G.maxHp,G.hp);}}
function renderRunBuildStrip(){const el=document.getElementById("runBuildStrip");if(!el)return;const eq=(G&&G.equip)||[];const names=eq.map(id=>{const it=EQUIPMENT.find(x=>x.id===id);return it?it.name:id;});el.innerHTML="<b>金币 "+Math.floor((G&&G.gold)||0)+"</b> · 装备 "+eq.length+"/"+EQUIP_SLOTS+(names.length?" · "+names.join(" · "):" · 按 B 打开装备库");}

/* v28：装备配图（程序化 SVG data URI，离线可用） */
const EQ_ICON={
  dagger:["#0d2b33","#5fe0b0","<path d='M16 3 L20 14 L16 29 L12 14 Z'/>"],
  shell:["#0d2b33","#5fe0b0","<path d='M16 4 L27 9 V17 Q27 26 16 29 Q5 26 5 17 V9 Z'/>"],
  fins:["#0d2b33","#5fe0b0","<path d='M5 24 Q9 8 27 5 Q22 13 24 21 Q15 17 5 27 Z'/>"],
  coil:["#0d2b33","#5fe0b0","<circle cx='16' cy='16' r='9' fill='none' stroke='#5fe0b0' stroke-width='2.4'/><circle cx='16' cy='16' r='4' fill='none' stroke='#5fe0b0' stroke-width='2'/>"],
  turbo:["#12233d","#6fa8ff","<path d='M12 4 h8 v11 l-4 13 -4 -13 Z'/>"],
  hullplate:["#12233d","#6fa8ff","<path d='M16 4 L26 10 V22 L16 28 L6 22 V10 Z'/>"],
  leech:["#12233d","#6fa8ff","<path d='M16 4 Q25 15 16 28 Q7 15 16 4 Z'/><circle cx='16' cy='15' r='3' fill='#0a1526'/>"],
  lens:["#12233d","#6fa8ff","<circle cx='16' cy='16' r='8' fill='none' stroke='#6fa8ff' stroke-width='2.4'/><path d='M16 4 V11 M16 21 V28 M4 16 H11 M21 16 H28' stroke='#6fa8ff' stroke-width='2'/>"],
  ring:["#12233d","#6fa8ff","<circle cx='16' cy='16' r='9' fill='none' stroke='#6fa8ff' stroke-width='4'/>"],
  echoCore:["#12233d","#6fa8ff","<circle cx='16' cy='16' r='4' fill='#6fa8ff'/><circle cx='16' cy='16' r='8' fill='none' stroke='#6fa8ff' stroke-opacity='.6' stroke-width='1.6'/><circle cx='16' cy='16' r='12' fill='none' stroke='#6fa8ff' stroke-opacity='.3' stroke-width='1.2'/>"],
  cap:["#12233d","#6fa8ff","<path d='M18 3 L9 18 h6 L14 29 L24 13 h-7 Z'/>"],
  spear:["#2b1a10","#ffb66d","<path d='M4 28 L22 10 L27 5 L25 12 L8 30 Z'/><path d='M22 10 L27 5 L20 8 Z'/>"],
  heavyarmor:["#2b1a10","#ffb66d","<path d='M16 4 L27 9 V17 Q27 26 16 29 Q5 26 5 17 V9 Z'/><path d='M10 14 h12' stroke='#2b1a10' stroke-width='2'/>"],
  phase:["#2b1a10","#ffb66d","<path d='M14 6 L6 16 L14 26' fill='none' stroke='#ffb66d' stroke-width='3'/><path d='M23 6 L15 16 L23 26' fill='none' stroke='#ffb66d' stroke-width='3'/>"],
  wedge:["#2b1a10","#ffb66d","<path d='M16 4 L25 26 L7 26 Z'/><path d='M10 20 h12' stroke='#2b1a10' stroke-width='2'/>"],
  aegis:["#2b1a10","#ffb66d","<path d='M6 20 A10 10 0 0 1 26 20 Z'/><path d='M4 23 h24' stroke='#ffb66d' stroke-width='2.4'/>"],
  desoEye:["#2a0f1a","#ff617f","<path d='M4 16 Q16 5 28 16 Q16 27 4 16 Z'/><circle cx='16' cy='16' r='4' fill='#2a0f1a' stroke='#ff617f' stroke-width='2'/>"],
  proto:["#2a0f1a","#ff617f","<path d='M16 4 L26 10 V22 L16 28 L6 22 V10 Z' fill='none' stroke='#ff617f' stroke-width='2.4'/><circle cx='16' cy='16' r='4' fill='#ff617f'/>"],
  abyssDip:["#2a0f1a","#ff617f","<path d='M4 12 Q10 6 16 12 T28 12' fill='none' stroke='#ff617f' stroke-width='2.4'/><path d='M4 20 Q10 14 16 20 T28 20' fill='none' stroke='#ff617f' stroke-opacity='.6' stroke-width='2.4'/>"],
  splitMag:["#241333","#b48cff","<path d='M11 4 h6 v11 l-3 13 -3 -13 Z'/><path d='M20 8 h5 v8 l-2.5 10 L20 16 Z'/>"],
  pierceHead:["#241333","#b48cff","<path d='M4 14 h16 V8 l8 8 -8 8 v-6 H4 Z'/>"],
  hunterBuoy:["#241333","#b48cff","<circle cx='16' cy='19' r='7' fill='none' stroke='#b48cff' stroke-width='2.6'/><path d='M16 12 V4 M12 6 L16 3 L20 6' fill='none' stroke='#b48cff' stroke-width='2'/>"],
  yinYang:["#241333","#b48cff","<circle cx='16' cy='16' r='11' fill='none' stroke='#b48cff' stroke-width='2.4'/><path d='M16 5 a11 11 0 0 1 0 22 a5.5 5.5 0 0 1 0 -11 a5.5 5.5 0 0 0 0 -11 Z'/>"],
  shockHead:["#241333","#b48cff","<path d='M16 3 L19 12 L28 10 L21 17 L27 25 L17 21 L16 29 L15 21 L5 25 L11 17 L4 10 L13 12 Z'/>"]
};
function eqIconSrc(id){const e=EQ_ICON[id]||["#122333","#5fe0b0","<circle cx='16' cy='16' r='8' fill='#5fe0b0'/>"];
  return "data:image/svg+xml,"+encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='7' fill='"+e[0]+"'/><rect x='.5' y='.5' width='31' height='31' rx='6.5' fill='none' stroke='"+e[1]+"' stroke-opacity='.5'/><g>"+e[2]+"</g></svg>");}

/* ===== v31 养成系统：角色等级/突破/天赋 + 髓能结晶 ===== */
function charState(roleId){
  meta.characters=meta.characters||{};
  if(!meta.characters[roleId])meta.characters[roleId]={level:1,exp:0,broken:0,talents:[1,1,1]};
  return meta.characters[roleId];
}
function charExpNeed(level){return 60+level*30;}
function gainCharExp(n){
  if(!G)return;
  const ch=charState(G.roleId);
  ch.exp+=n;
  let up=false;
  while(ch.exp>=charExpNeed(ch.level)&&ch.level<ch.broken*20+20){ch.exp-=charExpNeed(ch.level);ch.level++;up=true;}
  if(ch.level>=ch.broken*20+20)ch.exp=Math.min(ch.exp,charExpNeed(ch.level)-1);
  if(up){toast("角色升级 · "+((DIVER_ROLES[G.roleId]||DIVER_ROLES.explorer).shortName||"")+" Lv"+ch.level);if(ch.level%20===0)toast("已达突破等级 · 主页-养成可突破");saveMeta();}
}
function grantCrystal(n,why){meta.crystals=(meta.crystals||0)+n;saveMeta();if(why)toast("髓能结晶 +"+n+" · "+why);}
function charBreakthrough(){
  const ch=charState(runSelection.roleId);
  if(ch.broken>=2){toast("已达最高突破");return;}
  if(ch.level<ch.broken*20+20){toast("需先升到 Lv"+(ch.broken*20+20));return;}
  const cost=[40,100,200][ch.broken]||200;
  if((meta.crystals||0)<cost){toast("结晶不足 · 需要 "+cost);return;}
  meta.crystals-=cost;ch.broken++;saveMeta();
  toast("突破成功 · 等级上限提升至 "+(ch.broken*20+20));renderGrowTab();
}
function talentUp(slot){
  const ch=charState(runSelection.roleId);
  if(ch.talents[slot]>=5){toast("天赋已满级");return;}
  const cost=12*ch.talents[slot];
  if((meta.crystals||0)<cost){toast("结晶不足 · 需要 "+cost);return;}
  meta.crystals-=cost;ch.talents[slot]++;saveMeta();
  toast("天赋强化 · Lv"+ch.talents[slot]);renderGrowTab();
}
/* ===== v31 深潜遗章：5 槽圣遗物（主词条 + 4 随机副词条） ===== */
const RELIC_SLOTS=["suit","fin","lens","core","emblem"];
const RELIC_SLOT_NAMES={suit:"潜服",fin:"鳍片",lens:"镜片",core:"核心",emblem:"舱徽"};
const RELIC_MAIN={suit:{k:"hpPct",v:[8,12,16]},fin:{k:"dmgPct",v:[6,9,12]},lens:{k:"crit",v:[5,8,12]},core:{k:"cool",v:[6,9,12]},emblem:{k:"gold",v:[10,16,22]}};
const RELIC_SUB_POOL=[{k:"hp",n:"生命",v:[15,30,50]},{k:"dmgPct",n:"伤害",v:[2,3.5,5]},{k:"crit",n:"暴击",v:[1.5,2.5,4]},{k:"critDmg",n:"暴伤",v:[5,9,14]},{k:"cool",n:"冷却",v:[1.5,2.5,4]},{k:"move",n:"移速",v:[1.5,2.5,4]},{k:"gold",n:"金币",v:[3,6,9]},{k:"shield",n:"护幕",v:[3,6,10]}];
const RELIC_RARITY=[{name:"普通",color:"#6fa8ff",crystal:4},{name:"稀有",color:"#b48cff",crystal:10},{name:"史诗",color:"#ffd66b",crystal:20}];
function rollRelic(bonus){
  const slot=RELIC_SLOTS[(Math.random()*5)|0];
  const roll=Math.random()*100-(bonus||0);
  const rarity=roll<12?2:roll<44?1:0;
  const main=RELIC_MAIN[slot];
  const subs=[];const pool=RELIC_SUB_POOL.slice();
  for(let i=0;i<4;i++){const p2=pool.splice((Math.random()*pool.length)|0,1)[0];subs.push({k:p2.k,n:p2.n,v:+(p2.v[rarity]*(0.75+Math.random()*.5)).toFixed(1)});}
  const rel={id:"r"+Date.now()+"_"+((Math.random()*1e5)|0),slot,rarity,main:{k:main.k,v:main.v[rarity]},subs};
  meta.relics=meta.relics||[];
  if(meta.relics.length>=60)meta.relics.shift();
  meta.relics.push(rel);saveMeta();
  return rel;
}
let wellRun=null;
function startWell(){
  if(G&&G.state===S.PLAYING)return;
  wellRun={wave:0,stars:0,waveStart:0};
  try{initAudio();}catch(e2){}
  startGame();
  toast("回响深井 · 12 层限时挑战");
}
/* ===== v37 装备分类与合成（王者荣耀式：小件抵扣差价合成大件） ===== */
const EQUIP_CATS=[["all","全部","#+8fa7a1"],["atk","攻击","#ff8a72"],["def","防御","#6fa8ff"],["mov","移动","#63e8cf"],["util","功能","#d9c08a"],["spc","特殊","#b48cff"]];
const EQUIP_CAT={dagger:"atk",grindstone:"atk",fang:"atk",crystalFang:"atk",turbo:"atk",spear:"atk",lens:"atk",desoEye:"atk",wedge:"atk",
  shell:"def",hardplate:"def",hullplate:"def",heavyarmor:"def",thornCoat:"def",aegis:"def",abyssDip:"def",
  fins:"mov",lightfin:"mov",phase:"mov",swiftFins:"mov",
  coil:"util",cap:"util",leech:"util",ring:"util",luckShell:"util",echoCore:"util",
  splitMag:"spc",pierceHead:"spc",hunterBuoy:"spc",yinYang:"spc",shockHead:"spc",injTide:"spc",injFrost:"spc",injVolto:"spc",injSonic:"spc",proto:"util"};
const EQUIP_FROM={turbo:["dagger","grindstone"],hullplate:["shell","hardplate"],phase:["fins","lightfin"],ring:["luckShell"],
  spear:["turbo","grindstone"],heavyarmor:["hullplate","hardplate"],crystalFang:["fang","grindstone"],thornCoat:["shell","hardplate"],
  swiftFins:["fins","lightfin"],desoEye:["turbo","lens"],proto:["cap","hullplate"],abyssDip:["leech","fins"],aegis:["coil","shell"]};
const REC_BUILDS={
  explorer:{name:"浣生 · 远程狙击流",ids:["spear","lens","desoEye","pierceHead","aegis","hullplate"]},
  guardian:{name:"迈尔辛 · 重装破盾流",ids:["heavyarmor","wedge","leech","phase","aegis","desoEye"]},
  hunter:{name:"帕米尔 · 弹幕覆盖流",ids:["splitMag","shockHead","spear","heavyarmor","cap","desoEye"]}
};
let shopCat="all";
function equipFromOwned(it){   // 已持有的合成小件（索引列表）
  const out=[];
  for(const fid of (EQUIP_FROM[it.id]||[])){
    const idx=(G.equip||[]).indexOf(fid);
    if(idx>=0){const comp=EQUIPMENT.find(x=>x.id===fid);out.push({idx:idx,id:fid,cost:comp?comp.cost:0});}
  }
  return out;
}

/* ===== v40 WiFi 联机（WebSocket 房间联机） ===== */
let netWs=null,netConnected=false,netRoom="";
let remotePlayer=null;
function netConnect(room){
  const proto=location.protocol==="https:"?"wss:":"ws:";
  try{
    netWs=new WebSocket(proto+"//"+location.host+"/ws");
    netWs.onopen=()=>{netConnected=true;netRoom=room;netWs.send(JSON.stringify({t:"join",room:room}));toast("已连接房间 "+room);};
    netWs.onmessage=(ev)=>{try{
      const msg=JSON.parse(ev.data);
      if(msg.t==="joined"){netRoom=msg.room;toast("已加入房间 "+msg.room);}
      if(msg.t==="state"&&msg.idx!==undefined){
        if(!remotePlayer)remotePlayer={x:0,z:0,y:1.7,yaw:0,mesh:null,hp:100,role:"guardian"};
        remotePlayer.x=msg.x;remotePlayer.z=msg.z;remotePlayer.y=msg.y||1.7;remotePlayer.yaw=msg.yaw||0;
      }
      if(msg.t==="dmg"&&msg.mi!==undefined&&G&&G.monsters[msg.mi]&&G.monsters[msg.mi].hp>0){
        G.monsters[msg.mi].hp-=msg.dmg;
        if(G.monsters[msg.mi].hp<=0){G.kills=(G.kills||0)+1;noteKill(G.monsters[msg.mi]);}
      }
      if(msg.t==="kill"&&msg.mi!==undefined&&G&&G.monsters[msg.mi]&&G.monsters[msg.mi].hp>0){
        G.monsters[msg.mi].hp=0;G.kills=(G.kills||0)+1;noteKill(G.monsters[msg.mi]);
      }
    }catch(e){}};
    netWs.onclose=()=>{netConnected=false;toast("联机已断开");};
    netWs.onerror=()=>{toast("联机连接失败");};
  }catch(e){toast("联机连接失败");}
}
function netSendState(){
  if(!netConnected||!netWs||netWs.readyState!==1)return;
  netWs.send(JSON.stringify({t:"state",x:Math.round(player.x*10)/10,z:Math.round(player.z*10)/10,y:Math.round(player.y*10)/10,yaw:Math.round(player.yaw*100)/100,hp:G?Math.round(G.hp):0}));
}
let shopGridEl=null;
/* merged */
function toggleEquipShop(){
  const ov=document.getElementById("buildOverlay");if(!ov)return;
  if(!ov.classList.contains("hidden")){closeNodePanel();return;}
  if(!G||G.state!==S.PLAYING){toast("当前无法打开装备库");return;}
  openNodePanel("深海装备库","",renderShopGrid);
}
function renderShopGrid(grid){
  shopGridEl=grid;grid.innerHTML="";
  const load=document.createElement("div");load.style.gridColumn="1/-1";load.style.display="grid";load.style.gridTemplateColumns="repeat(6,minmax(0,1fr))";load.style.gap="6px";
  for(let i=0;i<EQUIP_SLOTS;i++){
    const id=(G.equip||[])[i],it=id?EQUIPMENT.find(x=>x.id===id):null;
    const slot=document.createElement("button");slot.type="button";slot.className="build-option";slot.style.minHeight="58px";slot.style.padding="8px";
    if(it){slot.innerHTML="<img class='eqicon' alt=''><b></b><em></em>";slot.querySelector("img").src=eqIconSrc(it.id);slot.querySelector("b").textContent=it.name;slot.querySelector("em").textContent="出售 +"+Math.round(it.cost*.6)+" 金币";slot.addEventListener("click",()=>sellEquip(i));}
    else{slot.innerHTML="<b style='color:#5e736c'>空槽</b><em>第 "+(i+1)+" 格</em>";slot.disabled=true;}
    load.appendChild(slot);
  }
  grid.appendChild(load);
  /* 分类筛选（王者荣耀式品类页签） */
  const catRow=document.createElement("div");catRow.style.gridColumn="1/-1";catRow.style.display="flex";catRow.style.gap="5px";catRow.style.margin="2px 0 4px";
  for(const ck of EQUIP_CATS){
    const cb=document.createElement("button");cb.type="button";cb.className="shop-cat"+(shopCat===ck[0]?" on":"");
    cb.textContent=ck[1];cb.style.borderColor=ck[2];
    cb.addEventListener("click",()=>{shopCat=ck[0];renderShopGrid(shopGridEl);});
    catRow.appendChild(cb);
  }
  grid.appendChild(catRow);
  /* 推荐出装条（按当前角色） */
  const rec=REC_BUILDS[G.roleId]||REC_BUILDS.explorer;
  const recRow=document.createElement("div");recRow.style.gridColumn="1/-1";recRow.style.display="flex";recRow.style.alignItems="center";recRow.style.gap="6px";recRow.style.padding="6px 8px";recRow.style.border="1px solid rgba(217,192,138,.35)";recRow.style.borderRadius="9px";recRow.style.background="rgba(25,20,9,.55)";
  const recLab=document.createElement("span");recLab.style.color="#d9c08a";recLab.style.fontSize="10px";recLab.style.whiteSpace="nowrap";recLab.textContent="推荐出装 · "+rec.name;
  recRow.appendChild(recLab);
  for(const rid2 of rec.ids){
    const rit=EQUIPMENT.find(x=>x.id===rid2);
    if(!rit)continue;
    const ib=document.createElement("img");ib.src=eqIconSrc(rit.id);ib.title=rit.name+" · "+rit.cost+" 金币";ib.style.width="30px";ib.style.height="30px";ib.style.borderRadius="7px";ib.style.cursor="pointer";
    ib.addEventListener("click",()=>buyEquip(rit));
    recRow.appendChild(ib);
  }
  grid.appendChild(recRow);
  const list=EQUIPMENT.filter(it=>shopCat==="all"||EQUIP_CAT[it.id]===shopCat).sort((a,b)=>a.cost-b.cost);
  for(const it of list){
    const owned=(G.equip||[]).filter(x=>x===it.id).length;
    const comps=equipFromOwned(it);
    let credit=0;for(const c of comps)credit+=c.cost;
    const pay=Math.max(0,it.cost-credit);
    const b=document.createElement("button");b.type="button";b.className="build-option";
    const noRoom=(G.equip||[]).length>=EQUIP_SLOTS&&!comps.length;
    if((G.gold||0)<pay||noRoom)b.style.opacity=".45";
    b.innerHTML="<img class='eqicon' alt=''><b></b><em></em><small></small>";
    b.querySelector("img").src=eqIconSrc(it.id);
    b.querySelector("b").textContent=(EQUIP_FROM[it.id]?"⚙ ":"")+(REC_BUILDS[G.roleId]&&REC_BUILDS[G.roleId].ids.indexOf(it.id)>=0?"★ ":"")+it.name;
    b.querySelector("em").textContent=it.cost+" 金币"+(owned?" · 已持"+owned:"")+(credit>0?" · 合成差价 "+pay:"");
    b.querySelector("small").textContent=it.desc;
    b.addEventListener("click",()=>buyEquip(it));
    grid.appendChild(b);
  }
  const fromHint=(G.equip||[]).length?(" · 持有小件自动抵扣合成差价"):"";
  document.getElementById("buildSub").textContent="金币 "+Math.floor(G.gold||0)+" · 装备 "+((G.equip||[]).length)+"/"+EQUIP_SLOTS+" · 出售返还 60%"+fromHint;
}
function buyEquip(it){
  if(!G||!it)return;
  if((G.equip||[]).length>=EQUIP_SLOTS){toast("装备栏已满 · 请先出售");return;}
  if(it.u&&(G.equip||[]).indexOf(it.id)>=0){toast("唯一装备 · 已持有");return;}
  /* v37 合成：已持有的路线小件折价抵扣，购买时被消耗（合成进大件） */
  const comps=equipFromOwned(it);
  let credit=0;for(const c of comps)credit+=c.cost;
  const pay=Math.max(0,it.cost-credit);
  if((G.gold||0)<pay){toast("金币不足 · 还差 "+Math.ceil(pay-(G.gold||0))+(credit?"（已抵扣 "+credit+"）":""));return;}
  for(const c of comps){const idx=(G.equip||[]).indexOf(c.id);if(idx>=0)G.equip.splice(idx,1);}
  G.gold-=pay;G.equip.push(it.id);applyEquipStats(G);G.hp=Math.min(G.maxHp,G.hp);
  sound("pickup");
  toast(comps.length?("合成 · "+it.name+"（小件抵扣 "+credit+"）"):"已装备 · "+it.name);
  renderShopGrid(shopGridEl||document.getElementById("buildChoices"));
}
function sellEquip(slot){if(!G)return;const id=(G.equip||[])[slot];const it=EQUIPMENT.find(x=>x.id===id);if(!it)return;G.equip.splice(slot,1);const refund=Math.round(it.cost*.6);G.gold=(G.gold||0)+refund;applyEquipStats(G);G.hp=Math.min(G.maxHp,G.hp);toast("已出售 · "+it.name+"　金币 +"+refund);renderShopGrid(shopGridEl||document.getElementById("buildChoices"));}

function applyRunProfile(g){
  const mode=RUN_MODES[runSelection.modeId]||RUN_MODES.expedition,role=DIVER_ROLES[runSelection.roleId]||DIVER_ROLES.explorer;
  g.modeId=(wellRun?"endless":runSelection.modeId);g.roleId=runSelection.roleId;g.runStartLevel=runSelection.level;   // v31 深井=无尽规则
  if(g.gold===undefined){g.gold=200;g.goldEarned=0;g.equip=[];}
  g.critBase=.12;
  g.weapon=ROLE_WEAPON[g.roleId]||1;g.cool=g.cool||{};g.cool[4]=0;g.skillCd=[0,0,0];g.adrenalineT=0;g.phaseT=0;   // v28 角色专属武器
  g.maxHp=Math.max(20,Math.round(role.maxHp+(storyRun.order||0)*4+(meta.upgrades.hull||0)*5));g.hp=g.maxHp;
  g.dashCoolMul=role.dashCoolMul;g.overdriveDurationMul=role.overdriveDurationMul;
  g.scoreMul=mode.scoreMul;
  if(g.boss&&mode.bossHpMul!==1){g.boss.maxHp=Math.max(1,Math.ceil(g.boss.maxHp*mode.bossHpMul));g.boss.hp=g.boss.maxHp;}
  if(g.modeId==="bossRush")g.monsters=[];
  applyEquipStats(g);   // v27 装备数值结算
  return g;
}
function createConfiguredLevel(idx,carry,resetModeBoost){
  const mode=RUN_MODES[runSelection.modeId]||RUN_MODES.campaign;if(runSelection.modeId==="campaign")setMonsterBoost(idx<6?1:(idx<14?2:3));else if(resetModeBoost)setMonsterBoost(mode.boost);
  /* v39 难度系数 */
  const diffMul={easy:{hp:.7,dmg:.7,gold:.8},normal:{hp:1,dmg:1,gold:1},hard:{hp:1.3,dmg:1.3,gold:1.3}}[meta.difficulty||"normal"]||{hp:1,dmg:1,gold:1};
  G_diffMul=diffMul;
  /* v39 难度系数 */
  
  const g=applyRunProfile(startLevel(idx,carry));
  const ngMul=1+(meta.ngPlus||0)*.5;
  if(ngMul>1){for(const m of (g.monsters||[])){m.hp=Math.ceil(m.hp*ngMul);m.maxHp=m.hp;}}
  if(G_diffMul&&G_diffMul.hp!==1){for(const m of (g.monsters||[])){m.hp=Math.ceil(m.hp*G_diffMul.hp);m.maxHp=m.hp;}if(g.boss){g.boss.maxHp=Math.ceil(g.boss.maxHp*G_diffMul.hp);g.boss.hp=g.boss.maxHp;}}   // v39 难度
  if(g.modeId==="campaign"&&g.boss){const mul=1+Math.floor(idx/4)*.16;g.boss.maxHp=Math.ceil(g.boss.maxHp*mul);g.boss.hp=g.boss.maxHp;
  const se=SHIELD_ELEMS[(g.level||1)%SHIELD_ELEMS.length];const shp=Math.ceil(g.boss.maxHp*.3);g.boss.eshield={elem:se,hp:shp,max:shp};}   // v30 巨兽元素盾
return g;
}
let levelIntroTimer=0;
function showLevelIntro(lv){
  const el=document.getElementById("levelIntro"),mode=selectedMode(),role=selectedRole();
  document.getElementById("levelIntroTitle").textContent=G.modeId==="endless"?"无尽深渊 · 第 1 波":(G.modeId==="campaign"?("第 "+String(lv.id).padStart(2,"0")+" 关 · "+lv.name):("L"+lv.id+" · "+lv.name));
document.getElementById("levelIntroSub").textContent=(G.modeId==="endless"?"清场即得金币奖励 · 每五波巨兽里程碑":"战术节点已解锁 · "+(lv.beat||""))+" · "+mode.name+" · "+role.name;
  el.classList.add("show");clearTimeout(levelIntroTimer);levelIntroTimer=setTimeout(()=>el.classList.remove("show"),2300);
}
function updateRunBadge(){const m=selectedMode(),r=selectedRole();document.getElementById("runBadge").textContent=m.short+" · "+(r.shortName||r.name);}
/* ============================================================
   v24.5 杀戮尖塔式节点规则：航路图节点类型决定该层的进入玩法
   ◆ 巨兽巢舱：本层强制刷新本章巨兽守卫
   ✦ 精英舱：敌群强化 1.6×，清空目标赏金币 +300
   ？ 事件舱：进入时弹出双选事件（NODE_EVENTS）
   ◈ 星际商栈：进入时开放船币商店
   ============================================================ */
const NODE_EVENTS=[
  {title:"失压货舱",desc:"一具密封货柜卡在船肋之间，表面凝着盐霜。",options:[
    {label:"强行切开",desc:"金币 +220，损失 20% 生命",apply:()=>{G.hp=Math.max(1,G.hp-Math.ceil((G.maxHp||HP_MAX)*.2));grantGold(220,"货舱补给");}},
    {label:"绕道离开",desc:"生命 +12",apply:()=>{G.hp=Math.min(G.maxHp||HP_MAX,G.hp+12);}}]},
  {title:"雷莫拉拾荒队",desc:"几名雷莫拉工人正在拆一段旧船壳，朝你举起了交易板。",options:[
    {label:"以物易物",desc:"花 20 船币换金币袋",apply:()=>{if(meta.currency>=20){meta.currency-=20;saveMeta();grantGold(320,"易得金币");}else toast("船币不足 · 拾荒者耸耸肩");}},
    {label:"帮忙拆解",desc:"生命 -10，船币 +25",apply:()=>{G.hp=Math.max(1,G.hp-10);grantCurrency(25,"拆解工钱");}}]},
  {title:"培植舱泄漏",desc:"营养液在舱底积成一片发光浅滩，鱼群异常肥硕。",options:[
    {label:"收集营养液",desc:"金币 +150，恢复 12 生命",apply:()=>{grantGold(150,"营养液变卖");G.hp=Math.min(G.maxHp||HP_MAX,G.hp+12);}},
    {label:"放生鱼群",desc:"声望 +60",apply:()=>{G.score+=60;}}]},
  {title:"休眠的维护体",desc:"一台灰手蜷在检修舱里，核心灯以缓慢的频率明灭。",options:[
    {label:"取走核心",desc:"船币 +30，惊醒两只维护体",apply:()=>{grantCurrency(30,"核心回收");for(let i2=0;i2<2;i2++){const m=G.monsters.find(x=>x.hp<=0);if(m){m.hp=m.maxHp;m.x=player.x+(Math.random()-.5)*8;m.z=player.z+(Math.random()-.5)*8;}}}},
    {label:"悄悄绕开",desc:"无事发生",apply:()=>{}}]},
  {title:"舰体记忆渗漏",desc:"一滩记忆导管冷凝物在地面投下模糊的旧影。",options:[
    {label:"读取记忆",desc:"声望 +80，导管液腐蚀：生命 -8",apply:()=>{G.score+=80;G.hp=Math.max(1,G.hp-8);}},
    {label:"采集导管液",desc:"弹药 +4，生命 -8",apply:()=>{G.ammo=Math.min(AMMO_MAX,(G.ammo||0)+4);G.hp=Math.max(1,G.hp-8);}}]},
  {title:"潮汐搁浅者",desc:"一只发光的浅海生物搁浅在船肋上，正在缓慢失去光泽。",options:[
    {label:"推回深水",desc:"声望 +50，船币 +10",apply:()=>{G.score+=50;grantCurrency(10,"善行酬谢");}},
    {label:"采集发光组织",desc:"船币 +30，声望 -0（它似乎并不介意）",apply:()=>{grantCurrency(30,"发光组织");}}]},
  {title:"幽灵信标",desc:"一枚仍在发报的旧信标在噪声里循环同一组坐标。",options:[
    {label:"解码坐标",desc:"出售情报：金币 +280",apply:()=>{grantGold(280,"情报赏金");}},
    {label:"拆解信标",desc:"船币 +18",apply:()=>{grantCurrency(18,"信标拆解");}}]},
  {title:"镜像裂缝",desc:"裂缝里的倒影比你慢半拍，它挥手的姿势充满挑衅。",options:[
    {label:"伸手接触",desc:"金币 +250，损失 10% 生命",apply:()=>{G.hp=Math.max(1,G.hp-Math.ceil((G.maxHp||HP_MAX)*.1));grantGold(250,"镜像馈赠");}},
    {label:"关闭裂缝",desc:"立即获得 2.5 秒护幕",apply:()=>{G.shield=Math.max(G.shield||0,2.5*(G.shieldDurationMul||1));}}]},
  {title:"深渊钓线",desc:"一根不知通向何处的钓线从上方的黑暗里垂下来，还在轻轻抖动。",options:[
    {label:"收杆",desc:"生命 +10，并立即获得 2 秒护幕",apply:()=>{G.hp=Math.min(G.maxHp||HP_MAX,G.hp+10);G.shield=Math.max(G.shield||0,2*(G.shieldDurationMul||1));}},
    {label:"剪线取钩",desc:"船币 +15",apply:()=>{grantCurrency(15,"剪线取钩");}}]},
  {title:"星髓潮涌",desc:"地板缝隙里渗出微光的潮汐，脉搏与你的心跳逐渐同步。",options:[
    {label:"汲取潮涌",desc:"金币 +180，生命 -6",apply:()=>{G.hp=Math.max(1,G.hp-6);grantGold(180,"潮涌结晶");}},
    {label:"沐浴潮光",desc:"生命 +15",apply:()=>{G.hp=Math.min(G.maxHp||HP_MAX,G.hp+15);}}]}
];
const MERCHANT_WARES=[
  {name:"应急修复凝胶",desc:"生命 +30",cost:15,apply:()=>{G.hp=Math.min(G.maxHp||HP_MAX,G.hp+30);}},
  {name:"渊棘弹药补给",desc:"弹药补满",cost:12,apply:()=>{G.ammo=AMMO_MAX;}},
  {name:"深渊金币袋",desc:"金币 +320",cost:40,apply:()=>{grantGold(320,"商栈汇兑");}},
  {name:"打捞情报",desc:"金币 +280",cost:25,apply:()=>{grantGold(280,"打捞情报");}},
  {name:"骨质补强",desc:"生命上限 +6（本局）",cost:20,apply:()=>{G.maxHp=(G.maxHp||HP_MAX)+6;G.hp=Math.min(G.maxHp,G.hp+6);}},
  {name:"行商护幕",desc:"立即获得 3 秒护幕",cost:18,apply:()=>{G.shield=Math.max(G.shield||0,3*(G.shieldDurationMul||1));}}
];
function routeKindForLevel(level){const ns=DESCENT_LAYOUT.nodes;const n=ns.find(n=>n.stage===level-1)||ns.find(n=>n.stage===level);return (n&&ROUTE_KIND[n.kind])?n.kind:"combat";}
function closeNodePanel(){
  document.getElementById("buildOverlay").classList.add("hidden");
  if(G&&G.state===S.PAUSED){G.state=S.PLAYING;input.setEnabled(true);input.reset();}
}
function openNodePanel(title,sub,fill){
  G.state=S.PAUSED;input.setEnabled(false);
  document.getElementById("buildTitle").textContent=title;
  document.getElementById("buildSub").textContent=sub;
  const grid=document.getElementById("buildChoices");grid.innerHTML="";
  fill(grid);
  document.getElementById("buildOverlay").classList.remove("hidden");
}
function showNodeEvent(){
  const ev=NODE_EVENTS[(Math.random()*NODE_EVENTS.length)|0];
  openNodePanel(ev.title,ev.desc,grid=>{
    ev.options.forEach(op=>{
      const btn=document.createElement("button");btn.className="build-option";
      btn.innerHTML="<b>"+op.label+"</b><small>"+op.desc+"</small>";
      btn.addEventListener("click",()=>{op.apply();closeNodePanel();toast(ev.title+" · "+op.label);});
      grid.appendChild(btn);
    });
  });
}
function showNodeMerchant(){
  const stock=MERCHANT_WARES.slice().sort(()=>Math.random()-.5).slice(0,4);   // v24.12：货架随机 4/6
  openNodePanel("星际商栈 · 雷莫拉行商","船币 "+meta.currency+" · 本层有效",grid=>{
    stock.forEach(w=>{
      const btn=document.createElement("button");btn.className="build-option";
      const can=meta.currency>=w.cost;
      btn.innerHTML="<b>"+w.name+" · "+w.cost+" 币</b><small>"+w.desc+(can?"":"（船币不足）")+"</small>";
      btn.style.opacity=can?"":".45";
      btn.addEventListener("click",()=>{
        if(meta.currency<w.cost){toast("船币不足");return;}
        meta.currency-=w.cost;saveMeta();w.apply();
        toast("购得 · "+w.name);showNodeMerchant();
      });
      grid.appendChild(btn);
    });
    const leaveBtn=document.createElement("button");leaveBtn.className="build-option";
    leaveBtn.innerHTML="<b>离开商栈</b><small>继续下潜</small>";
    leaveBtn.addEventListener("click",closeNodePanel);
    grid.appendChild(leaveBtn);
  });
}
function applyRouteNodeEffects(){
  if(!G)return;
  const kind=routeKindForLevel(G.level||1);
  if(kind==="elite"){
    for(const m of G.monsters){m.hp=Math.ceil(m.hp*1.6);m.maxHp=Math.ceil(m.maxHp*1.6);
      if(m.type==="elite"){const se=SHIELD_ELEMS[(Math.random()*SHIELD_ELEMS.length)|0];const shp=Math.ceil(m.maxHp*.35);m.eshield={elem:se,hp:shp,max:shp};}
      assignEliteAffix(m);}   // v30 精英元素盾
    runBuild.routeElitePending=true;
    toast("精英舱 · 强化敌群！清空目标赏金币 +300");
  } else if(kind==="boss"&&!G.boss){
    const btName=ENDLESS_BOSSES[((G.level||1)-1)%ENDLESS_BOSSES.length];
    const bt=BOSS_TYPES[btName]||BOSS_TYPES.handX;
    const hp=Math.ceil((bt.hp||60)*.72);
    G.boss={type:btName,hp,maxHp:hp,x:gatePos().x,z:gatePos().z,cd:0,warn:false};
    rebuildBossMesh(btName);
    toast("巨兽巢舱 · 本层守卫已在深处待命");
  } else if(kind==="event"){
    showNodeEvent();
  } else if(kind==="merchant"){
    showNodeMerchant();
  }
}
/* ============================================================
   v24.20 每关专属特征：20 层各有一条独有规则/氛围（进关结算并播报）
   fog=雾距倍率 exp=曝光 move=玩家移速 spd=怪速 echo=回响半径+
   obst=额外障碍数 vents=额外热泉 fiss=额外熔裂 build=免费构筑
   v25 新增：force=力场侵蚀区 memory=记忆碎片 rain=铁雨弹着点
   ============================================================ */
const LEVEL_SIGS=[
  {tag:"基础校准海域"},
  {tag:"静电迷雾",fog:.65},
  {tag:"雷莫拉扫描站"},
  {tag:"巨兽巡逻层"},
  {tag:"晶化猎场"},
  {tag:"逆流湍带",spd:1.15},
  {tag:"微光平原",fog:1.4,exp:1.08},
  {tag:"沉船坟场",obst:8},
  {tag:"寒渊",move:.88},
  {tag:"熔脊",fiss:2},
  {tag:"死寂深槽",spd:.9,fog:1.2},
  {tag:"孢子林",obst:6},
  {tag:"回声峡谷",echo:2},
  {tag:"蜃景",fog:1.6},
  {tag:"铁棘阵",obst:10},
  {tag:"无光层",fog:.5,exp:1.12},
  {tag:"涌泉带",vents:2},
  {tag:"碎晶风暴",fiss:1,spd:1.1},
  {tag:"中继站",build:true},
  {tag:"髓星之门",fiss:1}
];
/* v25：第二部关卡特征（21-40）——力场侵蚀 / 记忆碎片 / 铁雨为第二部独有机制 */
const LEVEL_SIGS_TWO=[
  {tag:"力场侵蚀",force:3},
  {tag:"超纤维桥",obst:5,exp:1.05},
  {tag:"熔铁河岸",fiss:3,spd:1.08},
  {tag:"黑色孢林",fog:.55,obst:7},
  {tag:"铁雨",rain:1},
  {tag:"事变",spd:1.2,exp:1.1},
  {tag:"四年跋涉",move:.9,fog:1.3},
  {tag:"归营",vents:3},
  {tag:"锤翅之赐",echo:2},
  {tag:"新生代",spd:1.12,fog:1.15},
  {tag:"分裂",obst:9},
  {tag:"违望者圣像",exp:1.06,obst:6},
  {tag:"忠诚者高桥",build:true,obst:4},
  {tag:"空记忆库",fog:.7,memory:3},
  {tag:"可用记忆库",memory:4},
  {tag:"美德叛逃",force:2,spd:1.1},
  {tag:"隐藏结构",fiss:2,echo:1},
  {tag:"炮弹车",rain:1,spd:1.05},
  {tag:"坦白",fog:1.5,exp:.94},
  {tag:"重返大船",force:2,build:true}
];
/* v26：第三至五部关卡特征（41-100）——新增 am=反物质喷口 cold=液氢寒潮 flare=建造者光束 gift=大船援助 */
const LEVEL_SIGS_LATE=[
  {tag:"银表脉冲",exp:1.04},
  {tag:"停摆之城",fog:1.35},
  {tag:"封死燃料管",obst:8},
  {tag:"百年孤潜",move:.9},
  {tag:"反应堆隧道",am:3},
  {tag:"违望者登陆",spd:1.12},
  {tag:"圣像之影",fog:.7},
  {tag:"熔融梯井",fiss:3},
  {tag:"割头之夜",exp:1.08},
  {tag:"权限迷宫",obst:10},
  {tag:"选择性服从",spd:1.15},
  {tag:"容器对峙",am:2},
  {tag:"液氢之海",fog:.6,exp:1.1},
  {tag:"铭文求救",memory:3},
  {tag:"可验证幻境",echo:2},
  {tag:"深层意志",am:2,spd:1.08},
  {tag:"战争地图",obst:7},
  {tag:"百族集结",vents:3},
  {tag:"首席交接",build:true},
  {tag:"秘道决战",am:3,exp:1.06},
  {tag:"雷莫拉战线",obst:9},
  {tag:"护盾崩解",am:2},
  {tag:"引擎哀鸣",spd:1.18},
  {tag:"重返髓星",cold:2},
  {tag:"物质源头",echo:2},
  {tag:"囚笼力场",force:3},
  {tag:"监狱假说",fog:1.4},
  {tag:"越狱低语",cold:3},
  {tag:"污染命令",am:3},
  {tag:"叛变守卫",spd:1.12},
  {tag:"脊柱之战",obst:10},
  {tag:"母亲与儿子",cold:2,exp:1.06},
  {tag:"洪水骗局",fiss:3},
  {tag:"关泵行动",vents:3},
  {tag:"拒绝屠星",move:.88},
  {tag:"引擎失控",cold:3,spd:1.1},
  {tag:"黑洞边缘",fog:.55,exp:1.12},
  {tag:"建造者指纹",memory:3},
  {tag:"囚室坐标",force:2},
  {tag:"荒凉苏醒",cold:2,am:2},
  {tag:"囚室开启",flare:2},
  {tag:"复制之影",spd:1.12},
  {tag:"喷嘴阵列",obst:8},
  {tag:"第一阀门",gift:2},
  {tag:"大船之声",echo:3},
  {tag:"船的选择",gift:2},
  {tag:"红巨星",exp:1.15,fog:1.3},
  {tag:"引力窗口",flare:3},
  {tag:"铁镍撞击",obst:10},
  {tag:"黑洞近邻",fog:.5},
  {tag:"最后的许诺",flare:2,fog:.8},
  {tag:"万族表决",gift:2},
  {tag:"重封髓星",force:2},
  {tag:"新任首席",memory:3},
  {tag:"记忆库重光",memory:4},
  {tag:"喷嘴熄灭",build:true},
  {tag:"驶离银河",flare:2,exp:1.08},
  {tag:"千年之林",gift:3},
  {tag:"星髓长歌",echo:2,fog:1.25},
  {tag:"潮声之下",flare:3,gift:2}
];
function levelSigFor(level){level=level||1;if(level<=LEVEL_SIGS.length)return LEVEL_SIGS[level-1];const two=level-LEVEL_SIGS.length;if(two<=LEVEL_SIGS_TWO.length)return LEVEL_SIGS_TWO[two-1];const late=two-LEVEL_SIGS_TWO.length;return LEVEL_SIGS_LATE[late-1]||LEVEL_SIGS[(level-1)%LEVEL_SIGS.length];}
function applyLevelSignature(){
  if(!G)return;
  const sig=levelSigFor(G.level||1);
  const baseFog=lowQ?18:24,baseFar=lowQ?64:94;
  if(sig.fog){scene.fog.near=baseFog*sig.fog;scene.fog.far=baseFar*Math.min(1.6,sig.fog);}
  else{scene.fog.near=baseFog;scene.fog.far=baseFar;}
  G.expBase=1.02*(sig.exp||1);G.fogFarBase=scene.fog.far;renderer.toneMappingExposure=G.expBase;   // v31 昼夜/风暴基准
  if(sig.move)G.moveMul=(G.moveMul||1)*sig.move;
  if(sig.spd)G.lvSpeedMul=sig.spd;
  if(sig.echo)G.echoBonus=sig.echo;
  if(sig.obst){
    for(let i=0;i<sig.obst;i++){
      const a=(G.level||1)*2.3+i*1.7,r=12+(i%5)*9;
      G.obstacles.push({x:Math.cos(a)*r,z:Math.sin(a)*r,r:1.3+Math.random()*.7});
    }
    rebuildObstacles(G.obstacles);
  }
  if(sig.build&&!runBuild.sigBuildUsed){runBuild.sigBuildUsed=true;grantGold(300,"中继站补给");}
  toast("关卡特征 · "+sig.tag);
}
function loadLevel(idx, carry){
  G = createConfiguredLevel(idx, carry);G.solids=[];
   // v33 每关重建建筑碰撞体
  
  G.state = S.PLAYING;
  rebuildScene();
  rebuildPressureEnvironment();
  rebuildMissionMarkers();
  /* v3：跨关后回到安全出生点，避免沿用上一关裂口坐标或卡入新地形 */
  player.x = 0; player.z = 0; player.y = terrainHeight(0,0)+1.7;
  player.vy = 0; player.onGround = true; player.climb = null;   // v24.22 换关脱离攀爬 player.yaw = 0; player.pitch = 0;
  camera.position.set(player.x, player.y, player.z);
  camera.rotation.set(0,0,0);
  input.reset();
  dashQueued=false;shieldQueued=false;overdriveQueued=false;
  bossCineDone=false;bossCineT=0;document.body.classList.remove("cine");   // v23.1：换关重置出场运镜
  const lv = LEVELS[G.level-1];
  if(lv){burstParticle(player.x,player.y-.4,player.z,selectedRole().accent,24);spawnParticleMeshes();showLevelIntro(lv);}
  if((idx+1)>=10)unlockAchievement("depth10");   // v24.14
  applyLevelSignature();   // v24.20 每关专属特征（雾/曝光/移速/怪速/障碍/热泉/熔裂）
  rebuildPlayerModel();   // v24.21 按角色重建第三人称模型

  applyRouteNodeEffects();   // v24.5：按航路节点类型进入对应玩法（商栈/事件/精英/巨兽）
  toast(lv ? ("L" + G.level + " " + lv.name + " · 补给舱接驳完成") : ("L" + G.level));
  updateRunBadge();applyRoleVisual();saveGame();
  if(G.level>=5)unlockAchievement("deepDive");
  updateWeaponUI();
}
/* 初始场景（默认灰手单关布局；startGame 会立即切换到 L1） */
buildTerrain();
buildObstacles(OBSTACLES);
buildEnvironmentDetails();
buildInteractiveDetails();
buildSamples(SAMPLE_SPOTS);
buildMonsters(MONSTER_SPOTS.map(m=>({type:"gray", x:m.x, z:m.z})));
positionGate(GATE_POS);

/* 海底浮游生物（纯视觉点缀） */
const plCount = lowQ ? 16 : 42;
const plankton=[],planktonPos=new Float32Array(plCount*3),planktonColor=new Float32Array(plCount*3),planktonColorTmp=new THREE.Color();
for(let i=0;i<plCount;i++){
  const x=(Math.random()-.5)*120,y=2+Math.random()*10,z=(Math.random()-.5)*120,seed=Math.random()*10,k=i*3;
  planktonPos[k]=x;planktonPos[k+1]=y;planktonPos[k+2]=z;planktonColorTmp.setHex(Math.random()<.3?0x7fffd4:0x6aa8b8);planktonColor[k]=planktonColorTmp.r;planktonColor[k+1]=planktonColorTmp.g;planktonColor[k+2]=planktonColorTmp.b;plankton.push({x,y,z,seed});
}
const planktonGeo=new THREE.BufferGeometry(),planktonPosAttr=new THREE.BufferAttribute(planktonPos,3).setUsage(THREE.DynamicDrawUsage);planktonGeo.setAttribute("position",planktonPosAttr);planktonGeo.setAttribute("color",new THREE.BufferAttribute(planktonColor,3));
const planktonMat=new THREE.PointsMaterial({map:radialGlowTex,color:0xffffff,vertexColors:true,size:(lowQ ? .13 : .2),transparent:true,opacity:.58,depthWrite:false,blending:THREE.AdditiveBlending,sizeAttenuation:true,fog:true});
const planktonPoints=new THREE.Points(planktonGeo,planktonMat);planktonPoints.frustumCulled=false;scene.add(planktonPoints);keepRes(planktonGeo,planktonMat);
/* 海雪颗粒：Points 批渲染，强化近中远景分层 */
const snowCount=lowQ?120:520,snowPos=new Float32Array(snowCount*3);
for(let i=0;i<snowCount;i++){
  snowPos[i*3]=(Math.random()-.5)*130;snowPos[i*3+1]=-1+Math.random()*19;snowPos[i*3+2]=(Math.random()-.5)*130;
}
const snowGeo=new THREE.BufferGeometry();snowGeo.setAttribute("position",new THREE.BufferAttribute(snowPos,3));
const marineSnow=new THREE.Points(snowGeo,new THREE.PointsMaterial({color:0x8dcac5,size:lowQ?.06:.085,transparent:true,opacity:.32,depthWrite:false,sizeAttenuation:true}));
scene.add(marineSnow);

/* 声呐脉冲可视化 */
const pulseGeo = new THREE.IcosahedronGeometry(.27,1);
const pulseShellGeo=new THREE.IcosahedronGeometry(.43,1);
const pulseMat = new THREE.MeshBasicMaterial({color:0xdffff8,fog:false});
const pulseShellMat=new THREE.MeshBasicMaterial({color:0x61e7d2,transparent:true,opacity:.25,depthWrite:false,blending:THREE.AdditiveBlending,fog:false,wireframe:true});
/* W1 武器系统（v1.1）：渊棘之矛可视化（细长晶棘 + 拖尾）与深渊回响扩散环（纯视觉 0.15s，施放即时已结算） */
const thornGeo = new THREE.ConeGeometry(0.22, 1.72, 7);
const thornShellGeo=new THREE.ConeGeometry(.34,1.96,7);
const thornMat = new THREE.MeshStandardMaterial({color:0x5cb9ff,emissive:0x1b65aa,emissiveIntensity:1.6,roughness:.16,metalness:.42,fog:false});
const thornShellMat=new THREE.MeshBasicMaterial({color:0x8bdcff,transparent:true,opacity:.22,depthWrite:false,blending:THREE.AdditiveBlending,fog:false,wireframe:true});
const thornTrailGeo = new THREE.ConeGeometry(0.14, 0.9, 5);
const thornTrailMat = new THREE.MeshBasicMaterial({color:0x9fe8ff,transparent:true,opacity:.42,depthWrite:false,blending:THREE.AdditiveBlending,fog:false});
const echoRingGeo = new THREE.RingGeometry(2.6, 3.0, 28);
const echoRingMat = new THREE.MeshBasicMaterial({color:0x9fe8ff,transparent:true,opacity:.55,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending,fog:false});
keepRes(pulseGeo,pulseShellGeo,pulseMat,pulseShellMat,thornGeo,thornShellGeo,thornMat,thornShellMat,thornTrailGeo,thornTrailMat,echoRingGeo,echoRingMat);
let echoRings = [];
let echoFieldMeshes = [];

/* v4：第一人称潜航器发射工具，补足持械空间感 */
const viewTool = new THREE.Group();
const toolDarkMat = new THREE.MeshStandardMaterial({color:0x15252d,metalness:.72,roughness:.28,transparent:true,opacity:1,depthTest:false,depthWrite:false});
const toolEdgeMat = new THREE.MeshStandardMaterial({color:0x6d8e92,metalness:.8,roughness:.22,transparent:true,opacity:1,depthTest:false,depthWrite:false});
const viewEmitterMat = new THREE.MeshBasicMaterial({color:0x7fffd4,transparent:true,opacity:1,depthTest:false,depthWrite:false,fog:false});
const toolBody=new THREE.Mesh(new THREE.CylinderGeometry(.105,.145,.62,10),toolDarkMat);toolBody.rotation.x=Math.PI/2;toolBody.position.z=-.13;
const toolCuff=new THREE.Mesh(new THREE.TorusGeometry(.15,.028,6,16),toolEdgeMat);toolCuff.position.z=-.42;
const toolEmitter=new THREE.Mesh(new THREE.TorusGeometry(.11,.034,6,16),viewEmitterMat);toolEmitter.position.z=-.47;
const toolCore=new THREE.Mesh(new THREE.OctahedronGeometry(.075,0),viewEmitterMat);toolCore.position.z=-.49;
const toolGrip=new THREE.Mesh(new THREE.BoxGeometry(.16,.34,.14),toolDarkMat);toolGrip.position.set(0,-.18,.03);toolGrip.rotation.z=-.18;
const toolRailL=new THREE.Mesh(new THREE.BoxGeometry(.025,.035,.55),toolEdgeMat);toolRailL.position.set(-.11,.02,-.13);
const toolRailR=toolRailL.clone();toolRailR.position.x=.11;
viewTool.add(toolBody,toolCuff,toolEmitter,toolCore,toolGrip,toolRailL,toolRailR);
/* v9：潜水手套与三套武器外形附件，让角色/武器选择在第一人称中也真实可见。 */
const roleGloveMat=new THREE.MeshStandardMaterial({color:0x315e59,roughness:.72,metalness:.08,transparent:true,opacity:1,depthTest:false,depthWrite:false}),roleSleeveMat=new THREE.MeshStandardMaterial({color:0x183b3b,roughness:.58,metalness:.2,transparent:true,opacity:1,depthTest:false,depthWrite:false});
const glovePalm=new THREE.Mesh(new THREE.SphereGeometry(.16,10,7),roleGloveMat);glovePalm.scale.set(.82,1.05,.78);glovePalm.position.set(.02,-.23,.08);
const sleeve=new THREE.Mesh(new THREE.CylinderGeometry(.11,.17,.64,9),roleSleeveMat);sleeve.position.set(.16,-.43,.3);sleeve.rotation.z=-.42;
viewTool.add(sleeve,glovePalm);
for(let i=0;i<3;i++){const finger=new THREE.Mesh(new THREE.CylinderGeometry(.028,.038,.18,6),roleGloveMat);finger.rotation.x=Math.PI/2;finger.position.set(-.065+i*.065,-.17,-.015);viewTool.add(finger);}
/* v23.2 视weapon补强：能量电池 + 顶置照门 + 供能软管 */
const toolCell=new THREE.Mesh(new THREE.CylinderGeometry(.034,.034,.09,8),viewEmitterMat);toolCell.rotation.z=Math.PI/2;toolCell.position.set(.125,.055,-.02);
const toolSight=new THREE.Mesh(new THREE.BoxGeometry(.02,.055,.13),toolEdgeMat);toolSight.position.set(0,.15,-.3);
const cableCurve=new THREE.QuadraticBezierCurve3(new THREE.Vector3(.03,-.04,-.34),new THREE.Vector3(.21,-.15,-.08),new THREE.Vector3(.15,-.3,.12));
const toolCable=new THREE.Mesh(new THREE.TubeGeometry(cableCurve,10,.012,5,false),toolEdgeMat);
viewTool.add(toolCell,toolSight,toolCable);
const sonarAttachment=new THREE.Group(),thornAttachment=new THREE.Group(),echoAttachment=new THREE.Group();
/* v34 M2 武器模型 v2 */
const gunMat=new THREE.MeshStandardMaterial({color:0x22343c,roughness:.42,metalness:.72});
const gunDark=new THREE.MeshStandardMaterial({color:0x111c22,roughness:.5,metalness:.55});
const gunGlow=new THREE.MeshBasicMaterial({color:0x7fffd4,fog:false});
/* 磁轨脉冲：轨身 + 三道加速环 + 磁轨导槽 + 消焰尖 + 握把 + 瞄具 */
const railBody=new THREE.Mesh(new THREE.BoxGeometry(.07,.09,.52),gunMat);railBody.position.z=-.34;sonarAttachment.add(railBody);
const railTop=new THREE.Mesh(new THREE.CylinderGeometry(.028,.028,.4,8),gunDark);railTop.rotation.x=Math.PI/2;railTop.position.set(0,.07,-.36);sonarAttachment.add(railTop);
for(let i=0;i<3;i++){const coil=new THREE.Mesh(new THREE.TorusGeometry(.075,.014,6,18),viewEmitterMat);coil.position.z=-.2-i*.13;sonarAttachment.add(coil);}
const railTip=new THREE.Mesh(new THREE.ConeGeometry(.045,.12,8),gunGlow);railTip.rotation.x=-Math.PI/2;railTip.position.z=-.66;sonarAttachment.add(railTip);
const railGrip=new THREE.Mesh(new THREE.BoxGeometry(.05,.14,.07),gunDark);railGrip.position.set(0,-.11,-.12);railGrip.rotation.x=.3;sonarAttachment.add(railGrip);
const railScope=new THREE.Mesh(new THREE.CylinderGeometry(.032,.032,.12,8),gunDark);railScope.rotation.x=Math.PI/2;railScope.position.set(0,.115,-.28);sonarAttachment.add(railScope);
/* 近战锤（迈尔辛沿用）：杆身 + 晶头 + 双翼 + 缠绕能量索 */
const shaft=new THREE.Mesh(new THREE.CylinderGeometry(.035,.045,.58,8),gunDark);shaft.rotation.x=Math.PI/2;shaft.position.z=-.3;thornAttachment.add(shaft);
const hammerHead=new THREE.Mesh(new THREE.OctahedronGeometry(.11,0),viewEmitterMat);hammerHead.position.z=-.62;hammerHead.scale.set(1,1,1.7);thornAttachment.add(hammerHead);
for(const side of [-1,1]){const wing=new THREE.Mesh(new THREE.ConeGeometry(.05,.22,4),gunMat);wing.rotation.x=Math.PI/2;wing.rotation.z=side*.5;wing.position.set(side*.09,-.02,-.5);thornAttachment.add(wing);}
for(let i=0;i<4;i++){const wrap=new THREE.Mesh(new THREE.TorusGeometry(.05,.011,5,14),viewEmitterMat);wrap.position.z=-.14-i*.12;thornAttachment.add(wrap);}
/* 榴弹回响：粗炮管 + 转膛鼓（5 发光孔）+ 消焰环 + 准星块 */
const barrel=new THREE.Mesh(new THREE.CylinderGeometry(.06,.07,.5,10),gunMat);barrel.rotation.x=Math.PI/2;barrel.position.z=-.36;echoAttachment.add(barrel);
const drum=new THREE.Mesh(new THREE.CylinderGeometry(.095,.095,.16,8),gunDark);drum.rotation.x=Math.PI/2;drum.position.z=-.08;echoAttachment.add(drum);
for(let i=0;i<5;i++){const hole=new THREE.Mesh(new THREE.CylinderGeometry(.03,.03,.18,6),gunGlow);hole.rotation.x=Math.PI/2;const aa=i/5*Math.PI*2;hole.position.set(Math.cos(aa)*.055,Math.sin(aa)*.055,-.08);echoAttachment.add(hole);}
const brake=new THREE.Mesh(new THREE.TorusGeometry(.085,.016,6,18),viewEmitterMat);brake.position.z=-.62;echoAttachment.add(brake);
const sight=new THREE.Mesh(new THREE.BoxGeometry(.02,.05,.1),gunDark);sight.position.set(0,.1,-.3);echoAttachment.add(sight);
viewTool.add(sonarAttachment,thornAttachment,echoAttachment);const viewWeaponAttachments={1:sonarAttachment,2:thornAttachment,3:echoAttachment};
viewTool.position.set(.46,-.42,-.96);viewTool.rotation.set(-.08,-.18,0);viewTool.scale.setScalar(.62);
viewTool.traverse(ch=>{if(ch.isMesh){ch.frustumCulled=false;ch.renderOrder=80;}});
camera.add(viewTool);
function applyRoleVisual(){
  const role=DIVER_ROLES[(G&&G.roleId)||runSelection.roleId]||DIVER_ROLES.explorer,base=new THREE.Color(role.accent);
  roleGloveMat.color.copy(base).multiplyScalar(.5);roleSleeveMat.color.copy(base).multiplyScalar(.24);toolEdgeMat.color.copy(base).multiplyScalar(.68);
  rebuildPlayerModel();   // v24.21 换角色即重建第三人称模型
}
/* ============================================================
   v24.21 第三人称：三位船长建模（Lathe 躯干 + 胶囊四肢 + 角色专属装备）
   浣生·调查：纤细青绿+扫描翼 / 迈尔辛·工程：厚重琥珀+胸甲重炮 / 帕米尔·突击：利落暗红+长枪兜帽
   V 键或触屏"视角"按钮切换；第三人称越肩相机 + 准星汇聚 + 地形防穿
   ============================================================ */
let playerModel=null,camMode="fps";
const _tpsVec=new THREE.Vector3(),_tpsLook=new THREE.Vector3();
/* v24.23 船长建模重制：更深的材质色 + 玻璃面罩内头 + 能量核/推进器/自带照明 + 肘膝球 + 角色装备强化 */
function buildCaptainModel(role){
  const C={
    explorer:{suit:0x24463f,trim:0x5fe0b0,helm:0x8fb5aa,glow:0x7fe0b0,scale:.95},
    guardian:{suit:0x3f3222,trim:0xd9a05a,helm:0xb3a184,glow:0xffc766,scale:1.08},
    hunter:{suit:0x2e2429,trim:0xe06a6a,helm:0x8f8188,glow:0xff658f,scale:.96}
  }[role]||{suit:0x24463f,trim:0x5fe0b0,helm:0x8fb5aa,glow:0x7fe0b0,scale:.95};
  const suitMat=new THREE.MeshStandardMaterial({color:C.suit,roughness:.68,metalness:.18});
  const trimMat=new THREE.MeshStandardMaterial({color:C.trim,emissive:C.trim,emissiveIntensity:.55,roughness:.35,metalness:.35});
  const helmMat=new THREE.MeshStandardMaterial({color:C.helm,roughness:.35,metalness:.55});
  const glassMat=new THREE.MeshStandardMaterial({color:0x0c2226,roughness:.15,metalness:.7,transparent:true,opacity:.85});
  const darkMat=new THREE.MeshStandardMaterial({color:0x111c1e,roughness:.6,metalness:.3});
  const g=new THREE.Group();
  /* 躯干：Lathe 潜航服曲面 */
  const torsoPts=[.15,.20,.235,.25,.245,.235,.22,.21].map((r,i)=>new THREE.Vector2(r,i*.085));
  const torso=new THREE.Mesh(new THREE.LatheGeometry(torsoPts,14),suitMat);torso.position.y=1.0;
  /* 胸口能量核（发光） */
  const core=new THREE.Mesh(new THREE.SphereGeometry(.055,8,6),trimMat);core.position.set(0,1.22,.22);
  /* 髋部 */
  const hip=new THREE.Mesh(new THREE.SphereGeometry(.19,10,8),suitMat);hip.scale.set(1,.72,.85);hip.position.y=.68;
  /* 头盔：球壳 + 深色面部 + 玻璃面罩 + 头冠饰条 */
  const helm=new THREE.Mesh(new THREE.SphereGeometry(.165,16,12),helmMat);helm.position.y=1.48;
  const face=new THREE.Mesh(new THREE.SphereGeometry(.105,10,8),darkMat);face.position.set(0,1.47,.045);
  const visor=new THREE.Mesh(new THREE.SphereGeometry(.115,12,8,0,Math.PI*2,Math.PI*.3,Math.PI*.34),glassMat);
  visor.position.set(0,1.48,.02);visor.rotation.x=.22;
  const crest=new THREE.Mesh(new THREE.BoxGeometry(.04,.1,.2),trimMat);crest.position.set(0,1.62,-.02);
  /* 背囊：双罐 + 推进器 */
  const tankGeo=new THREE.CylinderGeometry(.075,.075,.46,10);
  const tankL=new THREE.Mesh(tankGeo,suitMat);tankL.position.set(-.13,1.18,-.2);tankL.rotation.x=.1;
  const tankR=tankL.clone();tankR.position.x=.13;
  const thr=new THREE.Mesh(new THREE.CylinderGeometry(.09,.12,.16,10),darkMat);thr.position.set(0,1.0,-.32);
  /* 肩甲 */
  const padGeo=new THREE.SphereGeometry(.095,10,7);
  const padL=new THREE.Mesh(padGeo,helmMat);padL.position.set(-.25,1.34,0);
  const padR=padL.clone();padR.position.x=.25;
  /* 腰环（发光） */
  const belt=new THREE.Mesh(new THREE.TorusGeometry(.2,.03,6,16),trimMat);belt.rotation.x=Math.PI/2;belt.position.y=.9;
  /* 手臂：上臂 + 肘球 + 前臂 + 手套 */
  function arm(side){
    const a=new THREE.Group();a.position.set(side*.25,1.3,0);
    const up=new THREE.Mesh(new THREE.CapsuleGeometry(.052,.2,3,7),suitMat);up.position.y=-.13;
    const elbow=new THREE.Mesh(new THREE.SphereGeometry(.05,7,6),helmMat);elbow.position.y=-.27;
    const fore=new THREE.Mesh(new THREE.CapsuleGeometry(.047,.19,3,7),suitMat);fore.position.set(0,-.38,.03);fore.rotation.x=.28;
    const glove=new THREE.Mesh(new THREE.SphereGeometry(.058,8,6),helmMat);glove.position.set(0,-.5,.06);
    a.add(up,elbow,fore,glove);a.rotation.x=.2;a.rotation.z=side*.08;
    return a;
  }
  const armL=arm(-1),armR=arm(1);
  /* 腿：大腿 + 膝球 + 小腿 + 大蛙鞋 */
  function leg(side){
    const l=new THREE.Group();l.position.set(side*.11,.66,0);
    const up=new THREE.Mesh(new THREE.CapsuleGeometry(.068,.26,3,7),suitMat);up.position.y=-.17;
    const knee=new THREE.Mesh(new THREE.SphereGeometry(.055,7,6),helmMat);knee.position.y=-.36;
    const low=new THREE.Mesh(new THREE.CapsuleGeometry(.055,.22,3,7),suitMat);low.position.y=-.48;
    const fin=new THREE.Mesh(new THREE.ConeGeometry(.09,.42,4),trimMat);
    fin.rotation.x=-Math.PI/2+.35;fin.position.set(0,-.68,-.12);fin.scale.set(1.9,1,.22);
    l.add(up,knee,low,fin);return l;
  }
  const legL=leg(-1),legR=leg(1);
  g.add(torso,core,hip,helm,face,visor,crest,tankL,tankR,padL,padR,belt,armL,armR,legL,legR);
  /* 自带照明：让角色在黑暗中成为视觉焦点 */
  const plight=new THREE.PointLight(C.glow,.5,6);plight.position.set(0,1.5,.3);g.add(plight);
  /* 角色专属装备 */
  if(role==="guardian"){
    const chest=new THREE.Mesh(new THREE.BoxGeometry(.42,.26,.2),helmMat);chest.position.set(0,1.14,.14);chest.rotation.x=-.08;g.add(chest);
    const cannon=new THREE.Mesh(new THREE.CylinderGeometry(.05,.08,.55,8),darkMat);cannon.rotation.x=Math.PI/2;cannon.position.set(.3,-.52,.18);armR.add(cannon);
    const shoulderPad=new THREE.Mesh(new THREE.BoxGeometry(.16,.1,.2),helmMat);shoulderPad.position.set(-.28,1.4,0);g.add(shoulderPad);
  } else if(role==="hunter"){
    const rifle=new THREE.Mesh(new THREE.CylinderGeometry(.028,.042,.9,7),darkMat);rifle.rotation.x=Math.PI/2;rifle.position.set(-.27,-.32,.22);armL.add(rifle);
    const scope=new THREE.Mesh(new THREE.CylinderGeometry(.02,.02,.12,6),trimMat);scope.rotation.x=Math.PI/2;scope.position.set(-.27,-.24,.3);armL.add(scope);
    const hood=new THREE.Mesh(new THREE.ConeGeometry(.21,.3,8),suitMat);hood.position.set(0,1.6,-.14);hood.rotation.x=-.55;g.add(hood);
  } else {
    for(const w2 of [-1,1]){
      const wing=new THREE.Mesh(new THREE.BoxGeometry(.04,.16,.26),trimMat);wing.position.set(w2*.15,1.22,-.34);wing.rotation.y=w2*.35;wing.rotation.z=w2*-.2;g.add(wing);
    }
    const scanner=new THREE.Mesh(new THREE.TorusGeometry(.08,.02,6,14),trimMat);scanner.position.set(.26,-.5,.1);scanner.rotation.x=Math.PI/2;armR.add(scanner);
  }
  g.userData={armL,armR,legL,legR,lamp:core,plight};
  g.traverse(o=>{if(o.isMesh){o.castShadow=!lowQ;o.receiveShadow=true;}});
  g.scale.setScalar(C.scale);
  return g;
}
function rebuildPlayerModel(){
  if(playerModel){scene.remove(playerModel);disposeRoots([playerModel]);playerModel=null;}
  const role=(G&&G.roleId)||runSelection.roleId||"explorer";
  playerModel=buildCaptainModel(role);
  playerModel.visible=false;
  scene.add(playerModel);
}
function toggleCam(){
  camMode=camMode==="fps"?"tps":"fps";
  settings.camMode=camMode;
  toast(camMode==="tps"?"第三人称视角 · V 键切换":"第一人称视角");
  try{saveGame();}catch(e){}
}
/* v24.23 加固：document 捕获阶段监听（不受输入层冒泡阻断影响） */
document.addEventListener("keydown",e=>{
  if(e.code==="KeyV"&&G&&G.state===S.PLAYING&&!e.repeat)toggleCam();
  if(e.code==="KeyP"&&G&&!e.repeat&&G.state===S.PLAYING&&!photoMode){enterPhoto();return;}
  if(e.code==="KeyP"&&!e.repeat&&photoMode){exitPhoto();return;}
  if(photoMode){
    if(e.code==="ArrowLeft")photo.yaw+=.18;
    else if(e.code==="ArrowRight")photo.yaw-=.18;
    else if(e.code==="ArrowUp")photo.pitch=Math.min(1.2,photo.pitch+.1);
    else if(e.code==="ArrowDown")photo.pitch=Math.max(-.6,photo.pitch-.1);
    else if(e.code==="BracketRight"){photoFilter=(photoFilter+1)%4;applyPhotoFilter();}
    else if(e.code==="BracketLeft"){photo.dist=Math.max(2.5,Math.min(14,photo.dist+(e.shiftKey?1:-1)));}
    return;
  }
  if(e.code==="KeyB"&&G&&!e.repeat&&G.state!==S.OVER)toggleEquipShop();
},{capture:true});
(function(){
  const camBtn=document.getElementById("btnCam");
  if(camBtn)camBtn.addEventListener("pointerdown",e=>{e.preventDefault();try{initAudio();}catch(err){}if(G&&G.state===S.PLAYING)toggleCam();});
/* v29 触屏按键图标贴图（圆形徽章 SVG data URI） */
const BTN_ICON={
  btnPulse:["#0d2b33","#7fffd4","<path d='M16 3 L20 12 L28 16 L20 20 L16 29 L12 20 L4 16 L12 12 Z'/>"],
  btnShield:["#0d2233","#6fa8ff","<path d='M16 4 L26 8 V17 Q26 25 16 28 Q6 25 6 17 V8 Z'/>"],
  btnOverdrive:["#2b2410","#ffd66b","<path d='M18 3 L9 18 h6 L14 29 L24 13 h-7 Z'/>"],
  btnWeapon:["#241333","#b48cff","<path d='M16 3 L19 12 L28 10 L21 17 L27 25 L17 21 L16 29 L15 21 L5 25 L11 17 L4 10 L13 12 Z'/>"],
  btnDash:["#0d2b33","#9fe8ff","<path d='M8 6 L16 16 L8 26' fill='none' stroke='#9fe8ff' stroke-width='3.4'/><path d='M17 6 L25 16 L17 26' fill='none' stroke='#9fe8ff' stroke-width='3.4'/>"],
  btnJump:["#0d2b33","#63e8cf","<path d='M16 4 L27 16 h-7 V28 h-8 V16 H5 Z'/>"],
  btnShop:["#2b2410","#d9c08a","<path d='M8 12 h16 l-2 16 H10 Z'/><path d='M12 12 V9 a4 4 0 0 1 8 0 v3' fill='none' stroke='#d9c08a' stroke-width='2.4'/>"],
  btnCam:["#122333","#8fa7a1","<rect x='4' y='10' width='17' height='13' rx='3'/><path d='M21 14 L28 10 V23 L21 19 Z'/>"]
};
function btnIconSrc(id){const e=BTN_ICON[id]||BTN_ICON.btnPulse;
  return "data:image/svg+xml,"+encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><circle cx='16' cy='16' r='15.4' fill='"+e[0]+"'/><circle cx='16' cy='16' r='14.6' fill='none' stroke='"+e[1]+"' stroke-opacity='.75' stroke-width='1.6'/><g>"+e[2]+"</g></svg>");}
(function(){for(const bid of ["btnPulse","btnShield","btnOverdrive","btnWeapon","btnDash","btnJump","btnShop","btnCam"]){const bel=document.getElementById(bid);if(bel)bel.dataset.bicon=btnIconSrc(bid);}})();
  const shopBtn=document.getElementById("btnShop");
  if(shopBtn)shopBtn.addEventListener("pointerdown",e=>{e.preventDefault();try{initAudio();}catch(err){}if(G&&!G.storyPause)toggleEquipShop();});
})();
/* v28 主页：页签切换 + 气泡特效 + 军备/基地/档案页 */
const ROLE_NAMES_MAP={explorer:"浣生 · 远程",guardian:"迈尔辛 · 近战",hunter:"帕米尔 · 范围伤害"};
const ROLE_WEAPON_DESC={
  explorer:"远程点射 · 弹速 34 · 射程 34 米（冷却 0.42s）；蓄力 = 强化磁轨弹（溅射）",
  guardian:"近战扇击 · 半径 3.4 米 · 120° 扇形（冷却 0.55s）；蓄力 = 崩地重斩（范围 ×1.35）",
  hunter:"范围榴弹 · 弹速 18 · 命中爆裂 2.8 米（冷却 0.9s）；蓄力 = 重型榴弹（爆裂 ×1.2）"};
function renderArmoryTab(){
  const rid=runSelection.roleId,w=WEAPONS[ROLE_WEAPON[rid]]||WEAPONS[1],list=ROLE_SKILLS[rid]||ROLE_SKILLS.explorer;
  const wEl=document.getElementById("armoryWeapon");
  if(wEl){const icon=rid==="guardian"?"wedge":(rid==="hunter"?"shockHead":"turbo");
    wEl.innerHTML="<div class='armory-item'><img alt=''><div><b>"+w.name+" · 专属武器</b><em>"+(ROLE_NAMES_MAP[rid]||"")+"</em><small>"+(ROLE_WEAPON_DESC[rid]||"")+"</small></div></div>";
    const img=wEl.querySelector("img");if(img)img.src=eqIconSrc(icon);}
  const sEl=document.getElementById("armorySkills");
  if(sEl)sEl.innerHTML=list.map((sk,i)=>"<div class='skill-card'><b>"+(i+1)+". "+sk.name+"</b><small>"+sk.desc+"</small><em>冷却 "+sk.cool+"s</em></div>").join("");
  const eEl=document.getElementById("armoryEquip");
  if(eEl){const sorted=EQUIPMENT.slice().sort((a,b)=>a.cost-b.cost);
    eEl.innerHTML=sorted.map(it=>"<div class='armory-item'><img alt=''><div><b>"+it.name+(it.u?" <span class='uniq'>唯一</span>":"")+"</b><em>"+it.cost+" 金币</em><small>"+it.desc+"</small></div></div>").join("");
    const imgs=eEl.querySelectorAll("img");imgs.forEach((im,i)=>{if(sorted[i])im.src=eqIconSrc(sorted[i].id);});}
}
function renderGrowTab(){
  const ch=charState(runSelection.roleId),ch2=ch,role=DIVER_ROLES[runSelection.roleId]||DIVER_ROLES.explorer;
  const el=document.getElementById("growBody");if(!el)return;
  const cap=ch.broken*20+20,need2=charExpNeed(ch.level);
  el.innerHTML="<div class='armory-item'><img alt=''><div><b>"+role.shortName+" · Lv"+ch.level+"</b><em>结晶 "+(meta.crystals||0)+" · 突破 "+ch.broken+"/2 · 等级上限 "+cap+"</em><small>经验 "+Math.min(ch.exp,need2)+"/"+need2+"（击杀与结算获取）</small></div></div>";
  const img=el.querySelector("img");if(img)img.src=eqIconSrc(runSelection.roleId==="guardian"?"wedge":(runSelection.roleId==="hunter"?"shockHead":"turbo"));
  const bt=document.getElementById("growBreak");
  if(bt){const btReady=ch.level>=cap&&ch.broken<2,btCost=[40,100,200][ch.broken]||200;
    bt.disabled=!(btReady&&(meta.crystals||0)>=btCost);
    bt.textContent=ch.broken>=2?"突破已完成（Lv60）":(btReady?"突破（结晶 ×"+btCost+"）":"升级到 Lv"+cap+" 后可突破");
    if(!bt.__wired){bt.__wired=true;bt.addEventListener("click",()=>{charBreakthrough();});}}
  const tl=document.getElementById("growTalents");
  if(tl){tl.innerHTML="";const list=ROLE_SKILLS[runSelection.roleId]||ROLE_SKILLS.explorer;
    list.forEach((sk,i)=>{
      const lv2=(ch.talents&&ch.talents[i])||1,cost=12*lv2;
      const card=document.createElement("div");card.className="skill-card";
      card.innerHTML="<b></b><small></small><em></em>";
      card.querySelector("b").textContent=(i+1)+". "+sk.name+" · Lv"+lv2;
      card.querySelector("small").textContent=sk.desc;
      card.querySelector("em").textContent="效果 +6%/级 · 冷却 -4%/级";
      const b2=document.createElement("button");b2.className="btn sec";b2.style.marginTop="6px";b2.style.padding="6px";b2.style.fontSize="11px";
      b2.textContent=lv2>=5?"已满级":"强化（结晶 ×"+cost+"）";b2.disabled=lv2>=5||(meta.crystals||0)<cost;
      b2.addEventListener("click",()=>talentUp(i));
      card.appendChild(b2);
      /* v41 天赋分岔按钮 */
      if(lv2>=3){
        const br=ch2&&ch2.branches&&ch2.branches[i];
        const brDiv=document.createElement("div");brDiv.style.marginTop="4px";
        if(!br){const ba=document.createElement("button");ba.className="btn sec";ba.style.cssText="padding:3px 6px;font-size:9px;margin:2px";ba.textContent="分支 A";ba.addEventListener("click",()=>{if(!ch2.branches)ch2.branches={};ch2.branches[i]="a";saveMeta();renderGrowTab();});
        const bb=document.createElement("button");bb.className="btn sec";bb.style.cssText="padding:3px 6px;font-size:9px;margin:2px";bb.textContent="分支 B";bb.addEventListener("click",()=>{if(!ch2.branches)ch2.branches={};ch2.branches[i]="b";saveMeta();renderGrowTab();});
        brDiv.appendChild(ba);brDiv.appendChild(bb);}
        else{brDiv.innerHTML="<em style='color:#8fa7a1;font-size:9px'>已选分岔 "+br+"</em>";}
        card.appendChild(brDiv);
      }
    });}
  const rl=document.getElementById("growRelics");
  if(rl){rl.innerHTML="";
    const eq=meta.relicEquip||{};
    const head=document.createElement("div");head.style.gridColumn="1/-1";head.style.color="#8fa7a1";head.style.fontSize="10px";
    head.textContent="已装备："+RELIC_SLOTS.map(s2=>RELIC_SLOT_NAMES[s2]+(eq[s2]?"✓":"∅")).join(" · ")+" · 分解返还结晶";
    rl.appendChild(head);
    if(!(meta.relics||[]).length){const empty=document.createElement("div");empty.style.gridColumn="1/-1";empty.style.color="#5e736c";empty.style.fontSize="11px";empty.textContent="尚无遗章 —— 进入回响深井或完成每日挑战获取";rl.appendChild(empty);}
    (meta.relics||[]).slice().reverse().forEach(rel=>{
      const d=document.createElement("div");d.className="armory-item";
      const rar=RELIC_RARITY[rel.rarity];
      const subsTxt=(rel.subs||[]).map(s2=>s2.n+"+"+s2.v).join(" / ");
      d.innerHTML="<div style='width:8px;height:38px;border-radius:4px;background:"+rar.color+"'></div><div><b style='color:"+rar.color+"'></b><em></em><small></small></div>";
      d.querySelector("b").textContent=RELIC_SLOT_NAMES[rel.slot]+" · "+rar.name;
      d.querySelector("em").textContent="主词条："+rel.main.v+"";
      d.querySelector("small").textContent=(rel.subs||[]).map(s2=>s2.n+"+"+s2.v).join(" / ");
      const box2=document.createElement("div");box2.style.marginLeft="auto";box2.style.display="flex";box2.style.flexDirection="column";box2.style.gap="4px";
      const be=document.createElement("button");be.className="btn sec";be.style.padding="3px 8px";be.style.fontSize="10px";
      be.textContent=eq[rel.slot]===rel.id?"已装备":"装备";be.disabled=eq[rel.slot]===rel.id;
      be.addEventListener("click",()=>{meta.relicEquip=meta.relicEquip||{};meta.relicEquip[rel.slot]=rel.id;saveMeta();renderGrowTab();toast("遗章已装备");});
      const bd=document.createElement("button");bd.className="btn sec";bd.style.padding="3px 8px";bd.style.fontSize="10px";
      bd.textContent="分解 +"+RELIC_RARITY[rel.rarity].crystal;
      bd.addEventListener("click",()=>{meta.relics=meta.relics.filter(r2=>r2.id!==rel.id);for(const k2 in (meta.relicEquip||{}))if(meta.relicEquip[k2]===rel.id)delete meta.relicEquip[k2];meta.crystals=(meta.crystals||0)+RELIC_RARITY[rel.rarity].crystal;saveMeta();renderGrowTab();});
      box2.appendChild(be);box2.appendChild(bd);d.appendChild(box2);
      rl.appendChild(d);
    });
  }
}
function renderBaseTab(){
  const c=document.getElementById("baseCurrency");if(!c)return;
  c.textContent="船币 "+meta.currency+" · 结晶 "+(meta.crystals||0)+" · 总击杀 "+meta.totalKills+" · 最高连杀 "+meta.bestStreak;
  const wb=document.getElementById("wellBtn");
  if(wb){wb.textContent="进入回响深井 · 12 层限时挑战（最佳 "+(meta.wellBest||0)+" 波 · 累计 ★"+(meta.wellStars||0)+"）";
    if(!wb.__wired){wb.__wired=true;wb.addEventListener("click",()=>{startWell();});}}
  const grid=document.getElementById("baseGrid");grid.innerHTML="";
  for(const item of REST_ITEMS){
    const rank=item.unlock?(meta.unlocks[item.id]?1:0):(meta.upgrades[item.id]||0),done=item.unlock?!!meta.unlocks[item.id]:rank>=item.max,cost=item.cost(rank);
    const b=document.createElement("button");b.type="button";b.className="rest-item";b.disabled=done||meta.currency<cost;
    b.innerHTML="<b></b><em></em><small></small>";
    b.querySelector("b").textContent=item.name;
    b.querySelector("em").textContent=done?"已完成":item.tag+" · "+cost+" 船币";
    b.querySelector("small").textContent=item.desc(rank);
    b.addEventListener("click",()=>{buyRestItem(item);renderBaseTab();});
    grid.appendChild(b);
  }
  const ach=document.getElementById("baseAch");ach.innerHTML="";
  for(const [id,a] of Object.entries(ACHIEVEMENTS)){const d=document.createElement("div");d.className="achievement"+(meta.achievements[id]?" done":"");d.textContent=(meta.achievements[id]?"✓ ":"○ ")+a.name+" · "+a.desc+" · 奖励 "+a.reward;ach.appendChild(d);}
}
function renderArchiveTab(){
  const box=document.getElementById("archiveTabList");if(!box)return;
  box.innerHTML="";
  const parts=[["第一部 · 船",0],["第二部 · 髓星",20],["第三部 · 首领的椅子",40],["第四部 · 荒凉",60],["第五部 · 建造者",80]];
  for(const part of parts){
    const card=document.createElement("div");card.className="archive-chapter";
    const rows=STORY_CHAPTERS.slice(part[1],part[1]+20).map((c2,i)=>"<div style='color:#91aaa4;font-size:9px;line-height:1.7'>"+String(part[1]+i+1).padStart(2,"0")+" · "+c2.name+"</div>").join("");
    card.innerHTML="<b>"+part[0]+"</b>"+rows;
    box.appendChild(card);
  }
  const open=document.getElementById("archiveTabOpen");
  if(open&&!open.__wired){open.__wired=true;open.addEventListener("click",()=>{updateArchiveUI();document.getElementById("archiveOverlay").classList.remove("hidden");});}
}
(function(){
  const tabs=document.getElementById("menuTabs");if(!tabs)return;
  tabs.addEventListener("click",e=>{
    const b=e.target.closest("button[data-pane]");if(!b)return;
    for(const t of tabs.querySelectorAll("button"))t.setAttribute("aria-pressed",String(t===b));
    for(const p of document.querySelectorAll("#menu .menuPane"))p.classList.toggle("show",p.id===b.dataset.pane);
    if(b.dataset.pane==="paneGrow")renderGrowTab();
    if(b.dataset.pane==="paneArmory")renderArmoryTab();
    if(b.dataset.pane==="paneBase")renderBaseTab();
    if(b.dataset.pane==="paneArchive")renderArchiveTab();
    try{sound("pickup");}catch(err){}
  });
  const fx=document.getElementById("menuFx");
  if(fx)for(let i=0;i<14;i++){
    const b=document.createElement("div");b.className="mBubble";
    const sz=4+Math.random()*16;
    b.style.width=sz+"px";b.style.height=sz+"px";b.style.left=(Math.random()*100)+"%";
    b.style.animationDuration=(9+Math.random()*14)+"s";b.style.animationDelay=(-Math.random()*20)+"s";
    fx.appendChild(b);
  }
})();

applyRoleVisual();
let weaponKick=0;
let weaponActionT=0,weaponActionKind=0;

/* CSD-SOUL1-P1：L2 地面预警圈（世界内几何，MeshBasicMaterial fog:false 与样本同规；
   静态 + 微脉冲 0.2s 周期，reduceFlicker 友好；telegraph 事件按招型渲染圈/直线带） */
let telegraphRings = [];
function spawnTelegraphRing(ev){
  const tg = ev.telegraph || {};
  const r = tg.ring || 0;
  if(!(r > 0)) return;
  const shape = (ev.moveType === "dash") ? "band" : (ev.moveType === "projectile" && (tg.sound==="chargeWarn")) ? "band" : "circle";
  const col = tg.color || 0xff2244;
  const mat = new THREE.MeshBasicMaterial({ color:col, transparent:true, opacity:0.22, side:THREE.DoubleSide, depthWrite:false, fog:false });
  let mesh;
  if(shape === "band"){   // 直线带：宽 r×2、长 4（方向朝玩家；预警时长内足够示意）
    mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.6, r*2), mat);
    mesh.rotation.x = -Math.PI/2;
    const px = player ? player.x : ev.mx, pz = player ? player.z : ev.mz;
    const ang = Math.atan2(pz-ev.mz, px-ev.mx);
    mesh.position.set(ev.mx, terrainHeight(ev.mx, ev.mz)+0.12, ev.mz);
    mesh.rotation.z = -ang;
  } else {   // circle：半径 r 的地面圈
    mesh = new THREE.Mesh(new THREE.RingGeometry(Math.max(0.05, r-0.18), r, 32), mat);
    mesh.rotation.x = -Math.PI/2;
    mesh.position.set(ev.mx, terrainHeight(ev.mx, ev.mz)+0.12, ev.mz);
  }
  scene.add(mesh);
  telegraphRings.push({ mesh, mat, life: Math.max(0.2, ev.windup || 0.5), max: Math.max(0.2, ev.windup || 0.5), reduceFlicker: settings.reduceFlicker });
}
function tickTelegraphRings(dt){
  for(let i=telegraphRings.length-1;i>=0;i--){
    const t = telegraphRings[i];
    t.life -= dt;
    // 静态 + 微脉冲（透明度 ±0.05，周期 0.2s；reduceFlicker 关闭闪烁 → 恒定微光）
    const pulse = t.reduceFlicker ? 0.22 : 0.22 + 0.05*Math.sin(G.time*Math.PI*10);
    t.mat.opacity = Math.min(0.5, Math.max(0.08, pulse));
    if(t.life<=0){ disposeRoots([t.mesh]); telegraphRings.splice(i,1); }
  }
}
function clearTelegraphRings(){
  disposeRoots(telegraphRings.map(t=>t.mesh));
  telegraphRings = [];
}

/* v9：所有拾取/命中碎光合并为一个 Points 批次；高画质 320 粒也只占一次提交。 */
let particles=[];
const particleCapacity=lowQ?96:320,particlePos=new Float32Array(particleCapacity*3),particleColor=new Float32Array(particleCapacity*3);
const particleGeo=new THREE.BufferGeometry(),particlePosAttr=new THREE.BufferAttribute(particlePos,3).setUsage(THREE.DynamicDrawUsage),particleColorAttr=new THREE.BufferAttribute(particleColor,3).setUsage(THREE.DynamicDrawUsage);
particleGeo.setAttribute("position",particlePosAttr);particleGeo.setAttribute("color",particleColorAttr);particleGeo.setDrawRange(0,0);
const particleMat=new THREE.PointsMaterial({map:radialGlowTex,size:(lowQ ? .24 : .34),vertexColors:true,transparent:true,opacity:.9,depthWrite:false,blending:THREE.AdditiveBlending,sizeAttenuation:true,fog:true});
const particlePoints=new THREE.Points(particleGeo,particleMat),particleColorTmp=new THREE.Color();particlePoints.frustumCulled=false;scene.add(particlePoints);keepRes(particleGeo,particleMat);
function burstParticle(x,y,z,color,n){
  particleColorTmp.setHex(Number(color)||0xffffff);
  for(let i=0;i<n;i++){
    const a=Math.random()*Math.PI*2,b=Math.random()*Math.PI-Math.PI/2,spd=1.45+Math.random()*1.55;
    particles.push({x,y,z,vx:Math.cos(a)*Math.cos(b)*spd,vy:Math.sin(b)*spd,vz:Math.sin(a)*Math.cos(b)*spd,life:.5+Math.random()*.34,r:particleColorTmp.r,g:particleColorTmp.g,b:particleColorTmp.b});
  }
  if(particles.length>particleCapacity)particles.splice(0,particles.length-particleCapacity);
}
function syncParticlePoints(){
  const n=Math.min(particles.length,particleCapacity);
  for(let i=0;i<n;i++){const p=particles[i],k=i*3,fade=Math.max(.25,Math.min(1,p.life*1.9));particlePos[k]=p.x;particlePos[k+1]=p.y;particlePos[k+2]=p.z;particleColor[k]=p.r*fade;particleColor[k+1]=p.g*fade;particleColor[k+2]=p.b*fade;}
  particleGeo.setDrawRange(0,n);particlePosAttr.needsUpdate=true;particleColorAttr.needsUpdate=true;
}
function spawnParticleMeshes(){syncParticlePoints();}

/* v5：击杀战利品——自动拾取补给，鼓励主动清怪而非只绕路 */
const lootCoreGeo=new THREE.OctahedronGeometry(.24,0),lootRingGeo=new THREE.TorusGeometry(.38,.035,6,18);
keepRes(lootCoreGeo,lootRingGeo);
const LOOT_COLORS={hp:0xff5573,ammo:0x5ca8ff,gold:0xffd66b};
let lootDrops=[];
function spawnLoot(x,z,force,rareForce){
  const rareChance=.035+(meta.upgrades.salvage||0)*.018+(meta.unlocks.scanner?.06:0)+(runBuild.rare||0)+(G.modeId==="endless"&&G.endless?Math.min(.16,G.endless.wave*.004):0);
  if(!force&&!rareForce&&Math.random()>.62)return;
  const kind=(rareForce||Math.random()<rareChance)?"gold":G.hp/(G.maxHp||HP_MAX)<.55?"hp":G.ammo<3?"ammo":(["hp","gold","ammo"][Math.floor(Math.random()*3)]);
  const color=LOOT_COLORS[kind],g=new THREE.Group();
  const core=new THREE.Mesh(lootCoreGeo,new THREE.MeshBasicMaterial({color,transparent:true,opacity:.9,fog:false}));
  const ring=new THREE.Mesh(lootRingGeo,new THREE.MeshBasicMaterial({color,transparent:true,opacity:.62,fog:false}));ring.rotation.x=Math.PI/2;
  const baseY=terrainHeight(x,z)+.72;   // v23：静态战利品缓存地形高度
  g.add(core,ring);g.position.set(x,baseY,z);scene.add(g);
  lootDrops.push({mesh:g,x,z,kind,rare:!!rareForce,life:20,phase:Math.random()*6.28,baseY});
}
function tickLoot(dt){
  for(let i=lootDrops.length-1;i>=0;i--){
    const d=lootDrops[i];d.life-=dt;d.mesh.rotation.y+=dt*1.8;d.mesh.position.y=d.baseY+Math.sin(G.time*3+d.phase)*.16;
    if(Math.hypot(player.x-d.x,player.z-d.z)<1.65){
      let msg="";
      if(d.kind==="hp"){G.hp=Math.min(G.maxHp||HP_MAX,G.hp+18);msg="生命补给 +18";}
      else if(d.kind==="ammo"){G.ammo=Math.min(AMMO_MAX,G.ammo+2);msg="渊棘弹药 +2";}
      else{const kg=Math.round((d.rare?150:60)*((G&&G.goldMul)||1));G.gold=(G.gold||0)+kg;G.goldEarned=(G.goldEarned||0)+kg;msg="金币袋 +"+kg;renderRunBuildStrip();}
      burstParticle(d.x,d.mesh.position.y,d.z,LOOT_COLORS[d.kind],12);sound("pickup");vibrate(18);toast(msg);disposeRoots([d.mesh]);lootDrops.splice(i,1);continue;
    }
    if(d.life<=0){disposeRoots([d.mesh]);lootDrops.splice(i,1);}
  }
}
function clearLoot(){disposeRoots(lootDrops.map(d=>d.mesh));lootDrops=[];}

/* v31 裂缝挑战刷怪（运行时生成：逻辑对象 + 渲染网格） */
function spawnRiftMonster(x,z){
  const types=["gray","dart","spitter","gray"];
  const type=types[(Math.random()*types.length)|0],t=MONSTER_TYPES[type]||MONSTER_TYPES.gray;
  const hp=Math.max(1,Math.ceil((t.hp||3)*1.2));
  const m={type,x:Math.round(x),z:Math.round(z),hp:hp,maxHp:hp,cd:0,phase:Math.random()*6.28,score:t.score||20,base:{x:Math.round(x),z:Math.round(z)},rift:true};
  G.monsters.push(m);
  if(typeof spawnMonsterMeshAt==="function")spawnMonsterMeshAt(m);
  return m;
}
/* v31 昼夜呼吸 + 粒子风暴（每 150s 一轮明暗；风暴 22s：视野压缩 + 全伤害 +12%） */
let stormFxT=0;
function tickAtmosphere(dt){
  if(!G||G.state!==S.PLAYING)return;
  const dayF=.84+.16*Math.sin((G.time||0)*Math.PI*2/150);
  if(G.expBase)renderer.toneMappingExposure=G.expBase*dayF*(G.stormT>0?.94:1);
  if(G.fogFarBase&&scene.fog)scene.fog.far=G.fogFarBase*(G.stormT>0?.6:1);
  if(G.stormT>0){
    G.stormT-=dt;G.stormDmg=1.12;
    stormFxT-=dt;
    if(stormFxT<=0){stormFxT=.25;burstParticle(player.x+(Math.random()-.5)*10,player.y+1+Math.random()*2,player.z+(Math.random()-.5)*10,0x9fc8ff,2);}
  } else {
    G.stormDmg=1;
    G.stormCd=(G.stormCd===undefined?60+Math.random()*60:G.stormCd)-dt;
    if(G.stormCd<=0){G.stormT=22;G.stormCd=95+Math.random()*60;toast("粒子风暴 · 全伤害 +12%");showTransmission("深渊气象","粒子风暴来袭：能见度骤降，所有伤害提升 12%。",3600);}
  }
}
/* v31 手柄支持（Gamepad API）：左摇杆移动 / 右摇杆视角 / A 攻击 / B,X,Y 技能 / RB 闪现 / LB 跳跃 / Start 暂停 / Select 商店 */
let gpPulse=false,gpPauseEdge=false;
const GP={prev:{},jumpHeld:false,jumpLatch:false};
function tickGamepad(dt){
  let gps=null;
  try{gps=navigator.getGamepads?navigator.getGamepads():null;}catch(e){}
  const gp=gps&&gps[0];if(!gp)return;
  const ax=gp.axes||[];
  const dz=v=>Math.abs(v)>.18?v:0;
  if(G)G.gpMove={x:dz(ax[0]||0),z:dz(ax[1]||0)};
  const bp=i=>!!(gp.buttons[i]&&gp.buttons[i].pressed);
  const edge=i=>{const p=bp(i);const e2=p&&!GP.prev[i];GP.prev[i]=p;return e2;};
  gpPulse=bp(0)||bp(7);
  GP.jumpHeld=bp(4);if(edge(4))GP.jumpLatch=true;
  if(edge(1))skillQueued[0]=true;
  if(edge(2))skillQueued[1]=true;
  if(edge(3))skillQueued[2]=true;
  if(edge(5))dashQueued=true;
  if(edge(8))toggleEquipShop();
  if(edge(9))gpPauseEdge=true;
  if(!photoMode&&G&&G.state===S.PLAYING){
    player.yaw-=dz(ax[2]||0)*dt*2.6;
    player.pitch=Math.max(-1.2,Math.min(1.2,(player.pitch||0)-dz(ax[3]||0)*dt*2));
  }
}
/* v31 照片模式：P 进入（时停+自由相机），方向键运镜，[ 距离，] 滤镜，P 退出 */
let photoMode=false,photo={yaw:0,dist:6,pitch:.35},photoFilter=0,photoPrevExp=null;
function applyPhotoFilter(){
  const presets=[{exp:1.02,b:.55},{exp:1.3,b:1.25},{exp:.72,b:0},{exp:1.1,b:.9}];
  const p3=presets[photoFilter];
  if(G)G.expBase=p3.exp;
  renderer.toneMappingExposure=p3.exp;
  if(typeof postCompMat!=="undefined"&&postCompMat)postCompMat.uniforms.uStrength.value=p3.b;
  toast("滤镜 "+(photoFilter+1)+"/4");
}
function enterPhoto(){
  if(!G)return;
  photoMode=true;photo.yaw=player.yaw+Math.PI;photo.dist=6;photo.pitch=.35;photoPrevExp=renderer.toneMappingExposure;
  G.prevState=G.state;G.state=S.PAUSED;document.body.classList.add("photo");
  input.setEnabled(false);try{if(document.pointerLockElement)document.exitPointerLock();}catch(e){}
  toast("照片模式 · 方向键运镜 · [ 距离 · ] 滤镜 · P 退出");
}
function exitPhoto(){
  photoMode=false;document.body.classList.remove("photo");
  if(G){G.state=G.prevState||S.PLAYING;}
  if(photoPrevExp!==null)renderer.toneMappingExposure=photoPrevExp;
  input.setEnabled(true);input.reset();
}
function photoCam(dt){
  const cx=player.x+Math.sin(photo.yaw)*Math.cos(photo.pitch)*photo.dist;
  const cz=player.z+Math.cos(photo.yaw)*Math.cos(photo.pitch)*photo.dist;
  const cy=Math.max(terrainHeight(cx,cz)+.4,player.y+Math.sin(photo.pitch)*photo.dist);
  camera.position.set(cx,cy,cz);
  camera.lookAt(player.x,player.y,player.z);
}
/* v28：技能特效衰减 + 轰炸落点 + 增益计时 */
function tickSkillFx(dt){
  for(let i=skillFxBeams.length-1;i>=0;i--){
    const b=skillFxBeams[i];b.life-=dt;
    if(b.mesh&&b.mesh.children)for(const o of b.mesh.children){if(o.material&&o.material.opacity!==undefined)o.material.opacity=Math.max(0,b.life/b.max*.85);}
    if(b.life<=0){if(b.mesh){scene.remove(b.mesh);disposeRoots([b.mesh]);}skillFxBeams.splice(i,1);}
  }
  if(!G)return;
  if(G.skillCd)for(let si5=0;si5<3;si5++)if(G.skillCd[si5]>0)G.skillCd[si5]-=dt;
  if(G.strikes&&G.strikes.length){
    for(let i=G.strikes.length-1;i>=0;i--){
      const s2=G.strikes[i];s2.t-=dt;
      if(s2.t>0&&s2.t<.4&&!s2.warned){s2.warned=true;spawnEchoRing(s2.x,terrainHeight(s2.x,s2.z)+.3,s2.z,0xff8a4a,2.2);}
      if(s2.t<=0){
        const hits=ringBurst(s2.x,s2.z,3.2,3.6,2.6,3);
        for(const e of hits)handleCombatEvent(e);
        spawnEchoRing(s2.x,terrainHeight(s2.x,s2.z)+.4,s2.z,0xffb37a,3.4);
        burstParticle(s2.x,terrainHeight(s2.x,s2.z)+1,s2.z,0xff8a4a,22);
        addShake(.5);sound("charged");
        G.strikes.splice(i,1);
      }
    }
  }
  for(const m of (G.monsters||[])){if(m.marked>0)m.marked-=dt;}
  if(G.phaseT>0)G.phaseT-=dt;
  if(G.adrenalineT>0)G.adrenalineT-=dt;
  if(G.rift){
    G.rift.t-=dt;
    const left2=(G.monsters||[]).filter(m3=>m3.rift&&m3.hp>0).length;
    if(left2===0){grantGold(250,"裂缝清剿");grantCrystal(3,"裂缝清剿");G.rift=null;}
    else if(G.rift.t<=0){G.rift=null;toast("裂缝挑战超时 · 敌群散去");}
  }
}
/* v13 战斗奖励循环：击杀回复、独立连杀窗口、里程碑奖励与构筑经验。 */
function registerRunKill(x,z,isBoss){
  runBuild.kills++;runBuild.streak++;runBuild.streakTimer=runBuild.comboWindow;if(G.modeId==="endless"&&G.endless){G.endless.totalKills++;G.score+=Math.round((10+G.endless.wave*2)*(1+G.endless.wave*.08));}meta.totalKills++;meta.bestStreak=Math.max(meta.bestStreak,runBuild.streak);G.hp=Math.min(G.maxHp,G.hp+(1.5+runBuild.killHeal+(G.killHealEquip||0)+(isBoss?8:0))*((G.wellAffix&&G.wellAffix.heal)||1));G.score+=Math.round((runBuild.streak>1?runBuild.streak*3:0)*runBuild.comboScore);G.lastCombatT=G.time||0;
grantCurrency(isBoss?8:1,isBoss?"巨兽赏金":"击杀回收");unlockAchievement("firstBlood");
if(netConnected&&netWs&&netWs.readyState===1){const mi=(G.monsters||[]).findIndex(mm=>mm.hp<=0);if(mi>=0)netWs.send(JSON.stringify({t:"kill",mi:mi}));}
  gainCharExp(1);
  if(isBoss)grantCrystal(25,"巨兽核心");else if(Math.random()<.06)grantCrystal(1,"结晶析出");
  tickWeeklyGoal("kill",1);   // v41 周目标
  tickWeeklyGoal("kill",1);   // v41 周目标   // v31 养成掉落
  if(runBuild.streak===3){G.gold=(G.gold||0)+20;G.goldEarned=(G.goldEarned||0)+20;toast("3 连杀 · 赏金 +20");}
  if(runBuild.streak===5){G.ammo=Math.min(AMMO_MAX,G.ammo+2);toast("5 连杀 · 稀有弹药 +2");}
  if(runBuild.comboShield&&runBuild.streak>=5)G.shield=Math.max(G.shield||0,3.2*(G.shieldDurationMul||1));
  if(runBuild.overdriveKill&&G.overdrive>0)G.overdrive+=runBuild.overdriveKill;
  if(runBuild.streak===10){unlockAchievement("streak10");spawnLoot(x,z,true,true);}
  if(meta.totalKills>=100)unlockAchievement("kills100");   // v24.14
  if(G.score>=1000)unlockAchievement("score1k");
  if((G.combo||0)>=15)unlockAchievement("combo15");
  renderRunBuildStrip();
  {const kg=Math.round((isBoss?220:16+Math.min(20,(runBuild.streak||0)*2))*((G&&G.goldMul)||1));G.gold=(G.gold||0)+kg;G.goldEarned=(G.goldEarned||0)+kg;}
  if(isBoss)toast("巨兽赏金 · 金币 +220");
}
function tickRunRewards(dt){if(runBuild.streakTimer>0){runBuild.streakTimer-=dt;if(runBuild.streakTimer<=0)runBuild.streak=0;}if(G&&G.state===S.PLAYING){const inc=2.2*dt;G.gold=(G.gold||0)+inc;G.goldEarned=(G.goldEarned||0)+inc;}}

/* v32 高危裂隙：固定环境危害（原安全区收缩设定已移除）。 */
let pressure={time:0,damageTick:0,fissures:[],meshes:[],phase:"calm"};
function clearPressureEnvironment(){disposeRoots(pressure.meshes||[]);pressure.meshes=[];}
/* v24.4/v32 熔裂地贴：程序化裂隙危险区 */
function makeCrackTex(){
  const cv=document.createElement("canvas");cv.width=cv.height=256;const c=cv.getContext("2d");
  c.clearRect(0,0,256,256);
  for(let b=0;b<7;b++){
    let x=128+(Math.random()-.5)*70,y=128+(Math.random()-.5)*70,a=Math.random()*Math.PI*2;
    c.beginPath();c.moveTo(x,y);
    const segs=5+Math.floor(Math.random()*4);
    for(let s2=0;s2<segs;s2++){
      a+=(Math.random()-.5)*1.2;
      const len=14+Math.random()*22;
      x+=Math.cos(a)*len;y+=Math.sin(a)*len;
      c.lineTo(Math.max(6,Math.min(250,x)),Math.max(6,Math.min(250,y)));
    }
    c.strokeStyle="rgba(255,64,48,.55)";c.lineWidth=7;c.lineCap="round";c.stroke();
    c.strokeStyle="rgba(255,176,110,.85)";c.lineWidth=2.6;c.stroke();
    c.strokeStyle="rgba(255,236,200,.95)";c.lineWidth=1;c.stroke();
  }
  const g=c.createRadialGradient(128,128,8,128,128,120);
  g.addColorStop(0,"rgba(255,96,48,.5)");g.addColorStop(.55,"rgba(160,32,20,.16)");g.addColorStop(1,"rgba(0,0,0,0)");
  c.fillStyle=g;c.fillRect(0,0,256,256);
  return new THREE.CanvasTexture(cv);
}
let crackTex=null;
function rebuildPressureEnvironment(){
  clearPressureEnvironment();
  const lv=(G&&G.level)||1;
  const sigFiss=(levelSigFor(G&&G.level||1).fiss)||0;   // v24.20/v25 关卡特征：额外熔裂
  pressure={time:0,damageTick:0,fissures:[],meshes:[],phase:"calm"};
  if(!crackTex){crackTex=makeCrackTex();keepRes(crackTex);}
  /* 高危裂隙：程序化熔裂地贴 + 危险圈线 + 中心辉光（f.mesh 契约不变：opacity/scale 由 tick 驱动） */
  const crackGeo=new THREE.CircleGeometry(4.6,24);
  for(let i=0;i<3+sigFiss;i++){
    const a=lv*.9+i*Math.PI*2/3,r=25+(i%2)*11,x=Math.cos(a)*r,z=Math.sin(a)*r,y=terrainHeight(x,z);
    const mat=new THREE.MeshBasicMaterial({map:crackTex,transparent:true,opacity:.5,depthWrite:false,fog:false});
    const decal=new THREE.Mesh(crackGeo,mat);decal.rotation.x=-Math.PI/2;decal.rotation.z=i*1.9;decal.position.set(x,y+.14,z);scene.add(decal);
    pressure.fissures.push({x,z,r:4.5,mesh:decal,phase:i*2.1});pressure.meshes.push(decal);
    const line=new THREE.Mesh(new THREE.RingGeometry(4.35,4.5,32),new THREE.MeshBasicMaterial({color:0xff315d,transparent:true,opacity:.4,side:THREE.DoubleSide,depthWrite:false,fog:false}));
    line.rotation.x=-Math.PI/2;line.position.set(x,y+.12,z);scene.add(line);pressure.meshes.push(line);
    const glow=new THREE.Sprite(glowMaterial(0xff6a3a));glow.scale.set(3.4,3.4,1);glow.position.set(x,y+.7,z);scene.add(glow);pressure.meshes.push(glow);
  }
}
function tickPressure(dt){
  /* v32：安全区设定移除，仅保留高危裂隙作为环境危害（纯结构伤害） */
  for(const f of pressure.fissures){f.mesh.material.opacity=.42+.22*Math.abs(Math.sin(G.time*3+f.phase));}
  pressure.damageTick=(pressure.damageTick||0)-dt;
  if(pressure.damageTick<=0){
    pressure.damageTick=1;
    if(pressure.fissures.some(f=>Math.hypot(player.x-f.x,player.z-f.z)<f.r)){
      G.hp=Math.max(0,G.hp-5);hurtFlash=1;toast("高危裂隙 · 结构受损");
    }
  }
}

/* v13.1 无尽深渊：清场、构筑、升级波次；每五波用本章巨兽制造奖励峰值。 */
const ENDLESS_TYPES=["gray","dart","spitter","shield","acid","sniper","swarm","elite"],ENDLESS_BOSSES=["reefCrab","kelpLeviathan","abyssJelly","voidWhale","handX"];
function endlessMonster(type,x,z,wave){const t=MONSTER_TYPES[type]||MONSTER_TYPES.gray,hp=Math.max(1,Math.ceil(t.hp*(1+(wave-1)*.13+(type==="elite"?.3:0)))),m={type,x,z,hp,maxHp:hp,cd:0,phase:Math.random()*6.28,score:Math.ceil((t.score||20)*(1+wave*.06)),base:{x,z}};if(type==="dart")m.lunge={phase:"cruise",t:0,cd:0,dx:0,dz:0};if(type==="spitter")m.spit={windup:0,cd:0};if(t.bossBar)m.bossBar=true;if(soulOn){const moves=SOUL_MOVES[type],poise=SOUL_POISE[type];if(moves&&moves.length)m.moves=moves;if(poise)m.poise={max:poise.max,cur:0,regen:poise.regen,regenDelay:poise.regenDelay,lastHit:0};}return m;}
function endlessBoss(type,wave){const bt=BOSS_TYPES[type]||BOSS_TYPES.handX,gp=gatePos(),hp=Math.ceil(bt.hp*(1+(wave-1)*.1)),b=Object.assign({},bt,{type,x:gp.x,z:gp.z,cd:0,hp,maxHp:hp});if(soulOn){const moves=SOUL_MOVES[type]||SOUL_MOVES.hand,poise=SOUL_POISE[type]||SOUL_POISE.hand;if(moves&&moves.length)b.moves=moves;if(poise)b.poise={max:poise.max,cur:0,regen:poise.regen,regenDelay:poise.regenDelay,lastHit:0};}return b;}
function prepareEndlessWave(wave,rebuild){
  const count=Math.min(20,3+Math.ceil(wave*.72)),available=ENDLESS_TYPES.slice(0,Math.min(ENDLESS_TYPES.length,1+Math.ceil(wave/2))),monsters=[];
  for(let i=0;i<count;i++){const type=available[(i*3+wave)%available.length],a=i*2.399+wave*.73,r=15+(i%4)*7,x=Math.max(-54,Math.min(54,Math.cos(a)*r)),z=Math.max(-54,Math.min(54,Math.sin(a)*r));monsters.push(endlessMonster(type,x,z,wave));}
  /* v24.11 每 5 波词缀精英：迅捷(×1.5速)/护盾(2层破盾)/分裂(死亡分裂幼体) */
  if(wave % 5 === 0){
    const affixes = ["swift", "warded", "splitter"];
    for(let ai = 0; ai < 2 && ai < monsters.length; ai++){
      const mm = monsters[(wave*5 + ai*3 + ai) % monsters.length];
      const aff = affixes[(wave/5 - 1 + ai) % 3];
      mm.affix = aff;
      if(aff === "swift"){ mm.enraged = true; mm.hp = Math.ceil(mm.hp*1.3); mm.maxHp = mm.hp; }
      else if(aff === "warded"){ mm.ward = { t:9999, charges:2 }; mm.hp = Math.ceil(mm.hp*1.5); mm.maxHp = mm.hp; }
      else { mm.type = "elite"; mm.hp = Math.ceil(mm.hp*1.8); mm.maxHp = mm.hp; }
    }
  }
  G.monsters=monsters;G.boss=wave%5===0?endlessBoss(ENDLESS_BOSSES[(Math.floor(wave/5)-1)%ENDLESS_BOSSES.length],wave):null;G.objective={kind:"kill",n:count};G.kills=0;G.winOpen=false;G.spitPulses=[];G.enemyHazards=[];
  G.endless=Object.assign(G.endless||{totalWaves:0,totalKills:0},{wave,cleared:false,pendingWave:0,damageMul:1+(wave-1)*.065,hpMul:1+(wave-1)*.13,bossWave:wave%5===0});
  setMonsterBoost(Math.min(3,1+Math.floor((wave-1)/4)));
  if(rebuild){disposeRoots(pulses.map(p=>p.mesh).filter(Boolean));pulses=[];clearTelegraphRings();buildMonsters(G.monsters);rebuildBossMesh(G.boss?G.boss.type:"handX");bossMesh.visible=false;bossRing.visible=false;gateGroup.visible=false;G.hp=Math.min(G.maxHp,G.hp+Math.ceil(G.maxHp*.18));G.ammo=Math.min(AMMO_MAX,G.ammo+2);buildMinimapLayer();}
}
function tickEndless(){
  if(!G||G.modeId!=="endless"||!G.endless||G.endless.cleared)return;
  const minionsDown=(G.monsters||[]).every(m=>m.hp<=0),bossDown=!G.boss||G.boss.hp<=0;if(!minionsDown||!bossDown)return;
  const en=G.endless,wave=en.wave;en.cleared=true;en.totalWaves=Math.max(en.totalWaves,wave);en.pendingWave=wave+1;const bonus=Math.round(90+wave*28+(en.bossWave?wave*35:0));G.score+=bonus;grantCurrency(2+Math.floor(wave/3)+(en.bossWave?8:0),en.bossWave?"巨兽波次完成":"波次完成");G.hp=Math.min(G.maxHp,G.hp+Math.ceil(G.maxHp*.08));G.oxygen=Math.min(G.maxOxygen,G.oxygen+Math.ceil(G.maxOxygen*.12));
  showTransmission(en.bossWave?"里程碑突破":"无尽协议","第 "+wave+" 波完成 · 结算 +"+bonus+" 分 · 下一波威胁 "+(1+wave*.065).toFixed(2)+" 倍",3600);grantGold(150,"第 "+wave+" 波奖励");
  if(wellRun){
    const dtw=(G.time||0)-(wellRun.waveStart||0);
    wellRun.stars+=dtw<40+wave*4?3:dtw<60+wave*6?2:1;
    if(wave%3===0){const rel=newRelicRoll(wellRun.wave);if(rel)toast("深井掉落 · "+RELIC_RARITY[rel.rarity].name+" "+RELIC_SLOT_NAMES[rel.slot]);grantCrystal(6,"深井供给");}
    if(wave>=12){const total=wellRun.stars;meta.wellBest=Math.max(meta.wellBest||0,12);meta.wellStars=(meta.wellStars||0)+total;wellRun=null;G.wellAffix=null;toast("回响深井通关 · 本次 ★"+total);unlockAchievement("well12");setOver(true);return;}
  }
}
function advanceEndlessWave(){if(!G||G.modeId!=="endless"||!G.endless?.pendingWave)return false;const wave=G.endless.pendingWave;G.endless.pendingWave=0;
  if(wellRun){wellRun.wave=wave;wellRun.waveStart=G.time||0;
    const AFF=[{k:"hp",v:1.25,t:"敌群强化 · 生命 +25%"},{k:"dmg",v:1.2,t:"敌群强化 · 伤害 +20%"},{k:"heal",v:.5,t:"削弱 · 击杀回复 -50%"},{k:"gold",v:1.5,t:"赏金 · 金币 +50%"},{k:"spd",v:1.2,t:"疾风 · 敌群速度 +20%"},{k:"swarm",v:1.3,t:"涌现 · 敌群数量 +30%"}];
    const a1=AFF[wave%AFF.length],a2=AFF[(wave*2+1)%AFF.length];
    G.wellAffix={hp:(a1.k==="hp"?a1.v:(a2.k==="hp"?a2.v:1)),dmg:(a1.k==="dmg"?a1.v:1)*(a2.k==="dmg"?a2.v:1),heal:(a1.k==="heal"?a1.v:1)*(a2.k==="heal"?a2.v:1),gold:(a1.k==="gold"?a1.v:1)*(a2.k==="gold"?a2.v:1)};
    showTransmission("回响深井 · 第 "+wave+" 层",a1.t+(a2.t!==a1.t?" / "+a2.t:""),3400);
  }
  prepareEndlessWave(wave,true);G.state=S.PLAYING;renderRunBuildStrip();toast("第 "+wave+" 波来袭"+(G.endless.bossWave?" · 巨兽里程碑！":""));sound("start");return true;}

/* v14.1 多样化任务：驻留扫描、区域防守、调查+战斗混合目标和三波增援战。 */
let missionMarkers=[];
/* v24.17 扫描塔：驻留扫描点的立体塔建筑（底座/锥柱/顶冠/信标/进度光环），进度沿塔身充能 */
let scanTowers=[];
function buildScanTowers(){
  scanTowers.forEach(t=>disposeRoots([t.g]));
  scanTowers=[];
  if(!G||!G.objective||G.objective.kind!=="scan")return;
  (G.objective.points||[]).forEach((p,i)=>{
    const g=new THREE.Group(),y=terrainHeight(p.x,p.z);
    const baseMat=new THREE.MeshStandardMaterial({color:0x5a4a20,roughness:.7,metalness:.3});
    const base=new THREE.Mesh(new THREE.CylinderGeometry(1.5,1.8,.32,10),baseMat);base.position.y=.16;
    const shaft=new THREE.Mesh(new THREE.CylinderGeometry(.34,.52,4.4,8),baseMat);shaft.position.y=2.4;
    const cap=new THREE.Mesh(new THREE.ConeGeometry(.62,.8,8),new THREE.MeshStandardMaterial({color:0xd9c08a,roughness:.4,metalness:.4}));cap.position.y=4.9;
    const beacon=new THREE.Mesh(new THREE.SphereGeometry(.24,10,7),new THREE.MeshBasicMaterial({color:0xffd66b,fog:false}));beacon.position.y=5.4;
    const fillMat=new THREE.MeshBasicMaterial({color:0xffd66b,transparent:true,opacity:.85,fog:false});
    const fill=new THREE.Mesh(new THREE.CylinderGeometry(.58,.58,3.8,10,1,true),fillMat);
    fill.position.y=.7;
    const halo=new THREE.Sprite(glowMaterial(0xffd66b));halo.scale.set(2.6,2.6,1);halo.position.y=2.4;
    g.add(base,shaft,cap,beacon,fill,halo);
    g.position.set(p.x,y,p.z);
    scene.add(g);
    scanTowers.push({g,fill,beacon,halo,index:i});
  });
}
/* v35 楼梯攀爬塔（替代原传送塔） */
/* v35 楼梯攀爬塔：螺旋阶梯沿外墙走上去（无需挂壁），顶部平台可站立俯瞰；每关 2 座 */
let stairTowers=[],stairSurfaces=[];
function buildStairTowers(){
  stairTowers.forEach(t=>disposeRoots([t.g]));stairTowers=[];stairSurfaces=[];
  if(!G||G.modeId!=="campaign")return;
  const lv=G.level||1;
  const spots=[{a:lv*1.1,r:26},{a:lv*2.3+1.2,r:30}];
  for(let si=0;si<2;si++){
    const sp=spots[si],p={x:Math.cos(sp.a)*sp.r,z:Math.sin(sp.a)*sp.r};
    const g=new THREE.Group(),y=terrainHeight(p.x,p.z);
    const H=7.2,R=2.2,turns=1.25,steps=26;
    const mat=new THREE.MeshStandardMaterial({color:0x2f4a52,roughness:.55,metalness:.45});
    const core=new THREE.Mesh(new THREE.CylinderGeometry(R-.95,R-.75,H,10),mat);core.position.y=H/2;g.add(core);
    const cap=new THREE.Mesh(new THREE.CylinderGeometry(R+.35,R+.35,.18,14),new THREE.MeshStandardMaterial({color:0x35545e,roughness:.5,metalness:.5}));cap.position.y=H;g.add(cap);
    const rail=new THREE.Mesh(new THREE.TorusGeometry(R+.28,.05,6,26),new THREE.MeshBasicMaterial({color:0x7fffd4,transparent:true,opacity:.75,fog:false}));rail.rotation.x=Math.PI/2;rail.position.y=H+.7;g.add(rail);
    const stepMat=new THREE.MeshStandardMaterial({color:0x3a5a63,roughness:.5,metalness:.4});
    for(let i2=0;i2<steps;i2++){
      const a2=sp.a+i2/steps*Math.PI*2*turns;
      const sx=Math.cos(a2)*R,sz=Math.sin(a2)*R,sy=(i2+1)/steps*(H-.2);
      const step=new THREE.Mesh(new THREE.BoxGeometry(.95,.14,.62),stepMat);
      step.position.set(sx,sy-.07,sz);step.rotation.y=-a2+Math.PI/2;
      g.add(step);
      if(i2%3===0){const post=new THREE.Mesh(new THREE.BoxGeometry(.06,.7,.06),stepMat);post.position.set(Math.cos(a2)*(R+.3),sy+.32,Math.sin(a2)*(R+.3));g.add(post);}
    }
    const beacon=new THREE.Mesh(new THREE.SphereGeometry(.2,8,6),new THREE.MeshBasicMaterial({color:0xffe9a8,fog:false}));beacon.position.y=H+.95;g.add(beacon);
    g.position.set(p.x,y,p.z);scene.add(g);
    stairTowers.push({g:g,pos:p,top:H,ang0:sp.a,turns:turns});
    stairSurfaces.push({x:p.x,z:p.z,r:R+.35,base:y,top:H,ang0:sp.a,turns:turns});
    if(G){G.solids=G.solids||[];G.solids.push({x:p.x,z:p.z,r:R-1.0});}   // 塔芯碰撞体
  }
}

/* v24.22 攀爬系统：可攀爬面注册表（扫描塔/传送塔/攀爬墙统一为环绕圆柱模型） */
let climbWalls=[],climbSurfaces=[];
function refreshClimbSurfaces(){
  climbSurfaces=[];
  for(const t of scanTowers){const p=t.g.position;climbSurfaces.push({x:p.x,z:p.z,r:1.8,top:p.y+5.5});(G.solids=G.solids||[]).push({x:p.x,z:p.z,r:1.35});}   // v35 扫描塔芯碰撞
  for(const t of stairTowers){climbSurfaces.push({x:t.pos.x,z:t.pos.z,r:2.55,top:t.top});}   // v35 楼梯塔顶平台可站立
  for(const w of climbWalls){climbSurfaces.push({x:w.x,z:w.z,r:w.r,top:w.top});}
}
function buildClimbWalls(){
  climbWalls.forEach(w=>disposeRoots([w.g]));climbWalls=[];
  if(!G||G.modeId!=="campaign")return;
  const lv=(G&&G.level)||1;
  for(let i=0;i<2;i++){
    const a=lv*2.2+i*Math.PI,r=20+(i%2)*10,x=Math.cos(a)*r,z=Math.sin(a)*r,y=terrainHeight(x,z);
    const g=new THREE.Group();
    const mat=new THREE.MeshStandardMaterial({color:0x3d5a66,roughness:.85,metalness:.1});
    const slab=new THREE.Mesh(new THREE.BoxGeometry(7,5.6,.9),mat);slab.position.y=2.8;g.add(slab);
    const holdMat=new THREE.MeshStandardMaterial({color:0x7fe0b0,emissive:0x1a4a3a,roughness:.5});
    const holdGeo=new THREE.BoxGeometry(.32,.15,.2),holds=new THREE.InstancedMesh(holdGeo,holdMat,8),hm=new THREE.Matrix4();
    for(let h2=0;h2<8;h2++){hm.makeTranslation(-2.4+(h2%4)*1.6,.9+h2*.55,.48);holds.setMatrixAt(h2,hm);}
    holds.instanceMatrix.needsUpdate=true;g.add(holds);
    const lip=new THREE.Mesh(new THREE.BoxGeometry(7.4,.24,1.4),new THREE.MeshStandardMaterial({color:0x54707c,roughness:.7}));
    lip.position.set(0,5.7,.5);g.add(lip);
    g.position.set(x,y,z);g.rotation.y=i*1.4;
    scene.add(g);
    climbWalls.push({g,x,z,r:3.4,top:y+5.7});
  }
}
function clearMissionMarkers(){disposeRoots(missionMarkers);missionMarkers=[];scanTowers.forEach(t=>disposeRoots([t.g]));scanTowers=[];stairTowers.forEach(t=>disposeRoots([t.g]));stairTowers=[];stairSurfaces=[];climbWalls.forEach(w=>disposeRoots([w.g]));climbWalls=[];}
function rebuildMissionMarkers(){clearMissionMarkers();if(!G||G.modeId!=="campaign"||!G.objective)return;const obj=G.objective,make=(x,z,r,color,kind,index)=>{const mat=new THREE.MeshBasicMaterial({color,transparent:true,opacity:.48,side:THREE.DoubleSide,depthWrite:false,fog:false}),ring=new THREE.Mesh(new THREE.RingGeometry(Math.max(.5,r-.22),r,32),mat);ring.rotation.x=-Math.PI/2;ring.position.set(x,terrainHeight(x,z)+.16,z);ring.userData={kind,index,baseR:r};scene.add(ring);missionMarkers.push(ring);};if(obj.kind==="scan")(obj.points||[]).forEach((p,i)=>make(p.x,p.z,2.8,0xffd66b,"scan",i));else if(obj.kind==="defend")make(obj.x,obj.z,obj.r,0x63e8cf,"defend",0);buildScanTowers();buildStairTowers();buildClimbWalls();refreshClimbSurfaces();}
function spawnGauntletWave(wave){const count=4+wave*2,types=ENDLESS_TYPES.slice(0,Math.min(4,1+wave)),list=[];for(let i=0;i<count;i++){const a=i*2.31+wave,r=17+(i%3)*8;list.push(endlessMonster(types[(i+wave)%types.length],Math.cos(a)*r,Math.sin(a)*r,Math.max(1,(G.level||1)-10+wave)));}G.monsters=list;G.spitPulses=[];G.enemyHazards=[];buildMonsters(list);showTransmission("秘密基地警报","增援第 "+wave+"/3 波抵达 · "+count+" 个敌对信号",3200);toast("增援波次 "+wave+"/3");}
function tickCampaignObjective(dt){
  if(!G||G.modeId!=="campaign"||!G.objective)return;const obj=G.objective;
  if(obj.kind==="scan"){G.scanDone=G.scanDone||[];G.scanHold=G.scanHold||[];for(let i=0;i<(obj.points||[]).length;i++){if(G.scanDone[i])continue;const p=obj.points[i],inside=Math.hypot(player.x-p.x,player.z-p.z)<3;G.scanHold[i]=Math.max(0,(G.scanHold[i]||0)+(inside?dt:-dt*.7));if(G.scanHold[i]>=obj.hold){G.scanDone[i]=true;G.score+=45;toast("扫描节点 "+(i+1)+"/"+obj.points.length+" 完成");sound("pickup");}}}
  else if(obj.kind==="defend"&&!G.defendComplete){const inside=Math.hypot(player.x-obj.x,player.z-obj.z)<obj.r;G.defendProgress=Math.max(0,Math.min(obj.t,(G.defendProgress||0)+(inside?dt:-dt*.35)));if(G.defendProgress>=obj.t){G.defendComplete=true;G.defendProgress=obj.t;G.score+=80;toast("中继防守完成 · 舱门坐标已解锁");sound("pickup");}if(inside&&Math.floor(G.defendProgress||0)>Math.floor((G.defendLast||0)/5)*5){G.defendLast=G.defendProgress;}}
  else if(obj.kind==="gauntlet"){G.gauntletWave=G.gauntletWave||1;if((G.monsters||[]).every(m=>m.hp<=0)&&G.gauntletWave<obj.waves){G.gauntletWave++;spawnGauntletWave(G.gauntletWave);}}
  for(const m of missionMarkers){m.rotation.z+=dt*.22;if(m.userData.kind==="scan"){const done=!!(G.scanDone&&G.scanDone[m.userData.index]);m.material.color.setHex(done?0x63e8cf:0xffd66b);m.material.opacity=done?.22:.48;}else{const pulse=1+.025*Math.sin(G.time*4);m.scale.setScalar(pulse);}}
  /* v24.19 扫描塔完成：全屏涟漪演出（JS 生成，动画结束自毁） */
  for(const t of scanTowers){
    const prog=Math.min(1,(G.scanHold&&G.scanHold[t.index]||0)/((G.objective&&G.objective.hold)||2.4));
    const done=!!(G.scanDone&&G.scanDone[t.index]);
    if(done&&!t.wasDone){
      t.wasDone=true;
      const d=document.createElement("div");
      d.style.cssText="position:fixed;left:50%;top:50%;width:40px;height:40px;margin:-20px 0 0 -20px;border:3px solid rgba(99,232,207,.9);border-radius:50%;pointer-events:none;z-index:8;box-shadow:0 0 24px rgba(99,232,207,.6),inset 0 0 12px rgba(99,232,207,.4);";
      document.body.appendChild(d);
      let s2=1,op=1;
      const iv=setInterval(()=>{s2+=.14;op-=.045;d.style.transform="scale("+s2.toFixed(2)+")";d.style.opacity=op.toFixed(2);if(op<=0){clearInterval(iv);d.remove();}},16);
      sound("perfect");addShake(.2);
    }
    t.fill.visible=prog>.02&&!done;
    t.fill.scale.set(1,Math.max(.05,prog),1);t.fill.position.y=.7+1.9*prog;
    const col=done?0x63e8cf:0xffd66b;
    t.beacon.material.color.setHex(col);t.halo.material.color.setHex(col);
    t.halo.material.opacity=.5+.2*Math.sin(G.time*3);
    t.g.rotation.y+=dt*(done?.1:.5);
  }
}

let hitMarkerTimer=0;
function showHitMarker(kill){
  const el=document.getElementById("hitMarker");el.classList.toggle("kill",!!kill);el.classList.add("show");
  clearTimeout(hitMarkerTimer);hitMarkerTimer=setTimeout(()=>el.classList.remove("show"),kill?170:105);
}

/* ================= v23 原神式飘浮伤害数字（DOM 池 + 每帧投影，池上限 18） ================= */
const _dmgVec=new THREE.Vector3();
let dmgNums=[];
function spawnDmgNum(x,y,z,text,color,big){
  if(settings.dmgNums===false)return;   // v24.13：设置页可关闭伤害数字
  if(lowQ&&input.isTouch)return;   // 受限移动设备跳过（省 DOM 与合成层开销）
  let n=null;
  for(const d of dmgNums)if(d.life<=0){n=d;break;}
  if(!n){
    if(dmgNums.length>=18)n=dmgNums[0];   // 池满复用最旧
    else{
      const elm=document.createElement("div");elm.className="dmgnum";
      const hud=_el("hud");(hud||document.body).appendChild(elm);
      n={el:elm,x:0,y:0,z:0,life:0,vy:0};dmgNums.push(n);
    }
  }
  n.x=x+(Math.random()-.5)*.9;n.y=y;n.z=z+(Math.random()-.5)*.9;
  n.life=big?.85:.65;n.vy=1.7+(big?.6:0);
  n.el.textContent=text;n.el.style.color=color||"#eafff8";
  n.el.className="dmgnum"+(big?" big":"");
}
function tickDmgNums(dt){
  for(const d of dmgNums){
    if(d.life<=0)continue;
    d.life-=dt;d.y+=d.vy*dt;d.vy*=Math.max(0,1-dt*2.1);
    if(d.life<=0){d.el.style.opacity="0";continue;}
    _dmgVec.set(d.x,d.y,d.z).project(camera);
    if(_dmgVec.z>1){d.el.style.opacity="0";d.life=0;continue;}
    const sx=(_dmgVec.x*.5+.5)*innerWidth,sy=(-_dmgVec.y*.5+.5)*innerHeight;
    const k=d.life>.5?1.12:Math.max(.6,d.life/.5);
    d.el.style.transform="translate(-50%,-50%) translate("+sx.toFixed(1)+"px,"+sy.toFixed(1)+"px) scale("+k.toFixed(2)+")";
    d.el.style.opacity=Math.min(1,d.life*3).toFixed(2);
  }
}

/* ================= 输入（ADR-003：Pointer Events 统一 → 语义动作流） ================= */
/* 统一输入抽象：PC 键鼠（WASD/Shift/Space/E/鼠标环顾/左键脉冲/Esc）与移动端触屏
   （左摇杆 move+外推冲刺 / 右半屏拖拽 look / 屏幕按钮 jump/pickup/pulse/pause）
   都产出同一语义动作 {move, look, jump, pickup, pulse, pause}，逻辑层不感知设备。 */
const input = globalThis.__D3D_INPUT.createInput({
  canvas,
  lookZone: document.getElementById("lookZone"),
  joyZone: document.getElementById("joyZone"),
  joystickBase: document.getElementById("joyBase"),
  joystickKnob: document.getElementById("joyKnob"),
  buttons: {
    jump: document.getElementById("btnJump"),
    pickup: document.getElementById("btnPickup"),
    pulse: document.getElementById("btnPulse"),
    pause: document.getElementById("btnPause")
  },
  sensitivity: 0.45   // 触屏环顾灵敏度基线（0.3–0.8 可调，UX §2.2）
});
const btnPickup = document.getElementById("btnPickup");
const btnDash = document.getElementById("btnDash");
const dashChip = document.getElementById("dashChip");
let dashQueued=false;
let shieldQueued=false,overdriveQueued=false;const skillQueued=[false,false,false];
let chargeT=0,chargeReady=false;   // v23 蓄力重击状态（按住发射键计时时长 / 就绪标记）
let bossCineT=0,bossCineDone=false,bossCineName="",bossCineSub="";   // v23.1 巨兽出场运镜
const _cineVec=new THREE.Vector3(),_cineLook=new THREE.Vector3();
const _muzzleVec=new THREE.Vector3();let muzzleT=0;   // v23.3 枪口焰计时
/* v23.3 枪口焰：发射器世界坐标喷发 + 发射器短暂放大 */
function muzzleFlash(){
  toolEmitter.getWorldPosition(_muzzleVec);
  burstParticle(_muzzleVec.x,_muzzleVec.y,_muzzleVec.z,0x7fffd4,5);
  burstParticle(_muzzleVec.x,_muzzleVec.y,_muzzleVec.z,0xd8fff0,3);
  spawnEchoRing(_muzzleVec.x,_muzzleVec.y,_muzzleVec.z,0xd8fff0,.5);
  muzzleT=.09;
}
function tryDash(act){
  if(!G||G.state!==S.PLAYING||(G.dashCool||0)>0)return false;
  const f={x:-Math.sin(player.yaw),z:-Math.cos(player.yaw)},r={x:Math.cos(player.yaw),z:-Math.sin(player.yaw)};
  let dx=f.x*act.move.z+r.x*act.move.x,dz=f.z*act.move.z+r.z*act.move.x,len=Math.hypot(dx,dz);
  if(len<.1){dx=f.x;dz=f.z;len=1;}dx/=len;dz/=len;
  const ox=player.x,oz=player.z;
  for(let i=0;i<8;i++){
    let nx=player.x+dx*.62,nz=player.z+dz*.62;[nx,nz]=resolveCollision(nx,nz,.7);[nx,nz]=clampToMap(nx,nz);player.x=nx;player.z=nz;
  }
  player.y=terrainHeight(player.x,player.z)+1.7;player.vy=0;
  G.dashCool=2.4*(G.dashCoolMul||1);G.dashIFrame=.34;
  burstParticle(ox,terrainHeight(ox,oz)+1,oz,0x7fffd4,14);sound("dash");vibrate(16);addShake(.24);
  /* v23.3 冲刺残影环：沿冲刺路径三连扩散环 + 轻微镜头收缩 */
  for(let st=1;st<=3;st++)spawnEchoRing(ox+(player.x-ox)*st/3,player.y-.2,oz+(player.z-oz)*st/3,0x7fffd4,1.15);
  fovPunch=Math.max(fovPunch,2);
  return true;
}
function updateDashUI(){
  const cd=G?Math.max(0,G.dashCool||0):0,ready=cd<=0;
  dashChip.classList.toggle("cooling",!ready);_setETxt(dashChip,ready?"闪":cd.toFixed(1));   // v23：值变化才写 DOM
  btnDash.classList.toggle("cooling",!ready);_setETxt(btnDash,ready?"":String(Math.ceil(cd)));   // v29 图标即按键
}
/* ============================================================
   v28 角色专属主动技（每角色 3 个，F/R/C 或 1/2/3 施放）
   浣生 · 远程：弱点标记 / 磁轨贯日 / 相位撤离
   迈尔辛 · 近战：髓瓷护幕 / 震荡重锤 / 工程超频
   帕米尔 · 范围：榴弹弹幕 / 火箭轰炸 / 肾上腺素
   ============================================================ */
const ROLE_SKILLS={
  explorer:[
    {name:"弱点标记",desc:"标记最近的敌人 6 秒：对其伤害 +50%",cool:10,cast:castMarkTarget},
    {name:"磁轨贯日",desc:"沿准星释放贯穿光轨：长 30 · 宽 1.2 · 伤害 600%",cool:16,cast:castRailgun},
    {name:"相位撤离",desc:"向后闪现 6 米，并获得 1.5 秒相位虚化（免疫）",cool:12,cast:castPhaseShift}],
  guardian:[
    {name:"髓瓷护幕",desc:"3.5 秒免疫护幕（双层线框旋转）",cool:18,cast:castGuardShield},
    {name:"震荡重锤",desc:"砸地冲击：半径 5 环形伤害 320% + 强击退",cool:14,cast:castSlam},
    {name:"工程超频",desc:"6 秒增伤加速，蒸汽火花缠绕",cool:22,cast:castGuardOverdrive}],
  hunter:[
    {name:"榴弹弹幕",desc:"朝准星扇形抛射 5 枚榴弹，逐发爆裂",cool:12,cast:castBarrage},
    {name:"火箭轰炸",desc:"标记前方 3 处落点，依次延迟轰击",cool:18,cast:castStrike},
    {name:"肾上腺素",desc:"5 秒射速狂热：武器冷却 -45%",cool:20,cast:castAdrenaline}]
};
let skillFxBeams=[];
function castRoleSkill(slot){
  if(!G||G.state!==S.PLAYING)return;
  const list=ROLE_SKILLS[G.roleId]||ROLE_SKILLS.explorer,sk=list[slot];
  if(!sk)return;
  if(G.skillCd&&G.skillCd[slot]>0){toast(sk.name+" 冷却中 · "+Math.ceil(G.skillCd[slot])+"s");return;}
  const ch=charState(G.roleId);
  const tl=ch.talents||[1,1,1];
  const branch=ch.branches&&ch.branches[slot];
  G.skillPow=1+.06*((tl[slot]||1)-1);G.skillCool=1-.04*((tl[slot]||1)-1);
  G.skillBranch=branch;   // v41 天赋分岔
  if(!sk.cast())return;
  G.skillCd=G.skillCd||[0,0,0];G.skillCd[slot]=sk.cool*G.skillCool;
  /* v41 天赋分岔加成 */
  if(G.skillBranch==="a"&&slot===1)G.slow=Math.max(G.slow||0,0);/* 贯日 A：额外效果 */
  if(G.skillBranch==="b"&&slot===2)spawnEchoRing(player.x,player.y-.3,player.z,0x9fe8ff,3);
  renderSkillChipsToast(slot,sk);
}
function renderSkillChipsToast(slot,sk){showTransmission("技能 · "+sk.name,sk.desc,2600);}
function castMarkTarget(){
  let bm=null,bd=1e9;
  for(const m of G.monsters){if(m.hp<=0)continue;const d=Math.hypot(m.x-player.x,m.z-player.z);if(d<bd){bd=d;bm=m;}}
  if(!bm){toast("无目标可标记");return false;}
  bm.marked=6;
  spawnEchoRing(bm.x,terrainHeight(bm.x,bm.z)+.6,bm.z,0xffd66b,1.8);
  burstParticle(bm.x,terrainHeight(bm.x,bm.z)+1.4,bm.z,0xffd66b,14);
  spawnDmgNum(bm.x,terrainHeight(bm.x,bm.z)+2.4,bm.z,"标记!","#ffd66b",true);
  sound("lock");return true;
}
function castRailgun(){
  const dir=new THREE.Vector3();camera.getWorldDirection(dir);
  const yaw=Math.atan2(dir.x||.001,dir.z||.001);
  const hits=lineBurst(player.x,player.z,yaw,30,1.2,6,1);
  for(const e of hits)handleCombatEvent(e);
  spawnBeamFx(player.x,player.y,player.z,yaw,30,0x7fffd4);
  addShake(.45);addHitStop(.07);sound("charged");return true;
}
function spawnBeamFx(x,y,z,yaw,length,colorHex){
  const grp=new THREE.Group();grp.position.set(x,y,z);
  const mat=new THREE.MeshBasicMaterial({color:colorHex,transparent:true,opacity:.85,depthWrite:false,blending:THREE.AdditiveBlending,fog:false});
  const cyl=new THREE.Mesh(new THREE.CylinderGeometry(.24,.24,length,8,1,true),mat);
  cyl.rotation.x=Math.PI/2;cyl.position.z=length/2;grp.add(cyl);
  const glow=new THREE.Sprite(glowMaterial(colorHex));glow.scale.set(2.4,2.4,1);glow.position.z=length*.4;grp.add(glow);
  grp.lookAt(x+Math.sin(yaw)*2,y,z+Math.cos(yaw)*2);
  scene.add(grp);skillFxBeams.push({mesh:grp,life:.34,max:.34});
}
function castPhaseShift(){
  const yaw=player.yaw||0;
  player.x-=Math.sin(yaw)*6;player.z-=Math.cos(yaw)*6;
  G.phaseT=1.5;
  spawnBeamFx(player.x,player.y,player.z,yaw+Math.PI,6,0xb8fff0);
  burstParticle(player.x,player.y,player.z,0xb8fff0,18);
  sound("dash");toast("相位撤离 · 虚化 1.5s");return true;
}
function castGuardShield(){return activateShield();}
function castSlam(){
  const hits=ringBurst(player.x,player.z,5,3.2,3.2,4);
  for(const e of hits)handleCombatEvent(e);
  spawnEchoRing(player.x,player.y-.3,player.z,0x6fa8ff,5);
  spawnEchoRing(player.x,player.y-.3,player.z,0xbfe8ff,3.4);
  burstParticle(player.x,player.y,player.z,0x9fc8ff,26);
  addShake(.7);addHitStop(.08);sound("charged");return true;
}
function castGuardOverdrive(){return activateOverdrive();}
function castBarrage(){
  const yaw=player.yaw||0;
  for(let k=0;k<5;k++){
    const ang=(k-2)*.22;
    const res=fireWeapon(3,player.x,player.y+.4,player.z,Math.sin(yaw+ang),.12,Math.cos(yaw+ang),yaw+ang);
    if(res&&!Array.isArray(res)){const mesh=buildProjectileMesh(res);res.mesh=mesh;pulses.push(res);}
  }
  muzzleFlash();sound("shoot");addShake(.25);return true;
}
function castStrike(){
  const yaw=player.yaw||0;
  G.strikes=G.strikes||[];
  for(let k=0;k<3;k++){
    const d=6+k*4,a=yaw+(k-1)*.3;
    G.strikes.push({x:player.x+Math.sin(a)*d,z:player.z+Math.cos(a)*d,t:1.0+k*.35});
  }
  toast("火箭轰炸 · 落点标记");sound("lock");return true;
}
function castAdrenaline(){
  G.adrenalineT=5;
  burstParticle(player.x,player.y,player.z,0xff8a4a,24);
  spawnEchoRing(player.x,player.y-.3,player.z,0xff8a4a,2.6);
  sound("overdrive");addShake(.25);toast("肾上腺素 · 射速狂热 5s");return true;
}
const shieldBubble=new THREE.Mesh(new THREE.SphereGeometry(1.25,20,12),new THREE.MeshBasicMaterial({color:0x63e8cf,transparent:true,opacity:.055,side:THREE.BackSide,depthWrite:false,blending:THREE.AdditiveBlending,fog:false}));
shieldBubble.visible=false;scene.add(shieldBubble);
/* v23.3 技能特效：护幕线框外壳（激活时双层呼吸旋转） */
const shieldWire=new THREE.Mesh(new THREE.IcosahedronGeometry(1.36,1),new THREE.MeshBasicMaterial({color:0x9fffe8,wireframe:true,transparent:true,opacity:.15,blending:THREE.AdditiveBlending,depthWrite:false,fog:false}));
shieldWire.visible=false;scene.add(shieldWire);keepRes(shieldWire.geometry,shieldWire.material);
let shieldWasOn=false,overdriveWasOn=false,overdriveFxT=0;
function activateShield(){
  if(!G||G.state!==S.PLAYING||(G.shieldCool||0)>0)return false;
  G.shield=3.5*(G.shieldDurationMul||1);G.shieldCool=18*(G.shieldCoolMul||1);burstParticle(player.x,player.y,player.z,selectedRole().accent,22);sound("shield");vibrate(24);toast("髓瓷护幕 · "+G.shield.toFixed(1)+" 秒免疫");return true;
}
function activateOverdrive(){
  if(!G||G.state!==S.PLAYING||(G.overdriveCool||0)>0)return false;
  G.overdrive=6*(G.overdriveDurationMul||1);G.overdriveCool=22;burstParticle(player.x,player.y,player.z,0xd9c08a,24);sound("overdrive");addShake(.3);toast("神经超频 · "+G.overdrive.toFixed(1)+" 秒增伤加速");return true;
}
function updateSkillUI(){
  /* v28：三技能芯片（每角色独立技能组），文案/冷却走变化检测 */
  const rid=G.roleId||runSelection.roleId,list=ROLE_SKILLS[rid]||ROLE_SKILLS.explorer;
  for(let si3=0;si3<3;si3++){
    const chip=_el("skillChip"+si3);if(!chip)continue;
    const sk=list[si3];if(!sk)continue;
    const cd=(G.skillCd&&G.skillCd[si3]>0)?G.skillCd[si3]:0;
    let label=cd>0?Math.ceil(cd)+"s":sk.name;
    if(si3===0&&rid==="guardian"&&(G.shield||0)>0)label=sk.name+" "+G.shield.toFixed(1)+"s";
    if(si3===2&&rid==="guardian"&&(G.overdrive||0)>0)label=sk.name+" "+G.overdrive.toFixed(1)+"s";
    if(si3===2&&rid!=="guardian"&&(G.overdrive||0)>0)label=sk.name+" "+G.overdrive.toFixed(1)+"s";
    chip.classList.toggle("active",cd<=0);
    if(chip.__tv!==label){chip.__tv=label;chip.firstChild.nodeValue=label;}
  }
  const sa=(G.shield||0)>0,oa=(G.overdrive||0)>0,scd=Math.max(0,G.shieldCool||0),ocd=Math.max(0,G.overdriveCool||0);   // v33b 恢复声明
  shieldBubble.visible=sa;if(sa){shieldBubble.position.set(player.x,player.y-.25,player.z);shieldBubble.rotation.y+=.025;}
  /* v23.3 技能特效：护幕双层呼吸旋转 + 开启/破碎冲击；超频激活冲击环 + 持续金色火花 */
  shieldWire.visible=sa;
  if(sa){
    shieldWire.position.set(player.x,player.y-.25,player.z);
    shieldWire.rotation.y-=.02;shieldWire.rotation.x+=.008;
    shieldWire.material.opacity=.12+.07*Math.sin(G.time*6);
    if(!shieldWasOn){shieldWasOn=true;spawnEchoRing(player.x,player.y-.3,player.z,0x63e8cf,2.2);burstParticle(player.x,player.y,player.z,0x63e8cf,14);addShake(.2);}
  } else if(shieldWasOn){
    shieldWasOn=false;
    burstParticle(player.x,player.y,player.z,0x63e8cf,18);spawnEchoRing(player.x,player.y-.3,player.z,0x63e8cf,1.8);sound("thud");
  }
  if(oa&&!overdriveWasOn){overdriveWasOn=true;spawnEchoRing(player.x,player.y-.4,player.z,0xd9c08a,2.6);burstParticle(player.x,player.y,player.z,0xd9c08a,20);addShake(.3);addHitStop(.05);}
  else if(!oa&&overdriveWasOn){overdriveWasOn=false;burstParticle(player.x,player.y,player.z,0xd9c08a,10);}
  if(oa){overdriveFxT-=dt;if(overdriveFxT<=0){overdriveFxT=.4;burstParticle(player.x+(Math.random()-.5)*.8,player.y+(Math.random()-.5)*.6,player.z,0xd9c08a,2);}}
  {const kb=["btnShield","btnOverdrive","btnWeapon"];
   const rid2=G.roleId||runSelection.roleId,skl=ROLE_SKILLS[rid2]||ROLE_SKILLS.explorer;
   for(let si4=0;si4<3;si4++){
     const b=_el(kb[si4]);if(!b)continue;
     const cd=(G.skillCd&&G.skillCd[si4]>0)?G.skillCd[si4]:0,full=(skl[si4]&&skl[si4].cool)||15;
     _setETxt(b,cd>0?String(Math.ceil(cd)):"");
     const pct=cd>0?Math.min(100,Math.round(cd/full*100)):0;
     if(b.__cd!==pct){b.__cd=pct;const ic=b.dataset.bicon;
       b.style.backgroundImage=ic?("url(\""+ic+"\")"+(pct>0?",conic-gradient(rgba(2,8,14,.82) "+pct+"%,rgba(0,0,0,0) 0)":"")):"";
       b.style.backgroundSize=ic?"62% 62%,100% 100%":"";
       b.style.backgroundPosition="center,center";b.style.backgroundRepeat="no-repeat,no-repeat";}
   }}
  viewEmitterMat.color.set(oa?0xd9c08a:(WEAPON_UI[G.weapon||1]||WEAPON_UI[1]).color);
  const es=_el("enemyStatus"),st=[];
  if((G.slow||0)>0)st.push("腐蚀减速 "+G.slow.toFixed(1)+"s");
  if((G.bleed||0)>0)st.push("裂伤 "+G.bleed.toFixed(1)+"s");
  const est=st.join(" · ");
  if(es.__tv!==est){es.__tv=est;es.textContent=est;}
  es.classList.toggle("show",st.length>0);
}
/* 设置恢复（S5）：灵敏度写入输入层（0.3–0.8 钳制），其余设置生效（默认 aimAssist/vibrate 开） */
if(saved && saved.settings){
  if(typeof saved.settings.sensitivity === "number"){
    settings.sensitivity = Math.max(0.3, Math.min(0.8, saved.settings.sensitivity));
    input.setSensitivity(settings.sensitivity);
  }
  settings.mute = !!saved.settings.mute;
  settings.vibrate = saved.settings.vibrate !== false;
  settings.reduceFlicker = !!saved.settings.reduceFlicker;
  settings.aimAssist = saved.settings.aimAssist !== false;
}

/* v9：菜单选择与本地记忆。三种模式均绑定真实逻辑分支。 */
function selectedMode(){return RUN_MODES[runSelection.modeId]||RUN_MODES.campaign;}
function selectedRole(){return DIVER_ROLES[runSelection.roleId]||DIVER_ROLES.explorer;}
const DESCENT_CHAPTERS=["大船航务层","雷莫拉维护层","黑色阿尔法层","中微子内核层","髓星接驳层","熔铁荒原","事变大陆","锤翅猎群","忠诚者大桥","重返大船","离奇族秘道","违望者登船","首领的椅子","液氢之海","夺船前夜","雷莫拉战线","监狱假说","脊柱之战","液氢洪水","荒凉苏醒","建造者囚室","大船觉醒","恒星回避","重封髓星","驶向室女座"];
const ROUTE_KIND={combat:{icon:"●",label:"战斗舱",reward:"金币 +120"},merchant:{icon:"◈",label:"星际商栈",reward:"船币消费"},event:{icon:"?",label:"未知事件",reward:"金币 +150"},relic:{icon:"⬡",label:"补给舱",reward:"开局金币 +300"},elite:{icon:"✦",label:"精英航路",reward:"清空赏金 +300"},boss:{icon:"◆",label:"巨兽关口",reward:"巨额赏金"}};
const DESCENT_LAYOUT=(()=>{const nodes=[],links=[];for(let c=0;c<25;c++){const s=c*4,y=76+c*300,entry={id:"s"+s+"-entry",stage:s,x:50,y,kind:"combat"},rowA=[{id:"s"+(s+1)+"-left",stage:s+1,x:18,y:y+82,kind:"combat"},{id:"s"+(s+1)+"-mid",stage:s+1,x:50,y:y+82,kind:"event"},{id:"s"+(s+1)+"-right",stage:s+1,x:82,y:y+82,kind:"relic"}],rowB=[{id:"s"+(s+2)+"-left",stage:s+2,x:24,y:y+164,kind:"event"},{id:"s"+(s+2)+"-mid",stage:s+2,x:50,y:y+164,kind:"elite"},{id:"s"+(s+2)+"-right",stage:s+2,x:76,y:y+164,kind:"combat"}],boss={id:"s"+(s+3)+"-boss",stage:s+3,x:50,y:y+246,kind:"boss"};nodes.push(entry,...rowA,...rowB,boss);for(const a of rowA)links.push([entry.id,a.id]);for(const a of rowA)for(const b of rowB)if(Math.abs(a.x-b.x)<=34)links.push([a.id,b.id]);for(const b of rowB)links.push([b.id,boss.id]);if(c<24)links.push([boss.id,"s"+(s+4)+"-entry"]);}return {nodes,links,height:7620};})();
/* v24.5：杀戮尖塔式节点填充——第 8/16 层固定为商栈节点 */
(function(){
  const m1=DESCENT_LAYOUT.nodes.find(n=>n.stage===8);if(m1)m1.kind="merchant";
  const m2=DESCENT_LAYOUT.nodes.find(n=>n.stage===16);if(m2)m2.kind="merchant";
  /* v25：第二部商栈——第 29/37 关入口层 */
  const m3=DESCENT_LAYOUT.nodes.find(n=>n.stage===28);if(m3)m3.kind="merchant";
  const m4=DESCENT_LAYOUT.nodes.find(n=>n.stage===36);if(m4)m4.kind="merchant";
  /* v26：第三至五部商栈——L49/57、L69/77、L89/97 入口层 */
  const m5=DESCENT_LAYOUT.nodes.find(n=>n.stage===48);if(m5)m5.kind="merchant";
  const m6=DESCENT_LAYOUT.nodes.find(n=>n.stage===56);if(m6)m6.kind="merchant";
  const m7=DESCENT_LAYOUT.nodes.find(n=>n.stage===68);if(m7)m7.kind="merchant";
  const m8=DESCENT_LAYOUT.nodes.find(n=>n.stage===76);if(m8)m8.kind="merchant";
  const m9=DESCENT_LAYOUT.nodes.find(n=>n.stage===88);if(m9)m9.kind="merchant";
  const m10=DESCENT_LAYOUT.nodes.find(n=>n.stage===96);if(m10)m10.kind="merchant";
})();
function routeNodeById(id){return DESCENT_LAYOUT.nodes.find(n=>n.id===id)||null;}
function selectedRouteNode(){return routeNodeById(runSelection.routeId)||DESCENT_LAYOUT.nodes.find(n=>n.stage===runSelection.level)||DESCENT_LAYOUT.nodes[0];}
function applySelectedRouteBonus(){if(runBuild.routeRewardClaimed)return;const node=selectedRouteNode();runBuild.routeRewardClaimed=true;if(node.kind==="relic")grantGold(300,"下潜路线 · 补给舱");else if(node.kind==="event")grantGold(150,"未知事件航路");else if(node.kind==="elite")grantGold(200,"精英航路");else if(node.kind==="combat")grantGold(120,"稳定航段");}
function descentNodeMeta(node){return ROUTE_KIND[node.kind]||ROUTE_KIND.combat;}
function descentNodeUnlocked(node){return node.stage<=Math.max(0,storyMeta.deepest||0);}
function descentPath(a,b){const mid=(a.y+b.y)/2;return "M "+a.x+" "+a.y+" C "+a.x+" "+mid+" "+b.x+" "+mid+" "+b.x+" "+b.y;}
function rebuildStagePicker(){
  const box=document.getElementById("levelPicker");if(!box)return;box.innerHTML="";box.style.height=DESCENT_LAYOUT.height+"px";
  const ns="http://www.w3.org/2000/svg",svg=document.createElementNS(ns,"svg");svg.setAttribute("class","descent-links");svg.setAttribute("viewBox","0 0 100 "+DESCENT_LAYOUT.height);svg.setAttribute("preserveAspectRatio","none");
  for(const edge of DESCENT_LAYOUT.links){const a=routeNodeById(edge[0]),b=routeNodeById(edge[1]),p=document.createElementNS(ns,"path");p.setAttribute("class","descent-link");p.setAttribute("d",descentPath(a,b));p.dataset.to=edge[1];svg.appendChild(p);}box.appendChild(svg);
  for(let c=0;c<DESCENT_CHAPTERS.length;c++){const tag=document.createElement("div");tag.className="descent-chapter";tag.style.top=(14+c*300)+"px";tag.textContent="第 "+(c+1)+" 潜层 · "+DESCENT_CHAPTERS[c];box.appendChild(tag);}
  for(const pos of DESCENT_LAYOUT.nodes){const lv=LEVELS[pos.stage],meta=descentNodeMeta(pos),b=document.createElement("button"),icon=document.createElement("span"),num=document.createElement("b"),name=document.createElement("small"),type=document.createElement("em");b.type="button";b.className="level-choice descent-node "+pos.kind;b.dataset.level=String(pos.stage);b.dataset.routeId=pos.id;b.style.left=pos.x+"%";b.style.top=pos.y+"px";icon.className="node-icon";icon.textContent=meta.icon;num.textContent="深度 "+String(lv.id).padStart(2,"0");name.textContent=lv.name;type.textContent=meta.label+" · "+meta.reward;b.append(icon,num,name,type);box.appendChild(b);}
}
function centerDescentSelection(smooth){const cur=document.querySelector("#levelPicker [data-route-id='"+runSelection.routeId+"']")||document.querySelector("#levelPicker [data-level='"+runSelection.level+"']"),scroll=document.querySelector(".descent-scroll");if(!cur||!scroll)return;const y=parseFloat(cur.style.top)||0;scroll.scrollTo({top:Math.max(0,y-scroll.clientHeight*.48),behavior:smooth?"smooth":"auto"});}
function renderRunSelectionUI(){
  runSelection.modeId="campaign";
  if(!routeNodeById(runSelection.routeId)){const fallback=DESCENT_LAYOUT.nodes.find(n=>n.stage===runSelection.level)||DESCENT_LAYOUT.nodes[0];runSelection.routeId=fallback.id;}
  document.querySelectorAll("[data-mode]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.mode===runSelection.modeId)));
  document.querySelectorAll("[data-role]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.role===runSelection.roleId)));
  document.querySelectorAll("[data-route-id]").forEach(b=>{const node=routeNodeById(b.dataset.routeId),open=descentNodeUnlocked(node);b.setAttribute("aria-pressed",String(node.id===runSelection.routeId));b.disabled=!open;b.title=b.disabled?"完成上一深度后解锁":"选择"+ROUTE_KIND[node.kind].label+" · "+ROUTE_KIND[node.kind].reward;});
  document.querySelectorAll(".descent-link").forEach(p=>p.classList.toggle("reached",descentNodeUnlocked(routeNodeById(p.dataset.to))));
  const mode=selectedMode(),role=selectedRole(),lv=LEVELS[runSelection.level]||LEVELS[0],route=selectedRouteNode(),routeMeta=descentNodeMeta(route);
  document.getElementById("modeIntelIcon").textContent="▼";document.getElementById("modeIntelTitle").textContent="星髓深渊下潜 · 唯一模式";document.getElementById("modeIntelText").textContent="沿分岔路线逐层深入；战斗、事件、精英与巨兽节点会改变本局构筑。";document.getElementById("modeIntelRisk").textContent="方向：向下 · 100 层";document.getElementById("modeIntelReward").textContent="分数倍率 ×"+mode.scoreMul.toFixed(2);
  hi=readRunRecord(runSelection.modeId,runSelection.level);document.getElementById("hiVal").textContent=hi;
  document.getElementById("levelRule").textContent="每章包含三路分岔与交叉转向；遗物、事件和精英航路拥有不同风险收益。";
  document.getElementById("selectionSummary").textContent="下潜坐标：深度 "+String(lv.id).padStart(2,"0")+" · "+routeMeta.label+"（"+routeMeta.reward+"） · "+role.name;
  document.getElementById("startBtn").textContent="从深度 "+String(lv.id).padStart(2,"0")+" 开始下潜";
  document.documentElement.style.setProperty("--role","#"+role.accent.toString(16).padStart(6,"0"));
}
document.getElementById("modePicker").addEventListener("click",e=>{const b=e.target.closest("[data-mode]");if(!b)return;runSelection.modeId=b.dataset.mode;persistRunSelection();renderRunSelectionUI();});
document.getElementById("rolePicker").addEventListener("click",e=>{const b=e.target.closest("[data-role]");if(!b)return;runSelection.roleId=b.dataset.role;persistRunSelection();renderRunSelectionUI();if(document.getElementById("paneArmory")&&document.getElementById("paneArmory").classList.contains("show"))renderArmoryTab();});
document.getElementById("levelPicker").addEventListener("click",e=>{const b=e.target.closest("[data-route-id]");if(!b||b.disabled)return;runSelection.level=Math.max(0,Math.min(99,Number(b.dataset.level)||0));runSelection.routeId=b.dataset.routeId;persistRunSelection();renderRunSelectionUI();centerDescentSelection(true);});
rebuildStagePicker();
renderRunSelectionUI();
setTimeout(()=>centerDescentSelection(false),0);

/* v13 休息站：永久升级、功能解锁与成就一览。 */
const REST_ITEMS=[
  {id:"hull",name:"超纤维骨架",tag:"永久升级 · 最高 5 级",desc:r=>"每级使所有角色最大生命 +5。当前 "+r+"/5",cost:r=>25+r*20,max:5},
  {id:"salvage",name:"雷莫拉打捞学",tag:"永久升级 · 最高 5 级",desc:r=>"每级使稀有遗物概率 +1.8%。当前 "+r+"/5",cost:r=>30+r*22,max:5},
  {id:"reroll",name:"书记官重扫描",tag:"功能解锁",desc:()=>"每次远征可重抽一次三选一升级。",cost:()=>65,unlock:true},
  {id:"scanner",name:"建造者扫描仪",tag:"功能解锁",desc:()=>"稀有遗物基础掉率额外 +6%。",cost:()=>80,unlock:true},
  {id:"lifePod",name:"紧急重生舱",tag:"功能解锁",desc:()=>"续命费用从 30 船币降至 18。",cost:()=>100,unlock:true}
];
function renderRestStation(){document.getElementById("restCurrency").textContent="船币 "+meta.currency+" · 总击杀 "+meta.totalKills+" · 最高连杀 "+meta.bestStreak;const grid=document.getElementById("restGrid");grid.innerHTML="";for(const item of REST_ITEMS){const rank=item.unlock?(meta.unlocks[item.id]?1:0):(meta.upgrades[item.id]||0),done=item.unlock?!!meta.unlocks[item.id]:rank>=item.max,cost=item.cost(rank),b=document.createElement("button");b.type="button";b.className="rest-item";b.disabled=done||meta.currency<cost;b.innerHTML="<b></b><em></em><small></small>";b.querySelector("b").textContent=item.name;b.querySelector("em").textContent=done?"已完成":item.tag+" · "+cost+" 船币";b.querySelector("small").textContent=item.desc(rank);b.addEventListener("click",()=>buyRestItem(item));grid.appendChild(b);}const ach=document.getElementById("achievementList");ach.innerHTML="";for(const [id,a] of Object.entries(ACHIEVEMENTS)){const d=document.createElement("div");d.className="achievement"+(meta.achievements[id]?" done":"");d.textContent=(meta.achievements[id]?"✓ ":"○ ")+a.name+" · "+a.desc+" · 奖励 "+a.reward;ach.appendChild(d);}}
function buyRestItem(item){const rank=item.unlock?(meta.unlocks[item.id]?1:0):(meta.upgrades[item.id]||0),cost=item.cost(rank);if(meta.currency<cost)return;meta.currency-=cost;if(item.unlock)meta.unlocks[item.id]=true;else meta.upgrades[item.id]=Math.min(item.max,rank+1);saveMeta();renderRestStation();sound("pickup");}
function openRestStation(){renderRestStation();document.getElementById("restOverlay").classList.remove("hidden");}
function closeRestStation(){document.getElementById("restOverlay").classList.add("hidden");}
document.getElementById("restBtn").addEventListener("click",openRestStation);document.getElementById("restCloseBtn").addEventListener("click",closeRestStation);

/* ================= v10 叙事层：剧情队列、抉择、档案与多结局 ================= */
const ROLE_CHAPTER_LINES={
  explorer:["先核对命令源。首领的脸不等于首领的意志。","笛雾承认了骗局，但那个最初的梦仍没有解释。","洛克留下钟表，因为他的忠诚从来不是盲目的。","如果胜利必须杀死髓星上所有人，那就不是我要的胜利。","封住豁口。我们不理解的囚犯，不该被轻率释放。"],
  guardian:["支撑结构不会说谎；伪造的权限会。","我能造出桥，也能看出能量正在削弱力场。","坐上首领的椅子不等于真正控制大船。","如果提欧利用了我，我就亲手切断他建造的脊柱。","大船比任何一个船长、任何一场胜负都重要。"],
  hunter:["二十秒的犹豫足以藏住真相，我会从源头追起。","困四千年不算结束，只说明该换一种逃法。","我挖了一百多年，终于找到浣生留下的天空一片。","雷莫拉人不是工具；他们是最懂这艘船的盟友。","关阀、毁泵、折转喷嘴——让这条老船自己选方向。"]
};
const storyOverlay=document.getElementById("storyOverlay"),storyKickerEl=document.getElementById("storyKicker"),storyTitleEl=document.getElementById("storyTitle"),storySpeakerEl=document.getElementById("storySpeaker"),storyBodyEl=document.getElementById("storyBody"),storyActionsEl=document.getElementById("storyActions"),storyProgressBar=document.getElementById("storyProgressBar"),storySkipBtn=document.getElementById("storySkipBtn");
const archiveOverlay=document.getElementById("archiveOverlay"),archiveChaptersEl=document.getElementById("archiveChapters"),archiveRunStatusEl=document.getElementById("archiveRunStatus");
let storyPages=[],storyPageIndex=0,storyDone=null,storyModalActive=false,transmissionTimer=0,storyChoiceLevel=0;
function showTransmission(speaker,text,duration){
  const el=document.getElementById("transmission");if(!el||!text)return;
  document.getElementById("transmissionSpeaker").textContent=speaker||"书记官";document.getElementById("transmissionText").textContent=text;
  el.classList.add("show");clearTimeout(transmissionTimer);transmissionTimer=setTimeout(()=>el.classList.remove("show"),duration||5200);
}
function storyPage(kicker,title,speaker,body,choices){return {kicker,title,speaker,body,choices:choices||null};}
function openStorySequence(pages,onDone){
  storyPages=(pages||[]).filter(Boolean);storyPageIndex=0;storyDone=typeof onDone==="function"?onDone:null;
  if(!storyPages.length){const cb=storyDone;storyDone=null;if(cb)cb();return;}
  storyModalActive=true;if(G&&G.state!==S.MENU)G.state=S.PAUSED;input.setEnabled(false);document.getElementById("pause").classList.add("hidden");
  try{if(document.pointerLockElement)document.exitPointerLock();}catch(e){}
  storyOverlay.classList.remove("hidden");renderStoryPage();
}
function renderStoryPage(){
  const p=storyPages[storyPageIndex];if(!p){finishStorySequence();return;}
  storyKickerEl.textContent=p.kicker||"大船 · 书记官复演";storyTitleEl.textContent=p.title||"星髓远征";storySpeakerEl.textContent=p.speaker||"书记官";storyBodyEl.textContent="";
  const AVATAR_COLORS={"浣生":"#5fe0b0","迈尔辛":"#6fa8ff","帕米尔":"#ff8a72","书记官":"#d9c08a","大船":"#7fd0ff","笛雾":"#b48cff","洛克":"#9fe8ff","提欧":"#ff7fb2","荒凉":"#8a7fff"};
  const storyAvatarEl=document.getElementById("storyAvatar");
  if(storyAvatarEl){const acol=AVATAR_COLORS[p.speaker]||"#7fa9a2";storyAvatarEl.style.borderColor=acol;storyAvatarEl.style.color=acol;storyAvatarEl.textContent=(p.speaker||"?").slice(0,1);}
  const bodyText=p.body||"";
  let ti=0;
  if(window.__storyTypeTimer)clearInterval(window.__storyTypeTimer);
  storyBodyEl.onclick=()=>{if(window.__storyTypeTimer){clearInterval(window.__storyTypeTimer);window.__storyTypeTimer=null;storyBodyEl.textContent=bodyText;}};
  window.__storyTypeTimer=setInterval(()=>{ti+=2;storyBodyEl.textContent=bodyText.slice(0,ti);if(ti>=bodyText.length){clearInterval(window.__storyTypeTimer);window.__storyTypeTimer=null;}},24);
  storyProgressBar.style.width=((storyPageIndex+1)/Math.max(1,storyPages.length)*100)+"%";storyActionsEl.innerHTML="";
  const choices=Array.isArray(p.choices)?p.choices:null;storyActionsEl.classList.toggle("single",!choices||choices.length<2);storySkipBtn.style.display=choices?"none":"block";
  if(choices){
    for(const c of choices){const b=document.createElement("button");b.type="button";b.className="story-choice";b.innerHTML="<b></b><small></small>";b.querySelector("b").textContent=c.label;b.querySelector("small").textContent=c.desc||"";b.addEventListener("click",()=>chooseStoryOption(c));storyActionsEl.appendChild(b);}
  }else{
    const b=document.createElement("button");b.type="button";b.className="story-choice";b.innerHTML="<b>继续</b><small>推进航行记录</small>";b.addEventListener("click",advanceStoryPage);storyActionsEl.appendChild(b);
  }
  setTimeout(()=>{const b=storyActionsEl.querySelector("button");if(b)b.focus({preventScroll:true});},0);
}
function advanceStoryPage(){storyPageIndex++;renderStoryPage();}
function chooseStoryOption(choice){
  if(choice.kind==="chapter")applyStoryDecision(storyChoiceLevel,choice.value);
  if(choice.kind==="ending")applyFinalDecision(choice.value);
  if(choice.kind==="runEvent")applyRunEvent(choice.value);
  if(choice.kind==="runEvent")applyRunEventV19(choice.value);
  if(choice.result)storyPages.splice(storyPageIndex+1,0,storyPage("抉择已记录",choice.label,selectedRole().shortName||selectedRole().name,choice.result));
  advanceStoryPage();
}
function applyRunEventV19(value){const n=runBuild.pendingEventIndex===undefined?0:runBuild.pendingEventIndex;if((runBuild.events||{})[n])return;runBuild.events=runBuild.events||{};runBuild.events[n]=value;if(value==="relic"){grantGold(250,"事件回收");}else if(value==="rush"){grantGold(200,"突袭缴获");G.ammo=Math.min(AMMO_MAX,(G.ammo||0)+4);}else if(value==="safe"){G.hp=Math.min(G.maxHp,G.hp+G.maxHp*.3);}else if(value==="trade"){grantGold(180,"商路红利");}else if(value==="refuse"){grantCurrency(4,"阿尔法拒绝");}else if(value==="red"){G.hp=Math.max(1,G.hp-Math.ceil((G.maxHp||HP_MAX)*.15));grantGold(300,"危险航道");}else if(value==="blue"){G.shield=Math.max(G.shield||0,3*(G.shieldDurationMul||1));}renderRunBuildStrip();}
const RUN_EVENTS=[
  {title:"失压回收站",question:"一只未知遗物在裂缝边缘发出求救脉冲。",a:["回收遗物","损失 15% 当前生命，随机构筑 +1"],b:["切断信号","获得 2 发弹药与少量金币"]},
  {title:"髓星潮汐窗",question:"潮汐短暂退去，露出一条写着船员姓名的旧通道。",a:["冒险穿越","伤害 +18%，但承伤 +10%"],b:["稳守通道","恢复 30% 生命"]},
  {title:"黑色阿尔法回声",question:"终端要求你用一段记忆换取下行权限。",a:["交出记忆","获得一次免费重抽"],b:["拒绝交易","永久货币 +4"]},
  {title:"建造者的骰子",question:"残骸中有一枚仍在运转的选择引擎。",a:["按下红键","损失 15% 生命，金币 +300"],b:["按下蓝键","获得 3 秒护幕"]}
];
function applyRunEvent(value){const n=Math.max(0,Math.min(RUN_EVENTS.length-1,Math.floor((G.level||1)/5)-1)),e=RUN_EVENTS[n]||RUN_EVENTS[0];runBuild.events=runBuild.events||{};if(runBuild.events[n])return;runBuild.events[n]=value;if(value==="relic"){grantGold(250,"事件回收");}else if(value==="risk"){G.hp=Math.max(1,G.hp*.85);grantGold(200,"涉险而过");}else if(value==="rush"){grantGold(200,"突袭缴获");G.ammo=Math.min(AMMO_MAX,(G.ammo||0)+4);}else if(value==="safe"){G.hp=Math.min(G.maxHp,G.hp+G.maxHp*.3);}else if(value==="trade"){grantGold(180,"商路红利");}else if(value==="refuse"){grantCurrency(4,"阿尔法拒绝");}else if(value==="red"){G.hp=Math.max(1,G.hp-Math.ceil((G.maxHp||HP_MAX)*.15));grantGold(300,"危险航道");}else if(value==="blue"){G.shield=Math.max(G.shield||0,3*(G.shieldDurationMul||1));}}
function runEventPage(level){const e=RUN_EVENTS[Math.max(0,Math.min(RUN_EVENTS.length-1,Math.floor(level/5)-1))];return storyPage("事件节点 · "+e.title,"二选一 · 深渊不会免费给出答案","大船",e.question+"\n\n"+e.a[1]+"\n"+e.b[1],[{kind:"runEvent",value:level%2?"relic":"rush",label:e.a[0],desc:e.a[1],result:"选择已写入本局构筑。"},{kind:"runEvent",value:level%2?"safe":"safe",label:e.b[0],desc:e.b[1],result:"安全收益已结算。"}]);}
function runEventPageV19(level){const n=Math.max(0,Math.min(RUN_EVENTS.length-1,Math.floor((level-1)/4))),e=RUN_EVENTS[n],vals=[["relic","rush"],["rush","safe"],["trade","refuse"],["red","blue"]][n]||["relic","safe"];return storyPage("事件节点 · "+e.title,"二选一 · 深渊不会免费给出答案","大船",e.question+"\n\n"+e.a[1]+"\n"+e.b[1],[{kind:"runEvent",value:vals[0],label:e.a[0],desc:e.a[1],result:"选择已写入本局构筑。"},{kind:"runEvent",value:vals[1],label:e.b[0],desc:e.b[1],result:"安全收益已结算。"}]);}
function finishStorySequence(){
  storyOverlay.classList.add("hidden");storyModalActive=false;const cb=storyDone;storyDone=null;storyPages=[];storyPageIndex=0;if(cb)cb();
}
function resumeAfterStory(){if(!G)return;G.state=S.PLAYING;input.setEnabled(true);input.reset();input.requestLock();}
function skipStorySection(){const nextChoice=storyPages.findIndex((p,i)=>i>storyPageIndex&&Array.isArray(p.choices));if(nextChoice>=0){storyPageIndex=nextChoice;renderStoryPage();}else finishStorySequence();}
storySkipBtn.addEventListener("click",skipStorySection);
window.addEventListener("keydown",e=>{if(storyModalActive&&(e.code==="Enter"||e.code==="Space")&&!storyPages[storyPageIndex]?.choices){e.preventDefault();advanceStoryPage();}});

function applyStoryDecision(level,value){
  if(storyRun.choices[level])return;storyRun.choices[level]=value;
  if(value==="seal"){storyRun.order++;if(G){G.maxHp+=4;G.hp=Math.min(G.maxHp,G.hp+4);}}
  else{storyRun.echo++;if(G)grantCrystal(2,"洞察印证");}
  if(G)G.score+=Math.round(45*(G.scoreMul||1));updateArchiveUI();saveGame();
}
function applyFinalDecision(key){
  storyRun.ending=key;if(G)G.storyEnding=key;
  if(STORY_ENDINGS[key]&&storyMeta.endings.indexOf(key)<0)storyMeta.endings.push(key);storyMeta.deepest=5;saveStoryMeta();updateArchiveUI();
  unlockAchievement("builder");
}
function roleChapterLine(level){const a=ROLE_CHAPTER_LINES[runSelection.roleId]||ROLE_CHAPTER_LINES.explorer;return a[Math.max(0,Math.min(4,level-1))];}
function openingPagesFor(level,fullOpening){
  const ch=STORY_CHAPTERS[level-1]||STORY_CHAPTERS[0],pages=[];
  if(runSelection.modeId==="campaign"){if(fullOpening)pages.push(storyPage("第一部 · 船","沉默世界的二十道门","大船","我能看见进入船体的每一个生命，却无法让他们听见我。如今，一份黑色阿尔法密令正把最优秀的船长引向我的核心。"));pages.push(storyPage(ch.title,"第 "+String(level).padStart(2,"0")+" 关 · "+ch.name,"书记官",ch.intro));return pages;}
  if(fullOpening)pages.push(...STORY_PROLOGUE);
  if(fullOpening&&runSelection.level>0)pages.push(storyPage("此前提要 · 书记官校订","从指定历史节点开始","书记官","前序已压缩：大船来自银河之外；笛雾伪造首领密令与建造者档案，把船长困在髓星；提欧明知骗局仍组织违望者，并可能受到更深层意志影响。"));
  if(fullOpening)pages.push(storyPage("潜航员个人记录",selectedRole().name,selectedRole().shortName,ROLE_STORY[runSelection.roleId].intro));
  pages.push(storyPage(ch.title,ch.name,"书记官",ch.intro+"\n\n"+selectedRole().shortName+"："+roleChapterLine(level)));
  return pages;
}
function showChapterOpening(level,fullOpening,onDone){openStorySequence(openingPagesFor(level,fullOpening),onDone||resumeAfterStory);}
function finalChoiceOptions(){
  const list=[
    {kind:"ending",value:"seal",label:"切断脊柱，重封髓星",desc:"隔离荒凉，抢救大船并保护髓星幸存者。",result:STORY_ENDINGS.seal.sub+"\n\n"+ROLE_STORY[runSelection.roleId].epilogue},
    {kind:"ending",value:"release",label:"接受核心的许诺",desc:"相信荒凉能驾驭黑洞与大船。高风险非正史选择。",result:STORY_ENDINGS.release.sub+"\n\n"+ROLE_STORY[runSelection.roleId].epilogue}
  ];
  if(storyRun.order>=2&&storyRun.echo>=2)list.push({kind:"ending",value:"chorus",label:"联合百族，驶向室女座",desc:"原著结局 · 关闭引擎、重封监狱，让大船选择新的航路。",result:STORY_ENDINGS.chorus.sub+"\n\n"+ROLE_STORY[runSelection.roleId].epilogue});
  return list;
}
function chapterExitNarrative(level,carry,nextIdx){
  const ch=STORY_CHAPTERS[level-1]||STORY_CHAPTERS[0],mode=G.modeId||runSelection.modeId;storyMeta.deepest=Math.max(storyMeta.deepest,level);saveStoryMeta();
  if(mode==="campaign"){
    if(nextIdx!==null&&level%4===0){runBuild.pendingEventIndex=Math.floor((level-1)/4);openStorySequence([storyPage(ch.title,"第 "+String(level).padStart(2,"0")+" 关完成",selectedRole().shortName,ch.bossDown),runEventPageV19(level)],()=>{loadLevel(nextIdx,carry);showChapterOpening(nextIdx+1,false,resumeAfterStory);});return;}
    if(nextIdx!==null){openStorySequence([storyPage(ch.title,"第 "+String(level).padStart(2,"0")+" 关完成",selectedRole().shortName,ch.bossDown)],()=>{loadLevel(nextIdx,carry);showChapterOpening(nextIdx+1,false,resumeAfterStory);});}
    else{const fin=level<=20?"partOne":level<=40?"partTwo":level<=60?"partThree":level<=80?"partFour":"partFive",finMeta=PART_FINS[fin];
      if(fin==="partFive"){meta.ngPlus=(meta.ngPlus||0)+1;saveMeta();toast("新周目解锁 · 怪物全属性 ×1.5");}}   // v41 NG+if(storyMeta.endings.indexOf(fin)<0)storyMeta.endings.push(fin);saveStoryMeta();unlockAchievement("builder");openStorySequence([storyPage(finMeta.t,finMeta.s,finMeta.who,ch.bossDown+finMeta.tail)],()=>setOver(true));}
    return;
  }
  if(mode==="stage"){
    G.storyEnding="archive";openStorySequence([storyPage(ch.title,"本章档案已校订","书记官",ch.bossDown+"\n\n这是一次历史复演，不会覆盖完整远征的抉择。")],()=>setOver(true));return;
  }
  if(mode==="bossRush"){
    if(nextIdx!==null){openStorySequence([storyPage("守卫协议 · 节点解除",ch.name,BOSS_NAMES[G.boss?.type]||"核心守卫",ch.bossDown)],()=>{loadLevel(nextIdx,carry);showChapterOpening(nextIdx+1,false,resumeAfterStory);});}
    else{G.storyEnding="protocol";openStorySequence([storyPage("守卫协议 · 全序列完成","通往囚室的战斗路径",selectedRole().shortName,STORY_ENDINGS.protocol.sub)],()=>setOver(true));}
    return;
  }
  if(level<5&&nextIdx!==null){
    storyChoiceLevel=level;const choices=[{kind:"chapter",value:"seal",label:ch.seal.label,desc:ch.seal.desc,result:ch.seal.result},{kind:"chapter",value:"echo",label:ch.echo.label,desc:ch.echo.desc,result:ch.echo.result}];
    openStorySequence([storyPage(ch.title,"战术节点已解除",BOSS_NAMES[G.boss?.type]||"核心守卫",ch.bossDown),storyPage("证据校验 · "+level+"/4",ch.question,"书记官","选择会强化物证或洞察，也会改变身体增益。两种调查方式都达到两次，才能解锁原著结局。",choices)],()=>{loadLevel(nextIdx,carry);showChapterOpening(nextIdx+1,false,resumeAfterStory);});
  }else{
    storyChoiceLevel=5;openStorySequence([storyPage(ch.title,"最后一道控制链碎裂",BOSS_NAMES[G.boss?.type]||"荒凉之手",ch.bossDown),storyPage("最终抉择",ch.question,"大船","荒凉仍在核心呼唤，红巨星与黑洞正在逼近。只有同时尊重物证与洞察，才能选择原著中的第三条航路。",finalChoiceOptions())],()=>setOver(true));
  }
}
function maybeStoryPickup(){
  if(!G||G.modeId==="bossRush")return;const ch=STORY_CHAPTERS[(G.level||1)-1];if(!ch)return;
  G.storySampleLogs=G.storySampleLogs||{};const target=G.sampleTarget||TARGET_SAMPLES,marks=[1,Math.max(2,Math.ceil(target/2)),target];let speaker="",text="";
  for(let i=0;i<marks.length;i++)if(G.samples>=marks[i]&&!G.storySampleLogs[i]){G.storySampleLogs[i]=true;speaker="校订证据 · "+String((G.level-1)*3+i+1).padStart(2,"0");text=ch.sample[i];break;}
  if(G.level===4&&G.objective&&G.objective.kind==="survive"&&G.objective.t>50){G.objective.t=Math.max(50,G.objective.t-8);text+=(text?"\n":"")+"脊柱中继受到干扰：防守时间缩短 8 秒。";speaker=speaker||"书记官";}
  if(text)showTransmission(speaker,text,6200);
}
function checkStoryTriggers(){
  if(!G||!G.level)return;const ch=STORY_CHAPTERS[G.level-1];if(!ch)return;
  if(baseObjectiveMet()&&G.boss&&G.boss.hp>0&&!G.storyBossAwake){G.storyBossAwake=true;showTransmission(BOSS_NAMES[G.boss.type]||"核心守卫",ch.bossAwake,6200);}
  if(G.boss&&G.boss.hp<=0&&!G.storyBossDown){G.storyBossDown=true;showTransmission("书记官",ch.bossDown,6200);storyMeta.deepest=Math.max(storyMeta.deepest,G.level);saveStoryMeta();}
}
function updateArchiveUI(){
  if(archiveChaptersEl)archiveChaptersEl.innerHTML=STORY_CHAPTERS.map(ch=>"<div class=\"archive-chapter\"><b>"+ch.title+"</b><span>"+ch.name+"<br>"+ch.summary+(storyMeta.deepest>=ch.id?" · 已抵达":" · 未抵达")+"</span></div>").join("");
  if(archiveRunStatusEl){const choices=Object.keys(storyRun.choices).sort().map(k=>"L"+k+" "+(storyRun.choices[k]==="seal"?"物证":"洞察")).join(" · ")||"尚无抉择";const endings=storyMeta.endings.map(k=>STORY_ENDINGS[k].tag).join("、")||"尚未发现";archiveRunStatusEl.innerHTML="物证 <b>"+storyRun.order+"</b>　·　洞察 <b>"+storyRun.echo+"</b><br>"+choices+"<br>已发现结局："+endings;}
}
/* v23 深渊生物图鉴：按种类累计击杀（meta.bestiary），档案页逐条解锁；未发现条目打码。
   计数由 handleCombatEvent 的 kill/bossKill 事件驱动；持久化随 grantCurrency→saveMeta 搭车写入。 */
const BESTIARY_INFO={
  gray:{name:"灰手",desc:"大船维护通道中最常见的失控维护体，成群游荡。"},
  dart:{name:"刃鳍",desc:"高速巡游的掠食者，锁定猎物后发起突进扑击。"},
  swarm:{name:"刃鳍幼群",desc:"刃鳍的幼体集群，单体脆弱但数量惊人。"},
  spitter:{name:"墨鲛",desc:"保持距离喷射腐蚀墨弹的伏击型生物。"},
  acid:{name:"酸液踏巢者",desc:"死亡时在原地留下腐蚀酸池的剧毒个体。"},
  sniper:{name:"深瞳猎手",desc:"远距离蓄能狙击的猎手，蓄力时亮起红色瞄准光。"},
  shield:{name:"甲壳盾卫",desc:"正面覆盖厚重甲壳，几乎免疫正面伤害，需绕背击破。"},
  elite:{name:"晶化灰手",desc:"被星髓结晶侵蚀的灰手变异体，体型与护甲强化。"},
  hand:{name:"沉者之手",desc:"守卫裂口的巨手，被星髓的低语驱使。"},
  handX:{name:"五指门核心",desc:"五指门的最终协议形态，狂怒阶段速度激增。"},
  reefCrab:{name:"乌娜之盾",desc:"五层巨兽之一：盘踞船壳的巨型清道夫蟹。"},
  kelpLeviathan:{name:"锤翅母兽",desc:"五层巨兽之一：永昼猎群的巨兽级统领。"},
  abyssJelly:{name:"洛克镜像",desc:"五层巨兽之一：秘道中浮现的水母状回影。"},
  voidWhale:{name:"脊柱航鲸",desc:"五层巨兽之一：沿大船脊柱巡游的庞然航鲸。"}
};
let bestiaryListEl=null;
function noteBestiaryKill(type){
  if(!type)return;
  meta.bestiary=meta.bestiary||{};
  meta.bestiary[type]=(meta.bestiary[type]||0)+1;
}
function updateBestiaryUI(){
  bestiaryListEl=bestiaryListEl||document.getElementById("bestiaryList");
  if(!bestiaryListEl)return;
  const b=meta.bestiary||{};
  bestiaryListEl.innerHTML=Object.keys(BESTIARY_INFO).map(k=>{
    const info=BESTIARY_INFO[k],n=b[k]||0;
    return n>0
      ?"<div class=\"bestiary-item\"><span class=\"bc\">×"+n+"</span><b>"+info.name+"</b><span>"+info.desc+"</span></div>"
      :"<div class=\"bestiary-item undone\"><b>？？？</b><span>尚未遇见的深渊生物</span></div>";
  }).join("");
}
function openArchive(){updateArchiveUI();updateBestiaryUI();archiveOverlay.classList.remove("hidden");}
function closeArchive(){archiveOverlay.classList.add("hidden");}
document.getElementById("archiveBtn").addEventListener("click",openArchive);document.getElementById("pauseArchiveBtn").addEventListener("click",openArchive);document.getElementById("archiveCloseBtn").addEventListener("click",closeArchive);updateArchiveUI();

/* v3：设置面板——复用既有 settings/saveGame 能力，所有选项即时生效 */
const settingsOverlay = document.getElementById("settings");
const sensitivityRange = document.getElementById("sensitivityRange");
const sensitivityValue = document.getElementById("sensitivityValue");
const muteToggle = document.getElementById("muteToggle");
const vibrateToggle = document.getElementById("vibrateToggle");
const flickerToggle = document.getElementById("flickerToggle");
const aimToggle = document.getElementById("aimToggle");
function syncSettingsUI(){
  sensitivityRange.value = String(settings.sensitivity);
  sensitivityValue.textContent = Number(settings.sensitivity).toFixed(2);
  muteToggle.checked = settings.mute;
  vibrateToggle.checked = settings.vibrate;
  flickerToggle.checked = settings.reduceFlicker;
  aimToggle.checked = settings.aimAssist;
  document.body.classList.toggle("reduce-fx",settings.reduceFlicker);
}
function openSettings(){ syncSettingsUI(); settingsOverlay.classList.remove("hidden"); }
function closeSettings(){ settingsOverlay.classList.add("hidden"); saveGame(); }
sensitivityRange.addEventListener("input", ()=>{
  settings.sensitivity = Math.max(0.3, Math.min(0.8, Number(sensitivityRange.value)||0.45));
  input.setSensitivity(settings.sensitivity);
  sensitivityValue.textContent = settings.sensitivity.toFixed(2);
  saveGame();
});
muteToggle.addEventListener("change", ()=>{ settings.mute = muteToggle.checked; saveGame(); });
/* v24.13 设置页新增：辉光强度滑条 + 伤害数字开关 */
{
  const bloomRange=document.getElementById("bloomRange"),bloomVal=document.getElementById("bloomVal"),dmgNumToggle=document.getElementById("dmgNumToggle");
  if(bloomRange&&dmgNumToggle){
    if(settings.bloomStrength===undefined)settings.bloomStrength=.55;
    if(settings.bloomStrength===.9)settings.bloomStrength=.55;   // v24.16 旧默认 0.9 迁移降档
    if(settings.camMode==="tps")camMode="tps";   // v24.21 恢复视角偏好
    if(settings.dmgNums===undefined)settings.dmgNums=true;
    bloomRange.value=settings.bloomStrength;bloomVal.textContent=Number(settings.bloomStrength).toFixed(1);
    dmgNumToggle.checked=!!settings.dmgNums;
    bloomRange.addEventListener("input",()=>{settings.bloomStrength=Number(bloomRange.value);bloomVal.textContent=Number(settings.bloomStrength).toFixed(1);if(POST.rt)postCompMat.uniforms.uStrength.value=settings.bloomStrength;saveGame();});
    dmgNumToggle.addEventListener("change",()=>{settings.dmgNums=dmgNumToggle.checked;saveGame();});
    const tpsToggle=document.getElementById("tpsToggle");
    if(tpsToggle){
      tpsToggle.checked=(settings.camMode==="tps");
      tpsToggle.addEventListener("change",()=>{settings.camMode=tpsToggle.checked?"tps":"fps";camMode=settings.camMode;if(playerModel)playerModel.visible=tpsToggle.checked;saveGame();});
    }
  }
}
vibrateToggle.addEventListener("change", ()=>{ settings.vibrate = vibrateToggle.checked; saveGame(); });
flickerToggle.addEventListener("change", ()=>{ settings.reduceFlicker = flickerToggle.checked; document.body.classList.toggle("reduce-fx",settings.reduceFlicker); saveGame(); });
aimToggle.addEventListener("change", ()=>{ settings.aimAssist = aimToggle.checked; saveGame(); });
syncSettingsUI();

input.onLockLost = ()=>{ if(G && G.state===S.PLAYING) setPaused(true); };
function setPaused(on){
  if(!G) return;
  if(on){
    G.state = S.PAUSED;
    input.setEnabled(false);
    document.getElementById("pause").classList.remove("hidden");
    try{ if(document.pointerLockElement) document.exitPointerLock(); }catch(e){}
  } else {
    G.state = S.PLAYING;
    input.setEnabled(true);
    document.getElementById("pause").classList.add("hidden");
    input.requestLock();
  }
}
canvas.addEventListener("click", ()=>{
  if(G && G.state===S.PLAYING && !input.locked && !input.isTouch) input.requestLock();
});
addEventListener("resize", ()=>{
  camera.aspect = innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  resizeBloomLayer();
  resizePost();   // v24：后处理 RT 同步尺寸
  frameDirty=true;   // v23：暂停态 resize 后补一帧
});
document.addEventListener("visibilitychange", ()=>{
  if(document.hidden && G && G.state===S.PLAYING) setPaused(true);
});

/* ================= 玩法交互 ================= */
/* S9：可命中目标列表（灰手 + BOSS，供辅助瞄准吸附；PC 路径不调用） */
function buildAimTargets(){
  const list = [];
  for(let i=0;i<G.monsters.length;i++){
    const m = G.monsters[i];
    if(m.hp>0) list.push({ x:m.x, y:terrainHeight(m.x,m.z)+1, z:m.z, hp:m.hp });
  }
  if(G.boss && G.boss.hp>0) list.push({ x:G.boss.x, y:terrainHeight(G.boss.x,G.boss.z)+2.4, z:G.boss.z, hp:G.boss.hp });
  return list;
}
function fireFromCamera(){
  /* v30 下落攻击：滞空（高于地面 2.2m）按攻击 → 高速下坠，落地环形爆发 */
  if(G&&G.state===S.PLAYING&&!player.climb&&(player.y>terrainHeight(player.x,player.z)+2.2)){
    G.plungeArm=true;player.vy=-16;player.onGround=false;
    toast("下坠攻击！");
    return;
  }
  weaponKick = Math.min(1,weaponKick+.72);
  weaponActionT=.1;weaponActionKind=G&&G.weapon||1;
  /* CSD-SOUL1-P1：处决复用发射键——break 态目标半径 3.0 内开火 → 自动锁定最近可处决目标执行 */
  const ex = tryExecute(player.x, player.z);
    if(ex){
    sound("exec");
    showHitMarker(!!ex.killed);
    G.hp=Math.min(G.maxHp||HP_MAX,(G.hp||0)+4);   // v23.5 处决回复：奖励贴脸风险
    runBuild.execCount=(runBuild.execCount||0)+1;if(runBuild.execCount>=10)unlockAchievement("executes10");   // v24.14
    spawnDmgNum(player.x,player.y+.9,player.z,"处决 +4","#ffd66b",false);
    if(ex.killed) sound("kill");   // 即死/处决击杀：追加击杀音（杂兵即死 / 精英 8 即死）
    vibrate(40);
    addShake(0.7); addHitStop(ex.killed ? 0.12 : 0.06); fovPunch=ex.killed?7:4;   // 处决镜头收缩
    burstParticle(ex.mx, terrainHeight(ex.mx, ex.mz)+1.2, ex.mz, 0xff4466, 18);
    if(ex.killed){ spawnLoot(ex.mx,ex.mz,true);registerRunKill(ex.mx,ex.mz,false); saveGame(); if((G.combo||0) >= 2) toast("连杀 ×" + G.combo + "！"); }
    // 处决命中事件（逻辑层已结算得分/击杀）；boss 击杀由 setOver 链路处理
    return;
  }
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  let dx = dir.x, dy = dir.y, dz = dir.z;
  // S9：触屏（非 Pointer Lock 源）且开启辅助瞄准时，相机朝向与最近可命中目标
  // 夹角 <3° 则弹道吸附目标中心（命中判定用；视觉偏移 <3° 不可感知）；PC 命中判定不变。
  if(input.isTouch && settings.aimAssist){
    const assist = computeAimAssist(camera.position.x, camera.position.y, camera.position.z, dir.x, dir.y, dir.z, buildAimTargets(), 3);
    if(assist){ dx = assist.x; dy = assist.y; dz = assist.z; }
  }
  // W1（v1.1）：按当前武器分发；wid=1 走 firePulse 兼容包装（PC/关闭辅助瞄准时命中判定不变）
  // v28：角色专属武器统一入口 + 装备分裂弹匣多弹道展开
  const shots=1+((G&&G.equipMulti)||0);
  const fired=[];
  const yaw=Math.atan2(dx||.001,dz||.001);
  for(let k=0;k<shots;k++){
    const ang=(k-(shots-1)/2)*.13,c=Math.cos(ang),s2=Math.sin(ang);
    const rdx=dx*c-dz*s2,rdz=dx*s2+dz*c;
    const res=fireWeapon(G.weapon,camera.position.x,camera.position.y,camera.position.z,rdx,dy,rdz,yaw);
    if(Array.isArray(res)){muzzleFlash();spawnEchoRing(camera.position.x,camera.position.y,camera.position.z,0xffcf9f,2.4);sound("echo");for(const e of res)handleCombatEvent(e);}
    else if(res)fired.push(res);
  }
  if(!fired.length){
    // 渊棘空弹一次性提示（冷却中不提示）
    if((G.weapon||1) === 2 && G.ammo <= 0 && G.cool[2] <= 0) toast("瓷骨弹药耗尽");
    return;
  }
  for(const res of fired){
    const mesh = buildProjectileMesh(res);
    res.mesh = mesh;
    pulses.push(res);
  }
  muzzleFlash();   // v23.3 枪口焰
  if((G.weapon||1)===1)spawnEchoRing(camera.position.x,camera.position.y,camera.position.z);
  sound((G.weapon||1) === 2 ? "thorn" : "shoot");
}
/* v23：蓄力重击发射入口（渲染层）——构造强化弹丸与表现；逻辑结算走 fireCharged。 */
function fireChargedFromCamera(){
  if(!G || G.state!==S.PLAYING){chargeReady=false;return;}
  if((G.weapon||1)===3){chargeReady=false;return;}
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const yaw=Math.atan2(dir.x||.001,dir.z||.001);
  const res = fireCharged(G.weapon||1, camera.position.x, camera.position.y, camera.position.z, dir.x, dir.y, dir.z, yaw);
  weaponKick=Math.min(1,weaponKick+.9);weaponActionT=.1;weaponActionKind=G.weapon||1;
  if(!res){chargeReady=false;return;}
  if(Array.isArray(res)){muzzleFlash();spawnEchoRing(camera.position.x,camera.position.y,camera.position.z,0xffcf9f,3.4);sound("echo");addShake(.4);addHitStop(.06);for(const e of res)handleCombatEvent(e);chargeReady=false;return;}
  const mesh = buildProjectileMesh(res);
  mesh.scale.setScalar(1.85);   // 强化弹体放大（含拖尾/辉光）
  res.mesh = mesh;
  pulses.push(res);
  muzzleFlash(); burstParticle(_muzzleVec.x,_muzzleVec.y,_muzzleVec.z,0xffd66b,8);   // v23.3 蓄力枪口焰（金色加强）
  sound("charged");
  addShake(.35); fovPunch=Math.max(fovPunch,3.5); vibrate(24);
  chargeReady=false;
}
/* v23.3 弹丸特效：声呐弹外圈光环（自旋）与渊棘晶棘自旋——共享几何避免每次发射分配 */
const projHaloGeo=new THREE.TorusGeometry(.42,.045,6,18),projHaloMat=new THREE.MeshBasicMaterial({color:0x7fffd4,transparent:true,opacity:.55,blending:THREE.AdditiveBlending,depthWrite:false,fog:false});
keepRes(projHaloGeo,projHaloMat);
/* W1：按武器构造弹丸网格（wid=2 渊棘=细长晶棘+拖尾；其余=基础脉冲球） */
const grenadeMat=new THREE.MeshBasicMaterial({color:0xffb37a,fog:false}),grenadeTrailMat=new THREE.MeshBasicMaterial({color:0xff8a4a,transparent:true,opacity:.42,depthWrite:false,blending:THREE.AdditiveBlending,fog:false});
keepRes(grenadeMat,grenadeTrailMat);
function buildProjectileMesh(p){
  if(p.wid === 3){   // v28：帕米尔榴弹——琥珀弹体 + 引信辉光 + 拖尾
    const g=new THREE.Group();g.position.set(p.x,p.y,p.z);
    g.add(new THREE.Mesh(pulseGeo,grenadeMat));
    const glow=new THREE.Sprite(glowMaterial(0xffcf9f));glow.scale.set(1.5,1.5,1);g.add(glow);
    const trail=new THREE.Mesh(thornTrailGeo,grenadeTrailMat);trail.position.set(0,0,-1.0);g.add(trail);
    g.userData.playerProjectile=true;g.userData.spin=5;scene.add(g);return g;
  }
  if(p.wid === 2){
    const g = new THREE.Group();
    g.position.set(p.x, p.y, p.z);
    g.lookAt(p.x+p.vx, p.y+p.vy, p.z+p.vz);
    g.rotateX(Math.PI/2);   // ConeGeometry 尖端 +Y → 对齐 +Z（飞行方向）
    g.add(new THREE.Mesh(thornGeo,thornMat));
    const shell=new THREE.Mesh(thornShellGeo,thornShellMat);shell.scale.set(.95,1,.95);g.add(shell);
    const trail = new THREE.Mesh(thornTrailGeo, thornTrailMat);
    trail.position.set(0, 0, -1.2);   // 拖尾在晶棘后方（组局部 -Z）
    g.add(trail);
    const glow=new THREE.Sprite(glowMaterial(0x3aa6ff));glow.scale.set(1.65,1.65,1);glow.position.z=-.08;g.add(glow);
    g.userData.playerProjectile=true;g.userData.spin=9;   // v23.3 晶棘自旋
    scene.add(g);
    return g;
  }
  const g=new THREE.Group(),core=new THREE.Mesh(pulseGeo,pulseMat),shell=new THREE.Mesh(pulseShellGeo,pulseShellMat);
  shell.rotation.set(.35,.7,.15);const glow=new THREE.Sprite(glowMaterial(0x7fffd4));glow.scale.set(1.35,1.35,1);g.add(glow,shell,core);
  const halo=new THREE.Mesh(projHaloGeo,projHaloMat);halo.rotation.x=Math.PI/2;g.add(halo);   // v23.3 光环自旋
  g.userData.playerProjectile=true;g.userData.spin=p.charge?10:6;g.position.set(p.x,p.y,p.z);scene.add(g);return g;
}
/* W1：回响扩散环（纯视觉 0.15s；逻辑层施放即时已结算，不产生飞行弹丸） */
function spawnEchoRing(x, y, z, colorHex, maxScale){
  const m = new THREE.Mesh(echoRingGeo, echoRingMat.clone());
  if(colorHex)m.material.color.setHex(colorHex);
  m.rotation.x = -Math.PI/2;
  m.position.set(x, y, z);
  if(maxScale)m.userData.echoScale=maxScale;   // v23：可指定扩散终径（完美闪避/蓄力冲击波用）
  scene.add(m);
  echoRings.push({ mesh:m, life:0.15, max:0.15 });
}
/* 武器专属构筑：回响缓速场的持续可视化（与逻辑层 G.echoFields 同步）。 */
function clearEchoFieldMeshes(){
  for(const e of echoFieldMeshes){if(e.mesh){scene.remove(e.mesh);disposeRoots([e.mesh]);}}
  echoFieldMeshes=[];
}
function syncEchoFieldMeshes(){
  const fields=(G&&G.echoFields)||[], active=new Set(fields);
  for(const f of fields){
    let entry=echoFieldMeshes.find(e=>e.field===f);
    if(!entry){
      const mat=new THREE.MeshBasicMaterial({color:0x7fe9ff,transparent:true,opacity:.24,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending,fog:false});
      const mesh=new THREE.Mesh(new THREE.RingGeometry(Math.max(.45,f.r*.72),Math.max(.55,f.r),40),mat);
      mesh.rotation.x=-Math.PI/2;mesh.renderOrder=2;scene.add(mesh);entry={field:f,mesh};echoFieldMeshes.push(entry);
    }
    const mesh=entry.mesh, life=Math.max(0,Math.min(1,(f.life||0)/3));
    mesh.position.set(f.x,terrainHeight(f.x,f.z)+.06,f.z);mesh.material.opacity=.035+.20*life;
    mesh.scale.setScalar(1+.035*Math.sin(G.time*5+f.x));
  }
  for(let i=echoFieldMeshes.length-1;i>=0;i--){const e=echoFieldMeshes[i];if(!active.has(e.field)){scene.remove(e.mesh);disposeRoots([e.mesh]);echoFieldMeshes.splice(i,1);}}
}
/* W1：命中事件按武器区分粒子颜色/音效（wid=1 声呐 / 2 渊棘 / 3 回响） */
function handleCombatEvent(e){
  const w = e.wid || 1;
  const col = w===2 ? 0x3aa6ff : (w===3 ? 0x9fe8ff : 0x7fffd4);
  if(e.type==="hit"){ burstParticle(e.mx, terrainHeight(e.mx,e.mz)+1, e.mz, col, 6); showHitMarker(false); if(w===2) sound("thorn"); const im=(G.monsters||[]).find(m=>m.hp>0&&Math.hypot(m.x-e.mx,m.z-e.mz)<2.2);if(im)im.hitReact=1;
    /* v23：飘浮伤害数字（v24.7 暴击金色大字+感叹号+专属音效；溅射用淡青色区分） */
    if(e.dmg!==undefined)spawnDmgNum(e.mx,terrainHeight(e.mx,e.mz)+1.7+(e.crit?.5:0),e.mz,String(Math.round(e.dmg))+(e.crit?"!":""),e.crit?"#ffd66b":(e.splash?"#9fe8ff":"#eafff8"),!!e.crit);
    if(e.crit){sound("crit");spawnEchoRing(e.mx,terrainHeight(e.mx,e.mz)+1.2,e.mz,0xffd66b,.85);} }
  else if(e.type==="kill"){ burstParticle(e.mx, terrainHeight(e.mx,e.mz)+1, e.mz, col, 16); showHitMarker(true); noteBestiaryKill(e.target); spawnLoot(e.mx,e.mz,false);registerRunKill(e.mx,e.mz,false); sound("kill"); addShake(0.5); addHitStop(0.05); saveGame(); if((G.combo||0) >= 2) toast("连杀 ×" + G.combo + "！");
    /* v39 词缀击杀提示 */ if(e.affixName)spawnDmgNum(e.mx,terrainHeight(e.mx,e.mz)+2.6,e.mz,e.affixName+" 击破","#"+(e.affixColor||0xffffff).toString(16).padStart(6,"0"),true);
    /* v39 词缀击杀提示 */ if(e.affixName)spawnDmgNum(e.mx,terrainHeight(e.mx,e.mz)+2.6,e.mz,e.affixName+" 击破","#"+(e.affixColor||0xffffff).toString(16).padStart(6,"0"),true);
    /* v23：击杀金色大字（图鉴计数已前置到 registerRunKill 之前，确保随 saveMeta 落盘） */
    if(e.dmg!==undefined)spawnDmgNum(e.mx,terrainHeight(e.mx,e.mz)+2.2,e.mz,String(Math.round(e.dmg)),"#ffd66b",true);
    if(e.wid===3)unlockAchievement("echoKill"); }
  else if(e.type==="boss"){ burstParticle(e.bx, terrainHeight(e.bx,e.bz)+2.4, e.bz, col, 8); showHitMarker(false);
    if(e.dmg!==undefined)spawnDmgNum(e.bx,terrainHeight(e.bx,e.bz)+3.4,e.bz,String(Math.round(e.dmg))+(e.crit?"!":""),e.crit?"#ffd66b":"#eafff8",!!e.crit);
    if(e.crit){sound("crit");spawnEchoRing(e.bx,terrainHeight(e.bx,e.bz)+2.6,e.bz,0xffd66b,1.1);} }
  else if(e.type==="bossKill"){ burstParticle(e.bx, terrainHeight(e.bx,e.bz)+2.4, e.bz, 0x7fffd4, 26); showHitMarker(true); noteBestiaryKill(G.boss&&G.boss.type); spawnLoot(e.bx,e.bz,true,true);registerRunKill(e.bx,e.bz,true); sound("kill"); vibrate(60); addShake(1.0); addHitStop(0.14); fovPunch=9; saveGame(); toast((BOSS_NAMES[G.boss?.type]||"核心守卫")+" · 协议解除！");
    if(e.dmg!==undefined)spawnDmgNum(e.bx,terrainHeight(e.bx,e.bz)+3.8,e.bz,String(Math.round(e.dmg)),"#ffd66b",true);
    unlockAchievement("bossSlayer"); }
  /* CSD-H2：弹丸碰障碍（设计 §3.2）——声呐青白 6 / 渊棘深蓝 8 / 墨弹墨色 6，均 thud 撞击音 */
  else if(e.type==="block"){ burstParticle(e.x, (e.y !== undefined) ? e.y : terrainHeight(e.x,e.z)+1, e.z, (e.wid||1)===2 ? 0x3aa6ff : 0x7fffd4, (e.wid||1)===2 ? 8 : 6); sound("thud"); }
  else if(e.type==="blockSpit"){ burstParticle(e.x, terrainHeight(e.x,e.z)+1, e.z, 0x24333a, 6); sound("thud"); }
  /* CSD-SOUL1-P2：怪物架盾格挡（金色火花，thud） */
  else if(e.type==="guarded"){ const gx=e.mx!==undefined?e.mx:e.bx, gz=e.mz!==undefined?e.mz:e.bz; burstParticle(gx, terrainHeight(gx,gz)+1.4, gz, 0xd9c08a, 8); sound("thud"); }
  else if(e.type==="warded"){const gx=e.mx!==undefined?e.mx:e.bx,gz=e.mz!==undefined?e.mz:e.bz;burstParticle(gx,terrainHeight(gx,gz)+1.4,gz,0x62d9ff,12);sound("thud");}
  /* v23：蓄力重击冲击波落点表现（金色双 burst + 大扩散环 + 微时停） */
  else if(e.type==="chargeBlast"){ burstParticle(e.x,e.y,e.z,0x7fffd4,22); burstParticle(e.x,e.y,e.z,0xffd66b,10); spawnEchoRing(e.x,Math.max(e.y,terrainHeight(e.x,e.z)+.5),e.z,0xffd66b,2.6); addShake(.4); addHitStop(.04); sound("charged"); }
  else if(e.type==="blastFx"){ const by=terrainHeight(e.x,e.z)+.6; burstParticle(e.x,by,e.z,0xffb37a,14); spawnEchoRing(e.x,by,e.z,0xffb37a,e.r||2.6); addShake(.2); sound("thud"); }
  else if(e.type==="shieldHit"){
    const gx=(e.mx!==undefined)?e.mx:e.bx, gz=(e.mz!==undefined)?e.mz:e.bz, gy=terrainHeight(gx,gz)+1.6;
    const sc=ELEM_INFO[e.elem]?ELEM_INFO[e.elem].color:0x9fd8ff;
    burstParticle(gx,gy,gz,sc,8); spawnDmgNum(gx,gy+.6,gz,"盾 "+e.dmg,"#"+sc.toString(16).padStart(6,"0"),false); sound("thud");
    if(e.brk){spawnEchoRing(gx,gy,gz,0xffffff,2.4);burstParticle(gx,gy,gz,0xffffff,20);addShake(.3);toast("元素盾破碎！");sound("kill");}
  }
  /* v23.1：元素反应 / 附着标记 */
  else if(e.type==="reaction"){
    const ry=terrainHeight(e.mx,e.mz);
    burstParticle(e.mx, ry+1.2, e.mz, e.color, 20);
    burstParticle(e.mx, ry+1.5, e.mz, 0xffffff, 6);
    spawnEchoRing(e.mx, ry+.6, e.mz, e.color, 2.4);
    spawnDmgNum(e.mx, ry+2.1, e.mz, e.name+"!", "#"+(e.color||0xffffff).toString(16).padStart(6,"0"), true);
    addShake(.32); addHitStop(.03); sound("react"); showHitMarker(false);
  }
  else if(e.type==="elemTag"){
    spawnDmgNum(e.mx, terrainHeight(e.mx,e.mz)+2.0, e.mz, e.tag, "#"+(e.color||0x7fffd4).toString(16).padStart(6,"0"), false);
  }
}
/* CSD-SOUL1-P2/P3：AI 行为 / BOSS 转阶段事件的渲染表现（ev1/ev3 共用） */
function handleSoulEvent(e){
  const X = (e.mx !== undefined) ? e.mx : e.bx;
  const Z = (e.mz !== undefined) ? e.mz : e.bz;
  const Y = terrainHeight(X, Z);
  if(e.type==="dodge"){ burstParticle(X, Y+1.2, Z, 0x9fe8ff, 6); sound("warn"); }
  /* v24.8 二阶段狂化演出 + 召援补建网格 */
  else if(e.type==="enrage"){
    burstParticle(X, Y+1.2, Z, 0xff274f, 18);
    spawnEchoRing(X, Y+.5, Z, 0xff274f, 2.2);
    spawnDmgNum(X, Y+2.2, Z, "狂化!", "#ff274f", true);
    sound("chargeWarn"); addShake(.25);
  }
  else if(e.type==="summon"){
    if(G.monsters.length>monsterMeshes.length)spawnMonsterMeshAt(G.monsters[G.monsters.length-1]);
    sound("warn");
  }
  else if(e.type==="guard"){ burstParticle(X, Y+1.5, Z, 0xd9c08a, 12); sound("thud"); }
  else if(e.type==="feint"){
    if(e.baited){ burstParticle(X, Y+1.5, Z, 0xff2244, 14); sound("comboWarn"); }   // 诱骗得手 → 快招反制
  }
  else if(e.type==="phaseChange"){
    burstParticle(X, Y+2.4, Z, 0xff2244, 40);
    spawnEchoRing(X, Y+1.2, Z);
    sound("aoewarn"); vibrate(60);
    addShake(0.9); addHitStop(0.16);
    toast(e.phase===3 ? "深渊领主陷入狂怒！" : "深渊领主进入第二阶段！");
    showTransmission(BOSS_NAMES[G.boss?.type]||"核心守卫",e.phase===3?"最终防线已暴露：记忆删除权限正在失控。":"协议升级：守卫正在调用你被删除的战斗记录。",4200);
  }
  else if(e.type==="enemySkill"){
    burstParticle(X,Y+1.2,Z,e.skill==="腐蚀领域"?0x83ff66:(e.skill==="晶化护阵"?0x62d9ff:0xb05cff),18);
    sound(e.skill==="晶化护阵"?"chargeWarn":"aoewarn");toast("怪物技能 · "+e.skill);
  }
}
/* W1：武器 HUD/按钮同步（当前高亮 + 渊棘弹药角标 + 发射/切换按钮图标配色 + 冷却置灰） */
const WEAPON_UI = {
  1:{ glyph:"◉", color:"#7fffd4", name:"髓震脉冲" },
  2:{ glyph:"▲", color:"#3aa6ff", name:"瓷骨之矛" },
  3:{ glyph:"◌", color:"#9fe8ff", name:"舰髓回响" }
};
let weaponSlotEls = null, ammoBadgeEl = null;
function updateWeaponUI(){
  const w = G ? (G.weapon||1) : 1;
  if(!weaponSlotEls){
    weaponSlotEls = Array.prototype.slice.call(document.querySelectorAll("#weaponSlots .wslot"));
    ammoBadgeEl = document.getElementById("ammoBadge");
  }
  for(const el of weaponSlotEls){if(el.id==="dashChip")continue;el.classList.add("cur");const g2=(WEAPON_UI[w]||WEAPON_UI[1]).glyph;if(el.textContent!==g2)el.textContent=g2;}   // v28：单专属武器槽
  const ui = WEAPON_UI[w] || WEAPON_UI[1];
  if(typeof viewEmitterMat!=="undefined") viewEmitterMat.color.set(ui.color);
  if(typeof viewWeaponAttachments!=="undefined"){const shown=w===4?2:w;for(const id of [1,2,3])viewWeaponAttachments[id].visible=id===shown;}   // v28 近战沿用枪刺模型
  const btn = _el("btnPulse");
  if(btn){
    _setETxt(btn, "");
    _setEStyle(btn,"borderColor",ui.color);
    _setEStyle(btn,"color",ui.color);
    _setEStyle(btn,"opacity",(G && G.cool[w] > 0) ? "0.45" : "1");   // 冷却置灰（沿用 UX §4 冷却指示）
    const pc=(G&&G.cool[w]>0)?Math.min(100,Math.round(G.cool[w]/((WEAPONS[w]&&WEAPONS[w].cool)||.5)*100)):0;   // v29 冷却扇形+图标
    if(btn.__cd!==pc){btn.__cd=pc;const ic=btn.dataset.bicon;
      btn.style.backgroundImage=ic?("url(\""+ic+"\")"+(pc>0?",conic-gradient(rgba(2,8,14,.82) "+pc+"%,rgba(0,0,0,0) 0)":"")):"";
      btn.style.backgroundSize=ic?"62% 62%,100% 100%":"";
      btn.style.backgroundPosition="center,center";btn.style.backgroundRepeat="no-repeat,no-repeat";}
  }
  const sw = _el("btnWeapon");
  if(sw){ _setETxt(sw, "技3"); }
}
function setCurrentWeapon(wid){
  if(!setWeapon(wid)) return false;
  chargeT=0;chargeReady=false;document.body.classList.remove("charging","charge-ready");   // v23：切枪取消蓄力
  updateWeaponUI();
  toast("已切换 · " + ((WEAPON_UI[wid]||{}).name || ""));
  return true;
}
function cycleWeapon(){
  return setCurrentWeapon(((G.weapon||1) % 3) + 1);
}
/* v3：始终告诉玩家“现在该做什么”，并与五关 objective 数据保持一致 */
function updateObjectiveUI(){
  const el = _el("objectiveCard");   // v23 PERF：缓存元素查询
  if(!el || !G) return;
  const obj = G.objective || { kind:"collect", n:(G.sampleTarget||TARGET_SAMPLES) };
  let text = "探索深渊";
  let complete = false;
  const baseDone=baseObjectiveMet(),bossAlive=!!(G.boss&&G.boss.hp>0);
  if(G.modeId==="endless"&&G.endless){let alive=0;{const ml=G.monsters||[];for(let qi=0;qi<ml.length;qi++)if(ml[qi].hp>0)alive++;}text="第 "+G.endless.wave+" 波 · "+(baseDone&&bossAlive?("巨兽决战 "+(BOSS_NAMES[G.boss.type]||"核心守卫")):("剩余敌人 "+alive))+" · 威胁 ×"+G.endless.damageMul.toFixed(2);complete=!!G.endless.cleared;}
  else if(baseDone&&bossAlive){text="解除核心守卫协议 · "+(BOSS_NAMES[G.boss.type]||"核心守卫");}
  else if(objectiveMet()){text="守卫协议已解除 · 进入下行舱门";complete=true;}
  else if(obj.kind === "collect"){
    complete = G.samples >= (obj.n||G.sampleTarget||TARGET_SAMPLES);
    text = complete ? "证据核验完成 · 前往下行舱门" : ("回收现场证据 · " + G.samples + "/" + (obj.n||G.sampleTarget||TARGET_SAMPLES));
  } else if(obj.kind === "kill"){
    complete = (G.kills||0) >= obj.n;
    text = complete ? "维护节点已清除 · 前往主缆井" : ("断开失控维护体 · " + (G.kills||0) + "/" + obj.n);
  } else if(obj.kind === "elite"){
    complete = objectiveMet();
    text = complete ? "档案看守已解除 · 前往记忆母体" : "解除晶化档案看守";
  } else if(obj.kind === "survive"){
    complete = G.time >= obj.t;
    text = complete ? "乘员审查通过 · 前往航鲸信标" : ("抵抗记忆清洗 · 剩余 " + Math.max(0, Math.ceil(obj.t-G.time)) + " 秒");
  } else if(obj.kind === "scan"){
    const done=(G.scanDone||[]).filter(Boolean).length,total=(obj.points||[]).length,idx=Math.min(total-1,done),hold=(G.scanHold||[])[idx]||0;complete=done>=total;text=complete?"结构扫描完成 · 前往下行舱门":"驻留扫描节点 · "+done+"/"+total+" · "+Math.round(Math.min(1,hold/(obj.hold||1))*100)+"%";
  } else if(obj.kind === "hybrid"){
    complete=G.samples>=obj.n&&(G.kills||0)>=obj.kills;text=complete?"调查与清场完成 · 前往下行舱门":"双重任务 · 证据 "+G.samples+"/"+obj.n+" · 击杀 "+(G.kills||0)+"/"+obj.kills;
  } else if(obj.kind === "defend"){
    complete=!!G.defendComplete||(G.defendProgress||0)>=obj.t;text=complete?"中继防守完成 · 前往下行舱门":"守住青色中继区 · "+Math.floor(G.defendProgress||0)+"/"+obj.t+" 秒";
  } else if(obj.kind === "gauntlet"){
    const wave=G.gauntletWave||1;let alive=0;{const ml=G.monsters||[];for(let qi=0;qi<ml.length;qi++)if(ml[qi].hp>0)alive++;}complete=wave>=obj.waves&&alive===0;text=complete?"三波增援已清除 · 前往下行舱门":"增援战 "+wave+"/"+obj.waves+" · 剩余 "+alive;
  } else if(obj.kind === "gate"){
    text = "收集封印钥并唤醒五指门 · " + G.samples + "/" + (G.sampleTarget||TARGET_SAMPLES);
  }
  const html="<b>当前任务</b> · "+text;if(el.dataset.storyText!==html){el.dataset.storyText=html;el.innerHTML=html;}
  el.classList.toggle("open", complete);
}
function tryPickup(){
  if(!G || G.state!==S.PLAYING) return;
  const idx = tryCollect(player.x, player.z);
  if(idx>=0){
    sampleMeshes[idx].visible = false;
    const s = (G.sampleSpots || SAMPLE_SPOTS)[idx];
    const y = terrainHeight(s.x, s.z)+1.2;
    const pickup=sampleMeshes[idx]&&sampleMeshes[idx].userData||{},pickupName=pickup.pickupName||"现场证据";
    burstParticle(s.x, y, s.z, pickup.color||0x7fffd4, 12);
    spawnParticleMeshes();
    sound("pickup");
    vibrate(20);        // UX §5：拾取触觉（可关闭）
    toast(pickupName+" 已回收");
    maybeStoryPickup();
    saveGame();         // S5：进度写入（刷新可续）
    if(baseObjectiveMet()&&G.boss&&G.boss.hp>0) toast((BOSS_NAMES[G.boss.type]||"核心守卫")+" 协议已激活！");
    else if(G.winOpen) toast("下行舱门已开启！罗盘正在校准");
  }
}

/* ================= 状态切换与 UI ================= */
function startGame(retryCurrent){
  setSoul(true);   // CSD-SOUL1-P1：启用魂系模式（招式池 + 韧性；freshRun 据此挂载实例字段）
  if(!retryCurrent){resetStoryRun();resetRunBuild();applySelectedRouteBonus();}
  const idx=retryCurrent&&G&&G.level?G.level-1:runSelection.level;
  G = createConfiguredLevel(idx,{score:0,ammo:AMMO_START,runTime:0,gold:retryCurrent&&G?G.gold:undefined,goldEarned:retryCurrent&&G?G.goldEarned:0,equip:retryCurrent&&G?(G.equip||[]).slice():undefined},!retryCurrent);   // v37 重试继承金币装备
  if(G.modeId==="endless")prepareEndlessWave(1,false);
  saveGame();   // S5：新局进度快照 + 设置持久化
  rebuildScene();
  rebuildPressureEnvironment();
  rebuildMissionMarkers();
  clearTelegraphRings();
  player = { x:0, y:terrainHeight(0,0)+1.7, z:0, vy:0, yaw:0, pitch:0, onGround:true };
  camera.position.set(player.x, player.y, player.z);
  camera.rotation.set(0,0,0);
  document.getElementById("menu").classList.add("hidden");
  document.getElementById("over").classList.add("hidden");
  document.getElementById("pause").classList.add("hidden");
  document.getElementById("hud").classList.add("show");
  updateRunBadge();applyRoleVisual();showLevelIntro(LEVELS[G.level-1]);
  if(G.level>=5)unlockAchievement("deepDive");
  burstParticle(player.x,player.y-.35,player.z,selectedRole().accent,24);spawnParticleMeshes();
  updateWeaponUI();   // W1：开局同步武器 HUD（声呐高亮 + 渊棘 4/6）
  input.reset();
  dashQueued=false;shieldQueued=false;overdriveQueued=false;
  sound("start");
  if(G.modeId==="endless"){showTransmission("无尽协议","清除全部敌人即可获得三选一构筑；每五波巨型守卫降临。没有终点，只有更高纪录。",4800);resumeAfterStory();}
  else if(retryCurrent){showTransmission("零号灯塔","潜航记录从中断点重新挂载。已读剧情不会重复覆盖你的记忆。",3900);resumeAfterStory();}
  else showChapterOpening(G.level,true,resumeAfterStory);
}
function fmtTime(t){
  t = Math.max(0, Math.floor((t||0)));
  const m = Math.floor(t/60), s = t%60;
  return m + ":" + String(s).padStart(2, "0");
}
function setOver(win){
  G.state=S.OVER;input.setEnabled(false);
  const recordLevel=G.runStartLevel===undefined?runSelection.level:G.runStartLevel,key=runRecordKey(G.modeId||runSelection.modeId,recordLevel);hi=readRunRecord(G.modeId||runSelection.modeId,recordLevel);
  const isNew=G.score>hi;
  if(isNew){hi=G.score;try{if(storage)storage.setItem(key,String(hi));}catch(e){}}
  /* CSD-H2：死因分支（§1.5）——生命归零 */
  const dieHp = !win && G.deathCause === "hp",ending=win?(STORY_ENDINGS[G.storyEnding]||STORY_ENDINGS.archive):null,endingTag=document.getElementById("endingTag");
  document.getElementById("overTitle").textContent = win ? ending.title
    : "潜航记录中断 · 髓瓷躯崩解";
  document.getElementById("overSub").textContent = win ? ending.sub
    : (dieHp ? ROLE_STORY[G.roleId||runSelection.roleId].death : "零号灯塔已保存你抵达此处的记忆。下一副潜航躯体仍可以继续。 ");
  endingTag.textContent=win?ending.tag:"复生校验待执行";endingTag.classList.add("show");
  document.getElementById("overScore").textContent = G.score;
  document.getElementById("retryBtn").textContent=win?"再次开始":"放弃构筑并重试";
  const continueBtn=document.getElementById("continueBtn"),continueCost=meta.unlocks.lifePod?18:30;
  continueBtn.classList.toggle("show",!win);continueBtn.disabled=meta.currency<continueCost;
  continueBtn.textContent=meta.currency>=continueCost?("消耗 "+continueCost+" 船币原地续命"):("续命需 "+continueCost+" 船币");
  document.getElementById("overHi").textContent = "最高纪录 " + hi + " 分" + (isNew ? " · 新纪录！" : "");
  // S8：结算明细（样本 x/8、灰手击杀 x/4、本局用时）+ CSD-M2：关卡进度；CSD-H2：追加死因行
  document.getElementById("overDetail").innerHTML =
    "模式 <b>" + ((RUN_MODES[G.modeId]||RUN_MODES.expedition).name) + "</b>　·　潜航员 <b>" + ((DIVER_ROLES[G.roleId]||DIVER_ROLES.explorer).name) + "</b><br>" +
    "现场证据 <b>" + G.samples + "/" + (G.sampleTarget||TARGET_SAMPLES) + "</b>　·　解除维护体 <b>" + (G.kills||0) + "/" + (G.monsters ? G.monsters.length : MONSTER_SPOTS.length) + "</b><br>" +
    "本次下潜用时 <b>" + fmtTime(G.runTime||G.time) + "</b>" +
    (G.level !== undefined ? ("<br>抵达关卡 <b>L" + G.level + " " + (LEVELS[G.level-1] ? LEVELS[G.level-1].name : "") + "</b>") : "") +
    "<br>金币收入 <b>"+Math.round(G.goldEarned||0)+"</b>　·　装备 <b>"+((G.equip||[]).length)+"</b> 件　·　最高连杀 <b>"+meta.bestStreak+"</b>　·　永久船币 <b>"+meta.currency+"</b>"+
    (win ? ("<br>最终选择 <b>"+ending.choice+"</b>　·　秩序/共鸣 <b>"+storyRun.order+"/"+storyRun.echo+"</b>") : ("<br>中断原因：<b>髓瓷结构归零</b><br>续命保留本局构筑与永久资源，但扣除 15% 当前分数。"));
  saveGame();   // S5：结算后落盘最终进度
  document.getElementById("hud").classList.remove("show");
  document.getElementById("over").classList.remove("hidden");
  document.exitPointerLock();
  sound(win?"win":"lose");
}
function continueAfterDeath(){
  if(!G||G.state!==S.OVER)return;
  const cost=meta.unlocks.lifePod?18:30;
  if(meta.currency<cost){toast("船币不足，无法启动紧急重生舱");return;}
  meta.currency-=cost;meta.continues++;saveMeta();unlockAchievement("reborn");
  G.state=S.PLAYING;G.deathCause=null;G.hp=Math.max(1,Math.ceil(G.maxHp*.55));G.score=Math.floor(G.score*.85);
  G.spitPulses=[];G.enemyHazards=[];disposeRoots(pulses.map(p=>p.mesh).filter(Boolean));pulses=[];clearTelegraphRings();
  runBuild.streak=0;runBuild.streakTimer=0;pressure.time=0;pressure.damageTick=1;
  /* v32 原地复活 */player.y=terrainHeight(player.x,player.z)+1.7;player.vy=0;player.onGround=true;
  camera.position.set(player.x,player.y,player.z);input.reset();dashQueued=false;shieldQueued=false;overdriveQueued=false;
  document.getElementById("over").classList.add("hidden");document.getElementById("hud").classList.add("show");document.getElementById("endingTag").classList.remove("show");
  renderRunBuildStrip();saveGame();showTransmission("紧急重生舱","原地重构潜航躯体：保留全部装备与金币，清空敌方弹幕，生命恢复至 55%，分数扣除 15%。",4400);resumeAfterStory();sound("start");
}
function toMenu(){
  if(G) G.state = S.MENU;
  input.setEnabled(false);
  try{ if(document.pointerLockElement) document.exitPointerLock(); }catch(e){}
  document.getElementById("over").classList.add("hidden");
  document.getElementById("pause").classList.add("hidden");
  storyOverlay.classList.add("hidden");archiveOverlay.classList.add("hidden");document.getElementById("transmission").classList.remove("show");storyModalActive=false;
  document.getElementById("menu").classList.remove("hidden");
  const menuPanel=document.querySelector("#menu .panel");if(menuPanel)menuPanel.scrollTop=0;
  document.getElementById("hud").classList.remove("show");
  document.getElementById("bossWrap").classList.remove("show");
}
function toast(t){ _setTxt("interact", t); _el("interact").classList.add("show"); setTimeout(()=>_el("interact").classList.remove("show"), 2600); }

/* 简易音效 */
let ac = null;
function initAudio(){ try{ if(!ac) ac = new (window.AudioContext||window.webkitAudioContext)(); if(ac.state==="suspended") ac.resume(); }catch(e){ ac=null; } }
/* v31 分层动态音乐：探索/战斗/巨兽三段程序化 loop（2s 小节，按战场状态切换） */
const MUSIC={bar:0};
function musicNote(freq,t,dur,type,gain){
  if(!ac||settings.mute)return;
  try{const o=ac.createOscillator(),g2=ac.createGain();o.type=type||"sine";o.frequency.value=freq;
    g2.gain.setValueAtTime(0,t);g2.gain.linearRampToValueAtTime(gain||.05,t+.05);g2.gain.exponentialRampToValueAtTime(.001,t+dur);
    o.connect(g2).connect(ac.destination);o.start(t);o.stop(t+dur+.05);}catch(err){}
}
function musicTick(){
  if(!ac||settings.mute||!G||G.state!==S.PLAYING)return;
  const combat=(G.time-(G.lastCombatT||-9)<4)||(G.monsters||[]).some(m=>m.hp>0&&Math.hypot(m.x-player.x,m.z-player.z)<14);
  const boss=G.boss&&G.boss.hp>0;
  const t=ac.currentTime+.05,bar=MUSIC.bar++%4;
  const scale=[220,261.6,293.7,329.6,392,440];
  if(boss){musicNote(scale[bar%3]*.5,t,.5,"sawtooth",.05);musicNote(scale[(bar+2)%6]*2,t+.25,.3,"square",.028);}
  else if(combat){musicNote(scale[bar%6],t,.35,"triangle",.05);if(bar%2)musicNote(scale[(bar+3)%6]*.5,t,.4,"sine",.04);}
  else{musicNote(scale[bar]*.5,t,1.6,"sine",.03);musicNote(scale[(bar+2)%6]*.5,t+.8,1.4,"sine",.024);}
}
setInterval(()=>{try{musicTick();}catch(e){}},2000);
function tone(f, dur, type, vol, slide){
  if(!ac) return;
  try{
    const t = ac.currentTime;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type||"sine"; o.frequency.setValueAtTime(f, t);
    if(slide) o.frequency.exponentialRampToValueAtTime(Math.max(30,f+slide), t+dur);
    g.gain.setValueAtTime(vol||0.1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t+dur);
    o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t+dur+0.02);
  }catch(e){}
}
function sound(k){
  if(settings.mute) return;   // S5：静音开关（设置持久化）
  if(k==="shoot"){const wid=G?G.weapon||1:1;if(wid===1)tone(720,0.08,"square",0.035,-320);else if(wid===3)tone(320,0.14,"sawtooth",0.05,-160);else tone(520,0.09,"sawtooth",0.04,-220);}
  else if(k==="hit_rail")tone(880,0.06,"sine",0.06,-440);
  else if(k==="hit_hammer")tone(120,0.15,"triangle",0.09,-60);
  else if(k==="hit_grenade"){tone(180,0.18,"sawtooth",0.07,-80);setTimeout(()=>tone(90,0.22,"sine",0.05,-40),40);}
  else if(k==="pickup"){ tone(660,0.12,"sine",0.09,440); setTimeout(()=>tone(990,0.14,"sine",0.07,0),60); }
  else if(k==="hurt"){ tone(200,0.28,"sawtooth",0.12,-110); }
  else if(k==="kill"){ tone(320,0.22,"triangle",0.1,-140); }
  else if(k==="warn"){ tone(660,0.14,"square",0.05,0); }   // S6/S7：起手/接触预警提示音
  else if(k==="thud"){ tone(140,0.12,"triangle",0.08,-40); }   // CSD-H2：弹丸碰障碍沉闷撞击（与 shoot/hit 可辨）
  else if(k==="hpwarn"){ tone(75,0.18,"sine",0.09,0); }   // CSD-H2：低血心跳告警（进入低血瞬间一次，防轰炸）
  else if(k==="thorn"){ tone(880,0.12,"sawtooth",0.06,320); }   // W1：渊棘高频尖鸣（晶棘破水，880→1200Hz 短促）
  else if(k==="echo"){ tone(160,0.5,"sine",0.12,0); setTimeout(()=>tone(120,0.5,"sine",0.1,0),30); }   // W1：回响低频轰鸣（双正弦叠加长衰减）
  else if(k==="dash"){ tone(260,0.16,"sawtooth",0.055,520); }
  else if(k==="shield"){tone(330,.32,"sine",.08,260);setTimeout(()=>tone(660,.25,"sine",.05,0),70);}
  else if(k==="overdrive"){tone(110,.5,"sawtooth",.08,330);}
  else if(k==="start"){ tone(440,0.2,"sine",0.08,220); }
  else if(k==="win"){ [523,659,784,1047].forEach((f,i)=>setTimeout(()=>tone(f,0.3,"sine",0.1,0),i*130)); }
  else if(k==="lose"){ [392,311,233,155].forEach((f,i)=>setTimeout(()=>tone(f,0.4,"sawtooth",0.08,-30),i*150)); }
  /* CSD-SOUL1-P1：三层预警 L3 音效（设计 §2.2）+ 处决成功 */
  else if(k==="chargeWarn"){ tone(220,0.45,"sawtooth",0.07,420); }   // 升调蓄力（220→640Hz）
  else if(k==="aoewarn"){ tone(90,0.5,"sine",0.12,0); setTimeout(()=>tone(70,0.4,"sine",0.1,0),40); }   // 低频轰鸣（范围技）
  else if(k==="comboWarn"){ tone(520,0.09,"square",0.06,0); setTimeout(()=>tone(660,0.1,"square",0.06,0),110); }   // 双短音（连击第二段）
  else if(k==="exec"){ tone(880,0.1,"sawtooth",0.09,220); setTimeout(()=>tone(1320,0.18,"sawtooth",0.07,0),60); }   // 处决成功（上挑短音）
  /* v23：蓄力重击 / 完美闪避 */
  else if(k==="chargeFull"){ tone(440,.14,"sine",.06,220); }   // 蓄力完成提示（短升音）
  else if(k==="charged"){ tone(180,.3,"sawtooth",.1,-60); setTimeout(()=>tone(90,.4,"sine",.12,0),30); }   // 蓄力重击低频爆响
  else if(k==="perfect"){ tone(990,.12,"sine",.09,0); setTimeout(()=>tone(1480,.2,"sine",.08,0),70); }   // 完美闪避清脆双音
  else if(k==="react"){ tone(720,.1,"sine",.08,240); setTimeout(()=>tone(1080,.16,"sine",.07,0),55); }   // v23.1 元素反应
  else if(k==="bossin"){ tone(98,.7,"sawtooth",.11,36); setTimeout(()=>tone(147,.9,"sawtooth",.09,-20),180); }   // v23.1 巨兽出场号角
  else if(k==="crit"){ tone(1320,.08,"square",.07,260); setTimeout(()=>tone(1980,.14,"sine",.08,0),50); }   // v24.7 暴击双击音
}
/* 触觉反馈（UX §5 可访问性：受击 30ms / 拾取 20ms / BOSS 击杀 60ms；可关闭） */
function vibrate(ms){
  if(!settings.vibrate) return;
  try{ if(navigator && typeof navigator.vibrate === "function") navigator.vibrate(ms); }catch(e){}
}

/* v23 自适应环境音乐：WebAudio 生成式深海氛围垫（55Hz 基音 + 纯五度 + 微失谐涌动，LFO 扫低通）。
   无外部音频文件；threat 0(巡航)→1(战斗) 平滑控制音量与亮度。静音设置下自动停止。 */
let ambNodes=null,ambIntensity=0;
function startAmbient(){
  try{
    if(ambNodes||!ac)return;
    const g=ac.createGain();g.gain.value=0;g.connect(ac.destination);
    const flt=ac.createBiquadFilter();flt.type="lowpass";flt.frequency.value=480;flt.Q.value=.6;flt.connect(g);
    const o1=ac.createOscillator();o1.type="sine";o1.frequency.value=55;
    const o2=ac.createOscillator();o2.type="triangle";o2.frequency.value=82.5;
    const o3=ac.createOscillator();o3.type="sine";o3.frequency.value=110.4;
    const og1=ac.createGain();og1.gain.value=.5;const og2=ac.createGain();og2.gain.value=.15;const og3=ac.createGain();og3.gain.value=.09;
    const lfo=ac.createOscillator();lfo.frequency.value=.07;const lg=ac.createGain();lg.gain.value=150;
    lfo.connect(lg);lg.connect(flt.frequency);
    o1.connect(og1);og1.connect(flt);o2.connect(og2);og2.connect(flt);o3.connect(og3);og3.connect(flt);
    o1.start();o2.start();o3.start();lfo.start();
    ambNodes={g,o1,o2,o3,lfo};
  }catch(e){}
}
function stopAmbient(){
  try{
    if(!ambNodes)return;
    ambNodes.g.gain.setTargetAtTime(0,ac.currentTime,.15);
    const n=ambNodes;setTimeout(()=>{try{n.o1.stop();n.o2.stop();n.o3.stop();n.lfo.stop();}catch(e){}},700);
    ambNodes=null;ambIntensity=0;
  }catch(e){}
}
function tickAmbient(dt,threat){
  try{
    if(settings.mute){stopAmbient();return;}
    if(!G||G.state!==S.PLAYING){if(ambNodes)ambNodes.g.gain.setTargetAtTime(0,ac.currentTime,.4);return;}
    if(!ambNodes){if(ac)startAmbient();if(!ambNodes)return;}
    ambIntensity+=(Math.min(1,threat)-ambIntensity)*Math.min(1,dt*1.4);
    ambNodes.g.gain.setTargetAtTime(.024+ambIntensity*.05,ac.currentTime,.5);
    ambNodes.lfo.frequency.setTargetAtTime(.07+ambIntensity*.5,ac.currentTime,.6);
  }catch(e){}
}

/* ================= 主循环 ================= */
let lastTs = 0;
let frameDirty = true;   // v23：暂停态补帧标记（resize 后强制渲染一帧）
/* v23 PERF：HUD 元素缓存 + 值变化检测。主循环原先每帧 40+ 次 getElementById 与无条件 DOM 写入，
   现统一走 _el/_setTxt/_setBarW/_setOpacity，值未变时零样式失效（条形图带 width 过渡，收益显著）。 */
const _hudEls={};
function _el(id){let e=_hudEls[id];if(!e)e=_hudEls[id]=document.getElementById(id);return e;}
function _setTxt(id,v){const e=_el(id);if(e&&e.__tv!==v){e.__tv=v;e.textContent=v;}}
function _setETxt(e,v){if(e&&e.__tv!==v){e.__tv=v;e.textContent=v;}}
function _setBarW(id,v){const e=_el(id);if(e&&e.__bw!==v){e.__bw=v;e.style.width=v+"%";}}
function _setOpacity(id,v){const e=_el(id);if(e&&e.__op!==v){e.__op=v;e.style.opacity=v;}}
function _setEStyle(e,prop,v){const k="__s_"+prop;if(e&&e[k]!==v){e[k]=v;e.style[prop]=v;}}
/* v23.5：受击方向指示（与罗盘同一套方位角换算，0°=面朝方向） */
const _dmgDir={el:null,t:0};
let hpWarnT=0;   // v24.13：低血循环警报计时
function showDamageDir(x,z){
  const el=_dmgDir.el||(_dmgDir.el=document.getElementById("dmgDir"));
  if(!el)return;
  const ang=(Math.atan2(x-player.x,z-player.z)-player.yaw)*180/Math.PI;
  el.style.transform="translate(-50%,-50%) rotate("+ang.toFixed(1)+"deg)";
  el.classList.add("show");
  _dmgDir.t=.9;
}
/* v24.2：GitHub mrdoob/stats.js 性能 HUD（内联单文件，仅 ?qa=1 显示）——实测各轮优化的帧率/耗时收益 */
let qaStats=null;
try{
  if(location.search.indexOf("qa=1")>=0 && typeof Stats==="function"){
    qaStats=new Stats();qaStats.showPanel(0);
    document.body.appendChild(qaStats.dom);
    qaStats.dom.style.position="fixed";qaStats.dom.style.left="8px";qaStats.dom.style.top="8px";qaStats.dom.style.zIndex="99";
  }
}catch(e){}

function loop(ts){
  if(qaStats)qaStats.begin();
  let dt = Math.min(0.05, (ts-lastTs)/1000 || 0.016);
  lastTs = ts;
  /* CSD-SOUL1-FUN：命中顿帧——hitstop>0 时本帧时间缩放为 18%（击杀/处决/转阶段慢动作） */
  if(hitstop > 0){ hitstop = Math.max(0, hitstop - dt); dt *= 0.18; }
  if(G && G.state===S.PLAYING){
  input.setEnabled(true);
  /* HOTFIX-IFRAME：内嵌预览中 Pointer Lock 请求失败（fallbackLook=true）→ 一次性 toast。
     PC 正常环境 IS_IFRAME=false 短路，行为零变化；lockWarned 防抖保证只提示一次。 */
  if(IS_IFRAME && !lockWarned && input.fallbackLook){
    lockWarned = true;
    toast("预览环境无法锁定鼠标，请在新标签页打开");
  }
  const act = input.getActions();
  if(G&&G.gpMove){act.move.x+=G.gpMove.x;act.move.z+=G.gpMove.z;}   // v31 手柄左摇杆
  if(gpPulse){act.pulse=true;}   // v31 手柄普攻
  if(GP.jumpHeld){act.jump=true;}
  try{
    // 视角：look 语义（鼠标/触屏增量统一应用，灵敏度与 v0 一致）
    player.yaw -= act.look.dx*0.0022;
    player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch - act.look.dy*0.0022));
    // 语义动作 → 玩法
    if(dashQueued){tryDash(act);dashQueued=false;}
    if(shieldQueued){activateShield();shieldQueued=false;}
    if(overdriveQueued){activateOverdrive();overdriveQueued=false;}
    for(let si2=0;si2<3;si2++){if(skillQueued[si2]){skillQueued[si2]=false;castRoleSkill(si2);}}   // v28 角色技能
    if(act.pulse) fireFromCamera();
    /* v23 蓄力重击：按住发射键蓄力（≥0.65s 就绪，准星转金），松开释放强化弹（1 号 AOE / 2 号贯穿）。
       3 号深渊回响为即时 AOE，无蓄力形态。 */
    if(act.pulse){
      if((G.weapon||1)!==3){
        chargeT+=dt;
        if(!chargeReady&&chargeT>=.65){chargeReady=true;sound("chargeFull");}
      }
      document.body.classList.toggle("charging",!chargeReady&&(G.weapon||1)!==3);
      document.body.classList.toggle("charge-ready",chargeReady);
    } else {
      if(chargeReady)fireChargedFromCamera();
      chargeT=0;chargeReady=false;
      document.body.classList.remove("charging","charge-ready");
    }
    if(act.pickup) tryPickup();
    if(act.pause||gpPauseEdge){gpPauseEdge=false;setPaused(true);}
    updatePlayer(dt, act);
    updateResources(dt);
    tickRunRewards(dt);
    tickSkillFx(dt);   // v28 技能特效与计时
    tickAtmosphere(dt);   // v31 昼夜/风暴
    tickGamepad(dt);
    netSendT=(netSendT||0)-dt;if(netSendT<=0){netSendT=.1;netSendState();}   // v40 WiFi 10Hz

    tickFish(dt);   // v34 M4 环境鱼群
    tickSky(dt);   // v34 F3 水下氛围
    /* v23.5 元素反应里程碑：每 5 次反应 → 奖分，鼓励元素轮转 */
    if((G.reactionCount|0)>=(G.reactionMilestone|0)+5){
      G.reactionMilestone=(G.reactionMilestone|0)+5;
      G.score+=Math.round(25*(G.scoreMul||1));
      toast("元素反应 ×"+G.reactionMilestone+" · 声望 +25");
      if(G.reactionCount>=10)unlockAchievement("elements10");
      if(G.reactionCount>=20)unlockAchievement("reactions20");
      burstParticle(player.x,player.y,player.z,0x9fe8ff,14);sound("pickup");
    }
    tickPressure(dt);
    /* v23 自适应氛围乐：威胁度=最近激怒/硬直敌人（BOSS 战恒 1），平滑淡入战斗声部 */
    {let threat=0;for(const tm of G.monsters){if(tm.hp>0&&(tm.rage||tm.cd>0))threat=Math.max(threat,1-Math.min(1,Math.hypot(tm.x-player.x,tm.z-player.z)/26));}if(G.boss&&G.boss.hp>0&&baseObjectiveMet())threat=1;tickAmbient(dt,threat);}
    tickWorldInteractives(dt);
    tickEchoFields(dt);
    syncEchoFieldMeshes();
    tickCampaignObjective(dt);
    const ev1 = tickMonsters(dt, player.x, player.z, { windup: MONSTER_WINDUP });   // S6：显式启用 0.4s 起手前摇（CSD-M2：dart/spitter 走独立状态机）
    for(const e of ev1){
      if(e.type==="windup" || e.type==="dartWindup"){ burstParticle(e.mx, terrainHeight(e.mx,e.mz)+1.4, e.mz, 0xff4466, 5); sound("warn"); }   // S6：抬手红光预警（含刃鳍扑击前摇）
      if(e.type==="telegraph"){   // CSD-SOUL1-P1：三层预警 L1（红光聚光）+ L2（地面圈）+ L3（音效）
        burstParticle(e.mx, terrainHeight(e.mx,e.mz)+1.4, e.mz, (e.telegraph && e.telegraph.color) || 0xff2244, 6);
        spawnTelegraphRing(e);
        const snd = (e.telegraph && e.telegraph.sound) || "warn";
        if(snd && snd !== "warn") sound(snd);   // chargeWarn/aoewarn/comboWarn（warn 已由 windup 事件播）
      }
      if(e.type==="hurt"){ burstParticle(e.mx, terrainHeight(e.mx,e.mz)+1, e.mz, 0xe0506a, 8); sound("hurt"); vibrate(30); addShake(0.5); hurtFlash = 1; showDamageDir(e.mx, e.mz); }
      if(e.type==="spit"){ burstParticle(e.mx, terrainHeight(e.mx,e.mz)+1, e.mz, 0x24333a, 6); }   // CSD-M2：墨鲛喷吐（鼓腮聚光）
      if(e.type==="sniperShot"){ burstParticle(e.mx, terrainHeight(e.mx,e.mz)+1.4, e.mz, 0xff426e, 16); sound("warn"); }
      handleSoulEvent(e);   // CSD-SOUL1-P2：闪避/防御/诱骗事件表现
    }
    /* v5：逻辑层会 splice 已命中/撞墙/过期弹丸；渲染层必须同步移除旧网格，防止幽灵子弹残留。
       v23 PERF：tickPulses 现将移除项写入复用数组 PULSES_REMOVED，替代每帧 slice + indexOf 全量比对。 */
    const ev2 = tickPulses(dt, pulses);
    for(const oldPulse of PULSES_REMOVED){
      if(oldPulse.mesh){disposeRoots([oldPulse.mesh]);oldPulse.mesh=null;}
    }
    for(const e of ev2) handleCombatEvent(e);   // W1：命中粒子/音效按武器区分
    const bossCfgNow=G.boss?(BOSS_TYPES[G.boss.type]||BOSS_TYPES.hand):BOSS_TYPES.hand;
    const ev3 = tickBoss(dt, player.x, player.z, { warnDist: bossCfgNow.warn||BOSS_WARN_DIST });
    for(const e of ev3){
      if(e.type==="warn"){ burstParticle(e.bx, terrainHeight(e.bx,e.bz)+2.4, e.bz, 0xff2244, 8); sound("warn"); }   // S7：接触预警红光
      if(e.type==="hurt"){ burstParticle(e.bx, terrainHeight(e.bx,e.bz)+2.4, e.bz, 0xe0506a, 10); sound("hurt"); vibrate(30); addShake(0.7); hurtFlash = 1; showDamageDir(e.bx, e.bz); }
      /* v23.1：巨兽阶段机制表现（预警圈 / 弹幕 / 震波） */
      if(e.type==="telegraph"){
        burstParticle(e.mx, terrainHeight(e.mx,e.mz)+1.4, e.mz, (e.telegraph && e.telegraph.color) || 0xff2244, 6);
        spawnTelegraphRing(e);
        const snd=(e.telegraph&&e.telegraph.sound)||"warn";
        if(snd && snd!=="warn") sound(snd);
      }
      if(e.type==="phaseBurst"){ burstParticle(e.bx, terrainHeight(e.bx,e.bz)+2.2, e.bz, 0x24333a, 22); addShake(.5); sound("echo"); }
      if(e.type==="phaseQuake"){ burstParticle(e.bx, terrainHeight(e.bx,e.bz)+.8, e.bz, 0xff5573, 30); spawnEchoRing(e.bx, terrainHeight(e.bx,e.bz)+.4, e.bz, 0xff5573, 3.2); addShake(1.0); addHitStop(.08); sound("aoewarn"); vibrate(40); }
      /* v23.3 专属技能「引力吞吸」：拉拽位移在渲染层结算（逻辑层不感知 player） */
      if(e.type==="sigPull"){
        const dx2=e.bx-player.x, dz2=e.bz-player.z, dd=Math.hypot(dx2,dz2);
        if(dd<e.radius && dd>.001){
          let nx=player.x+dx2/dd*Math.min(e.strength,Math.max(0,dd-2.6)), nz=player.z+dz2/dd*Math.min(e.strength,Math.max(0,dd-2.6));
          const rr2=resolveCollision(nx,nz,.7); player.x=rr2[0]; player.z=rr2[1];
          burstParticle(player.x, player.y, player.z, 0xff5b83, 8); addShake(.3);
        }
      }
      handleSoulEvent(e);   // CSD-SOUL1-P2/P3：诱骗/防御/BOSS 转阶段表现
    }
    // CSD-M2：墨鲛喷吐弹（独立数组，命中扣 8 氧）
    const evSpit = tickSpitPulses(dt, player.x, player.z);
    for(const e of evSpit){
      if(e.type==="hurt"){burstParticle(e.mx, terrainHeight(e.mx,e.mz)+1, e.mz, 0x24333a, 6); sound("hurt"); vibrate(30); addShake(0.5); hurtFlash = 1; showDamageDir(e.mx, e.mz);}
    }
    syncSpitMeshes();
    const evHazards=tickEnemyHazards(dt,player.x,player.z);
    for(const e of evHazards){if(e.type==="hurt"){burstParticle(player.x,player.y-.5,player.z,0x83ff66,8);sound("hurt");addShake(.35);hurtFlash=1;}}
    syncHazardMeshes();
    /* v23 PERF：移除此处冗余的 spawnParticleMeshes()——主循环尾部粒子积分后仍会同步一次，同帧等效。 */
    /* v23 完美闪避演出：逻辑层在 i-frame 完美窗口被命中时置位 G.perfectDodgeFx，这里一次性消费。 */
    if(G.perfectDodgeFx){
      G.perfectDodgeFx=0;
      addHitStop(.3);addShake(.55);sound("perfect");vibrate(26);
      burstParticle(player.x,player.y,player.z,0xffd66b,26);
      spawnEchoRing(player.x,player.y-.4,player.z,0xffd66b,2.2);
      spawnDmgNum(player.x,player.y+.75,player.z,"完美闪避!","#ffd66b",true);
      unlockAchievement("perfectDodge");
      meta.pdCount=(meta.pdCount||0)+1;if(meta.pdCount>=5)unlockAchievement("dodgeMaster");
      document.body.classList.add("perfect-dodge");
      setTimeout(()=>document.body.classList.remove("perfect-dodge"),450);
    }
    /* v4 环境动画：焦散、藻叶与海床生物保持低频缓动 */
    if(causticMesh) causticMesh.material.uniforms.uTime.value=G.time;
    waterSurfaceMat.uniforms.uTime.value=G.time;
    if(grassShader&&grassShader.uniforms.uV9Time)grassShader.uniforms.uV9Time.value=G.time;
    for(const s of lightShafts.children){const op=.032+.018*(.5+.5*Math.sin(G.time*.22+s.userData.phase));for(const m of s.userData.materials||[]){m.uniforms.uOpacity.value=op;m.uniforms.uPhase.value=G.time*.18+s.userData.phase;}s.rotation.y+=dt*.012;}
    rimLight.position.set(player.x-16,player.y+7,player.z-20);
    if(!lowQ){sun.position.set(player.x+30,45,player.z+20);sun.target.position.set(player.x,terrainHeight(player.x,player.z),player.z);sun.target.updateMatrixWorld();}
    for(const o of obstacleMeshes){
      if(o.userData&&o.userData.kind==="kelp"){
        for(let si=0;si<o.userData.stems.length;si++) o.userData.stems[si].rotation.z=Math.sin(G.time*.72+o.userData.seed+si)*.075;
      }
    }
    for(const d of detailMeshes){
      if(d.userData.kind==="grass") d.rotation.z=Math.sin(G.time*.65+d.userData.phase)*.035;
      else if(d.userData.kind==="anemone") d.rotation.y+=dt*.12;
      else if(d.userData.kind==="vent") d.children[d.children.length-1].rotation.y+=dt*.25;
      else if(d.userData.kind==="landmark")for(let i=0;i<d.userData.animated.length;i++){const a=d.userData.animated[i],pulse=1+.018*Math.sin(G.time*.8+d.userData.phase+i*.6);a.rotation.z=a.userData.baseRotZ+Math.sin(G.time*.42+i)*.018;a.scale.copy(a.userData.baseScale).multiplyScalar(pulse);}
    }
    tickLoot(dt);
    tickEndless();
    // CSD-M2：目标同步（kill/elite/survive 达标后开启裂口；collect/gate 由 collectSample 置位 winOpen）
    if(!G.winOpen && objectiveMet()) G.winOpen = true;
    /* v24.5：精英舱清空奖励 */
    if(G.winOpen&&runBuild.routeElitePending){runBuild.routeElitePending=false;grantGold(300,"精英战利品");}
    if(G.modeId!=="endless")checkStoryTriggers();
  /* v41 新手引导 */
  if(!meta.tutorialDone&&!meta.tutorialStep)meta.tutorialStep=0;
  if(meta.tutorialStep!==undefined&&meta.tutorialStep<8&&!meta.tutorialDone){
    const steps=["WASD 移动 · 走到金色菱形处按 E 拾取","左键攻击 · 瞄准怪物射击","Q 闪避 · 在命中瞬间闪避触发完美弹反","按 1/2/3 释放技能 · 每个角色三个技能","靠近发光物按 E 拾取 · 证据恢复弹药","按 B 打开装备库 · 用金币购买装备","交替命中不同元素触发反应！","走进红色传送门进入下一关"];
    const stepCond=[null,()=>G.samples>0,()=>G.kills>0,()=>true,()=>true,()=>true,()=>(G.reactionCount||0)>0,()=>G.winOpen];
    if(stepCond[meta.tutorialStep]&&(!stepCond[meta.tutorialStep]||stepCond[meta.tutorialStep]())){
      if(meta.tutorialStep===0||stepCond[meta.tutorialStep]()){meta.tutorialStep++;showTransmission("新手引导 · "+(meta.tutorialStep)+"/8",steps[meta.tutorialStep-1]||"",4000);if(meta.tutorialStep>=8){meta.tutorialDone=true;saveMeta();}}
    }
  }
  /* v41 新手引导 */
  if(!meta.tutorialDone&&!meta.tutorialStep)meta.tutorialStep=0;
  if(meta.tutorialStep!==undefined&&meta.tutorialStep<8&&!meta.tutorialDone){
    const steps=["WASD 移动 · 走到金色菱形处按 E 拾取","左键攻击 · 瞄准怪物射击","Q 闪避 · 在命中瞬间闪避触发完美弹反","按 1/2/3 释放技能 · 每个角色三个技能","靠近发光物按 E 拾取 · 证据恢复弹药","按 B 打开装备库 · 用金币购买装备","交替命中不同元素触发反应！","走进红色传送门进入下一关"];
    const stepCond=[null,()=>G.samples>0,()=>G.kills>0,()=>true,()=>true,()=>true,()=>(G.reactionCount||0)>0,()=>G.winOpen];
    if(stepCond[meta.tutorialStep]&&(!stepCond[meta.tutorialStep]||stepCond[meta.tutorialStep]())){
      if(meta.tutorialStep===0||stepCond[meta.tutorialStep]()){meta.tutorialStep++;showTransmission("新手引导 · "+(meta.tutorialStep)+"/8",steps[meta.tutorialStep-1]||"",4000);if(meta.tutorialStep>=8){meta.tutorialDone=true;saveMeta();}}
    }
  }
    if(checkWin(player.x, player.z)){
      const completedLevel=G.level||1,carry={score:G.score,ammo:G.ammo,runTime:G.runTime||0,gold:G.gold,goldEarned:G.goldEarned,equip:(G.equip||[]).slice()},nextIdx=G.nextLevel?(G.nextLevel-1):null;
      chapterExitNarrative(completedLevel,carry,nextIdx);
    }
    if(G.state===S.OVER) setOver(false);
    // 同步怪物网格（CSD-M2：按类型视觉——gray/elite 前摇缩放红眼 / dart 扑击闪红后拉 / spitter 鼓腮聚光）
    /* v24.11：中途加怪补建网格（分裂幼体/召唤援军通用）——保持 G.monsters 与 monsterMeshes 对齐 */

    /* v40 WiFi 远程玩家渲染 */
    if(netConnected&&remotePlayer){
      if(!remotePlayer.mesh){remotePlayer.mesh=buildCaptainModel("guardian");remotePlayer.mesh.visible=true;scene.add(remotePlayer.mesh);}
      remotePlayer.mesh.visible=true;
      remotePlayer.mesh.position.set(remotePlayer.x,remotePlayer.y,remotePlayer.z);
      remotePlayer.mesh.rotation.y=remotePlayer.yaw;
    } else if(remotePlayer&&remotePlayer.mesh){remotePlayer.mesh.visible=false;}
    while(G.monsters.length > monsterMeshes.length){
      spawnMonsterMeshAt(G.monsters[monsterMeshes.length]);
    }
    for(let i=0;i<monsterMeshes.length;i++){
      const m = G.monsters[i];
      if(!m){ monsterMeshes[i].visible = false; continue; }
      const mm = monsterMeshes[i];
      if(m.hp<=0){
        if(m.deathT===undefined){m.deathT=.5;   // v34 F2 死亡溶解演出
          const dc=(m.lastElem&&ELEM_INFO[m.lastElem])?ELEM_INFO[m.lastElem].color:0x9fe8ff;
          burstParticle(m.x,terrainHeight(m.x,m.z)+1,m.z,dc,10);
          spawnEchoRing(m.x,terrainHeight(m.x,m.z)+.6,m.z,dc,1.6);
        }
        m.deathT-=dt;mm.visible=m.deathT>0;
        if(mm.visible){mm.position.set(m.x,terrainHeight(m.x,m.z)+.9-(.5-m.deathT)*1.8,m.z);mm.scale.setScalar(Math.max(.05,m.deathT/.5));const fms=mm.userData.fadeMats,fos=mm.userData.fadeOps;if(fms)for(let fi=0;fi<fms.length;fi++){fms[fi].transparent=true;fms[fi].opacity=Math.max(0,m.deathT/.5)*fos[fi].op;}mm.userData.__faded=true;}
        continue;
      }
      /* v23：复用网格复活时按预存原值还原透明度/不透明度（修复复活后材质仍停留在淡出值的隐患）。 */
      if(mm.userData.__faded){const fms=mm.userData.fadeMats,fos=mm.userData.fadeOps;if(fms)for(let fi=0;fi<fms.length;fi++){fms[fi].opacity=fos[fi].op;fms[fi].transparent=fos[fi].tr;}mm.userData.__faded=false;}
      mm.visible = true;
      let visualScale=(mm.userData&&mm.userData.baseScale)||1;
      const my = terrainHeight(m.x,m.z) + (m.type==="spitter" ? 1.15 : 0.9) + Math.sin(G.time*3+i)*0.15;
      mm.position.set(m.x, my, m.z);
      /* 朝向玩家而非原地自转，攻击方向与模型轮廓一致 */
      const faceYaw=Math.atan2(player.x-m.x,player.z-m.z);
      const yawDiff=Math.atan2(Math.sin(faceYaw-mm.rotation.y),Math.cos(faceYaw-mm.rotation.y));
      mm.rotation.y+=yawDiff*Math.min(1,dt*(m.type==="dart"?8:4.5));
      if(m.aura){   // v34 F1 元素附着光环
        let ar=mm.userData.auraRing;
        if(!ar){ar=new THREE.Mesh(auraRingGeo,auraRingMat.clone());ar.rotation.x=-Math.PI/2;ar.position.y=-.55;mm.add(ar);mm.userData.auraRing=ar;}
        ar.visible=true;ar.material.color.setHex((ELEM_INFO[m.aura.e]||ELEM_INFO.tide).color);
        ar.rotation.z+=dt*2.2;ar.scale.setScalar(1+.08*Math.sin(G.time*5));
      } else if(mm.userData.auraRing){mm.userData.auraRing.visible=false;}
      if(m.type === "dart" || m.type === "swarm"){
        const l = m.lunge || {};
        const atkWind = m.atk && m.atk.phase === "windup";
        if(l.phase === "windup" || atkWind){
          const wden = (m.atk && m.atk.move) ? m.atk.move.windup : (MONSTER_TYPES.dart.lunge.windup || 0.5);
          const k = Math.min(1, ((m.atk && m.atk.move) ? m.atk.t : l.t) / wden);
          mm.position.x = m.x + (m.x - player.x)*0.3*k;   // 扑击前摇：身体后拉
          mm.position.z = m.z + (m.z - player.z)*0.3*k;
          if(mm.userData && mm.userData.bodyMat) mm.userData.bodyMat.color.setHex(0xff2244);   // 闪红
        } else if(l.phase === "dash" || (m.atk && m.atk.phase === "active")){
          if(mm.userData && mm.userData.bodyMat) mm.userData.bodyMat.color.setHex(0xff6655);
        } else {
          if(mm.userData && mm.userData.bodyMat) mm.userData.bodyMat.color.setHex(0x7fa8b8);
        }
      } else if(m.type === "spitter" || m.type === "acid" || m.type === "sniper"){
        const st = m.spit || {};
        const atkWind = m.atk && m.atk.phase === "windup";
        if(mm.userData && mm.userData.eyeMat) mm.userData.eyeMat.color.setHex((st.windup > 0 || atkWind) ? (m.type==="sniper"?0xff2244:0xffcc66) : (m.type==="acid"?0x83ff66:0x9fe8ff));
      } else {
        // gray / elite：既有 windup 缩放 + 红眼（复用 hand 结构 userData.eye）；
        // CSD-SOUL1-P1：招式 windup 复用同一 L1 红光聚光视觉
        const baseScale = (m.type === "elite") ? 1.4 : (m.type === "shield" ? 1.55 : 1);
        const atkWind = m.atk && m.atk.phase === "windup";
        const wden = (atkWind && m.atk.move) ? m.atk.move.windup
          : (boostFor(m.type === "elite" ? "elite" : "gray") || {}).windup
          || (MONSTER_TYPES[m.type] ? MONSTER_TYPES[m.type].windup : MONSTER_WINDUP);
        if((m.windup > 0) || atkWind){
          const k = atkWind ? Math.min(1, m.atk.t / wden) : (m.windup / wden);
          visualScale=baseScale + 0.18*k;
          const eye = mm.userData && mm.userData.eye;
          if(eye){ eye.scale.setScalar(1 + 0.6*k); eye.material.color.setHex(0xff2244); }
        } else {
          visualScale=baseScale;
          const eye = mm.userData && mm.userData.eye;
          if(eye){ eye.scale.setScalar(1); eye.material.color.setHex(m.type === "elite" ? 0xff2244 : 0xe0506a); }
        }
      }
      // CSD-SOUL1-MODEL：部位动画（手指蠕动 / 鳍摆尾摆 / 触手+鼓腮脉冲 / 晶簇旋转）
      const ud = mm.userData || {};
      updateMonsterMood(m,mm,dt);
      const animT = G.time*4;
      const broken = m.break && m.break.t > 0;
      /* 破韧瞬间弹出一枚独立部位，给处决窗口一个清晰的“断裂”反馈。 */
      if(broken){
        if(!ud.breakPiece){
          ud.breakPiece=(ud.fingers&&ud.fingers[0])||(ud.tentacles&&ud.tentacles[0])||(ud.crystals&&ud.crystals[0])||(ud.variantParts&&ud.variantParts[0]);
          if(ud.breakPiece){ud.breakPieceBase=ud.breakPiece.position.clone();ud.breakPieceVel={x:(i%2?1:-1)*1.8,y:.9,z:(i%3-1)*1.1};}
        }
        if(ud.breakPiece){ud.breakPiece.position.x+=ud.breakPieceVel.x*dt;ud.breakPiece.position.y+=ud.breakPieceVel.y*dt;ud.breakPiece.position.z+=ud.breakPieceVel.z*dt;ud.breakPiece.rotation.z+=dt*7;}
      }else if(ud.breakPiece){
        ud.breakPiece.position.copy(ud.breakPieceBase);ud.breakPiece.rotation.z=ud.breakPiece.userData&&ud.breakPiece.userData.baseZ||ud.breakPiece.rotation.z;ud.breakPiece=null;ud.breakPieceBase=null;
      }
      ud.wardAura.visible=!!m.ward;if(m.ward){ud.wardAura.rotation.y+=dt*1.8;ud.wardAura.scale.setScalar(1+.06*Math.sin(animT));}
      if(m.rage)visualScale*=1+.025*Math.sin(animT*2);
      const hitSquash=m.hitReact?Math.max(0,m.hitReact):0;if(m.hitReact)m.hitReact=Math.max(0,m.hitReact-dt*5);
      mm.scale.set(visualScale*(1-hitSquash*.16),visualScale*(1+hitSquash*.08),visualScale*(1-hitSquash*.16));
      /* v23 PERF：描边同步改为遍历预收集 rimMats（原为每帧 traverse 整棵怪物子树）。 */
      const rms=ud.rimMats;
      if(rms&&rms.length){const marked=!!m.sonarMark;for(let ri=0;ri<rms.length;ri++){const rmt=rms[ri],rud=rmt.userData,rs=rud.rimShader;if(rs){if(marked)rs.uniforms.v9RimColor.value.setHex(0x7fffd4);else rs.uniforms.v9RimColor.value.copy(rud.rimColor);rs.uniforms.v9RimStrength.value=marked?.95:(rud.rimStrength||.13);}}}
      if(ud.fingers && !broken){
        ud.fingers.forEach((fg, fi) => {
          if(fg.userData) fg.rotation.z = fg.userData.baseZ + Math.sin(animT + fi*1.7)*0.07;
        });
      }
      if(ud.tail && ud.fin){
        ud.fin.rotation.z  = ud.finBaseZ  + Math.sin(animT*1.4)*0.16;
        ud.tail.rotation.x = ud.tailBaseX + Math.sin(animT*1.4+0.6)*0.18;
        ud.finL.rotation.z = ud.finLBaseZ + Math.sin(animT*1.6+1)*0.2;
        ud.finR.rotation.z = ud.finRBaseZ - Math.sin(animT*1.6+1)*0.2;
      }
      if(ud.tentacles){
        ud.tentacles.forEach((t) => {
          if(t.userData) t.rotation.x = t.userData.baseX + Math.sin(animT*1.2 + t.userData.seed)*0.08;
        });
        if(ud.sac){
          const st = m.spit || {};
          const atkWind = m.atk && m.atk.phase === "windup";
          ud.sac.scale.setScalar((atkWind || st.windup > 0) ? 1.35 : 1.0);
        }
      }
      if(ud.crystals){
        ud.crystals.forEach((c, ci) => { c.rotation.y += dt*(0.8+ci*0.25); });
        if(ud.core) ud.core.scale.setScalar(1 + 0.25*Math.sin(animT*1.5));
      }
      if(ud.variantParts){
        if(ud.visualFamily==="alpha")ud.variantParts.forEach((p,pi)=>p.rotation.y+=dt*(.45+pi*.08));
        else if(ud.visualFamily==="core")ud.variantParts.forEach((p,pi)=>{if(p.geometry===VARIANT_GEO.coil)p.rotation.z+=dt*(pi?-.7:.7);});
        else if(ud.visualFamily==="marrow")ud.variantParts.forEach((p,pi)=>{if(p.geometry===VARIANT_GEO.tendril)p.rotation.y=Math.sin(animT*.55+pi)*.28;});
      }
    }
    // 同步脉冲网格（v23.3：自旋 + 按武器配色的飞行拖尾粒子）
    for(const p of pulses){
      if(!p.mesh) continue;
      p.mesh.position.set(p.x,p.y,p.z);
      if(p.mesh.userData.spin)p.mesh.rotation.z+=dt*p.mesh.userData.spin;
      if(Math.random()<(p.charge?.9:.45))burstParticle(p.x,p.y,p.z,p.wid===2?0x3aa6ff:(p.charge?0xffd66b:0x7fffd4),1);
    }
    // W1：回响扩散环动画（纯视觉 0.15s，施放即时已结算；内径 2.6 → ≈7.5 覆盖半径 7）
    for(let i=echoRings.length-1;i>=0;i--){
      const r = echoRings[i];
      r.life -= dt;
      const k = 1 - Math.max(0, r.life)/r.max;      // 进度 0→1
      r.mesh.scale.setScalar(1 + k*(r.mesh.userData.echoScale||1.9));
      r.mesh.material.opacity = 0.55*(1-k);
      if(r.life<=0){ disposeRoots([r.mesh]); echoRings.splice(i,1); }
    }
    // CSD-SOUL1-P1：L2 地面预警圈动画（静态 + 微脉冲；预警结束移除）
    tickTelegraphRings(dt);
    // 样本浮动（S10：低氧 <25 时浮动画频率加倍 + 发光脉冲，恢复后复原；lowQ 下同样生效）
    for(let i=0;i<sampleMeshes.length;i++){
      const m = sampleMeshes[i];
      if(!m.visible) continue;
      const s = (G.sampleSpots || SAMPLE_SPOTS)[i];
              /* v23 PERF：使用 buildSamples 缓存的地面高度，省去每帧解析地形计算 */
      const gy=(m.userData&&m.userData.groundY!==undefined)?m.userData.groundY:terrainHeight(s.x,s.z);
      m.position.y = gy+1.2+Math.sin(G.time*2+i)*0.18;
      m.rotation.y += dt*1.4;
      if(m.userData&&m.userData.halo){
        m.userData.halo.rotation.z+=dt*1.1;
        m.userData.halo.scale.setScalar(1+.05*Math.sin(G.time*2+i));
      }
      const k=1+.06*Math.sin(G.time*2+i);
      if(m.userData.core){const bs=m.userData.coreBaseScale;m.userData.core.scale.copy(bs||new THREE.Vector3(1,1,1)).multiplyScalar(k);}
      if(m.userData.inner)m.userData.inner.rotation.x+=dt*1.1;
      if(m.userData.glow)m.userData.glow.scale.setScalar(2.08*(.92+.08*k));
    }
    // 裂口动画 + 光柱
    /* v9：巨兽守在裂口坐标上；交战期间隐藏实体门环，避免穿过 Boss 躯干，击败后再显现。 */
    gateGroup.visible=G.modeId!=="endless"&&!(G.boss&&G.boss.hp>0&&baseObjectiveMet());
    gateGroup.rotation.y += dt*0.4;
    gateGroup.children[0].material.color.setHex(G.winOpen ? 0x7fffd4 : 0xe0506a);
    gateGroup.children[1].material.color.setHex(0x7fffd4);
    gateBeam.visible = G.winOpen;
    if(G.winOpen) gateBeam.material.opacity = 0.1+0.06*Math.sin(G.time*3);
    // BOSS 同步 + 血条（CSD-M2：handX 体型 1.3× + 红光；血条覆盖 G.boss 与 bossBar 精英）
    if(G.boss && G.boss.hp>0 && baseObjectiveMet()){
      bossMesh.visible = true;
      const bph = G.boss.phase || 1;   // CSD-SOUL1-P3：阶段形态（体型微增 + 狂怒脉动）
      const bud=bossMesh.userData||{},phaseGrow=(bph>=2?(bph===3?.12+.06*Math.sin(G.time*6):.06):0);
      bossMesh.scale.setScalar((bud.baseScale||1)+phaseGrow);
      bossMesh.position.set(G.boss.x,terrainHeight(G.boss.x,G.boss.z)+(bud.hover||2.4)+Math.sin(G.time*2)*.2,G.boss.z);
      const bossYaw=Math.atan2(player.x-G.boss.x,player.z-G.boss.z),silhouetteYaw=G.boss.type==="kelpLeviathan" ? .42+.06*Math.sin(G.time*.7) : (G.boss.type==="voidWhale" ? .5+.07*Math.sin(G.time*.55) : 0),visualYaw=bossYaw+silhouetteYaw;
      const bossDiff=Math.atan2(Math.sin(visualYaw-bossMesh.rotation.y),Math.cos(visualYaw-bossMesh.rotation.y));
      bossMesh.rotation.y+=bossDiff*Math.min(1,dt*(bph===3?5.5:3.2));
      if(bossMesh.userData && bossMesh.userData.fingers){   // CSD-SOUL1-MODEL：BOSS 手指蠕动
        const bt = G.time*3.5;
        bossMesh.userData.fingers.forEach((fg, fi) => {
          if(fg.userData) fg.rotation.z = fg.userData.baseZ + Math.sin(bt + fi*1.7)*0.05;
        });
      }
      if(bud.claws)bud.claws.forEach((c,i)=>c.rotation.y=Math.sin(G.time*2+i)*.16);
      if(bud.legs)bud.legs.forEach((l,i)=>l.rotation.x=(l.userData.baseRotX||0)+Math.sin(G.time*3+i)*.09);
      if(bud.segments)bud.segments.forEach((s,i)=>s.position.x=(s.userData.baseX||0)+Math.sin(G.time*1.8-i*.55)*(.08+i*.045));
      if(bud.tentacles)bud.tentacles.forEach((t,i)=>t.rotation.x=Math.sin(G.time*1.6+i)*.09);
      if(bud.fins)bud.fins.forEach((f,i)=>f.rotation.y=Math.sin(G.time*1.8+i)*.12);
      // S7：接触预警红光闪动（0.5s 周期），预警区外隐藏；伤害结算时点不变
      const warn = !!G.boss.warn;
      bossRing.visible = warn;
      if(warn){
        const k = (Math.sin(G.time * Math.PI * 2) + 1) / 2;   // 0.5s 周期闪烁
        bossRing.position.set(G.boss.x, terrainHeight(G.boss.x, G.boss.z)+0.15, G.boss.z);
        bossRing.scale.setScalar((bossCfgNow.hitR||3)/3);
        bossRing.material.opacity = 0.2 + 0.5*k;
        const eye = bossMesh.userData && bossMesh.userData.eye;
        if(eye) eye.material.color.setHex(k > 0.5 ? 0xff2244 : 0xe0506a);
      } else {
        const eye = bossMesh.userData && bossMesh.userData.eye;
        if(eye) eye.material.color.setHex(bph === 3 ? 0xff0033 : bph === 2 ? 0xff2244 : (G.boss.type === "handX" ? 0xff2244 : 0xe0506a));   // handX 红光加深；P2/P3 逐级加深
      }
    } else {
      bossMesh.visible = false;
      bossRing.visible = false;
    }
    // 血条：优先 G.boss（hand/handX），其次 bossBar 精英（L3 晶化灰手 / L5 杂兵精英）
    let barBoss = null, barLabel = "";
    if(G.boss && G.boss.hp>0 && baseObjectiveMet()){
      barBoss = G.boss;
      const bp = G.boss.phase || 1;
      barLabel = (BOSS_NAMES[G.boss.type]||"深渊巨兽")
        + (bp >= 2 ? (" · " + (bp === 3 ? "狂怒" : "二阶段")) : "");
    } else {
      for(const m of G.monsters){
        if(m.hp>0 && m.bossBar){ barBoss = m; barLabel = "晶化灰手"; break; }
      }
    }
    if(barBoss){
      _el("bossWrap").classList.add("show");
      _setTxt("bossLabel", barLabel);
      _setBarW("bossBar", Math.max(0, barBoss.hp/barBoss.maxHp*100));
      /* CSD-SOUL1-P1：韧性细条（BOSS/精英破韧前常显；break 中隐藏——处决窗口用提示替代） */
      if(barBoss.poise && !(barBoss.break && barBoss.break.t > 0)){
        _el("poiseWrap").classList.add("show");
        _setBarW("poiseBar", Math.max(0, Math.min(100, (barBoss.poise.max > 0 ? (1 - barBoss.poise.cur/barBoss.poise.max) : 1)*100)));
      } else {
        _el("poiseWrap").classList.remove("show");
      }
  
    if(barBoss.eshield && barBoss.eshield.hp>0){
        _el("bossShieldWrap").classList.add("show");
        _setBarW("bossShieldBar", Math.max(0, barBoss.eshield.hp/barBoss.eshield.max*100));
      } else {
        _el("bossShieldWrap").classList.remove("show");
      }   // v30 元素盾条
    } else {
      _el("bossWrap").classList.remove("show");
      _el("poiseWrap").classList.remove("show");
    }
    /* CSD-SOUL1-P1：处决提示（可处决目标在 3.0 内）——interact「处决！」+ 准星变红（PC）/ 发射键发光（移动端） */
    const execTgt = findExecutable(player.x, player.z);
    const execNear = !!execTgt;
    document.body.classList.toggle("exec-armed", execNear);
    const btnP = _el("btnPulse");
    if(btnP) btnP.classList.toggle("exec-glow", execNear);
    if(execNear){
      _setTxt("interact", "处决！");
      _el("interact").classList.add("show");
      btnPickup.classList.remove("show");
    }
    // 罗盘：指向最近样本 / 裂口
    const tgt = nearestTarget(player.x, player.z);
    if(tgt){
      const ang = dirTo(player.x, player.z, tgt.x, tgt.z) - player.yaw;
      _el("compass").style.setProperty("--rot", (ang*180/Math.PI).toFixed(0)+"deg");
    }
    // 浮游生物
    for(let i=0;i<plankton.length;i++){
      const pk=plankton[i],k=i*3;planktonPos[k]=pk.x+Math.sin(G.time*.2+pk.seed)*.2;planktonPos[k+1]=pk.y+Math.sin(G.time*.4+pk.seed)*1.2;planktonPos[k+2]=pk.z+Math.cos(G.time*.17+pk.seed)*.16;
    }
    planktonPosAttr.needsUpdate=true;
    marineSnow.rotation.y=G.time*.006;
    marineSnow.position.y=Math.sin(G.time*.09)*.35;
    // 相机（受击/击杀/转阶段的镜头震动 + 处决 FOV 收缩）
    /* v23 PERF：fov 未变化时跳过 updateProjectionMatrix（仅处决镜头收缩时需要）。 */
    fovPunch=Math.max(0,fovPunch-dt*28);
    {const nf=75-fovPunch;if(nf!==camera.fov){camera.fov=nf;camera.updateProjectionMatrix();}}
    if(shake > 0.001){
      shake = Math.max(0, shake - dt*3.2);
      const sx = (Math.random()-0.5)*shake*0.28;
      const sy = (Math.random()-0.5)*shake*0.22;
      camera.position.set(player.x + sx, player.y + sy, player.z);
      camera.rotation.y = player.yaw + (Math.random()-0.5)*shake*0.03;
      camera.rotation.x = player.pitch + (Math.random()-0.5)*shake*0.03;
    } else {
      shake = 0;
      camera.position.set(player.x, player.y, player.z);
      camera.rotation.y = player.yaw;
      camera.rotation.x = player.pitch;
    }
    /* 持械呼吸摆动 + 开火后坐，冲刺时略向下收枪 */
    weaponKick=Math.max(0,weaponKick-dt*7.5);
    const moving=Math.min(1,Math.hypot(act.move.x,act.move.z));
    const bob=settings.reduceFlicker?0:Math.sin(G.time*(act.move.sprint?10:6))*moving;
    viewTool.visible=(camMode==="fps");   // v24.21 第三人称隐藏持械视模型
    weaponActionT=Math.max(0,weaponActionT-dt);
    const actionK=weaponActionT>0?Math.sin((1-weaponActionT/.1)*Math.PI):0;
    const actionDip=weaponActionKind===2?actionK*.11:actionK*.045;
    viewTool.position.set(.46+bob*.008,-.42-Math.abs(bob)*.009-(act.move.sprint?.035:0)-actionDip,-.96+weaponKick*.11);
    viewTool.rotation.z=-.025+bob*.018;
    viewTool.rotation.x=-.08+(weaponActionKind===2?actionK*.055:0);
    /* v23.3：发射器枪口焰缩放 + 附件待机动画 */
    muzzleT=Math.max(0,muzzleT-dt);
    toolEmitter.scale.setScalar(1+muzzleT*2.4);
    sonarAttachment.rotation.z+=dt*.7;
    /* v33b：echoRingA/B 已随武器模型 v2 移除 */
    thornAttachment.children.forEach((c,i)=>c.rotation.y+=dt*(i?-.9:.9));
    /* v23.1：巨兽出场运镜——BOSS 激活瞬间接管视角 2.4s（拉到巨兽侧后高位凝视），黑边+名牌；
       期间游戏继续运行、仍可开火，视角在镜头结束后交还玩家。 */
    const bossActiveNow = G.boss && G.boss.hp>0 && baseObjectiveMet();
    if(bossActiveNow && !bossCineDone){
      bossCineDone=true; bossCineT=2.4;
      bossCineName=BOSS_NAMES[G.boss.type]||"深渊巨兽";
      bossCineSub="第 "+String(G.level||1).padStart(2,"0")+" 层 · 核心协议接触";
      sound("bossin"); addShake(.4);
    }
    if(bossCineT>0){
      bossCineT-=dt;
      document.body.classList.add("cine");
      _setTxt("cineName", bossCineName); _setTxt("cineSub", bossCineSub);
      const bx2=G.boss?G.boss.x:player.x, bz2=G.boss?G.boss.z:player.z;
      const cdx=player.x-bx2, cdz=player.z-bz2, cd=Math.hypot(cdx,cdz)||1;
      const tx=bx2+cdx/cd*8.5, tz=bz2+cdz/cd*8.5, ty=terrainHeight(bx2,bz2)+3.6;
      camera.position.lerp(_cineVec.set(tx,ty,tz), Math.min(1,dt*3.2));
      camera.lookAt(_cineLook.set(bx2, terrainHeight(bx2,bz2)+2.0, bz2));
      if(bossCineT<=0) document.body.classList.remove("cine");
    } else if(document.body.classList.contains("cine")){
      document.body.classList.remove("cine");
    }
    /* v24.21 第三人称：角色模型同步 + 越肩相机（准星汇聚 + 地形防穿） */
    if(playerModel){
      playerModel.visible=(camMode==="tps")||!!(settings&&settings.camMode==="tps");
      if(playerModel.visible){
        playerModel.position.set(player.x,player.y-1.6,player.z);
        playerModel.rotation.y=player.yaw+Math.PI;
        const mv2=Math.min(1,Math.hypot(act.move.x,act.move.z));
        const sw=Math.sin(G.time*6)*mv2*.55+Math.sin(G.time*2)*.1;
        playerModel.userData.armL.rotation.x=.15+sw*.5;
        playerModel.userData.armR.rotation.x=.15-sw*.5;
        playerModel.userData.legL.rotation.x=sw*.5;
        playerModel.userData.legR.rotation.x=-sw*.5;
        playerModel.rotation.z=-act.move.x*.07;
        const fx=-Math.sin(player.yaw)*Math.cos(player.pitch),fy=Math.sin(player.pitch),fz=-Math.cos(player.yaw)*Math.cos(player.pitch);
        const rx=Math.cos(player.yaw),rz=-Math.sin(player.yaw);
        let cx=player.x-fx*4.3+rx*.55,cy=player.y+1.9-fy*4.3,cz=player.z-fz*4.3+rz*.55;
        const floor=terrainHeight(cx,cz)+.5;if(cy<floor)cy=floor;
        camera.position.lerp(_tpsVec.set(cx,cy,cz),Math.min(1,dt*10));
        camera.lookAt(_tpsLook.set(player.x+fx*26,player.y+1.3+fy*26,player.z+fz*26));
      }
    }
    // 粒子
    for(let i=particles.length-1;i>=0;i--){
      const p = particles[i];
      p.x += p.vx*dt; p.y += p.vy*dt; p.z += p.vz*dt; p.life -= dt;
      p.vx*=Math.max(0,1-dt*1.15);p.vy*=Math.max(0,1-dt*.7);p.vz*=Math.max(0,1-dt*1.15);
    }
    /* v23 PERF：原地压缩替代 particles.filter，消除每帧数组分配。 */
    {let live=0;for(let i=0;i<particles.length;i++){const p=particles[i];if(p.life>0)particles[live++]=p;}particles.length=live;}
    syncParticlePoints();
    // HUD（CSD-H2：HP 血条 + 低血警示）
    _setBarW("hpBar", Math.max(0,Math.min(100,Math.round(G.hp/(G.maxHp||HP_MAX)*100))));
    _setBarW("smpBar", Math.max(0,Math.min(100,Math.round(G.samples/(G.sampleTarget || TARGET_SAMPLES)*100))));
    _setTxt("scoreVal", G.score);
    _setTxt("goldVal", Math.floor(G.gold||0));
    // CSD-H2：低血（HP<25）红光层；追加 #hpBox 边框闪烁 + hpwarn 入场一次
    // CSD-SOUL1-FUN：受击瞬间叠加更强烈的红闪（hurtFlash 衰减）
    /* v24.22 攀爬 HUD：体力条 + 状态提示 */
  {
    const chud=document.getElementById("climbHud");
    if(chud){
      const climbing=!!player.climb,stam=(G.climbStam===undefined?5:G.climbStam);
      const show=climbing||stam<4.9;
      chud.classList.toggle("show",show);
      if(show)document.getElementById("climbStamFill").style.width=Math.round(stam/5*100)+"%";
    }
  }
  const lowHp = G.hp/(G.maxHp||HP_MAX) < .25;
    hurtFlash = Math.max(0, hurtFlash - dt*3.2);
    if(_dmgDir.t>0){_dmgDir.t-=dt;const dEl=_dmgDir.el||(_dmgDir.el=document.getElementById("dmgDir"));if(dEl&&_dmgDir.t<=0)dEl.classList.remove("show");}   // v23.5 方向指示衰减
    const lowOp = lowHp ? (settings.reduceFlicker ? 0.34 : (0.4+0.2*Math.sin(G.time*5))) : 0;   // v24.3：低氧红光条件已并入低血
    _setOpacity("lowOxy", Math.max(lowOp, hurtFlash*0.85).toFixed(3));   // v32 低血红光层（仅低生命触发）
    _el("hpBox").classList.toggle("low", lowHp);
    /* v24.13：低血循环警报（每 2.5s 心跳提示，脱离低血复位） */
    hpWarnT-=dt;
    if(lowHp && hpWarnT<=0){ hpWarnT=2.5; sound("hpwarn"); }
    if(!lowHp) hpWarnT=0;
    if(G.level !== undefined){
      const lv = LEVELS[G.level-1];
      _setTxt("levelVal", lv ? ("L" + G.level + " " + lv.name) : ("L" + G.level));
    }
    updateObjectiveUI();
    // W1：武器 HUD 同步（高亮/弹药角标/发射按钮图标配色/冷却置灰）
    updateWeaponUI();
    updateDashUI();
    updateSkillUI();
    // 附近可交互提示（CSD-SOUL1-P1：处决提示优先，不被拾取提示覆盖）
    const ie = _el("interact");
    if(execNear){
      // 已显示「处决！」（上方块设置）；此分支仅确保不回落拾取
    } else {
      let near = null, nd = 3;
      const spotsList = G.sampleSpots || SAMPLE_SPOTS;
      const scanPts=(G.objective&&G.objective.kind==="scan")?(G.objective.points||[]):null;   // v24.16 扫描点不提示拾取
      for(let i=0;i<spotsList.length;i++){
        if(G.grabbed[i]) continue;
        if(scanPts && scanPts.indexOf(spotsList[i])>=0) continue;
        const s = spotsList[i];
        const d = Math.sqrt((s.x-player.x)**2+(s.z-player.z)**2);
        if(d<nd){ nd=d; near=i; }
      }
      if(near>=0 && !G.winOpen){
        if(input.isTouch){ btnPickup.classList.add("show"); ie.classList.remove("show"); }
        else { const data=sampleMeshes[near]&&sampleMeshes[near].userData;_setTxt("interact", "E · 回收"+(data&&data.pickupName||"现场证据")); ie.classList.add("show"); }
      } else {
        ie.classList.remove("show");
        btnPickup.classList.remove("show");
      }
    }
  }catch(err){ if(!shownErr){ shownErr = true; showErr("[loop] " + (err && err.message ? err.message : err)); } if(window.console && console.error) console.error("[loop]", err); }
  } else {
    input.setEnabled(false);
    viewTool.visible=false;
    shieldBubble.visible=false;
    shieldWire.visible=false;   // v23.3：非游玩态同步隐藏护幕线框
    if(playerModel)playerModel.visible=false;   // v24.21
    if(ambNodes&&ac){try{ambNodes.g.gain.setTargetAtTime(0,ac.currentTime,.4);}catch(e){}}   // v23：非游玩态氛围乐淡出
  }
  /* v23 省电：暂停态冻结渲染与 Bloom（resize 时由 frameDirty 强制补一帧），小地图与飘字一并停更。 */
  if(G && G.state===S.PAUSED && !frameDirty){
    requestAnimationFrame(loop);
    return;
  }
  if(!G || G.state!==S.PAUSED)drawMinimap(ts);
  tickDmgNums(dt);
  /* v24：高画质走 HDR 后处理管线（真 Bloom+暗角+色差+调色），受限设备保持直渲染 */
  if(photoMode)photoCam(dt);   // v31 照片模式自由相机
  if(POST.enabled)renderPost();else renderer.render(scene, camera);
  renderBloomLayer();
  frameDirty=false;
  if(qaStats)qaStats.end();
  requestAnimationFrame(loop);
}
function updatePlayer(dt, act){
  /* v24.22 攀爬状态机：贴墙环绕 + W/S 上下 + 体力 + 登顶站立 + 空格跃离 */
  if(player.climb){
    const cs=player.climb;
    G.climbStam=Math.max(0,(G.climbStam===undefined?5:G.climbStam)-dt);
    cs.ang+=act.move.x*dt*1.7;
    const rr=cs.surf.r+.85;
    player.x=cs.surf.x+Math.sin(cs.ang)*rr;
    player.z=cs.surf.z+Math.cos(cs.ang)*rr;
    player.y+=act.move.z*2.7*dt;
    player.onGround=false;
    const topY=cs.surf.top+1.7;
    if(player.y>=topY){
      player.y=topY;player.climb=null;player.onGround=true;player.vy=0;
      sound("pickup");toast("已登顶 · 俯瞰全局");
    } else if(player.y<=terrainHeight(player.x,player.z)+1.2||act.jump||(G.climbStam||0)<=0){
      player.climb=null;player.vy=act.jump?4.5:1.2;
    } else {
      player.yaw=Math.atan2(-(cs.surf.x-player.x),-(cs.surf.z-player.z));
    }
    return;
  }
  /* 攀抓判定：贴近可攀建筑且按住跳跃 → 挂壁（空中亦可抓） */
  if(act.jump && (G.climbStam===undefined?5:G.climbStam)>.3 && player.y>terrainHeight(player.x,player.z)+1.0){
    for(const s of climbSurfaces){
      const d=Math.hypot(player.x-s.x,player.z-s.z);
      if(d<s.r+1.25 && player.y<s.top+1.6){
        player.climb={surf:s,ang:Math.atan2(player.x-s.x,player.z-s.z)};
        player.vy=0;player.onGround=false;
        sound("dash");
        return;
      }
    }
  }
  // 语义动作 move（x 右+/z 前+）→ 世界位移；与 v0 键盘逐键等价，触屏同契约
  const f = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  const r = new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
  const sp = (act.move.sprint ? 11 : 6.5) * ((G&&G.slow>0)?0.62:1) * ((G&&G.moveMul)||1);
  let mx = f.x*act.move.z + r.x*act.move.x;
  let mz = f.z*act.move.z + r.z*act.move.x;
  const len = Math.hypot(mx, mz)||1;
  player.x += mx/len*sp*dt;
  player.z += mz/len*sp*dt;
  let [cx, cz] = resolveCollision(player.x, player.z, 0.7);
  for(const m of G.monsters){   // v35 角色本体碰撞体积：与活体怪物保持间距（推开玩家一半量，另一半由怪物推挤完成）
    if(m.hp<=0)continue;
    const mdx=cx-m.x,mdz=cz-m.z,md=Math.hypot(mdx,mdz);
    if(md>0.001&&md<1.15){const k=(1.15-md)*.6;cx+=mdx/md*k;cz+=mdz/md*k;}
  }
  if(G.boss&&G.boss.hp>0){
    const bbt=BOSS_TYPES[G.boss.type]||BOSS_TYPES.hand,bodyR=(bbt.hitR||3)*.85;
    const bdx=cx-G.boss.x,bdz=cz-G.boss.z,bd=Math.hypot(bdx,bdz);
    if(bd>0.001&&bd<bodyR){cx=G.boss.x+bdx/bd*bodyR;cz=G.boss.z+bdz/bd*bodyR;}
  }   // v36 巨兽本体推挤
  [cx, cz] = resolveCollision(cx, cz, 0.7);
  const [bx, bz] = clampToMap(cx, cz);
  player.x = bx; player.z = bz;
  // 跳跃与地形跟随（v24.22：塔顶/墙顶可站立 + 水下推进器）
  let ground = terrainHeight(player.x, player.z);
  for(const s of climbSurfaces){
    if(Math.hypot(player.x-s.x, player.z-s.z)<s.r+.3 && player.y>=s.top+1.35){ ground=s.top; break; }
  }
  for(const st of stairSurfaces){   // v35 螺旋楼梯：沿阶梯行走自动升降（可上 0.65 步高）
    const dx2=player.x-st.x,dz2=player.z-st.z,d2=Math.hypot(dx2,dz2);
    if(d2<st.r+.25){
      let a2=Math.atan2(dx2,dz2)-st.ang0;
      const full=Math.PI*2*st.turns;
      a2=((a2%full)+full)%full;
      const h=st.base+(a2/full)*(st.top-st.base);
      if(player.y>=h+1.05){ ground=Math.max(ground,h); break; }
    }
  }
  if((act.jump||GP.jumpLatch) && player.onGround){ player.vy = 5.4; player.onGround = false; GP.jumpLatch=false; }   // v31 手柄跳跃
  if((act.jump||GP.jumpHeld) && !player.onGround && player.vy < 2.2) player.vy += 9*dt;   // v24.22 水下推进器：按住空格持续上浮
  player.vy -= 12*dt;
  player.y += player.vy*dt;
  if(player.y <= ground+1.7){
    if(G&&G.plungeArm){   // v30 落地爆发
      G.plungeArm=false;
      const phits=ringBurst(player.x,player.z,3.8,3.4,3,4);
      for(const pe of phits)handleCombatEvent(pe);
      spawnEchoRing(player.x,ground+.3,player.z,0xffd66b,4.2);
      spawnEchoRing(player.x,ground+.3,player.z,0xffffff,2.8);
      burstParticle(player.x,ground+1,player.z,0xffd66b,24);
      addShake(.8);addHitStop(.08);sound("charged");fovPunch=6;
    }
    player.y = ground+1.7;
    player.vy = 0;
    player.onGround = true;
  }
  if(player.onGround){ G.climbStam=Math.min(5,(G.climbStam||0)+dt*1.4); }   // v24.22 体力地面回复
  // 保险绳：异常掉出世界时拉回地面
  if(player.y < ground - 8){ player.y = ground+1.7; player.vy = 0; }
}

/* 按钮绑定 */
document.getElementById("startBtn").addEventListener("click", ()=>{ initAudio(); startGame(false); });
/* v39 难度选择 */
(function(){
  const btns=document.querySelectorAll(".diffBtn");
  const saved=(meta.difficulty||"normal");
  btns.forEach(b=>{b.setAttribute("aria-pressed",String(b.dataset.diff===saved));b.style.borderColor=b.dataset.diff===saved?"var(--acc2)":"";});
  btns.forEach(b=>b.addEventListener("click",()=>{
    meta.difficulty=b.dataset.diff;saveMeta();
    btns.forEach(x=>{x.setAttribute("aria-pressed",String(x===b));x.style.borderColor=x===b?"var(--acc2)":"";});
    toast("难度 · "+b.textContent.trim().slice(0,2));
  }));
})();
/* v39 难度选择 */
(function(){
  const btns=document.querySelectorAll(".diffBtn");
  const saved=(meta.difficulty||"normal");
  btns.forEach(b=>{b.setAttribute("aria-pressed",String(b.dataset.diff===saved));b.style.borderColor=b.dataset.diff===saved?"var(--acc2)":"";});
  btns.forEach(b=>b.addEventListener("click",()=>{
    meta.difficulty=b.dataset.diff;saveMeta();
    btns.forEach(x=>{x.setAttribute("aria-pressed",String(x===b));x.style.borderColor=x===b?"var(--acc2)":"";});
    toast("难度 · "+b.textContent.trim().slice(0,2));
  }));
})();
(function(){
  const jbtn=document.getElementById("joinRoomBtn"),cbtn=document.getElementById("createRoomBtn"),ri=document.getElementById("roomCode"),ns=document.getElementById("netStatus");
  if(jbtn)jbtn.addEventListener("click",()=>{const c=(ri?ri.value:"").trim();if(!c){toast("输入房间号");return;}netConnect(c);if(ns)ns.textContent="连接中…";setTimeout(()=>{if(ns)ns.textContent=netConnected?"已连接 "+netRoom:"连接失败";},1000);});
  if(cbtn)cbtn.addEventListener("click",()=>{const c="ROOM"+Math.floor(Math.random()*9000+1000);if(ri)ri.value=c;netConnect(c);if(ns)ns.textContent="创建中…";setTimeout(()=>{if(ns)ns.textContent=netConnected?"房间 "+netRoom:"连接失败";},1000);});
})();
document.getElementById("retryBtn").addEventListener("click",()=>{initAudio();startGame(true);});
document.getElementById("continueBtn").addEventListener("click",()=>{initAudio();continueAfterDeath();});
document.getElementById("menuBtn2").addEventListener("click", toMenu);
document.getElementById("resumeBtn").addEventListener("click", ()=>{ setPaused(false); });
document.getElementById("pauseMenuBtn").addEventListener("click", toMenu);
document.getElementById("menuSettingsBtn").addEventListener("click", openSettings);
document.getElementById("pauseSettingsBtn").addEventListener("click", openSettings);
document.getElementById("settingsCloseBtn").addEventListener("click", closeSettings);
document.getElementById("fullscreenBtn").addEventListener("click", async ()=>{
  try{
    if(!document.fullscreenElement && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
    else if(document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen();
  }catch(e){}
});
document.addEventListener("fullscreenchange", ()=>{
  document.getElementById("fullscreenBtn").textContent = document.fullscreenElement ? "退出全屏" : "切换全屏";
});
document.getElementById("hiVal").textContent = hi;

/* W1 武器系统（v1.1）：PC 数字键 1/2/3 直接切换。
   输入层语义动作流（ADR-003）保持 {move,look,jump,pickup,pulse,pause} 不变，
   武器切换属游戏状态变更，由主层按键直连逻辑 setWeapon（契约不扩展、既有 input 测试不破）。 */
window.addEventListener("keydown", (e)=>{
  if(e.code==="Escape" && !settingsOverlay.classList.contains("hidden")){
    e.preventDefault(); closeSettings(); return;
  }
  if(!G || G.state!==S.PLAYING) return;
  if(e.code==="KeyQ"&&!e.repeat){dashQueued=true;return;}
  if(e.code==="KeyF"&&!e.repeat){skillQueued[0]=true;return;}
  if(e.code==="KeyR"&&!e.repeat){skillQueued[1]=true;return;}
  if(e.code==="KeyC"&&!e.repeat){skillQueued[2]=true;return;}
  if(e.code==="Digit1" || e.code==="Digit2" || e.code==="Digit3"){skillQueued[Number(e.code.slice(5))-1]=true;}   // v28：1/2/3 → 技能
});
/* W1：触屏武器切换按钮（轮切 1→2→3→1；pointer.js 经 isButtonTarget 跳过，不产生 pulse 双触发） */

btnDash.addEventListener("pointerdown",(e)=>{e.preventDefault();initAudio();if(G&&G.state===S.PLAYING)dashQueued=true;});
document.getElementById("btnShield").addEventListener("pointerdown",e=>{e.preventDefault();initAudio();if(G&&G.state===S.PLAYING)skillQueued[0]=true;});
document.getElementById("btnOverdrive").addEventListener("pointerdown",e=>{e.preventDefault();initAudio();if(G&&G.state===S.PLAYING)skillQueued[1]=true;});
document.getElementById("btnWeapon").addEventListener("pointerdown", (e)=>{ e.preventDefault(); initAudio(); if(G && G.state===S.PLAYING) skillQueued[2]=true; });   // v28：技3

/* 调试导出（供无浏览器校验；logic 来自逻辑模块环境自适应导出，与 v0 兼容的超集） */
const qaEnabled=location.search.indexOf("qa=1")>=0;
globalThis.__D3D = {
  logic: globalThis.__D3D_LOGIC,
  input,
  start: startGame, setOver, toMenu,
  state: ()=>G?G.state:null,
  get: ()=>({ state:G?G.state:null,level:G?G.level:0,modeId:G?G.modeId:null,roleId:G?G.roleId:null,hp:G?G.hp:0,maxHp:G?G.maxHp:0,samples:G?G.samples:0,score:G?G.score:0,winOpen:G?G.winOpen:false,
    projectiles:pulses.length, projectileMeshes:(()=>{let n=0;scene.traverse(o=>{if(o.userData&&o.userData.playerProjectile)n++;});return n;})(),
    monsters:G&&G.monsters?G.monsters.filter(m=>m.hp>0).length:0,baseObjectiveMet:G?baseObjectiveMet():false,objectiveKind:G&&G.objective?G.objective.kind:null,objectiveT:G&&G.objective?G.objective.t||0:0,
    scanDone:G&&G.scanDone?G.scanDone.filter(Boolean).length:0,defendProgress:G?(G.defendProgress||0):0,gauntletWave:G?(G.gauntletWave||0):0,missionMarkers:missionMarkers.length,
    visualFamily:G?stageVisualFamily().id:null,visualVariant:G?(stageVisualFamily().id+"-"+(stageVisualVariant()+1)):null,pickupKinds:[...new Set(sampleMeshes.map(m=>m.userData&&m.userData.pickupKind).filter(Boolean))],monsterFamilies:[...new Set(monsterMeshes.map(m=>m.userData&&m.userData.visualFamily).filter(Boolean))],monsterVariants:[...new Set(monsterMeshes.map(m=>m.userData&&m.userData.visualVariant).filter(Boolean))],
    loot:lootDrops.length,gold:G?Math.floor(G.gold||0):0,equip:G?(G.equip||[]).slice():[],routeId:runSelection.routeId,routeKind:selectedRouteNode().kind,dashCool:G?(G.dashCool||0):0, shield:G?(G.shield||0):0, overdrive:G?(G.overdrive||0):0,
    moveMul:G?(G.moveMul||1):1,damageMul:G?(G.damageMul||1):1,weaponCoolMul:G?(G.weaponCoolMul||1):1,scoreMul:G?(G.scoreMul||1):1,
    enemyHazards:G&&G.enemyHazards?G.enemyHazards.length:0, slow:G?(G.slow||0):0, bleed:G?(G.bleed||0):0,
    boss:G&&G.boss?{type:G.boss.type,hp:G.boss.hp,maxHp:G.boss.maxHp}:null,endless:G&&G.endless?{wave:G.endless.wave,cleared:G.endless.cleared,damageMul:G.endless.damageMul,bossWave:G.endless.bossWave,totalWaves:G.endless.totalWaves}:null,pos:{x:player.x,z:player.z},hi,
    story:{order:storyRun.order,echo:storyRun.echo,choices:Object.assign({},storyRun.choices),ending:(G&&G.storyEnding)||storyRun.ending,modal:storyModalActive,page:storyPageIndex,options:(storyPages[storyPageIndex]?.choices||[]).map(c=>c.value)} }),
  setPos: (x,z)=>{ player.x=x; player.z=z; },
  /* CSD-H2：怪物强化运行时降档入口（1|2|3，写 G.boost；无需重新构建） */
  setMonsterBoost: (v)=>setMonsterBoost(v),
  /* CSD-SOUL1-P1：魂系调试入口（招式/韧性/处决；处决复用发射键已在 fireFromCamera 优先处理） */
  setSoul: (on)=>globalThis.__D3D_LOGIC.setSoul(!!on),
  tryExecute: ()=>tryExecute(player.x, player.z),
  findExecutable: ()=>findExecutable(player.x, player.z),
  /* S5/S9：设置读写 + 存档（供未来设置 UI 与调试；全部持久化到 chaosheng_dive3d_save） */
  getSettings: ()=>Object.assign({}, settings),
  setSensitivity: (v)=>{ settings.sensitivity = Math.max(0.3, Math.min(0.8, Number(v)||0.45)); input.setSensitivity(settings.sensitivity); saveGame(); return settings.sensitivity; },
  setMute: (on)=>{ settings.mute = !!on; saveGame(); return settings.mute; },
  setVibrate: (on)=>{ settings.vibrate = !!on; saveGame(); return settings.vibrate; },
  setReduceFlicker: (on)=>{ settings.reduceFlicker = !!on; saveGame(); return settings.reduceFlicker; },
  setAimAssist: (on)=>{ settings.aimAssist = !!on; saveGame(); return settings.aimAssist; },   // D3：默认开，可关（S9）
  save: ()=>saveGame(),
  load: ()=>saved,
  visual: ()=>({level:G?G.level:0,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,particles:particles.length,
    surfaceTextures:{floor:!!(SURFACE_TEX.floorDiff.image&&SURFACE_TEX.floorNorm.image),rock:!!(SURFACE_TEX.rockDiff.image&&SURFACE_TEX.rockNorm.image)},
    landmark:detailMeshes.some(x=>x.userData&&x.userData.kind==="landmark"),lowQuality:lowQ}),
  minimap: ()=>({ready:!!minimapCtx,level:G?G.level:0,expanded:minimapExpanded,width:minimapEl.width,height:minimapEl.height,
    monsters:G?(G.monsters||[]).filter(m=>m&&m.hp>0).length:0,boss:!!(G&&G.boss&&G.boss.hp>0),portal:!!G,portalOpen:!!(G&&objectiveMet()),samples:G?(G.sampleSpots||SAMPLE_SPOTS).filter((s,i)=>!(G.grabbed&&G.grabbed[i])).length:0}),
  qaToggleMinimap:qaEnabled?(on)=>{setMinimapExpanded(on===undefined?!minimapExpanded:!!on);return globalThis.__D3D.minimap();}:undefined,
  qaStart:qaEnabled?(o)=>{o=o||{};if(RUN_MODES[o.modeId])runSelection.modeId=o.modeId;if(DIVER_ROLES[o.roleId])runSelection.roleId=o.roleId;if(Number.isInteger(o.level))runSelection.level=Math.max(0,Math.min(99,o.level));if(typeof o.routeId==="string"&&routeNodeById(o.routeId))runSelection.routeId=o.routeId;persistRunSelection();renderRunSelectionUI();startGame(false);if(storyModalActive)finishStorySequence();return globalThis.__D3D.get();}:undefined,
  qaGrantGold:qaEnabled?(n)=>{grantGold(n||500,"QA");return {gold:G&&G.gold,state:globalThis.__D3D.get()};}:undefined,
  qaStartStory:qaEnabled?(o)=>{o=o||{};if(RUN_MODES[o.modeId])runSelection.modeId=o.modeId;if(DIVER_ROLES[o.roleId])runSelection.roleId=o.roleId;if(Number.isInteger(o.level))runSelection.level=Math.max(0,Math.min(99,o.level));persistRunSelection();renderRunSelectionUI();startGame(false);return globalThis.__D3D.get();}:undefined,
  qaStoryAdvance:qaEnabled?(value)=>{if(storyModalActive){const p=storyPages[storyPageIndex],choice=p&&Array.isArray(p.choices)?p.choices.find(c=>c.value===value):null;if(choice)chooseStoryOption(choice);else if(!p?.choices)advanceStoryPage();}return globalThis.__D3D.get();}:undefined,
  qaStorySkip:qaEnabled?()=>{if(storyModalActive)skipStorySection();return globalThis.__D3D.get();}:undefined,
  qaFire:qaEnabled?()=>{fireFromCamera();return globalThis.__D3D.get();}:undefined,
  qaPickup:qaEnabled?(i)=>{if(G&&G.sampleSpots&&G.sampleSpots[i|0]){const p=G.sampleSpots[i|0];player.x=p.x;player.z=p.z;player.y=terrainHeight(p.x,p.z)+1.7;tryPickup();}return globalThis.__D3D.get();}:undefined,
  qaFaceBoss:qaEnabled?()=>{if(G&&G.boss){player.x=G.boss.x;player.z=G.boss.z+11;player.y=terrainHeight(player.x,player.z)+1.7;player.yaw=0;player.pitch=0;camera.position.set(player.x,player.y,player.z);camera.rotation.set(0,0,0);}return globalThis.__D3D.get();}:undefined,
  qaShowBoss:qaEnabled?()=>{if(G&&G.boss&&bossMesh){clearTelegraphRings();bossRing.visible=false;gateGroup.visible=false;gateBeam.visible=false;G.enemyHazards=[];G.boss.phaseLock=999;G.boss.atk=null;G.boss.feint=null;G.boss.warn=false;bossMesh.visible=true;const d=bossMesh.userData||{};bossMesh.scale.setScalar(d.baseScale||1);bossMesh.position.set(G.boss.x,terrainHeight(G.boss.x,G.boss.z)+(d.hover||2.4),G.boss.z);document.getElementById("levelIntro").classList.remove("show");}return globalThis.__D3D.get();}:undefined,
  qaCompleteLevel:qaEnabled?()=>{if(G){G.samples=sampleTarget();G.kills=999;if(G.objective&&G.objective.t){G.time=Math.max(G.time,G.objective.t);G.defendProgress=G.objective.t;if(G.objective.kind==="defend")G.defendComplete=true;}if(G.objective?.kind==="scan")G.scanDone=(G.objective.points||[]).map(()=>true);if(G.objective?.kind==="gauntlet")G.gauntletWave=G.objective.waves;for(const m of G.monsters||[])m.hp=0;if(G.boss)G.boss.hp=0;G.winOpen=true;const p=gatePos();player.x=p.x;player.z=p.z;player.y=terrainHeight(p.x,p.z)+1.7;G.state=S.PLAYING;}return globalThis.__D3D.get();}:undefined,
  qaSetPos:qaEnabled?(x,z)=>{player.x=Number(x)||0;player.z=Number(z)||0;player.y=terrainHeight(player.x,player.z)+1.7;camera.position.set(player.x,player.y,player.z);return globalThis.__D3D.get();}:undefined,
  qaMissionTick:qaEnabled?(dt)=>{tickCampaignObjective(Math.max(0,Number(dt)||0));return globalThis.__D3D.get();}:undefined,
  qaClearMissionWave:qaEnabled?()=>{if(G&&G.objective?.kind==="gauntlet"){for(const m of G.monsters||[])m.hp=0;tickCampaignObjective(.016);}return globalThis.__D3D.get();}:undefined,
  qaSetResources:qaEnabled?(hp)=>{if(G){G.hp=Math.max(0,Math.min(G.maxHp,Number(hp)));}return globalThis.__D3D.get();}:undefined,
  qaWin:qaEnabled?()=>{if(G){G.winOpen=true;G.time=Math.max(G.time||0,40);G.state="PLAYING";}return globalThis.__D3D.get();}:undefined,
  qaLoadLevel:qaEnabled?(i)=>{loadLevel(Math.max(0,Math.min(99,i|0)),{score:G?G.score:0,ammo:G?G.ammo:4,runTime:G?G.runTime:0,gold:G?G.gold:undefined,goldEarned:G?G.goldEarned:undefined,equip:G?(G.equip||[]).slice():undefined});return globalThis.__D3D.get();}:undefined,
  qaCampaign:qaEnabled?()=>({count:LEVELS.length,invalid:LEVELS.map((lv,i)=>validateLevel(lv)?{stage:i+1,error:validateLevel(lv)}:null).filter(Boolean),stages:LEVELS.map(lv=>({id:lv.id,name:lv.name,objective:lv.objective,boss:lv.boss,monsters:lv.monsters.length,beat:lv.beat}))}):undefined,
  qaEndlessClear:qaEnabled?()=>{if(G&&G.modeId==="endless"){for(const m of G.monsters||[])m.hp=0;if(G.boss)G.boss.hp=0;G.kills=G.objective?.n||0;G.state=S.PLAYING;tickEndless();}return {state:globalThis.__D3D.get(),wave:G?.endless||null,build:runBuild.pending};}:undefined,
  qaEndlessWave:qaEnabled?(wave)=>{if(G&&G.modeId==="endless")prepareEndlessWave(Math.max(1,wave|0),true);return {state:globalThis.__D3D.get(),wave:G?.endless||null};}:undefined
};

/* HOTFIX-MENU：引擎就绪后显示主菜单（v0 缺失此步，加载页隐藏后菜单也未显示，导致无法开始游戏） */
document.getElementById("menu").classList.remove("hidden");
/* 启动渲染循环 */
requestAnimationFrame((ts)=>{ lastTs=ts; loop(ts); });
} /* end boot() */

/* 启动：等 Three.js 就绪（多 CDN 异步回退）；失败后可点「重新加载」无导航重试 */
(function launch(){
  var iv = null, tries = 0;
  function finish(){
    if(iv){ clearInterval(iv); iv = null; }
    document.getElementById("loadNote").classList.add("hidden");
    boot();
  }
  function startWatch(){
    if(iv){ clearInterval(iv); }
    tries = 0;
    if(window.THREE && webglOk()){ finish(); return; }
    iv = setInterval(function(){
      if(window.THREE && webglOk()){ finish(); }
      else if(++tries > 40){
        clearInterval(iv); iv = null;
        if(!window.THREE) engineFail("3D 引擎加载失败。请检查网络后点击下方按钮重试；也可双击本文件用浏览器打开（更稳定）。");
        else engineFail("当前环境不支持 WebGL，无法运行 3D 游戏。");
      }
    }, 500);
  }
  window.__startWatch = startWatch;
  startWatch();
})();
