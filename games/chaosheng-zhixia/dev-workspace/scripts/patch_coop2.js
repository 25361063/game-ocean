const fs = require("fs");
for (const F of ["潮声之下_深渊潜航3D_v22.html", "潮声之下_深渊潜航3D_手机版.html"]) {
  let html = fs.readFileSync(F, "utf8");
  let n = 0;
  // C3: 在独立的 applyRoleVisual(); 前插入联机 UI 初始化
  const anchor = "\napplyRoleVisual();\nlet playerModel=null";
  const c = html.split(anchor).length - 1;
  if (c === 1) {
    const jsBlock = `
/* v38 联机 UI */
(function(){
  const ct=document.getElementById("coopToggle"),pr=document.getElementById("coopP2Role");
  if(!ct)return;
  const saved=coopGetEnabled();
  if(saved){coopEnabled=true;ct.textContent="联机模式 ✓";ct.classList.add("on");if(pr)pr.style.display="flex";}
  ct.addEventListener("click",()=>{
    coopEnabled=!coopEnabled;
    ct.textContent=coopEnabled?"联机模式 ✓":"单人模式";
    ct.classList.toggle("on",coopEnabled);
    if(pr)pr.style.display=coopEnabled?"flex":"none";
    coopToggle(coopEnabled);
    try{initAudio();}catch(e){}
  });
  if(pr)pr.addEventListener("click",e=>{
    const b=e.target.closest(".p2role");if(!b)return;
    p2Role=b.dataset.role;
    pr.querySelectorAll(".p2role").forEach(x=>{x.classList.remove("on");x.style.borderColor="";x.style.color="";});
    b.classList.add("on");b.style.borderColor="var(--acc2)";b.style.color="var(--acc2)";
  });
})();
applyRoleVisual();
let playerModel=null`;
    html = html.split(anchor).join(jsBlock);
    n++;
  } else console.log(F, "C3 anchor count", c);
  fs.writeFileSync(F, html);
  console.log(F, "fixed:", n);
}
