# Authoritative Java reference exporter

This separate Fabric mod observes the pinned BetterEnd Java reference after normal dedicated-server startup. It is not included in the BetterEnd JAR and does not run datagen or GameTest.

## Implemented output

- Live block registry IDs/classes, block-item associations, default mining hardness, friction/speed/jump/blast values and actual flammability odds.
- Explicit default block states, complete property domains and possible states, including per-state light, fluid, replacement, piston and block-entity flags.
- Final intrinsic item components encoded with the live registry context, with exact per-component failures retained rather than opaque string substitutes.
- Live entity registry entries, including dependency-created types, and biome codec data.
- Bound tags across all available registries and effective JSON resources across the loaded profile. Highest-priority raw tag files are not mistaken for merged membership.
- Loaded mods, origins/hashes, selected data packs, production/development/datagen/GameTest flags, world seed and configuration files.

Context-dependent collision, placement, AI, redstone and player interactions still require their own scenarios. A successful exporter result is not a completed Bedrock port.

## Actual build evidence

The pinned BetterEnd source was materialized under `bedrock/.work/java-reference/source` and compiled with the verified portable Temurin 25.0.5+8 toolchain. Gradle 9.7.0 reported Loom 1.18.4. Both the reference `:jar` and separate `:bedrockReferenceExporterJar` tasks completed successfully. Existing upstream/dependency deprecation/native-access warnings were retained, not suppressed.

`../tools/java-reference.init.gradle` supplies the external source set and fixes the published WorldWeaver coordinate from `org.betterx:worldweaver:26.301.2` to `de.ambertation:worldweaver:26.301.2`. The aggregate's verified nested modules are exposed for compilation; the production server retains the original aggregate for Fabric's nested-JAR loading.

No original Java source or root build configuration was edited. The reference JAR uses checked-in resources before datagen and an explicit empty-vault profile. The two external music files have separate acquisition evidence; that does not silently change this build profile.

## Runtime prerequisites and safety

The disposable server is under `bedrock/.work/java-reference/server`, bound to loopback on port 25585, with an empty whitelist and no existing player world. It contains the exact required mod versions and the separately built exporter. All JVM homes, caches, temporary files and output paths are scoped under `bedrock/`.

Required JVM properties:

- `betterend.reference.workspace`: absolute permitted Bedrock workspace.
- `betterend.reference.output`: a new output JSON path inside that workspace.

The exporter refuses existing output paths and workspace escapes. It emits `BETTEREND_REFERENCE_EXPORT` with explicit complete/incomplete/failed status, counts and output digest, then requests a clean server stop. A process exit without that receipt is not export success.

The user explicitly authorized EULA acceptance for this disposable reference server; that authorization is recorded in `../docs/reference-eula-authorization.json`. The real production export now completes with zero issues: 728 blocks, 850 items, 27 entity types, 27 biomes, 22,385 states, 12,060 effective JSON resources and 1,560 bound tags across 163 available registries.

Schema 3 replaces the separate block/item tag arrays with registry-keyed `registryTags`. Native component codecs remain the default. `minecraft:block_transformer` has an explicit `expanded-registry-value` representation containing the registry, holder kind/reference and actual `BlockTransformer.DIRECT_CODEC` value. This is an exporter representation, not a vanilla component payload or string fallback.

## Reproduction and evidence

For the prepared isolated workspace, run:

```text
npm --prefix bedrock run reference:build
npm --prefix bedrock run reference:export
```

The first command requires the pinned source copy, verified JDK/dependencies, Gradle cache and empty-vault profile already described above. Offline mode avoids changing the resolved dependency set. It compares all 10,694 materialized source files with the immutable Git archive before compilation and checks again afterward. Its retained attestation contains source/exporter inputs, resolved classpath hashes and both produced JAR hashes.

The export command requires that successful attestation, the owned fixture marker, empty whitelist/operator list and explicit EULA state. A separate Java source-launcher guard checks the **effective** Java properties before the game starts, including duplicate/escaped overrides. The runner verifies the actual loaded artifact hashes, production profile, explicit exporter receipt, output digest and clean process exit. It never enables EULA acceptance itself.

`JAVA-001` records build acceptance and `JAVA-002` records runtime-reference acceptance, with cumulative failure accounting. Immutable logs, input manifests and compressed runtime outputs are retained under `../evidence/java/`. `../upstream/java-reference.lock.json` selects the corpus used by deterministic source reconciliation; historical failed and superseded observations remain unchanged.

The reference JAR is source-pinned and uses the production no-vault profile. Optional integrations, in-world geometry/behavior and client renderers are not certified merely because their IDs or data were exported.
