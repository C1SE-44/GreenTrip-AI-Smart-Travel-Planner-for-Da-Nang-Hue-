import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUp,
  Check,
  Compass,
  Leaf,
  Loader2,
  Luggage,
  Map as MapIcon,
  Plus,
  RotateCcw,
  Sparkles,
  Star,
  X,
} from 'lucide-react';
import type { Poi } from '@/data/pois';
import PoiMap from '@/components/poi/PoiMap';
import { sendCopilotChat, type CopilotSuggestedPoi } from '@/services/copilotService';
import { extractTripIntentFromPrompt } from '@/utils/vietnamesePromptExtractor';
import { FormattedCopilotMessage } from './TripOverviewView';
import type { CopilotTripMessage } from './copilotTripData';

interface IdeationMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  suggestedPois?: CopilotSuggestedPoi[];
  nextSuggestedPrompts?: string[];
  avoidNotice?: string | null;
  greenImpactSummary?: string | null;
  budgetImpactSummary?: string | null;
}

export interface IdeationChatViewProps {
  allPois: Poi[];
  onCreateTripFromIdea: (payload: {
    initialPrompt: string;
    selectedPoiIds: string[];
    chatHistory: CopilotTripMessage[];
  }) => void;
}

const STORAGE_KEY = 'greentrip_ideation_chat_v1';

const STARTER_PROMPTS = [
  'Tháng 11 đi Đà Nẵng – Huế thời tiết thế nào, có hay mưa không?',
  'Đặc sản nhất định phải thử ở Đà Nẵng và Huế là gì?',
  'Nên đi Đà Nẵng – Huế mấy ngày thì vừa đẹp cho 2 người?',
  'Gợi ý trải nghiệm du lịch xanh ít đông đúc ở miền Trung?',
];

function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function deriveChatTitle(messages: IdeationMessage[]): string {
  const firstUser = messages.find((m) => m.sender === 'user')?.text.trim();
  if (!firstUser) return 'Trò chuyện mới';
  const clean = firstUser.replace(/\s+/g, ' ');
  return clean.length > 44 ? `${clean.slice(0, 44).trim()}…` : clean;
}

function mapSuggestedToPoi(s: CopilotSuggestedPoi, allPois: Poi[]): Poi | null {
  const existing = allPois.find((p) => p.id === s.id || p.name.toLowerCase() === s.name.toLowerCase());
  if (existing) return existing;
  if (typeof s.lat !== 'number' || typeof s.lng !== 'number') return null;
  const city = s.city?.toLowerCase().includes('huế') || s.city?.toLowerCase().includes('hue') ? 'Huế' : 'Đà Nẵng';
  return {
    id: s.id,
    name: s.name,
    category: 'canh-quan',
    city,
    lat: s.lat,
    lng: s.lng,
    address: s.address,
    image: s.image_url,
    description: s.kg_explanation || s.swap_reason,
    rating: s.rating || 4.7,
    visitDuration: '1–2 giờ',
    isGreen: s.green_score >= 75,
    ecoScore: s.green_score || 85,
  };
}

export default function IdeationChatView({ allPois, onCreateTripFromIdea }: IdeationChatViewProps) {
  const [messages, setMessages] = useState<IdeationMessage[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed?.messages)) return parsed.messages;
      }
    } catch (e) {
      console.error(e);
    }
    return [];
  });

  const [selectedIdeaPoiIds, setSelectedIdeaPoiIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed?.selectedIdeaPoiIds)) return parsed.selectedIdeaPoiIds;
      }
    } catch (e) {
      console.error(e);
    }
    return [];
  });

  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastFailedPrompt, setLastFailedPrompt] = useState<string | null>(null);
  const [tripMemory, setTripMemory] = useState<Record<string, string>>({});
  const [activeConstraints, setActiveConstraints] = useState<string[]>([]);
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [selectedMapPoiId, setSelectedMapPoiId] = useState<string | null>(null);
  const [hoveredPoiId, setHoveredPoiId] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ messages, selectedIdeaPoiIds }));
    } catch (e) {
      console.error(e);
    }
  }, [messages, selectedIdeaPoiIds]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  const combinedUserText = useMemo(
    () => messages.filter((m) => m.sender === 'user').map((m) => m.text).join('. '),
    [messages]
  );

  const liveIntent = useMemo(() => {
    if (!combinedUserText.trim()) return null;
    return extractTripIntentFromPrompt(combinedUserText);
  }, [combinedUserText]);

  const mapPois = useMemo(() => {
    const byId = new Map<string, Poi>();
    messages.forEach((msg) => {
      msg.suggestedPois?.forEach((s) => {
        const poi = mapSuggestedToPoi(s, allPois);
        if (poi && !byId.has(poi.id)) {
          byId.set(poi.id, poi);
        }
      });
    });
    return Array.from(byId.values());
  }, [messages, allPois]);

  const entityLookup = useMemo(
    () => mapPois.map((p) => ({ id: p.id, name: p.name })),
    [mapPois]
  );

  const selectedIdeaIdSet = useMemo(() => new Set(selectedIdeaPoiIds), [selectedIdeaPoiIds]);

  const handleToggleIdeaPoi = (poiId: string) => {
    setSelectedIdeaPoiIds((prev) =>
      prev.includes(poiId) ? prev.filter((id) => id !== poiId) : [...prev, poiId]
    );
  };

  const handleResetChat = () => {
    setMessages([]);
    setSelectedIdeaPoiIds([]);
    setInput('');
    setErrorMessage(null);
    setLastFailedPrompt(null);
    setTripMemory({});
    setActiveConstraints([]);
  };

  const handleSend = async (rawText?: string) => {
    const text = (rawText ?? input).trim();
    if (!text || isSending) return;

    const userMsg: IdeationMessage = {
      id: `idea-u-${Date.now()}`,
      sender: 'user',
      text,
      timestamp: nowHHMM(),
    };

    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    if (!rawText) setInput('');
    setErrorMessage(null);
    setLastFailedPrompt(null);
    setIsSending(true);

    const parsed = extractTripIntentFromPrompt(`${combinedUserText} ${text}`.trim());

    try {
      const res = await sendCopilotChat({
        message: text,
        trip_context: {
          mode: 'ideation',
          destination: parsed.destination || 'Đà Nẵng & Huế',
          days_count: parsed.days || 4,
          current_day: 1,
          saved_ideas: selectedIdeaPoiIds,
          active_constraints: activeConstraints,
          trip_memory: tripMemory,
          conversation_history: nextMessages.slice(-8).map((m) => ({
            role: m.sender,
            content: m.text,
          })),
        },
      });

      if (res.detected_constraints) {
        setActiveConstraints(res.detected_constraints);
      }
      if (res.trip_memory) {
        setTripMemory((prev) => ({ ...prev, ...res.trip_memory }));
      }

      const aiMsg: IdeationMessage = {
        id: `idea-a-${Date.now()}`,
        sender: 'assistant',
        text: res.reply_text,
        timestamp: nowHHMM(),
        suggestedPois: res.suggested_pois || [],
        nextSuggestedPrompts: res.next_suggested_prompts || [],
        avoidNotice: res.avoid_notice,
        greenImpactSummary: res.green_impact_summary,
        budgetImpactSummary: res.budget_impact_summary,
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err) {
      console.error('Ideation chat error:', err);
      setErrorMessage('Không thể kết nối tới trợ lý AI lúc này. Vui lòng kiểm tra backend và thử lại.');
      setLastFailedPrompt(text);
    } finally {
      setIsSending(false);
    }
  };

  const handleCreateTripClick = () => {
    const userSummary = combinedUserText.trim();
    const hasExplicitDays = /\d+\s*(?:ngày|đêm|n\d+đ)/i.test(userSummary);
    const aiRecommendedDays = !hasExplicitDays
      ? messages
          .filter((m) => m.sender === 'assistant')
          .map((m) => m.text.match(/(\d+)\s*(?:đến\s*(\d+)\s*)?ngày/i))
          .find(Boolean)
      : null;

    const selectedNames = mapPois
      .filter((p) => selectedIdeaIdSet.has(p.id))
      .map((p) => p.name);

    const promptParts: string[] = [];
    if (userSummary) {
      promptParts.push(userSummary);
    } else {
      promptParts.push('Khám phá Đà Nẵng & Huế 4 ngày 3 đêm ưu tiên trải nghiệm xanh');
    }
    if (!hasExplicitDays && aiRecommendedDays) {
      const daysVal = aiRecommendedDays[2] || aiRecommendedDays[1];
      promptParts.push(`${daysVal} ngày`);
    }
    if (selectedNames.length > 0) {
      promptParts.push(`Ưu tiên ghé: ${selectedNames.join(', ')}`);
    }

    const historyForTrip: CopilotTripMessage[] = messages.map((m) => ({
      id: m.id,
      sender: m.sender,
      text: m.text,
      timestamp: m.timestamp,
      suggestedPois: m.suggestedPois,
      avoidNotice: m.avoidNotice,
      greenImpactSummary: m.greenImpactSummary,
      budgetImpactSummary: m.budgetImpactSummary,
      nextSuggestedPrompts: m.nextSuggestedPrompts,
    }));

    onCreateTripFromIdea({
      initialPrompt: promptParts.join('. ').slice(0, 1800),
      selectedPoiIds: selectedIdeaPoiIds,
      chatHistory: historyForTrip,
    });
  };

  const chatTitle = deriveChatTitle(messages);

  return (
    <main className="flex-1 h-full bg-[#FCFAF5] flex flex-col min-w-0 relative overflow-hidden">
      {/* Top Bar chuẩn MindTripAI */}
      <header className="shrink-0 border-b border-neutral-200/80 bg-white/90 backdrop-blur-md px-4 sm:px-8 py-3">
        <div className="max-w-[920px] mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-800 shrink-0">
              <Sparkles size={17} />
            </div>
            <div className="min-w-0">
              <h1 className="text-[15px] font-bold text-neutral-900 truncate">{chatTitle}</h1>
              <p className="text-xs text-neutral-600 truncate">
                Khởi tạo ý tưởng trước chuyến đi • Đà Nẵng & Huế
              </p>
            </div>
            {messages.length > 0 && (
              <button
                type="button"
                onClick={handleResetChat}
                className="ml-1 min-h-[40px] px-3 rounded-full border border-neutral-200 hover:border-neutral-400 text-xs font-semibold text-neutral-700 hover:text-neutral-950 bg-white transition flex items-center gap-1.5 cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                title="Bắt đầu đoạn chat mới"
              >
                <RotateCcw size={13} />
                <span className="hidden sm:inline">Chat mới</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {mapPois.length > 0 && (
              <button
                type="button"
                onClick={() => setIsMapOpen(true)}
                className="min-h-[40px] px-3.5 rounded-full border border-neutral-300 bg-white hover:bg-neutral-50 text-neutral-800 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
              >
                <MapIcon size={15} className="text-emerald-700" />
                <span>Bản đồ ({mapPois.length})</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleCreateTripClick}
              className="min-h-[42px] px-4 sm:px-5 rounded-full bg-neutral-900 hover:bg-neutral-800 text-white text-[13px] font-semibold flex items-center gap-2 shadow-xs transition active:scale-95 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
            >
              <Luggage size={16} />
              <span>Tạo lịch trình từ ý tưởng này</span>
            </button>
          </div>
        </div>

        {/* Context Filter Strip chuẩn MindTrip (Where · When · Who · Budget) */}
        <div className="max-w-[920px] mx-auto mt-2.5 flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-neutral-100 text-neutral-800 font-medium border border-neutral-200/80">
            <span className="text-neutral-600">Ở đâu:</span>
            <strong className="font-semibold text-neutral-950">
              {liveIntent ? liveIntent.routeDisplay : 'Đà Nẵng & Huế'}
            </strong>
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-neutral-100 text-neutral-800 font-medium border border-neutral-200/80">
            <span className="text-neutral-600">Khi:</span>
            <strong className="font-semibold text-neutral-950">
              {liveIntent ? liveIntent.whenDisplay : 'Chưa chốt ngày'}
            </strong>
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-neutral-100 text-neutral-800 font-medium border border-neutral-200/80">
            <span className="text-neutral-600">Ai:</span>
            <strong className="font-semibold text-neutral-950">
              {liveIntent ? liveIntent.whoDisplay : 'Linh hoạt'}
            </strong>
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-900 font-medium border border-emerald-200">
            <span className="text-emerald-700">Ngân sách:</span>
            <strong className="font-semibold">
              {liveIntent ? liveIntent.budgetDisplay : '$$ Tiêu chuẩn'}
            </strong>
          </span>
          {selectedIdeaPoiIds.length > 0 && (
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-neutral-900 text-white font-semibold">
              <Check size={12} />
              <span>{selectedIdeaPoiIds.length} điểm đã chọn</span>
            </span>
          )}
        </div>
      </header>

      {/* Main Scrollable Chat Stream */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6">
        <div className="max-w-[780px] mx-auto space-y-6 pb-8">
          {messages.length === 0 ? (
            <section className="py-10 sm:py-16 flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-2xl bg-emerald-800 text-white flex items-center justify-center shadow-md mb-5">
                <Compass size={30} />
              </div>
              <h2 className="text-2xl sm:text-[28px] font-bold text-neutral-950 tracking-tight mb-2.5">
                Hỏi vu vơ trước chuyến đi
              </h2>
              <p className="text-sm sm:text-[15px] text-neutral-600 max-w-lg leading-relaxed mb-8">
                Cứ hỏi thoải mái về thời tiết theo tháng, đặc sản địa phương, hay nên đi Đà Nẵng – Huế mấy ngày.
                Khi đã ưng ý tưởng, bấm <strong className="text-neutral-900">Tạo lịch trình từ ý tưởng này</strong> ở góc trên.
              </p>

              <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
                {STARTER_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => handleSend(prompt)}
                    className="min-h-[56px] p-4 rounded-2xl bg-white border border-neutral-200 hover:border-emerald-700 hover:bg-emerald-50/30 transition shadow-2xs flex items-start gap-3 cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                  >
                    <Sparkles
                      size={16}
                      className="text-emerald-700 shrink-0 mt-0.5 group-hover:scale-110 transition-transform"
                    />
                    <span className="text-[13px] font-medium text-neutral-800 leading-snug">
                      {prompt}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ) : (
            messages.map((msg, msgIdx) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
              >
                {msg.sender === 'user' ? (
                  <div className="max-w-[85%] sm:max-w-[75%] rounded-2xl rounded-br-sm bg-neutral-900 text-white px-4 py-3 text-[14px] leading-relaxed shadow-xs">
                    {msg.text}
                  </div>
                ) : (
                  <div className="w-full space-y-3">
                    <div className="bg-white border border-neutral-200/90 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-3">
                      <FormattedCopilotMessage
                        text={msg.text}
                        entityLookup={entityLookup}
                        onHoverPoi={setHoveredPoiId}
                        onSelectPoi={(poiId) => {
                          setSelectedMapPoiId(poiId);
                          setIsMapOpen(true);
                        }}
                      />

                      {(msg.avoidNotice || msg.greenImpactSummary || msg.budgetImpactSummary) && (
                        <div className="pt-2 border-t border-neutral-100 flex flex-wrap gap-2 text-xs">
                          {msg.greenImpactSummary && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-900 border border-emerald-200/80">
                              <Leaf size={13} className="text-emerald-700 shrink-0" />
                              <span>{msg.greenImpactSummary}</span>
                            </span>
                          )}
                          {msg.budgetImpactSummary && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-950 border border-amber-200/80">
                              <span>{msg.budgetImpactSummary}</span>
                            </span>
                          )}
                          {msg.avoidNotice && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-50 text-rose-900 border border-rose-200/80">
                              <span>{msg.avoidNotice}</span>
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Visual POI Cards chuẩn MindTripAI */}
                    {msg.suggestedPois && msg.suggestedPois.length > 0 && (
                      <div className="flex gap-3 overflow-x-auto pb-2 snap-x">
                        {msg.suggestedPois.map((poi) => {
                          const isSaved = selectedIdeaIdSet.has(poi.id);
                          return (
                            <article
                              key={poi.id}
                              onClick={() => {
                                setSelectedMapPoiId(poi.id);
                                setIsMapOpen(true);
                              }}
                              className="w-[235px] shrink-0 snap-start rounded-2xl bg-white border border-neutral-200/90 hover:border-neutral-400 overflow-hidden shadow-2xs transition cursor-pointer flex flex-col"
                            >
                              <div className="relative h-28 bg-neutral-100">
                                <img
                                  src={
                                    poi.image_url ||
                                    'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?auto=format&fit=crop&w=800&q=80'
                                  }
                                  alt={poi.name}
                                  className="w-full h-full object-cover"
                                />
                                <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-emerald-950/85 text-emerald-200 text-xs font-semibold inline-flex items-center gap-1">
                                  <Leaf size={11} />
                                  {poi.green_score}/100
                                </span>
                                <button
                                  type="button"
                                  aria-label={isSaved ? `Bỏ chọn ${poi.name}` : `Chọn ${poi.name} vào ý tưởng`}
                                  aria-pressed={isSaved}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleToggleIdeaPoi(poi.id);
                                  }}
                                  className={`absolute top-2 right-2 w-10 h-10 rounded-full flex items-center justify-center shadow-sm transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${
                                    isSaved
                                      ? 'bg-emerald-700 text-white'
                                      : 'bg-white/95 text-neutral-900 hover:bg-white'
                                  }`}
                                  title={isSaved ? 'Đã thêm vào ý tưởng' : 'Thêm vào ý tưởng chuyến đi'}
                                >
                                  {isSaved ? <Check size={16} /> : <Plus size={16} />}
                                </button>
                              </div>
                              <div className="p-3 flex-1 flex flex-col justify-between gap-1">
                                <div>
                                  <h3 className="text-[13px] font-bold text-neutral-950 line-clamp-1">
                                    {poi.name}
                                  </h3>
                                  <p className="text-xs text-neutral-600 line-clamp-1">
                                    {poi.city || poi.address}
                                  </p>
                                </div>
                                <div className="flex items-center justify-between pt-1 text-xs text-neutral-700">
                                  <span className="inline-flex items-center gap-1 font-semibold">
                                    <Star size={12} className="text-amber-500 fill-amber-500" />
                                    {(poi.rating || 4.7).toFixed(1)}
                                  </span>
                                  <span className="text-emerald-800 font-medium truncate max-w-[140px]">
                                    {poi.price_range_display || poi.category}
                                  </span>
                                </div>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    )}

                    {/* Follow-up prompt chips ở tin nhắn AI gần nhất */}
                    {msgIdx === messages.length - 1 &&
                      msg.nextSuggestedPrompts &&
                      msg.nextSuggestedPrompts.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {msg.nextSuggestedPrompts.slice(0, 3).map((chip) => (
                            <button
                              key={chip}
                              type="button"
                              onClick={() => handleSend(chip)}
                              className="min-h-[40px] px-3.5 py-1.5 rounded-full bg-white border border-neutral-200 hover:border-emerald-700 hover:bg-emerald-50/40 text-xs font-medium text-neutral-800 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                            >
                              {chip}
                            </button>
                          ))}
                        </div>
                      )}
                  </div>
                )}
              </div>
            ))
          )}

          {isSending && (
            <div className="flex items-center gap-2.5 text-xs font-medium text-neutral-700 bg-white border border-neutral-200 rounded-2xl px-4 py-3 w-fit shadow-2xs">
              <Loader2 size={15} className="animate-spin text-emerald-700" />
              <span>Đang tra cứu Đồ thị Tri thức Miền Trung...</span>
            </div>
          )}

          {errorMessage && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs text-rose-900">
              <span>{errorMessage}</span>
              {lastFailedPrompt && (
                <button
                  type="button"
                  onClick={() => handleSend(lastFailedPrompt)}
                  className="min-h-[36px] px-3 rounded-full bg-rose-700 hover:bg-rose-800 text-white font-semibold cursor-pointer"
                >
                  Thử lại
                </button>
              )}
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Bottom Floating Input Bar chuẩn MindTripAI */}
      <footer className="shrink-0 px-4 sm:px-8 pb-4 pt-2 bg-gradient-to-t from-[#FCFAF5] via-[#FCFAF5] to-transparent">
        <div className="max-w-[780px] mx-auto">
          <div className="flex items-end gap-2 rounded-3xl border border-neutral-300 bg-white px-4 py-2.5 shadow-md focus-within:border-neutral-900 focus-within:ring-1 focus-within:ring-neutral-900 transition">
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Hỏi về thời tiết, đặc sản, nên đi mấy ngày..."
              aria-label="Nhập câu hỏi khởi tạo ý tưởng chuyến đi"
              className="flex-1 resize-none overflow-y-auto bg-transparent py-2 text-[14px] text-neutral-900 placeholder:text-neutral-500 focus:outline-none max-h-36 leading-relaxed"
            />
            <button
              type="button"
              onClick={() => handleSend()}
              disabled={!input.trim() || isSending}
              aria-label="Gửi tin nhắn"
              className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${
                input.trim() && !isSending
                  ? 'bg-neutral-900 hover:bg-neutral-800 text-white cursor-pointer active:scale-95'
                  : 'bg-neutral-200 text-neutral-500 cursor-not-allowed'
              }`}
            >
              {isSending ? <Loader2 size={16} className="animate-spin" /> : <ArrowUp size={18} />}
            </button>
          </div>
          <p className="mt-2 text-center text-xs text-neutral-600">
            GreenTrip AI gợi ý tham khảo trước chuyến đi — bấm{' '}
            <button
              type="button"
              onClick={handleCreateTripClick}
              className="font-semibold text-emerald-800 hover:underline cursor-pointer"
            >
              Tạo lịch trình từ ý tưởng này
            </button>{' '}
            bất cứ lúc nào bạn muốn chốt kế hoạch.
          </p>
        </div>
      </footer>

      {/* Quick Map Preview Modal chuẩn MindTrip [🗺️ Map] */}
      {isMapOpen && mapPois.length > 0 && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setIsMapOpen(false)}
        >
          <div
            className="w-full max-w-4xl h-[75vh] bg-white rounded-3xl overflow-hidden shadow-2xl border border-neutral-200 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3 border-b border-neutral-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MapIcon size={17} className="text-emerald-700" />
                <h2 className="text-sm font-bold text-neutral-950">
                  Bản đồ các điểm đang thảo luận ({mapPois.length})
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsMapOpen(false)}
                aria-label="Đóng bản đồ"
                className="w-10 h-10 rounded-full hover:bg-neutral-100 flex items-center justify-center text-neutral-800 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 relative">
              <PoiMap
                pois={mapPois}
                selectedPoiId={selectedMapPoiId}
                hoveredPoiId={hoveredPoiId}
                onSelectPoi={setSelectedMapPoiId}
                onHoverPoi={setHoveredPoiId}
                hideTopControls
              />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
