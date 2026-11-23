import type { UserTrip } from '@/pages/ExplorePage';

export const tripStorageKey = (userId: string) => `greentrip_user_trips:${userId}`;

interface OwnedTrip {
  trip_id: string;
  title: string;
  destination: string;
  days_count: number;
  start_date?: string;
}

function readTrips(storage: Storage, key: string): UserTrip[] | null {
  try {
    const raw = storage.getItem(key);
    if (raw === null) return null;
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value)
      ? value.filter((trip): trip is UserTrip => Boolean(trip && typeof trip.id === 'string' && !trip.id.startsWith('sample-')))
      : null;
  } catch { return null; }
}

export async function loadAccountTrips(storage: Storage, userId: string, getOwned: () => Promise<(OwnedTrip | UserTrip)[]>, migrate?: (trip: UserTrip) => Promise<UserTrip>): Promise<UserTrip[]> {
  // Cache is a migration backup, never proof of ownership or the source of current server data.
  const cached = readTrips(storage, tripStorageKey(userId)) || [];
  const legacy = readTrips(storage, 'greentrip_user_trips') || [];
  const owned = await getOwned();
  const result: UserTrip[] = [];
  for (const remote of owned) {
    if ('id' in remote) { result.push(remote); continue; }
    const previous = cached.find(t => t.id === remote.trip_id) || legacy.find(t => t.id === remote.trip_id);
    const trip = {...previous, id:remote.trip_id, title:remote.title, destination:remote.destination,
      daysCount:remote.days_count, startDate:remote.start_date, peopleCount:previous?.peopleCount || 2, createdAt:previous?.createdAt || ''};
    // A stale migration cache must not block server-owned trips that already loaded.
    if (!migrate) { result.push(trip); continue; }
    try {result.push(await migrate({...trip,workspaceRevision:undefined}));}
    catch(error) {if ((error as {status?:number}).status === 409) result.push(trip); else throw error;}
  }
  if (migrate) for (const trip of cached) {
    if (result.some(t => t.id===trip.id)) continue;
    try { result.push(await migrate(trip)); }
    catch (error) { if (![403,409,410].includes((error as {status?:number}).status || 0)) throw error; }
  }
  return result;
}
