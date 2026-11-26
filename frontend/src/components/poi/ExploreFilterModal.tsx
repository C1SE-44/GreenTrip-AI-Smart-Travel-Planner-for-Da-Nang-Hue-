import React, { useState, useEffect, useMemo } from 'react';
import { Clock, CloudRain, Compass, Leaf, Loader2, Ticket, X } from 'lucide-react';
import type { Poi } from '@/data/pois';
import { evaluateLocalAuthentic } from '@/data/pois';
import { isPoiEcoCertified } from '@/services/poi';

// ─────────────────────────────────────────────
// Types & Contracts
// ─────────────────────────────────────────────
export type BudgetTier = 'all' | 'free' | '$' | '$$' | '$$$' | '$$$$';
export type EcoPriority = 'all' | 'basic' | 'balanced' | 'eco' | 'pure';
export type TimeOfDay = 'morning' | 'afternoon' | 'evening';
export type PoiCategoryFilter = 'di-tich' | 'canh-quan' | 'chua' | 'quan-an' | 'luu-tru' | 'bao-tang' | 'giai-tri';

export interface ExploreFilterValues {
  budget: BudgetTier;
  ecoPriority: EcoPriority;
  ecoCertifiedOnly: boolean;
  greenTransitOnly: boolean;
  localAuthenticOnly: boolean;
  categories: PoiCategoryFilter[];
  timeOfDay: TimeOfDay[];
  radiusKm: number | null;
  cuisines: string[];
  minRating: number | null;
  openNowOnly: boolean;
  vibes: string[];
  subCategories: string[];
  features: string[];
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
  localAuthenticOnly: false,
  categories: [],
  timeOfDay: [],
  radiusKm: null,
  cuisines: [],
  minRating: null,
  openNowOnly: false,
  vibes: [],
  subCategories: [],
  features: [],
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
  if (poi.category === 'luu-tru') return true;

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
        sub === 'craft_beer' ||
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
        sub === 'traditional_night_markets' ||
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
      if (poi.category === 'quan-an') return true;
      return false;
    }

    return false;
  });
}

// ─────────────────────────────────────────────
// TAXONOMY: LOẠI HÌNH CỤ THỂ THEO NHÓM
// ─────────────────────────────────────────────
export interface SpecificFacet {
  id: string;
  label: string;
  subKeys: string[];
}

export const CATEGORY_FACET_TITLES: Record<string, string> = {
  'quan-an': 'Ẩm thực',
  'di-tich': 'Di sản & Lịch sử',
  'canh-quan': 'Trải nghiệm thiên nhiên',
  'chua': 'Chùa chiền & Tâm linh',
  'luu-tru': 'Lưu trú xanh',
};

export const SPECIFIC_FACETS_BY_CATEGORY: Record<string, SpecificFacet[]> = {
  'quan-an': [
    {
      id: 'local_specialty',
      label: 'Đặc sản xứ Quảng & Huế',
      subKeys: ['local_specialty'],
    },
    {
      id: 'traditional_noodles',
      label: 'Mì Quảng, Bún bò & Phở',
      subKeys: ['traditional_noodles'],
    },
    {
      id: 'street_bites_rolls',
      label: 'Bánh bèo, Nậm, Lọc & Nem lụi',
      subKeys: ['street_bites_rolls'],
    },
    {
      id: 'coastal_seafood',
      label: 'Hải sản tươi sống ven biển',
      subKeys: ['coastal_seafood', 'seafood'],
    },
    {
      id: 'traditional_night_markets',
      label: 'Chợ truyền thống & Chợ đêm',
      subKeys: ['traditional_night_markets', 'market'],
    },
    {
      id: 'green_vegetarian',
      label: 'Quán chay & Thực dưỡng',
      subKeys: ['green_vegetarian', 'vegetarian', 'plant_based_vegan'],
    },
    {
      id: 'heritage_fine_dining',
      label: 'Cơm niêu & Ẩm thực cung đình',
      subKeys: ['heritage_fine_dining', 'heritage_dining', 'fine_dining'],
    },
    {
      id: 'asian_specialties',
      label: 'Ẩm thực Á Đông (Nhật, Hàn, Thái)',
      subKeys: ['asian', 'asian_specialties'],
    },
    {
      id: 'western_dining',
      label: 'Ẩm thực Âu - Mỹ (Pizza, Steak)',
      subKeys: ['western', 'western_international'],
    },
    {
      id: 'scenic_view_cafe',
      label: 'Cafe view đẹp & Sống ảo',
      subKeys: ['scenic_view_cafe', 'cafe'],
    },
    {
      id: 'workspace_study_cafe',
      label: 'Cafe làm việc & Yên tĩnh',
      subKeys: ['workspace_study_cafe'],
    },
    {
      id: 'retro_street_cafe',
      label: 'Cà phê muối & Vintage',
      subKeys: ['retro_street_cafe', 'specialty_coffee', 'specialty_roastery'],
    },
    {
      id: 'royal_herbal_tea',
      label: 'Trà Cung đình & Thảo mộc',
      subKeys: ['royal_herbal_tea', 'tea_herbal'],
    },
    {
      id: 'desserts_bakery',
      label: 'Tiệm bánh & Chè tráng miệng',
      subKeys: ['desserts_bakery', 'dessert', 'bakery'],
    },
    {
      id: 'nightlife_bars_pubs',
      label: 'Bar, Pub & Acoustic',
      subKeys: ['nightlife_bars_pubs', 'nightlife', 'craft_beer'],
    },
  ],
  'di-tich': [
    {
      id: 'imperial_citadel',
      label: 'Đại Nội & Kinh thành di sản',
      subKeys: ['imperial_citadel'],
    },
    {
      id: 'royal_mausoleums',
      label: 'Lăng tẩm triều Nguyễn',
      subKeys: ['royal_mausoleums'],
    },
    {
      id: 'historic_memorials',
      label: 'Di tích lịch sử & Tưởng niệm',
      subKeys: ['historic_memorials', 'heritage'],
    },
    {
      id: 'museums_galleries',
      label: 'Bảo tàng & Không gian triển lãm',
      subKeys: ['museums_galleries', 'museum', 'art_space'],
    },
    {
      id: 'craft_villages',
      label: 'Làng nghề truyền thống',
      subKeys: ['craft_villages', 'craft_village'],
    },
    {
      id: 'historic_zen_temples',
      label: 'Cổ tự & Chốn tổ thiền',
      subKeys: ['historic_zen_temples', 'pagoda', 'grand_mountain_ocean_temples', 'monastery'],
    },
    {
      id: 'cathedrals_heritage_churches',
      label: 'Thánh đường & Nhà thờ cổ',
      subKeys: ['cathedrals_heritage_churches', 'church'],
    },
    {
      id: 'performing_arts_heritage',
      label: 'Nghệ thuật & Biểu diễn di sản',
      subKeys: ['performance', 'performing_arts_heritage'],
    },
  ],
  'canh-quan': [
    {
      id: 'beach_coastline',
      label: 'Bãi biển & Bờ cát',
      subKeys: ['beach_coastline', 'beach', 'bay'],
    },
    {
      id: 'urban_landmarks',
      label: 'Điểm nhấn đô thị & Cầu biểu tượng',
      subKeys: ['urban_landmarks', 'bridge'],
    },
    {
      id: 'mountain_pass_peninsula',
      label: 'Bán đảo Sơn Trà & Đèo Hải Vân',
      subKeys: ['mountain_pass_peninsula', 'peninsula', 'mountain'],
    },
    {
      id: 'wetland_lagoon_rivers',
      label: 'Đầm phá, Sông nước & Rừng ngập mặn',
      subKeys: ['wetland_lagoon_rivers', 'lagoon', 'river', 'river_ecotourism', 'mangrove_forest', 'lake'],
    },
    {
      id: 'pine_hills_parks',
      label: 'Đồi thông & Công viên sinh thái',
      subKeys: ['pine_hills_parks', 'park', 'grassland', 'forest'],
    },
    {
      id: 'waterfalls_hotsprings',
      label: 'Suối khoáng nóng & Thác nước',
      subKeys: ['waterfalls_hotsprings', 'hot_spring', 'waterfall', 'stream', 'wellness'],
    },
    {
      id: 'ecotourism_camping',
      label: 'Sinh thái cộng đồng & Cắm trại',
      subKeys: ['agritourism', 'camping', 'eco_resort', 'community_based', 'adventure', 'snorkeling'],
    },
  ],
  'chua': [
    {
      id: 'historic_zen_temples',
      label: 'Cổ tự & Chốn tổ thiền môn',
      subKeys: ['historic_zen_temples', 'pagoda', 'monastery'],
    },
    {
      id: 'grand_mountain_ocean_temples',
      label: 'Chùa tựa núi hướng biển',
      subKeys: ['grand_mountain_ocean_temples', 'mountain_temple'],
    },
    {
      id: 'heritage_shrines',
      label: 'Đền đài & Miếu cổ linh thiêng',
      subKeys: ['shrine', 'heritage'],
    },
  ],
  'luu-tru': [
    {
      id: 'eco_lodge',
      label: 'Eco Lodge & Sinh thái',
      subKeys: ['eco_lodge'],
    },
    {
      id: 'homestay',
      label: 'Homestay bản địa',
      subKeys: ['homestay'],
    },
    {
      id: 'resort',
      label: 'Resort & Nghỉ dưỡng',
      subKeys: ['resort'],
    },
    {
      id: 'villa',
      label: 'Villa & Biệt thự',
      subKeys: ['villa'],
    },
    {
      id: 'hotel',
      label: 'Khách sạn xanh',
      subKeys: ['hotel', 'serviced_apartment', 'guesthouse', 'hostel'],
    },
  ],
};

// ─────────────────────────────────────────────
// TAXONOMY: ĐẶC TRƯNG (FEATURES - MINDTRIP STYLE)
// ─────────────────────────────────────────────
export interface FeatureItem {
  id: string;
  label: string;
}

export const FEATURES_BY_CATEGORY: Record<string, FeatureItem[]> = {
  'quan-an': [
    { id: 'quiet', label: 'Không gian yên tĩnh' },
    { id: 'highly_reviewed', label: 'Được đánh giá cao (★ 4.5+)' },
    { id: 'family_friendly', label: 'Thân thiện với gia đình' },
    { id: 'pet_friendly', label: 'Thân thiện với thú cưng' },
    { id: 'fine_dining', label: 'Ẩm thực cao cấp' },
    { id: 'street_food', label: 'Bình dân vỉa hè' },
    { id: 'serves_alcohol', label: 'Phục vụ đồ uống có cồn' },
    { id: 'local_authentic', label: 'Đặc sản bản địa chuẩn vị' },
    { id: 'scenic_view', label: 'Góc chụp đẹp / View biển' },
    { id: 'rainy_friendly', label: 'Thân thiện ngày mưa' },
    { id: 'eco_green', label: '🍃 Chuẩn du lịch xanh' },
  ],
  'di-tich': [
    { id: 'must_see', label: 'Nhất định phải xem' },
    { id: 'unesco', label: 'Di sản thế giới UNESCO' },
    { id: 'peaceful_zen', label: 'Không gian thanh tịnh & Trầm mặc' },
    { id: 'highly_reviewed', label: 'Được đánh giá cao (★ 4.5+)' },
    { id: 'family_friendly', label: 'Thân thiện với gia đình' },
    { id: 'craft_workshop', label: 'Trải nghiệm làng nghề thủ công' },
    { id: 'heritage_photo', label: 'Chụp ảnh cổ phục & Kiến trúc' },
    { id: 'free_ticket', label: 'Miễn phí tham quan' },
    { id: 'eco_green', label: '🍃 Bảo tồn & Chuẩn Xanh' },
  ],
  'canh-quan': [
    { id: 'must_see', label: 'Nhất định phải xem' },
    { id: 'scenic_nature', label: 'Có cảnh đẹp thiên nhiên' },
    { id: 'sunset_sunrise', label: 'Ngắm hoàng hôn & Bình minh' },
    { id: 'outdoor_adventure', label: 'Khám phá & Trekking' },
    { id: 'wellness_relax', label: 'Thư giãn & Khoáng nóng' },
    { id: 'picnic_camping', label: 'Dã ngoại & Cắm trại ngoài trời' },
    { id: 'family_friendly', label: 'Thân thiện với gia đình' },
    { id: 'highly_reviewed', label: 'Được đánh giá cao (★ 4.5+)' },
    { id: 'free_ticket', label: 'Miễn phí tham quan' },
    { id: 'eco_green', label: '🍃 Bảo tồn sinh thái xanh' },
  ],
  'luu-tru': [
    { id: 'eco_green', label: '🍃 Chuẩn lưu trú xanh' },
    { id: 'highly_reviewed', label: 'Được đánh giá cao (★ 4.5+)' },
    { id: 'quiet', label: 'Không gian yên tĩnh' },
    { id: 'family_friendly', label: 'Thân thiện với gia đình' },
    { id: 'scenic_view', label: 'View biển / Sông / Vườn' },
    { id: 'rainy_friendly', label: 'Phù hợp ngày mưa' },
  ],
};

// ─────────────────────────────────────────────
// TAXONOMY: MATCHING FUNCTIONS
// ─────────────────────────────────────────────
export function matchesPoiSubCategory(poi: Poi, scId: string, category: string): boolean {
  const facets = SPECIFIC_FACETS_BY_CATEGORY[category] || [];
  const facet = facets.find((f) => f.id === scId);
  const targetKeys = facet ? facet.subKeys : [scId];

  const pSub = (poi.sub_category || '').toLowerCase();
  const pCuisine = (poi.cuisine || '').toLowerCase();
  const pName = poi.name.toLowerCase();

  return targetKeys.some((key) => {
    const kLower = key.toLowerCase();
    if (pSub === kLower || pCuisine === kLower) return true;
    if (
      kLower === 'chua' &&
      (poi.category === 'chua' || pName.includes('chùa') || pName.includes('thiền viện'))
    )
      return true;
    return false;
  });
}

export function matchesPoiFeature(poi: Poi, featureId: string, category: string): boolean {
  const name = (poi.name || '').toLowerCase();
  const desc = (poi.description || '').toLowerCase();
  const sub = (poi.sub_category || '').toLowerCase();
  const vibes = (poi.vibes || []).map((v) => v.toLowerCase());
  const ai = poi.ai_metadata || {};
  const targetCrowd = ai.target_crowd || [];
  const dnaTags = (ai.dna_tags || []).map((t) => t.toLowerCase());
  const cost = poi.estimatedCost ?? 0;
  const rating = poi.rating ?? 0;

  switch (featureId) {
    // Ẩm thực features
    case 'quiet':
      return (
        ai.noise_pace === 'peaceful_zen' ||
        sub === 'workspace_study_cafe' ||
        vibes.some((v) => v.includes('yên tĩnh') || v.includes('tập trung')) ||
        desc.includes('yên tĩnh')
      );
    case 'highly_reviewed':
      return rating >= 4.5;
    case 'family_friendly':
      return (
        targetCrowd.includes('family') ||
        vibes.some((v) => v.includes('ấm cúng')) ||
        desc.includes('gia đình')
      );
    case 'pet_friendly':
      return (
        dnaTags.includes('pet_friendly') ||
        dnaTags.includes('pets_allowed') ||
        name.includes('pet') ||
        name.includes('mèo') ||
        name.includes('cún') ||
        desc.includes('thú cưng') ||
        desc.includes('chó mèo')
      );
    case 'fine_dining':
      return (
        poi.budget_tier === '$$$' ||
        poi.budget_tier === '$$$$' ||
        sub === 'heritage_fine_dining' ||
        sub === 'fine_dining' ||
        cost >= 200000 ||
        desc.includes('cao cấp') ||
        desc.includes('cung đình')
      );
    case 'street_food':
      return (
        poi.budget_tier === '$' ||
        sub === 'street_bites_rolls' ||
        sub === 'traditional_night_markets' ||
        vibes.some((v) => v.includes('bình dân') || v.includes('vỉa hè') || v.includes('ăn vặt')) ||
        (cost > 0 && cost <= 50000)
      );
    case 'serves_alcohol':
      return (
        sub === 'nightlife_bars_pubs' ||
        sub === 'craft_beer' ||
        sub === 'nightlife' ||
        name.includes('bar') ||
        name.includes('pub') ||
        name.includes('beer') ||
        name.includes('lounge') ||
        name.includes('cocktail') ||
        desc.includes('đồ uống có cồn') ||
        desc.includes('bia thủ công')
      );
    case 'local_authentic':
      return (
        poi.isLocalBusiness === true ||
        sub === 'local_specialty' ||
        vibes.some((v) => v.includes('bản địa')) ||
        desc.includes('gia truyền') ||
        desc.includes('lâu đời') ||
        desc.includes('xứ quảng') ||
        desc.includes('chuẩn vị')
      );
    case 'scenic_view':
      return (
        sub === 'scenic_view_cafe' ||
        vibes.some((v) =>
          v.includes('sống ảo') ||
          v.includes('gió biển') ||
          v.includes('view biển') ||
          v.includes('view sông')
        ) ||
        desc.includes('view sông') ||
        desc.includes('view biển') ||
        desc.includes('ngắm cảnh')
      );
    case 'rainy_friendly':
      return (
        ai.rainy_day_friendly === true ||
        desc.includes('trong nhà') ||
        sub === 'museums_galleries'
      );
    case 'eco_green':
    case 'eco_certified':
      return isPoiEcoCertified(poi) || (poi.ecoScore !== null && poi.ecoScore >= 70);

    // Di tích & Cảnh quan features
    case 'must_see':
      return (
        name.includes('đại nội') ||
        name.includes('khải định') ||
        name.includes('tự đức') ||
        name.includes('thiên mụ') ||
        name.includes('cầu rồng') ||
        name.includes('cầu sông hàn') ||
        name.includes('linh ứng') ||
        name.includes('ngũ hành sơn') ||
        name.includes('đèo hải vân') ||
        name.includes('mỹ khê') ||
        name.includes('sơn trà') ||
        name.includes('bảo tàng điêu khắc chăm') ||
        vibes.some((v) => v.includes('biểu tượng')) ||
        (poi.ecoScore !== null && poi.ecoScore >= 85)
      );
    case 'unesco':
      return (
        desc.includes('unesco') ||
        name.includes('đại nội') ||
        name.includes('khải định') ||
        name.includes('tự đức') ||
        name.includes('minh mạng') ||
        name.includes('gia long') ||
        name.includes('đồng khánh') ||
        desc.includes('di sản thế giới') ||
        desc.includes('quần thể di tích cố đô huế')
      );
    case 'peaceful_zen':
      return (
        poi.category === 'chua' ||
        sub === 'historic_zen_temples' ||
        sub === 'pagoda' ||
        sub === 'monastery' ||
        vibes.some((v) => v.includes('thanh tịnh') || v.includes('trầm mặc') || v.includes('tôn nghiêm')) ||
        desc.includes('thanh tịnh') ||
        desc.includes('thiền định')
      );
    case 'craft_workshop':
      return (
        sub === 'craft_villages' ||
        sub === 'craft_village' ||
        name.includes('làng nghề') ||
        name.includes('làng gốm') ||
        name.includes('làng đá') ||
        name.includes('làng nón') ||
        name.includes('làng hương') ||
        desc.includes('trải nghiệm làm') ||
        desc.includes('thủ công')
      );
    case 'heritage_photo':
      return (
        vibes.some((v) => v.includes('nghệ thuật') || v.includes('sống ảo') || v.includes('kiến trúc')) ||
        name.includes('đại nội') ||
        name.includes('lăng') ||
        name.includes('cung đình') ||
        desc.includes('cổ phục') ||
        desc.includes('áo dài') ||
        desc.includes('kiến trúc')
      );
    case 'free_ticket':
      return (
        poi.budget_tier === 'free' ||
        cost === 0 ||
        desc.includes('miễn phí vé') ||
        desc.includes('vé vào cửa: miễn phí')
      );
    case 'scenic_nature':
      return (
        sub === 'beach_coastline' ||
        sub === 'mountain_pass_peninsula' ||
        sub === 'wetland_lagoon_rivers' ||
        sub === 'pine_hills_parks' ||
        sub === 'waterfalls_hotsprings' ||
        vibes.some((v) => v.includes('tự nhiên') || v.includes('biển xanh') || v.includes('hùng vĩ')) ||
        desc.includes('thiên nhiên') ||
        desc.includes('cảnh quan')
      );
    case 'sunset_sunrise':
      return (
        vibes.some((v) => v.includes('hoàng hôn') || v.includes('bình minh')) ||
        name.includes('hoàng hôn') ||
        name.includes('bình minh') ||
        desc.includes('hoàng hôn') ||
        desc.includes('bình minh') ||
        name.includes('đồi vọng cảnh') ||
        name.includes('đầm chuồn') ||
        name.includes('mỹ khê')
      );
    case 'outdoor_adventure':
      return (
        sub === 'mountain_pass_peninsula' ||
        sub === 'adventure' ||
        vibes.some((v) => v.includes('khám phá') || v.includes('hùng vĩ') || v.includes('ngoài trời')) ||
        name.includes('hải vân') ||
        name.includes('sơn trà') ||
        name.includes('bạch mã') ||
        desc.includes('trekking') ||
        desc.includes('leo núi')
      );
    case 'wellness_relax':
      return (
        sub === 'waterfalls_hotsprings' ||
        sub === 'hot_spring' ||
        name.includes('khoáng nóng') ||
        name.includes('alba') ||
        name.includes('mỹ an') ||
        vibes.some((v) => v.includes('thư giãn') || v.includes('nghỉ dưỡng')) ||
        desc.includes('suối khoáng') ||
        desc.includes('thư giãn')
      );
    case 'picnic_camping':
      return (
        sub === 'pine_hills_parks' ||
        sub === 'camping' ||
        name.includes('cắm trại') ||
        name.includes('camping') ||
        name.includes('đồi thiên an') ||
        name.includes('suối hoa') ||
        name.includes('yên retreat') ||
        desc.includes('dã ngoại') ||
        desc.includes('cắm trại')
      );
    default:
      return false;
  }
}

export interface ExploreFilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: 'all' | 'for-you' | 'quan-an' | 'di-tich' | 'canh-quan' | 'chua' | 'luu-tru' | string;
  values: ExploreFilterValues;
  onApply: (newValues: ExploreFilterValues) => void;
  onClearAll: () => void;
  matchingCount: number;
  allPois?: Poi[];
}

// ─────────────────────────────────────────────
// Component: ExploreFilterModal (Mindtrip Minimalist Design)
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
  const [localAuthenticOnly, setLocalAuthenticOnly] = useState<boolean>(values.localAuthenticOnly ?? false);
  const [openNowOnly, setOpenNowOnly] = useState<boolean>(values.openNowOnly ?? false);
  const [freeTicketOnly, setFreeTicketOnly] = useState<boolean>(values.freeTicketOnly ?? false);
  const [rainyDayFriendly, setRainyDayFriendly] = useState<boolean>(values.rainyDayFriendly ?? false);
  const [subCategories, setSubCategories] = useState<string[]>(values.subCategories || []);
  const [features, setFeatures] = useState<string[]>(values.features || []);
  const [cuisines, setCuisines] = useState<string[]>(values.cuisines || []);
  const [greenWeight, setGreenWeight] = useState<number>(values.greenWeight ?? 50);
  const [budgetWeight, setBudgetWeight] = useState<number>(values.budgetWeight ?? 50);

  const [isApplying, setIsApplying] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setBudget(values.budget);
      setMinRating(activeTab === 'all' ? null : values.minRating);
      setRadiusKm(values.radiusKm ?? null);
      setTimeOfDay(values.timeOfDay || []);
      setEcoCertifiedOnly(values.ecoCertifiedOnly ?? false);
      setLocalAuthenticOnly(values.localAuthenticOnly ?? false);
      setOpenNowOnly(values.openNowOnly ?? false);
      setFreeTicketOnly(values.freeTicketOnly ?? false);
      setRainyDayFriendly(values.rainyDayFriendly ?? false);
      setSubCategories(activeTab === 'all' ? [] : values.subCategories || []);
      setFeatures(activeTab === 'all' ? [] : values.features || []);
      setCuisines(values.cuisines || []);
      setGreenWeight(values.greenWeight ?? 50);
      setBudgetWeight(values.budgetWeight ?? 50);
      setIsApplying(false);
    }
  }, [isOpen, values, activeTab]);

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
      const cost = poi.estimatedCost ?? 0;
      if (freeTicketOnly || budget === 'free') {
        const isFree = poi.budget_tier === 'free' || cost === 0;
        if (!isFree) return false;
      } else if (budget === '$') {
        if (activeTab === 'luu-tru') {
          if (cost > 800000 && poi.budget_tier !== '$') return false;
        } else {
          if (cost > 50000 && poi.budget_tier !== '$') return false;
        }
      } else if (budget === '$$') {
        if (activeTab === 'luu-tru') {
          if ((cost <= 800000 || cost > 2000000) && poi.budget_tier !== '$$') return false;
        } else if (activeTab === 'quan-an') {
          if ((cost <= 50000 || cost > 150000) && poi.budget_tier !== '$$') return false;
        } else {
          if ((cost <= 50000 || cost > 200000) && poi.budget_tier !== '$$') return false;
        }
      } else if (budget === '$$$') {
        if (activeTab === 'luu-tru') {
          if (cost <= 2000000 && poi.budget_tier !== '$$$') return false;
        } else if (activeTab === 'quan-an') {
          if (cost <= 150000 && poi.budget_tier !== '$$$') return false;
        } else {
          if (cost <= 200000 && poi.budget_tier !== '$$$') return false;
        }
      } else if (budget === '$$$$') {
        if (cost <= 500000 && poi.budget_tier !== '$$$$') return false;
      }

      // 3. Rating (chỉ khi không phải 'all' và minRating được set)
      if (activeTab !== 'all' && minRating !== null && (poi.rating === null || poi.rating < minRating)) {
        return false;
      }

      // 4. Eco Certified
      if (ecoCertifiedOnly && !isPoiEcoCertified(poi)) {
        return false;
      }

      if (localAuthenticOnly && !evaluateLocalAuthentic(poi).isLocalAuthentic) {
        return false;
      }

      // 4b. Open now
      if (openNowOnly && poi.opening_hours?.open_now === false) {
        return false;
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

      // 7. Sub-categories - CHỈ ÁP DỤNG KHI KHÔNG PHẢI TAB ALL
      if (activeTab !== 'all' && subCategories.length > 0) {
        const matchSub = subCategories.some((scId) =>
          matchesPoiSubCategory(poi, scId, activeTab)
        );
        if (!matchSub) return false;
      }

      // 8. Features - CHỈ ÁP DỤNG KHI KHÔNG PHẢI TAB ALL
      if (activeTab !== 'all' && features.length > 0) {
        const matchFeatures = features.every((fId) =>
          matchesPoiFeature(poi, fId, activeTab)
        );
        if (!matchFeatures) return false;
      }

      return true;
    });
  }, [
    allPois,
    activeTab,
    budget,
    minRating,
    radiusKm,
    timeOfDay,
    ecoCertifiedOnly,
    localAuthenticOnly,
    openNowOnly,
    freeTicketOnly,
    rainyDayFriendly,
    subCategories,
    features,
  ]);

  const liveCount = liveMatchingPois !== null ? liveMatchingPois.length : matchingCount;

  // Đếm POI theo từng Sub-category
  const getSubCategoryCount = (scId: string) => {
    if (!allPois || allPois.length === 0) return null;
    return allPois.filter((p) => {
      if (activeTab === 'di-tich') {
        if (p.category !== 'di-tich' && p.category !== 'chua') return false;
      } else if (activeTab !== 'all') {
        if (p.category !== activeTab) return false;
      }
      return matchesPoiSubCategory(p, scId, activeTab);
    }).length;
  };

  // Đếm POI theo từng Feature
  const getFeatureCount = (fId: string) => {
    if (!allPois || allPois.length === 0) return null;
    return allPois.filter((p) => {
      if (activeTab === 'di-tich') {
        if (p.category !== 'di-tich' && p.category !== 'chua') return false;
      } else if (activeTab !== 'all') {
        if (p.category !== activeTab) return false;
      }
      return matchesPoiFeature(p, fId, activeTab);
    }).length;
  };

  if (!isOpen) return null;

  const isDefaultState =
    budget === 'all' &&
    minRating === null &&
    radiusKm === null &&
    timeOfDay.length === 0 &&
    ecoCertifiedOnly === false &&
    localAuthenticOnly === false &&
    openNowOnly === false &&
    freeTicketOnly === false &&
    rainyDayFriendly === false &&
    (activeTab === 'all' || (features.length === 0 && subCategories.length === 0));

  const handleApplyWithFeedback = () => {
    setIsApplying(true);
    setTimeout(() => {
      onApply({
        ...values,
        budget,
        minRating: activeTab === 'all' ? null : minRating,
        radiusKm,
        timeOfDay,
        ecoCertifiedOnly,
        localAuthenticOnly,
        openNowOnly,
        freeTicketOnly,
        rainyDayFriendly,
        vibes: [],
        subCategories: activeTab === 'all' ? [] : subCategories,
        features: activeTab === 'all' ? [] : features,
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
    setLocalAuthenticOnly(false);
    setOpenNowOnly(false);
    setFreeTicketOnly(false);
    setRainyDayFriendly(false);
    setSubCategories([]);
    setFeatures([]);
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
        className="absolute inset-0 bg-black/50 backdrop-blur-[3px] transition-opacity"
        aria-hidden="true"
      />

      {/* 2. Dialog Shell (Airbnb Filters Modal Style) */}
      <div
        className="relative w-full max-w-[580px] bg-white rounded-3xl shadow-2xl overflow-hidden z-10 flex flex-col max-h-[90vh] sm:max-h-[85vh] animate-fadeInScale"
        role="dialog"
        aria-modal="true"
        aria-labelledby="filter-modal-title"
      >
        {/* ── HEADER ── */}
        <div className="relative px-6 py-4 border-b border-neutral-200 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full hover:bg-neutral-100 text-neutral-900 transition flex items-center justify-center cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
            aria-label="Đóng bộ lọc"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
          <h2 id="filter-modal-title" className="text-base font-bold text-neutral-950 tracking-tight">
            Bộ lọc
          </h2>
          <div className="w-10" />
        </div>

        {/* ── SCROLLABLE BODY ── */}
        <div className="px-6 py-5 space-y-6 overflow-y-auto overscroll-contain flex-1 auto-hide-scrollbar">

          {/* 0. Gợi ý nhanh cho bạn (Airbnb "Recommended for you" 4 square icon cards) */}
          <div className="border-b border-neutral-200 pb-6">
            <h3 className="text-sm font-bold text-neutral-950 mb-3.5">Gợi ý nhanh cho bạn</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <button
                type="button"
                aria-pressed={ecoCertifiedOnly}
                onClick={() => setEcoCertifiedOnly(!ecoCertifiedOnly)}
                className={`rounded-2xl border-2 p-3.5 flex flex-col items-center justify-center gap-2 text-center transition cursor-pointer min-h-[94px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${
                  ecoCertifiedOnly
                    ? 'border-emerald-800 bg-emerald-50/80 text-emerald-950'
                    : 'border-neutral-200 bg-white hover:border-neutral-400 text-neutral-800'
                }`}
              >
                <span className={`w-9 h-9 rounded-xl flex items-center justify-center ${ecoCertifiedOnly ? 'bg-emerald-800 text-white' : 'bg-emerald-50 text-emerald-700'}`}>
                  <Leaf className="w-4 h-4" aria-hidden="true" />
                </span>
                <span className="text-xs font-semibold leading-tight">Chuẩn Xanh</span>
              </button>

              <button
                type="button"
                aria-pressed={localAuthenticOnly}
                onClick={() => setLocalAuthenticOnly(!localAuthenticOnly)}
                className={`rounded-2xl border-2 p-3.5 flex flex-col items-center justify-center gap-2 text-center transition cursor-pointer min-h-[94px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${
                  localAuthenticOnly
                    ? 'border-emerald-800 bg-emerald-50/80 text-emerald-950'
                    : 'border-neutral-200 bg-white hover:border-neutral-400 text-neutral-800'
                }`}
              >
                <span className={`w-9 h-9 rounded-xl flex items-center justify-center ${localAuthenticOnly ? 'bg-emerald-800 text-white' : 'bg-neutral-100 text-neutral-800'}`}>
                  <Compass className="w-4 h-4" aria-hidden="true" />
                </span>
                <span className="text-xs font-semibold leading-tight">Bản địa ít đông</span>
              </button>

              <button
                type="button"
                aria-pressed={openNowOnly}
                onClick={() => setOpenNowOnly(!openNowOnly)}
                className={`rounded-2xl border-2 p-3.5 flex flex-col items-center justify-center gap-2 text-center transition cursor-pointer min-h-[94px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${
                  openNowOnly
                    ? 'border-neutral-950 bg-neutral-100 text-neutral-950'
                    : 'border-neutral-200 bg-white hover:border-neutral-400 text-neutral-800'
                }`}
              >
                <span className={`w-9 h-9 rounded-xl flex items-center justify-center ${openNowOnly ? 'bg-neutral-950 text-white' : 'bg-neutral-100 text-neutral-800'}`}>
                  <Clock className="w-4 h-4" aria-hidden="true" />
                </span>
                <span className="text-xs font-semibold leading-tight">Đang mở cửa</span>
              </button>

              {activeTab === 'di-tich' || activeTab === 'canh-quan' ? (
                <button
                  type="button"
                  aria-pressed={freeTicketOnly}
                  onClick={() => setFreeTicketOnly(!freeTicketOnly)}
                  className={`rounded-2xl border-2 p-3.5 flex flex-col items-center justify-center gap-2 text-center transition cursor-pointer min-h-[94px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${
                    freeTicketOnly
                      ? 'border-neutral-950 bg-neutral-100 text-neutral-950'
                      : 'border-neutral-200 bg-white hover:border-neutral-400 text-neutral-800'
                  }`}
                >
                  <span className={`w-9 h-9 rounded-xl flex items-center justify-center ${freeTicketOnly ? 'bg-neutral-950 text-white' : 'bg-neutral-100 text-neutral-800'}`}>
                    <Ticket className="w-4 h-4" aria-hidden="true" />
                  </span>
                  <span className="text-xs font-semibold leading-tight">Miễn phí vé</span>
                </button>
              ) : (
                <button
                  type="button"
                  aria-pressed={rainyDayFriendly}
                  onClick={() => setRainyDayFriendly(!rainyDayFriendly)}
                  className={`rounded-2xl border-2 p-3.5 flex flex-col items-center justify-center gap-2 text-center transition cursor-pointer min-h-[94px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${
                    rainyDayFriendly
                      ? 'border-neutral-950 bg-neutral-100 text-neutral-950'
                      : 'border-neutral-200 bg-white hover:border-neutral-400 text-neutral-800'
                  }`}
                >
                  <span className={`w-9 h-9 rounded-xl flex items-center justify-center ${rainyDayFriendly ? 'bg-neutral-950 text-white' : 'bg-neutral-100 text-neutral-800'}`}>
                    <CloudRain className="w-4 h-4" aria-hidden="true" />
                  </span>
                  <span className="text-xs font-semibold leading-tight">Hợp ngày mưa</span>
                </button>
              )}
            </div>
          </div>

          {/* 1. Khoảng giá (Airbnb Segmented Control) */}
          <div className="border-b border-neutral-200 pb-6">
            <h3 className="text-sm font-bold text-neutral-950 mb-1">Khoảng giá</h3>
            <p className="text-xs text-neutral-600 mb-3.5">
              {activeTab === 'luu-tru'
                ? 'Chọn mức giá phòng tham khảo mỗi đêm'
                : 'Chọn mức chi phí dự kiến cho mỗi người'}
            </p>
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50/70 p-1 grid grid-cols-2 sm:grid-cols-4 gap-1">
              {(activeTab === 'quan-an'
                ? [
                    { id: 'all' as const, label: 'Tất cả', desc: 'Mọi mức giá' },
                    { id: '$' as const, label: '$', desc: '< 50k · Bình dân' },
                    { id: '$$' as const, label: '$$', desc: '50k - 150k' },
                    { id: '$$$' as const, label: '$$$', desc: '> 150k · Cao cấp' },
                  ]
                : activeTab === 'luu-tru'
                  ? [
                      { id: 'all' as const, label: 'Tất cả', desc: 'Mọi mức giá' },
                      { id: '$' as const, label: '$', desc: '< 800k/đêm' },
                      { id: '$$' as const, label: '$$', desc: '800k - 2tr/đêm' },
                      { id: '$$$' as const, label: '$$$', desc: '> 2tr/đêm' },
                    ]
                  : activeTab === 'di-tich' || activeTab === 'canh-quan'
                    ? [
                        { id: 'free' as const, label: '0đ', desc: 'Miễn phí vé' },
                        { id: '$' as const, label: '$', desc: '< 50k' },
                        { id: '$$' as const, label: '$$', desc: '50k - 200k' },
                        { id: '$$$' as const, label: '$$$', desc: '> 200k' },
                      ]
                    : [
                        { id: 'all' as const, label: 'Tất cả', desc: 'Mọi mức giá' },
                        { id: '$' as const, label: '$', desc: '< 100k' },
                        { id: '$$' as const, label: '$$', desc: '100k - 400k' },
                        { id: '$$$' as const, label: '$$$', desc: '> 400k' },
                      ]
              ).map(({ id, label, desc }) => {
                const isSelected = budget === id;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => setBudget(isSelected && id !== 'all' ? 'all' : id)}
                    className={`min-h-[54px] px-2.5 py-2 rounded-xl text-center transition cursor-pointer flex flex-col items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${
                      isSelected
                        ? 'bg-white border-2 border-neutral-950 text-neutral-950 shadow-xs'
                        : 'border-2 border-transparent text-neutral-700 hover:bg-white/70'
                    }`}
                  >
                    <span className="text-xs font-bold">{label}</span>
                    <span className="text-xs text-neutral-600 mt-0.5 leading-tight">{desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Loại hình cụ thể */}
          {activeTab !== 'all' && SPECIFIC_FACETS_BY_CATEGORY[activeTab] && (
            <div className="border-b border-neutral-200 pb-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-neutral-950">
                  {CATEGORY_FACET_TITLES[activeTab] || 'Loại hình cụ thể'}
                </h3>
                {subCategories.length > 0 && (
                  <span className="text-xs text-neutral-600 font-semibold">{subCategories.length} đã chọn</span>
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
                      aria-pressed={isSelected}
                      onClick={() => toggleArrayItem(subCategories, id, setSubCategories)}
                      className={`min-h-[40px] px-3.5 py-2 rounded-full border text-xs transition cursor-pointer flex items-center gap-1.5 ${
                        isSelected
                          ? 'bg-neutral-950 border-neutral-950 text-white font-semibold shadow-xs'
                          : 'bg-white border-neutral-300 text-neutral-800 hover:border-neutral-950 font-medium'
                      } ${count === 0 && !isSelected ? 'opacity-45' : ''}`}
                    >
                      <span>{label}</span>
                      {count !== null && (
                        <span className={`text-xs ${isSelected ? 'text-neutral-300' : 'text-neutral-600'}`}>
                          ({count})
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 3. Đặc trưng */}
          {activeTab !== 'all' && FEATURES_BY_CATEGORY[activeTab] && (
            <div className="border-b border-neutral-200 pb-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-neutral-950">Đặc trưng &amp; Tiện ích</h3>
                {features.length > 0 && (
                  <span className="text-xs text-neutral-600 font-semibold">{features.length} đã chọn</span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {FEATURES_BY_CATEGORY[activeTab].map(({ id, label }) => {
                  const isSelected = features.includes(id);
                  const count = getFeatureCount(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => toggleArrayItem(features, id, setFeatures)}
                      className={`min-h-[40px] px-3.5 py-2 rounded-full border text-xs transition cursor-pointer flex items-center gap-1.5 ${
                        isSelected
                          ? 'bg-neutral-950 border-neutral-950 text-white font-semibold shadow-xs'
                          : 'bg-white border-neutral-300 text-neutral-800 hover:border-neutral-950 font-medium'
                      } ${count === 0 && !isSelected ? 'opacity-45' : ''}`}
                    >
                      <span>{label}</span>
                      {count !== null && (
                        <span className={`text-xs ${isSelected ? 'text-neutral-300' : 'text-neutral-600'}`}>
                          ({count})
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 4. Đánh giá tối thiểu */}
          {activeTab !== 'all' && activeTab !== 'quan-an' && (
            <div className="border-b border-neutral-200 pb-6">
              <h3 className="text-sm font-bold text-neutral-950 mb-3">Đánh giá tối thiểu</h3>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: 3.0, label: '★ 3.0+' },
                  { value: 3.5, label: '★ 3.5+' },
                  { value: 4.0, label: '★ 4.0+' },
                  { value: 4.5, label: '★ 4.5+' },
                ].map(({ value, label }) => {
                  const isSelected = minRating === value;
                  return (
                    <button
                      key={label}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => setMinRating(isSelected ? null : value)}
                      className={`min-h-[40px] px-4 py-2 rounded-full border text-xs transition cursor-pointer ${
                        isSelected
                          ? 'bg-neutral-950 border-neutral-950 text-white font-semibold shadow-xs'
                          : 'bg-white border-neutral-300 text-neutral-800 hover:border-neutral-950 font-medium'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 5. Thời gian hoạt động */}
          <div className="border-b border-neutral-200 pb-6">
            <h3 className="text-sm font-bold text-neutral-950 mb-3">Khung giờ trải nghiệm</h3>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                aria-pressed={timeOfDay.includes('morning')}
                onClick={() => {
                  if (timeOfDay.includes('morning')) setTimeOfDay(timeOfDay.filter((t) => t !== 'morning'));
                  else setTimeOfDay([...timeOfDay, 'morning']);
                }}
                className={`min-h-[40px] px-4 py-2 rounded-full border text-xs transition cursor-pointer ${
                  timeOfDay.includes('morning')
                    ? 'bg-neutral-950 border-neutral-950 text-white font-semibold shadow-xs'
                    : 'bg-white border-neutral-300 text-neutral-800 hover:border-neutral-950 font-medium'
                }`}
              >
                Ban ngày
              </button>
              <button
                type="button"
                aria-pressed={timeOfDay.includes('evening')}
                onClick={() => {
                  if (timeOfDay.includes('evening')) setTimeOfDay(timeOfDay.filter((t) => t !== 'evening'));
                  else setTimeOfDay([...timeOfDay, 'evening']);
                }}
                className={`min-h-[40px] px-4 py-2 rounded-full border text-xs transition cursor-pointer ${
                  timeOfDay.includes('evening')
                    ? 'bg-neutral-950 border-neutral-950 text-white font-semibold shadow-xs'
                    : 'bg-white border-neutral-300 text-neutral-800 hover:border-neutral-950 font-medium'
                }`}
              >
                Buổi tối &amp; Đêm
              </button>
              {activeTab === 'all' && (
                <button
                  type="button"
                  aria-pressed={freeTicketOnly}
                  onClick={() => setFreeTicketOnly(!freeTicketOnly)}
                  className={`min-h-[40px] px-4 py-2 rounded-full border text-xs transition cursor-pointer ${
                    freeTicketOnly
                      ? 'bg-neutral-950 border-neutral-950 text-white font-semibold shadow-xs'
                      : 'bg-white border-neutral-300 text-neutral-800 hover:border-neutral-950 font-medium'
                  }`}
                >
                  Miễn phí vé
                </button>
              )}
            </div>
          </div>

          {/* 6. Khoảng cách từ trung tâm */}
          <div>
            <h3 className="text-sm font-bold text-neutral-950 mb-3">Khoảng cách từ trung tâm</h3>
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
                    aria-pressed={isSelected}
                    onClick={() => setRadiusKm(value)}
                    className={`min-h-[40px] px-4 py-2 rounded-full border text-xs transition cursor-pointer ${
                      isSelected
                        ? 'bg-neutral-950 border-neutral-950 text-white font-semibold shadow-xs'
                        : 'bg-white border-neutral-300 text-neutral-800 hover:border-neutral-950 font-medium'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── FOOTER (Airbnb Clear all + Show N places) ── */}
        <div className="px-6 py-4 bg-white border-t border-neutral-200 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={handleClear}
            disabled={isDefaultState || isApplying}
            className={`min-h-[40px] px-2 text-sm font-semibold transition cursor-pointer ${
              isDefaultState || isApplying
                ? 'text-neutral-400 cursor-not-allowed'
                : 'text-neutral-900 hover:text-black underline underline-offset-4'
            }`}
          >
            Xóa tất cả
          </button>

          <button
            type="button"
            onClick={handleApplyWithFeedback}
            disabled={isApplying}
            className="bg-neutral-950 hover:bg-neutral-800 active:scale-[0.98] text-white font-semibold text-sm min-h-[44px] px-7 rounded-xl transition shadow-sm flex items-center gap-2 cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
          >
            {isApplying ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" aria-hidden="true" />
                <span>Đang áp dụng…</span>
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
