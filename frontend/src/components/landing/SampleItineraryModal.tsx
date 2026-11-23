import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { StudioSampleSheet } from './StudioSampleSheet';
import { loadLandingCatalogue } from '@/services/landingCatalogue';
import { getAccessToken, getMe, ApiError } from '@/services/auth';
import { saveLandingSample } from '@/services/saveLandingSample';
import type { DestinationScope, DurationDays, ItineraryDayPlan, PlaceCatalogItem } from '@/data/landingSampleModel';
import './sample-sheet.css';
const LoginModal = lazy(() => import('@/components/auth/LoginModal'));
type City = 'danang' | 'hue' | 'danang_hue';
export interface SampleItineraryModalProps {
  isOpen: boolean; city: City; days: number; onClose: () => void;
  onCityChange: (city: City) => void; onDaysChange: (days: number) => void;
}
type Draft = { plan: ItineraryDayPlan[]; places: PlaceCatalogItem[]; destination: DestinationScope; days: DurationDays };
export function SampleItineraryModal({isOpen, city, days, onClose, onCityChange, onDaysChange}: SampleItineraryModalProps) {
  const navigate = useNavigate();
  const [catalogue, setCatalogue] = useState<PlaceCatalogItem[] | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [authOpen, setAuthOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const pendingDraft = useRef<Draft | null>(null);
  const attempt = useRef<{owner: string; id: string} | null>(null);
  const busy = useRef(false);
  const surface = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if(!isOpen) return;
    let active = true;
    setError('');
    void loadLandingCatalogue().then(items => { if(active) setCatalogue(items); }).catch(() => {
      if(active) setError('Chưa tải được địa điểm GreenTrip. Bạn có thể thử lại.');
    });
    return () => {active = false;};
  }, [isOpen, retry]);
  useEffect(() => {
    if (!isOpen) return;
    const before = document.body.style.overflow;
    const root = document.getElementById('root'); const wasInert = root?.inert;
    if(root) root.inert = true;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = before; if(root) root.inert = wasInert ?? false; };
  }, [isOpen, authOpen]);
  // Keep focus inside the top preview layer. LoginModal owns focus while it is open.
  useEffect(() => {
    if (!isOpen || authOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const layer = () => surface.current?.querySelector<HTMLElement>('[data-place-detail-overlay]') || surface.current?.querySelector<HTMLElement>('[data-place-picker-overlay]') || surface.current;
    const controls = () => Array.from(layer()?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not([readonly]),select,a[href],[tabindex="0"]') || []).filter(el => el.getClientRects().length);
    const timer = window.setTimeout(() => controls()[0]?.focus(), 0);
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const items = controls(); const first = items[0], last = items[items.length-1];
      if (!first) return;
      if (event.shiftKey && (document.activeElement === first || !layer()?.contains(document.activeElement))) {event.preventDefault(); last.focus();}
      else if (!event.shiftKey && (document.activeElement === last || !layer()?.contains(document.activeElement))) {event.preventDefault(); first.focus();}
    };
    document.addEventListener('keydown', trap);
    return () => {window.clearTimeout(timer); document.removeEventListener('keydown', trap); previous?.focus();};
  }, [isOpen, authOpen, catalogue]);
  useEffect(() => {
    if (surface.current) surface.current.inert = authOpen;
  }, [authOpen]);
  const prepare = async (draft: Draft) => {
    if (busy.current) return;
    pendingDraft.current = draft; setSaveError('');
    if (!getAccessToken()) { setAuthOpen(true); return; }
    busy.current = true; setSaving(true);
    try {
      const token = getAccessToken(); const profile = await getMe();
      if (token !== getAccessToken()) throw new Error('Tài khoản đã thay đổi. Hãy thử lại.');
      if (!attempt.current || attempt.current.owner !== profile.user_id) attempt.current = {owner:profile.user_id,id:crypto.randomUUID()};
      const saved = await saveLandingSample(draft, attempt.current.id, token!);
      setAuthOpen(false); onClose(); navigate(`/planner?trip=${encodeURIComponent(saved.id)}&tab=itinerary&setup=1`);
    } catch(reason) {
      if(reason instanceof ApiError && reason.status === 401) setAuthOpen(true);
      else setSaveError(`Chưa mở được chuyến đi. ${reason instanceof Error ? reason.message : ''} Bản chỉnh vẫn được giữ; thử lại bằng nút lưu.`);
    } finally {busy.current=false; setSaving(false);}
  };
  const afterLogin = () => {setAuthOpen(false); if(pendingDraft.current) void prepare(pendingDraft.current);};
  return createPortal(<>
    <div className="sample-portal" ref={surface} hidden={!isOpen} aria-hidden={authOpen || undefined}>
      {catalogue?.length ? <StudioSampleSheet catalogue={catalogue} active={isOpen && !authOpen} saving={saving} saveError={saveError}
        initialDestination={city === 'danang_hue' ? 'danang-hue' : city} initialDays={Math.max(1,Math.min(4,days)) as DurationDays}
        onSelectionChange={(destination, duration) => {onCityChange(destination === 'danang-hue' ? 'danang_hue' : destination); onDaysChange(duration);}}
        onClose={() => {if(!busy.current) onClose();}} onSave={(plan,places,destination,duration) => void prepare({plan,places,destination,days:duration})} /> :
        isOpen && <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-label="Lịch tham khảo"><div className="sample-load">
          <button className="sample-close" onClick={onClose} aria-label="Đóng lịch mẫu">×</button>
          <h2>Lịch tham khảo</h2>
          {error ? <><p role="alert">{error}</p><button onClick={() => setRetry(n => n+1)}>Thử lại</button></> : catalogue ? <><p>Chưa có địa điểm cho lịch mẫu.</p><button onClick={() => {setCatalogue(null); setRetry(n => n+1);}}>Tải lại</button></> : <p role="status">Đang lấy địa điểm GreenTrip…</p>}
        </div></div>}

    </div>
    {authOpen && <Suspense fallback={<div role="status" className="sample-auth-loading">Đang mở đăng nhập…</div>}><LoginModal isOpen onClose={() => setAuthOpen(false)} onLoginSuccess={afterLogin} onRegisterSuccess={afterLogin} /></Suspense>}
  </>, document.body);
}
