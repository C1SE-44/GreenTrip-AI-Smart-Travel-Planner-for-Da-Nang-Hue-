import React, { useMemo, useRef, useState } from 'react';
import {
  Sparkles,
  CalendarPlus,
  Send,
  Plus,
  Mic,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  MapPin,
  Clock,
  CheckCircle2,
  X,
  Leaf,
  Star,
  Search,
  RotateCcw,
} from 'lucide-react';
import OnboardingModal from '@/components/auth/OnboardingModal';
import PoiImage from '@/components/ui/PoiImage';
import FavoriteHeartButton from '@/components/ui/FavoriteHeartButton';
import type { ExploreTabId } from '@/components/explore/exploreUtils';
import type { Poi } from '@/data/pois';

export interface HomeDashboardViewProps {
  onNavigateToExplore: (initialTab?: ExploreTabId) => void;
  onNavigateToTrips: () => void;
  onNavigateToSaved: () => void;
  onNavigateToChat?: (initialPrompt?: string) => void;
  onCreateTrip: (defaultDestination?: string, defaultTitle?: string) => void;
  currentUser?: { full_name?: string; email?: string } | null;
  pois?: Poi[];
  poisLoading?: boolean;
  poisError?: string | null;
  onRetryPois?: () => void;
  savedIds?: Set<string>;
  pendingSaveIds?: Set<string>;
  onToggleSavePlace?: (poi: Poi) => void;
  onSelectPoi?: (poi: Poi) => void;
}

const TOP_CATEGORIES: Array<{
  id: string;
  label: string;
  icon: string;
  exploreTab?: ExploreTabId;
}> = [
  { id: 'all', label: 'Tất cả', icon: 'ph-squares-four' },
  { id: 'stays', label: 'Lưu trú xanh', icon: 'ph-bed', exploreTab: 'luu-tru' },
  { id: 'eats', label: 'Ẩm thực & Cafe', icon: 'ph-fork-knife', exploreTab: 'quan-an' },
  { id: 'heritage', label: 'Di tích & Di sản', icon: 'ph-bank', exploreTab: 'di-tich' },
  { id: 'nature', label: 'Thiên nhiên & Biển', icon: 'ph-mountains', exploreTab: 'canh-quan' },
  { id: 'experiences', label: 'Khám phá xanh', icon: 'ph-sparkle', exploreTab: 'for-you' },
  { id: 'trips', label: 'Lịch trình', icon: 'ph-calendar-check' },
];

const MUST_TRY_PACKAGES = [
  {
    id: 'pkg-danang-food',
    title: 'Ẩm thực đường phố & Cầu Rồng Đà Nẵng',
    destination: 'Đà Nẵng',
    duration: '1 ngày • 4 điểm ghé thăm',
    badge: 'Được yêu thích',
    ecoScore: '92/100',
    co2Saved: 'Giảm ~1.5kg CO₂',
    image:
      'https://ydqzobtzakttljslkiez.supabase.co/storage/v1/object/public/poi-images/413f8945-85d0-40a0-afde-5fe0c4443fa7.webp',
    description:
      'Bánh xèo Bà Dưỡng, Cầu Rồng phun lửa, chợ đêm Sơn Trà và dạo mát sông Hàn.',
  },
  {
    id: 'pkg-hue-heritage',
    title: 'Dấu ấn Cố đô & Lăng tẩm Hoàng gia Huế',
    destination: 'Huế',
    duration: '2 ngày • 5 điểm ghé thăm',
    badge: 'Di sản UNESCO',
    ecoScore: '95/100',
    co2Saved: 'Giảm ~2.1kg CO₂',
    image:
      'https://ydqzobtzakttljslkiez.supabase.co/storage/v1/object/public/poi-images/18e393a3-1ee4-486f-9954-4d1f4c727fc9.webp',
    description:
      'Khám phá Đại Nội Huế, Chùa Thiên Mụ cổ kính, Lăng Khải Định và thưởng thức cơm hến bản địa.',
  },
  {
    id: 'pkg-green-nature',
    title: 'Hành trình Xanh: Bán đảo Sơn Trà & Biển Mỹ Khê',
    destination: 'Đà Nẵng',
    duration: '1 ngày • 3 điểm ghé thăm',
    badge: 'Xanh Sinh Thái',
    ecoScore: '98/100',
    co2Saved: 'Giảm ~3.0kg CO₂',
    image:
      'https://ydqzobtzakttljslkiez.supabase.co/storage/v1/object/public/poi-images/177df420-aec0-4eca-8443-b373893bf6fe.webp',
    description:
      'Khám phá thiên nhiên nguyên sơ, ngắm Voọc chà vá chân nâu, viếng Chùa Linh Ứng và tắm biển.',
  },
];

const SUGGESTED_PROMPTS = [
  'Lên ý tưởng chuyến đi Đà Nẵng 3 ngày 2 đêm',
  'Gợi ý các quán ăn ngon nhất định phải thử tại Huế',
  'Lịch trình du lịch xanh tiết kiệm CO2 cho gia đình',
];

function formatPoiPriceLabel(poi: Poi): string {
  const cost = poi.estimatedCost;
  if (cost == null || cost <= 0) {
    return poi.category === 'luu-tru' ? 'Liên hệ giá phòng' : 'Miễn phí tham quan';
  }
  const formatted = `${Math.round(cost).toLocaleString('vi-VN')}₫`;
  return poi.category === 'luu-tru' ? `${formatted} / đêm` : `Khoảng ${formatted}`;
}

function getCategoryLabel(category: Poi['category']): string {
  switch (category) {
    case 'luu-tru':
      return 'Lưu trú xanh';
    case 'quan-an':
      return 'Ẩm thực & Cafe';
    case 'di-tich':
      return 'Di tích & Văn hóa';
    case 'canh-quan':
      return 'Thiên nhiên & Biển';
    case 'chua':
      return 'Chùa & Tâm linh';
    default:
      return 'Điểm đến xanh';
  }
}

interface HomePoiCardProps {
  poi: Poi;
  isSaved: boolean;
  isSavePending: boolean;
  onToggleSave: (poi: Poi) => void;
  onSelect: (poi: Poi) => void;
}

function HomePoiCard({
  poi,
  isSaved,
  isSavePending,
  onToggleSave,
  onSelect,
}: HomePoiCardProps) {
  const showFavouriteTag = poi.rating >= 4.7 || poi.ecoScore >= 88;
  return (
    <article
      onClick={() => onSelect(poi)}
      className="group flex flex-col cursor-pointer shrink-0 w-[220px] sm:w-[236px] lg:w-[calc((100%-64px)/5)] 2xl:w-[calc((100%-80px)/6)] snap-start"
    >
      <div className="relative aspect-square w-full rounded-[20px] overflow-hidden bg-neutral-100 border border-neutral-200/70 shadow-[0_2px_10px_rgba(15,23,42,0.05)] group-hover:shadow-[0_14px_28px_-14px_rgba(15,23,42,0.2)] transition-shadow duration-300">
        <PoiImage
          src={poi.image}
          alt={poi.name}
          category={poi.category}
          className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
        />

        {showFavouriteTag && (
          <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-white/95 text-neutral-900 text-xs font-semibold shadow-sm">
            {poi.ecoScore >= 90 ? `Điểm xanh ${poi.ecoScore}` : 'Được yêu thích'}
          </span>
        )}

        <div className="absolute top-2.5 right-2.5 z-10">
          <FavoriteHeartButton
            active={isSaved}
            pending={isSavePending}
            variant="overlay"
            ariaLabel={isSaved ? `Bỏ lưu ${poi.name}` : `Lưu ${poi.name}`}
            title={isSaved ? 'Đã lưu' : 'Lưu địa điểm'}
            onClick={(e) => {
              e.stopPropagation();
              onToggleSave(poi);
            }}
          />
        </div>
      </div>

      <div className="pt-2.5 space-y-0.5 px-0.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-[14px] font-semibold text-neutral-900 line-clamp-1 leading-snug">
            {poi.cleanName || poi.name}
          </h3>
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-neutral-900 shrink-0 pt-0.5">
            <Star size={12} className="fill-neutral-900 text-neutral-900" />
            {(poi.rating || 4.7).toFixed(1)}
          </span>
        </div>
        <p className="text-xs text-neutral-600 line-clamp-1">
          {getCategoryLabel(poi.category)} · {poi.city}
        </p>
        <p className="text-xs text-neutral-800 font-medium line-clamp-1 pt-0.5">
          {formatPoiPriceLabel(poi)}
        </p>
      </div>
    </article>
  );
}

interface HomeCarouselSectionProps {
  title: string;
  subtitle?: string;
  items: Poi[];
  savedIds: Set<string>;
  pendingSaveIds: Set<string>;
  onToggleSave: (poi: Poi) => void;
  onSelectPoi: (poi: Poi) => void;
  onViewAll: () => void;
}

function HomeCarouselSection({
  title,
  subtitle,
  items,
  savedIds,
  pendingSaveIds,
  onToggleSave,
  onSelectPoi,
  onViewAll,
}: HomeCarouselSectionProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  if (items.length === 0) return null;

  const scrollByAmount = (direction: -1 | 1) => {
    const el = scrollerRef.current;
    if (!el) return;
    const step = Math.max(260, Math.round(el.clientWidth * 0.78));
    el.scrollBy({ left: direction * step, behavior: 'smooth' });
  };

  return (
    <section className="space-y-3.5">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onViewAll}
          className="group inline-flex flex-col items-start text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 rounded-lg"
        >
          <span className="inline-flex items-center gap-1.5 text-[18px] sm:text-[20px] font-bold text-neutral-950 tracking-tight">
            {title}
            <span className="w-7 h-7 rounded-full bg-neutral-100 group-hover:bg-neutral-200 inline-flex items-center justify-center transition-colors">
              <ArrowRight size={14} />
            </span>
          </span>
          {subtitle && (
            <span className="text-xs text-neutral-600 font-normal mt-0.5">{subtitle}</span>
          )}
        </button>

        <div className="hidden sm:flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => scrollByAmount(-1)}
            aria-label={`Cuộn trái ${title}`}
            className="w-10 h-10 rounded-full border border-neutral-200 bg-white hover:border-neutral-400 text-neutral-800 flex items-center justify-center transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            onClick={() => scrollByAmount(1)}
            aria-label={`Cuộn phải ${title}`}
            className="w-10 h-10 rounded-full border border-neutral-200 bg-white hover:border-neutral-400 text-neutral-800 flex items-center justify-center transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div
        ref={scrollerRef}
        className="flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory no-scrollbar scroll-smooth"
      >
        {items.map((poi) => (
          <HomePoiCard
            key={poi.id}
            poi={poi}
            isSaved={savedIds.has(poi.id)}
            isSavePending={pendingSaveIds.has(poi.id)}
            onToggleSave={onToggleSave}
            onSelect={onSelectPoi}
          />
        ))}
      </div>
    </section>
  );
}

export default function HomeDashboardView({
  onNavigateToExplore,
  onNavigateToTrips,
  onNavigateToSaved,
  onNavigateToChat,
  onCreateTrip,
  currentUser,
  pois = [],
  poisLoading = false,
  poisError = null,
  onRetryPois,
  savedIds = new Set<string>(),
  pendingSaveIds = new Set<string>(),
  onToggleSavePlace,
  onSelectPoi,
}: HomeDashboardViewProps) {
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [chatPrompt, setChatPrompt] = useState('');
  const [isGeneratingIdea, setIsGeneratingIdea] = useState(false);
  const [generatedIdea, setGeneratedIdea] = useState<{
    title: string;
    destination: string;
    days: string[];
    summary: string;
  } | null>(null);
  const [showForumModal, setShowForumModal] = useState(false);
  const [activeTabFilter, setActiveTabFilter] = useState('all');
  const [cityFilter, setCityFilter] = useState<'all' | 'Đà Nẵng' | 'Huế'>('all');
  const [searchText, setSearchText] = useState('');

  const displayName = currentUser?.full_name?.split(' ')[0] || 'bạn';

  const handleSendPrompt = (promptText?: string) => {
    const query = (promptText || chatPrompt).trim();
    if (!query) return;

    if (onNavigateToChat) {
      setChatPrompt('');
      onNavigateToChat(query);
      return;
    }

    setIsGeneratingIdea(true);
    setChatPrompt(query);

    setTimeout(() => {
      const isHue = /huế|hue/i.test(query);
      const destination = isHue ? 'Huế' : 'Đà Nẵng';
      setGeneratedIdea({
        title: query.length > 40 ? `Hành trình ${destination}` : query,
        destination,
        summary: `GreenTrip AI đã phác thảo hành trình tối ưu hóa cung đường và ưu tiên phương tiện giao thông xanh tại ${destination}.`,
        days: [
          `Ngày 1: Check-in, ghé quán ăn đặc sản chuẩn vị và dạo ngắm cảnh biểu tượng ${destination}`,
          'Ngày 2: Trải nghiệm văn hóa di tích lịch sử và danh lam thắng cảnh thiên nhiên',
          'Ngày 3: Mua sắm quà lưu niệm địa phương, tận hưởng không khí thư thái trước khi trở về',
        ],
      });
      setIsGeneratingIdea(false);
    }, 600);
  };

  const handleSelectPoiSafe = (poi: Poi) => {
    if (onSelectPoi) {
      onSelectPoi(poi);
      return;
    }
    onNavigateToExplore();
  };

  const handleToggleSaveSafe = (poi: Poi) => {
    if (onToggleSavePlace) {
      onToggleSavePlace(poi);
      return;
    }
    onNavigateToSaved();
  };

  const rankedPois = useMemo(() => {
    return [...pois].sort(
      (a, b) =>
        (b.rating || 0) * 10 + (b.ecoScore || 0) * 0.25 - ((a.rating || 0) * 10 + (a.ecoScore || 0) * 0.25)
    );
  }, [pois]);

  const isFiltering = activeTabFilter !== 'all' || cityFilter !== 'all' || searchText.trim().length > 0;

  const filteredPois = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return rankedPois.filter((p) => {
      if (cityFilter !== 'all' && p.city !== cityFilter) return false;
      if (activeTabFilter === 'stays' && p.category !== 'luu-tru') return false;
      if (activeTabFilter === 'eats' && p.category !== 'quan-an') return false;
      if (activeTabFilter === 'heritage' && p.category !== 'di-tich' && p.category !== 'chua') return false;
      if (activeTabFilter === 'nature' && p.category !== 'canh-quan') return false;
      if (activeTabFilter === 'experiences' && p.ecoScore < 75) return false;
      if (q) {
        const hay = `${p.name} ${p.address || ''} ${p.city} ${p.description || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rankedPois, cityFilter, activeTabFilter, searchText]);

  const daNangStays = useMemo(
    () => rankedPois.filter((p) => p.city === 'Đà Nẵng' && p.category === 'luu-tru').slice(0, 14),
    [rankedPois]
  );
  const hueStays = useMemo(
    () => rankedPois.filter((p) => p.city === 'Huế' && p.category === 'luu-tru').slice(0, 14),
    [rankedPois]
  );
  const daNangFood = useMemo(
    () => rankedPois.filter((p) => p.city === 'Đà Nẵng' && p.category === 'quan-an').slice(0, 14),
    [rankedPois]
  );
  const hueHeritageNature = useMemo(
    () =>
      rankedPois
        .filter((p) => p.city === 'Huế' && (p.category === 'di-tich' || p.category === 'canh-quan' || p.category === 'chua'))
        .slice(0, 14),
    [rankedPois]
  );

  const resetFilters = () => {
    setActiveTabFilter('all');
    setCityFilter('all');
    setSearchText('');
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#fcfcfd] overflow-y-auto no-scrollbar relative">
      {/* ─── 1. STICKY AIRBNB-STYLE DISCOVERY HEADER (CATEGORIES + SEARCH PILL) ─── */}
      <header className="md:sticky md:top-0 z-30 bg-white/95 backdrop-blur-md border-b border-neutral-200/80 px-4 sm:px-6 xl:px-10 pt-2.5 pb-3 md:pt-3.5 md:pb-4 shrink-0">
        <div className="max-w-[1680px] mx-auto space-y-3.5">
          {/* Category Tabs Row */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 sm:gap-5 overflow-x-auto no-scrollbar py-0.5 flex-1">
              {TOP_CATEGORIES.map((cat) => {
                const isActive = activeTabFilter === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      if (cat.id === 'trips') {
                        onNavigateToTrips();
                        return;
                      }
                      setActiveTabFilter(isActive && cat.id !== 'all' ? 'all' : cat.id);
                    }}
                    aria-pressed={isActive}
                    className={`min-h-[40px] px-2.5 pb-2 pt-1 border-b-2 transition-colors cursor-pointer inline-flex items-center gap-2 text-xs font-semibold shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${
                      isActive
                        ? 'border-neutral-950 text-neutral-950'
                        : 'border-transparent text-neutral-600 hover:text-neutral-950 hover:border-neutral-300'
                    }`}
                  >
                    <i className={`ph ${cat.icon} text-[16px]`} aria-hidden="true" />
                    <span>{cat.label}</span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => onNavigateToExplore('luu-tru')}
              className="hidden md:inline-flex min-h-[40px] px-3.5 rounded-full border border-neutral-200 hover:border-neutral-400 bg-white text-xs font-semibold text-neutral-800 items-center gap-1.5 shrink-0 cursor-pointer transition"
            >
              <span>Bản đồ & Bộ lọc</span>
              <ArrowRight size={13} />
            </button>
          </div>

          {/* Airbnb-style Search & Filter Pill */}
          <div className="mx-auto max-w-3xl flex flex-col sm:flex-row items-stretch sm:items-center rounded-2xl sm:rounded-full border border-neutral-200 bg-white shadow-[0_6px_24px_rgba(0,0,0,0.06)] p-1.5 gap-1 focus-within:ring-2 focus-within:ring-emerald-700/30 focus-within:border-emerald-700">
            <div className="flex items-center gap-1 px-3 py-1.5 sm:border-r border-neutral-200 shrink-0">
              <MapPin size={14} className="text-emerald-800 shrink-0" aria-hidden="true" />
              <label htmlFor="home-city-select" className="sr-only">
                Chọn điểm đến
              </label>
              <select
                id="home-city-select"
                name="destination"
                value={cityFilter}
                onChange={(e) => setCityFilter(e.target.value as 'all' | 'Đà Nẵng' | 'Huế')}
                className="min-h-[40px] bg-transparent text-xs font-semibold text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 rounded-md cursor-pointer pr-1"
              >
                <option value="all">Đà Nẵng & Huế</option>
                <option value="Đà Nẵng">Đà Nẵng</option>
                <option value="Huế">Huế</option>
              </select>
            </div>

            <div className="flex-1 flex items-center gap-2 px-3 min-w-0">
              <Search size={15} className="text-neutral-500 shrink-0" aria-hidden="true" />
              <input
                type="text"
                name="home_search"
                aria-label="Tìm homestay, khách sạn, quán ăn hoặc điểm xanh"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && searchText.trim() && filteredPois.length === 0) {
                    handleSendPrompt(searchText);
                  }
                }}
                placeholder="Tìm homestay, khách sạn, quán ăn, điểm xanh…"
                className="w-full min-h-[40px] bg-transparent text-xs text-neutral-900 placeholder:text-neutral-500 focus:outline-none"
              />
              {searchText && (
                <button
                  type="button"
                  onClick={() => setSearchText('')}
                  aria-label="Xóa từ khóa"
                  className="w-8 h-8 rounded-full hover:bg-neutral-100 flex items-center justify-center text-neutral-600 cursor-pointer shrink-0"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 justify-end px-1">
              <button
                type="button"
                onClick={() =>
                  onNavigateToExplore(activeTabFilter === 'stays' ? 'luu-tru' : 'for-you')
                }
                className="min-h-[40px] px-4 rounded-full bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
              >
                <Search size={13} />
                <span>Khám phá</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ─── MAIN CONTENT CONTAINER ─── */}
      <div className="max-w-[1680px] w-full mx-auto px-4 sm:px-6 xl:px-10 pt-5 pb-44 flex flex-col gap-8">
        {/* ─── 1.5 PERSONALISED GREETING & QUICK JUMP ─── */}
        <section
          aria-label="Tổng quan cá nhân"
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-neutral-200/80 bg-[#FAF8F5] px-4 py-3.5"
        >
          <div className="min-w-0">
            <p className="text-sm sm:text-[15px] font-semibold text-neutral-900 truncate">
              Chào {displayName}, hôm nay bạn muốn khám phá đâu?
            </p>
            <p className="text-xs text-neutral-600 mt-0.5">
              {pois.length > 0
                ? `${pois.length} địa điểm xanh tại Đà Nẵng & Huế đang sẵn sàng`
                : 'Chọn điểm đến, lưu địa điểm yêu thích và tạo lịch trình trong vài giây'}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onNavigateToTrips}
              className="min-h-[40px] px-3.5 rounded-full bg-white border border-neutral-200 hover:border-neutral-900 text-xs font-semibold text-neutral-900 inline-flex items-center gap-1.5 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
            >
              <CalendarPlus size={14} className="text-emerald-700" aria-hidden="true" />
              <span>Tiếp tục lịch trình</span>
            </button>
            <button
              type="button"
              onClick={onNavigateToSaved}
              className="min-h-[40px] px-3.5 rounded-full bg-white border border-neutral-200 hover:border-neutral-900 text-xs font-semibold text-neutral-800 inline-flex items-center gap-1.5 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
            >
              <span>Đã lưu{savedIds.size > 0 ? ` (${savedIds.size})` : ''}</span>
            </button>
          </div>
        </section>

        {/* ─── 2. REAL POI DISCOVERY ROWS (4 API STATES) ─── */}
        {poisLoading && pois.length === 0 ? (
          <section aria-label="Đang tải địa điểm" className="space-y-6">
            {[0, 1].map((rowIdx) => (
              <div key={rowIdx} className="space-y-3">
                <div className="h-6 w-64 rounded-lg bg-neutral-200 animate-pulse" />
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6 gap-4">
                  {[0, 1, 2, 3, 4].map((cardIdx) => (
                    <div key={cardIdx} className="space-y-2">
                      <div className="aspect-square rounded-[20px] bg-neutral-200 animate-pulse" />
                      <div className="h-4 w-3/4 rounded bg-neutral-200 animate-pulse" />
                      <div className="h-3.5 w-1/2 rounded bg-neutral-200 animate-pulse" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>
        ) : poisError && pois.length === 0 ? (
          <div
            role="alert"
            className="rounded-2xl border border-rose-200 bg-rose-50/70 p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
          >
            <div>
              <h2 className="text-sm font-bold text-neutral-900">
                Chưa tải được danh sách địa điểm lúc này
              </h2>
              <p className="text-xs text-neutral-600 mt-1">{poisError}</p>
            </div>
            {onRetryPois && (
              <button
                type="button"
                onClick={onRetryPois}
                className="min-h-[40px] px-4 rounded-full bg-neutral-900 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw size={13} />
                <span>Thử lại</span>
              </button>
            )}
          </div>
        ) : isFiltering ? (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-[18px] sm:text-[20px] font-bold text-neutral-950">
                  Kết quả phù hợp ({filteredPois.length})
                </h2>
                <p className="text-xs text-neutral-600">
                  Bấm vào thẻ để xem chi tiết, ảnh thực tế hoặc bấm tim để lưu vào bộ sưu tập.
                </p>
              </div>
              <button
                type="button"
                onClick={resetFilters}
                className="min-h-[40px] px-3.5 rounded-full border border-neutral-300 bg-white hover:bg-neutral-50 text-xs font-semibold text-neutral-800 cursor-pointer"
              >
                Xóa bộ lọc
              </button>
            </div>

            {filteredPois.length === 0 ? (
              <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center space-y-3">
                <p className="text-sm font-semibold text-neutral-900">
                  Không tìm thấy địa điểm nào khớp với từ khóa "{searchText || cityFilter}".
                </p>
                <p className="text-xs text-neutral-600">
                  Bạn có thể xóa bộ lọc hoặc hỏi trực tiếp Trợ lý AI để được gợi ý theo nhu cầu riêng.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="min-h-[40px] px-4 rounded-full border border-neutral-300 bg-white text-xs font-semibold text-neutral-900 cursor-pointer"
                  >
                    Xem lại tất cả
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSendPrompt(searchText || `Gợi ý địa điểm xanh ở ${cityFilter}`)}
                    className="min-h-[40px] px-4 rounded-full bg-emerald-800 text-white text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <Sparkles size={13} />
                    <span>Hỏi Trợ lý AI</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6 gap-5">
                {filteredPois.slice(0, 25).map((poi) => (
                  <div key={poi.id} className="min-w-0">
                    <HomePoiCard
                      poi={poi}
                      isSaved={savedIds.has(poi.id)}
                      isSavePending={pendingSaveIds.has(poi.id)}
                      onToggleSave={handleToggleSaveSafe}
                      onSelect={handleSelectPoiSafe}
                    />
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : (
          <div className="space-y-9">
            <HomeCarouselSection
              title="Lưu trú xanh nổi bật tại Đà Nẵng"
              subtitle="Homestay, eco-lodge và khách sạn đã xác minh thông tin & ảnh thực tế"
              items={daNangStays}
              savedIds={savedIds}
              pendingSaveIds={pendingSaveIds}
              onToggleSave={handleToggleSaveSafe}
              onSelectPoi={handleSelectPoiSafe}
              onViewAll={() => onNavigateToExplore('luu-tru')}
            />
            <HomeCarouselSection
              title="Lưu trú & Nghỉ dưỡng tại Huế"
              subtitle="Không gian nhà vườn, villa và khu nghỉ dưỡng gần di sản Cố đô"
              items={hueStays}
              savedIds={savedIds}
              pendingSaveIds={pendingSaveIds}
              onToggleSave={handleToggleSaveSafe}
              onSelectPoi={handleSelectPoiSafe}
              onViewAll={() => onNavigateToExplore('luu-tru')}
            />
            <HomeCarouselSection
              title="Ẩm thực & Quán cafe bản địa Đà Nẵng"
              subtitle="Đặc sản địa phương và quán cafe yên tĩnh, ít phát thải"
              items={daNangFood}
              savedIds={savedIds}
              pendingSaveIds={pendingSaveIds}
              onToggleSave={handleToggleSaveSafe}
              onSelectPoi={handleSelectPoiSafe}
              onViewAll={() => onNavigateToExplore('quan-an')}
            />
            <HomeCarouselSection
              title="Di sản & Cảnh quan Cố đô Huế"
              subtitle="Lăng tẩm, đầm phá và danh thắng nổi bật tại Thừa Thiên Huế"
              items={hueHeritageNature}
              savedIds={savedIds}
              pendingSaveIds={pendingSaveIds}
              onToggleSave={handleToggleSaveSafe}
              onSelectPoi={handleSelectPoiSafe}
              onViewAll={() => onNavigateToExplore('di-tich')}
            />
          </div>
        )}

        {/* ─── 3. COMPACT GREENTRIP AI WORKSPACE STRIP ─── */}
        <section className="space-y-3 pt-2 border-t border-neutral-200/80">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[17px] font-bold text-neutral-950">
                Xin chào, {displayName}. Trợ lý GreenTrip AI sẵn sàng hỗ trợ bạn
              </h2>
              <p className="text-xs text-neutral-600 mt-0.5">
                Thiết lập gu du lịch, mở bản đồ chi tiết hoặc để AI dựng nhanh lịch trình Đà Nẵng – Huế.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsOnboardingOpen(true)}
              className="min-h-[40px] px-4 rounded-full bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-semibold transition cursor-pointer inline-flex items-center gap-1.5"
            >
              <Sparkles size={13} />
              <span>Hoàn tất thiết lập trợ lý</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <button
              type="button"
              onClick={() => setIsOnboardingOpen(true)}
              className="group relative overflow-hidden text-left rounded-2xl p-4 bg-[#122e57] hover:bg-[#0f2648] text-white shadow-sm hover:shadow-[0_14px_28px_-12px_rgba(18,46,87,0.55)] hover:-translate-y-0.5 transition-[transform,box-shadow,background-color] flex flex-col justify-between min-h-[124px] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
            >
              <span className="pointer-events-none absolute -right-6 -top-6 w-24 h-24 rounded-full bg-sky-400/15 blur-xl" aria-hidden="true" />
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-sky-200">Cá nhân hóa</span>
                <ArrowRight size={14} className="text-sky-200/80 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </div>
              <div>
                <h3 className="font-bold text-[14px]">Hoàn tất thiết lập trợ lý</h3>
                <p className="text-xs text-white/80 mt-0.5">Chọn gu di chuyển, ẩm thực và nhịp đi</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => onNavigateToExplore('for-you')}
              className="group relative overflow-hidden text-left rounded-2xl p-4 bg-[#1b557a] hover:bg-[#154564] text-white shadow-sm hover:shadow-[0_14px_28px_-12px_rgba(27,85,122,0.55)] hover:-translate-y-0.5 transition-[transform,box-shadow,background-color] flex flex-col justify-between min-h-[124px] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
            >
              <span className="pointer-events-none absolute -right-6 -top-6 w-24 h-24 rounded-full bg-cyan-300/15 blur-xl" aria-hidden="true" />
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-cyan-200">Bản đồ 575 điểm</span>
                <ArrowRight size={14} className="text-cyan-200/80 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </div>
              <div>
                <h3 className="font-bold text-[14px]">Gợi ý lý tưởng chuyên sâu</h3>
                <p className="text-xs text-white/80 mt-0.5">Điểm đến chọn lọc &amp; điểm xanh bản địa</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => onCreateTrip('Đà Nẵng', 'Chuyến đi của tôi')}
              className="group relative overflow-hidden text-left rounded-2xl p-4 bg-[#7d321c] hover:bg-[#692916] text-white shadow-sm hover:shadow-[0_14px_28px_-12px_rgba(125,50,28,0.55)] hover:-translate-y-0.5 transition-[transform,box-shadow,background-color] flex flex-col justify-between min-h-[124px] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
            >
              <span className="pointer-events-none absolute -right-6 -top-6 w-24 h-24 rounded-full bg-amber-300/15 blur-xl" aria-hidden="true" />
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-amber-200">Lập kế hoạch</span>
                <ArrowRight size={14} className="text-amber-200/80 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </div>
              <div>
                <h3 className="font-bold text-[14px]">Lên kế hoạch chuyến đi</h3>
                <p className="text-xs text-white/80 mt-0.5">Tự xếp lịch hoặc để AI tối ưu tuyến đường</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setShowForumModal(true)}
              className="group relative overflow-hidden text-left rounded-2xl p-4 bg-[#1d4c2b] hover:bg-[#173d22] text-white shadow-sm hover:shadow-[0_14px_28px_-12px_rgba(29,76,43,0.55)] hover:-translate-y-0.5 transition-[transform,box-shadow,background-color] flex flex-col justify-between min-h-[124px] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
            >
              <span className="pointer-events-none absolute -right-6 -top-6 w-24 h-24 rounded-full bg-emerald-300/15 blur-xl" aria-hidden="true" />
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-emerald-200">Cộng đồng</span>
                <ArrowRight size={14} className="text-emerald-200/80 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </div>
              <div>
                <h3 className="font-bold text-[14px]">Diễn đàn & Gói Must-Try</h3>
                <p className="text-xs text-white/80 mt-0.5">Gói điểm đến &amp; kinh nghiệm du lịch xanh</p>
              </div>
            </button>
          </div>
        </section>

        {/* ─── 4. GÓI ĐỊA ĐIỂM MUST-TRY ─── */}
        <section className="space-y-3.5 pt-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-[18px] font-bold text-neutral-950 flex items-center gap-2">
                <span>Gói địa điểm Must-Try cho chuyến đi</span>
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                  Du lịch xanh
                </span>
              </h2>
              <p className="text-xs text-neutral-600 mt-0.5">
                Các gói hành trình tuyển chọn, tối ưu khoảng cách và lượng phát thải.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowForumModal(true)}
              className="min-h-[40px] px-2 text-xs font-semibold text-neutral-800 hover:text-black inline-flex items-center gap-1 cursor-pointer"
            >
              <span>Xem diễn đàn</span>
              <ChevronRight size={14} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {MUST_TRY_PACKAGES.map((pkg) => (
              <div
                key={pkg.id}
                className="bg-white rounded-2xl border border-neutral-200/90 hover:shadow-md transition-shadow overflow-hidden flex flex-col group"
              >
                <div className="h-40 relative overflow-hidden bg-neutral-100">
                  <PoiImage
                    src={pkg.image}
                    alt={pkg.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-full bg-black/75 text-white text-xs font-semibold">
                    {pkg.badge}
                  </div>
                  <div className="absolute bottom-2.5 right-2.5 px-2.5 py-0.5 rounded-full bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1">
                    <Leaf size={11} />
                    <span>{pkg.co2Saved}</span>
                  </div>
                </div>

                <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                  <div>
                    <div className="text-xs font-medium text-neutral-600 flex items-center gap-1.5">
                      <MapPin size={12} />
                      <span>{pkg.destination}</span>
                      <span>•</span>
                      <Clock size={12} />
                      <span>{pkg.duration}</span>
                    </div>
                    <h3 className="font-bold text-[14px] text-neutral-950 mt-1 line-clamp-1">
                      {pkg.title}
                    </h3>
                    <p className="text-xs text-neutral-600 mt-1 line-clamp-2 leading-relaxed">
                      {pkg.description}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-neutral-100 flex items-center justify-between">
                    <span className="text-xs font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md">
                      Điểm xanh: {pkg.ecoScore}
                    </span>
                    <button
                      type="button"
                      onClick={() => onCreateTrip(pkg.destination, pkg.title)}
                      className="min-h-[40px] px-3.5 py-1.5 rounded-full bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-semibold transition cursor-pointer flex items-center gap-1"
                    >
                      <Plus size={12} />
                      <span>Chọn gói này</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ─── 5. FLOATING CHATBOT "ASK GREENTRIP" BAR ─── */}
      <div className="fixed bottom-[70px] md:bottom-0 inset-x-0 z-40 flex flex-col items-center pointer-events-none px-4">
        <div className="w-full max-w-5xl flex flex-col items-center bg-gradient-to-t from-white via-white/95 to-transparent pt-3 sm:pt-5 pb-2 md:pb-5">
          <div className="mb-2 hidden sm:flex items-center gap-2 overflow-x-auto max-w-full w-fit justify-start pointer-events-auto no-scrollbar py-0.5 px-1">
            {SUGGESTED_PROMPTS.map((prompt, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSendPrompt(prompt)}
                className="whitespace-nowrap shrink-0 min-h-[40px] px-3.5 py-2 rounded-full bg-white border border-neutral-200 hover:border-neutral-900 text-xs font-medium text-neutral-800 hover:text-black transition shadow-2xs cursor-pointer"
              >
                {prompt}
              </button>
            ))}
          </div>

          <div className="w-full max-w-2xl bg-white border border-neutral-200 hover:border-emerald-700/50 rounded-full shadow-[0_10px_30px_rgba(15,23,42,0.10)] focus-within:shadow-[0_14px_34px_-10px_rgba(6,95,70,0.22)] focus-within:border-emerald-700 p-1.5 pl-2.5 flex items-center gap-2 pointer-events-auto focus-within:ring-2 focus-within:ring-emerald-700/20 transition-[border-color,box-shadow]">
          <button
            type="button"
            onClick={() => setIsOnboardingOpen(true)}
            aria-label="Mở khảo sát sở thích du lịch"
            className="w-10 h-10 rounded-full hover:bg-neutral-100 flex items-center justify-center text-neutral-600 hover:text-black transition cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
            title="Thêm yêu cầu hoặc mở khảo sát sở thích"
          >
            <Plus size={17} aria-hidden="true" />
          </button>

          <input
            type="text"
            name="home_ai_prompt"
            aria-label="Hỏi Trợ lý GreenTrip AI"
            value={chatPrompt}
            onChange={(e) => setChatPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSendPrompt();
            }}
            placeholder="Hỏi GreenTrip AI... (Lên ý tưởng chuyến đi, hỏi thời tiết, quán ăn ngon)"
            className="flex-1 min-h-[40px] py-2 bg-transparent text-[13.5px] text-neutral-900 placeholder:text-neutral-500 focus:outline-none min-w-0"
          />

          <div className="flex items-center gap-1.5 shrink-0 pr-1">
            <button
              type="button"
              onClick={() => handleSendPrompt('Gợi ý cho tôi chuyến đi xanh 2 ngày tại Đà Nẵng')}
              aria-label="Nhập nhanh gợi ý chuyến đi xanh 2 ngày tại Đà Nẵng"
              className="w-10 h-10 rounded-full hover:bg-neutral-100 flex items-center justify-center text-neutral-600 hover:text-black transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
              title="Nhập nhanh gợi ý"
            >
              <Mic size={17} aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={() =>
                handleSendPrompt(
                  chatPrompt.trim() ? undefined : 'Lên ý tưởng lịch trình ngẫu nhiên'
                )
              }
              disabled={isGeneratingIdea}
              aria-label={chatPrompt.trim() ? 'Gửi câu hỏi cho trợ lý AI' : 'Kích hoạt trợ lý AI'}
              className="w-10 h-10 rounded-full bg-emerald-800 text-white hover:bg-emerald-900 flex items-center justify-center transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
              title={chatPrompt.trim() ? 'Gửi câu hỏi' : 'Kích hoạt trợ lý AI'}
            >
              {chatPrompt.trim() ? (
                <Send size={14} />
              ) : (
                <i className="ph ph-waveform text-white text-[15px]" />
              )}
            </button>
          </div>
        </div>
        </div>
      </div>

      {/* ─── POPUP Ý TƯỞNG NHANH (FALLBACK) ─── */}
      {generatedIdea && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-neutral-100 space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-neutral-900 text-white flex items-center justify-center">
                  <Sparkles size={14} className="fill-white" />
                </div>
                <h3 className="font-bold text-[15px] text-neutral-950">
                  Gợi ý từ Trợ lý GreenTrip AI
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setGeneratedIdea(null)}
                className="w-9 h-9 rounded-full hover:bg-neutral-100 flex items-center justify-center text-neutral-600 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-2">
              <h4 className="font-extrabold text-[16px] text-neutral-950">
                {generatedIdea.title}
              </h4>
              <p className="text-[13px] text-neutral-600 leading-relaxed">
                {generatedIdea.summary}
              </p>
            </div>

            <div className="bg-neutral-50 rounded-2xl p-3.5 space-y-2 border border-neutral-100">
              <div className="text-xs font-bold text-neutral-600 uppercase tracking-wider">
                Khung lịch trình đề xuất:
              </div>
              {generatedIdea.days.map((dayText, idx) => (
                <div key={idx} className="flex items-start gap-2 text-xs text-neutral-800 font-medium">
                  <CheckCircle2 size={14} className="text-emerald-700 shrink-0 mt-0.5" />
                  <span>{dayText}</span>
                </div>
              ))}
            </div>

            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setGeneratedIdea(null)}
                className="min-h-[40px] px-4 py-2 rounded-full border border-neutral-200 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 cursor-pointer"
              >
                Đóng
              </button>
              <button
                type="button"
                onClick={() => {
                  onCreateTrip(generatedIdea.destination, generatedIdea.title);
                  setGeneratedIdea(null);
                }}
                className="min-h-[40px] px-5 py-2 rounded-full bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-bold cursor-pointer flex items-center gap-1.5"
              >
                <CalendarPlus size={14} />
                <span>Tạo lịch trình từ ý tưởng này</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL DIỄN ĐÀN & CẨM NANG MUST-TRY ─── */}
      {showForumModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-neutral-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <i className="ph ph-chat-centered-text text-xl text-black" />
                <h3 className="font-bold text-[16px] text-neutral-950">
                  Diễn đàn & Gói địa điểm Must-Try
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowForumModal(false)}
                className="w-9 h-9 rounded-full hover:bg-neutral-100 flex items-center justify-center text-neutral-600 cursor-pointer"
              >
                <X size={17} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              <p className="text-[13.5px] text-neutral-600 leading-relaxed">
                Nơi tổng hợp các gói địa điểm, lịch trình chuẩn và đánh giá từ cộng đồng du khách xanh. Chọn một gói bất kỳ để đưa thẳng vào kế hoạch của bạn:
              </p>

              <div className="space-y-4">
                {MUST_TRY_PACKAGES.map((pkg) => (
                  <div
                    key={pkg.id}
                    className="p-4 rounded-2xl border border-neutral-200 hover:border-neutral-900 transition flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between bg-white"
                  >
                    <div className="space-y-1 max-w-md">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                          {pkg.badge}
                        </span>
                        <span className="text-xs text-neutral-600 font-medium">{pkg.duration}</span>
                      </div>
                      <h4 className="font-bold text-[14px] text-neutral-950">{pkg.title}</h4>
                      <p className="text-xs text-neutral-600 line-clamp-1">{pkg.description}</p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        onCreateTrip(pkg.destination, pkg.title);
                        setShowForumModal(false);
                      }}
                      className="min-h-[40px] px-4 py-2 rounded-full bg-neutral-900 text-white text-xs font-bold hover:bg-neutral-800 transition shrink-0 cursor-pointer"
                    >
                      + Lên lịch trình ngay
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <OnboardingModal
        isOpen={isOnboardingOpen}
        onClose={() => setIsOnboardingOpen(false)}
      />
    </div>
  );
}
