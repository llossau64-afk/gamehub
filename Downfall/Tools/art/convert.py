# GLB -> FBX (one FBX per top-level glTF node). Run with the Blender python module:
#   bvenv/bin/python convert.py
# Axis: glTF (x,y,z) -> Blender (x,-z,y) -> FBX(-Z fwd, Y up, Apply Transform) -> Unity (-x,y,z),
# i.e. the same mirror-x convention Unity's glTF importers use; cars face Unity +z.
import bpy, json, os, sys
SRC = '/home/user/gamehub/OneRoadDown/assets/models'
ART = '/home/user/gamehub/Downfall/Assets/Downfall/Art'
HERE = os.path.dirname(os.path.abspath(__file__))
info = json.load(open(os.path.join(HERE, 'matinfo.json')))
CAT = {'nature': 'Nature', 'buildings': 'Buildings', 'cars': 'Cars', 'animals': 'Animals', 'fox': 'Animals', 'garage': 'Garage', 'props3p': 'Props3p'}
only = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else list(CAT)
report = []

def role_of(node):
    seen = set()
    stack = [(l.to_node, l.to_socket) for o in node.outputs for l in o.links]
    while stack:
        n, s = stack.pop()
        if n in seen: continue
        seen.add(n)
        if n.type == 'BSDF_PRINCIPLED':
            nm = s.name
            if nm in ('Base Color', 'Alpha'): return 'base'
            if nm in ('Metallic', 'Roughness'): return 'mr'
            if nm.startswith('Emission'): return 'emissive'
            if nm == 'Normal': return 'normal'
            return None
        if n.type == 'NORMAL_MAP': return 'normal'
        if n.type == 'GROUP' and 'Occlusion' in (n.node_tree.name if n.node_tree else ''): return 'occlusion'
        for o in n.outputs:
            for l in o.links: stack.append((l.to_node, l.to_socket))
    return None

for f in only:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=f'{SRC}/{f}.glb')
    mi = {m['name']: m for m in info[f]['materials']}
    texdir = f'{ART}/Textures/{f}'
    # point images at the extracted PNGs so the FBX references them (relative paths)
    for mat in bpy.data.materials:
        if not mat.node_tree: continue
        for n in mat.node_tree.nodes:
            if n.type == 'TEX_IMAGE' and n.image:
                r = role_of(n)
                t = mi.get(mat.name, {}).get('tex', {}).get(r)
                if t:
                    n.image.filepath = f'{texdir}/{t}.png'
                    n.image.name = t
    cat = CAT[f]
    outdir = f'{ART}/Models/{cat}'
    os.makedirs(outdir, exist_ok=True)
    roots = [o for o in bpy.context.scene.objects if o.parent is None]
    for r in roots:
        if f == 'fox' and r.name == 'Icosphere':
            continue  # stray untextured helper sphere in the sample file
        anim = (f == 'fox')
        if not anim:
            for o in [r] + list(r.children_recursive):
                o.animation_data_clear()
        loc = r.location.copy()
        r.location = (0, 0, 0)  # JS cloneAsset()/register() put each root at the origin
        bpy.ops.object.select_all(action='DESELECT')
        for o in [r] + list(r.children_recursive):
            o.select_set(True)
        name = ('car_' + r.name) if f == 'cars' else ('fox' if f == 'fox' else r.name)
        path = f'{outdir}/{name}.fbx'
        bpy.ops.export_scene.fbx(
            filepath=path, use_selection=True, object_types={'EMPTY', 'MESH', 'ARMATURE'},
            global_scale=1.0, apply_unit_scale=True, apply_scale_options='FBX_SCALE_ALL',
            axis_forward='-Z', axis_up='Y', bake_space_transform=not anim,
            use_mesh_modifiers=True, mesh_smooth_type='OFF', use_tspace=False, use_custom_props=False,
            add_leaf_bones=False, primary_bone_axis='Y', secondary_bone_axis='X', armature_nodetype='NULL',
            bake_anim=anim, bake_anim_use_all_bones=True, bake_anim_use_nla_strips=False, bake_anim_use_all_actions=anim,
            bake_anim_force_startend_keying=True, bake_anim_step=1.0, bake_anim_simplify_factor=0.0,
            path_mode='RELATIVE', embed_textures=False, batch_mode='OFF')
        r.location = loc
        mats = sorted({s.material.name for o in [r] + list(r.children_recursive) if o.type == 'MESH' for s in o.material_slots if s.material})
        nodes = [o.name for o in r.children_recursive]
        report.append({'glb': f, 'category': cat, 'name': 'fox' if f == 'fox' else r.name, 'file': f'Models/{cat}/{name}.fbx', 'materials': mats, 'nodes': nodes,
                       'empties': [o.name for o in r.children_recursive if o.type == 'EMPTY'],
                       'size': os.path.getsize(path), 'actions': [a.name for a in bpy.data.actions] if anim else []})
        print('exported', path, os.path.getsize(path))
rp = os.path.join(HERE, 'models_report.json')
old = json.load(open(rp)) if os.path.exists(rp) and only != list(CAT) else []
old = [x for x in old if x['glb'] not in only] + report
json.dump(old, open(rp, 'w'), indent=1)
