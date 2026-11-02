import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';
import { materializePinnedSource } from '../tools/pinned-source.mjs';

const execute = promisify(execFile);
const temporaryRoot = fileURLToPath(new URL('../.work/tests/', import.meta.url));

test('pinned source uses committed bytes instead of checkout newline conversion or local modifications', async t => {
  await mkdir(temporaryRoot, { recursive: true });
  const root = await mkdtemp(path.join(temporaryRoot, 'pinned-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const sourceRoot = path.join(root, 'repository');
  const outputRoot = path.join(root, 'bedrock');
  await mkdir(sourceRoot);
  await mkdir(outputRoot);
  await execute('git', ['init', '--quiet', '--initial-branch=fixture', sourceRoot]);
  await writeFile(path.join(sourceRoot, 'data.json'), '{"value":1}\n');
  await execute('git', ['-C', sourceRoot, '-c', 'core.autocrlf=false', 'add', 'data.json']);
  await execute('git', ['-C', sourceRoot, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'fixture source']);
  const { stdout } = await execute('git', ['-C', sourceRoot, 'rev-parse', 'HEAD']);
  const commit = stdout.trim();
  await writeFile(path.join(sourceRoot, 'data.json'), '{"value":99}\r\n');
  const snapshot = await materializePinnedSource(sourceRoot, outputRoot, commit);
  try {
    assert.equal(await readFile(path.join(snapshot.root, 'data.json'), 'utf8'), '{"value":1}\n');
    assert.equal(await readFile(path.join(sourceRoot, 'data.json'), 'utf8'), '{"value":99}\r\n');
  } finally {
    await snapshot.dispose();
  }
  await assert.rejects(materializePinnedSource(sourceRoot, outputRoot, 'HEAD'), /immutable source commit/);
});
