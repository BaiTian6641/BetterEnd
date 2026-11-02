import { open, mkdir, readFile, realpath, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashFile, inside, portableRelativePath } from './source-files.mjs';

export const FAILED_ATTEMPT_LIMIT = 15;
const results = new Set(['pass', 'fail', 'blocked']);

function validateGateId(gateId) {
  if (typeof gateId !== 'string' || !/^[A-Z][A-Z0-9]*-\d{3}$/u.test(gateId)) throw new Error('Invalid acceptance gate ID');
}

async function artifactLocation(bedrockRoot, value) {
  const relative = portableRelativePath(value);
  if (!relative.startsWith('evidence/')) throw new Error('Retained artifacts must be under bedrock/evidence/');
  const root = await realpath(bedrockRoot);
  const absolute = await realpath(inside(bedrockRoot, relative));
  const normalize = input => process.platform === 'win32' ? input.toLowerCase() : input;
  if (!normalize(absolute).startsWith(`${normalize(root)}${path.sep}`)) throw new Error('Evidence artifact escapes the Bedrock workspace');
  return { relative, absolute };
}

export function summarizeAttempts(attempts, gateId) {
  validateGateId(gateId);
  const matching = attempts.filter(entry => entry.gateId === gateId);
  const failedAttempts = matching.filter(entry => entry.result === 'fail').length;
  return {
    gateId,
    attempts: matching.length,
    failedAttempts,
    failedAttemptLimit: FAILED_ATTEMPT_LIMIT,
    requiresUserDecision: failedAttempts >= FAILED_ATTEMPT_LIMIT || matching.at(-1)?.result === 'blocked',
    lastResult: matching.at(-1)?.result ?? 'not-run',
  };
}

export async function readAttempts(bedrockRoot) {
  const location = path.join(bedrockRoot, 'evidence', 'attempts.jsonl');
  let text;
  try {
    text = await readFile(location, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const records = [];
  const checkedArtifacts = new Map();
  for (const [index, line] of text.split('\n').entries()) {
    if (!line.trim()) continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch (error) {
      throw new Error(`Corrupt evidence record at line ${index + 1}`, { cause: error });
    }
    validateFields(record);
    if (record.sequence !== records.length + 1) throw new Error(`Evidence sequence gap at line ${index + 1}`);
    for (const artifact of record.artifacts) {
      if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact) || typeof artifact.path !== 'string' || typeof artifact.sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(artifact.sha256)) {
        throw new Error(`Invalid retained artifact receipt at line ${index + 1}`);
      }
      const { relative, absolute } = await artifactLocation(bedrockRoot, artifact.path);
      if (!checkedArtifacts.has(relative)) checkedArtifacts.set(relative, await hashFile(absolute));
      if (checkedArtifacts.get(relative) !== artifact.sha256) throw new Error(`Retained evidence changed: ${relative}`);
    }
    records.push(record);
  }
  return records;
}

function validateFields(record) {
  validateGateId(record.gateId);
  if (!results.has(record.result)) throw new Error('Evidence result must be pass, fail, or blocked');
  if (!['automated', 'manual'].includes(record.method)) throw new Error('Evidence method must be automated or manual');
  for (const key of ['scenario', 'observed', 'profile']) {
    if (typeof record[key] !== 'string' || record[key].trim().length === 0) throw new Error(`Evidence requires ${key}`);
  }
  if (!Array.isArray(record.artifacts) || record.artifacts.length === 0) throw new Error('Evidence requires at least one retained artifact');
  if (record.method === 'automated') {
    if (!Array.isArray(record.command) || record.command.length === 0 || record.command.some(part => typeof part !== 'string')) {
      throw new Error('Automated evidence requires the actual command argument vector');
    }
    if (!Number.isInteger(record.exitCode)) throw new Error('Automated evidence requires an exit code');
    if (record.result === 'pass' && record.exitCode !== 0) throw new Error('A nonzero command exit cannot be recorded as passing');
  } else if (typeof record.operator !== 'string' || !record.operator.trim()) {
    throw new Error('Manual evidence requires the operator identity');
  }
}

export async function recordAttempt(bedrockRoot, input) {
  validateFields(input);
  const evidenceRoot = path.join(bedrockRoot, 'evidence');
  await mkdir(evidenceRoot, { recursive: true });
  const lockPath = path.join(evidenceRoot, '.attempts.lock');
  let lock;
  try {
    lock = await open(lockPath, 'wx');
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error('Another evidence writer owns the ledger; inspect an abandoned lock before recovery');
    throw error;
  }
  try {
    const attempts = await readAttempts(bedrockRoot);
    const summary = summarizeAttempts(attempts, input.gateId);
    if (summary.failedAttempts >= FAILED_ATTEMPT_LIMIT) {
      throw new Error(`${input.gateId} reached ${FAILED_ATTEMPT_LIMIT} failed attempts; user decision required`);
    }
    const artifacts = [];
    for (const artifact of input.artifacts) {
      const { relative, absolute } = await artifactLocation(bedrockRoot, typeof artifact === 'string' ? artifact : artifact.path);
      artifacts.push({ path: relative, sha256: await hashFile(absolute) });
    }
    const record = {
      ...input,
      schemaVersion: 1,
      sequence: attempts.length + 1,
      recordedAt: new Date().toISOString(),
      artifacts,
    };
    const ledger = await open(path.join(evidenceRoot, 'attempts.jsonl'), 'a');
    try {
      await ledger.writeFile(`${JSON.stringify(record)}\n`, 'utf8');
      await ledger.sync();
    } finally {
      await ledger.close();
    }
    return { record, summary: summarizeAttempts([...attempts, record], input.gateId) };
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}

async function main(args) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  if (args[0] === 'status' && args.length === 2) {
    console.log(JSON.stringify(summarizeAttempts(await readAttempts(root), args[1]), null, 2));
    return;
  }
  if (args[0] === 'record' && args.length === 2) {
    const relative = portableRelativePath(args[1]);
    const input = JSON.parse(await readFile(inside(root, relative), 'utf8'));
    console.log(JSON.stringify(await recordAttempt(root, input), null, 2));
    return;
  }
  throw new Error('Usage: node tools/evidence.mjs status GATE-001 | record evidence/input.json');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
