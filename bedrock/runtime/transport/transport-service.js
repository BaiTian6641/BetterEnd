/**
 * BetterEnd Bedrock 26.40 — Respawn Obelisk & Eternal Portal Transport Service (`TRV-001`)
 *
 * Implements:
 * - Respawn Obelisk (`shape = bottom|middle|top`):
 *   - 3-block vertical integrity check (breaking any part breaks all 3 and drops 1 `respawn_obelisk` item)
 *   - Activation consumes 6 `betterend:amber_gem` items, binds player's Respawn Obelisk anchor in the End,
 *     plays activation sound/aurora particles, and never depletes charges or explodes in the End
 *   - On player death (`playerSpawn` after death), validates obelisk still exists and has a safe
 *     2-block-high landing spot around the obelisk (checking 8 horizontal offsets), teleports player
 *     safely if `setSpawnPoint` in End defaulted to Overworld/End spawn, or gracefully notifies player
 *     if the obelisk was destroyed/obstructed
 * - Eternal Portal:
 *   - Authoritative travel transaction (`source`, `destination`, `actor`, `pendingArrival`, `completed`)
 *   - Validates destination readiness, headroom, and solid support before teleporting
 *   - Prevents portal loops with per-actor cooldown hysteresis
 *
 * Pure ES module with zero Node-specific imports.
 */

import {
  PersistenceStore,
  formatAnchorKey,
  normalizeBlockAnchor,
  normalizeDimensionId,
} from '../persistence/store.js';

export const RESPAWN_OBELISK_SHAPES = Object.freeze(['bottom', 'middle', 'top']);
export const RESPAWN_OBELISK_AMBER_COST = 6;

export const OBELISK_HORIZONTAL_LANDING_OFFSETS = Object.freeze([
  Object.freeze([1, 0]),
  Object.freeze([-1, 0]),
  Object.freeze([0, 1]),
  Object.freeze([0, -1]),
  Object.freeze([1, 1]),
  Object.freeze([1, -1]),
  Object.freeze([-1, 1]),
  Object.freeze([-1, -1]),
]);

export const DEFAULT_PORTAL_COOLDOWN_TICKS = 80;

/**
 * Authoritative runtime service for BetterEnd Respawn Obelisk & Eternal Portal (`TRV-001`).
 */
export class TransportService {
  constructor(options = {}) {
    this.store = options.store ?? new PersistenceStore({ world: options.world });
    this.portalCooldownTicks = Number(options.portalCooldownTicks ?? DEFAULT_PORTAL_COOLDOWN_TICKS);

    // Map of bottomAnchorKey -> obelisk multiblock record
    this._obelisks = new Map();
    // Map of blockPosKey -> bottomAnchorKey for O(1) lookup from any of the 3 vertical parts
    this._obeliskPartIndex = new Map();
    // Map of playerId -> bound obelisk anchor record
    this._playerBindings = new Map();
    // Map of actorId -> { lastPortalTick, inPortalVolume, lastDestinationKey }
    this._portalCooldowns = new Map();
    // Map of travelTxId -> travel transaction record
    this._travelTransactions = new Map();
    this._nextTravelTxId = 1;
  }

  // ============================================================================
  // 1. RESPAWN OBELISK (`shape = bottom|middle|top`)
  // ============================================================================

  /**
   * Places a 3-block vertical Respawn Obelisk (`bottom` at `y`, `middle` at `y+1`, `top` at `y+2`).
   */
  placeRespawnObelisk({ dimension = 'minecraft:the_end', bottomAnchor }) {
    const normDim = normalizeDimensionId(dimension);
    const base = normalizeBlockAnchor(bottomAnchor);
    const station = this.store.registerStation({
      dimension: normDim,
      anchor: base,
      stationType: 'betterend:respawn_obelisk',
      state: {
        intact: true,
        shapes: ['bottom', 'middle', 'top'],
        neverDepletesCharges: true,
        neverExplodesInEnd: true,
      },
    });

    const parts = [
      { shape: 'bottom', x: base.x, y: base.y, z: base.z, lightEmission: 0 },
      { shape: 'middle', x: base.x, y: base.y + 1, z: base.z, lightEmission: 15 },
      { shape: 'top', x: base.x, y: base.y + 2, z: base.z, lightEmission: 15 },
    ];

    const record = {
      stationId: station.stationId,
      generationId: station.generationId,
      dimension: normDim,
      bottomAnchor: base,
      bottomKey: station.anchorKey,
      parts,
      intact: true,
      neverDepletesCharges: true,
      neverExplodesInEnd: true,
    };

    this._obelisks.set(station.anchorKey, record);
    for (const part of parts) {
      const partKey = formatAnchorKey(normDim, part);
      this._obeliskPartIndex.set(partKey, station.anchorKey);
    }

    return JSON.parse(JSON.stringify(record));
  }

  getRespawnObeliskAt({ dimension = 'minecraft:the_end', pos }) {
    const partKey = formatAnchorKey(dimension, pos);
    const bottomKey = this._obeliskPartIndex.get(partKey) ?? partKey;
    const obelisk = this._obelisks.get(bottomKey);
    return obelisk ? JSON.parse(JSON.stringify(obelisk)) : null;
  }

  /**
   * Enforces 3-block vertical integrity: breaking ANY part (`bottom`, `middle`, or `top`)
   * breaks all 3 vertical segments and drops exactly 1 `betterend:respawn_obelisk` item.
   */
  breakRespawnObeliskPart({ dimension = 'minecraft:the_end', pos }) {
    const normDim = normalizeDimensionId(dimension);
    const partPos = normalizeBlockAnchor(pos);
    const partKey = formatAnchorKey(normDim, partPos);
    const bottomKey = this._obeliskPartIndex.get(partKey);
    if (!bottomKey) {
      return { broken: false, reason: 'obelisk_not_found' };
    }

    const obelisk = this._obelisks.get(bottomKey);
    if (!obelisk) {
      return { broken: false, reason: 'obelisk_not_found' };
    }

    const brokenPart = obelisk.parts.find(
      p => p.x === partPos.x && p.y === partPos.y && p.z === partPos.z,
    );

    for (const part of obelisk.parts) {
      const key = formatAnchorKey(normDim, part);
      this._obeliskPartIndex.delete(key);
    }
    this._obelisks.delete(bottomKey);
    this.store.breakStation({
      dimension: normDim,
      anchor: obelisk.bottomAnchor,
      reason: `obelisk_part_broken:${brokenPart?.shape ?? 'unknown'}`,
    });

    return {
      broken: true,
      brokenShape: brokenPart?.shape ?? 'bottom',
      destroyedParts: obelisk.parts.map(p => ({ ...p })),
      drops: [{ itemId: 'betterend:respawn_obelisk', count: 1 }],
    };
  }

  /**
   * Activates a Respawn Obelisk by right-clicking any segment (`bottom`, `middle`, or `top`)
   * with >= 6 `betterend:amber_gem` items.
   * - Consumes 6 `betterend:amber_gem` (unless Creative)
   * - Binds the player's Respawn Obelisk anchor in the End
   * - Plays activation sound & aurora/infusion particles
   * - Never depletes charges and never explodes in the End
   */
  activateRespawnObelisk({
    playerId,
    dimension = 'minecraft:the_end',
    pos,
    heldItem,
    isCreative = false,
  }) {
    const obelisk = this.getRespawnObeliskAt({ dimension, pos });
    if (!obelisk || !obelisk.intact) {
      return { activated: false, reason: 'obelisk_not_found_or_incomplete' };
    }

    const itemId = typeof heldItem === 'string' ? heldItem : heldItem?.itemId ?? heldItem?.typeId;
    const count = Number(heldItem?.count ?? heldItem?.amount ?? 0);

    if (itemId !== 'betterend:amber_gem' || (!isCreative && count < RESPAWN_OBELISK_AMBER_COST)) {
      return {
        activated: false,
        reason: 'insufficient_amber_gems',
        requiredItem: 'betterend:amber_gem',
        requiredCount: RESPAWN_OBELISK_AMBER_COST,
        actualCount: count,
        actionbarMessage: 'message.betterend.fail_spawn',
        exploded: false,
      };
    }

    const consumedCount = isCreative ? 0 : RESPAWN_OBELISK_AMBER_COST;
    const remainingCount = Math.max(0, count - consumedCount);

    const binding = {
      playerId: String(playerId),
      dimension: obelisk.dimension,
      bottomAnchor: { ...obelisk.bottomAnchor },
      bottomKey: obelisk.bottomKey,
      generationId: obelisk.generationId,
      permanent: true,
      chargesDeplete: false,
      explodesInEnd: false,
    };

    this._playerBindings.set(String(playerId), binding);
    this.store.setGlobalRecord(`obelisk_binding:${playerId}`, binding);

    return {
      activated: true,
      playerId: String(playerId),
      binding,
      consumedItem: { itemId: 'betterend:amber_gem', count: consumedCount },
      remainingHeldItem:
        remainingCount > 0 ? { itemId: 'betterend:amber_gem', count: remainingCount } : null,
      actionbarMessage: 'message.betterend.set_spawn',
      sound: 'respawn_anchor.set_spawn',
      particles: ['betterend:infusion_amber', 'betterend:amber_sphere'],
      chargesDeplete: false,
      exploded: false,
    };
  }

  getPlayerObeliskBinding(playerId) {
    const id = String(playerId);
    return (
      this._playerBindings.get(id) ??
      this.store.getGlobalRecord(`obelisk_binding:${id}`, null)
    );
  }

  /**
   * Handles `playerSpawn` after death (`initialSpawn === false`).
   * Validates that the bound Respawn Obelisk still exists and searches the 8
   * horizontal offsets around `bottomAnchor` for a safe 2-block-high landing spot
   * with solid floor support. Teleports the player safely even if `setSpawnPoint`
   * in the End defaulted to Overworld/End spawn, or gracefully notifies the player
   * if the obelisk was destroyed or obstructed.
   */
  handlePlayerRespawn({
    playerId,
    initialSpawn = false,
    currentDimension = 'minecraft:overworld',
    isPositionSafe = null,
  }) {
    if (initialSpawn) {
      return { redirected: false, reason: 'initial_join_not_death_respawn' };
    }

    const binding = this.getPlayerObeliskBinding(playerId);
    if (!binding) {
      return { redirected: false, reason: 'no_obelisk_binding' };
    }

    const liveObelisk = this._obelisks.get(binding.bottomKey);
    if (
      !liveObelisk ||
      !liveObelisk.intact ||
      liveObelisk.generationId !== binding.generationId ||
      liveObelisk.parts.length !== 3
    ) {
      this._playerBindings.delete(String(playerId));
      this.store.setGlobalRecord(`obelisk_binding:${playerId}`, null);
      return {
        redirected: false,
        obeliskDestroyed: true,
        reason: 'obelisk_destroyed',
        notificationMessage: 'message.betterend.obelisk_missing_or_obstructed',
      };
    }

    const base = liveObelisk.bottomAnchor;
    let safeLanding = null;
    const checkedOffsets = [];

    for (const [dx, dz] of OBELISK_HORIZONTAL_LANDING_OFFSETS) {
      const candidate = { x: base.x + dx, y: base.y, z: base.z + dz };
      checkedOffsets.push(candidate);

      let safe = true;
      if (typeof isPositionSafe === 'function') {
        safe = Boolean(
          isPositionSafe(candidate, {
            floorPos: { x: candidate.x, y: candidate.y - 1, z: candidate.z },
            feetPos: { x: candidate.x, y: candidate.y, z: candidate.z },
            headPos: { x: candidate.x, y: candidate.y + 1, z: candidate.z },
          }),
        );
      }
      if (safe) {
        safeLanding = {
          x: candidate.x + 0.5,
          y: candidate.y,
          z: candidate.z + 0.5,
          blockPos: candidate,
          offset: [dx, dz],
        };
        break;
      }
    }

    if (!safeLanding) {
      return {
        redirected: false,
        obeliskObstructed: true,
        reason: 'obelisk_landing_obstructed',
        checkedOffsetsCount: checkedOffsets.length,
        notificationMessage: 'message.betterend.obelisk_missing_or_obstructed',
      };
    }

    return {
      redirected: true,
      fromDimension: normalizeDimensionId(currentDimension),
      targetDimension: liveObelisk.dimension,
      landingPosition: safeLanding,
      checkedOffsetsCount: checkedOffsets.length,
      chargesRemaining: Infinity,
      chargesDepleted: false,
      exploded: false,
    };
  }

  // ============================================================================
  // 2. ETERNAL PORTAL AUTHORITATIVE TRAVEL TRANSACTIONS (`TRV-001`)
  // ============================================================================

  /**
   * Executes an authoritative Eternal Portal travel transaction:
   * - Tracks `source`, `destination`, `actor`, `pendingArrival`, and `completed`
   * - Validates destination readiness, solid support floor, 2-block headroom, and void safety
   * - Prevents portal bounce loops via per-actor cooldown hysteresis
   */
  executePortalTravel({
    actorId,
    source = { dimension: 'minecraft:the_end', position: { x: 1024, y: 64, z: 1024 } },
    destination = {
      dimension: 'minecraft:overworld',
      position: { x: 128, y: 70, z: 128 },
      regionReady: true,
      hasSolidSupport: true,
      hasHeadroom: true,
      voidSafe: true,
    },
    currentTick = 0,
  }) {
    const actor = String(actorId ?? 'player_1');
    const tick = Number(currentTick) || 0;
    const cooldownState = this._portalCooldowns.get(actor);

    if (
      cooldownState &&
      (cooldownState.inPortalVolume || tick - cooldownState.lastPortalTick < this.portalCooldownTicks)
    ) {
      return {
        teleported: false,
        reason: 'portal_cooldown_active',
        actor,
        remainingCooldownTicks: Math.max(0, this.portalCooldownTicks - (tick - cooldownState.lastPortalTick)),
      };
    }

    const txId = `portal_tx_${this._nextTravelTxId++}`;
    const txRecord = {
      txId,
      actor,
      source: {
        dimension: normalizeDimensionId(source.dimension),
        position: normalizeBlockAnchor(source.position),
      },
      destination: {
        dimension: normalizeDimensionId(destination.dimension),
        position: normalizeBlockAnchor(destination.position),
      },
      pendingArrival: true,
      completed: false,
      abortedReason: null,
      tick,
    };
    this._travelTransactions.set(txId, txRecord);

    // Validate destination readiness, support, headroom, and void safety before teleporting
    if (destination.regionReady === false) {
      txRecord.pendingArrival = false;
      txRecord.abortedReason = 'destination_region_not_ready';
      return { teleported: false, reason: txRecord.abortedReason, transaction: { ...txRecord } };
    }
    if (destination.hasSolidSupport === false) {
      txRecord.pendingArrival = false;
      txRecord.abortedReason = 'destination_missing_solid_support';
      return { teleported: false, reason: txRecord.abortedReason, transaction: { ...txRecord } };
    }
    if (destination.hasHeadroom === false) {
      txRecord.pendingArrival = false;
      txRecord.abortedReason = 'destination_obstructed_headroom';
      return { teleported: false, reason: txRecord.abortedReason, transaction: { ...txRecord } };
    }
    if (destination.voidSafe === false || destination.position.y <= 0) {
      txRecord.pendingArrival = false;
      txRecord.abortedReason = 'destination_unsafe_void';
      return { teleported: false, reason: txRecord.abortedReason, transaction: { ...txRecord } };
    }

    // Complete arrival and arm portal loop hysteresis cooldown
    txRecord.pendingArrival = false;
    txRecord.completed = true;

    this._portalCooldowns.set(actor, {
      lastPortalTick: tick,
      inPortalVolume: true,
      lastDestinationKey: formatAnchorKey(txRecord.destination.dimension, txRecord.destination.position),
    });

    return {
      teleported: true,
      txId,
      transaction: JSON.parse(JSON.stringify(txRecord)),
      arrivalPosition: {
        x: txRecord.destination.position.x + 0.5,
        y: txRecord.destination.position.y,
        z: txRecord.destination.position.z + 0.5,
      },
      targetDimension: txRecord.destination.dimension,
    };
  }

  /**
   * Notifies the transport service that `actorId` has stepped out of the portal volume,
   * clearing the `inPortalVolume` hysteresis lock once cooldown ticks have elapsed.
   */
  markActorExitedPortal(actorId) {
    const actor = String(actorId);
    const state = this._portalCooldowns.get(actor);
    if (state) {
      state.inPortalVolume = false;
    }
    return Boolean(state);
  }

  getPortalTravelTransaction(txId) {
    const tx = this._travelTransactions.get(txId);
    return tx ? JSON.parse(JSON.stringify(tx)) : null;
  }
}

export default TransportService;
