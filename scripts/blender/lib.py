"""Blender helpers for Ashfall assets (docs/blender.md). Run inside Blender: blender -b --factory-startup -P script.py -- args

Conventions
- Metres, Blender's own axes while modelling (Z up, parts grow along +Z); the glTF exporter turns that into Y up, so a
  part grows along +Y in the game. The origin of a part is its attach point (the base of a crystal cluster).
- Parts carry material colours only: no textures, no UVs, so a part is a few KB (src/data/variants.ts).
- Colours are written as sRGB hex ('#5ac8ff'), like everywhere else in the game; `srgb` makes them linear for Blender.
"""
import math
import random
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector


def script_args():
    """Arguments after the `--` that separates Blender's own.

    Do not name a flag `--cycles...`: the Cycles add-on argparses sys.argv when it registers and fails on it,
    which leaves no Cycles engine (the contact sheet's `--glow` flag asks for the Cycles still)."""
    return sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


# --------------------------------------------------------------------------- scene


def clean_scene():
    """An empty scene with no leftovers (factory startup still has the default cube, camera and light)."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.images):
        for item in list(block):
            block.remove(item)
    return bpy.context.scene


def srgb(hex_color, alpha=1.0):
    """'#rrggbb' (sRGB, as in the game's data) to Blender's linear RGBA."""
    h = hex_color.lstrip("#")
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255.0
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (out[0], out[1], out[2], alpha)


# --------------------------------------------------------------------------- materials (colours only, no textures)


def make_material(name, color, metallic=0.0, roughness=0.6, emission=None, emission_strength=0.0, alpha=None):
    """A Principled BSDF with plain factors. Reused by name, so parts built in one session share materials."""
    mat = bpy.data.materials.get(name)
    if mat:
        return mat
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = srgb(color)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if emission:
        bsdf.inputs["Emission Color"].default_value = srgb(emission)
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    if alpha is not None:
        bsdf.inputs["Alpha"].default_value = alpha
        mat.blend_method = "BLEND"
    # The viewport colour, so the Workbench contact sheet shows the material's colour.
    mat.diffuse_color = srgb(color)
    return mat


def painted_metal(color="#6b7480", name=None):
    return make_material(name or "painted_metal" + color.lstrip("#"), color, metallic=0.7, roughness=0.42)


def rusted_metal(color="#6e3b22", name=None):
    return make_material(name or "rusted_metal" + color.lstrip("#"), color, metallic=0.55, roughness=0.82)


def lumen_crystal(color="#2a8fc0", glow="#5ac8ff", strength=2.2, name=None):
    """Lumen crystal: a cool translucent-looking body that glows (Deep Mines uses #5ac8ff, the Core #7affd8)."""
    return make_material(name or "lumen_crystal" + glow.lstrip("#"), color, metallic=0.1, roughness=0.18, emission=glow, emission_strength=strength)


def ember_glow(color="#c2410c", glow="#ff7a1a", strength=3.0, name=None):
    return make_material(name or "ember_glow" + glow.lstrip("#"), color, roughness=0.5, emission=glow, emission_strength=strength)


def spore_flesh(color="#6a7a3a", glow="#9dff5a", strength=0.6, name=None):
    """Organic / spore growth: damp, slightly luminous."""
    return make_material(name or "spore_flesh" + color.lstrip("#"), color, roughness=0.35, emission=glow, emission_strength=strength)


def rubber_cloth(color="#2b2d31", name=None):
    return make_material(name or "rubber_cloth" + color.lstrip("#"), color, roughness=0.95)


# --------------------------------------------------------------------------- mesh building


def _object_from_bmesh(bm, name, material=None, smooth=False):
    mesh = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = smooth
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    if material:
        obj.data.materials.append(material)
    return obj


def bevel_box(size=(1, 1, 1), bevel=0.03, segments=1, material=None, name="box", location=(0, 0, 0)):
    """Kitbash primitive: a box with bevelled edges (so it catches light), centred on `location`."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= size[0]
        v.co.y *= size[1]
        v.co.z *= size[2]
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=segments, affect="EDGES")
    obj = _object_from_bmesh(bm, name, material)
    obj.location = location
    return obj


def bevel_cylinder(radius=0.5, depth=1.0, verts=12, bevel=0.02, material=None, name="cylinder", location=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=verts, radius1=radius, radius2=radius, depth=depth)
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=1, affect="EDGES")
    obj = _object_from_bmesh(bm, name, material, smooth=verts >= 10)
    obj.location = location
    return obj


def bevel_cone(radius=0.5, depth=1.0, verts=8, material=None, name="cone", location=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=verts, radius1=radius, radius2=0.0, depth=depth)
    obj = _object_from_bmesh(bm, name, material)
    obj.location = location
    return obj


def low_sphere(radius=0.5, segments=8, rings=6, material=None, name="sphere", location=(0, 0, 0), squash=(1, 1, 1)):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=rings, radius=radius)
    for v in bm.verts:
        v.co.x *= squash[0]
        v.co.y *= squash[1]
        v.co.z *= squash[2]
    obj = _object_from_bmesh(bm, name, material, smooth=True)
    obj.location = location
    return obj


def crystal(length=0.4, radius=0.06, sides=6, material=None, seed=0, name="crystal", lean=(0.0, 0.0), twist=0.0):
    """One faceted crystal: a prism that swells a little, then a pointed tip off-centre. 5*sides-2 triangles.

    Grows from z=0 along +Z. `lean` moves the tip sideways (x, y) as a fraction of the length.
    """
    rng = random.Random(seed)
    bm = bmesh.new()
    rings = [(0.0, 0.92), (length * 0.18, 1.0), (length * 0.72, 0.9)]
    layers = []
    for z, k in rings:
        ring = []
        for i in range(sides):
            a = twist + 2 * math.pi * i / sides
            r = radius * k * (1.0 + rng.uniform(-0.12, 0.12))
            ring.append(bm.verts.new((math.cos(a) * r + lean[0] * z * 0.5, math.sin(a) * r + lean[1] * z * 0.5, z)))
        layers.append(ring)
    tip = bm.verts.new((lean[0] * length, lean[1] * length, length))
    for a, b in zip(layers[:-1], layers[1:]):
        for i in range(sides):
            j = (i + 1) % sides
            bm.faces.new((a[i], a[j], b[j], b[i]))
    top = layers[-1]
    for i in range(sides):
        bm.faces.new((top[i], top[(i + 1) % sides], tip))
    bm.faces.new(list(reversed(layers[0])))
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    return _object_from_bmesh(bm, name, material)


def crystal_cluster(count=9, height=0.5, radius=0.05, spread=0.1, seed=1, sides=6, tilt=0.35, material=None, base_material=None, name="cluster", base=True):
    """A cluster of crystals fanning out from one point: a tall centre, shorter ones around it, leaning outwards.

    Optional low-poly rock/flesh `base` the crystals sit in (material `base_material`). All one object, origin at the
    middle of the base, growth along +Z.
    """
    rng = random.Random(seed)
    material = material or lumen_crystal()
    parts = []
    for i in range(count):
        if i == 0:
            off, h, lean_dir, lean_amt = (0.0, 0.0), height, 0.0, 0.0
        else:
            a = 2 * math.pi * i / (count - 1) + rng.uniform(-0.35, 0.35)
            d = spread * rng.uniform(0.55, 1.0)
            off = (math.cos(a) * d, math.sin(a) * d)
            h = height * rng.uniform(0.38, 0.8)
            lean_dir, lean_amt = a, tilt * rng.uniform(0.5, 1.0)
        r = radius * (h / height) ** 0.6 * rng.uniform(0.85, 1.15)
        c = crystal(h, r, sides, material, seed=seed * 100 + i, name=f"{name}_c{i}", lean=(math.cos(lean_dir) * lean_amt, math.sin(lean_dir) * lean_amt), twist=rng.uniform(0, 1))
        c.location = (off[0], off[1], -0.02)
        parts.append(c)
    if base:
        rock = low_sphere(spread * 1.35, segments=7, rings=3, material=base_material or rusted_metal("#3b2f27", "cluster_rock"), name=f"{name}_base", squash=(1, 1, 0.34))
        rock.location = (0, 0, -0.01)
        parts.append(rock)
    return join(parts, name)


def tube_along_curve(points, radius=0.03, sides=6, taper=0.6, material=None, name="vine", samples_per_segment=3):
    """A vine / cable: a tube of `sides` facets along a Catmull-Rom curve through `points`, thinning by `taper` at the end."""
    pts = [Vector(p) for p in points]
    if len(pts) < 2:
        raise ValueError("tube_along_curve needs at least two points")
    padded = [pts[0] * 2 - pts[1]] + pts + [pts[-1] * 2 - pts[-2]]
    curve = []
    for i in range(1, len(padded) - 2):
        p0, p1, p2, p3 = padded[i - 1], padded[i], padded[i + 1], padded[i + 2]
        for s in range(samples_per_segment):
            t = s / samples_per_segment
            curve.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    curve.append(pts[-1])
    bm = bmesh.new()
    rings = []
    up = Vector((0, 0, 1))
    n = len(curve)
    for i, p in enumerate(curve):
        tangent = (curve[min(i + 1, n - 1)] - curve[max(i - 1, 0)]).normalized()
        side = tangent.cross(up)
        if side.length < 1e-4:
            side = tangent.cross(Vector((1, 0, 0)))
        side.normalize()
        norm = side.cross(tangent).normalized()
        k = 1.0 - (1.0 - taper) * i / (n - 1)
        rings.append([bm.verts.new(p + (side * math.cos(2 * math.pi * j / sides) + norm * math.sin(2 * math.pi * j / sides)) * radius * k) for j in range(sides)])
    for a, b in zip(rings[:-1], rings[1:]):
        for j in range(sides):
            bm.faces.new((a[j], a[(j + 1) % sides], b[(j + 1) % sides], b[j]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    return _object_from_bmesh(bm, name, material, smooth=True)


# --------------------------------------------------------------------------- object helpers


def join(objects, name=None):
    """Join objects into the first one (keeps each one's material slot)."""
    objects = list(objects)
    bpy.ops.object.select_all(action="DESELECT")
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    if name:
        obj.name = name
        obj.data.name = name
    return obj


def apply_transforms(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return obj


def set_origin(obj, point=(0, 0, 0)):
    """Move the origin to `point` (object space, after transforms are applied) without moving the mesh."""
    apply_transforms(obj)
    offset = Vector(point)
    obj.data.transform(Matrix.Translation(-offset))
    obj.location = offset
    return apply_transforms(obj)


def decimate(obj, ratio=0.5):
    bpy.context.view_layer.objects.active = obj
    mod = obj.modifiers.new("decimate", "DECIMATE")
    mod.ratio = ratio
    bpy.ops.object.modifier_apply(modifier=mod.name)
    return obj


def triangle_count(objs):
    total = 0
    for o in objs:
        me = o.to_mesh()
        me.calc_loop_triangles()
        total += len(me.loop_triangles)
        o.to_mesh_clear()
    return total


def bounds(objs):
    pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
    return Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts))), Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))


# --------------------------------------------------------------------------- export


def export_glb(objs, path):
    """Write `objs` as one GLB: Y up, materials as plain factors, no images, no UVs, no animation."""
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_image_format="NONE",
        export_materials="EXPORT",
        export_texcoords=False,
        export_normals=True,
        export_tangents=False,
        export_colors=False,
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_skins=False,
        export_morph=False,
        export_extras=False,
    )


# --------------------------------------------------------------------------- rendering


GAME_CAMERA = {"pitch": 55.0, "yaw": 45.0, "fov": 38.0}  # src/render/camera.ts DEFAULTS


def game_to_blender(v):
    """Game axes (x right, y up, z toward the camera at yaw 0) to Blender's (x, y, z up): (x, y, z) -> (x, -z, y)."""
    return Vector((v[0], -v[2], v[1]))


def iso_camera(target=(0, 1, 0), distance=6.0, pitch=None, yaw=None, fov=None, name="cam"):
    """A camera matching the game's follow camera: pitch 55 deg, yaw 45 deg, vertical FOV 38 deg (src/render/camera.ts).

    `target` is in game axes (y up); the camera sits on the +z side rotated by `yaw`, as in the game. Pass other
    pitch/yaw for the front/back/side views of a contact sheet.
    """
    pitch = math.radians(GAME_CAMERA["pitch"] if pitch is None else pitch)
    yaw = math.radians(GAME_CAMERA["yaw"] if yaw is None else yaw)
    fov = math.radians(GAME_CAMERA["fov"] if fov is None else fov)
    offset = (math.cos(pitch) * math.sin(yaw) * distance, math.sin(pitch) * distance, math.cos(pitch) * math.cos(yaw) * distance)
    tgt = game_to_blender(target)
    cam_data = bpy.data.cameras.new(name)
    cam_data.sensor_fit = "VERTICAL"
    cam_data.angle = fov
    cam_data.clip_end = 200
    cam = bpy.data.objects.new(name, cam_data)
    bpy.context.scene.collection.objects.link(cam)
    cam.location = tgt + game_to_blender(offset)
    direction = tgt - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = cam
    return cam


def _setup_render(path, size):
    scene = bpy.context.scene
    scene.render.resolution_x, scene.render.resolution_y = size
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = path
    return scene


def render_workbench(path, size=(640, 640)):
    """Fast flat-lit render: shows shape and material colours (not emission)."""
    scene = _setup_render(path, size)
    scene.render.engine = "BLENDER_WORKBENCH"
    shading = scene.display.shading
    shading.light = "STUDIO"
    shading.color_type = "TEXTURE"
    shading.show_cavity = False
    shading.show_shadows = False
    scene.display.render_aa = "8"
    scene.view_settings.view_transform = "Standard"
    scene.world = scene.world or bpy.data.worlds.new("world")
    scene.world.color = (0.09, 0.1, 0.12)
    bpy.ops.render.render(write_still=True)


def render_cycles(path, size=(800, 800), samples=32):
    """A Cycles still with the glow: CPU, no denoiser (the sandbox has no OpenImageDenoise device)."""
    scene = _setup_render(path, size)
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = False
    scene.cycles.max_bounces = 4
    scene.view_settings.view_transform = "Standard"
    world = scene.world or bpy.data.worlds.new("world")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.02, 0.025, 0.035, 1)
    bg.inputs["Strength"].default_value = 1.0
    bpy.ops.render.render(write_still=True)


def add_sun(direction_game=(-0.4, -1.0, -0.6), strength=3.0, color=(1.0, 0.93, 0.85)):
    data = bpy.data.lights.new("sun", "SUN")
    data.energy = strength
    data.color = color
    obj = bpy.data.objects.new("sun", data)
    bpy.context.scene.collection.objects.link(obj)
    d = game_to_blender(direction_game)
    obj.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    return obj


def add_ground(size=8.0, color="#2a2c30"):
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=size)
    return _object_from_bmesh(bm, "ground", make_material("ground" + color.lstrip("#"), color, roughness=0.95))


def tile_images(paths, out_path, columns):
    """Tile rendered PNGs into one contact sheet (numpy; Blender ships it)."""
    import numpy as np

    images = []
    for p in paths:
        img = bpy.data.images.load(p)
        w, h = img.size
        images.append(np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4))
        bpy.data.images.remove(img)
    h, w = images[0].shape[:2]
    rows = (len(images) + columns - 1) // columns
    sheet = np.zeros((rows * h, columns * w, 4), dtype=np.float32)
    sheet[..., 3] = 1.0
    for i, im in enumerate(images):
        r, c = divmod(i, columns)
        # Blender images are stored bottom-up: the first row of the sheet is the last block of rows.
        sheet[(rows - 1 - r) * h:(rows - r) * h, c * w:(c + 1) * w] = im
    out = bpy.data.images.new("sheet", columns * w, rows * h, alpha=False)
    out.pixels = sheet.ravel()
    out.filepath_raw = out_path
    out.file_format = "PNG"
    out.save()
    return out_path
