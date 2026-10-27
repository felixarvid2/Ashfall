"""Builders for the named-NPC accessories, the ground-loot models and the interactable models (scripts/blender/spec/npcs_loot.json).

Same conventions as builders_regions123.py (it supplies `piece`, `M`, `_done`): everything is authored in GAME axes
(x = the creature's left, y up, z forward), a part's origin is its attach point and it is built at the size it has on a
1.75 m NPC. Frames used by the NPC parts (the joint is the variant's `bone`):

- head parts: origin at the Head joint (the base of the skull); the head centre is at y = 0.12, the face is at z = +0.1.
- neck parts: origin at the neck joint. Chest and back parts: origin at Spine01 (the middle of the chest), the back is z = -0.14.
- hip parts: origin at Hips (the belt line).

Materials are plain colours. Deterministic (no random state).
"""
import math

import lib
from builders_regions123 import M, _done, piece

# --------------------------------------------------------------------------- helpers


def _arc(objs, mat, centre, radius, a0, a1, n, thick, plane="xy"):
    """A band of `n` boxes along an arc from angle a0 to a1 (degrees; 90 = straight up) in the game XY (over the head, across)
    or ZY (front to back over the head) plane."""
    for i in range(n):
        a = math.radians(a0 + (a1 - a0) * (i + 0.5) / n)
        step = abs(math.radians(a1 - a0)) / n
        seg = 2 * radius * math.sin(step / 2) * 1.12
        c, s = math.cos(a), math.sin(a)
        if plane == "xy":
            objs.append(piece("box", mat, at=(centre[0] + c * radius, centre[1] + s * radius, centre[2]), rot=(0, 0, math.degrees(a)), size=(thick, seg, thick), bevel=0.003))
        else:
            objs.append(piece("box", mat, at=(centre[0], centre[1] + s * radius, centre[2] + c * radius), rot=(-(math.degrees(a)) + 180, 0, 0), size=(thick, seg, thick), bevel=0.003))


def _lift(objs, dy):
    """Move pieces up by dy metres (game Y)."""
    for o in objs:
        o.location.z += dy
    return objs


def _glow(color, glow, strength=2.0):
    return M("glow", color, glow, strength)


# --------------------------------------------------------------------------- headwear (origin: the Head joint)


def toque(color="#ece6d4", band="#cfc8b2", height=0.2):
    """A tall puffed cook's toque: a band and a mushroom of pleated cloth. Base of the hat at y = 0.15."""
    cloth = M("cloth", color)
    objs = [
        piece("cyl", M("cloth", band), at=(0, 0.17, 0), radius=0.118, depth=0.06, verts=9),
        piece("cyl", cloth, at=(0, 0.17 + 0.03 + height * 0.35, 0), radius=0.105, radius2=0.14, depth=height * 0.7, verts=9),
        piece("sphere", cloth, at=(0, 0.2 + height * 0.7, 0), radius=0.15, squash=(1, 0.62, 1), verts=9, rings=4),
    ]
    return _done(_lift(objs, 0.045), "toque")


def cap(color="#5a4632", kind="flat", brim="#3a2c1e", band=None):
    """A soft cap on the crown: `flat` (a cabbie cap with a short peak) or `beanie` (a knit cap with a turned-up cuff)."""
    cloth = M("cloth", color)
    objs = []
    if kind == "beanie":
        objs.append(piece("sphere", cloth, at=(0, 0.15, 0), radius=0.125, squash=(1, 0.95, 1.02), verts=9, rings=5))
        objs.append(piece("cyl", M("cloth", brim), at=(0, 0.155, 0), radius=0.128, depth=0.055, verts=10))
        objs.append(piece("sphere", M("cloth", brim), at=(0, 0.275, 0), radius=0.03, verts=6, rings=3))
    else:
        objs.append(piece("sphere", cloth, at=(0, 0.17, 0.0), radius=0.13, squash=(1.05, 0.62, 1.12), verts=9, rings=4))
        objs.append(piece("cyl", cloth, at=(0, 0.15, 0), radius=0.125, depth=0.04, verts=9))
        objs.append(piece("box", M("cloth", brim), at=(0, 0.16, 0.13), rot=(-8, 0, 0), size=(0.17, 0.014, 0.085), bevel=0.004))
    if band:
        objs.append(piece("cyl", M("cloth", band), at=(0, 0.168, 0), radius=0.129, depth=0.02, verts=9))
    return _done(_lift(objs, 0.05), "cap")


def hardhat(color="#e8b020", lamp=None, muffs=None, stripe=None, number=False):
    """A hard hat: dome, brim, ridge. `lamp` is a glow colour for a headlamp on the front, `muffs` a colour for ear defenders
    (a band over the crown and two cups), `stripe` a colour for a band round the dome."""
    shell = M("metal", color)
    dark = M("metal", "#33302c")
    objs = [
        piece("sphere", shell, at=(0, 0.16, 0), radius=0.135, squash=(1.0, 0.82, 1.08), verts=9, rings=4),
        piece("cyl", shell, at=(0, 0.15, 0), radius=0.14, depth=0.03, verts=10),
        piece("box", shell, at=(0, 0.162, 0.13), rot=(-6, 0, 0), size=(0.2, 0.015, 0.075), bevel=0.004),
        piece("box", shell, at=(0, 0.285, -0.01), size=(0.035, 0.03, 0.2), bevel=0.006),
    ]
    if stripe:
        objs.append(piece("cyl", M("metal", stripe), at=(0, 0.2, 0), radius=0.133, depth=0.022, verts=9))
    if lamp:
        objs.append(piece("cyl", dark, at=(0, 0.215, 0.135), rot=(90, 0, 0), radius=0.032, depth=0.04, verts=7))
        objs.append(piece("cyl", _glow("#3a3a30", lamp, 3.0), at=(0, 0.215, 0.158), rot=(90, 0, 0), radius=0.022, depth=0.012, verts=7))
    if muffs:
        pad = M("cloth", muffs)
        _arc(objs, dark, (0, 0.12, 0), 0.135, 20, 160, 6, 0.016)
        for sx in (-1, 1):
            objs.append(piece("cyl", pad, at=(sx * 0.125, 0.1, 0), rot=(0, 0, 90), radius=0.05, depth=0.05, verts=8))
    return _done(_lift(objs, 0.02), "hardhat")


def goggles_up(strap="#2a2622", lens="#e8a020", glow=None, rim="#6a6258"):
    """Goggles pushed up on the forehead: a strap round the head and two round lenses tipped up at the front."""
    dark = M("cloth", strap)
    metal = M("metal", rim)
    lens_mat = _glow("#40382a", glow, 1.4) if glow else M("crystal", lens)
    objs = [piece("cyl", dark, at=(0, 0.175, -0.005), radius=0.112, depth=0.04, verts=11)]
    for sx in (-1, 1):
        objs.append(piece("cyl", metal, at=(sx * 0.05, 0.215, 0.1), rot=(60, 0, 0), radius=0.046, depth=0.04, verts=9))
        objs.append(piece("cyl", lens_mat, at=(sx * 0.05, 0.226, 0.118), rot=(60, 0, 0), radius=0.036, depth=0.02, verts=9))
    objs.append(piece("box", dark, at=(0, 0.2, 0.108), size=(0.04, 0.025, 0.02), bevel=0.003))
    return _done(objs, "goggles")


def headset(band="#2a2d30", cup="#d8a020", mic=True, antenna=False, glow="#5ae0ff", big=False):
    """A headset: a band over the crown, an ear cup each side, an optional mic boom to the mouth and a whip antenna.
    `big` makes it a pair of large studio headphones (the Listener)."""
    dark = M("metal", band)
    cups = M("metal", cup)
    r = 0.062 if big else 0.045
    objs = []
    _arc(objs, dark, (0, 0.11, 0), 0.128, 12, 168, 7, 0.018 if not big else 0.026)
    for sx in (-1, 1):
        objs.append(piece("cyl", cups, at=(sx * 0.128, 0.1, -0.005), rot=(0, 0, 90), radius=r, depth=0.05 if big else 0.04, verts=9))
        objs.append(piece("cyl", dark, at=(sx * 0.15, 0.1, -0.005), rot=(0, 0, 90), radius=r * 0.7, depth=0.015, verts=8))
    if mic:
        objs.append(piece("cyl", dark, at=(0.12, 0.05, 0.05), rot=(70, 0, 8), radius=0.007, depth=0.12, verts=4))
        objs.append(piece("sphere", _glow("#303030", glow, 1.5), at=(0.07, 0.03, 0.105), radius=0.016, verts=6, rings=3))
    if antenna:
        objs.append(piece("cyl", dark, at=(-0.14, 0.28, -0.02), rot=(0, 0, 8), radius=0.006, depth=0.36, verts=4))
        objs.append(piece("sphere", _glow("#303030", glow, 2.5), at=(-0.155, 0.46, -0.02), radius=0.016, verts=5, rings=3))
    return _done(objs, "headset")


def respirator(color="#d8d8cc", filt="#4a4a44", strap="#2a2a28", lamp=None):
    """A half-mask respirator over nose and mouth with two round filters, and a strap round the head."""
    shell = M("rust", color)
    dark = M("metal", filt)
    objs = [
        piece("sphere", shell, at=(0, 0.045, 0.085), radius=0.062, squash=(1.2, 0.95, 0.8), verts=8, rings=4),
        piece("cyl", M("cloth", strap), at=(0, 0.09, -0.004), radius=0.108, depth=0.022, verts=10),
    ]
    for sx in (-1, 1):
        objs.append(piece("cyl", dark, at=(sx * 0.062, 0.035, 0.12), rot=(75, 0, 0), radius=0.032, depth=0.04, verts=8))
        if lamp:
            objs.append(piece("cyl", _glow("#303030", lamp, 2.0), at=(sx * 0.062, 0.032, 0.142), rot=(75, 0, 0), radius=0.018, depth=0.01, verts=7))
    return _done(objs, "respirator")


def glasses(frame="#3a3430", lens="#b8d8e0", crack=False):
    """Round spectacles: two rings, a bridge and arms to the ears (cracked: one lens has a diagonal bar)."""
    rim = M("metal", frame)
    objs = []
    for sx in (-1, 1):
        objs.append(piece("torus", rim, at=(sx * 0.046, 0.13, 0.098), rot=(90, 0, 0), radius=0.034, tube=0.0065, verts=10))
        objs.append(piece("cyl", M("crystal", lens), at=(sx * 0.046, 0.13, 0.096), rot=(90, 0, 0), radius=0.031, depth=0.003, verts=9))
        objs.append(piece("box", rim, at=(sx * 0.098, 0.135, 0.045), size=(0.008, 0.008, 0.1), bevel=0.001))
    objs.append(piece("box", rim, at=(0, 0.137, 0.1), size=(0.03, 0.008, 0.008), bevel=0.001))
    if crack:
        objs.append(piece("box", M("metal", "#101010"), at=(0.046, 0.13, 0.108), rot=(0, 0, 40), size=(0.005, 0.07, 0.004), bevel=0.0005))
    return _done(objs, "glasses")


def scarf(color="#b02a20", trim="#7a1a14", tails=2, length=0.38):
    """A scarf wound round the neck with a knot and tails hanging down the chest. Origin at the neck joint."""
    cloth = M("cloth", color)
    edge = M("cloth", trim)
    objs = [
        piece("torus", cloth, at=(0, 0.035, 0.0), radius=0.09, tube=0.034, verts=12),
        piece("sphere", cloth, at=(0.045, 0.01, 0.105), radius=0.04, verts=6, rings=3),
    ]
    for i in range(tails):
        x = 0.03 + 0.05 * i
        objs.append(piece("box", cloth, at=(x, -length / 2 - 0.02, 0.118 + 0.01 * i), rot=(-4, 0, 4 - 8 * i), size=(0.07, length * (1 - 0.25 * i), 0.016), bevel=0.003))
        objs.append(piece("box", edge, at=(x + 0.004 * (1 - i), -length * (1 - 0.25 * i) - 0.015, 0.12 + 0.01 * i), rot=(-4, 0, 4 - 8 * i), size=(0.07, 0.022, 0.018), bevel=0.003))
    return _done(objs, "scarf")


def prayer_beads(color="#3a2a22", glow="#ff7a1a", count=11):
    """A rosary of wooden beads looped round the neck, hanging to the chest, with an ember charm. Origin at the neck joint."""
    bead = M("matte", color)
    objs = []
    for i in range(count):
        t = (i + 0.5) / count
        a = math.pi * (1 - t)  # from the right shoulder, down the chest, to the left
        x = math.cos(a) * 0.115
        y = 0.03 - math.sin(a) * 0.15
        z = 0.095 + math.sin(a) * 0.045
        objs.append(piece("sphere", bead, at=(x, y, z), radius=0.016, verts=6, rings=3))
    objs.append(piece("cyl", M("metal", "#5a5248"), at=(0, -0.2, 0.14), radius=0.004, depth=0.07, verts=4))
    objs.append(piece("sphere", M("ember", "#8a3010", glow, 3.0), at=(0, -0.25, 0.14), radius=0.026, verts=6, rings=3))
    return _done(objs, "beads")


def wisp_motes(count=5, radius=0.2, color="#bff8ff", glow="#7affff", height=0.36):
    """A loose ring of glowing motes floating over the head: the Whisper. Origin at the Head joint."""
    objs = []
    for i in range(count):
        a = 2 * math.pi * i / count
        objs.append(piece("sphere", _glow("#d8ffff", glow, 3.0), at=(math.cos(a) * radius, height + 0.04 * math.sin(a * 2), math.sin(a) * radius), radius=0.026 + 0.008 * (i % 2), verts=6, rings=3))
    objs.append(piece("torus", _glow("#a8e8f0", glow, 1.5), at=(0, height - 0.03, 0), radius=radius * 0.8, tube=0.004, verts=14))
    return _done(objs, "motes")


# --------------------------------------------------------------------------- chest, back and hip (origin: Spine01 / Hips)


def backpack(color="#4a5a3a", trim="#2a2a24", roll=None, kind="rucksack", band="#b02a20", height=0.4):
    """A pack on the back: `rucksack` (a canvas pack with a bedroll `roll` colour on top and pockets) or `crate` (a hard sealed
    box with a band across). Origin at the chest (Spine01); the pack's front face is at z = -0.14."""
    cloth = M("cloth", color)
    dark = M("cloth", trim)
    objs = []
    if kind == "crate":
        objs.append(piece("box", M("metal", color), at=(0, 0.04, -0.23), size=(0.34, height, 0.18), bevel=0.012))
        objs.append(piece("box", M("metal", band), at=(0, 0.04, -0.23), size=(0.352, 0.07, 0.192), bevel=0.006))
        objs.append(piece("box", dark, at=(0, 0.04 + height / 2 - 0.02, -0.23), size=(0.2, 0.03, 0.2), bevel=0.006))
        for sx in (-1, 1):
            objs.append(piece("box", dark, at=(sx * 0.1, 0.0, -0.137), size=(0.035, 0.34, 0.02), bevel=0.003))
    else:
        objs.append(piece("box", cloth, at=(0, 0.02, -0.225), size=(0.3, height * 0.85, 0.165), bevel=0.03))
        objs.append(piece("box", dark, at=(0, -0.07, -0.325), size=(0.24, 0.17, 0.05), bevel=0.012))
        objs.append(piece("box", dark, at=(0, 0.12, -0.26), size=(0.26, 0.03, 0.18), bevel=0.006))
        for sx in (-1, 1):
            objs.append(piece("box", dark, at=(sx * 0.1, 0.02, -0.137), size=(0.035, 0.32, 0.02), bevel=0.003))
            objs.append(piece("box", dark, at=(sx * 0.17, -0.06, -0.225), size=(0.04, 0.16, 0.1), bevel=0.01))
        if roll:
            objs.append(piece("cyl", M("cloth", roll), at=(0, 0.02 + height * 0.425 + 0.05, -0.23), rot=(0, 0, 90), radius=0.07, depth=0.36, verts=9))
    return _done(objs, "pack")


def antenna_pack(color="#5a6068", trim="#2a2d30", glow="#5ae0ff", mast=0.7, dish=False):
    """A radio pack: a box with a dial and a whip antenna, optionally a small dish. Origin at the chest, the pack on the back."""
    shell = M("metal", color)
    dark = M("metal", trim)
    objs = [
        piece("box", shell, at=(0, 0.04, -0.215), size=(0.26, 0.3, 0.145), bevel=0.012),
        piece("box", dark, at=(0, 0.09, -0.292), size=(0.18, 0.08, 0.012), bevel=0.003),
        piece("sphere", _glow("#303030", glow, 2.5), at=(-0.05, 0.09, -0.3), radius=0.016, verts=6, rings=3),
        piece("sphere", _glow("#303030", glow, 2.5), at=(0.05, 0.09, -0.3), radius=0.016, verts=6, rings=3),
        piece("cyl", dark, at=(0.1, 0.19 + mast / 2, -0.24), rot=(-4, 0, 0), radius=0.008, depth=mast, verts=4),
        piece("sphere", _glow("#303030", glow, 3.0), at=(0.1, 0.19 + mast, -0.25), radius=0.02, verts=5, rings=3),
    ]
    for sx in (-1, 1):
        objs.append(piece("box", dark, at=(sx * 0.09, 0.02, -0.137), size=(0.03, 0.3, 0.02), bevel=0.003))
    if dish:
        objs.append(piece("sphere", shell, at=(-0.08, 0.3, -0.25), rot=(-100, 0, 0), radius=0.1, squash=(1, 1, 0.22), verts=9, rings=3))
        objs.append(piece("cyl", dark, at=(-0.08, 0.24, -0.25), radius=0.01, depth=0.1, verts=4))
    return _done(objs, "radio")


def filter_pack(color="#d8dad4", trim="#2a3a3a", glow="#7affd8"):
    """A filter pack: a flat box with three upright filter canisters and a hose loop. Origin at the chest, on the back."""
    shell = M("metal", trim)
    can = M("metal", color)
    objs = [piece("box", shell, at=(0, 0.0, -0.205), size=(0.3, 0.26, 0.12), bevel=0.012)]
    for i, x in enumerate((-0.09, 0.0, 0.09)):
        objs.append(piece("cyl", can, at=(x, 0.19, -0.23), radius=0.04, depth=0.2, verts=8))
        objs.append(piece("cyl", _glow("#303a38", glow, 2.0), at=(x, 0.3, -0.23), radius=0.026, depth=0.012, verts=7))
    objs.append(piece("torus", M("cloth", "#1c1c1c"), at=(0.12, 0.24, -0.2), rot=(0, 0, 90), radius=0.07, tube=0.012, verts=10))
    return _done(objs, "filters")


def tuning_fork(color="#cfd4d8", glow="#7affd8", size=0.4):
    """A big tuning fork on the back, handle down in a holster, prongs up with a glowing hum between them. Origin at the chest."""
    steel = M("metal", color)
    objs = [
        piece("box", M("cloth", "#2a2a2a"), at=(0, -0.05, -0.2), size=(0.2, 0.2, 0.1), bevel=0.01),
        piece("cyl", steel, at=(0, 0.12, -0.22), radius=0.016, depth=0.2, verts=6),
        piece("box", steel, at=(0, 0.23, -0.22), size=(0.15, 0.025, 0.025), bevel=0.003),
        piece("sphere", _glow("#304038", glow, 3.0), at=(0, 0.23 + size * 0.5, -0.22), radius=0.028, verts=6, rings=3),
    ]
    for sx in (-1, 1):
        objs.append(piece("box", steel, at=(sx * 0.07, 0.23 + size * 0.45, -0.22), size=(0.04, size * 0.9, 0.045), bevel=0.005))
    return _done(objs, "fork")


def pick_back(handle="#6a4a2a", head="#6a6e72", length=0.78):
    """A pickaxe strapped across the back, head up on the left. Origin at the chest."""
    wood = M("matte", handle)
    steel = M("metal", head)
    objs = [
        piece("cyl", wood, at=(0.02, 0.02, -0.17), rot=(0, 0, -16), radius=0.016, depth=length, verts=6),
        piece("box", steel, at=(0.17, 0.02 + length * 0.47, -0.17), rot=(0, 0, -16), size=(0.28, 0.035, 0.04), bevel=0.006),
        piece("box", M("cloth", "#2a2420"), at=(0.0, -0.02, -0.17), rot=(0, 0, -16), size=(0.04, 0.05, 0.04), bevel=0.004),
        piece("box", M("cloth", "#2a2420"), at=(-0.085, -0.25, -0.17), rot=(0, 0, -16), size=(0.04, 0.05, 0.04), bevel=0.004),
    ]
    return _done(objs, "pick")


def satchel(color="#6a4a2e", strap="#3a2a1c", tubes=True, flap="#4a3220"):
    """A shoulder satchel: a strap running down the chest to a bag on the left hip with a flap, and scroll tubes. Origin at the chest."""
    leather = M("cloth", color)
    dark = M("cloth", strap)
    objs = [
        piece("box", dark, at=(0.07, -0.16, 0.0), rot=(0, 0, -32), size=(0.034, 0.56, 0.3), bevel=0.003),
        piece("box", leather, at=(0.22, -0.34, 0.0), size=(0.075, 0.22, 0.27), bevel=0.014),
        piece("box", M("cloth", flap), at=(0.22, -0.26, 0.0), size=(0.082, 0.1, 0.28), bevel=0.01),
        piece("box", M("metal", "#8a7a4a"), at=(0.264, -0.27, 0.0), size=(0.01, 0.03, 0.03), bevel=0.002),
    ]
    if tubes:
        for i, z in enumerate((-0.06, 0.04)):
            objs.append(piece("cyl", M("cloth", "#d8cca8"), at=(0.22, -0.18 + 0.02 * i, z), rot=(0, 0, 8 - 14 * i), radius=0.022, depth=0.2, verts=7))
    return _done(objs, "satchel")


def toolbelt(belt="#4a3a2a", pouch="#6a4a2a", tool="hammer", metal="#8a8e92", handle="#6a4a2a"):
    """A belt with pouches and a tool hung on the left hip (`hammer`, `wrench` or `none`). Origin at the hips (the belt line)."""
    leather = M("cloth", belt)
    bag = M("cloth", pouch)
    steel = M("metal", metal)
    wood = M("matte", handle)
    ring = piece("torus", leather, at=(0, 0.04, 0.0), radius=0.175, tube=0.022, verts=10)
    ring.scale = (1.12, 1.0, 0.85)
    objs = [
        ring,
        piece("box", M("metal", "#8a7a4a"), at=(0, 0.04, 0.138), size=(0.04, 0.035, 0.012), bevel=0.002),
        piece("box", bag, at=(-0.2, -0.0, 0.06), rot=(0, 55, 0), size=(0.08, 0.1, 0.05), bevel=0.004),
        piece("box", bag, at=(-0.12, -0.0, 0.14), rot=(0, 20, 0), size=(0.07, 0.09, 0.045), bevel=0.004),
        piece("box", bag, at=(0.0, -0.01, -0.17), size=(0.12, 0.09, 0.05), bevel=0.004),
    ]
    if tool == "hammer":
        objs.append(piece("cyl", wood, at=(0.25, -0.12, 0.03), rot=(0, 0, 4), radius=0.014, depth=0.32, verts=6))
        objs.append(piece("box", steel, at=(0.252, -0.255, 0.03), size=(0.04, 0.06, 0.11), bevel=0.006))
        objs.append(piece("box", M("cloth", "#2a2420"), at=(0.245, 0.0, 0.03), size=(0.03, 0.05, 0.04), bevel=0.004))
    elif tool == "wrench":
        objs.append(piece("cyl", steel, at=(0.25, -0.12, 0.03), rot=(0, 0, 4), radius=0.012, depth=0.3, verts=6))
        objs.append(piece("torus", steel, at=(0.252, -0.28, 0.03), rot=(0, 0, 90), radius=0.028, tube=0.011, verts=8))
        objs.append(piece("box", M("cloth", "#2a2420"), at=(0.245, 0.0, 0.03), size=(0.03, 0.05, 0.04), bevel=0.004))
    return _done(objs, "belt")


def pot_hip(pot="#6a6e72", lid="#4a4e52", ladle="#8a8e92"):
    """A cooking pot hung from the belt with a ladle sticking out of it: a trader-cook. Origin at the hips, on the left."""
    metal = M("metal", pot)
    objs = [
        piece("cyl", metal, at=(0.25, -0.17, 0.02), radius=0.075, depth=0.13, verts=9),
        piece("cyl", M("metal", lid), at=(0.25, -0.097, 0.02), radius=0.08, depth=0.016, verts=9),
        piece("sphere", M("metal", lid), at=(0.25, -0.08, 0.02), radius=0.016, verts=5, rings=3),
        piece("box", M("cloth", "#2a2420"), at=(0.25, -0.0, 0.02), size=(0.12, 0.03, 0.03), bevel=0.004),
        piece("cyl", M("metal", ladle), at=(0.21, -0.05, 0.075), rot=(0, 0, 25), radius=0.01, depth=0.26, verts=5),
        piece("sphere", M("metal", ladle), at=(0.125, 0.07, 0.075), radius=0.032, squash=(1, 0.5, 1), verts=7, rings=3),
        piece("box", metal, at=(0.325, -0.17, 0.02), size=(0.035, 0.03, 0.02), bevel=0.004),
    ]
    return _done(objs, "pot")


def flare_bandolier(strap="#3a3028", flare="#c02a1a", tip="#ff7a1a", count=5):
    """A bandolier across the chest with flare sticks standing in loops. Origin at the chest; the strap runs from the right shoulder to the left hip."""
    dark = M("cloth", strap)
    objs = [piece("box", dark, at=(0.0, -0.03, 0.137), rot=(0, 0, 38), size=(0.045, 0.5, 0.03), bevel=0.004)]
    dx, dy = -math.sin(math.radians(38)), math.cos(math.radians(38))
    for i in range(count):
        t = ((i + 0.5) / count - 0.5) * 0.42
        cx, cy = t * dx, -0.03 + t * dy
        objs.append(piece("cyl", M("matte", flare), at=(cx, cy + 0.01, 0.16), radius=0.019, depth=0.15, verts=6))
        objs.append(piece("cyl", M("ember", "#8a3010", tip, 2.5), at=(cx, cy + 0.093, 0.16), radius=0.016, depth=0.02, verts=6))
    return _done(objs, "flares")


def lantern(frame="#2a2622", glow="#ffb03a", height=0.2):
    """A hand lantern hung from a hook on the belt: a cage round a glowing flame. Origin at the hips on the left, hangs down."""
    metal = M("metal", frame)
    objs = [
        piece("cyl", metal, at=(0.25, -0.04, 0.03), radius=0.012, depth=0.08, verts=4),
        piece("cyl", metal, at=(0.25, -0.1, 0.03), radius=0.045, radius2=0.03, depth=0.04, verts=7),
        piece("cyl", _glow("#4a3a20", glow, 3.5), at=(0.25, -0.1 - height * 0.5, 0.03), radius=0.04, depth=height * 0.7, verts=7),
        piece("cyl", metal, at=(0.25, -0.1 - height, 0.03), radius=0.048, depth=0.03, verts=7),
    ]
    for a in range(4):
        x = 0.25 + math.cos(a * math.pi / 2 + 0.4) * 0.043
        z = 0.03 + math.sin(a * math.pi / 2 + 0.4) * 0.043
        objs.append(piece("cyl", metal, at=(x, -0.1 - height * 0.5, z), radius=0.005, depth=height * 0.85, verts=4))
    return _done(objs, "lantern")


def armband(color="#c0281c", stripe="#f0e8d8", width=0.07):
    """A band round the upper arm. Origin on the arm's joint; the arm lies along x in the bind pose (put it on LeftArm or RightArm)."""
    objs = [piece("cyl", M("cloth", color), at=(0, 0, 0), rot=(0, 0, 90), radius=0.062, depth=width, verts=10)]
    objs.append(piece("cyl", M("cloth", stripe), at=(0, 0, 0), rot=(0, 0, 90), radius=0.0635, depth=width * 0.3, verts=10))
    return _done(objs, "armband")


def shoulder_guard(color="#4a3a2a", stud="#8a7a4a", radius=0.115):
    """A leather shoulder guard: a half-dome with a strap and three brass studs. Origin at the shoulder joint, covers the top."""
    leather = M("cloth", color)
    objs = [piece("sphere", leather, at=(0, 0.02, 0), radius=radius, squash=(1.2, 0.55, 1.05), verts=9, rings=4), piece("torus", M("cloth", "#2a2018"), at=(0, 0.0, 0), radius=radius * 1.12, tube=0.012, verts=12)]
    for i in range(3):
        a = (i - 1) * 0.6
        objs.append(piece("sphere", M("metal", stud), at=(math.sin(a) * radius * 0.7, 0.05 + 0.02 * math.cos(a), math.cos(a) * radius * 0.5), radius=0.011, verts=5, rings=3))
    return _done(objs, "guard")


def cloak(color="#7c8c98", trim="#7affff", length=0.85, width=0.3, glow=True):
    """A ragged cloak from the shoulders down the back: a flared half-cone of cloth with a glowing hem and shoulder drapes. Origin at the
    shoulders (Spine), the cloak hangs behind."""
    cloth = M("cloth", color)
    body = piece("cyl", cloth, at=(0, -length / 2, -0.06), radius=width * 1.2, radius2=0.15, depth=length, verts=10)
    body.scale = (1.0, 0.55, 1.0)  # Blender y = game -z: flatten front to back
    hem = _glow("#a8d8e0", trim, 1.8) if glow else M("cloth", trim)
    ring = piece("torus", hem, at=(0, -length + 0.02, -0.06), radius=width * 1.2, tube=0.012, verts=10)
    ring.scale = (1.0, 0.55, 1.0)
    objs = [body, ring]
    for sx in (-1, 1):
        objs.append(piece("sphere", cloth, at=(sx * 0.16, -0.01, -0.04), radius=0.09, squash=(1.2, 0.5, 1.0), verts=7, rings=3))
    return _done(objs, "cloak")


def coat_skirt(color="#e4e6e0", trim="#7aa890", length=0.55, top=0.2, bottom=0.29):
    """A lab coat's skirt: a flared cone of cloth round the hips down to the knees with a coloured hem. Origin at the hips."""
    cloth = M("cloth", color)
    body = piece("cyl", cloth, at=(0, 0.02 - length / 2, 0), radius=bottom, radius2=top, depth=length, verts=10)
    body.scale = (1.0, 0.82, 1.0)  # Blender y = game z: a little flatter front to back
    hem = piece("torus", M("cloth", trim), at=(0, 0.03 - length, 0), radius=bottom, tube=0.014, verts=10)
    hem.scale = (1.0, 0.82, 1.0)
    pocket = piece("box", M("cloth", trim), at=(0.1, -0.12, 0.2), size=(0.09, 0.07, 0.015), bevel=0.003)
    return _done([body, hem, pocket], "skirt")


def vest(color="#e86a10", stripe="#e8e8d8", back=True):
    """A hi-vis vest: front and back panels over the shoulders with two reflective stripes. Origin at the chest."""
    cloth = M("cloth", color)
    band = M("matte", stripe)
    objs = []
    for z, sz in ((0.125, 1), (-0.15, -1)):
        objs.append(piece("box", cloth, at=(0, 0.0, z), size=(0.27, 0.32, 0.022), bevel=0.006))
        for y in (-0.04, 0.1):
            objs.append(piece("box", band, at=(0, y, z + sz * 0.01), size=(0.28, 0.035, 0.012), bevel=0.002))
    for sx in (-1, 1):
        objs.append(piece("box", cloth, at=(sx * 0.12, 0.18, 0.0), size=(0.06, 0.03, 0.3), bevel=0.004))
    return _done(objs, "vest")


# --------------------------------------------------------------------------- ground loot (whole models, game axes)


def loot_cache(color="#3a3630", wrap="#5a5044", trim="#c8c8c8", glow=None):
    """A small item cache: a wrapped gear bundle in a strapped crate, about 0.42 x 0.26 x 0.3 m. The `trim` colour (corner caps and
    clasp) is one the game retints per rarity. Stands on y = 0."""
    box = M("metal", color)
    cloth = M("cloth", wrap)
    trim_m = M("metal", trim)
    objs = [
        piece("box", box, at=(0, 0.1, 0), size=(0.42, 0.2, 0.3), bevel=0.014),
        piece("box", cloth, at=(0, 0.225, 0), size=(0.36, 0.07, 0.25), bevel=0.02),  # the bundle on top
        piece("box", cloth, at=(-0.085, 0.2, 0), size=(0.04, 0.14, 0.31), bevel=0.008),  # straps
        piece("box", cloth, at=(0.085, 0.2, 0), size=(0.04, 0.14, 0.31), bevel=0.008),
        piece("box", trim_m, at=(0, 0.2, 0.158), size=(0.07, 0.07, 0.014), bevel=0),  # clasp
        piece("box", trim_m, at=(0, 0.2, -0.158), size=(0.07, 0.07, 0.014), bevel=0),
    ]
    for sx in (-1, 1):
        for sz in (-1, 1):
            objs.append(piece("box", trim_m, at=(sx * 0.2, 0.19, sz * 0.14), size=(0.04, 0.045, 0.04), bevel=0))
    return _done(objs, "cache")


def loot_crystal(count=4, glow="#5ac8ff", color="#9fe6ff", strength=2.5):
    """A Lumen crystal pickup: a cluster of faceted shards on a stub of rock, standing up, 0.34 m tall. The game retints it per crystal."""
    mat = M("crystal", color, glow, strength)
    rock = M("rust", "#2c2a2e")
    objs = [piece("cyl", rock, at=(0, 0.02, 0), radius=0.1, radius2=0.075, depth=0.04, verts=7)]
    layout = [(0, 0, 0.3, 0.06, 0, 0), (0.07, 0.03, 0.2, 0.045, -14, -12), (-0.06, 0.04, 0.22, 0.045, 12, 14), (0.01, -0.07, 0.16, 0.04, 20, 0)]
    for i, (x, z, h, r, tx, tz) in enumerate(layout[:count]):
        objs.append(piece("cone", mat, at=(x, 0.04 + h / 2, z), rot=(tx, 0, tz), radius=r, depth=h, verts=5))
        objs.append(piece("cone", mat, at=(x, 0.04 + h * 0.2, z), rot=(tx, 0, tz), radius=r, radius2=r * 0.85, depth=h * 0.4, verts=5))
    return _done(objs, "crystal")


def loot_gold(coins=9, color="#d9a640", rim="#a87a20"):
    """A pile of scrap-credit coins: stacks and scattered discs with a small pouch, 0.12 m tall. Stands on y = 0."""
    gold = M("metal", color)
    dark = M("metal", rim)
    objs = []
    stack = [(0.0, 0.0, 3), (0.075, 0.03, 3), (-0.06, 0.05, 2), (0.02, -0.07, 2)]
    for x, z, n in stack:
        for k in range(n):
            objs.append(piece("cyl", gold if k % 2 == 0 else dark, at=(x + 0.004 * k, 0.012 + 0.022 * k, z), radius=0.05, depth=0.02, verts=8))
    objs.append(piece("cyl", gold, at=(-0.09, 0.012, -0.06), rot=(6, 0, 0), radius=0.05, depth=0.02, verts=8))
    objs.append(piece("cyl", dark, at=(0.1, 0.012, -0.05), rot=(-5, 0, 8), radius=0.05, depth=0.02, verts=8))
    objs.append(piece("sphere", M("cloth", "#8a6a3a"), at=(-0.1, 0.05, 0.08), radius=0.05, squash=(1, 0.9, 1), verts=7, rings=4))
    return _done(objs, "gold")


# --------------------------------------------------------------------------- interactables (whole models)


def keycard(card="#cfd6da", stripe="#3ad2ff", glow="#3ad2ff", height=0.5):
    """An access keycard standing on a small cradle: a tall rounded card with a glowing stripe, a chip and a lanyard hole. 0.5 m tall."""
    plate = M("matte", card)
    objs = [
        piece("cyl", M("metal", "#2e2e32"), at=(0, 0.03, 0), radius=0.14, radius2=0.11, depth=0.06, verts=8),
        piece("box", M("metal", "#4a4a50"), at=(0, 0.075, 0), size=(0.22, 0.03, 0.06), bevel=0.006),
        piece("box", plate, at=(0, 0.09 + height * 0.5 - 0.04, 0), size=(0.3, height - 0.1, 0.03), bevel=0.01),
        piece("box", _glow("#203038", glow, 3.0), at=(0, 0.3, 0.017), size=(0.3, 0.06, 0.008), bevel=0.002),
        piece("box", M("metal", "#c8a030"), at=(-0.075, 0.42, 0.017), size=(0.07, 0.055, 0.008), bevel=0.003),
        piece("torus", M("metal", "#6a6e72"), at=(0, 0.52, 0.0), rot=(90, 0, 0), radius=0.022, tube=0.007, verts=8),
    ]
    for i in range(3):
        objs.append(piece("box", _glow("#203038", glow, 2.0), at=(0.04 + 0.04 * i, 0.19, 0.017), size=(0.025, 0.02, 0.008), bevel=0.001))
    return _done(objs, "keycard")


def rift_obelisk(stone="#2e2b3a", rune="#b48cff", height=2.1):
    """A rift obelisk: a tapering dark stone pillar on a stepped plinth, glowing violet rune bands and shards orbiting its head.
    About 2.1 m tall and 0.7 m wide at the foot."""
    rock = M("matte", stone)
    plinth = M("matte", "#454356")
    glow = _glow("#3a2a5a", rune, 3.0)
    r0, r1 = 0.36, 0.17  # radius at the foot and under the tip
    body = height - 0.6
    objs = [
        piece("cyl", plinth, at=(0, 0.06, 0), radius=0.7, depth=0.12, verts=8),
        piece("cyl", plinth, at=(0, 0.17, 0), radius=0.55, depth=0.1, verts=8),
        piece("cyl", rock, at=(0, 0.22 + body / 2, 0), radius=r0, radius2=r1, depth=body, verts=4, rot=(0, 45, 0)),
        piece("cone", rock, at=(0, 0.22 + body + 0.15, 0), radius=r1, depth=0.3, verts=4, rot=(0, 45, 0)),
    ]
    for y in (0.5, 0.9, 1.3, 1.62):
        r = r0 + (r1 - r0) * (y - 0.22) / body
        objs.append(piece("cyl", glow, at=(0, y, 0), radius=r * 1.04, depth=0.04, verts=4, rot=(0, 45, 0)))
    for i in range(4):  # a rune strip up the middle of each face
        a = i * math.pi / 2
        rr = r0 - (r0 - r1) * 0.45
        objs.append(piece("box", glow, at=(math.cos(a) * rr * 0.72, 0.95, math.sin(a) * rr * 0.72), size=(0.06, 0.8, 0.012), rot=(0, -math.degrees(a) + 90, 0), bevel=0.002))
    for i in range(3):
        a = 2 * math.pi * i / 3 + 0.5
        objs.append(piece("cone", glow, at=(math.cos(a) * 0.5, height - 0.7 + 0.2 * i, math.sin(a) * 0.5), radius=0.09, depth=0.3, verts=4, rot=(0, 20 * i, 180 if i % 2 else 0)))
    return _done(objs, "obelisk")


BUILDERS = {
    "toque": toque,
    "cap": cap,
    "hardhat": hardhat,
    "goggles_up": goggles_up,
    "headset": headset,
    "respirator": respirator,
    "glasses": glasses,
    "scarf": scarf,
    "prayer_beads": prayer_beads,
    "wisp_motes": wisp_motes,
    "backpack": backpack,
    "antenna_pack": antenna_pack,
    "filter_pack": filter_pack,
    "tuning_fork": tuning_fork,
    "pick_back": pick_back,
    "satchel": satchel,
    "toolbelt": toolbelt,
    "pot_hip": pot_hip,
    "flare_bandolier": flare_bandolier,
    "lantern": lantern,
    "armband": armband,
    "shoulder_guard": shoulder_guard,
    "cloak": cloak,
    "vest": vest,
    "coat_skirt": coat_skirt,
    "loot_cache": loot_cache,
    "loot_crystal": loot_crystal,
    "loot_gold": loot_gold,
    "keycard": keycard,
    "rift_obelisk": rift_obelisk,
}
