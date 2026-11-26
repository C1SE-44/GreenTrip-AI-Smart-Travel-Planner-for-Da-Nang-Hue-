import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Check, Heart, Loader2, Plus, X } from 'lucide-react';
import type { Poi } from '@/data/pois';
import Button from '@/components/ui/Button';
import PoiImage from '@/components/ui/PoiImage';
import {
  addPlaceToCollection,
  createSavedCollection,
  getSavedCollections,
  removePlaceFromCollection,
  type SavedPlaceCollection,
} from '@/services/savedPlaces';

interface SaveToCollectionModalProps {
  poi: Poi;
  onClose: () => void;
  onChanged: () => Promise<void>;
}

export default function SaveToCollectionModal({ poi, onClose, onChanged }: SaveToCollectionModalProps) {
  const [collections, setCollections] = useState<SavedPlaceCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingCollectionId, setPendingCollectionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [collectionName, setCollectionName] = useState('');
  const [creatingCollection, setCreatingCollection] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);

  const loadCollections = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getSavedCollections(poi.id);
      setCollections(response.items ?? []);
    } catch {
      setError('Chưa tải được bộ sưu tập. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  }, [poi.id]);

  useEffect(() => {
    void loadCollections();
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [loadCollections, onClose]);

  const toggleCollection = async (collection: SavedPlaceCollection) => {
    setPendingCollectionId(collection.collection_id);
    setError(null);
    setMessage(null);
    try {
      if (collection.contains_poi) {
        const result = await removePlaceFromCollection(collection.collection_id, poi.id);
        setMessage(result.saved ? 'Đã bỏ địa điểm khỏi bộ sưu tập.' : 'Địa điểm đã được bỏ lưu.');
      } else {
        await addPlaceToCollection(collection.collection_id, poi.id);
        setMessage('Đã lưu địa điểm vào bộ sưu tập.');
      }
      await Promise.all([loadCollections(), onChanged()]);
    } catch {
      setError('Không thể cập nhật bộ sưu tập. Vui lòng thử lại.');
    } finally {
      setPendingCollectionId(null);
    }
  };

  const createAndSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = collectionName.trim();
    if (!trimmedName) {
      setError('Hãy nhập tên bộ sưu tập.');
      return;
    }
    setCreatingCollection(true);
    setError(null);
    try {
      const collection = await createSavedCollection(trimmedName);
      await addPlaceToCollection(collection.collection_id, poi.id);
      setCollectionName('');
      setCreating(false);
      setMessage(`Đã tạo “${trimmedName}” và lưu địa điểm vào đó.`);
      await Promise.all([loadCollections(), onChanged()]);
    } catch {
      setError('Không thể tạo bộ sưu tập. Vui lòng thử lại.');
    } finally {
      setCreatingCollection(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 backdrop-blur-[2px] p-4 animate-fadeIn"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pendingCollectionId && !creatingCollection) onClose();
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-collection-title"
        onKeyDown={(event) => {
          if (event.key !== 'Tab') return;
          const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]',
          );
          if (!focusable?.length) return;
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }}
        className="w-full max-w-lg overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-2xl"
      >
        {/* Airbnb-style Centered Modal Header */}
        <header className="relative border-b border-neutral-200 px-6 py-4 text-center">
          <button
            ref={closeRef}
            type="button"
            aria-label="Đóng"
            onClick={onClose}
            disabled={Boolean(pendingCollectionId) || creatingCollection}
            className="absolute left-4 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full text-neutral-800 transition hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 disabled:opacity-50 cursor-pointer"
          >
            <X size={20} aria-hidden="true" />
          </button>
          <h2 id="save-collection-title" className="px-10 text-base font-bold tracking-tight text-neutral-950">
            Lưu vào bộ sưu tập
          </h2>
        </header>

        {/* Context strip for target POI */}
        <div className="px-6 py-3 bg-neutral-50/80 border-b border-neutral-200/80 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl overflow-hidden bg-neutral-200 shrink-0">
            <PoiImage
              src={poi.image}
              alt={poi.name}
              poiId={poi.id}
              poiName={poi.name}
              category={poi.category}
              city={poi.city}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-neutral-950 truncate">{poi.name}</p>
            <p className="text-xs text-neutral-600 truncate">
              {poi.address || `${poi.city}, Việt Nam`}
            </p>
          </div>
        </div>

        {/* Collections List */}
        <div className="max-h-[min(56vh,440px)] overflow-y-auto overscroll-contain px-4 py-3 sm:px-5">
          {loading ? (
            <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-neutral-700" aria-live="polite">
              <Loader2 size={18} className="animate-spin text-emerald-700" aria-hidden="true" />
              <span>Đang tải bộ sưu tập…</span>
            </div>
          ) : error && collections.length === 0 ? (
            <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4 text-sm text-rose-950">
              <p>{error}</p>
              <button
                type="button"
                onClick={() => void loadCollections()}
                className="mt-3 min-h-[40px] px-4 rounded-full bg-neutral-950 text-white text-xs font-semibold hover:bg-neutral-800 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
              >
                Thử tải lại
              </button>
            </div>
          ) : (
            <div className="space-y-1.5">
              {collections.map((collection) => {
                const isPending = pendingCollectionId === collection.collection_id;
                const coverImage = collection.cover_images?.[0];
                return (
                  <button
                    key={collection.collection_id}
                    type="button"
                    aria-pressed={collection.contains_poi}
                    aria-busy={isPending}
                    disabled={Boolean(pendingCollectionId) || creatingCollection}
                    onClick={() => void toggleCollection(collection)}
                    className={`flex min-h-[72px] w-full items-center gap-3.5 rounded-2xl px-3 py-2 text-left transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 disabled:opacity-60 ${
                      collection.contains_poi
                        ? 'bg-emerald-50/70 hover:bg-emerald-50 border border-emerald-200/80'
                        : 'hover:bg-neutral-50 border border-transparent'
                    }`}
                  >
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-neutral-100 border border-neutral-200/80 text-neutral-600">
                      {coverImage ? (
                        <PoiImage
                          src={coverImage}
                          alt=""
                          fallbackSeed={collection.collection_id}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <Heart size={20} aria-hidden="true" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-neutral-950">
                        {collection.name}
                      </span>
                      <span className="block text-xs text-neutral-600 mt-0.5">
                        {collection.place_count} địa điểm đã lưu
                      </span>
                    </span>
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition ${
                        collection.contains_poi
                          ? 'border-emerald-800 bg-emerald-800 text-white'
                          : 'border-neutral-300 bg-white text-neutral-700'
                      }`}
                    >
                      {isPending ? (
                        <Loader2 size={16} className="animate-spin" aria-label="Đang cập nhật" />
                      ) : collection.contains_poi ? (
                        <Check size={17} strokeWidth={2.5} aria-label="Đã chọn" />
                      ) : (
                        <Heart size={16} aria-label="Chưa chọn" />
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {error && collections.length > 0 && (
            <p className="px-3 pt-2 text-xs font-medium text-rose-700" role="alert">
              {error}
            </p>
          )}
          {message && (
            <p className="px-3 pt-2 text-xs font-medium text-emerald-900" role="status" aria-live="polite">
              {message}
            </p>
          )}
        </div>

        {/* Footer: Create New Wishlist */}
        <footer className="border-t border-neutral-200 px-5 py-4 bg-white">
          {creating ? (
            <form onSubmit={(event) => void createAndSave(event)} className="flex flex-col gap-3 sm:flex-row">
              <label className="sr-only" htmlFor="new-saved-collection">
                Tên bộ sưu tập mới
              </label>
              <input
                id="new-saved-collection"
                name="collection_name"
                value={collectionName}
                onChange={(event) => setCollectionName(event.target.value)}
                maxLength={80}
                placeholder="Ví dụ: Cuối tuần Đà Nẵng, Quán ngon Huế…"
                className="min-h-11 min-w-0 flex-1 rounded-xl border border-neutral-300 px-3.5 text-sm text-neutral-950 placeholder:text-neutral-500 outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setCreating(false)}
                  disabled={creatingCollection}
                >
                  Hủy
                </Button>
                <button
                  type="submit"
                  disabled={creatingCollection || !collectionName.trim()}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-neutral-950 px-5 text-sm font-semibold text-white transition hover:bg-neutral-800 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 disabled:opacity-50"
                >
                  {creatingCollection && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
                  <span>Tạo &amp; lưu</span>
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              disabled={loading || creatingCollection}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-neutral-950 hover:bg-neutral-800 px-4 text-sm font-semibold text-white transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 disabled:opacity-50"
            >
              <Plus size={18} aria-hidden="true" />
              <span>Tạo bộ sưu tập mới</span>
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}
