"""
Bakes the "Cyber Samurai" model (by KhoaMinh, CC BY 4.0) into frames for the hero card, with
Blender. The model is a sculpt frozen in one stance, so it has no skeleton and an animation clip
cannot be put on it. Instead it gets a small procedural idle: a weight shift, a breath, a slow turn
of the head, a drift of the camera, a pulse in its glowing parts and a faint ripple in the hem.

Every motion is a cosine of the form -cos(k * pi * u), u running from 0 to 1 across the frames, so
its speed is zero at both ends and playing the frames forwards and then back has no visible seam.

  blender -b --python scripts/blender/bake-cyber-samurai.py -- [options]

Options (all optional; the defaults suit the files unzipped into .starforge/models/cyber-samurai):
  --obj=PATH --textures=DIR --out=DIR
  --frames=N      frames in the loop (default 24)
  --width=W --height=H   frame size in pixels (default 570 x 750: 1.5x the card's 380 x 500 slot)
  --density=D     pixels per card unit, written to meta.json (default 1.5)
  --fps=N         playback speed, written to meta.json (default 8)
  --samples=N     render samples (default 64)
  --engine=BLENDER_EEVEE|CYCLES
  --only=0,23     render only these frame numbers, as preview-NN.png, and write no meta.json
  --rough2=invert|keep   whether the trousers' roughness map is inverted (default invert)

Then pack the frames:  python3 scripts/build-sprite.py <out> <out> 92
"""
import json
import math
import os
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def opt(name, default=None):
    prefix = f'--{name}='
    for a in argv:
        if a.startswith(prefix):
            return a[len(prefix):]
    return default


HOME = os.path.expanduser('~/Starforge/.starforge')
OBJ = os.path.expanduser(opt('obj', HOME + '/models/cyber-samurai/source/extracted/RoninFinalS.obj'))
TEX = os.path.expanduser(opt('textures', HOME + '/models/cyber-samurai/textures'))
OUT = os.path.expanduser(opt('out', HOME + '/character-cyber'))
FRAMES = int(opt('frames', '24'))
WIDTH = int(opt('width', '570'))
HEIGHT = int(opt('height', '750'))
DENSITY = float(opt('density', '1.5'))
FPS = int(opt('fps', '8'))
SAMPLES = int(opt('samples', '64'))
ENGINE = opt('engine', 'BLENDER_EEVEE')
ONLY = [int(n) for n in opt('only', '').split(',') if n != '']

os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
bpy.ops.import_scene.obj(filepath=OBJ, axis_forward='-Z', axis_up='Y')
meshes = [o for o in scene.objects if o.type == 'MESH']


# ---- materials: the zip has PBR maps but no .mtl, so they are wired up here ----
def load(name, colorspace='sRGB'):
    image = bpy.data.images.get(name) or bpy.data.images.load(os.path.join(TEX, name))
    image.colorspace_settings.name = colorspace
    return image


def wire(name, base=None, metallic=None, roughness=None, normal=None, emissive=None,
         rough_value=0.6, emit=4.0, invert_rough=False):
    mat = bpy.data.materials[name]
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])

    def tex(file, colorspace):
        node = nt.nodes.new('ShaderNodeTexImage')
        node.image = load(file, colorspace)
        return node

    if base:
        nt.links.new(tex(base, 'sRGB').outputs['Color'], bsdf.inputs['Base Color'])
    if metallic:
        nt.links.new(tex(metallic, 'Non-Color').outputs['Color'], bsdf.inputs['Metallic'])
    if roughness:
        rough_tex = tex(roughness, 'Non-Color')
        if invert_rough:
            invert = nt.nodes.new('ShaderNodeInvert')
            nt.links.new(rough_tex.outputs['Color'], invert.inputs['Color'])
            nt.links.new(invert.outputs['Color'], bsdf.inputs['Roughness'])
        else:
            nt.links.new(rough_tex.outputs['Color'], bsdf.inputs['Roughness'])
    else:
        bsdf.inputs['Roughness'].default_value = rough_value
    if normal:
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nt.links.new(tex(normal, 'Non-Color').outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    if emissive:
        nt.links.new(tex(emissive, 'sRGB').outputs['Color'], bsdf.inputs['Emission'])
        bsdf.inputs['Emission Strength'].default_value = emit
        return (bsdf, emit)
    return None


glow = [
    wire('LowSet1', 'LowSet1_Base_Color.png', 'LowSet1_Metallic.png', 'LowSet1_Roughness.png',
         'LowSet1_Normal_OpenGL.png', 'LowSet1_Emissive.png'),
    wire('LowSet2', 'LowSet2_Base_Color.png', 'LowSet2_Metallic.png', 'LowSet2_Roughness.png',
         'LowSet2_Normal_OpenGL.png', 'LowSet2_Emissive.png'),
]
wire('LowSet3', 'LowSet3_Base_Color.png', 'LowSet3_Metallic.png', 'LowSet3_Roughness.png',
     'LowSet3_Normal_OpenGL.png')
wire('Robe', 'robe_vcolor.jpg', normal='robe_normals.png', rough_value=0.85)
wire('Robe2', 'fabric13_basecolor.jpg', roughness='fabric13_roughnessf.jpg',
     invert_rough=(opt('rough2', 'invert') == 'invert'))
glow = [g for g in glow if g]


# ---- pivots: everything sways from the feet, the helmet turns from the neck ----
def bounds(obj):
    pts = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


all_lo = Vector((1e9, 1e9, 1e9))
all_hi = Vector((-1e9, -1e9, -1e9))
for o in meshes:
    lo, hi = bounds(o)
    all_lo = Vector((min(all_lo.x, lo.x), min(all_lo.y, lo.y), min(all_lo.z, lo.z)))
    all_hi = Vector((max(all_hi.x, hi.x), max(all_hi.y, hi.y), max(all_hi.z, hi.z)))
feet = Vector(((all_lo.x + all_hi.x) / 2, (all_lo.y + all_hi.y) / 2, all_lo.z))

sway = bpy.data.objects.new('sway', None)
sway.location = feet
scene.collection.objects.link(sway)
head = bpy.data.objects.new('head', None)
scene.collection.objects.link(head)
bpy.context.view_layer.update()

head_parts = []
for o in meshes:
    lo, hi = bounds(o)
    if o.name != 'RobePose2M' and (lo.z + hi.z) / 2 > 1.74:
        head_parts.append(o)
if head_parts:
    xs = [(bounds(o)[0].x + bounds(o)[1].x) / 2 for o in head_parts]
    ys = [(bounds(o)[0].y + bounds(o)[1].y) / 2 for o in head_parts]
    head.location = (sum(xs) / len(xs), sum(ys) / len(ys), 1.72)
print('HEAD PARTS:', [o.name for o in head_parts])
print('HEAD PIVOT:', tuple(round(v, 3) for v in head.location))
bpy.context.view_layer.update()


def adopt(child, parent):
    world = child.matrix_world.copy()
    child.parent = parent
    child.matrix_world = world


adopt(head, sway)
bpy.context.view_layer.update()
for o in meshes:
    adopt(o, head if o in head_parts else sway)

# ---- a faint ripple in the hem of the robe, moved by sliding the wave's origin ----
ripple = None
robe = bpy.data.objects.get('RobePose2M')
if robe:
    group = robe.vertex_groups.new(name='hem')
    for v in robe.data.vertices:
        z = (robe.matrix_world @ v.co).z
        weight = max(0.0, min(1.0, (1.1 - z) / 0.6))
        if weight > 0:
            group.add([v.index], weight, 'REPLACE')
    ripple = robe.modifiers.new('ripple', 'WAVE')
    ripple.use_x = True
    ripple.use_y = True
    ripple.use_normal = True
    ripple.height = 0.006
    ripple.width = 0.5
    ripple.narrowness = 1.5
    ripple.speed = 0.0
    ripple.vertex_group = 'hem'

# ---- lights, camera, world ----
target = bpy.data.objects.new('target', None)
target.location = (0.0, 0.0, 1.5)
scene.collection.objects.link(target)


def track(obj):
    c = obj.constraints.new('TRACK_TO')
    c.target = target
    c.track_axis = 'TRACK_NEGATIVE_Z'
    c.up_axis = 'UP_Y'


def area(name, loc, color, energy, size):
    data = bpy.data.lights.new(name, 'AREA')
    data.color = color
    data.energy = energy
    data.size = size
    obj = bpy.data.objects.new(name, data)
    obj.location = loc
    scene.collection.objects.link(obj)
    track(obj)


area('key', (-3.0, -4.0, 3.4), (1.0, 0.97, 0.92), 200, 2.5)
area('fill', (3.5, -3.0, 1.6), (0.55, 0.7, 1.0), 45, 3.0)
area('rim_r', (3.2, 3.4, 2.6), (1.0, 0.92, 0.1), 320, 1.5)
area('rim_l', (-3.2, 3.0, 2.2), (1.0, 0.92, 0.1), 200, 1.5)

VIEW_H, DIST, BASE_YAW = 1.5, 6.0, math.radians(12)
cam_data = bpy.data.cameras.new('cam')
cam_data.sensor_fit = 'VERTICAL'
cam_data.sensor_height = 36.0
cam_data.lens = 36.0 * DIST / VIEW_H
cam = bpy.data.objects.new('cam', cam_data)
scene.collection.objects.link(cam)
scene.camera = cam
track(cam)

world = bpy.data.worlds.new('world')
scene.world = world
world.use_nodes = True
wn = world.node_tree
wn.nodes.clear()
coord = wn.nodes.new('ShaderNodeTexCoord')
split = wn.nodes.new('ShaderNodeSeparateXYZ')
ramp = wn.nodes.new('ShaderNodeValToRGB')
path = wn.nodes.new('ShaderNodeLightPath')
mix = wn.nodes.new('ShaderNodeMixRGB')
bg = wn.nodes.new('ShaderNodeBackground')
wout = wn.nodes.new('ShaderNodeOutputWorld')
ramp.color_ramp.elements[0].color = (0.9, 0.8, 0.12, 1)
ramp.color_ramp.elements[0].position = 0.0
ramp.color_ramp.elements[1].color = (0.02, 0.02, 0.018, 1)
ramp.color_ramp.elements[1].position = 0.55
mix.inputs[2].default_value = (0.035, 0.035, 0.03, 1)
wn.links.new(coord.outputs['Generated'], split.inputs[0])
wn.links.new(split.outputs['Z'], ramp.inputs[0])
wn.links.new(path.outputs['Is Camera Ray'], mix.inputs[0])
wn.links.new(ramp.outputs['Color'], mix.inputs[1])
wn.links.new(mix.outputs['Color'], bg.inputs['Color'])
wn.links.new(bg.outputs['Background'], wout.inputs[0])
bg.inputs['Strength'].default_value = 0.3

r = scene.render
r.engine = ENGINE
r.resolution_x, r.resolution_y, r.resolution_percentage = WIDTH, HEIGHT, 100
r.film_transparent = True
r.image_settings.file_format = 'PNG'
r.image_settings.color_mode = 'RGBA'
r.image_settings.color_depth = '8'
scene.view_settings.view_transform = 'Standard'
if ENGINE == 'CYCLES':
    scene.cycles.samples = SAMPLES
    scene.cycles.use_denoising = True
else:
    ev = scene.eevee
    ev.taa_render_samples = SAMPLES
    ev.use_ssr = True
    ev.use_gtao = True
    ev.use_soft_shadows = True
    ev.use_bloom = True
    ev.bloom_threshold = 0.8
    ev.bloom_intensity = 0.08
    ev.bloom_radius = 5.0


def pose(frame):
    u = frame / max(1, FRAMES - 1)

    def s(k):
        return -math.cos(k * math.pi * u)

    sway.rotation_euler = (math.radians(0.3 * s(1)), math.radians(0.8 * s(1)), 0.0)
    sway.scale = (1.0, 1.0, 1.0 + 0.004 * s(2))
    head.rotation_euler = (math.radians(0.8 * s(2)), 0.0, math.radians(-3.0 * s(1)))
    yaw = BASE_YAW + math.radians(3.5 * s(1))
    cam.location = target.location + Vector((math.sin(yaw) * DIST, -math.cos(yaw) * DIST, 0.0))
    pulse = (s(2) + 1.0) / 2.0
    for bsdf, base in glow:
        bsdf.inputs['Emission Strength'].default_value = base * (0.55 + 0.9 * pulse)
    if ripple:
        ripple.start_position_x = 0.8 * s(1)
        ripple.start_position_y = 0.5 * s(2)
    bpy.context.view_layer.update()


frames = ONLY if ONLY else range(FRAMES)
for f in frames:
    pose(f)
    name = f'preview-{f:02d}.png' if ONLY else f'frame-{f:03d}.png'
    r.filepath = os.path.join(OUT, name)
    bpy.ops.render.render(write_still=True)
    print('RENDERED', r.filepath)

if not ONLY:
    meta = {'width': WIDTH, 'height': HEIGHT, 'frames': FRAMES, 'fps': FPS, 'density': DENSITY,
            'clip': 'procedural-idle'}
    with open(os.path.join(OUT, 'meta.json'), 'w') as fh:
        json.dump(meta, fh)
    print('WROTE', os.path.join(OUT, 'meta.json'))
