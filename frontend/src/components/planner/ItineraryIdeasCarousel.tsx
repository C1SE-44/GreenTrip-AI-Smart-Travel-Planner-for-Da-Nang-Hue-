import { useRef } from 'react';
import { ChevronRight, Clock, ExternalLink, Heart, MoreHorizontal, Trash2 } from 'lucide-react';
import type { Poi } from '@/data/pois';
import type { ItineraryDay } from '@/services/itineraryService';
import { formatCategoryLabel, getCategoryIcon, getPoiImage } from './tripItineraryUtils';

interface ItineraryIdeasCarouselProps {
  pois: Poi[];
  days: ItineraryDay[];
  savedIds: Set<string>;
  activeIdeaMenuPoiId: string | null;
  activeIdeaAddDayPoiId: string | null;
  onSetActiveIdeaMenuPoiId: (poiId: string | null) => void;
  onSetActiveIdeaAddDayPoiId: (poiId: string | null) => void;
  onToggleSaved: (poiId: string, poi: Poi) => void;
  onSelectPoi: (poiId: string) => void;
  onAddIdeaToDay: (dayNumber: number, poi: Poi) => void;
  onRemoveIdeaFromTrip: (poiId: string) => void;
}

export default function ItineraryIdeasCarousel({
  pois,
  days,
  savedIds,
  activeIdeaMenuPoiId,
  activeIdeaAddDayPoiId,
  onSetActiveIdeaMenuPoiId,
  onSetActiveIdeaAddDayPoiId,
  onToggleSaved,
  onSelectPoi,
  onAddIdeaToDay,
  onRemoveIdeaFromTrip,
}: ItineraryIdeasCarouselProps) {
  const carouselRef = useRef<HTMLDivElement>(null);

  const handleScrollIdeas = (dir: 'left' | 'right') => {
    if (!carouselRef.current) return;
    const delta = dir === 'left' ? -260 : 260;
    carouselRef.current.scrollBy({ left: delta, behavior: 'smooth' });
  };

  return (
    <div className="relative group/carousel">
      <div
        ref={carouselRef}
        className="flex gap-3.5 overflow-x-auto pb-2 pt-1 no-scrollbar -mx-1 px-1 scroll-smooth"
      >
        {pois.map((poi) => {
          const isMenuOpen = activeIdeaMenuPoiId === poi.id;
          const isSaved = savedIds.has(String(poi.id)) || savedIds.has(poi.name);

          return (
            <div
              key={poi.id}
              className="w-[180px] h-[200px] shrink-0 rounded-2xl relative overflow-hidden group select-none shadow-sm hover:shadow-md transition-all border border-gray-100"
            >
              {/* Ảnh toàn thẻ */}
              <img
                src={getPoiImage(poi)}
                alt={poi.name}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 pointer-events-none"
                loading="lazy"
              />

              {/* Nút yêu thích & Menu ... góc trên phải */}
              <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 z-20">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleSaved(String(poi.id), poi);
                  }}
                  className={`w-7 h-7 rounded-full backdrop-blur-xs flex items-center justify-center transition shadow-xs cursor-pointer active:scale-90 ${
                    isSaved
                      ? 'bg-white/95 text-rose-500 hover:bg-white ring-1 ring-rose-200'
                      : 'bg-black/40 hover:bg-black/60 text-white'
                  }`}
                  title={isSaved ? 'Bỏ thích địa điểm' : 'Thả tim yêu thích (Lưu vào Đã lưu)'}
                >
                  <Heart
                    size={14}
                    className={isSaved ? 'fill-rose-500 text-rose-500' : 'text-white hover:text-rose-400'}
                  />
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSetActiveIdeaMenuPoiId(isMenuOpen ? null : poi.id);
                  }}
                  className="w-7 h-7 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-xs flex items-center justify-center text-white transition shadow-xs cursor-pointer"
                  title="Tùy chọn địa điểm"
                >
                  <MoreHorizontal size={14} />
                </button>
              </div>

              {/* Menu popover khi bấm ... */}
              {isMenuOpen && (
                <div
                  className="absolute right-2 top-10 w-52 bg-white rounded-2xl shadow-2xl border border-gray-100 p-1.5 z-50 text-xs animate-fadeIn text-gray-800"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onSelectPoi(poi.id);
                      onSetActiveIdeaMenuPoiId(null);
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl hover:bg-gray-100 font-medium flex items-center gap-2 cursor-pointer"
                  >
                    <ExternalLink size={13} />
                    <span className="truncate">Xem {poi.name}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onSetActiveIdeaAddDayPoiId(activeIdeaAddDayPoiId === poi.id ? null : poi.id);
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl hover:bg-gray-100 font-medium flex items-center justify-between cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <Clock size={13} /> Thêm vào lịch trình
                    </span>
                    <ChevronRight
                      size={13}
                      className={activeIdeaAddDayPoiId === poi.id ? 'rotate-90 transition-transform' : 'transition-transform'}
                    />
                  </button>
                  {activeIdeaAddDayPoiId === poi.id && (
                    <div className="pl-3 pr-1 py-1 space-y-1 bg-gray-50 rounded-xl my-1">
                      {days.map((d) => (
                        <button
                          key={d.day_number}
                          type="button"
                          onClick={() => onAddIdeaToDay(d.day_number, poi)}
                          className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-black hover:text-white text-xs font-semibold flex items-center justify-between cursor-pointer"
                        >
                          <span>Ngày {d.day_number}</span>
                          <span className="text-[10px] opacity-70">{d.stops.length} điểm</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="border-t border-gray-100 my-1"></div>
                  <button
                    type="button"
                    onClick={() => {
                      onToggleSaved(String(poi.id), poi);
                      onSetActiveIdeaMenuPoiId(null);
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl hover:bg-gray-100 font-medium flex items-center gap-2 cursor-pointer"
                  >
                    <Heart
                      size={13}
                      className={isSaved ? 'fill-rose-500 text-rose-500' : 'text-gray-500'}
                    />
                    <span>{isSaved ? 'Bỏ khỏi Đã lưu' : 'Lưu vào Đã lưu'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onRemoveIdeaFromTrip(poi.id);
                      onSetActiveIdeaMenuPoiId(null);
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl hover:bg-rose-50 text-rose-600 font-medium flex items-center gap-2 cursor-pointer"
                  >
                    <Trash2 size={13} /> Xóa khỏi Ý tưởng
                  </button>
                </div>
              )}

              {/* Lớp gradient tối dần với Tên và Phân loại đè lên ảnh */}
              <div className="absolute inset-x-0 bottom-0 pt-12 pb-2.5 px-3 bg-gradient-to-t from-black/85 via-black/40 to-transparent flex flex-col justify-end pointer-events-none">
                <h3
                  className="text-white font-bold text-[13.5px] leading-tight truncate drop-shadow-sm"
                  title={poi.name}
                >
                  {poi.name}
                </h3>
                <p className="text-white/80 text-[11px] font-medium flex items-center gap-1 mt-0.5 truncate drop-shadow-xs">
                  {getCategoryIcon(poi.category)}
                  <span>{formatCategoryLabel(poi.category)}</span>
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Nút mũi tên sang phải */}
      <button
        type="button"
        onClick={() => handleScrollIdeas('right')}
        className="absolute right-0 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white shadow-md border border-gray-100 flex items-center justify-center text-gray-700 hover:text-black transition z-10 cursor-pointer opacity-90 hover:opacity-100 hover:scale-105"
        title="Xem tiếp các ý tưởng"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
