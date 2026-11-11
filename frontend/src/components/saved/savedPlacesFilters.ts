import type { Poi, PoiCategory } from '@/data/pois';

export type SavedPlacesCityFilter = 'all' | 'danang' | 'hue';

export function filterSavedPlaces(
  places: Poi[],
  city: SavedPlacesCityFilter,
  category: PoiCategory | 'all',
): Poi[] {
  return places.filter((place) => {
    const matchesCity = city === 'all'
      || (city === 'danang' && place.city === 'Đà Nẵng')
      || (city === 'hue' && place.city === 'Huế');
    return matchesCity && (category === 'all' || place.category === category);
  });
}
