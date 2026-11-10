import React, { useState, useRef, useEffect } from 'react';
import {
  RotateCcw,
  Star,
  Leaf,
  Check,
  AlertTriangle,
  ChevronDown,
  X,
  Plus,
  Sparkles,
  Coins,
  Mic,
  AudioWaveform,
  ArrowUp,
  Heart,
  Info,
  ChevronRight,
  Car,
} from 'lucide-react';
import type { UserTrip } from '@/pages/ExplorePage';
import {
  sendCopilotChat,
  type CopilotSuggestedPoi,
  type CopilotChatResponse,
} from '@/services/copilotService';
import {
  buildDefaultMindtripConversation,
  buildDayNarrativesFromOutline,
  buildDefaultMindtripItinerary,
  type MindtripCopilotMessage,
} from './copilotTripData';

function getInitialMessagesForTrip(t: UserTrip): CopilotMessage[] {
  let msgs: CopilotMessage[];
  if (Array.isArray(t.copilotChatHistory) && t.copilotChatHistory.length > 0) {
    msgs = [...t.copilotChatHistory];
  } else {
    msgs = buildDefaultMindtripConversation(
      t.destination || 'Đà Nẵng & Huế',
      t.daysCount || 4,
      t.peopleCount || 2,
      t.prompt
    );
  }

  const hasNarratives = msgs.some((m) => m.dayNarratives && m.dayNarratives.length > 0);
  if (!hasNarratives) {
    const outline = t.itineraryOutline || buildDefaultMindtripItinerary(t.destination || 'Đà Nẵng & Huế', t.daysCount || 4);
    const narratives = buildDayNarrativesFromOutline(outline, t.startDate);
    const firstAssistantIdx = msgs.findIndex((m) => m.sender === 'assistant');
    if (firstAssistantIdx !== -1) {
      msgs[firstAssistantIdx] = {
        ...msgs[firstAssistantIdx],
        dayNarratives: narratives,
      };
    }
  }
  return msgs;
}

export type CopilotMessage = MindtripCopilotMessage;

export interface PlannerCopilotDrawerProps {
  isOpen?: boolean;
  inline?: boolean;
  onClose?: () => void;
  trip: UserTrip;
  activeDayIndex?: number;
  savedIdeas?: string[];
  onApplySwapStop?: (dayIndex: number, slot: string, newPoi: CopilotSuggestedPoi) => void;
  onViewPoiDetail?: (poiId: string) => void;
  onHighlightOnMap?: (poiId: string) => void;
  onUpdateTrip?: (updatedTrip: UserTrip) => void;
  onSelectDay?: (dayIndex: number) => void;
}

function renderInlineMarkdown(text: string) {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold text-neutral-900">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}

function FormattedCopilotMessage({ text }: { text: string }) {
  const lines = text.split('\n');

  return (
    <div className="space-y-1.5 text-[13px] leading-relaxed text-neutral-800">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return <div key={idx} className="h-1" />;
        }

        // Special Mindtrip Badges: Di chuyển, Chi phí, Lý do
        if (trimmed.includes('📍') || trimmed.includes('Di chuyển:')) {
          return (
            <div key={idx} className="flex items-start gap-1.5 pl-2 my-1 text-[12px] text-neutral-700 bg-neutral-100/70 p-2 rounded-xl border border-neutral-200/50">
              <span className="shrink-0 text-xs">📍</span>
              <div className="flex-1 leading-normal">
                {renderInlineMarkdown(trimmed.replace(/^[-*]\s*/, ''))}
              </div>
            </div>
          );
        }

        if (trimmed.includes('💸') || trimmed.includes('Chi phí')) {
          return (
            <div key={idx} className="flex items-start gap-1.5 pl-2 my-1 text-[12px] text-amber-950 bg-amber-50/70 p-2 rounded-xl border border-amber-200/50 font-mono">
              <span className="shrink-0 text-xs">💸</span>
              <div className="flex-1 leading-normal">
                {renderInlineMarkdown(trimmed.replace(/^[-*]\s*/, ''))}
              </div>
            </div>
          );
        }

        if (trimmed.includes('✅') || trimmed.includes('Lý do:')) {
          return (
            <div key={idx} className="flex items-start gap-1.5 pl-2 my-1 text-[12px] text-emerald-950 bg-emerald-50/70 p-2 rounded-xl border border-emerald-200/50">
              <span className="shrink-0 text-xs">✅</span>
              <div className="flex-1 leading-normal">
                {renderInlineMarkdown(trimmed.replace(/^[-*]\s*/, ''))}
              </div>
            </div>
          );
        }

        // Numbered list item like MindTrip questions
        const numMatch = trimmed.match(/^(\d+)\.\s*(.*)/);
        if (numMatch) {
          const num = numMatch[1];
          const content = numMatch[2];
          return (
            <div key={idx} className="flex items-start gap-2.5 pl-1 my-1.5">
              <span className="font-bold text-[13px] text-neutral-900 shrink-0">
                {num}.
              </span>
              <div className="flex-1 leading-normal text-neutral-800">
                {renderInlineMarkdown(content)}
              </div>
            </div>
          );
        }

        // Bullet point lines starting with "- " or "* "
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          const content = trimmed.substring(2);
          return (
            <div key={idx} className="flex items-start gap-2 pl-1 my-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 mt-2 shrink-0" />
              <div className="flex-1 leading-normal text-neutral-800">
                {renderInlineMarkdown(content)}
              </div>
            </div>
          );
        }

        // Section header (e.g. "**1. Tiêu đề**" or "**Day 1 — ...**")
        if (trimmed.startsWith('**') && trimmed.endsWith('**') && !trimmed.slice(2, -2).includes('**')) {
          const headerText = trimmed.slice(2, -2);
          return (
            <h4
              key={idx}
              className="font-bold text-[14px] text-neutral-950 mt-3 mb-1.5 pt-2 border-t border-neutral-100 first:border-0 first:pt-0 first:mt-0 tracking-tight"
            >
              {headerText}
            </h4>
          );
        }

        return (
          <p key={idx} className="leading-relaxed">
            {renderInlineMarkdown(trimmed)}
          </p>
        );
      })}
    </div>
  );
}

const DEFAULT_PROMPT_CHIPS = [
  {
    id: 'culinary',
    label: 'Quán ăn ngon đặc sản',
    prompt: 'Gợi ý cho tôi các quán ăn ngon ở Đà Nẵng',
  },
  {
    id: 'cafe_chill',
    label: 'Quán cafe view đẹp',
    prompt: 'Gợi ý quán cafe view đẹp ngắm cảnh ở Đà Nẵng',
  },
  {
    id: 'poi_son_tra',
    label: 'Có nên đi Bán Đảo Sơn Trà?',
    prompt: 'tôi có nên đi bán đảo sơn trà không',
  },
  {
    id: 'swap_veg',
    label: 'Đổi quán trưa sang món chay',
    prompt: 'Tôi muốn đổi quán ăn trưa sang quán ăn chay thanh tịnh',
  },
  {
    id: 'late_adjust',
    label: 'Trễ giờ, tối ưu chiều nay',
    prompt: 'Tôi đang bị trễ 45 phút, gợi ý cách tối ưu lịch trình chiều nay gọn hơn và không bị ngược đường?',
  },
  {
    id: 'rainy_day',
    label: 'Trời mưa thì đi đâu chơi?',
    prompt: 'Dự báo trời mưa to thì nên đi đâu chơi có mái che?',
  },
  {
    id: 'night_eco',
    label: 'Trải nghiệm đêm chuẩn xanh',
    prompt: 'Buổi tối ở đây có hoạt động gì ngắm cảnh về đêm và đi bộ?',
  },
];

export const PlannerCopilotDrawer: React.FC<PlannerCopilotDrawerProps> = ({
  isOpen = true,
  inline = false,
  onClose,
  trip,
  activeDayIndex = 1,
  savedIdeas = [],
  onApplySwapStop,
  onViewPoiDetail,
  onHighlightOnMap,
  onUpdateTrip,
  onSelectDay,
}) => {
  const [selectedDay, setSelectedDay] = useState<number>(activeDayIndex || 1);
  const [expandedThinking, setExpandedThinking] = useState<Record<string, boolean>>({});
  const [messages, setMessages] = useState<CopilotMessage[]>(() => getInitialMessagesForTrip(trip));

  useEffect(() => {
    setMessages(getInitialMessagesForTrip(trip));
  }, [trip.id]);
  const [inputValue, setInputValue] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [swappedPoiIds, setSwappedPoiIds] = useState<Record<string, boolean>>({});
  const [dynamicPrompts, setDynamicPrompts] = useState<string[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom only when new user/assistant messages are added
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (inline || isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, inline, isLoading]);

  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Giữ cuộn ở đầu trang khi mới mở để xem rõ lời chào, bảng ngân sách và Day 1
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = 0;
    }
  }, []);

  // Chỉ focus input khi ở dạng Drawer mở nổi, tránh giật cuộn khi ở chế độ inline
  useEffect(() => {
    if (!inline && isOpen) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [isOpen, inline]);

  if (!inline && !isOpen) return null;

  const handleSendMessage = async (textToSend?: string) => {
    const rawText = (textToSend ?? inputValue).trim();
    if (!rawText || isLoading) return;

    const userMsgId = `user_${Date.now()}`;
    const userMsg: CopilotMessage = {
      id: userMsgId,
      sender: 'user',
      text: rawText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const intermediateMessages = [...messages, userMsg];
    setMessages(intermediateMessages);
    setInputValue('');
    setIsLoading(true);

    try {
      const response: CopilotChatResponse = await sendCopilotChat({
        message: rawText,
        trip_context: {
          destination: trip.destination,
          days_count: trip.daysCount || 3,
          current_day: selectedDay,
          current_slot: 'lunch',
          current_stop_name: `Điểm dừng Ngày ${selectedDay}`,
          saved_ideas: savedIdeas,
        },
      });

      const assistantMsg: CopilotMessage = {
        id: `assistant_${Date.now()}`,
        sender: 'assistant',
        text: response.reply_text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        suggestedPois: response.suggested_pois,
        actionType: response.action_type,
        targetSlot: response.target_slot || 'lunch',
        avoidNotice: response.avoid_notice,
        greenImpactSummary: response.green_impact_summary,
        budgetImpactSummary: response.budget_impact_summary,
        nextSuggestedPrompts: response.next_suggested_prompts,
      };

      const finalMessages = [...intermediateMessages, assistantMsg];
      setMessages(finalMessages);

      if (response.next_suggested_prompts && response.next_suggested_prompts.length > 0) {
        setDynamicPrompts(response.next_suggested_prompts);
      }

      if (onUpdateTrip) {
        onUpdateTrip({
          ...trip,
          copilotChatHistory: finalMessages,
        });
      }
    } catch (error) {
      console.error('Failed to call copilot API:', error);
      const fallbackMsg: CopilotMessage = {
        id: `assistant_err_${Date.now()}`,
        sender: 'assistant',
        text: 'Rất tiếc, chưa nhận được phản hồi từ máy chủ. Bạn vui lòng thử lại sau giây lát nhé.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      const finalErrMessages = [...intermediateMessages, fallbackMsg];
      setMessages(finalErrMessages);
      if (onUpdateTrip) {
        onUpdateTrip({
          ...trip,
          copilotChatHistory: finalErrMessages,
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetChat = () => {
    const freshMessages: CopilotMessage[] = buildDefaultMindtripConversation(
      trip.destination || 'Đà Nẵng & Huế',
      trip.daysCount || 4,
      trip.peopleCount || 2,
      trip.prompt
    );
    setMessages(freshMessages);
    setSwappedPoiIds({});
    setDynamicPrompts([]);
    if (onUpdateTrip) {
      onUpdateTrip({
        ...trip,
        copilotChatHistory: freshMessages,
      });
    }
  };

  const handleApplySwap = (poi: CopilotSuggestedPoi, slot = 'lunch') => {
    if (onApplySwapStop) {
      onApplySwapStop(selectedDay, slot, poi);
    }
    setSwappedPoiIds((prev) => ({ ...prev, [poi.id]: true }));
  };

  const totalDays = trip.daysCount || 3;

  const content = (
    <section
      aria-label="Trợ lý hành trình AI"
      className={
        inline
          ? 'w-full h-full bg-white flex flex-col overflow-hidden'
          : 'w-full sm:w-[500px] md:w-[535px] h-full bg-white flex flex-col shadow-2xl border-l border-neutral-200 relative animate-fadeIn'
      }
    >
      {/* Sleek Minimal Header chuẩn MindTrip */}
      <header className="px-5 py-2.5 border-b border-gray-100 flex items-center justify-between bg-white shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-black text-white flex items-center justify-center shrink-0">
            <Sparkles size={12} className="text-white" />
          </div>
          <span className="font-bold text-[13.5px] text-neutral-900 tracking-tight">Đoạn chat (1) • Trợ lý AI</span>
          <span className="text-neutral-300">•</span>

          {/* Compact Day Context Selector */}
          <div className="relative inline-flex items-center">
            <select
              value={selectedDay}
              onChange={(e) => setSelectedDay(Number(e.target.value))}
              className="appearance-none bg-neutral-100 hover:bg-neutral-200/80 text-neutral-800 text-[11.5px] font-semibold pl-2.5 pr-6 py-1 rounded-full cursor-pointer focus:outline-none transition border-none"
              aria-label="Chọn ngày trong lịch trình"
            >
              {Array.from({ length: totalDays }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  Ngày {d} / {totalDays}
                </option>
              ))}
            </select>
            <ChevronDown size={11} className="absolute right-2 text-neutral-500 pointer-events-none" />
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleResetChat}
            className="w-7 h-7 rounded-full flex items-center justify-center text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 transition cursor-pointer active:scale-95"
            title="Làm mới hội thoại"
            aria-label="Làm mới hội thoại"
          >
            <RotateCcw size={13} />
          </button>
          {!inline && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="w-7 h-7 rounded-full flex items-center justify-center text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 transition cursor-pointer"
              title="Đóng"
              aria-label="Đóng"
            >
              <X size={15} />
            </button>
          )}
        </div>
      </header>

      {/* Message Stream: Seamless Editorial Flow chuẩn MindTrip */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4 auto-hide-scrollbar overscroll-contain bg-white">
        <div className="max-w-[620px] mx-auto w-full space-y-4">
        {messages.map((msg) => {
          const isUser = msg.sender === 'user';
          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-full my-1`}
            >
              {isUser ? (
                /* User Message: Sleek Modern Dark Pill */
                <div className="px-4 py-2.5 rounded-[22px] bg-neutral-900 text-white text-[13.5px] leading-relaxed max-w-[85%] shadow-2xs">
                  <p className="whitespace-pre-line">{msg.text}</p>
                </div>
              ) : (
                /* Assistant Message: Editorial Typography with Mindtrip Sparkle Icon */
                <div className="w-full text-neutral-900 space-y-2.5">
                  <div className="flex items-start gap-2.5">
                    <div className="w-6 h-6 rounded-full bg-black text-white flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
                      <Sparkles size={12} className="text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      {/* Mindtrip Thinking Process Accordion */}
                      {msg.thinkingProcess && (
                        <div className="mb-2">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedThinking((prev) => ({ ...prev, [msg.id]: !prev[msg.id] }))
                            }
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-neutral-100 hover:bg-neutral-200/80 text-[11px] font-semibold text-neutral-700 transition cursor-pointer border border-neutral-200/60"
                          >
                            <Sparkles size={11} className="text-amber-500 shrink-0" />
                            <span>Đã suy nghĩ trong {msg.thinkingDuration || '2.8s'}</span>
                            <ChevronDown
                              size={11}
                              className={`transition-transform duration-200 text-neutral-500 ${
                                expandedThinking[msg.id] ? 'rotate-180' : ''
                              }`}
                            />
                          </button>
                          {expandedThinking[msg.id] && (
                            <div className="mt-2 p-3 rounded-xl bg-neutral-50 border border-neutral-200/70 text-[12px] text-neutral-600 leading-relaxed space-y-1 font-mono">
                              <p className="whitespace-pre-line">{msg.thinkingProcess}</p>
                            </div>
                          )}
                        </div>
                      )}

                      <FormattedCopilotMessage text={msg.text} />
                    </div>
                  </div>

                  {/* Mindtrip Quick Budget Table */}
                  {msg.budgetSummary && (
                    <div className="my-3 p-3.5 rounded-2xl bg-gradient-to-br from-amber-50/70 via-white to-emerald-50/70 border border-amber-200/60 shadow-2xs">
                      <div className="flex items-center gap-1.5 font-bold text-[12.5px] text-neutral-900 mb-2.5">
                        <Coins size={14} className="text-amber-600" />
                        <span>Khung ngân sách nhanh (ước tính / người / {trip.daysCount || 4} ngày)</span>
                      </div>
                      <div className="space-y-1.5 text-[12px] text-neutral-700">
                        <div className="flex items-center justify-between pb-1 border-b border-neutral-100">
                          <span className="flex items-center gap-1 text-neutral-600">
                            <span>🏨</span> Lưu trú (chia đôi phòng):
                          </span>
                          <span className="font-semibold text-neutral-900 font-mono">{msg.budgetSummary.lodging}</span>
                        </div>
                        <div className="flex items-center justify-between pb-1 border-b border-neutral-100">
                          <span className="flex items-center gap-1 text-neutral-600">
                            <span>🍲</span> Ăn uống địa phương:
                          </span>
                          <span className="font-semibold text-neutral-900 font-mono">{msg.budgetSummary.dining}</span>
                        </div>
                        <div className="flex items-center justify-between pb-1 border-b border-neutral-100">
                          <span className="flex items-center gap-1 text-neutral-600">
                            <span>🎟️</span> Vé tham quan:
                          </span>
                          <span className="font-semibold text-neutral-900 font-mono">{msg.budgetSummary.tickets}</span>
                        </div>
                        <div className="flex items-center justify-between pb-1 border-b border-neutral-100">
                          <span className="flex items-center gap-1 text-neutral-600">
                            <span>🚆</span> Di chuyển nội vùng + tàu:
                          </span>
                          <span className="font-semibold text-neutral-900 font-mono">{msg.budgetSummary.transit}</span>
                        </div>
                        <div className="pt-2 flex items-center justify-between font-bold text-[12.5px] text-emerald-900">
                          <span>Tổng mục tiêu:</span>
                          <span className="font-mono text-emerald-800">{msg.budgetSummary.totalTarget}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Mindtrip Day-by-Day Itinerary Summary List (Chuẩn 100% Ảnh Mindtrip) */}
                  {msg.dayNarratives && msg.dayNarratives.length > 0 && (
                    <div className="my-3.5 divide-y divide-gray-100 border-y border-gray-100 bg-white">
                      {msg.dayNarratives.map((dayNar) => {
                        const dayOutline = trip.itineraryOutline?.find((d) => d.day === dayNar.day);
                        const thumbImg =
                          dayNar.image ||
                          dayOutline?.stops?.[0]?.image ||
                          'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=400&auto=format&fit=crop&q=80';
                        const dayTitle =
                          dayNar.title.replace(/^Day \d+\s*[-—:]*\s*/, '') ||
                          dayOutline?.theme ||
                          `Khám phá Ngày ${dayNar.day}`;
                        const expCount =
                          dayNar.experienceCount ||
                          dayOutline?.stops?.length ||
                          dayNar.items?.length ||
                          4;
                        const highlightText =
                          dayNar.highlights ||
                          dayOutline?.stops?.map((s: { name: string }) => s.name).join(' • ') ||
                          dayNar.items?.map((it) => it.slotTitle.replace(/^(\d+\)\s*|[^\w\s]+\s*)/g, '')).join(' • ');
                        const dateText = dayNar.dateText || `Day ${dayNar.day}`;
                        const tempText = dayNar.weatherTemp || '27°C';
                        const weatherIcon =
                          dayNar.weatherCondition === 'sun'
                            ? '☀️'
                            : dayNar.weatherCondition === 'cloud'
                            ? '⛅'
                            : '🌧️';

                        return (
                          <div
                            key={dayNar.day}
                            onClick={() => {
                              setSelectedDay(dayNar.day);
                              if (onSelectDay) {
                                onSelectDay(dayNar.day);
                              }
                              const el = document.getElementById(`copilot-day-card-${dayNar.day}`);
                              if (el) {
                                el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                              }
                            }}
                            className="py-3 px-1.5 flex items-start gap-3.5 hover:bg-neutral-50/90 rounded-xl transition cursor-pointer group text-left select-none"
                            title={`Bấm để chuyển nhanh sang lịch trình Ngày ${dayNar.day}`}
                          >
                            {/* 1. Square Thumbnail with rounded corners */}
                            <div className="w-14 h-14 sm:w-16 sm:h-16 min-w-[56px] min-h-[56px] sm:min-w-[64px] sm:min-h-[64px] rounded-xl overflow-hidden bg-neutral-100 shrink-0 border border-neutral-200/60 shadow-2xs">
                              <img
                                src={thumbImg}
                                alt={dayTitle}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                onError={(e) => {
                                  e.currentTarget.src =
                                    'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=400&auto=format&fit=crop&q=80';
                                }}
                              />
                            </div>

                            {/* 2. Middle Content */}
                            <div className="flex-1 min-w-0">
                              {/* Top line: Day & Date • Weather • Experiences */}
                              <div className="flex items-center gap-1.5 text-[12px] sm:text-[12.5px] font-semibold text-purple-700">
                                <span>{dateText}</span>
                                <span className="text-neutral-300 font-normal">•</span>
                                <span className="inline-flex items-center gap-1 underline decoration-neutral-300 underline-offset-2 group-hover:decoration-purple-500 transition-colors">
                                  <span>{weatherIcon}</span>
                                  <span>{tempText}</span>
                                </span>
                                <span className="text-neutral-300 font-normal">•</span>
                                <span className="text-neutral-600 font-normal">{expCount} Experiences</span>
                              </div>

                              {/* Main Title: Theme */}
                              <h4 className="font-bold text-[14px] sm:text-[14.5px] text-neutral-950 group-hover:text-purple-700 transition-colors leading-snug mt-0.5 line-clamp-1">
                                {dayTitle}
                              </h4>

                              {/* Bottom line: Highlights sequence separated by middle dots */}
                              <p className="text-[12px] sm:text-[12.5px] text-neutral-500 line-clamp-2 leading-relaxed mt-0.5">
                                {highlightText}
                              </p>
                            </div>

                            {/* 3. Chevron Right */}
                            <div className="shrink-0 self-center pl-1 text-neutral-400 group-hover:text-neutral-900 group-hover:translate-x-0.5 transition-all">
                              <ChevronRight size={16} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Mindtrip Day-by-day Rich Narratives (Thông tin chi tiết từng ngày với từng hoạt động, di chuyển, chi phí, lý do & chuẩn xanh) */}
                  {msg.dayNarratives && msg.dayNarratives.length > 0 && (
                    <div className="my-4 space-y-4">
                      {msg.dayNarratives.map((dayNar) => (
                        <div
                          key={`detail-${dayNar.day}`}
                          id={`copilot-day-card-${dayNar.day}`}
                          className="p-3.5 rounded-2xl bg-neutral-50/80 border border-neutral-200/70 shadow-2xs"
                        >
                          <h4 className="font-bold text-[13.5px] text-neutral-950 mb-1 flex items-center gap-1.5">
                            <span>
                              {dayNar.title.startsWith('Day ')
                                ? dayNar.title
                                : `Day ${dayNar.day} — ${dayNar.title}`}
                            </span>
                          </h4>
                          {dayNar.intro && (
                            <p className="text-[12px] text-neutral-600 italic mb-2.5">
                              "{dayNar.intro}"
                            </p>
                          )}
                          <div className="space-y-2.5">
                            {dayNar.items &&
                              dayNar.items.map((item, itIdx) => (
                                <div
                                  key={itIdx}
                                  className="p-3 rounded-xl bg-white border border-neutral-200/60 shadow-2xs text-[12px] space-y-1.5"
                                >
                                  <div className="font-bold text-[12.5px] text-neutral-900">
                                    {item.slotTitle}
                                  </div>
                                  {item.transit && (
                                    <div className="flex items-start gap-1.5 text-neutral-600">
                                      <span className="font-semibold text-neutral-800 shrink-0">
                                        📍 Di chuyển:
                                      </span>
                                      <span>{item.transit}</span>
                                    </div>
                                  )}
                                  {item.cost && (
                                    <div className="flex items-start gap-1.5 text-neutral-600">
                                      <span className="font-semibold text-neutral-800 shrink-0">
                                        💸 Chi phí:
                                      </span>
                                      <span className="font-mono text-neutral-800">{item.cost}</span>
                                    </div>
                                  )}
                                  {item.reason && (
                                    <div className="flex items-start gap-1.5 text-neutral-700">
                                      <span className="font-semibold text-emerald-900 shrink-0">
                                        ✅ Lý do:
                                      </span>
                                      <span>{item.reason}</span>
                                    </div>
                                  )}
                                  {item.greenImpact && (
                                    <div className="flex items-start gap-1.5 text-emerald-800 pt-1 border-t border-neutral-100">
                                      <span className="font-semibold shrink-0">🌱 Chuẩn xanh:</span>
                                      <span>{item.greenImpact}</span>
                                    </div>
                                  )}
                                </div>
                              ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Inline Avoid Notice */}
                  {msg.avoidNotice && (
                    <div className="mt-2.5 pt-2.5 border-t border-neutral-100 flex items-start gap-2 text-[12px] text-amber-900 leading-normal">
                      <AlertTriangle size={13} className="text-amber-600 shrink-0 mt-0.5" />
                      <span>
                        <strong className="font-semibold text-amber-950">Lưu ý an toàn:</strong>{' '}
                        {msg.avoidNotice}
                      </span>
                    </div>
                  )}

                  {/* Inline Green Impact */}
                  {msg.greenImpactSummary && (
                    <div className="mt-2 flex items-start gap-2 text-[12px] text-emerald-900 leading-normal">
                      <Leaf size={13} className="text-emerald-700 shrink-0 mt-0.5" />
                      <span>
                        <strong className="font-semibold text-emerald-950">Tác động xanh:</strong>{' '}
                        {msg.greenImpactSummary}
                      </span>
                    </div>
                  )}

                  {/* Inline Budget Impact */}
                  {msg.budgetImpactSummary && (
                    <div className="mt-2 flex items-start gap-2 text-[12px] text-neutral-700 leading-normal">
                      <span className="font-semibold text-neutral-900 shrink-0">Ngân sách:</span>
                      <span>{msg.budgetImpactSummary}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Mindtrip Visual Carousel for Suggested POIs (Ảnh 1 & Ảnh 3) */}
              {!isUser && msg.suggestedPois && msg.suggestedPois.length > 0 && (
                <div className="w-full mt-3">
                  <div className="flex items-stretch gap-3 overflow-x-auto auto-hide-scrollbar pb-2 pt-1 -mx-1 px-1 snap-x snap-mandatory">
                    {msg.suggestedPois.map((poi) => {
                      const isSwapped = !!swappedPoiIds[poi.id];
                      const isAddedToTrip = isSwapped || savedIdeas.includes(poi.id);
                      const isFavorited = savedIdeas.includes(poi.id);

                      return (
                        <div
                          key={poi.id}
                          onClick={() => {
                            if (onHighlightOnMap) onHighlightOnMap(poi.id);
                            if (onViewPoiDetail) onViewPoiDetail(poi.id);
                          }}
                          className="w-[235px] sm:w-[245px] min-w-[235px] shrink-0 flex flex-col group cursor-pointer text-left select-none snap-start"
                        >
                          {/* Visual Photo Card (Aspect Ratio 4:5 with Floating Round Actions) */}
                          <div className="relative aspect-[4/5] w-full rounded-2xl overflow-hidden bg-neutral-100 shadow-2xs border border-neutral-100">
                            <img
                              src={poi.image_url}
                              alt={poi.name}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                              onError={(e) => {
                                e.currentTarget.src =
                                  'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=400&auto=format&fit=crop&q=80';
                              }}
                            />

                            {/* Subtle dark gradient scrim for contrast */}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/20 pointer-events-none" />

                            {/* Heart Button (Top Left) - Save to Ideas */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (onUpdateTrip) {
                                  const nextIdeas = savedIdeas.includes(poi.id)
                                    ? savedIdeas.filter((id) => id !== poi.id)
                                    : [...savedIdeas, poi.id];
                                  onUpdateTrip({ ...trip, ideas: nextIdeas });
                                }
                              }}
                              className={`absolute top-2.5 left-2.5 w-7 h-7 rounded-full flex items-center justify-center transition active:scale-90 cursor-pointer z-10 ${
                                isFavorited
                                  ? 'bg-red-500 text-white shadow-xs'
                                  : 'bg-black/40 hover:bg-black/60 backdrop-blur-xs text-white'
                              }`}
                              title={isFavorited ? 'Bỏ lưu' : 'Lưu vào ý tưởng'}
                            >
                              <Heart size={14} className={isFavorited ? 'fill-white text-white' : 'text-white'} />
                            </button>

                            {/* Plus Button (Top Right) - Add to Trip */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                const slot =
                                  msg.targetSlot ||
                                  (poi.category.toLowerCase().includes('ẩm thực')
                                    ? 'lunch'
                                    : poi.category.toLowerCase().includes('cafe')
                                    ? 'afternoon'
                                    : 'morning');
                                handleApplySwap(poi, slot);
                              }}
                              disabled={isAddedToTrip}
                              className={`absolute top-2.5 right-2.5 w-7 h-7 rounded-full flex items-center justify-center transition active:scale-90 cursor-pointer z-10 ${
                                isAddedToTrip
                                  ? 'bg-emerald-600 text-white shadow-xs cursor-default'
                                  : 'bg-black/40 hover:bg-black/60 backdrop-blur-xs text-white'
                              }`}
                              title={isAddedToTrip ? `Đã thêm vào Ngày ${selectedDay}` : `Thêm vào Ngày ${selectedDay}`}
                            >
                              {isAddedToTrip ? (
                                <Check size={14} strokeWidth={2.5} />
                              ) : (
                                <Plus size={14} strokeWidth={2.5} />
                              )}
                            </button>

                            {/* Info Icon (Bottom Right) */}
                            <div className="absolute bottom-2.5 right-2.5 text-white/80 drop-shadow-xs pointer-events-none">
                              <Info size={13} />
                            </div>

                            {/* Green Score Badge (Bottom Left) */}
                            <div className="absolute bottom-2.5 left-2.5 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-xs text-[10px] font-bold text-white flex items-center gap-1">
                              <Leaf size={10} className="text-emerald-400" />
                              <span>{poi.green_score}/100</span>
                            </div>
                          </div>

                          {/* Below Card Details */}
                          <div className="mt-2 min-w-0">
                            <h4 className="font-bold text-[13.5px] text-neutral-950 truncate leading-snug group-hover:text-emerald-950" title={poi.name}>
                              {poi.name}
                            </h4>
                            <div className="flex items-center gap-1.5 text-[11.5px] text-neutral-500 mt-0.5">
                              <span className="capitalize">{poi.category}</span>
                              <span>•</span>
                              <span className="flex items-center text-amber-500 font-medium">
                                <Star size={10} className="fill-amber-500 mr-0.5" />
                                {poi.rating.toFixed(1)}
                              </span>
                            </div>
                            {/* Community note / Saved proof */}
                            <div className="text-[11px] text-neutral-500 flex items-center gap-1 mt-1 truncate">
                              <span className="text-red-500">❤</span>
                              <span className="truncate">Được đề xuất bởi GreenTrip AI</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Mindtrip Guidance Tip */}
                  <div className="flex items-center gap-1.5 text-[11px] text-neutral-500 mt-2 px-1">
                    <Sparkles size={11} className="text-emerald-700 shrink-0" />
                    <span>Bấm ♡ để lưu vào danh sách ý tưởng hoặc ⊕ để đưa ngay vào lịch trình Ngày {selectedDay}.</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Clean Loading Indicator */}
        {isLoading && (
          <div className="flex items-center gap-2 px-3 py-2 text-[12px] text-neutral-500">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
            <span>Đang tìm kiếm gợi ý phù hợp...</span>
          </div>
        )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Dynamic & Quick Suggestion Chips (Minimalist pill bar) */}
      <div className="px-4 py-2 bg-white border-t border-gray-100 shrink-0">
        <div className="max-w-[620px] mx-auto w-full">
          <div className="flex items-center gap-1.5 overflow-x-auto auto-hide-scrollbar pb-0.5">
          {dynamicPrompts.length > 0
            ? dynamicPrompts.map((promptText, pIdx) => (
                <button
                  key={pIdx}
                  type="button"
                  onClick={() => handleSendMessage(promptText)}
                  disabled={isLoading}
                  className="px-3 py-1.5 rounded-full text-[12px] font-medium bg-neutral-100 hover:bg-neutral-200/80 text-neutral-800 transition cursor-pointer shrink-0 disabled:opacity-50"
                >
                  {promptText}
                </button>
              ))
            : DEFAULT_PROMPT_CHIPS.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => handleSendMessage(chip.prompt)}
                  disabled={isLoading}
                  className="px-3 py-1.5 rounded-full text-[12px] font-medium bg-neutral-100 hover:bg-neutral-200/80 text-neutral-800 transition cursor-pointer shrink-0 disabled:opacity-50"
                >
                  {chip.label}
                </button>
              ))}
          </div>
        </div>
      </div>

      {/* Floating Pill Input Box (Chuẩn MindTrip AI) */}
      <footer className="px-4 pb-3 pt-1 bg-white shrink-0">
        <div className="max-w-[620px] mx-auto w-full">
          <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="relative flex items-center bg-white rounded-[26px] border border-neutral-200/90 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.06)] hover:border-neutral-300 focus-within:border-neutral-900 focus-within:shadow-[0_6px_24px_-2px_rgba(0,0,0,0.1)] transition-all px-2.5 py-1.5 gap-2"
        >
          {/* Plus Action Button (Left) */}
          <button
            type="button"
            onClick={() => {
              if (dynamicPrompts.length > 0) {
                handleSendMessage(dynamicPrompts[0]);
              } else {
                setInputValue('Gợi ý cho tôi thêm địa điểm đặc sắc');
              }
            }}
            className="w-8 h-8 rounded-full bg-neutral-100 hover:bg-neutral-200 text-neutral-700 flex items-center justify-center transition active:scale-95 cursor-pointer shrink-0"
            title="Thêm gợi ý nhanh"
          >
            <Plus size={16} strokeWidth={2.5} />
          </button>

          {/* Text Input */}
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Bắt đầu một cuộc trò chuyện mới cho chuyến đi này..."
            disabled={isLoading}
            className="flex-1 text-[13.5px] text-neutral-900 placeholder:text-neutral-400 bg-transparent focus:outline-none py-1"
            aria-label="Ask GreenTrip"
          />

          <button
            type="button"
            onClick={() => {
              handleSendMessage('Tư vấn phương tiện di chuyển xanh tiết kiệm CO2 cho chuyến đi');
            }}
            className="w-8 h-8 rounded-full hover:bg-neutral-100 text-neutral-500 hover:text-emerald-700 flex items-center justify-center transition active:scale-95 cursor-pointer shrink-0"
            title="Phương tiện di chuyển xanh"
          >
            <Car size={16} />
          </button>

          {/* Microphone Icon Button */}
          <button
            type="button"
            onClick={() => {
              setInputValue('Tìm quán cafe view đẹp ngắm hoàng hôn');
            }}
            className="w-8 h-8 rounded-full hover:bg-neutral-100 text-neutral-500 hover:text-black flex items-center justify-center transition active:scale-95 cursor-pointer shrink-0"
            title="Nhập giọng nói"
          >
            <Mic size={16} />
          </button>

          {/* Audio Waveform Voice Pill (When empty) OR Send Arrow (When typing) */}
          {inputValue.trim() ? (
            <button
              type="submit"
              disabled={isLoading}
              className="w-8 h-8 rounded-full bg-neutral-950 text-white flex items-center justify-center transition hover:bg-black active:scale-95 cursor-pointer shrink-0 shadow-2xs"
              title="Gửi câu hỏi"
            >
              <ArrowUp size={16} strokeWidth={2.5} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                handleSendMessage('Hãy tóm tắt trải nghiệm nổi bật của ngày này');
              }}
              className="w-8 h-8 rounded-full bg-neutral-950 text-white flex items-center justify-center transition hover:bg-black active:scale-95 cursor-pointer shrink-0 shadow-2xs"
              title="Chế độ giọng nói tương tác AI"
            >
              <AudioWaveform size={15} />
            </button>
          )}
        </form>

          {/* Mindtrip Disclaimer */}
          <p className="text-center text-[11px] text-neutral-400 mt-2 select-none">
            GreenTrip can make mistakes. Check important info.
          </p>
        </div>
      </footer>
    </section>
  );

  if (inline) {
    return content;
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/25 backdrop-blur-2xs animate-fadeIn">
      <div className="flex-1 h-full" onClick={onClose} aria-label="Đóng cửa sổ trợ lý" />
      {content}
    </div>
  );
};

export default PlannerCopilotDrawer;
