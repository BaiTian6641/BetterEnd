# Recipe hyperedge research — preserved handoff report

Read-only source research. No recipe compiler, station implementation or gameplay verification was produced by this investigation. Exact vanilla 26.3 consumer semantics remain explicitly unresolved where noted. The integration owner verified the catalogue serializer totals; the receiving agent must verify implementation-critical source/API details before coding.

# Recipe Hyperedge Research Handoff

## Summary

**Scope:** pinned BetterEnd source `5a25059ef4fd77409024a2919fb0a0098388104f`, the generated resource catalogue, schema-3 production export, and version-matching BCLib/WorldWeaver dependency source.

**No implementation, builds, tests, formatters, or gameplay checks were performed.**

Key findings:

1. **879 source recipes = 878 main-profile recipes + one optional recipe.** The reported **487 shaped recipes already include the optional guidebook recipe**: 486 main + 1 optional.
2. All **11 catalogue serializers** are mapped below. Their input consumption cannot be normalized solely from serializer names:
   - BCLib smithing is **anvil forging**, with a reusable, damaged hammer.
   - Infusion “catalysts” are **consumed**, occupy fixed compass positions, and require all eight physical peripheral pedestals.
   - End Stone Smelter blasting uses **different first-operation and subsequent-operation timing formulas**.
3. Raw resource JSON is **not a complete live recipe inventory**:
   - BCLib filters disabled recipes.
   - WorldWeaver injects runtime recipes and advancements.
   - BetterEnd contributes runtime brewing mixes.
   - Runtime contributions can replace datapack recipes with the same ID.
4. Preserve declared result components separately from effective assembled stack components and input-dependent inheritance.
5. **Resolved via local 26.3 bytecode disassembly (`javap -p -c` on `minecraft-merged-91c6283978-26.3.jar`):** exact Minecraft 26.3 vanilla consumer bodies for crafting/stonecutting (V1), smithing transform (V2), and furnace/campfire cooking (V3) have now been inspected directly from the compiled 26.3 JAR and are recorded in §7 below. Live runtime recipe-manager export and station execution remain separate implementation steps.

## Evidence boundaries

| Evidence | What it establishes | What it does not establish |
|---|---|---|
| `bedrock/catalogue/generated/resources.json` | Source recipe values, serializer totals, optional scopes, hashes and reconciliation metadata | Live activation, successful matching, assembly or station execution |
| Schema-3 runtime export | Recorded loaded-mod/pack profile, effective resource bytes, merged registry tags, item defaults | Complete live recipe-manager contents, runtime brewing expansion, assembled results or station side effects |
| Pinned BetterEnd Java source | Producer and custom-station algorithms | Exercised gameplay outcomes |
| Immutable dependency source declaring 26.301.2 | Matching-version dependency algorithms and APIs | Independently proven byte-for-byte correspondence to the recorded JARs |
| Existing test source | Available APIs and intended scenarios | A test result from this investigation |

The existing catalogue’s `recipeActivationCertified: false` is appropriate. Neither its effective-resource presence nor the runtime export’s `complete` marker closes recipe-execution or Bedrock client gates.

---

## Architecture

```text
BetterEnd datagen providers + item/block recipe traits
    ↓
source recipe JSON / advancement JSON
    ↓
Minecraft recipe-registry loading
    ↓
BCLib disabled-recipe filtering
    ↓
WorldWeaver runtime recipe and brewing contributions
    ↓
RecipeMap / live RecipeManager
    ↓
station matching / recipe selection
    ↓
assemble(real input)
    ↓
optional WorldWeaver item-stack setup
    ↓
station-specific consumption, fuel, damage, XP, remainders and awards
```

Important distinctions:

- Stations use the **live recipe manager**, not the resource catalogue.
- Runtime-contributed recipes need not exist in the frozen recipe registry or as resource files.
- `assemble` does not describe all input consumption or side effects.
- BCLib changes ordinary `getRecipeFor` selection precedence.
- Custom recipe output construction and vanilla smithing output construction must remain separate normalization cases.

---

## Report

### 1. Normalized hyperedge contract

Each normalized edge needs these independent fields:

| Dimension | Required content |
|---|---|
| Identity | Recipe ID, serializer ID, runtime implementation class |
| Provenance/profile | Source path/hash, effective resource provenance, mandatory/optional scope, loaded mods, selected packs |
| Activation | Source-present, resource-present and live-manager-present as separate observations |
| Ingredient predicate | Original item/tag/alternative representation; merged-registry resolution under the recorded profile |
| Input occurrences | Separate ports for repeated requirements; alternatives are not additional consumed ingredients |
| Placement | Grid cells and empties, unordered occurrences, interchangeable alloy slots, smithing roles, or fixed infusion compass slots |
| Quantity/effect | Required count and consumed/retained/damaged/replaced/required-empty effect |
| Result | Declared result, component patch, assembled effective components, inheritance policy or unresolved status |
| Station | Station type/class, tier, structure requirements and relevant state |
| Execution | Fuel acceptance, resolved burn duration, progress increment/threshold, interruption behavior, capacity constraints |
| Side effects | Remainders/byproducts, tool damage, station wear, XP, advancement and recipe awards |
| Unlock/conditions | Advancement criteria/requirements, integration activation, disabled configuration, runtime replacement and selection precedence |

#### Observed ingredient grammar

Across catalogue recipe input fields:

```text
I = "namespace:item"
  | "#namespace:item_tag"
  | ["namespace:item_a", "namespace:item_b", ...]
```

- No legacy `{ "item": ... }` or `{ "tag": ... }` ingredient objects occur in these recipe inputs.
- Eight ingredient positions use arrays, across six recipes.
- These ingredients contain no embedded quantity or component predicate.
- BCLib `allowedTools` is different: `"betterend:anvil_tool/diamond"` is a **TagKey without `#`**, not an item ID.

Examples:

- `cave_pumpkin_pie`: blossom berry **or** raw shadow berry.
- `sulphur_gunpowder`: coal **or** charcoal is one ingredient occurrence.
- `soul_speed_book`: east, south and west independently accept soul sand or soul soil.
- `terminite_anvil` / `thallasium_anvil`: block **or** tile alternatives.
- `missing_tile`: violecite, violecite brick or violecite tiles.

### 2. Complete serializer table

Notation:

- `Rcustom = {"item": ID, "count": N?}`; the inspected custom codecs default count to 1.
- `Rvanilla = {"id": ID, "count": N?}`; these are the actual catalogue forms.
- **V1–V3** refer to unresolved exact-version vanilla behavior in §7.

| Serializer | Source count | Actual JSON shape and representative form | Normalized execution |
|---|---:|---|---|
| `bclib:alloying` | 8 main | `ingredients:[I,I]`, `result:Rcustom`, `experience`, optional `smelttime`. `additional_iron`: two `#betterend:alloying_iron` → 3 iron ingots, XP 2.1. Codec also supports optional `group`. | Interchangeable slots; consume one item from each. Fresh output plus stack-setup hook. End Stone Smelter. Default time 350, default XP 0. |
| `bclib:smithing` | 26 main | `input:I`, optional `inputCount`, `allowedTools`, `anvilLevel`, `damage`, `result:Rcustom`. `terminite_axe_head`: 3 ingots, diamond tool tag, level 3, damage 3 → one head. | Anvil forging. Consume material count; retain/damage hammer; tier requirement; selectable results. No recipe fuel or timed process. Custom take path bypasses vanilla anvil XP charging. |
| `betterend:infusion` | 49 main | `input:I`, compass-keyed `catalysts`, `result:{"item":ID,"count":N?,"components":patch?}`, `time`, optional `group`. | Center plus eight ordered peripheral positions. Populated positions consumed; absent optional ingredients represent empty positions. All eight pedestal entities required. Fresh result plus patch/setup; no center-item inheritance. No fuel/XP. |
| `minecraft:crafting_shaped` | **486 main + 1 optional** | `pattern`, `key`, `result:Rvanilla`, optional `group`/`category`. `aeternium_block`: nine ingot cells → one block. | Preserve occupied cells and empties, not merely unique ingredients. WoVer post-assembly setup hook present. Exact vanilla matching/take/remainders: **V1**. |
| `minecraft:crafting_shapeless` | 126 main | `ingredients:[I,...]`, `result:Rvanilla`, optional `group`/`category`. `sulphur_gunpowder`: bone meal + sulphur + coal-or-charcoal. | Unordered ingredient occurrences. WoVer post-assembly setup hook present. Exact vanilla take/remainders: **V1**. |
| `minecraft:blasting` | 23 main | `ingredient:I`, `result:{"id":ID}`, `cookingtime:100`, optional `experience`. End-stone bricks → cracked end-stone bricks, XP 0.1. | Blast furnace: **V3**. Also End Stone Smelter when exactly one input slot is occupied; its inspected path consumes one item and uses custom timing/fuel formulas. |
| `minecraft:smelting` | 31 main | `ingredient:I`, `result:{"id":ID}`, `cookingtime:200`, optional `experience`/`category`. Bolux mushroom → cooked bolux mushroom. | Vanilla furnace and BetterEnd `BaseFurnaceBlockEntity(RecipeType.SMELTING)` variants. Exact vanilla execution: **V3**. End Stone Smelter does not query this type. |
| `minecraft:smoking` | 4 main | `ingredient:I`, `result:{"id":ID}`, `category:"food"`, `cookingtime:100`. | Smoker; producer passes XP 0. Exact contextual execution: **V3**. |
| `minecraft:campfire_cooking` | 4 main | `ingredient:I`, `result:{"id":ID}`, `category:"food"`, `cookingtime:600`. | Campfire; producer passes XP 0. Exact lit/unlit progress, consumption and ejection: **V3**. |
| `minecraft:smithing_transform` | 32 main | `template:I`, `base:I`, `addition:I`, `result:{"id":ID}`. Aeternium-upgrade template + elytra + aeternium ingot → armored elytra. | Three positional roles. WoVer setup runs after vanilla assembly. Exact component inheritance and template/base/addition consumption: **V2**. |
| `minecraft:stonecutting` | 89 main | `ingredient:I`, `result:Rvanilla`. Flavolite → 2 flavolite slabs. | Single ingredient and selected recipe. No recipe-declared time/fuel/XP. Exact menu consumption and materialization: **V1**. |

#### Actual result forms and values

| Family | Observed results |
|---|---|
| Alloying | Count 1 or 3; only `item`/`count` |
| BCL smithing | All count 1; only `item` |
| Infusion | All count 1; 40 enchanted-book results have `minecraft:stored_enchantments`; nine other results have only `item` |
| Shaped | Counts 1, 2, 3, 4, 6, 8, 16 |
| Shapeless | Counts 1, 2, 3, 4, 9 |
| Cooking / vanilla smithing | All count 1 |
| Stonecutting | Counts 1 or 2 |

No catalogue vanilla result has an explicit `components` field.

Infusion times are 75, 100, 150, 225, 250, 300, 375 and 500. Cooking values are as shown in the table. They are declared values, not automatically observed wall-clock durations.

Sources: [BCL alloy codec/consumer][b-alloy], [BCL anvil codec/consumer][b-anvil], [custom result codec][b-stack], [WorldWeaver vanilla-recipe builders][w-builders].

---

### 3. Custom station execution semantics

#### 3.1 Alloying and End Stone Smelter

**Matching:** `AlloyingRecipe.matches` tries both input permutations. Two ingredients referencing the same tag may be satisfied by different members of that tag.

| Recipe | Inputs | Output | Time | XP |
|---|---|---:|---:|---:|
| `additional_copper` | Two alloying-copper members | 3 copper ingots | 350 default | 3 |
| `additional_gold` | Two alloying-gold members | 3 gold ingots | 350 default | 3 |
| `additional_iron` | Two alloying-iron members | 3 iron ingots | 350 default | 2.1 |
| `additional_netherite` | Two ancient debris | 3 netherite scrap | 1000 | 6 |
| `aeternium_ingot` | Terminite + netherite ingot | 1 aeternium ingot | 850 | 4.5 |
| `terminite_ingot` | Iron ingot + ender dust | 1 terminite ingot | 450 | 2.5 |
| `terminite_ingot_thallasium` | Thallasium ingot + ender dust | 1 terminite ingot | 450 | 2.5 |
| `thallasium_ingot_alloy` | Two thallasium-alloying members | 3 thallasium ingots | 350 default | 2.1 |

**Mode and timing:**

- Two occupied ingredient slots select alloying only.
- Exactly one occupied ingredient slot selects blasting only.
- Alloying progress increment: 1.
- Blasting progress increment: 2.
- Blasting threshold on input-change setup:
  ```java
  (int) (recipe.cookingTime() / 1.5f)
  ```
- Blasting threshold after a completed operation:
  ```java
  recipe.cookingTime() / 3
  ```
- **[INFERENCE from inspected arithmetic]** For declared 100, thresholds are 66 and 33; with increment 2, that is 33 and 17 progressing ticks respectively. This was not exercised, and input changes can re-enter the first calculation.

**Consumption/output:**

- Alloying shrinks both inputs by one.
- Blasting shrinks the single input by one.
- There is no generic ingredient-remainder processing in these methods.
- The declared output count is applied once. The code explicitly warns against applying an additional same-input yield bonus.
- Existing output must have the same item **and components**.
- `canStore` uses strict `<` comparisons, not assumed `<=`; this is a real source behavior to retain in observation.
- The blasting branch has a specific vanilla wet-sponge + fuel-slot bucket → water-bucket case. It is not a general remainder rule and does not name BetterEnd menger sponge.

**Fuel:**

Acceptance is not a numeric “burns longer than 2000 ticks” check. It accepts:

1. An item registered in `AVAILABLE_FUELS`; or
2. A `CookingFuel.burnTime()` reference to one of:
   - blaze-rod cooking provider,
   - dried-kelp-block provider,
   - coal-block provider,
   - lava-bucket provider.

`smelterFuels()` combines eligible default-component items with explicit registrations. `availableFuels()` alone is incomplete.

Actual duration is resolved from the stack’s provider using `CONTAINER_PROCESS` context with:

- block state,
- block entity,
- block-center origin,
- container.

Alloying multiplies the resolved duration by 1; blasting by 2. The station’s own progress increment does not use `CookingFuel.speed_multiplier`.

Ignition consumes one fuel item. If its stack empties, `Item.getCraftingRemainder().create()` is installed in the fuel slot, or empty if the remainder is null.

**XP:**

- Recorded per completed operation, not per output item.
- Payout is floor of `operationCount × recipeXP`, plus a probabilistic fractional increment.
- Player output extraction awards recipes and triggers recipe-crafted events.
- This source observation does not assert every possible XP payout path was exercised.

**Anchors:**

- `EndStoneSmelterBlockEntity.java:70-156` — mode-dependent increments/multipliers.
- `:255-314` — the two timing calculations.
- `:317-363` — XP and awards.
- `:415-552` — ticking, fuel consumption and input consumption.
- `:563-634` — result merging and capacity.
- `:718-826` — accepted fuel providers, actual duration and context.

#### 3.2 BCLib smithing is anvil forging

Read [AnvilRecipe][b-anvil] together with [AnvilMenuMixin][b-menu].

`AnvilRecipe.craft` alone is not a result-production API: in survival it damages the hammer and returns `EMPTY`. The menu has already populated the result using `assemble`.

Actual menu sequence:

1. Classify one of the two inputs as a hammer using merged `wover:tools/hammers`.
2. Find all matching BCLib recipes.
3. Filter by `stationLevel >= recipe.anvilLevel`.
4. Provide result selection/cycling.
5. Require:
   ```java
   hammer.getDamageValue() + recipeDamage < hammer.getMaxDamage()
   ```
6. On pickup, shrink material by `inputCount`, invoke hammer damage and cancel vanilla `onTake`.

Consequences:

- Hammer is reusable and damaged, not consumed.
- Damage is applied with:
  ```java
  hammer.hurtAndBreak(damage, player, EquipmentSlot.OFFHAND)
  ```
  Do not replace that with an unconditional damage-value increment; the actual engine damage operation may incorporate enchantment behavior.
- Creative bypasses hammer durability checks/damage, but material shrinking still occurs in the menu mixin.
- Renaming is disabled while a BCL recipe is active.
- Vanilla anvil XP charging is bypassed.
- Noncreative custom forging has a **10%** station-wear chance on a tagged `LeveledAnvilBlock`.
- A separate **12%** hook concerns the ordinary vanilla-anvil path; do not attach it to the custom forging edge.

Station levels:

| Station | Crafting level |
|---|---:|
| Vanilla anvil/chipped/damaged anvil | 1 |
| Thallasium anvil | 2 |
| Terminite anvil | 3 |
| Aeternium anvil | **5** |

Aeternium recipes require level **4**. Do not equate the recipe threshold with the block’s level.

Normal leveled anvils have max durability counter 5; aeternium has 12. Destruction advances when the counter is exhausted.

Recipe families:

- Thallasium axe/pickaxe/hammer heads: 3 ingots; sword/spear: 2; hoe/shovel: 1; damage 2.
- Terminite equivalents: same quantities; damage 3.
- All eight aeternium parts consume **one ingot**, damage 6.
- Forged plates consume one ingot.
- Pearl → dust: damage 5.
- Shard → dust: damage 3.
- Aeternium sword blade/spear tip accept diamond-tool-tag hammers; the other six parts require the netherite-tool tag.

#### 3.3 Infusion

Representative result:

```json
{
  "item": "minecraft:enchanted_book",
  "components": {
    "minecraft:stored_enchantments": {
      "minecraft:aqua_affinity": 1
    }
  }
}
```

Do not replace `stored_enchantments` with ordinary `enchantments`.

Exact peripheral offsets, relative to center in `(dx,dy,dz)`:

| Port/index | Offset |
|---|---|
| north / 0 | `(0,0,-3)` |
| north_east / 1 | `(2,0,-2)` |
| east / 2 | `(3,0,0)` |
| south_east / 3 | `(2,0,2)` |
| south / 4 | `(0,0,3)` |
| south_west / 5 | `(-2,0,2)` |
| west / 6 | `(-3,0,0)` |
| north_west / 7 | `(-2,0,-2)` |

This is an absolute compass arrangement, not a rotatable or shapeless ring.

Execution facts:

- Pedestals store one item using `stack.split(1)`.
- Matching tests the center and all eight optional catalyst positions.
- All eight peripheral pedestal entities must exist even for recipes with three or four catalysts.
- Completion clears center and every peripheral pedestal, then installs the assembled output at center.
- Catalyst shields, helmets and other equipment are consumed—not retained or damaged as tools.
- No ingredient crafting remainders are produced by this path.
- Result assembly creates a fresh item stack, applies the explicit output patch, then invokes stack setup.
- Crystalite armor/elytra infusion therefore does not copy the center input’s damage, name or enchantments.
- Completion triggers `BECriteria.INFUSION_FINISHED` for server players at distance `<16` from the center’s integer-coordinate position.
- No fuel or XP.
- Valid recipes increment progress by one per ticker call.

State-dependent limitations visible in the code:

- While active, `checkRecipe` refreshes the cached holder only if it is null or the new match has a different duration. A different same-duration match does not refresh it in that branch.
- Saved state stores recipe-present/progress/time, not the active recipe ID. Reconstructing the holder can reset the timer.
- These are source observations requiring explicit treatment; no physical scenario was run.

---

### 4. Merged tags, unlocks and conditional integration

#### 4.1 Merged tags are authoritative

Use:

```text
runtime.registryTags["minecraft:item"]
```

or the catalogue’s reconciled `runtimeTag`.

Do not use the highest-priority raw tag resource as the final membership set. The catalogue explicitly distinguishes these.

Observed profile examples:

| Tag | Merged members relevant to recipes |
|---|---|
| `betterend:alloying_iron` | Iron ore, deepslate iron ore, raw iron |
| `betterend:alloying_copper` | Copper ore, deepslate copper ore, raw copper |
| `betterend:alloying_gold` | Gold ore, deepslate gold ore, raw gold |
| `betterend:thallasium_alloying` | Thallasium ore, raw thallasium |
| `wover:water_bottles` | **Only `minecraft:water_bucket`** |
| `wover:vegetation/vines` | Twisting vines, vine, weeping vines |
| `betterend:anvil_tool/diamond` | Aeternium, diamond, netherite, terminite hammers |
| `betterend:anvil_tool/netherite` | Aeternium, netherite hammers |
| `betterend:anvil_tool/iron` | All seven BetterEnd hammers, including golden |

Additional important expansions:

- `c:chests` includes BetterEnd chests and vanilla normal/trapped/ender/copper-family chests.
- `wover:furnaces` includes vanilla furnace and eight BetterEnd furnace variants.
- The catalogue uses **21 distinct ingredient tags**, excluding the three separate `allowedTools` tags.

Jelly recipes:

- `*_jelly` uses `#wover:water_bottles`, resolving here to water bucket.
- `*_jelly_potion` uses plain `minecraft:potion`, produced through `Ingredient.of(Items.POTION)`.
- There is no producer-side water-potion component predicate. Do not invent one.
- Exact vanilla bucket/bottle remainders remain V1.

#### 4.2 Unlocks must be extracted separately

There are 879 source recipe-unlock advancements.

- **83** have only `has_the_recipe`: precisely the 8 alloying, 26 BCL smithing and 49 infusion recipes.
- The inspected BCL base builder does not transfer its inherited accumulated unlock map into the advancement.
- Consequently, a producer call named `setPrimaryInputAndUnlock` does not prove that an inventory criterion was emitted.
- The other 796 advancements have inventory-change and recipe-unlocked triggers.
- Preserve the actual `requirements` arrays rather than assuming conjunction of all criteria.
- `sulphur_gunpowder` has an OR ingredient for coal/charcoal, but its `has_coal_charcoal` inventory criterion contains both predicates. Recipe matching and unlock logic are distinct.
- Infusion and BCL anvil matching do not check player recipe unlock state.

#### 4.3 Optional guidebook boundary

```json
{
  "type": "minecraft:crafting_shaped",
  "pattern": ["D", "B", "C"],
  "key": {
    "D": "betterend:ender_dust",
    "B": "minecraft:book",
    "C": "betterend:crystal_shards"
  },
  "result": {"id": "betterend:guidebook"}
}
```

- Recipe ID: `betterend:guide_book`.
- Scope: `optional/patchouli_extensions`.
- The recorded production profile has no Patchouli and does not select this pack.
- WoVer registers dependency integration packs as `DEFAULT_ENABLED` when the dependency is loaded and `NORMAL` otherwise. Dependency absence is not an unconditional hard exclusion of the pack.
- Preserve both loaded-mod and selected-pack conditions.
- `Integrations.init` registers the End-gateway guidebook award only when Patchouli is loaded and the configuration permits it.
- `GuideBookItem.use` currently returns `CONSUME`; the Patchouli GUI-opening call is commented out. Recipe presence does not establish working guidebook UI.

---

### 5. Dynamic mechanisms absent from raw recipe JSON

| Mechanism | Source behavior | Required observation |
|---|---|---|
| Disabled recipes | BCLib reads **all stacked** `bclib:config/recipes.json` resources and unions disabled IDs. | Live-manager inventory and stacked config provenance |
| Runtime recipes | WoVer contributes before `RecipeMap.create`; same-key contributions replace datapack recipes. | Manager enumeration, not just resource/registry enumeration |
| Runtime brewing | BetterEnd potion bootstrap contributes mixes; WoVer expands them through vanilla brewing generation and injects the delta from baseline vanilla keys. | Live brewing IDs, inputs, potion predicates, containers, results and duration |
| Runtime advancements | WoVer transfers contributions to the corresponding advancement manager. | Live advancements, not only JSON files |
| Selection precedence | BCLib ordinary `getRecipeFor`: non-vanilla namespace first, then namespace/path lexical order. | Both matches and selected holder; actual cached/menu path where applicable |
| Stack setup | Custom recipes and WoVer crafting/smithing hooks can invoke `ItemWithCustomStack.setupItemStack`. | Assembled stack and full effective components |
| Contextual fuel | Component providers resolve against station context; smelter explicit registrations are extra state. | Accepted stacks, resolved duration, speed, remainders and context |
| Station side effects | Consumption, damage, wear, XP and pedestal clearing live outside serializers. | Before/after station and inventory snapshots |

#### Runtime brewing contributions

`EndPotions.java:21-40` registers:

1. Awkward potion + ender dust → End Veil.
2. End Veil + redstone → long End Veil.
3. Awkward potion + murkweed → night vision.

[WoVer’s brewing implementation][w-potions] expands mixes across registered containers and performs container transformations. Do not normalize these as exactly three complete live recipe edges. Schema 3 does not contain the resulting manager inventory.

---

### 6. Exact APIs for production observation

The existing exporter is attached to `SERVER_STARTED`. It exports defaults, merged tags and effective resources, but **not live recipes or assembled results**.

The following calls are evidenced by pinned source or matching dependency source:

```java
// Post-filter, post-runtime-contribution recipes:
level.recipeAccess().getRecipes();

level.recipeAccess().byKey(
    ResourceKey.create(
        Registries.RECIPE,
        Identifier.parse(recipeId)
    )
);

// On the server, these access the full RecipeMap:
SyncedRecipes.allOfType(level, AlloyingRecipe.TYPE);
SyncedRecipes.allOfType(level, AnvilRecipe.TYPE);
SyncedRecipes.allOfType(level, InfusionRecipe.TYPE);
SyncedRecipes.allOfType(level, RecipeType.BREWING);

// Ingredients and merged tags:
ingredient.items();  // Stream<Holder<Item>>
ingredient.test(stack);
Ingredient.CODEC.encodeStart(ops, ingredient);
registries.lookupOrThrow(Registries.ITEM).listTags();

// Matching and actual assembly:
recipe.matches(realInput, level);
recipe.assemble(realInput);

// Preserve serialized stack, effective components and patch separately:
ItemStack.OPTIONAL_CODEC.encodeStart(ops, result);
DataComponentMap.CODEC.encodeStart(ops, result.getComponents());
DataComponentPatch.CODEC.encodeStart(ops, result.getComponentsPatch());

// Item-level remainder:
item.getCraftingRemainder();  // nullable ItemStackTemplate
// When non-null:
item.getCraftingRemainder().create();
```

Serializer-specific extraction:

| Type | APIs/input construction |
|---|---|
| Shaped | `getWidth()`, `getHeight()`, positional `getIngredients()`; `CraftingInput.of(width,height,stacks)` |
| Shapeless | `placementInfo().ingredients()`; real `CraftingInput` retaining occurrences |
| Alloying | `getIngredients()`, `getSmeltTime()`, `experience()`; `new AlloyingRecipeInput(a,b)` |
| BCL anvil | `getMainIngredient()`, `getInputCount()`, `getAllowedTools()`, `getAnvilLevel()`, `getDamage()`; `new AnvilRecipeInput(first,second,CommonItemTags.HAMMERS)` |
| Infusion | `getInput()`, positional `getCatalysts()` retaining nulls, `getInfusionTime()`; real ritual-bound `InfusionInput` |
| Cooking | `cookingTime()`, `experience()`; `new SingleRecipeInput(stack)` |
| Vanilla smithing | `new SmithingRecipeInput(template,base,addition)` with populated inputs |
| Brewing | `new BrewingInput(potionStack,reagent)`; potion stack uses `DataComponents.POTION_CONTENTS` and `new PotionContents(potionHolder)` |

Do not copy a catch-and-skip `assemble(null)` coverage pattern into a completeness exporter. Smithing reads its input; failures must remain explicit rather than silently dropping mandatory recipes.

For side effects, observe the production consumer rather than `assemble` alone:

- **Anvil:** `AnvilMenu.createResult`, `mayPickup`, actual output pickup with BCL mixin active. Existing test source demonstrates:
  ```java
  menu.clicked(2, 0, ContainerInput.PICKUP, player);
  ```
  followed by output/material/hammer snapshots.
- **Smelter:** `EndStoneSmelterBlockEntity.serverTick`; capture four slots and timing state, distinguishing first and subsequent operations.
- **Infusion:** actual pedestal insertion and `InfusionPedestalEntity.tickEntity` → `InfusionRitual.tick`; capture all nine contents and awards.
- **Component inheritance:** use real smithing bases containing representative damage/name/enchantment/component patches. A pristine base or empty-input preview cannot establish inheritance semantics.

These are observation implementation targets, not executed results.

---

### 7. Verified 26.3 vanilla consumer semantics (`javap -p -c` on `minecraft-merged-91c6283978-26.3.jar`)

Executed using `bedrock/.work/java-reference/jdk/jdk-25.0.5+8/bin/javap.exe -p -c` against `bedrock/.work/java-reference/project-cache/loom-cache/minecraftMaven/net/minecraft/minecraft-merged-91c6283978/26.3/minecraft-merged-91c6283978-26.3.jar`.

#### V1 — Vanilla crafting and stonecutting (verified from `ResultSlot`, `CraftingRecipe`, `StonecutterMenu`, `StonecutterMenu$2`)

- **Crafting remainders (`CraftingRecipe.defaultCraftingReminder(CraftingInput)`):**
  - Iterates `0 .. input.size() - 1`; for each slot item, checks `Item.getCraftingRemainder()` (returns nullable `ItemStackTemplate`).
  - If non-null, populates that slot of the returned `NonNullList<ItemStack>` with `remainderTemplate.create()`.
- **Crafting result take (`ResultSlot.onTake(Player, ItemStack)`):**
  - Calls `stack.onCraftedBy(player, stack.getCount())` and `checkTakeAchievements(stack)`.
  - Positions input via `craftSlots.asPositionedCraftInput()` and queries `getRemainingItems(positionedInput, player.level())` (which calls `RecipeManager.getRecipeFor(RecipeType.CRAFTING, input, level)` and invokes `recipe.getRemainingItems(input)`, falling back to `craftSlots.filloon/default`).
  - For each `(y, x)` in the positioned input grid:
    - Removes 1 item from `craftSlots` at `slotIndex = x + left + (y + top) * craftSlots.getWidth()`.
    - If the remainder `ItemStack` at `x + y * positionedInput.width()` is non-empty:
      - If the crafting slot is now empty, sets the remainder into that crafting slot;
      - Else if `ItemStack.isSameItemSameComponents(slotItem, remainder)`, grows `remainder` by `slotItem.getCount()` and sets it into the crafting slot;
      - Else attempts `player.getInventory().add(remainder)`, or drops it via `player.drop(remainder, false, Prediction.PREDICTED)`.
- **Stonecutting (`StonecutterMenu` and `StonecutterMenu$2.onTake`):**
  - `setupResultSlot(int)` calls `StonecutterRecipe.assemble(new SingleRecipeInput(container.getItem(0)))` (which delegates to `SingleItemRecipe.assemble` -> `this.result.create()`, creating a fresh `ItemStack` with no input component inheritance).
  - `StonecutterMenu$2.onTake` calls `inputSlot.remove(1)` directly without consulting `Item.getCraftingRemainder()`, re-runs `setupResultSlot` if input remains non-empty, and plays `SoundEvents.UI_STONECUTTER_TAKE_RESULT`.

#### V2 — Vanilla smithing transform (verified from `SmithingTransformRecipe`, `TransmuteRecipe`, `ItemStackTemplate`, `SmithingMenu`)

- **Result assembly and component inheritance (`SmithingTransformRecipe.assemble(SmithingRecipeInput)`):**
  - Calls `TransmuteRecipe.createWithOriginalComponents(this.result, input.base())`.
  - `TransmuteRecipe.createWithOriginalComponents(ItemStackTemplate result, ItemStack base, int extraCount)` calls `result.apply(result.count() + extraCount, base.getComponentsPatch())`.
  - `ItemStackTemplate.apply(int count, DataComponentPatch basePatch)` constructs `new ItemStack(this.item, count, basePatch)` (inheriting the base item's entire `DataComponentPatch`, including damage, custom name, enchantments, anvil repair cost, and custom components), then calls `stack.applyComponents(this.components)` (applying the recipe result template's own component patch on top), and validates via `ItemStack.validateStrict(stack)`.
  - WorldWeaver's `SmithingTransformRecipeMixin` runs `ItemStackHelper.setupItemStack` on the assembled result afterward.
- **Consumption (`SmithingMenu.onTake(Player, ItemStack)`):**
  - Shrinks slot 0 (`template`), slot 1 (`base`), and slot 2 (`addition`) by 1 each via `shrinkStackInSlot(0..2)` (`slot.remove(1)`). Does not consult `Item.getCraftingRemainder()`.

#### V3 — Vanilla cooking (verified from `AbstractFurnaceBlockEntity` and `CampfireBlockEntity`)

- **Fuel duration and speed multiplier (`AbstractFurnaceBlockEntity`):**
  - `getBurnDuration(ServerLevel, ItemStack)` resolves `DataComponents.COOKING_FUEL` via `ResolvableInt.getFromItem(stack, DataComponents.COOKING_FUEL, CookingFuel::burnDuration, getLootContext(serverLevel), 0)`.
  - `getSpeedMultiplier(ServerLevel, ItemStack)` resolves `DataComponents.COOKING_FUEL` via `ResolvableFloat.getFromItem(stack, DataComponents.COOKING_FUEL, CookingFuel::speedMultiplier, getLootContext(serverLevel), 1.0f)`.
  - `getTotalCookTime(RecipeHolder, AbstractFurnaceBlockEntity)` computes `int cookTime = recipe.cookingTime(); return speedMultiplier > 0.0f ? (int) Math.ceil(cookTime / speedMultiplier) : cookTime;`.
  - When a new fuel item is consumed while `cookingTimer > 0 && cookingTimer < cookingTotalTime`, `serverTick` rescales `cookingTimer = (int) Math.ceil((cookingTimer / (float) cookingTotalTime) * newCookingTotalTime)` so progress fraction is preserved across fuel speed changes.
- **Fuel consumption and remainder (`AbstractFurnaceBlockEntity.consumeFuel`):**
  - Reads `ItemStackTemplate remainder = fuelStack.getItem().getCraftingRemainder()`, then calls `fuelStack.shrink(1)`.
  - If `remainder != null`: if `fuelStack.isEmpty()`, replaces slot 1 (`SLOT_FUEL`) with `remainder.create()`; otherwise drops `remainder.create()` in world at the furnace `BlockPos` via `Containers.dropItemStack` and keeps the remaining `fuelStack` in slot 1.
- **Input smelting and wet-sponge special case (`AbstractFurnaceBlockEntity.burn`):**
  - Places/grows `assembledResult` in slot 2 (`SLOT_RESULT`).
  - If `input.is(Items.WET_SPONGE)` and slot 1 (`SLOT_FUEL`) is non-empty and `is(Items.BUCKET)`, replaces slot 1 with `new ItemStack(Items.WATER_BUCKET)`.
  - Calls `input.shrink(1)` with no `getCraftingRemainder()` check on the smelted input.
  - When unlit with `cookingTimer > 0`, `cookingTimer` decays by 2 per tick (`Mth.clamp(cookingTimer - 2, 0, cookingTotalTime)`).
- **Campfire (`CampfireBlockEntity.placeFood`, `cookTick`, `cooldownTick`):**
  - `placeFood` checks `RecipeType.CAMPFIRE_COOKING`, sets `cookingTime[slot] = recipe.cookingTime()`, `cookingProgress[slot] = 0`, and consumes 1 item via `stack.consumeAndReturn(1, entity)`.
  - `cookTick` (when lit) increments `cookingProgress[slot]` by 1 per tick; when `cookingProgress[slot] >= cookingTime[slot]`, assembles result via `recipe.assemble(new SingleRecipeInput(slotStack))`, drops it at the campfire `BlockPos` via `Containers.dropItemStack`, and sets the slot to `ItemStack.EMPTY` (no `getCraftingRemainder()` check).
  - `cooldownTick` (when unlit) decays `cookingProgress[slot]` by 2 per tick (`Mth.clamp(cookingProgress[slot] - 2, 0, cookingTime[slot])`).

#### Remaining runtime/gameplay evidence steps

- Live activation and extraction of the 878 effective main recipe resources and runtime-injected recipes/brewing mixes via `ReferenceExporter`.
- Artifact/source correspondence and production station/client lane verification.

---

## Files and Source Anchors

For compact local anchors:

```text
J = bedrock/.work/java-reference/source/src/main/java
T = bedrock/.work/java-reference/source/src/testmod/java
```

### Local source/data

| Path | Content |
|---|---|
| `bedrock/catalogue/generated/resources.json` | Complete source recipe inventory, JSON forms, optional scope and reconciled metadata |
| `bedrock/.work/java-reference/exports/runtime-2026-11-02T05-13-25.746Z-0d8cb2ba.json` | Recorded profile, merged tags, effective resources, item components and fuel providers |
| `bedrock/reports/source-summary.json` | Serializer totals, including optional shaped recipe |
| `J/org/betterx/betterend/recipe/builders/InfusionRecipe.java:121-168` | Book patches, matching and fresh-result assembly |
| Same file `:253-298,303-417` | Builder semantics, compass enum and JSON codec |
| `J/org/betterx/betterend/rituals/InfusionRitual.java:46-202` | Exact layout, matching, timing, consumption and awards |
| Same file `:269-292` | Persistence and world-coordinate conversion |
| `J/org/betterx/betterend/blocks/entities/PedestalBlockEntity.java:37-76` | One-item storage, removal and clearing |
| `J/org/betterx/betterend/blocks/entities/InfusionPedestalEntity.java:25-88` | Ritual linking and ticker |
| `J/org/betterx/betterend/blocks/entities/EndStoneSmelterBlockEntity.java:70-156` | Mode-dependent increments and multipliers |
| Same file `:255-363` | Timing formulas, XP and recipe awards |
| Same file `:415-634` | Tick execution, fuel/input consumption and result capacity |
| Same file `:718-826` | Fuel acceptance, viewer list and contextual resolution |
| `J/org/betterx/betterend/client/gui/slot/SmelterOutputSlot.java:33-48` | Player extraction awards |
| `J/org/betterx/datagen/betterend/recipes/AlloyingRecipesProvider.java:26-65` | Seven explicit alloy recipes |
| `J/org/betterx/betterend/complexmaterials/MetalMaterial.java:269-283` | Eighth alloy recipe, thallasium |
| `J/org/betterx/datagen/betterend/recipes/AnvilRecipesProvider.java:24-108` | Dust/plate and aeternium forging producers |
| `J/org/betterx/betterend/item/material/ToolsWithHeadsSet.java:95-190,203-315` | Smithing assembly, recycling and derived anvil input counts |
| `J/org/betterx/datagen/betterend/recipes/SmithingRecipesProvider.java:27-113` | Smithing upgrades and template-copy recipes |
| `J/org/betterx/datagen/betterend/recipes/InfusionRecipesProvider.java:34-260` | Representative block/equipment/book producers |
| `J/org/betterx/datagen/betterend/recipes/EndFurnaceRecipeProvider.java:27-62` | Cooking producers |
| `J/org/betterx/datagen/betterend/recipes/EndCraftingRecipesProvider.java:46-139,299-365` | Station/material recipes, jelly and coal alternatives |
| `J/org/betterx/betterend/blocks/AeterniumAnvil.java:8-18` | Actual station level 5 and durability counter 12 |
| `J/org/betterx/betterend/complexmaterials/types/Anvil.java:23-67` | Other anvil construction and crafting traits |
| `J/org/betterx/betterend/complexmaterials/types/Furnace.java:30-61` | BetterEnd furnace construction and tags |
| `J/org/betterx/betterend/effects/EndPotions.java:21-40` | Runtime brewing contributions |
| `J/org/betterx/betterend/integration/Integrations.java:16-27` | Conditional guidebook award |
| `J/org/betterx/datagen/betterend/recipes/PatchouliBookProvider.java:20-26` | Optional guidebook recipe |
| `J/org/betterx/betterend/item/GuideBookItem.java:20-45` | Registration and inactive GUI-opening implementation |
| `bedrock/java-exporter/src/main/java/dev/baitian/betterend/reference/ReferenceExporter.java:59-98` | Export lifecycle and current scope |
| Same file `:220-275,310-377` | Item-default, merged-tag and effective-resource export |
| `T/org/betterx/betterend/testmod/gametest/AnvilRecipeGameTest.java:139-170` | Existing real-menu pickup/snapshot API example; not run |
| `T/org/betterx/betterend/testmod/gametest/EndVeilGameTest.java:180-215` | Real brewing-input/assembly API example; not run |

### Immutable dependency sources

- **BCLib:** `fd50807b03d34e6886d8a288c600877277725121`; [metadata declares 26.301.2][b-version].
- **WorldWeaver:** `36ee9d8b697a777fbd9f51e7a18259c12598fe14`; [metadata declares 26.301.2][w-version].

Key dependency files/classes:

- [BCLib `AlloyingRecipe`][b-alloy] — matching, assembly, time/XP defaults and codec.
- [BCLib `AnvilRecipe`][b-anvil] — material/tool predicates, durability gate and codec.
- [BCLib `AnvilRecipeInput`][b-input] — slot classification.
- [BCLib `AnvilMenuMixin`][b-menu] — actual forging take/selection/wear behavior.
- [BCLib `LeveledAnvilBlock`][b-level] — tier and durability behavior.
- [BCLib `ItemStackCodec`][b-stack] — custom `item`/`count` result codec.
- [BCLib `BCLBaseRecipeBuilder`][b-builder] — custom unlock-advancement production.
- [BCLib `BCLRecipeManager`][b-manager] — disabled-recipe filtering and sync registration.
- [BCLib `RecipeManagerMixin`][b-selection] — filtering order and selection precedence.
- [WoVer recipe builders][w-builders] — shaped/shapeless/cooking/smithing/stonecutting producers.
- [WoVer `RecipeRuntimeProviderImpl`][w-runtime] — runtime contributions and advancement handoff.
- [WoVer `RecipeLookups`][w-lookups] — replacement/filter semantics.
- [WoVer `PotionManagerImpl`][w-potions] — runtime brewing expansion.
- [WoVer `ItemStackHelper`][w-stack] — item-specific stack setup.
- [WoVer crafting assembly hook][w-crafting-hook].
- [WoVer smithing assembly hook][w-smithing-hook].
- [WoVer `DatapackConfigs`][w-config] — stacked config resources.
- [WoVer `ModCore`][w-core] — conditional integration-pack activation.

[b-version]: https://github.com/quiqueck/BCLib/blob/fd50807b03d34e6886d8a288c600877277725121/gradle.properties
[w-version]: https://github.com/quiqueck/WorldWeaver/blob/36ee9d8b697a777fbd9f51e7a18259c12598fe14/gradle.properties
[b-alloy]: https://github.com/quiqueck/BCLib/blob/fd50807b03d34e6886d8a288c600877277725121/src/main/java/org/betterx/bclib/recipes/AlloyingRecipe.java
[b-anvil]: https://github.com/quiqueck/BCLib/blob/fd50807b03d34e6886d8a288c600877277725121/src/main/java/org/betterx/bclib/recipes/AnvilRecipe.java
[b-input]: https://github.com/quiqueck/BCLib/blob/fd50807b03d34e6886d8a288c600877277725121/src/main/java/org/betterx/bclib/recipes/AnvilRecipeInput.java
[b-stack]: https://github.com/quiqueck/BCLib/blob/fd50807b03d34e6886d8a288c600877277725121/src/main/java/org/betterx/bclib/util/ItemStackCodec.java
[b-menu]: https://github.com/quiqueck/BCLib/blob/fd50807b03d34e6886d8a288c600877277725121/src/main/java/org/betterx/bclib/mixin/common/AnvilMenuMixin.java
[b-level]: https://github.com/quiqueck/BCLib/blob/fd50807b03d34e6886d8a288c600877277725121/src/main/java/org/betterx/bclib/blocks/LeveledAnvilBlock.java
[b-manager]: https://github.com/quiqueck/BCLib/blob/fd50807b03d34e6886d8a288c600877277725121/src/main/java/org/betterx/bclib/recipes/BCLRecipeManager.java
[b-selection]: https://github.com/quiqueck/BCLib/blob/fd50807b03d34e6886d8a288c600877277725121/src/main/java/org/betterx/bclib/mixin/common/RecipeManagerMixin.java
[b-builder]: https://github.com/quiqueck/BCLib/blob/fd50807b03d34e6886d8a288c600877277725121/src/main/java/org/betterx/bclib/recipes/BCLBaseRecipeBuilder.java
[w-builders]: https://github.com/quiqueck/WorldWeaver/tree/36ee9d8b697a777fbd9f51e7a18259c12598fe14/wover-recipe-api/src/main/java/de/ambertation/wover/recipe/impl
[w-runtime]: https://github.com/quiqueck/WorldWeaver/blob/36ee9d8b697a777fbd9f51e7a18259c12598fe14/wover-recipe-api/src/main/java/de/ambertation/wover/recipe/impl/RecipeRuntimeProviderImpl.java
[w-lookups]: https://github.com/quiqueck/WorldWeaver/blob/36ee9d8b697a777fbd9f51e7a18259c12598fe14/wover-recipe-api/src/main/java/de/ambertation/wover/recipe/impl/RecipeLookups.java
[w-potions]: https://github.com/quiqueck/WorldWeaver/blob/36ee9d8b697a777fbd9f51e7a18259c12598fe14/wover-recipe-api/src/main/java/de/ambertation/wover/potions/impl/PotionManagerImpl.java
[w-stack]: https://github.com/quiqueck/WorldWeaver/blob/36ee9d8b697a777fbd9f51e7a18259c12598fe14/wover-item-api/src/main/java/de/ambertation/wover/item/api/ItemStackHelper.java
[w-crafting-hook]: https://github.com/quiqueck/WorldWeaver/blob/36ee9d8b697a777fbd9f51e7a18259c12598fe14/wover-item-api/src/main/java/de/ambertation/wover/item/mixin/item_stack_setup/CraftingRecipeMixin.java
[w-smithing-hook]: https://github.com/quiqueck/WorldWeaver/blob/36ee9d8b697a777fbd9f51e7a18259c12598fe14/wover-item-api/src/main/java/de/ambertation/wover/item/mixin/item_stack_setup/SmithingTransformRecipeMixin.java
[w-config]: https://github.com/quiqueck/WorldWeaver/blob/36ee9d8b697a777fbd9f51e7a18259c12598fe14/wover-core-api/src/main/java/de/ambertation/wover/config/api/DatapackConfigs.java
[w-core]: https://github.com/quiqueck/WorldWeaver/blob/36ee9d8b697a777fbd9f51e7a18259c12598fe14/wover-core-api/src/main/java/de/ambertation/wover/core/api/ModCore.java
