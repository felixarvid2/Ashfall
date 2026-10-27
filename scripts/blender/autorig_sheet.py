"""Contact sheet of a rigged, animated GLB: the rest pose and frames of its clips (docs/blender.md, "Rigging without Meshy").

Run by `npm run blender:autorig -- --sheet <id>` (autorig.ts decodes the shipped GLB first: Blender 4.0 reads neither meshopt, WebP nor
quantized skinned meshes):

    blender -b --factory-startup -P scripts/blender/autorig_sheet.py -- --job <job.json>

Tiles: rest pose from the front and the side, idle, walk at two phases, the attack at its peak (the frame where a hand is furthest
from the hips), the death clip's last frame and the game camera on the idle. Workbench, flat texture.
"""
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
import lib  # noqa: E402
from mathutils import Vector  # noqa: E402


def clip_action(name):
    """The imported action of a clip (the importer may suffix it with the armature's name)."""
    for a in bpy.data.actions:
        if a.name == name or a.name.startswith(name + "_") or a.name.startswith(name + "|"):
            return a
    raise RuntimeError(f"no action {name} in {[a.name for a in bpy.data.actions]}")


def pose_at(arm, action, frame):
    if arm.animation_data is None:
        arm.animation_data_create()
    arm.animation_data.action = action
    bpy.context.scene.frame_set(int(round(frame)))
    bpy.context.view_layer.update()


def reset_pose(arm):
    arm.animation_data_clear()
    for pb in arm.pose.bones:
        pb.location = (0, 0, 0)
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.rotation_euler = (0, 0, 0)
        pb.scale = (1, 1, 1)
    bpy.context.view_layer.update()


def peak_frame(arm, action):
    """The frame where a hand is furthest from the hips (the strike or the cast at its peak)."""
    f0, f1 = (int(round(x)) for x in action.frame_range)
    best, best_f = -1.0, f0
    for f in range(f0, f1 + 1, 2):
        pose_at(arm, action, f)
        hips = arm.matrix_world @ arm.pose.bones["Hips"].head
        d = max(((arm.matrix_world @ arm.pose.bones[h].head) - hips).length for h in ("LeftHand", "RightHand"))
        if d > best:
            best, best_f = d, f
    return best_f


def world_points(mesh):
    """The deformed mesh's vertices in world space, Blender axes (n, 3)."""
    import numpy as np

    dg = bpy.context.evaluated_depsgraph_get()
    ev = mesh.evaluated_get(dg)
    me = ev.to_mesh()
    co = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get("co", co)
    m = np.array(ev.matrix_world)
    out = co.reshape(-1, 3) @ m[:3, :3].T + m[:3, 3]
    ev.to_mesh_clear()
    return out


def lowest_point(mesh):
    """Height of the lowest vertex of the deformed mesh (metres above the ground plane)."""
    return float(world_points(mesh)[:, 2].min())


def feet_report(arm, mesh, states):
    """The lowest point of the model over each clip: feet planted give about 0, feet through the floor a negative number, a floating
    model a high one. Printed as `feet <clip>: lowest <min> .. <max over frames> m`."""
    for state in states:
        action = clip_action(state)
        f0, f1 = (int(round(x)) for x in action.frame_range)
        lows = []
        for f in range(f0, f1 + 1, 2):
            pose_at(arm, action, f)
            lows.append(lowest_point(mesh))
        print(f"feet {state}: lowest {min(lows):+.3f} .. {max(lows):+.3f} m")


def main():
    args = lib.script_args()
    job = json.load(open(args[args.index("--job") + 1]))
    lib.clean_scene()
    bpy.ops.import_scene.gltf(filepath=job["glb"])
    arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    # the importer adds an "Icosphere" as the bones' display shape: the model is the mesh with the armature modifier
    mesh = next(o for o in bpy.data.objects if o.type == "MESH" and any(m.type == "ARMATURE" for m in o.modifiers))
    for o in list(bpy.data.objects):
        if o is not arm and o is not mesh:
            bpy.data.objects.remove(o)
    # the importer ends with the last action active; the actions stay in bpy.data.actions
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            continue
        bsdf = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if bsdf and not bsdf.inputs["Base Color"].links:
            mat.diffuse_color = bsdf.inputs["Base Color"].default_value
    lib.add_sun()
    lib.add_ground(30.0, "#9aa0aa")
    height = job.get("height", 1.9)
    target = (0, height * 0.52, 0)
    dist = height * 2.05
    tiles = []

    def shoot(label, pitch, yaw, fit=False):
        """`fit` frames the whole deformed mesh (a lying body is wider than tall)."""
        if fit:
            pts = world_points(mesh)
            lo, hi = pts.min(0), pts.max(0)
            c = (lo + hi) / 2
            lib.iso_camera(target=(c[0], c[2], -c[1]), distance=float((hi - lo).max()) * 2.4, pitch=pitch, yaw=yaw, name=label)
        else:
            lib.iso_camera(target=target, distance=dist, pitch=pitch, yaw=yaw, name=label)
        path = os.path.join(job["out_dir"], f"{job['id']}-{len(tiles):02d}-{label}.png")
        lib.render_workbench(path, (420, 520))
        tiles.append(path)

    feet_report(arm, mesh, job.get("states", ["idle", "walk", "attack", "hit", "death"]))
    reset_pose(arm)
    shoot("rest-front", 6, 0)
    shoot("rest-side", 6, 90)
    idle = clip_action("idle")
    pose_at(arm, idle, (idle.frame_range[0] + idle.frame_range[1]) / 2)
    shoot("idle", 10, 30)
    walk = clip_action("walk")
    w0, w1 = walk.frame_range
    pose_at(arm, walk, w0 + 0.25 * (w1 - w0))
    shoot("walk-a", 6, 90)
    pose_at(arm, walk, w0 + 0.75 * (w1 - w0))
    shoot("walk-b", 6, 90)
    atk = clip_action("attack")
    pose_at(arm, atk, peak_frame(arm, atk))
    shoot("attack-peak", 10, 30)
    death = clip_action("death")
    pose_at(arm, death, death.frame_range[1])
    shoot("death-end", 30, 30, fit=True)
    pose_at(arm, idle, idle.frame_range[0] + 5)
    shoot("game", 55, 45)
    out = lib.tile_images(tiles, job["out"], 4)
    print("contact sheet:", out)


main()
