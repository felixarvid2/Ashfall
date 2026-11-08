# Round 4 (D03): the barrierBonus passive emblem in the stat-icon style. Run: blender -b --factory-startup -P scripts/blender/emblem_barrier.py -- out.png, then save as public/assets/art/stats/barrierBonus.webp (256 px).
import bpy, math, sys
out=sys.argv[sys.argv.index('--')+1]
bpy.ops.wm.read_factory_settings(use_empty=True)
sc=bpy.context.scene
def mat(name,color,metal=0.0,rough=0.5,emit=0.0):
    m=bpy.data.materials.new(name); m.use_nodes=True
    b=m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value=(*color,1); b.inputs['Metallic'].default_value=metal; b.inputs['Roughness'].default_value=rough
    if emit>0:
        b.inputs['Emission Color'].default_value=(*color,1); b.inputs['Emission Strength'].default_value=emit
    return m
steel=mat('steel',(0.16,0.16,0.17),0.9,0.45)
plate=mat('plate',(0.09,0.09,0.1),0.8,0.55)
glow=mat('glow',(1.0,0.3,0.03),0.0,0.4,emit=3.0)
def obj_mat(o,m): o.data.materials.append(m)
bpy.ops.mesh.primitive_cylinder_add(vertices=64,radius=0.98,depth=0.12,location=(0,0,0)); o=bpy.context.object; obj_mat(o,plate)
bpy.ops.mesh.primitive_torus_add(major_radius=0.93,minor_radius=0.09,major_segments=64,minor_segments=16,location=(0,0,0.04)); o=bpy.context.object; obj_mat(o,steel)
bpy.ops.mesh.primitive_torus_add(major_radius=0.76,minor_radius=0.022,major_segments=64,minor_segments=8,location=(0,0,0.07)); o=bpy.context.object; obj_mat(o,glow)
for i in range(8):
    a=i*math.pi/4+0.2
    bpy.ops.mesh.primitive_cube_add(size=1,location=(math.sin(a)*0.93,math.cos(a)*0.93,0.1)); o=bpy.context.object
    o.scale=(0.07,0.12,0.05); o.rotation_euler[2]=-a; obj_mat(o,plate)
def curve(points,depth,closed=False,name='c'):
    cu=bpy.data.curves.new(name,'CURVE'); cu.dimensions='3D'; cu.bevel_depth=depth; cu.bevel_resolution=3
    sp=cu.splines.new('POLY'); sp.points.add(len(points)-1)
    for p,(x,y) in zip(sp.points,points): p.co=(x,y,0.09,1)
    sp.use_cyclic_u=closed
    o=bpy.data.objects.new(name,cu); sc.collection.objects.link(o); o.data.materials.append(glow); return o
# shield outline
shield=[(0,-0.5),(0.3,-0.32),(0.38,0.05),(0.3,0.28),(0,0.36),(-0.3,0.28),(-0.38,0.05),(-0.3,-0.32)]
curve(shield,0.032,True,'shield')
# barrier dome: an arc over the shield
arc=[(math.cos(t)*0.58, math.sin(t)*0.58-0.02) for t in [math.radians(a) for a in range(20,161,10)]]
curve(arc,0.026,False,'dome')
# centre diamond
curve([(0,-0.16),(0.1,0.04),(0,0.2),(-0.1,0.04)],0.022,True,'gem')
bpy.ops.object.light_add(type='AREA',location=(0.6,-0.8,2.2)); l=bpy.context.object; l.data.energy=8; l.data.size=2.5
bpy.ops.object.light_add(type='AREA',location=(-1.0,0.8,1.6)); l=bpy.context.object; l.data.energy=8; l.data.size=2.5
cam=bpy.data.objects.new('cam',bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera=cam
cam.data.type='ORTHO'; cam.data.ortho_scale=2.3; cam.location=(0,0,3); cam.rotation_euler=(0,0,0)
sc.render.engine='CYCLES'; sc.cycles.samples=48; sc.cycles.device='CPU'; sc.cycles.use_denoising=False; sc.render.image_settings.file_format='PNG'
sc.render.resolution_x=sc.render.resolution_y=256
w=bpy.data.worlds.new('w'); w.use_nodes=True; w.node_tree.nodes['Background'].inputs[0].default_value=(0,0,0,1); w.node_tree.nodes['Background'].inputs[1].default_value=0.0; sc.world=w
sc.view_settings.view_transform='Standard'
sc.render.filepath=out
bpy.ops.render.render(write_still=True)
