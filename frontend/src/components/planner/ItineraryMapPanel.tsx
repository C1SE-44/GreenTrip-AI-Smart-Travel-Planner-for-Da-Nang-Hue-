import { useState } from 'react';
import { ChevronDown, Route } from 'lucide-react';
import PoiMap from '@/components/poi/PoiMap';
import type { Poi } from '@/data/pois';
import type { ItineraryDay } from '@/services/itineraryService';

interface ItineraryMapPanelProps {
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

  return (
    <section
      className={`${isMapExpanded ? 'block' : 'hidden md:block'} flex-1 h-full relative bg-white overflow-hidden`}
      data-purpose="right-panel-container"
    >
      <div className="w-full h-full p-2 md:pl-3 md:pr-6 lg:pr-[36px] md:py-4 md:pb-6">
        <div className="w-full h-full rounded-[22px] overflow-hidden border border-neutral-200/80 shadow-[0_6px_24px_rgba(28,25,23,0.06)] relative [transform:translateZ(0)]">
          {/* Bộ chọn xem đường đi theo ngày dạng Dropdown dọc */}
          <div className="absolute top-3.5 right-3.5 z-[400] flex flex-col items-end">
            <button
              type="button"
              aria-expanded={showDayFilterDropdown}
              onClick={() => setShowDayFilterDropdown((prev) => !prev)}
              className="min-h-10 flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/95 hover:bg-white text-neutral-950 font-semibold text-xs shadow-[0_4px_16px_rgba(28,25,23,0.12)] border border-neutral-200/90 transition cursor-pointer active:scale-95 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
              title="Bấm để chọn xem đường đi theo từng ngày"
            >
              <Route size={14} className="text-emerald-700 shrink-0" aria-hidden="true" />
              <span>
                {mapDayFilter === 'all' ? 'Đường đi: Tất cả các ngày' : `Đường đi: Ngày ${mapDayFilter}`}
              </span>
              <ChevronDown
                size={14}
                className={`text-neutral-600 group-hover:text-neutral-950 transition-transform duration-200 ${
                  showDayFilterDropdown ? 'rotate-180' : ''
                }`}
                aria-hidden="true"
              />
            </button>

            {/* Dropdown danh sách hàng dọc các ngày */}
            {showDayFilterDropdown && (
              <div className="mt-2 w-[236px] max-h-[340px] overflow-y-auto bg-white/95 backdrop-blur-md rounded-2xl shadow-[0_12px_32px_rgba(28,25,23,0.14)] border border-neutral-200/90 p-1.5 space-y-1 z-[500] auto-hide-scrollbar animate-fadeIn">
                <button
                  type="button"
                  onClick={() => {
                    onChangeMapDayFilter('all');
                    setShowDayFilterDropdown(false);
                  }}
                  className={`min-h-10 w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${
                    mapDayFilter === 'all'
                      ? 'bg-neutral-950 text-white shadow-xs'
                      : 'text-neutral-800 hover:text-neutral-950 hover:bg-neutral-100'
                  }`}
                >
                  <span>Tất cả các ngày</span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      mapDayFilter === 'all' ? 'bg-white/20 text-white' : 'bg-neutral-100 text-neutral-700'
                    }`}
                  >
                    Toàn bộ
                  </span>
                </button>

                <div className="h-px bg-neutral-100 my-1" />

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
                      className={`min-h-10 w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${
                        isSelected
                          ? 'bg-neutral-950 text-white shadow-xs'
                          : 'text-neutral-800 hover:text-neutral-950 hover:bg-neutral-100'
                      }`}
                    >
                      <span className="truncate">
                        Ngày {day.day_number}
                      </span>
                      {day.stops.length > 0 && (
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full shrink-0 ml-1.5 font-medium ${
                            isSelected ? 'bg-white/20 text-white' : 'bg-neutral-100 text-neutral-700'
                          }`}
                        >
                          {day.stops.length} điểm
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Bản đồ Leaflet sạch sẽ */}
          <div className="w-full h-full relative">
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
              onToggleFavorite={(_id, p) => {
                if (p) onToggleFavorite(String(p.id), p);
              }}
              addedTrips={new Set(tripIdeas)}
              onToggleAddTrip={onToggleAddTrip}
              routeCoordinates={routeCoordinates}
              numberedOrderMap={numberedOrderMap}
              routeDurationText={routeDurationText}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
