#!/usr/bin/env python3
"""Extract every image of a .glb to numbered RGBA PNGs, longest side capped, for baking.

  python3 scripts/extract-gltf-textures.py model.glb out-dir [max-size]
"""
import io
import json
import os
import struct
import sys

from PIL import Image

source, out = sys.argv[1], sys.argv[2]
cap = int(sys.argv[3]) if len(sys.argv) > 3 else 512

data = open(source, 'rb').read()
assert data[:4] == b'glTF', 'not a GLB'
pos, gltf, binary = 12, None, b''
while pos < len(data):
    length, kind = struct.unpack_from('<II', data, pos)
    body = data[pos + 8 : pos + 8 + length]
    if kind == 0x4E4F534A:
        gltf = json.loads(body)
    elif kind == 0x004E4942:
        binary = body
    pos += 8 + length

os.makedirs(out, exist_ok=True)
count = 0
for i, image in enumerate(gltf.get('images', [])):
    if 'bufferView' not in image:
        print('skipping image', i, '(not embedded)')
        continue
    view = gltf['bufferViews'][image['bufferView']]
    start = view.get('byteOffset', 0)
    img = Image.open(io.BytesIO(binary[start : start + view['byteLength']])).convert('RGBA')
    img.thumbnail((cap, cap), Image.LANCZOS)
    img.save(os.path.join(out, f'{i}.png'))
    count += 1
print(f'extracted {count} textures to {out}')
