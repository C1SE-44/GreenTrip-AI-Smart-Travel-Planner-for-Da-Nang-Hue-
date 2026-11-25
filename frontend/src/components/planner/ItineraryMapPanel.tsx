import { useState } from 'react';
import { ChevronDown, MapPin, Navigation } from 'lucide-react';
import PoiMap from '@/components/poi/PoiMap';
import ItineraryRouteMap from './ItineraryRouteMap';
import type { Poi } from '@/data/pois';
import type { ItineraryDay } from '@/services/itineraryService';

interface ItineraryMapPanelProps {
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
      className={`${isMapExpanded ? 'block' : 'hidden md:block'} flex-1 h-full relative bg-white overflow-hidden`}
      data-purpose="right-panel-container"
    >
      <div className="w-full h-full p-2 md:pl-3 md:pr-6 lg:pr-[36px] md:py-4 md:pb-6">
        <div className="w-full h-full rounded-[22px] overflow-hidden border border-gray-200/80 shadow-[0_2px_12px_rgba(0,0,0,0.06)] relative [transform:translateZ(0)]">
          {/* Thanh chuyển chế độ: Tuyến đường & Đề xuất phương tiện VS Điểm tham quan */}
          <div className="absolute top-3.5 left-3.5 z-[500] flex items-center bg-white/95 backdrop-blur-md rounded-full p-1 shadow-md border border-gray-200/90">
            <button
              type="button"
              onClick={() => setPanelViewMode('route')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition cursor-pointer ${
                panelViewMode === 'route'
                  ? 'bg-emerald-800 text-white shadow-xs'
                  : 'text-gray-700 hover:text-black hover:bg-gray-100'
              }`}
              title="Xem lộ trình tối ưu và đề xuất phương tiện di chuyển"
            >
              <Navigation size={13} className={panelViewMode === 'route' ? 'text-emerald-300' : 'text-emerald-600'} />
              <span>Lộ trình & Phương tiện</span>
            </button>
            <button
              type="button"
              onClick={() => setPanelViewMode('pois')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition cursor-pointer ${
                panelViewMode === 'pois'
                  ? 'bg-emerald-800 text-white shadow-xs'
                  : 'text-gray-700 hover:text-black hover:bg-gray-100'
              }`}
              title="Xem toàn bộ các điểm tham quan trên bản đồ"
            >
              <MapPin size={13} className={panelViewMode === 'pois' ? 'text-emerald-300' : 'text-gray-500'} />
              <span>Điểm tham quan ({pois.length})</span>
            </button>
          </div>

          {panelViewMode === 'route' ? (
            /* Chế độ 1: Lộ trình kết hợp đề xuất phương tiện */
            <div className="w-full h-full pt-12 md:pt-0">
              <ItineraryRouteMap
                itineraryId={tripId}
                initialDay={mapDayFilter === 'all' ? 1 : mapDayFilter}
                totalDays={days.length > 0 ? days.length : 3}
                selectedStopId={selectedMapPoiId}
                onSelectStop={(stop) => onSelectPoi(stop?.poi_id || null)}
                showStopsList={true}
                className="w-full h-full rounded-[22px] border-0 shadow-none"
              />
            </div>
          ) : (
            /* Chế độ 2: Danh sách địa điểm tham quan thông thường */
            <>
              {/* Bộ chọn xem đường đi theo ngày dạng Dropdown dọc */}
              <div className="absolute top-3.5 right-3.5 z-[400] flex flex-col items-end">
                <button
                  type="button"
                  onClick={() => setShowDayFilterDropdown((prev) => !prev)}
                  className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/95 hover:bg-white text-gray-900 font-bold text-xs shadow-md border border-gray-200/90 transition cursor-pointer active:scale-95 group"
                  title="Bấm để chọn xem đường đi theo từng ngày"
                >
                  <span className="text-emerald-600 text-xs">🗺️</span>
                  <span>
                    {mapDayFilter === 'all' ? 'Đường đi: Tất cả các ngày' : `Đường đi: Ngày ${mapDayFilter}`}
                  </span>
                  <ChevronDown
                    size={13}
                    className={`text-gray-400 group-hover:text-black transition-transform duration-200 ${
                      showDayFilterDropdown ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {/* Dropdown danh sách hàng dọc các ngày */}
                {showDayFilterDropdown && (
                  <div className="mt-2 w-[220px] max-h-[340px] overflow-y-auto bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-gray-200/90 p-1.5 space-y-1 z-[500] auto-hide-scrollbar animate-fadeIn">
                    <button
                      type="button"
                      onClick={() => {
                        onChangeMapDayFilter('all');
                        setShowDayFilterDropdown(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer text-left ${
                        mapDayFilter === 'all'
                          ? 'bg-black text-white shadow-xs'
                          : 'text-gray-700 hover:text-black hover:bg-gray-100/80'
                      }`}
                    >
                      <span>Tất cả các ngày</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                          mapDayFilter === 'all' ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-700'
                        }`}
                      >
                        Toàn bộ
                      </span>
                    </button>

                    <div className="h-px bg-gray-100 my-1"></div>

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
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer text-left ${
                            isSelected
                              ? 'bg-black text-white shadow-xs'
                              : 'text-gray-700 hover:text-black hover:bg-gray-100/80'
                          }`}
                        >
                          <span className="truncate">
                            Ngày {day.day_number}
                            {day.stops.length > 0 && (
                              <span className="font-normal opacity-70 ml-1 text-[11px]">
                                ({day.stops.length} điểm)
                              </span>
                            )}
                          </span>
                          {day.stops.length > 0 && (
                            <span
                              className={`text-[10px] px-1.5 py-0.2 rounded-full shrink-0 ml-1.5 ${
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
            </>
          )}
        </div>
      </div>
    </section>
  );
}
