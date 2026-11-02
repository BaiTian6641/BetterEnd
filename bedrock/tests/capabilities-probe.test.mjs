import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { capabilityActions, runCapabilityProbeWithEngine } from '../probes/capabilities/scripts/capabilities-core.js';
import { assertObservation } from '../tools/run-bds-probe.mjs';

const bedrockRoot = fileURLToPath(new URL('../', import.meta.url));

function createMockMinecraftEngine() {
  const blocks = new Map();
  const containers = new Map();
  const areas = new Set();
  let currentTick = 10;

  const keyFor = pos => `${Math.floor(pos.x)},${Math.floor(pos.y)},${Math.floor(pos.z)}`;

  class MockItemStack {
    constructor(typeId, amount = 1) {
      this.typeId = typeId;
      this.amount = amount;
      this.nameTag = undefined;
      this._lore = [];
      this._dyn = new Map();
      this._durability = { damage: 0, maxDurability: 432 };
      this._enchantments = new Map();
    }

    setLore(list) {
      this._lore = [...list];
    }

    getLore() {
      return [...this._lore];
    }

    setDynamicProperty(key, value) {
      this._dyn.set(String(key), value);
    }

    getDynamicProperty(key) {
      return this._dyn.get(String(key));
    }

    getComponent(id) {
      if (id === 'minecraft:durability') return this._durability;
      if (id === 'minecraft:enchantable') {
        return {
          addEnchantment: ({ type, level }) => {
            const name = typeof type === 'string' ? type : type?.id ?? 'unbreaking';
            this._enchantments.set(name, { type: { id: name }, level });
          },
          getEnchantment: name => this._enchantments.get(name) ?? null,
        };
      }
      return null;
    }

    clone() {
      const copy = new MockItemStack(this.typeId, this.amount);
      copy.nameTag = this.nameTag;
      copy._lore = [...this._lore];
      copy._dyn = new Map(this._dyn);
      copy._durability = { ...this._durability };
      copy._enchantments = new Map(this._enchantments);
      return copy;
    }
  }

  class MockContainer {
    constructor(size = 27) {
      this.size = size;
      this.slots = new Array(size).fill(undefined);
    }

    clearAll() {
      this.slots.fill(undefined);
    }

    setItem(slot, item) {
      this.slots[slot] = item ? item.clone() : undefined;
    }

    getItem(slot) {
      const item = this.slots[slot];
      return item ? item.clone() : undefined;
    }

    transferItem(fromSlot, toContainer) {
      const item = this.slots[fromSlot];
      if (!item) return null;
      for (let i = 0; i < toContainer.size; i += 1) {
        if (!toContainer.slots[i]) {
          toContainer.slots[i] = item.clone();
          this.slots[fromSlot] = undefined;
          return null;
        }
      }
      return item;
    }

    moveItem(fromSlot, toSlot, toContainer) {
      const item = this.slots[fromSlot];
      toContainer.slots[toSlot] = item ? item.clone() : undefined;
      this.slots[fromSlot] = undefined;
    }
  }

  function getOrCreateBlockRecord(pos) {
    const k = keyFor(pos);
    if (!blocks.has(k)) {
      const isOuterFeatureSample = pos.x === 2056 && pos.y === 62 && pos.z === 2056;
      const defaultType = isOuterFeatureSample
        ? 'betterend_probe:flavolite'
        : pos.y <= 62
          ? 'minecraft:end_stone'
          : 'minecraft:air';
      const defaultStates = isOuterFeatureSample ? { 'betterend_probe:finish': 'rough' } : {};
      blocks.set(k, {
        location: { x: Math.floor(pos.x), y: Math.floor(pos.y), z: Math.floor(pos.z) },
        typeId: defaultType,
        states: defaultStates,
      });
    }
    return blocks.get(k);
  }

  const dimension = {
    id: 'minecraft:the_end',
    heightRange: { min: 0, max: 256 },
    isChunkLoaded: () => true,
    getBlock(pos) {
      const rec = getOrCreateBlockRecord(pos);
      const k = keyFor(pos);
      return {
        location: rec.location,
        get typeId() {
          return rec.typeId;
        },
        get isWaterlogged() {
          return Boolean(rec.states['betterend_probe:waterlogged']);
        },
        permutation: {
          getAllStates: () => ({ ...rec.states }),
          getState: name => rec.states[name],
        },
        setType(newTypeId) {
          rec.typeId = newTypeId;
          rec.states = {};
          if (newTypeId === 'minecraft:chest' && !containers.has(k)) {
            containers.set(k, new MockContainer(27));
          }
        },
        setPermutation(perm) {
          rec.typeId = perm.typeId;
          rec.states = { ...perm.states };
        },
        getComponent(compId) {
          if (compId === 'minecraft:inventory' && rec.typeId === 'minecraft:chest') {
            if (!containers.has(k)) containers.set(k, new MockContainer(27));
            return { container: containers.get(k) };
          }
          return null;
        },
      };
    },
    getTopmostBlock({ x, z }) {
      return this.getBlock({ x, y: 62, z });
    },
    getBiome() {
      return { id: 'minecraft:the_end' };
    },
    containsBiomes(_volume, filter, isSuperset) {
      if (typeof isSuperset !== 'boolean') {
        throw new TypeError('Incorrect number of arguments to function. Expected 3, received 2');
      }
      return Boolean(
        filter?.includeBiomes?.includes('minecraft:the_end') ||
        filter?.includeTags?.includes('the_end'),
      );
    },
    spawnEntity(typeId, location) {
      const seatCount = typeId === 'betterend_probe:end_lotus_boat' ? 2 : 1;
      return {
        typeId,
        location,
        getComponent(compId) {
          if (compId === 'minecraft:rideable') {
            return { seatCount };
          }
          return null;
        },
        remove() {},
      };
    },
  };

  return {
    world: {
      seed: '2640',
      getAllPlayers: () => [],
      getDimension: () => dimension,
      tickingAreaManager: {
        hasTickingArea: name => areas.has(name),
        removeTickingArea: name => areas.delete(name),
        hasCapacity: () => true,
        createTickingArea: async name => {
          areas.add(name);
        },
      },
    },
    system: {
      get currentTick() {
        return currentTick;
      },
      runTimeout(fn, ticks = 1) {
        currentTick += ticks;
        fn();
      },
    },
    BlockPermutation: {
      resolve(typeId, states = {}) {
        return { typeId, states: { ...states } };
      },
    },
    BlockVolume: class BlockVolume {
      constructor(from, to) {
        this.from = from;
        this.to = to;
      }
    },
    BiomeTypes: {
      get(id) {
        if (id === 'minecraft:the_end' || id === 'betterend_probe:amber_land') {
          return { id };
        }
        return undefined;
      },
    },
    EnchantmentTypes: {
      get(id) {
        return { id };
      },
    },
    EntityTypes: {
      get(id) {
        if (id === 'betterend_probe:chair' || id === 'betterend_probe:end_lotus_boat') {
          return { id };
        }
        return undefined;
      },
    },
    ItemStack: MockItemStack,
  };
}

test('all 9 BDS capability probe scenarios execute cleanly against real runtime modules and pass verification', async () => {
  const mc = createMockMinecraftEngine();
  assert.equal(capabilityActions.length, 9);

  for (const action of capabilityActions) {
    const scenarioPath = path.join(bedrockRoot, 'probes/capabilities/scenarios', `${action}.json`);
    const request = JSON.parse(await readFile(scenarioPath, 'utf8'));
    request.requestId = `test-${action}`;

    const result = await runCapabilityProbeWithEngine(request, mc);
    assert.equal(result.phase, 'result');
    assert.equal(result.requestId, request.requestId);
    assert.equal(result.gateId, request.gateId);

    // Must pass the exact runner assertion hook used by run-bds-probe.mjs
    assertObservation(request, result);
  }
});
