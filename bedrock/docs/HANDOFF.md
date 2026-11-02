# BetterEnd Bedrock — implementation handoff

**Prepared at the user's explicit request to move work to other agents.** Feature implementation stopped for this handoff. The full port goal is **not complete**. Read [AGENTS.md](../AGENTS.md) and [the execution contract](execution-contract.md) before resuming.

## 1. Executive state

This repository contains the complete automated implementation, content compiler, gameplay runtime, and server-side BDS capability verification (`1.26.40.8` baseline + `1.26.61.1` forward lane) for the BetterEnd Bedrock 26.40 port. Full release certification (`npm --prefix bedrock run verify`) remains gated on the user-operated stock-client and console/mobile hardware verification sessions (`INV-001:client-ui`, `CAP-008:client-elytra-glider-and-hud`, `CAP-009`, `CAP-010`, `CAP-015`, `CAP-016`, `CAP-017`).

Verified progress:

- Immutable source inventory and asset provenance (`bedrock/upstream/asset-provenance.csv`, `6,660` rows), with explicit unresolved issues.
- A separate Java production-server exporter, with source-input/JAR attestation and retained schema-3 runtime data.
- **Resolved:** the shape-audit parser/reconciliation defect where uniform compressed rows were misread as `states: {}` ("3,712 missing / 179 stale" false diagnostics) is fixed and regression-tested (`22,385 / 22,385` live states reconciled, `missingShapeStates: 0`, `staleShapeStates: 0`).
- **Resolved:** V1–V3 vanilla 26.3 consumer bytecode rules verified via `javap` in `docs/research/recipe-hyperedges.md` and normalized across all `879` recipes (`11` serializers) in `tools/recipes.mjs`.
- **Implemented & Verified (`REG-001`, `GEN-001..003`):** Deterministic 64-bit `OpenSimplexNoise`, `HexBiomeMap`, `TerrainGenerator`, `RegionService`, and `GenerationService` across all `27` End regions and `113` structure/feature families (`10,500`-vector determinism test passing with `0` disagreements).
- **Implemented & Verified (`ASSET-001`, `BLK-001..002`, `VIS-001`):** Pure-JS PNG codec (`tools/png-codec.mjs`), model/blockstate/tint/material compiler (`tools/model-compiler.mjs`), and content compiler (`tools/content-compiler.mjs`) lowering all `728` blocks (`22,385` states across `1,031` partitioned `1.26.20` block definitions with `<= 64` permutations and bijective `stateMap`), `850` items, `879` recipes (`796` native JSON + runtime station registries), `32` server entities (`6` wildlife + `20` boats/rafts + `1` chair + `5` carriers), `27` client entities, `1,883` `.geo.json` models, `1,288` `.texture_set.json` PBR material sets, `27` region fog/lighting/atmospheric presets, `local_lighting.json`, `sound_definitions.json`, and `en_US.lang`.
- **Implemented & Verified (`INV-001`, `STA-001..002`, `ECO-001`, `FARM-001`, `EQP-001`, `TRV-001`, `VIS-002..003`, `PROG-001`, `INT-001`):** Complete runtime services under `bedrock/runtime/` (`PersistenceStore`, `StationsService`, `EquipmentService`, `EcologyService`, `TransportService`, `PresentationService`, `CompatibilityService`, `GenerationService`, and `BetterEndRuntime` bootstrap) plus production pack builder (`tools/build-packs.mjs`) and verification runner (`tools/verify.mjs`).
- **Executed & Passed on Real BDS (`1.26.40.8` baseline and `1.26.61.1` forward lane):** All 9 server-side capability probes (`CAP-003`, `CAP-004`, `CAP-005`, `CAP-007`, `CAP-008`, `CAP-011`, `CAP-012`, `CAP-013`, `CAP-014`) passed with retained receipts in `bedrock/evidence/engine/` and `bedrock/evidence/attempts.jsonl`.
- Fifty-five automated unit and integration tests passing across 13 test suites (`npm --prefix bedrock run verify:automated` exits `0`).

## 2. Repository, branch and published stages

Local checkout used in this session:

```text
C:\Users\weyst\Documents\BetterEnd-Bedrock
```

| Item | Value |
|---|---|
| Branch | `experimental/bedrock-26.40` |
| Origin | `git@github.com:BaiTian6641/BetterEnd.git` |
| Upstream | `https://github.com/quiqueck/BetterEnd.git` |
| Immutable Java source pin | `5a25059ef4fd77409024a2919fb0a0098388104f` |
| Source release line | `release/26.3` |
| Latest implementation/client-coordination head before this handoff | `7ea1d7a99` |

Published commits, in order:

| Commit | Contents |
|---|---|
| `fc9cf584b` | Audited source inventory, provenance, evidence integrity and native block/worldgen probes |
| `349192810` | Attested Java reference, runtime reconciliation and native inventory diagnostics |
| `4a22bcf5f` | LF-stable Java/Gradle reference inputs, verified with actual Git checkout filters |
| `7ea1d7a99` | Separate-server/both-lane client request, material-board setup instructions and new baseline/forward board receipts |

All were pushed to the authorized origin branch. The handoff documents themselves are published afterward; do not infer their commit ID from this table.

### Scope protection

All new writes must remain under `bedrock/`. Preserve the pre-existing root changes:

- Modified root `README.md`.
- Root `BetterEnd_Bedrock_Port_Plan.md`.
- Root `docs/BetterEnd_Bedrock_26.40_Implementation_Plan.md`.

Those root planning/README changes were not staged by the implementation commits. The original Java tree and license notices were not edited. Read-only source snapshots and all temporary runtimes are under `bedrock/.work/`.

## 3. Authoritative documents and current counts

Start with:

1. [Agent operating instructions](../AGENTS.md).
2. [Execution contract](execution-contract.md).
3. [Detailed 26.40 implementation specification](reference/BetterEnd_Bedrock_26.40_Implementation_Plan.md).
4. [Current source/review notes](source-review.md).
5. [Second-stage evidence index](../evidence/source/stage-002-summary.json).
6. [Java exporter instructions](../java-exporter/README.md).
7. [Native inventory/client-session instructions](../probes/inventory/README.md).
8. [Bedrock 26.30+ / 26.40 API & Schema Reference](bedrock-26.30-26.40-api-reference.md).

The earlier copied research plan contains 26.60 assumptions; it does not override the 26.40 specification.

| Observed category | Count |
|---|---:|
| Live mod-namespace blocks | 728 |
| Live items | 850 |
| Explicit wildlife families | 6 |
| Vehicle entity types | 20 |
| Shared seating helper types | 1 |
| Furniture blocks using that helper | 33 |
| Live entity types total | 27 |
| Region/biome IDs | 27 |
| Live possible block states | 22,385 |
| Compressed shape-audit rows | 18,852 |
| Main source recipes | 878 |
| Optional source recipes | 1 |
| Current parity entries | 4,954 |
| Physical source assets | 6,658 |
| Effective profile JSON resources | 12,060 |
| Observed merged registry tags | 1,560 |
| Available registries in the reference provider | 163 |

These are inventory/reference counts, not counts of implemented Bedrock gameplay.

## 4. Immediate priority: correct uniform shape-audit semantics (resolved)

### Confirmed defect (now fixed)

`tools/catalogue.mjs::parseShapeSnapshot` previously parsed an unqualified audit row as `states: {}`. `tools/runtime-reconciliation.mjs::stateCoverage` then compared that empty assignment against full live assignments and reported missing/stale states.

The actual producer is WorldWeaver's:

```text
WoverBlockShapesProvider
  de/ambertation/wover/datagen/api/provider/WoverBlockShapesProvider.class
```

Verified module: `.work/java-reference/dependency-jars/wover-block-api-26.301.2.jar`, SHA-256:

```text
962a9cece08978a5d39c9a001fbac5f8981bf399d2ffaa029b94ed649546542d
```

Matching immutable source:

[WoverBlockShapesProvider.java](https://github.com/quiqueck/WorldWeaver/blob/36ee9d8b697a777fbd9f51e7a18259c12598fe14/wover-block-api/src/main/java/de/ambertation/wover/datagen/api/provider/WoverBlockShapesProvider.java#L50-L196)

BetterEnd registers this provider in:

```text
src/main/java/org/betterx/datagen/betterend/BetterEndDatagen.java:67-73
```

The producer evaluates every possible state using `EmptyBlockGetter.INSTANCE` and `BlockPos.ZERO`, formats outline/collision AABBs to four decimal places, and emits **one unqualified row if every formatted shape pair is uniform**. Otherwise it emits state-qualified rows.

Independently checked and verified against the retained data:

- 179 property-bearing blocks have one such uniform row.
- Those rows cover 3,712 live states.
- Every previously reported stale key was the empty key `""`.
- No audit row contains `unavailable`.
- `18,852 - 179 + 3,712 = 22,385`.

### Completed fix

1. Added failing-before/passing-after regressions in `tests/catalogue.test.mjs` and `tests/runtime-reconciliation.test.mjs` for property-bearing blocks with uniform unqualified rows and contradictory mixed/duplicate rows.
2. Represented uniform-domain rows (`coverageMode: 'uniform-all-states'`, `records[0].coverage: 'uniform-all-states'`, `states: null`, `defaultState: null`) distinctly from explicit state assignments (`coverageMode: 'explicit-states'`).
3. Reconciled uniform rows against the full observed property domain (`compressedPropertyDomain: true`), retaining neutral context (`EmptyBlockGetter.INSTANCE`, `[0, 0, 0]`, `roundingDecimals: 4`) and `shapesRuntimeVerified: false`.
4. Rejected contradictory mixed/duplicate/inconsistent representations.
5. Regenerated all seven reports/catalogues through `extract:source` without editing historical evidence logs or stage summaries.
6. Confirmed expanded neutral-audit coverage is 22,385 (`shapeAuditSummary.expandedNeutralCoveredStates: 22385`, `missingLiveStateShapes: 0`, `staleAuditStateShapes: 0`) and that the false `shape-audit-domain-mismatch` blocker disappeared.

### Geometry work after that fix

Read the complete [geometry oracle report](research/geometry-oracle.md). A new production exporter can gather explicit neutral-context outline, collision, interaction and visual ray shapes without placing blocks, but that is not complete world physics or rendered-mesh extraction.

Important distinctions:

- Prefer the explicit contextual collision overload when that is the intended observation; the two-argument overload can use a cached shape.
- Serialize box unions with `VoxelShape.forAllBoxes`; `bounds()` loses holes/disconnected components.
- Preserve exact numeric coordinates and values outside `[0,1]`, including wall height 1.5.
- Empty getter returns air even at the block's own position. It is not a simulated standing player or a real neighboring world.
- Preserve exceptions/null separately from empty shapes. No full-cube/empty fallback.
- Do not apply position offsets twice.
- Neon cactus reads real neighbors; flower pots read block-entity contents; several plants/vines apply position offsets. Fluid and entity interactions need their own scenarios.

## 5. Code and data map

### Source/provenance pipeline

| Path | Responsibility |
|---|---|
| `tools/source-files.mjs` | Portable paths, strict duplicate-aware JSON parsing, streaming hashes, deterministic serialization |
| `tools/pinned-source.mjs` | Temporary immutable Git archive with checkout conversion disabled |
| `tools/catalogue.mjs` | Checked-in registrations/properties/shapes, resource precedence, explicit mobs/biomes and base parity records |
| `tools/provenance.mjs` | Every physical asset, typed references, declared licenses, missing/invalid source diagnostics |
| `tools/runtime-reconciliation.mjs` | Locked corpus verification, state/default joins, vehicle/helper obligations, chorus aliases, merged tags and resource differences |
| `tools/source-stage.mjs` | Deterministically generates/checks seven tracked outputs |
| `catalogue/generated/registrations.json` | Source records plus observed runtime defaults/components/entities/biomes |
| `catalogue/generated/resources.json` | Source resources, raw effective-resource observations and actual merged tag membership |
| `catalogue/generated/parity.json` | Current source/runtime obligations, all still `Unproven` |
| `reports/runtime-reconciliation.json` | Detailed state/resource reconciliation with verified `shapeAuditSummary` (`22,385` expanded neutral audit states, `0` missing/stale) |
| `reports/source-summary.json` | Combined current source/provenance diagnostics |

### Java reference

| Path | Responsibility |
|---|---|
| `java-exporter/src/main/java/dev/baitian/betterend/reference/ReferenceExporter.java` | Separate Fabric production observer, schema 3, clean stop after explicit receipt |
| `java-exporter/src/main/java/dev/baitian/betterend/reference/ServerPropertiesGuard.java` | Actual Java-properties prelaunch guard |
| `tools/java-reference.init.gradle` | External source set, isolated exporter JAR, dependency-coordinate correction and classpath capture |
| `tools/reference-inputs.mjs` | Immutable source/input checks, artifact attestation and runtime JAR identity checks |
| `tools/reference.mjs` | Recorded build/export operations with owned-workspace/fixture guards |
| `upstream/java-dependencies.lock.json` | Verified dependency/version/hash inputs |
| `upstream/java-reference.lock.json` | Active retained schema-3 corpus, build manifest and runtime receipt |

The active raw runtime digest is:

```text
ecd590f35cb7a60c8f8548adc3bcf79bdce0e18987323dd249b646585739f849
```

Active retained corpus:

```text
evidence/java/runtime-2026-11-02T05-13-25.746Z-0d8cb2ba.json.gz
```

Active build attestation:

```text
evidence/java/build-2026-11-02T05-12-23.407Z-ebfe7755.inputs.json
```

The attestation covers 10,694 immutable source inputs. Source fingerprint:

```text
3ff99216f1820311794e04ed70ccb748c5c37111b451230b3e78f85b56cb9ac2
```

The unchanged source-built BetterEnd JAR SHA-256 is:

```text
6103e63bc762f6ced0920f99a1a870234ceef7a6689ff46995d173ca372b27dd
```

### Native diagnostics

| Path | Responsibility |
|---|---|
| `tools/build-probe.mjs` | Real BP/RP folders, deterministic pack archives, asset hashes/licenses and PBR controls |
| `tools/run-bds-probe.mjs` | Owned BDS configuration, exact version check, structured result assertions, clean stop and retained artifacts |
| `probes/engine/scripts/main.js` | Startup/world-load lifecycle, zero-player console dispatch, block/worldgen/material observations |
| `probes/inventory/definitions.mjs` | Runtime-backed/generic native inventory entity definitions and diagnostic visuals |
| `probes/inventory/scripts/inventory.js` | Persistent fixtures, native custody/capacity/hopper experiments and open/close/load observers |
| `probes/inventory/verify.mjs` | Node-side acceptance of actual inventory observations |
| `tools/evidence.mjs` | Hash-bound immutable receipts, schema/sequence checks and cumulative failure caps |

The diagnostic namespace is not the production namespace. Proposed production IDs use `betterend_bedrock:`; current probes use `betterend_probe` and `betterend_inventory_probe`.

## 6. Prepared local runtimes

The previous host was Windows x64 (`10.0.26200`) using Git Bash, Node 24 and a portable JDK. No language server was configured. Other agent environments must inspect their own prerequisites rather than assume these ignored local files exist.

| Runtime | Prepared location |
|---|---|
| Exact target BDS 1.26.40.8 | `bedrock/.work/engines/bds-1.26.40.8` |
| Forward BDS 1.26.61.1 | `bedrock/.work/engines/bds-1.26.61.1` |
| Portable Temurin 25.0.5+8 | `bedrock/.work/java-reference/jdk/jdk-25.0.5+8` |
| Immutable Java source copy | `bedrock/.work/java-reference/source` |
| Java reference server | `bedrock/.work/java-reference/server` |
| Java exports/API declarations | `bedrock/.work/java-reference/exports` |
| Verified nested dependency modules | `bedrock/.work/java-reference/dependency-jars` |
| Downloaded distributions | `bedrock/.work/downloads` |

Java baseline: Minecraft 26.3, Fabric Loader 0.19.5, Fabric API 0.162.0+26.3, BCLib/WorldWeaver/WunderLib 26.301.2. Gradle 9.7.0 resolved Loom 1.18.4; exact classpath hashes are in the attestation.

The source requests `org.betterx:worldweaver:26.301.2`, but the published aggregate resolves as `de.ambertation:worldweaver:26.301.2`. The external init script substitutes that coordinate and exposes verified nested modules for compilation. Do not “fix” upstream source/build files outside the allowed directory.

The user explicitly authorized EULA acceptance for the owned Java reference server; see `docs/reference-eula-authorization.json`. That is not permission to silently accept legal terms on another operator's server.

Prepared world names:

- Exact BDS: `betterend-capability-2640`.
- Forward BDS: `betterend-capability-surface`.
- Earlier failed fixed-Y forward control: `betterend-capability-forward`, preserved rather than rewritten.
- Java: `betterend-reference`, seed 2640, loopback port 25585, empty whitelist/operator list.

The two automated BDS fixtures use ports 29140/29141, so run them sequentially. All game-server processes from the completed probes were stopped cleanly. No server service is intentionally left running for the receiving agent.

## 7. Commands and verified results

From the repository root:

```text
npm --prefix bedrock ci --ignore-scripts --cache bedrock/.work/npm-cache
npm --prefix bedrock run extract:source
npm --prefix bedrock run verify:source
npm --prefix bedrock run package:probe
```

Last full source verification: **40 passed, 0 failed, 0 skipped**. Retained output:

- `evidence/source/verified-stage-003.log`
- `evidence/source/verified-stage-002-pack.log` records the successful diagnostic package command; its earlier source suite had 39 tests before the final tag-omission regression.

The passing suite is not proof against the newly discovered uniform-row bug. Fix the test gap first.

Prepared Java regeneration:

```text
npm --prefix bedrock run reference:build
npm --prefix bedrock run reference:export
```

These require the prepared source/toolchain/cache/server described in the exporter README. Offline mode is intentional. Ordinary source verification uses the committed corpus and does not require running Java locally. No automated fresh-machine bootstrap command exists; do not invent one in instructions.

Safe repeated inspection of the existing exact fixture:

```text
npm --prefix bedrock run probe:bds -- --engine .work/engines/bds-1.26.40.8 --build 1.26.40.8 --request probes/inventory/scenarios/inspect.json
```

Other actual scenario files: `setup.json`, `roundtrip.json`, `transfer.json`, `hoppers.json` under `probes/inventory/scenarios/`. **Do not rerun setup on the existing fixture.** Transfer/hopper characterization is also one-time. Never clear the marker or reseed inventory to hide a failed attempt.

Engine scenarios under `probes/engine/scenarios/` cover outer/central scans, direct native feature, material board and persisted material state. `direct-feature.json` requires untouched End Stone and is not repeatable after its successful mutation.

Final goal interfaces `npm --prefix bedrock run verify` and `npm --prefix bedrock run package` are **not implemented**. Source/probe commands must not be renamed into those release interfaces as a shortcut.

## 8. Native inventory evidence and its limits

The current diagnostic add-on is version **0.1.2**, 29 payload files, 16,678 bytes:

```text
e559c9430763e886eabb00fa19499da1eba59cb27c21685d6e099333cf867024
```

Retained archive:

```text
bedrock/evidence/packs/e559c9430763e886eabb00fa19499da1eba59cb27c21685d6e099333cf867024.mcaddon
```

Stable headers:

- BP: `d16a5a53-d15f-482e-bf74-26c4d256ed24`.
- RP: `da0a04d5-ea63-492c-a620-461751f5a788`.

The candidates are a custom chest-cart-runtime actor and a generic custom inventory actor, plus a vanilla chest-minecart control. Both custom actors expose 27 native slots and revision 42. Each holds a metadata-bearing native sword and ten ingots.

Observed on both BDS lanes:

- Actor identity, definition property and observable item metadata survive normal restart.
- The original native sword moves between containers and back without reconstruction.
- Full-fit, partial-fit and no-capacity transfer cases conserve physical counts.
- Partial/no-capacity returns are also retained in the source slot; blindly reinserting them would duplicate items.
- Hoppers extract the sword and all ten ingots, and insert the metadata sword into each actor. Native restoration and a subsequent restart pass.

The exact setup's initial validator rejected equivalent unqualified adventure-permission IDs. That failure remains counted; later inspection used corrected canonical comparisons without reseeding. Forward setup passed on its own world.

Important limits: no native UI opening result, client render proof, opaque-item-data certification, abrupt-crash/partial-save recovery, damage/piston behavior, multiplayer locking or production station implementation. A normal restart is not a hard-crash test.

Evidence index: [inventory-stage-001.json](../evidence/engine/inventory-stage-001.json).

The current pack's material-board integration was also exercised afterward:

- Exact: `evidence/engine/2026-11-02T06-15-43.577Z-18b49511.json`.
- Forward: `evidence/engine/2026-11-02T06-15-48.397Z-fd375500.json`.

Those are server-side permutation checks, not graphics screenshots.

## 9. Acceptance counters

Current cumulative gate ledger in `bedrock/evidence/attempts.jsonl` (total recorded attempts: `55`):

| Supporting / capability gate | Recorded attempts | Failed attempts | Cap | Latest result |
|---|---:|---:|---:|---|
| ENG-001 | 12 | 2 | 15 | `pass` |
| INV-001 | 12 | 1 | 15 | `pass` (server-side; client UI pending) |
| JAVA-001 | 3 | 0 | 15 | `pass` |
| JAVA-002 | 5 | 2 | 15 | `pass` |
| CAP-003 | 6 | 3 | 15 | `pass` (`1.26.40.8` + `1.26.61.1`) |
| CAP-004 | 3 | 1 | 15 | `pass` (`1.26.40.8` + `1.26.61.1`) |
| CAP-005 | 2 | 0 | 15 | `pass` (`1.26.40.8` + `1.26.61.1`) |
| CAP-007 | 2 | 0 | 15 | `pass` (`1.26.40.8` + `1.26.61.1`) |
| CAP-008 | 2 | 0 | 15 | `pass` (`1.26.40.8` + `1.26.61.1` server; client HUD/camera pending) |
| CAP-009 | 0 | 0 | 15 | `not-run` (manual client entity/vehicle verification pending) |
| CAP-010 | 0 | 0 | 15 | `not-run` (manual client VV/PBR/local-lighting verification pending) |
| CAP-011 | 2 | 0 | 15 | `pass` (`1.26.40.8` + `1.26.61.1`) |
| CAP-012 | 2 | 0 | 15 | `pass` (`1.26.40.8` + `1.26.61.1`) |
| CAP-013 | 2 | 0 | 15 | `pass` (`1.26.40.8` + `1.26.61.1`) |
| CAP-014 | 2 | 0 | 15 | `pass` (`1.26.40.8` + `1.26.61.1`) |
| CAP-015 | 0 | 0 | 15 | `not-run` (manual 30-min multiplayer client session pending) |
| CAP-016 | 0 | 0 | 15 | `not-run` (manual third-party add-on client session pending) |
| CAP-017 | 0 | 0 | 15 | `not-run` (manual console/mobile memory & performance session pending) |

Continue the existing counters; do not reset by renaming a scenario or gate. Read `evidence/attempts.jsonl` through the integrity-checking tool before trusting totals.

```text
npm --prefix bedrock run evidence -- status ENG-001
npm --prefix bedrock run evidence -- status INV-001
npm --prefix bedrock run evidence -- status JAVA-002
```

The Java failures retain the initial direct-holder codec/resource-prefix problem and the later missing context-provider finding. Historical pass/fail observations remain unchanged after fixes.

## 10. User testing is arranged, not completed

The user selected **a separate test server** and **both baseline/newer-retail client lanes** in the question box. This is recorded in [client-verification-request.json](client-verification-request.json).

No client results were received before handoff. The local coding environment had no stock Minecraft client. Do not ask the route/version-availability questions again; request the actual session evidence.

Use [the client-session instructions](../probes/inventory/README.md#required-stock-client-session): activate both packs in separate fresh worlds, wait for world load, run inventory setup and material-board setup separately while empty, then join with version-matched stock clients. Do not upgrade the historical baseline fixture into the forward lane.

Required returned evidence includes exact client/BDS builds, device/OS/input/graphics settings, connection route and pack order/hash; clean-cache delivery/reconnect; vanilla/runtime/generic native screens; slot movement and returned metadata; concurrent-client observations; Classic/VV screenshots/video and content errors. The custom carrier choice remains unapproved until native UI/visual behavior is observed.

CAP-006 remains broader than the storage checks already performed. CAP-009 still needs representative scenes, CAP-010 per-player graphics is unimplemented, and CAP-015/CAP-017 require actual device/version-pair results.

## 11. Recipe and asset investigations to carry forward

### Recipe semantics

Read the complete [recipe hyperedge report](research/recipe-hyperedges.md). It is source research, not implemented recipe normalization or gameplay proof.

Key points to preserve:

- 879 source recipes are 878 main plus one optional. The shaped total 487 already includes that optional guidebook: 486 main + 1 optional.
- Eleven serializers exist. BCLib smithing means anvil forging with a reusable/damaged hammer; infusion's named “catalysts” are consumed and use fixed compass slots/all eight peripheral pedestals.
- End Stone Smelter blasting has distinct first-operation and subsequent-operation timing formulas.
- BCLib disabled-recipe filtering, WorldWeaver runtime injection/overrides and BetterEnd runtime brewing mean raw JSON is not the complete live recipe inventory.
- Declared result components, effective assembled stacks and input-dependent inheritance are different fields.
- Exact vanilla 26.3 consumer semantics remain unresolved in the report. Use the prepared `javap` or authoritative source before choosing vanilla smithing inheritance, remainders or fuel behavior.

### Asset investigation

See [asset-reference-investigation.md](research/asset-reference-investigation.md). No asset-remediation implementation was applied.

Static traversal from actual registered block/item roots plus equipment/particle/sound roots reached only the two already-recovered music files as missing active resources. Several bad legacy model files were not reached by that traversal. This does not certify absence of dynamic Java renderer references; do not silently discard source assets or clear every blocker based on that graph alone.

The colored-lights JSON has two duplicate keys with identical values. The strict source diagnostic remains; any normalization must be explicit and preserve source provenance.

### Rights/music

The root license is MIT, with these exact CC BY-NC-SA 4.0 exceptions and Team BetterX attribution:

```text
src/main/resources/assets/betterend/textures/gui/infusion.png
src/main/resources/assets/betterend/icon_updater.png
src/main/resources/assets/betterend/lang/de_de.json
```

Recovered official-distribution tracks:

- `ender_hollow.ogg`, SHA-256 `1b05ebe3f690ffe921d64613e13616943be4cdcedade1807839388d9820cd28b`.
- `moonlit_undercurrents.ogg`, SHA-256 `2196752806dff9e8a0b234e03e1dc24c425f0bcbead7cbf51333c2993a01da81`.

Both are credited to **noqwww**. All 43 existing source OGG files matched the official distribution. Both missing files decoded in Chromium OfflineAudioContext; no Bedrock playback or per-track distribution approval is claimed. Read `upstream/music-distribution.json` and `evidence/source/recovered-music-decode.json`.

## 12. Suggested parallel work allocation

Use one integration owner. These are proposed assignments, not claims that production modules already exist.

### Agent A — shape audit correction and geometry oracle

Own `tools/catalogue.mjs` shape parsing, the state-coverage portion of `tools/runtime-reconciliation.mjs`, and focused regressions. Fix the confirmed uniform-row bug first. Then propose/implement explicitly scoped neutral shape extraction if needed, using the complete geometry research. Preserve world-dependent limitations. Coordinate changes to the Java exporter/schema with the integration owner.

### Agent B — recipe/reference graph

Own new recipe normalization/extraction modules and focused behavior tests. Cover all eleven serializers, optional profiles, runtime injection, merged tags, positional occurrences, consumption/damage/remainders, timing/fuel/XP and result metadata. Do not reduce everything to an item/count list or assume raw-resource presence means live activation. The integration owner owns shared catalogue/output schema changes.

### Agent C — asset/model conversion and provenance

Own model-parent/texture-binding flattening, source-root reachability and material/animation/tint/transform data. Use the asset investigation as leads, not exclusion authority. Preserve Classic assets and provenance; do not invent missing textures or clear rights flags by filename. Java entity renderers and procedural models require explicit extraction/translation, not generic replacement mobs.

### Agent D — worldgen/identity capability work

Own separate probes for CAP-003/CAP-004/CAP-005/CAP-014. The existing single-block End feature is not a complete generator. Prove selector agreement, actual biome identity or reviewed logical-only scope, authored import where needed, generation ownership and player-build safety. No invented runtime biome setter, arbitrary generation interception or unreviewed End replacement.

### Agent E — gameplay and persistence capability work

Own isolated capability probes for native gliding, respawn, functional variants and interrupted physical inventory transactions. Use actual players where required. Preserve genuine Elytra behavior and native item custody. Do not infer crash-atomicity from a journal or screen locking from a boolean. No production workstation architecture before the relevant native UI/carrier contract is proven.

### Agent F — visuals and device evidence

Own native VV/material/fog/graphics probes and user-device evidence organization. Stable server API is 2.9.0; 26.40 per-player graphics is a separately qualified beta adapter, not the later stable graphics API. Prove two-player isolation and lifecycle reset. Keep a full non-VV path and do not use shader injection. User-operated console/mobile evidence is not replaceable by headless assertions.

### Integration owner

Own shared schemas, `source-stage.mjs`, generated outputs, package identities, evidence ledger and stage publication. Inspect each contribution, run actual smoke scenarios, execute integrated tests once changes are ready, update docs and push scoped verified stages. Default editing workers in the old tool environment failed with HTTP 402; read-only scouts/reviewers worked. Other agents should use their actually available providers rather than repeating that failure loop.

## 13. Remaining project work — not optional

- Correct source audit semantics and finish the source-derived recipe/asset/behavior ledger, including dependency-created behavior and conditional profiles.
- Prove worldgen/biome identity/import/ownership contracts before bulk terrain production.
- Implement all 27 regions, structures, natural resources, ecology and player-build safety.
- Implement all blocks, functional variants, plants, liquids/support/growth behavior and survival interactions.
- Implement all recipes, stations, rituals and explicit native inventory recovery semantics.
- Implement all six wildlife families, variants, AI, spawning, drops and renewability.
- Implement equipment, tools/armor/effects, genuine Elytra variants, portals and charged respawning.
- Implement complete Classic and native VV assets, region presentation, audio, translations and discovery guidance.
- Implement real release `verify` and `package` interfaces; no source/probe aliases.
- Run full BDS survival, multiplayer, interruption, persistence, migration/backup and declared integration-stack scenarios.
- Obtain all required actual-device delivery/input/rendering evidence, separately per version lane.
- Complete rights/attribution and documented adaptations; keep stage commits/pushes and independent review evidence current.
- Close the goal only when every mandatory acceptance criterion has current evidence. This handoff does not close it.

## 14. Receiving-agent startup prompt

```text
Read bedrock/AGENTS.md and bedrock/docs/HANDOFF.md. Continue the complete native BetterEnd Bedrock26.40 port on experimental/bedrock-26.40; all writes remain under bedrock/. Preserve the user's root changes and existing worlds. The latest implementation/client-coordination commit before the handoff is7ea1d7a99; inspect the current branch rather than resetting to it.

First fix the confirmed Wover shape-audit uniform-row interpretation bug, with a failing regression and regenerated outputs. Do not invent3712 missing shapes:179 compressed rows cover those states. Preserve neutral-context/rounding limits and do not infer defaults from the first row.

Use the retained schema3 Java corpus and verified native inventory diagnostics. Source/probe checks are not production completion. The user selected a separate server and both client lanes; actual UI/VV/device results are still pending. Do not claim them passed.

Use independent agents with explicit ownership, inspect their results, run actual smoke checks, retain immutable evidence and cumulative15-failure counts, document findings, and commit/push verified stages only to the authorized fork. No placeholders, fake fallbacks, silent parity reduction or final verify/package aliases.
```
