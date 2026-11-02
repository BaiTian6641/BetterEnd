import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { getNodeValue, parseTree, printParseErrorCode } from 'jsonc-parser';

export const SOURCE_COMMIT = '5a25059ef4fd77409024a2919fb0a0098388104f';

export function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function portableRelativePath(value) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) {
    throw new Error('A nonempty relative path is required');
  }
  const normalized = value.replaceAll('\\', '/');
  if (normalized.startsWith('/') || /^[a-z]:/i.test(normalized)) {
    throw new Error(`Absolute path is not permitted: ${value}`);
  }
  const segments = normalized.split('/');
  for (const segment of segments) {
    if (!segment || segment === '.' || segment === '..' || /[<>:"|?*\x00-\x1f]/u.test(segment)) {
      throw new Error(`Unsafe path segment in ${value}`);
    }
    if (/[. ]$/u.test(segment) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(segment)) {
      throw new Error(`Nonportable path segment in ${value}`);
    }
  }
  return segments.join('/');
}

export function inside(root, relativePath) {
  const normalized = portableRelativePath(relativePath);
  const absoluteRoot = path.resolve(root);
  const resolved = path.resolve(absoluteRoot, ...normalized.split('/'));
  if (!resolved.startsWith(`${absoluteRoot}${path.sep}`)) {
    throw new Error(`Path escapes root: ${relativePath}`);
  }
  return resolved;
}

export async function hashFile(filePath) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

export function hashBytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export async function walkFiles(root, relativeRoot) {
  const base = inside(root, relativeRoot);
  const files = [];
  async function visit(absolute, relative) {
    const info = await lstat(absolute);
    if (info.isSymbolicLink()) throw new Error(`Source symlink must be reviewed explicitly: ${relative}`);
    if (info.isFile()) {
      files.push(relative.replaceAll('\\', '/'));
      return;
    }
    if (!info.isDirectory()) throw new Error(`Unsupported source entry: ${relative}`);
    const children = await readdir(absolute);
    children.sort(compareText);
    for (const child of children) await visit(path.join(absolute, child), `${relative}/${child}`);
  }
  await visit(base, portableRelativePath(relativeRoot));
  return files;
}

export class SourceJsonError extends Error {
  constructor(sourcePath, code, detail) {
    super(`${code === 'duplicate-key' ? 'Duplicate JSON key' : 'Invalid JSON'} in ${sourcePath}: ${detail}`);
    this.name = 'SourceJsonError';
    this.sourcePath = sourcePath;
    this.code = code;
    this.detail = detail;
  }
}

export function parseJsonText(text, sourcePath) {
  const errors = [];
  const tree = parseTree(text.replace(/^\uFEFF/u, ''), errors, { disallowComments: true, allowTrailingComma: false });
  if (!tree || errors.length) {
    const detail = errors.map(error => `${printParseErrorCode(error.error)} at ${error.offset}`).join(', ');
    throw new SourceJsonError(sourcePath, 'invalid-json', detail || 'empty input');
  }
  function check(node) {
    if (node.type === 'object') {
      const keys = new Set();
      for (const property of node.children ?? []) {
        const [key, value] = property.children;
        if (keys.has(key.value)) throw new SourceJsonError(sourcePath, 'duplicate-key', JSON.stringify(key.value));
        keys.add(key.value);
        check(value);
      }
    } else if (node.type === 'array') {
      for (const child of node.children ?? []) check(child);
    }
  }
  check(tree);
  return getNodeValue(tree);
}

export async function readJsonSource(repoRoot, sourcePath) {
  const bytes = await readFile(inside(repoRoot, sourcePath));
  const value = parseJsonText(bytes.toString('utf8'), sourcePath);
  return { value, source: { path: portableRelativePath(sourcePath), sha256: hashBytes(bytes), bytes: bytes.length } };
}

export async function sourceRecord(repoRoot, sourcePath) {
  const normalized = portableRelativePath(sourcePath);
  const absolute = inside(repoRoot, normalized);
  const info = await lstat(absolute);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Expected a regular source file: ${normalized}`);
  return { path: normalized, sha256: await hashFile(absolute), bytes: info.size };
}

export function stableJson(value) {
  function order(entry) {
    if (Array.isArray(entry)) return entry.map(order);
    if (entry !== null && typeof entry === 'object') {
      return Object.fromEntries(Object.keys(entry).sort(compareText).map(key => [key, order(entry[key])]));
    }
    if (typeof entry === 'number' && !Number.isFinite(entry)) throw new Error('Nonfinite JSON number');
    if (entry === undefined || typeof entry === 'bigint' || typeof entry === 'function') {
      throw new Error('Unsupported value in deterministic JSON');
    }
    return entry;
  }
  return `${JSON.stringify(order(value), null, 2)}\n`;
}

export function assertUniquePortablePaths(paths) {
  const seen = new Map();
  for (const entry of paths) {
    const normalized = portableRelativePath(entry);
    const key = normalized.normalize('NFC').toLowerCase();
    if (seen.has(key)) throw new Error(`Colliding paths: ${seen.get(key)} and ${entry}`);
    seen.set(key, normalized);
  }
}

export function sourceFingerprint(records) {
  const ordered = [...records].sort((left, right) => compareText(left.path, right.path));
  const seen = new Set();
  const hash = createHash('sha256');
  for (const record of ordered) {
    if (seen.has(record.path)) throw new Error(`Duplicate fingerprint source: ${record.path}`);
    if (!/^[a-f0-9]{64}$/u.test(record.sha256)) throw new Error(`Invalid source digest: ${record.path}`);
    seen.add(record.path);
    hash.update(record.path).update('\0').update(record.sha256).update('\n');
  }
  return hash.digest('hex');
}
