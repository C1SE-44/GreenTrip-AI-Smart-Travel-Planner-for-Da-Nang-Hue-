/* eslint-disable react-refresh/only-export-components -- Browser test entry point. */
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import AccountMenu from '../src/components/account/AccountMenu';
import ProfileSettingsPage from '../src/components/account/ProfileSettingsPage';
import { clearAuthSession, type UserProfile } from '../src/services/auth';
import '../src/index.css';

const initialUser: UserProfile = {
  user_id: 'profile-test-user',
  full_name: 'Green Traveler',
  email: 'traveler@example.test',
  phone: '09012345678',
  role: 'USER',
  status: 'ACTIVE',
  created_at: '2026-11-15T00:00:00Z',
  updated_at: '2026-11-15T00:00:00Z',
  avatar_url: null,
  has_password: true,
};

const requests: Array<{ path: string; method: string; authorization: string | null; body: unknown }> = [];
let fixtureUser = initialUser;
Object.assign(window, { accountSettingsRequests: requests });
localStorage.setItem('access_token', 'account-test-token');
sessionStorage.setItem('access_token', 'account-test-session-token');
window.fetch = async (input, init) => {
  const url = new URL(String(input), location.href);
  const method = init?.method ?? 'GET';
  const headers = new Headers(init?.headers);
  let body: unknown = init?.body ?? null;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { /* Keep raw body for assertions. */ }
  } else if (body instanceof Blob) {
    body = { size: body.size, type: body.type };
  }
  requests.push({ path: url.pathname, method, authorization: headers.get('Authorization'), body });

  if (url.pathname === '/auth/me' && method === 'PATCH') {
    fixtureUser = { ...fixtureUser, ...(body as object), updated_at: new Date().toISOString() };
    return new Response(JSON.stringify(fixtureUser), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  if (url.pathname === '/auth/change-password' && method === 'POST') {
    return new Response(null, { status: 204 });
  }
  if (url.pathname === '/auth/me/avatar' && method === 'PUT') {
    fixtureUser = { ...fixtureUser, avatar_url: 'https://storage.example.test/user-avatar.png' };
    return new Response(JSON.stringify(fixtureUser), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  return new Response(JSON.stringify({ detail: 'Unexpected test request' }), { status: 500 });
};

function AccountSettingsHarness() {
  const [user, setUser] = useState<UserProfile | null>(initialUser);
  const [profileOpen, setProfileOpen] = useState(false);
  return (
    <MemoryRouter>
      <div className="min-h-screen bg-neutral-50 p-8">
        <aside className="fixed bottom-0 left-0 w-72 border-r border-neutral-200 bg-white p-4">
          <AccountMenu
            user={user}
            collapsed={false}
            onOpenProfile={() => setProfileOpen(true)}
            onLogout={() => { clearAuthSession(); setUser(null); }}
          />
        </aside>
        <h1 className="text-lg">Account settings browser harness</h1>
        {profileOpen && (
          <ProfileSettingsPage
            user={user}
            loading={false}
            onBack={() => setProfileOpen(false)}
            onLogin={() => setProfileOpen(false)}
            onLogout={() => { clearAuthSession(); setUser(null); setProfileOpen(false); }}
            onProfileUpdated={setUser}
          />
        )}
      </div>
    </MemoryRouter>
  );
}

createRoot(document.getElementById('root')!).render(<AccountSettingsHarness />);
