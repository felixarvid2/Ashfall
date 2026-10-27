"""Builders for scripts/blender/spec.json: each takes the entry's `params` and returns the Blender objects to export.

Add a builder here, then name it in the spec (`"builder": "<name>"`). They must be deterministic (a `seed` param, no
time or random state) so `npm run blender:build` reproduces the committed GLBs.
"""
import lib


def crystal_cluster(count=9, height=0.5, radius=0.05, spread=0.1, seed=1, sides=6, tilt=0.35, glow="#5ac8ff", strength=0.9, base=True, base_color="#3b2f27"):
    """Lumen crystals fanning out of a low rock. Origin at the middle of the base, growing along +Y in the game."""
    crystal = lib.lumen_crystal(glow=glow, strength=strength)
    rock = lib.rusted_metal(base_color, "cluster_rock")
    return [lib.crystal_cluster(count, height, radius, spread, seed, sides, tilt, crystal, rock, "cluster", base)]


def crystal_shard(height=0.22, radius=0.035, seed=1, sides=5, lean=0.12, glow="#5ac8ff", strength=0.9):
    """A single crystal shard: the smallest part, for heads, forearms, knuckles."""
    return [lib.crystal(height, radius, sides, lib.lumen_crystal(glow=glow, strength=strength), seed, "shard", lean=(lean, 0.0))]


def vine(points, radius=0.03, sides=5, taper=0.5, flesh="#6a7a3a", glow="#9dff5a", strength=0.6):
    """A tube along a curve through `points` (metres): spore vines, cables, tendrils. Origin at the first point."""
    return [lib.tube_along_curve(points, radius, sides, taper, lib.spore_flesh(flesh, glow, strength), "vine")]


MATERIALS = {
    "painted_metal": lib.painted_metal,
    "rusted_metal": lib.rusted_metal,
    "lumen_crystal": lambda color="#2a8fc0": lib.lumen_crystal(color),
    "ember_glow": lib.ember_glow,
    "spore_flesh": lib.spore_flesh,
    "rubber_cloth": lib.rubber_cloth,
}


def kitbash(pieces):
    """A model from bevelled primitives. `pieces`: [{"shape": box|cylinder|cone|sphere, "material": <preset>, "color": "#hex",
    "size": [x, y, z] (box) | "radius", "depth", "verts" | "radius" (sphere), "at": [x, y, z], "rotate": [deg x, y, z]}].
    Blender axes (Z up): the model stands on z=0."""
    import math

    objects = []
    for i, p in enumerate(pieces):
        make = MATERIALS[p.get("material", "painted_metal")]
        material = make(p["color"]) if "color" in p else make()
        at = p.get("at", [0, 0, 0])
        shape = p.get("shape", "box")
        if shape == "box":
            o = lib.bevel_box(p.get("size", [1, 1, 1]), p.get("bevel", 0.03), 1, material, f"box{i}", at)
        elif shape == "cylinder":
            o = lib.bevel_cylinder(p.get("radius", 0.3), p.get("depth", 1.0), p.get("verts", 12), p.get("bevel", 0.02), material, f"cyl{i}", at)
        elif shape == "cone":
            o = lib.bevel_cone(p.get("radius", 0.3), p.get("depth", 1.0), p.get("verts", 8), material, f"cone{i}", at)
        else:
            o = lib.low_sphere(p.get("radius", 0.3), p.get("verts", 8), p.get("rings", 6), material, f"sphere{i}", at)
        o.rotation_euler = [math.radians(a) for a in p.get("rotate", [0, 0, 0])]
        objects.append(o)
    return [lib.join(objects, "kitbash")]


BUILDERS = {"crystal_cluster": crystal_cluster, "crystal_shard": crystal_shard, "vine": vine, "kitbash": kitbash}

import builders_regions123  # noqa: E402  (Cinder Flats, Refinery, Vaults variants)

BUILDERS.update(builders_regions123.BUILDERS)

import builders_deep_core  # noqa: E402  (Deep Mines and Core variants)

BUILDERS.update(builders_deep_core.BUILDERS)

import builders_npcs_loot  # noqa: E402  (named NPC accessories, ground loot, interactable models)

BUILDERS.update(builders_npcs_loot.BUILDERS)
