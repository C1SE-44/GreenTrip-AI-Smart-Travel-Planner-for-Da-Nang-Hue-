import React, { useState, useEffect, useMemo } from 'react';
import { X, Loader2 } from 'lucide-react';
import type { Poi } from '@/data/pois';
import { isPoiEcoCertified } from '@/services/poi';

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

export const CITY_CENTERS: Record<string, { lat: number; lng: number }> = {
  'Đà Nẵng': { lat: 16.0678, lng: 108.2208 },
  'Huế': { lat: 16.4637, lng: 107.5909 },
  default: { lat: 16.0678, lng: 108.2208 },
};

export function getDistanceFromLatLonInKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function matchesTimeOfDay(poi: Poi, timeOfDayList: TimeOfDay[]): boolean {
  if (timeOfDayList.length === 0) return true;

  return timeOfDayList.some((tod) => {
    if (poi.best_time && poi.best_time.length > 0) {
      const matchExplicit = poi.best_time.some((t) => t.toLowerCase().includes(tod));
      if (matchExplicit) return true;
    }

    const name = poi.name.toLowerCase();
    const desc = (poi.description || '').toLowerCase();
    const sub = (poi.sub_category || '').toLowerCase();

    if (tod === 'morning') {
      if (poi.category === 'chua') return true;
      if (
        sub === 'traditional_noodles' ||
        name.includes('bún') ||
        name.includes('mì') ||
        name.includes('phở') ||
        name.includes('cháo')
      )
        return true;
      if (
        sub === 'workspace_study_cafe' ||
        sub === 'specialty_roastery' ||
        sub === 'retro_street_cafe'
      )
        return true;
      if (
        name.includes('bình minh') ||
        desc.includes('bình minh') ||
        name.includes('mỹ khê') ||
        name.includes('chợ')
      )
        return true;
      if (poi.category === 'di-tich') return true;
      return false;
    }

    if (tod === 'afternoon') {
      if (poi.category === 'canh-quan') return true;
      if (poi.category === 'di-tich') return true;
      if (sub === 'scenic_view_cafe' || sub === 'desserts_bakery') return true;
      if (name.includes('hoàng hôn') || desc.includes('hoàng hôn') || desc.includes('chiều'))
        return true;
      if (poi.category === 'quan-an') return true;
      return false;
    }

    if (tod === 'evening') {
      if (
        name.includes('cầu rồng') ||
        name.includes('sông hàn') ||
        name.includes('cầu trường tiền')
      )
        return true;
      if (
        sub === 'nightlife_bars_pubs' ||
        name.includes('pub') ||
        name.includes('bar') ||
        name.includes('beer') ||
        name.includes('đêm') ||
        name.includes('acoustic')
      )
        return true;
      if (name.includes('chợ đêm') || desc.includes('chợ đêm') || desc.includes('phố đêm'))
        return true;
      if (
        sub === 'coastal_seafood' ||
        sub === 'street_bites_rolls' ||
        name.includes('hải sản') ||
        name.includes('nướng') ||
        name.includes('lẩu')
      )
        return true;
      if (
        sub === 'scenic_view_cafe' ||
        desc.includes('ngắm cảnh đêm') ||
        desc.includes('lung linh')
      )
        return true;
      return false;
    }

    return false;
  });
}

// ─────────────────────────────────────────────
// TAXONOMY VIBES & LOẠI HÌNH CỤ THỂ (THEO NHÓM DATA)
// ─────────────────────────────────────────────
export interface VibeItem {
  id: string;
  label: string;
  keywords: string[];
}

export const VIBES_BY_CATEGORY: Record<string, VibeItem[]> = {
  'di-tich': [
    { id: 'Cổ kính', label: 'Cổ kính & Trầm mặc', keywords: ['Cổ kính', 'Trầm mặc', 'Trầm tư'] },
    { id: 'Lịch sử', label: 'Lịch sử & Dấu ấn Cố Đô', keywords: ['Lịch sử', 'Di sản', 'Cung đình', 'Uy nghiêm'] },
    { id: 'Thanh tịnh', label: 'Thanh tịnh & Thiền định', keywords: ['Thanh tịnh', 'Tôn nghiêm', 'Trang nghiêm'] },
    { id: 'Nghệ thuật', label: 'Kiến trúc & Nghệ thuật Di sản', keywords: ['Nghệ thuật', 'Kiến trúc Châu Âu'] },
    { id: 'Truyền thống', label: 'Làng nghề truyền thống & Văn hóa', keywords: ['Truyền thống', 'Trải nghiệm', 'Học hỏi'] },
    { id: 'Biểu tượng', label: 'Biểu tượng đô thị & Phố đêm', keywords: ['Biểu tượng', 'Về đêm', 'Hiện đại'] },
    { id: 'Sống ảo', label: 'Góc chụp hoài cổ & Áo dài', keywords: ['Sống ảo', 'Check-in'] },
  ],
  'quan-an': [
    { id: 'Bản địa', label: 'Đặc sản bản địa xứ Quảng - Huế', keywords: ['Bản địa', 'Bình dân'] },
    { id: 'Gió biển', label: 'Gió biển & View sông, biển', keywords: ['Gió biển', 'Ngoài trời'] },
    { id: 'Yên bình', label: 'Không gian xanh & Yên tĩnh', keywords: ['Yên tĩnh', 'Yên bình', 'Thanh tịnh'] },
    { id: 'Náo nhiệt', label: 'Náo nhiệt, phố đêm & Gặp gỡ', keywords: ['Náo nhiệt', 'Vỉa hè', 'Ăn vặt', 'Về đêm'] },
    { id: 'Ấm cúng', label: 'Ẩm thực gia đình & Ấm cúng', keywords: ['Ấm cúng', 'Trang trọng'] },
    { id: 'Lãng mạn', label: 'Lãng mạn & Hẹn hò', keywords: ['Lãng mạn', 'Hẹn hò'] },
    { id: 'Hoài niệm', label: 'Hoài niệm & Mộc mạc vintage', keywords: ['Hoài niệm', 'Mộc mạc'] },
    { id: 'Sống ảo', label: 'Góc chụp đẹp & Check-in sống ảo', keywords: ['Sống ảo', 'Check-in'] },
  ],
  'canh-quan': [
    { id: 'Hùng vĩ', label: 'Hùng vĩ & Chinh phục đèo dốc', keywords: ['Hùng vĩ', 'Khám phá'] },
    { id: 'Biển xanh', label: 'Biển xanh & Bờ cát mịn màng', keywords: ['Biển xanh'] },
    { id: 'Thư giãn', label: 'Nghỉ dưỡng suối khoáng & Thư giãn', keywords: ['Thư giãn', 'Hồi phục', 'Trong lành'] },
    { id: 'Hoàng hôn', label: 'Ngắm bình minh & Hoàng hôn đầm phá', keywords: ['Hoàng hôn', 'Mênh mang', 'Thơ mộng'] },
    { id: 'Tự nhiên', label: 'Thiên nhiên sinh thái nguyên sơ', keywords: ['Tự nhiên'] },
    { id: 'Ngoài trời', label: 'Dã ngoại & Hoạt động ngoài trời', keywords: ['Ngoài trời', 'Vui vẻ', 'picnic'] },
  ],
};

export const SPECIFIC_FACETS_BY_CATEGORY: Record<string, { id: string; label: string }[]> = {
  'di-tich': [
    { id: 'imperial_citadel', label: 'Đại Nội & Hoàng cung' },
    { id: 'royal_mausoleums', label: 'Lăng tẩm triều Nguyễn' },
    { id: 'historic_zen_temples', label: 'Chùa cổ & Chốn tổ thiền' },
    { id: 'grand_mountain_ocean_temples', label: 'Tượng Phật & Ngũ Hành Sơn' },
    { id: 'forest_hermitage_monasteries', label: 'Thiền viện & Chữa lành' },
    { id: 'cathedrals_heritage_churches', label: 'Thánh đường Gothic' },
    { id: 'museums_galleries', label: 'Bảo tàng Cổ vật & Mỹ thuật' },
    { id: 'iconic_urban_landmarks', label: 'Cầu Biểu tượng' },
    { id: 'craft_villages', label: 'Làng nghề truyền thống' },
    { id: 'historic_markets', label: 'Chợ truyền thống' },
  ],
  'quan-an': [
    { id: 'traditional_noodles', label: 'Mì Quảng & Bún bò' },
    { id: 'street_bites_rolls', label: 'Bánh bèo, Nậm, Lọc & Nem lụi' },
    { id: 'coastal_seafood', label: 'Hải sản tươi sống' },
    { id: 'green_vegetarian', label: 'Quán chay & Thực dưỡng' },
    { id: 'heritage_fine_dining', label: 'Cơm niêu & Cung đình' },
    { id: 'scenic_view_cafe', label: 'Cafe view đẹp' },
    { id: 'workspace_study_cafe', label: 'Cafe làm việc, học tập' },
    { id: 'retro_street_cafe', label: 'Cà phê muối & Vintage' },
    { id: 'royal_herbal_tea', label: 'Trà Cung đình & Thảo mộc' },
    { id: 'desserts_bakery', label: 'Chè Hẻm xứ Huế & Bánh ngọt' },
    { id: 'specialty_roastery', label: 'Cafe Specialty' },
    { id: 'nightlife_bars_pubs', label: 'Bar, Pub & Acoustic' },
  ],
  'canh-quan': [
    { id: 'beach_coastline', label: 'Bãi biển Mỹ Khê & Lăng Cô' },
    { id: 'mountain_pass_peninsula', label: 'Đèo Hải Vân & Bán đảo Sơn Trà' },
    { id: 'wetland_lagoon_rivers', label: 'Đầm phá Tam Giang & Sông Hương' },
    { id: 'pine_hills_parks', label: 'Đồi thông Thiên An & Công viên' },
    { id: 'waterfalls_hotsprings', label: 'Suối khoáng nóng & Thác nước' },
  ],
};

export interface ExploreFilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: 'all' | 'quan-an' | 'di-tich' | 'canh-quan';
  values: ExploreFilterValues;
  onApply: (newValues: ExploreFilterValues) => void;
  onClearAll: () => void;
  matchingCount: number;
  allPois?: Poi[];
}

// ─────────────────────────────────────────────
// Component: ExploreFilterModal (Mindtrip Design)
// ─────────────────────────────────────────────
export const ExploreFilterModal: React.FC<ExploreFilterModalProps> = ({
  isOpen,
  onClose,
  activeTab,
  values,
  onApply,
  onClearAll,
  matchingCount,
  allPois = [],
}) => {
  const [budget, setBudget] = useState<BudgetTier>(values.budget);
  const [minRating, setMinRating] = useState<number | null>(values.minRating);
  const [radiusKm, setRadiusKm] = useState<number | null>(values.radiusKm ?? null);
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay[]>(values.timeOfDay || []);
  const [ecoCertifiedOnly, setEcoCertifiedOnly] = useState<boolean>(values.ecoCertifiedOnly ?? false);
  const [openNowOnly, setOpenNowOnly] = useState<boolean>(values.openNowOnly ?? false);
  const [freeTicketOnly, setFreeTicketOnly] = useState<boolean>(values.freeTicketOnly ?? false);
  const [rainyDayFriendly, setRainyDayFriendly] = useState<boolean>(values.rainyDayFriendly ?? false);
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
      setOpenNowOnly(values.openNowOnly ?? false);
      setFreeTicketOnly(values.freeTicketOnly ?? false);
      setRainyDayFriendly(values.rainyDayFriendly ?? false);
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

  // Lấy danh sách từ khóa tương ứng của vibe
  const getVibeKeywords = (vibeId: string) => {
    const list = VIBES_BY_CATEGORY[activeTab] || [];
    const item = list.find((v) => v.id === vibeId);
    return (item?.keywords || [vibeId]).map((k) => k.toLowerCase());
  };

  // ── LIVE COUNT TÍNH THEO DATA THẬT ──
  const liveMatchingPois = useMemo(() => {
    if (!allPois || allPois.length === 0) return null;
    return allPois.filter((poi) => {
      // 1. Tab category
      if (activeTab === 'di-tich') {
        if (poi.category !== 'di-tich' && poi.category !== 'chua') return false;
      } else if (activeTab !== 'all') {
        if (poi.category !== activeTab) return false;
      }

      // 2. Budget
      if (budget === '$') {
        const ok = poi.budget_tier === '$' || poi.budget_tier === 'free' || (poi.estimatedCost ?? 0) <= 100000;
        if (!ok) return false;
      } else if (budget === '$$') {
        const ok = poi.budget_tier === '$$' || ((poi.estimatedCost ?? 0) > 100000 && (poi.estimatedCost ?? 0) <= 400000);
        if (!ok) return false;
      } else if (budget === '$$$') {
        const ok = poi.budget_tier === '$$$' || ((poi.estimatedCost ?? 0) > 400000 && (poi.estimatedCost ?? 0) <= 1000000);
        if (!ok) return false;
      } else if (budget === '$$$$') {
        const ok = poi.budget_tier === '$$$$' || (poi.estimatedCost ?? 0) > 1000000;
        if (!ok) return false;
      }

      // 3. Rating
      if (minRating !== null && (poi.rating === null || poi.rating < minRating)) {
        return false;
      }

      // 4. Eco Certified
      if (ecoCertifiedOnly && !isPoiEcoCertified(poi)) {
        return false;
      }

      // 4b. Open now
      if (openNowOnly && poi.opening_hours?.open_now === false) {
        return false;
      }

      // 4c. Free ticket
      if (freeTicketOnly) {
        const isFree = poi.budget_tier === 'free' || (poi.estimatedCost ?? 0) === 0;
        if (!isFree) return false;
      }

      // 4d. Rainy day friendly
      if (rainyDayFriendly && poi.ai_metadata?.rainy_day_friendly !== true) {
        return false;
      }

      // 5. Radius
      if (radiusKm !== null) {
        const center = poi.city === 'Huế' ? CITY_CENTERS['Huế'] : CITY_CENTERS['Đà Nẵng'];
        const distance = getDistanceFromLatLonInKm(center.lat, center.lng, poi.lat, poi.lng);
        if (distance > radiusKm) return false;
      }

      // 6. Time of day
      if (timeOfDay.length > 0 && !matchesTimeOfDay(poi, timeOfDay)) {
        return false;
      }

      // 7. Vibes - CHỈ ÁP DỤNG KHI KHÔNG PHẢI TAB ALL
      if (activeTab !== 'all' && vibes.length > 0) {
        const pVibes = (poi.vibes || []).map((v) => v.toLowerCase());
        const matchVibe = vibes.some((vId) => {
          const keywords = getVibeKeywords(vId);
          return keywords.some((kw) => pVibes.some((pv) => pv.includes(kw) || kw.includes(pv)));
        });
        if (!matchVibe) return false;
      }

      // 8. Sub-categories - CHỈ ÁP DỤNG KHI KHÔNG PHẢI TAB ALL
      if (activeTab !== 'all' && subCategories.length > 0) {
        const pSub = (poi.sub_category || '').toLowerCase();
        const pName = poi.name.toLowerCase();
        const matchSub = subCategories.some((sc) => {
          const scLower = sc.toLowerCase();
          if (scLower === 'chua') {
            return (
              poi.category === 'chua' ||
              pSub.includes('temple') ||
              pSub.includes('monaster') ||
              pName.includes('chùa') ||
              pName.includes('thiền viện')
            );
          }
          return pSub === scLower || (poi.cuisine && poi.cuisine.toLowerCase() === scLower) || pName.includes(scLower);
        });
        if (!matchSub) return false;
      }

      return true;
    });
  }, [allPois, activeTab, budget, minRating, radiusKm, timeOfDay, ecoCertifiedOnly, openNowOnly, freeTicketOnly, rainyDayFriendly, vibes, subCategories]);

  const liveCount = liveMatchingPois !== null ? liveMatchingPois.length : matchingCount;

  // Đếm POI theo từng Vibe
  const getVibeCount = (vibeId: string) => {
    if (!allPois) return null;
    const keywords = getVibeKeywords(vibeId);
    return allPois.filter((p) => {
      if (activeTab === 'di-tich') {
        if (p.category !== 'di-tich' && p.category !== 'chua') return false;
      } else if (activeTab !== 'all') {
        if (p.category !== activeTab) return false;
      }
      const pVibes = (p.vibes || []).map((v) => v.toLowerCase());
      return keywords.some((kw) => pVibes.some((pv) => pv.includes(kw) || kw.includes(pv)));
    }).length;
  };

  // Đếm POI theo từng Sub-category
  const getSubCategoryCount = (scId: string) => {
    if (!allPois) return null;
    const scLower = scId.toLowerCase();
    return allPois.filter((p) => {
      if (activeTab === 'di-tich') {
        if (p.category !== 'di-tich' && p.category !== 'chua') return false;
      } else if (activeTab !== 'all') {
        if (p.category !== activeTab) return false;
      }
      const pSub = (p.sub_category || '').toLowerCase();
      const pName = p.name.toLowerCase();
      if (scLower === 'chua') {
        return p.category === 'chua' || pSub.includes('temple') || pSub.includes('monaster') || pName.includes('chùa');
      }
      return pSub === scLower || (p.cuisine && p.cuisine.toLowerCase() === scLower) || pName.includes(scLower);
    }).length;
  };

  if (!isOpen) return null;

  const isDefaultState =
    budget === 'all' &&
    minRating === null &&
    radiusKm === null &&
    timeOfDay.length === 0 &&
    ecoCertifiedOnly === false &&
    openNowOnly === false &&
    freeTicketOnly === false &&
    rainyDayFriendly === false &&
    (activeTab === 'all' || (vibes.length === 0 && subCategories.length === 0));

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
        openNowOnly,
        freeTicketOnly,
        rainyDayFriendly,
        vibes: activeTab === 'all' ? [] : vibes,
        subCategories: activeTab === 'all' ? [] : subCategories,
        cuisines,
        greenWeight,
        budgetWeight,
      });
      setIsApplying(false);
      onClose();
    }, 120);
  };

  const handleClear = () => {
    setBudget('all');
    setMinRating(null);
    setRadiusKm(null);
    setTimeOfDay([]);
    setEcoCertifiedOnly(false);
    setOpenNowOnly(false);
    setFreeTicketOnly(false);
    setRainyDayFriendly(false);
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      {/* 1. Backdrop */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-[3px] transition-opacity"
        aria-hidden="true"
      />

      {/* 2. Dialog Shell (Mindtrip Minimalist Design) */}
      <div
        className="relative w-full max-w-[520px] bg-white rounded-[24px] sm:rounded-[28px] shadow-2xl overflow-hidden z-10 flex flex-col max-h-[90vh] sm:max-h-[85vh] animate-fadeInScale"
        role="dialog"
        aria-modal="true"
        aria-labelledby="filter-modal-title"
      >
        {/* ── HEADER ── */}
        <div className="relative px-6 py-4 border-b border-neutral-100 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-neutral-100 text-neutral-800 transition flex items-center justify-center cursor-pointer"
            aria-label="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
          <h2 id="filter-modal-title" className="text-base font-bold text-neutral-900 tracking-tight">
            Filters
          </h2>
          <div className="w-8" />
        </div>

        {/* ── SCROLLABLE BODY ── */}
        <div className="px-6 py-5 space-y-6 overflow-y-auto overscroll-contain flex-1 auto-hide-scrollbar">

          {/* 1. Vibes - CHỈ HIỂN THỊ KHI Ở CÁC NHÓM CỤ THỂ, KHÔNG HIỆN Ở "TẤT CẢ" */}
          {activeTab !== 'all' && VIBES_BY_CATEGORY[activeTab] && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-neutral-900">Vibes</h3>
                {vibes.length > 0 && (
                  <span className="text-xs text-neutral-500 font-medium">{vibes.length} đã chọn</span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {VIBES_BY_CATEGORY[activeTab].map(({ id, label }) => {
                  const isSelected = vibes.includes(id);
                  const count = getVibeCount(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => toggleArrayItem(vibes, id, setVibes)}
                      className={`px-4 py-2 rounded-full border text-[13px] transition-all cursor-pointer flex items-center gap-1.5 ${
                        isSelected
                          ? 'bg-black border-black text-white font-medium shadow-sm'
                          : 'bg-white border-neutral-200 text-neutral-800 hover:border-neutral-400 font-normal'
                      } ${count === 0 && !isSelected ? 'opacity-40' : ''}`}
                    >
                      <span>{label}</span>
                      {count !== null && (
                        <span className={`text-[11px] ${isSelected ? 'text-neutral-300' : 'text-neutral-400'}`}>
                          ({count})
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 2. Loại hình cụ thể - CHỈ HIỂN THỊ KHI Ở CÁC NHÓM CỤ THỂ, KHÔNG HIỆN Ở "TẤT CẢ" */}
          {activeTab !== 'all' && SPECIFIC_FACETS_BY_CATEGORY[activeTab] && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-neutral-900">Loại hình cụ thể</h3>
                {subCategories.length > 0 && (
                  <span className="text-xs text-neutral-500 font-medium">{subCategories.length} đã chọn</span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {SPECIFIC_FACETS_BY_CATEGORY[activeTab].map(({ id, label }) => {
                  const isSelected = subCategories.includes(id);
                  const count = getSubCategoryCount(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => toggleArrayItem(subCategories, id, setSubCategories)}
                      className={`px-4 py-2 rounded-full border text-[13px] transition-all cursor-pointer flex items-center gap-1.5 ${
                        isSelected
                          ? 'bg-black border-black text-white font-medium shadow-sm'
                          : 'bg-white border-neutral-200 text-neutral-800 hover:border-neutral-400 font-normal'
                      } ${count === 0 && !isSelected ? 'opacity-40' : ''}`}
                    >
                      <span>{label}</span>
                      {count !== null && (
                        <span className={`text-[11px] ${isSelected ? 'text-neutral-300' : 'text-neutral-400'}`}>
                          ({count})
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 3. Rating */}
          <div>
            <h3 className="text-sm font-bold text-neutral-900 mb-3">Rating</h3>
            <div className="flex flex-wrap gap-2">
              {[
                { value: 3.0, label: '★ 3+' },
                { value: 3.5, label: '★ 3.5+' },
                { value: 4.0, label: '★ 4+' },
                { value: 4.5, label: '★ 4.5+' },
              ].map(({ value, label }) => {
                const isSelected = minRating === value;
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setMinRating(isSelected ? null : value)}
                    className={`px-4 py-2 rounded-full border text-[13px] transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-black border-black text-white font-medium shadow-sm'
                        : 'bg-white border-neutral-200 text-neutral-800 hover:border-neutral-400 font-normal'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4. Hours */}
          <div>
            <h3 className="text-sm font-bold text-neutral-900 mb-3">Hours</h3>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setOpenNowOnly(!openNowOnly)}
                className={`px-4 py-2 rounded-full border text-[13px] transition-all cursor-pointer ${
                  openNowOnly
                    ? 'bg-black border-black text-white font-medium shadow-sm'
                    : 'bg-white border-neutral-200 text-neutral-800 hover:border-neutral-400 font-normal'
                }`}
              >
                Open now
              </button>
              <button
                type="button"
                onClick={() => {
                  if (timeOfDay.includes('morning')) setTimeOfDay(timeOfDay.filter((t) => t !== 'morning'));
                  else setTimeOfDay([...timeOfDay, 'morning']);
                }}
                className={`px-4 py-2 rounded-full border text-[13px] transition-all cursor-pointer ${
                  timeOfDay.includes('morning')
                    ? 'bg-black border-black text-white font-medium shadow-sm'
                    : 'bg-white border-neutral-200 text-neutral-800 hover:border-neutral-400 font-normal'
                }`}
              >
                Ban ngày
              </button>
              <button
                type="button"
                onClick={() => {
                  if (timeOfDay.includes('evening')) setTimeOfDay(timeOfDay.filter((t) => t !== 'evening'));
                  else setTimeOfDay([...timeOfDay, 'evening']);
                }}
                className={`px-4 py-2 rounded-full border text-[13px] transition-all cursor-pointer ${
                  timeOfDay.includes('evening')
                    ? 'bg-black border-black text-white font-medium shadow-sm'
                    : 'bg-white border-neutral-200 text-neutral-800 hover:border-neutral-400 font-normal'
                }`}
              >
                Buổi tối
              </button>
            </div>
          </div>

          {/* 5. Features */}
          <div>
            <h3 className="text-sm font-bold text-neutral-900 mb-3">Features</h3>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setEcoCertifiedOnly(!ecoCertifiedOnly)}
                className={`px-4 py-2 rounded-full border text-[13px] transition-all cursor-pointer flex items-center gap-1.5 ${
                  ecoCertifiedOnly
                    ? 'bg-black border-black text-white font-medium shadow-sm'
                    : 'bg-white border-neutral-200 text-neutral-800 hover:border-neutral-400 font-normal'
                }`}
              >
                <span>🍃 Chuẩn Xanh</span>
              </button>
              <button
                type="button"
                onClick={() => setFreeTicketOnly(!freeTicketOnly)}
                className={`px-4 py-2 rounded-full border text-[13px] transition-all cursor-pointer ${
                  freeTicketOnly
                    ? 'bg-black border-black text-white font-medium shadow-sm'
                    : 'bg-white border-neutral-200 text-neutral-800 hover:border-neutral-400 font-normal'
                }`}
              >
                Miễn phí vé
              </button>
              <button
                type="button"
                onClick={() => setRainyDayFriendly(!rainyDayFriendly)}
                className={`px-4 py-2 rounded-full border text-[13px] transition-all cursor-pointer ${
                  rainyDayFriendly
                    ? 'bg-black border-black text-white font-medium shadow-sm'
                    : 'bg-white border-neutral-200 text-neutral-800 hover:border-neutral-400 font-normal'
                }`}
              >
                Thân thiện ngày mưa
              </button>
            </div>
          </div>

          {/* 6. Budget */}
          <div>
            <h3 className="text-sm font-bold text-neutral-900 mb-3">Budget</h3>
            <div className="flex flex-wrap gap-2">
              {[
                { id: '$$$$' as const, label: '$$$$', desc: '> 1.000k' },
                { id: '$$$' as const, label: '$$$', desc: '400k - 1.000k' },
                { id: '$$' as const, label: '$$', desc: '100k - 400k' },
                { id: '$' as const, label: '$', desc: '< 100k' },
              ].map(({ id, label, desc }) => {
                const isSelected = budget === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setBudget(isSelected ? 'all' : id)}
                    className={`px-4 py-2 rounded-full border text-[13px] transition-all cursor-pointer flex items-center gap-1.5 ${
                      isSelected
                        ? 'bg-black border-black text-white font-medium shadow-sm'
                        : 'bg-white border-neutral-200 text-neutral-800 hover:border-neutral-400 font-normal'
                    }`}
                  >
                    <span className="font-semibold">{label}</span>
                    <span className={`text-[11px] ${isSelected ? 'text-neutral-300' : 'text-neutral-400'}`}>
                      ({desc})
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 7. Distance */}
          <div>
            <h3 className="text-sm font-bold text-neutral-900 mb-3">Distance</h3>
            <div className="flex flex-wrap gap-2">
              {[
                { value: 1, label: '1 km' },
                { value: 3, label: '3 km' },
                { value: 5, label: '5 km' },
                { value: 10, label: '10 km' },
                { value: null, label: 'Tất cả' },
              ].map(({ value, label }) => {
                const isSelected = radiusKm === value;
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setRadiusKm(value)}
                    className={`px-4 py-2 rounded-full border text-[13px] transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-black border-black text-white font-medium shadow-sm'
                        : 'bg-white border-neutral-200 text-neutral-800 hover:border-neutral-400 font-normal'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

        </div>

        {/* ── FOOTER ── */}
        <div className="px-6 py-4 bg-white border-t border-neutral-100 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={handleClear}
            disabled={isDefaultState || isApplying}
            className={`text-sm font-medium transition cursor-pointer ${
              isDefaultState || isApplying
                ? 'text-neutral-300 cursor-not-allowed'
                : 'text-neutral-500 hover:text-black underline underline-offset-4'
            }`}
          >
            Đặt lại
          </button>

          <button
            type="button"
            onClick={handleApplyWithFeedback}
            disabled={isApplying}
            className="bg-black hover:bg-neutral-800 active:scale-95 text-white font-semibold text-sm px-7 py-2.5 rounded-full transition-all shadow-md flex items-center gap-2 cursor-pointer select-none"
          >
            {isApplying ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span>Đang áp dụng...</span>
              </>
            ) : (
              <span>
                {liveCount > 0 ? `Xem ${liveCount} địa điểm` : 'Xem địa điểm'}
              </span>
            )}
          </button>
        </div>

      </div>
    </div>
  );
};

export default ExploreFilterModal;
