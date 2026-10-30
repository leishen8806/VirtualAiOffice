# PERF-LOAD-2 conversion

Uses the repository's Three.js r185 loaders, the officially approved r185
GLTFExporter in `vendor/`, an existing local Chrome/Playwright installation, and
the existing Python/Pillow toolchain. No npm installation or runtime upgrade.
See `vendor/SOURCES.json` and `vendor/LICENSE` for exporter provenance.

From the repository root:

```text
node scripts/perf-load-2/convert.mjs <absolute-path-to-existing-playwright/index.mjs> all
<existing-python-with-Pillow> scripts/perf-load-2/textures.py
node scripts/perf-load-2/pack-cartoons.mjs
node scripts/perf-load-2/manifest.mjs
```

Original FBX, GLB and textures remain under `office3d/assets/models/`. Outputs and
source/output SHA-256 bindings are in `office3d/assets/compact/MANIFEST.json`.
The converter reads the available avatar directories instead of a fixed count.
An optional fourth argument filters source filenames for a reproducibility check.
Per-kind conversion records are merged when using this filter.

## Formats and verification

- Models: standard GLB inside gzip, decompressed by the browser's native
  `DecompressionStream`, then parsed by the existing GLTFLoader. Separate WebP
  textures allow 1024 desktop and 512 phone/low variants without duplicate meshes.
  Model lights and unused morph targets are removed exactly as the old runtime
  did. Material groups use their own vertex subsets and vertices are deduplicated
  only when every geometry, skin and morph component is identical. The original
  measured height is stored in GLB extras to avoid re-skinning the entire model
  for the same startup measurement. Bone names, retained morph identities, bounds
  and every resting skinned vertex are checked by loading the exported GLB again.
- Animations: VOA2 has a little-endian magic/JSON-length header, JSON metadata and
  byte-planed Float32 time arrays plus component-wise fixed-point delta values.
  Quaternion precision is 1e-6; position precision is 1e-5 source units. Source
  curves are simplified only within a bounded interpolation error. Validation
  includes every source keyframe and 120 samples/second: component error at most
  1e-5 for quaternions, 2e-5 source units for position. This is bounded numerical
  equivalence, **not** byte-identical animation. Runtime seated depth and MOVE
  checks are independent gates and cannot be replaced by this conversion check.
- Cartoon animation: retains the five clips actually consumed by `assets3d.js`,
  with its existing scale/non-root-position filtering. The original 43-clip file
  remains intact.
- Cartoon models/hair: the original glTF JSON and binary buffers are packaged
  unchanged into gzip GLB containers, retaining all image references. Tests
  compare every JSON field and every geometry byte to the original files.
- Textures: WebP quality 80 (normal maps 95); alpha remains lossless after the
  approved resizing. Phone/low variants omit cartoon normal/roughness requests.
  The legacy lightweight-mode switch retains its own behavior.

The gzip files have their own extension and are fetched as bytes: do not set an
HTTP `Content-Encoding: gzip` on these files, which would cause double decoding.
Ordinary server compression of the response is independent and may be enabled.
No external decoder, compression CLI, service restart or production operation is
needed. Each missing or undecodable compact item retries its retained original. FBXLoader is dynamically imported only on that fallback. New avatar imports must rerun these conversion commands and the compact coverage test; Q-V1 coordinates the post-I7B-A run.
