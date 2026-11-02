# BetterEnd Bedrock

Native Bedrock port on `experimental/bedrock-26.40`. The required baseline is **26.40**, with separately verified newer public client/BDS deployment lanes. Required clients include Windows, Android, iOS/iPadOS, Xbox, PlayStation and Nintendo. Stock clients receive resources through the custom server; lack of a console-local add-on importer is not an exclusion.

**Current implementation:** deterministic source inventory/provenance tooling, integrity-checked acceptance receipts, and executable native-engine diagnostic packs. **The full survival port is not complete and no platform/rendering certification is claimed.** The [execution contract](docs/execution-contract.md) remains the completion standard.

## Implemented source pipeline

The exporter materializes the immutable upstream Git commit, preserving its exact bytes independently of Windows checkout conversion or local source changes. It inventories registration/property/state snapshots, effective generated/authored resources, separate optional packs, explicit mob/biome declarations, recipes and complete source-asset provenance. It does not pretend checked-in audits are live runtime exports.

| Inventoried source category | Count |
|---|---:|
| Block registrations | 728 |
| Item registrations | 850 |
| Explicit mob families | 6 |
| Region keys | 27 |
| Observed state/shape snapshot rows | 18,852 |
| Main recipes | 878 |
| Separately scoped optional recipe | 1 |
| Source parity records | 4,931 |
| Physical source assets | 6,658 |
| Explicit CC BY-NC-SA asset exceptions | 3 |

Generated source records live in `catalogue/generated/`, provenance/locks in `upstream/`, and reconciliation findings in `reports/source-summary.json`. Mandatory gameplay entries remain `Unproven` until actually implemented and verified. Missing resources, ambiguous source JSON, stale audit observations, external dependencies and rights reviews remain visible; extraction success does not clear them.

## Runnable commands

From the repository root, with Node 24 and Git/tar available:

```text
npm --prefix bedrock ci --ignore-scripts --cache bedrock/.work/npm-cache
npm --prefix bedrock run extract:source
npm --prefix bedrock run verify:source
npm --prefix bedrock run package:probe
npm --prefix bedrock run evidence -- status ENG-001
```

- `extract:source` writes the deterministic checked-in inventory from the pinned commit, not moving `HEAD`.
- `verify:source` runs meaningful regression tests and checks generated records for drift.
- `package:probe` builds real BP/RP folders and a portable diagnostic `.mcaddon`; it is not a production BetterEnd release.
- `evidence` records retained, hash-bound observations and enforces the cumulative 15-failure cap. Missing/changed evidence, malformed IDs and corrupt ledgers fail closed.

The final goal's `verify` and `package` release acceptance is distinct from these source/probe commands; it must include the completed gameplay and actual platform gates. Passing this stage must not be advertised as completing that contract.

## Native engine execution

See [the probe instructions](probes/engine/README.md) for the owned disposable-server setup and actual commands. Native block/item registration, natural End feature readback, protected central sampling and material-board permutations have executable server-side checks. The exact 26.40.8 and separate 26.61.1 receipts are retained under `evidence/engine/` and identified by `upstream/engine.lock.json`.

The probe uses the real engine, real original albedo, supported PBR texture sets and stable Script API 2.9.0. Its separate namespace and calibration states are diagnostic instruments, not substitute gameplay content. Client screenshots, resource delivery and controller/touch usability require actual client tests; BDS output alone cannot certify them.

## Scope and evidence

- New implementation, tooling, dependencies, documentation and retained evidence stay under this directory. The upstream Java tree and existing root changes are left untouched.
- `.work/` contains ignored downloaded engines, reference distributions, disposable worlds and temporary fixtures. `dist/` contains reproducible build output. Neither is committed.
- `.gitattributes` keeps generated text reproducible and retained evidence byte-exact across checkouts.
- [Source review](docs/source-review.md) records independently reviewed defects and corrections.
- [Initial specification](docs/reference/BetterEnd_Bedrock_26.40_Implementation_Plan.md) preserves the full required content/platform scope.
- The two missing music files have been located and hash-verified in the official distribution; `upstream/music-distribution.json` distinguishes acquisition from pending decoding/playback/rights review.

No production deployment, existing-world migration, asset-rights clearance, native client rendering, or complete survival-loop result is implied by this tooling stage.
