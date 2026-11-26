import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Compass,
  Leaf,
  Luggage,
  Map as MapIcon,
  Plus,
  ReceiptText,
  RotateCcw,
  Sparkles,
  Star,
  X,
} from 'lucide-react';
import { normalizeCategory, normalizeCity, type Poi } from '@/data/pois';
import PoiImage from '@/components/ui/PoiImage';
import PoiMap from '@/components/poi/PoiMap';
import ExplanationModal from '@/components/poi/ExplanationModal';
import AiStreamingShell from '@/components/planner/AiStreamingShell';
import AiPromptComposer from './AiPromptComposer';
import {
  streamCopilotChat,
  type CopilotExtractedPlace,
  type CopilotReceiptBooking,
  type CopilotSuggestedPoi,
} from '@/services/copilotService';
import { extractTripIntentFromPrompt } from '@/utils/vietnamesePromptExtractor';
import { FormattedCopilotMessage, type CopilotAttachmentSummary } from './TripOverviewView';
import { sanitizeCopilotReplyText } from './copilotMessageMarkdown';
import ChatAttachmentMenu, { AttachmentThumbnail, StagedAttachmentChip } from './ChatAttachmentMenu';
import {
  fileToReadyAttachment,
  getAttachmentPlaceholder,
  getDefaultAttachmentPrompt,
  getPoiGreenScoreExplanation,
  sanitizeQuickReplyChips,
  toAttachmentSummary,
  type ReadyAttachment,
} from './chatAttachmentUtils';
import type { CopilotTripMessage } from './copilotTripData';

interface IdeationMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  attachment?: CopilotAttachmentSummary;
  suggestedPois?: CopilotSuggestedPoi[];
  extractedPlaces?: CopilotExtractedPlace[];
  receiptBooking?: CopilotReceiptBooking | null;
  nextSuggestedPrompts?: string[];
  avoidNotice?: string | null;
  greenImpactSummary?: string | null;
  budgetImpactSummary?: string | null;
}

export interface IdeationChatViewProps {
  allPois: Poi[];
  currentUserName?: string | null;
  initialPrompt?: string | null;
  onConsumedInitialPrompt?: () => void;
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
    estimatedCost: s.estimated_cost ?? 0,
  };
}

export default function IdeationChatView({
  allPois,
  currentUserName,
  initialPrompt,
  onConsumedInitialPrompt,
  onCreateTripFromIdea,
}: IdeationChatViewProps) {
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
  const [streamingText, setStreamingText] = useState('');
  const [streamingStatus, setStreamingStatus] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastFailedPrompt, setLastFailedPrompt] = useState<string | null>(null);
  const [tripMemory, setTripMemory] = useState<Record<string, string>>({});
  const [activeConstraints, setActiveConstraints] = useState<string[]>([]);
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [isSplitMapCollapsed, setIsSplitMapCollapsed] = useState(false);
  const [isAttachMenuOpen, setIsAttachMenuOpen] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState<ReadyAttachment | null>(null);
  const [selectedMapPoiId, setSelectedMapPoiId] = useState<string | null>(null);
  const [hoveredPoiId, setHoveredPoiId] = useState<string | null>(null);
  const [openEcoTipPoiId, setOpenEcoTipPoiId] = useState<string | null>(null);
  const [explanationPoi, setExplanationPoi] = useState<{
    id: string;
    name: string;
    snippet?: string;
  } | null>(null);

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

  useEffect(() => {
    if (initialPrompt && initialPrompt.trim() && !isSending) {
      const promptToRun = initialPrompt.trim();
      onConsumedInitialPrompt?.();
      void handleSend(promptToRun);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPrompt]);

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

  const defaultCentralMapPois = useMemo(() => {
    const valid = allPois.filter(
      (p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && p.lat !== 0 && p.lng !== 0
    );
    const ranked = [...valid].sort((a, b) => (b.ecoScore || 0) - (a.ecoScore || 0) || (b.rating || 0) - (a.rating || 0));
    const daNang = ranked.filter((p) => p.city === 'Đà Nẵng').slice(0, 12);
    const hue = ranked.filter((p) => p.city === 'Huế').slice(0, 12);
    return [...daNang, ...hue].slice(0, 24);
  }, [allPois]);

  const displayedMapPois = mapPois.length > 0 ? mapPois : defaultCentralMapPois;

  const entityLookup = useMemo(
    () => mapPois.map((p) => ({ id: p.id, name: p.name, city: p.city })),
    [mapPois]
  );

  const suggestedPlacesHistory = useMemo(() => {
    const seen = new Set<string>();
    messages.forEach((msg) => {
      if (msg.sender === 'assistant') {
        msg.suggestedPois?.forEach((p) => {
          if (p.name?.trim()) seen.add(p.name.trim());
        });
      }
    });
    return Array.from(seen).slice(-30);
  }, [messages]);

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
    setPendingAttachment(null);
    setErrorMessage(null);
    setLastFailedPrompt(null);
    setTripMemory({});
    setActiveConstraints([]);
    setOpenEcoTipPoiId(null);
    setIsSplitMapCollapsed(false);
  };

  const handleFocusPoiOnMap = (poiId: string) => {
    setSelectedMapPoiId(poiId);
    if (typeof window !== 'undefined' && window.innerWidth >= 1024) {
      setIsSplitMapCollapsed(false);
    } else {
      setIsMapOpen(true);
    }
  };

  const handleSend = async (rawText?: string, readyAttachment?: ReadyAttachment) => {
    const activeAttachment = readyAttachment ?? pendingAttachment ?? undefined;
    const typedText = (rawText ?? input).trim();
    const text = typedText || (activeAttachment ? getDefaultAttachmentPrompt(activeAttachment) : '');
    if ((!text && !activeAttachment) || isSending) return;

    const userMsgId = `idea-u-${Date.now()}`;
    const userMsg: IdeationMessage = {
      id: userMsgId,
      sender: 'user',
      text,
      timestamp: nowHHMM(),
      attachment: activeAttachment ? toAttachmentSummary(activeAttachment) : undefined,
    };

    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    if (!rawText) setInput('');
    setPendingAttachment(null);
    setErrorMessage(null);
    setLastFailedPrompt(null);
    setStreamingText('');
    setStreamingStatus(null);
    setIsSending(true);

    const parsed = extractTripIntentFromPrompt(`${combinedUserText} ${text}`.trim());

    try {
      const res = await streamCopilotChat(
        {
          message: text,
          attachment: activeAttachment?.payload,
          trip_context: {
            mode: 'ideation',
            destination: parsed.destination || 'Đà Nẵng & Huế',
            days_count: parsed.days || 4,
            current_day: 1,
            num_people: parsed.totalGuests || 2,
            companions: parsed.whoDisplay || undefined,
            budget_tier: parsed.budgetTier || 'standard',
            total_budget: parsed.budgetAmountVnd ?? undefined,
            saved_ideas: selectedIdeaPoiIds,
            suggested_places: suggestedPlacesHistory,
            active_constraints: activeConstraints,
            trip_memory: tripMemory,
            conversation_history: nextMessages.slice(-8).map((m) => ({
              role: m.sender,
              content: m.text,
            })),
          },
        },
        {
          onStatus: (statusMsg) => setStreamingStatus(statusMsg),
          onDelta: (chunk) => setStreamingText((prev) => prev + chunk),
        }
      );

      if (res.detected_constraints) {
        setActiveConstraints(res.detected_constraints);
      }
      if (res.trip_memory) {
        setTripMemory((prev) => ({ ...prev, ...res.trip_memory }));
      }
      const rawResolvedTitle = res.trip_memory?.attached_source_title?.trim();
      const titleMatchesCurrentAttachment =
        Boolean(rawResolvedTitle) &&
        Boolean(activeAttachment) &&
        (activeAttachment?.payload.type !== 'link' ||
          res.trip_memory?.attached_source_url === activeAttachment?.payload.url);

      const aiMsg: IdeationMessage = {
        id: `idea-a-${Date.now()}`,
        sender: 'assistant',
        text: sanitizeCopilotReplyText(res.reply_text, text),
        timestamp: nowHHMM(),
        suggestedPois: res.suggested_pois || [],
        extractedPlaces: res.extracted_places || [],
        receiptBooking: res.receipt_booking ?? null,
        nextSuggestedPrompts: res.next_suggested_prompts || [],
        avoidNotice: res.avoid_notice,
        greenImpactSummary: res.green_impact_summary,
        budgetImpactSummary: res.budget_impact_summary,
      };
      setMessages((prev) => {
        const enriched =
          titleMatchesCurrentAttachment && rawResolvedTitle
            ? prev.map((m) =>
                m.id === userMsgId && m.attachment
                  ? { ...m, attachment: { ...m.attachment, displayTitle: rawResolvedTitle } }
                  : m
              )
            : prev;
        return [...enriched, aiMsg];
      });
      if ((res.suggested_pois?.length || 0) > 0) {
        setIsSplitMapCollapsed(false);
      }
    } catch (err) {
      console.error('Ideation chat error:', err);
      const hasSocialLink = /(?:tiktok\.com|vt\.tiktok\.com|facebook\.com|fb\.watch|instagram\.com|youtu\.be|youtube\.com)/i.test(
        text
      );
      if (hasSocialLink) {
        setMessages((prev) => [
          ...prev,
          {
            id: `idea-a-${Date.now()}`,
            sender: 'assistant',
            text: sanitizeCopilotReplyText('Please wait...', text),
            timestamp: nowHHMM(),
            suggestedPois: [],
            nextSuggestedPrompts: [
              'Tìm quán ăn bản địa ít đông ở Huế',
              'Gợi ý điểm xanh & làng nghề tại Đà Nẵng',
              'Lên lịch trình 2 ngày tránh giờ cao điểm',
            ],
          },
        ]);
      } else {
        setErrorMessage('Không thể kết nối tới trợ lý AI lúc này. Vui lòng thử lại sau giây lát.');
        setLastFailedPrompt(text);
      }
    } finally {
      setStreamingText('');
      setStreamingStatus(null);
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
        <div className="max-w-full mx-auto flex flex-wrap items-center justify-between gap-3">
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
            {displayedMapPois.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  if (typeof window !== 'undefined' && window.innerWidth >= 1024) {
                    setIsSplitMapCollapsed((prev) => !prev);
                  } else {
                    setIsMapOpen(true);
                  }
                }}
                className="min-h-[40px] px-3.5 rounded-full border border-neutral-300 bg-white hover:bg-neutral-50 text-neutral-800 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
              >
                <MapIcon size={15} className="text-emerald-700" />
                <span>{mapPois.length > 0 ? `Bản đồ (${mapPois.length})` : 'Bản đồ Miền Trung'}</span>
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
        <div className="max-w-full mx-auto mt-2.5 flex flex-wrap items-center gap-2 text-xs">
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

      {/* Split-Screen Body: Left Chat Stream + Input | Right Live Synced Map (Desktop lg+) */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
      {/* Main Scrollable Chat Stream */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6">
        <div className="max-w-[780px] mx-auto space-y-6 pb-8">
          {messages.length === 0 ? (
            <section className="py-10 sm:py-16 flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-2xl bg-emerald-800 text-white flex items-center justify-center shadow-md mb-5">
                <Compass size={30} />
              </div>
              <h2 className="text-2xl sm:text-[32px] font-bold text-neutral-950 tracking-tight mb-2.5">
                {currentUserName?.trim()
                  ? `Hôm nay bạn muốn đi đâu, ${currentUserName.trim()}?`
                  : 'Hôm nay bạn muốn đi đâu?'}
              </h2>
              <p className="text-sm sm:text-[15px] text-neutral-600 max-w-lg leading-relaxed mb-8">
                Mình ở đây để giúp bạn lên kế hoạch trải nghiệm xanh tại Đà Nẵng – Huế.
                Hỏi bất cứ điều gì, hoặc bấm dấu <strong className="text-neutral-900">+</strong> để tải ảnh, tệp hay dán link TikTok/YouTube.
              </p>

              <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
                {STARTER_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => handleSend(prompt)}
                    className="min-h-[56px] p-4 rounded-2xl bg-white border border-neutral-200 hover:border-emerald-700 hover:bg-emerald-50/30 transition shadow-2xs flex items-start gap-3 text-left cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
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
                  <div className="max-w-[85%] sm:max-w-[75%] space-y-2 flex flex-col items-end">
                    {msg.attachment && (
                      <div className="rounded-2xl border border-neutral-200 bg-white p-2.5 shadow-2xs flex items-center gap-3 max-w-full">
                        <AttachmentThumbnail
                          previewUrl={msg.attachment.previewUrl}
                          alt={msg.attachment.displayTitle}
                          type={msg.attachment.type}
                        />
                        <div className="min-w-0 text-left">
                          <p className="text-xs font-bold text-neutral-950 truncate max-w-[260px]">
                            {msg.attachment.displayTitle}
                          </p>
                          <p className="text-xs text-neutral-600 truncate">
                            {msg.attachment.subtitle}
                          </p>
                        </div>
                      </div>
                    )}
                    <div className="rounded-2xl rounded-br-sm bg-neutral-900 text-white px-4 py-3 text-[14px] leading-relaxed shadow-xs">
                      {msg.text}
                    </div>
                  </div>
                ) : (
                  <div className="w-full space-y-3">
                    <div className="bg-white border border-neutral-200/90 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-3">
                      <FormattedCopilotMessage
                        text={msg.text}
                        entityLookup={entityLookup}
                        preferredCity={liveIntent?.destination}
                        onHoverPoi={setHoveredPoiId}
                        onSelectPoi={handleFocusPoiOnMap}
                      />

                      {msg.receiptBooking && (
                        <div
                          data-testid="receipt-booking-card"
                          className="mt-2 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3.5 flex flex-wrap items-center justify-between gap-3"
                        >
                          <div className="flex items-start gap-2.5 min-w-0">
                            <div className="w-9 h-9 rounded-xl bg-emerald-800 text-white flex items-center justify-center shrink-0">
                              <ReceiptText size={17} />
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-emerald-950">
                                {msg.receiptBooking.is_duplicate
                                  ? 'Hóa đơn đã tồn tại trong hành trình (không thêm trùng)'
                                  : 'Đã nhận xác nhận đặt chỗ'}
                              </p>
                              <p className="text-[13px] font-semibold text-neutral-950 truncate">
                                {msg.receiptBooking.title}
                              </p>
                              <p className="text-xs text-neutral-700">
                                {msg.receiptBooking.city}
                                {msg.receiptBooking.time_str ? ` · ${msg.receiptBooking.time_str}` : ''}
                                {msg.receiptBooking.date_str ? ` · ${msg.receiptBooking.date_str}` : ''}
                                {msg.receiptBooking.checkout_str ? ` → ${msg.receiptBooking.checkout_str}` : ''}
                              </p>
                            </div>
                          </div>
                          {!msg.receiptBooking.is_duplicate && (
                            <button
                              type="button"
                              onClick={handleCreateTripClick}
                              className="min-h-[40px] px-3.5 rounded-full bg-neutral-950 hover:bg-neutral-800 text-white text-xs font-semibold cursor-pointer transition shrink-0"
                            >
                              Tạo chuyến đi từ xác nhận này
                            </button>
                          )}
                        </div>
                      )}

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

                    {/* Visual POI Cards */}
                    {msg.suggestedPois && msg.suggestedPois.length > 0 && (
                      <div className="flex gap-3 overflow-x-auto pb-2 snap-x">
                        {msg.suggestedPois.map((poi) => {
                          const isSaved = selectedIdeaIdSet.has(poi.id);
                          const ecoReason = getPoiGreenScoreExplanation(poi);
                          const isEcoOpen = openEcoTipPoiId === poi.id;
                          const matchedExtracted = msg.extractedPlaces?.find((ep) => {
                            const epNorm = ep.name.toLowerCase();
                            const poiNorm = poi.name.toLowerCase();
                            return epNorm.includes(poiNorm) || poiNorm.includes(epNorm);
                          });
                          return (
                            <article
                              key={poi.id}
                              onMouseEnter={() => setHoveredPoiId(poi.id)}
                              onMouseLeave={() => {
                                setHoveredPoiId(null);
                                setOpenEcoTipPoiId((prev) => (prev === poi.id ? null : prev));
                              }}
                              onClick={() => handleFocusPoiOnMap(poi.id)}
                              className="relative w-[235px] shrink-0 snap-start rounded-2xl bg-white border border-neutral-200/90 hover:border-neutral-400 overflow-hidden shadow-2xs transition cursor-pointer flex flex-col"
                            >
                              <div className="relative h-28 bg-neutral-100">
                                <PoiImage
                                  src={poi.image_url}
                                  alt={poi.name}
                                  poiId={poi.id}
                                  poiName={poi.name}
                                  category={normalizeCategory(poi.category)}
                                  city={normalizeCity(poi.city)}
                                  className="w-full h-full object-cover"
                                />
                                <button
                                  type="button"
                                  data-testid="poi-green-score-badge"
                                  aria-label={`Điểm xanh ${poi.green_score}/100: ${ecoReason}`}
                                  aria-expanded={isEcoOpen}
                                  title="Bấm để xem giải thích 4 trụ cột Điểm xanh"
                                  onMouseEnter={() => setOpenEcoTipPoiId(poi.id)}
                                  onFocus={() => setOpenEcoTipPoiId(poi.id)}
                                  onBlur={() =>
                                    setOpenEcoTipPoiId((prev) => (prev === poi.id ? null : prev))
                                  }
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setOpenEcoTipPoiId((prev) => (prev === poi.id ? null : poi.id));
                                    setExplanationPoi({
                                      id: poi.id,
                                      name: poi.name,
                                      snippet: poi.kg_explanation || poi.swap_reason || undefined,
                                    });
                                  }}
                                  className="absolute top-2 left-2 min-h-[28px] px-2.5 py-0.5 rounded-full bg-emerald-950/90 hover:bg-emerald-900 text-emerald-100 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 z-10"
                                >
                                  <Leaf size={11} />
                                  <span>{poi.green_score}/100</span>
                                </button>
                                {matchedExtracted?.timestamp && (
                                  <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded-full bg-black/75 text-white text-xs font-medium">
                                    {matchedExtracted.timestamp}
                                  </span>
                                )}
                                <button
                                  type="button"
                                  aria-label={isSaved ? `Bỏ chọn ${poi.name}` : `Chọn ${poi.name} vào ý tưởng`}
                                  aria-pressed={isSaved}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleToggleIdeaPoi(poi.id);
                                  }}
                                  className={`absolute top-2 right-2 w-10 h-10 rounded-full flex items-center justify-center shadow-sm transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 z-10 ${
                                    isSaved
                                      ? 'bg-emerald-700 text-white'
                                      : 'bg-white/95 text-neutral-900 hover:bg-white'
                                  }`}
                                  title={isSaved ? 'Đã thêm vào ý tưởng' : 'Thêm vào ý tưởng chuyến đi'}
                                >
                                  {isSaved ? <Check size={16} /> : <Plus size={16} />}
                                </button>
                              </div>

                              {isEcoOpen && (
                                <div
                                  role="tooltip"
                                  data-testid="poi-green-score-tooltip"
                                  onClick={(e) => e.stopPropagation()}
                                  className="absolute top-10 left-2 right-2 z-20 rounded-xl bg-neutral-950/95 text-white px-2.5 py-2 text-xs leading-snug shadow-lg border border-emerald-500/30"
                                >
                                  <p className="font-semibold text-emerald-300 mb-0.5">
                                    Điểm xanh {poi.green_score}/100
                                  </p>
                                  <p className="text-neutral-100">{ecoReason}</p>
                                </div>
                              )}

                              <div className="p-3 flex-1 flex flex-col justify-between gap-1">
                                <div>
                                  <h3 className="text-[13px] font-bold text-neutral-950 line-clamp-1">
                                    {poi.name}
                                  </h3>
                                  <p className="text-xs text-neutral-600 line-clamp-1">
                                    {poi.city || poi.address}
                                  </p>
                                  <p
                                    className="text-xs text-emerald-800 line-clamp-1 mt-0.5"
                                    title={ecoReason}
                                  >
                                    🌱 {ecoReason}
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

                    {/* Follow-up prompt chips ở tin nhắn AI gần nhất (không lặp câu hỏi dẫn) */}
                    {(() => {
                      if (msgIdx !== messages.length - 1) return null;
                      const chips = sanitizeQuickReplyChips(msg.nextSuggestedPrompts, msg.text);
                      if (chips.length === 0) return null;
                      return (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {chips.map((chip) => (
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
                      );
                    })()}
                  </div>
                )}
              </div>
            ))
          )}

          {isSending && (
            <div className="w-full bg-white border border-emerald-200/90 rounded-2xl p-4 sm:p-5 shadow-2xs">
              <AiStreamingShell
                isStreaming={isSending}
                hasContent={Boolean(streamingText)}
                statusText={streamingStatus || 'Đang tra cứu Đồ thị Tri thức Miền Trung…'}
              >
                {streamingText ? (
                  <FormattedCopilotMessage
                    text={streamingText}
                    entityLookup={entityLookup}
                    preferredCity={liveIntent?.destination}
                    onHoverPoi={setHoveredPoiId}
                    onSelectPoi={(poiId) => {
                      setSelectedMapPoiId(poiId);
                      setIsMapOpen(true);
                    }}
                  />
                ) : null}
              </AiStreamingShell>
            </div>
          )}

          {errorMessage && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs text-rose-900">
              <span>{errorMessage}</span>
              {lastFailedPrompt && (
                <button
                  type="button"
                  onClick={() => handleSend(lastFailedPrompt)}
                  className="min-h-[40px] px-3 rounded-full bg-rose-700 hover:bg-rose-800 text-white font-semibold cursor-pointer"
                >
                  Thử lại
                </button>
              )}
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Bottom Floating Input Bar (+ Multimodal Attach Menu + Staged Preview) */}
      <footer className="shrink-0 px-4 sm:px-8 pb-[84px] md:pb-4 pt-2 bg-gradient-to-t from-[#FCFAF5] via-[#FCFAF5] to-transparent">
        <div className="max-w-[744px] mx-auto relative">
          <ChatAttachmentMenu
            isOpen={isAttachMenuOpen}
            onClose={() => setIsAttachMenuOpen(false)}
            onSelectAttachment={(ready) => {
              setPendingAttachment(ready);
              setTimeout(() => textareaRef.current?.focus(), 0);
            }}
          />

          <AiPromptComposer
            textareaRef={textareaRef}
            value={input}
            onChange={setInput}
            onSubmit={() => void handleSend()}
            isGenerating={isSending}
            canSend={Boolean(input.trim() || pendingAttachment)}
            placeholder={getAttachmentPlaceholder(
              pendingAttachment,
              'Hỏi GreenTrip AI về Đà Nẵng – Huế, hoặc bấm + để tải ảnh, tệp hoặc dán link...'
            )}
            ariaLabel="Nhập câu hỏi khởi tạo ý tưởng chuyến đi"
            topSlot={
              pendingAttachment ? (
                <StagedAttachmentChip
                  attachment={pendingAttachment}
                  onRemove={() => setPendingAttachment(null)}
                />
              ) : null
            }
            onPaste={(e) => {
              const file = e.clipboardData?.files?.[0];
              if (!file) return;
              e.preventDefault();
              void fileToReadyAttachment(file, 'file')
                .then((ready) => setPendingAttachment(ready))
                .catch((err) => setErrorMessage(err instanceof Error ? err.message : 'Không thể đọc ảnh đã dán.'));
            }}
            onDropFile={(file) => {
              void fileToReadyAttachment(file, 'file')
                .then((ready) => {
                  setPendingAttachment(ready);
                  setTimeout(() => textareaRef.current?.focus(), 0);
                })
                .catch((err) => setErrorMessage(err instanceof Error ? err.message : 'Không thể đọc tệp đính kèm.'));
            }}
            leftActions={
              <button
                type="button"
                onClick={() => setIsAttachMenuOpen((prev) => !prev)}
                aria-label="Đính kèm ảnh, tệp hoặc đường dẫn"
                aria-expanded={isAttachMenuOpen}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${
                  isAttachMenuOpen
                    ? 'bg-neutral-900 text-white rotate-45'
                    : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-900'
                }`}
                title="Đính kèm ảnh, tệp hoặc đường dẫn"
              >
                <Plus size={18} strokeWidth={2.2} />
              </button>
            }
          />

          <p className="mt-2 text-center text-xs text-neutral-600">
            GreenTrip AI có thể nhầm lẫn. Hãy kiểm tra lại thông tin quan trọng.
          </p>
        </div>
      </footer>
        </div>

        {/* Desktop Split-Screen Interactive Map (auto-open Central Vietnam map on xl+ empty state) */}
        {displayedMapPois.length > 0 && !isSplitMapCollapsed && (
          <aside
            aria-label="Bản đồ địa điểm tương tác"
            className={`${
              mapPois.length > 0 ? 'hidden lg:flex w-[44%] xl:w-[46%]' : 'hidden xl:flex w-[44%] 2xl:w-[46%]'
            } shrink-0 h-full p-3 pl-0 bg-[#FCFAF5]`}
          >
            <div className="w-full h-full rounded-[22px] overflow-hidden border border-neutral-200/90 shadow-[0_4px_18px_rgba(0,0,0,0.06)] relative bg-white">
              <button
                type="button"
                onClick={() => setIsSplitMapCollapsed(true)}
                aria-label="Thu gọn bản đồ"
                title="Thu gọn bản đồ"
                className="absolute top-3 left-3 z-[400] w-10 h-10 rounded-full bg-white/95 hover:bg-white border border-neutral-200 shadow-md flex items-center justify-center text-neutral-900 cursor-pointer transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
              >
                <ArrowLeft size={17} />
              </button>
              {mapPois.length === 0 && (
                <div className="absolute top-3 right-3 z-[400] rounded-full bg-white/95 backdrop-blur-sm border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-900 shadow-sm pointer-events-none">
                  Đà Nẵng – Huế · Điểm xanh nổi bật
                </div>
              )}
              <PoiMap
                pois={displayedMapPois}
                selectedPoiId={selectedMapPoiId}
                hoveredPoiId={hoveredPoiId}
                onSelectPoi={setSelectedMapPoiId}
                onHoverPoi={setHoveredPoiId}
                hideTopControls
              />
            </div>
          </aside>
        )}
      </div>

      {/* Quick Map Preview Modal chuẩn MindTrip [🗺️ Map] */}
      {isMapOpen && displayedMapPois.length > 0 && (
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
                  {mapPois.length > 0
                    ? `Bản đồ các điểm đang thảo luận (${mapPois.length})`
                    : `Bản đồ Miền Trung (${displayedMapPois.length} điểm xanh nổi bật)`}
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
                pois={displayedMapPois}
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
      {explanationPoi && (
        <ExplanationModal
          poiId={explanationPoi.id}
          poiName={explanationPoi.name}
          explanationSnippet={explanationPoi.snippet}
          isOpen={Boolean(explanationPoi)}
          onClose={() => setExplanationPoi(null)}
        />
      )}
    </main>
  );
}
