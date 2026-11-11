import { useEffect, useState } from 'react';
import { Check, MapPin, Plus, X } from 'lucide-react';
import type { UserTrip } from '@/pages/ExplorePage';

export interface AddToTripModalProps {
  isOpen: boolean;
  poiIds: string[];
  selectionLabel?: string;
  trips: UserTrip[];
  onToggleTrip: (tripId: string, poiIds: string[], allPlacesAlreadySaved: boolean) => void;
  onCreateTrip: (poiIds: string[]) => void;
  onClose: () => void;
}

export default function AddToTripModal({
  isOpen,
  poiIds,
  selectionLabel,
  trips,
  onToggleTrip,
  onCreateTrip,
  onClose,
}: AddToTripModalProps) {
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) setAnnouncement('');
  }, [isOpen]);

  if (!isOpen || poiIds.length === 0) return null;

  const placeCount = poiIds.length;
  const selectedItemsLabel = selectionLabel || (placeCount === 1 ? 'Địa điểm đã chọn' : `Album · ${placeCount} địa điểm`);

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-neutral-950/45 p-3 sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-to-trip-title"
        aria-describedby="add-to-trip-description"
        className="flex max-h-[calc(100dvh-24px)] w-full max-w-[650px] flex-col overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-[0_24px_80px_rgba(43,38,34,0.22)]"
      >
        <header className="flex items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3 sm:px-6 sm:py-4">
          <span className="h-11 w-11 shrink-0" aria-hidden="true" />
          <div className="min-w-0 text-center">
            <h2 id="add-to-trip-title" className="text-lg font-semibold text-neutral-950 sm:text-xl">Thêm vào chuyến đi</h2>
            <p className="mt-0.5 truncate text-sm text-neutral-700">{selectedItemsLabel}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng danh sách chuyến đi"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-neutral-800 hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-800"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>

        <p id="add-to-trip-description" className="px-5 pt-4 text-sm leading-relaxed text-neutral-700 sm:px-6">
          Chọn chuyến đi để lưu {placeCount === 1 ? 'địa điểm này' : `toàn bộ ${placeCount} địa điểm`} vào danh sách Đã lưu. Bạn có thể thêm vào Ý tưởng sau.
        </p>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-6">
          {trips.length === 0 ? (
            <div className="flex min-h-48 flex-col items-center justify-center rounded-2xl bg-neutral-50 px-5 py-8 text-center">
              <MapPin size={24} className="mb-3 text-neutral-700" aria-hidden="true" />
              <p className="text-base font-semibold text-neutral-950">Bạn chưa có chuyến đi nào</p>
              <p className="mt-1 max-w-sm text-sm text-neutral-700">Tạo chuyến đi để lưu các địa điểm đã chọn vào danh sách Đã lưu.</p>
            </div>
          ) : (
            <ul className="divide-y divide-neutral-200">
              {trips.map((trip) => {
                const savedPlaces = new Set(trip.savedPlaces ?? []);
                const savedCount = poiIds.filter((id) => savedPlaces.has(id)).length;
                const isAdded = savedCount === placeCount;
                const isPartiallyAdded = savedCount > 0 && !isAdded;
                return (
                  <li key={trip.id}>
                    <button
                      type="button"
                      aria-pressed={isAdded}
                      aria-label={`${trip.title}: ${savedCount} trên ${placeCount} địa điểm đã lưu${isAdded ? '' : ', chọn để thêm'}`}
                      onClick={() => {
                        onToggleTrip(trip.id, poiIds, isAdded);
                        setAnnouncement(isAdded
                          ? `Đã bỏ ${placeCount} địa điểm khỏi danh sách Đã lưu của ${trip.title}.`
                          : `Đã lưu ${placeCount - savedCount} địa điểm vào ${trip.title}.`);
                      }}
                      className="group flex min-h-[84px] w-full items-center gap-3 rounded-xl px-2 py-3 text-left transition-colors hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-800 sm:gap-4 sm:px-3"
                    >
                      <img
                        src={trip.coverImage || trip.image || 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=200&auto=format&fit=crop&q=80'}
                        alt=""
                        loading="lazy"
                        className="h-14 w-14 shrink-0 rounded-xl bg-neutral-100 object-cover sm:h-16 sm:w-16"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-neutral-950 sm:text-base">{trip.title}</span>
                        <span className="mt-1 block truncate text-sm text-neutral-700">
                          {trip.destination}{trip.startDate ? ` · ${trip.startDate}` : ''}
                        </span>
                        {isPartiallyAdded && <span className="mt-0.5 block text-xs font-medium text-neutral-700">Đã lưu {savedCount}/{placeCount} địa điểm</span>}
                      </span>
                      <span
                        className={`flex h-9 min-w-9 shrink-0 items-center justify-center rounded-full border px-1 transition-colors ${
                          isAdded
                            ? 'border-emerald-800 bg-emerald-800 text-white'
                            : isPartiallyAdded
                              ? 'border-amber-500 bg-amber-50 text-amber-900'
                              : 'border-neutral-300 bg-white text-neutral-700 group-hover:border-emerald-800'
                        }`}
                        aria-hidden="true"
                      >
                        {isAdded ? <Check size={19} strokeWidth={2.5} /> : isPartiallyAdded ? <span className="text-xs font-semibold">{savedCount}/{placeCount}</span> : <Plus size={19} />}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="sr-only" aria-live="polite">{announcement}</p>
        </div>

        <footer className="border-t border-neutral-200 px-4 py-3 sm:px-6 sm:py-4">
          <button
            type="button"
            onClick={() => onCreateTrip(poiIds)}
            className="flex min-h-12 w-full items-center gap-3 rounded-xl px-2 text-left font-semibold text-neutral-950 hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-800 sm:px-3"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-white">
              <Plus size={21} aria-hidden="true" />
            </span>
            <span>Tạo chuyến đi</span>
          </button>
        </footer>
      </section>
    </div>
  );
}
