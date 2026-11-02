# Initial source-tooling review

## Reviewed contributions

Parallel read-only investigations established the registry/resource precedence, asset/license boundaries, exact 26.40 probe schemas and API signatures. Two configured editing workers failed to start; they made no changes. Implementation was performed locally using the researched contracts. Parallel reviewers then inspected source extraction and evidence/provenance code; their findings were checked against code and regression cases rather than accepted as proof of correctness.

## Corrected defects

- Enchantment tags were initially classified as generic `tags`, producing incorrect upstream tag IDs. Added the explicit registry category and regression coverage for `minecraft:in_enchanting_table` and `minecraft:tradeable`.
- Retained evidence hashes were initially checked only when writing receipts. Reading now validates receipt schema, artifact paths, existence and current SHA-256; changed, deleted or digest-less evidence fails closed.
- A non-string gate ID could pass a coercing regular expression and evade cumulative failure counts. Gate IDs are now required to be strings; regression cases preserve the failure-counter invariant.
- Windows line-ending conversion made reproducibility depend on checkout settings. Bedrock-owned generated files now have an LF policy and retained evidence disables conversion. Source extraction uses a temporary archive of the exact pinned Git commit, with conversion disabled for that archive command, instead of silently hashing platform-converted or locally modified upstream files. A real temporary Git-repository regression proves the committed bytes are used while working-copy changes remain untouched.
- ZIP timestamps initially used a UTC instant that became 1979 in western timezones. The failure was reproduced with `fflate` under `America/Los_Angeles`; packaging now uses fixed local calendar fields and a regression verifies identical archive bytes across western, UTC and eastern timezones. The corrected archive's 20 uncompressed payload files match the runtime-tested archive exactly.

The evidence defects were reproduced with three failing regression cases before correction. The first archive regression also exposed Git archive's conversion behavior and was fixed at the archive command, not by weakening the expected committed bytes.

## Source issues intentionally retained

The exporter inventories all physical assets even when source JSON is ambiguous; its strict parser does not silently select a duplicate key. Such files retain hashes and explicit release-blocking diagnostics. This is different from clearing or copying malformed data into the port.

Current source evidence includes a non-log wood flammability disagreement between Java declarations and checked-in audits, nonregistry visual aliases/orphans, missing model/texture references, two missing music tracks, unaudited external dependency resources and three explicitly restricted assets. See `../reports/source-summary.json` and `../upstream/asset-provenance.json` for the exact records.

Checked-in audit coverage is not live-runtime completeness. Default states, item components, conditional registrations and dependency-created entities still require the pinned Java reference extraction. No source-ledger entry is marked implemented merely because it was inventoried.

## Verified stage evidence

The first-stage evidence index is [stage-001-summary.json](../evidence/source/stage-001-summary.json). The current regression suite passed 32 tests. Exact 26.40.8 BDS runs verified native generation, central exclusion, native feature mutation, material permutations and a persisted permutation after restart; separate 26.61.1 receipts remain separately identified. These are diagnostic engine results, not complete survival or client-rendering acceptance.
