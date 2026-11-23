import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendRoot = path.resolve(__dirname, '..');

async function withViteSsr(fn) {
  const server = await createServer({
    root: frontendRoot,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });
  try {
    return await fn(server);
  } finally {
    await server.close();
  }
}

test('extractApiErrorMessage normalizes FastAPI 422 validation arrays and common auth errors into Vietnamese', async () => {
  await withViteSsr(async (server) => {
    const authMod = await server.ssrLoadModule('/src/services/auth.ts');

    assert.match(
      authMod.extractApiErrorMessage(
        { detail: [{ loc: ['body', 'password'], msg: 'String should have at least 8 characters' }] },
        'Fallback'
      ),
      /ít nhất 8 ký tự/i
    );

    assert.match(
      authMod.extractApiErrorMessage(
        { detail: [{ loc: ['body', 'email'], msg: 'Value error, Invalid email format.' }] },
        'Fallback'
      ),
      /email không hợp lệ/i
    );

    assert.match(
      authMod.extractApiErrorMessage({ detail: 'Invalid email or password' }, 'Fallback'),
      /Email hoặc mật khẩu không chính xác/i
    );

    assert.match(
      authMod.extractApiErrorMessage({ detail: 'Email is already registered.' }, 'Fallback'),
      /đã được đăng ký/i
    );

    assert.equal(authMod.extractApiErrorMessage(null, 'Lỗi mặc định'), 'Lỗi mặc định');
  });
});

test('LoginModal and Navbar enforce Mindtrip/Wanderlog Auth UX without fake mock tokens', async () => {
  const [loginModalSrc, navbarSrc] = await Promise.all([
    fs.readFile(path.join(frontendRoot, 'src/components/auth/LoginModal.tsx'), 'utf8'),
    fs.readFile(path.join(frontendRoot, 'src/components/layout/Navbar.tsx'), 'utf8'),
  ]);

  assert.ok(!loginModalSrc.includes('MOCK_USERS'), 'LoginModal must not contain MOCK_USERS');
  assert.ok(!loginModalSrc.includes('mock-user-token'), 'LoginModal must never write fake mock-user-token');
  assert.ok(loginModalSrc.includes('password.length >= 8'), 'LoginModal must enforce 8+ character password rule');
  assert.ok(loginModalSrc.includes('greentrip-auth-fullname'), 'LoginModal must include display name input on registration');
  assert.ok(loginModalSrc.includes('saveAuthSession'), 'LoginModal must persist session consistently via saveAuthSession');
  assert.ok(loginModalSrc.includes('aria-modal="true"'), 'LoginModal must declare aria-modal="true"');
  assert.ok(
    navbarSrc.includes("localStorage.setItem('greentrip_onboarding_completed', 'true')"),
    'Navbar handleLoginSuccess should mark onboarding completed for returning users'
  );
});
