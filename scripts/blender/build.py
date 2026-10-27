"""Build the GLBs of scripts/blender/spec.json. Run by `npm run blender:build` (scripts/blender/build.ts), or by hand:

    blender -b --factory-startup -P scripts/blender/build.py -- --spec scripts/blender/spec.json --out assets/source [--only part.crystal_shard]

Each entry becomes <out>/<id>/refined.glb (the file name the repo's optimizer reads) and <out>/blender-report.json says
what was built: triangle counts, bounds in glTF axes (Y up) and the materials used.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
import builders  # noqa: E402
import lib  # noqa: E402


def arg(name, default=None):
    args = lib.script_args()
    return args[args.index(name) + 1] if name in args else default


def build_entry(entry, out_dir):
    lib.clean_scene()
    objs = builders.BUILDERS[entry["builder"]](**entry.get("params", {}))
    obj = objs[0] if len(objs) == 1 else lib.join(objs, entry["id"])
    obj.name = entry["id"]
    lib.apply_transforms(obj)
    tris = lib.triangle_count([obj])
    lo, hi = lib.bounds([obj])
    target = entry.get("targetPolycount")
    if target and tris > target:
        raise SystemExit(f"{entry['id']}: {tris} triangles, over its targetPolycount {target}")
    path = os.path.join(out_dir, entry["id"], "refined.glb")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    lib.export_glb([obj], path)
    # Blender (x, y, z up) -> glTF (x, z, -y).
    return {
        "id": entry["id"],
        "file": path,
        "triangles": tris,
        "boundsMin": [round(lo.x, 4), round(lo.z, 4), round(-hi.y, 4)],
        "boundsMax": [round(hi.x, 4), round(hi.z, 4), round(-lo.y, 4)],
        "materials": [m.name for m in obj.data.materials],
    }


def main():
    spec = json.load(open(arg("--spec")))
    out_dir = os.path.abspath(arg("--out", "assets/source"))
    only = set(lib.script_args()[lib.script_args().index("--only") + 1:]) if "--only" in lib.script_args() else None
    report = []
    for entry in spec["parts"] + spec.get("models", []):
        if only and entry["id"] not in only:
            continue
        report.append(build_entry(entry, out_dir))
        print(f"built {report[-1]['id']}: {report[-1]['triangles']} triangles")
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, "blender-report.json"), "w") as f:
        json.dump(report, f, indent=2)


main()
