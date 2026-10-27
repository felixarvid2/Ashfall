"""Rig and animate a textured, unrigged Meshy model for free, with a donor's skeleton and clips (docs/blender.md, "Rigging without Meshy").

Run by `npm run blender:autorig` (scripts/blender/autorig.ts decodes the GLBs first, because Blender 4.0 reads neither meshopt, WebP nor
quantized meshes, and optimizes the result afterwards):

    blender -b --factory-startup --python-exit-code 1 -P scripts/blender/autorig.py -- --job <job.json>

Every Meshy-rigged model of the game shares one 24-joint biped skeleton (Hips ... RightToeBase, centimetres under an Armature node
scaled 0.01) and clip names. The donor GLB (a shipped rigged model with the wanted clips) supplies the clips; this script

 1. normalises the target: metres, height = `height`, feet on y = 0 centred between the feet, facing +z like the donor;
 2. finds the landmarks from the mesh (feet, ankle, shoulder width, arm axis ... by cross-sections of surface samples), starting from
    the donor's proportions; `hints` in the job override any joint (`joints`) or a few measures;
 3. builds the donor's skeleton (same names, same hierarchy, centimetres, Armature scale 0.01) through those landmarks;
 4. retargets the clips by *world orientation*: the donor's glTF clips set absolute local rotations, so every bone has a world
    orientation Ra(t) that does not depend on the rest pose. The target bone gets exactly that orientation, which makes the posed
    skeleton the donor's, whatever the target's rest pose is (a T-pose or an A-pose). The skin follows because the target's
    bind-to-pose rotation is S_target(t) = Ra(t) Rbind_target^-1 (Rbind_target = D Rbind_donor, D the shortest arc from the donor's
    bone direction to the target's), so an A-pose arm is first swung up to the T-pose and then animated;
 5. skins with automatic weights (bone heat) on a voxel-remeshed proxy when the mesh is non-manifold (it always is), transfers the
    weights to the real mesh (nearest face, interpolated), pins loose parts (rifle, shield, censer ...) to one bone, limits to four
    influences and normalises;
 6. exports the GLB (skin, materials, one animation per clip named as the manifest's `rig.actions` states).

The job (JSON): id, mesh, donor, out, height, clips {state: donor clip}, hints {}, debug (folder for a landmark picture, optional).
"""
import json
import math
import os
import struct
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
import bmesh  # noqa: E402
import numpy as np  # noqa: E402
import lib  # noqa: E402
from mathutils import Matrix, Quaternion, Vector  # noqa: E402
from mathutils.bvhtree import BVHTree  # noqa: E402

# Joint -> parent, in an order where parents come first. The donor's skeleton (`RIG_JOINTS` in src/data/variants.ts).
JOINTS = [
    ("Hips", None), ("Spine02", "Hips"), ("Spine01", "Spine02"), ("Spine", "Spine01"), ("neck", "Spine"), ("Head", "neck"),
    ("head_end", "Head"), ("headfront", "Head"),
    ("LeftShoulder", "Spine"), ("LeftArm", "LeftShoulder"), ("LeftForeArm", "LeftArm"), ("LeftHand", "LeftForeArm"),
    ("RightShoulder", "Spine"), ("RightArm", "RightShoulder"), ("RightForeArm", "RightArm"), ("RightHand", "RightForeArm"),
    ("LeftUpLeg", "Hips"), ("LeftLeg", "LeftUpLeg"), ("LeftFoot", "LeftLeg"), ("LeftToeBase", "LeftFoot"),
    ("RightUpLeg", "Hips"), ("RightLeg", "RightUpLeg"), ("RightFoot", "RightLeg"), ("RightToeBase", "RightFoot"),
]
PARENT = dict(JOINTS)
NAMES = [n for n, _ in JOINTS]
# The child that gives a bone its direction (its tail); leaves have none and point along the parent / a fixed way.
MAIN_CHILD = {
    "Hips": "Spine02", "Spine02": "Spine01", "Spine01": "Spine", "Spine": "neck", "neck": "Head", "Head": "head_end",
    "LeftShoulder": "LeftArm", "LeftArm": "LeftForeArm", "LeftForeArm": "LeftHand",
    "RightShoulder": "RightArm", "RightArm": "RightForeArm", "RightForeArm": "RightHand",
    "LeftUpLeg": "LeftLeg", "LeftLeg": "LeftFoot", "LeftFoot": "LeftToeBase",
    "RightUpLeg": "RightLeg", "RightLeg": "RightFoot", "RightFoot": "RightToeBase",
}
# Leaf bones take the bone-direction change of this bone (they are too short to have their own).
LEAF_OF = {"LeftHand": "LeftForeArm", "RightHand": "RightForeArm", "head_end": "Head", "headfront": "Head",
           "LeftToeBase": "LeftFoot", "RightToeBase": "RightFoot"}
FPS = 30  # the donor's clips are sampled at 30 Hz

# game axes (x = the creature's left, y up, z forward) -> Blender (x, -z, y)
C = np.array([[1, 0, 0], [0, 0, -1], [0, 1, 0]], dtype=float)


# --------------------------------------------------------------------------- the donor (plain glTF parsing, no importer)

CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


def read_glb(path):
    data = open(path, "rb").read()
    jl = struct.unpack("<I", data[12:16])[0]
    j = json.loads(data[20:20 + jl])
    off = 20 + jl
    bl = struct.unpack("<I", data[off:off + 4])[0]
    return j, data[off + 8:off + 8 + bl]


def accessor(j, b, i):
    a = j["accessors"][i]
    bv = j["bufferViews"][a["bufferView"]]
    n, dt = NC[a["type"]], CT[a["componentType"]]
    arr = np.frombuffer(b, dtype=dt, count=a["count"] * n, offset=bv.get("byteOffset", 0) + a.get("byteOffset", 0))
    return arr.reshape(a["count"], n) if n > 1 else arr


def quat_matrix(q):
    x, y, z, w = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def quat_matrices(q):
    """(n, 4) xyzw -> (n, 3, 3)"""
    x, y, z, w = q[:, 0], q[:, 1], q[:, 2], q[:, 3]
    m = np.empty((len(q), 3, 3))
    m[:, 0, 0] = 1 - 2 * (y * y + z * z); m[:, 0, 1] = 2 * (x * y - z * w); m[:, 0, 2] = 2 * (x * z + y * w)
    m[:, 1, 0] = 2 * (x * y + z * w); m[:, 1, 1] = 1 - 2 * (x * x + z * z); m[:, 1, 2] = 2 * (y * z - x * w)
    m[:, 2, 0] = 2 * (x * z - y * w); m[:, 2, 1] = 2 * (y * z + x * w); m[:, 2, 2] = 1 - 2 * (x * x + y * y)
    return m


class Donor:
    """The donor's skeleton and clips straight from the GLB: rest/bind positions and rotations (game axes, metres) and, per clip,
    the world rotation of every joint over time."""

    def __init__(self, path):
        j, b = read_glb(path)
        nodes = j["nodes"]
        parent = {}
        for i, n in enumerate(nodes):
            for c in n.get("children", []):
                parent[c] = i
        by_name = {n["name"]: i for i, n in enumerate(nodes)}
        self.idx = {n: by_name[n] for n in NAMES}

        def world(i):
            chain = []
            k = i
            while k is not None:
                chain.append(k)
                k = parent.get(k)
            m = np.eye(4)
            for k in reversed(chain):
                n = nodes[k]
                t = np.eye(4)
                t[:3, :3] = quat_matrix(n.get("rotation", [0, 0, 0, 1])) * np.array(n.get("scale", [1, 1, 1]))
                t[:3, 3] = n.get("translation", [0, 0, 0])
                m = m @ t
            return m

        skin = j["skins"][0]
        ibm = accessor(j, b, skin["inverseBindMatrices"]).reshape(-1, 4, 4).transpose(0, 2, 1)  # glTF is column-major
        self.pos = {}      # rest position, metres
        self.bind = {}     # bind world rotation (from the inverse bind matrices, what the skin really uses)
        for k, ji in enumerate(skin["joints"]):
            name = nodes[ji]["name"]
            if name not in PARENT:
                continue
            w = np.linalg.inv(ibm[k])
            r = w[:3, :3]
            r = r / np.linalg.norm(r, axis=0)
            self.bind[name] = r
        for n in NAMES:
            self.pos[n] = world(self.idx[n])[:3, 3].copy()
        self.armature_scale = float(nodes[parent_root(parent, self.idx["Hips"])].get("scale", [1])[0])
        # clips
        self.clips = {}
        for a in j["animations"]:
            ch = {}
            for c in a["channels"]:
                name = nodes[c["target"]["node"]]["name"]
                s = a["samplers"][c["sampler"]]
                ch[(name, c["target"]["path"])] = (accessor(j, b, s["input"]), accessor(j, b, s["output"]).astype(float))
            self.clips[a["name"]] = ch
        self.rest_local = {}
        for n in NAMES:
            nd = nodes[self.idx[n]]
            self.rest_local[n] = (np.array(nd.get("translation", [0, 0, 0]), float), np.array(nd.get("rotation", [0, 0, 0, 1]), float))

    def direction(self, name):
        """The donor's rest direction of a bone (game axes, unit)."""
        if name in MAIN_CHILD:
            v = self.pos[MAIN_CHILD[name]] - self.pos[name]
        elif name in LEAF_OF:
            return self.direction(LEAF_OF[name])
        else:
            v = np.array([0, 1.0, 0])
        return v / np.linalg.norm(v)

    def world_rotations(self, clip):
        """{joint: (n, 3, 3)} world rotation per frame on a 30 Hz grid, and the hips translation (n, 3) in metres.

        The shipped donors were resampled per channel, so every track has its own keys: sample them all on one grid."""
        ch = self.clips[clip]
        end = max(t[-1] for t, _ in ch.values())
        n = int(round(end * FPS)) + 1
        grid = np.arange(n) / FPS
        rot = {}
        for name in NAMES:
            key = (name, "rotation")
            if key in ch:
                local = quat_matrices(sample_quat(ch[key][0], ch[key][1], grid))
            else:
                local = np.repeat(quat_matrix(self.rest_local[name][1])[None], n, axis=0)
            parent = PARENT[name]
            rot[name] = local if parent is None else rot[parent] @ local
        t, v = ch[("Hips", "translation")]
        hips = np.stack([np.interp(grid, t, v[:, i]) for i in range(3)], 1) * self.armature_scale
        return rot, hips, grid


def sample_quat(t, q, grid):
    """Normalised lerp of (n, 4) xyzw keys at `grid` times (dense keys: indistinguishable from slerp)."""
    i = np.clip(np.searchsorted(t, grid, side="right") - 1, 0, len(t) - 2) if len(t) > 1 else np.zeros(len(grid), dtype=int)
    if len(t) == 1:
        return np.repeat(q[:1], len(grid), axis=0)
    a = np.clip((grid - t[i]) / np.maximum(t[i + 1] - t[i], 1e-9), 0, 1)[:, None]
    q0, q1 = q[i], q[i + 1]
    q1 = np.where((q0 * q1).sum(1, keepdims=True) < 0, -q1, q1)
    r = q0 * (1 - a) + q1 * a
    return r / np.linalg.norm(r, axis=1, keepdims=True)


def parent_root(parent, i):
    while i in parent:
        i = parent[i]
    return i


# --------------------------------------------------------------------------- the target mesh

def get_points(obj, count=300000, seed=0):
    """Area-weighted samples on the surface, game axes (the mesh is in Blender axes, Z up)."""
    me = obj.data
    me.calc_loop_triangles()
    nv = len(me.vertices)
    co = np.empty(nv * 3)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    tri = np.empty(len(me.loop_triangles) * 3, dtype=np.int64)
    me.loop_triangles.foreach_get("vertices", tri)
    tri = tri.reshape(-1, 3)
    a, b, c = co[tri[:, 0]], co[tri[:, 1]], co[tri[:, 2]]
    area = np.linalg.norm(np.cross(b - a, c - a), axis=1) / 2
    rng = np.random.default_rng(seed)
    pick = rng.choice(len(tri), size=count, p=area / area.sum())
    u, v = rng.random(count), rng.random(count)
    flip = u + v > 1
    u[flip], v[flip] = 1 - u[flip], 1 - v[flip]
    p = a[pick] + (b[pick] - a[pick]) * u[:, None] + (c[pick] - a[pick]) * v[:, None]
    return p @ C  # Blender -> game: x, z, -y  (C is orthogonal: g = C^T b -> row form b @ C)


def normalise(obj, height, hints):
    """Scale to `height`, feet on y = 0, centred between the feet (the Meshy rigs' origin). Bakes the transform into the vertices."""
    me = obj.data
    nv = len(me.vertices)
    co = np.empty(nv * 3)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    g = co @ C  # game axes
    g = g * (height / (g[:, 1].max() - g[:, 1].min()))
    g[:, 1] -= g[:, 1].min()
    feet = g[g[:, 1] < 0.04 * height]
    cx = hints.get("center_x")
    if cx is None:
        cx = (feet[:, 0].min() + feet[:, 0].max()) / 2
    cz = (feet[:, 2].min() + feet[:, 2].max()) / 2
    g[:, 0] -= cx
    g[:, 2] -= cz
    me.vertices.foreach_set("co", (g @ C.T).ravel())
    me.update()
    obj.matrix_world = Matrix.Identity(4)
    obj.location = (0, 0, 0)
    obj.rotation_euler = (0, 0, 0)
    obj.scale = (1, 1, 1)


# --------------------------------------------------------------------------- landmarks

# Donor proportions (fractions of its 2 m): the starting point of every landmark.
RATIO = {
    "hips_y": 0.549, "hip_y": 0.4985, "knee_y": 0.297, "ankle_y": 0.0875, "toe_y": 0.035,
    "spine02_y": 0.619, "spine01_y": 0.6895, "spine_y": 0.7615, "neck_y": 0.813, "head_y": 0.853, "head_end_y": 0.993,
    "clavicle_x": 0.0235, "arm_x": 0.123, "elbow_u": 0.341, "wrist_u": 0.713, "hip_x_of_ankle": 0.8,
}


def landmarks(P, h, hints):
    """Joint positions (game axes, metres) from the surface samples P of the normalised mesh."""
    r = dict(RATIO)
    r.update(hints.get("ratios", {}))
    J = {}

    def side_pts(s, mask):
        q = P[mask]
        return q[np.sign(q[:, 0]) == s]

    info = {}
    legs = {}
    for s, side in ((1, "Left"), (-1, "Right")):
        foot = side_pts(s, (P[:, 1] < 0.05 * h) & (abs(P[:, 0]) < 0.25 * h))
        ank = side_pts(s, (P[:, 1] > 0.06 * h) & (P[:, 1] < 0.13 * h) & (abs(P[:, 0]) < 0.25 * h))
        ax = float(np.mean([foot[:, 0].mean(), ank[:, 0].mean()]))
        az = float(ank[:, 2].mean())
        ztip = float(np.percentile(foot[:, 2], 99))
        legs[side] = (ax, az, ztip)
    # symmetrical legs: the same spacing and depth on both sides (the mesh is not exactly symmetric, the donor's clips are)
    ankle_x = float(np.mean([abs(legs["Left"][0]), abs(legs["Right"][0])]))
    ankle_z = float(np.mean([legs["Left"][1], legs["Right"][1]]))
    ztip = float(np.mean([legs["Left"][2], legs["Right"][2]]))
    ankle_x = hints.get("ankle_x", ankle_x)
    hip_x = hints.get("hip_x", r["hip_x_of_ankle"] * ankle_x)
    knee_x = hints.get("knee_x", (hip_x + ankle_x) / 2)
    hip_y, knee_y, ankle_y = r["hip_y"] * h, r["knee_y"] * h, r["ankle_y"] * h
    zl = ankle_z + 0.02 * h
    for s, side in ((1, "Left"), (-1, "Right")):
        J[f"{side}UpLeg"] = (s * hip_x, hip_y, zl)
        J[f"{side}Leg"] = (s * knee_x, knee_y, zl + 0.01 * h)
        J[f"{side}Foot"] = (s * ankle_x, ankle_y, ankle_z)
        J[f"{side}ToeBase"] = (s * ankle_x, r["toe_y"] * h + 0.01 * h, ankle_z + 0.6 * (ztip - ankle_z))
    # torso depth: the centre of the chest slab (clamped, the backpack or a coat can pull it)
    def zc(y, hw=0.03, lim=0.04, xw=0.12):
        q = P[(abs(P[:, 1] - y * h) < hw * h) & (abs(P[:, 0]) < xw * h)]
        return float(np.clip(np.median(q[:, 2]), zl - lim * h, zl + lim * h)) if len(q) else zl
    for name, key in (("Hips", "hips"), ("Spine02", "spine02"), ("Spine01", "spine01"), ("Spine", "spine"), ("neck", "neck")):
        y = r[key + "_y"] * h
        J[name] = (0.0, y, zc(r[key + "_y"]) if name != "Hips" else zl)
    head = P[(P[:, 1] > r["head_y"] * h) & (abs(P[:, 0]) < 0.12 * h)]
    hz = float(np.median(head[:, 2])) if len(head) else zl
    J["Head"] = (0.0, r["head_y"] * h, hz)
    J["head_end"] = (0.0, r["head_end_y"] * h, hz)
    J["headfront"] = (0.0, r["head_y"] * h, float(np.percentile(head[:, 2], 97)) if len(head) else hz + 0.07 * h)
    # arms: the axis is the principal line of the points beyond the torso (x > 0.2 h, above the hips: no rifle, no belt pouches)
    arm_axes = {}
    for s, side in ((1, "Left"), (-1, "Right")):
        q = side_pts(s, (abs(P[:, 0]) > hints.get("arm_cut", 0.2) * h) & (P[:, 1] > 0.5 * h) & (P[:, 1] < 0.9 * h))
        # a line through the points: x is the long axis; fit y and z as lines of x
        x = q[:, 0] * s
        ay = np.polyfit(x, q[:, 1], 1)
        az_ = np.polyfit(x, q[:, 2], 1)
        arm_axes[side] = (ay, az_, float(np.percentile(x, 99.5)))
    # symmetrical arms as well, from the mean line
    ay = np.mean([arm_axes[k][0] for k in arm_axes], axis=0)
    az_ = np.mean([arm_axes[k][1] for k in arm_axes], axis=0)
    tip = float(np.mean([arm_axes[k][2] for k in arm_axes]))
    ay = np.array(hints.get("arm_line_y", ay), float)
    az_ = np.array(hints.get("arm_line_z", az_), float)
    tip = hints.get("arm_tip_x", tip)
    x_sh = r["arm_x"] * h
    x_el = x_sh + r["elbow_u"] * (tip - x_sh)
    x_wr = x_sh + r["wrist_u"] * (tip - x_sh)
    for s, side in ((1, "Left"), (-1, "Right")):
        def at(xx):
            return (s * xx, float(np.polyval(ay, xx)), float(np.polyval(az_, xx)))
        J[f"{side}Arm"] = at(x_sh)
        J[f"{side}ForeArm"] = at(x_el)
        J[f"{side}Hand"] = at(x_wr)
        J[f"{side}Shoulder"] = (s * r["clavicle_x"] * h, J[f"{side}Arm"][1], J[f"{side}Arm"][2])
    for k, v in hints.get("joints", {}).items():
        J[k] = tuple(v)
    info.update(ankle_x=ankle_x, hip_x=hip_x, arm_line_y=[float(v) for v in ay], arm_line_z=[float(v) for v in az_], arm_tip_x=tip)
    return J, info


# --------------------------------------------------------------------------- armature

def g2b(v):
    return Vector((v[0], -v[2], v[1]))


def build_armature(J, h):
    """The donor's skeleton through the landmarks, in centimetres under an object scale of 0.01, like the Meshy rigs."""
    data = bpy.data.armatures.new("Armature")
    obj = bpy.data.objects.new("Armature", data)
    bpy.context.scene.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    eb = {}
    head = {n: np.array(J[n]) for n in NAMES}
    for name, parent in JOINTS:
        b = data.edit_bones.new(name)
        eb[name] = b
        b.head = g2b(head[name]) * 100
        if name in MAIN_CHILD:
            tail = head[MAIN_CHILD[name]]
        elif name in ("LeftHand", "RightHand"):
            fore = head[name] - head[PARENT[name]]
            tail = head[name] + fore * 0.45
        elif name in ("LeftToeBase", "RightToeBase"):
            tail = head[name] + np.array([0, 0, 0.06 * h / 1.8])
        elif name == "head_end":
            tail = head[name] + np.array([0, 0.04, 0])
        else:  # headfront
            tail = head[name] + np.array([0, 0, 0.04])
        b.tail = g2b(tail) * 100
        if (b.tail - b.head).length < 1e-3:
            b.tail = b.head + Vector((0, 0, 1))
    for name, parent in JOINTS:
        if parent:
            eb[name].parent = eb[parent]
            eb[name].use_connect = False
    bpy.ops.object.mode_set(mode="OBJECT")
    for n in ("head_end", "headfront"):
        data.bones[n].use_deform = False
    obj.scale = (0.01, 0.01, 0.01)
    return obj


def bone_direction(J, name):
    if name in MAIN_CHILD:
        v = np.array(J[MAIN_CHILD[name]]) - np.array(J[name])
    elif name in LEAF_OF:
        return bone_direction(J, LEAF_OF[name])
    else:
        v = np.array([0, 1.0, 0])
    return v / np.linalg.norm(v)


def shortest_arc(a, b):
    """Rotation matrix (3x3) turning unit vector a onto unit vector b by the shortest arc."""
    v = np.cross(a, b)
    c = float(np.dot(a, b))
    if c < -0.999999:
        axis = np.cross(a, [1, 0, 0])
        if np.linalg.norm(axis) < 1e-6:
            axis = np.cross(a, [0, 1, 0])
        axis /= np.linalg.norm(axis)
        return 2 * np.outer(axis, axis) - np.eye(3)
    vx = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    return np.eye(3) + vx + vx @ vx / (1 + c)


def retarget(arm_obj, donor, J, clips, h):
    """Bake the donor's clips onto the target skeleton as actions (one per state), by world orientation."""
    arm = arm_obj.data
    D = {n: shortest_arc(donor.direction(n), bone_direction(J, n)) for n in NAMES if n not in LEAF_OF}
    for leaf, of in LEAF_OF.items():
        D[leaf] = D[of]
    head = {n: np.array(J[n]) for n in NAMES}
    rest_off = {n: head[n] - head[PARENT[n]] for n in NAMES if PARENT[n]}
    leg = (head["LeftUpLeg"][1] - head["LeftFoot"][1])
    leg_d = donor.pos["LeftUpLeg"][1] - donor.pos["LeftFoot"][1]
    scale_hips = leg / leg_d
    rest = {n: np.array(arm.bones[n].matrix_local) for n in NAMES}  # armature space (cm), Blender axes
    rest_inv = {n: np.linalg.inv(rest[n]) for n in NAMES}
    bind_d = {n: donor.bind[n] for n in NAMES}
    hips_rest_donor = donor.rest_local["Hips"][0] * donor.armature_scale
    pb = arm_obj.pose.bones
    for pbone in pb:
        pbone.rotation_mode = "QUATERNION"
    arm_obj.animation_data_create()
    report = {}
    for state, clip in clips.items():
        rot, hips_t, times = donor.world_rotations(clip)
        nf = len(times)
        # S_target(t) per joint, game axes: Ra Rbind_donor^-1 D^-1
        S = {n: np.einsum("fij,jk,kl->fil", rot[n], bind_d[n].T, D[n].T) for n in NAMES}
        action = bpy.data.actions.new(state)
        arm_obj.animation_data.action = action
        data = {n: np.zeros((nf, 4)) for n in NAMES}  # quaternion wxyz
        loc = {n: np.zeros((nf, 3)) for n in NAMES}
        prev = {n: None for n in NAMES}
        for f in range(nf):
            pos = {}
            posed = {}
            for n, parent in JOINTS:
                if parent is None:
                    p = head["Hips"] + scale_hips * (hips_t[f] - hips_rest_donor)
                else:
                    p = pos[parent] + S[parent][f] @ rest_off[n]
                pos[n] = p
                Sb = C @ S[n][f] @ C.T
                m = np.eye(4)
                m[:3, :3] = Sb @ rest[n][:3, :3]
                m[:3, 3] = (C @ p) * 100
                posed[n] = m
                if parent is None:
                    basis = rest_inv[n] @ m
                else:
                    basis = np.linalg.inv(rest_inv[parent] @ rest[n]) @ np.linalg.inv(posed[parent]) @ m
                q = Matrix(basis[:3, :3]).to_quaternion()
                if prev[n] is not None:
                    q.make_compatible(prev[n])
                prev[n] = q
                data[n][f] = (q.w, q.x, q.y, q.z)
                loc[n][f] = basis[:3, 3]
        for n in NAMES:
            for i in range(4):
                fc = action.fcurves.new(f'pose.bones["{n}"].rotation_quaternion', index=i, action_group=n)
                fc.keyframe_points.add(nf)
                fc.keyframe_points.foreach_set("co", np.stack([np.arange(nf, dtype=float), data[n][:, i]], 1).ravel())
                for kp in fc.keyframe_points:
                    kp.interpolation = "LINEAR"
            for i in range(3):
                fc = action.fcurves.new(f'pose.bones["{n}"].location', index=i, action_group=n)
                fc.keyframe_points.add(nf)
                fc.keyframe_points.foreach_set("co", np.stack([np.arange(nf, dtype=float), loc[n][:, i]], 1).ravel())
                for kp in fc.keyframe_points:
                    kp.interpolation = "LINEAR"
        report[state] = nf
    return report


def lowest_point(mesh_obj):
    """Height of the lowest vertex of the deformed mesh (metres, Blender z up)."""
    dg = bpy.context.evaluated_depsgraph_get()
    ev = mesh_obj.evaluated_get(dg)
    me = ev.to_mesh()
    co = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get("co", co)
    m = np.array(ev.matrix_world)
    z = float((co.reshape(-1, 3) @ m[2, :3] + m[2, 3]).min())
    ev.to_mesh_clear()
    return z


def plant_on_ground(arm_obj, mesh_obj, clips, log, tolerance=0.01):
    """Lift the hips wherever the posed mesh dips below the floor: the donor's hip height and the target's proportions differ a
    little, and a lying body is thicker than the donor's. Per frame, smoothed; a model that never dips stays untouched."""
    scene = bpy.context.scene
    rest = np.array(arm_obj.data.bones["Hips"].matrix_local)[:3, :3]
    for state in clips:
        action = bpy.data.actions[state]
        arm_obj.animation_data.action = action
        n = int(round(action.frame_range[1])) + 1
        low = np.zeros(n)
        for f in range(n):
            scene.frame_set(f)
            bpy.context.view_layer.update()
            low[f] = lowest_point(mesh_obj)
        lift = np.maximum(0.0, -low - tolerance)
        pad = np.pad(lift, 2, mode="edge")
        lift = np.maximum(lift, np.convolve(pad, np.ones(5) / 5, mode="valid"))
        if lift.max() < 1e-4:
            continue
        # a lift of `d` metres up is d * 100 cm along Blender z in armature space; the hips' basis location is in the rest bone's frame
        local = np.linalg.inv(rest) @ np.array([0.0, 0.0, 1.0]) * 100
        for i in range(3):
            fc = action.fcurves.find('pose.bones["Hips"].location', index=i)
            for f, kp in enumerate(fc.keyframe_points):
                kp.co[1] += local[i] * lift[f]
            fc.update()
        log(f"clip {state}: hips lifted by up to {lift.max():.3f} m (lowest point {low.min():+.3f} m before)")
    arm_obj.animation_data.action = None
    scene.frame_set(0)


def finish_actions(arm_obj, clips):
    """One NLA track per action (the exporter writes one animation per track), none active."""
    ad = arm_obj.animation_data
    ad.action = None
    for state in clips:
        tr = ad.nla_tracks.new()
        tr.name = state
        tr.strips.new(state, 0, bpy.data.actions[state]).name = state


# --------------------------------------------------------------------------- skinning

def skin(mesh_obj, arm_obj, hints, log):
    me = mesh_obj.data
    bpy.ops.object.select_all(action="DESELECT")
    # proxy: voxel remesh of a duplicate (Meshy meshes are non-manifold: bone heat fails on them)
    proxy = mesh_obj.copy()
    proxy.data = mesh_obj.data.copy()
    proxy.name = "proxy"
    bpy.context.scene.collection.objects.link(proxy)
    proxy.data.remesh_voxel_size = hints.get("voxel", 0.012)
    bpy.context.view_layer.objects.active = proxy
    proxy.select_set(True)
    bpy.ops.object.voxel_remesh()
    proxy.data.materials.clear()
    log(f"proxy: {len(proxy.data.vertices)} vertices")
    arm_obj.select_set(True)
    bpy.context.view_layer.objects.active = arm_obj
    proxy.select_set(True)
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    bpy.ops.object.select_all(action="DESELECT")
    # proxy weights -> dense array
    pn = len(proxy.data.vertices)
    names = list(NAMES)
    gname = {vg.index: vg.name for vg in proxy.vertex_groups}
    col = {n: i for i, n in enumerate(names)}
    W = np.zeros((pn, len(names)), dtype=np.float32)
    for v in proxy.data.vertices:
        for g in v.groups:
            nm = gname[g.group]
            if nm in col:
                W[v.index, col[nm]] = g.weight
    empty = int((W.sum(1) < 1e-6).sum())
    log(f"proxy vertices without weight: {empty} / {pn}")
    # transfer: nearest face of the proxy, barycentric interpolation
    verts = [v.co.copy() for v in proxy.data.vertices]
    proxy.data.calc_loop_triangles()
    tris = [tuple(t.vertices) for t in proxy.data.loop_triangles]
    bvh = BVHTree.FromPolygons(verts, tris)
    n = len(me.vertices)
    out = np.zeros((n, len(names)), dtype=np.float32)
    for v in me.vertices:
        loc, nrm, idx, dist = bvh.find_nearest(v.co)
        if loc is None:
            continue
        a, b, c = (verts[i] for i in tris[idx])
        w = barycentric(loc, a, b, c)
        ia, ib, ic = tris[idx]
        out[v.index] = W[ia] * w[0] + W[ib] * w[1] + W[ic] * w[2]
    bpy.data.objects.remove(proxy)
    return out


def barycentric(p, a, b, c):
    v0, v1, v2 = b - a, c - a, p - a
    d00, d01, d11, d20, d21 = v0.dot(v0), v0.dot(v1), v1.dot(v1), v2.dot(v0), v2.dot(v1)
    den = d00 * d11 - d01 * d01
    if abs(den) < 1e-18:
        return (1.0, 0.0, 0.0)
    v = (d11 * d20 - d01 * d21) / den
    w = (d00 * d21 - d01 * d20) / den
    return (1.0 - v - w, v, w)


def welded(obj):
    """(welded vertex id per mesh vertex, triangles in welded ids, count): glTF meshes split vertices at every UV seam, so the
    mesh's own edges say nothing about what is connected; weld by position."""
    me = obj.data
    me.calc_loop_triangles()
    nv = len(me.vertices)
    co = np.empty(nv * 3)
    me.vertices.foreach_get("co", co)
    q = np.round(co.reshape(-1, 3) / 1e-4).astype(np.int64)
    _, inv = np.unique(q, axis=0, return_inverse=True)
    inv = inv.ravel()
    tri = np.empty(len(me.loop_triangles) * 3, dtype=np.int64)
    me.loop_triangles.foreach_get("vertices", tri)
    return inv, inv[tri.reshape(-1, 3)], int(inv.max()) + 1


def refine_weights(mesh_obj, out, hints, pins, log):
    """Clean up the transferred weights: weld seams, fill vertices that got nothing, smooth (thin shards, chains and cloth
    edges that the voxel proxy missed take their neighbours' weights), pin loose parts to one bone, limit to four influences."""
    inv, tri, nw = welded(mesh_obj)
    w = np.zeros((nw, out.shape[1]), dtype=np.float64)
    cnt = np.zeros(nw)
    np.add.at(w, inv, out)
    np.add.at(cnt, inv, 1)
    w /= cnt[:, None]
    edges = np.concatenate([tri[:, [0, 1]], tri[:, [1, 2]], tri[:, [2, 0]]])
    edges = np.unique(np.sort(edges, axis=1), axis=0)
    a, b = np.concatenate([edges[:, 0], edges[:, 1]]), np.concatenate([edges[:, 1], edges[:, 0]])
    deg = np.bincount(a, minlength=nw).astype(float)
    # fill: vertices without weight take the mean of weighted neighbours, repeatedly
    for _ in range(50):
        empty = w.sum(1) < 1e-6
        if not empty.any():
            break
        acc = np.zeros_like(w)
        np.add.at(acc, a, w[b])
        has = (acc.sum(1) > 1e-9) & empty
        if not has.any():
            break
        w[has] = acc[has] / np.maximum(acc[has].sum(1, keepdims=True), 1e-9)
    log(f"weights: {int((w.sum(1) < 1e-6).sum())} welded vertices without weight after filling")
    for _ in range(hints.get("smooth", 2)):
        acc = np.zeros_like(w)
        np.add.at(acc, a, w[b])
        w = 0.5 * w + 0.5 * acc / np.maximum(deg, 1)[:, None]
    # pins: a box (fractions of the height, game axes) follows one bone rigidly
    co = np.empty(len(mesh_obj.data.vertices) * 3)
    mesh_obj.data.vertices.foreach_get("co", co)
    g = co.reshape(-1, 3) @ C
    gw = np.zeros((nw, 3))
    gw[inv] = g
    for pin in pins:
        lo, hi = np.array(pin["min"]) * pin["h"], np.array(pin["max"]) * pin["h"]
        sel = np.all((gw >= lo) & (gw <= hi), axis=1)
        w[sel] = 0
        w[sel, NAMES.index(pin["bone"])] = 1
        log(f"pinned {int(sel.sum())} vertices to {pin['bone']}")
    w = w[inv]
    return clean_weights(w)


def clean_weights(out, limit=4):
    top = np.argsort(-out, axis=1)[:, limit:]
    np.put_along_axis(out, top, 0.0, axis=1)
    s = out.sum(1, keepdims=True)
    s[s < 1e-9] = 1.0
    return out / s


def apply_weights(mesh_obj, arm_obj, out):
    for vg in list(mesh_obj.vertex_groups):
        mesh_obj.vertex_groups.remove(vg)
    groups = {n: mesh_obj.vertex_groups.new(name=n) for n in NAMES}
    for j, n in enumerate(NAMES):
        idx = np.nonzero(out[:, j] > 1e-4)[0]
        for i in idx:
            groups[n].add([int(i)], float(out[i, j]), "REPLACE")
    mesh_obj.parent = arm_obj
    mesh_obj.matrix_parent_inverse = arm_obj.matrix_world.inverted()
    for m in list(mesh_obj.modifiers):
        mesh_obj.modifiers.remove(m)
    mod = mesh_obj.modifiers.new("Armature", "ARMATURE")
    mod.object = arm_obj


# --------------------------------------------------------------------------- debug picture

def debug_picture(path, mesh_obj, J, h):
    """Front, side and game-camera pictures of the mesh (see-through) with the fitted joints and bones drawn on top."""
    mats = {"L": lib.make_material("dbgL", "#ff3030"), "R": lib.make_material("dbgR", "#3070ff"), "C": lib.make_material("dbgC", "#20e020")}
    made = []
    for n, parent in JOINTS:
        k = "L" if n.startswith("Left") else "R" if n.startswith("Right") else "C"
        a = g2b(J[n])
        made.append(lib.low_sphere(radius=0.012 * h, segments=8, rings=6, material=mats[k], name="j_" + n, location=tuple(a)))
        if parent:
            made.append(lib.tube_along_curve([tuple(g2b(J[parent])), tuple(a)], radius=0.006 * h, sides=5, taper=1.0, material=mats[k], name="b_" + n))
    lib.add_sun()
    shots = []
    for name, pitch, yaw in (("front", 4, 0), ("side", 4, 90), ("game", 55, 45)):
        lib.iso_camera(target=(0, 0.5 * h, 0), distance=2.6 * h, pitch=pitch, yaw=yaw, name=name)
        p = f"{path}-{name}.png"
        lib.render_workbench(p, (560, 700), xray=0.35)
        shots.append(p)
    lib.tile_images(shots, f"{path}.png", 3)
    for o in made:
        bpy.data.objects.remove(o)


# --------------------------------------------------------------------------- main

def main():
    args = lib.script_args()
    job = json.load(open(args[args.index("--job") + 1]))
    hints = job.get("hints", {})
    h = job["height"]
    log = lambda m: print(f"autorig {job['id']}: {m}")
    lib.clean_scene()
    scene = bpy.context.scene
    scene.render.fps = FPS
    bpy.ops.import_scene.gltf(filepath=job["mesh"])
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    if len(meshes) != 1:
        raise RuntimeError(f"expected one mesh in {job['mesh']}, found {len(meshes)}")
    mesh = meshes[0]
    for o in list(bpy.data.objects):
        if o is not mesh:
            bpy.data.objects.remove(o)
    mesh.parent = None
    normalise(mesh, h, hints)
    P = get_points(mesh)
    log(f"surface samples {P.shape}, y {P[:, 1].min():.3f}..{P[:, 1].max():.3f}, x {P[:, 0].min():.2f}..{P[:, 0].max():.2f}")
    J, info = landmarks(P, h, hints)
    log("landmarks " + json.dumps({k: [round(float(x), 3) for x in v] for k, v in J.items()}))
    log("measures " + json.dumps(info))
    donor = Donor(job["donor"])
    arm = build_armature(J, h)
    rep = retarget(arm, donor, J, job["clips"], h)
    log(f"clips {rep}")
    if job.get("debug"):
        os.makedirs(job["debug"], exist_ok=True)
        debug_picture(os.path.join(job["debug"], f"{job['id']}-landmarks"), mesh, J, h)
    out = skin(mesh, arm, hints, log)
    out = refine_weights(mesh, out, hints, [dict(p, h=h) for p in hints.get("pins", [])], log)
    apply_weights(mesh, arm, out)
    plant_on_ground(arm, mesh, job["clips"], log, hints.get("floor_tolerance", 0.01))
    finish_actions(arm, job["clips"])
    # export: the armature and the mesh only
    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True)
    mesh.select_set(True)
    bpy.context.view_layer.objects.active = arm
    os.makedirs(os.path.dirname(job["out"]), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=job["out"], export_format="GLB", use_selection=True, export_skins=True, export_animations=True,
        export_nla_strips=True, export_frame_range=False, export_force_sampling=True, export_optimize_animation_size=False,
        export_image_format="AUTO", export_apply=False, export_yup=True,
    )
    print("built", job["id"], job["out"])


main()
