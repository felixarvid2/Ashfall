"""Builders for the Deep Mines and Core looks (scripts/blender/spec/deep_core.json): one generic piece-based builder.

`deep_kit` takes `pieces`, a list of primitives written in the GAME's axes (x = the creature's left, y up, z forward;
a part grows along +Y), so a spec reads like the `position` / `rotation` of src/data/variants/deepCore.ts. Each piece:

    {"shape": "box|cyl|cone|sphere|shard|ring|drill|tube", "mat": [kind, "#body", "#glow", strength],
     "at": [x, y, z], "rot": [deg x, y, z], ...shape params..., "radial": {...}}

Shapes: box `size` [x, y, z], `bevel`; cyl / cone `r`, `r2` (top radius), `len`, `verts`; sphere `r` (number or [x, y, z]),
`segs`, `rings`; shard `len`, `r`, `sides`, `lean` [x, z] (a crystal prism with an off-centre tip); ring `r`, `tube`,
`major`, `minor` (a torus around Y); drill `r`, `len`, `lobes`, `turns`; tube `points` [[x, y, z], ...], `r`, `taper`.
`radial` repeats the piece around the Y axis: {"n": 6, "r": 0.2 (distance of each copy from the axis), "phase": 0,
"tilt": 20 (lean away from the axis, deg), "jitter": 0.2 (seeded size/height variation), "seed": 1, "skip": [..]}.
Materials: kind is metal | rust | cloth | crystal | glow | flesh | bone; `glow` is the emissive colour and `strength` its
intensity (colours as sRGB hex, no textures). Deterministic: the only randomness is `jitter` with a `seed`.

For a whole model (`models` in the spec) the same pieces stand on y = 0 and face game +Z.
"""
import math
import random

import bmesh
import bpy
import lib
from mathutils import Euler, Matrix, Vector

# game axes (x, y up, z forward) -> Blender (x, -z, y)
C = Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0))).to_4x4()
CI = C.inverted()


def _mat(spec):
    kind = spec[0]
    color = spec[1]
    glow = spec[2] if len(spec) > 2 else None
    strength = spec[3] if len(spec) > 3 else 1.0
    name = "dc_%s_%s_%s_%s" % (kind, color.lstrip("#"), (glow or "").lstrip("#"), strength)
    if bpy.data.materials.get(name):
        return bpy.data.materials[name]
    if kind == "metal":
        return lib.make_material(name, color, metallic=0.7, roughness=0.42)
    if kind == "rust":
        return lib.make_material(name, color, metallic=0.55, roughness=0.82)
    if kind == "cloth":
        return lib.make_material(name, color, roughness=0.95)
    if kind == "bone":
        return lib.make_material(name, color, roughness=0.7)
    if kind == "flesh":
        return lib.make_material(name, color, roughness=0.35, emission=glow, emission_strength=strength)
    if kind == "crystal":
        return lib.make_material(name, color, metallic=0.1, roughness=0.18, emission=glow, emission_strength=strength)
    if kind == "glow":
        return lib.make_material(name, color, roughness=0.5, emission=glow or color, emission_strength=strength)
    raise ValueError("unknown material kind " + kind)


def _to_obj(bm, name, material, smooth=False):
    return lib._object_from_bmesh(bm, name, material, smooth=smooth)


def _box(p, material):
    sx, sy, sz = p["size"]
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= sx
        v.co.y *= sz
        v.co.z *= sy
        if p.get("base"):  # origin at the bottom face instead of the centre
            v.co.z += sy / 2
    if p.get("bevel", 0) > 0:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=p["bevel"], segments=1, affect="EDGES")
    if "taper" in p:  # the top face narrower than the bottom: [x, z] scale
        tx, tz = p["taper"]
        mid = sy / 2 if p.get("base") else 0.0
        for v in bm.verts:
            if v.co.z > mid + 1e-6:
                v.co.x *= tx
                v.co.y *= tz
    return _to_obj(bm, "box", material)


def _frustum(p, material, cone=False):
    r1 = p.get("r", 0.1)
    r2 = 0.0 if cone else p.get("r2", r1)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=p.get("verts", 8), radius1=r1, radius2=r2, depth=p.get("len", 0.2))
    # base at y = 0, growing up (create_cone is centred)
    for v in bm.verts:
        v.co.z += p.get("len", 0.2) / 2
    sx, sz = p.get("squash", [1, 1])
    for v in bm.verts:
        v.co.x *= sx
        v.co.y *= sz
    return _to_obj(bm, "cyl", material, smooth=p.get("smooth", False))


def _sphere(p, material):
    r = p.get("r", 0.1)
    rx, ry, rz = (r, r, r) if isinstance(r, (int, float)) else r
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=p.get("segs", 8), v_segments=p.get("rings", 5), radius=1.0)
    for v in bm.verts:
        v.co.x *= rx
        v.co.y *= rz
        v.co.z *= ry
    return _to_obj(bm, "sphere", material, smooth=p.get("smooth", True))


def _shard(p, material, rng):
    lean = p.get("lean", [0, 0])
    seed = rng.randint(0, 9999)
    return lib.crystal(p.get("len", 0.2), p.get("r", 0.03), p.get("sides", 5), material, seed=seed, name="shard", lean=(lean[0], -lean[1]))


def _ring(p, material):
    r, tube = p.get("r", 0.3), p.get("tube", 0.02)
    major, minor = p.get("major", 12), p.get("minor", 4)
    sq = p.get("squash", 1.0)  # height of the tube cross-section relative to its width
    bm = bmesh.new()
    rings = []
    for i in range(major):
        a = 2 * math.pi * i / major
        ring = []
        for j in range(minor):
            b = 2 * math.pi * j / minor + math.pi / minor
            rr = r + math.cos(b) * tube
            ring.append(bm.verts.new((math.cos(a) * rr, math.sin(a) * rr, math.sin(b) * tube * sq)))
        rings.append(ring)
    for i in range(major):
        a, b = rings[i], rings[(i + 1) % major]
        for j in range(minor):
            k = (j + 1) % minor
            bm.faces.new((a[j], b[j], b[k], a[k]))
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    return _to_obj(bm, "ring", material)


def _drill(p, material):
    """A conical bit with `lobes` spiral ridges (flat shaded)."""
    r, length = p.get("r", 0.12), p.get("len", 0.5)
    lobes, turns, steps = p.get("lobes", 3), p.get("turns", 1.5), p.get("steps", 6)
    bm = bmesh.new()
    layers = []
    for s in range(steps + 1):
        t = s / steps
        z = length * t
        base = r * (1.0 - t * 0.97)
        ring = []
        for i in range(lobes * 2):
            a = 2 * math.pi * i / (lobes * 2) + turns * 2 * math.pi * t
            rr = base * (1.0 if i % 2 == 0 else 0.6)
            ring.append(bm.verts.new((math.cos(a) * rr, math.sin(a) * rr, z)))
        layers.append(ring)
    n = lobes * 2
    for a, b in zip(layers[:-1], layers[1:]):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
    bm.faces.new(list(reversed(layers[0])))
    bm.faces.new(layers[-1])
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    return _to_obj(bm, "drill", material)


def _tube(p, material):
    pts = [g2b(q) for q in p["points"]]
    return lib.tube_along_curve(pts, p.get("r", 0.03), p.get("sides", 5), p.get("taper", 0.6), material, "tube", p.get("samples", 2))


def g2b(v):
    return Vector((v[0], -v[2], v[1]))


def _rot(deg):
    return Euler([math.radians(a) for a in deg], "XYZ").to_matrix().to_4x4()


def _make(p, material, rng):
    s = p["shape"]
    if s == "box":
        return _box(p, material)
    if s == "cyl":
        return _frustum(p, material)
    if s == "cone":
        return _frustum(p, material, cone=True)
    if s == "sphere":
        return _sphere(p, material)
    if s == "shard":
        return _shard(p, material, rng)
    if s == "ring":
        return _ring(p, material)
    if s == "drill":
        return _drill(p, material)
    if s == "tube":
        return _tube(p, material)
    raise ValueError("unknown shape " + s)


def _place(obj, m_game):
    obj.matrix_world = C @ m_game @ CI


def deep_kit(pieces, seed=1):
    """See the module docstring. Returns the joined object (materials kept per piece)."""
    rng = random.Random(seed)
    objects = []
    for p in pieces:
        material = _mat(p.get("mat", ["metal", "#6b7480"]))
        base_at = Matrix.Translation(Vector(p.get("at", [0, 0, 0])))
        base_rot = _rot(p.get("rot", [0, 0, 0]))
        radial = p.get("radial")
        if not radial:
            obj = _make(p, material, rng)
            _place(obj, base_at @ base_rot)
            objects.append(obj)
            continue
        n = radial["n"]
        jr = random.Random(radial.get("seed", 1))
        for k in range(n):
            if k in radial.get("skip", []):
                continue
            ang = radial.get("phase", 0) + 360.0 * k / n
            jit = radial.get("jitter", 0.0)
            f = 1.0 + jr.uniform(-jit, jit)
            q = dict(p)
            for key in ("len", "r", "tube"):
                if key in q and not isinstance(q[key], list):
                    q[key] = q[key] * (f if key == "len" else (1.0 + (f - 1.0) * 0.4))
            obj = _make(q, material, rng)
            ring = Matrix.Rotation(math.radians(-ang), 4, "Y") @ Matrix.Translation(Vector((radial.get("r", 0.2), 0, 0)))
            lean = Matrix.Rotation(math.radians(-radial.get("tilt", 0)), 4, "Z") @ Matrix.Translation(Vector((0, radial.get("lift", 0) * f, 0)))
            _place(obj, base_at @ ring @ lean @ base_rot)
            objects.append(obj)
    return [lib.join(objects, "deep_kit")]


BUILDERS = {"deep_kit": deep_kit}
