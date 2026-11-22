import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');

function loadDemoQrUtils() {
  const source = fs.readFileSync(path.resolve('src/utils/demoQr.ts'), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    URL,
    Set,
    RegExp,
    console,
  });
  return exports;
}

test('demoQr utils normalize public domains, localhost, private LAN IPs, and reject invalid protocols', () => {
  const utils = loadDemoQrUtils();

  const bareDomain = utils.normalizePublicBaseUrl('greentrip.vn/', 'http://127.0.0.1:5173');
  assert.equal(bareDomain.url, 'https://greentrip.vn');
  assert.equal(bareDomain.error, null);
  assert.equal(bareDomain.isLocalhost, false);
  assert.equal(bareDomain.isHttps, true);

  const httpsDomain = utils.normalizePublicBaseUrl('https://greentripai.site///', 'http://127.0.0.1:5173');
  assert.equal(httpsDomain.url, 'https://greentripai.site');
  assert.equal(httpsDomain.error, null);
  assert.equal(httpsDomain.isHttps, true);

  const localHost = utils.normalizePublicBaseUrl('http://localhost:5173', 'http://127.0.0.1:5173');
  assert.equal(localHost.url, 'http://localhost:5173');
  assert.equal(localHost.isLocalhost, true);
  assert.equal(localHost.isHttps, false);

  const lanIp = utils.normalizePublicBaseUrl('192.168.1.25:5173', 'http://127.0.0.1:5173');
  assert.equal(lanIp.url, 'http://192.168.1.25:5173');
  assert.equal(lanIp.error, null);
  assert.equal(lanIp.isLocalhost, false);
  assert.equal(lanIp.isHttps, false);

  const emptyFallback = utils.normalizePublicBaseUrl('   ', 'https://demo.greentrip.vn');
  assert.equal(emptyFallback.url, 'https://demo.greentrip.vn');
  assert.equal(emptyFallback.error, null);

  const invalidProto = utils.normalizePublicBaseUrl('ftp://greentrip.vn', 'https://demo.greentrip.vn');
  assert.equal(invalidProto.url, 'https://demo.greentrip.vn');
  assert.ok(invalidProto.error && invalidProto.error.length > 0);

  assert.equal(utils.buildDemoQrUrl('https://greentrip.vn/', '/explore'), 'https://greentrip.vn/explore');
  assert.equal(utils.buildDemoQrUrl('https://greentrip.vn', 'admin'), 'https://greentrip.vn/admin');
});

test('DemoQrPage and App.tsx wire /demo-qr with strict zero-any TypeScript', () => {
  const utilSrc = fs.readFileSync(path.resolve('src/utils/demoQr.ts'), 'utf8');
  const pageSrc = fs.readFileSync(path.resolve('src/pages/DemoQrPage.tsx'), 'utf8');
  const appSrc = fs.readFileSync(path.resolve('src/App.tsx'), 'utf8');

  for (const [name, src] of [
    ['demoQr.ts', utilSrc],
    ['DemoQrPage.tsx', pageSrc],
  ]) {
    assert.ok(!/\bany\b/.test(src), `${name} must never use 'any'`);
  }

  assert.ok(appSrc.includes('path="/demo-qr"') && appSrc.includes('<DemoQrPage />'), '/demo-qr route must be wired in App.tsx');
  assert.ok(pageSrc.includes('DEMO_QR_PRESETS'), 'DemoQrPage must render committee presets');
});

test('VPS production Docker/Caddy files enforce multi-stage, non-root, healthcheck, and HTTPS isolation', () => {
  const rootDir = path.resolve('..');
  const backendProd = fs.readFileSync(path.join(rootDir, 'backend/Dockerfile.prod'), 'utf8');
  const frontendProd = fs.readFileSync(path.join(rootDir, 'frontend/Dockerfile.prod'), 'utf8');
  const composeProd = fs.readFileSync(path.join(rootDir, 'docker-compose.prod.yml'), 'utf8');
  const caddyfile = fs.readFileSync(path.join(rootDir, 'deploy/Caddyfile'), 'utf8');
  const rootDockerIgnore = fs.readFileSync(path.join(rootDir, '.dockerignore'), 'utf8');

  assert.ok(backendProd.includes('AS builder') && backendProd.includes('AS runtime'));
  assert.ok(backendProd.includes('USER appuser') && backendProd.includes('HEALTHCHECK'));
  assert.ok(!backendProd.includes('--reload'), 'backend Dockerfile.prod must never run uvicorn with --reload');

  assert.ok(frontendProd.includes('AS builder') && frontendProd.includes('AS runtime'));
  assert.ok(frontendProd.includes('nginx-unprivileged') && frontendProd.includes('USER 101') && frontendProd.includes('HEALTHCHECK'));

  assert.ok(composeProd.includes('redis:') && composeProd.includes('backend:') && composeProd.includes('frontend:') && composeProd.includes('caddy:'));
  const portsMatches = composeProd.match(/^\s{4}ports:/gm) ?? [];
  assert.equal(portsMatches.length, 1, 'Only caddy should expose host ports in docker-compose.prod.yml');

  assert.ok(caddyfile.includes('Strict-Transport-Security'));
  assert.ok(caddyfile.includes('handle_path /api/*') && caddyfile.includes('flush_interval -1'));
  assert.ok(caddyfile.includes('reverse_proxy frontend:8080'));

  assert.ok(rootDockerIgnore.includes('.env'), 'Root .dockerignore must exclude .env secrets');
});
