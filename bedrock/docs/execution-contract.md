# BetterEnd Bedrock execution contract

## Objective

Implement the complete BetterEnd survival port, not a decorative subset, on branch `experimental/bedrock-26.40` in `BaiTian6641/BetterEnd`. The required native Bedrock content/API baseline is 26.40. Preserve official BDS, unmodified clients, real End progression and server-delivered packs. Cover Windows, Android, iOS/iPadOS, Xbox One/Series, PlayStation 4/5, and Nintendo Switch/Switch 2. Qualify newer version-matched public client/BDS deployment lanes separately where needed; do not use them as historical 26.40 evidence.

The initial [implementation specification](reference/BetterEnd_Bedrock_26.40_Implementation_Plan.md) and [earlier research](reference/BetterEnd_Bedrock_Port_Plan.md) are tracked snapshots. The earlier research's 26.60 assumptions do not override the 26.40 baseline.

## Completion criteria

- All mandatory source-derived parity entries implemented, including all 27 regions, six wildlife families, functional blocks/variants, resources, recipes, farming, workstations/rituals, equipment and genuine gliding, transport/respawn, audio and discovery.
- No placeholder, stub, fake fallback, silently dropped family, or mandatory unverified feature presented as complete. Engine-forced adaptations require reproducible evidence and explicit user approval.
- `npm --prefix bedrock run verify` and `npm --prefix bedrock run package` are real complete verification/build commands and exit zero at final acceptance.
- All documented real-BDS and platform acceptance scenarios pass. Automated checks alone do not establish actual gameplay, rendering or console compatibility.
- Complete non-VV and native Vibrant Visuals clients coexist on the same server with identical survival mechanics. Graphics capability must not determine obtainable content.
- The user supplies recorded console/mobile tests when direct hardware is unavailable. Required untested platforms keep the goal incomplete.

## Allowed operations and boundaries

All new implementation, dependencies, tooling, tests, generated records, documentation and retained evidence stay under `bedrock/`. Source/reference files elsewhere may be read but not changed. Preserve existing root README/planning changes and Java source/license notices. Disposable test worlds and local build/test operations are allowed.

Commit and push verified stages to the user's `origin` fork on `experimental/bedrock-26.40`. Never force-push, rewrite history, push to upstream, change existing player worlds or deploy to production without explicit approval. Only stage owned `bedrock/` changes.

Use web research, parallel subagents for independent substantive work, and inspect/verify their results before accepting them. A worker's successful return is not verification of its claims or artifacts.

## Stop conditions

Use the question box when a prerequisite is genuinely unavailable after checking reachable tools/context and alternatives, when manual device/server verification is needed, before necessary outside-folder changes or destructive operations, or for hard architectural ambiguity or proposed scope/compatibility reduction.

The cap is **15 failed fix-and-verification attempts per acceptance gate**. Failures remain cumulative; passing an intermediate run or renaming a gate does not reset the cap. Infrastructure discovery failures are recorded separately from attempted gameplay assertions. Do not award a gate merely because a server starts or a package parses.

Continue autonomously otherwise. Record current evidence and unresolved gates honestly; completion means the entire contract is satisfied, not an intermediate source-tooling or capability milestone.
