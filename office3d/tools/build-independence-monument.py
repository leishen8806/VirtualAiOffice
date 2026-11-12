"""Generate the low-poly Independence Monument GLB used by the 3D town."""

from pathlib import Path
import math

import bpy


OUTPUT = Path(__file__).resolve().parents[1] / "assets" / "models" / "landmarks" / "independence-monument.glb"
HORIZONTAL_SCALE = 0.68


def material(name, color, metallic=0.0, roughness=0.82):
    value = bpy.data.materials.new(name)
    value.diffuse_color = (*color, 1.0)
    value.use_nodes = True
    shader = value.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1.0)
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    return value


def apply_bevel(obj, width=0.08):
    modifier = obj.modifiers.new("Soft stone edges", "BEVEL")
    modifier.width = width
    modifier.segments = 1
    modifier.limit_method = "ANGLE"
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def cube(name, size, z, stone, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(location=(0, 0, z + size[2] / 2))
    obj = bpy.context.object
    obj.name = name
    obj.scale = (size[0] / 2, size[1] / 2, size[2] / 2)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(stone)
    if bevel:
        apply_bevel(obj, bevel)
    return obj


def frustum(name, radius_bottom, radius_top, depth, z, stone, vertices=12, rotation=0.0):
    bpy.ops.mesh.primitive_cone_add(
        vertices=vertices,
        radius1=radius_bottom,
        radius2=radius_top,
        depth=depth,
        location=(0, 0, z + depth / 2),
        rotation=(0, 0, rotation),
    )
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(stone)
    return obj


def finial(name, x, y, z, scale, stone):
    bpy.ops.mesh.primitive_cone_add(
        vertices=8,
        radius1=0.34 * scale,
        radius2=0.06 * scale,
        depth=1.45 * scale,
        location=(x, y, z + 0.725 * scale),
    )
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(stone)
    return obj


def build():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)

    red_sandstone = material("Red-brown sandstone", (0.43, 0.18, 0.11))
    dark_sandstone = material("Weathered sandstone", (0.27, 0.10, 0.065), roughness=0.9)
    bronze = material("Finial bronze", (0.62, 0.36, 0.08), metallic=0.62, roughness=0.38)

    z = 0.0
    for index, (width, depth) in enumerate(((14.0, 0.42), (12.4, 0.46), (10.8, 0.50), (9.2, 0.54)), 1):
        cube(f"Square stair {index}", (width, width, depth), z, dark_sandstone, 0.07)
        z += depth

    cube("Raised square base", (7.8, 7.8, 1.55), z, red_sandstone, 0.1)
    z += 1.55

    # Four open bays keep the characteristic airy lower stage readable at town scale.
    for x in (-2.55, 2.55):
        for y in (-2.55, 2.55):
            bpy.ops.mesh.primitive_cube_add(location=(x, y, z + 1.7))
            pillar = bpy.context.object
            pillar.name = "Lower open-bay pillar"
            pillar.scale = (0.55, 0.55, 1.7)
            bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
            pillar.data.materials.append(red_sandstone)
            apply_bevel(pillar, 0.08)
    z += 3.4
    cube("Open-bay crown", (7.1, 7.1, 0.55), z, dark_sandstone, 0.08)
    z += 0.55

    for level in range(5):
        width = 6.9 - level * 0.86
        slab_depth = 0.38
        cube(f"Lotus tier {level + 1} slab", (width, width, slab_depth), z, dark_sandstone, 0.06)
        z += slab_depth
        body_depth = 1.75 - level * 0.10
        frustum(
            f"Lotus tier {level + 1} body",
            width * 0.46,
            width * 0.38,
            body_depth,
            z,
            red_sandstone,
            rotation=math.pi / 8,
        )
        inset = width * 0.39
        scale = 1.0 - level * 0.10
        for corner, (x, y) in enumerate(((inset, inset), (-inset, inset), (-inset, -inset), (inset, -inset)), 1):
            finial(f"Tier {level + 1} corner lotus {corner}", x, y, z + body_depth * 0.58, scale, red_sandstone)
        z += body_depth

    frustum("Lotus bud lower", 1.45, 1.02, 2.2, z, red_sandstone, vertices=16, rotation=math.pi / 16)
    z += 2.2
    frustum("Lotus bud upper", 1.02, 0.24, 2.5, z, red_sandstone, vertices=16, rotation=math.pi / 16)
    z += 2.5
    frustum("Bronze crown", 0.32, 0.11, 1.5, z, bronze, vertices=12)
    z += 1.5
    frustum("Bronze needle", 0.11, 0.0, 2.2, z, bronze, vertices=10)

    for obj in [item for item in bpy.context.scene.objects if item.type == "MESH"]:
        obj.location.x *= HORIZONTAL_SCALE
        obj.location.y *= HORIZONTAL_SCALE
        obj.scale.x *= HORIZONTAL_SCALE
        obj.scale.y *= HORIZONTAL_SCALE
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

    # One mesh per material keeps the landmark at three draw calls in town view.
    for stone in (red_sandstone, dark_sandstone, bronze):
        objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH" and obj.data.materials[0] == stone]
        bpy.ops.object.select_all(action="DESELECT")
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        bpy.ops.object.join()
        objects[0].name = f"{stone.name} geometry"

    for obj in [item for item in bpy.context.scene.objects if item.type == "MESH"]:
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        modifier = obj.modifiers.new("Export triangles", "TRIANGULATE")
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        obj.select_set(False)

    triangles = sum(len(obj.data.polygons) for obj in bpy.context.scene.objects if obj.type == "MESH")
    if triangles > 8000:
        raise RuntimeError(f"triangle budget exceeded: {triangles}")

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(OUTPUT),
        export_format="GLB",
        export_apply=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
    )
    if OUTPUT.stat().st_size > 500_000:
        raise RuntimeError(f"file budget exceeded: {OUTPUT.stat().st_size} bytes")
    print(f"INDEPENDENCE_MONUMENT triangles={triangles} bytes={OUTPUT.stat().st_size} height={z + 2.2:.2f}")


build()
