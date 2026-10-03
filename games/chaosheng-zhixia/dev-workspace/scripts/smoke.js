// 无头冒烟：真实浏览器跑游戏，抓启动/进关/传送链路错误
const puppeteer = require("puppeteer-core");
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BASE = "http://127.0.0.1:8123/";
const PAGE = BASE + encodeURIComponent("潮声之下_深渊潜航3D_v22.html") + "?qa=1";

(async () => {
  const browser = await puppeteer.launch({
    executablePath: EDGE, headless: "new",
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--no-sandbox", "--window-size=1280,800"]
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const errors = [];
  page.on("console", m => { if (m.type() === "error") errors.push("[console] " + m.text().slice(0, 300)); });
  page.on("requestfailed", r => errors.push("[reqfail] " + r.url().slice(0, 160) + " " + (r.failure()&&r.failure().errorText||"")));
  page.on("response", r => { if (r.status() >= 400) errors.push("[http" + r.status() + "] " + r.url().slice(0, 160)); });
  page.on("pageerror", e => errors.push("[pageerror] " + String(e).slice(0, 300)));

  console.log("== 打开页面 ==");
  await page.goto(PAGE, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction("!!window.__D3D", { timeout: 45000 }).catch(() => errors.push("[fatal] __D3D 未出现（boot 失败）"));
  if (errors.length) { console.log(errors.join("\n")); await browser.close(); process.exit(1); }
  const probe = await page.evaluate(() => ({ THREE: typeof THREE, hasD3D: !!window.__D3D, loadNote: (document.getElementById("loadNote")||{}).className, hasG: typeof window.G, title: document.title }));
  console.log("页面状态:", JSON.stringify(probe));
  console.log("boot OK，__D3D 就绪");

  const st = async () => page.evaluate(() => { const s = window.__D3D.get(); return { level: s.level, state: s.state, winOpen: s.winOpen, pos: s.pos }; });

  console.log("== 开始游戏 ==");
  await page.evaluate(() => { window.__D3D.start(); });
  await new Promise(r => setTimeout(r, 1500));
  console.log("state after start:", JSON.stringify(await st()));

  console.log("== 逐层进关冒烟 ==");
  for (const lv of [2, 10, 21, 40, 60, 80, 100]) {
    const r = await page.evaluate((lv) => {
      try { window.__D3D.qaLoadLevel(lv); return { ok: true, level: window.__D3D.get().level }; }
      catch (e) { return { ok: false, err: String(e).slice(0, 200) }; }
    }, lv);
    await new Promise(r2 => setTimeout(r2, 700));
    const s = await st();
    const errs = errors.length;
    console.log("L" + lv + " →", JSON.stringify(r), "state:", s.state, "实际 level:", s.level, "新增错误:", errs);
  }

  console.log("== 传送链路实测（L2：强制开传送门 → 站上门 → 期待进入 L3） ==");
  await page.evaluate(() => { window.__D3D.qaLoadLevel(2); });
  await new Promise(r => setTimeout(r, 600));
  const gate = await page.evaluate(() => {
    // 裂口位置从关卡配置读取：G.gatePos
    const g = (window.G && window.G.gatePos) || null;
    return g ? { x: g.x, z: g.z } : null;
  });
  console.log("L2 gatePos:", JSON.stringify(gate));
  await page.evaluate(() => { window.__D3D.qaWin(); });
  await new Promise(r => setTimeout(r, 200));
  if (gate) await page.evaluate((g) => { window.__D3D.qaSetPos(g.x, g.z); }, gate);
  await new Promise(r => setTimeout(r, 1500));
  const s2 = await st();
  console.log("传送后状态:", JSON.stringify(s2), "新增错误:", errors.length);
  if (errors.length) console.log(errors.slice(-6).join("\n"));
  console.log(s2.level === 3 ? "传送链路 OK（L2→L3）" : "!!! 传送链路未推进 —— 复现用户报障");
  await page.screenshot({ path: "_smoke.png" });
  await browser.close();
  process.exit(s2.level === 3 ? 0 : 2);
})().catch(e => { console.error("SMOKE FATAL:", e.message); process.exit(3); });
