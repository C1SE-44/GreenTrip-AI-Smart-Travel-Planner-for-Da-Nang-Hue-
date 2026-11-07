import React, { useState, useEffect } from 'react';
import {
  X,
  Clock,
  Sparkles,
  Star,
  Check,
  Loader2,
  Compass,
  ArrowRight,
  RotateCcw,
  Scale,
  Leaf,
  Wallet,
  Trees,
  Landmark,
  Camera,
  UtensilsCrossed,
  Users,
  Coffee,
  Waves,
  Salad,
  Utensils,
  Heart,
  Building2,
  ShoppingBag,
  Mountain,
  Droplets,
  Church,
  MapPin,
} from 'lucide-react';
import type { PoiCategory } from '@/data/pois';
import { normalizeSliderWeights } from '@/services/poi';

// ─────────────────────────────────────────────
// Types & Contracts
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
  radiusKm: number | null;
  cuisines: string[];
  minRating: number | null;
  openNowOnly: boolean;
  vibes: string[];
  subCategories: string[];
  rainyDayFriendly: boolean;
  freeTicketOnly: boolean;
  greenWeight: number;
  budgetWeight: number;
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
  greenWeight: 50,
  budgetWeight: 50,
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
// Traveler-Centric Datasets & Labels (Ngôn ngữ du khách)
// ─────────────────────────────────────────────
const RATING_OPTIONS: { value: number | null; score: string; travelerTag: string; icon: typeof Star }[] = [
  { value: null, score: 'Tất cả', travelerTag: 'Mọi mức sao', icon: Star },
  { value: 3.5, score: '3.5★+', travelerTag: 'Hài lòng', icon: Star },
  { value: 4.0, score: '4.0★+', travelerTag: 'Rất tốt', icon: Star },
  { value: 4.5, score: '4.5★+', travelerTag: 'Xuất sắc', icon: Star },
];

const BUDGET_OPTIONS: { id: BudgetTier; label: string; desc: string; detail: string; sub: string }[] = [
  { id: 'all', label: 'Tất cả', desc: 'Mọi mức giá', detail: 'Tự do ngân sách', sub: 'Mọi ngân sách' },
  { id: '$', label: '$', desc: 'Bình dân', detail: '< 100k', sub: 'Chợ đêm, vỉa hè' },
  { id: '$$', label: '$$', desc: 'Tiêu chuẩn', detail: '100k – 400k', sub: 'Nhà hàng đặc sản' },
  { id: '$$$', label: '$$$', desc: 'Thoải mái', detail: '400k – 1tr', sub: 'Không gian cao cấp' },
  { id: '$$$$', label: '$$$$', desc: 'Sang trọng', detail: '> 1 triệu', sub: 'Fine dining / 5 sao' },
];

const RADIUS_OPTIONS: { value: number | null; label: string; desc: string }[] = [
  { value: null, label: 'Tất cả', desc: 'Toàn thành phố' },
  { value: 1, label: '1 km', desc: 'Đi bộ gần' },
  { value: 3, label: '3 km', desc: 'Xe đạp / Xe máy' },
  { value: 5, label: '5 km', desc: 'Trung tâm' },
  { value: 10, label: '10 km', desc: 'Ngoại ô / Bán đảo' },
];

const TIME_OPTIONS: { value: TimeOfDay | 'all'; label: string; desc: string }[] = [
  { value: 'all', label: 'Tất cả', desc: 'Mọi thời điểm' },
  { value: 'morning', label: 'Ban ngày', desc: 'Sáng – Chiều' },
  { value: 'evening', label: 'Buổi tối', desc: 'Sau 17:00' },
];

// Curated Travel Vibes giàu cảm xúc trải nghiệm (100% có Icon đồng bộ)
const ALL_TAB_VIBES: { id: string; label: string; icon: typeof Trees }[] = [
  { id: 'Khám phá ngoài trời & Thiên nhiên', label: 'Khám phá ngoài trời & Thiên nhiên', icon: Trees },
  { id: 'Di sản & Dấu ấn Cố Đô', label: 'Di sản & Dấu ấn Cố Đô', icon: Landmark },
  { id: 'Lối sống xanh & Sinh thái', label: 'Lối sống xanh & Sinh thái', icon: Leaf },
  { id: 'Chữa lành & Thư giãn tĩnh tâm', label: 'Chữa lành & Thư giãn tĩnh tâm', icon: Sparkles },
  { id: 'Góc chụp đẹp & Sống ảo', label: 'Góc chụp đẹp & Sống ảo', icon: Camera },
  { id: 'Đặc sản địa phương xứ Quảng - Huế', label: 'Đặc sản địa phương xứ Quảng - Huế', icon: UtensilsCrossed },
  { id: 'Phù hợp gia đình & Trẻ nhỏ', label: 'Phù hợp gia đình & Trẻ nhỏ', icon: Users },
];

const RESTAURANT_FACETS: { id: string; label: string; icon: typeof UtensilsCrossed }[] = [
  { id: 'traditional_noodles', label: 'Mì Quảng & Bún bò chuẩn vị', icon: UtensilsCrossed },
  { id: 'coastal_seafood', label: 'Hải sản tươi sống miền biển', icon: Waves },
  { id: 'plant_based_vegan', label: 'Cơm chay & Thực dưỡng thanh tịnh', icon: Salad },
  { id: 'street_bites_rolls', label: 'Bánh bèo, Nậm, Lọc truyền thống', icon: Utensils },
  { id: 'scenic_view_cafe', label: 'Cafe view biển, sông Hương & phố', icon: Coffee },
  { id: 'heritage_fine_dining', label: 'Cơm niêu & Ẩm thực Cung đình', icon: Landmark },
  { id: 'royal_herbal_tea', label: 'Trà Cung đình Huế & Thảo mộc', icon: Sparkles },
  { id: 'desserts_bakery', label: 'Chè Hẻm xứ Huế & Tiệm bánh ngọt', icon: Heart },
];

const HERITAGE_FACETS: { id: string; label: string; icon: typeof Landmark }[] = [
  { id: 'imperial_citadel', label: 'Đại Nội & Hoàng cung triều Nguyễn', icon: Landmark },
  { id: 'royal_mausoleums', label: 'Lăng tẩm các vị Vua triều Nguyễn', icon: Building2 },
  { id: 'museums_galleries', label: 'Bảo tàng & Di tích cổ vật', icon: Compass },
  { id: 'iconic_urban_landmarks', label: 'Cầu biểu tượng & Dấu ấn phố thị', icon: MapPin },
  { id: 'craft_villages', label: 'Làng nghề truyền thống lâu đời', icon: Sparkles },
  { id: 'historic_markets', label: 'Chợ lâu năm (Đông Ba, Hàn, Cồn)', icon: ShoppingBag },
];

const NATURE_FACETS: { id: string; label: string; icon: typeof Mountain }[] = [
  { id: 'beach_coastline', label: 'Bãi biển Mỹ Khê & Vịnh Lăng Cô', icon: Waves },
  { id: 'mountain_pass_peninsula', label: 'Cung đèo Hải Vân & Bán đảo Sơn Trà', icon: Mountain },
  { id: 'wetland_lagoon_rivers', label: 'Đầm phá Tam Giang & Sông Hương', icon: Compass },
  { id: 'pine_hills_parks', label: 'Đồi thông Thiên An & Công viên xanh', icon: Trees },
  { id: 'waterfalls_hotsprings', label: 'Suối khoáng nóng & Thác nước tự nhiên', icon: Droplets },
];

const SPIRITUAL_FACETS: { id: string; label: string; icon: typeof Church }[] = [
  { id: 'historic_zen_temples', label: 'Cổ tự Thiên Mụ & Chốn tổ linh thiêng', icon: Landmark },
  { id: 'grand_mountain_ocean_temples', label: 'Tượng Phật & Vách đá Ngũ Hành Sơn', icon: Mountain },
  { id: 'forest_hermitage_monasteries', label: 'Thiền viện Trúc Lâm giữa rừng thông', icon: Trees },
  { id: 'cathedrals_heritage_churches', label: 'Nhà thờ Con Gà & Kiến trúc Gothic', icon: Church },
  { id: 'zen_retreats_healing', label: 'Không gian thiền tịnh & Bình an tâm hồn', icon: Heart },
];

// Presets thân thiện với gu du lịch (Chuẩn hóa Segmented Card 2 tầng có Icon)
const WEIGHT_PRESETS = [
  { label: 'Hài hòa', sub: '50% • 50%', desc: 'Cân bằng trải nghiệm & ví tiền', icon: Scale, g: 50, b: 50 },
  { label: 'Ưu tiên Xanh', sub: '80% • 20%', desc: 'Yêu thiên nhiên & môi trường', icon: Leaf, g: 80, b: 20 },
  { label: '100% Sinh thái', sub: '100% Xanh', desc: 'Trải nghiệm du lịch bền vững', icon: Sparkles, g: 100, b: 0 },
  { label: 'Tiết kiệm', sub: '20% • 80%', desc: 'Tối ưu ngân sách chuyến đi', icon: Wallet, g: 20, b: 80 },
] as const;

// ─────────────────────────────────────────────
// Design Tokens (Chuẩn hóa 2 Hình thái Duy nhất)
// ─────────────────────────────────────────────
const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-1';

// 1. Hình thái Single-Select: Nút khối phẳng đơn tầng (Gu du lịch, Ngân sách, Đánh giá)
const SEGMENTED_BUTTON_BASE =
  `min-h-[38px] py-1 px-2 rounded-xl border flex items-center justify-center text-center transition-all cursor-pointer select-none active:scale-[0.97] ${FOCUS_RING}`;
const SEGMENTED_BUTTON_SELECTED =
  'bg-emerald-800 border-emerald-800 text-white shadow-[0_2px_8px_rgba(6,95,70,0.22)]';
const SEGMENTED_BUTTON_UNSELECTED =
  'bg-white border-[#E2E8E4] text-neutral-800 hover:border-emerald-300 hover:bg-emerald-50/40';

// 2. Hình thái Multi-Select: Thẻ Pill bo tròn có Icon đồng bộ (Cảm xúc & Phong cách)
const PILL_CHIP_BASE =
  `min-h-[36px] px-3.5 py-1.5 rounded-full text-xs transition-all duration-150 active:scale-[0.97] cursor-pointer select-none border flex items-center justify-center gap-1.5 whitespace-nowrap ${FOCUS_RING}`;
const PILL_CHIP_SELECTED =
  'bg-emerald-800 border-emerald-800 text-white font-semibold shadow-[0_2px_8px_rgba(6,95,70,0.22)]';
const PILL_CHIP_UNSELECTED =
  'bg-white border-[#E2E8E4] text-neutral-800 font-medium hover:border-emerald-300 hover:bg-emerald-50/40';

// ─────────────────────────────────────────────
// Component: ExploreFilterModal (Phương Án 1: 3 Card Tinh Gọn)
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
  const [budget, setBudget] = useState<BudgetTier>(values.budget);
  const [minRating, setMinRating] = useState<number | null>(values.minRating);
  const [radiusKm, setRadiusKm] = useState<number | null>(values.radiusKm ?? null);
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay[]>(values.timeOfDay || []);
  const [ecoCertifiedOnly, setEcoCertifiedOnly] = useState<boolean>(values.ecoCertifiedOnly ?? false);
  const [vibes, setVibes] = useState<string[]>(values.vibes || []);
  const [subCategories, setSubCategories] = useState<string[]>(values.subCategories || []);
  const [cuisines, setCuisines] = useState<string[]>(values.cuisines || []);
  const [greenWeight, setGreenWeight] = useState<number>(values.greenWeight ?? 50);
  const [budgetWeight, setBudgetWeight] = useState<number>(values.budgetWeight ?? 50);

  const [isApplying, setIsApplying] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setBudget(values.budget);
      setMinRating(values.minRating);
      setRadiusKm(values.radiusKm ?? null);
      setTimeOfDay(values.timeOfDay || []);
      setEcoCertifiedOnly(values.ecoCertifiedOnly ?? false);
      setVibes(values.vibes || []);
      setSubCategories(values.subCategories || []);
      setCuisines(values.cuisines || []);
      setGreenWeight(values.greenWeight ?? 50);
      setBudgetWeight(values.budgetWeight ?? 50);
      setIsApplying(false);
    }
  }, [isOpen, values]);

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
    minRating === null &&
    radiusKm === null &&
    timeOfDay.length === 0 &&
    ecoCertifiedOnly === false &&
    vibes.length === 0 &&
    subCategories.length === 0 &&
    cuisines.length === 0 &&
    greenWeight === 50 &&
    budgetWeight === 50;

  const handleApplyWithFeedback = () => {
    setIsApplying(true);
    setTimeout(() => {
      onApply({
        ...values,
        budget,
        minRating,
        radiusKm,
        timeOfDay,
        ecoCertifiedOnly,
        vibes,
        subCategories,
        cuisines,
        greenWeight,
        budgetWeight,
      });
      setIsApplying(false);
      onClose();
    }, 200);
  };

  const handleClear = () => {
    setBudget('all');
    setMinRating(null);
    setRadiusKm(null);
    setTimeOfDay([]);
    setEcoCertifiedOnly(false);
    setVibes([]);
    setSubCategories([]);
    setCuisines([]);
    setGreenWeight(50);
    setBudgetWeight(50);
    onClearAll();
  };

  const toggleArrayItem = (
    list: string[],
    item: string,
    setter: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    setter(list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);
  };

  const { normGreen } = normalizeSliderWeights(greenWeight, budgetWeight);
  const greenPct = Math.round(normGreen * 100);

  const activeVibesCount =
    activeTab === 'all'
      ? vibes.length
      : activeTab === 'quan-an'
        ? cuisines.length
        : subCategories.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 animate-fadeIn">
      {/* 1. Backdrop */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-[#0E1712]/45 backdrop-blur-[5px] transition-opacity duration-200"
        aria-hidden="true"
      />

      {/* 2. Dialog Shell */}
      <div
        className="relative w-full max-w-[540px] bg-[#F7FAF7] rounded-[28px] shadow-[0_24px_60px_-12px_rgba(18,34,24,0.18),0_6px_24px_-6px_rgba(18,34,24,0.08)] ring-1 ring-neutral-900/5 overflow-hidden z-10 flex flex-col max-h-[92vh] sm:max-h-[85vh] animate-fadeInScale"
        role="dialog"
        aria-modal="true"
        aria-labelledby="explore-filter-modal-title"
      >
        {/* ── HEADER (Ấm áp, định hướng du khách) ── */}
        <div className="px-5 sm:px-6 py-3.5 bg-white border-b border-neutral-200/70 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-800 shrink-0">
              <Compass className="w-4 h-4" />
            </div>
            <div>
              <h2
                id="explore-filter-modal-title"
                className="text-base font-bold text-neutral-900 tracking-tight leading-tight"
              >
                Tùy chọn chuyến đi lý tưởng
              </h2>
              <p className="text-[11px] text-neutral-500 font-medium truncate mt-0.5">
                {activeTab === 'all'
                  ? 'Gợi ý điểm đến theo phong cách & ngân sách của bạn'
                  : activeTab === 'quan-an'
                    ? 'Khám phá ẩm thực & đặc sản Đà Nẵng - Huế'
                    : activeTab === 'di-tich'
                      ? 'Hành trình di sản & dấu ấn Cố Đô lịch sử'
                      : activeTab === 'canh-quan'
                        ? 'Danh lam thắng cảnh & thiên nhiên nguyên sơ'
                        : 'Chùa cổ thanh tịnh & không gian tĩnh tâm'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {!isDefaultState && (
              <button
                type="button"
                onClick={handleClear}
                className="text-xs text-neutral-600 hover:text-neutral-950 font-semibold underline underline-offset-2 transition px-2 py-1 rounded cursor-pointer"
                title="Bỏ toàn bộ tiêu chí về mặc định ban đầu"
              >
                Đặt lại
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className={`w-8 h-8 rounded-full bg-neutral-100 hover:bg-neutral-200/80 text-neutral-600 hover:text-neutral-950 active:scale-95 transition flex items-center justify-center cursor-pointer shrink-0 ${FOCUS_RING}`}
              aria-label="Đóng bảng lọc"
              title="Đóng (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── SCROLLABLE BODY (3 Card Tinh Gọn) ── */}
        <div className="px-5 sm:px-6 py-4 space-y-3.5 overflow-y-auto overscroll-contain flex-1 auto-hide-scrollbar">
          
          {/* ══════════════════════════════════════════════════════
              TẦNG 1: BỘ LỌC CHUNG (GIÁ THỰC, BÁN KÍNH, THỜI ĐIỂM, CHUẨN XANH)
              ══════════════════════════════════════════════════════ */}
          <div className="bg-white rounded-2xl border border-[#E3EAE4] p-4 shadow-[0_2px_10px_rgba(20,35,25,0.03)] space-y-4">
            {/* Header Tầng 1 */}
            <div className="flex items-center justify-between gap-2 border-b border-neutral-100 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
                <h3 className="text-xs font-extrabold text-neutral-900 uppercase tracking-wider">
                  Tầng 1: Bộ lọc chung theo nhu cầu thực tế
                </h3>
              </div>
              <span className="text-[11px] font-semibold text-neutral-500">Áp dụng cho mọi nhóm</span>
            </div>

            {/* 1. Mức giá & Chi tiêu thực tế / người */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-neutral-800 flex items-center gap-1.5">
                  <Wallet className="w-3.5 h-3.5 text-neutral-600" />
                  <span>Khoảng giá / người (VND)</span>
                </span>
                <span className="text-[11px] font-semibold text-emerald-800">
                  {BUDGET_OPTIONS.find((b) => b.id === budget)?.detail}
                </span>
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {BUDGET_OPTIONS.map(({ id, label, detail }) => {
                  const isSelected = budget === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => setBudget(id)}
                      className={`py-2 px-1 rounded-xl border flex flex-col items-center justify-center transition-all cursor-pointer ${
                        isSelected ? SEGMENTED_BUTTON_SELECTED : SEGMENTED_BUTTON_UNSELECTED
                      }`}
                    >
                      <span className="text-xs font-bold leading-tight">{label}</span>
                      <span className={`text-[9.5px] leading-tight mt-0.5 truncate max-w-full ${
                        isSelected ? 'text-emerald-100' : 'text-neutral-500'
                      }`}>
                        {detail}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Bán kính di chuyển (Distance / Radius) */}
            <div className="pt-2 border-t border-neutral-100 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-neutral-800 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-neutral-600" />
                  <span>Bán kính di chuyển</span>
                </span>
                <span className="text-[11px] font-semibold text-neutral-500">
                  {radiusKm ? `Trong vòng ${radiusKm} km` : 'Toàn thành phố'}
                </span>
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {RADIUS_OPTIONS.map(({ value, label, desc }) => {
                  const isSelected = radiusKm === value;
                  return (
                    <button
                      key={String(value)}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => setRadiusKm(value)}
                      className={`py-2 px-1 rounded-xl border flex flex-col items-center justify-center transition-all cursor-pointer ${
                        isSelected ? SEGMENTED_BUTTON_SELECTED : SEGMENTED_BUTTON_UNSELECTED
                      }`}
                    >
                      <span className="text-xs font-bold leading-tight">{label}</span>
                      <span className={`text-[9.5px] leading-tight mt-0.5 truncate max-w-full ${
                        isSelected ? 'text-emerald-100' : 'text-neutral-500'
                      }`}>
                        {desc}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="text-[10.5px] text-neutral-500 italic">
                * Bán kính được tính từ tâm Trung tâm Hải Châu (Đà Nẵng) hoặc Đại Nội (Huế)
              </p>
            </div>

            {/* 3. Thời điểm trải nghiệm (Ngày / Buổi tối) */}
            <div className="pt-2 border-t border-neutral-100 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-neutral-800 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-neutral-600" />
                  <span>Thời điểm trải nghiệm</span>
                </span>
                <span className="text-[11px] font-semibold text-neutral-500">
                  {timeOfDay.length === 0 ? 'Mọi thời điểm' : timeOfDay.includes('evening') ? 'Buổi tối' : 'Ban ngày'}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {TIME_OPTIONS.map(({ value, label, desc }) => {
                  const isSelected = value === 'all' ? timeOfDay.length === 0 : timeOfDay.includes(value);
                  return (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => {
                        if (value === 'all') setTimeOfDay([]);
                        else setTimeOfDay([value]);
                      }}
                      className={`py-2 px-2 rounded-xl border flex flex-col items-center justify-center transition-all cursor-pointer ${
                        isSelected ? SEGMENTED_BUTTON_SELECTED : SEGMENTED_BUTTON_UNSELECTED
                      }`}
                    >
                      <span className="text-xs font-bold leading-tight">{label}</span>
                      <span className={`text-[10px] leading-tight mt-0.5 ${
                        isSelected ? 'text-emerald-100' : 'text-neutral-500'
                      }`}>
                        {desc}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 4. Công tắc Điểm đến Xanh & Sinh thái */}
            <div className="pt-2 border-t border-neutral-100">
              <label className="flex items-start gap-3 p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200/60 cursor-pointer select-none hover:bg-emerald-50 transition">
                <input
                  type="checkbox"
                  checked={ecoCertifiedOnly}
                  onChange={(e) => setEcoCertifiedOnly(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded text-emerald-800 focus:ring-emerald-700 cursor-pointer"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 font-bold text-xs text-emerald-950">
                    <Leaf className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                    <span>Chỉ hiển thị Địa điểm Xanh & Sinh thái</span>
                  </div>
                  <p className="text-[11px] text-emerald-800/90 leading-relaxed mt-0.5">
                    Lọc các địa điểm đạt điểm sinh thái cao (Green Score ≥ 70/100), ưu tiên không gian tự nhiên, giảm rác thải nhựa và bảo tồn di sản.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════
              CARD 2: MỨC ĐỘ HÀI LÒNG CỦA DU KHÁCH (SINGLE-SELECT GRID 1 TẦNG)
              ══════════════════════════════════════════════════════ */}
          <div className="bg-white rounded-2xl border border-[#E3EAE4] p-4 shadow-[0_2px_10px_rgba(20,35,25,0.03)] space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-bold text-neutral-900 uppercase tracking-tight flex items-center gap-1.5">
                <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-400 shrink-0" />
                <span>Mức độ hài lòng của du khách</span>
              </h3>
              <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-full">
                {minRating
                  ? `Từ ${minRating}★ (${RATING_OPTIONS.find((r) => r.value === minRating)?.travelerTag})`
                  : 'Mọi mức đánh giá'}
              </span>
            </div>

            <div className="grid grid-cols-4 gap-1.5">
              {RATING_OPTIONS.map(({ value, score }) => {
                const isSelected = minRating === value;
                return (
                  <button
                    key={String(value)}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => setMinRating(value)}
                    className={`${SEGMENTED_BUTTON_BASE} ${
                      isSelected ? SEGMENTED_BUTTON_SELECTED : SEGMENTED_BUTTON_UNSELECTED
                    }`}
                  >
                    <span className="text-xs font-bold leading-tight flex items-center justify-center gap-1">
                      {value !== null && (
                        <Star
                          className={`w-3.5 h-3.5 shrink-0 ${
                            isSelected
                              ? 'text-amber-300 fill-amber-300'
                              : 'text-amber-500 fill-amber-400'
                          }`}
                        />
                      )}
                      <span>{score}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════
              CARD 3: CẢM XÚC & TRẢI NGHIỆM CHUYẾN ĐI (MULTI-SELECT PILLS)
              ══════════════════════════════════════════════════════ */}
          <div className="bg-white rounded-2xl border border-[#E3EAE4] p-4 shadow-[0_2px_10px_rgba(20,35,25,0.03)] space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-bold text-neutral-900 uppercase tracking-tight flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5 text-neutral-700 shrink-0" />
                <span>Cảm xúc & Phong cách chuyến đi</span>
              </h3>
              {activeVibesCount > 0 && (
                <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-full">
                  {activeVibesCount} đã chọn
                </span>
              )}
            </div>

            {/* Tab: Tất cả */}
            {activeTab === 'all' && (
              <div className="flex flex-wrap gap-1.5">
                {ALL_TAB_VIBES.map(({ id, label, icon: IconComponent }) => {
                  const isSelected = vibes.includes(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => toggleArrayItem(vibes, id, setVibes)}
                      className={`${PILL_CHIP_BASE} ${
                        isSelected ? PILL_CHIP_SELECTED : PILL_CHIP_UNSELECTED
                      }`}
                    >
                      <IconComponent
                        className={`w-3.5 h-3.5 shrink-0 ${
                          isSelected ? 'text-emerald-200' : 'text-emerald-700'
                        }`}
                      />
                      <span>{label}</span>
                      {isSelected && <Check className="w-3 h-3 ml-0.5" />}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Tab: Quán ăn */}
            {activeTab === 'quan-an' && (
              <div className="flex flex-wrap gap-1.5">
                {RESTAURANT_FACETS.map(({ id, label, icon: IconComponent }) => {
                  const isSelected = cuisines.includes(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => toggleArrayItem(cuisines, id, setCuisines)}
                      className={`${PILL_CHIP_BASE} ${
                        isSelected ? PILL_CHIP_SELECTED : PILL_CHIP_UNSELECTED
                      }`}
                    >
                      <IconComponent
                        className={`w-3.5 h-3.5 shrink-0 ${
                          isSelected ? 'text-emerald-200' : 'text-emerald-700'
                        }`}
                      />
                      <span>{label}</span>
                      {isSelected && <Check className="w-3 h-3 ml-0.5" />}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Tab: Di tích */}
            {activeTab === 'di-tich' && (
              <div className="flex flex-wrap gap-1.5">
                {HERITAGE_FACETS.map(({ id, label, icon: IconComponent }) => {
                  const isSelected = subCategories.includes(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => toggleArrayItem(subCategories, id, setSubCategories)}
                      className={`${PILL_CHIP_BASE} ${
                        isSelected ? PILL_CHIP_SELECTED : PILL_CHIP_UNSELECTED
                      }`}
                    >
                      <IconComponent
                        className={`w-3.5 h-3.5 shrink-0 ${
                          isSelected ? 'text-emerald-200' : 'text-emerald-700'
                        }`}
                      />
                      <span>{label}</span>
                      {isSelected && <Check className="w-3 h-3 ml-0.5" />}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Tab: Cảnh quan */}
            {activeTab === 'canh-quan' && (
              <div className="flex flex-wrap gap-1.5">
                {NATURE_FACETS.map(({ id, label, icon: IconComponent }) => {
                  const isSelected = subCategories.includes(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => toggleArrayItem(subCategories, id, setSubCategories)}
                      className={`${PILL_CHIP_BASE} ${
                        isSelected ? PILL_CHIP_SELECTED : PILL_CHIP_UNSELECTED
                      }`}
                    >
                      <IconComponent
                        className={`w-3.5 h-3.5 shrink-0 ${
                          isSelected ? 'text-emerald-200' : 'text-emerald-700'
                        }`}
                      />
                      <span>{label}</span>
                      {isSelected && <Check className="w-3 h-3 ml-0.5" />}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Tab: Chùa */}
            {activeTab === 'chua' && (
              <div className="flex flex-wrap gap-1.5">
                {SPIRITUAL_FACETS.map(({ id, label, icon: IconComponent }) => {
                  const isSelected = subCategories.includes(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => toggleArrayItem(subCategories, id, setSubCategories)}
                      className={`${PILL_CHIP_BASE} ${
                        isSelected ? PILL_CHIP_SELECTED : PILL_CHIP_UNSELECTED
                      }`}
                    >
                      <IconComponent
                        className={`w-3.5 h-3.5 shrink-0 ${
                          isSelected ? 'text-emerald-200' : 'text-emerald-700'
                        }`}
                      />
                      <span>{label}</span>
                      {isSelected && <Check className="w-3 h-3 ml-0.5" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── STICKY FOOTER (NÚT HÀNH ĐỘNG DU LỊCH) ── */}
        <div className="px-5 sm:px-6 py-3.5 bg-white/95 backdrop-blur-md border-t border-neutral-200/80 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={handleClear}
            disabled={isDefaultState || isApplying}
            aria-disabled={isDefaultState || isApplying}
            className={`min-h-[42px] px-2 text-xs font-semibold transition-all rounded-lg whitespace-nowrap flex items-center gap-1.5 ${FOCUS_RING} ${
              isDefaultState || isApplying
                ? 'text-neutral-400 cursor-not-allowed'
                : 'text-neutral-700 hover:text-neutral-950 underline underline-offset-4 cursor-pointer'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Đặt lại tất cả</span>
          </button>

          <button
            type="button"
            onClick={handleApplyWithFeedback}
            disabled={isApplying}
            className={`min-h-[46px] px-7 py-2.5 rounded-full bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 active:scale-[0.98] text-white text-xs sm:text-sm font-bold tracking-tight transition-all shadow-[0_8px_20px_-4px_rgba(4,120,87,0.30)] hover:shadow-[0_12px_24px_-4px_rgba(4,120,87,0.40)] cursor-pointer flex items-center gap-2 whitespace-nowrap select-none ${FOCUS_RING}`}
          >
            {isApplying ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span>Đang tìm điểm đến phù hợp nhất...</span>
              </>
            ) : (
              <>
                <span>
                  {matchingCount > 0
                    ? `Khám phá ${matchingCount} điểm đến lý tưởng`
                    : 'Khám phá điểm đến lý tưởng'}
                </span>
                <ArrowRight className="w-4 h-4 text-emerald-200" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExploreFilterModal;
