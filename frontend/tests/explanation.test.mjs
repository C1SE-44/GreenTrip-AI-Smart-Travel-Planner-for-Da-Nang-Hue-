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

test('GreenTrip planner flows in a real Chromium browser', { timeout: 180000 }, async (t) => {
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
    await t.test('PB11 automatically selects ranked POIs within budget and schedules them', async () => {
      await navigate('component=itinerary&auto-recommendations=yes');
      await waitFor('window.itineraryRequests.some(request => request.method === "GET")');
      await evaluate('[...document.querySelectorAll("button")].find(button => button.textContent.includes("Sắp xếp thông minh")).click()');
      await waitFor('window.autoSelectedIds.length === 2 && window.itineraryRequests.at(-1)?.payload?.days?.[0]?.stops?.some(stop => stop.title === "POI A") && window.itineraryRequests.at(-1)?.payload?.days?.[0]?.stops?.some(stop => stop.title === "POI B")');
      assert.deepEqual(await evaluate('window.autoSelectedIds'), ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222']);
      assert.ok(await evaluate('document.body.innerText.includes("ước tính 400.000 VNĐ cho 2 người")'));
      assert.ok(await evaluate('document.body.innerText.includes("Vì sao gợi ý ngày này?") && document.body.innerText.includes("Khung giờ hiện tại:")'));
      assert.ok(await evaluate('document.body.innerText.includes("Các điểm tập trung tại Đà Nẵng") && document.body.innerText.includes("đường chim bay")'));
    });
    await t.test('PB11 respects ordered best-time choices when a POI supports several periods', async () => {
      await navigate('component=itinerary&multiple-times=yes');
      await waitFor('window.itineraryRequests.some(request => request.method === "GET")');
      await evaluate('[...document.querySelectorAll("button")].find(button => button.textContent.includes("Sắp xếp thông minh")).click()');
      await waitFor('window.itineraryRequests.at(-1)?.payload?.days?.[0]?.stops?.some(stop => stop.title === "POI A") && window.itineraryRequests.at(-1)?.payload?.days?.[0]?.stops?.some(stop => stop.title === "POI B")');
      const scheduled = await evaluate('window.itineraryRequests.at(-1).payload.days[0].stops.filter(stop => stop.title.startsWith("POI ")).map(stop => ({ title: stop.title, start: stop.start_time, end: stop.end_time }))');
      assert.equal(scheduled[0].start, '08:30', 'Uses the first valid period listed by the POI');
      assert.ok(scheduled.every(stop => Number(stop.start.slice(0, 2)) < 12 || Number(stop.start.slice(0, 2)) >= 18), 'Generated hours stay within the POI supported periods');
    });
    await t.test('PB11 spreads three cafes instead of putting all of them in one day', async () => {
      await navigate('component=itinerary&cafe-cap=yes');
      await waitFor('window.itineraryRequests.some(request => request.method === "GET")');
      await evaluate('[...document.querySelectorAll("button")].find(button => button.textContent.includes("Sắp xếp thông minh")).click()');
      await waitFor('window.itineraryRequests.at(-1)?.payload?.days?.[0]?.stops?.filter(stop => stop.stop_type === "custom").length === 2');
      assert.ok(await evaluate('document.body.innerText.includes("Còn 1 địa điểm chưa xếp")'));
      assert.ok(await evaluate('document.body.innerText.includes("giới hạn tối đa 2 quán cà phê mỗi ngày")'));
    });
    await t.test('PB11 keeps user-timed appointments fixed while optimizing nearby places', async () => {
      await navigate('component=itinerary&preserve-timed-stops=yes');
      await waitFor('window.itineraryRequests.some(request => request.method === "GET")');
      await evaluate('[...document.querySelectorAll("button")].find(button => button.textContent.includes("Sắp xếp thông minh")).click()');
      await waitFor('window.itineraryRequests.at(-1)?.payload?.days?.[0]?.stops?.some(stop => stop.title === "POI A") && window.itineraryRequests.at(-1)?.payload?.days?.[0]?.stops?.some(stop => stop.title === "POI B")');
      const order = await evaluate('window.itineraryRequests.at(-1).payload.days[0].stops.map(stop => ({ title: stop.title, start: stop.start_time, end: stop.end_time }))');
      const appointmentIndex = order.findIndex(stop => stop.title === 'Cuộc hẹn cố định');
      const firstRecommendedIndex = Math.min(...order.map((stop, index) => stop.title.startsWith('POI ') ? index : Number.POSITIVE_INFINITY));
      assert.ok(appointmentIndex >= 0 && appointmentIndex < firstRecommendedIndex, 'Timed appointment stays ahead of newly scheduled places');
      assert.deepEqual(order[appointmentIndex], { title: 'Cuộc hẹn cố định', start: '11:00', end: '12:00' });
      const timedStops = order.filter(stop => stop.start && stop.end).sort((a, b) => a.start.localeCompare(b.start));
      assert.ok(timedStops.every((stop, index) => index === 0 || timedStops[index - 1].end <= stop.start), 'Automatically scheduled visits do not overlap');
    });
    await t.test('PB11 offers a one-click repair after the server rejects overlapping times', async () => {
      await navigate('component=itinerary&overlap-error=yes');
      await waitFor('window.itineraryRequests.some(request => request.method === "GET")');
      await evaluate('[...document.querySelectorAll("button")].find(button => button.textContent.includes("Sắp xếp thông minh")).click()');
      await waitFor('document.querySelector("[role=alert]")?.innerText.includes("khung giờ bị trùng")');
      const beforeRepair = await evaluate('window.itineraryRequests.filter(request => request.method === "PUT").length');
      await evaluate('[...document.querySelectorAll("button")].find(button => button.textContent.includes("Sửa giờ trùng")).click()');
      await waitFor(`window.itineraryRequests.filter(request => request.method === "PUT").length > ${beforeRepair} && !document.querySelector("[role=alert]")`);
      const repaired = await evaluate('window.itineraryRequests.at(-1).payload.days[0].stops');
      const cafe = repaired.find(stop => stop.title === 'Đi Lạc Coffee');
      const restaurant = repaired.find(stop => stop.title === 'Nhà Hàng Bếp Cuốn');
      assert.ok(cafe && restaurant, 'The repair keeps both places in the itinerary');
      assert.equal(cafe.start_time, null, 'Only the assistant-generated conflicting time is cleared');
      assert.equal(restaurant.start_time, '09:45', 'The manually timed appointment remains fixed');
    });
    await t.test('PB11 lets travelers choose a denser or more relaxed schedule', async () => {
      await navigate('component=itinerary&auto-recommendations=yes');
      await waitFor('window.itineraryRequests.some(request => request.method === "GET")');
      await evaluate('[...document.querySelectorAll("button")].find(button => button.textContent.includes("Thong thả")).click()');
      assert.ok(await evaluate('document.body.innerText.includes("thường 2 điểm")'));
      assert.ok(await evaluate('document.body.innerText.includes("Nhịp độ · 🌿 Thong thả")'));
      await evaluate('[...document.querySelectorAll("button")].find(button => button.textContent.includes("Sắp xếp thông minh")).click()');
      await waitFor('window.itineraryRequests.at(-1)?.method === "PUT" && window.itineraryRequests.at(-1)?.payload?.days?.[0]?.stops?.filter(stop => stop.stop_type !== "rest").length === 2');

      await evaluate('[...document.querySelectorAll("button")].find(button => button.textContent.includes("Dày đặc")).click()');
      assert.ok(await evaluate('document.body.innerText.includes("tới 5 điểm")'));
      assert.ok(await evaluate('document.body.innerText.includes("Nhịp độ · ⚡ Dày đặc")'));
      await evaluate('[...document.querySelectorAll("button")].find(button => button.textContent.includes("Sắp xếp thông minh")).click()');
      await waitFor('window.itineraryRequests.at(-1)?.method === "PUT" && window.itineraryRequests.at(-1)?.payload?.days?.[0]?.stops?.filter(stop => stop.stop_type !== "rest").length === 4');
    });
    await t.test('PB11 adds more suggested places at higher pacing for a multi-day trip', async () => {
      const counts = [];
      for (const [label, expectedDescription] of [['Thong thả', 'thường 2 điểm'], ['Cân bằng', 'thường 3 điểm'], ['Dày đặc', 'tới 5 điểm']]) {
        await navigate('component=itinerary&many-pois=yes');
        await waitFor('window.itineraryRequests.some(request => request.method === "GET") && window.itineraryRequests.some(request => request.method === "PUT")');
        const before = await evaluate('window.itineraryRequests.filter(request => request.method === "PUT").length');
        await evaluate(`([...document.querySelectorAll("button")].find(button => button.textContent.includes(${JSON.stringify(label)})).click())`);
        assert.ok(await evaluate(`document.body.innerText.includes(${JSON.stringify(expectedDescription)})`));
        await waitFor(`window.itineraryRequests.filter(request => request.method === "PUT").length > ${before}`);
        counts.push(await evaluate('window.itineraryRequests.at(-1).payload.days.flatMap(day => day.stops).filter(stop => stop.stop_type !== "rest").length'));
      }
      assert.deepEqual(counts, [8, 12, 16], 'With enough time, budget and varied POIs, each higher pacing level raises itinerary capacity');
      assert.ok(counts[1] > counts[0] && counts[2] > counts[1], `Higher pacing should schedule more places, got ${counts.join(' → ')}`);
    });
    await t.test('PB11 preserves custom stops, independent rest periods and edits on repeat optimization', async () => {
      await navigate('component=itinerary');
      await waitFor('document.body.innerText.includes("Sắp xếp thông minh") && window.itineraryRequests.some(request => request.method === "GET")');
      await waitFor('window.itineraryRequests.some(request => request.method === "PUT")');
      assert.ok(await evaluate('document.body.innerText.includes("Nghỉ gợi ý 09:30–10:00") && document.body.innerText.includes("Nghỉ gợi ý 12:00–14:00")'));

      await evaluate('[...document.querySelectorAll("button")].filter(button => button.textContent.includes("Thêm khoảng nghỉ vào lịch"))[1].click()');
      await waitFor('window.itineraryRequests.some(request => request.payload?.days?.[0]?.stops?.some(stop => stop.start_time === "12:00"))');
      assert.ok(await evaluate('[...document.querySelectorAll("button")].some(button => button.textContent.includes("Thêm khoảng nghỉ vào lịch"))'), 'Morning rest remains addable after lunch is scheduled');

      await evaluate('[...document.querySelectorAll("button")].find(button => button.textContent.includes("Sắp xếp thông minh")).click()');
      await waitFor('document.body.innerText.includes("Đã xếp 2 địa điểm")');
      await waitFor('window.itineraryRequests.at(-1)?.payload?.days?.[0]?.stops?.filter(stop => stop.stop_type === "custom").length === 2 && window.itineraryRequests.at(-1)?.payload?.days?.[0]?.stops?.filter(stop => stop.stop_type === "rest").length === 2');

      await evaluate(`(() => {
        const city = [...document.querySelectorAll('label')].find(label => label.textContent.includes('Thành phố'))?.querySelector('select');
        const address = document.querySelector('input[placeholder="Thêm địa chỉ"]');
        const comment = document.querySelector('textarea[placeholder="Thêm ghi chú cho địa điểm này…"]');
        const setValue = (element, value, constructor, eventName) => {
          Object.getOwnPropertyDescriptor(constructor.prototype, 'value').set.call(element, value);
          element.dispatchEvent(new Event(eventName, { bubbles: true }));
        };
        setValue(city, 'Huế', HTMLSelectElement, 'change');
        setValue(address, 'Khu vực kiểm thử', HTMLInputElement, 'input');
        setValue(comment, 'Ghé vào buổi sáng', HTMLTextAreaElement, 'input');
      })()`);
      await waitFor('window.itineraryRequests.at(-1)?.payload?.days?.[0]?.stops?.some(stop => stop.stop_type === "custom" && stop.city === "Huế" && stop.address === "Khu vực kiểm thử" && stop.comment === "Ghé vào buổi sáng")');

      const previousWrites = await evaluate('window.itineraryRequests.filter(request => request.method === "PUT").length');
      await evaluate('[...document.querySelectorAll("button")].find(button => button.textContent.includes("Sắp xếp thông minh")).click()');
      await waitFor(`window.itineraryRequests.filter(request => request.method === "PUT").length > ${previousWrites}`);
      assert.equal(await evaluate('window.itineraryRequests.at(-1).payload.days[0].stops.filter(stop => stop.stop_type === "custom").length'), 2);
      assert.equal(await evaluate('window.itineraryRequests.at(-1).payload.days[0].stops.filter(stop => stop.stop_type === "rest").length'), 2);
      for (const width of [320, 1280]) {
        await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
        assert.ok(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), `PB11 reflows without horizontal overflow at ${width}px`);
      }
      assert.deepEqual(errors, [], 'PB11 itinerary interactions have no uncaught browser errors');
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
