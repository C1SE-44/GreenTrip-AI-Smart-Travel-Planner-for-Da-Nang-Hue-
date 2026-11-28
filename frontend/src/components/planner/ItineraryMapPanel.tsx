import { useState, type ReactNode } from 'react';
import { ChevronDown, MapPin, Navigation } from 'lucide-react';
import PoiMap from '@/components/poi/PoiMap';
import ItineraryRouteMap from './ItineraryRouteMap';
import type { Poi } from '@/data/pois';
import type { ItineraryDay } from '@/services/itineraryService';

interface ItineraryMapPanelProps {
  mapPurpose?: 'ideas' | 'itinerary';
  isDetailOpen?: boolean;
  detailPanel?: ReactNode;
  tripId?: string;
  isMapExpanded: boolean;
  onToggleExpand: () => void;
  mapDayFilter: number | 'all';
  onChangeMapDayFilter: (filter: number | 'all') => void;
  days: ItineraryDay[];
  pois: Poi[];
  selectedMapPoiId: string | null;
  hoveredStopId: string | null;
  onSelectPoi: (id: string | null) => void;
  onHoverPoi: (id: string | null) => void;
  savedIds: Set<string>;
  pendingIds: Set<string>;
  onToggleFavorite: (id: string, poi?: Poi) => void;
  tripIdeas: string[];
  onToggleAddTrip: (id: string) => void;
  routeCoordinates: [number, number][];
  numberedOrderMap: Map<string, number>;
  routeDurationText?: string;
}

export default function ItineraryMapPanel({
  mapPurpose = 'itinerary',
  isDetailOpen = false,
  detailPanel,
  tripId,
  isMapExpanded,
  onToggleExpand,
  mapDayFilter,
  onChangeMapDayFilter,
  days,
  pois,
  selectedMapPoiId,
  hoveredStopId,
  onSelectPoi,
  onHoverPoi,
  savedIds,
  pendingIds,
  onToggleFavorite,
  tripIdeas,
  onToggleAddTrip,
  routeCoordinates,
  numberedOrderMap,
  routeDurationText,
}: ItineraryMapPanelProps) {
  const [showDayFilterDropdown, setShowDayFilterDropdown] = useState(false);
  const [panelViewMode, setPanelViewMode] = useState<'route' | 'pois'>('route');

  return (
    <section
      className={`${isDetailOpen ? 'fixed inset-0 z-[80] block md:relative md:inset-auto md:z-auto' : isMapExpanded ? 'block' : 'hidden md:block'} flex-1 h-full relative bg-white overflow-hidden`}
      data-purpose="right-panel-container"
    >
      <div className="w-full h-full p-2 md:pl-3 md:pr-6 lg:pr-[36px] md:py-4 md:pb-6">
        <div className="w-full h-full rounded-[22px] overflow-hidden border border-gray-200/80 shadow-[0_2px_12px_rgba(0,0,0,0.06)] relative [transform:translateZ(0)]">
          {/* Recommendation view uses the POI map without itinerary filters. */}
          {mapPurpose === 'ideas' ? (
            <div className="absolute right-3.5 top-3.5 z-[400] rounded-full border border-neutral-200 bg-white/95 px-3.5 py-2 text-xs font-semibold text-neutral-900 shadow-md">
              Địa điểm đã chọn và gợi ý
            </div>
          ) : (
            <div className="absolute left-3.5 top-3.5 z-[500] flex items-center rounded-full border border-gray-200/90 bg-white/95 p-1 shadow-md backdrop-blur-md">
              <button
                type="button"
                aria-pressed={panelViewMode === 'route'}
                onClick={() => setPanelViewMode('route')}
                className={`flex items-center min-h-10 gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                  panelViewMode === 'route'
                    ? 'bg-emerald-800 text-white shadow-xs'
                    : 'text-gray-700 hover:bg-gray-100 hover:text-black'
                }`}
                title="Xem lộ trình tối ưu và đề xuất phương tiện di chuyển"
              >
                <Navigation size={13} className={panelViewMode === 'route' ? 'text-emerald-300' : 'text-emerald-600'} />
                <span>Lộ trình &amp; Phương tiện</span>
              </button>
              <button
                type="button"
                aria-pressed={panelViewMode === 'pois'}
                onClick={() => setPanelViewMode('pois')}
                className={`flex items-center min-h-10 gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                  panelViewMode === 'pois'
                    ? 'bg-emerald-800 text-white shadow-xs'
                    : 'text-gray-700 hover:bg-gray-100 hover:text-black'
                }`}
                title="Xem toàn bộ các điểm tham quan trên bản đồ"
              >
                <MapPin size={13} className={panelViewMode === 'pois' ? 'text-emerald-300' : 'text-gray-500'} />
                <span>Điểm tham quan ({pois.length})</span>
              </button>
            </div>
          )}

          {mapPurpose === 'ideas' || panelViewMode === 'pois' ? (
            <>
              {mapPurpose === 'itinerary' && (
                <div className="absolute right-3.5 top-3.5 z-[400] flex flex-col items-end">
                  <button
                    type="button"
                    onClick={() => setShowDayFilterDropdown((prev) => !prev)}
                    className="group flex min-h-10 cursor-pointer items-center gap-2 rounded-full border border-gray-200/90 bg-white/95 px-3.5 py-1.5 text-xs font-bold text-gray-900 shadow-md transition hover:bg-white active:scale-95"
                    title="Bấm để chọn xem đường đi theo từng ngày"
                    aria-expanded={showDayFilterDropdown}
                    aria-controls="planner-map-day-filter"
                  >
                    <span className="text-emerald-600 text-xs">🗺️</span>
                    <span>
                      {mapDayFilter === 'all' ? 'Đường đi: Tất cả các ngày' : `Đường đi: Ngày ${mapDayFilter}`}
                    </span>
                    <ChevronDown
                      size={13}
                      className={`text-gray-400 transition-transform duration-200 group-hover:text-black ${
                        showDayFilterDropdown ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  {showDayFilterDropdown && (
                    <div
                      id="planner-map-day-filter"
                      className="auto-hide-scrollbar z-[500] mt-2 max-h-[340px] w-[220px] space-y-1 overflow-y-auto rounded-2xl border border-gray-200/90 bg-white/95 p-1.5 shadow-xl backdrop-blur-md animate-fadeIn"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          onChangeMapDayFilter('all');
                          setShowDayFilterDropdown(false);
                        }}
                        className={`flex min-h-10 w-full cursor-pointer items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-bold transition ${
                          mapDayFilter === 'all'
                            ? 'bg-black text-white shadow-xs'
                            : 'text-gray-700 hover:bg-gray-100/80 hover:text-black'
                        }`}
                      >
                        <span>Tất cả các ngày</span>
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-xs ${
                            mapDayFilter === 'all' ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-700'
                          }`}
                        >
                          Toàn bộ
                        </span>
                      </button>
                      <div className="my-1 h-px bg-gray-100" />
                      {days.map((day) => {
                        const isSelected = mapDayFilter === day.day_number;
                        return (
                          <button
                            key={day.day_number}
                            type="button"
                            onClick={() => {
                              onChangeMapDayFilter(day.day_number);
                              setShowDayFilterDropdown(false);
                            }}
                            className={`flex min-h-10 w-full cursor-pointer items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-bold transition ${
                              isSelected
                                ? 'bg-black text-white shadow-xs'
                                : 'text-gray-700 hover:bg-gray-100/80 hover:text-black'
                            }`}
                          >
                            <span className="truncate">
                              Ngày {day.day_number}
                              {day.stops.length > 0 && (
                                <span className="ml-1 text-xs font-normal opacity-70">
                                  ({day.stops.length} điểm)
                                </span>
                              )}
                            </span>
                            {day.stops.length > 0 && (
                              <span
                                className={`ml-1.5 shrink-0 rounded-full px-1.5 py-0.5 text-xs ${
                                  isSelected ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-700'
                                }`}
                              >
                                {day.stops.length}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
              <div className="relative h-full w-full">
                <PoiMap
                  pois={pois}
                  selectedPoiId={selectedMapPoiId}
                  hoveredPoiId={hoveredStopId}
                  onSelectPoi={onSelectPoi}
                  onHoverPoi={onHoverPoi}
                  showMapLoader={false}
                  isExpanded={isMapExpanded}
                  onToggleExpand={onToggleExpand}
                  favorites={savedIds}
                  pendingFavorites={pendingIds}
                  onToggleFavorite={(_id, poi) => {
                    if (poi) onToggleFavorite(String(poi.id), poi);
                  }}
                  addedTrips={new Set(tripIdeas)}
                  onToggleAddTrip={onToggleAddTrip}
                  routeCoordinates={routeCoordinates}
                  numberedOrderMap={numberedOrderMap}
                  routeDurationText={routeDurationText}
                />
              </div>
            </>
          ) : (
            <div className="h-full w-full pt-12 md:pt-0">
              <ItineraryRouteMap
                itineraryId={tripId}
                days={days}
                pois={pois}
                initialDay={mapDayFilter === 'all' ? 1 : mapDayFilter}
                totalDays={days.length > 0 ? days.length : 3}
                selectedStopId={selectedMapPoiId}
                onSelectStop={(stop) => onSelectPoi(stop?.poi_id || null)}
                showStopsList
                className="h-full w-full rounded-[22px] border-0 shadow-none"
              />
            </div>
          )}
        </div>
      </div>
      {isDetailOpen && detailPanel && (
        <div className="absolute inset-0 z-[1000] bg-white md:rounded-[22px]" data-purpose="planner-poi-detail-overlay">
          {detailPanel}
        </div>
      )}
    </section>
  );
}
