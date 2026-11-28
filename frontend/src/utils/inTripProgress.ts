export type ActualStopStatus =
  | 'PLANNED'
  | 'IN_PROGRESS'
  | 'VISITED'
  | 'POSTPONED'
  | 'SKIPPED'
  | 'UNSCHEDULED';

export interface ActualStopProgress {
  stopId: string;
  poiId?: string;
  name?: string;
  status: ActualStopStatus;
  statusUpdatedAt: string;
  actualStartAt?: string;
  actualEndAt?: string;
  reasonCodes?: string[];
}

export interface TripActualProgress {
  version: 1;
  stops: ActualStopProgress[];
  movements: {stopId: string; fromDay: number; toDay: number | null; changedAt: string}[];
}

export const emptyActualProgress = (): TripActualProgress => ({version: 1, stops: [], movements: []});

export function normalizeActualProgress(value?: Partial<TripActualProgress> | null): TripActualProgress {
  if (!value || value.version !== 1 || !Array.isArray(value.stops)) return emptyActualProgress();
  const seen = new Set<string>();
  const stops = value.stops.filter((item): item is ActualStopProgress => {
    if (!item || typeof item.stopId !== 'string' || seen.has(item.stopId)) return false;
    seen.add(item.stopId);
    return ['PLANNED', 'IN_PROGRESS', 'VISITED', 'POSTPONED', 'SKIPPED', 'UNSCHEDULED'].includes(item.status);
  });
  const movements = Array.isArray(value.movements) ? value.movements : [];
  return {version: 1, stops, movements};
}

export function actualStatusForStop(progress: TripActualProgress, stopId: string): ActualStopProgress | undefined {
  return progress.stops.find((item) => item.stopId === stopId);
}

export function setActualStopStatus(
  progress: TripActualProgress,
  stop: {stopId: string; poiId?: string; name?: string},
  status: ActualStopStatus,
  statusUpdatedAt = new Date().toISOString(),
  actualTimes?: {actualStartAt?: string; actualEndAt?: string},
): TripActualProgress {
  const actualStartAt = actualTimes?.actualStartAt || actualStatusForStop(progress, stop.stopId)?.actualStartAt;
  const actualEndAt = actualTimes?.actualEndAt || actualStatusForStop(progress, stop.stopId)?.actualEndAt;
  if (actualStartAt && actualEndAt && Date.parse(actualStartAt) > Date.parse(actualEndAt)) {
    throw new Error('Thời điểm kết thúc thực tế phải sau thời điểm bắt đầu.');
  }
  const old = actualStatusForStop(progress, stop.stopId);
  if (old?.status === status && old.poiId === stop.poiId && old.name === stop.name
      && old.actualStartAt === actualStartAt && old.actualEndAt === actualEndAt) return progress;
  const next: ActualStopProgress = {
    ...old,
    stopId: stop.stopId,
    ...(stop.poiId ? {poiId: stop.poiId} : {}),
    ...(stop.name ? {name: stop.name} : {}),
    status,
    statusUpdatedAt,
    ...(actualStartAt ? {actualStartAt} : {}),
    ...(actualEndAt ? {actualEndAt} : {}),
    ...(status === 'UNSCHEDULED' ? old?.reasonCodes ? {reasonCodes: old.reasonCodes} : {} : {reasonCodes: []}),
  };
  return {
    ...progress,
    version: 1,
    stops: old
      ? progress.stops.map((item) => item.stopId === stop.stopId ? next : item)
      : [...progress.stops, next],
  };
}
