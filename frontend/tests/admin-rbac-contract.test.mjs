import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const typesAuthPath = path.resolve('src/types/auth.ts');
const adminServicePath = path.resolve('src/services/adminService.ts');
const adminGuardPath = path.resolve('src/components/admin/AdminRouteGuard.tsx');
const adminPagePath = path.resolve('src/pages/AdminDashboardPage.tsx');
const appPath = path.resolve('src/App.tsx');

test('Admin RBAC frontend files adhere strictly to Matt Pocock zero-any contract', () => {
  for (const filePath of [typesAuthPath, adminServicePath, adminGuardPath, adminPagePath]) {
    const content = fs.readFileSync(filePath, 'utf8');
    assert.ok(!/\bany\b/.test(content), `${path.basename(filePath)} must never use 'any'`);
  }

  const guardSrc = fs.readFileSync(adminGuardPath, 'utf8');
  assert.ok(guardSrc.includes('assertNever'), 'AdminRouteGuard must enforce exhaustive union handling');
  assert.ok(guardSrc.includes("case 'forbidden':"), 'AdminRouteGuard must handle HTTP 403 forbidden explicitly');

  const appSrc = fs.readFileSync(appPath, 'utf8');
  assert.ok(appSrc.includes('path="/admin"') && appSrc.includes('<AdminRouteGuard>'), '/admin route must be wrapped in AdminRouteGuard');
});

test('adminService and types/auth declare explicit runtime parsers and guard state transitions', () => {
  const typesSrc = fs.readFileSync(typesAuthPath, 'utf8');
  const serviceSrc = fs.readFileSync(adminServicePath, 'utf8');
  const pageSrc = fs.readFileSync(adminPagePath, 'utf8');

  assert.ok(typesSrc.includes('export function isUserRole('), 'isUserRole type guard must exist');
  assert.ok(typesSrc.includes('export function resolveAdminGuardState('), 'resolveAdminGuardState helper must exist');
  assert.ok(serviceSrc.includes('export function parseAdminOverview('), 'parseAdminOverview validator must exist');
  assert.ok(serviceSrc.includes('export function parseAdminPoiList('), 'parseAdminPoiList validator must exist');
  assert.ok(serviceSrc.includes('export function parseAdminPoiPatchResponse('), 'parseAdminPoiPatchResponse validator must exist');
  assert.ok(pageSrc.includes('satisfies readonly'), 'AdminDashboardPage static configs must use satisfies');
});
