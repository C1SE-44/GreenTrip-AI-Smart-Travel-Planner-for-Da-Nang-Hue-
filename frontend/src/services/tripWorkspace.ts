import { fetchJson } from '@/lib/api';
import type { UserTrip } from '@/pages/ExplorePage';
import type { OwnedTripSummary } from '@/utils/accountTrips';

const tokenNow = () => localStorage.getItem('access_token') || sessionStorage.getItem('access_token') || '';
const writes = new Map<string, Promise<UserTrip>>();
const saved = new Map<string, UserTrip>();
const bodyOf = (trip: UserTrip) => {
  const { workspaceRevision: _revision, copilotChatHistory: _chat, ...data } = trip;
  void _revision; void _chat;
  return data;
};

export async function listTripWorkspaces() {
  const token = tokenNow();
  await Promise.all([...writes].filter(([key])=>key.startsWith(`${token}:`)).map(([,pending])=>pending));
  if (token !== tokenNow()) throw new Error('Tài khoản đã thay đổi.');
  const [workspaces, legacy] = await Promise.all([
    fetchJson<{items: UserTrip[]; deleted_ids: string[]}>('/trip-workspaces', {signal: AbortSignal.timeout(12000)}),
    fetchJson<OwnedTripSummary[]>('/my-trips', {signal: AbortSignal.timeout(12000)}),
  ]);
  if (token !== tokenNow()) throw new Error('Tài khoản đã thay đổi.');
  for (const trip of workspaces.items) saved.set(`${token}:${trip.id}`, trip);
  const known = new Set([...workspaces.items.map(t => t.id), ...workspaces.deleted_ids]);
  const legacyTrips: UserTrip[] = legacy
    .filter((trip) => !known.has(trip.trip_id))
    .map((trip) => ({
      id: trip.trip_id,
      title: trip.title,
      destination: trip.destination,
      startDate: trip.start_date || undefined,
      daysCount: trip.days_count,
      peopleCount: 2,
      createdAt: '',
    }));
  return [...workspaces.items, ...legacyTrips];
}

export function saveTripWorkspace(trip: UserTrip): Promise<UserTrip> {
  const token = tokenNow();
  if (!token) return Promise.reject(new Error('Đăng nhập để lưu chuyến đi.'));
  const key = `${token}:${trip.id}`;
  const preceding = writes.get(key);
  const pending = (async () => {
    await preceding?.catch(() => undefined);
    if (token !== tokenNow()) throw new Error('Tài khoản đã thay đổi; chưa lưu thay đổi này.');
    const previous = saved.get(key);
    if (previous && JSON.stringify(bodyOf(previous)) === JSON.stringify(bodyOf(trip)) && (previous.workspaceRevision || 0) >= (trip.workspaceRevision || 0)) return previous;
    const revision = Math.max(trip.workspaceRevision || 0, previous?.workspaceRevision || 0) || null;
    const result = await fetchJson<UserTrip>(`/trip-workspaces/${encodeURIComponent(trip.id)}`, {
      method: 'PUT', headers: {'Content-Type':'application/json', Authorization:`Bearer ${token}`},
      body: JSON.stringify({data: bodyOf(trip), expected_revision: revision}),
    });
    saved.set(key,result);
    return result;
  })();
  writes.set(key,pending);
  void pending.finally(() => { if (writes.get(key) === pending) writes.delete(key); }).catch(() => undefined);
  return pending;
}

export async function deleteTripWorkspace(id: string) {
  const token=tokenNow();
  if (!token) throw new Error('Đăng nhập để xóa chuyến đi.');
  await writes.get(`${token}:${id}`)?.catch(() => undefined);
  if(token!==tokenNow())throw new Error('Tài khoản đã thay đổi.');
  await fetchJson(`/trip-workspaces/${encodeURIComponent(id)}`,{method:'DELETE',headers:{Authorization:`Bearer ${token}`}});
  saved.delete(`${token}:${id}`);
}
