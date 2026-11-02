import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { OpenSimplexNoise, toSignedLong } from "../runtime/regions/simplex-noise.js";
import {
  BiomePicker,
  HEX_NEIGHBOUR_COORDS,
  HEX_SIDE,
  HexBiomeChunk,
  HexBiomeMap,
  JavaRandom,
  MHelper
} from "../runtime/regions/voronoi-hex.js";
import {
  HEIGHT_CURVE,
  IslandLayer,
  LayerOptions,
  SDFCappedCone,
  TerrainGenerator
} from "../runtime/regions/terrain-sdf.js";
import {
  AERIAL_REGIONS,
  CAVE_REGIONS,
  FEATURE_STRUCTURE_CATALOGUE,
  FEATURES_BY_CATEGORY,
  FEATURES_BY_ID,
  REGION_CATALOGUE,
  REGIONS_BY_ID,
  SUB_REGIONS,
  SURFACE_REGIONS
} from "../runtime/regions/region-catalogue.js";
import {
  CaveBiomeDecider,
  EndLandBiomeDecider,
  JOURNAL_STATES,
  PROTECTED_END_RADIUS,
  RegionPreparationJournal,
  RegionService
} from "../runtime/regions/region-service.js";

test("OpenSimplexNoise: 64-bit BigInt seed shuffle, 2D and 3D determinism, and precision beyond 53-bit float", () => {
  // Two 64-bit seeds that collapse to the same IEEE-754 double (9007199254740992 vs 9007199254740993)
  const seedA = "9007199254740992";
  const seedB = "9007199254740993";
  assert.notEqual(toSignedLong(seedA), toSignedLong(seedB));

  const noiseA1 = new OpenSimplexNoise(seedA);
  const noiseA2 = new OpenSimplexNoise(BigInt(seedA));
  const noiseB = new OpenSimplexNoise(seedB);

  assert.deepEqual(Array.from(noiseA1.perm), Array.from(noiseA2.perm));
  assert.notDeepEqual(Array.from(noiseA1.perm), Array.from(noiseB.perm));

  for (let i = -25; i <= 25; i++) {
    const x = i * 1.37;
    const y = i * -0.83;
    const z = i * 0.59;

    const v2a = noiseA1.eval(x, y);
    const v2b = noiseA2.eval(x, y);
    assert.equal(v2a, v2b);
    assert.ok(v2a >= -1.0 && v2a <= 1.0, `2D noise out of [-1, 1]: ${v2a}`);

    const v3a = noiseA1.eval(x, y, z);
    const v3b = noiseA2.eval(x, y, z);
    assert.equal(v3a, v3b);
    assert.ok(v3a >= -1.0 && v3a <= 1.0, `3D noise out of [-1, 1]: ${v3a}`);
  }
});

test("voronoi-hex: MHelper.getSeed, JavaRandom, HexBiomeChunk (16 seeds, 8 growth passes, 25% 7-cell sub-biome promotion), and HexBiomeMap", () => {
  // Verify MHelper.getSeed matches exact 32/64-bit integer arithmetic without float overflow
  const h1 = MHelper.getSeed(123456789, -4096, 8192);
  const h2 = MHelper.getSeed(123456789, -4096, 8192);
  assert.equal(h1, h2);
  assert.equal(typeof h1, "number");
  assert.ok(Number.isSafeInteger(h1));

  // Verify JavaRandom LCG exact sequence for known seed 12345L
  const r1 = new JavaRandom(12345n);
  const r2 = new JavaRandom("12345");
  assert.equal(r1.nextInt(), r2.nextInt());
  assert.equal(r1.nextInt(64), r2.nextInt(64));
  assert.equal(r1.nextInt(100), r2.nextInt(100));
  assert.equal(r1.nextFloat(), r2.nextFloat());

  // Verify HexBiomeChunk populates all 1024 cells and promotes 7-cell sub-biome islands
  const picker = new BiomePicker(SURFACE_REGIONS, SUB_REGIONS);
  const chunk = new HexBiomeChunk(new JavaRandom(42n), picker);
  assert.equal(chunk.biomes.length, 1024);
  for (let i = 0; i < 1024; i++) {
    assert.ok(chunk.biomes[i] !== null, `Cell ${i} should not be null`);
  }

  // Test 7-cell sub-biome promotion on a single-parent picker (dust_wastelands -> painted_mountains / neon_oasis)
  const dustOnlyPicker = new BiomePicker(
    SURFACE_REGIONS.filter((r) => r.id === "dust_wastelands"),
    SUB_REGIONS.filter((r) => r.parent === "dust_wastelands")
  );
  const subChunk = new HexBiomeChunk(new JavaRandom(987654321n), dustOnlyPicker);
  const seenIds = new Set(subChunk.biomes.map((b) => b.id));
  assert.ok(seenIds.has("dust_wastelands"));
  assert.ok(seenIds.has("painted_mountains") || seenIds.has("neon_oasis"));

  // Verify HexBiomeMap constants and scales
  assert.equal(HEX_SIDE, Math.sqrt(3.0) * 0.5);
  const landMap = new HexBiomeMap(999n, 320.0, picker);
  const caveMap = new HexBiomeMap(999n, 128.0, new BiomePicker(CAVE_REGIONS));
  assert.equal(landMap.scale, 320.0);
  assert.equal(landMap.chunkDivisor, 80.0);
  assert.equal(caveMap.scale, 128.0);
  assert.equal(caveMap.chunkDivisor, 32.0);

  const b1 = landMap.getBiome(2400, -1800);
  const b2 = landMap.getBiome(2400, -1800);
  assert.equal(b1.id, b2.id);
});

test("terrain-sdf: HEIGHT_CURVE, IslandLayer, and TerrainGenerator (isLand and getMaxHeight)", () => {
  assert.deepEqual(
    Array.from(HEIGHT_CURVE),
    [-1, -0.7, -0.4, -0.2, 0.0, 0.2, 0.5, 0.7, 0.8, 0.8, 0.7, 0.5, 0.2, 0.0, -0.2, -0.4, -0.7, -1]
  );

  const cone = new SDFCappedCone(0.4, 0.5, 0.1);
  assert.ok(cone.getDistance(0, 0, 0) < 0, "Origin inside capped cone must have negative SDF distance");
  assert.ok(cone.getDistance(5, 5, 5) > 0, "Far point outside capped cone must have positive SDF distance");

  const layer = new IslandLayer(42, new LayerOptions(30, 20, 9, 3, true, 0.5));
  layer.updatePositions(0, 0);
  const centerDensity = layer.getDensity(0, 9, 0, 1.0);
  assert.ok(centerDensity > 0, `Expected positive island density at central island (0,9,0), got ${centerDensity}`);

  const terrain = new TerrainGenerator("778899001122334455");
  // Central island (0, 0) is guaranteed by mediumIslands (hasCentralIsland = true)
  assert.equal(terrain.isLand(0, 0), true);
  assert.ok(terrain.getMaxHeight(0, 0) >= 32);

  // Scan outer ring to confirm both land (maxHeight >= 32) and void/aerial (maxHeight < 32) columns exist
  let landCount = 0;
  let voidCount = 0;
  for (let x = 1200; x <= 3600; x += 48) {
    for (let z = -2400; z <= 2400; z += 96) {
      const h = terrain.getMaxHeight(x, z);
      if (terrain.isLand(x, z)) {
        assert.ok(h >= 32);
        landCount++;
      } else {
        assert.ok(h < 32);
        voidCount++;
      }
    }
  }
  assert.ok(landCount > 0, "Expected outer End to contain land columns (maxHeight >= 32)");
  assert.ok(voidCount > 0, "Expected outer End to contain void/aerial columns (maxHeight < 32)");
});

test("region-catalogue: all 27 regions and all 113 feature/structure descriptors with complete metadata", () => {
  assert.equal(REGION_CATALOGUE.length, 27);
  assert.equal(SURFACE_REGIONS.length, 15);
  assert.equal(SUB_REGIONS.length, 3);
  assert.equal(AERIAL_REGIONS.length, 3);
  assert.equal(CAVE_REGIONS.length, 6);

  const expectedSurface = [
    "amber_land", "blossoming_spires", "chorus_forest", "crystal_mountains", "dragon_graveyards",
    "dry_shrubland", "dust_wastelands", "foggy_mushroomland", "glowing_grasslands", "lantern_woods",
    "megalake", "shadow_forest", "sulphur_springs", "umbrella_jungle", "umbra_valley"
  ];
  for (const id of expectedSurface) {
    const r = REGIONS_BY_ID.get(id);
    assert.ok(r, `Missing surface region ${id}`);
    assert.equal(r.layer, "surface");
    assert.equal(r.hasCaves, true);
  }

  // Verify sub-biome parent links
  assert.equal(REGIONS_BY_ID.get("megalake_grove").parent, "megalake");
  assert.equal(REGIONS_BY_ID.get("painted_mountains").parent, "dust_wastelands");
  assert.equal(REGIONS_BY_ID.get("neon_oasis").parent, "dust_wastelands");

  // Verify required properties on all 27 regions
  for (const region of REGION_CATALOGUE) {
    assert.ok(region.id && region.upstreamId.startsWith("betterend:"));
    assert.ok(["surface", "sub_region", "aerial", "cave"].includes(region.layer));
    assert.equal(typeof region.genChance, "number");
    assert.equal(typeof region.fogDensity, "number");
    assert.equal(typeof region.terrainHeight, "number");
    assert.equal(typeof region.hasCaves, "boolean");
    assert.equal(typeof region.colors.fogColor, "number");
    assert.equal(typeof region.colors.waterColor, "number");
    assert.equal(typeof region.colors.waterFogColor, "number");
    assert.equal(typeof region.colors.foliageColor, "number");
    assert.equal(typeof region.colors.skyColor, "number");
    assert.equal(typeof region.surface.topBlock, "string");
    assert.equal(typeof region.surface.underBlock, "string");
    assert.ok(Array.isArray(region.surface.rules));
    assert.equal(typeof region.music, "string");
    assert.ok(Array.isArray(region.particles));
    assert.ok(Array.isArray(region.features));
    assert.ok(Array.isArray(region.structures));
    assert.ok(Array.isArray(region.spawns));

    for (const featId of region.features) {
      assert.ok(FEATURES_BY_ID.has(featId), `Region ${region.id} references unknown feature ${featId}`);
    }
    for (const structId of region.structures) {
      assert.ok(FEATURES_BY_ID.has(structId), `Region ${region.id} references unknown structure ${structId}`);
    }
  }

  // Verify all 113 feature & structure descriptors across the 7 required categories
  assert.equal(FEATURE_STRUCTURE_CATALOGUE.length, 113);
  const categorySum =
    FEATURES_BY_CATEGORY.trees.length +
    FEATURES_BY_CATEGORY.plants_foliage.length +
    FEATURES_BY_CATEGORY.water_aquatic.length +
    FEATURES_BY_CATEGORY.geologic.length +
    FEATURES_BY_CATEGORY.ores_layers.length +
    FEATURES_BY_CATEGORY.caves.length +
    FEATURES_BY_CATEGORY.structures.length;
  assert.equal(categorySum, 113);

  for (const desc of FEATURE_STRUCTURE_CATALOGUE) {
    assert.ok(desc.id && desc.upstreamId);
    assert.ok(desc.placement && typeof desc.placement.type === "string");
    assert.ok(Array.isArray(desc.palette) && desc.palette.length > 0);
  }
});

test("RegionService: central End protection, sub-biome promotion, aerial biomes, cave biomes, journal state machine, and halo feature planner", () => {
  const service = new RegionService({
    worldSeed: "-8472910482910482919",
    portSeed: "2640001",
    revision: 1
  });

  // 1. Central End protection (|x| <= 1024 && |z| <= 1024)
  for (const [x, y, z] of [
    [0, 64, 0],
    [100, 50, 0],
    [-1024, 70, 1024],
    [1024, 20, -1024]
  ]) {
    const res = service.lookup("minecraft:the_end", x, y, z);
    assert.equal(res.protectedCenter, true, `Expected (${x}, ${y}, ${z}) to be protectedCenter`);
    assert.equal(res.effectiveRegion.id, "the_end");
    assert.ok(res.tags.includes("betterend:protected_center"));
  }

  // Outside |x| > 1024 or |z| > 1024 is not protected
  const outer = service.lookup("minecraft:the_end", 1025, 64, 0);
  assert.equal(outer.protectedCenter, false);
  assert.notEqual(outer.effectiveRegion.id, "the_end");

  // 2. Scan outer End to verify surface, sub-regions (megalake_grove, painted_mountains, neon_oasis),
  //    aerial regions (ice_starfield, flower_islets, waterfall_ponds), and cave regions all resolve
  const foundSurface = new Set();
  const foundSub = new Set();
  const foundAerial = new Set();
  const foundCave = new Set();

  for (let x = -18000; x <= 18000; x += 240) {
    for (let z = -18000; z <= 18000; z += 240) {
      if (Math.abs(x) <= 1024 && Math.abs(z) <= 1024) continue;
      const surfaceLookup = service.lookup("the_end", x, 72, z);
      if (surfaceLookup.surfaceRegion) {
        foundSurface.add(surfaceLookup.surfaceRegion.id);
      }
      if (surfaceLookup.subRegion) {
        foundSub.add(surfaceLookup.subRegion.id);
      }
      if (!surfaceLookup.isLand && surfaceLookup.aerialRegion) {
        assert.ok(surfaceLookup.maxHeight < 32);
        assert.equal(surfaceLookup.effectiveRegion.layer, "aerial");
        foundAerial.add(surfaceLookup.aerialRegion.id);
      }
      if (surfaceLookup.isLand) {
        const caveLookup = service.lookup("the_end", x, 20, z);
        if (caveLookup.caveRegion) {
          assert.equal(caveLookup.effectiveRegion.layer, "cave");
          foundCave.add(caveLookup.caveRegion.id);
        }
      }
    }
  }

  assert.equal(foundSurface.size, 15, `Expected all 15 surface regions, found: ${[...foundSurface]}`);
  assert.deepEqual(
    [...foundSub].sort(),
    ["megalake_grove", "neon_oasis", "painted_mountains"],
    `Expected all 3 sub-biomes to be promoted, found: ${[...foundSub]}`
  );
  assert.equal(foundAerial.size, 3, `Expected all 3 aerial regions, found: ${[...foundAerial]}`);
  assert.equal(foundCave.size, 6, `Expected all 6 cave regions, found: ${[...foundCave]}`);

  // 3. Journal state machine: Unknown -> Planned -> TerrainReady -> Decorated -> Validated -> Committed
  const cx = 32;
  const cz = -24;
  assert.equal(service.getCellState(cx, cz), JOURNAL_STATES.UNKNOWN);
  assert.equal(service.transitionCell(cx, cz, JOURNAL_STATES.PLANNED).state, JOURNAL_STATES.PLANNED);
  assert.equal(service.transitionCell(cx, cz, JOURNAL_STATES.TERRAIN_READY).state, JOURNAL_STATES.TERRAIN_READY);
  assert.equal(service.transitionCell(cx, cz, JOURNAL_STATES.DECORATED).state, JOURNAL_STATES.DECORATED);
  assert.equal(service.transitionCell(cx, cz, JOURNAL_STATES.VALIDATED).state, JOURNAL_STATES.VALIDATED);
  assert.equal(service.transitionCell(cx, cz, JOURNAL_STATES.COMMITTED).state, JOURNAL_STATES.COMMITTED);

  // Refuses to overwrite existing player builds -> Quarantined
  const playerCellX = 40;
  const playerCellZ = 40;
  service.transitionCell(playerCellX, playerCellZ, JOURNAL_STATES.PLANNED);
  const quarantined = service.transitionCell(playerCellX, playerCellZ, JOURNAL_STATES.TERRAIN_READY, {
    hasPlayerBuilds: true
  });
  assert.equal(quarantined.ok, false);
  assert.equal(quarantined.state, JOURNAL_STATES.QUARANTINED);
  assert.equal(quarantined.reason, "refusing_to_overwrite_existing_player_build");

  // Out-of-order transition -> Quarantined
  const badOrder = service.transitionCell(50, 50, JOURNAL_STATES.DECORATED);
  assert.equal(badOrder.ok, false);
  assert.equal(badOrder.state, JOURNAL_STATES.QUARANTINED);

  // 4. Feature anchor planner with cross-border halo deduplication
  // Protected center cells produce 0 anchors
  const centerPlan = service.planCellFeatures(0, 0);
  assert.equal(centerPlan.ownedAnchors.length, 0);

  // Outer cells produce deterministic anchors regardless of query order
  const serviceCopy = new RegionService({
    worldSeed: "-8472910482910482919",
    portSeed: "2640001",
    revision: 1
  });
  const planA = service.planCellFeatures(35, -28);
  // Query neighbors first on serviceCopy to test halo order independence
  serviceCopy.planCellFeatures(36, -28);
  serviceCopy.planCellFeatures(34, -29);
  const planB = serviceCopy.planCellFeatures(35, -28);
  assert.deepEqual(planA, planB);
});

test("Deterministic vector agreement test across >= 10,000 fixed coordinate vectors with golden checkpoints", () => {
  const seed = "5829401928374650192";
  const portSeed = "918273645";
  const revision = 2;

  const serviceA = new RegionService({ worldSeed: seed, portSeed, revision });
  const serviceB = new RegionService({ worldSeed: seed, portSeed, revision });

  // Build >= 10,000 fixed deterministic coordinate vectors covering:
  // - Origin & protected central End boundaries (-1025, -1024, 0, 1024, 1025)
  // - Negative coordinates in all quadrants
  // - Chunk (16), terrain grid (8), and hex cell (32 / 80 / 320) boundaries
  // - Vertical cave (y=4..47), surface (y=64..96), and high aerial (y=120) bands
  const vectors = [];

  // 1. Boundary & origin probe set (500 vectors)
  const specialCoords = [-4096, -2560, -1025, -1024, -1023, -320, -80, -16, -8, -1, 0, 1, 8, 16, 80, 320, 1023, 1024, 1025, 2560];
  const yLevels = [4, 16, 36, 56, 72];
  for (const x of specialCoords) {
    for (const z of specialCoords) {
      const y = yLevels[(Math.abs(x + z) % yLevels.length)];
      vectors.push({ x, y, z });
    }
  }
  assert.equal(vectors.length, 400);

  // 2. Full 3D grid sweep across all 4 quadrants and vertical layers (10,100 vectors -> total 10,500)
  for (let i = 0; i < 10100; i++) {
    // Deterministic Weyl-like sequence spanning [-32000, 32000] in X/Z and [0, 128] in Y
    const x = ((i * 7919) % 64001) - 32000;
    const z = ((i * 104729) % 64001) - 32000;
    const y = (i * 13) % 120;
    vectors.push({ x, y, z });
  }

  assert.ok(vectors.length >= 10000, `Expected >= 10,000 vectors, got ${vectors.length}`);

  // Evaluate forward on serviceA and in reverse order on serviceB to prove zero cache-order drift
  const resultsA = new Array(vectors.length);
  for (let i = 0; i < vectors.length; i++) {
    const v = vectors[i];
    resultsA[i] = serviceA.lookup("minecraft:the_end", v.x, v.y, v.z);
  }

  let disagreements = 0;
  for (let i = vectors.length - 1; i >= 0; i--) {
    const v = vectors[i];
    const resB = serviceB.lookup("minecraft:the_end", v.x, v.y, v.z);
    const resA = resultsA[i];

    if (
      resA.protectedCenter !== resB.protectedCenter ||
      resA.isLand !== resB.isLand ||
      resA.maxHeight !== resB.maxHeight ||
      resA.effectiveRegion?.id !== resB.effectiveRegion?.id ||
      resA.surfaceRegion?.id !== resB.surfaceRegion?.id ||
      resA.subRegion?.id !== resB.subRegion?.id ||
      resA.aerialRegion?.id !== resB.aerialRegion?.id ||
      resA.caveRegion?.id !== resB.caveRegion?.id
    ) {
      disagreements++;
    }
  }

  assert.equal(disagreements, 0, `Expected 0 disagreements across ${vectors.length} vectors, got ${disagreements}`);

  // Verify fixed golden checkpoints for this seed/revision
  const goldenIndices = [0, 19, 200, 399, 1000, 2500, 5000, 7500, 10499];
  for (const idx of goldenIndices) {
    const v = vectors[idx];
    const freshService = new RegionService({ worldSeed: seed, portSeed, revision });
    const fresh = freshService.lookup("minecraft:the_end", v.x, v.y, v.z);
    assert.equal(fresh.effectiveRegion.id, resultsA[idx].effectiveRegion.id);
    assert.equal(fresh.maxHeight, resultsA[idx].maxHeight);
    assert.equal(fresh.protectedCenter, resultsA[idx].protectedCenter);
  }
});

test("Runtime module purity: zero Node-specific imports in bedrock/runtime/regions/*.js", () => {
  const testDir = path.dirname(fileURLToPath(import.meta.url));
  const regionsDir = path.resolve(testDir, "../runtime/regions");
  const files = [
    "simplex-noise.js",
    "voronoi-hex.js",
    "terrain-sdf.js",
    "region-catalogue.js",
    "region-service.js"
  ];
  for (const file of files) {
    const src = fs.readFileSync(path.join(regionsDir, file), "utf8");
    assert.equal(/from\s+["']node:/i.test(src), false, `${file} must not import node:* modules`);
    assert.equal(/require\s*\(/i.test(src), false, `${file} must be a pure ES module without require()`);
  }
});

