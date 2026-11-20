import type { UserTrip } from '@/components/explore/exploreUtils';

export const tripStorageKey = (userId: string) => `greentrip_user_trips:${userId}`;

export interface OwnedTripSummary {
  trip_id: string;
  title: string;
  destination: string;
  days_count: number;
  start_date?: string | null;
}

function readTrips(storage: Storage, key: string): UserTrip[] | null {
  try {
    const raw = storage.getItem(key);
    if (raw === null) return null;
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value)
      ? value.filter((trip): trip is UserTrip => Boolean(trip && typeof trip.id === 'string' && !trip.id.startsWith('sample-')))
      : null;
  } catch {
    return null;
  }
}

export async function loadAccountTrips(
  storage: Storage,
  userId: string,
  getOwned: () => Promise<(OwnedTripSummary | UserTrip)[]>,
  migrate?: (trip: UserTrip) => Promise<UserTrip>
): Promise<UserTrip[]> {
  // Cache is a migration backup, never proof of ownership or the source of current server data.
  const cached = readTrips(storage, tripStorageKey(userId)) || [];
  const legacy = readTrips(storage, 'greentrip_user_trips') || [];
  const owned = await getOwned();
  const result: UserTrip[] = [];
  for (const remote of owned) {
    if ('id' in remote) {
      result.push(remote);
      continue;
    }
    const previous = cached.find((t) => t.id === remote.trip_id) || legacy.find((t) => t.id === remote.trip_id);
    const trip: UserTrip = {
      ...previous,
      id: remote.trip_id,
      title: remote.title,
      destination: remote.destination,
      daysCount: remote.days_count,
      startDate: remote.start_date || previous?.startDate || '',
      peopleCount: previous?.peopleCount || 2,
      createdAt: previous?.createdAt || '',
    };
    result.push(migrate ? await migrate(trip) : trip);
  }
  if (migrate) {
    for (const trip of cached) {
      if (result.some((t) => t.id === trip.id)) continue;
      try {
        result.push(await migrate(trip));
      } catch (error) {
        if (![403, 410].includes((error as { status?: number }).status || 0)) throw error;
      }
    }
  }
  return result;
}
