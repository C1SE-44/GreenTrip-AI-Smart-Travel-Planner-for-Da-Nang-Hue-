import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const ts = require('typescript');
function load(path, fetchJson) {
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, URL, URLSearchParams, require: () => ({ fetchJson }) });
  return exports;
}
test('IDs request only requested records, deduplicate IDs and forward cancellation', async () => {
  const calls = [];
  const signal = new AbortController().signal;
  const api = load('../src/services/poi.ts', async (path, init) => {
    calls.push([path, init]);
    return { items: [{ id: 'a' }, { id: 'other' }], pagination: {} };
  });
  assert.equal((await api.getPoisByIds(['a', 'a'], signal)).length, 1);
  assert.equal(calls.length, 1);
  assert.deepEqual(new URLSearchParams(calls[0][0].split('?')[1]).getAll('ids'), ['a']);
  assert.equal(calls[0][1].signal, signal);
  await api.getPoisByIds([]);
  assert.equal(calls.length, 1);
});
test('Explicit catalogue loading limits concurrent pages to two and keeps order', async () => {
  let running = 0, peak = 0;
  const calls = [];
  const api = load('../src/services/poi.ts', async path => {
    const query = new URLSearchParams(path.split('?')[1]);
    const page = Number(query.get('page'));
    calls.push(page);
    peak = Math.max(peak, ++running);
    await new Promise(resolve => setTimeout(resolve, 5));
    running--;
    return { items: [{ id: String(page) }], pagination: { total: 5, total_pages: 5, limit: 1 } };
  });
  const result = await api.getAllPois({ limit: 1, view: 'summary' });
  assert.equal(peak, 2);
  assert.deepEqual(calls, [1, 2, 3, 4, 5]);
  assert.equal(result.items.map(item => item.id).join(','), '1,2,3,4,5');
});
test('Summary pagination and literal search values survive query serialization', async () => {
  let requested;
  const api = load('../src/services/poi.ts', async path => { requested = path; return {}; });
  await api.getPois({ page: 2, limit: 16, view: 'summary', q: 'café & 50%', city: 'Huế' });
  const query = new URLSearchParams(requested.split('?')[1]);
  assert.equal(query.get('page'), '2');
  assert.equal(query.get('limit'), '16');
  assert.equal(query.get('view'), 'summary');
  assert.equal(query.get('q'), 'café & 50%');
});
test('Thumbnail sizing preserves provider flags and unknown signed URLs', () => {
  const { poiImageUrl } = load('../src/utils/poiImage.ts');
  assert.equal(poiImageUrl('https://lh3.googleusercontent.com/photo=w1200-h800-k-no', 320), 'https://lh3.googleusercontent.com/photo=w320-h304-k-no');
  const unknown = 'https://example.com/photo.jpg?w=4000&signature=abc';
  assert.equal(poiImageUrl(unknown, 320), unknown);
  assert.equal(poiImageUrl('/images/local.webp', 320), '/images/local.webp');
});

test('Summary revisits use bounded cache, full detail stays fresh and aborted requests stop', async () => {
  let calls = 0;
  const api = load('../src/services/poi.ts', async () => { calls++; return { items: [], pagination: {} }; });
  await api.getPois({ page: 1, limit: 16, view: 'summary' });
  await api.getPois({ page: 1, limit: 16, view: 'summary' });
  assert.equal(calls, 1);
  await api.getPois({ page: 1, limit: 16 });
  await api.getPois({ page: 1, limit: 16 });
  assert.equal(calls, 3);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(api.getPois({ view: 'summary' }, controller.signal));
  assert.equal(calls, 3);
  for (let page = 2; page <= 34; page++) await api.getPois({ page, limit: 16, view: 'summary' });
  const previousCalls = calls;
  await api.getPois({ page: 1, limit: 16, view: 'summary' });
  assert.equal(calls, previousCalls + 1);
});
