"""Builders for the Cinder Flats / Refinery / Hydroponic Vaults variants (scripts/blender/spec/regions123.json).

Everything here is authored in GAME axes (x = the creature's left, y up, z forward) and turned into Blender's
axes by `piece`, so the numbers read the same as the `position` of a variant part. A part's origin is its attach point
and it grows along +Y unless a part says otherwise (hanging things grow along -Y). Materials are plain colours.
Deterministic: a `seed` param, no time or global random state.
"""
import math
import random

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

import lib

_C = Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0))).to_4x4()  # game -> Blender


def _b(v):
    return Vector((v[0], -v[2], v[1]))


def _rot(deg):
    r = Euler([math.radians(a) for a in deg], "XYZ").to_matrix().to_4x4()
    return (_C @ r @ _C.inverted()).to_euler()


# --------------------------------------------------------------------------- materials


def M(kind, color, glow=None, strength=0.0):
    if kind == "metal":
        return lib.painted_metal(color)
    if kind == "rust":
        return lib.rusted_metal(color)
    if kind == "cloth":
        return lib.rubber_cloth(color)
    if kind == "flesh":
        return lib.spore_flesh(color, glow or "#9dff5a", strength)
    if kind == "ember":
        return lib.ember_glow(color, glow or "#ff7a1a", strength or 3.0)
    if kind == "crystal":
        return lib.lumen_crystal(color, glow or "#5ac8ff", strength or 0.9)
    if kind == "glow":
        return lib.make_material("glow" + color.lstrip("#") + (glow or "").lstrip("#"), color, roughness=0.4, emission=glow or color, emission_strength=strength or 2.0)
    return lib.make_material("matte" + color.lstrip("#"), color, roughness=0.85)  # matte


# --------------------------------------------------------------------------- primitives (game axes)


def _ring(bm, radius, tube, segs, sides):
    rings = []
    for i in range(segs):
        a = 2 * math.pi * i / segs
        c = Vector((math.cos(a), math.sin(a), 0))
        ring = []
        for j in range(sides):
            t = 2 * math.pi * j / sides
            p = c * (radius + math.cos(t) * tube) + Vector((0, 0, math.sin(t) * tube))
            ring.append(bm.verts.new(p))
        rings.append(ring)
    for i in range(segs):
        a, b = rings[i], rings[(i + 1) % segs]
        for j in range(sides):
            k = (j + 1) % sides
            bm.faces.new((a[j], a[k], b[k], b[j]))


def piece(shape, mat, at=(0, 0, 0), rot=(0, 0, 0), size=(1, 1, 1), radius=0.1, radius2=None, depth=1.0, verts=8, rings=4, squash=(1, 1, 1), tube=0.02, bevel=0.008):
    """One primitive. box: size (x, y, z game); cyl/cone: radius [, radius2], depth along game Y, centred on `at`;
    sphere: radius + squash (x, y, z game); torus: radius, tube, in the game XZ plane (axis = Y)."""
    if shape == "box":
        o = lib.bevel_box((size[0], size[2], size[1]), bevel, 1, mat, "box")
    elif shape in ("cyl", "cone"):
        bm = bmesh.new()
        r2 = (0.0 if shape == "cone" else radius) if radius2 is None else radius2
        bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=verts, radius1=radius, radius2=r2, depth=depth)
        o = lib._object_from_bmesh(bm, shape, mat, smooth=verts >= 10)
    elif shape == "sphere":
        o = lib.low_sphere(radius, verts, rings, mat, "sphere", squash=(squash[0], squash[2], squash[1]))
    elif shape == "torus":
        bm = bmesh.new()
        _ring(bm, radius, tube, verts, 5)
        o = lib._object_from_bmesh(bm, "torus", mat, smooth=True)
    else:
        raise ValueError(shape)
    o.location = _b(at)
    o.rotation_euler = _rot(rot)
    return o


def _done(objs, name):
    return [lib.join(objs, name)]


# --------------------------------------------------------------------------- Cinder Flats / Refinery


def sac_cluster(count=5, radius=0.2, spread=0.17, seed=1, color="#8a8a3a", glow="#d8c84a", strength=0.5, kind="flesh", base_color="#2c2a1c"):
    """Swollen sacs: one big lump and smaller ones round it, on a dark root pad. Origin at the pad, growing up."""
    rng = random.Random(seed)
    sac = M(kind, color, glow, strength)
    objs = [piece("sphere", sac, at=(0, radius * 0.95, 0), radius=radius, squash=(1, 1.1, 1), verts=8, rings=5)]
    for i in range(count - 1):
        a = 2 * math.pi * i / (count - 1) + rng.uniform(-0.3, 0.3)
        d = spread * rng.uniform(0.75, 1.0)
        r = radius * rng.uniform(0.45, 0.7)
        objs.append(piece("sphere", sac, at=(math.cos(a) * d, r * rng.uniform(0.7, 1.4), math.sin(a) * d), radius=r, squash=(1, 1.1, 1), verts=7, rings=4))
    objs.append(piece("sphere", M("matte", base_color), at=(0, 0, 0), radius=spread * 1.3, squash=(1, 0.3, 1), verts=7, rings=3))
    return _done(objs, "sacs")


def tank_pair(color="#8a3a1e", band="#2a2522", glow=None, strength=0.0, kind="rust", length=0.5, radius=0.085):
    """Two fuel / spore tanks side by side with straps and a hose stub: a backpack. Origin on the spine, tanks behind (-z)."""
    tank = M(kind, color, glow, strength) if kind in ("flesh", "glow") else M(kind, color)
    dark = M("metal", band)
    z = -radius - 0.03
    objs = []
    for sx in (-1, 1):
        x = sx * (radius + 0.012)
        objs.append(piece("cyl", tank, at=(x, length / 2, z), radius=radius, depth=length, verts=10))
        objs.append(piece("sphere", tank, at=(x, length, z), radius=radius, squash=(1, 0.5, 1), verts=10, rings=3))
        objs.append(piece("cyl", dark, at=(x, length + 0.06, z), radius=0.025, depth=0.07, verts=6))
        for t in (0.25, 0.7):
            objs.append(piece("cyl", dark, at=(x, length * t, z), radius=radius + 0.012, depth=0.035, verts=10))
    objs.append(piece("box", dark, at=(0, length * 0.7, z), size=(2 * radius + 0.05, 0.04, 0.03)))
    objs.append(piece("cyl", dark, at=(0, length + 0.12, z), radius=0.014, depth=0.2, rot=(0, 0, 90), verts=6))
    return _done(objs, "tanks")


def nozzle(length=0.6, radius=0.04, color="#4a4540", tip="#ff7a1a"):
    """A pipe / flamethrower nozzle: canister, barrel, flared mouth with a hot tip. Grows along +Y (rotate [90,0,0] to point it forward)."""
    metal = M("metal", color)
    objs = [
        piece("cyl", metal, at=(0, 0.05, 0), radius=0.07, depth=0.18, verts=9),
        piece("cyl", metal, at=(0, length / 2 + 0.1, 0), radius=radius, depth=length, verts=7),
        piece("cyl", M("rust", "#7a3a1c"), at=(0, length + 0.14, 0), radius=radius, radius2=radius * 2.5, depth=0.14, verts=8),
        piece("sphere", M("ember", "#c2410c", tip, 3.0), at=(0, length + 0.2, 0), radius=radius * 1.6, squash=(1, 0.6, 1), verts=7, rings=3),
        piece("cyl", metal, at=(0, 0.25, 0), radius=radius * 1.5, depth=0.03, verts=7),
    ]
    return _done(objs, "nozzle")


def charred_plate(width=0.28, height=0.32, seed=1, color="#241a14", ember="#ff5a1a", crack=True):
    """Burnt armour plate: stacked slabs at slight angles and an ember crack. Faces +z, origin on the body surface behind it."""
    rng = random.Random(seed)
    char = M("rust", color)
    objs = []
    for i in range(3):
        w = width * (1.0 - 0.18 * i)
        h = height * (0.5 if i == 0 else 0.35)
        y = height * (0.0 if i == 0 else 0.5 + 0.28 * (i - 1))
        objs.append(piece("box", char, at=(rng.uniform(-0.03, 0.03), y, 0.03 + 0.012 * i), rot=(rng.uniform(-8, 8), rng.uniform(-6, 6), rng.uniform(-14, 14)), size=(w, h, 0.05), bevel=0.01))
    objs.append(piece("cone", char, at=(width * 0.3, height * 0.95, 0.04), rot=(-10, 0, -20), radius=0.045, depth=0.2, verts=5))
    if crack:
        objs.append(piece("box", M("ember", "#c2410c", ember, 3.0), at=(0.0, height * 0.1, 0.062), rot=(0, 0, 25), size=(0.025, height * 0.8, 0.012), bevel=0.003))
    return _done(objs, "plate")


def dome_crack(count=7, radius=0.27, height=0.2, seed=2, color="#7a3a1c"):
    """A broken crown of jagged shards round a drone's dome plus a rust patch. Origin at the centre of the ring."""
    rng = random.Random(seed)
    rust = M("rust", color)
    objs = []
    for i in range(count):
        a = 2 * math.pi * i / count + rng.uniform(-0.2, 0.2)
        h = height * rng.uniform(0.55, 1.0)
        objs.append(piece("cone", rust, at=(math.cos(a) * radius * 0.9, h / 2, math.sin(a) * radius * 0.9), rot=(math.sin(a) * 18, 0, -math.cos(a) * 18), radius=0.05, depth=h, verts=4))
    objs.append(piece("sphere", M("rust", "#4a2410"), at=(0.04, 0.0, 0.04), radius=radius * 0.8, squash=(1, 0.22, 1), verts=8, rings=3))
    return _done(objs, "crack")


def burner_ring(radius=0.3, tube=0.04, color="#3a3430", glow="#ff6a1a", nodes=8):
    """A flame-drone burner ring: a metal torus with hot nozzle beads round its rim. Ring in the XZ plane (axis Y)."""
    metal = M("metal", color)
    hot = M("ember", "#c2410c", glow, 3.5)
    objs = [piece("torus", metal, radius=radius, tube=tube, verts=14)]
    for i in range(nodes):
        a = 2 * math.pi * i / nodes
        objs.append(piece("cone", hot, at=(math.cos(a) * (radius - 0.02), 0, math.sin(a) * (radius - 0.02)), rot=(math.sin(a) * 90, 0, -math.cos(a) * 90), radius=0.035, depth=0.1, verts=5))
    objs.append(piece("cyl", M("rust", "#6a3018"), at=(radius, -0.02, 0), radius=0.05, depth=0.2, rot=(0, 0, 90), verts=6))
    return _done(objs, "burner")


def censer(chain=0.45, size=0.1, color="#c9a23a", glow="#ffb03a"):
    """A swinging censer: chain, then a spiked golden cage with a live coal. Origin at the hand, hangs down (-Y)."""
    gold = M("metal", color)
    objs = [piece("cyl", gold, at=(0, -chain / 2, 0), radius=0.008, depth=chain, verts=5)]
    y = -chain - size
    objs.append(piece("sphere", gold, at=(0, y, 0), radius=size, squash=(1, 1.1, 1), verts=8, rings=5))
    objs.append(piece("sphere", M("ember", "#c2410c", glow, 3.5), at=(0, y, 0), radius=size * 1.02, squash=(0.6, 0.85, 0.6), verts=6, rings=3))
    objs.append(piece("cone", gold, at=(0, y + size * 1.4, 0), radius=size * 0.6, depth=size * 0.9, verts=8))
    for i in range(6):
        a = math.pi * 2 * i / 6
        objs.append(piece("cone", gold, at=(math.cos(a) * size * 1.15, y - size * 0.3, math.sin(a) * size * 1.15), rot=(math.sin(a) * 70, 0, -math.cos(a) * 70), radius=0.022, depth=0.09, verts=4))
    return _done(objs, "censer")


def mitre(height=0.44, color="#7a1a12", trim="#c9a23a", width=0.13):
    """A tall pointed priest's mitre: banded base, two-tier cone, gold trim and a front panel. Origin at the brow."""
    cloth = M("cloth", color)
    gold = M("metal", trim)
    objs = [
        piece("cyl", gold, at=(0, 0.03, 0), radius=width, depth=0.07, verts=10),
        piece("cyl", cloth, at=(0, 0.07 + height * 0.3, 0), radius=width * 0.95, radius2=width * 0.8, depth=height * 0.6, verts=10),
        piece("cone", cloth, at=(0, 0.07 + height * 0.6 + height * 0.2, 0), radius=width * 0.8, depth=height * 0.4, verts=10),
        piece("sphere", gold, at=(0, 0.07 + height * 1.0, 0), radius=0.03, verts=6, rings=3),
        piece("box", gold, at=(0, 0.07 + height * 0.35, width * 0.88), rot=(8, 0, 0), size=(0.035, height * 0.6, 0.02), bevel=0.004),
    ]
    return _done(objs, "mitre")


def halo_ring(radius=0.3, tube=0.018, color="#ffd23a", spikes=10):
    """A glowing halo with short rays: a vertical ring (facing forward) centred on the origin."""
    gl = M("glow", "#c9a23a", color, 2.2)
    objs = [piece("torus", gl, rot=(90, 0, 0), radius=radius, tube=tube, verts=18)]
    for i in range(spikes):
        a = 2 * math.pi * i / spikes
        objs.append(piece("cone", gl, at=(math.cos(a) * (radius + 0.07), math.sin(a) * (radius + 0.07), 0), rot=(0, 0, math.degrees(a) - 90), radius=0.018, depth=0.12, verts=4))
    return _done(objs, "halo")


def pauldron(radius=0.17, color="#2a2420", spike=0.16, spikes=3, ember=None):
    """A domed shoulder guard with spikes (and an ember band when `ember` is a colour). Origin at the joint, covers the shoulder top."""
    metal = M("rust", color)
    objs = [piece("sphere", metal, at=(0, 0.02, 0), radius=radius, squash=(1.15, 0.65, 1), verts=9, rings=4)]
    for i in range(spikes):
        a = (i - (spikes - 1) / 2) * 0.7
        objs.append(piece("cone", metal, at=(math.sin(a) * radius * 0.8, 0.1 + spike * 0.4, math.cos(a) * radius * 0.5), rot=(10, 0, -math.degrees(a) * 0.8), radius=0.035, depth=spike, verts=5))
    if ember:
        objs.append(piece("torus", M("ember", "#c2410c", ember, 3.0), at=(0, 0.01, 0), radius=radius * 1.08, tube=0.012, verts=12, squash=(1, 1, 1)))
    return _done(objs, "pauldron")


def brazier(color="#2a2420", glow="#ff7a1a", height=0.32):
    """A back-mounted pyre: a stand, a bowl, three tongues of fire. Origin on the back, grows up."""
    metal = M("rust", color)
    hot = M("ember", "#c2410c", glow, 3.5)
    objs = [
        piece("cyl", metal, at=(0, height / 2, -0.1), radius=0.03, depth=height, verts=6),
        piece("cyl", metal, at=(0, height + 0.05, -0.1), radius=0.1, radius2=0.2, depth=0.12, verts=9),
        piece("cone", hot, at=(0, height + 0.26, -0.1), radius=0.11, depth=0.4, verts=6),
        piece("cone", hot, at=(0.1, height + 0.2, -0.1), rot=(0, 0, -15), radius=0.07, depth=0.3, verts=5),
        piece("cone", hot, at=(-0.1, height + 0.18, -0.1), rot=(0, 0, 15), radius=0.07, depth=0.26, verts=5),
    ]
    return _done(objs, "brazier")


def officer_cap(color="#2c3326", trim="#c9a23a"):
    """A peaked officer's cap: crown, flat top, brim and a gold badge. Origin at the brow."""
    cloth = M("cloth", color)
    gold = M("metal", trim)
    objs = [
        piece("cyl", cloth, at=(0, 0.06, 0), radius=0.125, radius2=0.15, depth=0.12, verts=10),
        piece("cyl", cloth, at=(0, 0.13, 0), radius=0.17, depth=0.025, verts=10),
        piece("box", M("cloth", "#171a14"), at=(0, 0.015, 0.15), rot=(-12, 0, 0), size=(0.22, 0.015, 0.1), bevel=0.004),
        piece("box", gold, at=(0, 0.075, 0.138), size=(0.045, 0.045, 0.012), bevel=0.004),
        piece("cyl", gold, at=(0, 0.03, 0), radius=0.131, depth=0.02, verts=10),
    ]
    return _done(objs, "cap")


def coat_flap(width=0.24, length=0.7, color="#3d4a2f", trim="#c9a23a", flare=1.35):
    """A long coat tail: a flared panel with a trim stripe. Origin at the top edge, hangs down (-Y), faces +z."""
    cloth = M("cloth", color)
    gold = M("metal", trim)
    objs = [
        piece("box", cloth, at=(0, -length * 0.25, 0), size=(width, length * 0.5, 0.025), bevel=0.006),
        piece("box", cloth, at=(0, -length * 0.75, 0.04), rot=(10, 0, 0), size=(width * flare, length * 0.5, 0.025), bevel=0.006),
        piece("box", gold, at=(0, -length * 0.98, 0.075), rot=(10, 0, 0), size=(width * flare, 0.025, 0.02), bevel=0.004),
    ]
    return _done(objs, "flap")


def epaulette(color="#c9a23a", cloth="#2c3326"):
    """A gold officer's epaulette with fringe. Origin at the shoulder top."""
    gold = M("metal", color)
    objs = [piece("box", M("cloth", cloth), at=(0, 0.015, 0), size=(0.2, 0.025, 0.14), bevel=0.005), piece("box", gold, at=(0, 0.035, 0), size=(0.17, 0.02, 0.1), bevel=0.004)]
    for i in range(5):
        objs.append(piece("cyl", gold, at=(0.1, -0.04, -0.05 + 0.025 * i), radius=0.008, depth=0.1, verts=4))
    objs.append(piece("sphere", gold, at=(0, 0.05, 0), radius=0.03, verts=6, rings=3))
    return _done(objs, "epaulette")


# --------------------------------------------------------------------------- crystals and growth


def crystal_group(count=7, height=0.4, radius=0.045, spread=0.09, seed=3, sides=5, tilt=0.4, color="#cfe8f5", glow="#8fd0ff", strength=0.6, base_color="#7a8a96", base=True):
    """lib.crystal_cluster with its own colours: frost (pale blue), Lumen teal or green. Origin at the base, grows up."""
    crystal = lib.lumen_crystal(color, glow, strength, name="cg" + color.lstrip("#") + glow.lstrip("#"))
    rock = lib.rusted_metal(base_color, "cgrock" + base_color.lstrip("#"))
    return [lib.crystal_cluster(count, height, radius, spread, seed, sides, tilt, crystal, rock, "cluster", base)]


def moss_clump(count=6, radius=0.16, seed=1, color="#3f5e2a", color2="#628a3a", glow=None):
    """Cushions of moss: flattened mounds in two greens (a faint glow when `glow` is given). Origin at the base."""
    rng = random.Random(seed)
    a = M("flesh", color, glow, 0.25) if glow else M("matte", color)
    b = M("flesh", color2, glow, 0.25) if glow else M("matte", color2)
    objs = []
    for i in range(count):
        ang = 2 * math.pi * i / count + rng.uniform(-0.4, 0.4)
        d = radius * (0 if i == 0 else rng.uniform(0.5, 1.0))
        r = radius * rng.uniform(0.5, 0.85)
        objs.append(piece("sphere", a if i % 2 == 0 else b, at=(math.cos(ang) * d, r * 0.2, math.sin(ang) * d), radius=r, squash=(1, rng.uniform(0.5, 0.8), 1), verts=7, rings=3))
    return _done(objs, "moss")


def flower_bloom(petals=8, radius=0.16, stem=0.22, petal="#e8e0a8", centre="#7dff5a", tilt=38):
    """A big flower on a short stem: ring of petals round a glowing heart. Origin at the stem base, faces up."""
    green = M("matte", "#2f4a22")
    pet = M("matte", petal)
    objs = [piece("cyl", green, at=(0, stem / 2, 0), radius=0.02, radius2=0.014, depth=stem, verts=5)]
    for i in range(petals):
        a = 2 * math.pi * i / petals
        d = radius * 0.5
        objs.append(piece("sphere", pet, at=(math.cos(a) * d, stem + 0.02, math.sin(a) * d), rot=(math.sin(a) * tilt, 0, -math.cos(a) * tilt), radius=radius * 0.62, squash=(0.42, 0.12, 1.0), verts=6, rings=3))
    objs.append(piece("sphere", M("glow", "#5a9a30", centre, 2.0), at=(0, stem + 0.03, 0), radius=radius * 0.3, squash=(1, 0.8, 1), verts=7, rings=3))
    return _done(objs, "flower")


def goggles(lens="#9dff5a", strap="#1c1d1a", radius=0.115):
    """Botanist's goggles: a strap round the head and two big round glowing lenses. Origin at the head's centre, lenses forward (+z)."""
    dark = M("cloth", strap)
    objs = [piece("cyl", dark, at=(0, 0, 0), radius=radius, depth=0.045, verts=12)]
    for sx in (-1, 1):
        objs.append(piece("cyl", dark, at=(sx * 0.05, 0, radius * 0.95), rot=(90, 0, 0), radius=0.047, depth=0.045, verts=10))
        objs.append(piece("cyl", M("glow", "#2a5a1a", lens, 2.2), at=(sx * 0.05, 0, radius * 0.95 + 0.026), rot=(90, 0, 0), radius=0.037, depth=0.02, verts=10))
    objs.append(piece("box", dark, at=(0, 0, radius * 1.0), size=(0.04, 0.03, 0.03), bevel=0.004))
    return _done(objs, "goggles")


def cocoon_husk(height=1.0, width=0.5, color="#bfc3a0", glow="#7dff6a", seed=1):
    """A torn silk-and-flesh cocoon husk: a tall ovoid, ridged, with a dark rent. Origin at the base, grows up."""
    husk = M("flesh", color, glow, 0.3)
    dark = M("matte", "#1c2616")
    objs = [piece("sphere", husk, at=(0, height * 0.5, 0), radius=width * 0.5, squash=(1, height / width, 0.85), verts=10, rings=6)]
    for t in (0.3, 0.55, 0.78):
        k = math.sin(math.pi * t) * 1.0
        objs.append(piece("torus", husk, at=(0, height * t, 0), radius=width * 0.5 * k * 1.0, tube=0.022, verts=12, squash=(1, 1, 1)))
    objs.append(piece("sphere", dark, at=(0, height * 0.52, width * 0.34), radius=width * 0.2, squash=(0.55, 2.0, 0.5), verts=7, rings=4))
    return _done(objs, "husk")


def fungus_shelf(tiers=3, radius=0.22, seed=1, color="#8a7a4a", glow="#7affd8"):
    """Bracket fungus: stacked half-round shelves stepping out sideways, glowing underneath. Origin at the trunk, shelves extend along +x."""
    rng = random.Random(seed)
    top = M("matte", color)
    under = M("glow", "#2a5a4a", glow, 1.8)
    objs = []
    for i in range(tiers):
        r = radius * (1.0 - 0.22 * i)
        y = 0.1 * i
        x = r * 0.55 + 0.03 * i
        objs.append(piece("cyl", top, at=(x, y + 0.03, 0), rot=(0, rng.uniform(0, 40), 0), radius=r, depth=0.045, verts=9))
        objs.append(piece("cyl", under, at=(x, y + 0.002, 0), radius=r * 0.88, depth=0.02, verts=9))
    objs.append(piece("cyl", top, at=(0, 0.1, 0), radius=0.045, depth=0.22, verts=6))
    return _done(objs, "shelf")


def insect_wings(span=0.34, color="#d8ffb0", glow="#b8ff5a", abdomen="#4a6a2a"):
    """Insect rig for a stand-in drone: two pairs of big thin wings on the back, a banded abdomen and a stinger behind (-z)."""
    wing = M("glow", color, glow, 0.5)
    flesh = M("flesh", abdomen, glow, 0.5)
    objs = []
    for sx in (-1, 1):
        objs.append(piece("sphere", wing, at=(sx * span * 0.9, 0.05, -0.05), rot=(0, sx * -12, sx * 18), radius=span, squash=(1.0, 0.03, 0.42), verts=8, rings=3))
        objs.append(piece("sphere", wing, at=(sx * span * 0.75, 0.0, -0.2), rot=(0, sx * 14, sx * 8), radius=span * 0.75, squash=(1.0, 0.03, 0.38), verts=8, rings=3))
    objs.append(piece("sphere", flesh, at=(0, -0.03, -0.3), radius=0.13, squash=(0.9, 0.9, 1.7), verts=8, rings=5))
    objs.append(piece("cone", M("rust", "#3a2a1a"), at=(0, -0.07, -0.66), rot=(-100, 0, 0), radius=0.035, depth=0.24, verts=5))
    return _done(objs, "insect")


def spike_crown(count=7, radius=0.13, height=0.22, color="#cfc6a0", seed=1):
    """A crown of bone horns on a band, leaning out. Origin at the brow."""
    rng = random.Random(seed)
    bone = M("matte", color)
    objs = [piece("cyl", bone, at=(0, 0.02, 0), radius=radius, depth=0.05, verts=10)]
    for i in range(count):
        a = 2 * math.pi * i / count
        h = height * rng.uniform(0.7, 1.0) * (1.2 if i % 2 == 0 else 0.85)
        objs.append(piece("cone", bone, at=(math.cos(a) * radius, 0.04 + h / 2, math.sin(a) * radius), rot=(math.sin(a) * 20, 0, -math.cos(a) * 20), radius=0.03, depth=h, verts=5))
    return _done(objs, "crown")


def tube(points, radius=0.03, sides=5, taper=0.4, kind="flesh", color="#4a7a2a", glow="#8aff5a", strength=0.3, leaves=0, leaf_color="#3f7a2a"):
    """A vine or root along a curve (game axes, metres; origin at the first point), optionally with leaf blades along it."""
    pts = [tuple(_b(p)) for p in points]
    mat = M(kind, color, glow, strength)
    objs = [lib.tube_along_curve(pts, radius, sides, taper, mat, "vine", 2)]
    rng = random.Random(len(points) * 7 + int(radius * 1000))
    leaf = M("matte", leaf_color)
    for i in range(leaves):
        t = (i + 1) / (leaves + 1)
        idx = min(int(t * (len(points) - 1)), len(points) - 2)
        f = t * (len(points) - 1) - idx
        p = [points[idx][k] * (1 - f) + points[idx + 1][k] * f for k in range(3)]
        side = 1 if i % 2 == 0 else -1
        objs.append(piece("sphere", leaf, at=(p[0] + side * 0.07, p[1], p[2]), rot=(rng.uniform(-20, 20), rng.uniform(0, 90), side * 40), radius=0.1, squash=(1.0, 0.12, 0.45), verts=6, rings=3))
    return _done(objs, "vine")


def harvest_blade(length=1.2, radius=0.6, color="#6a5a28", edge="#9aa0a0", glow="#5dff6a", sweep=110):
    """A great curved harvesting scythe: a pole up +Y, then a blade sweeping over towards +z along a quarter-circle. Origin at the mount."""
    metal = M("rust", color)
    steel = M("metal", edge)
    objs = [piece("cyl", metal, at=(0, length / 2, 0), radius=0.08, depth=length, verts=7), piece("sphere", metal, at=(0, 0.02, 0), radius=0.09, verts=6, rings=3)]
    segs = 5
    for i in range(segs):
        t0 = math.radians(sweep * i / segs)
        t1 = math.radians(sweep * (i + 1) / segs)
        tm = (t0 + t1) / 2
        seg = 2 * radius * math.sin((t1 - t0) / 2)
        w = 0.26 * (1.0 - 0.65 * i / segs)
        objs.append(piece("box", steel, at=(0, length + radius * math.sin(tm), radius * (1 - math.cos(tm))), rot=(math.degrees(tm), 0, 0), size=(0.035, seg * 1.04, w), bevel=0.006))
    objs.append(piece("sphere", M("glow", "#2a5a1a", glow, 2.0), at=(0, length * 0.8, 0.0), radius=0.06, verts=6, rings=3))
    return _done(objs, "blade")


def glass_shards(count=6, radius=0.12, height=0.5, seed=4, color="#a8d8cc", glow="#7affd8"):
    """Shards of a broken glass dome, standing in a rough ring and leaning out. Origin at the centre, grows up."""
    rng = random.Random(seed)
    glass = M("crystal", color, glow, 0.5)
    objs = []
    for i in range(count):
        a = 2 * math.pi * i / count + rng.uniform(-0.3, 0.3)
        h = height * rng.uniform(0.5, 1.0)
        objs.append(piece("cone", glass, at=(math.cos(a) * radius, h / 2 - 0.02, math.sin(a) * radius), rot=(math.sin(a) * 22, 0, -math.cos(a) * 22), radius=0.055, depth=h, verts=4))
    return _done(objs, "glass")


BUILDERS = {
    "sac_cluster": sac_cluster,
    "tank_pair": tank_pair,
    "nozzle": nozzle,
    "charred_plate": charred_plate,
    "dome_crack": dome_crack,
    "burner_ring": burner_ring,
    "censer": censer,
    "mitre": mitre,
    "halo_ring": halo_ring,
    "pauldron": pauldron,
    "brazier": brazier,
    "officer_cap": officer_cap,
    "coat_flap": coat_flap,
    "epaulette": epaulette,
    "crystal_group": crystal_group,
    "moss_clump": moss_clump,
    "flower_bloom": flower_bloom,
    "goggles": goggles,
    "cocoon_husk": cocoon_husk,
    "fungus_shelf": fungus_shelf,
    "insect_wings": insect_wings,
    "spike_crown": spike_crown,
    "tube": tube,
    "harvest_blade": harvest_blade,
    "glass_shards": glass_shards,
}
