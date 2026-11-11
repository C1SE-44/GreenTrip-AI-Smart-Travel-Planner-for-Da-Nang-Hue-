import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer as createNetServer } from 'node:net';
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
const getAvailablePort = async () => new Promise((resolve, reject) => {
  const probe = createNetServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const address = probe.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    probe.close((error) => error ? reject(error) : resolve(port));
  });
});
const idsKey = 'saved_places_test_server_ids';
const collectionsKey = 'saved_places_test_collections';
const membershipsKey = 'saved_places_test_memberships';
const firstPoiId = '11111111-1111-4111-8111-111111111111';
const secondPoiId = '22222222-2222-4222-8222-222222222222';
const thirdPoiId = '33333333-3333-4333-8333-333333333333';
const defaultCollectionId = 'collection-default';
const weekendCollectionId = 'collection-weekend';

test('Saved Places collections, membership, search, authentication, and responsive layout', { timeout: 180000 }, async (t) => {
  assert.ok(browserPath, 'Set CHROME_PATH to a local Chromium executable');
  const profile = await mkdtemp(path.join(tmpdir(), 'greentrip-saved-places-'));
  const testPort = await getAvailablePort();
  const server = await createServer({
    configFile: false,
    root,
    envDir: profile,
    plugins: [react(), {
      name: 'saved-places-test-page',
      configureServer(vite) {
        vite.middlewares.use('/__saved-test', async (_req, res) => {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(await vite.transformIndexHtml('/__saved-test', '<div id="root"></div><script type="module" src="/tests/saved-places-harness.tsx"></script>'));
        });
      },
    }],
    resolve: { alias: { '@': path.join(root, 'src') } },
    server: { host: '127.0.0.1', port: testPort, strictPort: true },
  });
  await server.listen();
  await server.transformRequest('/tests/saved-places-harness.tsx');
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
      for (let i = 0; i < 1200; i++) {
        if (await evaluate(expression)) return;
        await delay(50);
      }
      throw new Error(`Timed out: ${expression}\n${await evaluate('location.href + "\\n" + document.documentElement.outerHTML.slice(0, 3000)')}\n${errors.join('\n')}`);
    };
    const seed = async (empty = false) => {
      const ids = empty ? [] : [firstPoiId, secondPoiId, thirdPoiId];
      const memberships = empty ? [] : [firstPoiId, secondPoiId, thirdPoiId];
      await evaluate(`(() => {
        sessionStorage.setItem('${idsKey}', ${JSON.stringify(JSON.stringify(ids))});
        sessionStorage.setItem('${collectionsKey}', JSON.stringify([
          { collection_id: '${defaultCollectionId}', name: 'Địa điểm của tôi', is_default: true, created_at: '2026-11-01T00:00:00Z' },
          { collection_id: '${weekendCollectionId}', name: 'Cuối tuần', is_default: false, created_at: '2026-11-02T00:00:00Z' },
        ]));
        sessionStorage.setItem('${membershipsKey}', JSON.stringify({
          '${defaultCollectionId}': ${JSON.stringify(memberships)},
          '${weekendCollectionId}': ${JSON.stringify(empty ? [] : [firstPoiId])},
        }));
        sessionStorage.removeItem('saved_places_test_fail_get');
        sessionStorage.removeItem('saved_places_test_fail_mutation');
        sessionStorage.removeItem('saved_places_test_mutation_delay');
        localStorage.setItem('access_token', 'saved-places-test-token');
      })()`);
    };
    const open = async (tab = 'collections', { empty = false } = {}) => {
      await send('Page.navigate', { url: `${base}/__saved-test?${empty ? 'empty=1&' : ''}run=${Date.now()}` });
      await waitFor('!!document.querySelector("#root")');
      await seed(empty);
      await send('Page.reload');
      await waitFor('!!document.querySelector("main")');
      if (tab === 'places') {
        await evaluate('[...document.querySelectorAll("[role=tab]")].find(button => button.textContent.includes("Địa điểm")).click()');
        if (empty) await waitFor('document.body.innerText.includes("Chưa có địa điểm nào được lưu")');
        else await waitFor('document.querySelectorAll("article").length === 3');
      } else {
        await waitFor('document.body.innerText.includes("Cuối tuần")');
      }
    };

    await send('Runtime.enable');
    await t.test('collections grid and collection detail keep source POIs saved', async () => {
      await open('collections');
      assert.ok(await evaluate('document.body.innerText.includes("Bộ sưu tập của bạn")'));
      assert.ok(await evaluate('document.body.innerText.includes("Địa điểm của tôi")'));
      await evaluate('[...document.querySelectorAll("button")].find(button => button.textContent.includes("Cuối tuần")).click()');
      await waitFor('document.querySelectorAll("article").length === 1');
      assert.ok(await evaluate('document.querySelector("article").innerText.includes("Bãi biển Mỹ Khê")'));
      await evaluate('[...document.querySelectorAll("button")].find(button => button.textContent.includes("Bỏ khỏi bộ sưu tập này")).click()');
      await waitFor('document.body.innerText.includes("Bộ sưu tập chưa có địa điểm")');
      assert.equal(await evaluate('sessionStorage.getItem("saved_places_test_server_ids")'), JSON.stringify([firstPoiId, secondPoiId, thirdPoiId]));
      await evaluate(`document.querySelector('button[aria-label="Quay lại bộ sưu tập"]').click()`);
      await evaluate('[...document.querySelectorAll("[role=tab]")].find(button => button.textContent.includes("Địa điểm")).click()');
      await waitFor('document.querySelectorAll("article").length === 3');
    });

    await t.test('compact cards show real saved counts and map selection stays in sync', async () => {
      await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
      await open('collections');
      await evaluate('[...document.querySelectorAll("button")].find(button => button.textContent.includes("Địa điểm của tôi")).click()');
      await waitFor('document.querySelectorAll("article").length === 3');
      await waitFor('document.querySelectorAll(".gt-map-marker").length === 2');
      assert.equal(await evaluate('[...document.querySelectorAll(".gt-map-marker svg path")].filter(path => path.getAttribute("fill") === "#e11d48").length'), 2);
      assert.ok(await evaluate('document.querySelector("article").innerText.includes("Đã lưu bởi 2 người")'));
      assert.ok(await evaluate('document.querySelector("aside [role=status]")?.textContent.includes("Một số địa điểm chưa có tọa độ hợp lệ")'));
      await evaluate('document.querySelectorAll("article")[0].click()');
      await waitFor('document.querySelector(".gt-map-marker img")?.getAttribute("src")?.includes("my-khe.jpg")');
      await evaluate('document.querySelectorAll(".gt-map-marker .map-marker-pin")[1].click()');
      await delay(400);
      assert.ok(await evaluate('document.querySelectorAll("article")[1].querySelector("div.relative").className.includes("ring-2")'));
    });

    await t.test('city, category, and search filters combine', async () => {
      await open('places');
      await evaluate('[...document.querySelectorAll("button")].find(button => button.textContent.trim() === "Huế").click()');
      await waitFor('document.querySelectorAll("article").length === 1');
      assert.ok(await evaluate('document.querySelector("article").innerText.includes("Đại Nội Huế")'));
      await evaluate('(() => { const select=document.querySelector("select"); select.value="di-tich"; select.dispatchEvent(new Event("change", {bubbles:true})); })()');
      await waitFor('document.querySelectorAll("article").length === 1');
      await evaluate('[...document.querySelectorAll("button")].find(button => button.textContent.trim() === "Đà Nẵng").click()');
      await waitFor('document.querySelectorAll("article").length === 0');
      assert.ok(await evaluate('document.body.innerText.includes("Không có địa điểm phù hợp")'));
      await evaluate('[...document.querySelectorAll("button")].find(button => button.textContent.trim() === "Tất cả").click()');
      await evaluate('(() => { const select=document.querySelector("select"); select.value="quan-an"; select.dispatchEvent(new Event("change", {bubbles:true})); })()');
      await waitFor('document.querySelectorAll("article").length === 1');
      const searchInput = 'document.querySelector("input[placeholder=\\"Tìm địa điểm đã lưu\\"]")';
      await evaluate(`(() => { const input=${searchInput}; input.value='O Xuân'; input.dispatchEvent(new Event('input', {bubbles:true})); })()`);
      await waitFor('document.querySelectorAll("article").length === 1');
      assert.ok(await evaluate('document.querySelector("article").innerText.includes("Bún bò O Xuân")'));
    });

    await t.test('Heart opens the collection picker and only the last removal clears Saved after reload', async () => {
      await open('places');
      await evaluate('document.querySelector("article button[aria-pressed=true]").click()');
      await waitFor('!!document.querySelector("[role=dialog]")');
      assert.ok(await evaluate('document.querySelector("[role=dialog]").innerText.includes("Lưu vào bộ sưu tập")'));
      await evaluate(`[...document.querySelectorAll('[role=dialog] button[aria-pressed=true]')].find(button => button.innerText.includes('Địa điểm của tôi')).click()`);
      await waitFor('window.savedPlacesRequests.some(request => request.method === "DELETE") && document.querySelectorAll("article").length === 3');
      await delay(200);
      await evaluate(`document.querySelector('[role=dialog] button[aria-label="Đóng"]').click()`);
      await send('Page.reload');
      await waitFor('document.querySelectorAll("[role=tab]").length === 2');
      await evaluate('[...document.querySelectorAll("[role=tab]")].find(button => button.textContent.includes("Địa điểm")).click()');
      await waitFor('document.querySelectorAll("article").length === 3');
      assert.equal(await evaluate('document.querySelectorAll("article button[aria-pressed=true]").length'), 3);
      await evaluate('document.querySelector("article button[aria-pressed=true]").click()');
      await waitFor('!!document.querySelector("[role=dialog]")');
      await evaluate(`[...document.querySelectorAll('[role=dialog] button[aria-pressed=true]')].find(button => button.innerText.includes('Cuối tuần')).click()`);
      await waitFor('document.querySelectorAll("article").length === 2');
      assert.equal(await evaluate('document.querySelectorAll("article button[aria-pressed=true]").length'), 2);
      assert.ok(await evaluate('window.savedPlacesRequests.some(request => request.path.includes("/collections/") && request.method === "DELETE")'));
    });

    await t.test('creating from the picker saves to the new collection', async () => {
      await open('collections');
      await evaluate('document.querySelector("#collection-heart").click()');
      await waitFor('!!document.querySelector("[role=dialog]")');
      await evaluate('[...document.querySelectorAll("[role=dialog] button")].find(button => button.textContent.includes("Tạo bộ sưu tập")).click()');
      await evaluate('(() => { const input=document.querySelector("#new-saved-collection"); const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set; setter.call(input,"Huế muốn ghé"); input.dispatchEvent(new Event("input", {bubbles:true})); })()');
      await evaluate('[...document.querySelectorAll("[role=dialog] button")].find(button => button.textContent.includes("Tạo và lưu")).click()');
      await waitFor('document.querySelector("[role=dialog]").innerText.includes("Huế muốn ghé")');
      assert.ok(await evaluate('window.savedPlacesRequests.some(request => request.method === "POST" && request.path === "/saved-places/collections")'));
      assert.ok(await evaluate('window.savedPlacesRequests.some(request => request.method === "POST" && request.path.includes("/collections/") && request.path.includes("/places/"))'));
      await evaluate(`document.querySelector('[role=dialog] button[aria-label="Đóng"]').click()`);
      await waitFor('document.body.innerText.includes("Huế muốn ghé")');
    });

    await t.test('deleting a collection moves its POI to the default collection', async () => {
      await open('collections');
      await evaluate('[...document.querySelectorAll("button")].find(button => button.textContent.includes("Cuối tuần")).click()');
      await waitFor('document.querySelectorAll("article").length === 1');
      await evaluate('[...document.querySelectorAll("button")].find(button => button.textContent.includes("Xóa bộ sưu tập")).click()');
      await waitFor('!!document.querySelector("[role=dialog]")');
      await evaluate('[...document.querySelectorAll("[role=dialog] button")].find(button => button.textContent.includes("Xóa bộ sưu tập")).click()');
      await waitFor('!document.querySelector("[role=dialog]") && document.body.innerText.includes("Bộ sưu tập của bạn")');
      assert.ok(await evaluate('JSON.parse(sessionStorage.getItem("saved_places_test_memberships"))["collection-default"].includes("' + firstPoiId + '")'));
      assert.equal(await evaluate('JSON.parse(sessionStorage.getItem("saved_places_test_server_ids")).length'), 3);
    });

    await t.test('mutation errors can be retried and empty state reflows at 320px', async () => {
      await open('places');
      await evaluate('sessionStorage.setItem("saved_places_test_fail_mutation", "1")');
      await evaluate('document.querySelector("article button[aria-pressed=true]").click()');
      await waitFor('!!document.querySelector("[role=dialog]")');
      await evaluate(`document.querySelector('[role=dialog] button[aria-pressed=true]').click()`);
      await waitFor('!!document.querySelector("[role=dialog] [role=alert]")');
      assert.equal(await evaluate('document.querySelectorAll("article").length'), 3);
      await evaluate(`document.querySelector('[role=dialog] button[aria-label="Đóng"]').click()`);
      await evaluate('sessionStorage.setItem("saved_places_test_fail_get", "1"); location.reload()');
      await waitFor('!!document.querySelector("[role=alert]") && [...document.querySelectorAll("button")].some(button => button.textContent.includes("Thử tải lại"))');
      await evaluate('[...document.querySelectorAll("button")].find(button => button.textContent.includes("Thử tải lại")).click()');
      await waitFor('document.querySelectorAll("[role=tab]").length === 2');
      await evaluate('[...document.querySelectorAll("[role=tab]")].find(button => button.textContent.includes("Địa điểm")).click()');
      await waitFor('document.querySelectorAll("article").length === 3');
      await open('places', { empty: true });
      await waitFor('document.body.innerText.includes("Chưa có địa điểm nào được lưu")');
      for (const width of [320, 1280]) {
        await send('Emulation.setDeviceMetricsOverride', { width, height: 800, deviceScaleFactor: 1, mobile: false });
        assert.ok(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'));
      }
    });

    await t.test('unauthenticated Heart asks for login without creating a local save', async () => {
      await open('collections');
      await evaluate('localStorage.removeItem("access_token"); sessionStorage.removeItem("access_token"); window.dispatchEvent(new Event("auth-change")); document.querySelector("#collection-heart").click()');
      await waitFor('window.savedTestPath === "/login"');
      assert.equal(await evaluate('window.savedTestReturnTo'), '/saved');
      assert.equal(await evaluate('window.savedPlacesRequests.filter(request => request.method === "POST").length'), 0);
      assert.equal(await evaluate('localStorage.getItem("greentrip_favorites")'), null);
      assert.deepEqual(errors, [], 'No uncaught browser runtime errors');
    });
  } finally {
    socket?.close();
    browser.kill();
    await server.close();
    await delay(300);
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
