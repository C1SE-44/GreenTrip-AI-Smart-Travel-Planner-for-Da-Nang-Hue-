import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Car, Check, Info, RefreshCw, Train, X } from 'lucide-react';
import { saveTripWorkspace } from '@/services/tripWorkspace';
import {
  buildConfirmedTransportPlan,
  buildTransportPreviewRequest,
  canSelectTransportOption,
  currentTransportSelections,
  previewTransport,
  type TransportLeg,
  type TransportMode,
  type TransportPreviewResponse,
  type TransportRouteOption,
} from '@/services/transport';
import type { TripItinerary } from '@/services/itineraryService';
import type { UserTrip } from '@/pages/ExplorePage';

interface Props {
  trip: UserTrip;
  itinerary: TripItinerary;
  disabled?: boolean;
  onTripUpdate?: (updatedTrip: UserTrip) => void;
}

const modeLabel = (mode: TransportMode) =>
  mode === 'PRIVATE_CAR' ? 'Ô tô liên tỉnh' : mode === 'TRAIN' ? 'Tàu hỏa' : 'Ô tô';

function formatDistance(meters: number | null): string {
  if (meters === null || !Number.isFinite(meters)) return 'Chưa có quãng đường';
  return meters < 1000 ? String(Math.round(meters)) + ' m' : (meters / 1000).toFixed(1) + ' km';
}

function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return 'Chưa có thời lượng';
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? String(minutes) + ' phút' : String(Math.floor(minutes / 60)) + ' giờ ' + String(minutes % 60) + ' phút';
}

function mileSourceLabel(status: TransportRouteOption['first_mile_route_status']): string {
  if (status === 'ROUTED') return 'OSRM driving';
  if (status === 'HEURISTIC') return 'ước tính tọa độ';
  return 'chưa định tuyến';
}

function qualityLabel(option: TransportRouteOption): string {
  if (option.mode === 'TRAIN' && option.train_departure_at) return 'Thời gian theo lịch tàu';
  if (option.route_status === 'ROUTED') return 'Tuyến OSRM driving · chưa xét giao thông thời gian thực';
  if (option.route_status === 'HEURISTIC') return 'Ước tính tọa độ · không phải ETA tuyến đường';
  return option.availability === 'USER_PROVIDED' ? 'Lịch do người dùng cung cấp' : 'Chưa có dữ liệu tuyến';
}

function RouteOptionCard({
  leg,
  option,
  selected,
  onSelect,
}: {
  leg: TransportLeg;
  option: TransportRouteOption;
  selected: boolean;
  onSelect: () => void;
}) {
  const selectable = canSelectTransportOption(option);
  const Icon = option.mode === 'TRAIN' ? Train : Car;
  const fare = option.estimated_fare !== null
    && (option.fare_status === 'ESTIMATED' || option.fare_status === 'PARTIAL' || option.fare_status === 'USER_PROVIDED')
    ? new Intl.NumberFormat('vi-VN').format(option.estimated_fare)
      + ' ' + (option.fare_currency || '')
      + (option.fare_status === 'USER_PROVIDED' ? ' · người dùng cung cấp' : option.fare_status === 'PARTIAL' ? ' · ước tính một phần' : '')
    : 'Chưa có dữ liệu giá đủ tin cậy';
  const carbon = option.estimated_co2e_kg !== null && option.emissions_status !== 'UNAVAILABLE'
    ? String(option.estimated_co2e_kg) + ' ' + (option.emissions_unit || 'kg CO₂e')
    : 'Chưa có hệ số CO₂e áp dụng';

  return (
    <div className={['rounded-xl border p-3', selected ? 'border-emerald-700 bg-emerald-50/50' : 'border-neutral-200 bg-white'].join(' ')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-semibold text-neutral-900">
            <Icon size={17} aria-hidden="true" />
            <span>{modeLabel(option.mode)}</span>
            {selected && <span className="text-sm text-emerald-800">Đã chọn</span>}
          </div>
          <p className="mt-1 text-sm text-neutral-700">{qualityLabel(option)}</p>
        </div>
        <button
          type="button"
          disabled={!selectable}
          aria-pressed={selected}
          onClick={onSelect}
          className="min-h-11 rounded-lg border border-neutral-300 px-4 text-sm font-semibold text-neutral-900 hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-500"
        >
          {selectable ? (selected ? 'Đang chọn' : 'Chọn phương tiện') : 'Chưa khả dụng'}
        </button>
      </div>
      {option.mode === 'TRAIN' && option.train_departure_at && option.train_arrival_at && (
        <p className="mt-2 text-sm text-neutral-800">{option.train_service_name || 'Chuyến tàu'} · {option.train_departure_at} → {option.train_arrival_at} · vé chưa xác nhận</p>
      )}
      <div className="mt-3 grid gap-2 text-sm text-neutral-800 sm:grid-cols-2">
        <p>Quãng đường: {formatDistance(option.distance_meters)}</p>
        <p>{option.mode === 'TRAIN' ? 'Door-to-door: ' : 'Thời gian: '}{formatDuration(option.duration_seconds)}</p>
        {option.mode === 'TRAIN' && <>
          <p>First-mile ({mileSourceLabel(option.first_mile_route_status)}): {formatDistance(option.first_mile_distance_meters)} · {formatDuration(option.first_mile_duration_seconds)}</p>
          <p>Last-mile ({mileSourceLabel(option.last_mile_route_status)}): {formatDistance(option.last_mile_distance_meters)} · {formatDuration(option.last_mile_duration_seconds)}</p>
        </>}
        <p>Giá: {fare}</p>
        <p>CO₂e: {carbon}</p>
        <p>Nguồn tuyến: {option.provider}</p>
        <p>Nguồn dữ liệu: {option.data_source}</p>
      </div>
      {option.warnings.length > 0 && (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">
          {option.warnings.map((warning, index) => <li key={leg.leg_id + '-option-' + index}>{warning}</li>)}
        </ul>
      )}
    </div>
  );
}

function sameSelections(left: Record<string, TransportMode>, right: Record<string, TransportMode>) {
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
  return keys.every((key) => left[key] === right[key]);
}

export default function TransportOptionsPanel({ trip, itinerary, disabled = false, onTripUpdate }: Props) {
  const requestKey = useMemo(
    () => JSON.stringify(buildTransportPreviewRequest(trip, itinerary)),
    [trip, itinerary],
  );
  const [response, setResponse] = useState<TransportPreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [draft, setDraft] = useState<Record<string, TransportMode>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveMessage, setSaveMessage] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setResponse(null);
    setSaveError('');
    void previewTransport(JSON.parse(requestKey), controller.signal)
      .then((result) => { if (!controller.signal.aborted) setResponse(result); })
      .catch((cause: Error) => {
        if (!controller.signal.aborted && cause.name !== 'AbortError') {
          setError('Chưa tải được lựa chọn di chuyển. Lịch trình và POI đã lưu vẫn được giữ nguyên.');
        }
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [requestKey, retry]);

  const confirmed = useMemo(
    () => currentTransportSelections(trip.transportPlan, 'confirmed', response?.itinerary_fingerprint || ''),
    [trip.transportPlan, response?.itinerary_fingerprint],
  );
  useEffect(() => {
    if (response) setDraft(confirmed);
  }, [response?.itinerary_fingerprint, confirmed, response]);

  const staleSelection = Boolean(response && trip.transportPlan?.confirmedAlternatives.some((item) =>
    item.alternativeId === response.alternative_id && item.itineraryFingerprint !== response.itinerary_fingerprint,
  ));
  const pending = !sameSelections(draft, confirmed);
  const canApply = Boolean(response && pending && !disabled && !loading && !saving);

  const applySelections = async () => {
    if (!response || !canApply) return;
    setSaving(true);
    setSaveError('');
    setSaveMessage('');
    const legIds = new Set(response.legs.map((leg) => leg.leg_id));
    const selections = Object.fromEntries(Object.entries(draft).filter(([legId]) => legIds.has(legId)));
    const transportPlan = buildConfirmedTransportPlan(
      trip.transportPlan,
      response.alternative_id,
      response.itinerary_fingerprint,
      selections,
      new Date().toISOString(),
    );
    try {
      const savedTrip = await saveTripWorkspace({ ...trip, transportPlan });
      onTripUpdate?.(savedTrip);
      setSaveMessage('Đã lưu lựa chọn phương tiện cho lịch trình hiện tại.');
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : 'Chưa lưu được lựa chọn phương tiện.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="my-5 rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5" aria-labelledby="transport-options-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="transport-options-title" className="text-lg font-semibold text-neutral-950">Di chuyển giữa các điểm</h2>
          <p className="mt-1 text-sm text-neutral-700">Xem dữ liệu theo từng chặng; lựa chọn chỉ được lưu sau khi bạn xác nhận.</p>
        </div>
        <button
          type="button"
          onClick={() => setRetry((value) => value + 1)}
          disabled={loading || saving}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-neutral-300 px-3 text-sm font-semibold text-neutral-900 hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 disabled:opacity-60"
        >
          <RefreshCw size={15} aria-hidden="true" /> Thử lại
        </button>
      </div>

      {disabled && <p className="mt-3 rounded-lg bg-neutral-100 p-3 text-sm text-neutral-800">Đang lưu itinerary; bạn có thể xác nhận phương tiện sau khi lịch trình được lưu.</p>}
      {loading && <div className="mt-4 space-y-3" aria-live="polite" aria-label="Đang tải chặng di chuyển"><div className="h-5 w-56 animate-pulse rounded bg-neutral-200" /><div className="h-28 animate-pulse rounded-xl bg-neutral-100" /></div>}
      {!loading && error && <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900" role="alert"><AlertCircle size={17} className="mt-0.5 shrink-0" aria-hidden="true" />{error}</div>}

      {!loading && !error && response && (
        <>
          {response.legs.length === 0 ? (
            <div className="mt-4 rounded-xl bg-neutral-50 p-4 text-sm text-neutral-800" role="status">Chưa có chặng đủ hai điểm để tính. Hãy thêm POI có vị trí hoặc chọn nơi lưu trú có tọa độ.</div>
          ) : (
            <div className="mt-4 space-y-4">
              {response.legs.map((leg) => (
                <article key={leg.leg_id} className="rounded-xl border border-neutral-200 p-3">
                  <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-neutral-950">
                    <span>Ngày {leg.day_number}</span><span aria-hidden="true">·</span>
                    <span className="break-words">{leg.origin.name} → {leg.destination.name}</span>
                    <span className="rounded-full bg-neutral-100 px-2 py-1 text-xs font-medium text-neutral-700">{leg.scope === 'INTERCITY' ? 'Liên tỉnh' : leg.scope === 'INTRACITY' ? 'Nội thành' : 'Chưa rõ phạm vi'}</span>
                  </div>
                  {leg.options.length ? (
                    <div className="space-y-3">
                      {leg.options.map((option) => (
                        <RouteOptionCard
                          key={leg.leg_id + '-' + option.mode + '-' + (option.train_service_name || '')}
                          leg={leg}
                          option={option}
                          selected={draft[leg.leg_id] === option.mode}
                          onSelect={() => {
                            setDraft((current) => ({ ...current, [leg.leg_id]: option.mode }));
                            setSaveError('');
                            setSaveMessage('');
                          }}
                        />
                      ))}
                    </div>
                  ) : <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">Chưa thể định tuyến chặng này. Kiểm tra tọa độ của hai điểm.</p>}
                  {leg.warnings.map((warning, index) => <p key={leg.leg_id + '-warning-' + index} className="mt-2 text-sm text-neutral-700">{warning}</p>)}
                </article>
              ))}
            </div>
          )}

          {response.uncomputed_endpoints.map((endpoint, index) => (
            <p key={endpoint.day_number + '-' + endpoint.endpoint + '-' + index} className="mt-2 flex items-start gap-2 text-sm text-neutral-700">
              <Info size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
              Ngày {endpoint.day_number}: chưa tính {endpoint.endpoint === 'FIRST_MILE' ? 'chặng đến điểm đầu' : 'chặng rời điểm cuối'}{endpoint.city ? ' tại ' + endpoint.city : ''} — {endpoint.reason}
            </p>
          ))}

          {staleSelection && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950" role="status">Lịch trình hoặc nơi lưu trú đã đổi. Lựa chọn phương tiện cũ không áp dụng cho bản hiện tại; hãy xem lại trước khi xác nhận.</p>}
          <div className="mt-4 rounded-xl bg-neutral-50 p-3">
            <p className="text-sm font-semibold text-neutral-900">Xem trước lựa chọn</p>
            <p className="mt-1 text-sm text-neutral-700">{Object.keys(draft).length ? Object.keys(draft).length + ' chặng sẽ được lưu nếu bạn xác nhận. Giá và CO₂e chưa có nguồn sẽ tiếp tục hiển thị là chưa biết.' : 'Chưa chọn phương tiện cho chặng nào.'}</p>
            <p className="mt-1 text-sm text-neutral-700">Áp dụng chỉ lưu lựa chọn phương tiện vào Trip Workspace; không đổi POI, thứ tự hoặc thời gian itinerary.</p>
            <button
              type="button"
              disabled={!canApply}
              onClick={() => void applySelections()}
              className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg bg-emerald-800 px-4 text-sm font-semibold text-white hover:bg-emerald-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-neutral-400"
            >
              {saving ? <RefreshCw size={16} className="animate-spin" aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}
              {saving ? 'Đang lưu…' : 'Xác nhận & lưu phương tiện'}
            </button>
            {saveError && <p className="mt-2 flex items-start gap-2 text-sm text-red-800" role="alert"><X size={15} className="mt-0.5 shrink-0" />{saveError}</p>}
            {saveMessage && <p className="mt-2 text-sm text-emerald-800" role="status">{saveMessage}</p>}
            {disabled && <p className="mt-2 text-sm text-neutral-700">Hoàn tất lưu itinerary trước khi xác nhận phương tiện.</p>}
          </div>
          {response.limitations.map((limitation, index) => <p key={'limit-' + index} className="mt-2 text-sm text-neutral-700">{limitation}</p>)}
        </>
      )}
    </section>
  );
}
