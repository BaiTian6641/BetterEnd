/**
 * BetterEnd Bedrock 26.40 — Versioned Region-Sharded Persistence Store (`INV-001`)
 *
 * Pure ES module with zero Node-specific imports so it runs identically in
 * `@minecraft/server` 2.9.0 (Bedrock Dedicated Server) and Node.js 24 tests.
 */

export const PERSISTENCE_SCHEMA_VERSION = 1;
export const DEFAULT_CHUNK_MAX_CHARS = 8192;
export const DEFAULT_MAX_CACHED_SHARDS = 32;
export const DEFAULT_REGION_SHARD_SHIFT = 7; // 128x128 block regions

export const TRANSACTION_STATES = Object.freeze({
  PREPARING: 'preparing',
  ACTIVE: 'active',
  COMPLETING: 'completing',
  COMPLETED: 'completed',
  QUARANTINED: 'quarantined',
});

const VALID_TX_STATES = new Set(Object.values(TRANSACTION_STATES));

const ALLOWED_TX_TRANSITIONS = Object.freeze({
  [TRANSACTION_STATES.PREPARING]: new Set([
    TRANSACTION_STATES.ACTIVE,
    TRANSACTION_STATES.COMPLETING,
    TRANSACTION_STATES.COMPLETED,
    TRANSACTION_STATES.QUARANTINED,
  ]),
  [TRANSACTION_STATES.ACTIVE]: new Set([
    TRANSACTION_STATES.COMPLETING,
    TRANSACTION_STATES.COMPLETED,
    TRANSACTION_STATES.QUARANTINED,
  ]),
  [TRANSACTION_STATES.COMPLETING]: new Set([
    TRANSACTION_STATES.COMPLETED,
    TRANSACTION_STATES.QUARANTINED,
  ]),
  [TRANSACTION_STATES.COMPLETED]: new Set([]),
  [TRANSACTION_STATES.QUARANTINED]: new Set([
    TRANSACTION_STATES.COMPLETED,
  ]),
});

/**
 * Deterministic in-memory world dynamic property adapter for tests or fallback.
 */
export class InMemoryWorldPropertyAdapter {
  constructor(initialProperties = {}) {
    this._props = new Map(Object.entries(initialProperties));
    this.writeCount = 0;
    this.readCount = 0;
  }

  getDynamicProperty(key) {
    this.readCount += 1;
    return this._props.get(String(key));
  }

  setDynamicProperty(key, value) {
    this.writeCount += 1;
    const k = String(key);
    if (value === undefined || value === null) {
      this._props.delete(k);
    } else {
      if (typeof value === 'string' && value.length > 32767) {
        throw new RangeError(`Bedrock dynamic property string exceeds 32767 limit (${value.length} chars) for ${k}`);
      }
      this._props.set(k, value);
    }
  }

  getDynamicPropertyIds() {
    return [...this._props.keys()];
  }

  clearDynamicProperties() {
    this._props.clear();
  }

  snapshot() {
    return Object.fromEntries(this._props.entries());
  }
}

export function normalizeDimensionId(dimension) {
  if (!dimension) return 'minecraft:the_end';
  if (typeof dimension === 'string') {
    return dimension.includes(':') ? dimension : `minecraft:${dimension}`;
  }
  if (typeof dimension === 'object' && typeof dimension.id === 'string') {
    return dimension.id.includes(':') ? dimension.id : `minecraft:${dimension.id}`;
  }
  return 'minecraft:the_end';
}

export function normalizeBlockAnchor(anchor) {
  if (!anchor || typeof anchor !== 'object') {
    throw new TypeError(`Invalid block anchor: ${JSON.stringify(anchor)}`);
  }
  const x = Math.floor(Number(anchor.x));
  const y = Math.floor(Number(anchor.y));
  const z = Math.floor(Number(anchor.z));
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    throw new TypeError(`Block anchor coordinates must be finite numbers: ${JSON.stringify(anchor)}`);
  }
  return { x, y, z };
}

export function formatAnchorKey(dimension, anchor) {
  const dim = normalizeDimensionId(dimension);
  const pos = normalizeBlockAnchor(anchor);
  return `${dim}@${pos.x},${pos.y},${pos.z}`;
}

export function computeShardCoords(anchor, shardShift = DEFAULT_REGION_SHARD_SHIFT) {
  const pos = normalizeBlockAnchor(anchor);
  return {
    regionX: pos.x >> shardShift,
    regionZ: pos.z >> shardShift,
  };
}

export function formatShardId(dimension, regionX, regionZ) {
  const dim = normalizeDimensionId(dimension);
  return `${dim}:${Math.floor(regionX)}:${Math.floor(regionZ)}`;
}

export function computeShardIdForAnchor(dimension, anchor, shardShift = DEFAULT_REGION_SHARD_SHIFT) {
  const { regionX, regionZ } = computeShardCoords(anchor, shardShift);
  return formatShardId(dimension, regionX, regionZ);
}

function cloneJson(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

/**
 * Versioned, region-sharded persistence store (`schemaVersion: 1`) backed by
 * Bedrock world dynamic properties with safe string chunking, bounded LRU shard
 * cache, dirty tracking, station generation IDs, and transaction receipts.
 */
export class PersistenceStore {
  constructor(options = {}) {
    this.world = options.world ?? new InMemoryWorldPropertyAdapter();
    this.namespace = options.namespace ?? 'betterend:store:v1';
    this.schemaVersion = PERSISTENCE_SCHEMA_VERSION;
    this.maxChunkChars = options.maxChunkChars ?? DEFAULT_CHUNK_MAX_CHARS;
    this.maxCachedShards = options.maxCachedShards ?? DEFAULT_MAX_CACHED_SHARDS;
    this.shardShift = options.shardShift ?? DEFAULT_REGION_SHARD_SHIFT;
    this.autoFlush = options.autoFlush ?? true;
    this.clock = options.clock ?? (() => Date.now());

    if (this.maxChunkChars < 64 || this.maxChunkChars > 32000) {
      throw new RangeError(`maxChunkChars must be between 64 and 32000; got ${this.maxChunkChars}`);
    }
    if (this.maxCachedShards < 1) {
      throw new RangeError(`maxCachedShards must be >= 1; got ${this.maxCachedShards}`);
    }

    // LRU map: shardId -> shardData (insertion order tracks recency)
    this._shardCache = new Map();
    this._dirtyShards = new Set();
    this._metaDirty = false;
    this._evictionCount = 0;

    this._meta = this._loadOrInitMeta();
  }

  _metaKey() {
    return `${this.namespace}:meta`;
  }

  _shardKeyPrefix(shardId) {
    return `${this.namespace}:shard:${shardId}`;
  }

  _writeChunkedProperty(baseKey, payloadObj) {
    const serialized = JSON.stringify(payloadObj);
    const totalChunks = Math.max(1, Math.ceil(serialized.length / this.maxChunkChars));
    const prevManifestRaw = this.world.getDynamicProperty(`${baseKey}:manifest`);
    let prevChunks = 0;
    if (typeof prevManifestRaw === 'string') {
      try {
        const parsed = JSON.parse(prevManifestRaw);
        prevChunks = Number(parsed.chunks) || 0;
      } catch {
        prevChunks = 0;
      }
    }

    for (let i = 0; i < totalChunks; i += 1) {
      const slice = serialized.slice(i * this.maxChunkChars, (i + 1) * this.maxChunkChars);
      this.world.setDynamicProperty(`${baseKey}:c${i}`, slice);
    }

    for (let i = totalChunks; i < prevChunks; i += 1) {
      this.world.setDynamicProperty(`${baseKey}:c${i}`, undefined);
    }

    this.world.setDynamicProperty(
      `${baseKey}:manifest`,
      JSON.stringify({
        schemaVersion: this.schemaVersion,
        chunks: totalChunks,
        length: serialized.length,
        updatedAt: this.clock(),
      }),
    );
  }

  _readChunkedProperty(baseKey) {
    const manifestRaw = this.world.getDynamicProperty(`${baseKey}:manifest`);
    if (typeof manifestRaw !== 'string' || manifestRaw.length === 0) {
      return null;
    }
    const manifest = JSON.parse(manifestRaw);
    if (manifest.schemaVersion !== this.schemaVersion) {
      throw new Error(
        `Unsupported persistence schemaVersion ${manifest.schemaVersion} at ${baseKey} (expected ${this.schemaVersion})`,
      );
    }
    const chunks = Number(manifest.chunks) || 0;
    let combined = '';
    for (let i = 0; i < chunks; i += 1) {
      const part = this.world.getDynamicProperty(`${baseKey}:c${i}`);
      if (typeof part !== 'string') {
        throw new Error(`Corrupted chunked dynamic property ${baseKey}: missing chunk c${i} of ${chunks}`);
      }
      combined += part;
    }
    return JSON.parse(combined);
  }

  _loadOrInitMeta() {
    const existing = this._readChunkedProperty(this._metaKey());
    if (existing) {
      return {
        schemaVersion: existing.schemaVersion ?? this.schemaVersion,
        nextGenerationCounter: Number(existing.nextGenerationCounter) || 1,
        nextTransactionCounter: Number(existing.nextTransactionCounter) || 1,
        knownShards: Array.isArray(existing.knownShards) ? [...new Set(existing.knownShards)] : [],
        txShardIndex: existing.txShardIndex && typeof existing.txShardIndex === 'object'
          ? { ...existing.txShardIndex }
          : {},
        anchorGenerations: existing.anchorGenerations && typeof existing.anchorGenerations === 'object'
          ? { ...existing.anchorGenerations }
          : {},
        globalData: existing.globalData && typeof existing.globalData === 'object'
          ? { ...existing.globalData }
          : {},
      };
    }
    const fresh = {
      schemaVersion: this.schemaVersion,
      nextGenerationCounter: 1,
      nextTransactionCounter: 1,
      knownShards: [],
      txShardIndex: {},
      anchorGenerations: {},
      globalData: {},
    };
    this._metaDirty = true;
    if (this.autoFlush) {
      this._writeChunkedProperty(this._metaKey(), fresh);
      this._metaDirty = false;
    }
    return fresh;
  }

  _touchShardInLru(shardId, shard) {
    if (this._shardCache.has(shardId)) {
      this._shardCache.delete(shardId);
    }
    this._shardCache.set(shardId, shard);
    this._enforceLruBound(shardId);
  }

  _enforceLruBound(protectedShardId = null) {
    while (this._shardCache.size > this.maxCachedShards) {
      let candidateId = null;
      for (const key of this._shardCache.keys()) {
        if (key !== protectedShardId) {
          candidateId = key;
          break;
        }
      }
      if (!candidateId) break;
      if (this._dirtyShards.has(candidateId)) {
        const dirtyShard = this._shardCache.get(candidateId);
        this._writeChunkedProperty(this._shardKeyPrefix(candidateId), dirtyShard);
        this._dirtyShards.delete(candidateId);
      }
      this._shardCache.delete(candidateId);
      this._evictionCount += 1;
    }
  }

  _createEmptyShard(shardId) {
    return {
      schemaVersion: this.schemaVersion,
      shardId,
      revision: 0,
      stations: {},
      retiredStations: [],
      transactions: {},
      regionData: {},
      entities: {},
    };
  }

  loadShard(shardId) {
    if (this._shardCache.has(shardId)) {
      const cached = this._shardCache.get(shardId);
      this._touchShardInLru(shardId, cached);
      return cached;
    }
    const stored = this._readChunkedProperty(this._shardKeyPrefix(shardId));
    const shard = stored
      ? {
          schemaVersion: stored.schemaVersion ?? this.schemaVersion,
          shardId,
          revision: Number(stored.revision) || 0,
          stations: stored.stations ?? {},
          retiredStations: Array.isArray(stored.retiredStations) ? stored.retiredStations : [],
          transactions: stored.transactions ?? {},
          regionData: stored.regionData ?? {},
          entities: stored.entities ?? {},
        }
      : this._createEmptyShard(shardId);

    if (!this._meta.knownShards.includes(shardId)) {
      this._meta.knownShards.push(shardId);
      this._metaDirty = true;
    }
    this._touchShardInLru(shardId, shard);
    return shard;
  }

  _markShardDirty(shardId) {
    const shard = this.loadShard(shardId);
    shard.revision += 1;
    this._dirtyShards.add(shardId);
    if (!this._meta.knownShards.includes(shardId)) {
      this._meta.knownShards.push(shardId);
      this._metaDirty = true;
    }
    if (this.autoFlush) {
      this.flush();
    }
  }

  flush() {
    let flushedShards = 0;
    for (const shardId of [...this._dirtyShards]) {
      const shard = this._shardCache.get(shardId);
      if (shard) {
        this._writeChunkedProperty(this._shardKeyPrefix(shardId), shard);
        flushedShards += 1;
      }
      this._dirtyShards.delete(shardId);
    }
    if (this._metaDirty || flushedShards > 0) {
      this._writeChunkedProperty(this._metaKey(), this._meta);
      this._metaDirty = false;
    }
    return { flushedShards, schemaVersion: this.schemaVersion };
  }

  isDirty() {
    return this._dirtyShards.size > 0 || this._metaDirty;
  }

  getStats() {
    return {
      schemaVersion: this.schemaVersion,
      cachedShardCount: this._shardCache.size,
      maxCachedShards: this.maxCachedShards,
      dirtyShardCount: this._dirtyShards.size,
      knownShardCount: this._meta.knownShards.length,
      evictionCount: this._evictionCount,
      nextGenerationCounter: this._meta.nextGenerationCounter,
      nextTransactionCounter: this._meta.nextTransactionCounter,
    };
  }

  getCachedShardIds() {
    return [...this._shardCache.keys()];
  }

  setGlobalRecord(key, value) {
    this._meta.globalData[String(key)] = cloneJson(value);
    this._metaDirty = true;
    if (this.autoFlush) {
      this.flush();
    }
  }

  getGlobalRecord(key, fallback = null) {
    const k = String(key);
    if (!Object.hasOwn(this._meta.globalData, k)) return fallback;
    return cloneJson(this._meta.globalData[k]);
  }

  setRegionRecord(dimension, regionX, regionZ, key, value) {
    const shardId = formatShardId(dimension, regionX, regionZ);
    const shard = this.loadShard(shardId);
    shard.regionData[String(key)] = cloneJson(value);
    this._markShardDirty(shardId);
    return cloneJson(shard.regionData[String(key)]);
  }

  getRegionRecord(dimension, regionX, regionZ, key, fallback = null) {
    const shardId = formatShardId(dimension, regionX, regionZ);
    const shard = this.loadShard(shardId);
    if (!Object.hasOwn(shard.regionData, String(key))) return fallback;
    return cloneJson(shard.regionData[String(key)]);
  }

  /**
   * Registers or places a station at `(dimension, anchor)`, assigning a unique,
   * strictly monotonic `generationId` so breaking and rebuilding at the same
   * block coordinate never resurrects stale transactions.
   */
  registerStation({ dimension = 'minecraft:the_end', anchor, stationType, state = {}, metadata = {} }) {
    if (typeof stationType !== 'string' || stationType.length === 0) {
      throw new Error('registerStation requires a non-empty stationType');
    }
    const normDim = normalizeDimensionId(dimension);
    const normAnchor = normalizeBlockAnchor(anchor);
    const anchorKey = formatAnchorKey(normDim, normAnchor);
    const shardId = computeShardIdForAnchor(normDim, normAnchor, this.shardShift);
    const shard = this.loadShard(shardId);

    // If a station already existed at this anchor, retire it and quarantine any in-flight transaction
    const existing = shard.stations[anchorKey];
    if (existing) {
      this._retireStationInternal(shard, existing, 'superseded_by_new_station_placement');
    }

    const prevCoordGen = Number(this._meta.anchorGenerations[anchorKey]) || 0;
    const coordGen = prevCoordGen + 1;
    this._meta.anchorGenerations[anchorKey] = coordGen;

    const globalGen = this._meta.nextGenerationCounter;
    this._meta.nextGenerationCounter += 1;
    this._metaDirty = true;

    const generationId = `gen_${globalGen}_c${coordGen}`;
    const stationId = `${stationType}@${anchorKey}#${generationId}`;

    const record = {
      schemaVersion: this.schemaVersion,
      stationId,
      stationType,
      dimension: normDim,
      anchor: normAnchor,
      anchorKey,
      shardId,
      generationId,
      coordinateGeneration: coordGen,
      globalGeneration: globalGen,
      activeTransactionId: null,
      lockEpoch: 0,
      lockedBy: null,
      state: cloneJson(state),
      metadata: cloneJson(metadata),
      createdAt: this.clock(),
      updatedAt: this.clock(),
    };

    shard.stations[anchorKey] = record;
    this._markShardDirty(shardId);
    return cloneJson(record);
  }

  _retireStationInternal(shard, stationRecord, reason) {
    if (stationRecord.activeTransactionId) {
      const tx = shard.transactions[stationRecord.activeTransactionId];
      if (tx && tx.state !== TRANSACTION_STATES.COMPLETED && tx.state !== TRANSACTION_STATES.QUARANTINED) {
        tx.state = TRANSACTION_STATES.QUARANTINED;
        tx.quarantineReason = reason;
        tx.quarantinedAt = this.clock();
        tx.updatedAt = this.clock();
      }
    }
    shard.retiredStations.push({
      stationId: stationRecord.stationId,
      generationId: stationRecord.generationId,
      anchorKey: stationRecord.anchorKey,
      stationType: stationRecord.stationType,
      retiredReason: reason,
      retiredAt: this.clock(),
    });
    if (shard.retiredStations.length > 64) {
      shard.retiredStations.splice(0, shard.retiredStations.length - 64);
    }
  }

  /**
   * Breaks/removes the station at `(dimension, anchor)`. Any in-progress
   * transaction bound to this station generation is quarantined immediately.
   */
  breakStation({ dimension = 'minecraft:the_end', anchor, reason = 'station_broken' }) {
    const normDim = normalizeDimensionId(dimension);
    const normAnchor = normalizeBlockAnchor(anchor);
    const anchorKey = formatAnchorKey(normDim, normAnchor);
    const shardId = computeShardIdForAnchor(normDim, normAnchor, this.shardShift);
    const shard = this.loadShard(shardId);
    const existing = shard.stations[anchorKey];
    if (!existing) {
      return null;
    }
    this._retireStationInternal(shard, existing, reason);
    delete shard.stations[anchorKey];
    this._markShardDirty(shardId);
    return cloneJson(existing);
  }

  /**
   * Retrieves the active station at `(dimension, anchor)`.
   * If `generationId` is supplied, validates that the live station matches that
   * exact generation (returning `null` if it was broken or replaced).
   */
  getStation({ dimension = 'minecraft:the_end', anchor, generationId = null }) {
    const normDim = normalizeDimensionId(dimension);
    const normAnchor = normalizeBlockAnchor(anchor);
    const anchorKey = formatAnchorKey(normDim, normAnchor);
    const shardId = computeShardIdForAnchor(normDim, normAnchor, this.shardShift);
    const shard = this.loadShard(shardId);
    const station = shard.stations[anchorKey];
    if (!station) return null;
    if (generationId !== null && station.generationId !== generationId) {
      return null;
    }
    return cloneJson(station);
  }

  /**
   * Updates the state of a live station only if `generationId` matches.
   * Throws an error if a stale generation attempts to mutate a rebuilt station.
   */
  updateStationState({ dimension = 'minecraft:the_end', anchor, generationId, statePatch = {}, metadataPatch = null }) {
    const normDim = normalizeDimensionId(dimension);
    const normAnchor = normalizeBlockAnchor(anchor);
    const anchorKey = formatAnchorKey(normDim, normAnchor);
    const shardId = computeShardIdForAnchor(normDim, normAnchor, this.shardShift);
    const shard = this.loadShard(shardId);
    const station = shard.stations[anchorKey];
    if (!station) {
      throw new Error(`No active station at ${anchorKey}`);
    }
    if (generationId && station.generationId !== generationId) {
      throw new Error(
        `Stale station generation ${generationId} cannot mutate ${anchorKey} (current generation is ${station.generationId})`,
      );
    }
    station.state = {
      ...station.state,
      ...cloneJson(statePatch),
    };
    if (metadataPatch && typeof metadataPatch === 'object') {
      station.metadata = {
        ...station.metadata,
        ...cloneJson(metadataPatch),
      };
    }
    station.updatedAt = this.clock();
    this._markShardDirty(shardId);
    return cloneJson(station);
  }

  /**
   * Begins a durable station transaction in `preparing` state.
   * Rejects stale `generationId` references so rebuilt stations never resurrect
   * old transactions.
   */
  beginTransaction({
    dimension = 'minecraft:the_end',
    anchor,
    generationId,
    stationType = null,
    recipeId,
    inputs = [],
    expectedOutputs = [],
    participants = [],
    actor = null,
  }) {
    const normDim = normalizeDimensionId(dimension);
    const normAnchor = normalizeBlockAnchor(anchor);
    const anchorKey = formatAnchorKey(normDim, normAnchor);
    const shardId = computeShardIdForAnchor(normDim, normAnchor, this.shardShift);
    const shard = this.loadShard(shardId);
    const station = shard.stations[anchorKey];

    if (!station) {
      throw new Error(`Cannot begin transaction at ${anchorKey}: station does not exist`);
    }
    if (!generationId || station.generationId !== generationId) {
      throw new Error(
        `Stale station generation ${generationId} rejected at ${anchorKey} (active is ${station.generationId})`,
      );
    }
    if (station.activeTransactionId) {
      const currentTx = shard.transactions[station.activeTransactionId];
      if (
        currentTx &&
        currentTx.state !== TRANSACTION_STATES.COMPLETED &&
        currentTx.state !== TRANSACTION_STATES.QUARANTINED
      ) {
        throw new Error(
          `Station ${station.stationId} already has an active transaction ${station.activeTransactionId} (${currentTx.state})`,
        );
      }
    }

    const txNum = this._meta.nextTransactionCounter;
    this._meta.nextTransactionCounter += 1;
    const txId = `tx_${txNum}_${generationId}`;
    this._meta.txShardIndex[txId] = shardId;
    this._metaDirty = true;

    station.lockEpoch += 1;
    const receipt = {
      schemaVersion: this.schemaVersion,
      txId,
      stationId: station.stationId,
      stationType: stationType ?? station.stationType,
      dimension: normDim,
      anchor: normAnchor,
      anchorKey,
      shardId,
      generationId: station.generationId,
      lockEpoch: station.lockEpoch,
      recipeId: String(recipeId ?? 'unknown'),
      actor: actor ? String(actor) : null,
      state: TRANSACTION_STATES.PREPARING,
      revision: 1,
      inputs: cloneJson(inputs),
      inputReceipts: [],
      expectedOutputs: cloneJson(expectedOutputs),
      pendingOutputs: [],
      outputReceipts: [],
      participants: cloneJson(participants),
      progress: 0,
      quarantineReason: null,
      quarantineEvidence: null,
      history: [
        {
          state: TRANSACTION_STATES.PREPARING,
          timestamp: this.clock(),
        },
      ],
      createdAt: this.clock(),
      updatedAt: this.clock(),
    };

    shard.transactions[txId] = receipt;
    station.activeTransactionId = txId;
    station.updatedAt = this.clock();
    this._markShardDirty(shardId);
    return cloneJson(receipt);
  }

  _getMutableTransaction(txId) {
    const shardId = this._meta.txShardIndex[txId];
    if (!shardId) {
      throw new Error(`Unknown transaction ID: ${txId}`);
    }
    const shard = this.loadShard(shardId);
    const tx = shard.transactions[txId];
    if (!tx) {
      throw new Error(`Transaction ${txId} missing from shard ${shardId}`);
    }
    return { shardId, shard, tx };
  }

  _verifyStationGenerationForTx(shard, tx) {
    const station = shard.stations[tx.anchorKey];
    if (!station || station.generationId !== tx.generationId) {
      tx.state = TRANSACTION_STATES.QUARANTINED;
      tx.quarantineReason = 'station_generation_mismatch';
      tx.quarantineEvidence = {
        expectedGenerationId: tx.generationId,
        actualGenerationId: station?.generationId ?? null,
      };
      tx.revision += 1;
      tx.updatedAt = this.clock();
      tx.history.push({
        state: TRANSACTION_STATES.QUARANTINED,
        reason: 'station_generation_mismatch',
        timestamp: this.clock(),
      });
      this._markShardDirty(tx.shardId);
      throw new Error(
        `Transaction ${tx.txId} quarantined: station generation mismatch (${tx.generationId} vs ${station?.generationId ?? 'none'})`,
      );
    }
    return station;
  }

  _transitionTransaction(txId, targetState, patch = {}) {
    if (!VALID_TX_STATES.has(targetState)) {
      throw new Error(`Invalid transaction target state: ${targetState}`);
    }
    const { shardId, shard, tx } = this._getMutableTransaction(txId);
    const allowed = ALLOWED_TX_TRANSITIONS[tx.state];
    if (!allowed || !allowed.has(targetState)) {
      throw new Error(`Illegal transaction state transition for ${txId}: ${tx.state} -> ${targetState}`);
    }

    if (targetState !== TRANSACTION_STATES.QUARANTINED) {
      this._verifyStationGenerationForTx(shard, tx);
    }

    tx.state = targetState;
    tx.revision += 1;
    tx.updatedAt = this.clock();

    if (patch.inputReceipts !== undefined) tx.inputReceipts = cloneJson(patch.inputReceipts);
    if (patch.pendingOutputs !== undefined) tx.pendingOutputs = cloneJson(patch.pendingOutputs);
    if (patch.outputReceipts !== undefined) tx.outputReceipts = cloneJson(patch.outputReceipts);
    if (patch.progress !== undefined) tx.progress = Number(patch.progress) || 0;
    if (patch.quarantineReason !== undefined) tx.quarantineReason = patch.quarantineReason;
    if (patch.quarantineEvidence !== undefined) tx.quarantineEvidence = cloneJson(patch.quarantineEvidence);

    tx.history.push({
      state: targetState,
      reason: patch.quarantineReason ?? null,
      timestamp: this.clock(),
    });

    const station = shard.stations[tx.anchorKey];
    if (station && station.activeTransactionId === txId) {
      if (targetState === TRANSACTION_STATES.COMPLETED) {
        station.activeTransactionId = null;
      }
      station.updatedAt = this.clock();
    }

    this._markShardDirty(shardId);
    return cloneJson(tx);
  }

  activateTransaction(txId, { inputReceipts = [] } = {}) {
    return this._transitionTransaction(txId, TRANSACTION_STATES.ACTIVE, { inputReceipts });
  }

  updateTransactionProgress(txId, progress) {
    const { shardId, shard, tx } = this._getMutableTransaction(txId);
    this._verifyStationGenerationForTx(shard, tx);
    if (tx.state !== TRANSACTION_STATES.ACTIVE) {
      throw new Error(`Cannot update progress on transaction ${txId} in state ${tx.state}`);
    }
    tx.progress = Number(progress) || 0;
    tx.revision += 1;
    tx.updatedAt = this.clock();
    this._markShardDirty(shardId);
    return cloneJson(tx);
  }

  markCompleting(txId, { pendingOutputs = [] } = {}) {
    return this._transitionTransaction(txId, TRANSACTION_STATES.COMPLETING, { pendingOutputs });
  }

  commitTransaction(txId, { outputReceipts = [] } = {}) {
    return this._transitionTransaction(txId, TRANSACTION_STATES.COMPLETED, { outputReceipts });
  }

  quarantineTransaction(txId, reason = 'interrupted', evidence = null) {
    const { shardId, shard, tx } = this._getMutableTransaction(txId);
    if (tx.state === TRANSACTION_STATES.COMPLETED) {
      throw new Error(`Cannot quarantine already completed transaction ${txId}`);
    }
    tx.state = TRANSACTION_STATES.QUARANTINED;
    tx.quarantineReason = String(reason);
    tx.quarantineEvidence = cloneJson(evidence);
    tx.revision += 1;
    tx.updatedAt = this.clock();
    tx.history.push({
      state: TRANSACTION_STATES.QUARANTINED,
      reason: String(reason),
      timestamp: this.clock(),
    });
    this._markShardDirty(shardId);
    return cloneJson(tx);
  }

  getTransaction(txId) {
    const shardId = this._meta.txShardIndex[txId];
    if (!shardId) return null;
    const shard = this.loadShard(shardId);
    const tx = shard.transactions[txId];
    return tx ? cloneJson(tx) : null;
  }

  listTransactions({ state = null, anchor = null, dimension = null } = {}) {
    const results = [];
    for (const shardId of [...this._meta.knownShards]) {
      const shard = this.loadShard(shardId);
      for (const tx of Object.values(shard.transactions)) {
        if (state && tx.state !== state) continue;
        if (dimension && tx.dimension !== normalizeDimensionId(dimension)) continue;
        if (anchor) {
          const normAnchor = normalizeBlockAnchor(anchor);
          if (tx.anchor.x !== normAnchor.x || tx.anchor.y !== normAnchor.y || tx.anchor.z !== normAnchor.z) {
            continue;
          }
        }
        results.push(cloneJson(tx));
      }
    }
    return results;
  }

  /**
   * Explicit crash / interruption quarantine recovery across all shards.
   * Scans any non-completed transactions (`preparing`, `active`, `completing`)
   * left behind by an unclean stop, chunk unload, or broken participant, and
   * moves them to `quarantined` so they never mint duplicate outputs or
   * silently lose items.
   */
  recoverInterruptedTransactions({ verifyPhysicalState = null } = {}) {
    const quarantined = [];
    for (const shardId of [...this._meta.knownShards]) {
      const shard = this.loadShard(shardId);
      let shardModified = false;

      for (const tx of Object.values(shard.transactions)) {
        if (tx.state === TRANSACTION_STATES.COMPLETED || tx.state === TRANSACTION_STATES.QUARANTINED) {
          continue;
        }
        const station = shard.stations[tx.anchorKey];
        let reason = `crash_or_interruption_in_${tx.state}`;
        let evidence = {
          priorState: tx.state,
          progress: tx.progress,
          stationGenerationMatches: Boolean(station && station.generationId === tx.generationId),
        };

        if (typeof verifyPhysicalState === 'function') {
          const check = verifyPhysicalState(cloneJson(tx), station ? cloneJson(station) : null);
          if (check && typeof check === 'object') {
            if (check.reason) reason = String(check.reason);
            evidence = { ...evidence, ...check };
          }
        }

        tx.state = TRANSACTION_STATES.QUARANTINED;
        tx.quarantineReason = reason;
        tx.quarantineEvidence = cloneJson(evidence);
        tx.revision += 1;
        tx.updatedAt = this.clock();
        tx.history.push({
          state: TRANSACTION_STATES.QUARANTINED,
          reason,
          timestamp: this.clock(),
        });
        shardModified = true;
        quarantined.push(cloneJson(tx));
      }

      if (shardModified) {
        this._markShardDirty(shardId);
      }
    }
    return quarantined;
  }

  /**
   * Explicitly resolves a quarantined transaction after operator/recovery
   * inspection (e.g. refunding inputs or clearing lock), transitioning it to
   * `completed` and unlocking the station if generations match.
   */
  resolveQuarantinedTransaction(txId, { resolution = 'inputs_refunded', outputReceipts = [] } = {}) {
    const { shardId, shard, tx } = this._getMutableTransaction(txId);
    if (tx.state !== TRANSACTION_STATES.QUARANTINED) {
      throw new Error(`Transaction ${txId} is not quarantined (current state: ${tx.state})`);
    }
    tx.state = TRANSACTION_STATES.COMPLETED;
    tx.resolution = String(resolution);
    tx.outputReceipts = cloneJson(outputReceipts);
    tx.revision += 1;
    tx.updatedAt = this.clock();
    tx.history.push({
      state: TRANSACTION_STATES.COMPLETED,
      reason: `resolved:${resolution}`,
      timestamp: this.clock(),
    });

    const station = shard.stations[tx.anchorKey];
    if (station && station.activeTransactionId === txId) {
      station.activeTransactionId = null;
      station.updatedAt = this.clock();
    }

    this._markShardDirty(shardId);
    return cloneJson(tx);
  }
}

export default PersistenceStore;
