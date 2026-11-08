# Round 4 (D02): a boss portrait from a variant contact-sheet job (npm run blender:build -- --sheet variant.x writes the job.json): blender -b --factory-startup -P scripts/blender/portrait.py -- job.json out.png; the vignette, bloom and embers were added in PIL.
import bpy, sys, json, math
from mathutils import Vector
job=json.load(open(sys.argv[sys.argv.index('--')+1])); out=sys.argv[sys.argv.index('--')+2]
bpy.ops.wm.read_factory_settings(use_empty=True)
sc=bpy.context.scene
def load(path):
    before=set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new=[o for o in bpy.data.objects if o not in before]
    roots=[o for o in new if o.parent is None]
    for o in new:
        if o.animation_data: o.animation_data_clear()
    return roots,new
roots,allo=load(job['base'])
# zero the pose of armatures
for o in allo:
    if o.type=='ARMATURE':
        o.pose_position='REST'
bpy.context.view_layer.update()
def bounds(objs):
    pts=[]
    for o in objs:
        if o.type=='MESH':
            dg=bpy.context.evaluated_depsgraph_get(); e=o.evaluated_get(dg)
            pts+= [e.matrix_world @ Vector(c) for c in e.bound_box]
    return Vector((min(p.x for p in pts),min(p.y for p in pts),min(p.z for p in pts))),Vector((max(p.x for p in pts),max(p.y for p in pts),max(p.z for p in pts)))
lo,hi=bounds(allo)
print('BASE',lo,hi)
for p in job['parts']:
    r,n=load(p['file'])
    px,py,pz=p['position']; s=p.get('scale',1); rot=p.get('rotation',[0,0,0])
    for o in r:
        o.scale=(s,s,s); o.location=(px,-pz,py); o.rotation_euler=(math.radians(rot[0]),math.radians(-rot[2]),math.radians(rot[1]))
    allo+=n
bpy.context.view_layer.update()
lo,hi=bounds(allo); print('ALL',lo,hi)
h=hi.z-lo.z
# face direction: game +Z forward => blender -Y. Camera in front at -Y looking +Y
cx=(lo.x+hi.x)/2
target=Vector((cx,0,hi.z-h*0.40))
cam=bpy.data.objects.new('cam',bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera=cam
cam.data.lens=50
cam.location=(cx, target.y-h*1.9, target.z+h*0.05)
d=(target-cam.location); cam.rotation_euler=d.to_track_quat('-Z','Y').to_euler()
def light(kind,loc,energy,color,size=3):
    bpy.ops.object.light_add(type=kind,location=loc); l=bpy.context.object; l.data.energy=energy; l.data.color=color
    if kind=='AREA': l.data.size=size
    d=(target-Vector(loc)); l.rotation_euler=d.to_track_quat('-Z','Y').to_euler()
light('AREA',(cx-h*0.8,target.y+h*0.3,target.z+h*0.1),1100*h,(1.0,0.4,0.1),h)
light('AREA',(cx+h*0.8,target.y+h*0.3,target.z+h*0.1),1100*h,(1.0,0.4,0.1),h)
light('AREA',(cx,target.y-h*1.5,target.z+h*0.6),120*h,(1.0,0.75,0.55),h)
# ember glow behind
bpy.ops.mesh.primitive_uv_sphere_add(radius=h*0.5,location=(cx,target.y+h*1.2,target.z+h*0.2)); g=bpy.context.object
m=bpy.data.materials.new('g'); m.use_nodes=True; b=m.node_tree.nodes['Principled BSDF']; b.inputs['Base Color'].default_value=(1,0.3,0.05,1); b.inputs['Emission Color'].default_value=(1,0.3,0.05,1); b.inputs['Emission Strength'].default_value=0.5; g.data.materials.append(m)
w=bpy.data.worlds.new('w'); w.use_nodes=True; w.node_tree.nodes['Background'].inputs[0].default_value=(0.012,0.008,0.006,1); sc.world=w
sc.view_settings.exposure=-0.6
sc.render.engine='CYCLES'; sc.cycles.samples=64; sc.cycles.device='CPU'; sc.cycles.use_denoising=False
sc.render.resolution_x=sc.render.resolution_y=512; sc.render.image_settings.file_format='PNG'
sc.view_settings.view_transform='Filmic' if 'Filmic' in [x.identifier for x in bpy.types.ColorManagedViewSettings.bl_rna.properties['view_transform'].enum_items] else 'Standard'
sc.render.filepath=out
bpy.ops.render.render(write_still=True)
