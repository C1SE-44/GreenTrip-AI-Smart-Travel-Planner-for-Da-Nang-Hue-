import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

const root = fileURLToPath(new URL('../', import.meta.url));
const browserPath = process.env.CHROME_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(existsSync);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('POI explanations in a real Chromium browser', { timeout: 180000 }, async (t) => {
  assert.ok(browserPath, 'Set CHROME_PATH to a local Chromium executable');
  const profile = await mkdtemp(path.join(tmpdir(), 'greentrip-explanation-'));
  const server = await createServer({
    configFile: false, root, envDir: profile, plugins: [react(), {
      name: 'explanation-test-page',
      configureServer(vite) {
        vite.middlewares.use('/__explanation-test', async (_req, res) => {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(await vite.transformIndexHtml('/__explanation-test', '<div id="root"></div><script type="module" src="/tests/explanation-harness.tsx"></script>'));
        });
      },
    }],
    resolve: { alias: { '@': path.join(root, 'src') } },
    server: { host: '127.0.0.1', port: 0 },
  });
  await server.listen();
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  const browser = spawn(browserPath, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  browser.stderr.on('data', (data) => { stderr += data.toString(); });
  let socket;
  try {
    for (let i = 0; i < 100 && !stderr.includes('DevTools listening on'); i++) await delay(100);
    const endpoint = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/)?.[1];
    assert.ok(endpoint, 'Browser debugging endpoint started');
    const port = new URL(endpoint).port;
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    socket = new WebSocket(pages.find((page) => page.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let seq = 0;
    const pending = new Map();
    const errors = [];
    socket.onmessage = ({ data }) => {
      const message = JSON.parse(data);
      if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
      if (message.id) {
        const request = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) request.reject(new Error(message.error.message));
        else request.resolve(message.result);
      }
    };
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async (expression) => {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    const waitFor = async (expression) => {
      for (let i = 0; i < 150; i++) {
        if (await evaluate(expression)) return;
        await delay(50);
      }
      throw new Error(`Timed out: ${expression}\n${await evaluate('document.body.innerText')}\n${errors.join('\n')}`);
    };
    const navigate = async (query = '') => {
      await send('Page.navigate', { url: `${base}/__explanation-test?${query}` });
      await waitFor(`location.search === ${JSON.stringify(query ? `?${query}` : '')} && !!document.querySelector(${JSON.stringify(query.includes('component=') ? 'button' : '#open')})`);
    };
    const open = async (mode) => {
      await navigate(`mode=${mode}`);
      await evaluate('document.querySelector("#open").focus(); document.querySelector("#open").click()');
    };
    await send('Runtime.enable');
    await t.test('lazy fetch, loading, snippet and matching KG facts', async () => {
      await navigate();
      assert.equal(await evaluate('window.explanationRequests.length'), 0);
      await evaluate('document.querySelector("#open").click()');
      await waitFor('!!document.querySelector("[aria-busy=true]")');
      await waitFor('document.body.innerText.includes("FACT A")');
      assert.ok(await evaluate('document.querySelector("[role=dialog]").innerText.includes("SNIPPET A")'));
    });
    for (const mode of ['empty', 'missing', 'error', 'mismatch']) {
      await t.test(`${mode} state does not invent or mix facts`, async () => {
        await open(mode);
        await waitFor(mode === 'empty' || mode === 'missing'
          ? 'document.body.innerText.includes("Chưa có dữ liệu")'
          : '!!document.querySelector("[role=alert]")');
        assert.ok(await evaluate('!document.body.innerText.includes("FACT B")'));
        assert.ok(await evaluate('document.body.innerText.includes("SNIPPET A")'));
      });
    }
    await t.test('503 retry recovers', async () => {
      await open('retry');
      await waitFor('!!document.querySelector("[role=alert]")');
      await evaluate('[...document.querySelectorAll("button")].find(b => b.textContent.includes("Thử lại")).click()');
      await waitFor('document.body.innerText.includes("FACT A")');
    });
    await t.test('late A response never overwrites B', async () => {
      await open('race');
      await evaluate('document.querySelector("#switch").click()');
      await waitFor('document.body.innerText.includes("FACT B")');
      await delay(500);
      assert.ok(await evaluate('!document.body.innerText.includes("FACT A") && document.body.innerText.includes("SNIPPET B")'));
    });
    await t.test('Escape closes and restores trigger focus', async () => {
      await open('success');
      await waitFor('!!document.querySelector("[role=dialog]")');
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
      await waitFor('!document.querySelector("[role=dialog]")');
      assert.equal(await evaluate('document.activeElement.id'), 'open');
    });
    await t.test('Explore card exposes KG without recommendation and does not select card', async () => {
      await navigate('component=card');
      await evaluate('[...document.querySelectorAll("button")].find(b => b.textContent.includes("Vì sao nơi này")).click()');
      await waitFor('document.body.innerText.includes("FACT A")');
      assert.equal(await evaluate('window.cardClicks'), 0);
      assert.ok(await evaluate('!document.querySelector("[role=dialog]").innerText.includes("Lý do AI gợi ý")'));
    });
    await t.test('Planner uses PB09 ID and snippet for the selected POI', async () => {
      await navigate('component=planner');
      await evaluate('document.querySelector("form").requestSubmit()');
      await waitFor('[...document.querySelectorAll("button")].some(b => b.textContent.includes("Lấy gợi ý POI từ AI"))');
      await evaluate('[...document.querySelectorAll("button")].find(b => b.textContent.includes("Lấy gợi ý POI từ AI")).click()');
      await waitFor('document.body.innerText.includes("SNIPPET B")');
      await evaluate('[...document.querySelectorAll("article")].find(a => a.textContent.includes("SNIPPET B")).querySelector("button").click()');
      await waitFor('!!document.querySelector("[role=dialog]") && document.querySelector("[role=dialog]").innerText.includes("FACT B")');
      assert.ok(await evaluate('!document.querySelector("[role=dialog]").innerText.includes("SNIPPET A")'));
      assert.ok(await evaluate('window.explanationRequests.some(url => url.includes("22222222-2222-4222-8222-222222222222/explanation-facts"))'));
    });
    await t.test('popup reflows at 320px and 1280px', async () => {
      await open('success');
      await waitFor('document.body.innerText.includes("FACT A")');
      for (const width of [320, 1280]) {
        await send('Emulation.setDeviceMetricsOverride', { width, height: 800, deviceScaleFactor: 1, mobile: false });
        assert.ok(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'));
      }
      assert.deepEqual(errors, [], 'No uncaught browser runtime errors');
    });
  } finally {
    socket?.close();
    browser.kill();
    await server.close();
    await delay(500);
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});