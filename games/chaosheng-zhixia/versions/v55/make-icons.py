#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
生成 Android 启动图标（mipmap-*/ic_launcher.png）。

素材默认取 desktop/build/icon.png（桌面版同一个瞄准镜图标，512×512），
如需换图：python scripts/make-icons.py --source 你的图.png

用法：npm run icons        （需要 Python + Pillow，一次性操作，生成结果已提交进仓库）
"""

import argparse
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("缺少 Pillow：python -m pip install pillow")
    sys.exit(1)

HERE = Path(__file__).resolve().parent.parent           # mobile/
DEFAULT_SOURCE = HERE.parent / "desktop" / "build" / "icon.png"
RES = HERE / "app" / "res"

DENSITIES = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", default=str(DEFAULT_SOURCE))
    args = parser.parse_args()

    source = Path(args.source)
    if not source.exists():
        print(f"✗ 找不到素材：{source}")
        sys.exit(1)

    img = Image.open(source).convert("RGBA")
    if img.width != img.height:
        side = min(img.width, img.height)
        left = (img.width - side) // 2
        top = (img.height - side) // 2
        img = img.crop((left, top, left + side, top + side))

    for folder, size in DENSITIES.items():
        target = RES / folder / "ic_launcher.png"
        target.parent.mkdir(parents=True, exist_ok=True)
        img.resize((size, size), Image.LANCZOS).save(target, "PNG")
        print(f"✓ {folder}/ic_launcher.png ({size}×{size})")

    print("图标生成完成。")


if __name__ == "__main__":
    main()
