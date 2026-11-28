import { fetchJson } from '@/lib/api';
import type { CommunityGreenAggregate, CommunityGreenReview, CommunityGreenReviewInput } from '@/utils/communityGreen';

const poiPath = (poiId: string) => `/pois/${encodeURIComponent(poiId)}`;

export function getCommunityGreenRating(poiId: string, signal?: AbortSignal): Promise<CommunityGreenAggregate> {
  return fetchJson<CommunityGreenAggregate>(`${poiPath(poiId)}/community-green-rating`, {signal});
}

export function getOwnCommunityGreenReview(poiId: string, signal?: AbortSignal): Promise<{review: CommunityGreenReview | null}> {
  return fetchJson<{review: CommunityGreenReview | null}>(`${poiPath(poiId)}/community-green-review`, {signal});
}

export function saveCommunityGreenReview(
  poiId: string,
  input: CommunityGreenReviewInput,
): Promise<{review: CommunityGreenReview; aggregate: CommunityGreenAggregate}> {
  return fetchJson<{review: CommunityGreenReview; aggregate: CommunityGreenAggregate}>(
    `${poiPath(poiId)}/community-green-review`,
    {method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(input)},
  );
}
