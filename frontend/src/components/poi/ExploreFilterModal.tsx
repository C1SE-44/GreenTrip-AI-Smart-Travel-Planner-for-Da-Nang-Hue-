import React, { useState, useEffect, useMemo } from 'react';
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
import type { Poi, PoiCategory } from '@/data/pois';
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
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
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
        name.includes('chợ đêm') ||
        name.includes('phố đi bộ') ||
        desc.includes('đêm') ||
        desc.includes('tối')
      )
        return true;
      if (
        sub === 'nightlife_bars_pubs' ||
        sub === 'scenic_view_cafe' ||
        sub === 'heritage_fine_dining' ||
        sub === 'coastal_seafood'
      )
        return true;
      if (poi.category === 'quan-an') return true;
      return false;
    }

    return true;
  });
}

interface ExploreFilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: 'all' | PoiCategory;
  values: ExploreFilterValues;
  onApply: (newValues: ExploreFilterValues) => void;
  onClearAll: () => void;
  matchingCount: number;
  allPois?: Poi[];
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

// ─────────────────────────────────────────────
// TAXONOMY VIBES & LOẠI HÌNH CỤ THỂ (THEO NHÓM DATA)
// ─────────────────────────────────────────────

// 1. VIBES THEO NHÓM (MAP CHUẨN XÁC 100% THEO VIBES CÓ THỰC TRONG DATABASE)
export interface VibeItem {
  id: string;
  label: string;
  icon: typeof Sparkles;
  keywords: string[];
}

export const VIBES_BY_CATEGORY: Record<string, VibeItem[]> = {
  'di-tich': [
    { id: 'Cổ kính', label: 'Cổ kính & Trầm mặc', icon: Landmark, keywords: ['Cổ kính', 'Trầm mặc', 'Trầm tư'] },
    { id: 'Lịch sử', label: 'Lịch sử & Dấu ấn Cố Đô', icon: Building2, keywords: ['Lịch sử', 'Di sản', 'Cung đình', 'Uy nghiêm'] },
    { id: 'Thanh tịnh', label: 'Thanh tịnh & Thiền định', icon: Sparkles, keywords: ['Thanh tịnh', 'Tôn nghiêm', 'Trang nghiêm'] },
    { id: 'Nghệ thuật', label: 'Kiến trúc & Nghệ thuật Di sản', icon: Landmark, keywords: ['Nghệ thuật', 'Kiến trúc Châu Âu'] },
    { id: 'Truyền thống', label: 'Làng nghề truyền thống & Văn hóa', icon: Sparkles, keywords: ['Truyền thống', 'Trải nghiệm', 'Học hỏi'] },
    { id: 'Biểu tượng', label: 'Biểu tượng đô thị & Phố đêm', icon: MapPin, keywords: ['Biểu tượng', 'Về đêm', 'Hiện đại'] },
    { id: 'Sống ảo', label: 'Góc chụp hoài cổ & Áo dài', icon: Camera, keywords: ['Sống ảo', 'Check-in'] },
  ],
  'quan-an': [
    { id: 'Bản địa', label: 'Đặc sản bản địa xứ Quảng - Huế', icon: UtensilsCrossed, keywords: ['Bản địa', 'Bình dân'] },
    { id: 'Gió biển', label: 'Gió biển & View sông, biển', icon: Waves, keywords: ['Gió biển', 'Ngoài trời'] },
    { id: 'Yên bình', label: 'Không gian xanh & Yên tĩnh', icon: Leaf, keywords: ['Yên tĩnh', 'Yên bình', 'Thanh tịnh'] },
    { id: 'Náo nhiệt', label: 'Náo nhiệt, phố đêm & Gặp gỡ', icon: Sparkles, keywords: ['Náo nhiệt', 'Vỉa hè', 'Ăn vặt', 'Về đêm'] },
    { id: 'Ấm cúng', label: 'Ẩm thực gia đình & Ấm cúng', icon: Users, keywords: ['Ấm cúng', 'Trang trọng'] },
    { id: 'Lãng mạn', label: 'Lãng mạn & Hẹn hò', icon: Heart, keywords: ['Lãng mạn', 'Hẹn hò'] },
    { id: 'Hoài niệm', label: 'Hoài niệm & Mộc mạc vintage', icon: Coffee, keywords: ['Hoài niệm', 'Mộc mạc'] },
    { id: 'Sống ảo', label: 'Góc chụp đẹp & Check-in sống ảo', icon: Camera, keywords: ['Sống ảo', 'Check-in'] },
  ],
  'canh-quan': [
    { id: 'Hùng vĩ', label: 'Hùng vĩ & Chinh phục đèo dốc', icon: Mountain, keywords: ['Hùng vĩ', 'Khám phá'] },
    { id: 'Biển xanh', label: 'Biển xanh & Bờ cát mịn màng', icon: Waves, keywords: ['Biển xanh'] },
    { id: 'Thư giãn', label: 'Nghỉ dưỡng suối khoáng & Thư giãn', icon: Trees, keywords: ['Thư giãn', 'Hồi phục', 'Trong lành'] },
    { id: 'Hoàng hôn', label: 'Ngắm bình minh & Hoàng hôn đầm phá', icon: Camera, keywords: ['Hoàng hôn', 'Mênh mang', 'Thơ mộng'] },
    { id: 'Tự nhiên', label: 'Thiên nhiên sinh thái nguyên sơ', icon: Leaf, keywords: ['Tự nhiên'] },
    { id: 'Ngoài trời', label: 'Dã ngoại & Hoạt động ngoài trời', icon: Users, keywords: ['Ngoài trời', 'Vui vẻ', 'picnic'] },
  ],
  'all': [
    { id: 'Bản địa', label: 'Đặc sản bản địa xứ Quảng - Huế', icon: UtensilsCrossed, keywords: ['Bản địa', 'Bình dân'] },
    { id: 'Lịch sử', label: 'Di sản & Lịch sử Cố Đô', icon: Landmark, keywords: ['Cổ kính', 'Lịch sử', 'Di sản'] },
    { id: 'Thanh tịnh', label: 'Tâm linh & Thanh tịnh chữa lành', icon: Sparkles, keywords: ['Thanh tịnh', 'Trang nghiêm'] },
    { id: 'Hùng vĩ', label: 'Thiên nhiên hùng vĩ & Khám phá', icon: Mountain, keywords: ['Hùng vĩ', 'Khám phá'] },
    { id: 'Biển xanh', label: 'Biển xanh & Nghỉ dưỡng trong lành', icon: Waves, keywords: ['Biển xanh', 'Thư giãn'] },
    { id: 'Sống ảo', label: 'Góc chụp đẹp & Sống ảo', icon: Camera, keywords: ['Sống ảo', 'Check-in'] },
    { id: 'Ấm cúng', label: 'Ấm cúng, phù hợp gia đình', icon: Users, keywords: ['Ấm cúng', 'Trang trọng'] },
    { id: 'Náo nhiệt', label: 'Sôi động & Phố đêm náo nhiệt', icon: Sparkles, keywords: ['Náo nhiệt', 'Về đêm'] },
  ],
};

// 2. LOẠI HÌNH CỤ THỂ (FULL TAXONOMY TỪ DATABASE)
export const SPECIFIC_FACETS_BY_CATEGORY: Record<string, { id: string; label: string; icon: typeof Landmark }[]> = {
  'di-tich': [
    { id: 'imperial_citadel', label: 'Đại Nội & Hoàng cung triều Nguyễn', icon: Landmark },
    { id: 'royal_mausoleums', label: 'Lăng tẩm các vị Vua triều Nguyễn', icon: Building2 },
    { id: 'historic_zen_temples', label: 'Chùa cổ & Chốn tổ thiền thanh tịnh', icon: Landmark },
    { id: 'grand_mountain_ocean_temples', label: 'Tượng Phật & Vách núi Ngũ Hành Sơn', icon: Mountain },
    { id: 'forest_hermitage_monasteries', label: 'Thiền viện rừng sâu & Không gian chữa lành', icon: Trees },
    { id: 'cathedrals_heritage_churches', label: 'Thánh đường Gothic cổ (Nhà thờ Con Gà)', icon: Church },
    { id: 'museums_galleries', label: 'Bảo tàng Cổ vật & Mỹ thuật Di sản', icon: Compass },
    { id: 'iconic_urban_landmarks', label: 'Cầu Biểu tượng (Cầu Rồng, Sông Hàn, Trường Tiền)', icon: MapPin },
    { id: 'craft_villages', label: 'Làng nghề truyền thống (Hương Thủy Xuân, Nón lá)', icon: Sparkles },
    { id: 'historic_markets', label: 'Chợ lâu năm (Chợ Hàn, Chợ Cồn, Chợ Đông Ba)', icon: ShoppingBag },
    { id: 'performing_arts_heritage', label: 'Biểu diễn Nghệ thuật Di sản (Nhã nhạc, Thuyền rồng)', icon: Sparkles },
  ],
  'quan-an': [
    { id: 'traditional_noodles', label: 'Mì Quảng, Bún bò & Món sợi đặc sản', icon: UtensilsCrossed },
    { id: 'street_bites_rolls', label: 'Bánh bèo, Nậm, Lọc truyền thống & Nem lụi', icon: Utensils },
    { id: 'coastal_seafood', label: 'Hải sản tươi sống miền biển', icon: Waves },
    { id: 'green_vegetarian', label: 'Cơm chay & Thực dưỡng thanh tịnh', icon: Salad },
    { id: 'heritage_fine_dining', label: 'Cơm niêu & Ẩm thực Cung đình sang trọng', icon: Landmark },
    { id: 'scenic_view_cafe', label: 'Cafe view đẹp (biển, sông Hương & phố)', icon: Coffee },
    { id: 'workspace_study_cafe', label: 'Cafe làm việc, học tập 24/7 & Yên tĩnh', icon: Coffee },
    { id: 'retro_street_cafe', label: 'Cà phê Muối & Cafe Cóc vintage hoài niệm', icon: Coffee },
    { id: 'royal_herbal_tea', label: 'Trà Cung đình Huế & Thảo mộc giải nhiệt', icon: Sparkles },
    { id: 'desserts_bakery', label: 'Chè Hẻm xứ Huế, Kem & Tiệm bánh ngọt', icon: Heart },
    { id: 'specialty_roastery', label: 'Cafe Specialty & Rang xay thủ công', icon: Coffee },
    { id: 'nightlife_bars_pubs', label: 'Bar, Pub & Nhạc Acoustic buổi tối', icon: Sparkles },
    { id: 'asian_specialties', label: 'Món Á: Nhật, Hàn Quốc, Thái Lan', icon: Utensils },
    { id: 'western_international', label: 'Món Âu - Mỹ & Pizza/Steakhouse', icon: Utensils },
  ],
  'canh-quan': [
    { id: 'beach_coastline', label: 'Bãi biển Mỹ Khê & Vịnh Lăng Cô', icon: Waves },
    { id: 'mountain_pass_peninsula', label: 'Đèo Hải Vân & Bán đảo Sơn Trà', icon: Mountain },
    { id: 'wetland_lagoon_rivers', label: 'Đầm phá Tam Giang & Sông Hương', icon: Compass },
    { id: 'pine_hills_parks', label: 'Đồi thông Thiên An & Công viên cây xanh', icon: Trees },
    { id: 'waterfalls_hotsprings', label: 'Suối khoáng nóng (Thần Tài) & Thác nước tự nhiên', icon: Droplets },
  ],
  'all': [
    { id: 'chua', label: 'Chùa cổ, Thiền viện & Điểm tâm linh', icon: Landmark },
    { id: 'imperial_citadel', label: 'Đại Nội & Hoàng cung di sản', icon: Landmark },
    { id: 'royal_mausoleums', label: 'Lăng tẩm các vị Vua triều Nguyễn', icon: Building2 },
    { id: 'beach_coastline', label: 'Bãi biển & Vịnh đẹp Đà Nẵng - Lăng Cô', icon: Waves },
    { id: 'mountain_pass_peninsula', label: 'Cung đèo Hải Vân & Bán đảo Sơn Trà', icon: Mountain },
    { id: 'traditional_noodles', label: 'Mì Quảng, Bún bò đặc sản xứ Quảng - Huế', icon: UtensilsCrossed },
    { id: 'street_bites_rolls', label: 'Bánh bèo, Nậm, Lọc & Nem lụi', icon: Utensils },
    { id: 'coastal_seafood', label: 'Hải sản tươi sống miền biển', icon: Waves },
    { id: 'scenic_view_cafe', label: 'Cafe view đẹp sống ảo & ngắm cảnh', icon: Coffee },
    { id: 'green_vegetarian', label: 'Quán chay & Thực dưỡng xanh', icon: Salad },
    { id: 'iconic_urban_landmarks', label: 'Cầu Rồng, Cầu Sông Hàn & Phố đêm', icon: MapPin },
  ],
};

// ─────────────────────────────────────────────
// Design Tokens
// ─────────────────────────────────────────────
const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-1';

const SEGMENTED_BUTTON_SELECTED =
  'bg-emerald-800 border-emerald-800 text-white shadow-[0_2px_8px_rgba(6,95,70,0.22)]';
const SEGMENTED_BUTTON_UNSELECTED =
  'bg-white border-[#E2E8E4] text-neutral-800 hover:border-emerald-300 hover:bg-emerald-50/40';

const PILL_CHIP_BASE =
  `min-h-[36px] px-3 py-1.5 rounded-full text-xs transition-all duration-150 active:scale-[0.97] cursor-pointer select-none border flex items-center justify-center gap-1.5 whitespace-nowrap ${FOCUS_RING}`;
const PILL_CHIP_SELECTED =
  'bg-emerald-800 border-emerald-800 text-white font-semibold shadow-[0_2px_8px_rgba(6,95,70,0.22)]';
const PILL_CHIP_UNSELECTED =
  'bg-white border-[#E2E8E4] text-neutral-800 font-medium hover:border-emerald-300 hover:bg-emerald-50/40';

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
  allPois = [],
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

  // Lấy danh sách từ khóa tương ứng của vibe
  const getVibeKeywords = (vibeId: string) => {
    const list = VIBES_BY_CATEGORY[activeTab] || VIBES_BY_CATEGORY['all'];
    const item = list.find((v) => v.id === vibeId);
    return (item?.keywords || [vibeId]).map((k) => k.toLowerCase());
  };

  // ── LIVE COUNT / PREVIEW TÍNH THEO DATA THẬT ──
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

      // 7. Vibes (Khớp theo keywords ngữ nghĩa trong database)
      if (vibes.length > 0) {
        const pVibes = (poi.vibes || []).map((v) => v.toLowerCase());
        const matchVibe = vibes.some((vId) => {
          const keywords = getVibeKeywords(vId);
          return keywords.some((kw) => pVibes.some((pv) => pv.includes(kw) || kw.includes(pv)));
        });
        if (!matchVibe) return false;
      }

      // 8. Sub-categories
      if (subCategories.length > 0) {
        const pSub = (poi.sub_category || '').toLowerCase();
        const pName = poi.name.toLowerCase();
        const matchSub = subCategories.some((sc) => {
          const scLower = sc.toLowerCase();
          if (scLower === 'chua') {
            return poi.category === 'chua' || pSub.includes('temple') || pSub.includes('monaster') || pName.includes('chùa') || pName.includes('thiền viện');
          }
          return pSub === scLower || (poi.cuisine && poi.cuisine.toLowerCase() === scLower) || pName.includes(scLower);
        });
        if (!matchSub) return false;
      }

      return true;
    });
  }, [allPois, activeTab, budget, minRating, radiusKm, timeOfDay, ecoCertifiedOnly, vibes, subCategories]);

  const liveCount = liveMatchingPois !== null ? liveMatchingPois.length : matchingCount;

    // Đếm POI theo từng Vibe (Khớp theo keywords dữ liệu thật)
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
    }, 150);
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
        className="relative w-full max-w-[560px] bg-[#F7FAF7] rounded-[28px] shadow-[0_24px_60px_-12px_rgba(18,34,24,0.18),0_6px_24px_-6px_rgba(18,34,24,0.08)] ring-1 ring-neutral-900/5 overflow-hidden z-10 flex flex-col max-h-[92vh] sm:max-h-[85vh] animate-fadeInScale"
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
                      : 'Danh lam thắng cảnh & thiên nhiên nguyên sơ'}
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

        {/* ── SCROLLABLE BODY (4 Card Phân Tầng Chuyên Nghiệp) ── */}
        <div className="px-5 sm:px-6 py-4 space-y-3.5 overflow-y-auto overscroll-contain flex-1 auto-hide-scrollbar">
          
          {/* ══════════════════════════════════════════════════════
              CARD 1 (TẦNG 1): BỘ LỌC CHUNG THEO NHU CẦU THỰC TẾ
              ══════════════════════════════════════════════════════ */}
          <div className="bg-white rounded-2xl border border-[#E3EAE4] p-4 shadow-[0_2px_10px_rgba(20,35,25,0.03)] space-y-4">
            {/* Header Tầng 1 */}
            <div className="flex items-center justify-between gap-2 border-b border-neutral-100 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
                <h3 className="text-xs font-extrabold text-neutral-900 uppercase tracking-wider">
                  Tầng 1: Bộ lọc chung
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

            {/* 2. Bán kính di chuyển */}
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
              <p className="text-[10px] text-neutral-400 italic">
                * Bán kính tính từ trung tâm TP Đà Nẵng hoặc Cố Đô Huế
              </p>
            </div>

            {/* 3. Thời điểm trải nghiệm */}
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
              CARD 2: MỨC ĐỘ HÀI LÒNG CỦA DU KHÁCH (ĐÁNH GIÁ SAO)
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
                    className={`min-h-[38px] py-1 px-2 rounded-xl border flex items-center justify-center text-center transition-all cursor-pointer select-none active:scale-[0.97] ${
                      isSelected ? SEGMENTED_BUTTON_SELECTED : SEGMENTED_BUTTON_UNSELECTED
                    }`}
                  >
                    <span className="text-xs font-bold leading-tight flex items-center justify-center gap-1">
                      {value !== null && (
                        <Star
                          className={`w-3 h-3 ${
                            isSelected ? 'text-amber-300 fill-amber-300' : 'text-amber-500 fill-amber-400'
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
              CARD 3: VIBE TRẢI NGHIỆM (TẦNG 2 - PHONG CÁCH & CẢM NHẬN)
              ══════════════════════════════════════════════════════ */}
          <div className="bg-white rounded-2xl border border-[#E3EAE4] p-4 shadow-[0_2px_10px_rgba(20,35,25,0.03)] space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-bold text-neutral-900 uppercase tracking-tight flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span>
                  Vibe trải nghiệm ({activeTab === 'quan-an' ? 'Ẩm thực & Cafe' : activeTab === 'di-tich' ? 'Di tích & Văn hóa' : activeTab === 'canh-quan' ? 'Cảnh quan' : 'Tất cả'})
                </span>
              </h3>
              {vibes.length > 0 && (
                <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-full">
                  {vibes.length} đã chọn
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {(VIBES_BY_CATEGORY[activeTab] || VIBES_BY_CATEGORY['all']).map(({ id, label, icon: IconComponent }) => {
                const isSelected = vibes.includes(id);
                const count = getVibeCount(id);
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => toggleArrayItem(vibes, id, setVibes)}
                    className={`${PILL_CHIP_BASE} ${
                      isSelected ? PILL_CHIP_SELECTED : PILL_CHIP_UNSELECTED
                    } ${count === 0 && !isSelected ? 'opacity-50' : ''}`}
                  >
                    <IconComponent
                      className={`w-3.5 h-3.5 shrink-0 ${
                        isSelected ? 'text-emerald-200' : 'text-emerald-700'
                      }`}
                    />
                    <span>{label}</span>
                    {count !== null && (
                      <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ml-0.5 ${
                        isSelected
                          ? 'bg-emerald-700 text-white'
                          : count === 0
                            ? 'bg-neutral-100 text-neutral-400'
                            : 'bg-neutral-100 text-neutral-600'
                      }`}>
                        {count}
                      </span>
                    )}
                    {isSelected && <Check className="w-3 h-3 ml-0.5" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════
              CARD 4: LOẠI HÌNH CỤ THỂ (TẦNG 2 - FULL TAXONOMY DATA)
              ══════════════════════════════════════════════════════ */}
          <div className="bg-white rounded-2xl border border-[#E3EAE4] p-4 shadow-[0_2px_10px_rgba(20,35,25,0.03)] space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-bold text-neutral-900 uppercase tracking-tight flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5 text-neutral-700 shrink-0" />
                <span>Loại hình cụ thể (Lọc chuyên sâu theo nhánh)</span>
              </h3>
              {subCategories.length > 0 && (
                <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-full">
                  {subCategories.length} đã chọn
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {(SPECIFIC_FACETS_BY_CATEGORY[activeTab] || SPECIFIC_FACETS_BY_CATEGORY['all']).map(({ id, label, icon: IconComponent }) => {
                const isSelected = subCategories.includes(id);
                const count = getSubCategoryCount(id);
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => toggleArrayItem(subCategories, id, setSubCategories)}
                    className={`${PILL_CHIP_BASE} ${
                      isSelected ? PILL_CHIP_SELECTED : PILL_CHIP_UNSELECTED
                    } ${count === 0 && !isSelected ? 'opacity-50' : ''}`}
                  >
                    <IconComponent
                      className={`w-3.5 h-3.5 shrink-0 ${
                        isSelected ? 'text-emerald-200' : 'text-emerald-700'
                      }`}
                    />
                    <span>{label}</span>
                    {count !== null && (
                      <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ml-0.5 ${
                        isSelected
                          ? 'bg-emerald-700 text-white'
                          : count === 0
                            ? 'bg-neutral-100 text-neutral-400'
                            : 'bg-neutral-100 text-neutral-600'
                      }`}>
                        {count}
                      </span>
                    )}
                    {isSelected && <Check className="w-3 h-3 ml-0.5" />}
                  </button>
                );
              })}
            </div>
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
                <span>Đang áp dụng bộ lọc...</span>
              </>
            ) : (
              <>
                <span>
                  {liveCount > 0
                    ? `Xem ${liveCount} địa điểm lý tưởng`
                    : 'Không tìm thấy địa điểm (Thử nới lỏng)'}
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
