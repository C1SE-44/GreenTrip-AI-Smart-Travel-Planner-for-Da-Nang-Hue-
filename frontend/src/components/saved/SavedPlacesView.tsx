import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CalendarPlus, Check, Heart, Loader2, Map as MapIcon, MoreHorizontal, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import type { Poi, PoiCategory } from '@/data/pois';
import { categoryLabels, normalizePoi, normalizePois, pois } from '@/data/pois';

const MODAL_CATEGORY_TABS = [
  { id: 'for-you', label: 'Tất cả' },
  { id: 'quan-an', label: 'Ẩm thực & Cafe' },
  { id: 'experiences', label: 'Trải nghiệm' },
  { id: 'canh-quan', label: 'Địa điểm' },
  { id: 'chua', label: 'Tâm linh' },
];
import PoiCard from '@/components/poi/PoiCard';
import PoiDetailSection from '@/components/poi/PoiDetailSection';
import PoiMap from '@/components/poi/PoiMap';
import { PoiCardSkeleton } from '@/components/ui/Skeleton';
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

type SavedTab = 'collections' | 'places';
type CollectionDialog = { mode: 'create' } | { mode: 'rename'; collection: SavedPlaceCollection } | null;

function normalizeSavedPlaces(items: SavedPlace[]): Poi[] {
  return items.map((item) => normalizePoi(item, true)).filter((place): place is Poi => place !== null);
}

function hasValidCoordinates(place: { lat: number; lng: number }): boolean {
  return Number.isFinite(place.lat) && Number.isFinite(place.lng)
    && place.lat >= -90 && place.lat <= 90 && place.lng >= -180 && place.lng <= 180;
}

function placeMatchesSearch(place: Pick<SavedPlace, 'name' | 'address' | 'city'>, query: string): boolean {
  if (!query.trim()) return true;
  const text = `${place.name} ${place.address ?? ''} ${place.city ?? ''}`.toLocaleLowerCase('vi');
  return text.includes(query.trim().toLocaleLowerCase('vi'));
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
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 p-4" role="presentation">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="collection-dialog-title"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(name.trim());
        }}
        className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-5 shadow-card sm:p-6"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <h2 id="collection-dialog-title" className="text-lg font-semibold text-neutral-950">{title}</h2>
          <button type="button" onClick={onCancel} aria-label="Đóng" className="flex h-10 w-10 items-center justify-center rounded-full text-neutral-700 hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-800">
            <X size={19} aria-hidden="true" />
          </button>
        </div>
        <label htmlFor="collection-name" className="mb-1.5 block text-sm font-medium text-neutral-800">Tên bộ sưu tập</label>
        <input
          id="collection-name"
          autoFocus
          maxLength={80}
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="min-h-11 w-full rounded-xl border border-neutral-300 px-3 text-sm text-neutral-950 outline-none focus-visible:ring-2 focus-visible:ring-neutral-800"
        />
        {error && <p className="mt-2 text-sm text-red-800" role="alert">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={saving} className="min-h-11 rounded-xl px-4 text-sm font-medium text-neutral-800 hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-800 disabled:opacity-50">Hủy</button>
          <button type="submit" disabled={saving || !name.trim()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-neutral-900 px-4 text-sm font-semibold text-white hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-800 focus-visible:ring-offset-2 disabled:opacity-50">
            {saving && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            Lưu
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
}: {
  addedTrips?: Set<string>;
  onToggleAddTrip?: (poiId: string) => void;
  onAddAlbumToTrip?: (poiIds: string[], albumName: string) => void;
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
  const [showCollectionMap, setShowCollectionMap] = useState(true);
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
  const [addPlaceSearch, setAddPlaceSearch] = useState('');
  const [addPlaceCityFilter, setAddPlaceCityFilter] = useState<SavedPlacesCityFilter>('all');
  const [addPlaceCategoryFilter, setAddPlaceCategoryFilter] = useState<PoiCategory | 'all'>('all');
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

  const selectedCollection = collections.find((collection) => collection.collection_id === selectedCollectionId) ?? null;

  useEffect(() => {
    if (!selectedCollectionId) {
      setCollectionPlaces([]);
      return;
    }
    let active = true;
    setCollectionLoading(true);
    setCollectionError(null);
    getCollectionPlaces(selectedCollectionId)
      .then((response) => { if (active) setCollectionPlaces(response.items ?? []); })
      .catch(() => { if (active) setCollectionError('Chưa tải được địa điểm trong bộ sưu tập.'); })
      .finally(() => { if (active) setCollectionLoading(false); });
    return () => { active = false; };
  }, [selectedCollectionId, collectionReloadKey, collections]);

  const normalizedPlaces = useMemo(() => normalizeSavedPlaces(places), [places]);
  const normalizedCollectionPlaces = useMemo(() => normalizeSavedPlaces(collectionPlaces), [collectionPlaces]);
  const collectionMapPlaces = useMemo(
    () => normalizedCollectionPlaces.filter(hasValidCoordinates),
    [normalizedCollectionPlaces],
  );
  const filteredPlaces = useMemo(
    () => filterSavedPlaces(normalizedPlaces, cityFilter, categoryFilter).filter((place) => placeMatchesSearch(place, query)),
    [normalizedPlaces, cityFilter, categoryFilter, query],
  );
  const filteredCollectionPlaces = useMemo(
    () => filterSavedPlaces(normalizedCollectionPlaces, cityFilter, categoryFilter)
      .filter((place) => placeMatchesSearch(place, query)),
    [normalizedCollectionPlaces, cityFilter, categoryFilter, query],
  );
  const placeCatalog = useMemo(() => {
    const catalog = new Map<string, Poi>();
    [...pois, ...normalizedPlaces, ...normalizedCollectionPlaces, ...directoryPois]
      .forEach((place) => catalog.set(String(place.id), place));
    return Array.from(catalog.values());
  }, [normalizedCollectionPlaces, normalizedPlaces, directoryPois]);
  const availablePlacesToAdd = useMemo(() => {
    const collectionPoiIds = new Set(normalizedCollectionPlaces.map((place) => place.id));
    return filterSavedPlaces(placeCatalog, addPlaceCityFilter, addPlaceCategoryFilter)
      .filter((place) => !collectionPoiIds.has(place.id) && placeMatchesSearch(place, addPlaceSearch))
      .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  }, [placeCatalog, normalizedCollectionPlaces, addPlaceCityFilter, addPlaceCategoryFilter, addPlaceSearch]);
  const visibleCollections = useMemo(
    () => collections.filter((collection) => `${collection.name}`.toLocaleLowerCase('vi').includes(query.trim().toLocaleLowerCase('vi'))),
    [collections, query],
  );
  const categories = useMemo(
    () => [...new Set(normalizedPlaces.map((place) => place.category))]
      .sort((a, b) => categoryLabels[a].localeCompare(categoryLabels[b], 'vi')),
    [normalizedPlaces],
  );
  const selectedPoi = (selectedCollectionId ? normalizedCollectionPlaces : normalizedPlaces)
    .find((place) => place.id === selectedPoiId) ?? null;

  useEffect(() => {
    if (!showAddPlaceDialog) return;
    let active = true;
    const loadPlaceCatalog = async () => {
      setDirectoryLoading(true);
      setDirectoryError(null);
      try {
        const firstPage = await getPois({ page: 1, limit: 100 });
        const totalPages = firstPage.pagination?.total_pages ?? 1;
        const remainingPages = totalPages > 1
          ? await Promise.all(Array.from({ length: totalPages - 1 }, (_, index) => getPois({ page: index + 2, limit: 100 })))
          : [];
        const catalog = normalizePois([firstPage, ...remainingPages].flatMap((page) => page.items ?? []));
        if (active && catalog.length > 0) setDirectoryPois(catalog);
      } catch {
        if (active) setDirectoryError('Chưa tải được toàn bộ danh mục. Bạn vẫn có thể chọn từ các địa điểm đang có; thử tải lại để cập nhật.');
      } finally {
        if (active) setDirectoryLoading(false);
      }
    };
    void loadPlaceCatalog();
    return () => { active = false; };
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
      setDeleteError('Không thể xóa bộ sưu tập. Các địa điểm đã lưu vẫn được giữ trong bộ sưu tập mặc định.');
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
      <div
        className={
          isCollectionDetail
            ? 'w-[650px] shrink-0 h-full bg-white flex flex-col border-r border-neutral-100 overflow-y-auto auto-hide-scrollbar px-8 pt-8 pb-6 select-none'
            : 'mx-auto w-full max-w-[1440px] px-5 py-7 sm:px-8 sm:py-8 lg:px-10 lg:py-9 overflow-y-auto auto-hide-scrollbar'
        }
      >
        <header className="mb-4">
          {isCollectionDetail ? (
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => { setSelectedCollectionId(null); setSelectedPoiId(null); }}
                  aria-label="Quay lại bộ sưu tập"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-neutral-700 hover:bg-neutral-100 transition-colors"
                >
                  <ArrowLeft size={18} aria-hidden="true" />
                </button>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h1 className="truncate text-[20px] font-bold tracking-tight text-neutral-950">{title}</h1>
                    <button
                      type="button"
                      onClick={() => { setDialogError(null); if (selectedCollection) setDialog({ mode: 'rename', collection: selectedCollection }); }}
                      aria-label="Đổi tên bộ sưu tập"
                      title="Đổi tên bộ sưu tập"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 transition-colors"
                    >
                      <Pencil size={14} aria-hidden="true" />
                    </button>
                  </div>
                  <p className="text-xs text-neutral-500 font-medium" aria-live="polite">
                    {selectedCollection?.place_count ?? collectionPlaces.length} địa điểm
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={openAddPlaceDialog}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full bg-neutral-950 px-3.5 text-xs font-semibold text-white hover:bg-neutral-800 transition-colors shadow-xs"
                >
                  <Plus size={15} aria-hidden="true" />
                  <span>Thêm địa điểm</span>
                </button>
                {onAddAlbumToTrip && (
                  <button
                    type="button"
                    onClick={() => onAddAlbumToTrip(normalizedCollectionPlaces.map((place) => place.id), selectedCollection?.name ?? 'Album')}
                    disabled={collectionLoading || normalizedCollectionPlaces.length === 0}
                    title="Lưu toàn bộ địa điểm trong album vào một chuyến đi"
                    className="inline-flex h-9 items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3.5 text-xs font-semibold text-neutral-800 hover:bg-neutral-50 hover:border-neutral-300 transition-colors disabled:cursor-not-allowed disabled:opacity-40 shadow-xs"
                  >
                    <CalendarPlus size={14} aria-hidden="true" />
                    <span>Thêm vào chuyến đi</span>
                  </button>
                )}
                {!selectedCollection?.is_default && (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowCollectionMenu((prev) => !prev)}
                      aria-label="Tùy chọn bộ sưu tập"
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 transition-colors shadow-xs"
                    >
                      <MoreHorizontal size={16} aria-hidden="true" />
                    </button>
                    {showCollectionMenu && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setShowCollectionMenu(false)} />
                        <div className="absolute right-0 top-10 z-50 w-44 rounded-2xl border border-neutral-100 bg-white p-1.5 shadow-xl animate-fadeIn">
                          <button
                            type="button"
                            onClick={() => {
                              setShowCollectionMenu(false);
                              setDialogError(null);
                              if (selectedCollection) setDialog({ mode: 'rename', collection: selectedCollection });
                            }}
                            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
                          >
                            <Pencil size={14} />
                            <span>Đổi tên album</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setShowCollectionMenu(false);
                              setDeleteError(null);
                              setDeleteConfirm(selectedCollection);
                            }}
                            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 transition-colors"
                          >
                            <Trash2 size={14} />
                            <span>Xóa bộ sưu tập</span>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-[22px] font-bold tracking-tight text-neutral-950">Bộ sưu tập của bạn</h1>
                <p className="mt-1 text-sm text-neutral-600" aria-live="polite">{places.length} địa điểm đã lưu</p>
              </div>
              <button type="button" onClick={openCreateDialog} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-neutral-900 px-5 text-sm font-semibold text-white transition hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-800 focus-visible:ring-offset-2"><Plus size={18} aria-hidden="true" /> Tạo bộ sưu tập</button>
            </div>
          )}
        </header>

        {!isCollectionDetail && (
          <>
            <div className="mb-4 flex items-center gap-6 border-b border-neutral-200" role="tablist" aria-label="Nội dung đã lưu">
              <button type="button" role="tab" aria-selected={tab === 'collections'} onClick={() => setTab('collections')} className={`min-h-11 border-b-2 px-1 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-800 ${tab === 'collections' ? 'border-neutral-900 text-neutral-950' : 'border-transparent text-neutral-600 hover:text-neutral-950'}`}>
                Bộ sưu tập <span className="ml-1 font-normal text-neutral-600">{collections.length}</span>
              </button>
              <button type="button" role="tab" aria-selected={tab === 'places'} onClick={() => setTab('places')} className={`min-h-11 border-b-2 px-1 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-800 ${tab === 'places' ? 'border-neutral-900 text-neutral-950' : 'border-transparent text-neutral-600 hover:text-neutral-950'}`}>
                Địa điểm <span className="ml-1 font-normal text-neutral-600">{places.length}</span>
              </button>
            </div>
            <label className="mb-5 flex min-h-12 items-center gap-3 rounded-full bg-neutral-100 px-4 focus-within:ring-2 focus-within:ring-neutral-800">
              <Search size={19} className="shrink-0 text-neutral-700" aria-hidden="true" />
              <span className="sr-only">Tìm trong mục đã lưu</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tab === 'collections' ? 'Tìm bộ sưu tập' : 'Tìm địa điểm đã lưu'} className="min-w-0 flex-1 bg-transparent text-sm text-neutral-950 outline-none placeholder:text-neutral-600" />
              {query && <button type="button" onClick={() => setQuery('')} aria-label="Xóa nội dung tìm kiếm" className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-700 hover:bg-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-800"><X size={16} /></button>}
            </label>
          </>
        )}

        {isCollectionDetail && (
          <div className="space-y-3 mb-5">
            <div className="flex items-center gap-3">
              <div className="flex-1 relative flex items-center">
                <i className="ph ph-magnifying-glass text-gray-400 absolute left-4 text-lg" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={`Tìm trong ${selectedCollection?.name ?? 'bộ sưu tập'}...`}
                  className="w-full h-[42px] pl-10 pr-9 bg-white text-[13.5px] placeholder-gray-400 text-gray-900 rounded-full border border-gray-300 focus:border-black focus:outline-none shadow-2xs transition"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    className="absolute right-3.5 text-gray-400 hover:text-gray-600 cursor-pointer"
                  >
                    <i className="ph ph-x-circle text-lg" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-neutral-500 pt-0.5">
              <div className="flex items-center gap-2">
                <span className="font-medium text-neutral-700">Lọc danh mục:</span>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value as PoiCategory | 'all')}
                  className="h-8 rounded-full border border-neutral-200 bg-white px-3 text-xs text-neutral-800 outline-none focus:border-black cursor-pointer shadow-2xs"
                >
                  <option value="all">Tất cả danh mục</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>{categoryLabels[c]}</option>
                  ))}
                </select>
              </div>
              <span className="text-neutral-500 font-medium">{filteredCollectionPlaces.length} địa điểm</span>
            </div>
          </div>
        )}

        {!isCollectionDetail && tab === 'places' && (
          <section aria-label="Bộ lọc địa điểm đã lưu" className="mb-5 flex flex-col gap-4 border-y border-neutral-200 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <span className="text-sm font-medium text-neutral-800">Thành phố</span>
              <div className="inline-flex w-fit max-w-full flex-wrap gap-1 rounded-full bg-neutral-100 p-1" role="group" aria-label="Lọc theo thành phố">
                {([['all', 'Tất cả'], ['danang', 'Đà Nẵng'], ['hue', 'Huế']] as const).map(([value, label]) => (
                  <button key={value} type="button" aria-pressed={cityFilter === value} onClick={() => setCityFilter(value)} className={`min-h-10 rounded-full px-4 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-800 ${cityFilter === value ? 'bg-neutral-900 text-white' : 'text-neutral-700 hover:bg-white hover:text-neutral-950'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex min-w-0 flex-col gap-2 text-sm font-medium text-neutral-800 sm:flex-row sm:items-center sm:gap-3">
              Danh mục
              <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value as PoiCategory | 'all')} className="min-h-10 w-full min-w-0 rounded-full border border-neutral-300 bg-white px-4 text-sm text-neutral-900 outline-none focus-visible:ring-2 focus-visible:ring-neutral-800 sm:w-auto sm:min-w-52">
                <option value="all">Tất cả danh mục</option>
                {categories.map((category) => <option key={category} value={category}>{categoryLabels[category]}</option>)}
              </select>
            </label>
          </section>
        )}

        {loading ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3" aria-label="Đang tải nội dung đã lưu" aria-busy="true">
            {Array.from({ length: 6 }, (_, index) => <PoiCardSkeleton key={index} />)}
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-5 py-7" role="alert">
            <p className="text-base font-semibold text-neutral-950">Chưa tải được nội dung đã lưu</p>
            <p className="mt-1 text-sm text-neutral-700">{error}</p>
            <button type="button" onClick={() => void refresh()} className="mt-4 min-h-11 rounded-full bg-neutral-900 px-5 text-sm font-semibold text-white hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-800">Thử tải lại</button>
          </div>
        ) : isCollectionDetail ? (
          collectionLoading ? (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Đang tải địa điểm trong bộ sưu tập">{Array.from({ length: 3 }, (_, index) => <PoiCardSkeleton key={index} />)}</div>
          ) : collectionError ? (
            <div className="rounded-2xl bg-neutral-50 px-5 py-6" role="alert"><p className="text-sm text-neutral-800">{collectionError}</p><button type="button" onClick={() => setCollectionReloadKey((key) => key + 1)} className="mt-3 min-h-10 text-sm font-semibold text-neutral-950 underline underline-offset-4">Thử tải lại</button></div>
          ) : filteredCollectionPlaces.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center px-6 py-10 text-center">
              <Heart size={24} className="mb-3 text-neutral-700" aria-hidden="true" />
              <h2 className="text-base font-semibold text-neutral-950">Bộ sưu tập chưa có địa điểm</h2>
              <p className="mt-1 text-sm text-neutral-700">Hãy lưu một nơi bạn muốn ghé thăm vào bộ sưu tập này.</p>
              <button type="button" onClick={() => { setSelectedCollectionId(null); setTab('places'); }} className="mt-4 min-h-11 rounded-full bg-neutral-900 px-5 text-sm font-semibold text-white hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-800">Xem địa điểm đã lưu</button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-x-4 gap-y-6 pt-1 pb-12">
              {filteredCollectionPlaces.map((poi, index) => {
                const isSelected = poi.id === selectedPoiId;
                const isHovered = poi.id === hoveredPoiId;
                return (
                  <div key={poi.id} className="flex flex-col group min-w-0">
                    <PoiCard
                      poi={poi}
                      index={index}
                      active={isSelected || isHovered}
                      favorite={savedIds.has(poi.id)}
                      favoritePending={pendingIds.has(poi.id)}
                      isAdded={addedTrips?.has(poi.id)}
                      showAddToTrip={Boolean(onToggleAddTrip)}
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
                    <div className="flex justify-between items-center pt-1 px-0.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void removeFromCollection(poi.id);
                        }}
                        className="text-[12px] text-gray-400 hover:text-rose-600 transition-colors cursor-pointer text-left"
                      >
                        Bỏ khỏi album
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : !isCollectionDetail && tab === 'collections' ? (
          visibleCollections.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center px-6 py-10 text-center">
              <p className="text-base font-semibold text-neutral-950">Không tìm thấy bộ sưu tập</p>
              <p className="mt-1 text-sm text-neutral-700">Thử đổi từ khóa hoặc tạo bộ sưu tập mới.</p>
              <button type="button" onClick={openCreateDialog} className="mt-4 min-h-11 rounded-full bg-neutral-900 px-5 text-sm font-semibold text-white hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-800">Tạo bộ sưu tập</button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visibleCollections.map((collection) => (
                  <button key={collection.collection_id} type="button" onClick={() => { setSelectedPoiId(null); setShowCollectionMap(true); setSelectedCollectionId(collection.collection_id); }} className="group min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-800 focus-visible:ring-offset-4">
                  <span className="grid aspect-[1.28/1] grid-cols-2 gap-1 overflow-hidden rounded-2xl bg-neutral-100">
                    {Array.from({ length: 4 }, (_, index) => {
                      const image = collection.cover_images[index];
                      if (image) return <img key={`${image}-${index}`} src={image} alt="" loading="lazy" className="h-full min-h-0 w-full object-cover" />;
                      return <span key={`empty-${index}`} className="flex h-full min-h-0 w-full items-center justify-center bg-neutral-100 text-neutral-600" aria-hidden="true">{collection.cover_images.length === 0 && index === 0 ? <Heart size={28} /> : null}</span>;
                    })}
                  </span>
                  <span className="mt-2 block truncate text-base font-semibold text-neutral-950 group-hover:underline group-hover:underline-offset-4">{collection.name}</span>
                  <span className="mt-0.5 block text-sm text-neutral-700">{collection.place_count} địa điểm{collection.is_default ? ' · Mặc định' : ''}</span>
                </button>
              ))}
            </div>
          )
        ) : filteredPlaces.length === 0 ? (
          places.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center px-6 py-10 text-center">
              <Heart size={24} className="mb-3 text-neutral-700" aria-hidden="true" />
              <h2 className="text-base font-semibold text-neutral-950">Chưa có địa điểm nào được lưu</h2>
              <p className="mt-1 max-w-md text-sm leading-relaxed text-neutral-700">Khi bạn tìm thấy nơi muốn ghé thăm, nhấn trái tim để chọn bộ sưu tập.</p>
              <a href="/explore" className="mt-4 inline-flex min-h-11 items-center rounded-full bg-neutral-900 px-5 text-sm font-semibold text-white hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-800">Khám phá địa điểm</a>
            </div>
          ) : (
            <div className="rounded-2xl bg-neutral-50 px-5 py-6 sm:flex sm:items-center sm:justify-between">
              <div><h2 className="text-base font-semibold text-neutral-950">Không có địa điểm phù hợp</h2><p className="mt-1 text-sm text-neutral-700">Thử đổi từ khóa, thành phố hoặc danh mục.</p></div>
              <button type="button" onClick={resetFilters} className="mt-3 min-h-11 rounded-full border border-neutral-300 bg-white px-5 text-sm font-semibold text-neutral-900 hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-800 sm:mt-0">Xóa bộ lọc</button>
            </div>
          )
        ) : (
          <>
            <p className="mb-4 text-sm text-neutral-700" aria-live="polite">Hiển thị {filteredPlaces.length} / {places.length} địa điểm</p>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {filteredPlaces.map((poi, index) => <PoiCard key={poi.id} poi={poi} index={index} compact showSavedCount active={poi.id === selectedPoiId} favorite={savedIds.has(poi.id)} favoritePending={pendingIds.has(poi.id)} isAdded={addedTrips?.has(poi.id)} showAddToTrip={Boolean(onToggleAddTrip)} onClick={() => setSelectedPoiId(poi.id)} onHover={() => undefined} onToggleFavorite={(_id, currentPoi) => { if (currentPoi) openCollectionPicker(currentPoi); }} onToggleAddTrip={onToggleAddTrip} />)}
            </div>
          </>
        )}
      </div>

      {/* 2. CỘT PHẢI: BẢN ĐỒ BỘ SƯU TẬP & CHI TIẾT ĐỊA ĐIỂM (ĐỒNG BỘ 100% TRANG EXPLORE) */}
      {isCollectionDetail && (
        <div className="flex-1 h-full min-w-0 p-3 select-none relative">
          <div className="w-full h-full rounded-[24px] overflow-hidden border border-gray-100 shadow-sm relative bg-[#f8f9fa]">
            {/* Interactive Map */}
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
                    onToggleFavorite={(_id, currentPoi) => { if (currentPoi) openCollectionPicker(currentPoi); }}
                    addedTrips={addedTrips}
                    onToggleAddTrip={onToggleAddTrip}
                    hideTopControls
                    savedHeartMarkers
                    hideFloatingPreview
                  />
                  {collectionMapPlaces.length < normalizedCollectionPlaces.length && (
                    <p className="absolute left-4 top-4 z-[500] max-w-[calc(100%-5rem)] rounded-xl bg-white/95 px-3 py-2 text-xs text-neutral-800 shadow-card" role="status">
                      Một số địa điểm chưa có tọa độ hợp lệ nên không hiển thị trên bản đồ.
                    </p>
                  )}
                </>
              ) : (
                <div className="flex h-full min-h-64 w-full flex-col items-center justify-center px-6 text-center">
                  <MapIcon size={24} className="mb-3 text-neutral-400" aria-hidden="true" />
                  <h2 className="text-sm font-semibold text-neutral-900">
                    {normalizedCollectionPlaces.length === 0 ? 'Bộ sưu tập chưa có địa điểm' : 'Chưa có tọa độ để hiển thị bản đồ'}
                  </h2>
                  <p className="mt-1 max-w-sm text-xs text-neutral-500">
                    {normalizedCollectionPlaces.length === 0
                      ? 'Thêm địa điểm vào bộ sưu tập để xem vị trí trên bản đồ.'
                      : 'Các địa điểm vẫn có trong danh sách, nhưng chưa có tọa độ hợp lệ.'}
                  </p>
                </div>
              )}
            </div>

            {/* Bảng chi tiết trượt từ bên phải qua y hệt trang Explore */}
            {fullDetailPoi && (
              <div className="absolute inset-y-0 right-0 w-full z-40 bg-white rounded-l-[24px] border-l border-t border-b border-gray-200/90 shadow-[-16px_0_40px_rgba(0,0,0,0.08),-4px_0_12px_rgba(0,0,0,0.04)] flex flex-col overflow-hidden animate-slideInRight">
                <PoiDetailSection
                  poi={fullDetailPoi}
                  isFavorite={savedIds.has(fullDetailPoi.id)}
                  isFavoritePending={pendingIds.has(fullDetailPoi.id)}
                  onClose={() => setFullDetailPoi(null)}
                  onToggleFavorite={(_id, poi) => { if (poi) openCollectionPicker(poi); }}
                  showAddToTrip={Boolean(onToggleAddTrip)}
                  onToggleAddTrip={onToggleAddTrip}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {selectedPoi && !isCollectionDetail && (
        <div className="fixed inset-y-0 right-0 z-50 w-full bg-white shadow-2xl sm:w-[620px] lg:w-[min(50vw,760px)]">
          <PoiDetailSection poi={selectedPoi} isFavorite={savedIds.has(selectedPoi.id)} isFavoritePending={pendingIds.has(selectedPoi.id)} showAddToTrip={false} onClose={() => setSelectedPoiId(null)} onToggleFavorite={(_id, currentPoi) => { if (currentPoi) openCollectionPicker(currentPoi); }} />
        </div>
      )}

      {/* MODAL THÊM ĐỊA ĐIỂM (TÁI SỬ DỤNG GIAO DIỆN CHUẨN MINDTRIP COMPACT NHƯ TRANG Ý TƯỞNG) */}
      {showAddPlaceDialog && selectedCollection && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-xs py-6 px-4 animate-fadeIn select-none"
          onClick={() => setShowAddPlaceDialog(false)}
        >
          <div
            className="relative bg-white w-[750px] max-w-[calc(100vw-32px)] h-[calc(100vh-80px)] max-h-[820px] rounded-[24px] shadow-2xl flex flex-col border border-gray-100 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top Header */}
            <div className="relative h-[64px] shrink-0 border-b border-gray-200 bg-white rounded-t-[24px] flex items-center justify-between px-6">
              <button
                type="button"
                onClick={() => setShowAddPlaceDialog(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-gray-500 hover:text-black hover:bg-gray-100 transition cursor-pointer"
                title="Đóng"
              >
                <X size={18} />
              </button>
              <h3 className="font-bold text-[16px] text-gray-950 truncate max-w-[500px]">
                Thêm địa điểm vào {selectedCollection.name}
              </h3>
              <span className="w-8" aria-hidden="true" />
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto px-6 pb-10 auto-hide-scrollbar">
              {/* City Dropdown */}
              <div className="pt-4 shrink-0">
                <div className="relative inline-block">
                  <div
                    onClick={() => setShowModalCityDropdown((prev) => !prev)}
                    className="inline-flex items-center gap-1.5 cursor-pointer select-none group"
                  >
                    <h2 className="text-[20px] font-bold text-gray-950 tracking-tight leading-tight group-hover:text-black">
                      {modalCity === 'all' ? 'Tất cả khu vực (Đà Nẵng & Huế)' : modalCity}
                    </h2>
                    <i className="ph ph-caret-down text-[16px] font-bold text-gray-950 group-hover:translate-y-0.5 transition-transform" />
                  </div>

                  {showModalCityDropdown && (
                    <div className="absolute top-10 left-0 bg-white shadow-xl border border-gray-100 rounded-xl py-1.5 w-52 z-50 animate-fadeIn">
                      <button
                        type="button"
                        onClick={() => { setModalCity('all'); setShowModalCityDropdown(false); }}
                        className={`w-full text-left px-4 py-2 text-[13px] hover:bg-gray-50 flex items-center justify-between cursor-pointer ${
                          modalCity === 'all' ? 'font-bold text-black' : 'text-gray-700'
                        }`}
                      >
                        <span>Tất cả khu vực (Đà Nẵng & Huế)</span>
                        {modalCity === 'all' && <i className="ph ph-check font-bold" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setModalCity('Đà Nẵng'); setShowModalCityDropdown(false); }}
                        className={`w-full text-left px-4 py-2 text-[13px] hover:bg-gray-50 flex items-center justify-between cursor-pointer ${
                          modalCity === 'Đà Nẵng' ? 'font-bold text-black' : 'text-gray-700'
                        }`}
                      >
                        <span>Đà Nẵng</span>
                        {modalCity === 'Đà Nẵng' && <i className="ph ph-check font-bold" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setModalCity('Huế'); setShowModalCityDropdown(false); }}
                        className={`w-full text-left px-4 py-2 text-[13px] hover:bg-gray-50 flex items-center justify-between cursor-pointer ${
                          modalCity === 'Huế' ? 'font-bold text-black' : 'text-gray-700'
                        }`}
                      >
                        <span>Huế</span>
                        {modalCity === 'Huế' && <i className="ph ph-check font-bold" />}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Search Bar */}
              <div className="mt-3 flex items-center gap-2.5 shrink-0">
                <div className="flex-1 relative flex items-center min-w-0">
                  <i className="ph ph-magnifying-glass text-gray-400 absolute left-4 text-lg" />
                  <input
                    type="text"
                    value={modalSearch}
                    onChange={(e) => setModalSearch(e.target.value)}
                    placeholder="Tìm kiếm địa điểm, di tích, ẩm thực..."
                    className="w-full h-[42px] pl-10 pr-9 bg-white text-[13.5px] placeholder-gray-400 text-gray-900 rounded-full border border-gray-300 focus:border-black focus:outline-none shadow-2xs transition"
                  />
                  {modalSearch && (
                    <button
                      type="button"
                      onClick={() => setModalSearch('')}
                      className="absolute right-3.5 text-gray-400 hover:text-gray-600 cursor-pointer"
                    >
                      <i className="ph ph-x-circle text-lg" />
                    </button>
                  )}
                </div>
              </div>

              {/* Category Tabs */}
              <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-0.5 no-scrollbar shrink-0">
                {MODAL_CATEGORY_TABS.map((tab) => {
                  const isActive = modalCategory === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setModalCategory(tab.id)}
                      className={`whitespace-nowrap h-[32px] px-3.5 text-[12.5px] rounded-full transition-all cursor-pointer shrink-0 flex items-center justify-center ${
                        isActive
                          ? 'bg-black text-white font-medium shadow-xs'
                          : 'text-gray-700 hover:text-black hover:bg-gray-100 font-medium'
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {/* Cards Grid: 3 columns */}
              <div className="mt-4 grid grid-cols-3 gap-x-3.5 gap-y-5">
                {modalFilteredPois.length === 0 ? (
                  <div className="col-span-full py-16 text-center text-gray-500 text-sm">
                    Không tìm thấy địa điểm phù hợp với bộ lọc hiện tại.
                  </div>
                ) : (
                  modalFilteredPois.map((poi) => {
                    const isAdded = collectionPoiIds.has(poi.id);
                    const ratingVal = (typeof poi.rating === 'number' ? poi.rating : Number(poi.rating || 4.5)).toFixed(1);

                    return (
                      <div key={poi.id} className="flex flex-col group cursor-pointer text-left select-none">
                        <div className="relative aspect-[1.05/1] w-full rounded-[16px] overflow-hidden bg-gray-100 shadow-2xs">
                          <img
                            src={poi.image}
                            alt={poi.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            onError={(e) => {
                              e.currentTarget.src = 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=800&auto=format&fit=crop&q=80';
                            }}
                          />
                          {poi.isGreen && (
                            <div className="absolute top-2.5 left-2.5 z-10 bg-emerald-950/80 text-emerald-200 border border-emerald-400/40 text-[10.5px] font-bold px-2 py-0.5 rounded-full shadow-md backdrop-blur-md flex items-center gap-1 pointer-events-none">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                              <span>🌱 Địa điểm xanh</span>
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              if (isAdded) {
                                void removeFromCollection(poi.id);
                              } else {
                                void addSavedPlaceToCollection(poi.id);
                              }
                            }}
                            className={`absolute top-2.5 right-2.5 h-[28px] px-2.5 rounded-full font-semibold text-[12px] transition shadow-xs cursor-pointer active:scale-95 flex items-center justify-center gap-1 z-10 ${
                              isAdded
                                ? 'bg-emerald-700 text-white shadow-sm ring-1 ring-emerald-800'
                                : 'bg-white/95 hover:bg-white text-gray-900 shadow-xs'
                            }`}
                          >
                            {isAdded ? (
                              <>
                                <Check size={13} strokeWidth={2.5} />
                                <span>Đã thêm</span>
                              </>
                            ) : (
                              <>
                                <Plus size={13} strokeWidth={2.5} />
                                <span>Thêm</span>
                              </>
                            )}
                          </button>
                        </div>
                        <div className="mt-2 space-y-0.5">
                          <div className="flex items-baseline justify-between gap-1.5">
                            <h5 className="font-bold text-[13.5px] text-gray-950 truncate leading-tight group-hover:text-emerald-800 transition-colors">
                              {poi.name}
                            </h5>
                            {Number(poi.rating) > 0 && (
                              <span className="text-[11.5px] font-bold text-gray-800 flex items-center gap-0.5 shrink-0">
                                <i className="ph ph-fill ph-star text-[11px] text-amber-500" />
                                <span>{ratingVal}</span>
                              </span>
                            )}
                          </div>
                          <p className="text-[12px] text-gray-400 font-normal truncate">
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

      {dialog && <CollectionNameDialog initialName={dialog.mode === 'rename' ? dialog.collection.name : ''} title={dialog.mode === 'create' ? 'Tạo bộ sưu tập' : 'Đổi tên bộ sưu tập'} onCancel={() => setDialog(null)} onSave={(name) => void saveCollectionName(name)} saving={dialogSaving} error={dialogError} />}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 p-4">
          <section role="dialog" aria-modal="true" aria-labelledby="delete-collection-title" className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-5 shadow-card">
            <h2 id="delete-collection-title" className="text-lg font-semibold text-neutral-950">Xóa “{deleteConfirm.name}”?</h2>
            <p className="mt-2 text-sm leading-6 text-neutral-700">Các địa điểm trong bộ sưu tập sẽ được giữ trong “Địa điểm của tôi”.</p>
            {deleteError && <p className="mt-2 text-sm text-red-800" role="alert">{deleteError}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setDeleteConfirm(null)} disabled={dialogSaving} className="min-h-11 rounded-xl px-4 text-sm font-medium text-neutral-800 hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-800">Hủy</button>
              <button type="button" onClick={() => void confirmDeleteCollection()} disabled={dialogSaving} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-neutral-900 px-4 text-sm font-semibold text-white hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-800 focus-visible:ring-offset-2 disabled:opacity-50">{dialogSaving && <Loader2 size={16} className="animate-spin" aria-hidden="true" />} Xóa bộ sưu tập</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
