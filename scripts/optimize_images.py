#!/usr/bin/env python3
"""
optimize_images.py — make every image under assets/img/ web-ready.

  • scales down to a sensible size per folder (photos 1600 px, logos/badges 600 px)
  • removes EXIF metadata (camera, GPS location) and applies the EXIF rotation
  • recompresses JPEG (quality 82, progressive) and PNG (optimised)
  • leaves files alone that are already small enough

Usage:
    pip install pillow
    python scripts/optimize_images.py            # optimise in place
    python scripts/optimize_images.py --check    # only report, change nothing

Runs automatically via .github/workflows/optimize-images.yml whenever images
are pushed, so pictures uploaded through the GitHub website get the same treatment.
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent / "assets" / "img"
MAX_EDGE = {"projects": 600, "badges": 600, "pubs": 1000, "teaching": 1400}
DEFAULT_EDGE = 1600
SKIP_BELOW_BYTES = 60_000          # tiny files are left as they are
EXTS = {".jpg", ".jpeg", ".png", ".webp"}


def limit_for(path: Path) -> int:
    rel = path.relative_to(ROOT).parts
    return MAX_EDGE.get(rel[0], DEFAULT_EDGE) if len(rel) > 1 else DEFAULT_EDGE


def process(path: Path, check: bool) -> str | None:
    before = path.stat().st_size
    with Image.open(path) as im:
        has_exif = bool(im.info.get("exif"))
        edge = limit_for(path)
        too_big = max(im.size) > edge
        if before < SKIP_BELOW_BYTES and not too_big and not has_exif:
            return None
        if check:
            return f"would optimise {path.relative_to(ROOT)} ({before // 1024} KB, {im.size[0]}×{im.size[1]})"
        im = ImageOps.exif_transpose(im)
        if too_big:
            im.thumbnail((edge, edge), Image.LANCZOS)
        ext = path.suffix.lower()
        if ext in (".jpg", ".jpeg"):
            im.convert("RGB").save(path, "JPEG", quality=82, optimize=True, progressive=True)
        elif ext == ".png":
            im.save(path, "PNG", optimize=True)
        else:
            im.save(path, "WEBP", quality=82, method=6)
    after = path.stat().st_size
    if after > before and not too_big:
        return f"kept {path.relative_to(ROOT)} (already optimal)"
    return f"{path.relative_to(ROOT)}: {before // 1024} KB → {after // 1024} KB"


def main() -> int:
    check = "--check" in sys.argv
    changed = 0
    for p in sorted(ROOT.rglob("*")):
        if p.is_file() and p.suffix.lower() in EXTS:
            msg = process(p, check)
            if msg:
                print(msg)
                changed += 1
    print(f"{changed} file(s) {'need work' if check else 'processed'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
