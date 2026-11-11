import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Check, Heart, Loader2, Plus, X } from 'lucide-react';
import type { Poi } from '@/data/pois';
import Button from '@/components/ui/Button';
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
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 p-4"
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
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-card"
      >
        <header className="relative border-b border-neutral-200 px-5 pb-4 pt-5 text-center sm:px-7">
          <button
            ref={closeRef}
            type="button"
            aria-label="Đóng"
            onClick={onClose}
            disabled={Boolean(pendingCollectionId) || creatingCollection}
            className="absolute left-4 top-4 flex h-10 w-10 items-center justify-center rounded-full text-neutral-700 transition hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-800 disabled:opacity-50"
          >
            <X size={20} aria-hidden="true" />
          </button>
          <h2 id="save-collection-title" className="px-8 text-xl font-semibold tracking-tight text-neutral-950">
            Lưu vào bộ sưu tập
          </h2>
          <p className="mt-1 text-sm text-neutral-700">{poi.name}</p>
          {poi.address && <p className="mt-0.5 text-sm text-neutral-600">{poi.address}</p>}
        </header>

        <div className="max-h-[min(62vh,480px)] overflow-y-auto px-4 py-3 sm:px-5">
          {loading ? (
            <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-neutral-700" aria-live="polite">
              <Loader2 size={18} className="animate-spin" aria-hidden="true" />
              Đang tải bộ sưu tập…
            </div>
          ) : error && collections.length === 0 ? (
            <div role="alert" className="rounded-xl bg-neutral-50 p-4 text-sm text-neutral-700">
              <p>{error}</p>
              <button type="button" onClick={() => void loadCollections()} className="mt-3 min-h-10 font-semibold text-neutral-950 underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-800">
                Thử tải lại
              </button>
            </div>
          ) : (
            <div className="space-y-1">
              {collections.map((collection) => {
                const isPending = pendingCollectionId === collection.collection_id;
                return (
                  <button
                    key={collection.collection_id}
                    type="button"
                    aria-pressed={collection.contains_poi}
                    aria-busy={isPending}
                    disabled={Boolean(pendingCollectionId) || creatingCollection}
                    onClick={() => void toggleCollection(collection)}
                    className="flex min-h-[68px] w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-800 disabled:opacity-60"
                  >
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-neutral-100 text-neutral-700" aria-hidden="true">
                      <Heart size={20} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-neutral-950">{collection.name}</span>
                      <span className="block text-sm text-neutral-600">{collection.place_count} địa điểm</span>
                    </span>
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${collection.contains_poi ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 text-neutral-600'}`}>
                      {isPending ? <Loader2 size={17} className="animate-spin" aria-label="Đang cập nhật" /> : collection.contains_poi ? <Check size={18} aria-label="Đã chọn" /> : <Heart size={18} aria-label="Chưa chọn" />}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {error && collections.length > 0 && <p className="px-3 pt-2 text-sm text-red-800" role="alert">{error}</p>}
          {message && <p className="px-3 pt-2 text-sm text-neutral-700" role="status" aria-live="polite">{message}</p>}
        </div>

        <footer className="border-t border-neutral-200 px-4 py-4 sm:px-5">
          {creating ? (
            <form onSubmit={(event) => void createAndSave(event)} className="flex flex-col gap-3 sm:flex-row">
              <label className="sr-only" htmlFor="new-saved-collection">Tên bộ sưu tập mới</label>
              <input
                id="new-saved-collection"
                autoFocus
                value={collectionName}
                onChange={(event) => setCollectionName(event.target.value)}
                maxLength={80}
                placeholder="Tên bộ sưu tập"
                className="min-h-11 min-w-0 flex-1 rounded-xl border border-neutral-300 px-3 text-sm text-neutral-950 outline-none focus-visible:ring-2 focus-visible:ring-neutral-800"
              />
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={() => setCreating(false)} disabled={creatingCollection}>
                  Hủy
                </Button>
                <button type="submit" disabled={creatingCollection || !collectionName.trim()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-neutral-900 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-800 focus-visible:ring-offset-2 disabled:opacity-50">
                  {creatingCollection && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
                  Tạo và lưu
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              disabled={loading || creatingCollection}
              className="flex min-h-12 w-full items-center gap-3 rounded-xl px-2 text-left text-neutral-900 transition hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-800 disabled:opacity-50"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full border border-neutral-300" aria-hidden="true"><Plus size={20} /></span>
              <span className="text-sm font-semibold">Tạo bộ sưu tập</span>
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}
