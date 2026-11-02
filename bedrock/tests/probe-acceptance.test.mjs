import assert from 'node:assert/strict';
import test from 'node:test';
import { assertObservation } from '../tools/run-bds-probe.mjs';

const id = 'betterend_probe:flavolite';
const rough = location => ({ location, typeId: id, states: { 'betterend_probe:finish': 'rough' } });
const envelope = (action, records, dimension = 'minecraft:the_end') => ({ action, dimension, players: 0, item: { typeId: 'betterend_probe:thallasium_ingot', amount: 1 }, records });

function borderRecords() {
  return [
    { location: { x: 1016, y: 64, z: 8 }, featureMatches: [] },
    { location: { x: 1016, y: 64, z: 24 }, featureMatches: [] },
    { location: { x: 1032, y: 64, z: 8 }, featureMatches: [rough({ x: 1032, y: 58, z: 8 })] },
    { location: { x: 1032, y: 64, z: 24 }, featureMatches: [] },
  ];
}

test('generation acceptance evaluates protection per column when a scan crosses a region boundary', () => {
  const request = { action: 'scan', dimension: 'the_end', x: 1008, z: 0, width: 2 };
  assertObservation(request, envelope('scan', borderRecords()));
  const breached = borderRecords();
  breached[0].featureMatches.push(rough({ x: 1016, y: 58, z: 8 }));
  assert.throws(() => assertObservation(request, envelope('scan', breached)));
  assert.throws(() => assertObservation({ ...request, dimension: 'overworld' }, envelope('scan', borderRecords(), 'minecraft:overworld')));
});

test('incomplete or all-air outer scans do not masquerade as native generation success', () => {
  const request = { action: 'scan', dimension: 'the_end', x: 2048, z: 2048, width: 1 };
  assert.throws(() => assertObservation(request, envelope('scan', [])));
  assert.throws(() => assertObservation(request, envelope('scan', [{ location: { x: 2056, y: 64, z: 2056 }, featureMatches: [] }])));
  assert.throws(() => assertObservation(request, envelope('scan', [{ location: { x: 2056, y: 64, z: 2056 } }])));
});

test('native placement requires the correct precondition, post-permutation and requested dimension', () => {
  const request = { action: 'place', dimension: 'the_end' };
  const record = { before: { typeId: 'minecraft:end_stone' }, featurePlaced: true, after: { typeId: id, states: { 'betterend_probe:finish': 'rough' } } };
  assertObservation(request, envelope('place', [record]));
  assert.throws(() => assertObservation(request, envelope('place', [{ ...record, after: { typeId: id, states: { 'betterend_probe:finish': 'metal' } } }])));
  assert.throws(() => assertObservation(request, envelope('place', [record], 'minecraft:overworld')));
  assert.throws(() => assertObservation(request, envelope('place', [{ ...record, before: { typeId: 'minecraft:air' } }])));
});

test('restart inspection rejects a block whose identity survives but its permutation resets', () => {
  const request = { action: 'inspect', dimension: 'the_end', expectTypeId: id, expectStates: { 'betterend_probe:finish': 'emissive' } };
  const surviving = { after: { typeId: id, states: { 'betterend_probe:finish': 'emissive' } } };
  assertObservation(request, envelope('inspect', [surviving]));
  assert.throws(() => assertObservation(request, envelope('inspect', [{ after: { typeId: id, states: { 'betterend_probe:finish': 'rough' } } }])));
});
