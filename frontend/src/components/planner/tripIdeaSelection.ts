export type TripIdeaSelectionAction = 'toggle' | 'add' | 'remove';

export function uniqueTripRecommendationPois<T extends { id: string }>(pois: T[]): T[] {
  const seenIds = new Set<string>();
  return pois.filter((poi) => {
    if (seenIds.has(poi.id)) return false;
    seenIds.add(poi.id);
    return true;
  });
}

export function updateTripIdeaIds(
  current: string[],
  requestedId: string,
  canonicalPoiId: string | undefined,
  poiName: string | undefined,
  action: TripIdeaSelectionAction,
): string[] {
  const normalizedName = poiName?.toLocaleLowerCase('vi-VN');
  const matchesPoi = (ideaId: string) => ideaId === requestedId
    || ideaId === canonicalPoiId
    || Boolean(normalizedName && ideaId.toLocaleLowerCase('vi-VN') === normalizedName);
  const isSelected = current.some(matchesPoi);

  if ((action === 'add' && isSelected) || (action === 'remove' && !isSelected)) {
    return current;
  }

  if (isSelected) {
    return current.filter((ideaId) => !matchesPoi(ideaId));
  }

  return Array.from(new Set([...current, canonicalPoiId || requestedId]));
}
