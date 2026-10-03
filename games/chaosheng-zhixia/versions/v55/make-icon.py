#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
生成应用图标：build/icon.ico（含 16—256 多尺寸）+ build/icon.png（512，供部分场景预览）。

素材默认取工作区里的「瞄准镜实机_v55.png」（深色背景 + 青绿瞄准环），
裁切成正方形后压暗边缘、叠加一圈品牌色描边，得到有轮廓感的桌面图标。

用法（可选步骤，仓库里已带生成好的 icon.ico，不需要每次构建都跑）：
    python scripts/make-icon.py
    python scripts/make-icon.py --source ../某张图.png --zoom 0.72

依赖：Pillow（pip install pillow）
"""

import argparse
import math
import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageEnhance, ImageFilter
except ImportError:
    print("缺少 Pillow：python -m pip install pillow")
    sys.exit(1)

PROJECT = Path(__file__).resolve().parent.parent          # desktop/
WORKSPACE = PROJECT.parent                                # 游戏工作区
BUILD = PROJECT / "build"

# 素材里瞄准环圆心与「环占画面宽度」的比例（换图时用参数覆盖）
DEFAULT_CENTER = (0.5014, 0.5037)
DEFAULT_RING_RATIO = 0.356                                # 环直径 / 图片宽度
ACCENT = (95, 224, 176)                                   # --acc #5fe0b0
BG = (4, 7, 12)                                           # --bg #04070c


def parse_args():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--source", default=str(WORKSPACE / "瞄准镜实机_v55.png"))
    p.add_argument("--center", nargs=2, type=float, default=list(DEFAULT_CENTER),
                   metavar=("CX", "CY"), help="裁剪中心，取值为图片宽高的比例 0—1")
    p.add_argument("--ring-ratio", type=float, default=DEFAULT_RING_RATIO,
                   help="素材中圆环直径占图片宽度的比例")
    p.add_argument("--zoom", type=float, default=0.74,
                   help="圆环在图标中的占比（越大环越满）")
    p.add_argument("--size", type=int, default=512, help="基础输出尺寸")
    return p.parse_args()


def crop_square(img: Image.Image, center, side_ratio: float) -> Image.Image:
    w, h = img.size
    side = int(round(min(w, h) * side_ratio))
    side = max(64, min(side, min(w, h)))
    cx, cy = int(center[0] * w), int(center[1] * h)
    left = max(0, min(cx - side // 2, w - side))
    top = max(0, min(cy - side // 2, h - side))
    return img.crop((left, top, left + side, top + side))


def radial_mask(size: int, inner: float = 0.62, outer: float = 1.02) -> Image.Image:
    """径向渐变遮罩：中心不压暗，边缘压到 ~0.55，让图标更有聚焦感。"""
    mask = Image.new("L", (size, size), 0)
    px = mask.load()
    c = (size - 1) / 2
    for y in range(size):
        dy = (y - c) / c
        for x in range(size):
            dx = (x - c) / c
            d = math.hypot(dx, dy)
            if d <= inner:
                v = 255
            elif d >= outer:
                v = 140
            else:
                t = (d - inner) / (outer - inner)
                v = int(255 - 115 * (t * t))
            px[x, y] = v
    return mask


def main():
    args = parse_args()
    source = Path(args.source)
    if not source.is_absolute():
        source = (PROJECT / source).resolve()
    if not source.exists():
        print(f"✗ 找不到素材：{source}")
        sys.exit(1)

    BUILD.mkdir(parents=True, exist_ok=True)
    img = Image.open(source).convert("RGB")

    # 1) 裁成正方形：让圆环占满约 zoom 的比例
    side_ratio = (args.ring_ratio / max(0.3, min(0.95, args.zoom)))
    sq = crop_square(img, args.center, side_ratio)

    # 2) 重采样 + 轻微提对比度，避免缩放后发灰
    base = sq.resize((args.size, args.size), Image.LANCZOS)
    base = ImageEnhance.Contrast(base).enhance(1.08)

    # 3) 边缘压暗（背景色叠加，避免径向遮罩在深色图上没有层次）
    dark = Image.new("RGB", base.size, BG)
    base = Image.composite(base, dark, radial_mask(args.size))

    # 4) 品牌色描边圆环 + 十字准星，让图标在任务栏小尺寸下也认得出
    overlay = Image.new("RGBA", (args.size, args.size), (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    inset = int(args.size * 0.035)
    d.ellipse((inset, inset, args.size - inset, args.size - inset),
              outline=ACCENT + (170,), width=max(2, int(args.size * 0.016)))
    cx = cy = args.size / 2
    arm = args.size * 0.075
    gap = args.size * 0.022
    width = max(1, int(args.size * 0.008))
    for x1, y1, x2, y2 in (
        (cx - gap - arm, cy, cx - gap, cy),
        (cx + gap, cy, cx + gap + arm, cy),
        (cx, cy - gap - arm, cx, cy - gap),
        (cx, cy + gap, cx, cy + gap + arm),
    ):
        d.line((x1, y1, x2, y2), fill=ACCENT + (220,), width=width)
    base = Image.alpha_composite(base.convert("RGBA"), overlay)

    # 5) 输出
    png512 = BUILD / "icon.png"
    base.convert("RGB").save(png512, "PNG")

    sizes = [256, 128, 64, 48, 32, 16]
    ico = BUILD / "icon.ico"
    base.convert("RGB").save(ico, format="ICO", sizes=[(s, s) for s in sizes])

    print(f"✓ 图标已生成：{ico.relative_to(PROJECT)}（{len(sizes)} 个尺寸）")
    print(f"✓ 预览图：{png512.relative_to(PROJECT)}")


if __name__ == "__main__":
    main()
