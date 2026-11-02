# BetterEnd Bedrock

Native Bedrock port on `experimental/bedrock-26.40`. The required baseline is **26.40**, with separately verified newer public client/BDS deployment lanes. Required clients include Windows, Android, iOS/iPadOS, Xbox, PlayStation and Nintendo. Stock clients receive resources through the custom server; lack of a console-local add-on importer is not an exclusion.

**Current implementation:** deterministic source/provenance tooling, an input-attested live Java reference exporter, integrity-checked acceptance receipts, and native Bedrock block/worldgen/inventory diagnostic packs. **The full survival port is not complete and no platform/rendering certification is claimed.** The [execution contract](docs/execution-contract.md) remains the completion standard.

For another coding agent, start with [AGENTS.md](AGENTS.md) and the [detailed handoff](docs/HANDOFF.md). The handoff records a confirmed uniform-shape-audit interpretation bug that is not yet fixed in the generated reconciliation.

## Implemented source pipeline

Source extraction materializes the immutable upstream Git commit, preserving its bytes independently of checkout conversion or local changes. It joins checked-in audits/resources with a hash-pinned production Java runtime corpus: true defaults, complete state domains, intrinsic components, dependency-created entities and merged registry tags. Raw resource visibility is not recipe activation; registry observations are not gameplay or client certification.

| Inventoried source category | Count |
|---|---:|
| Block registrations | 728 |
| Item registrations | 850 |
| Explicit mob families | 6 |
| Boat/chest-boat/raft vehicle types | 20 |
| Shared seating helper types | 1 |
| Furniture blocks using that helper | 33 |
| Region keys | 27 |
| Observed state/shape snapshot rows | 18,852 |
| Live possible block states | 22,385 |
| Live states represented by uniform rows on property-bearing blocks | 3,712 |
| Property-bearing blocks using uniform audit rows | 179 |
| Main recipes | 878 |
| Separately scoped optional recipe | 1 |
| Source/runtime parity records | 4,954 |
| Physical source assets | 6,658 |
| Explicit CC BY-NC-SA asset exceptions | 3 |

Generated source records live in `catalogue/generated/`, provenance/locks in `upstream/`, and reconciliation findings in `reports/source-summary.json`. Mandatory gameplay entries remain `Unproven` until actually implemented and verified. Missing resources, ambiguous source JSON, stale audit observations, external dependencies and rights reviews remain visible; extraction success does not clear them.

**Handoff correction:** the current generated report incorrectly calls those uniform rows “missing/stale” coverage. The upstream audit deliberately compresses equal neutral-context shape pairs; expanded coverage is all 22,385 live states. Fix the parser/reconciliation rather than inventing geometry. This does not certify context-dependent physics.

## Runnable commands

From the repository root, with Node 24 and Git/tar available:

```text
npm --prefix bedrock ci --ignore-scripts --cache bedrock/.work/npm-cache
npm --prefix bedrock run extract:source
npm --prefix bedrock run verify:source
npm --prefix bedrock run package:probe
npm --prefix bedrock run evidence -- status ENG-001
```

- `extract:source` joins the immutable source with the committed, hash-verified runtime corpus; it does not follow moving `HEAD`.
- `verify:source` runs meaningful regression tests and checks generated records for drift.
- `package:probe` builds real BP/RP folders and a portable diagnostic `.mcaddon`; it is not a production BetterEnd release.
- `evidence` records retained, hash-bound observations and enforces the cumulative 15-failure cap. Missing/changed evidence, malformed IDs and corrupt ledgers fail closed.
- `reference:build` and `reference:export` regenerate the real Java observations in the prepared isolated workspace. See [reference prerequisites and evidence](java-exporter/README.md); ordinary source verification uses the retained corpus and does not require a local Java server.

The final goal's `verify` and `package` release acceptance is distinct from these source/probe commands; it must include the completed gameplay and actual platform gates. Passing this stage must not be advertised as completing that contract.

## Native engine execution

See [the probe instructions](probes/engine/README.md) for the owned disposable-server setup and actual commands. Native block/item registration, natural End feature readback, protected central sampling and material-board permutations have executable server-side checks. The exact 26.40.8 and separate 26.61.1 receipts are retained under `evidence/engine/` and identified by `upstream/engine.lock.json`.

The probe uses the real engine, real original albedo, supported PBR texture sets and stable Script API 2.9.0. Its separate namespace and calibration states are diagnostic instruments, not substitute gameplay content. Client screenshots, resource delivery and controller/touch usability require actual client tests; BDS output alone cannot certify them.

The [native inventory probe](probes/inventory/README.md) additionally exercises real carrier storage, metadata custody, restart, capacity boundaries and hopper I/O. Exact 26.40.8 and separate 26.61.1 server lanes passed those automated scenarios. Native screen opening, simultaneous player access and Classic/VV presentation still require the documented stock-client session.

## Scope and evidence

- New implementation, tooling, dependencies, documentation and retained evidence stay under this directory. The upstream Java tree and existing root changes are left untouched.
- `.work/` contains ignored downloaded engines, reference distributions, disposable worlds and temporary fixtures. `dist/` contains reproducible build output. Neither is committed.
- `.gitattributes` keeps generated text and Java/Gradle reference sources LF-stable, while retained evidence remains byte-exact across checkouts. The [actual Git filter smoke](evidence/source/reference-eol-smoke.json) checks both Windows-style and LF configurations.
- [Source review](docs/source-review.md) records independently reviewed defects and corrections.
- [Initial specification](docs/reference/BetterEnd_Bedrock_26.40_Implementation_Plan.md) preserves the full required content/platform scope.
- The two missing music files have been located, hash-verified and decoded from the official distribution; `upstream/music-distribution.json` distinguishes that evidence from pending Bedrock playback/integration and rights review.

No production deployment, existing-world migration, asset-rights clearance, native client rendering, or complete survival-loop result is implied by this tooling stage.
