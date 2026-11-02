# Native engine capability probes

These are executable diagnostic packs, **not the completed BetterEnd gameplay port**. They use a separate `betterend_probe` namespace and disposable worlds. Do not install them into an existing player world.

## What the pack implements

- A real custom Flavolite calibration block with rough, metal and emissive permutations. All three retain gameplay light emission zero.
- A real custom Thallasium-ingot diagnostic item.
- Original source albedo, same-pack PBR texture sets, terrain/item atlas entries and retained license notices. Calibration MER values are not claims about upstream art direction.
- A native End feature restricted by biome tag and a proposed central-square exclusion. Its placement must be observed; valid JSON or a script-forced block is not proof of natural generation.
- Stable `@minecraft/server` 2.9.0 startup, zero-player console requests, temporary ticking-area loading, native state/item readback and owned-area cleanup.

No graphics scripting, GameTest, Beta APIs or Preview client is required for this particular probe. Per-player VV graphics and gameplay systems have separate gates and are not tested by this pack.

## Build

From the repository root:

```text
npm --prefix bedrock ci --ignore-scripts --cache bedrock/.work/npm-cache
npm --prefix bedrock run package:probe
```

Output is `bedrock/dist/probes/stable/`:

- `behavior_pack/` and `resource_pack/` for BDS installation.
- `BetterEnd-Probes.mcaddon`, containing portable BP/RP pack archives.
- `build-manifest.json`, with exact generated file hashes, source-asset hashes and pack identities.

The package is deliberately labeled diagnostic. It does not satisfy the final release `package` gate.

## Automated disposable BDS execution

The runner only accepts engine paths under `bedrock/.work/engines/`, with a `.betterend-disposable.json` ownership record and an exact expected build. It installs both packs, sets world pack references, requires resources, enables cheats/content console logging, uses nondefault ports, and permits no players through its empty allowlist. It never targets a production server or an existing player world.

An ownership record has these fields, populated for the actual sandbox rather than copied blindly:

- `schemaVersion`: 1.
- `purpose`: disposable BetterEnd verification.
- `expectedBuild`: full BDS version string.
- `worldName`: the owned disposable world's filename.
- `existingPlayerWorld`: false.

For the exact target engine, the actual command is:

```text
npm --prefix bedrock run probe:bds -- --engine .work/engines/bds-1.26.40.8 --build 1.26.40.8 --request probes/engine/scenarios/outer-end.json
```

The official target archive was acquired through Chromium after direct download transports failed. Its Microsoft signature, archive/executable hashes and exact runtime version are recorded in `upstream/engine.lock.json`. For the separate newer lane, use `.work/engines/bds-1.26.61.1` and `--build 1.26.61.1`. A newer receipt never certifies 26.40.

The runner checks the engine's reported version, requires real block/item registration and structured state output, and requests a clean stop. A timeout, forced termination, content error, missing result, or failed state assertion fails the run. Logs and JSON receipts are retained under `bedrock/evidence/engine/`; `ENG-001` counts these supporting engine attempts cumulatively toward the agreed cap. A supporting result is not the entire CAP-001/CAP-002/platform gate.

A scan containing only air is not a successful generation test. The initial fixed-Y probe found air at Y=64 while actual surfaces were Y=28–61. The current rule uses the documented heightmap expression; scans inspect the corresponding terrain columns. The revised rule was tested in a fresh disposable world, without rewriting the first world's generated terrain or creating artificial End Stone to force a pass.

Other supplied scenarios cover central exclusion, direct native-feature placement and the material board. `direct-feature.json` assumes untouched End Stone at its seed-specific coordinate and is not an idempotent repeated mutation. The board mutates only the disposable outer-End fixture and must be created while the server is empty. `material-board-persistence.json` checks the emissive permutation after restart, not merely the block's existence.

## Manual client verification

On a separate disposable server/world with the same built packs:

1. Activate both pack header UUIDs and matching versions from `identity.json` in the world's behavior/resource references. Merely copying folders does not activate packs.
2. Set `texturepack-required=true`; retain content logs. Configure your actual connection route and allowlist for the test clients. Do not change the automated sandbox's access settings implicitly.
3. Join from an empty resource cache using stock clients. On Xbox/Nintendo, use the project's custom-server connection route; local add-on import is not required.
4. Record download acceptance/rejection, reconnect/update, controls and the exact client edition/build/device. Check a non-VV and VV client concurrently on the same version-compatible server.
5. Inspect all three board finishes, the item, held/dropped/frame forms and normal block selection/collision. Compare gameplay illumination independently from emissive appearance.
6. Capture screenshots/video and client content errors. Record supported quality settings and graphics-mode switches; do not require VV on devices or split-screen modes that cannot expose it.

BDS-only logs cannot establish image correctness, client delivery, controller usability or hardware compatibility. These results remain open until actual clients supply evidence.
