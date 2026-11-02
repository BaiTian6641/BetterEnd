import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { FAILED_ATTEMPT_LIMIT, readAttempts, recordAttempt, summarizeAttempts } from '../tools/evidence.mjs';
import { hashBytes } from '../tools/source-files.mjs';

const temporaryRoot = fileURLToPath(new URL('../.work/tests/', import.meta.url));

async function fixture(t) {
  await mkdir(temporaryRoot, { recursive: true });
  const root = await mkdtemp(path.join(temporaryRoot, 'evidence-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'evidence'));
  await writeFile(path.join(root, 'evidence', 'probe.log'), 'Observed one placed block with the expected permutation.\n');
  return root;
}

function attempt(result = 'fail') {
  return {
    gateId: 'CAP-002',
    result,
    method: 'automated',
    profile: 'fixture',
    scenario: 'Check the resulting block permutation',
    observed: result === 'pass' ? 'Expected permutation observed' : 'Wrong block permutation observed',
    command: ['node', 'fixture-probe.mjs'],
    exitCode: result === 'pass' ? 0 : 1,
    artifacts: ['evidence/probe.log'],
  };
}

test('failed attempts remain cumulative across passing runs and other gates', () => {
  const records = [attempt(), { ...attempt(), gateId: 'CAP-003' }, attempt('pass'), attempt()];
  assert.deepEqual(summarizeAttempts(records, 'CAP-002'), {
    gateId: 'CAP-002', attempts: 3, failedAttempts: 2, failedAttemptLimit: 15,
    requiresUserDecision: false, lastResult: 'fail',
  });
  assert.equal(summarizeAttempts([{ ...attempt(), result: 'blocked' }], 'CAP-002').requiresUserDecision, true);
  assert.equal(summarizeAttempts([], 'CAP-002').lastResult, 'not-run');
});

test('recorded evidence binds retained artifact bytes and rejects a false passing exit', async t => {
  const root = await fixture(t);
  const entry = await recordAttempt(root, attempt('pass'));
  assert.equal(entry.record.sequence, 1);
  assert.equal(entry.record.artifacts[0].sha256, hashBytes(await readFile(path.join(root, 'evidence', 'probe.log'))));
  await assert.rejects(recordAttempt(root, { ...attempt('pass'), exitCode: 1 }), /nonzero command exit/);
  assert.equal((await readAttempts(root)).length, 1);
});

test('fifteen failures prevent another attempt without erasing history', async t => {
  const root = await fixture(t);
  for (let index = 0; index < FAILED_ATTEMPT_LIMIT; index += 1) await recordAttempt(root, attempt());
  const summary = summarizeAttempts(await readAttempts(root), 'CAP-002');
  assert.equal(summary.failedAttempts, 15);
  assert.equal(summary.requiresUserDecision, true);
  await assert.rejects(recordAttempt(root, attempt('pass')), /reached 15 failed attempts/);
  assert.equal((await readAttempts(root)).length, 15);
});

test('missing or unretained artifacts cannot produce evidence and release the writer lock', async t => {
  const root = await fixture(t);
  await assert.rejects(recordAttempt(root, { ...attempt(), artifacts: ['../outside.log'] }), /Unsafe/);
  await assert.rejects(recordAttempt(root, { ...attempt(), artifacts: ['.work/probe.log'] }), /Retained artifacts/);
  await assert.rejects(recordAttempt(root, { ...attempt(), artifacts: ['evidence/missing.log'] }), /ENOENT/);
  assert.deepEqual(await readAttempts(root), []);
  await recordAttempt(root, attempt());
  assert.equal((await readAttempts(root))[0].sequence, 1);
});

test('corrupt or out-of-sequence evidence fails closed rather than resetting attempt counts', async t => {
  const root = await fixture(t);
  await writeFile(path.join(root, 'evidence', 'attempts.jsonl'), '{broken}\n');
  await assert.rejects(recordAttempt(root, attempt()), /Corrupt evidence record/);
  await writeFile(path.join(root, 'evidence', 'attempts.jsonl'), `${JSON.stringify({ ...attempt(), sequence: 2 })}\n`);
  await assert.rejects(readAttempts(root), /sequence gap/);
});

test('changing or deleting retained evidence invalidates an earlier passing receipt', async t => {
  const root = await fixture(t);
  await recordAttempt(root, attempt('pass'));
  await writeFile(path.join(root, 'evidence', 'probe.log'), 'Different evidence.\n');
  await assert.rejects(readAttempts(root));
  await rm(path.join(root, 'evidence', 'probe.log'));
  await assert.rejects(readAttempts(root));
});

test('non-string gate IDs cannot evade cumulative failure accounting', async t => {
  const root = await fixture(t);
  await assert.rejects(recordAttempt(root, { ...attempt(), gateId: ['CAP-002'] }));
  assert.deepEqual(await readAttempts(root), []);
});

test('persisted evidence without a bound digest is not accepted as a passing record', async t => {
  const root = await fixture(t);
  await writeFile(path.join(root, 'evidence', 'attempts.jsonl'), `${JSON.stringify({ ...attempt('pass'), sequence: 1 })}\n`);
  await assert.rejects(readAttempts(root));
});
