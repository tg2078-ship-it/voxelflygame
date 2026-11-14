# AIRRUN / Three.js integration

Load the supplied vendor.js, runtime.js and game-asset.js in that order.

```js
const actor = new Airrun.GameAsset(record, async relativePath => {
  const response = await fetch('/assets/' + relativePath);
  if (!response.ok) throw new Error('Missing asset: ' + relativePath);
  return response.arrayBuffer();
});
await actor.load(1);
scene.add(actor.root);
actor.setInput({roll: 0.4, pitch: -0.2, yaw: 0.1, gear: 0});
// Fixed 1/120s updates; same mixer time for native visual and collider nodes.
actor.update(1 / 120);
const hit = obstacle.sweepSphere(from, to, radius);
const rayHit = obstacle.raycast(origin, direction, maxDistance);
actor.setDebug(true);
// Clean up all model geometry, materials, textures and mixers:
actor.dispose();
```

For an extracted local pack use Airrun.fileMap(FileList) and File.arrayBuffer(),
as in the self-contained HTML. The HTML has no network dependency.
Use load(1) for gameplay, load(0) for close inspection. setLOD preserves native
animation time; setCollision selects collision or collision_detail. Both must
share actor.root. Do not flatten animated descendants into a static mesh.

The BVH API provides rays and swept spheres. It is not a rigid-body solver.
Sweeps interpolate moving triangles within one step, so rapidly rotating
geometry requires small substeps. The flight sample uses 120Hz steps and six
sample points; it is an intentionally approximate aircraft contact example.
Initial surface overlap and convex decomposition require your engine policy.

The 11 Edition9 compound-named files contain simplified nonconvex triangle
surfaces preserving apertures. They are not a single convex collider. Existing
Edition8 collision.json files retain their structural proxy records.
Some retained GLBs require KHR_mesh_quantization. Materials use embedded
textures, vertex colors and optional glTF material extensions.
