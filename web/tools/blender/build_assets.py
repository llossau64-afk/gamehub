"""Build every Blender asset of Barber Empire and export GLB files.

    python tools/blender/build_assets.py            (needs `pip install bpy`)

Outputs to assets-src/ (raw). `npm run pack` compresses them into public/assets/.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import geo  # noqa: E402
import characters  # noqa: E402
import props  # noqa: E402

OUT = os.path.normpath(os.path.join(HERE, '..', '..', 'assets-src'))


def main():
    os.makedirs(OUT, exist_ok=True)
    only = sys.argv[1] if len(sys.argv) > 1 else None

    if only in (None, 'characters'):
        geo.reset()
        root = characters.build_person()
        geo.export(os.path.join(OUT, 'characters.glb'), [root])
        print('characters.glb written')

    if only in (None, 'props'):
        geo.reset()
        roots = props.build_all()
        geo.export(os.path.join(OUT, 'props.glb'), roots)
        print('props.glb written (%d props)' % len(roots))


if __name__ == '__main__':
    main()
