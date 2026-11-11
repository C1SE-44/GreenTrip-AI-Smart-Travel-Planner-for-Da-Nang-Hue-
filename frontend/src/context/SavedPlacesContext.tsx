/* eslint-disable react-refresh/only-export-components -- This module exports the shared provider and hook. */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Poi } from '@/data/pois';
import SaveToCollectionModal from '@/components/saved/SaveToCollectionModal';
import {
  getSavedCollections,
  getSavedPlaces,
  removeSavedPlace,
  savePlace,
  type SavedPlaceCollection,
  type SavedPlace,
} from '@/services/savedPlaces';

interface SavedPlacesContextValue {
  places: SavedPlace[];
  collections: SavedPlaceCollection[];
  savedIds: Set<string>;
  pendingIds: Set<string>;
  loading: boolean;
  error: string | null;
  feedback: { message: string; isError: boolean } | null;
  refresh: () => Promise<void>;
  refreshCollections: () => Promise<void>;
  toggleSaved: (poiId: string, poi?: Poi) => Promise<void>;
  ensureSaved: (poiId: string) => Promise<void>;
  openCollectionPicker: (poi: Poi) => void;
}

const SavedPlacesContext = createContext<SavedPlacesContextValue | null>(null);

function getAccessToken(): string | null {
  return localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
}

function errorStatus(error: unknown): number | undefined {
  return typeof error === 'object' && error !== null && 'status' in error
    ? Number((error as { status?: unknown }).status)
    : undefined;
}

export function SavedPlacesProvider({ children }: PropsWithChildren) {
  const navigate = useNavigate();
  const location = useLocation();
  const locationRef = useRef(location);
  const requestIdRef = useRef(0);
  const feedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusReturnRef = useRef<HTMLElement | null>(null);
  const [places, setPlaces] = useState<SavedPlace[]>([]);
  const [collections, setCollections] = useState<SavedPlaceCollection[]>([]);
  const [collectionPoi, setCollectionPoi] = useState<Poi | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(() => Boolean(getAccessToken()));
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; isError: boolean } | null>(null);

  useEffect(() => {
    locationRef.current = location;
  }, [location]);

  const goToLogin = useCallback(() => {
    const current = locationRef.current;
    const returnTo = `${current.pathname}${current.search}${current.hash}`;
    navigate('/login', { state: { returnTo }, replace: current.pathname === '/saved' });
  }, [navigate]);

  const showFeedback = useCallback((message: string, isError = false) => {
    if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
    setFeedback({ message, isError });
    feedbackTimeoutRef.current = setTimeout(() => setFeedback(null), isError ? 5000 : 2600);
  }, []);

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    if (!getAccessToken()) {
      setPlaces([]);
      setCollections([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [placesResponse, collectionsResponse] = await Promise.all([
        getSavedPlaces(),
        getSavedCollections(),
      ]);
      if (requestId !== requestIdRef.current) return;
      setPlaces(placesResponse.items ?? []);
      setCollections(collectionsResponse.items ?? []);
      setLoading(false);
    } catch (loadError) {
      if (requestId !== requestIdRef.current) return;
      setLoading(false);
      if (errorStatus(loadError) === 401) {
        setError('Phiên kết nối danh sách đã lưu chưa được xác thực. Tài khoản vẫn đang đăng nhập; vui lòng thử tải lại sau.');
        return;
      }
      setError('Chưa thể tải địa điểm đã lưu. Vui lòng thử lại.');
    }
  }, []);

  const refreshCollections = useCallback(async () => {
    if (!getAccessToken()) {
      setCollections([]);
      return;
    }
    try {
      const response = await getSavedCollections();
      setCollections(response.items ?? []);
    } catch (loadError) {
      if (errorStatus(loadError) === 401) {
        setError('Phiên kết nối danh sách đã lưu chưa được xác thực. Tài khoản vẫn đang đăng nhập; vui lòng thử tải lại sau.');
      }
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onAuthChange = () => void refresh();
    window.addEventListener('auth-change', onAuthChange);
    window.addEventListener('storage', onAuthChange);
    return () => {
      requestIdRef.current += 1;
      window.removeEventListener('auth-change', onAuthChange);
      window.removeEventListener('storage', onAuthChange);
      if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
    };
  }, [refresh]);

  const savedIds = useMemo(() => new Set(places.map((place) => String(place.id))), [places]);

  const toggleSaved = useCallback(async (poiId: string, poi?: Poi) => {
    void poi;
    const accountToken = getAccessToken();
    if (!accountToken) {
      goToLogin();
      return;
    }
    if (pendingIds.has(poiId)) return;

    const wasSaved = savedIds.has(poiId);
    setPendingIds((previous) => new Set(previous).add(poiId));
    setError(null);

    try {
      if (wasSaved) {
        await removeSavedPlace(poiId);
      } else {
        await savePlace(poiId);
      }
      if (getAccessToken() !== accountToken) return;
      await refresh();
      if (wasSaved) {
        showFeedback('Đã xóa địa điểm khỏi danh sách đã lưu.');
      } else {
        showFeedback('Đã lưu địa điểm vào danh sách yêu thích.');
      }
    } catch (mutationError) {
      if (getAccessToken() !== accountToken) return;
      if (errorStatus(mutationError) === 401) {
        showFeedback('Chưa thể xác thực yêu cầu lưu địa điểm. Tài khoản vẫn đang đăng nhập.', true);
      } else {
        showFeedback('Không thể cập nhật địa điểm đã lưu. Vui lòng thử lại.', true);
      }
    } finally {
      setPendingIds((previous) => {
        const next = new Set(previous);
        next.delete(poiId);
        return next;
      });
    }
  }, [goToLogin, pendingIds, refresh, savedIds, showFeedback]);

  const ensureSaved = useCallback(async (poiId: string) => {
    const accountToken = getAccessToken();
    if (!accountToken || savedIds.has(poiId) || pendingIds.has(poiId)) return;

    setPendingIds((previous) => new Set(previous).add(poiId));
    try {
      await savePlace(poiId);
      if (getAccessToken() !== accountToken) return;
      await refresh();
    } catch (saveError) {
      if (getAccessToken() !== accountToken) return;
      if (errorStatus(saveError) === 401) {
        showFeedback('Chưa thể xác thực yêu cầu đồng bộ địa điểm. Tài khoản vẫn đang đăng nhập.', true);
      }
      else showFeedback('Không thể đồng bộ địa điểm vào danh sách Đã lưu.', true);
    } finally {
      setPendingIds((previous) => {
        const next = new Set(previous);
        next.delete(poiId);
        return next;
      });
    }
  }, [pendingIds, refresh, savedIds, showFeedback]);

  const openCollectionPicker = useCallback((poi: Poi) => {
    if (!getAccessToken()) {
      goToLogin();
      return;
    }
    focusReturnRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    setCollectionPoi(poi);
  }, [goToLogin]);

  const closeCollectionPicker = useCallback(() => {
    setCollectionPoi(null);
    window.requestAnimationFrame(() => focusReturnRef.current?.focus());
  }, []);

  const contextValue = useMemo<SavedPlacesContextValue>(() => ({
    places,
    collections,
    savedIds,
    pendingIds,
    loading,
    error,
    feedback,
    refresh,
    refreshCollections,
    toggleSaved,
    ensureSaved,
    openCollectionPicker,
  }), [places, collections, savedIds, pendingIds, loading, error, feedback, refresh, refreshCollections, toggleSaved, ensureSaved, openCollectionPicker]);

  return (
    <SavedPlacesContext.Provider value={contextValue}>
      {children}
      {feedback && (
        <div
          className={`fixed bottom-5 left-1/2 z-[100] max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-xl px-4 py-3 text-sm font-medium shadow-card ${
            feedback.isError ? 'bg-red-50 text-red-800 ring-1 ring-red-200' : 'bg-emerald-900 text-white'
          }`}
          role={feedback.isError ? 'alert' : 'status'}
          aria-live={feedback.isError ? 'assertive' : 'polite'}
        >
          {feedback.message}
        </div>
      )}
      {collectionPoi && (
        <SaveToCollectionModal
          poi={collectionPoi}
          onClose={closeCollectionPicker}
          onChanged={refresh}
        />
      )}
    </SavedPlacesContext.Provider>
  );
}

export function useSavedPlaces(): SavedPlacesContextValue {
  const context = useContext(SavedPlacesContext);
  if (!context) {
    throw new Error('useSavedPlaces must be used within SavedPlacesProvider');
  }
  return context;
}
