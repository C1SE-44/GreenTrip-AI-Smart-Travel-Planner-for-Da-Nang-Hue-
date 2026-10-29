import React, { useState, useEffect } from 'react';
import {
  X,
  Award,
  Bus,
  Clock,
  CloudRain,
  Ticket,
  Leaf,
  Wallet,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { PoiCategory } from '@/data/pois';
import { normalizeSliderWeights } from '@/services/poi';

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
// Datasets (Design System v2 + WCAG 2.2 AA Standard)
// ─────────────────────────────────────────────
const RATING_OPTIONS: { value: number | null; label: string; summary: string }[] = [
  { value: null, label: 'Tất cả', summary: 'Mọi mức điểm' },
  { value: 3.5,  label: '★ 3.5+', summary: 'Từ 3.5 sao trở lên' },
  { value: 4.0,  label: '★ 4.0+', summary: 'Từ 4.0 sao trở lên' },
  { value: 4.5,  label: '★ 4.5+', summary: 'Từ 4.5 sao trở lên' },
];

const BUDGET_OPTIONS: { id: BudgetTier; label: string; desc: string; summary: string }[] = [
  { id: 'all',  label: 'Tất cả', desc: 'Mọi giá',  summary: 'Mọi mức giá' },
  { id: '$',    label: '$',      desc: '< 100k',    summary: 'Tiết kiệm (< 100.000đ)' },
  { id: '$$',   label: '$$',     desc: '100–400k',  summary: 'Vừa phải (100k – 400k)' },
  { id: '$$$',  label: '$$$',    desc: '400k–1tr',  summary: 'Cao cấp (400k – 1 triệu)' },
  { id: '$$$$', label: '$$$$',   desc: '> 1 triệu', summary: 'Sang trọng (> 1 triệu)' },
];

const DISTANCE_OPTIONS: { value: number | null; label: string; summary: string }[] = [
  { value: null, label: 'Toàn TP', summary: 'Toàn thành phố' },
  { value: 2,    label: '< 2 km',  summary: 'Trong bán kính 2 km' },
  { value: 5,    label: '< 5 km',  summary: 'Trong bán kính 5 km' },
  { value: 10,   label: '< 10 km', summary: 'Trong bán kính 10 km' },
  { value: 20,   label: '< 20 km', summary: 'Trong bán kính 20 km' },
];

const ECO_SEGMENTS: { id: EcoPriority; badge: string; sub: string; summary: string }[] = [
  { id: 'all',      badge: 'Tất cả', sub: 'Mọi mức',    summary: 'Không giới hạn điểm xanh' },
  { id: 'basic',    badge: '≥ 30%',  sub: 'Cơ bản',     summary: 'Điểm xanh từ 30% trở lên' },
  { id: 'balanced', badge: '≥ 55%',  sub: 'Cân bằng',   summary: 'Điểm xanh từ 55% trở lên' },
  { id: 'eco',      badge: '≥ 75%',  sub: 'Thân thiện', summary: 'Điểm xanh từ 75% trở lên' },
  { id: 'pure',     badge: '≥ 90%',  sub: 'Sinh thái',  summary: 'Điểm xanh từ 90% trở lên' },
];

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

const HERITAGE_SUB_CATEGORIES: { id: string; label: string }[] = [
  { id: 'imperial_citadel',        label: 'Đại Nội & Hoàng thành' },
  { id: 'royal_mausoleums',        label: 'Lăng tẩm Hoàng gia' },
  { id: 'museums_galleries',       label: 'Bảo tàng & Mỹ thuật' },
  { id: 'iconic_urban_landmarks',  label: 'Cầu & Di tích Đô thị' },
  { id: 'craft_villages',          label: 'Làng nghề truyền thống' },
  { id: 'historic_markets',        label: 'Chợ lâu đời' },
];

const NATURE_SUB_CATEGORIES: { id: string; label: string }[] = [
  { id: 'beach_coastline',         label: 'Bãi biển & Bờ vịnh' },
  { id: 'mountain_pass_peninsula', label: 'Đèo dốc & Bán đảo Sơn Trà' },
  { id: 'wetland_lagoon_rivers',   label: 'Đầm phá & Sông Hương/Hàn' },
  { id: 'pine_hills_parks',        label: 'Đồi thông & Công viên' },
  { id: 'waterfalls_hotsprings',   label: 'Suối khoáng & Thác nước' },
];

const SPIRITUAL_SUB_CATEGORIES: { id: string; label: string }[] = [
  { id: 'historic_zen_temples',         label: 'Cổ tự & Chốn tổ thiền' },
  { id: 'grand_mountain_ocean_temples', label: 'Tượng Phật & Vách núi' },
  { id: 'forest_hermitage_monasteries', label: 'Thiền viện rừng sâu' },
  { id: 'cathedrals_heritage_churches', label: 'Thánh đường Gothic' },
  { id: 'zen_retreats_healing',         label: 'Không gian tĩnh tâm' },
];

// Design System v2 Tokens:
// - 60% Surface: bg-white / bg-neutral-50
// - 30% Brand & Structural Selection: neutral-900 (unified across all selectable filter chips)
// - 10% Exclusive Accent CTA: emerald-700 -> emerald-800 (reserved strictly for the primary action button)
// - Consistent small chip/card corner radius: 10px (rounded-[10px]) per Section 3.2
const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-1';

const CHIP_BASE =
  `rounded-[10px] text-xs transition-all duration-150 active:scale-[0.98] cursor-pointer select-none border ${FOCUS_RING}`;

const CHIP_SELECTED =
  'bg-neutral-900 border-neutral-900 text-white font-semibold shadow-[0_2px_6px_rgba(20,20,20,0.12)]';

const CHIP_UNSELECTED =
  'bg-white border-neutral-200/90 text-neutral-800 font-medium hover:border-neutral-400 hover:bg-neutral-50/70';

// ─────────────────────────────────────────────
// Component: ExploreFilterModal
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
  const [greenWeight, setGreenWeight]           = useState<number>(values.greenWeight ?? 50);
  const [budgetWeight, setBudgetWeight]         = useState<number>(values.budgetWeight ?? 50);

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
      setGreenWeight(values.greenWeight ?? 50);
      setBudgetWeight(values.budgetWeight ?? 50);
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
    !freeTicketOnly &&
    greenWeight === 50 &&
    budgetWeight === 50;

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
      greenWeight,
      budgetWeight,
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

  const tabSubtitle = (() => {
    switch (activeTab) {
      case 'quan-an': return 'Ẩm thực & trải nghiệm ăn uống';
      case 'di-tich': return 'Di tích lịch sử & văn hóa';
      case 'canh-quan': return 'Danh lam thắng cảnh thiên nhiên';
      case 'chua': return 'Chùa & không gian tĩnh tâm';
      default: return 'Tùy chỉnh ưu tiên & điều kiện lọc địa điểm';
    }
  })();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-5 animate-fadeIn">
      {/* Tinted Backdrop (Section 5.1 — Warm charcoal-emerald tint instead of harsh black) */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-[#141E19]/40 backdrop-blur-[3px] transition-opacity"
        aria-hidden="true"
      />

      {/* Dialog Shell — Style 1 (The Steve Jobs): Ultra-clean surface + Tinted Shadow (Section 5.1) */}
      <div
        className="relative w-full max-w-[540px] bg-white rounded-3xl shadow-[0_24px_64px_-12px_rgba(14,38,26,0.18),0_8px_24px_-6px_rgba(43,38,34,0.08)] ring-1 ring-neutral-900/5 overflow-hidden z-10 flex flex-col max-h-[90vh] sm:max-h-[88vh] animate-fadeInScale"
        role="dialog"
        aria-modal="true"
        aria-labelledby="explore-filter-modal-title"
      >
        {/* ── Header (3-Level Visual Hierarchy: Cấp 1 Title -> Cấp 3 Subtitle) ── */}
        <div className="px-4 sm:px-6 py-4 border-b border-neutral-100 flex items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className={`w-10 h-10 rounded-full text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 active:scale-95 transition flex items-center justify-center cursor-pointer shrink-0 ${FOCUS_RING}`}
            aria-label="Đóng bảng lọc"
            title="Đóng (Esc)"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="text-center min-w-0">
            <h2
              id="explore-filter-modal-title"
              className="text-base font-bold text-neutral-900 tracking-tight"
            >
              Bộ lọc & Ưu tiên
            </h2>
            <p className="text-xs text-neutral-600 font-medium truncate mt-0.5">
              {tabSubtitle}
            </p>
          </div>

          <div className="w-10 text-right shrink-0 flex items-center justify-end">
            {!isDefaultState && (
              <button
                type="button"
                onClick={handleClear}
                className={`text-xs text-neutral-700 hover:text-neutral-950 font-semibold underline underline-offset-2 transition cursor-pointer rounded px-1 py-1 whitespace-nowrap ${FOCUS_RING}`}
                title="Đặt lại mặc định"
              >
                Đặt lại
              </button>
            )}
          </div>
        </div>

        {/* ── Scrollable Body (Generous Vertical Breathing Room per Section 2.4) ── */}
        <div className="px-4 sm:px-6 py-4 space-y-5 overflow-y-auto overscroll-contain flex-1 auto-hide-scrollbar">
          {/* PB08: Multi-Objective Ranking Priority Sliders (Option B — Collapsible Advanced) */}
          <SustainabilityWeightSliders
            greenWeight={greenWeight}
            budgetWeight={budgetWeight}
            onChangeGreen={setGreenWeight}
            onChangeBudget={setBudgetWeight}
          />

          {/* 1. RESTAURANTS SPECIFIC FACETS */}
          {activeTab === 'quan-an' && (
            <>
              <FilterSection
                title="Món ăn & Phong cách ẩm thực"
                summary={cuisines.length > 0 ? `Đã chọn ${cuisines.length}` : 'Tất cả'}
              >
                <div className="flex flex-wrap gap-1.5">
                  {RESTAURANT_CUISINES.map(({ id, label }) => {
                    const isSelected = cuisines.includes(id);
                    return (
                      <button
                        key={id}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => toggleArrayItem(cuisines, id, setCuisines)}
                        className={`min-h-[40px] px-3 py-1.5 ${CHIP_BASE} ${
                          isSelected ? CHIP_SELECTED : CHIP_UNSELECTED
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </FilterSection>

              <BudgetSection budget={budget} onChange={setBudget} />
              <RatingSection minRating={minRating} onChange={setMinRating} />

              <FilterSection
                title="Không gian & Trải nghiệm"
                summary={
                  vibes.length + (openNowOnly ? 1 : 0) > 0
                    ? `Đã chọn ${vibes.length + (openNowOnly ? 1 : 0)}`
                    : 'Tất cả'
                }
              >
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    aria-pressed={openNowOnly}
                    onClick={() => setOpenNowOnly(!openNowOnly)}
                    className={`min-h-[40px] px-3 py-1.5 flex items-center gap-1.5 ${CHIP_BASE} ${
                      openNowOnly ? CHIP_SELECTED : CHIP_UNSELECTED
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5 shrink-0" />
                    <span>Đang mở cửa</span>
                  </button>
                  {RESTAURANT_VIBES.map((vibe) => {
                    const isSelected = vibes.includes(vibe);
                    return (
                      <button
                        key={vibe}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => toggleArrayItem(vibes, vibe, setVibes)}
                        className={`min-h-[40px] px-3 py-1.5 ${CHIP_BASE} ${
                          isSelected ? CHIP_SELECTED : CHIP_UNSELECTED
                        }`}
                      >
                        {vibe}
                      </button>
                    );
                  })}
                </div>
              </FilterSection>

              <DistanceSection radiusKm={radiusKm} onChange={setRadiusKm} />
              <SustainabilityTogglesSection
                ecoCertifiedOnly={ecoCertifiedOnly}
                onChangeEcoCertified={setEcoCertifiedOnly}
                greenTransitOnly={greenTransitOnly}
                onChangeGreenTransit={setGreenTransitOnly}
                showTransit={false}
              />
            </>
          )}

          {/* 2. HERITAGE / DI TÍCH FACETS */}
          {activeTab === 'di-tich' && (
            <>
              <SubCategorySection
                title="Loại hình di tích & lịch sử"
                options={HERITAGE_SUB_CATEGORIES}
                selected={subCategories}
                onToggle={(id) => toggleArrayItem(subCategories, id, setSubCategories)}
              />
              <EcoLevelSection ecoPriority={ecoPriority} onChange={setEcoPriority} />
              <RatingSection minRating={minRating} onChange={setMinRating} />
              <FeaturesSection
                rainyDayFriendly={rainyDayFriendly}
                onToggleRainy={() => setRainyDayFriendly(!rainyDayFriendly)}
                freeTicketOnly={freeTicketOnly}
                onToggleFree={() => setFreeTicketOnly(!freeTicketOnly)}
                openNowOnly={openNowOnly}
                onToggleOpenNow={() => setOpenNowOnly(!openNowOnly)}
              />
              <DistanceSection radiusKm={radiusKm} onChange={setRadiusKm} />
            </>
          )}

          {/* 3. NATURE FACETS */}
          {activeTab === 'canh-quan' && (
            <>
              <SubCategorySection
                title="Loại hình cảnh quan"
                options={NATURE_SUB_CATEGORIES}
                selected={subCategories}
                onToggle={(id) => toggleArrayItem(subCategories, id, setSubCategories)}
              />
              <EcoLevelSection ecoPriority={ecoPriority} onChange={setEcoPriority} />
              <RatingSection minRating={minRating} onChange={setMinRating} />
              <FeaturesSection
                rainyDayFriendly={rainyDayFriendly}
                onToggleRainy={() => setRainyDayFriendly(!rainyDayFriendly)}
                freeTicketOnly={freeTicketOnly}
                onToggleFree={() => setFreeTicketOnly(!freeTicketOnly)}
                openNowOnly={openNowOnly}
                onToggleOpenNow={() => setOpenNowOnly(!openNowOnly)}
              />
              <DistanceSection radiusKm={radiusKm} onChange={setRadiusKm} />
            </>
          )}

          {/* 4. SPIRITUAL / CHÙA FACETS */}
          {activeTab === 'chua' && (
            <>
              <SubCategorySection
                title="Không gian thờ tự & tâm linh"
                options={SPIRITUAL_SUB_CATEGORIES}
                selected={subCategories}
                onToggle={(id) => toggleArrayItem(subCategories, id, setSubCategories)}
              />
              <EcoLevelSection ecoPriority={ecoPriority} onChange={setEcoPriority} />
              <RatingSection minRating={minRating} onChange={setMinRating} />
              <FeaturesSection
                rainyDayFriendly={rainyDayFriendly}
                onToggleRainy={() => setRainyDayFriendly(!rainyDayFriendly)}
                freeTicketOnly={freeTicketOnly}
                onToggleFree={() => setFreeTicketOnly(!freeTicketOnly)}
                openNowOnly={openNowOnly}
                onToggleOpenNow={() => setOpenNowOnly(!openNowOnly)}
              />
              <DistanceSection radiusKm={radiusKm} onChange={setRadiusKm} />
            </>
          )}

          {/* 5. ALL TAB MACRO FACETS */}
          {activeTab === 'all' && (
            <>
              <BudgetSection budget={budget} onChange={setBudget} />
              <RatingSection minRating={minRating} onChange={setMinRating} />
              <EcoLevelSection ecoPriority={ecoPriority} onChange={setEcoPriority} />
              <FeaturesSection
                rainyDayFriendly={rainyDayFriendly}
                onToggleRainy={() => setRainyDayFriendly(!rainyDayFriendly)}
                freeTicketOnly={freeTicketOnly}
                onToggleFree={() => setFreeTicketOnly(!freeTicketOnly)}
                openNowOnly={openNowOnly}
                onToggleOpenNow={() => setOpenNowOnly(!openNowOnly)}
              />
              <DistanceSection radiusKm={radiusKm} onChange={setRadiusKm} />
              <SustainabilityTogglesSection
                ecoCertifiedOnly={ecoCertifiedOnly}
                onChangeEcoCertified={setEcoCertifiedOnly}
                greenTransitOnly={greenTransitOnly}
                onChangeGreenTransit={setGreenTransitOnly}
                showTransit={true}
              />
            </>
          )}
        </div>

        {/* ── Sticky Bottom Footer (10% Exclusive Accent Color on Primary CTA per Section 2.2 & 3.1) ── */}
        <div className="px-4 sm:px-6 py-3.5 bg-white border-t border-neutral-100 flex items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={handleClear}
            disabled={isDefaultState}
            aria-disabled={isDefaultState}
            className={`min-h-[42px] px-2 text-xs font-semibold transition-all rounded-[10px] whitespace-nowrap ${FOCUS_RING} ${
              isDefaultState
                ? 'text-neutral-400 cursor-not-allowed'
                : 'text-neutral-700 hover:text-neutral-950 underline underline-offset-4 cursor-pointer'
            }`}
          >
            Đặt lại mặc định
          </button>

          <button
            type="button"
            onClick={handleApply}
            className={`min-h-[44px] px-5 sm:px-6 py-2.5 rounded-[12px] bg-emerald-700 hover:bg-emerald-800 active:scale-[0.98] text-white text-xs sm:text-sm font-bold tracking-tight transition-all shadow-[0_6px_16px_rgba(4,120,87,0.24)] hover:shadow-[0_8px_20px_rgba(4,120,87,0.32)] cursor-pointer flex items-center gap-2 whitespace-nowrap ${FOCUS_RING}`}
          >
            <span>Hiển thị {matchingCount} địa điểm</span>
          </button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// Shared Section Wrapper (3-Level Hierarchy: Cấp 1 Title -> Cấp 3 Summary)
// ─────────────────────────────────────────────
function FilterSection({
  title,
  summary,
  children,
}: {
  title: string;
  summary?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2.5 pt-4 border-t border-neutral-100 first:border-t-0 first:pt-0">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold text-neutral-900 tracking-tight">
          {title}
        </h3>
        {summary && (
          <span className="text-xs font-medium text-neutral-600 shrink-0">
            {summary}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

// ─────────────────────────────────────────────
// Sub-Categories Section
// ─────────────────────────────────────────────
function SubCategorySection({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: { id: string; label: string }[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <FilterSection
      title={title}
      summary={selected.length > 0 ? `Đã chọn ${selected.length}` : 'Tất cả'}
    >
      <div className="flex flex-wrap gap-1.5">
        {options.map(({ id, label }) => {
          const isSelected = selected.includes(id);
          return (
            <button
              key={id}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onToggle(id)}
              className={`min-h-[40px] px-3 py-1.5 ${CHIP_BASE} ${
                isSelected ? CHIP_SELECTED : CHIP_UNSELECTED
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </FilterSection>
  );
}

// ─────────────────────────────────────────────
// Budget Section (Selectable Cards 10px radius, 320px Reflow + 5 Desktop Columns)
// ─────────────────────────────────────────────
function BudgetSection({
  budget,
  onChange,
}: {
  budget: BudgetTier;
  onChange: (b: BudgetTier) => void;
}) {
  const activeOption = BUDGET_OPTIONS.find((o) => o.id === budget);
  return (
    <FilterSection title="Mức chi phí" summary={activeOption?.summary}>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
        {BUDGET_OPTIONS.map(({ id, label, desc }, idx) => {
          const isSelected = budget === id;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onChange(id)}
              className={`min-h-[44px] py-1.5 px-2 text-center flex flex-col items-center justify-center gap-0.5 ${CHIP_BASE} ${
                idx === 0 ? 'col-span-2 sm:col-span-1' : ''
              } ${isSelected ? CHIP_SELECTED : CHIP_UNSELECTED}`}
            >
              <span className="text-xs font-bold leading-tight">{label}</span>
              <span
                className={`text-xs leading-tight ${
                  isSelected ? 'text-neutral-200' : 'text-neutral-600'
                }`}
              >
                {desc}
              </span>
            </button>
          );
        })}
      </div>
    </FilterSection>
  );
}

// ─────────────────────────────────────────────
// Rating Section (Responsive 2x2 Mobile -> 4 Desktop Columns)
// ─────────────────────────────────────────────
function RatingSection({
  minRating,
  onChange,
}: {
  minRating: number | null;
  onChange: (r: number | null) => void;
}) {
  const activeOption = RATING_OPTIONS.find((o) => o.value === minRating);
  return (
    <FilterSection title="Đánh giá tối thiểu" summary={activeOption?.summary}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
        {RATING_OPTIONS.map(({ value, label }) => {
          const isSelected = minRating === value;
          return (
            <button
              key={String(value)}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onChange(value)}
              className={`min-h-[40px] py-2 px-2 ${CHIP_BASE} ${
                isSelected ? CHIP_SELECTED : CHIP_UNSELECTED
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </FilterSection>
  );
}

// ─────────────────────────────────────────────
// Eco Level Hard Filter Section (Unified 30% Brand Selection + Subtle Leaf Indicator)
// ─────────────────────────────────────────────
function EcoLevelSection({
  ecoPriority,
  onChange,
}: {
  ecoPriority: EcoPriority;
  onChange: (e: EcoPriority) => void;
}) {
  const activeOption = ECO_SEGMENTS.find((o) => o.id === ecoPriority);
  return (
    <FilterSection
      title="Ngưỡng Điểm Xanh tối thiểu (Lọc cứng)"
      summary={activeOption?.summary}
    >
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
        {ECO_SEGMENTS.map(({ id, badge, sub }, idx) => {
          const isSelected = ecoPriority === id;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onChange(id)}
              className={`min-h-[44px] py-1.5 px-2 text-center flex flex-col items-center justify-center gap-0.5 ${CHIP_BASE} ${
                idx === 0 ? 'col-span-2 sm:col-span-1' : ''
              } ${isSelected ? CHIP_SELECTED : CHIP_UNSELECTED}`}
            >
              <span className="text-xs font-bold leading-tight">{badge}</span>
              <span
                className={`text-xs leading-tight ${
                  isSelected ? 'text-neutral-200' : 'text-neutral-600'
                }`}
              >
                {sub}
              </span>
            </button>
          );
        })}
      </div>
    </FilterSection>
  );
}

// ─────────────────────────────────────────────
// Features Section (Selectable Cards with Icon + Label per Section 3.2)
// ─────────────────────────────────────────────
function FeaturesSection({
  rainyDayFriendly,
  onToggleRainy,
  freeTicketOnly,
  onToggleFree,
  openNowOnly,
  onToggleOpenNow,
}: {
  rainyDayFriendly: boolean;
  onToggleRainy: () => void;
  freeTicketOnly: boolean;
  onToggleFree: () => void;
  openNowOnly: boolean;
  onToggleOpenNow: () => void;
}) {
  const activeCount =
    (rainyDayFriendly ? 1 : 0) + (freeTicketOnly ? 1 : 0) + (openNowOnly ? 1 : 0);

  return (
    <FilterSection
      title="Tiện ích & Hoàn cảnh tham quan"
      summary={activeCount > 0 ? `Đã chọn ${activeCount}` : 'Tùy chọn'}
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
        <button
          type="button"
          aria-pressed={rainyDayFriendly}
          onClick={onToggleRainy}
          className={`min-h-[40px] py-2 px-3 flex items-center justify-center gap-1.5 ${CHIP_BASE} ${
            rainyDayFriendly ? CHIP_SELECTED : CHIP_UNSELECTED
          }`}
        >
          <CloudRain className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Ngày mưa</span>
        </button>

        <button
          type="button"
          aria-pressed={freeTicketOnly}
          onClick={onToggleFree}
          className={`min-h-[40px] py-2 px-3 flex items-center justify-center gap-1.5 ${CHIP_BASE} ${
            freeTicketOnly ? CHIP_SELECTED : CHIP_UNSELECTED
          }`}
        >
          <Ticket className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Miễn phí vé</span>
        </button>

        <button
          type="button"
          aria-pressed={openNowOnly}
          onClick={onToggleOpenNow}
          className={`min-h-[40px] py-2 px-3 flex items-center justify-center gap-1.5 ${CHIP_BASE} ${
            openNowOnly ? CHIP_SELECTED : CHIP_UNSELECTED
          }`}
        >
          <Clock className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Đang mở cửa</span>
        </button>
      </div>
    </FilterSection>
  );
}

// ─────────────────────────────────────────────
// Distance Section (Responsive 320px Reflow + 5 Desktop Columns)
// ─────────────────────────────────────────────
function DistanceSection({
  radiusKm,
  onChange,
}: {
  radiusKm: number | null;
  onChange: (r: number | null) => void;
}) {
  const activeOption = DISTANCE_OPTIONS.find((o) => o.value === radiusKm);
  return (
    <FilterSection title="Khoảng cách di chuyển" summary={activeOption?.summary}>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
        {DISTANCE_OPTIONS.map(({ value, label }, idx) => {
          const isSelected = radiusKm === value;
          return (
            <button
              key={String(value)}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onChange(value)}
              className={`min-h-[40px] py-2 px-2 ${CHIP_BASE} ${
                idx === 0 ? 'col-span-2 sm:col-span-1' : ''
              } ${isSelected ? CHIP_SELECTED : CHIP_UNSELECTED}`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </FilterSection>
  );
}

// ─────────────────────────────────────────────
// Sustainability Toggles Section (Style 1 Ultra-Clean Surface Rows)
// ─────────────────────────────────────────────
function SustainabilityTogglesSection({
  ecoCertifiedOnly,
  onChangeEcoCertified,
  greenTransitOnly,
  onChangeGreenTransit,
  showTransit,
}: {
  ecoCertifiedOnly: boolean;
  onChangeEcoCertified: (v: boolean) => void;
  greenTransitOnly: boolean;
  onChangeGreenTransit: (v: boolean) => void;
  showTransit: boolean;
}) {
  return (
    <FilterSection title="Tiêu chuẩn Xanh & Di chuyển">
      <div className="grid grid-cols-1 gap-2">
        <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-[12px] bg-neutral-50 border border-neutral-200/80">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-[10px] bg-emerald-100/80 text-emerald-800 flex items-center justify-center shrink-0">
              <Award className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <label
                htmlFor="toggle-eco-certified"
                className="text-xs font-semibold text-neutral-900 block cursor-pointer"
              >
                Chứng nhận Eco-Certified
              </label>
              <p className="text-xs text-neutral-600">
                Giảm phát thải, bảo tồn thiên nhiên & văn hóa bản địa
              </p>
            </div>
          </div>
          <ModernSwitch
            checked={ecoCertifiedOnly}
            onChange={onChangeEcoCertified}
            id="toggle-eco-certified"
            ariaLabel="Chỉ điểm đạt chứng nhận Eco-Certified"
          />
        </div>

        {showTransit && (
          <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-[12px] bg-neutral-50 border border-neutral-200/80">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-[10px] bg-emerald-100/80 text-emerald-800 flex items-center justify-center shrink-0">
                <Bus className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <label
                  htmlFor="toggle-green-transit"
                  className="text-xs font-semibold text-neutral-900 block cursor-pointer"
                >
                  Thuận tiện di chuyển xanh
                </label>
                <p className="text-xs text-neutral-600">
                  Gần tuyến xe buýt điện, trạm xe đạp hoặc phố đi bộ
                </p>
              </div>
            </div>
            <ModernSwitch
              checked={greenTransitOnly}
              onChange={onChangeGreenTransit}
              id="toggle-green-transit"
              ariaLabel="Chỉ điểm thuận tiện di chuyển xanh"
            />
          </div>
        )}
      </div>
    </FilterSection>
  );
}

// ─────────────────────────────────────────────
// Sub-component: Clean Accessible Switch
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
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${FOCUS_RING} ${
        checked ? 'bg-neutral-900' : 'bg-neutral-300'
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

// ─────────────────────────────────────────────
// PB08: Ultra-Compact Sustainability & Budget Weight Sliders (Design System v2)
// ─────────────────────────────────────────────
const WEIGHT_PRESETS = [
  { label: 'Cân bằng', sub: '50% • 50%', g: 50, b: 50 },
  { label: 'Ưu tiên Xanh', sub: '80% • 20%', g: 80, b: 20 },
  { label: 'Thuần Xanh', sub: '100% • 0%', g: 100, b: 0 },
  { label: 'Tiết kiệm', sub: '20% • 80%', g: 20, b: 80 },
] as const;

interface SustainabilityWeightSlidersProps {
  greenWeight: number;
  budgetWeight: number;
  onChangeGreen: (val: number) => void;
  onChangeBudget: (val: number) => void;
}

function SustainabilityWeightSliders({
  greenWeight,
  budgetWeight,
  onChangeGreen,
  onChangeBudget,
}: SustainabilityWeightSlidersProps) {
  const isCustomWeight = !WEIGHT_PRESETS.some(
    (p) => p.g === greenWeight && p.b === budgetWeight
  );
  const [showCustomSliders, setShowCustomSliders] = useState<boolean>(isCustomWeight);

  const { normGreen, normBudget, zeroWeightsFallback } = normalizeSliderWeights(
    greenWeight,
    budgetWeight
  );
  const greenPct = Math.round(normGreen * 100);
  const budgetPct = Math.round(normBudget * 100);

  return (
    <section
      className="p-3.5 rounded-2xl bg-neutral-50 border border-neutral-200/80 space-y-3"
      data-testid="sustainability-sliders-section"
      aria-label="Thứ tự ưu tiên hiển thị"
    >
      {/* Header Row (3-Level Hierarchy: Cấp 1 Title -> Cấp 3 Description) */}
      <div className="flex items-start sm:items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-neutral-900 tracking-tight leading-tight">
            Thứ tự ưu tiên hiển thị
          </h3>
          <p className="text-xs text-neutral-600 mt-0.5">
            Sắp xếp danh sách theo tỷ lệ bạn chọn, không ẩn địa điểm
          </p>
        </div>

        <button
          type="button"
          aria-expanded={showCustomSliders}
          aria-controls="custom-weight-sliders-panel"
          onClick={() => setShowCustomSliders((prev) => !prev)}
          className={`min-h-[36px] shrink-0 px-3 py-1.5 rounded-[10px] text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 border ${FOCUS_RING} ${
            showCustomSliders
              ? 'bg-neutral-900 border-neutral-900 text-white'
              : 'bg-white border-neutral-200/90 text-neutral-800 hover:border-neutral-400'
          }`}
          data-testid="toggle-custom-weight-sliders"
        >
          <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
          <span>Tùy chỉnh chi tiết</span>
          {showCustomSliders ? (
            <ChevronUp className="w-3.5 h-3.5 shrink-0" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 shrink-0" />
          )}
        </button>
      </div>

      {/* Live Visual Ratio Bar (% Xanh • % Chi phí) */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs font-bold">
          <span className="text-emerald-800 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-700 inline-block" aria-hidden="true" />
            {greenPct}% Độ xanh
          </span>
          <span className="text-neutral-800 flex items-center gap-1">
            {budgetPct}% Chi phí
            <span className="w-2 h-2 rounded-full bg-neutral-800 inline-block" aria-hidden="true" />
          </span>
        </div>
        <div
          className="h-2 w-full rounded-full overflow-hidden flex bg-neutral-200"
          role="img"
          aria-label={`Tỷ lệ hiện tại: ${greenPct}% Độ xanh và ${budgetPct}% Chi phí`}
        >
          <div
            className="h-full bg-emerald-700 transition-all duration-200"
            style={{ width: `${greenPct}%` }}
          />
          <div
            className="h-full bg-neutral-800 transition-all duration-200"
            style={{ width: `${budgetPct}%` }}
          />
        </div>
      </div>

      {/* Quick Presets (Selectable Cards 10px radius, unified 30% brand selection) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
        {WEIGHT_PRESETS.map((preset) => {
          const active = greenWeight === preset.g && budgetWeight === preset.b;
          return (
            <button
              key={preset.label}
              type="button"
              aria-pressed={active}
              onClick={() => {
                onChangeGreen(preset.g);
                onChangeBudget(preset.b);
              }}
              className={`min-h-[44px] py-1.5 px-2 text-center flex flex-col items-center justify-center gap-0.5 ${CHIP_BASE} ${
                active ? CHIP_SELECTED : CHIP_UNSELECTED
              }`}
            >
              <span className="text-xs font-bold leading-tight">
                {preset.label}
              </span>
              <span
                className={`text-xs font-mono leading-tight ${
                  active ? 'text-neutral-200' : 'text-neutral-600'
                }`}
              >
                {preset.sub}
              </span>
            </button>
          );
        })}
      </div>

      {/* Collapsible 0–100 Sliders (One-Time Setup Context per Section 3.3) */}
      {showCustomSliders && (
        <div
          id="custom-weight-sliders-panel"
          className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1 animate-fadeIn"
        >
          {/* Green Priority Slider */}
          <div className="bg-white rounded-[10px] p-3 border border-neutral-200/90 space-y-2">
            <div className="flex items-center justify-between gap-2 text-xs">
              <label
                htmlFor="slider-green-weight"
                className="font-semibold text-neutral-900 flex items-center gap-1.5 whitespace-nowrap"
              >
                <Leaf className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                <span>Độ xanh</span>
              </label>
              <span className="font-mono font-bold text-emerald-800 whitespace-nowrap">
                {greenWeight}/100 ({greenPct}%)
              </span>
            </div>
            <input
              id="slider-green-weight"
              type="range"
              min={0}
              max={100}
              step={5}
              value={greenWeight}
              aria-valuetext={`${greenWeight} trên 100, tương đương ${greenPct}% ưu tiên độ xanh`}
              onChange={(e) => onChangeGreen(Number(e.target.value))}
              className={`w-full h-2 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-emerald-700 ${FOCUS_RING}`}
            />
          </div>

          {/* Budget Priority Slider */}
          <div className="bg-white rounded-[10px] p-3 border border-neutral-200/90 space-y-2">
            <div className="flex items-center justify-between gap-2 text-xs">
              <label
                htmlFor="slider-budget-weight"
                className="font-semibold text-neutral-900 flex items-center gap-1.5 whitespace-nowrap"
              >
                <Wallet className="w-3.5 h-3.5 text-neutral-700 shrink-0" />
                <span>Chi phí</span>
              </label>
              <span className="font-mono font-bold text-neutral-800 whitespace-nowrap">
                {budgetWeight}/100 ({budgetPct}%)
              </span>
            </div>
            <input
              id="slider-budget-weight"
              type="range"
              min={0}
              max={100}
              step={5}
              value={budgetWeight}
              aria-valuetext={`${budgetWeight} trên 100, tương đương ${budgetPct}% ưu tiên chi phí`}
              onChange={(e) => onChangeBudget(Number(e.target.value))}
              className={`w-full h-2 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-neutral-900 ${FOCUS_RING}`}
            />
          </div>
        </div>
      )}

      {zeroWeightsFallback && (
        <p
          role="status"
          className="text-xs text-amber-900 bg-amber-50 border border-amber-300 rounded-[10px] px-3 py-2 font-medium"
        >
          Cả hai thanh trượt đang ở mức 0 — hệ thống tự động giữ tỷ lệ cân bằng 50% Xanh / 50% Chi phí.
        </p>
      )}
    </section>
  );
}

export default ExploreFilterModal;
