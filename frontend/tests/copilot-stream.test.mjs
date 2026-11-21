import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');

function loadCopilotService(fetchImpl) {
  const source = readFileSync(new URL('../src/services/copilotService.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;

  const exports = {};
  const deps = {
    '../lib/api': {
      API_BASE_URL: 'http://127.0.0.1:8000',
      fetchJson: async (path, init) => {
        const res = await fetchImpl(`http://127.0.0.1:8000${path}`, init);
        return await res.json();
      },
    },
  };

  vm.runInNewContext(compiled, {
    exports,
    require: (name) => deps[name] || {},
    fetch: fetchImpl,
    Headers,
    TextDecoder,
    Promise,
    JSON,
    Error,
    console,
  });
  return exports;
}

test('parseSseChunkBuffer handles split UTF-8 Vietnamese frames cleanly', () => {
  const service = loadCopilotService(async () => ({}));
  const firstHalf = 'event: status\ndata: {"message":"Đang tìm..."}\n\nevent: del';
  const secondHalf = 'ta\ndata: {"text":"Xin chào Đà Nẵng"}\n\n';

  const res1 = service.parseSseChunkBuffer(firstHalf);
  assert.equal(res1.events.length, 1);
  assert.equal(res1.events[0].event, 'status');
  assert.equal(res1.remainder, 'event: del');

  const res2 = service.parseSseChunkBuffer(res1.remainder + secondHalf);
  assert.equal(res2.events.length, 1);
  assert.equal(res2.events[0].event, 'delta');
  assert.equal(JSON.parse(res2.events[0].data).text, 'Xin chào Đà Nẵng');
  assert.equal(res2.remainder, '');
});

test('streamCopilotChat streams status, delta chunks, and returns final done payload', async () => {
  const encoder = new TextEncoder();
  const sseChunks = [
    encoder.encode('event: status\ndata: {"message":"Đang phân tích..."}\n\n'),
    encoder.encode('event: delta\ndata: {"text":"Quán chay "}\n\n'),
    encoder.encode('event: delta\ndata: {"text":"An Nhiên"}\n\n'),
    encoder.encode('event: done\ndata: {"reply_text":"Quán chay An Nhiên","intent":"swap_meal_vegetarian","suggested_pois":[],"action_type":"none"}\n\n'),
  ];

  let idx = 0;
  const mockFetch = async () => ({
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: async () => {
          if (idx >= sseChunks.length) return { done: true, value: undefined };
          return { done: false, value: sseChunks[idx++] };
        },
      }),
    },
  });

  const service = loadCopilotService(mockFetch);
  const statuses = [];
  let streamedText = '';

  const finalRes = await service.streamCopilotChat(
    { message: 'đổi quán chay', trip_context: { destination: 'Đà Nẵng', days_count: 3, current_day: 1 } },
    {
      onStatus: (msg) => statuses.push(msg),
      onDelta: (chunk) => {
        streamedText += chunk;
      },
    }
  );

  assert.deepEqual(statuses, ['Đang phân tích...']);
  assert.equal(streamedText, 'Quán chay An Nhiên');
  assert.equal(finalRes.reply_text, 'Quán chay An Nhiên');
  assert.equal(finalRes.intent, 'swap_meal_vegetarian');
});

test('streamCopilotChat falls back to POST /trips/copilot/chat on 404', async () => {
  const calledUrls = [];
  const mockFetch = async (url) => {
    calledUrls.push(url);
    if (String(url).endsWith('/stream')) {
      return { ok: false, status: 404, body: null };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        reply_text: 'Fallback thành công',
        intent: 'general_chat',
        suggested_pois: [],
        action_type: 'none',
      }),
    };
  };

  const service = loadCopilotService(mockFetch);
  const res = await service.streamCopilotChat({
    message: 'xin chào',
    trip_context: { destination: 'Đà Nẵng', days_count: 3, current_day: 1 },
  });

  assert.equal(calledUrls.length, 2);
  assert.ok(calledUrls[1].endsWith('/trips/copilot/chat'));
  assert.equal(res.reply_text, 'Fallback thành công');
});

test('TripOverviewView & IdeationChatView wire streamCopilotChat and safe past-date save handling', () => {
  const overviewSource = readFileSync(
    new URL('../src/components/planner/TripOverviewView.tsx', import.meta.url),
    'utf8'
  );
  const ideationSource = readFileSync(
    new URL('../src/components/planner/IdeationChatView.tsx', import.meta.url),
    'utf8'
  );

  assert.ok(overviewSource.includes('streamCopilotChat'), 'TripOverviewView must use streamCopilotChat');
  assert.ok(overviewSource.includes('streamingText'), 'TripOverviewView must render progressive streamingText');
  assert.ok(
    overviewSource.includes('saveTripItinerary(nextPlan).catch'),
    'TripOverviewView must catch past-date save rejection cleanly'
  );
  assert.ok(ideationSource.includes('streamCopilotChat'), 'IdeationChatView must use streamCopilotChat');
  assert.ok(ideationSource.includes('streamingText'), 'IdeationChatView must render progressive streamingText');
});
