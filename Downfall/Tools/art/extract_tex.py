# Extracts GLB textures to PNG (Art/Textures/<glb>/), converts glTF metallicRoughness to Unity
# metallic(R)/smoothness(A) maps and writes matinfo.json describing every GLB material.
import json, struct, sys, os, io
from PIL import Image
SRC = '/home/user/gamehub/OneRoadDown/assets/models'
ART = '/home/user/gamehub/Downfall/Assets/Downfall/Art/Textures'
FILES = ['nature', 'buildings', 'cars', 'animals', 'fox', 'garage', 'props3p']
def glb(path):
    b = open(path, 'rb').read()
    off = 12; js = None; bin_ = None
    while off < len(b):
        ln, typ = struct.unpack('<II', b[off:off+8]); data = b[off+8:off+8+ln]
        if typ == 0x4E4F534A: js = json.loads(data)
        else: bin_ = data
        off += 8 + ln
    return js, bin_
info = {}
for f in FILES:
    j, bn = glb(f'{SRC}/{f}.glb')
    imgs = j.get('images', []); texs = j.get('textures', [])
    def img_of(ti):
        t = texs[ti]
        src = t.get('source')
        ext = t.get('extensions', {})
        if 'EXT_texture_webp' in ext: src = ext['EXT_texture_webp']['source']
        return src
    # role usage per image
    uses = {}
    mats = []
    for m in j.get('materials', []):
        p = m.get('pbrMetallicRoughness', {})
        ent = {'name': m['name'], 'baseColor': p.get('baseColorFactor', [1, 1, 1, 1]), 'metallic': p.get('metallicFactor', 1.0),
               'roughness': p.get('roughnessFactor', 1.0), 'emissive': m.get('emissiveFactor', [0, 0, 0]),
               'emissiveStrength': m.get('extensions', {}).get('KHR_materials_emissive_strength', {}).get('emissiveStrength', 1.0),
               'alphaMode': m.get('alphaMode', 'OPAQUE'), 'alphaCutoff': m.get('alphaCutoff', 0.5), 'doubleSided': bool(m.get('doubleSided')),
               'transmission': m.get('extensions', {}).get('KHR_materials_transmission', {}).get('transmissionFactor', 0), 'tex': {}}
        for role, key in [('base', p.get('baseColorTexture')), ('mr', p.get('metallicRoughnessTexture')), ('normal', m.get('normalTexture')),
                          ('emissive', m.get('emissiveTexture')), ('occlusion', m.get('occlusionTexture'))]:
            if key is None: continue
            ii = img_of(key['index'])
            uses.setdefault(ii, []).append((m['name'], role))
            ent['tex'][role] = ii
        mats.append(ent)
    names = {}
    counts = {}
    for i, im in enumerate(imgs): counts[im.get('name')] = counts.get(im.get('name'), 0) + 1
    out = f'{ART}/{f}'
    if imgs: os.makedirs(out, exist_ok=True)
    for i, im in enumerate(imgs):
        nm = im.get('name')
        u = uses.get(i, [])
        if not nm or counts[nm] > 1 or f in ('props3p', 'fox'):
            nm = (u[0][0].replace(' ', '') + '_' + u[0][1]) if u else f'{f}_img{i}'
        bv = j['bufferViews'][im['bufferView']]
        data = bn[bv.get('byteOffset', 0): bv.get('byteOffset', 0) + bv['byteLength']]
        pil = Image.open(io.BytesIO(data))
        pil.load()
        roles = {r for _, r in u}
        pil.save(f'{out}/{nm}.png', optimize=True)
        names[i] = nm
        if 'mr' in roles:
            rgb = pil.convert('RGB')
            r, g, b = rgb.split()
            sm = g.point(lambda v: 255 - v)
            Image.merge('RGBA', (b, b, b, sm)).save(f'{out}/{nm}_ms.png', optimize=True)
        print(f, i, nm, pil.size, pil.mode, sorted(roles))
    for m in mats:
        m['tex'] = {r: names[i] for r, i in m['tex'].items()}
    info[f] = {'materials': mats, 'images': names}
json.dump(info, open('matinfo.json', 'w'), indent=1)
