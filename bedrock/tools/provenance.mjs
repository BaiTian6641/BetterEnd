import { open, readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  SOURCE_COMMIT, SourceJsonError, assertUniquePortablePaths, compareText, inside, portableRelativePath,
  readJsonSource, sourceFingerprint, sourceRecord, walkFiles,
} from './source-files.mjs';

const assetRoots = ['src/main/resources/assets', 'src/main/generated/assets'];

export function parseRestrictedAssets(text) {
  if (!text.includes('CC BY-NC-SA 4.0') || !text.includes('Team BetterX')) throw new Error('Unrecognized asset-license contract');
  const listed = [...text.matchAll(/^\s*\*\s+(\S+)\s*$/gmu)].map(match => portableRelativePath(match[1]));
  if (!listed.length || new Set(listed).size !== listed.length) throw new Error('Missing or duplicate restricted-asset license entries');
  return new Set(listed);
}

export function classifyLicense(sourcePath, restrictedPaths, evidence) {
  const normalized = portableRelativePath(sourcePath);
  const restricted = restrictedPaths.has(normalized);
  return {
    spdx: restricted ? 'CC-BY-NC-SA-4.0' : 'MIT',
    basis: restricted ? 'explicit-file-listing' : 'repository-license-inheritance',
    evidence: restricted ? evidence.assets : evidence.code,
    attribution: restricted ? ['Team BetterX'] : ['Copyright (c) 2020 paulevsGitch'],
    obligations: restricted ? ['attribution', 'noncommercial', 'share-alike', 'identify-modifications'] : ['retain-copyright-and-permission-notice'],
    audit: 'pending',
  };
}

export function derivedAssetProvenance(destination, contributors) {
  const target = portableRelativePath(destination);
  if (!contributors.length) throw new Error(`Derived asset has no source contributors: ${target}`);
  for (const asset of contributors) {
    if (!asset.source?.sha256 || !asset.declaredLicense?.spdx) throw new Error(`Incomplete source provenance for ${target}`);
  }
  return {
    destination: target,
    sources: contributors.map(asset => ({ path: asset.source.path, sha256: asset.source.sha256 })).sort((a, b) => compareText(a.path, b.path)),
    licenses: [...new Set(contributors.map(asset => asset.declaredLicense.spdx))].sort(compareText),
    attribution: [...new Set(contributors.flatMap(asset => asset.declaredLicense.attribution))].sort(compareText),
    obligations: [...new Set(contributors.flatMap(asset => asset.declaredLicense.obligations))].sort(compareText),
    audit: 'pending',
  };
}

export function assetKind(resourcePath) {
  const [, ...parts] = resourcePath.split('/');
  const relative = parts.join('/');
  if (relative.endsWith('/desktop.ini') || relative === 'desktop.ini') return 'non-content-metadata';
  if (relative.endsWith('.png')) return 'texture';
  if (relative.endsWith('.ogg')) return 'audio';
  if (relative.startsWith('models/')) return 'model';
  if (relative.startsWith('blockstates/')) return 'blockstate';
  if (relative.startsWith('items/')) return 'item-definition';
  if (relative.startsWith('equipment/')) return 'equipment-definition';
  if (relative.startsWith('lang/')) return 'localization';
  if (relative.startsWith('patterns/')) return 'model-template';
  if (relative.endsWith('.mcmeta')) return 'animation-metadata';
  if (relative === 'sounds.json') return 'sound-events';
  if (relative.startsWith('particles/')) return 'particle-definition';
  if (relative.startsWith('shaders/') || relative.startsWith('materials/') || relative.includes('optifine/')) return 'renderer-metadata';
  return 'other-source-asset';
}

export function proposedBinaryDestination(resourcePath) {
  const normalized = portableRelativePath(resourcePath);
  const [namespace, ...parts] = normalized.split('/');
  if (!parts.length) throw new Error(`Missing asset resource path: ${resourcePath}`);
  const relative = parts.join('/');
  if (relative.endsWith('.ogg') && parts[0] === 'sounds') return portableRelativePath(`sounds/${namespace}/${parts.slice(1).join('/')}`);
  if (!relative.endsWith('.png')) return null;
  if (parts[0] !== 'textures') return portableRelativePath(`textures/source/${namespace}/${relative}`);
  const category = { block: 'blocks', item: 'items', entity: 'entity', particle: 'particle', gui: 'ui' }[parts[1]] ?? `source/${parts[1]}`;
  return portableRelativePath(`textures/${category}/${namespace}/${parts.slice(2).join('/')}`);
}

function splitIdentifier(value) {
  const colon = value.indexOf(':');
  return colon < 0 ? ['minecraft', value] : [value.slice(0, colon), value.slice(colon + 1)];
}

function fileReference(kind, value, pointer) {
  if (value.startsWith('#')) return { kind, raw: value, pointer, resolution: 'binding' };
  if (value.includes('%')) return { kind, raw: value, pointer, resolution: 'template-parameter' };
  const [namespace, relative] = splitIdentifier(value);
  const resourcePath = kind === 'model' ? `${namespace}/models/${relative}.json`
    : kind === 'texture' ? `${namespace}/textures/${relative}.png`
      : `${namespace}/sounds/${relative}.ogg`;
  return { kind, raw: value, pointer, namespace, resourcePath };
}

export function assetReferences(kind, value) {
  const references = [];
  if (!value || typeof value !== 'object') return references;
  if (kind === 'model' || kind === 'model-template') {
    if (typeof value.parent === 'string') references.push(fileReference('model', value.parent, '/parent'));
    for (const [key, texture] of Object.entries(value.textures ?? {})) {
      if (typeof texture === 'string') references.push(fileReference('texture', texture, `/textures/${key}`));
    }
  }
  if (kind === 'blockstate' || kind === 'item-definition') {
    function visit(entry, pointer) {
      if (!entry || typeof entry !== 'object') return;
      if (typeof entry.model === 'string') references.push(fileReference('model', entry.model, `${pointer}/model`));
      if (entry.type === 'minecraft:special' && typeof entry.base === 'string') references.push(fileReference('model', entry.base, `${pointer}/base`));
      for (const [key, child] of Object.entries(entry)) if (child && typeof child === 'object') visit(child, `${pointer}/${key}`);
    }
    visit(value, '');
  }
  if (kind === 'sound-events') {
    for (const [event, definition] of Object.entries(value)) {
      for (const [index, sound] of (definition.sounds ?? []).entries()) {
        const name = typeof sound === 'string' ? sound : sound.name;
        if (typeof name !== 'string') throw new Error(`Invalid sound reference in ${event}`);
        const pointer = `/${event}/sounds/${index}`;
        if (typeof sound === 'object' && sound.type === 'event') references.push({ kind: 'sound-event', raw: name, pointer, resolution: 'event-reference' });
        else references.push(fileReference('audio', name, pointer));
      }
    }
  }
  if (kind === 'equipment-definition') {
    for (const [layer, definitions] of Object.entries(value.layers ?? {})) {
      for (const [index, definition] of definitions.entries()) {
        if (typeof definition.texture !== 'string') continue;
        const [namespace, relative] = splitIdentifier(definition.texture);
        references.push(fileReference('texture', `${namespace}:entity/equipment/${layer}/${relative}`, `/layers/${layer}/${index}/texture`));
      }
    }
  }
  if (kind === 'particle-definition') {
    for (const [index, texture] of (value.textures ?? []).entries()) {
      const [namespace, relative] = splitIdentifier(texture);
      references.push(fileReference('texture', `${namespace}:particle/${relative}`, `/textures/${index}`));
    }
  }
  return references;
}

async function pngDimensions(filePath) {
  const file = await open(filePath, 'r');
  try {
    const bytes = Buffer.alloc(24);
    const { bytesRead } = await file.read(bytes, 0, 24, 0);
    if (bytesRead !== 24 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || bytes.toString('ascii', 12, 16) !== 'IHDR') {
      throw new Error(`Invalid PNG header: ${filePath}`);
    }
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  } finally {
    await file.close();
  }
}

export async function buildProvenance(repoRoot) {
  const licenseText = await readFile(inside(repoRoot, 'LICENSE'), 'utf8');
  if (!licenseText.includes('MIT License') || !licenseText.includes('Copyright (c) 2020 paulevsGitch')) throw new Error('Unrecognized source code license');
  const assetLicenseText = await readFile(inside(repoRoot, 'LICENSE.ASSETS'), 'utf8');
  const restricted = parseRestrictedAssets(assetLicenseText);
  const evidence = { code: await sourceRecord(repoRoot, 'LICENSE'), assets: await sourceRecord(repoRoot, 'LICENSE.ASSETS') };
  const assets = [];
  const unresolved = [];
  const resources = new Map();
  const sourcePaths = new Set();
  const counts = Object.create(null);
  for (const root of assetRoots) {
    const files = await walkFiles(repoRoot, root);
    assertUniquePortablePaths(files);
    for (const sourcePath of files) {
      const resourcePath = sourcePath.slice(root.length + 1);
      const namespace = resourcePath.split('/')[0];
      const kind = assetKind(resourcePath);
      const source = await sourceRecord(repoRoot, sourcePath);
      const record = {
        source, sourceRoot: root, namespace, resourcePath, kind,
        declaredLicense: classifyLicense(sourcePath, restricted, evidence),
        distributionStatus: kind === 'non-content-metadata' ? 'exclude-non-content' : 'review-required',
        proposedDestination: proposedBinaryDestination(resourcePath),
        references: [], metadata: {},
      };
      if (kind === 'texture') record.metadata = await pngDimensions(inside(repoRoot, sourcePath));
      if (sourcePath.endsWith('.json') || sourcePath.endsWith('.mcmeta')) {
        try {
          const { value } = await readJsonSource(repoRoot, sourcePath);
          record.references = assetReferences(kind, value);
          if (kind === 'localization') record.metadata = { locale: path.basename(sourcePath, '.json'), keyCount: Object.keys(value).length };
          if (kind === 'animation-metadata') record.metadata = { animation: value.animation ?? null };
          if (kind === 'model' && typeof value.credit === 'string') record.metadata = { credit: value.credit, creditKind: 'unclassified-source-credit' };
        } catch (error) {
          if (!(error instanceof SourceJsonError)) throw error;
          record.metadata = { jsonIssue: { code: error.code, detail: error.detail }, referenceAnalysis: 'blocked-by-invalid-source-json' };
          unresolved.push({ code: 'invalid-source-asset-json', severity: 'release-blocker', source: sourcePath, issue: error.code, detail: error.detail });
        }
      }
      if (resources.has(resourcePath)) {
        unresolved.push({ code: 'duplicate-asset-resource', severity: 'source-error', resourcePath, sources: [resources.get(resourcePath).source.path, sourcePath] });
      } else resources.set(resourcePath, record);
      sourcePaths.add(sourcePath);
      counts[kind] = (counts[kind] ?? 0) + 1;
      assets.push(record);
    }
  }
  for (const listed of restricted) if (!sourcePaths.has(listed)) throw new Error(`License listing references missing asset ${listed}`);
  const destinations = assets.map(asset => asset.proposedDestination).filter(value => value !== null);
  assertUniquePortablePaths(destinations);
  for (const asset of assets) {
    for (const reference of asset.references) {
      if (reference.resolution) continue;
      const target = resources.get(reference.resourcePath);
      if (target) {
        reference.resolution = 'source-file';
        reference.source = target.source;
      } else {
        reference.resolution = reference.namespace === 'betterend' ? 'missing-local-file' : 'external-dependency';
        if (reference.resolution === 'missing-local-file') unresolved.push({ code: 'missing-local-asset', severity: 'release-blocker', source: asset.source.path, reference });
      }
    }
  }
  unresolved.push({ code: 'asset-rights-audit-pending', severity: 'release-blocker', detail: 'License inheritance is recorded, not a completed per-asset distribution review. Restricted assets and derivatives must retain their conditions.' });
  unresolved.push({ code: 'external-asset-dependencies', severity: 'release-blocker', detail: 'Minecraft/BCLib/WorldWeaver/Canvas references and any WunderVault music inputs require their own pinned source/license evidence; source filenames are not legal clearance.' });
  assets.sort((left, right) => compareText(left.source.path, right.source.path));
  return {
    schemaVersion: 1, sourceRepository: 'https://github.com/quiqueck/BetterEnd', sourceCommit: SOURCE_COMMIT,
    sourceFingerprint: sourceFingerprint([evidence.code, evidence.assets, ...assets.map(asset => asset.source)]),
    licenses: { code: { text: licenseText, source: evidence.code }, assets: { text: assetLicenseText, source: evidence.assets } },
    counts: { ...counts, total: assets.length, explicitlyRestricted: restricted.size }, assets, unresolved,
  };
}
