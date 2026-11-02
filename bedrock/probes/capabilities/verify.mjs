import assert from 'node:assert/strict';

export const capabilityActions = [
  'cap-003-regions',
  'cap-004-biomes',
  'cap-005-world-import',
  'cap-007-infusion',
  'cap-008-elytra',
  'cap-011-fog-audio',
  'cap-012-functional-blocks',
  'cap-013-portals-obelisk',
  'cap-014-concurrent-prep',
];

export function assertCapabilityObservation(request, result) {
  assert.ok(capabilityActions.includes(request.action), `Unsupported capability action: ${request.action}`);
  assert.equal(result.action, request.action, 'Capability probe response action mismatch');
  assert.equal(result.dimension, 'minecraft:the_end', 'Capability probe must execute in minecraft:the_end');
  assert.equal(result.players, 0, 'Automated capability probe requires an empty disposable server');
  assert.equal(result.item?.typeId, 'betterend_probe:thallasium_ingot');
  assert.equal(result.item?.amount, 1);
  assert.ok(result.observation && typeof result.observation === 'object', 'Missing capability probe observation payload');

  const obs = result.observation;

  switch (request.action) {
    case 'cap-003-regions': {
      assert.equal(obs.vectorCount, 500, 'CAP-003 must verify 500 coordinate vectors');
      assert.equal(obs.disagreements, 0, 'CAP-003 forward and reverse region lookups must have 0 disagreements');
      assert.equal(obs.determinismPassed, true, 'CAP-003 deterministic checkpoint verification failed');
      assert.equal(obs.negativeCheckPassed, true, 'CAP-003 negative coordinate symmetry check failed');
      assert.equal(obs.centralEndProtected, true, 'CAP-003 central End exclusion failed');
      assert.ok(obs.distinctRegions >= 8, `CAP-003 expected >= 8 distinct regions across 500 vectors, observed ${obs.distinctRegions}`);
      assert.ok(obs.outerScan?.flavoliteCount > 0, 'CAP-003 outer End scan must observe native betterend_probe:flavolite feature placement');
      return;
    }
    case 'cap-004-biomes': {
      assert.equal(obs.vanillaEndBiomeRegistered, true, 'CAP-004 must resolve vanilla minecraft:the_end BiomeType');
      assert.equal(obs.customEndBiomeRegistered, true, 'CAP-004 must resolve custom betterend_probe:amber_land BiomeType');
      assert.equal(obs.containsTheEnd, true, 'CAP-004 outer End volume must contain minecraft:the_end');
      assert.equal(obs.samples?.length, 4, 'CAP-004 expected 4 coordinate biome/region sample records');
      for (const sample of obs.samples) {
        assert.equal(sample.nativeBiomeId, 'minecraft:the_end', 'CAP-004 native End biome readback must be minecraft:the_end');
        assert.ok(
          typeof sample.logicalRegionId === 'string' &&
            (sample.logicalRegionId.startsWith('betterend:') || sample.logicalRegionId.startsWith('betterend_bedrock:')),
          'CAP-004 logical outer-End region lookup must resolve a BetterEnd region',
        );
      }
      return;
    }
    case 'cap-005-world-import': {
      assert.equal(obs.blockMismatches, 0, 'CAP-005 reference mini-chunk block/state readback must have 0 mismatches');
      assert.equal(obs.checksumMatch, true, 'CAP-005 expectedChecksum and observedChecksum must match');
      assert.equal(obs.containerMetadataPreserved, true, 'CAP-005 chest container item metadata, lore, enchantments, durability, and dynamic properties must be preserved');
      assert.equal(obs.observedContainer?.slot0?.variant, 'crystalite');
      assert.equal(obs.observedContainer?.slot0?.unbreaking, 3);
      assert.equal(obs.observedContainer?.slot4?.amount, 16);
      return;
    }
    case 'cap-007-infusion': {
      assert.equal(obs.completedRitual?.completed, true, 'CAP-007 ritual must complete');
      assert.equal(obs.completedRitual?.recipeId, 'betterend:aqua_affinity_book');
      assert.equal(obs.completedRitual?.outputItem?.itemId, 'minecraft:enchanted_book');
      assert.equal(obs.completedRitual?.receiptState, 'completed');
      assert.equal(obs.completedRitual?.physicalOutputsAfterCompletion, 1, 'CAP-007 must produce exactly 1 physical output item');
      assert.equal(obs.contentionRejections?.hopperAllowed, false, 'CAP-007 must block hopper withdrawal during active ritual lock');
      assert.equal(obs.contentionRejections?.hopperReason, 'pedestal_locked_by_ritual');
      assert.equal(obs.contentionRejections?.playerAllowed, false, 'CAP-007 must block competing player withdrawal during active ritual lock');
      assert.equal(obs.contentionRejections?.playerReason, 'pedestal_locked_by_ritual');
      assert.equal(obs.brokenPedestalQuarantine?.quarantined, true, 'CAP-007 broken ring pedestal must quarantine active transaction');
      assert.equal(obs.brokenPedestalQuarantine?.receiptState, 'quarantined');
      assert.equal(obs.brokenPedestalQuarantine?.droppedCountFromBrokenPedestal, 1);
      assert.equal(obs.brokenPedestalQuarantine?.survivingPedestalItemCount, 8);
      assert.equal(obs.brokenPedestalQuarantine?.conservedInputCount, 9, 'CAP-007 quarantined ritual must conserve all 9 input items');
      return;
    }
    case 'cap-008-elytra': {
      assert.equal(obs.armored?.carrierTypeId, 'minecraft:elytra');
      assert.equal(obs.armored?.variantId, 'armored');
      assert.equal(obs.armored?.defense, 6);
      assert.equal(obs.armored?.toughness, 1);
      assert.equal(obs.armored?.unbreakingLevel, 3);
      assert.equal(obs.armored?.repaired, true);
      assert.equal(obs.armored?.fireworkBoostApplied, true);
      assert.ok(obs.armored?.damageAfterRepair < obs.armored?.damageBeforeRepair, 'CAP-008 Armored Elytra anvil repair must reduce damage');

      assert.equal(obs.crystalite?.carrierTypeId, 'minecraft:elytra');
      assert.equal(obs.crystalite?.variantId, 'crystalite');
      assert.equal(obs.crystalite?.defense, 6);
      assert.equal(obs.crystalite?.toughness, 3);
      assert.equal(obs.crystalite?.unbreakingLevel, 2);
      assert.equal(obs.crystalite?.repaired, true);
      assert.equal(obs.crystalite?.updraftBoostApplied, true);
      assert.equal(obs.crystalite?.updraftBoostMultiplier, 5.0, 'CAP-008 Crystalite Elytra must apply 5.0x hydrothermal updraft multiplier');
      assert.ok(obs.crystalite?.updraftVerticalVelocity >= 0.3, 'CAP-008 hydrothermal updraft must boost vertical velocity >= 0.3');
      assert.ok(obs.crystalite?.damageAfterRepair < obs.crystalite?.damageBeforeRepair, 'CAP-008 Crystalite Elytra anvil repair must reduce damage');

      assert.equal(obs.crystaliteArmorSet?.hasFullSet, true);
      assert.equal(obs.crystaliteArmorSet?.crystaliteSetBonusActive, true);
      assert.equal(obs.crystaliteArmorSet?.mindShieldActive, true);
      assert.equal(obs.crystaliteArmorSet?.softLandingActive, true);
      return;
    }
    case 'cap-011-fog-audio': {
      assert.equal(obs.initialActivation?.transitioned, true);
      assert.equal(obs.initialActivation?.activeRegion, 'amber_land');
      assert.equal(obs.initialActivation?.musicSoundId, 'betterend.music.forest');
      assert.equal(obs.initialActivation?.ambientSoundId, 'betterend.ambient.amber_land');
      assert.equal(obs.hysteresisSuppression?.transitioned, false);
      assert.equal(obs.hysteresisSuppression?.hysteresisPending, true);
      assert.equal(obs.hysteresisSuppression?.activeRegion, 'amber_land');
      assert.equal(obs.biomeTransition?.transitioned, true);
      assert.equal(obs.biomeTransition?.previousRegion, 'amber_land');
      assert.equal(obs.biomeTransition?.activeRegion, 'umbrella_jungle');
      assert.equal(obs.biomeTransition?.priorMusicStopped, true);
      assert.equal(obs.caveTransition?.transitioned, true);
      assert.equal(obs.caveTransition?.activeRegion, 'lush_aurora_cave');
      assert.equal(obs.caveTransition?.musicSoundId, 'betterend.music.caves');
      assert.equal(obs.caveTransition?.priorMusicStopped, true);
      assert.equal(obs.dimensionExit?.transitioned, true);
      assert.equal(obs.dimensionExit?.activeRegion, null);
      assert.equal(obs.dimensionExit?.priorMusicStopped, true);
      assert.equal(obs.dimensionExit?.foreignFogPreserved, true, 'CAP-011 must preserve foreign pack fog entries on transition and exit');
      return;
    }
    case 'cap-012-functional-blocks': {
      assert.equal(obs.customEntitiesRegistered?.chair, true, 'CAP-012 betterend_probe:chair entity must be registered');
      assert.equal(obs.customEntitiesRegistered?.boat, true, 'CAP-012 betterend_probe:end_lotus_boat entity must be registered');
      assert.equal(obs.door?.lower?.states?.['betterend_probe:open'], true);
      assert.equal(obs.door?.upper?.states?.['betterend_probe:open'], true);
      assert.equal(obs.chair?.seatCount, 1);
      assert.equal(obs.chair?.mounted, true);
      assert.equal(obs.chair?.cleanedUpOnBreak, true);
      assert.equal(obs.boat?.seatCount, 2);
      assert.equal(obs.boat?.spawned, true);
      assert.equal(obs.boat?.isRaft, true);
      assert.equal(obs.multiBlockFlora?.mossLower?.states?.['betterend_probe:half'], 'lower');
      assert.equal(obs.multiBlockFlora?.mossUpper?.states?.['betterend_probe:half'], 'upper');
      assert.equal(obs.multiBlockFlora?.lotusBottom?.states?.['betterend_probe:waterlogged'], true);
      assert.equal(obs.potAndPedestal?.potPlacedPlant, 'betterend:amber_grass');
      assert.equal(obs.potAndPedestal?.potReturnedItem, 'betterend:amber_grass');
      assert.equal(obs.potAndPedestal?.pedestalDisplayedItem, 'betterend:eternal_crystal');
      assert.equal(obs.potAndPedestal?.pedestalLightEmission, 12);
      assert.equal(obs.potAndPedestal?.pedestalReturnedItem, 'betterend:eternal_crystal');
      return;
    }
    case 'cap-013-portals-obelisk': {
      assert.equal(obs.obelisk?.activated, true);
      assert.equal(obs.obelisk?.intactRespawn?.redirected, true);
      assert.equal(obs.obelisk?.intactRespawn?.targetDimension, 'minecraft:the_end');
      assert.equal(obs.obelisk?.obstructedRespawn?.redirected, false);
      assert.equal(obs.obelisk?.obstructedRespawn?.reason, 'obelisk_landing_obstructed');
      assert.equal(obs.obelisk?.brokenObeliskPartsCount, 3);
      assert.equal(obs.obelisk?.destroyedRespawn?.redirected, false);
      assert.equal(obs.obelisk?.destroyedRespawn?.reason, 'obelisk_destroyed');
      assert.equal(obs.portal?.invalidAttemptActivated, false);
      assert.equal(obs.portal?.validActivated, true);
      assert.equal(obs.portal?.firstTravel?.teleported, true);
      assert.equal(obs.portal?.cooldownBlockedTravel?.teleported, false);
      assert.equal(obs.portal?.cooldownBlockedTravel?.reason, 'portal_cooldown_active');
      assert.equal(obs.portal?.postCooldownTravel?.teleported, true);
      assert.equal(obs.portal?.unsafeDestinationTravel?.teleported, false);
      assert.equal(obs.portal?.unsafeDestinationTravel?.reason, 'destination_missing_solid_support');
      return;
    }
    case 'cap-014-concurrent-prep': {
      assert.equal(obs.concurrentPlanning?.deterministicAnchorMatch, true);
      assert.equal(obs.concurrentPlanning?.committedOk, true);
      assert.equal(obs.concurrentPlanning?.committedState, 'Committed');
      assert.equal(obs.concurrentPlanning?.markerBlock?.typeId, 'betterend_probe:flavolite');
      assert.equal(obs.interruptionQuarantine?.ok, false);
      assert.equal(obs.interruptionQuarantine?.state, 'Quarantined');
      assert.equal(obs.interruptionQuarantine?.reason, 'interrupted_preparation_step');
      assert.equal(obs.interruptionQuarantine?.reloadedState, 'Quarantined');
      assert.equal(obs.playerBuildProtection?.ok, false);
      assert.equal(obs.playerBuildProtection?.state, 'Quarantined');
      assert.equal(obs.playerBuildProtection?.reason, 'refusing_to_overwrite_existing_player_build');
      assert.equal(obs.playerBuildProtection?.reloadedState, 'Quarantined');
      return;
    }
    default:
      throw new Error(`Unhandled capability assertion action: ${request.action}`);
  }
}
