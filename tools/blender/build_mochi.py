"""Procedurally build MOCHI (chibi bunny designer toy) and export a GLB.
Usage: blender -b --factory-startup -P tools/blender/build_mochi.py -- [out.glb]
Original work for PUPPET STRIKE; no external assets. The web game itself does
NOT depend on this GLB (it renders a procedural R3F model); this is an optional
art pipeline for later hand-sculpting / rigging in Blender."""
import bpy, sys, os

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = os.path.abspath(argv[0] if argv else os.path.join(os.path.dirname(__file__), "..", "..", "public", "models", "mochi.glb"))
bpy.ops.wm.read_factory_settings(use_empty=True)

def srgb(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)

def mat(name, hexc, rough=0.5, sheen=0.0, coat=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*(srgb(hexc) if hexc.startswith('#') else (1, 1, 1)), 1)
    b.inputs["Roughness"].default_value = rough
    for k, v in (("Sheen Weight", sheen), ("Coat Weight", coat)):
        if k in b.inputs: b.inputs[k].default_value = v
    return m

M = dict(body=mat("plush_white", "#fff6f8", 0.8, 1.0), belly=mat("plush_pink", "#ffd1e0", 0.8, 1.0),
         hood=mat("vinyl_sakura", "#ff8fb8", 0.35, 0, 0.8), eye=mat("eye", "#2b2140", 0.1, 0, 1.0),
         hi=mat("eye_hi", "#ffffff", 0.2), cheek=mat("cheek", "#ff9fbf", 0.6))

def sphere(name, m, loc, r, scale=(1, 1, 1), rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=r)
    o = bpy.context.active_object; o.name = name; o.location = loc; o.scale = scale; o.rotation_euler = rot
    o.data.materials.append(M[m]); bpy.ops.object.shade_smooth(); return o

HZ, HR = 1.24, 0.36  # ~2.5 heads tall
parts = [sphere("Head", "body", (0, 0, HZ), HR, (1.08, 0.95, 0.98)),
         sphere("Body", "hood", (0, 0, 0.62), 0.27, (1, 0.9, 1.1)),
         sphere("Belly", "belly", (0, -0.12, 0.6), 0.19, (1, 0.6, 1.1)),
         sphere("Tail", "body", (0, 0.27, 0.5), 0.09)]
for s in (-1, 1):
    parts += [sphere(f"Eye{s}", "eye", (s * 0.13, -0.31, HZ), 0.065, (1, 0.5, 1.25)),
              sphere(f"Hi{s}", "hi", (s * 0.13 + 0.015, -0.345, HZ + 0.03), 0.022),
              sphere(f"Cheek{s}", "cheek", (s * 0.22, -0.27, HZ - 0.08), 0.05, (1, 0.4, 0.7)),
              sphere(f"Ear{s}", "body", (s * 0.13, 0.02, HZ + 0.48), 0.1, (0.7, 0.45, 2.6), (0, s * 0.18, 0)),
              sphere(f"EarIn{s}", "belly", (s * 0.13, -0.025, HZ + 0.48), 0.06, (0.6, 0.3, 2.3), (0, s * 0.18, 0)),
              sphere(f"Arm{s}", "body", (s * 0.3, 0, 0.66), 0.075, (1, 1, 2.2), (0, s * 0.35, 0)),
              sphere(f"Leg{s}", "body", (s * 0.12, -0.02, 0.2), 0.11, (1, 1.2, 1.5))]
bpy.ops.object.select_all(action="DESELECT")
for p in parts: p.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
bpy.ops.object.join(); bpy.context.active_object.name = "MOCHI"
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_yup=True)
print("MOCHI_GLB_OK", OUT, os.path.getsize(OUT))
