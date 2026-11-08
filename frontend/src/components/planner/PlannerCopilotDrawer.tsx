import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  RotateCcw,
  Star,
  Leaf,
  Check,
  AlertTriangle,
  ChevronDown,
  X,
} from 'lucide-react';
import type { UserTrip } from '@/pages/ExplorePage';
import {
  sendCopilotChat,
  type CopilotSuggestedPoi,
  type CopilotChatResponse,
} from '@/services/copilotService';

export interface CopilotMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  suggestedPois?: CopilotSuggestedPoi[];
  actionType?: 'replace_stop' | 'add_stop' | 'none' | string;
  targetSlot?: string | null;
  avoidNotice?: string | null;
  greenImpactSummary?: string | null;
  budgetImpactSummary?: string | null;
  nextSuggestedPrompts?: string[];
}

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
}

const DEFAULT_PROMPT_CHIPS = [
  {
    id: 'late_adjust',
    label: 'Trễ giờ, tối ưu chiều nay',
    prompt: 'Tôi đang bị trễ 45 phút, gợi ý cách tối ưu lịch trình chiều nay gọn hơn và không bị ngược đường?',
  },
  {
    id: 'swap_veg',
    label: 'Đổi quán trưa sang món chay',
    prompt: 'Tôi muốn đổi quán ăn trưa sang quán ăn chay thanh tịnh',
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
  {
    id: 'green_exp',
    label: 'Điểm văn hóa sinh thái',
    prompt: 'Gợi ý các điểm tham quan văn hóa đạt chuẩn sinh thái cao nhất',
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
}) => {
  const [selectedDay, setSelectedDay] = useState<number>(activeDayIndex || 1);
  const [messages, setMessages] = useState<CopilotMessage[]>(() => {
    if (Array.isArray(trip.copilotChatHistory) && trip.copilotChatHistory.length > 0) {
      return trip.copilotChatHistory;
    }
    return [
      {
        id: 'welcome_1',
        sender: 'assistant',
        text: `Chào bạn! Mình có thể hỗ trợ bạn điều chỉnh quán ăn sang món chay, gợi ý điểm trú mưa văn hóa hoặc tối ưu lịch trình cho chuyến đi ${trip.destination}.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ];
  });
  const [inputValue, setInputValue] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [swappedPoiIds, setSwappedPoiIds] = useState<Record<string, boolean>>({});
  const [dynamicPrompts, setDynamicPrompts] = useState<string[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (inline || isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, inline, isLoading]);

  // Focus input when mounted or opened
  useEffect(() => {
    if (inline || isOpen) {
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
    const freshMessages: CopilotMessage[] = [
      {
        id: `welcome_${Date.now()}`,
        sender: 'assistant',
        text: `Đã làm mới cuộc trò chuyện cho ${trip.destination}. Bạn muốn điều chỉnh gì cho lịch trình?`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ];
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
          ? 'w-full h-full max-h-[calc(100vh-230px)] min-h-[580px] bg-white flex flex-col rounded-2xl border border-neutral-200/80 overflow-hidden'
          : 'w-full sm:w-[450px] md:w-[480px] h-full bg-white flex flex-col shadow-xl border-l border-neutral-200/80 relative animate-fadeIn'
      }
    >
      {/* Sleek Minimal Header */}
      <header className="px-4 py-3 border-b border-neutral-100 flex items-center justify-between bg-white shrink-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-[14px] text-neutral-900">Trợ lý hành trình</span>
          <span className="text-neutral-300">•</span>

          {/* Compact Day Context Selector */}
          <div className="relative inline-flex items-center">
            <select
              value={selectedDay}
              onChange={(e) => setSelectedDay(Number(e.target.value))}
              className="appearance-none bg-neutral-100 hover:bg-neutral-200/70 text-neutral-800 text-[12px] font-medium pl-2.5 pr-6 py-1 rounded-full cursor-pointer focus:outline-none transition border-none"
              aria-label="Chọn ngày trong lịch trình"
            >
              {Array.from({ length: totalDays }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  Ngày {d} / {totalDays}
                </option>
              ))}
            </select>
            <ChevronDown size={12} className="absolute right-2 text-neutral-500 pointer-events-none" />
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleResetChat}
            className="w-7 h-7 rounded-full flex items-center justify-center text-neutral-400 hover:text-neutral-800 hover:bg-neutral-100 transition cursor-pointer"
            title="Làm mới hội thoại"
            aria-label="Làm mới hội thoại"
          >
            <RotateCcw size={13} />
          </button>
          {!inline && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="w-7 h-7 rounded-full flex items-center justify-center text-neutral-400 hover:text-neutral-800 hover:bg-neutral-100 transition cursor-pointer"
              title="Đóng"
              aria-label="Đóng"
            >
              <X size={15} />
            </button>
          )}
        </div>
      </header>

      {/* Message Stream */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5 auto-hide-scrollbar overscroll-contain bg-neutral-50/40">
        {messages.map((msg) => {
          const isUser = msg.sender === 'user';
          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-full`}
            >
              {/* Message Bubble */}
              <div
                className={`p-3.5 rounded-2xl text-[13px] leading-relaxed max-w-[90%] ${
                  isUser
                    ? 'bg-neutral-900 text-white rounded-br-xs'
                    : 'bg-white text-neutral-800 border border-neutral-200/80 rounded-bl-xs'
                }`}
              >
                <p className="whitespace-pre-line">{msg.text}</p>

                {/* Inline Avoid Notice (No noisy nested boxes) */}
                {msg.avoidNotice && (
                  <div className="mt-2.5 pt-2.5 border-t border-neutral-100 flex items-start gap-2 text-[12px] text-amber-900 leading-normal">
                    <AlertTriangle size={13} className="text-amber-600 shrink-0 mt-0.5" />
                    <span>
                      <strong className="font-semibold text-amber-950">Lưu ý an toàn:</strong>{' '}
                      {msg.avoidNotice}
                    </span>
                  </div>
                )}

                {/* Inline Green Impact (No noisy nested boxes) */}
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

              {/* Timestamp */}
              <span className="text-[10.5px] text-neutral-400 mt-1 px-1">{msg.timestamp}</span>

              {/* Suggested POIs: Flat, elegant, single-primary-action */}
              {!isUser && msg.suggestedPois && msg.suggestedPois.length > 0 && (
                <div className="w-full mt-2.5 space-y-2">
                  {msg.suggestedPois.map((poi) => {
                    const isSwapped = !!swappedPoiIds[poi.id];
                    return (
                      <div
                        key={poi.id}
                        onClick={() => {
                          if (onHighlightOnMap) onHighlightOnMap(poi.id);
                          if (onViewPoiDetail) onViewPoiDetail(poi.id);
                        }}
                        className="p-3 rounded-xl bg-white border border-neutral-200/80 hover:border-neutral-400 transition flex items-center justify-between gap-3 group cursor-pointer"
                        title="Bấm để xem trên bản đồ và mở chi tiết"
                      >
                        {/* Thumbnail & Basic Info */}
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <img
                            src={poi.image_url}
                            alt={poi.name}
                            className="w-14 h-14 min-w-[56px] min-h-[56px] max-w-[56px] max-h-[56px] rounded-lg object-cover bg-neutral-100 shrink-0 group-hover:opacity-90 transition-opacity"
                            onError={(e) => {
                              e.currentTarget.src =
                                'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=300&auto=format&fit=crop&q=80';
                            }}
                          />

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <h4 className="font-semibold text-[13.5px] text-neutral-900 truncate group-hover:text-emerald-900 transition-colors">
                                {poi.name}
                              </h4>
                              <span className="inline-flex items-center text-[10.5px] font-semibold px-1.5 py-0.2 rounded-full bg-emerald-50 text-emerald-800 shrink-0">
                                {poi.green_score}/100
                              </span>
                            </div>

                            <div className="flex items-center gap-2 text-[11.5px] text-neutral-500 truncate">
                              <span className="flex items-center text-amber-500 font-medium">
                                <Star size={10} className="fill-amber-500 mr-0.5" />
                                {poi.rating.toFixed(1)}
                              </span>
                              <span>•</span>
                              <span className="truncate">{poi.category}</span>
                              {poi.distance_info && (
                                <>
                                  <span>•</span>
                                  <span className="truncate">{poi.distance_info}</span>
                                </>
                              )}
                            </div>

                            {/* Budget & Eco Impact Line */}
                            {(poi.price_range_display || poi.budget_delta || poi.carbon_saved) && (
                              <div className="flex items-center gap-1.5 text-[11px] text-neutral-500 mt-0.5 truncate">
                                {poi.price_range_display && (
                                  <span className="font-medium text-neutral-700 truncate">{poi.price_range_display}</span>
                                )}
                                {poi.budget_delta && (
                                  <>
                                    <span>•</span>
                                    <span className="text-emerald-700 font-medium truncate">{poi.budget_delta}</span>
                                  </>
                                )}
                                {poi.carbon_saved && (
                                  <>
                                    <span>•</span>
                                    <span className="text-neutral-500 truncate">{poi.carbon_saved}</span>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Single Primary Action Button */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleApplySwap(poi, msg.targetSlot || 'lunch');
                          }}
                          disabled={isSwapped}
                          className={`h-8 px-3 rounded-lg text-[12px] font-semibold shrink-0 transition active:scale-95 cursor-pointer flex items-center gap-1 ${
                            isSwapped
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200/80 cursor-default'
                              : 'bg-neutral-900 hover:bg-neutral-800 text-white'
                          }`}
                        >
                          {isSwapped ? (
                            <>
                              <Check size={12} strokeWidth={2.5} />
                              <span>Đã chọn</span>
                            </>
                          ) : (
                            <span>Thay thế</span>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* Clean Loading Indicator (Exponential ease, no bouncing) */}
        {isLoading && (
          <div className="flex items-center gap-2 px-3 py-2 text-[12px] text-neutral-500">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
            <span>Đang tìm kiếm gợi ý phù hợp...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Dynamic & Quick Suggestion Chips (Minimalist, no uppercase eyebrows) */}
      <div className="p-3 bg-white border-t border-neutral-100 shrink-0">
        <div className="flex items-center gap-1.5 overflow-x-auto auto-hide-scrollbar">
          {dynamicPrompts.length > 0
            ? dynamicPrompts.map((promptText, pIdx) => (
                <button
                  key={pIdx}
                  type="button"
                  onClick={() => handleSendMessage(promptText)}
                  disabled={isLoading}
                  className="px-3 py-1.5 rounded-full text-[12px] font-medium bg-neutral-100 hover:bg-neutral-200/70 text-neutral-800 transition cursor-pointer shrink-0 disabled:opacity-50"
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
                  className="px-3 py-1.5 rounded-full text-[12px] font-medium bg-neutral-100 hover:bg-neutral-200/70 text-neutral-800 transition cursor-pointer shrink-0 disabled:opacity-50"
                >
                  {chip.label}
                </button>
              ))}
        </div>
      </div>

      {/* Purpose-built Input Form (Clean, no fake/decorative buttons) */}
      <footer className="p-3 bg-white border-t border-neutral-100 shrink-0">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex items-center gap-2 rounded-xl border border-neutral-200 focus-within:border-neutral-800 px-3 py-2 bg-neutral-50/50 focus-within:bg-white transition"
        >
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={`Hỏi về món ăn, thời tiết, tối ưu lịch trình Ngày ${selectedDay}...`}
            disabled={isLoading}
            className="flex-1 text-[13px] text-neutral-900 placeholder:text-neutral-400 bg-transparent focus:outline-none disabled:opacity-50"
            aria-label="Nhập câu hỏi cho trợ lý AI"
          />
          <button
            type="submit"
            disabled={!inputValue.trim() || isLoading}
            className="w-7 h-7 rounded-lg bg-neutral-900 hover:bg-black disabled:bg-neutral-200 text-white disabled:text-neutral-400 flex items-center justify-center transition active:scale-95 cursor-pointer shrink-0"
            title="Gửi câu hỏi"
            aria-label="Gửi câu hỏi"
          >
            <Send size={12} className="ml-0.5" />
          </button>
        </form>
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
