"""Contact sheet of a runtime variant (src/data/variants.ts): the base model with its parts placed on its joints.

Run by `npm run blender:build -- --sheet variant.<name>` (scripts/blender/build.ts decodes the shipped GLBs first, because
Blender 4.0 reads neither meshopt nor WebP):

    blender -b --factory-startup -P scripts/blender/sheet.py -- --job <job.json> --out <dir> [--glow]

The placement is the one the game uses (AssetLibrary attachVariantParts): the part's origin sits at the joint's default-pose
position plus `position`, measured along the model's axes (x left, y up, z forward), rotated by `rotation` (Euler XYZ, deg).
Blender and the game agree because both start from the joint's position, not from the bone's own (rolled) axes.
"""
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
import lib  # noqa: E402
from mathutils import Euler, Matrix, Vector  # noqa: E402

# game axes (x, y up, z forward) -> Blender (x, -z, y)
C = Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0))).to_4x4()
VIEWS = [  # name, pitch, yaw, distance, target height
    ("game", 55, 45, 4.6, 0.9),
    ("front", 8, 0, 4.4, 1.0),
    ("back", 8, 180, 4.4, 1.0),
    ("left", 8, 90, 4.4, 1.0),
    ("back-high", 30, 205, 3.4, 1.15),
    ("head", 12, 25, 1.7, 1.55),
]


def import_glb(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]


def default_pose(objs):
    """The importer plays the first animation frame (the idle pose); the game attaches parts in the glTF's default
    pose (a T-pose for Meshy rigs), so drop the animation and zero the pose to show that one."""
    for o in objs:
        if o.animation_data:
            o.animation_data_clear()
        if o.type == "ARMATURE":
            for pb in o.pose.bones:
                pb.location = (0, 0, 0)
                pb.rotation_quaternion = (1, 0, 0, 0)
                pb.rotation_euler = (0, 0, 0)
                pb.scale = (1, 1, 1)


def fix_viewport_colours():
    """Workbench draws a material's viewport colour: take it from the base colour where there is no texture."""
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            continue
        bsdf = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if bsdf and not bsdf.inputs["Base Color"].links:
            mat.diffuse_color = bsdf.inputs["Base Color"].default_value


def place(parts, joints):
    """Parent each part's imported objects to an empty put where the game would put it.

    `joints` are the joints' positions in the model's axes in the default pose (build.ts reads them from the glTF nodes,
    as the game reads them from the cloned bones), not Blender's bones: the importer may lay those out differently.
    """
    for i, p in enumerate(parts):
        objs = import_glb(p["file"])
        joint_game = Vector(joints.get(p.get("bone"), (0, 0, 0)))
        off = Vector(p.get("position") or (0, 0, 0))
        rot = Euler([math.radians(a) for a in (p.get("rotation") or (0, 0, 0))], "XYZ").to_matrix().to_4x4()
        s = p.get("scale", 1)
        s = (s, s, s) if isinstance(s, (int, float)) else s
        scale = Matrix.Diagonal((s[0], s[1], s[2], 1))
        # offset and rotation in game axes -> Blender
        world = Matrix.Translation(C.to_3x3() @ (joint_game + off)) @ (C @ rot @ C.inverted()) @ scale
        root = bpy.data.objects.new(f"part{i}", None)
        bpy.context.scene.collection.objects.link(root)
        for o in objs:
            if o.parent is None:
                o.parent = root
        root.matrix_world = world


def main():
    args = lib.script_args()
    job = json.load(open(args[args.index("--job") + 1]))
    out = args[args.index("--out") + 1]
    os.makedirs(out, exist_ok=True)
    lib.clean_scene()
    default_pose(import_glb(job["base"]))
    place(job["parts"], job["joints"])
    fix_viewport_colours()
    lib.add_sun()
    lib.add_ground(30.0)
    shots = []
    for name, pitch, yaw, dist, h in VIEWS:
        lib.iso_camera(target=(0, h, 0), distance=dist, pitch=pitch, yaw=yaw, name=name)
        path = os.path.join(out, f"{job['id']}-{name}.png")
        lib.render_workbench(path, (480, 480))
        shots.append(path)
    sheet = lib.tile_images(shots, os.path.join(out, f"{job['id']}-sheet.png"), 3)
    print("contact sheet:", sheet)
    if "--glow" in args:
        lib.iso_camera(target=(0, 0.95, 0), distance=4.2)
        still = os.path.join(out, f"{job['id']}-cycles.png")
        lib.render_cycles(still, (720, 720), 24)
        print("cycles still:", still)


main()
