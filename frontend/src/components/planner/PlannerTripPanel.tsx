import { ArrowRight, CalendarDays, MapPin, Trash2 } from 'lucide-react';
import type { Poi } from '@/data/pois';
import type { ItineraryDay } from '@/services/itineraryService';
import type { UserTrip } from '@/pages/ExplorePage';
import { formatCategoryLabel } from './tripItineraryUtils';
import PoiImage from '@/components/ui/PoiImage';

interface PlannerTripPanelProps {
  trip: UserTrip;
  pois: Poi[];
  days: ItineraryDay[];
  section: 'ideas' | 'itinerary';
  onChangeSection: (section: 'ideas' | 'itinerary') => void;
  onRemovePoi: (poiId: string) => void;
  onOpenPoiDetails: (poiId: string) => void;
  onCreateSchedule: () => void;
  onOpenItinerary: () => void;
  onReturnToSuggestions: () => void;
  isBusy: boolean;
}

export default function PlannerTripPanel({
  trip,
  pois,
  days,
  section,
  onChangeSection,
  onRemovePoi,
  onOpenPoiDetails,
  onCreateSchedule,
  onOpenItinerary,
  onReturnToSuggestions,
  isBusy,
}: PlannerTripPanelProps) {
  const preferences = [...(trip.preferences ?? []), ...(trip.preferenceText?.trim() ? [trip.preferenceText.trim()] : [])];

  return (
    <section className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-white" aria-label="Trip panel">
      <header className="shrink-0 border-b border-neutral-200 px-4 py-4 md:px-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-neutral-950">{trip.title || 'Chuyến đi của bạn'}</h2>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-700">
              <span className="inline-flex items-center gap-1"><MapPin size={12} aria-hidden="true" />{trip.destination}</span>
              <span>· {trip.daysCount || days.length} ngày</span>
              <span>· {trip.peopleCount} khách</span>
              {typeof trip.totalBudget === 'number' && (
                <span>· {new Intl.NumberFormat('vi-VN').format(trip.totalBudget)} ₫</span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onReturnToSuggestions}
            className="min-h-10 shrink-0 rounded-full border border-neutral-300 px-3 text-xs font-semibold text-neutral-800 hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
          >
            Quay lại gợi ý
          </button>
        </div>
        {preferences.length > 0 && (
          <p className="mt-2 line-clamp-2 text-xs text-neutral-700">
            <span className="font-semibold text-neutral-900">Sở thích:</span> {preferences.join(', ')}
          </p>
        )}
        <div className="mt-4 grid grid-cols-2 gap-2" role="tablist" aria-label="Nội dung Trip">
          <button
            type="button"
            role="tab"
            aria-selected={section === 'ideas'}
            onClick={() => onChangeSection('ideas')}
            className={`min-h-10 rounded-full px-3 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${section === 'ideas' ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-800 hover:bg-neutral-200'}`}
          >
            Địa điểm muốn đi · {pois.length}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={section === 'itinerary'}
            onClick={() => onChangeSection('itinerary')}
            className={`min-h-10 rounded-full px-3 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${section === 'itinerary' ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-800 hover:bg-neutral-200'}`}
          >
            Lịch trình theo ngày
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-5 auto-hide-scrollbar">
        {section === 'ideas' ? (
          pois.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 px-4 py-6 text-center">
              <p className="text-sm font-semibold text-neutral-900">Chưa có địa điểm nào trong Trip.</p>
              <p className="mt-1 text-xs leading-relaxed text-neutral-700">Chọn “Thêm” ở Recommendation hoặc “Có thể bạn sẽ thích” để đưa địa điểm vào danh sách.</p>
              <button
                type="button"
                onClick={onReturnToSuggestions}
                className="mt-3 min-h-10 rounded-full bg-neutral-900 px-4 text-xs font-semibold text-white hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
              >
                Xem gợi ý địa điểm
              </button>
            </div>
          ) : (
            <div className="space-y-2" aria-label="Địa điểm đã chọn">
              {pois.map((poi) => (
                <article key={poi.id} className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white p-2.5">
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-neutral-100">
                    <PoiImage
                      src={poi.imageSourceAvailable === false ? null : poi.image}
                      alt={`Ảnh ${poi.name}`}
                      poiId={poi.id}
                      poiName={poi.name}
                      category={poi.category}
                      city={poi.city}
                      fallbackMode="neutral"
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="line-clamp-2 text-sm font-semibold text-neutral-950">{poi.name}</h3>
                    <p className="truncate text-xs text-neutral-700">{poi.city} · {formatCategoryLabel(poi.category)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onOpenPoiDetails(poi.id)}
                      aria-label={`Xem chi tiết ${poi.name} trên bản đồ`}
                      title="Xem chi tiết trên bản đồ"
                      className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-full text-neutral-700 hover:bg-emerald-50 hover:text-emerald-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                    >
                      <MapPin size={16} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemovePoi(poi.id)}
                      aria-label={`Xóa ${poi.name} khỏi Trip`}
                      className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-full text-neutral-600 hover:bg-rose-50 hover:text-rose-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-700"
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )
        ) : (
          <div className="space-y-3" aria-label="Lịch trình hiện tại">
            {days.map((day) => (
              <section key={day.day_number} className="rounded-xl border border-neutral-200 p-3">
                <h3 className="text-sm font-bold text-neutral-950">Ngày {day.day_number}{day.date ? ` · ${day.date}` : ''}</h3>
                {day.stops.length > 0 ? (
                  <ol className="mt-2 space-y-2">
                    {day.stops.filter((stop) => stop.stop_type !== 'rest').map((stop, index) => (
                      <li key={stop.stop_id} className="flex gap-2 text-xs text-neutral-800">
                        <span className="font-semibold text-emerald-900">{index + 1}.</span>
                        <span className="min-w-0 flex-1 truncate">{stop.title}</span>
                        {stop.start_time && <span className="shrink-0 text-neutral-700">{stop.start_time}</span>}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="mt-2 text-xs text-neutral-700">Chưa có điểm dừng trong ngày này.</p>
                )}
              </section>
            ))}
            {!days.some((day) => day.stops.some((stop) => stop.stop_type !== 'rest')) && (
              <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 px-4 py-6 text-center">
                <CalendarDays size={20} className="mx-auto text-neutral-600" aria-hidden="true" />
                <p className="mt-2 text-sm font-semibold text-neutral-900">Chuyến đi chưa có lịch trình.</p>
                <p className="mt-1 text-xs text-neutral-700">Tạo bản xem trước từ các địa điểm đã chọn.</p>
              </div>
            )}
          </div>
        )}
      </div>

      <footer className="shrink-0 border-t border-neutral-200 bg-white p-4 md:px-5">
        {section === 'ideas' ? (
          <button
            type="button"
            onClick={onCreateSchedule}
            disabled={isBusy || pois.length === 0}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-emerald-900 px-4 text-sm font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
          >
            Tạo lịch trình <ArrowRight size={16} aria-hidden="true" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onOpenItinerary}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-neutral-300 px-4 text-sm font-semibold text-neutral-900 hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
          >
            Mở lịch trình đầy đủ <ArrowRight size={16} aria-hidden="true" />
          </button>
        )}
      </footer>
    </section>
  );
}
