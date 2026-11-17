import { useCallback, useEffect, useRef, useState } from "react";
import { saveTripWorkspace } from '@/services/tripWorkspace';
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Heart,
  MapPin,
  Plus,
  Send,
  Sparkles,
} from "lucide-react";
import type { UserTrip } from "@/pages/ExplorePage";
import {
  applyAssistant,
  chatAssistant,
  loadAssistant,
  loadAssistantConversations,
  type AssistantDraft,
  type AssistantMessage,
  type AssistantMode,
  type AssistantPlace,
} from "@/services/travelAssistant";
import { poiImageUrl } from "@/utils/poiImage";
import { tripStartDate } from "@/utils/tripDates";
import { useSavedPlaces } from "@/context/SavedPlacesContext";

export interface TravelAssistantProps {
  mode?: AssistantMode;
  trip?: UserTrip;
  ideaIds?: string[];
  onIdeasChange?: (ids: string[], revision?: number) => void;
  onBudgetChange?: (budget: number) => void;
  onViewPoi?: (id: string) => void;
  onApplied?: () => void;
  initialPrompt?: string;
  onCreatePrivateTrip?: () => void;
}

function Text({ value }: { value: string }) {
  return (
    <div className="space-y-2">
      {value.split("\n").map((line, index) => (
        <p key={index}>
          {line
            .split(/(\*\*.*?\*\*)/g)
            .map((part, i) =>
              part.startsWith("**") ? (
                <strong key={i}>{part.slice(2, -2)}</strong>
              ) : (
                part
              ),
            )}
        </p>
      ))}
    </div>
  );
}

function Places({
  items,
  onSave,
  onView,
  onAdd,
  days,
  busy,
}: {
  items: AssistantPlace[];
  onSave: (index: number) => void;
  onView?: (id: string) => void;
  onAdd?: (index: number, day: number) => void;
  days: number;
  busy: boolean;
}) {
  const strip = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  useEffect(() => {
    const element = strip.current;
    if (!element) return;
    element.scrollLeft = 0;
    const measure = () => setOverflowing(items.length > 1 && element.scrollWidth > element.clientWidth + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [items]);
  const { savedIds, pendingIds, toggleSaved } = useSavedPlaces();
  return (
    <div className="mt-3">
      {overflowing && <div className="mb-2 flex justify-end gap-2">
        <button
          type="button"
          aria-label="Địa điểm trước"
          className="h-10 w-10 rounded-full border border-neutral-300 grid place-items-center"
          onClick={() =>
            strip.current?.scrollBy({ left: -440, behavior: "smooth" })
          }
        >
          <ArrowLeft size={16} />
        </button>
        <button
          type="button"
          aria-label="Địa điểm tiếp theo"
          className="h-10 w-10 rounded-full border border-neutral-300 grid place-items-center"
          onClick={() =>
            strip.current?.scrollBy({ left: 440, behavior: "smooth" })
          }
        >
          <ArrowRight size={16} />
        </button>
      </div>}
      <div
        ref={strip}
        className="flex gap-3 overflow-x-auto no-scrollbar snap-x pb-2"
        aria-label="Địa điểm theo đúng thứ tự câu trả lời"
      >
        {items.map((place, index) => (
          <article
            key={place.id}
            className="w-[210px] shrink-0 overflow-hidden rounded-2xl border border-neutral-200 bg-white snap-start"
          >
            <img
              src={poiImageUrl(place.image_url, 320)}
              alt={place.name}
              loading="lazy"
              decoding="async"
              className="h-28 w-full object-cover"
              width={210}
              height={112}
            />
            <div className="p-3 space-y-2">
              <p className="font-semibold">
                {index + 1}. {place.name}
              </p>
              <p className="text-xs text-neutral-600">
                {place.city}
                {typeof place.distance_km === "number"
                  ? ` · ${place.distance_km} km đường thẳng`
                  : ""}
              </p>
              <p className="text-xs text-neutral-600">{place.price_label}</p>
              <div className="flex items-center justify-between gap-2">
                {onView ? (
                  <button
                    type="button"
                    onClick={() => onView(place.id)}
                    className="min-h-11 inline-flex items-center gap-1 text-xs underline"
                  >
                    <MapPin size={14} />
                    Xem bản đồ
                  </button>
                ) : place.latitude != null && place.longitude != null ? (
                  <a
                    target="_blank"
                    rel="noopener noreferrer"
                    href={`https://www.openstreetmap.org/?mlat=${place.latitude}&mlon=${place.longitude}#map=16/${place.latitude}/${place.longitude}`}
                    className="min-h-11 inline-flex items-center gap-1 text-xs underline"
                  >
                    <MapPin size={14} />
                    Bản đồ ↗
                  </a>
                ) : null}
                <button
                  type="button"
                  aria-label={
                    savedIds.has(place.id)
                      ? `Bỏ lưu ${place.name}`
                      : `Yêu thích ${place.name}`
                  }
                  aria-pressed={savedIds.has(place.id)}
                  disabled={pendingIds.has(place.id)}
                  onClick={() => void toggleSaved(place.id)}
                  className="h-11 w-11 shrink-0 grid place-items-center rounded-full border border-neutral-300 disabled:opacity-50"
                >
                  <Heart
                    size={17}
                    fill={savedIds.has(place.id) ? "currentColor" : "none"}
                  />
                </button>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => onSave(index)}
                className="min-h-11 w-full rounded-full border border-neutral-300 px-3 text-xs font-semibold inline-flex justify-center items-center gap-1 disabled:opacity-50"
              >
                <Plus size={14} />
                Lưu vào Ý tưởng
              </button>
              {onAdd && (
                <select
                  aria-label={`Thêm ${place.name} vào ngày`}
                  disabled={busy}
                  value=""
                  onChange={(event) => {
                    if (event.target.value)
                      onAdd(index, Number(event.target.value));
                  }}
                  className="min-h-11 w-full rounded-xl border border-neutral-300 bg-white px-2 text-xs"
                >
                  <option value="">Thêm vào lịch…</option>
                  {Array.from({ length: days }, (_, day) => (
                    <option value={day + 1} key={day}>
                      Xem trước ngày {day + 1}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function Preview({
  draft,
  busy,
  onApply,
}: {
  draft: AssistantDraft;
  busy: boolean;
  onApply: () => void;
}) {
  return (
    <section
      className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50/40 p-3 space-y-3"
      aria-label="Bản nháp chưa áp dụng"
    >
      <p className="font-semibold">Xem trước · Chưa thay đổi lịch</p>
      {draft.itinerary?.days.map((day) => (
        <div key={day.day_id}>
          <p className="font-semibold">
            Ngày {day.day_number} · {day.date || "Chưa chọn ngày"}
          </p>
          <ul className="mt-2 space-y-2">
            {day.stops.map((stop) => (
              <li
                key={stop.stop_id}
                className="border-l-2 border-emerald-700 pl-3"
              >
                <p>
                  {stop.start_time}–{stop.end_time} · {stop.title}
                </p>
                {stop.comment && (
                  <p className="text-xs text-neutral-600">{stop.comment}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
      {draft.warnings.map((warning, index) => (
        <p key={index} className="text-xs text-neutral-700">
          {warning}
        </p>
      ))}
      <button
        type="button"
        disabled={busy}
        onClick={onApply}
        className="min-h-11 rounded-full bg-neutral-950 text-white px-5 font-semibold disabled:opacity-50"
      >
        {busy ? "Đang xử lý…" : "Áp dụng"}
      </button>
    </section>
  );
}

export default function TravelAssistant({
  mode = "discover",
  trip,
  ideaIds,
  onIdeasChange,
  onBudgetChange,
  onViewPoi,
  onApplied,
  initialPrompt,
  onCreatePrivateTrip,
}: TravelAssistantProps) {
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loginRequired, setLoginRequired] = useState(false);
  const [retry, setRetry] = useState(0);
  const [conversationId, setConversationId] = useState(1);
  const [conversations,setConversations]=useState<{id:number;title:string;message_count:number}[]>([]);
  const [accessDenied, setAccessDenied] = useState(false);
  const [activeDraft, setActiveDraft] = useState<string | null>(null);
  const [ideas, setIdeas] = useState<string[]>(ideaIds || trip?.ideas || []);
  const bottom = useRef<HTMLDivElement>(null);
  const scope = useRef("");
  const initialSent = useRef(false);
  const tripId = trip?.id;
  const isSampleTrip = Boolean(tripId?.startsWith('sample-'));
  useEffect(() => {
    const changed = () => {
      scope.current = "";
      setMessages([]);
      setConversations([]);
      setConversationId(1);
      setRetry((value) => value + 1);
    };
    window.addEventListener("auth-change", changed);
    return () => window.removeEventListener("auth-change", changed);
  }, []);
  useEffect(() => {
    setIdeas(ideaIds || trip?.ideas || []);
  }, [ideaIds, trip?.ideas]);
  useEffect(()=>{
    const abort=new AbortController();
    setConversations([]);
    void loadAssistantConversations(mode,tripId,abort.signal).then(result=>{
      if(abort.signal.aborted)return;
      setConversations(result.items);
      setConversationId(result.items[0]?.id || 1);
    }).catch(()=>undefined);
    return ()=>abort.abort();
  },[mode,tripId,retry]);
  useEffect(() => {
    scope.current = `${tripId || ""}:${mode}:${conversationId}:${retry}`;
    const abort = new AbortController();
    setLoading(true);
    setBusy(false);
    setMessages([]);
    setInput("");
    setActiveDraft(null);
    setError("");
    setLoginRequired(false);
    setAccessDenied(false);
    if (isSampleTrip) {
      setLoading(false);
      return () => { abort.abort(); scope.current = ''; };
    }
    void loadAssistant(mode, tripId, abort.signal, conversationId)
      .then((result) => {
        if (abort.signal.aborted) return;
        setMessages(result.messages);
        setActiveDraft(result.draft?.id || null);
      })
      .catch((reason: Error & { status?: number }) => {
        if (abort.signal.aborted) return;
        setLoginRequired(reason.status === 401);
        setAccessDenied(reason.status === 403);
        setError(
          reason.status === 401
            ? "Đăng nhập để dùng trợ lý và giữ hội thoại riêng theo chuyến."
            : reason.status === 403
              ? reason.message
              : "Chưa tải được hội thoại. Bạn có thể thử lại.",
        );
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => {
      abort.abort();
      scope.current = "";
    };
  }, [mode, tripId, retry, isSampleTrip, conversationId]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages.length, busy]);
  const city = trip?.destination || "Huế";
  const last = [...messages]
    .reverse()
    .find((message) => message.role !== "user");
  const suggestions = last
    ? (last.prompts || [])
    : (mode === "planner" && ideas.length
      ? ["Xếp lịch từ Ý tưởng", `Tìm địa điểm ở ${city}`]
      : [`Tìm cà phê ở ${city}`, `Tìm bảo tàng ở ${city}`, `Gợi ý điểm thiên nhiên ở ${city}`]);
  const send = useCallback(
    async (text: string, selectedPoiId?: string) => {
      if (!text.trim() || busy || loading || loginRequired || accessDenied || isSampleTrip) return;
      const key = scope.current;
      setError("");
      setBusy(true);
      setInput("");
      setMessages((previous) => [
        ...previous,
        { id: `user-${Date.now()}`, role: "user", text },
      ]);
      try {
        if(trip?.workspaceRevision!==undefined)await saveTripWorkspace({...trip,ideas:ideaIds ?? trip.ideas ?? ideas});
        if(key!==scope.current)return;
        const result = await chatAssistant(
          text,
          mode,
          tripId,
          {
            destination: trip?.destination || "",
            days_count: trip?.daysCount || trip?.flexibleDays || 2,
            start_date: tripStartDate(trip?.startDate) || undefined,
            title: trip?.title,
            people_count: trip?.peopleCount || 1,
            budget: trip?.totalBudget,
            preferences: trip?.tags || [],
            idea_ids: ideaIds ?? trip?.ideas ?? ideas,
          },
          selectedPoiId,
          conversationId,
        );
        if (key !== scope.current) return;
        void loadAssistantConversations(mode,tripId).then(history=>{if(key===scope.current)setConversations(history.items);}).catch(()=>undefined);
        setMessages((previous) => [
          ...previous,
          { ...result, role: "assistant", id: `assistant-${Date.now()}` },
        ]);
        if (result.active_draft_id !== undefined) {
          setActiveDraft(result.active_draft_id);
        } else if (result.draft) setActiveDraft(result.draft.id);
        if (result.action === "ideas_saved" && result.idea_ids) {
          setIdeas(result.idea_ids);
          onIdeasChange?.(result.idea_ids,result.workspace_revision);
        }
      } catch (reason) {
        if (key === scope.current) {
          setAccessDenied((reason as {status?: number}).status === 403);
          setInput(text);
          setError(
            reason instanceof Error
              ? reason.message
              : "Chưa gửi được. Bạn thử lại nhé.",
          );
        }
      } finally {
        if (key === scope.current) setBusy(false);
      }
    },
    [busy, loading, loginRequired, accessDenied, isSampleTrip, mode, tripId, trip, ideas, ideaIds, onIdeasChange, conversationId],
  );
  useEffect(() => {
    if (
      initialPrompt &&
      !isSampleTrip &&
      !loading &&
      !loginRequired &&
      !error &&
      !initialSent.current
    ) {
      initialSent.current = true;
      void send(initialPrompt);
    }
  }, [initialPrompt, isSampleTrip, loading, loginRequired, error, send]);
  async function apply(draft: AssistantDraft) {
    if (!tripId || busy) return;
    const key = scope.current;
    setBusy(true);
    setError("");
    try {
      const result = await applyAssistant(draft.id, mode, tripId, conversationId);
      if (key !== scope.current) return;
      setActiveDraft(null);
      setMessages((previous) => [
        ...previous,
        { role: "assistant", text: result.text },
      ]);
      if (result.budget !== undefined) onBudgetChange?.(result.budget);
      if (result.itinerary) {
        window.dispatchEvent(
          new CustomEvent("assistant-itinerary-updated", {
            detail: { tripId },
          }),
        );
        onApplied?.();
      }
    } catch (reason) {
      if (key === scope.current)
        setError(
          reason instanceof Error
            ? reason.message
            : "Chưa áp dụng được; lịch vẫn giữ nguyên.",
        );
    } finally {
      if (key === scope.current) setBusy(false);
    }
  }
  if (isSampleTrip || accessDenied) return (
    <section className="flex h-full min-w-0 flex-col bg-white px-4 py-5 text-sm text-neutral-800" aria-label={isSampleTrip ? "Trợ lý cho lịch mẫu" : "Tạo chuyến riêng để dùng trợ lý"}>
      <h2 className="font-semibold">{isSampleTrip ? "Tạo chuyến riêng để dùng trợ lý" : "Chuyến này chưa thuộc tài khoản của bạn"}</h2>
      <p className="mt-3 text-neutral-600">{isSampleTrip ? "Bạn đang mở lịch mẫu dùng chung." : "Chuyến cũ có thể được lưu từ tài khoản khác trên trình duyệt này. Hội thoại của tài khoản đó được giữ riêng."} Tạo chuyến riêng rồi chọn ngày đi để trò chuyện và xem trước lịch trình của bạn.</p>
      {ideas.length > 0 && <p className="mt-2 text-neutral-600">{ideas.length} địa điểm đã chọn sẽ được đưa vào Ý tưởng của chuyến mới.</p>}
      {onCreatePrivateTrip ? <button type="button" onClick={onCreatePrivateTrip} className="mt-5 min-h-11 self-start rounded-full bg-neutral-950 px-5 font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">Tạo chuyến riêng</button> : <Link to="/my-trips" className="mt-5 inline-flex min-h-11 items-center self-start underline">Mở Chuyến đi của tôi để tạo chuyến riêng</Link>}
    </section>
  );

  return (
    <section
      className="flex h-full min-h-[420px] min-w-0 flex-col bg-white text-sm text-neutral-800"
      aria-label={mode === "planner" ? "Trợ lý lên lịch" : "Trợ lý khám phá"}
    >
      <header className="flex items-center gap-2 border-b border-neutral-200 px-4 py-3">
        <Sparkles size={18} className="text-emerald-800" />
        <div>
          <h2 className="font-semibold">
            {mode === "planner"
              ? "Cùng bạn lên lịch"
              : "Bạn muốn khám phá đâu?"}
          </h2>
          <p className="text-xs text-neutral-600">
            {trip?.title || "Khám phá Đà Nẵng – Huế"} · Dữ liệu GreenTrip
          </p>
        </div>
      </header>
      {!!conversations.length && !loginRequired && <div className="flex items-center gap-2 border-b border-neutral-200 px-4 py-2">
        <select aria-label="Chọn hội thoại" value={conversationId} disabled={busy || loading}
          onChange={event=>{scope.current='';setInput('');setConversationId(Number(event.target.value));}}
          className="min-h-10 min-w-0 flex-1 rounded-xl border border-neutral-200 bg-white px-3 text-sm">
          {conversations.map(item=><option key={item.id} value={item.id}>{item.title}</option>)}
          {!conversations.some(item=>item.id===conversationId) && <option value={conversationId}>Cuộc trò chuyện mới</option>}
        </select>
        {conversations.length<3 && conversations.some(item=>item.id===conversationId) && <button type="button" disabled={busy || loading}
          onClick={()=>{const next=[1,2,3].find(id=>!conversations.some(item=>item.id===id));if(next){scope.current='';setConversationId(next);}}}
          className="min-h-10 shrink-0 rounded-full border border-neutral-200 px-3 text-xs">Cuộc trò chuyện mới</button>}
      </div>}
      <div
        className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4"
        aria-live="polite"
        aria-busy={busy || loading}
      >
        {loading && <p role="status">Đang tải hội thoại…</p>}
        {!loading && !messages.length && !error && (
          <p>
            Chào bạn!{" "}
            {mode === "planner"
              ? "Mình giúp chia ngày từ những điểm bạn đã lưu."
              : "Mình giúp tìm địa điểm đúng khu vực và sở thích của bạn."}{" "}
            Bạn muốn bắt đầu với việc nào?
          </p>
        )}
        {messages.map((message, index) => (
          <article
            key={message.id || index}
            className={
              message.role === "user"
                ? "ml-8 rounded-2xl bg-neutral-100 p-3"
                : "space-y-2"
            }
          >
            <Text value={message.text} />
            {!!message.pois?.length && (
              <Places
                items={message.pois}
                busy={busy}
                onView={onViewPoi}
                days={trip?.daysCount || trip?.flexibleDays || 2}
                onAdd={
                  tripId
                    ? (position, day) =>
                        void send(
                          `Thêm chỗ thứ ${position + 1} vào ngày ${day}`,
                          message.pois![position].id,
                        )
                    : undefined
                }
                onSave={(position) =>
                  void send(
                    `Lưu chỗ thứ ${position + 1} vào Ý tưởng`,
                    message.pois![position].id,
                  )
                }
              />
            )}
            {!!message.unknown_price_pois?.length && (
              <details className="text-xs text-neutral-700">
                <summary className="min-h-10 cursor-pointer">
                  Giá chưa xác định · không tính là khớp ngân sách
                </summary>
                {message.unknown_price_pois.map((place) => (
                  <p key={place.id} className="py-2">
                    {place.name} — {place.price_label}
                  </p>
                ))}
              </details>
            )}
            {message.draft && message.draft.id === activeDraft && (
              <Preview
                draft={message.draft}
                busy={busy}
                onApply={() => void apply(message.draft!)}
              />
            )}
          </article>
        ))}
        {busy && (
          <p role="status" className="text-xs text-neutral-600">
            Đang kiểm tra dữ liệu…
          </p>
        )}
        {error && (
          <div
            role="alert"
            className="rounded-xl border border-neutral-300 p-3"
          >
            <p>{error}</p>
            {loginRequired ? (
              <Link
                className="inline-flex min-h-11 items-center underline"
                to="/login"
              >
                Đăng nhập
              </Link>
            ) : (
              <button
                type="button"
                className="min-h-11 underline"
                onClick={() => setRetry((value) => value + 1)}
              >
                Tải lại hội thoại
              </button>
            )}
          </div>
        )}
        <div ref={bottom} />
      </div>
      {!loginRequired && (
        <div className="shrink-0 flex max-h-28 flex-wrap gap-2 overflow-y-auto px-4 pb-3">
          {suggestions.slice(0, 3).map((prompt) => (
            <button
              type="button"
              key={typeof prompt === "string" ? prompt : prompt.message}
              disabled={busy || loading}
              onClick={() => {
                setInput(typeof prompt === "string" ? prompt : prompt.message);
                document.getElementById(`assistant-${mode}`)?.focus();
              }}
              className="min-h-10 max-w-full rounded-2xl border border-neutral-300 px-3 py-2 text-left text-xs disabled:opacity-50"
            >
              {typeof prompt === "string" ? prompt : prompt.label}
            </button>
          ))}
        </div>
      )}
      <form
        className="flex items-end gap-2 border-t border-neutral-200 p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void send(input);
        }}
      >
        <label className="sr-only" htmlFor={`assistant-${mode}`}>
          Tin nhắn cho trợ lý
        </label>
        <textarea
          id={`assistant-${mode}`}
          rows={2}
          value={input}
          maxLength={1000}
          onChange={(event) => setInput(event.target.value)}
          disabled={busy || loading || loginRequired}
          placeholder="Ví dụ: tìm cà phê ở Huế dưới 100k"
          className="min-w-0 flex-1 resize-none rounded-xl border border-neutral-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-800"
        />
        <button
          type="submit"
          disabled={busy || loading || loginRequired || !input.trim()}
          aria-label="Gửi tin nhắn"
          className="h-11 w-11 shrink-0 rounded-full bg-neutral-950 text-white grid place-items-center disabled:opacity-40"
        >
          <Send size={17} />
        </button>
      </form>
    </section>
  );
}
