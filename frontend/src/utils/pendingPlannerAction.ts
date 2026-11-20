import type { UserTrip } from '@/components/explore/exploreUtils';

export const PENDING_PLANNER_ACTION_KEY = 'greentrip_pending_planner_action';

export type PendingPlannerAction =
  | { type: 'create_trip'; poiIds?: string[] }
  | { type: 'quick_launch'; trip: UserTrip }
  | { type: 'clone_sample'; sampleTripId: string };

export function hasAuthToken(): boolean {
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('access_token')) {
      return true;
    }
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('access_token')) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function savePendingPlannerAction(action: PendingPlannerAction): void {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(PENDING_PLANNER_ACTION_KEY, JSON.stringify(action));
    }
  } catch {
    // Ignore storage quota / private mode failures
  }
}

export function consumePendingPlannerAction(): PendingPlannerAction | null {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    const raw = sessionStorage.getItem(PENDING_PLANNER_ACTION_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(PENDING_PLANNER_ACTION_KEY);
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !('type' in parsed)) {
      return null;
    }
    const candidate = parsed as Partial<PendingPlannerAction>;
    if (candidate.type === 'create_trip') {
      return {
        type: 'create_trip',
        poiIds: Array.isArray(candidate.poiIds) ? candidate.poiIds.map(String) : undefined,
      };
    }
    if (candidate.type === 'quick_launch' && candidate.trip && typeof candidate.trip.id === 'string') {
      return { type: 'quick_launch', trip: candidate.trip };
    }
    if (candidate.type === 'clone_sample' && typeof candidate.sampleTripId === 'string') {
      return { type: 'clone_sample', sampleTripId: candidate.sampleTripId };
    }
    return null;
  } catch {
    return null;
  }
}
