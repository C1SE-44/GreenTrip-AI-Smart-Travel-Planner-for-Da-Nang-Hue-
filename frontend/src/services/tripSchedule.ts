import type { UserTrip } from '@/pages/ExplorePage';
import { getTripItinerary, createEmptyItinerary, alignItineraryToTrip, saveTripItinerary } from './itineraryService';
import { saveTripWorkspace } from './tripWorkspace';

export async function saveTripSchedule(trip: UserTrip) {
  let current;
  try { current = await getTripItinerary(trip.id); }
  catch (error) {
    if ((error as {status?: number}).status !== 404) throw error;
    current = createEmptyItinerary(trip);
  }
  const aligned = alignItineraryToTrip(current, trip);
  if (aligned.warning) throw new Error(aligned.warning);
  const itinerary = await saveTripItinerary(aligned.itinerary);
  const savedTrip = await saveTripWorkspace(trip);
  return {trip: savedTrip, itinerary};
}
