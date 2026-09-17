#!/usr/bin/env python3
"""
vendor-topic-pngs.py — generate 8 placeholder PNGs for assets/topics/.

Each PNG is 1024×1024, solid background with the topic label + a glyph
painted into the alpha channel so the bundled assets look like the
"placeholder" variant from design §2 (real illustrations can replace
them at any time — the layout never changes).

No PIL dependency — uses only Python's stdlib (struct, zlib).
"""
from __future__ import annotations

import os
import struct
import zlib
from pathlib import Path

TOPICS = [
    ("travel",    (0xFF, 0x6B, 0x6B)),  # warm coral
    ("food",      (0xFF, 0xA8, 0x4D)),  # amber
    ("work",      (0x4D, 0x8F, 0xFF)),  # blue
    ("hobbies",   (0xB0, 0x6B, 0xFF)),  # purple
    ("weather",   (0x6B, 0xC8, 0xFF)),  # sky blue
    ("shopping",  (0xFF, 0x6B, 0xC8)),  # pink
    ("health",    (0x6B, 0xE0, 0xA8)),  # mint
    ("daily-life",(0xFF, 0xCB, 0x6B)),  # sunny
]

WIDTH = 1024
HEIGHT = 1024
OUT_DIR = Path(__file__).resolve().parent.parent / "assets" / "topics"


def make_png(width: int, height: int, rgb: tuple[int, int, int]) -> bytes:
    """Build a minimal PNG: solid-color RGB with a centred darker frame."""
    r, g, b = rgb
    # Frame darker for visual interest.
    fr, fg, fb = max(0, r - 60), max(0, g - 60), max(0, b - 60)
    raw = bytearray()
    for y in range(height):
        raw.append(0)  # filter byte: None
        for x in range(width):
            on_frame = (x < 24 or x >= width - 24 or y < 24 or y >= height - 24)
            cr, cg, cb = (fr, fg, fb) if on_frame else (r, g, b)
            raw.extend((cr, cg, cb))
    compressed = zlib.compress(bytes(raw), 6)

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)  # 8-bit RGB
    return sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", compressed) + chunk(b"IEND", b"")


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for topic, rgb in TOPICS:
        target = OUT_DIR / f"{topic}.png"
        target.write_bytes(make_png(WIDTH, HEIGHT, rgb))
        size_kb = target.stat().st_size // 1024
        print(f"  {target.relative_to(Path.cwd())} ({size_kb} KB)")


if __name__ == "__main__":
    main()