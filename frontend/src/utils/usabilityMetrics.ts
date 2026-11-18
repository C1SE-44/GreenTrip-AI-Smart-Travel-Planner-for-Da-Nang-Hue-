const START_KEY = 'greentrip_onboarding_start_ts';
const METRICS_KEY = 'greentrip_usability_metrics';

export interface UsabilityMetricsStore {
  firstItinerarySeconds: Record<string, number>;
  csat: Record<string, { score: number; updatedAt: string }>;
}

function readStore(): UsabilityMetricsStore {
  if (typeof localStorage === 'undefined') {
    return { firstItinerarySeconds: {}, csat: {} };
  }
  try {
    const raw = localStorage.getItem(METRICS_KEY);
    if (!raw) return { firstItinerarySeconds: {}, csat: {} };
    const parsed = JSON.parse(raw) as Partial<UsabilityMetricsStore>;
    return {
      firstItinerarySeconds: parsed.firstItinerarySeconds ?? {},
      csat: parsed.csat ?? {},
    };
  } catch {
    return { firstItinerarySeconds: {}, csat: {} };
  }
}

function writeStore(store: UsabilityMetricsStore): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(METRICS_KEY, JSON.stringify(store));
  } catch {
    // Ignore storage quota errors
  }
}

export function markOnboardingStart(): void {
  if (typeof sessionStorage === 'undefined') return;
  if (!sessionStorage.getItem(START_KEY)) {
    sessionStorage.setItem(START_KEY, String(Date.now()));
  }
}

export function recordFirstItineraryReady(tripId: string): number | null {
  if (typeof sessionStorage === 'undefined') return null;
  const rawStart = sessionStorage.getItem(START_KEY);
  if (!rawStart) return null;
  const elapsedSec = Math.max(1, Math.round((Date.now() - Number(rawStart)) / 1000));
  sessionStorage.removeItem(START_KEY);
  const store = readStore();
  store.firstItinerarySeconds[tripId] = elapsedSec;
  writeStore(store);
  return elapsedSec;
}

export function saveCsatFeedback(tripId: string, score: number): void {
  const store = readStore();
  store.csat[tripId] = { score, updatedAt: new Date().toISOString() };
  writeStore(store);
}
