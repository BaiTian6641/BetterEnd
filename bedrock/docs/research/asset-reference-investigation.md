# Asset-reference investigation at handoff

This is an investigation record, not an implemented asset compiler or a distribution-rights clearance. No original source assets were edited, missing artwork was not fabricated, and the current provenance diagnostics were not silently removed.

## Inputs and method

- Pinned BetterEnd source: `5a25059ef4fd77409024a2919fb0a0098388104f`.
- `bedrock/upstream/asset-provenance.json`, including typed resource references and exact source hashes.
- `bedrock/catalogue/generated/registrations.json`, including actual runtime item-model components and the two verified chorus visual aliases.
- The hash-verified official `better-end-26.301.2.jar` under `.work/downloads/`; acquisition metadata is in `upstream/music-distribution.json`.

An in-memory traversal used these conservative static roots:

1. Every registered block's actual blockstate resource.
2. The custom-chorus blockstate resources mapped to vanilla targets.
3. Every live item's `minecraft:item_model` definition.
4. All source equipment definitions, particle definitions and sound-event files.

It followed concrete model/texture/audio references in the provenance data. Binding/template references and dynamic Java renderer behavior were not certified by this traversal.

| Observation | Count |
|---|---:|
| Static roots | 1,601 |
| Reached resource identifiers, including external/missing nodes | 5,476 |
| Missing live item-definition roots | 0 |
| Unique missing resources reachable from these roots | 2 |

The two reachable missing resources were the already-recovered music files:

```text
betterend/sounds/music/ender_hollow.ogg
betterend/sounds/music/moonlit_undercurrents.ogg
```

## Broken legacy references not reached by this graph

These source files contain missing references but were not reached from the static live roots above:

```text
src/main/resources/assets/betterend/blockstates/bulb_lantern.json
src/main/resources/assets/betterend/models/block/aurora_crystal_2.json
src/main/resources/assets/betterend/models/block/chorus_outer_stairs.json
src/main/resources/assets/betterend/models/block/lumecon_middle_big.json
src/main/resources/assets/betterend/models/block/lumecorn_bottom_big.json
src/main/resources/assets/betterend/models/block/lumecorn_bottom_small.json
src/main/resources/assets/betterend/models/item/bulb_lantern.json
```

Relevant positive observations:

- The registered aurora crystal's blockstate uses `betterend:block/aurora_crystal`, not the `_2` model.
- Registered bulb lanterns are material-prefixed iron/terminite/thallasium families and their colored variants; the unqualified `betterend:bulb_lantern` is not in the live registry.
- Registered lumecorn uses `lumecorn_roots_big`, `lumecorn_roots_small` and `lumecorn_middle`. Their inspected references resolve to existing `lumecorn_roots`, `lumecorn_stem` and leaf textures, not the missing `lumecorn_bark` texture.
- A targeted Java literal search found the metal-material bulb-lantern slot/construction logic, not literal references to the other suspect legacy identifiers. Dynamic naming remains a separate analysis requirement.

**Do not equate “not reached by this graph” with universally unused.** Java renderers, procedural model providers, migration/compatibility paths and dynamic resource construction still require review before exclusions or blocker changes.

## Official distribution cross-check

The verified official release contains the two missing music files with the recorded hashes. It does **not** contain these other missing resources:

```text
assets/betterend/models/block/bulb_vine_lantern_ceil.json
assets/betterend/models/block/bulb_vine_lantern_floor.json
assets/betterend/textures/block/aurora_crystal_2.png
assets/betterend/textures/block/chorus_planks.png
assets/betterend/textures/block/lumecorn_bark.png
```

The published release is the direct parent of the pinned ladder-fix commit, not a byte-identical executable of the child commit. No missing non-audio asset was recovered from that archive.

## Duplicate colored-light keys

Inspection of the original key pairs in:

```text
src/main/resources/assets/colored_lights/light_colors.json
```

found exactly two repeated keys, both with identical values:

| Key | Both values |
|---|---|
| `betterend:smaragdant_crystal_shard` | `#17cfbd` |
| `betterend:umbrella_tree_cluster` | `#c054f9` |

The strict parser correctly retains the source ambiguity diagnostic. If this metadata is normalized for a native presentation compiler, make that an explicit, source-hash-bound transformation; do not overwrite the upstream file or silently choose a conflicting value. This file is renderer-integration metadata, not evidence that an executable shader can be loaded by stock Bedrock clients.

## Receiving-agent actions

- Build model-parent/texture-binding resolution around actual registered consumers and source-backed dynamic roots.
- Preserve all physical-source inventory records even when a file is classified as nonshipping legacy material.
- Keep opaque/dynamic references unresolved until their producer/consumer is traced.
- Integrate the two recovered audio inputs only with their provenance, attribution, rights review and actual Bedrock playback checks.
- Do not manufacture substitute textures, flatten all geometry into cubes, or remove mandatory content to make a resource validator green.
