import React, { useEffect, useMemo, useState } from 'react';
import { Backpack, Check, CloudRain, Download, Leaf, Printer, RotateCcw, Sun, X } from 'lucide-react';
import type { UserTrip } from '@/pages/ExplorePage';
import type { TripItinerary } from '@/services/itineraryService';
import {
  downloadTripIcs,
  getPackingItemsForSeason,
  inferWeatherSeasonFromTrip,
  loadPackingState,
  savePackingState,
  type WeatherSeason,
} from '@/utils/tripExportAndChecklist';

export interface EcoPackingChecklistModalProps {
  trip: Pick<UserTrip, 'id' | 'title' | 'destination' | 'startDate' | 'flexibleMonth'>;
  isOpen: boolean;
  onClose: () => void;
}

const GROUP_TITLES: Record<'green-core' | 'weather' | 'culture', string> = {
  'green-core': 'Hành trang Xanh cốt lõi',
  weather: 'Theo thời tiết dự kiến',
  culture: 'Di sản & Di chuyển',
};

export default function EcoPackingChecklistModal({
  trip,
  isOpen,
  onClose,
}: EcoPackingChecklistModalProps) {
  const defaultSeason = useMemo(() => inferWeatherSeasonFromTrip(trip), [trip]);
  const [checkedIds, setCheckedIds] = useState<string[]>(() =>
    loadPackingState(trip.id, defaultSeason).checkedIds
  );
  const [season, setSeason] = useState<WeatherSeason>(() =>
    loadPackingState(trip.id, defaultSeason).season
  );

  // Đồng bộ lại khi đổi trip.id
  useEffect(() => {
    const saved = loadPackingState(trip.id, defaultSeason);
    setCheckedIds(saved.checkedIds);
    setSeason(saved.season);
  }, [trip.id, defaultSeason]);

  // Đóng nhanh bằng phím Esc
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const visibleItems = useMemo(() => getPackingItemsForSeason(season), [season]);
  const checkedSet = useMemo(() => new Set(checkedIds), [checkedIds]);
  const completedCount = useMemo(
    () => visibleItems.filter((item) => checkedSet.has(item.id)).length,
    [visibleItems, checkedSet]
  );

  if (!isOpen) return null;

  const persist = (nextChecked: string[], nextSeason: WeatherSeason) => {
    setCheckedIds(nextChecked);
    setSeason(nextSeason);
    savePackingState(trip.id, { checkedIds: nextChecked, season: nextSeason });
  };

  const handleToggleItem = (id: string) => {
    const next = checkedSet.has(id)
      ? checkedIds.filter((item) => item !== id)
      : [...checkedIds, id];
    persist(next, season);
  };

  const handleChangeSeason = (nextSeason: WeatherSeason) => {
    persist(checkedIds, nextSeason);
  };

  const handleReset = () => {
    persist([], defaultSeason);
  };

  const progressPct =
    visibleItems.length > 0 ? Math.round((completedCount / visibleItems.length) * 100) : 0;

  return (
    <div
      className="no-print fixed inset-0 z-[120] bg-neutral-950/45 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-2 sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="eco-packing-title"
        className="w-full max-w-[540px] max-h-[90vh] bg-white rounded-2xl border border-neutral-200 shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 sm:px-6 py-4 border-b border-neutral-200 flex items-start justify-between gap-3 bg-emerald-50/40 shrink-0">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-emerald-800">
              <Leaf size={14} className="shrink-0" />
              <span>Hành trang xanh</span>
            </span>
            <h2
              id="eco-packing-title"
              className="text-base sm:text-lg font-extrabold text-neutral-900 mt-0.5 leading-snug"
            >
              Checklist chuẩn bị chuyến đi
            </h2>
            <p className="text-xs text-neutral-600 mt-0.5">
              {trip.destination || 'Đà Nẵng & Huế'} • Tự động lưu trên thiết bị
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng checklist hành trang xanh"
            className="min-h-[44px] min-w-[44px] rounded-full bg-white border border-neutral-200 hover:border-neutral-900 text-neutral-700 hover:text-neutral-900 flex items-center justify-center transition cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
          >
            <X size={18} />
          </button>
        </div>

        {/* Thanh chọn thời tiết & Tiến độ */}
        <div className="px-4 sm:px-6 py-3 border-b border-neutral-200 bg-white space-y-3 shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Chọn chế độ thời tiết">
              <button
                type="button"
                aria-pressed={season === 'sunny'}
                onClick={() => handleChangeSeason('sunny')}
                className={`min-h-[40px] px-3.5 rounded-full text-xs font-bold border inline-flex items-center gap-1.5 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${
                  season === 'sunny'
                    ? 'bg-neutral-900 text-white border-neutral-900'
                    : 'bg-white text-neutral-700 border-neutral-300 hover:border-neutral-900'
                }`}
              >
                <Sun size={14} className="shrink-0" />
                <span>Mùa nắng / Biển</span>
              </button>

              <button
                type="button"
                aria-pressed={season === 'rainy'}
                onClick={() => handleChangeSeason('rainy')}
                className={`min-h-[40px] px-3.5 rounded-full text-xs font-bold border inline-flex items-center gap-1.5 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${
                  season === 'rainy'
                    ? 'bg-neutral-900 text-white border-neutral-900'
                    : 'bg-white text-neutral-700 border-neutral-300 hover:border-neutral-900'
                }`}
              >
                <CloudRain size={14} className="shrink-0" />
                <span>Mùa mưa miền Trung</span>
              </button>
            </div>

            <button
              type="button"
              onClick={handleReset}
              className="min-h-[40px] px-3 rounded-full text-xs font-semibold text-neutral-700 hover:text-neutral-900 hover:bg-neutral-100 inline-flex items-center gap-1.5 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
              title="Bỏ chọn toàn bộ và quay về mùa mặc định"
            >
              <RotateCcw size={13} />
              <span>Đặt lại</span>
            </button>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-semibold text-neutral-700">
              <span>
                Đã chuẩn bị {completedCount}/{visibleItems.length} món
              </span>
              <span className="text-emerald-800 font-bold">{progressPct}%</span>
            </div>
            <div className="w-full h-2 rounded-full bg-neutral-100 overflow-hidden" aria-hidden="true">
              <div
                className="h-full rounded-full bg-emerald-700 transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        </div>

        {/* Danh sách vật dụng */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4 space-y-5">
          {(season === 'rainy' || /đà nẵng|da nang|danang|cả/i.test(trip.destination || '')) && (
            <div
              role="note"
              className="rounded-xl border border-amber-200 bg-amber-50/85 px-3.5 py-2.5 text-xs text-neutral-800 leading-relaxed"
            >
              <span className="font-bold text-neutral-950">Lưu ý an toàn biển Đà Nẵng: </span>
              {season === 'rainy'
                ? 'Tháng 9 – tháng 1 thường có mưa tạt, sóng lớn và dòng chảy xa bờ (rip currents). Luôn ưu tiên áo mưa bộ 2 mảnh, giày chống thấm và quan sát cờ cứu hộ khi xuống biển.'
                : 'Biển Đà Nẵng có thể xuất hiện sóng lớn và dòng chảy xa bờ vào cuối ngày. Hãy tắm gần khu vực có lực lượng cứu hộ và đi cùng bạn đồng hành.'}
            </div>
          )}
          {(['green-core', 'weather', 'culture'] as const).map((groupKey) => {
            const items = visibleItems.filter((item) => item.group === groupKey);
            if (items.length === 0) return null;
            return (
              <section key={groupKey} className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                  {GROUP_TITLES[groupKey]}
                </h3>
                <div className="space-y-2">
                  {items.map((item) => {
                    const isChecked = checkedSet.has(item.id);
                    return (
                      <label
                        key={item.id}
                        className={`min-h-[44px] flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition select-none ${
                          isChecked
                            ? 'bg-emerald-50/70 border-emerald-300'
                            : 'bg-white border-neutral-200 hover:border-neutral-400'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleItem(item.id)}
                          className="sr-only peer"
                        />
                        <span
                          aria-hidden="true"
                          className={`mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-700 peer-focus-visible:ring-offset-2 ${
                            isChecked
                              ? 'bg-emerald-700 border-emerald-700 text-white'
                              : 'bg-white border-neutral-400 text-transparent'
                          }`}
                        >
                          <Check size={14} strokeWidth={3} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span
                            className={`block text-sm font-semibold leading-snug ${
                              isChecked ? 'line-through text-neutral-600' : 'text-neutral-900'
                            }`}
                          >
                            {item.label}
                          </span>
                          <span className="block text-xs text-neutral-600 mt-0.5 leading-relaxed">
                            {item.hint}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3 border-t border-neutral-200 bg-neutral-50/70 flex items-center justify-between gap-3 shrink-0">
          <span className="text-xs text-neutral-600">
            Mặc định gợi ý theo tháng {season === 'rainy' ? 'mùa mưa' : 'mùa nắng'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] px-5 rounded-full bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-bold transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
          >
            Xong
          </button>
        </div>
      </div>
    </div>
  );
}

export interface TripExportToolbarProps {
  trip: Pick<UserTrip, 'id' | 'title' | 'destination' | 'startDate' | 'flexibleMonth'>;
  plan: TripItinerary;
  onBeforePrint?: () => void;
  className?: string;
  isChecklistOpen?: boolean;
  onChecklistOpenChange?: (open: boolean) => void;
}

export function TripExportToolbar({
  trip,
  plan,
  onBeforePrint,
  className = '',
  isChecklistOpen,
  onChecklistOpenChange,
}: TripExportToolbarProps) {
  const [internalChecklistOpen, setInternalChecklistOpen] = useState(false);
  const [exportNotice, setExportNotice] = useState('');

  const showPackingModal = isChecklistOpen ?? internalChecklistOpen;
  const setShowPackingModal = (open: boolean) => {
    setInternalChecklistOpen(open);
    onChecklistOpenChange?.(open);
  };

  const handleExportIcs = () => {
    const { eventCount } = downloadTripIcs(plan, trip);
    setExportNotice(
      eventCount > 0
        ? `Đã tải lịch .ics (${eventCount} hoạt động, múi giờ Việt Nam).`
        : 'Đã tải lịch .ics trống (chưa có điểm dừng trong lịch).'
    );
    window.setTimeout(() => setExportNotice(''), 3500);
  };

  const handlePrint = () => {
    onBeforePrint?.();
    window.setTimeout(() => window.print(), 80);
  };

  return (
    <>
      <div className={`no-print space-y-2 ${className}`}>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowPackingModal(true)}
            className="min-h-8 px-2.5 rounded-full border border-emerald-700/30 bg-emerald-50/70 hover:bg-emerald-100/70 hover:border-emerald-800 text-xs font-bold text-emerald-900 inline-flex items-center gap-1 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
            title="Mở checklist hành trang xanh theo thời tiết"
          >
            <Backpack size={13} className="shrink-0" />
            <span>Hành trang xanh</span>
          </button>

          <button
            type="button"
            onClick={handleExportIcs}
            className="min-h-8 px-2.5 rounded-full border border-neutral-300 bg-white hover:border-neutral-900 hover:bg-neutral-50 text-xs font-semibold text-neutral-800 inline-flex items-center gap-1 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
            title="Tải tệp lịch .ics (múi giờ Asia/Ho_Chi_Minh)"
          >
            <Download size={13} className="shrink-0" />
            <span>Xuất .ics</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="min-h-8 px-2.5 rounded-full border border-neutral-300 bg-white hover:border-neutral-900 hover:bg-neutral-50 text-xs font-semibold text-neutral-800 inline-flex items-center gap-1 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
            title="In hoặc lưu PDF lịch trình chuyến đi"
          >
            <Printer size={13} className="shrink-0" />
            <span>In / PDF</span>
          </button>
        </div>

        {exportNotice && (
          <div
            role="status"
            aria-live="polite"
            className="px-3.5 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-900"
          >
            {exportNotice}
          </div>
        )}
      </div>

      <EcoPackingChecklistModal
        trip={trip}
        isOpen={showPackingModal}
        onClose={() => setShowPackingModal(false)}
      />
    </>
  );
}

