# Source and capability implementation review

## Reviewed contributions

Parallel read-only investigations established the registry/resource precedence, asset/license boundaries, exact 26.40 probe schemas and API signatures. Two configured editing workers failed to start; they made no changes. Implementation was performed locally using the researched contracts. Parallel reviewers then inspected source extraction and evidence/provenance code; their findings were checked against code and regression cases rather than accepted as proof of correctness.

## Corrected defects

- Enchantment tags were initially classified as generic `tags`, producing incorrect upstream tag IDs. Added the explicit registry category and regression coverage for `minecraft:in_enchanting_table` and `minecraft:tradeable`.
- Retained evidence hashes were initially checked only when writing receipts. Reading now validates receipt schema, artifact paths, existence and current SHA-256; changed, deleted or digest-less evidence fails closed.
- A non-string gate ID could pass a coercing regular expression and evade cumulative failure counts. Gate IDs are now required to be strings; regression cases preserve the failure-counter invariant.
- Windows line-ending conversion made reproducibility depend on checkout settings. Bedrock-owned generated files now have an LF policy and retained evidence disables conversion. Source extraction uses a temporary archive of the exact pinned Git commit, with conversion disabled for that archive command, instead of silently hashing platform-converted or locally modified upstream files. A real temporary Git-repository regression proves the committed bytes are used while working-copy changes remain untouched.
- ZIP timestamps initially used a UTC instant that became 1979 in western timezones. The failure was reproduced with `fflate` under `America/Los_Angeles`; packaging now uses fixed local calendar fields and a regression verifies identical archive bytes across western, UTC and eastern timezones. The corrected archive's 20 uncompressed payload files match the runtime-tested archive exactly.

The evidence defects were reproduced with three failing regression cases before correction. The first archive regression also exposed Git archive's conversion behavior and was fixed at the archive command, not by weakening the expected committed bytes.

The reference/inventory stage added the following reviewed corrections:

- Three axes contain direct `BlockTransformer` holders that the ordinary reference-only component codec rejects. Their actual values are expanded using Minecraft's `DIRECT_CODEC`, with explicit holder kind, reference and encoding metadata; the rules are not skipped or replaced.
- Empty resource prefixes caused real server errors. Enumeration now discovers nonempty data roots. The original numeric-provider allowlist also omitted Java 26.3's `context_int_provider`; the exporter now retains effective JSON across the actual loaded profile.
- Raw highest-priority tag JSON is not merged tag membership. Registry-tag observations are kept distinct from raw resource observations; recipe activation is not inferred from a resource's presence.
- Missing or unbound main-scope tags now receive their own release-blocking diagnostics even when the raw JSON is byte-identical to the source. Bound empty tags remain valid. A smoke run removed only the thallasium repair tag from the real corpus in memory and confirmed the blocker while its raw resource still matched.
- A matching properties line did not prove the effective server configuration when later duplicate or escaped keys overrode it. The prelaunch guard uses Java's actual `Properties` parser. Real source-launcher checks rejected duplicate world/public-bind overrides, escaped keys and EULA revocation without launching a world.
- The original source identity was only a declared constant. The runner now checks the materialized source bytes against the immutable Git pin before compilation, checks inputs afterward, and binds the produced BetterEnd/exporter JAR hashes to the runtime observations.
- Temporary export output now uses exclusive creation, refusing an existing `.writing` file or link rather than truncating it.
- Catalogue acceptance now binds every runtime/manifest/receipt/dependency commit to the catalogue pin. Independently present BoatItems and seating blocks require their vehicle/helper entities; losing those entities cannot silently shrink the ledger.
- The native inventory validator now compares canonical block/enchantment identifiers rather than rejecting equivalent default-namespace spellings. The failed original assertion remains in `INV-001`; the persisted fixture was inspected, not reseeded.

Parallel reviewers inspected the source/runtime identity joins and native inventory custody, including the hopper delta. Their concrete findings were corrected and regression-tested or exercised against actual runtimes. Static review alone is not treated as an engine/client result.

## Open findings and source issues

The exporter inventories all physical assets even when source JSON is ambiguous; its strict parser does not silently select a duplicate key. Such files retain hashes and explicit release-blocking diagnostics. This is different from clearing or copying malformed data into the port.

The live reference resolved the wood odds to 5/5, while retaining the source's 5/20 request as an explicit difference rather than silently rebalancing it. It also resolved the two custom-chorus visual aliases to vanilla targets and identified 20 vehicle types plus one seating helper shared by 33 furniture blocks. Those are additional port obligations, not additional wildlife species.

Missing model/texture references, source JSON ambiguity, unaudited external asset rights and the three restricted assets remain visible. The two tracks absent from the Git source were found, hash-verified and decoded from the official distribution; actual Bedrock playback/integration and per-track distribution review remain open.

**Correction discovered at handoff and subsequently resolved:** the previously reported 3,712 missing states and 179 stale rows were a parser/reconciliation bug, not missing upstream geometry. WorldWeaver compresses identical neutral-context, four-decimal shape pairs into one unqualified row. The 179 property-bearing uniform rows cover 3,712 states, so `18,852 - 179 + 3,712 = 22,385`; no audit row is `unavailable`. Failing-before/passing-after regressions were added in `tests/catalogue.test.mjs` and `tests/runtime-reconciliation.test.mjs`, `tools/catalogue.mjs` and `tools/runtime-reconciliation.mjs` were updated to distinguish `uniform-all-states` from `explicit-states` while preserving `auditContext` and `shapesRuntimeVerified: false`, and all seven tracked generated outputs were regenerated cleanly (`missingShapeStates: 0`, `staleShapeStates: 0`, `expandedNeutralAuditShapeStates: 22385`, `catalogue.unresolved` reduced from 4 to 3). See [the verified investigation](research/geometry-oracle.md) and [the handoff documentation](HANDOFF.md#4-immediate-priority-correct-uniform-shape-audit-semantics). Historical stage-001/stage-002 evidence logs remain unchanged. Context-dependent collision, AI, riding, recipes and client presentation are still separate requirements.

## Verified stage evidence

The first-stage index is [stage-001-summary.json](../evidence/source/stage-001-summary.json); the reference/inventory stage is [stage-002-summary.json](../evidence/source/stage-002-summary.json). With the uniform shape-audit regression additions, verification passes **42 tests**, with zero failures or skips, and reproduces all seven generated source outputs. The diagnostic package contains 29 files and was exercised on exact 26.40.8 and separate 26.61.1 BDS lanes. Native inventory restart, metadata-preserving moves, capacity/remainder custody and hopper I/O passed; survival, native client UI and rendering acceptance remain open.
