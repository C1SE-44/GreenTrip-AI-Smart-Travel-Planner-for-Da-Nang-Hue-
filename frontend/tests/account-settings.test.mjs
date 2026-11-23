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

test('Account menu, full-width profile, avatar, password, logout, and mobile layout', { timeout: 180000 }, async () => {
  assert.ok(browserPath, 'Set CHROME_PATH to a local Chromium executable');
  const profile = await mkdtemp(path.join(tmpdir(), 'greentrip-account-settings-'));
  const testPort = await getAvailablePort();
  const server = await createServer({
    configFile: false, cacheDir: path.join(root, 'node_modules', '.vite-test-'+path.basename(profile)),
    root,
    envDir: profile,
    plugins: [react(), {
      name: 'account-settings-test-page',
      configureServer(vite) {
        vite.middlewares.use('/__account-test', async (_req, res) => {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(await vite.transformIndexHtml('/__account-test', '<div id="root"></div><script type="module" src="/tests/account-settings-harness.tsx"></script>'));
        });
      },
    }],
    resolve: { alias: { '@': path.join(root, 'src') } },
    server: { host: '127.0.0.1', port: testPort, strictPort: true },
  });
  await server.listen();
  await server.transformRequest('/tests/account-settings-harness.tsx');
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
    let sequence = 0;
    const pending = new Map();
    const errors = [];
    socket.onmessage = ({ data }) => {
      const message = JSON.parse(data);
      if (message.method === 'Runtime.exceptionThrown') {
        errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
      }
      if (message.id) {
        const current = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) current.reject(new Error(message.error.message));
        else current.resolve(message.result);
      }
    };
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++sequence;
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
      throw new Error(`Timed out waiting for ${expression}\n${errors.join('\n')}`);
    };
    const setValue = (selector, value) => evaluate(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(element, ${JSON.stringify(value)});
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);

    await send('Runtime.enable');
    await send('Page.enable');
    await send('Page.navigate', { url: `${base}/__account-test` });
    await waitFor('!!document.querySelector("button[aria-label^=\\"Menu tài khoản của\\"]")');
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

    await evaluate('document.querySelector("button[aria-label^=\\"Menu tài khoản của\\"]").click()');
    await waitFor('document.body.innerText.includes("Hồ sơ của tôi")');
    await evaluate('[...document.querySelectorAll("button")].find(button => button.textContent.includes("Hồ sơ của tôi")).click()');
    await waitFor('!!document.querySelector("main[data-purpose=profile-page]")');
    assert.equal(await evaluate('document.querySelector("[role=dialog]")'), null);
    assert.equal(await evaluate('document.querySelector("main[data-purpose=profile-page]").getBoundingClientRect().width > window.innerWidth * 0.8'), true);
    assert.equal(await evaluate('[...document.querySelectorAll("main[data-purpose=profile-page] button")].some(button => button.textContent.includes("Đăng xuất"))'), true);
    assert.equal(await evaluate('document.querySelector("#profile-email").readOnly'), true);

    await setValue('#profile-full-name', 'Updated Green Traveler');
    await setValue('#profile-phone', '+84901234567');
    await evaluate('document.querySelector("main[data-purpose=profile-page] form button[type=submit]").click()');
    await waitFor('window.accountSettingsRequests.some(request => request.path === "/auth/me" && request.method === "PATCH")');
    assert.deepEqual(await evaluate('window.accountSettingsRequests.find(request => request.method === "PATCH").body'), {
      full_name: 'Updated Green Traveler', phone: '+84901234567',
    });
    await waitFor('document.querySelector("button[aria-label^=\\"Menu tài khoản của\\"]").getAttribute("aria-label").includes("Updated Green Traveler")');

    await evaluate(`(() => {
      const input = document.querySelector('input[type="file"]');
      const file = new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], 'avatar.png', { type: 'image/png' });
      Object.defineProperty(input, 'files', { configurable: true, value: [file] });
      input.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await waitFor('document.querySelector("main[data-purpose=profile-page]").innerText.includes("Tải ảnh lên")');
    await evaluate('[...document.querySelectorAll("main[data-purpose=profile-page] button")].find(button => button.textContent.includes("Tải ảnh lên")).click()');
    await waitFor('window.accountSettingsRequests.some(request => request.path === "/auth/me/avatar" && request.method === "PUT")');
    assert.deepEqual(await evaluate('window.accountSettingsRequests.find(request => request.method === "PUT").body'), {
      size: 8, type: 'image/png',
    });
    await waitFor('document.querySelector("button[aria-label^=\\"Menu tài khoản của\\"] img")?.src.includes("user-avatar.png")');

    await evaluate('[...document.querySelectorAll("main[data-purpose=profile-page] button")].find(button => button.textContent.includes("Đổi mật khẩu")).click()');
    await setValue('#current-password', 'old-password-123');
    await setValue('#new-password', 'new-password-456');
    await setValue('#confirm-password', 'new-password-456');
    await evaluate('document.querySelector("#current-password").closest("form").querySelector("button[type=submit]").click()');
    await waitFor('window.accountSettingsRequests.some(request => request.path === "/auth/change-password")');
    assert.equal(await evaluate('document.body.innerText.includes("Mật khẩu đã được thay đổi.")'), true);
    assert.equal(await evaluate('window.accountSettingsRequests.every(request => request.authorization === "Bearer account-test-token")'), true);

    await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 740, deviceScaleFactor: 1, mobile: true });
    assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true);
    await evaluate('document.querySelector("main[data-purpose=profile-page] button[aria-label=\\"Quay lại Khám phá\\"]").click()');
    await waitFor('!document.querySelector("main[data-purpose=profile-page]")');

    await evaluate('document.querySelector("button[aria-label^=\\"Menu tài khoản của\\"]").click()');
    await evaluate('[...document.querySelectorAll("button")].find(button => button.textContent.includes("Đăng xuất")).click()');
    assert.equal(await evaluate('localStorage.getItem("access_token")'), null);
    assert.equal(await evaluate('sessionStorage.getItem("access_token")'), null);
    assert.equal(await evaluate('document.querySelector("button[aria-label=\\"Mở menu tài khoản\\"]") !== null'), true);
    assert.deepEqual(errors, [], `No uncaught browser runtime errors: ${errors.join('\n')}`);
  } finally {
    socket?.close();
    browser.kill();
    await server.close();
    await delay(300);
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
