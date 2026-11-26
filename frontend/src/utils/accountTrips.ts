import type { UserTrip } from '@/components/explore/exploreUtils';

export const tripStorageKey = (userId: string) => `greentrip_user_trips:${userId}`;
export const GUEST_TRIPS_STORAGE_KEY = 'greentrip_guest_trips';

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

export function loadGuestTrips(storage: Storage): UserTrip[] {
  return readTrips(storage, GUEST_TRIPS_STORAGE_KEY) || [];
}

export function saveGuestTrips(storage: Storage, trips: UserTrip[]): boolean {
  try {
    const guestTrips = trips.filter((trip) => !trip.id.startsWith('sample-'));
    storage.setItem(GUEST_TRIPS_STORAGE_KEY, JSON.stringify(guestTrips));
    return true;
  } catch {
    return false;
  }
}

export function loadCachedAccountTrips(storage: Storage, userId: string): UserTrip[] {
  return mergePendingDrafts(
    storage,
    userId,
    readTrips(storage, tripStorageKey(userId)) || []
  );
}

function pendingItineraryKeyPrefix(userId: string): string {
  return `greentrip_itinerary_pending_account-${encodeURIComponent(userId)}_`;
}

function loadPendingAccountTrips(storage: Storage, userId: string, cached: UserTrip[]): UserTrip[] {
  const prefix = pendingItineraryKeyPrefix(userId);
  const cachedById = new Map(cached.map((trip) => [trip.id, trip]));
  const pending: UserTrip[] = [];

  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (!key?.startsWith(prefix)) continue;

      try {
        const raw = storage.getItem(key);
        if (!raw) continue;
        const value: unknown = JSON.parse(raw);
        if (!value || typeof value !== 'object') continue;

        const itinerary = value as {
          trip_id?: unknown;
          title?: unknown;
          destination?: unknown;
          days_count?: unknown;
          start_date?: unknown;
        };
        if (
          typeof itinerary.trip_id !== 'string' ||
          itinerary.trip_id.startsWith('sample-') ||
          key !== `${prefix}${itinerary.trip_id}` ||
          typeof itinerary.title !== 'string' ||
          typeof itinerary.destination !== 'string' ||
          typeof itinerary.days_count !== 'number' ||
          !Number.isInteger(itinerary.days_count) ||
          itinerary.days_count < 1 ||
          itinerary.days_count > 31
        ) continue;

        const cachedTrip = cachedById.get(itinerary.trip_id);
        pending.push({
          ...cachedTrip,
          id: itinerary.trip_id,
          title: itinerary.title,
          destination: itinerary.destination,
          daysCount: itinerary.days_count,
          startDate: typeof itinerary.start_date === 'string' ? itinerary.start_date : cachedTrip?.startDate,
          peopleCount: cachedTrip?.peopleCount || 2,
          createdAt: cachedTrip?.createdAt || '',
        });
      } catch {
        // Ignore one malformed draft and continue loading the rest.
      }
    }
  } catch {
    // Keep the account list usable when browser storage is disabled or unavailable.
  }

  return pending;
}

function mergePendingDrafts(storage: Storage, userId: string, trips: UserTrip[]): UserTrip[] {
  const merged = [...trips];
  const knownIds = new Set(merged.map((trip) => trip.id));
  for (const pending of loadPendingAccountTrips(storage, userId, trips)) {
    if (knownIds.has(pending.id)) continue;
    knownIds.add(pending.id);
    merged.push(pending);
  }
  return merged;
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
  for (const pending of loadPendingAccountTrips(storage, userId, cached)) {
    if (!result.some((trip) => trip.id === pending.id)) result.push(pending);
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
