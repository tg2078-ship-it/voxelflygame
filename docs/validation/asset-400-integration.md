# AeroForge 400 model integration

The runtime catalogue is derived from the user's **VOXEL-AIRRUN-400-Models-GLB.zip**,
edition 7.0.0. Original archive SHA-256:
`4fbfab65d719df7391641a72f04a47f74a5f2d496341538382e2b095a936f786`.

There are 400 supplied models and 1,200 visual exports (LOD0/1/2). Exactly 200
models contain native motion, with 771 distinct source clips. Four supplementary
traffic models have a separate catalogue and are not counted as supplied assets.

## Geometry and appearance

The retained encoding checkpoint preserves every source triangle, material,
vertex colour, UV, authored transform/pivot and native animation key. Positions
are quantized to 16 bits per mesh, with a recorded maximum error of 0.0005713 m.
Transport is meshopt-compressed GLB inside deterministic gzip. Source JPEG and PNG
bytes and PBR definitions are retained, including sampler and texture transform
settings. The 49 distinct original images are stored once under
`/models/textures/<sha256>.jpg` or `.png`, referenced by absolute GLTF image URIs.
Normals/ORM PNGs retain their native lossless format. Meshopt geometry and
animation segments are copied byte-for-byte during container repacking; no
triangles, LODs, animation keys, image pixels or material definitions are reduced.

`bounds` describes the actual decoded LOD0 hierarchy. `lodBounds` records all
three decoded hierarchies; some authored LOD silhouettes genuinely differ.
Gameplay collision follows the full source model, so nearby collidable scenery
must be promoted to LOD0 before contact. Lower LODs are distance representations.

`textureHashes` maps GLTF texture indices to embedded-image SHA-256 for LOD0.
`textureHashesByLod` supplies a complete map for any LOD whose index ordering
differs. There are 102 overrides across 79 models. A runtime texture cache must
include sampler, UV transform and colour-space state in its key, not just image
hash. Hashes do not authorize changing source PBR settings.

## Physics and native motion

Each `/models/proxies/<id>.json.gz` contains the full collision representation:
476,480 static cuboids and 65,673 dynamic cuboids across the pack. These solids
are never truncated to a small arbitrary sample. The enclosing bounds are only
used for broad phase and must never fill a portal or arch with an invisible wall.

- `static`: cuboids `{c:[x,y,z],s:[x,y,z],q?:[x,y,z,w],zone}`.
- `dynamic`: the same, with `node` identifying the native rig node and an
  analytic whole-cycle `envelope` in model coordinates.
- `staticBVH`: `{root,nodes}`; a branch has `min,max,left,right`; a leaf has
  `min,max,indices`. Leaf indices address `static`.
- `dynamicBVH`: an array of `{node,root,nodes}`. Leaf indices address the global
  `dynamic` array, not a per-node compact array. Bounds are in the node's frame.
- `rig.nodes`: `{name,parent,p,q,s}`. Parents can occur after children in the array.
- `rig.clips`: `{name,duration,autoplay,channels}`. Channels use a node index,
  GLTF path, times, flat values and interpolation. All retained channels are
  LINEAR. Quaternion interpolation must use shortest-path spherical interpolation.
  One `vista_banner_plane` channel animates four morph weights; it changes rendered
  cloth shape and must not be interpreted as a node position/scale channel.

Render and physics must sample the same simulation motion clock. Camera offsets,
takeoff scene translations, quality changes and frame rate must not affect the
collision hierarchy. For planning a future E trajectory, dynamic envelopes are
conservative reservations rather than current-frame contact geometry.

Individual compressed proxies enable lazy loading. Unused full collision bundles
and duplicate plain proxy JSON are excluded from the deployed package. The four
supplementary traffic proxies retain their separately referenced plain JSON.
Complete source audit checkpoints remain outside the deployed public directory.

Eight source openings have extra empty-space proofs in `asset-400-apertures.json`.
The original canyon bridge coarse clearance crossed an actual pillar; its
corrected portal is off-centre. Routes must use proved openings or overfly the
structure when required portal altitude exceeds the airspace ceiling.

## Recovery and verification provenance

Workspace maintenance removed the prior uncommitted checkout. The complete
optimized-GLB/physics checkpoint survived. `scripts/recover-models-400.py` restores
these audited outputs and independently rechecks all 1,200 GLB containers,
embedded image bytes, texture associations, materials and samplers against the
retained original GLBs. It does not re-encode meshes or alter the source ZIP.

```sh
python scripts/recover-models-400.py --checkpoint /path/to/asset-audit-400
node scripts/create-traffic.mjs
python scripts/share-model-textures.py --checkpoint /path/to/asset-audit-400
node scripts/audit-shared-textures.mjs /path/to/asset-audit-400
python scripts/audit-recovered-physics.py
```

`asset-400-recovery.json` and `asset-400-physics-recovery.json` record fresh
recovery checks. Other `asset-400-*.json` reports retain results from the earlier
checkpoint audit, including exact source-solid coverage, native rig comparisons,
triangle preservation, independently sampled BVH queries and analytic envelopes.
These historical reports do not establish current deployed-browser rendering.
`asset-400-shared-textures.json` records the final shared-image package sizes;
`asset-400-shared-texture-decode.json` independently compares decoded meshopt
buffers and every external image's bytes to the original optimized checkpoint.

The legacy `prepare-models.py` was written for the original 150-model edition.
It is not the reproducible encoder for the 400-model checkpoint and must not be
run over the new pack. The recovery script requires the retained checkpoint.
Actual browser/GPU rendering and device FPS require a separate supported browser
test; neither the recovery nor CPU binary audits certify those properties.
