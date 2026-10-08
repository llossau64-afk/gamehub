"""Shrink downloaded CC-licensed glTF samples for the game (textures -> 512 px WEBP).

    python tools/blender/import_assets.py <download dir> assets/models

Sources (KhronosGroup/glTF-Sample-Assets, see assets/thirdparty/CREDITS.md):
  CommercialRefrigerator, AnisotropyBarnLamp
"""
import os
import sys
import bpy

sys.path.insert(0, os.path.dirname(__file__))
from common import reset_scene

SRC, OUT = sys.argv[-2], sys.argv[-1]
ITEMS = {'CommercialRefrigerator': 'fridge', 'AnisotropyBarnLamp': 'barnlamp'}
reset_scene()
roots = []
for src, name in ITEMS.items():
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(SRC, src + '.glb'))
    new = [o for o in bpy.data.objects if o not in before]
    root = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(root)
    for o in new:
        if o.parent is None:
            o.parent = root
    # normalise: put the base on the ground, centred
    bpy.context.view_layer.update()
    mins = [1e9] * 3; maxs = [-1e9] * 3
    for o in new:
        if o.type != 'MESH':
            continue
        for v in o.bound_box:
            w = o.matrix_world @ __import__('mathutils').Vector(v)
            for k in range(3):
                mins[k] = min(mins[k], w[k]); maxs[k] = max(maxs[k], w[k])
    print(name, 'size', [round(maxs[k] - mins[k], 3) for k in range(3)])
    root.location = (-(mins[0] + maxs[0]) / 2, -(mins[1] + maxs[1]) / 2, -mins[2])
    roots.append(root)
# decimate very dense meshes (the fridge's bottles are 112k vertices)
for o in list(bpy.data.objects):
    if o.type == 'MESH' and len(o.data.vertices) > 8000:
        m = o.modifiers.new('dec', 'DECIMATE')
        m.ratio = 6000 / len(o.data.vertices)
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.modifier_apply(modifier=m.name)
        print('decimated', o.name, len(o.data.vertices))
for img in bpy.data.images:
    if img.size[0] > 384:
        img.scale(384, max(1, int(384 * img.size[1] / img.size[0])))
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'props3p.glb'), export_format='GLB', use_selection=True, export_apply=True,
                          export_image_format='WEBP', export_image_quality=80, export_yup=True)
print('wrote', os.path.getsize(os.path.join(OUT, 'props3p.glb')) // 1024, 'KB')
