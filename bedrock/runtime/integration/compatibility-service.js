/**
 * BetterEnd Bedrock 26.40 — Cross-Pack Read-Only Compatibility Query Service (`INT-001`)
 *
 * Implements the versioned read-only query protocol (`betterend:query` / `betterend:response`,
 * `schemaVersion: 1`) exposing region lookup, tags, readiness, and material families to
 * external packs (such as Abyssal Ascent / industrial packs) with rate/size bounds and
 * strict read-only isolation (external messages can never mint items, commit rituals,
 * or alter generation/station state).
 *
 * Pure ES module with zero Node-specific imports.
 */

import { REGION_PRESENTATION_PRESETS } from '../presentation/presentation-service.js';
import { ITEM_TAG_MEMBERS } from '../stations/stations-service.js';
import { ARMOR_TIERS, ELYTRA_VARIANTS, TOOL_TIERS } from '../equipment/equipment-service.js';
import { WOOD_SEATING_FAMILIES } from '../ecology/ecology-service.js';
import { normalizeBlockAnchor, normalizeDimensionId } from '../persistence/store.js';

export const COMPATIBILITY_SCHEMA_VERSION = 1;
export const QUERY_CHANNEL_ID = 'betterend:query';
export const RESPONSE_CHANNEL_ID = 'betterend:response';
export const DEFAULT_MAX_REQUEST_BYTES = 4096;
export const DEFAULT_MAX_RESPONSE_BYTES = 16384;
export const DEFAULT_MAX_REQUESTS_PER_WINDOW = 20;

export const MATERIAL_FAMILIES = Object.freeze({
  metals: Object.freeze({
    thallasium: Object.freeze({
      id: 'thallasium',
      ingot: 'betterend:thallasium_ingot',
      nugget: 'betterend:thallasium_nugget',
      ore: 'betterend:thallasium_ore',
      raw: 'betterend:thallasium_raw',
      block: 'betterend:thallasium_block',
      forgedPlate: 'betterend:thallasium_forged_plate',
      anvil: 'betterend:thallasium_anvil',
      toolTier: TOOL_TIERS.thallasium,
      armorTier: ARMOR_TIERS.thallasium,
    }),
    terminite: Object.freeze({
      id: 'terminite',
      ingot: 'betterend:terminite_ingot',
      nugget: 'betterend:terminite_nugget',
      block: 'betterend:terminite_block',
      forgedPlate: 'betterend:terminite_forged_plate',
      anvil: 'betterend:terminite_anvil',
      toolTier: TOOL_TIERS.terminite,
      armorTier: ARMOR_TIERS.terminite,
    }),
    aeternium: Object.freeze({
      id: 'aeternium',
      ingot: 'betterend:aeternium_ingot',
      block: 'betterend:aeternium_block',
      forgedPlate: 'betterend:aeternium_forged_plate',
      anvil: 'betterend:aeternium_anvil',
      toolTier: TOOL_TIERS.aeternium,
      armorTier: ARMOR_TIERS.aeternium,
      elytra: ELYTRA_VARIANTS.armored,
    }),
    crystalite: Object.freeze({
      id: 'crystalite',
      armorTier: ARMOR_TIERS.crystalite,
      elytra: ELYTRA_VARIANTS.crystalite,
    }),
  }),
  woods: Object.freeze([...WOOD_SEATING_FAMILIES]),
  stones: Object.freeze([
    'flavolite',
    'violecite',
    'sulphuric_rock',
    'virid_jadestone',
    'azure_jadestone',
    'sandy_jadestone',
    'umbralith',
    'ender_block',
    'amber_block',
  ]),
});

export const REGION_TAG_INDEX = Object.freeze({
  'wover:is_end/land': Object.freeze([
    'betterend:foggy_mushroomland',
    'betterend:megalake',
    'betterend:crystal_mountains',
    'betterend:shadow_forest',
    'betterend:amber_land',
    'betterend:blossoming_spires',
    'betterend:sulphur_springs',
    'betterend:umbrella_jungle',
    'betterend:glowing_grasslands',
    'betterend:dragon_graveyards',
    'betterend:dry_shrubland',
    'betterend:lantern_woods',
    'betterend:umbra_valley',
  ]),
  'wover:is_end/highland': Object.freeze(['betterend:chorus_forest']),
  'wover:is_end/midland': Object.freeze(['betterend:dust_wastelands']),
  'wover:is_end/small_island': Object.freeze([
    'betterend:ice_starfield',
    'betterend:flower_islets',
    'betterend:waterfall_ponds',
  ]),
  'betterend:is_end_cave': Object.freeze([
    'betterend:empty_end_cave',
    'betterend:empty_smaragdant_cave',
    'betterend:lush_smaragdant_cave',
    'betterend:empty_aurora_cave',
    'betterend:lush_aurora_cave',
    'betterend:jade_cave',
  ]),
});

const FORBIDDEN_MUTATION_ACTIONS = new Set([
  'mint_item',
  'spawn_item',
  'give_item',
  'commit_ritual',
  'complete_ritual',
  'force_ritual',
  'set_readiness',
  'set_generation_state',
  'overwrite_region',
  'modify_station',
  'unlock_station',
  'delete_transaction',
]);

function deepFreezeClone(obj) {
  const cloned = JSON.parse(JSON.stringify(obj));
  const freezeRec = value => {
    if (value && typeof value === 'object') {
      Object.freeze(value);
      for (const child of Object.values(value)) {
        freezeRec(child);
      }
    }
    return value;
  };
  return freezeRec(cloned);
}

/**
 * Authoritative read-only compatibility adapter (`INT-001`).
 */
export class CompatibilityService {
  constructor(options = {}) {
    this.schemaVersion = COMPATIBILITY_SCHEMA_VERSION;
    this.maxRequestBytes = Number(options.maxRequestBytes ?? DEFAULT_MAX_REQUEST_BYTES);
    this.maxResponseBytes = Number(options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES);
    this.maxRequestsPerWindow = Number(options.maxRequestsPerWindow ?? DEFAULT_MAX_REQUESTS_PER_WINDOW);
    this.generationRevision = options.generationRevision ?? '26.40.1';

    this._regionResolver = options.regionResolver ?? null;
    this._readinessMap = new Map(Object.entries(options.initialReadiness ?? {}));
    this._rateCounters = new Map();
    this._emittedResponses = [];
    this._onResponse = options.onResponse ?? null;
  }

  /**
   * Internal-only (BetterEnd runtime owner) method to publish region readiness snapshots
   * for read-only inspection by external packs. Never callable via `handleQueryMessage`.
   */
  publishInternalRegionReadiness(regionCellKey, status = 'committed', metadata = {}) {
    this._readinessMap.set(String(regionCellKey), {
      regionCellKey: String(regionCellKey),
      status,
      ready: status === 'committed' || status === 'validated',
      generationRevision: this.generationRevision,
      ...JSON.parse(JSON.stringify(metadata)),
    });
  }

  resetRateLimitWindow() {
    this._rateCounters.clear();
  }

  /**
   * Handles a `betterend:query` request payload (JSON string or object) and emits
   * a versioned `betterend:response` envelope (`schemaVersion: 1`).
   */
  handleQueryMessage(rawRequest, { sender = 'external_pack', currentTick = 0 } = {}) {
    const rawString = typeof rawRequest === 'string' ? rawRequest : JSON.stringify(rawRequest ?? {});
    if (rawString.length > this.maxRequestBytes) {
      return this._emitEnvelope({
        requestId: null,
        sender,
        status: 'error',
        errorCode: 'PAYLOAD_TOO_LARGE',
        message: `Query payload (${rawString.length} bytes) exceeds maxRequestBytes (${this.maxRequestBytes})`,
      });
    }

    const rateKey = `${sender}@${currentTick}`;
    const currentCount = (this._rateCounters.get(rateKey) ?? 0) + 1;
    this._rateCounters.set(rateKey, currentCount);
    if (currentCount > this.maxRequestsPerWindow) {
      return this._emitEnvelope({
        requestId: null,
        sender,
        status: 'error',
        errorCode: 'RATE_LIMIT_EXCEEDED',
        message: `Sender ${sender} exceeded rate limit (${this.maxRequestsPerWindow} requests/window)`,
      });
    }

    let request;
    try {
      request = typeof rawRequest === 'string' ? JSON.parse(rawRequest) : rawRequest;
    } catch {
      return this._emitEnvelope({
        requestId: null,
        sender,
        status: 'error',
        errorCode: 'INVALID_JSON',
        message: 'Malformed JSON in betterend:query payload',
      });
    }

    if (!request || typeof request !== 'object') {
      return this._emitEnvelope({
        requestId: null,
        sender,
        status: 'error',
        errorCode: 'INVALID_REQUEST',
        message: 'Query payload must be a JSON object',
      });
    }

    const requestId = request.requestId ?? null;
    const reqVersion = request.schemaVersion ?? 1;
    if (reqVersion !== this.schemaVersion) {
      return this._emitEnvelope({
        requestId,
        sender,
        status: 'error',
        errorCode: 'UNSUPPORTED_SCHEMA_VERSION',
        message: `Unsupported schemaVersion ${reqVersion}; expected ${this.schemaVersion}`,
      });
    }

    const queryType = String(request.type ?? request.query ?? request.action ?? '').toLowerCase();

    // Enforce strict read-only isolation: reject any mutation/action request
    if (
      FORBIDDEN_MUTATION_ACTIONS.has(queryType) ||
      request.mutate === true ||
      queryType.startsWith('mint_') ||
      queryType.startsWith('commit_') ||
      queryType.startsWith('set_') ||
      queryType.startsWith('write_')
    ) {
      return this._emitEnvelope({
        requestId,
        sender,
        status: 'error',
        errorCode: 'READ_ONLY_VIOLATION',
        message: `betterend:query protocol is strictly read-only; rejected '${queryType}'`,
      });
    }

    switch (queryType) {
      case 'region':
      case 'region_lookup':
      case 'get_region': {
        const dim = normalizeDimensionId(request.dimension ?? 'minecraft:the_end');
        const pos = normalizeBlockAnchor(request.position ?? { x: request.x ?? 1024, y: request.y ?? 64, z: request.z ?? 1024 });
        const regionInfo = this._resolveRegionAt(dim, pos);
        return this._emitEnvelope({
          requestId,
          sender,
          status: 'ok',
          queryType: 'region',
          data: regionInfo,
        });
      }

      case 'tags':
      case 'get_tags': {
        const tagDomain = String(request.domain ?? 'all').toLowerCase();
        const data = {};
        if (tagDomain === 'all' || tagDomain === 'region') {
          data.regionTags = REGION_TAG_INDEX;
        }
        if (tagDomain === 'all' || tagDomain === 'item') {
          data.itemTags = ITEM_TAG_MEMBERS;
        }
        return this._emitEnvelope({
          requestId,
          sender,
          status: 'ok',
          queryType: 'tags',
          data,
        });
      }

      case 'readiness':
      case 'get_readiness': {
        const cellKey = String(request.regionCellKey ?? request.cellKey ?? 'minecraft:the_end:0:0');
        const record = this._readinessMap.get(cellKey) ?? {
          regionCellKey: cellKey,
          status: 'unknown',
          ready: false,
          safeToOverwrite: false,
          generationRevision: this.generationRevision,
        };
        return this._emitEnvelope({
          requestId,
          sender,
          status: 'ok',
          queryType: 'readiness',
          data: record,
        });
      }

      case 'material_families':
      case 'materials':
      case 'get_material_families': {
        const familyFilter = request.family ? String(request.family).toLowerCase() : null;
        const data = familyFilter
          ? {
              family: familyFilter,
              definition:
                MATERIAL_FAMILIES.metals[familyFilter] ??
                (MATERIAL_FAMILIES.woods.includes(familyFilter) ? { id: familyFilter, kind: 'wood' } : null) ??
                (MATERIAL_FAMILIES.stones.includes(familyFilter) ? { id: familyFilter, kind: 'stone' } : null),
            }
          : MATERIAL_FAMILIES;
        return this._emitEnvelope({
          requestId,
          sender,
          status: 'ok',
          queryType: 'material_families',
          data,
        });
      }

      case 'ping':
      case 'capabilities': {
        return this._emitEnvelope({
          requestId,
          sender,
          status: 'ok',
          queryType: 'capabilities',
          data: {
            channel: QUERY_CHANNEL_ID,
            responseChannel: RESPONSE_CHANNEL_ID,
            schemaVersion: this.schemaVersion,
            readOnly: true,
            generationRevision: this.generationRevision,
            supportedQueries: ['region', 'tags', 'readiness', 'material_families', 'capabilities'],
          },
        });
      }

      default:
        return this._emitEnvelope({
          requestId,
          sender,
          status: 'error',
          errorCode: 'UNKNOWN_QUERY_TYPE',
          message: `Unknown read-only query type: '${queryType}'`,
        });
    }
  }

  _resolveRegionAt(dimension, pos) {
    if (typeof this._regionResolver === 'function') {
      return this._regionResolver(dimension, pos);
    }

    if (dimension !== 'minecraft:the_end') {
      return {
        dimension,
        position: pos,
        isBetterEndRegion: false,
        effectiveRegion: null,
        layer: 'foreign_dimension',
        tags: [],
        generationRevision: this.generationRevision,
      };
    }

    const distSq = pos.x * pos.x + pos.z * pos.z;
    if (distSq < 1024 * 1024) {
      return {
        dimension,
        position: pos,
        isBetterEndRegion: false,
        effectiveRegion: 'minecraft:the_end',
        surfaceRegion: 'minecraft:the_end',
        subRegion: null,
        caveRegion: null,
        aerialRegion: null,
        layer: 'central_island_protected',
        tags: ['c:is_end'],
        generationRevision: this.generationRevision,
      };
    }

    const presetKeys = Object.keys(REGION_PRESENTATION_PRESETS);
    const landKeys = presetKeys.filter(k => REGION_PRESENTATION_PRESETS[k].layer === 'land');
    const caveKeys = presetKeys.filter(k => REGION_PRESENTATION_PRESETS[k].layer === 'cave');
    const hash = Math.abs((pos.x >> 7) * 73856093 ^ (pos.z >> 7) * 19349663);
    const surfaceKey = landKeys[hash % landKeys.length];
    const caveKey = pos.y >= 4 && pos.y < 48 ? caveKeys[hash % caveKeys.length] : null;
    const effectiveKey = caveKey ?? surfaceKey;
    const preset = REGION_PRESENTATION_PRESETS[effectiveKey];

    const matchingTags = Object.entries(REGION_TAG_INDEX)
      .filter(([, members]) => members.includes(preset.fullId))
      .map(([tagId]) => tagId);

    return {
      dimension,
      position: pos,
      isBetterEndRegion: true,
      effectiveRegion: preset.fullId,
      surfaceRegion: REGION_PRESENTATION_PRESETS[surfaceKey].fullId,
      subRegion: preset.parentRegion ? preset.fullId : null,
      caveRegion: caveKey ? REGION_PRESENTATION_PRESETS[caveKey].fullId : null,
      aerialRegion: preset.layer === 'aerial' ? preset.fullId : null,
      layer: preset.layer,
      tags: ['c:is_end', ...matchingTags],
      fogColor: preset.fogColor,
      waterColor: preset.waterColor,
      generationRevision: this.generationRevision,
    };
  }

  _emitEnvelope(payload) {
    const envelope = {
      channel: RESPONSE_CHANNEL_ID,
      schemaVersion: this.schemaVersion,
      readOnly: true,
      ...payload,
    };
    const serialized = JSON.stringify(envelope);
    if (serialized.length > this.maxResponseBytes) {
      const truncated = {
        channel: RESPONSE_CHANNEL_ID,
        schemaVersion: this.schemaVersion,
        readOnly: true,
        requestId: payload.requestId ?? null,
        sender: payload.sender ?? null,
        status: 'error',
        errorCode: 'RESPONSE_TOO_LARGE',
        message: 'Response exceeded maxResponseBytes',
      };
      const frozenTrunc = deepFreezeClone(truncated);
      this._emittedResponses.push(frozenTrunc);
      if (typeof this._onResponse === 'function') this._onResponse(frozenTrunc);
      return frozenTrunc;
    }

    const frozen = deepFreezeClone(envelope);
    this._emittedResponses.push(frozen);
    if (typeof this._onResponse === 'function') {
      this._onResponse(frozen);
    }
    return frozen;
  }

  getEmittedResponses() {
    return [...this._emittedResponses];
  }
}

export default CompatibilityService;
