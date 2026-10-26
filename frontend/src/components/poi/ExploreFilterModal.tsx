import React, { useState, useEffect } from 'react';
import {
  X,
  Award,
  Bus,
  Clock,
  CloudRain,
  Ticket,
} from 'lucide-react';
import type { PoiCategory } from '@/data/pois';

// ─────────────────────────────────────────────
// Types (Tab-Aware Contract)
// ─────────────────────────────────────────────
export type BudgetTier = 'all' | '$' | '$$' | '$$$' | '$$$$';
export type EcoPriority = 'all' | 'basic' | 'balanced' | 'eco' | 'pure';
export type TimeOfDay = 'morning' | 'afternoon' | 'evening';
export type PoiCategoryFilter = 'di-tich' | 'canh-quan' | 'chua' | 'quan-an' | 'bao-tang' | 'giai-tri';

export interface ExploreFilterValues {
  budget: BudgetTier;
  ecoPriority: EcoPriority;
  ecoCertifiedOnly: boolean;
  greenTransitOnly: boolean;
  categories: PoiCategoryFilter[];
  timeOfDay: TimeOfDay[];
  radiusKm: number | null; // null = tất cả
  // Dynamic Mindtrip-style facets
  cuisines: string[];
  minRating: number | null;
  openNowOnly: boolean;
  vibes: string[];
  subCategories: string[];
  rainyDayFriendly: boolean;
  freeTicketOnly: boolean;
}

export const DEFAULT_FILTER_VALUES: ExploreFilterValues = {
  budget: 'all',
  ecoPriority: 'all',
  ecoCertifiedOnly: false,
  greenTransitOnly: false,
  categories: [],
  timeOfDay: [],
  radiusKm: null,
  cuisines: [],
  minRating: null,
  openNowOnly: false,
  vibes: [],
  subCategories: [],
  rainyDayFriendly: false,
  freeTicketOnly: false,
};

interface ExploreFilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: 'all' | PoiCategory;
  values: ExploreFilterValues;
  onApply: (newValues: ExploreFilterValues) => void;
  onClearAll: () => void;
  matchingCount: number;
}

// ─────────────────────────────────────────────
// Mindtrip-Style Option Datasets
// ─────────────────────────────────────────────
const RATING_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: 'Tất cả' },
  { value: 3.5,  label: '★ 3.5+' },
  { value: 4.0,  label: '★ 4.0+' },
  { value: 4.5,  label: '★ 4.5+' },
];

const BUDGET_OPTIONS: { id: BudgetTier; label: string; desc: string }[] = [
  { id: 'all',  label: 'Tất cả', desc: 'Mọi mức giá' },
  { id: '$',    label: '$',      desc: '< 100k' },
  { id: '$$',   label: '$$',     desc: '100k – 400k' },
  { id: '$$$',  label: '$$$',    desc: '400k – 1tr' },
  { id: '$$$$', label: '$$$$',   desc: '> 1.000k' },
];

const DISTANCE_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: 'Toàn thành phố' },
  { value: 2,   label: '< 2 km' },
  { value: 5,   label: '< 5 km' },
  { value: 10,  label: '< 10 km' },
  { value: 20,  label: '< 20 km' },
];

const ECO_SEGMENTS: { id: EcoPriority; label: string; minScore: number }[] = [
  { id: 'all',      label: 'Tất cả',         minScore: 0 },
  { id: 'basic',    label: 'Cơ bản (≥30%)',   minScore: 30 },
  { id: 'balanced', label: 'Cân bằng (≥55%)', minScore: 55 },
  { id: 'eco',      label: 'Thân thiện (≥75%)', minScore: 75 },
  { id: 'pure',     label: 'Thuần sinh thái (≥90%)', minScore: 90 },
];

// Restaurant Cuisines (Curated for Da Nang & Hue)
const RESTAURANT_CUISINES: { id: string; label: string }[] = [
  { id: 'traditional_noodles',   label: 'Mì Quảng & Bún' },
  { id: 'coastal_seafood',       label: 'Hải sản tươi sống' },
  { id: 'plant_based_vegan',     label: 'Chay & Thực dưỡng' },
  { id: 'street_bites_rolls',    label: 'Bánh bèo, Nậm, Lọc' },
  { id: 'scenic_view_cafe',      label: 'Cafe view đẹp' },
  { id: 'heritage_fine_dining',  label: 'Món Cung Đình & Cơm niêu' },
  { id: 'royal_herbal_tea',      label: 'Trà Cung đình & Thảo mộc' },
  { id: 'vietnamese_local',      label: 'Bản địa xứ Quảng & Huế' },
  { id: 'italian_pizza',         label: 'Pizza & Pasta Ý' },
  { id: 'japanese_sushi',        label: 'Sushi & Đồ Nhật' },
  { id: 'korean_bbq',            label: 'Nướng & BBQ Hàn Quốc' },
  { id: 'chinese_dimsum',        label: 'Dimsum & Trung Hoa' },
  { id: 'western_steak_burger',  label: 'Steak & Món Âu' },
  { id: 'desserts_bakery',       label: 'Chè Huế & Bakery' },
];

// Restaurant Vibes
const RESTAURANT_VIBES = [
  'Yên tĩnh',
  'Sân vườn',
  'Gia đình',
  'Lãng mạn',
  'Hoài cổ',
  'Hiện đại',
  'Check-in đẹp',
  'Acoustic',
  'Làm việc',
];

// Heritage Sub-categories
const HERITAGE_SUB_CATEGORIES: { id: string; label: string }[] = [
  { id: 'imperial_citadel',        label: 'Đại Nội & Hoàng thành' },
  { id: 'royal_mausoleums',        label: 'Lăng tẩm Hoàng gia' },
  { id: 'museums_galleries',       label: 'Bảo tàng & Mỹ thuật' },
  { id: 'iconic_urban_landmarks',  label: 'Cầu & Di tích Đô thị' },
  { id: 'craft_villages',          label: 'Làng nghề truyền thống' },
  { id: 'historic_markets',        label: 'Chợ lâu đời' },
];

// Nature Landscape Sub-categories
const NATURE_SUB_CATEGORIES: { id: string; label: string }[] = [
  { id: 'beach_coastline',         label: 'Bãi biển & Bờ vịnh' },
  { id: 'mountain_pass_peninsula', label: 'Đèo dốc & Bán đảo Sơn Trà' },
  { id: 'wetland_lagoon_rivers',   label: 'Đầm phá & Sông Hương/Hàn' },
  { id: 'pine_hills_parks',        label: 'Đồi thông & Công viên' },
  { id: 'waterfalls_hotsprings',   label: 'Suối khoáng & Thác nước' },
];

// Spiritual Sub-categories
const SPIRITUAL_SUB_CATEGORIES: { id: string; label: string }[] = [
  { id: 'historic_zen_temples',         label: 'Cổ tự & Chốn tổ thiền' },
  { id: 'grand_mountain_ocean_temples', label: 'Tượng Phật & Vách núi' },
  { id: 'forest_hermitage_monasteries', label: 'Thiền viện rừng sâu' },
  { id: 'cathedrals_heritage_churches', label: 'Thánh đường Gothic' },
  { id: 'zen_retreats_healing',         label: 'Không gian tĩnh tâm' },
];

// ─────────────────────────────────────────────
// Component: ExploreFilterModal (MindTrip Standard)
// ─────────────────────────────────────────────
export const ExploreFilterModal: React.FC<ExploreFilterModalProps> = ({
  isOpen,
  onClose,
  activeTab,
  values,
  onApply,
  onClearAll,
  matchingCount,
}) => {
  const [budget, setBudget]                     = useState<BudgetTier>(values.budget);
  const [ecoPriority, setEcoPriority]           = useState<EcoPriority>(values.ecoPriority);
  const [ecoCertifiedOnly, setEcoCertifiedOnly] = useState(values.ecoCertifiedOnly);
  const [greenTransitOnly, setGreenTransitOnly] = useState(values.greenTransitOnly);
  const [radiusKm, setRadiusKm]                 = useState<number | null>(values.radiusKm);
  const [cuisines, setCuisines]                 = useState<string[]>(values.cuisines || []);
  const [minRating, setMinRating]               = useState<number | null>(values.minRating);
  const [openNowOnly, setOpenNowOnly]           = useState(values.openNowOnly);
  const [vibes, setVibes]                       = useState<string[]>(values.vibes || []);
  const [subCategories, setSubCategories]       = useState<string[]>(values.subCategories || []);
  const [rainyDayFriendly, setRainyDayFriendly] = useState(values.rainyDayFriendly);
  const [freeTicketOnly, setFreeTicketOnly]     = useState(values.freeTicketOnly);

  // Sync state on open
  useEffect(() => {
    if (isOpen) {
      setBudget(values.budget);
      setEcoPriority(values.ecoPriority);
      setEcoCertifiedOnly(values.ecoCertifiedOnly);
      setGreenTransitOnly(values.greenTransitOnly);
      setRadiusKm(values.radiusKm);
      setCuisines(values.cuisines || []);
      setMinRating(values.minRating);
      setOpenNowOnly(values.openNowOnly);
      setVibes(values.vibes || []);
      setSubCategories(values.subCategories || []);
      setRainyDayFriendly(values.rainyDayFriendly);
      setFreeTicketOnly(values.freeTicketOnly);
    }
  }, [isOpen, values]);

  // Keyboard Accessibility: Escape key closes modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isDefaultState =
    budget === 'all' &&
    ecoPriority === 'all' &&
    !ecoCertifiedOnly &&
    !greenTransitOnly &&
    radiusKm === null &&
    cuisines.length === 0 &&
    minRating === null &&
    !openNowOnly &&
    vibes.length === 0 &&
    subCategories.length === 0 &&
    !rainyDayFriendly &&
    !freeTicketOnly;

  const handleApply = () => {
    onApply({
      ...values,
      budget,
      ecoPriority,
      ecoCertifiedOnly,
      greenTransitOnly,
      radiusKm,
      cuisines,
      minRating,
      openNowOnly,
      vibes,
      subCategories,
      rainyDayFriendly,
      freeTicketOnly,
    });
    onClose();
  };

  const handleClear = () => {
    setBudget('all');
    setEcoPriority('all');
    setEcoCertifiedOnly(false);
    setGreenTransitOnly(false);
    setRadiusKm(null);
    setCuisines([]);
    setMinRating(null);
    setOpenNowOnly(false);
    setVibes([]);
    setSubCategories([]);
    setRainyDayFriendly(false);
    setFreeTicketOnly(false);
    onClearAll();
  };

  const toggleArrayItem = (list: string[], item: string, setter: React.Dispatch<React.SetStateAction<string[]>>) => {
    setter(list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);
  };

  // Header Subtitle by activeTab
  const tabSubtitle = (() => {
    switch (activeTab) {
      case 'quan-an': return 'Bộ lọc ẩm thực & trải nghiệm ăn uống';
      case 'di-tich': return 'Bộ lọc di tích lịch sử & văn hóa';
      case 'canh-quan': return 'Bộ lọc danh lam thắng cảnh';
      case 'chua': return 'Bộ lọc chùa & không gian tịnh tâm';
      default: return 'Bộ lọc khám phá địa điểm';
    }
  })();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 animate-fadeIn">
      {/* Frosted Modern Backdrop */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-neutral-950/45 backdrop-blur-[2px] transition-opacity"
        aria-hidden="true"
      />

      {/* MindTrip-Style Dialog Shell */}
      <div
        className="relative w-full max-w-[540px] bg-white rounded-[28px] shadow-2xl border border-neutral-200/90 overflow-hidden z-10 flex flex-col max-h-[86vh] animate-fadeInScale"
        role="dialog"
        aria-modal="true"
        aria-label="Bộ lọc tìm kiếm địa điểm"
      >
        {/* ── Control Header (MindTrip Minimalist Standard) ── */}
        <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 transition-colors flex items-center justify-center focus-visible:ring-2 focus-visible:ring-black focus:outline-none"
            aria-label="Đóng bảng lọc"
            title="Đóng (Esc)"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="text-center">
            <h2 className="text-base font-bold text-neutral-900 tracking-tight">
              Filters
            </h2>
            <p className="text-[11px] text-neutral-400 font-medium">
              {tabSubtitle}
            </p>
          </div>

          <div className="w-8">
            {!isDefaultState && (
              <button
                type="button"
                onClick={handleClear}
                className="text-[11px] text-neutral-500 hover:text-neutral-900 font-semibold underline underline-offset-2 transition"
                title="Đặt lại"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* ── Scrollable Body with Tab-Specific Contextual Facets ── */}
        <div className="px-6 py-5 space-y-6 overflow-y-auto overscroll-contain flex-1 scrollbar-thin">

          {/* ═════════════════════════════════════════════════════════════ */}
          {/* 1. RESTAURANTS SPECIFIC FACETS (When activeTab === 'quan-an')  */}
          {/* ═════════════════════════════════════════════════════════════ */}
          {activeTab === 'quan-an' && (
            <>
              {/* CUISINE PILLS */}
              <section className="space-y-3">
                <h3 className="text-sm font-bold text-neutral-900 tracking-tight">
                  Cuisine
                </h3>
                <div className="flex flex-wrap gap-2">
                  {RESTAURANT_CUISINES.map(({ id, label }) => {
                    const isSelected = cuisines.includes(id);
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => toggleArrayItem(cuisines, id, setCuisines)}
                        className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all active:scale-95 cursor-pointer select-none ${
                          isSelected
                            ? 'bg-neutral-900 text-white font-semibold shadow-xs'
                            : 'bg-white border border-neutral-200 text-neutral-700 hover:border-neutral-400 hover:bg-neutral-50/50'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* RATING */}
              <section className="space-y-3">
                <h3 className="text-sm font-bold text-neutral-900 tracking-tight">
                  Rating
                </h3>
                <div className="flex flex-wrap gap-2">
                  {RATING_OPTIONS.map(({ value, label }) => {
                    const isSelected = minRating === value;
                    return (
                      <button
                        key={String(value)}
                        type="button"
                        onClick={() => setMinRating(value)}
                        className={`px-4 py-1.5 rounded-full text-xs transition-all active:scale-95 cursor-pointer select-none ${
                          isSelected
                            ? 'bg-neutral-900 text-white font-semibold shadow-xs'
                            : 'bg-white border border-neutral-200 text-neutral-700 hover:border-neutral-400'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* HOURS */}
              <section className="space-y-3">
                <h3 className="text-sm font-bold text-neutral-900 tracking-tight">
                  Hours
                </h3>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setOpenNowOnly(!openNowOnly)}
                    className={`px-4 py-1.5 rounded-full text-xs transition-all active:scale-95 cursor-pointer select-none flex items-center gap-1.5 ${
                      openNowOnly
                        ? 'bg-neutral-900 text-white font-semibold shadow-xs'
                        : 'bg-white border border-neutral-200 text-neutral-700 hover:border-neutral-400'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>Đang mở cửa (Open now)</span>
                  </button>
                </div>
              </section>

              {/* FEATURES / VIBES */}
              <section className="space-y-3">
                <h3 className="text-sm font-bold text-neutral-900 tracking-tight">
                  Features & Không gian
                </h3>
                <div className="flex flex-wrap gap-2">
                  {RESTAURANT_VIBES.map((vibe) => {
                    const isSelected = vibes.includes(vibe);
                    return (
                      <button
                        key={vibe}
                        type="button"
                        onClick={() => toggleArrayItem(vibes, vibe, setVibes)}
                        className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all active:scale-95 cursor-pointer select-none ${
                          isSelected
                            ? 'bg-neutral-900 text-white font-semibold shadow-xs'
                            : 'bg-white border border-neutral-200 text-neutral-700 hover:border-neutral-400'
                        }`}
                      >
                        {vibe}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* BUDGET */}
              <section className="space-y-3">
                <h3 className="text-sm font-bold text-neutral-900 tracking-tight">
                  Budget
                </h3>
                <div className="flex flex-wrap gap-2">
                  {BUDGET_OPTIONS.map(({ id, label, desc }) => {
                    const isSelected = budget === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setBudget(id)}
                        className={`px-4 py-1.5 rounded-full text-xs transition-all active:scale-95 cursor-pointer select-none flex items-center gap-1.5 ${
                          isSelected
                            ? 'bg-neutral-900 text-white font-semibold shadow-xs'
                            : 'bg-white border border-neutral-200 text-neutral-700 hover:border-neutral-400'
                        }`}
                      >
                        <span className="font-bold">{label}</span>
                        {id !== 'all' && <span className="text-[10px] opacity-70">({desc})</span>}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* DISTANCE */}
              <section className="space-y-3">
                <h3 className="text-sm font-bold text-neutral-900 tracking-tight">
                  Distance
                </h3>
                <div className="flex flex-wrap gap-2">
                  {DISTANCE_OPTIONS.map(({ value, label }) => {
                    const isSelected = radiusKm === value;
                    return (
                      <button
                        key={String(value)}
                        type="button"
                        onClick={() => setRadiusKm(value)}
                        className={`px-3.5 py-1.5 rounded-full text-xs transition-all active:scale-95 cursor-pointer select-none ${
                          isSelected
                            ? 'bg-neutral-900 text-white font-semibold shadow-xs'
                            : 'bg-white border border-neutral-200 text-neutral-700 hover:border-neutral-400'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* GREENTRIP SUSTAINABILITY TOGGLE */}
              <section className="space-y-3 pt-1">
                <h3 className="text-sm font-bold text-neutral-900 tracking-tight">
                  Tiêu chuẩn Xanh (Green Signature)
                </h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 rounded-2xl border border-neutral-200 bg-neutral-50/40">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                        <Award className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-neutral-900">Chứng nhận Eco-Certified</p>
                        <p className="text-[10px] text-neutral-500">Giảm rác thải nhựa, ưu tiên nông sản hữu cơ bản địa</p>
                      </div>
                    </div>
                    <ModernSwitch
                      checked={ecoCertifiedOnly}
                      onChange={setEcoCertifiedOnly}
                      id="toggle-eco-restaurant"
                      ariaLabel="Chỉ hiện quán đạt chuẩn Eco"
                    />
                  </div>
                </div>
              </section>
            </>
          )}

          {/* ═════════════════════════════════════════════════════════════ */}
          {/* 2. HERITAGE / DI TÍCH FACETS (When activeTab === 'di-tich')     */}
          {/* ═════════════════════════════════════════════════════════════ */}
          {activeTab === 'di-tich' && (
            <>
              {/* SUB-CATEGORIES */}
              <section className="space-y-3">
                <h3 className="text-sm font-bold text-neutral-900 tracking-tight">
                  Loại hình di tích & lịch sử
                </h3>
                <div className="flex flex-wrap gap-2">
                  {HERITAGE_SUB_CATEGORIES.map(({ id, label }) => {
                    const isSelected = subCategories.includes(id);
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => toggleArrayItem(subCategories, id, setSubCategories)}
                        className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all active:scale-95 cursor-pointer select-none ${
                          isSelected
                            ? 'bg-neutral-900 text-white font-semibold shadow-xs'
                            : 'bg-white border border-neutral-200 text-neutral-700 hover:border-neutral-400'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* RATING */}
              <section className="space-y-3">
                <h3 className="text-sm font-bold text-neutral-900 tracking-tight">
                  Rating
                </h3>
                <div className="flex flex-wrap gap-2">
                  {RATING_OPTIONS.map(({ value, label }) => {
                    const isSelected = minRating === value;
                    return (
                      <button
                        key={String(value)}
                        type="button"
                        onClick={() => setMinRating(value)}
                        className={`px-4 py-1.5 rounded-full text-xs transition-all active:scale-95 cursor-pointer select-none ${
                          isSelected
                            ? 'bg-neutral-900 text-white font-semibold shadow-xs'
                            : 'bg-white border border-neutral-200 text-neutral-700 hover:border-neutral-400'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* EXPERIENCE FEATURES */}
              <section className="space-y-3">
                <h3 className="text-sm font-bold text-neutral-900 tracking-tight">
                  Đặc điểm tham quan
                </h3>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setRainyDayFriendly(!rainyDayFriendly)}
                    className={`px-3.5 py-1.5 rounded-full text-xs transition-all active:scale-95 cursor-pointer select-none flex items-center gap-1.5 ${
                      rainyDayFriendly
                        ? 'bg-neutral-900 text-white font-semibold shadow-xs'
                        : 'bg-white border border-neutral-200 text-neutral-700 hover:border-neutral-400'
                    }`}
                  >
                    <CloudRain className="w-3.5 h-3.5" />
                    <span>Phù hợp ngày mưa (Rainy-day)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFreeTicketOnly(!freeTicketOnly)}
                    className={`px-3.5 py-1.5 rounded-full text-xs transition-all active:scale-95 cursor-pointer select-none flex items-center gap-1.5 ${
                      freeTicketOnly
                        ? 'bg-neutral-900 text-white font-semibold shadow-xs'
                        : 'bg-white border border-neutral-200 text-neutral-700 hover:border-neutral-400'
                    }`}
                  >
                    <Ticket className="w-3.5 h-3.5" />
                    <span>Miễn phí vé vào cổng</span>
                  </button>
                </div>
              </section>

              {/* ECO PRIORITY */}
              <section className="space-y-3">
                <h3 className="text-sm font-bold text-neutral-900 tracking-tight">
                  Mức độ Ưu tiên Xanh
                </h3>
                <div className="flex flex-wrap gap-2">
                  {ECO_SEGMENTS.map(({ id, label }) => {
                    const isSelected = ecoPriority === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setEcoPriority(id)}
                        className={`px-3.5 py-1.5 rounded-full text-xs transition-all active:scale-95 cursor-pointer select-none ${
                          isSelected
                            ? 'bg-emerald-800 text-white font-semibold shadow-xs'
                            : 'bg-white border border-neutral-200 text-neutral-700 hover:border-neutral-400'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* DISTANCE */}
              <section className="space-y-3">
                <h3 className="text-sm font-bold text-neutral-900 tracking-tight">
                  Distance
                </h3>
                <div className="flex flex-wrap gap-2">
                  {DISTANCE_OPTIONS.map(({ value, label }) => {
                    const isSelected = radiusKm === value;
                    return (
                      <button
                        key={String(value)}
                        type="button"
                        onClick={() => setRadiusKm(value)}
                        className={`px-3.5 py-1.5 rounded-full text-xs transition-all active:scale-95 cursor-pointer select-none ${
                          isSelected
                            ? 'bg-neutral-900 text-white font-semibold shadow-xs'
                            : 'bg-white border border-neutral-200 text-neutral-700 hover:border-neutral-400'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </section>
            </>
          )}

          {/* ═════════════════════════════════════════════════════════════ */}
          {/* 3. NATURE FACETS (When activeTab === 'canh-quan')              */}
          {/* ═════════════════════════════════════════════════════════════ */}
          {activeTab === 'canh-quan' && (
            <>
              {/* SUB-CATEGORIES */}
              <section className="space-y-3">
                <h3 className="text-sm font-bold text-neutral-900 tracking-tight">
                  Loại hình cảnh quan
                </h3>
                <div className="flex flex-wrap gap-2">
                  {NATURE_SUB_CATEGORIES.map(({ id, label }) => {
                    const isSelected = subCategories.includes(id);
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => toggleArrayItem(subCategories, id, setSubCategories)}
                        className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all active:scale-95 cursor-pointer select-none ${
                          isSelected
                            ? 'bg-neutral-900 text-white font-semibold shadow-xs'
                            : 'bg-white border border-neutral-200 text-neutral-700 hover:border-neutral-400'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* RATING */}
              <section className="space-y-3">
                <h3 className="text-sm font-bold text-neutral-900 tracking-tight">
                  Rating
                </h3>
                <div className="flex flex-wrap gap-2">
                  {RATING_OPTIONS.map(({ value, label }) => {
                    const isSelected = minRating === value;
                    return (
                      <button
                        key={String(value)}
                        type="button"
                        onClick={() => setMinRating(value)}
                        className={`px-4 py-1.5 rounded-full text-xs transition-all active:scale-95 cursor-pointer select-none ${
                          isSelected
                            ? 'bg-neutral-900 text-white font-semibold shadow-xs'
                            : 'bg-white border border-neutral-200 text-neutral-700 hover:border-neutral-400'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* EXPERIENCE FEATURES */}
              <section className="space-y-3">
                <h3 className="text-sm font-bold text-neutral-900 tracking-tight">
                  Tiện ích & Trải nghiệm
                </h3>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setRainyDayFriendly(!rainyDayFriendly)}
                    className={`px-3.5 py-1.5 rounded-full text-xs transition-all active:scale-95 cursor-pointer select-none flex items-center gap-1.5 ${
                      rainyDayFriendly
                        ? 'bg-neutral-900 text-white font-semibold shadow-xs'
                        : 'bg-white border border-neutral-200 text-neutral-700 hover:border-neutral-400'
                    }`}
                  >
                    <CloudRain className="w-3.5 h-3.5" />
                    <span>Phù hợp ngày mưa</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFreeTicketOnly(!freeTicketOnly)}
                    className={`px-3.5 py-1.5 rounded-full text-xs transition-all active:scale-95 cursor-pointer select-none flex items-center gap-1.5 ${
                      freeTicketOnly
                        ? 'bg-neutral-900 text-white font-semibold shadow-xs'
                        : 'bg-white border border-neutral-200 text-neutral-700 hover:border-neutral-400'
                    }`}
                  >
                    <Ticket className="w-3.5 h-3.5" />
                    <span>Miễn phí vé</span>
                  </button>
                </div>
              </section>

              {/* ECO PRIORITY */}
              <section className="space-y-3">
                <h3 className="text-sm font-bold text-neutral-900 tracking-tight">
                  Mức độ Ưu tiên Xanh
                </h3>
                <div className="flex flex-wrap gap-2">
                  {ECO_SEGMENTS.map(({ id, label }) => {
                    const isSelected = ecoPriority === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setEcoPriority(id)}
                        className={`px-3.5 py-1.5 rounded-full text-xs transition-all active:scale-95 cursor-pointer select-none ${
                          isSelected
                            ? 'bg-emerald-800 text-white font-semibold shadow-xs'
                            : 'bg-white border border-neutral-200 text-neutral-700 hover:border-neutral-400'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* DISTANCE */}
              <section className="space-y-3">
                <h3 className="text-sm font-bold text-neutral-900 tracking-tight">
                  Distance
                </h3>
                <div className="flex flex-wrap gap-2">
                  {DISTANCE_OPTIONS.map(({ value, label }) => {
                    const isSelected = radiusKm === value;
                    return (
                      <button
                        key={String(value)}
                        type="button"
                        onClick={() => setRadiusKm(value)}
                        className={`px-3.5 py-1.5 rounded-full text-xs transition-all active:scale-95 cursor-pointer select-none ${
                          isSelected
                            ? 'bg-neutral-900 text-white font-semibold shadow-xs'
                            : 'bg-white border border-neutral-200 text-neutral-700 hover:border-neutral-400'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </section>
            </>
          )}

          {/* ═════════════════════════════════════════════════════════════ */}
          {/* 4. SPIRITUAL / CHÙA FACETS (When activeTab === 'chua')         */}
          {/* ═════════════════════════════════════════════════════════════ */}
          {activeTab === 'chua' && (
            <>
              {/* SUB-CATEGORIES */}
              <section className="space-y-3">
                <h3 className="text-sm font-bold text-neutral-900 tracking-tight">
                  Không gian thờ tự & tâm linh
                </h3>
                <div className="flex flex-wrap gap-2">
                  {SPIRITUAL_SUB_CATEGORIES.map(({ id, label }) => {
                    const isSelected = subCategories.includes(id);
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => toggleArrayItem(subCategories, id, setSubCategories)}
                        className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all active:scale-95 cursor-pointer select-none ${
                          isSelected
                            ? 'bg-neutral-900 text-white font-semibold shadow-xs'
                            : 'bg-white border border-neutral-200 text-neutral-700 hover:border-neutral-400'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* RATING */}
              <section className="space-y-3">
                <h3 className="text-sm font-bold text-neutral-900 tracking-tight">
                  Rating
                </h3>
                <div className="flex flex-wrap gap-2">
                  {RATING_OPTIONS.map(({ value, label }) => {
                    const isSelected = minRating === value;
                    return (
                      <button
                        key={String(value)}
                        type="button"
                        onClick={() => setMinRating(value)}
                        className={`px-4 py-1.5 rounded-full text-xs transition-all active:scale-95 cursor-pointer select-none ${
                          isSelected
                            ? 'bg-neutral-900 text-white font-semibold shadow-xs'
                            : 'bg-white border border-neutral-200 text-neutral-700 hover:border-neutral-400'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* FEATURES */}
              <section className="space-y-3">
                <h3 className="text-sm font-bold text-neutral-900 tracking-tight">
                  Đặc điểm
                </h3>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setRainyDayFriendly(!rainyDayFriendly)}
                    className={`px-3.5 py-1.5 rounded-full text-xs transition-all active:scale-95 cursor-pointer select-none flex items-center gap-1.5 ${
                      rainyDayFriendly
                        ? 'bg-neutral-900 text-white font-semibold shadow-xs'
                        : 'bg-white border border-neutral-200 text-neutral-700 hover:border-neutral-400'
                    }`}
                  >
                    <CloudRain className="w-3.5 h-3.5" />
                    <span>Phù hợp ngày mưa</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFreeTicketOnly(!freeTicketOnly)}
                    className={`px-3.5 py-1.5 rounded-full text-xs transition-all active:scale-95 cursor-pointer select-none flex items-center gap-1.5 ${
                      freeTicketOnly
                        ? 'bg-neutral-900 text-white font-semibold shadow-xs'
                        : 'bg-white border border-neutral-200 text-neutral-700 hover:border-neutral-400'
                    }`}
                  >
                    <Ticket className="w-3.5 h-3.5" />
                    <span>Miễn phí vé / Tham quan tự do</span>
                  </button>
                </div>
              </section>

              {/* ECO PRIORITY */}
              <section className="space-y-3">
                <h3 className="text-sm font-bold text-neutral-900 tracking-tight">
                  Mức độ Ưu tiên Xanh
                </h3>
                <div className="flex flex-wrap gap-2">
                  {ECO_SEGMENTS.map(({ id, label }) => {
                    const isSelected = ecoPriority === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setEcoPriority(id)}
                        className={`px-3.5 py-1.5 rounded-full text-xs transition-all active:scale-95 cursor-pointer select-none ${
                          isSelected
                            ? 'bg-emerald-800 text-white font-semibold shadow-xs'
                            : 'bg-white border border-neutral-200 text-neutral-700 hover:border-neutral-400'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* DISTANCE */}
              <section className="space-y-3">
                <h3 className="text-sm font-bold text-neutral-900 tracking-tight">
                  Distance
                </h3>
                <div className="flex flex-wrap gap-2">
                  {DISTANCE_OPTIONS.map(({ value, label }) => {
                    const isSelected = radiusKm === value;
                    return (
                      <button
                        key={String(value)}
                        type="button"
                        onClick={() => setRadiusKm(value)}
                        className={`px-3.5 py-1.5 rounded-full text-xs transition-all active:scale-95 cursor-pointer select-none ${
                          isSelected
                            ? 'bg-neutral-900 text-white font-semibold shadow-xs'
                            : 'bg-white border border-neutral-200 text-neutral-700 hover:border-neutral-400'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </section>
            </>
          )}

          {/* ═════════════════════════════════════════════════════════════ */}
          {/* 5. ALL TAB MACRO FACETS (When activeTab === 'all')             */}
          {/* ═════════════════════════════════════════════════════════════ */}
          {activeTab === 'all' && (
            <>
              {/* ECO PRIORITY */}
              <section className="space-y-3">
                <h3 className="text-sm font-bold text-neutral-900 tracking-tight">
                  Mức độ Ưu tiên Xanh (Eco Level)
                </h3>
                <div className="flex flex-wrap gap-2">
                  {ECO_SEGMENTS.map(({ id, label }) => {
                    const isSelected = ecoPriority === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setEcoPriority(id)}
                        className={`px-3.5 py-1.5 rounded-full text-xs transition-all active:scale-95 cursor-pointer select-none ${
                          isSelected
                            ? 'bg-emerald-800 text-white font-semibold shadow-xs'
                            : 'bg-white border border-neutral-200 text-neutral-700 hover:border-neutral-400'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* RATING */}
              <section className="space-y-3">
                <h3 className="text-sm font-bold text-neutral-900 tracking-tight">
                  Rating
                </h3>
                <div className="flex flex-wrap gap-2">
                  {RATING_OPTIONS.map(({ value, label }) => {
                    const isSelected = minRating === value;
                    return (
                      <button
                        key={String(value)}
                        type="button"
                        onClick={() => setMinRating(value)}
                        className={`px-4 py-1.5 rounded-full text-xs transition-all active:scale-95 cursor-pointer select-none ${
                          isSelected
                            ? 'bg-neutral-900 text-white font-semibold shadow-xs'
                            : 'bg-white border border-neutral-200 text-neutral-700 hover:border-neutral-400'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* BUDGET */}
              <section className="space-y-3">
                <h3 className="text-sm font-bold text-neutral-900 tracking-tight">
                  Budget
                </h3>
                <div className="flex flex-wrap gap-2">
                  {BUDGET_OPTIONS.map(({ id, label, desc }) => {
                    const isSelected = budget === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setBudget(id)}
                        className={`px-4 py-1.5 rounded-full text-xs transition-all active:scale-95 cursor-pointer select-none flex items-center gap-1.5 ${
                          isSelected
                            ? 'bg-neutral-900 text-white font-semibold shadow-xs'
                            : 'bg-white border border-neutral-200 text-neutral-700 hover:border-neutral-400'
                        }`}
                      >
                        <span className="font-bold">{label}</span>
                        {id !== 'all' && <span className="text-[10px] opacity-70">({desc})</span>}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* FEATURES */}
              <section className="space-y-3">
                <h3 className="text-sm font-bold text-neutral-900 tracking-tight">
                  Đặc điểm nổi bật
                </h3>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setRainyDayFriendly(!rainyDayFriendly)}
                    className={`px-3.5 py-1.5 rounded-full text-xs transition-all active:scale-95 cursor-pointer select-none flex items-center gap-1.5 ${
                      rainyDayFriendly
                        ? 'bg-neutral-900 text-white font-semibold shadow-xs'
                        : 'bg-white border border-neutral-200 text-neutral-700 hover:border-neutral-400'
                    }`}
                  >
                    <CloudRain className="w-3.5 h-3.5" />
                    <span>Phù hợp ngày mưa</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFreeTicketOnly(!freeTicketOnly)}
                    className={`px-3.5 py-1.5 rounded-full text-xs transition-all active:scale-95 cursor-pointer select-none flex items-center gap-1.5 ${
                      freeTicketOnly
                        ? 'bg-neutral-900 text-white font-semibold shadow-xs'
                        : 'bg-white border border-neutral-200 text-neutral-700 hover:border-neutral-400'
                    }`}
                  >
                    <Ticket className="w-3.5 h-3.5" />
                    <span>Miễn phí vé vào cổng</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setOpenNowOnly(!openNowOnly)}
                    className={`px-3.5 py-1.5 rounded-full text-xs transition-all active:scale-95 cursor-pointer select-none flex items-center gap-1.5 ${
                      openNowOnly
                        ? 'bg-neutral-900 text-white font-semibold shadow-xs'
                        : 'bg-white border border-neutral-200 text-neutral-700 hover:border-neutral-400'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>Đang mở cửa</span>
                  </button>
                </div>
              </section>

              {/* DISTANCE */}
              <section className="space-y-3">
                <h3 className="text-sm font-bold text-neutral-900 tracking-tight">
                  Distance
                </h3>
                <div className="flex flex-wrap gap-2">
                  {DISTANCE_OPTIONS.map(({ value, label }) => {
                    const isSelected = radiusKm === value;
                    return (
                      <button
                        key={String(value)}
                        type="button"
                        onClick={() => setRadiusKm(value)}
                        className={`px-3.5 py-1.5 rounded-full text-xs transition-all active:scale-95 cursor-pointer select-none ${
                          isSelected
                            ? 'bg-neutral-900 text-white font-semibold shadow-xs'
                            : 'bg-white border border-neutral-200 text-neutral-700 hover:border-neutral-400'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* SUSTAINABILITY TOGGLES */}
              <section className="space-y-3 pt-1">
                <h3 className="text-sm font-bold text-neutral-900 tracking-tight">
                  Tiêu chuẩn Xanh & Di chuyển
                </h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 rounded-2xl border border-neutral-200 bg-neutral-50/40">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                        <Award className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-neutral-900">Chứng nhận Eco-Certified</p>
                        <p className="text-[10px] text-neutral-500">Giảm phát thải, bảo tồn thiên nhiên & văn hóa</p>
                      </div>
                    </div>
                    <ModernSwitch
                      checked={ecoCertifiedOnly}
                      onChange={setEcoCertifiedOnly}
                      id="toggle-eco-certified"
                      ariaLabel="Chỉ điểm đạt chứng nhận Eco-Certified"
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-2xl border border-neutral-200 bg-neutral-50/40">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                        <Bus className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-neutral-900">Thuận tiện di chuyển xanh</p>
                        <p className="text-[10px] text-neutral-500">Gần tuyến xe buýt điện DanangBus hoặc trạm xe đạp công cộng</p>
                      </div>
                    </div>
                    <ModernSwitch
                      checked={greenTransitOnly}
                      onChange={setGreenTransitOnly}
                      id="toggle-green-transit"
                      ariaLabel="Chỉ điểm thuận tiện di chuyển xanh"
                    />
                  </div>
                </div>
              </section>
            </>
          )}

        </div>

        {/* ── MindTrip-Style Sticky Bottom Footer ── */}
        <div className="px-6 py-4 bg-white border-t border-neutral-100 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={handleClear}
            disabled={isDefaultState}
            className={`text-xs font-semibold transition-all ${
              isDefaultState
                ? 'text-neutral-300 cursor-not-allowed'
                : 'text-neutral-600 hover:text-black underline underline-offset-4 cursor-pointer'
            }`}
          >
            Clear all
          </button>

          {/* Primary Action Button (Solid Black Rounded-Full Pill matching MindTrip 'Show places') */}
          <button
            type="button"
            onClick={handleApply}
            className="px-8 py-3 rounded-full bg-neutral-900 hover:bg-black active:scale-95 text-white text-xs font-bold tracking-tight transition-all shadow-md hover:shadow-lg focus-visible:ring-2 focus-visible:ring-black focus:outline-none cursor-pointer flex items-center gap-2"
          >
            <span>Show places</span>
            <span className="w-1.5 h-1.5 rounded-full bg-white/40" />
            <span className="font-mono text-neutral-300 font-bold">
              {matchingCount}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// Sub-component: Clean Modern iOS-style Switch
// ─────────────────────────────────────────────
interface ModernSwitchProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  id: string;
  ariaLabel: string;
}

function ModernSwitch({ checked, onChange, id, ariaLabel }: ModernSwitchProps) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-label={ariaLabel}
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:ring-2 focus-visible:ring-black focus:outline-none ${
        checked ? 'bg-neutral-900' : 'bg-neutral-200'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

export default ExploreFilterModal;
