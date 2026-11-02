# Native inventory capability probe

Diagnostic implementation, not a production workstation. It compares two custom 27-slot actors with a vanilla chest-minecart control. It uses the actual native inventory, not a JSON inventory replacement or synthetic form.

The [runtime-tested diagnostic add-on](../../evidence/packs/e559c9430763e886eabb00fa19499da1eba59cb27c21685d6e099333cf867024.mcaddon) is pack version **0.1.2**, SHA-256 `e559c9430763e886eabb00fa19499da1eba59cb27c21685d6e099333cf867024`. It contains the BP/RP archives, not a server executable or a completed survival port.

## Implemented fixtures

All fixtures are in the outer End, around Z=4096.5 and Y=80. The recorded native positions are authoritative: the chest-cart runtime shifts its actor origin; no per-tick teleport conceals that behavior.

| Role | Identifier | X |
|---|---|---:|
| Chest-cart runtime candidate | `betterend_inventory_probe:carrier_runtime` | 4096.5 |
| Generic inventory candidate | `betterend_inventory_probe:carrier_generic` | 4100.5 |
| Vanilla control | `minecraft:chest_minecart` | 4104.5 |

Each actor holds a real diamond sword and ten iron ingots. The sword has damage 37, Unbreaking III, a name, lore, an unbreakable flag, keep-on-death, adventure block permissions, and string/boolean/number/vector dynamic properties. The two custom actors also hold a nondefault definition property, revision 42.

The world records actor IDs and expected observations. Those observations are comparison data, **never material for recreating inventory**. An absent actor after its chunk loads fails inspection. Setup refuses existing fixtures. Interrupted construction, transfer or hopper experiments retain an in-progress marker and are not automatically replayed. These fail-closed diagnostic rules are not the finished workstation recovery protocol.

## Real 26.40.8 observations

- Both custom actors and the vanilla control registered with native 27-slot inventories.
- Actor identity, revision and observed item metadata survived clean process restart.
- `Container.moveItem` moved the original sword between native containers and back; no replacement item was constructed.
- Full-fit, partial-fit and no-capacity `transferItem` cases preserved physical item counts.
- **In the partial/no-capacity cases, the returned remainder was also still in the source slot.** It was not inserted again. Production code must not treat every returned `ItemStack` as newly owned physical inventory.
- Native hoppers extracted the sword and all ten ingots from every actor. Upper hoppers also inserted the metadata-bearing sword into every actor. The same native items were restored, and a subsequent process restart passed inspection.
- The first setup receipt failed a validator that required namespace spelling in adventure permissions; the engine returned equivalent default-namespace IDs. The validator now compares canonical identifiers. That failed attempt remains counted, and setup was not rerun or reseeded to hide it.

These results prove only the exercised server-side behavior and observable metadata. They do not prove arbitrary opaque item data, native UI opening, client presentation, damage/piston behavior, abrupt-crash recovery, or multiplayer interaction.

The complete six-action sequence also passed independently on BDS **1.26.61.1**, including identical observed source-slot remainder ownership and successful hopper I/O for all three actors. Those forward-build receipts are separately labeled and do not replace the historical 26.40 baseline.

## Automated commands

Use an owned disposable server as described in [the engine probe instructions](../engine/README.md). Run setup only once in a fresh fixture world. Every invocation starts the real server and stops it cleanly after the result.

```text
npm --prefix bedrock run probe:bds -- --engine .work/engines/bds-1.26.40.8 --build 1.26.40.8 --request probes/inventory/scenarios/setup.json
npm --prefix bedrock run probe:bds -- --engine .work/engines/bds-1.26.40.8 --build 1.26.40.8 --request probes/inventory/scenarios/inspect.json
npm --prefix bedrock run probe:bds -- --engine .work/engines/bds-1.26.40.8 --build 1.26.40.8 --request probes/inventory/scenarios/roundtrip.json
npm --prefix bedrock run probe:bds -- --engine .work/engines/bds-1.26.40.8 --build 1.26.40.8 --request probes/inventory/scenarios/transfer.json
npm --prefix bedrock run probe:bds -- --engine .work/engines/bds-1.26.40.8 --build 1.26.40.8 --request probes/inventory/scenarios/hoppers.json
npm --prefix bedrock run probe:bds -- --engine .work/engines/bds-1.26.40.8 --build 1.26.40.8 --request probes/inventory/scenarios/inspect.json
```

`INV-001` is the cumulative server-side inventory acceptance gate; it does not replace the broader capability/client gates. Exact logs, structured observations and runtime-tested packs are retained under `evidence/engine/` and `evidence/packs/`. Forward builds must use their own owned world and exact build label; their results cannot certify 26.40.

## Required stock-client session

Use a **separate disposable server/world** with the same pack identity and version. The automatic runner deliberately empties its allowlist and stops after each result; it is not a client-session launcher.

1. Install both built pack folders and activate their header UUIDs/version in the new world's pack references. Require the server resource pack. Keep official BDS and unmodified, version-compatible clients.
2. After the `BETTEREND_PROBE` world-load message, while no clients are connected, send this command from the server console:

   ```text
   scriptevent betterend_probe:run {"requestId":"client-fixture-setup","action":"inventory-setup","probeId":"native-inventory-v1"}
   ```

   Require its matching successful structured result before continuing. Then create the material board and wait for its result too:

   ```text
   scriptevent betterend_probe:run {"requestId":"client-material-board","action":"board","dimension":"the_end","x":2080,"y":80,"z":2080}
   ```

   Send the commands separately, not as an overlapping batch. Neither command is accepted from a player-sourced script event.
3. Configure the intended allowlist and custom-server connection route. Join from a clean client resource cache. Console-local add-on import is unnecessary; this gate concerns server delivery.
4. Use creative mode and fly to the outer-End fixtures, or prepare a walking platform in this disposable world. A console teleport can use `execute in the_end run tp @a 4100 82 4094`. Do not run fixture-mutating commands in a player world.
5. Interact with the vanilla control first, then each custom candidate. Record ordinary use, sneaking use, empty hand and held-item use. A hit/interaction event alone is not UI evidence.
6. Record the actual native screen, its 27 carrier slots and player inventory, slot selection, quick move, drag/split, close/reopen and reconnect. Capture the returned sword's name, lore, enchantment and durability presentation. The observers emit `inventoryContainerOpened`/`inventoryContainerClosed` with actor/accessor IDs.
7. Use two clients concurrently. Record any stale stacks, duplication/loss, movement or unwanted cart/chest overlays. Keep a Classic/non-VV client and a VV client on the same compatible server where hardware permits.
   After the inventory session, inspect the rough/metal/emissive board at `(2080,80,2080)`, `(2082,80,2080)` and `(2084,80,2080)`. A console teleport can use `execute in the_end run tp @a 2082 82 2077`; remain in creative flight. Give the registered diagnostic item with `give @a betterend_probe:thallasium_ingot 1` and inspect its inventory/held/dropped/frame forms. These are material controls, not the complete forest/water or per-player atmosphere gate.
8. Repeat relevant controls on keyboard/mouse, touch and controller. Record exact device, OS, client/BDS build, pack SHA/version, graphics mode/settings, connection route, steps, screenshots/video, logs and observed failures. No platform is certified by another platform's result.

No stock Minecraft client was available in the coding environment for these observations. The workstation-carrier choice remains unapproved until this session demonstrates usable native UI and visuals; neither the runtime identifier nor `container_type` alone proves that result.

## API evidence

- [Pinned 26.40 entity documentation](https://github.com/Mojang/bedrock-samples/blob/7844835b6baad4c0010f46901a4accf87413a022/documentation/Entities.html): inventory, physics, persistence and runtime identifiers.
- [Exact stable server 2.9.0 declarations](https://unpkg.com/@minecraft/server@2.9.0/index.d.ts): native containers, item metadata, definition properties, ticking areas and container-open/close observers.
- [Official entity behavior introduction](https://learn.microsoft.com/en-us/minecraft/creator/documents/entitybehaviorintroduction?view=minecraft-bedrock-stable): runtime identifiers inherit native class behavior; they are not a blanket UI guarantee.

There is no invented `open_container` field or script inventory-opening method in this implementation.
