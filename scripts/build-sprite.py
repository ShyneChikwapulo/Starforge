#!/usr/bin/env python3
"""Pack raw RGBA frames (frame-000.rgba ... and meta.json) into one horizontal WebP strip.

  python3 scripts/build-sprite.py frames-dir out-dir [webp-quality, default 92]

Writes out-dir/sprite.webp, plus out-dir/still.png (the first frame) and meta.json.
"""
import json
import os
import shutil
import sys

from PIL import Image

source, out = sys.argv[1], sys.argv[2]
meta = json.load(open(os.path.join(source, 'meta.json')))
w, h, n = meta['width'], meta['height'], meta['frames']
assert w * n <= 16383, 'strip too wide for WebP'

strip = Image.new('RGBA', (w * n, h))
for i in range(n):
    raw = open(os.path.join(source, f'frame-{i:03d}.rgba'), 'rb').read()
    frame = Image.frombytes('RGBA', (w, h), raw)
    strip.paste(frame, (i * w, 0))
    if i == 0:
        frame.save(os.path.join(out, 'still.png'))

target = os.path.join(out, 'sprite.webp')
quality = int(sys.argv[3]) if len(sys.argv) > 3 else 92
strip.save(target, quality=quality, method=6, alpha_quality=100)
shutil.copy(os.path.join(source, 'meta.json'), os.path.join(out, 'meta.json'))
print(f'wrote {target}: {os.path.getsize(target) / 1024:.0f} KB for {n} frames of {w}x{h}')
