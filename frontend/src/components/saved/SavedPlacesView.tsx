import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CalendarPlus,
  Check,
  Heart,
  Leaf,
  List,
  Loader2,
  Map as MapIcon,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import type { Poi, PoiCategory } from '@/data/pois';
import { categoryLabels, normalizePoi, normalizePois, pois } from '@/data/pois';
import ExplorePoiCard from '@/components/explore/ExplorePoiCard';
import PoiDetailSection from '@/components/poi/PoiDetailSection';
import PoiMap from '@/components/poi/PoiMap';
import PoiImage from '@/components/ui/PoiImage';
import { PoiCardSkeleton } from '@/components/ui/Skeleton';
import ConfirmDeleteModal from '@/components/ui/ConfirmDeleteModal';
import { useSavedPlaces } from '@/context/SavedPlacesContext';
import { filterSavedPlaces, type SavedPlacesCityFilter } from '@/components/saved/savedPlacesFilters';
import { getPois } from '@/services/poi';
import {
  addPlaceToCollection,
  createSavedCollection,
  deleteSavedCollection,
  getCollectionPlaces,
  removePlaceFromCollection,
  renameSavedCollection,
  type SavedPlace,
  type SavedPlaceCollection,
} from '@/services/savedPlaces';

const MODAL_CATEGORY_TABS = [
  { id: 'for-you', label: 'Tất cả' },
  { id: 'luu-tru', label: 'Lưu trú' },
  { id: 'quan-an', label: 'Ẩm thực & Cafe' },
  { id: 'experiences', label: 'Di tích & Văn hóa' },
  { id: 'canh-quan', label: 'Thiên nhiên' },
  { id: 'chua', label: 'Tâm linh' },
];

type SavedTab = 'collections' | 'places';
type CollectionDialog = { mode: 'create' } | { mode: 'rename'; collection: SavedPlaceCollection } | null;

function normalizeSavedPlaces(items: SavedPlace[]): Poi[] {
  return items.map((item) => normalizePoi(item, true)).filter((place): place is Poi => place !== null);
}

function hasValidCoordinates(place: { lat: number; lng: number }): boolean {
  return (
    Number.isFinite(place.lat) &&
    Number.isFinite(place.lng) &&
    place.lat >= -90 &&
    place.lat <= 90 &&
    place.lng >= -180 &&
    place.lng <= 180
  );
}

function placeMatchesSearch(place: Pick<SavedPlace, 'name' | 'address' | 'city'>, query: string): boolean {
  if (!query.trim()) return true;
  const text = `${place.name} ${place.address ?? ''} ${place.city ?? ''}`.toLocaleLowerCase('vi');
  return text.includes(query.trim().toLocaleLowerCase('vi'));
}

function CollectionCoverCollage({
  collectionId,
  images,
}: {
  collectionId: string;
  images: string[];
}) {
  const validImages = images.filter(Boolean).slice(0, 4);
  const count = validImages.length;

  if (count === 0) {
    return (
      <span className="flex aspect-square w-full items-center justify-center rounded-2xl bg-neutral-100 border border-neutral-200/80 text-neutral-500 transition group-hover:bg-neutral-200/60">
        <Heart size={32} strokeWidth={1.6} aria-hidden="true" />
      </span>
    );
  }

  if (count === 1) {
    return (
      <span className="block aspect-square w-full overflow-hidden rounded-2xl bg-neutral-100 ring-1 ring-neutral-200/90 shadow-[0_2px_10px_rgba(0,0,0,0.05)] group-hover:shadow-[0_8px_22px_rgba(0,0,0,0.09)] transition-shadow">
        <PoiImage
          src={validImages[0]}
          alt=""
          fallbackSeed={`${collectionId}-0`}
          className="h-full w-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
        />
      </span>
    );
  }

  if (count === 2) {
    return (
      <span className="grid aspect-square w-full grid-cols-2 gap-0.5 overflow-hidden rounded-2xl bg-white ring-1 ring-neutral-200/90 shadow-[0_2px_10px_rgba(0,0,0,0.05)] group-hover:shadow-[0_8px_22px_rgba(0,0,0,0.09)] transition-shadow">
        {validImages.map((src, index) => (
          <PoiImage
            key={`${src}-${index}`}
            src={src}
            alt=""
            fallbackSeed={`${collectionId}-${index}`}
            className="h-full min-h-0 w-full object-cover"
          />
        ))}
      </span>
    );
  }

  if (count === 3) {
    return (
      <span className="grid aspect-square w-full grid-cols-2 grid-rows-2 gap-0.5 overflow-hidden rounded-2xl bg-white ring-1 ring-neutral-200/90 shadow-[0_2px_10px_rgba(0,0,0,0.05)] group-hover:shadow-[0_8px_22px_rgba(0,0,0,0.09)] transition-shadow">
        {validImages.map((src, index) => (
          <span
            key={`${src}-${index}`}
            className={`${index === 0 ? 'row-span-2' : 'row-span-1'} h-full min-h-0 w-full overflow-hidden`}
          >
            <PoiImage
              src={src}
              alt=""
              fallbackSeed={`${collectionId}-${index}`}
              className="h-full w-full object-cover"
            />
          </span>
        ))}
      </span>
    );
  }

  return (
    <span className="grid aspect-square w-full grid-cols-2 grid-rows-2 gap-0.5 overflow-hidden rounded-2xl bg-white ring-1 ring-neutral-200/90 shadow-[0_2px_10px_rgba(0,0,0,0.05)] group-hover:shadow-[0_8px_22px_rgba(0,0,0,0.09)] transition-shadow">
      {validImages.map((src, index) => (
        <PoiImage
          key={`${src}-${index}`}
          src={src}
          alt=""
          fallbackSeed={`${collectionId}-${index}`}
          className="h-full min-h-0 w-full object-cover"
        />
      ))}
    </span>
  );
}

function CollectionNameDialog({
  initialName,
  title,
  onCancel,
  onSave,
  saving,
  error,
}: {
  initialName: string;
  title: string;
  onCancel: () => void;
  onSave: (name: string) => void;
  saving: boolean;
  error: string | null;
}) {
  const [name, setName] = useState(initialName);
  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-[2px] p-4 animate-fadeIn"
      role="presentation"
      onClick={onCancel}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="collection-dialog-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          onSave(name.trim());
        }}
        className="w-full max-w-md rounded-3xl border border-neutral-200 bg-white p-6 shadow-2xl"
      >
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 id="collection-dialog-title" className="text-lg font-bold text-neutral-950">
            {title}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Đóng"
            className="flex h-10 w-10 items-center justify-center rounded-full text-neutral-700 hover:bg-neutral-100 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
          >
            <X size={19} aria-hidden="true" />
          </button>
        </div>
        <label htmlFor="collection-name" className="mb-1.5 block text-sm font-semibold text-neutral-800">
          Tên bộ sưu tập
        </label>
        <input
          id="collection-name"
          name="collection_name"
          maxLength={80}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Ví dụ: Đà Nẵng cuối tuần, Huế 2 ngày…"
          className="min-h-11 w-full rounded-xl border border-neutral-300 px-3.5 text-sm text-neutral-950 placeholder:text-neutral-500 outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
        />
        {error && (
          <p className="mt-2 text-xs font-medium text-rose-700" role="alert">
            {error}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="min-h-11 rounded-xl px-4 text-sm font-semibold text-neutral-700 hover:bg-neutral-100 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 disabled:opacity-50"
          >
            Hủy
          </button>
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-neutral-950 px-5 text-sm font-semibold text-white hover:bg-neutral-800 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 disabled:opacity-50"
          >
            {saving && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            <span>Lưu</span>
          </button>
        </div>
      </form>
    </div>
  );
}

export default function SavedPlacesView({
  addedTrips,
  onToggleAddTrip,
  onAddAlbumToTrip,
  onBuildTripFromCollection,
}: {
  addedTrips?: Set<string>;
  onToggleAddTrip?: (poiId: string) => void;
  onAddAlbumToTrip?: (poiIds: string[], albumName: string) => void;
  onBuildTripFromCollection?: (collectionId: string, collectionName: string, places: Poi[]) => void;
}) {
  const {
    places,
    collections,
    savedIds,
    pendingIds,
    loading,
    error,
    refresh,
    openCollectionPicker,
  } = useSavedPlaces();
  const [tab, setTab] = useState<SavedTab>('collections');
  const [query, setQuery] = useState('');
  const [cityFilter, setCityFilter] = useState<SavedPlacesCityFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<PoiCategory | 'all'>('all');
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [mobileMapOpen, setMobileMapOpen] = useState(false);
  const [showCollectionMenu, setShowCollectionMenu] = useState(false);
  const [fullDetailPoi, setFullDetailPoi] = useState<Poi | null>(null);
  const [hoveredPoiId, setHoveredPoiId] = useState<string | null>(null);
  const [modalCity, setModalCity] = useState<'all' | 'Đà Nẵng' | 'Huế'>('all');
  const [showModalCityDropdown, setShowModalCityDropdown] = useState(false);
  const [modalSearch, setModalSearch] = useState('');
  const [modalCategory, setModalCategory] = useState<string>('for-you');
  const [showAddPlaceDialog, setShowAddPlaceDialog] = useState(false);
  const [addingPlaceId, setAddingPlaceId] = useState<string | null>(null);
  const [directoryPois, setDirectoryPois] = useState<Poi[]>([]);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [directoryError, setDirectoryError] = useState<string | null>(null);
  const [directoryRetryCount, setDirectoryRetryCount] = useState(0);
  const [collectionPlaces, setCollectionPlaces] = useState<SavedPlace[]>([]);
  const [collectionLoading, setCollectionLoading] = useState(false);
  const [collectionError, setCollectionError] = useState<string | null>(null);
  const [collectionReloadKey, setCollectionReloadKey] = useState(0);
  const [selectedPoiId, setSelectedPoiId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<CollectionDialog>(null);
  const [dialogSaving, setDialogSaving] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<SavedPlaceCollection | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const selectedCollection =
    collections.find((collection) => collection.collection_id === selectedCollectionId) ?? null;

  useEffect(() => {
    if (!selectedCollectionId) {
      setCollectionPlaces([]);
      setMobileMapOpen(false);
      return;
    }
    let active = true;
    setCollectionLoading(true);
    setCollectionError(null);
    getCollectionPlaces(selectedCollectionId)
      .then((response) => {
        if (active) setCollectionPlaces(response.items ?? []);
      })
      .catch(() => {
        if (active) setCollectionError('Chưa tải được địa điểm trong bộ sưu tập.');
      })
      .finally(() => {
        if (active) setCollectionLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedCollectionId, collectionReloadKey, collections]);

  const normalizedPlaces = useMemo(() => normalizeSavedPlaces(places), [places]);
  const normalizedCollectionPlaces = useMemo(
    () => normalizeSavedPlaces(collectionPlaces),
    [collectionPlaces],
  );
  const collectionMapPlaces = useMemo(
    () => normalizedCollectionPlaces.filter(hasValidCoordinates),
    [normalizedCollectionPlaces],
  );
  const filteredPlaces = useMemo(
    () =>
      filterSavedPlaces(normalizedPlaces, cityFilter, categoryFilter).filter((place) =>
        placeMatchesSearch(place, query),
      ),
    [normalizedPlaces, cityFilter, categoryFilter, query],
  );
  const filteredCollectionPlaces = useMemo(
    () =>
      filterSavedPlaces(normalizedCollectionPlaces, cityFilter, categoryFilter).filter((place) =>
        placeMatchesSearch(place, query),
      ),
    [normalizedCollectionPlaces, cityFilter, categoryFilter, query],
  );
  const placeCatalog = useMemo(() => {
    const catalog = new Map<string, Poi>();
    [...pois, ...normalizedPlaces, ...normalizedCollectionPlaces, ...directoryPois].forEach(
      (place) => catalog.set(String(place.id), place),
    );
    return Array.from(catalog.values());
  }, [normalizedCollectionPlaces, normalizedPlaces, directoryPois]);

  const visibleCollections = useMemo(
    () =>
      collections.filter((collection) =>
        `${collection.name}`.toLocaleLowerCase('vi').includes(query.trim().toLocaleLowerCase('vi')),
      ),
    [collections, query],
  );

  const categories = useMemo(
    () =>
      [...new Set((selectedCollectionId ? normalizedCollectionPlaces : normalizedPlaces).map((place) => place.category))].sort(
        (a, b) => categoryLabels[a].localeCompare(categoryLabels[b], 'vi'),
      ),
    [normalizedPlaces, normalizedCollectionPlaces, selectedCollectionId],
  );

  const selectedPoi =
    (selectedCollectionId ? normalizedCollectionPlaces : normalizedPlaces).find(
      (place) => place.id === selectedPoiId,
    ) ?? null;

  useEffect(() => {
    if (!showAddPlaceDialog) return;
    let active = true;
    const loadPlaceCatalog = async () => {
      setDirectoryLoading(true);
      setDirectoryError(null);
      try {
        const firstPage = await getPois({ page: 1, limit: 100 });
        const totalPages = firstPage.pagination?.total_pages ?? 1;
        const remainingPages =
          totalPages > 1
            ? await Promise.all(
                Array.from({ length: totalPages - 1 }, (_, index) =>
                  getPois({ page: index + 2, limit: 100 }),
                ),
              )
            : [];
        const catalog = normalizePois(
          [firstPage, ...remainingPages].flatMap((page) => page.items ?? []),
        );
        if (active && catalog.length > 0) setDirectoryPois(catalog);
      } catch {
        if (active)
          setDirectoryError(
            'Chưa tải được toàn bộ danh mục. Bạn vẫn có thể chọn từ các địa điểm đang có hoặc thử tải lại.',
          );
      } finally {
        if (active) setDirectoryLoading(false);
      }
    };
    void loadPlaceCatalog();
    return () => {
      active = false;
    };
  }, [showAddPlaceDialog, directoryRetryCount]);

  const openCreateDialog = () => {
    setDialogError(null);
    setDialog({ mode: 'create' });
  };

  const openAddPlaceDialog = () => {
    setModalSearch('');
    setModalCategory('for-you');
    setModalCity('all');
    setDirectoryError(null);
    setShowAddPlaceDialog(true);
  };

  const collectionPoiIds = useMemo(
    () => new Set(normalizedCollectionPlaces.map((p) => p.id)),
    [normalizedCollectionPlaces],
  );

  const modalFilteredPois = useMemo(() => {
    let list = placeCatalog;

    if (modalCity === 'Đà Nẵng') {
      list = list.filter((p) => p.city?.includes('Đà Nẵng'));
    } else if (modalCity === 'Huế') {
      list = list.filter((p) => p.city?.includes('Huế'));
    }

    if (modalCategory === 'quan-an') {
      list = list.filter((p) => p.category === 'quan-an');
    } else if (modalCategory === 'experiences') {
      list = list.filter((p) => p.category === 'di-tich' || p.category === 'chua');
    } else if (modalCategory === 'canh-quan') {
      list = list.filter((p) => p.category === 'canh-quan');
    } else if (modalCategory === 'chua') {
      list = list.filter((p) => p.category === 'chua');
    } else if (modalCategory === 'luu-tru') {
      list = list.filter((p) => p.category === 'luu-tru');
    }

    if (modalSearch.trim()) {
      const q = modalSearch.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.address && p.address.toLowerCase().includes(q)) ||
          p.city?.toLowerCase().includes(q),
      );
    }

    return list;
  }, [placeCatalog, modalCity, modalCategory, modalSearch]);

  const saveCollectionName = async (name: string) => {
    if (!dialog || !name) return;
    setDialogSaving(true);
    setDialogError(null);
    try {
      if (dialog.mode === 'create') {
        await createSavedCollection(name);
      } else {
        await renameSavedCollection(dialog.collection.collection_id, name);
      }
      setDialog(null);
      await refresh();
    } catch {
      setDialogError('Không thể lưu bộ sưu tập. Vui lòng thử lại.');
    } finally {
      setDialogSaving(false);
    }
  };

  const confirmDeleteCollection = async () => {
    if (!deleteConfirm) return;
    setDeleteError(null);
    setDialogSaving(true);
    try {
      await deleteSavedCollection(deleteConfirm.collection_id);
      setSelectedCollectionId(null);
      setDeleteConfirm(null);
      await refresh();
    } catch {
      setDeleteError(
        'Không thể xóa bộ sưu tập. Các địa điểm đã lưu vẫn được giữ trong bộ sưu tập mặc định.',
      );
    } finally {
      setDialogSaving(false);
    }
  };

  const removeFromCollection = async (poiId: string) => {
    if (!selectedCollectionId) return;
    try {
      await removePlaceFromCollection(selectedCollectionId, poiId);
      await refresh();
    } catch {
      setCollectionError('Không thể bỏ địa điểm khỏi bộ sưu tập. Vui lòng thử lại.');
    }
  };

  const addSavedPlaceToCollection = async (poiId: string) => {
    if (!selectedCollectionId) return;
    setAddingPlaceId(poiId);
    setCollectionError(null);
    try {
      await addPlaceToCollection(selectedCollectionId, poiId);
      setSelectedPoiId(poiId);
      await refresh();
    } catch {
      setCollectionError('Không thể thêm địa điểm vào bộ sưu tập. Vui lòng thử lại.');
    } finally {
      setAddingPlaceId(null);
    }
  };

  const resetFilters = () => {
    setCityFilter('all');
    setCategoryFilter('all');
    setQuery('');
  };

  const isCollectionDetail = Boolean(selectedCollectionId && selectedCollection);
  const title = isCollectionDetail ? selectedCollection?.name : 'Đã lưu';

  return (
    <main className="relative h-full min-w-0 flex-1 bg-white flex overflow-hidden">
      {/* 1. LEFT / MAIN CONTENT COLUMN */}
      <div
        className={
          isCollectionDetail
            ? `${mobileMapOpen ? 'hidden lg:flex' : 'flex'} w-full lg:w-[640px] shrink-0 h-full bg-white flex-col border-r border-neutral-200/80 overflow-y-auto auto-hide-scrollbar select-none`
            : 'mx-auto w-full max-w-[1680px] px-4 py-6 sm:px-6 sm:py-8 xl:px-10 lg:py-9 overflow-y-auto auto-hide-scrollbar pb-28 md:pb-16'
        }
      >
        {isCollectionDetail ? (
          /* ─── AIRBNB WISHLIST DETAIL STICKY HEADER ─── */
          <header className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-neutral-200/80 px-4 sm:px-7 pt-4 pb-3.5 space-y-3">
            {/* Tier 1: Back + More Menu */}
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  setSelectedCollectionId(null);
                  setSelectedPoiId(null);
                  setFullDetailPoi(null);
                  setQuery('');
                  setCategoryFilter('all');
                }}
                aria-label="Quay lại danh sách bộ sưu tập"
                className="inline-flex items-center gap-1.5 min-h-[40px] px-2.5 -ml-2 rounded-full text-neutral-800 hover:bg-neutral-100 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
              >
                <ArrowLeft size={18} aria-hidden="true" />
                <span className="text-xs font-semibold">Đã lưu</span>
              </button>

              {!selectedCollection?.is_default && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowCollectionMenu((prev) => !prev)}
                    aria-label="Tùy chọn bộ sưu tập"
                    aria-expanded={showCollectionMenu}
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 hover:border-neutral-400 hover:text-neutral-950 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                  >
                    <MoreHorizontal size={18} aria-hidden="true" />
                  </button>
                  {showCollectionMenu && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowCollectionMenu(false)} />
                      <div className="absolute right-0 top-11 z-50 w-48 rounded-2xl border border-neutral-200 bg-white p-1.5 shadow-xl animate-fadeIn">
                        <button
                          type="button"
                          onClick={() => {
                            setShowCollectionMenu(false);
                            setDialogError(null);
                            if (selectedCollection) setDialog({ mode: 'rename', collection: selectedCollection });
                          }}
                          className="flex w-full min-h-[40px] items-center gap-2.5 rounded-xl px-3 text-xs font-semibold text-neutral-800 hover:bg-neutral-50 transition cursor-pointer"
                        >
                          <Pencil size={14} aria-hidden="true" />
                          <span>Đổi tên bộ sưu tập</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowCollectionMenu(false);
                            setDeleteError(null);
                            setDeleteConfirm(selectedCollection);
                          }}
                          className="flex w-full min-h-[40px] items-center gap-2.5 rounded-xl px-3 text-xs font-semibold text-rose-700 hover:bg-rose-50 transition cursor-pointer"
                        >
                          <Trash2 size={14} aria-hidden="true" />
                          <span>Xóa bộ sưu tập</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Tier 2: Large Wishlist Title + Action Pills */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 min-w-0">
                <h1 className="truncate text-xl sm:text-[26px] font-bold tracking-tight text-neutral-950 leading-tight">
                  {title}
                </h1>
                {!selectedCollection?.is_default && (
                  <button
                    type="button"
                    onClick={() => {
                      setDialogError(null);
                      if (selectedCollection) setDialog({ mode: 'rename', collection: selectedCollection });
                    }}
                    aria-label="Đổi tên bộ sưu tập"
                    title="Đổi tên bộ sưu tập"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-neutral-600 hover:text-neutral-950 hover:bg-neutral-100 transition cursor-pointer"
                  >
                    <Pencil size={14} aria-hidden="true" />
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={openAddPlaceDialog}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-neutral-300 bg-white hover:border-neutral-950 px-3.5 text-xs font-semibold text-neutral-950 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                >
                  <Plus size={15} aria-hidden="true" />
                  <span>Thêm địa điểm</span>
                </button>
                {onBuildTripFromCollection && (
                  <button
                    type="button"
                    onClick={() =>
                      onBuildTripFromCollection(
                        selectedCollection!.collection_id,
                        selectedCollection?.name ?? 'Bộ sưu tập',
                        normalizedCollectionPlaces,
                      )
                    }
                    disabled={collectionLoading || normalizedCollectionPlaces.length === 0}
                    title="Tự động xếp lịch theo cụm đúng các địa điểm trong bộ sưu tập này"
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-emerald-800 hover:bg-emerald-900 px-4 text-xs font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-45 shadow-xs cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                  >
                    <Sparkles size={14} aria-hidden="true" />
                    <span>Xếp lịch từ bộ sưu tập</span>
                  </button>
                )}
                {onAddAlbumToTrip && (
                  <button
                    type="button"
                    onClick={() =>
                      onAddAlbumToTrip(
                        normalizedCollectionPlaces.map((place) => place.id),
                        selectedCollection?.name ?? 'Album',
                      )
                    }
                    disabled={collectionLoading || normalizedCollectionPlaces.length === 0}
                    title="Lưu toàn bộ địa điểm trong bộ sưu tập vào một chuyến đi"
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-neutral-300 bg-white hover:border-neutral-950 px-3.5 text-xs font-semibold text-neutral-900 transition disabled:cursor-not-allowed disabled:opacity-45 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                  >
                    <CalendarPlus size={14} aria-hidden="true" />
                    <span>Thêm vào chuyến đi</span>
                  </button>
                )}
              </div>
            </div>

            {/* Compact Search + Category Filter Row */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <div className="flex-1 min-w-[180px] relative flex items-center">
                <Search className="w-4 h-4 text-neutral-500 absolute left-3.5 pointer-events-none" aria-hidden="true" />
                <input
                  type="text"
                  name="collection_search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={`Tìm trong ${selectedCollection?.name ?? 'bộ sưu tập'}…`}
                  aria-label="Tìm địa điểm trong bộ sưu tập"
                  className="w-full h-10 pl-9 pr-9 bg-neutral-100 focus:bg-white text-xs sm:text-sm placeholder:text-neutral-500 text-neutral-950 rounded-full border border-transparent focus:border-neutral-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 transition"
                />
                {query && (
                  <button
                    type="button"
                    aria-label="Xóa từ khóa"
                    onClick={() => setQuery('')}
                    className="absolute right-2.5 w-6 h-6 rounded-full flex items-center justify-center text-neutral-500 hover:text-neutral-900 cursor-pointer"
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                )}
              </div>

              <select
                aria-label="Lọc danh mục trong bộ sưu tập"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value as PoiCategory | 'all')}
                className="h-10 rounded-full border border-neutral-300 bg-white px-3.5 text-xs font-medium text-neutral-900 outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 cursor-pointer"
              >
                <option value="all">Tất cả ({normalizedCollectionPlaces.length})</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {categoryLabels[c]}
                  </option>
                ))}
              </select>
            </div>
          </header>
        ) : (
          /* ─── AIRBNB WISHLISTS TOP HEADER ─── */
          <header className="mb-6 space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-2xl sm:text-[32px] font-bold tracking-tight text-neutral-950 leading-tight">
                  Đã lưu
                </h1>
                <p className="mt-1 text-sm text-neutral-600" aria-live="polite">
                  {places.length} địa điểm yêu thích trong {collections.length} bộ sưu tập
                </p>
              </div>
              <button
                type="button"
                onClick={openCreateDialog}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-neutral-950 px-5 text-sm font-semibold text-white transition hover:bg-neutral-800 cursor-pointer shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2"
              >
                <Plus size={18} aria-hidden="true" />
                <span>Tạo bộ sưu tập</span>
              </button>
            </div>

            {/* Tabs + Pill Search Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-200 pb-3">
              <div className="flex items-center gap-6" role="tablist" aria-label="Nội dung đã lưu">
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === 'collections'}
                  onClick={() => setTab('collections')}
                  className={`min-h-[44px] -mb-[13px] border-b-2 px-1 text-sm font-semibold transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${
                    tab === 'collections'
                      ? 'border-neutral-950 text-neutral-950'
                      : 'border-transparent text-neutral-600 hover:text-neutral-950'
                  }`}
                >
                  Bộ sưu tập <span className="ml-1 font-medium text-neutral-600">({collections.length})</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === 'places'}
                  onClick={() => setTab('places')}
                  className={`min-h-[44px] -mb-[13px] border-b-2 px-1 text-sm font-semibold transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${
                    tab === 'places'
                      ? 'border-neutral-950 text-neutral-950'
                      : 'border-transparent text-neutral-600 hover:text-neutral-950'
                  }`}
                >
                  Tất cả địa điểm <span className="ml-1 font-medium text-neutral-600">({places.length})</span>
                </button>
              </div>

              <label className="flex min-h-[42px] w-full sm:w-80 items-center gap-2.5 rounded-full border border-neutral-200 bg-white px-4 shadow-2xs focus-within:border-emerald-700 focus-within:ring-2 focus-within:ring-emerald-700/20">
                <Search size={16} className="shrink-0 text-neutral-600" aria-hidden="true" />
                <span className="sr-only">Tìm trong mục đã lưu</span>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={tab === 'collections' ? 'Tìm bộ sưu tập...' : 'Tìm địa điểm đã lưu...'}
                  className="min-w-0 flex-1 bg-transparent text-sm text-neutral-950 outline-none placeholder:text-neutral-500"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    aria-label="Xóa nội dung tìm kiếm"
                    className="flex h-7 w-7 items-center justify-center rounded-full text-neutral-600 hover:bg-neutral-100 cursor-pointer"
                  >
                    <X size={15} aria-hidden="true" />
                  </button>
                )}
              </label>
            </div>
          </header>
        )}

        {/* Filter Bar for "Tất cả địa điểm" Tab */}
        {!isCollectionDetail && tab === 'places' && (
          <section
            aria-label="Bộ lọc địa điểm đã lưu"
            className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="inline-flex w-fit max-w-full flex-wrap gap-1 rounded-full bg-neutral-100 p-1" role="group" aria-label="Lọc theo thành phố">
              {([['all', 'Tất cả'], ['danang', 'Đà Nẵng'], ['hue', 'Huế']] as const).map(
                ([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={cityFilter === value}
                    onClick={() => setCityFilter(value)}
                    className={`min-h-[38px] rounded-full px-4 text-xs font-semibold transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${
                      cityFilter === value
                        ? 'bg-neutral-950 text-white shadow-2xs'
                        : 'text-neutral-700 hover:bg-white hover:text-neutral-950'
                    }`}
                  >
                    {label}
                  </button>
                ),
              )}
            </div>

            <div className="flex items-center gap-2.5">
              <label className="text-xs font-semibold text-neutral-700 shrink-0" htmlFor="saved-category-filter">
                Danh mục:
              </label>
              <select
                id="saved-category-filter"
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value as PoiCategory | 'all')}
                className="min-h-[40px] w-full sm:w-auto sm:min-w-48 rounded-full border border-neutral-300 bg-white px-4 text-xs font-medium text-neutral-900 outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 cursor-pointer"
              >
                <option value="all">Tất cả danh mục</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {categoryLabels[category]}
                  </option>
                ))}
              </select>
            </div>
          </section>
        )}

        {/* ─── BODY STATES (Loading / Error / Collection Detail / Collections Grid / All Places) ─── */}
        <div className={isCollectionDetail ? 'px-4 sm:px-7 py-5 pb-28 lg:pb-12' : ''}>
          {loading ? (
            <div
              className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
              aria-label="Đang tải nội dung đã lưu"
              aria-busy="true"
            >
              {Array.from({ length: 4 }, (_, index) => (
                <PoiCardSkeleton key={index} />
              ))}
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50/70 px-6 py-8 text-center" role="alert">
              <p className="text-base font-bold text-rose-950">Chưa tải được nội dung đã lưu</p>
              <p className="mt-1 text-sm text-rose-900">{error}</p>
              <button
                type="button"
                onClick={() => void refresh()}
                className="mt-4 min-h-[44px] rounded-full bg-neutral-950 px-6 text-xs font-semibold text-white hover:bg-neutral-800 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
              >
                Thử tải lại
              </button>
            </div>
          ) : isCollectionDetail ? (
            collectionLoading ? (
              <div
                className="grid grid-cols-1 sm:grid-cols-2 gap-6"
                aria-busy="true"
                aria-label="Đang tải địa điểm trong bộ sưu tập"
              >
                {Array.from({ length: 4 }, (_, index) => (
                  <PoiCardSkeleton key={index} />
                ))}
              </div>
            ) : collectionError ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50/70 px-5 py-6 text-center" role="alert">
                <p className="text-sm font-medium text-rose-950">{collectionError}</p>
                <button
                  type="button"
                  onClick={() => setCollectionReloadKey((key) => key + 1)}
                  className="mt-3 min-h-[40px] px-4 rounded-full bg-neutral-950 text-white text-xs font-semibold hover:bg-neutral-800 cursor-pointer"
                >
                  Thử tải lại
                </button>
              </div>
            ) : filteredCollectionPlaces.length === 0 ? (
              <div className="rounded-2xl border border-neutral-200 bg-neutral-50/70 flex min-h-64 flex-col items-center justify-center px-6 py-12 text-center">
                <div className="w-12 h-12 rounded-full bg-white border border-neutral-200 flex items-center justify-center mb-3 text-neutral-700">
                  <Heart size={22} aria-hidden="true" />
                </div>
                <h2 className="text-base font-bold text-neutral-950">
                  {normalizedCollectionPlaces.length === 0
                    ? 'Bộ sưu tập chưa có địa điểm nào'
                    : 'Không có địa điểm khớp bộ lọc'}
                </h2>
                <p className="mt-1 max-w-sm text-xs text-neutral-600 leading-relaxed">
                  {normalizedCollectionPlaces.length === 0
                    ? 'Thêm ngay những homestay, quán ăn hoặc điểm di sản bạn muốn ghé thăm vào bộ sưu tập này.'
                    : 'Thử xóa từ khóa hoặc chọn lại danh mục để xem toàn bộ địa điểm trong bộ sưu tập.'}
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2.5">
                  {normalizedCollectionPlaces.length === 0 ? (
                    <button
                      type="button"
                      onClick={openAddPlaceDialog}
                      className="min-h-[42px] rounded-full bg-emerald-800 px-5 text-xs font-semibold text-white hover:bg-emerald-900 cursor-pointer"
                    >
                      + Thêm địa điểm ngay
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={resetFilters}
                      className="min-h-[42px] rounded-full bg-neutral-950 px-5 text-xs font-semibold text-white hover:bg-neutral-800 cursor-pointer"
                    >
                      Xóa bộ lọc
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-7">
                {filteredCollectionPlaces.map((poi, index) => {
                  const isSelected = poi.id === selectedPoiId;
                  const isHovered = poi.id === hoveredPoiId;
                  return (
                    <div key={poi.id} className="flex flex-col min-w-0">
                      <ExplorePoiCard
                        poi={poi}
                        index={index}
                        active={isSelected || isHovered}
                        favorite={savedIds.has(poi.id)}
                        favoritePending={pendingIds.has(poi.id)}
                        isAdded={addedTrips?.has(poi.id)}
                        onClick={() => {
                          setSelectedPoiId(poi.id);
                          setFullDetailPoi(poi);
                        }}
                        onHover={(id) => setHoveredPoiId(id)}
                        onToggleFavorite={async (_id, currentPoi) => {
                          if (currentPoi) {
                            await removeFromCollection(currentPoi.id);
                          }
                        }}
                        onToggleAddTrip={onToggleAddTrip}
                      />
                      <div className="mt-2 pt-2 border-t border-neutral-100 flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPoiId(poi.id);
                            setFullDetailPoi(poi);
                          }}
                          className="text-xs font-semibold text-neutral-700 hover:text-neutral-950 underline underline-offset-2 cursor-pointer"
                        >
                          Xem chi tiết
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void removeFromCollection(poi.id);
                          }}
                          className="text-xs font-medium text-neutral-600 hover:text-rose-700 transition cursor-pointer"
                        >
                          Bỏ khỏi bộ sưu tập
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : tab === 'collections' ? (
            visibleCollections.length === 0 ? (
              <div className="rounded-2xl border border-neutral-200 bg-neutral-50/70 flex min-h-64 flex-col items-center justify-center px-6 py-12 text-center">
                <div className="w-12 h-12 rounded-full bg-white border border-neutral-200 flex items-center justify-center mb-3 text-neutral-700">
                  <Heart size={22} aria-hidden="true" />
                </div>
                <p className="text-base font-bold text-neutral-950">
                  {collections.length === 0 ? 'Chưa có bộ sưu tập nào' : 'Không tìm thấy bộ sưu tập phù hợp'}
                </p>
                <p className="mt-1 max-w-sm text-sm text-neutral-600">
                  Tạo bộ sưu tập mới để gom các điểm lưu trú xanh, quán ăn và di sản cho chuyến đi của bạn.
                </p>
                <button
                  type="button"
                  onClick={openCreateDialog}
                  className="mt-4 min-h-[44px] rounded-full bg-neutral-950 px-5 text-sm font-semibold text-white hover:bg-neutral-800 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                >
                  + Tạo bộ sưu tập
                </button>
              </div>
            ) : (
              /* Airbnb Wishlists 4-column Square Card Grid */
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {visibleCollections.map((collection) => (
                  <button
                    key={collection.collection_id}
                    type="button"
                    onClick={() => {
                      setSelectedPoiId(null);
                      setFullDetailPoi(null);
                      setQuery('');
                      setCategoryFilter('all');
                      setSelectedCollectionId(collection.collection_id);
                    }}
                    className="group min-w-0 text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-4 rounded-2xl"
                  >
                    <CollectionCoverCollage
                      collectionId={collection.collection_id}
                      images={collection.cover_images}
                    />
                    <span className="mt-2.5 block truncate text-[15px] font-semibold text-neutral-950 group-hover:text-emerald-800 transition-colors">
                      {collection.name}
                    </span>
                    <span className="mt-0.5 block text-xs font-medium text-neutral-600">
                      {collection.place_count} địa điểm đã lưu
                      {collection.is_default ? ' · Mặc định' : ''}
                    </span>
                  </button>
                ))}
              </div>
            )
          ) : filteredPlaces.length === 0 ? (
            places.length === 0 ? (
              <div className="rounded-2xl border border-neutral-200 bg-neutral-50/70 flex min-h-64 flex-col items-center justify-center px-6 py-12 text-center">
                <div className="w-12 h-12 rounded-full bg-white border border-neutral-200 flex items-center justify-center mb-3 text-neutral-700">
                  <Heart size={22} aria-hidden="true" />
                </div>
                <h2 className="text-base font-bold text-neutral-950">Chưa có địa điểm nào được lưu</h2>
                <p className="mt-1 max-w-md text-sm leading-relaxed text-neutral-600">
                  Khi khám phá Đà Nẵng và Huế, nhấn vào biểu tượng trái tim để lưu nhanh vào bộ sưu tập yêu thích.
                </p>
                <a
                  href="/explore"
                  className="mt-4 inline-flex min-h-[44px] items-center rounded-full bg-emerald-800 px-6 text-sm font-semibold text-white hover:bg-emerald-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                >
                  Khám phá địa điểm xanh
                </a>
              </div>
            ) : (
              <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-5 py-6 sm:flex sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-base font-bold text-neutral-950">Không có địa điểm phù hợp</h2>
                  <p className="mt-1 text-sm text-neutral-600">
                    Thử đổi từ khóa, khu vực hoặc danh mục lọc.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={resetFilters}
                  className="mt-3 min-h-[42px] rounded-full border border-neutral-300 bg-white px-5 text-xs font-semibold text-neutral-900 hover:bg-neutral-100 cursor-pointer sm:mt-0"
                >
                  Xóa bộ lọc
                </button>
              </div>
            )
          ) : (
            <>
              <p className="mb-4 text-xs font-semibold text-neutral-600" aria-live="polite">
                Hiển thị {filteredPlaces.length} / {places.length} địa điểm đã lưu
              </p>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filteredPlaces.map((poi, index) => (
                  <ExplorePoiCard
                    key={poi.id}
                    poi={poi}
                    index={index}
                    active={poi.id === selectedPoiId}
                    favorite={savedIds.has(poi.id)}
                    favoritePending={pendingIds.has(poi.id)}
                    isAdded={addedTrips?.has(poi.id)}
                    onClick={() => setSelectedPoiId(poi.id)}
                    onHover={() => undefined}
                    onToggleFavorite={(_id, currentPoi) => {
                      if (currentPoi) openCollectionPicker(currentPoi);
                    }}
                    onToggleAddTrip={onToggleAddTrip}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Floating Mobile List <-> Map Toggle for Collection Detail */}
      {isCollectionDetail && !fullDetailPoi && (
        <button
          type="button"
          onClick={() => {
            setMobileMapOpen((prev) => !prev);
            window.setTimeout(() => window.dispatchEvent(new Event('resize')), 200);
          }}
          className="lg:hidden fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-30 min-h-[44px] px-5 py-2.5 rounded-full bg-neutral-950 hover:bg-neutral-800 text-white text-sm font-semibold shadow-lg flex items-center gap-2 cursor-pointer active:scale-95 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
        >
          {mobileMapOpen ? (
            <>
              <List size={16} aria-hidden="true" />
              <span>Xem danh sách</span>
            </>
          ) : (
            <>
              <MapIcon size={16} aria-hidden="true" />
              <span>Xem bản đồ</span>
            </>
          )}
        </button>
      )}

      {/* 2. RIGHT COLUMN: INTERACTIVE WISHLIST MAP & POI DETAIL DRAWER */}
      {isCollectionDetail && (
        <div
          className={`${
            mobileMapOpen ? 'flex-1 block pb-16 md:pb-0' : 'hidden lg:block lg:flex-1'
          } h-full min-w-0 p-3 select-none relative`}
        >
          <div className="w-full h-full rounded-[22px] overflow-hidden border border-neutral-200/80 shadow-[0_2px_12px_rgba(0,0,0,0.06)] relative bg-neutral-50">
            <div className={`w-full h-full ${fullDetailPoi ? 'invisible pointer-events-none' : 'visible'}`}>
              {collectionMapPlaces.length > 0 ? (
                <>
                  <PoiMap
                    pois={collectionMapPlaces}
                    selectedPoiId={selectedPoiId}
                    hoveredPoiId={hoveredPoiId}
                    onSelectPoi={(id) => {
                      setSelectedPoiId(id);
                      const found = collectionMapPlaces.find((p) => p.id === id);
                      if (found) setFullDetailPoi(found);
                    }}
                    onHoverPoi={(id) => setHoveredPoiId(id)}
                    favorites={savedIds}
                    pendingFavorites={pendingIds}
                    onToggleFavorite={(_id, currentPoi) => {
                      if (currentPoi) openCollectionPicker(currentPoi);
                    }}
                    addedTrips={addedTrips}
                    onToggleAddTrip={onToggleAddTrip}
                    hideTopControls
                    savedHeartMarkers
                    hideFloatingPreview
                  />
                  {collectionMapPlaces.length < normalizedCollectionPlaces.length && (
                    <p
                      className="absolute left-4 top-4 z-[500] max-w-[calc(100%-5rem)] rounded-xl bg-white/95 px-3 py-2 text-xs font-medium text-neutral-800 shadow-md border border-neutral-200"
                      role="status"
                    >
                      Một số địa điểm chưa có tọa độ hợp lệ nên chưa hiển thị trên bản đồ.
                    </p>
                  )}
                </>
              ) : (
                <div className="flex h-full min-h-64 w-full flex-col items-center justify-center px-6 text-center">
                  <MapIcon size={26} className="mb-3 text-neutral-500" aria-hidden="true" />
                  <h2 className="text-sm font-bold text-neutral-900">
                    {normalizedCollectionPlaces.length === 0
                      ? 'Bộ sưu tập chưa có địa điểm'
                      : 'Chưa có tọa độ để hiển thị bản đồ'}
                  </h2>
                  <p className="mt-1 max-w-sm text-xs text-neutral-600 leading-relaxed">
                    {normalizedCollectionPlaces.length === 0
                      ? 'Thêm địa điểm vào bộ sưu tập để xem ghim vị trí trực quan trên bản đồ.'
                      : 'Các địa điểm vẫn có trong danh sách, nhưng chưa có tọa độ hợp lệ.'}
                  </p>
                </div>
              )}
            </div>

            {/* Slide-in Detail Drawer (same Airbnb PoiDetailSection from P1.1) */}
            {fullDetailPoi && (
              <div className="absolute inset-y-0 right-0 w-full z-40 bg-white rounded-none lg:rounded-l-[24px] border-l border-neutral-200 shadow-[-16px_0_40px_rgba(0,0,0,0.08)] flex flex-col overflow-hidden animate-slideInRight">
                <PoiDetailSection
                  poi={fullDetailPoi}
                  isFavorite={savedIds.has(fullDetailPoi.id)}
                  isFavoritePending={pendingIds.has(fullDetailPoi.id)}
                  onClose={() => setFullDetailPoi(null)}
                  onToggleFavorite={(_id, poi) => {
                    if (poi) openCollectionPicker(poi);
                  }}
                  showAddToTrip={Boolean(onToggleAddTrip)}
                  onToggleAddTrip={onToggleAddTrip}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Detail Drawer when clicking from "Tất cả địa điểm" Tab */}
      {selectedPoi && !isCollectionDetail && (
        <div
          className="fixed inset-0 z-50 bg-black/35 backdrop-blur-[1px] flex justify-end"
          onClick={() => setSelectedPoiId(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:w-[640px] lg:w-[min(55vw,780px)] h-full bg-white shadow-2xl flex flex-col overflow-hidden"
          >
            <PoiDetailSection
              poi={selectedPoi}
              isFavorite={savedIds.has(selectedPoi.id)}
              isFavoritePending={pendingIds.has(selectedPoi.id)}
              showAddToTrip={Boolean(onToggleAddTrip)}
              onToggleAddTrip={onToggleAddTrip}
              onClose={() => setSelectedPoiId(null)}
              onToggleFavorite={(_id, currentPoi) => {
                if (currentPoi) openCollectionPicker(currentPoi);
              }}
            />
          </div>
        </div>
      )}

      {/* ─── MODAL: ADD PLACES TO COLLECTION (Airbnb-aligned, Responsive & WCAG Compliant) ─── */}
      {showAddPlaceDialog && selectedCollection && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 backdrop-blur-[2px] py-4 px-3 sm:py-6 sm:px-4 animate-fadeIn select-none"
          onClick={() => setShowAddPlaceDialog(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-place-modal-title"
            className="relative bg-white w-[780px] max-w-[calc(100vw-24px)] h-[calc(100vh-48px)] max-h-[820px] rounded-3xl shadow-2xl flex flex-col border border-neutral-200 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="relative h-16 shrink-0 border-b border-neutral-200 bg-white flex items-center justify-between px-5 sm:px-6">
              <button
                type="button"
                onClick={() => setShowAddPlaceDialog(false)}
                aria-label="Đóng"
                className="w-10 h-10 rounded-full flex items-center justify-center text-neutral-700 hover:text-neutral-950 hover:bg-neutral-100 transition cursor-pointer"
              >
                <X size={20} aria-hidden="true" />
              </button>
              <h3 id="add-place-modal-title" className="font-bold text-base text-neutral-950 truncate max-w-[70%]">
                Thêm địa điểm vào {selectedCollection.name}
              </h3>
              <span className="w-10" aria-hidden="true" />
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto overscroll-contain px-4 sm:px-6 pb-10 auto-hide-scrollbar">
              {/* Search Pill + City Dropdown */}
              <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-md pt-4 pb-3 space-y-3 border-b border-neutral-100">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowModalCityDropdown((prev) => !prev)}
                      className="inline-flex items-center gap-1.5 min-h-[42px] px-4 rounded-full border border-neutral-300 bg-white hover:border-neutral-950 text-xs font-semibold text-neutral-900 transition cursor-pointer"
                    >
                      <span>{modalCity === 'all' ? 'Đà Nẵng & Huế' : modalCity}</span>
                      <i className="ph ph-caret-down text-xs text-neutral-600" aria-hidden="true" />
                    </button>
                    {showModalCityDropdown && (
                      <div className="absolute top-12 left-0 bg-white shadow-xl border border-neutral-200 rounded-2xl py-1.5 w-52 z-50">
                        {(['all', 'Đà Nẵng', 'Huế'] as const).map((cityOpt) => (
                          <button
                            key={cityOpt}
                            type="button"
                            onClick={() => {
                              setModalCity(cityOpt);
                              setShowModalCityDropdown(false);
                            }}
                            className={`w-full text-left px-4 py-2.5 text-xs hover:bg-neutral-50 flex items-center justify-between cursor-pointer ${
                              modalCity === cityOpt ? 'font-bold text-neutral-950' : 'text-neutral-700'
                            }`}
                          >
                            <span>{cityOpt === 'all' ? 'Tất cả (Đà Nẵng & Huế)' : cityOpt}</span>
                            {modalCity === cityOpt && <Check size={14} className="text-emerald-800" />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-[200px] relative flex items-center">
                    <Search className="w-4 h-4 text-neutral-500 absolute left-3.5 pointer-events-none" aria-hidden="true" />
                    <input
                      type="text"
                      name="add_place_search"
                      aria-label="Tìm kiếm địa điểm để thêm vào bộ sưu tập"
                      value={modalSearch}
                      onChange={(e) => setModalSearch(e.target.value)}
                      placeholder="Tìm kiếm địa điểm, homestay, quán ăn…"
                      className="w-full h-[42px] pl-10 pr-9 bg-neutral-100 focus:bg-white text-sm placeholder:text-neutral-500 text-neutral-950 rounded-full border border-transparent focus:border-neutral-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 transition"
                    />
                    {modalSearch && (
                      <button
                        type="button"
                        aria-label="Xóa từ khóa"
                        onClick={() => setModalSearch('')}
                        className="absolute right-3 text-neutral-500 hover:text-neutral-900 cursor-pointer"
                      >
                        <X size={15} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Category Tabs */}
                <div className="flex items-center gap-2 overflow-x-auto pb-0.5 no-scrollbar">
                  {MODAL_CATEGORY_TABS.map((tabItem) => {
                    const isActive = modalCategory === tabItem.id;
                    return (
                      <button
                        key={tabItem.id}
                        type="button"
                        onClick={() => setModalCategory(tabItem.id)}
                        className={`whitespace-nowrap min-h-[36px] px-3.5 text-xs rounded-full transition cursor-pointer shrink-0 flex items-center justify-center ${
                          isActive
                            ? 'bg-neutral-950 text-white font-semibold shadow-2xs'
                            : 'bg-white border border-neutral-200 text-neutral-700 hover:border-neutral-950 font-medium'
                        }`}
                      >
                        {tabItem.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Loading / Error Banner inside Add Modal */}
              {directoryLoading && (
                <div className="mt-3 flex items-center gap-2 text-xs font-medium text-neutral-600">
                  <Loader2 size={14} className="animate-spin text-emerald-700" aria-hidden="true" />
                  <span>Đang đồng bộ đầy đủ danh mục địa điểm…</span>
                </div>
              )}
              {directoryError && (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-950">
                  <span>{directoryError}</span>
                  <button
                    type="button"
                    onClick={() => setDirectoryRetryCount((c) => c + 1)}
                    className="font-semibold underline underline-offset-2 cursor-pointer"
                  >
                    Thử tải lại
                  </button>
                </div>
              )}

              {/* Responsive 1 / 2 / 3 Column Cards Grid */}
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {modalFilteredPois.length === 0 ? (
                  <div className="col-span-full py-16 text-center text-neutral-600 text-sm">
                    Không tìm thấy địa điểm phù hợp với bộ lọc hiện tại.
                  </div>
                ) : (
                  modalFilteredPois.map((poi) => {
                    const isAdded = collectionPoiIds.has(poi.id);
                    const isBusy = addingPlaceId === poi.id;
                    const ratingVal = (
                      typeof poi.rating === 'number' ? poi.rating : Number(poi.rating || 4.5)
                    ).toFixed(1);

                    return (
                      <div key={poi.id} className="flex flex-col group text-left select-none">
                        <div className="relative aspect-[1.05/1] w-full rounded-2xl overflow-hidden bg-neutral-100">
                          <PoiImage
                            src={poi.image}
                            alt={poi.name}
                            poiId={poi.id}
                            poiName={poi.name}
                            category={poi.category}
                            city={poi.city}
                            className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                          />
                          {poi.isGreen && (
                            <span className="absolute top-2.5 left-2.5 z-10 inline-flex items-center gap-1 rounded-full bg-white/95 backdrop-blur-sm text-emerald-900 text-xs font-semibold px-2.5 py-0.5 shadow-xs pointer-events-none">
                              <Leaf className="w-3 h-3 text-emerald-700" aria-hidden="true" />
                              <span>Địa điểm xanh</span>
                            </span>
                          )}
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => {
                              if (isAdded) {
                                void removeFromCollection(poi.id);
                              } else {
                                void addSavedPlaceToCollection(poi.id);
                              }
                            }}
                            className={`absolute top-2.5 right-2.5 min-h-[34px] px-3 rounded-full font-semibold text-xs transition shadow-xs cursor-pointer active:scale-95 flex items-center justify-center gap-1 z-10 disabled:opacity-70 ${
                              isAdded
                                ? 'bg-emerald-800 text-white'
                                : 'bg-white/95 hover:bg-white text-neutral-950'
                            }`}
                          >
                            {isBusy ? (
                              <Loader2 size={13} className="animate-spin" aria-hidden="true" />
                            ) : isAdded ? (
                              <>
                                <Check size={13} strokeWidth={2.5} aria-hidden="true" />
                                <span>Đã thêm</span>
                              </>
                            ) : (
                              <>
                                <Plus size={13} strokeWidth={2.5} aria-hidden="true" />
                                <span>Thêm</span>
                              </>
                            )}
                          </button>
                        </div>
                        <div className="mt-2 space-y-0.5">
                          <div className="flex items-baseline justify-between gap-1.5">
                            <h4 className="font-semibold text-sm text-neutral-950 truncate leading-snug">
                              {poi.name}
                            </h4>
                            {Number(poi.rating) > 0 && (
                              <span className="text-xs font-semibold text-neutral-900 inline-flex items-center gap-0.5 shrink-0">
                                <Star className="w-3 h-3 fill-neutral-900 text-neutral-900" aria-hidden="true" />
                                <span>{ratingVal}</span>
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-neutral-600 truncate">
                            {poi.city} · {categoryLabels[poi.category] || 'Điểm tham quan'}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {dialog && (
        <CollectionNameDialog
          initialName={dialog.mode === 'rename' ? dialog.collection.name : ''}
          title={dialog.mode === 'create' ? 'Tạo bộ sưu tập mới' : 'Đổi tên bộ sưu tập'}
          onCancel={() => setDialog(null)}
          onSave={(name) => void saveCollectionName(name)}
          saving={dialogSaving}
          error={dialogError}
        />
      )}

      {deleteConfirm && (
        <ConfirmDeleteModal
          role="dialog"
          title={`Xóa bộ sưu tập “${deleteConfirm.name}”?`}
          description="Các địa điểm bên trong vẫn sẽ được giữ an toàn trong “Địa điểm của tôi”."
          confirmLabel="Xóa bộ sưu tập"
          cancelLabel="Hủy"
          busy={dialogSaving}
          error={deleteError}
          onCancel={() => setDeleteConfirm(null)}
          onConfirm={() => confirmDeleteCollection()}
        />
      )}
    </main>
  );
}
