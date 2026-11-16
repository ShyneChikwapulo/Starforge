#!/usr/bin/env python3
"""Extract every image of a .glb or .gltf to numbered RGBA PNGs, longest side capped, for baking.

  python3 scripts/extract-gltf-textures.py model.glb|model.gltf out-dir [max-size]

Images may be embedded in a .glb, or be files or data URIs referenced by a .gltf.
"""
import base64
import io
import json
import os
import struct
import sys
import urllib.parse

from PIL import Image

source, out = sys.argv[1], sys.argv[2]
cap = int(sys.argv[3]) if len(sys.argv) > 3 else 512

data = open(source, 'rb').read()
binary = b''
if data[:4] == b'glTF':
    pos, gltf = 12, None
    while pos < len(data):
        length, kind = struct.unpack_from('<II', data, pos)
        body = data[pos + 8 : pos + 8 + length]
        if kind == 0x4E4F534A:
            gltf = json.loads(body)
        elif kind == 0x004E4942:
            binary = body
        pos += 8 + length
else:
    gltf = json.loads(data)
base = os.path.dirname(os.path.abspath(source))

os.makedirs(out, exist_ok=True)
count = 0
for i, image in enumerate(gltf.get('images', [])):
    uri = image.get('uri', '')
    if 'bufferView' in image:
        view = gltf['bufferViews'][image['bufferView']]
        start = view.get('byteOffset', 0)
        raw = binary[start : start + view['byteLength']]
    elif uri.startswith('data:'):
        raw = base64.b64decode(uri.split(',', 1)[1])
    elif uri:
        raw = open(os.path.join(base, urllib.parse.unquote(uri)), 'rb').read()
    else:
        print('skipping image', i, '(no data)')
        continue
    img = Image.open(io.BytesIO(raw)).convert('RGBA')
    img.thumbnail((cap, cap), Image.LANCZOS)
    img.save(os.path.join(out, f'{i}.png'))
    count += 1
print(f'extracted {count} textures to {out}')
