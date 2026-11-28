import { useEffect, useMemo, useState } from 'react';
import { previewInTripAdjustment, type AssistantDraft, type AssistantItineraryAlternative, type InTripAdjustmentAction } from '@/services/travelAssistant';
import type { TripItinerary, ItineraryStop } from '@/services/itineraryService';
import { actualStatusForStop, type ActualStopStatus, type TripActualProgress } from '@/utils/inTripProgress';
import { evaluateTripFeasibility } from '@/utils/tripFeasibility';
import type { Poi } from '@/data/pois';
import type { UserTrip } from '@/pages/ExplorePage';
import { AlertTriangle, Check, Clock3, Leaf, LoaderCircle, MoveRight, RotateCcw, Sparkles, X } from 'lucide-react';
import CommunityGreenReviewForm from './CommunityGreenReviewForm';

const STATUS_LABEL: Record<ActualStopStatus, string> = {
  PLANNED: 'Theo kế hoạch',
  IN_PROGRESS: 'Đang tham quan',
  VISITED: 'Đã tham quan',
  POSTPONED: 'Đã dời lịch',
  SKIPPED: 'Đã bỏ qua hôm nay',
  UNSCHEDULED: 'Chưa xếp lịch',
};

interface Props {
  tripId: string;
  trip: UserTrip;
  cataloguePois: Poi[];
  itinerary: TripItinerary;
  progress: TripActualProgress;
  disabled?: boolean;
  onSetStatus: (stop: ItineraryStop, status: ActualStopStatus, actualTimes?: {actualStartAt?: string; actualEndAt?: string}) => Promise<void>;
  onApply: (draftId: string, alternativeId?: string) => Promise<void>;
  onReconcile: () => Promise<void>;
}

const COMMUNITY_COPY = {
  prompt: 'B\u1ea1n \u0111\u00e3 x\u00e1c nh\u1eadn \u0111\u00e3 gh\u00e9. B\u1ea1n c\u00f3 mu\u1ed1n chia s\u1ebb \u0111\u00e1nh gi\u00e1 m\u00f4i tr\u01b0\u1eddng kh\u00f4ng?',
  review: '\u0110\u00e1nh gi\u00e1 m\u00f4i tr\u01b0\u1eddng',
  later: '\u0110\u1ec3 sau',
  retry: '\u0110\u1ed1i so\u00e1t tr\u1ea1ng th\u00e1i l\u01b0u',
  retryHelp: 'Kh\u00f4ng th\u1ec3 x\u00e1c nh\u1eadn k\u1ebft qu\u1ea3 \u00e1p d\u1ee5ng. H\u00e3y \u0111\u1ed1i so\u00e1t hai b\u1ea3n l\u01b0u tr\u01b0\u1edbc khi th\u1eed l\u1ea1i.',
};

function locations(itinerary?: TripItinerary | null) {
  const result = new Map<string, {day: number; stop: ItineraryStop}>();
  for (const day of itinerary?.days || []) for (const stop of day.stops || []) if (stop.stop_id) result.set(stop.stop_id, {day: day.day_number, stop});
  return result;
}

export default function InTripAssistancePanel({tripId, trip, cataloguePois, itinerary, progress, disabled = false, onSetStatus, onApply, onReconcile}: Props) {
  const [selectedDay, setSelectedDay] = useState(itinerary.days[0]?.day_number || 1);
  const [statusBusy, setStatusBusy] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [applyBusy, setApplyBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [draft, setDraft] = useState<AssistantDraft | null>(null);
  const [selectedAlternativeId, setSelectedAlternativeId] = useState('');
  const [extraMinutes, setExtraMinutes] = useState(30);
  const [actualTimeInputs, setActualTimeInputs] = useState<Record<string, {start?: string; end?: string}>>({});
  const [reviewStopId, setReviewStopId] = useState<string | null>(null);
  const [reviewPromptStopId, setReviewPromptStopId] = useState<string | null>(null);
  const [reconcileAvailable, setReconcileAvailable] = useState(false);
  const [reconcileBusy, setReconcileBusy] = useState(false);

  useEffect(() => {
    if (!itinerary.days.some((day) => day.day_number === selectedDay)) setSelectedDay(itinerary.days[0]?.day_number || 1);
  }, [itinerary.days, selectedDay]);

  const day = itinerary.days.find((item) => item.day_number === selectedDay);
  const stops = useMemo(() => (day?.stops || []).filter((stop) => stop.poi_id && stop.stop_type !== 'rest'), [day]);
  const statusOf = (stop: ItineraryStop) => actualStatusForStop(progress, stop.stop_id)?.status || 'PLANNED';
  const nextStop = stops.find((stop) => !['VISITED', 'SKIPPED'].includes(statusOf(stop)));
  const canEndDayEarly = stops.some((stop) => stop.source === 'assistant' && !['VISITED', 'IN_PROGRESS', 'SKIPPED'].includes(statusOf(stop)));
  const unscheduled = progress.stops.filter((item) => item.status === 'UNSCHEDULED');
  const alternatives = draft?.alternatives || [];
  const chosenAlternative: AssistantItineraryAlternative | undefined = alternatives.find((item) => item.id === selectedAlternativeId) || alternatives[0];
  const oldLocations = locations(itinerary);
  const newLocations = locations(chosenAlternative?.itinerary || draft?.itinerary);
  const moved = [...oldLocations.entries()].flatMap(([stopId, old]) => {
    const next = newLocations.get(stopId);
    return next && next.day !== old.day ? [{stopId, name: old.stop.title, from: old.day, to: next.day}] : [];
  });
  const feasibility = useMemo(() => {
    if (!chosenAlternative) return null;
    const confirmedStops = chosenAlternative.itinerary.days.flatMap((item) => item.stops.map((stop) => ({...stop, day_number: item.day_number})));
    return evaluateTripFeasibility(
      trip,
      chosenAlternative.selected_poi_ids,
      cataloguePois.map((poi) => ({
        id: String(poi.id), city: poi.city, category: poi.category,
        lat: poi.lat, lng: poi.lng, average_visit_minutes: poi.average_visit_minutes,
        estimatedCost: poi.estimatedCost, priceUnit: poi.priceUnit,
        opening_hours: poi.opening_hours as Record<string, unknown> | null,
      })),
      confirmedStops,
    );
  }, [chosenAlternative, trip, cataloguePois]);

  const setStatus = async (stop: ItineraryStop, status: ActualStopStatus) => {
    setStatusBusy(stop.stop_id);
    setError('');
    setSuccess('');
    try {
      const input = actualTimeInputs[stop.stop_id] || {};
      const toTripTimestamp = (value?: string) => value ? `${value}:00+07:00` : undefined;
      await onSetStatus(stop, status, {
        ...(toTripTimestamp(input.start) ? {actualStartAt: toTripTimestamp(input.start)} : {}),
        ...(toTripTimestamp(input.end) ? {actualEndAt: toTripTimestamp(input.end)} : {}),
      });
      if (status === 'VISITED' && statusOf(stop) !== 'VISITED') setReviewPromptStopId(stop.stop_id);
      setSuccess(`Đã lưu trạng thái “${STATUS_LABEL[status]}”. Lịch đã xác nhận không thay đổi.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Chưa lưu được tiến độ. Hãy thử lại.');
    } finally {
      setStatusBusy(null);
    }
  };

  const startPreview = async (action: InTripAdjustmentAction, stop?: ItineraryStop) => {
    setPreviewBusy(true);
    setError('');
    setSuccess('');
    try {
      const response = await previewInTripAdjustment({
        tripId,
        action,
        dayNumber: selectedDay,
        ...(stop ? {stopId: stop.stop_id} : {}),
        ...(action === 'stay_longer' ? {extraMinutes} : {}),
      });
      setDraft(response.draft);
      const first = response.draft.alternatives?.[0]?.id || '';
      setSelectedAlternativeId(first);
      if (!first && response.draft.primary_alternative_id) setSelectedAlternativeId(response.draft.primary_alternative_id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Chưa tạo được bản xem trước. Lịch hiện tại vẫn được giữ.');
    } finally {
      setPreviewBusy(false);
    }
  };

  const applyDraft = async () => {
    if (!draft) return;
    setApplyBusy(true);
    setError('');
    try {
      await onApply(draft.id, selectedAlternativeId || chosenAlternative?.id);
      setDraft(null);
      setReconcileAvailable(false);
      setSuccess('Đã áp dụng phương án bạn chọn.');
    } catch (cause) {
      setReconcileAvailable(true);
      setError(cause instanceof Error ? cause.message : 'Chưa áp dụng được phương án. Lịch hiện tại vẫn được giữ.');
    } finally {
      setApplyBusy(false);
    }
  };

  const reconcileApply = async () => {
    setReconcileBusy(true);
    setError('');
    try {
      await onReconcile();
      setReconcileAvailable(false);
      setDraft(null);
      setSuccess('Đã đối soát và tải lại trạng thái chuyến đi.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Chưa đối soát được trạng thái.');
    } finally {
      setReconcileBusy(false);
    }
  };

  return (
    <section className="mb-5 rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5" aria-labelledby="journey-today-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="journey-today-title" className="flex items-center gap-2 text-base font-semibold text-neutral-900">
            <MoveRight size={17} aria-hidden="true" /> Hành trình hôm nay
          </h3>
          <p className="mt-1 text-sm text-neutral-700">Trạng thái chỉ được lưu khi bạn chủ động chọn. Giờ dự kiến không tự đánh dấu đã ghé.</p>
        </div>
        <label className="flex min-h-10 items-center gap-2 text-sm text-neutral-800">
          <span>Ngày xem</span>
          <select className="min-h-10 rounded-xl border border-neutral-300 bg-white px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black" value={selectedDay} onChange={(event) => setSelectedDay(Number(event.target.value))}>
            {itinerary.days.map((item) => <option key={item.day_number} value={item.day_number}>Ngày {item.day_number}</option>)}
          </select>
        </label>
      </div>

      {nextStop ? (
        <div className="mt-4 rounded-xl bg-neutral-50 p-3 sm:flex sm:items-center sm:justify-between sm:gap-4">
          <div>
            <p className="text-sm font-semibold text-neutral-900">{statusOf(nextStop) === 'IN_PROGRESS' ? 'Đang tham quan' : 'Tiếp theo theo lịch'}: {nextStop.title}</p>
            <p className="mt-1 text-sm text-neutral-700">{nextStop.start_time || 'Chưa có giờ'} – {nextStop.end_time || 'Chưa có giờ'} · {STATUS_LABEL[statusOf(nextStop)]}</p>
          </div>
          <button type="button" disabled={disabled || statusBusy === nextStop.stop_id || statusOf(nextStop) === 'IN_PROGRESS'} onClick={() => void setStatus(nextStop, 'IN_PROGRESS')} className="mt-3 min-h-10 rounded-full bg-neutral-900 px-4 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 disabled:opacity-50 sm:mt-0">
            {statusBusy === nextStop.stop_id ? <LoaderCircle size={16} className="animate-spin" aria-label="Đang lưu" /> : 'Bắt đầu tham quan'}
          </button>
        </div>
      ) : <p className="mt-4 rounded-xl bg-neutral-50 p-3 text-sm text-neutral-700">Ngày này không còn điểm chưa hoàn tất.</p>}

      {stops.length > 0 && (
        <ul className="mt-3 divide-y divide-neutral-100">
          {stops.map((stop) => {
            const status = statusOf(stop);
            const saving = statusBusy === stop.stop_id;
            const poi = cataloguePois.find((item) => String(item.id) === String(stop.poi_id));
            return (
              <li key={stop.stop_id} className="py-3 first:pt-1 last:pb-1">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-[180px] flex-1">
                    <p className="text-sm font-semibold text-neutral-900">{stop.title}</p>
                    <p className="mt-1 text-sm text-neutral-700">{stop.start_time || 'Chưa có giờ'} – {stop.end_time || 'Chưa có giờ'} · {STATUS_LABEL[status]}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {status !== 'IN_PROGRESS' && status !== 'VISITED' && (
                      <button type="button" disabled={disabled || saving} onClick={() => void setStatus(stop, 'IN_PROGRESS')} className="min-h-10 rounded-full border border-neutral-300 px-3 text-sm font-medium text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 disabled:opacity-50">Bắt đầu</button>
                    )}
                    {status !== 'VISITED' && (
                      <button type="button" disabled={disabled || saving} onClick={() => void setStatus(stop, 'VISITED')} className="inline-flex min-h-10 items-center gap-1 rounded-full border border-neutral-300 px-3 text-sm font-medium text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 disabled:opacity-50"><Check size={15} aria-hidden="true" /> Đã tham quan</button>
                    )}
                    {status !== 'SKIPPED' && status !== 'VISITED' && (
                      <button type="button" disabled={disabled || saving} onClick={() => void setStatus(stop, 'SKIPPED')} className="min-h-10 rounded-full border border-neutral-300 px-3 text-sm font-medium text-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 disabled:opacity-50">Bỏ qua hôm nay</button>
                    )}
                    {status === 'SKIPPED' && (
                      <button type="button" disabled={disabled || saving} onClick={() => void setStatus(stop, 'PLANNED')} className="inline-flex min-h-10 items-center gap-1 rounded-full border border-neutral-300 px-3 text-sm font-medium text-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 disabled:opacity-50"><RotateCcw size={14} aria-hidden="true" /> Khôi phục</button>
                    )}
                    {status !== 'VISITED' && status !== 'IN_PROGRESS' && status !== 'SKIPPED' && stop.source === 'assistant' && (
                      <button type="button" disabled={disabled || previewBusy} onClick={() => void startPreview('postpone', stop)} className="min-h-10 rounded-full border border-neutral-300 px-3 text-sm font-medium text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 disabled:opacity-50">Dời sang ngày khác</button>
                    )}
                  </div>
                </div>
                <details className="mt-2 text-sm text-neutral-700">
                  <summary className="min-h-10 w-fit cursor-pointer py-2 font-medium text-neutral-800">Thêm giờ thực tế (tùy chọn)</summary>
                  <div className="flex flex-wrap gap-3 pb-2">
                    <label className="grid gap-1">Bắt đầu thực tế
                      <input type="datetime-local" value={actualTimeInputs[stop.stop_id]?.start ?? actualStatusForStop(progress, stop.stop_id)?.actualStartAt?.slice(0, 16) ?? ''} onChange={(event) => setActualTimeInputs((current) => ({...current, [stop.stop_id]: {...current[stop.stop_id], start: event.target.value}}))} className="min-h-10 rounded-lg border border-neutral-300 bg-white px-2 text-sm text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black" />
                    </label>
                    <label className="grid gap-1">Kết thúc thực tế
                      <input type="datetime-local" value={actualTimeInputs[stop.stop_id]?.end ?? actualStatusForStop(progress, stop.stop_id)?.actualEndAt?.slice(0, 16) ?? ''} onChange={(event) => setActualTimeInputs((current) => ({...current, [stop.stop_id]: {...current[stop.stop_id], end: event.target.value}}))} className="min-h-10 rounded-lg border border-neutral-300 bg-white px-2 text-sm text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black" />
                    </label>
                    <p className="self-end pb-2 text-sm text-neutral-700">Giờ được lưu riêng theo múi giờ Việt Nam, không ghi đè giờ dự kiến.</p>
                  </div>
                </details>
                {status === 'VISITED' && poi && (
                  <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
                    {reviewPromptStopId === stop.stop_id && (
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2" role="status">
                        <p className="text-sm text-neutral-800">{COMMUNITY_COPY.prompt}</p>
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={() => { setReviewPromptStopId(null); setReviewStopId(stop.stop_id); }} className="min-h-10 rounded-full bg-neutral-900 px-4 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2">{COMMUNITY_COPY.review}</button>
                          <button type="button" onClick={() => setReviewPromptStopId(null)} className="min-h-10 rounded-full border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black">{COMMUNITY_COPY.later}</button>
                        </div>
                      </div>
                    )}
                    {reviewPromptStopId !== stop.stop_id && reviewStopId !== stop.stop_id && (
                      <button type="button" onClick={() => setReviewStopId(stop.stop_id)} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-emerald-300 bg-white px-4 text-sm font-semibold text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black">
                        <Leaf size={15} aria-hidden="true" /> {COMMUNITY_COPY.review}
                      </button>
                    )}
                    {reviewStopId === stop.stop_id && <CommunityGreenReviewForm
                      poiId={String(poi.id)}
                      poiName={poi.name}
                      category={poi.category}
                      subCategory={poi.sub_category}
                      tripId={tripId}
                      stopId={stop.stop_id}
                      onClose={() => setReviewStopId(null)}
                      onSaved={() => setSuccess('Đã lưu đánh giá môi trường của bạn.')}
                    />}
                  </div>
                )}
                {status === 'IN_PROGRESS' && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button type="button" disabled={disabled || previewBusy} onClick={() => void startPreview('stay_longer', stop)} className="inline-flex min-h-10 items-center gap-1 rounded-full border border-neutral-300 px-3 text-sm font-medium text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 disabled:opacity-50"><Clock3 size={15} aria-hidden="true" /> Ở lại lâu hơn</button>
                    <label className="flex min-h-10 items-center gap-2 text-sm text-neutral-800">Thêm
                      <select className="min-h-10 rounded-lg border border-neutral-300 bg-white px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black" value={extraMinutes} onChange={(event) => setExtraMinutes(Number(event.target.value))}>
                        <option value={15}>15 phút</option><option value={30}>30 phút</option><option value={60}>1 giờ</option><option value={90}>1 giờ 30</option>
                      </select>
                    </label>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-4">
        <button type="button" disabled={disabled || previewBusy || !canEndDayEarly} onClick={() => void startPreview('end_day_early')} className="inline-flex min-h-10 items-center gap-2 rounded-full bg-neutral-900 px-4 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 disabled:opacity-50">
          {previewBusy ? <LoaderCircle size={16} className="animate-spin" aria-label="Đang tính" /> : <Sparkles size={15} aria-hidden="true" />} Kết thúc ngày sớm và xem phương án
        </button>
        {!canEndDayEarly && stops.some((stop) => stop.source !== 'assistant' && !['VISITED', 'SKIPPED'].includes(statusOf(stop))) && <p className="text-sm text-neutral-700">Điểm thêm từ Ý tưởng hoặc thủ công được giữ nguyên theo lịch đã xác nhận.</p>}
      </div>
      {unscheduled.length > 0 && <div className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-950">
        <p className="font-semibold">Địa điểm chưa xếp lịch ({unscheduled.length}) · vẫn được giữ trong Ý tưởng</p>
        <ul className="mt-1 list-inside list-disc">{unscheduled.map((item) => <li key={item.stopId}>{item.name || item.poiId} {item.reasonCodes?.length ? `· ${item.reasonCodes.join(', ')}` : ''}</li>)}</ul>
      </div>}

      {success && <p className="mt-3 text-sm text-emerald-800" role="status">{success}</p>}
      {previewBusy && <p className="mt-3 text-sm text-neutral-700" role="status">Đang đánh giá giờ mở cửa và thời gian còn lại; lịch hiện tại vẫn được giữ.</p>}
      {error && <p className="mt-3 flex items-start gap-2 text-sm text-red-800" role="alert"><AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />{error}</p>}

      {reconcileAvailable && <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3">
        <p className="text-sm text-amber-950">{COMMUNITY_COPY.retryHelp}</p>
        <button type="button" disabled={reconcileBusy} onClick={() => void reconcileApply()} className="mt-2 inline-flex min-h-10 items-center gap-2 rounded-full border border-amber-700 bg-white px-4 text-sm font-semibold text-amber-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black disabled:opacity-60">
          {reconcileBusy && <LoaderCircle size={15} className="animate-spin" aria-hidden="true" />}{COMMUNITY_COPY.retry}
        </button>
      </div>}

      {draft && (
        <div className="mt-4 rounded-2xl border border-neutral-300 bg-neutral-50 p-4" role="region" aria-label="Xem trước thay đổi lịch trình">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h4 className="text-base font-semibold text-neutral-900">Xem trước điều chỉnh</h4>
              <p className="mt-1 text-sm text-neutral-700">Lịch chính chưa thay đổi. Chọn phương án rồi xác nhận để áp dụng.</p>
            </div>
            <button type="button" onClick={() => setDraft(null)} className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-full border border-neutral-300 text-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black" aria-label="Giữ lịch hiện tại"><X size={17} /></button>
          </div>
          {alternatives.length > 1 && <div className="mt-3 flex flex-wrap gap-2">{alternatives.slice(0, 2).map((alternative) => <button key={alternative.id} type="button" aria-pressed={selectedAlternativeId === alternative.id} onClick={() => setSelectedAlternativeId(alternative.id)} className={`min-h-10 rounded-full border px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 ${selectedAlternativeId === alternative.id ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 bg-white text-neutral-900'}`}>{alternative.title}</button>)}</div>}
          <div className="mt-3 space-y-2 text-sm text-neutral-800">
            {moved.length ? <p>Điểm được dời: {moved.map((item) => `${item.name} (Ngày ${item.from} → ${item.to})`).join(' · ')}</p> : <p>Không có điểm nào đổi ngày trong phương án này.</p>}
            {(chosenAlternative?.unscheduled_pois || []).map((item) => <p key={item.poi_id} className="text-amber-900">Chưa xếp được: {item.name} · {item.reasons.join(', ')}</p>)}
            {feasibility && <div className="rounded-xl border border-neutral-200 bg-white p-3">
              <p className="font-semibold">Kiểm tra tính khả thi: {feasibility.status}</p>
              {feasibility.warnings.slice(0, 4).map((warning) => <p key={warning.code} className="mt-1 text-neutral-700">{warning.reason}</p>)}
              {feasibility.status === 'INSUFFICIENT_DATA' && <p className="mt-1 text-neutral-700">Một số trường dữ liệu chưa đủ để xác nhận tính khả thi.</p>}
            </div>}
            {(chosenAlternative?.warnings || draft.warnings).slice(0, 6).map((warning, index) => <p key={`${index}-${warning}`} className="text-neutral-700">{warning}</p>)}
            <p className="text-neutral-700">Khách sạn và lựa chọn phương tiện được giữ nguyên; các lựa chọn có thể cần xem lại sau khi lịch đổi.</p>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" disabled={applyBusy || !chosenAlternative} onClick={() => void applyDraft()} className="inline-flex min-h-10 items-center gap-2 rounded-full bg-neutral-900 px-4 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 disabled:opacity-50">
              {applyBusy ? <LoaderCircle size={16} className="animate-spin" aria-label="Đang áp dụng" /> : <Check size={15} aria-hidden="true" />} Áp dụng thay đổi
            </button>
            <button type="button" disabled={applyBusy} onClick={() => setDraft(null)} className="min-h-10 rounded-full border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 disabled:opacity-50">Giữ lịch hiện tại</button>
          </div>
        </div>
      )}
    </section>
  );
}
