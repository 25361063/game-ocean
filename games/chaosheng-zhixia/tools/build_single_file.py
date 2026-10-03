# -*- coding: utf-8 -*-
"""把 潮声之下_深渊潜航3D_v22.html 及其全部外部依赖打包成单个 HTML 文件。

v58.4：为把单文件压到 20MB 以内，人物模型包做了三步无损/近无损压缩：
  1. gltf-transform weld + quantize（KHR_mesh_quantization，three.js GLTFLoader 原生支持）
  2. gzip(level 9) 后再 base64 内联，运行时用 DecompressionStream 解压
  3. 6 张 1k PNG 贴图与菜单海报转 WebP
中间产物缓存在 .cache_vit49/，源文件未变时直接复用（跳过 gltf-transform）。
环境变量：D3D_NO_MIN=1 跳过模型压缩（回退原样内联，体积 ~57MB）。
"""
import base64, gzip, io, json, os, re, shutil, subprocess, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
MAIN = os.path.join(ROOT, "潮声之下_深渊潜航3D_v22.html")
OUT = os.path.join(ROOT, "潮声之下_深渊潜航3D_单文件版.html")
PACK = os.path.join(ROOT, "assets", "vitruvian", "packed49.js")
POSTER = os.path.join(ROOT, "assets", "posters", "captains-v48.png")
CACHE = os.path.join(ROOT, ".cache_vit49")
NO_MIN = os.environ.get("D3D_NO_MIN") == "1"
SIZE_LIMIT = 20 * 1024 * 1024

CSS_FILES = ["assets/mobile57.css", "assets/mobile58.css"]
JS_FILES = [
    "assets/vitruvian/GLTFLoader.js",
    "assets/vitruvian/packed49.js",       # 压缩构建时由压缩包替换
    "assets/vitruvian/wardrobe49.js",
    "assets/vitruvian/cyber52.js",
    "assets/environment/architecture50.js",
    "assets/environment/ecology51.js",
    "assets/environment/tower54.js",
    "assets/mobile57.js",
    "assets/vitruvian/characters49.js",   # 压缩构建时植入解压钩子
]
TEXTURE_KEYS = ["face", "body", "hair", "opacity", "iris", "sclera"]


def read_text(rel):
    with io.open(os.path.join(ROOT, rel), "r", encoding="utf-8") as f:
        return f.read()


def find_node():
    cand = r"C:\Users\a'd\.workbuddy\binaries\node\versions\22.22.2\node.exe"
    if os.path.exists(cand):
        return cand
    return shutil.which("node") or "node"


def find_gltf_cli():
    cand = r"C:\Users\a'd\.workbuddy\binaries\node\workspace\node_modules\@gltf-transform\cli\bin\cli.js"
    if os.path.exists(cand):
        return cand
    return None


def extract_pack():
    """从 packed49.js 取出三个 GLB（base64）与六张 PNG 贴图（base64）"""
    s = read_text("assets/vitruvian/packed49.js")
    models = {}
    for key in ("body", "head", "hair"):
        m = re.search(r'"%s"\s*:\s*"([A-Za-z0-9+/=]{1000,})"' % key, s)
        assert m, "model payload missing: " + key
        models[key] = m.group(1)
    texs = {}
    for key in TEXTURE_KEYS:
        m = re.search(r'"%s"\s*:\s*"data:image/png;base64,([A-Za-z0-9+/=]{1000,})"' % key, s)
        assert m, "texture payload missing: " + key
        texs[key] = m.group(1)
    return models, texs


def prepare_cache():
    """生成/复用压缩中间产物，返回 (models_gz_b64, textures_dataurl)"""
    from PIL import Image
    os.makedirs(CACHE, exist_ok=True)
    stamp = {"v": 2, "pack": [os.path.getmtime(PACK), os.path.getsize(PACK)]}   # v2: 改用 gzip 容器
    meta_path = os.path.join(CACHE, "meta.json")
    cached = None
    if os.path.exists(meta_path):
        try:
            cached = json.load(io.open(meta_path, encoding="utf-8"))
        except Exception:
            cached = None
    reusable = bool(cached) and cached.get("stamp") == stamp and not NO_MIN

    models_b64, textures = {}, {}
    if reusable:
        ok = all(os.path.exists(os.path.join(CACHE, n)) for n in
                 ["body.glb.gz", "head.glb.gz", "hair.glb.gz"] + ["tex_%s.webp" % k for k in TEXTURE_KEYS] + ["poster.webp"])
        if ok:
            print("[cache] 复用", CACHE)
            for k in ("body", "head", "hair"):
                models_b64[k] = base64.b64encode(open(os.path.join(CACHE, k + ".glb.gz"), "rb").read()).decode("ascii")
            for k in TEXTURE_KEYS:
                textures[k] = "data:image/webp;base64," + base64.b64encode(
                    open(os.path.join(CACHE, "tex_%s.webp" % k), "rb").read()).decode("ascii")
            return models_b64, textures

    print("[pack] 解析 packed49.js 并压缩…")
    models, texs = extract_pack()
    node, cli = find_node(), find_gltf_cli()
    tmp = os.path.join(CACHE, "_in")
    opt = os.path.join(CACHE, "_opt")
    shutil.rmtree(tmp, ignore_errors=True)
    shutil.rmtree(opt, ignore_errors=True)
    os.makedirs(tmp, exist_ok=True)
    os.makedirs(opt, exist_ok=True)

    for k in ("body", "head", "hair"):
        raw = base64.b64decode(models[k])
        src = os.path.join(tmp, k + ".glb")
        with open(src, "wb") as f:
            f.write(raw)
        dst = os.path.join(opt, k + ".glb")
        if cli:
            for cmd, out in ((("weld", src), os.path.join(opt, k + ".w.glb")),
                             (("quantize", os.path.join(opt, k + ".w.glb")), dst)):
                r = subprocess.run([node, cli, cmd[0], cmd[1], out], capture_output=True, text=True)
                if r.returncode != 0:
                    raise RuntimeError("gltf-transform %s 失败: %s" % (cmd[0], (r.stderr or r.stdout)[-400:]))
        else:
            shutil.copyfile(src, dst)   # 无 CLI：仅 gzip（仍能显著变小）
            print("  ! 未找到 gltf-transform CLI，%s 跳过量化" % k)
        gz = gzip.compress(open(dst, "rb").read(), compresslevel=9, mtime=0)
        with open(os.path.join(CACHE, k + ".glb.gz"), "wb") as f:
            f.write(gz)
        models_b64[k] = base64.b64encode(gz).decode("ascii")
        print("  %-5s %6.2fMB -> 量化 %6.2fMB -> gzip %5.2fMB" % (
            k, len(raw) / 1e6, os.path.getsize(dst) / 1e6, len(gz) / 1e6))

    for k in TEXTURE_KEYS:
        raw = base64.b64decode(texs[k])
        im = Image.open(io.BytesIO(raw))
        out = io.BytesIO()
        if k == "opacity":
            im.save(out, "WEBP", lossless=True, method=6)      # 发丝 alpha 蒙版保留无损，避免边缘缺失
        else:
            if im.mode not in ("RGB", "RGBA"):
                im = im.convert("RGBA" if "A" in im.mode else "RGB")
            im.save(out, "WEBP", quality=85, method=6)
        with open(os.path.join(CACHE, "tex_%s.webp" % k), "wb") as f:
            f.write(out.getvalue())
        textures[k] = "data:image/webp;base64," + base64.b64encode(out.getvalue()).decode("ascii")
        print("  贴图 %-8s PNG %5.2fMB -> WebP %6.1fKB" % (k, len(raw) / 1e6, len(out.getvalue()) / 1024))

    # 菜单海报
    p = Image.open(POSTER)
    o = io.BytesIO()
    p.convert("RGB").save(o, "WEBP", quality=86, method=6)
    with open(os.path.join(CACHE, "poster.webp"), "wb") as f:
        f.write(o.getvalue())
    print("  海报 %dx%d %.2fMB -> WebP %.1fKB" % (p.size[0], p.size[1], os.path.getsize(POSTER) / 1e6, o.tell() / 1024))

    shutil.rmtree(tmp, ignore_errors=True)
    shutil.rmtree(opt, ignore_errors=True)
    json.dump(stamp, io.open(meta_path, "w", encoding="utf-8"))
    return models_b64, textures


INFLATE_JS = r"""
/* v58.4 单文件版：人物模型包 gzip 解压（贴图已是 WebP data URL，无需解压）
   说明：① 必须定义「函数」而非立即执行；② 返回解压后的数据对象，避免 characters49.js
   紧随其后的 window.VIT49_DATA=null 造成竞态 */
window.__vit49Inflate=async function(){
  const S=window.VIT49_DATA; if(!S||!S.gzm||S.__done)return S;
  const b64u=b=>{const s=atob(b),u=new Uint8Array(s.length);for(let i=0;i<s.length;i++)u[i]=s.charCodeAt(i);return u;};
  const u2b64=u=>{let s='';for(let i=0;i<u.length;i+=32768)s+=String.fromCharCode.apply(null,u.subarray(i,i+32768));return btoa(s);};
  const gunzip=async b=>{
    if(typeof DecompressionStream!=='function')throw new Error('当前浏览器不支持解压（需 Chrome/Edge 80+ 或 iOS Safari 16.4+）');
    const st=new Blob([b64u(b)]).stream().pipeThrough(new DecompressionStream('gzip'));
    const out=new Uint8Array(await new Response(st).arrayBuffer());
    if(out.length<200)throw new Error('人物模型解压异常（数据长度 '+out.length+'）');
    return out;
  };
  const m={};
  for(const k in S.models)m[k]=u2b64(await gunzip(S.models[k]));
  S.models=m;S.gzm=0;S.__done=1;window.__vit49Gz=(window.__vit49Gz||0)+1;
  return S;
};
"""


def build():
    html = read_text("潮声之下_深渊潜航3D_v22.html")

    # ---- 1) 内联 CSS ----
    for css in CSS_FILES:
        tag = '<link rel="stylesheet" href="%s">' % css
        assert tag in html, "missing link tag: " + css
        html = html.replace(tag, "<style>\n/* ==== inlined: %s ==== */\n%s\n</style>" % (css, read_text(css)))

    # ---- 2) 模型/贴图压缩包 ----
    if NO_MIN:
        models_b64, textures = None, None
        poster_uri = None
    else:
        models_b64, textures = prepare_cache()
        poster_path = os.path.join(CACHE, "poster.webp")
        poster_uri = "data:image/webp;base64," + base64.b64encode(open(poster_path, "rb").read()).decode("ascii")

    # 海报：压缩构建用 WebP，否则退回原 PNG base64
    if poster_uri:
        html = html.replace("url('assets/posters/captains-v48.png')", "url('" + poster_uri + "')")
    else:
        with open(POSTER, "rb") as f:
            png_uri = "data:image/png;base64," + base64.b64encode(f.read()).decode("ascii")
        html = html.replace("url('assets/posters/captains-v48.png')", "url('" + png_uri + "')")

    # ---- 3) 内联 JS（保持原顺序） ----
    for js in JS_FILES:
        tag = '<script src="%s"></script>' % js
        assert tag in html, "missing script tag: " + js
        if js.endswith("packed49.js"):
            if NO_MIN:
                body = read_text(js)
            else:
                body = (INFLATE_JS
                        + "\nwindow.VIT49_DATA={gzm:1,textures:"
                        + json.dumps(textures, ensure_ascii=False)
                        + ",models:{"
                        + ",".join('"%s":"%s"' % (k, models_b64[k]) for k in ("body", "head", "hair"))
                        + "}};")
        elif js.endswith("characters49.js"):
            body = read_text(js)
            if not NO_MIN:
                old = "const T=THREE,D=window.VIT49_DATA;if(!D)throw Error('Vitruvian asset package missing');"
                assert old in body, "characters49.js 结构变化，无法植入解压钩子"
                body = body.replace(
                    old,
                    "const T=THREE,D=(window.__vit49Inflate?await window.__vit49Inflate():null)||window.VIT49_DATA;"
                    "if(!D)throw Error('Vitruvian asset package missing');")
        else:
            body = read_text(js)
        assert "</script" not in body.lower(), "script body contains </script>: " + js
        html = html.replace(tag, "<script>\n/* ==== inlined: %s ==== */\n%s\n</script>" % (js, body))

    # ---- 4) 校验无残留外部引用 ----
    for marker in ('src="assets/', 'href="assets/', "url('assets/", 'url("assets/'):
        assert marker not in html, "leftover external ref: " + marker

    with io.open(OUT, "w", encoding="utf-8", newline="\n") as f:
        f.write(html)

    size = os.path.getsize(OUT)
    print("OK -> %s" % OUT)
    print("size = %.2f MB (%.1f%% of 20MB 上限) %s" % (
        size / 1048576.0, size / SIZE_LIMIT * 100, "✓ 达标" if size <= SIZE_LIMIT else "✗ 超出上限"))
    return size


if __name__ == "__main__":
    build()
