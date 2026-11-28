import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const ts = createRequire(import.meta.url)('typescript');
const source = readFileSync(new URL('../src/utils/inTripProgress.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
}).outputText;
const exports = {};
vm.runInNewContext(code, {exports, Date, Set, Array});

test('a stop is planned by default and time passing does not create a visited record', () => {
  const progress = exports.emptyActualProgress();
  assert.equal(exports.actualStatusForStop(progress, 'stop-a'), undefined);
  assert.equal(progress.version, 1);
  assert.equal(progress.stops.length, 0);
  assert.equal(progress.movements.length, 0);
});

test('status updates are idempotent and do not invent actual visit times', () => {
  const initial = exports.emptyActualProgress();
  const visited = exports.setActualStopStatus(initial, {stopId: 'stop-a', poiId: 'poi-a', name: 'Điểm A'}, 'VISITED', '2026-11-23T02:00:00.000Z');
  const repeated = exports.setActualStopStatus(visited, {stopId: 'stop-a', poiId: 'poi-a', name: 'Điểm A'}, 'VISITED', '2026-11-23T02:01:00.000Z');
  assert.equal(visited.stops.length, 1);
  assert.equal(repeated, visited);
  assert.equal(Object.hasOwn(visited.stops[0], 'actualStartAt'), false);
  assert.equal(Object.hasOwn(visited.stops[0], 'actualEndAt'), false);
});

test('one stop can be skipped without removing it from trip ideas', () => {
  const ideas = ['poi-a', 'poi-b'];
  const skipped = exports.setActualStopStatus(exports.emptyActualProgress(), {stopId: 'stop-a', poiId: 'poi-a'}, 'SKIPPED', '2026-11-23T02:00:00.000Z');
  assert.equal(exports.actualStatusForStop(skipped, 'stop-a').status, 'SKIPPED');
  assert.deepEqual(ideas, ['poi-a', 'poi-b']);
});
