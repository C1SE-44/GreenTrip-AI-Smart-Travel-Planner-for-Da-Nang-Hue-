export type PoiCategory = 'chua' | 'quan-an' | 'canh-quan' | 'di-tich';
export type CoreCategory = 'food' | 'cafe' | 'nature' | 'culture' | 'spiritual';
export type PoiCity = 'Đà Nẵng' | 'Huế';

export type CuisineType =
  | 'vietnamese_local'
  | 'italian_pizza'
  | 'japanese_sushi'
  | 'korean_bbq'
  | 'western_steak_burger'
  | 'chinese_dimsum'
  | 'thai_spicy'
  | 'plant_based_vegan';

export interface FeaturedReview {
  author: string;
  rating: number;
  relative_time: string;
  text: string;
}

export interface MenuItem {
  name: string;
  price: number;
  description?: string;
  is_signature?: boolean;
  category_tag?: string;
}

export interface AiMetadata {
  menu_image_url?: string;
  menu_items?: MenuItem[];
  dna_tags?: string[];
  target_crowd?: ('solo' | 'couples' | 'family' | 'friends' | 'nomad')[];
  noise_pace?: 'peaceful_zen' | 'chill_slow' | 'bustling_vibrant' | string;
  rainy_day_friendly?: boolean;
  carbon_footprint_score?: number;
  heritage_impact_score?: number;
  eco_place_code?: string;
  area?: string;
  google_category?: string;
  mindtrip_category?: string;
  plus_code?: string;
  raw_rating?: number;
  review_count?: number;
  price_range_display?: string;
  recommended_duration_hours?: string;
  eco_highlights?: string;
  amenities?: string[];
  transport_tip?: string;
  seasonal_note?: string;
  featured_reviews?: FeaturedReview[];
  green_transit?: boolean;
  source?: string;
  facebook_url?: string;
  google_maps_url?: string;
  verification_status?: string;
  last_verified_at?: string;
  data_source?: string;
  [key: string]: unknown;
}

export interface OpeningHoursInfo {
  open_now?: boolean;
  status_text?: string;
  live_status?: string;
  is_temporarily_closed?: boolean;
  weekday_text?: string[];
  [key: string]: unknown;
}

export interface Poi {
  id: string;
  name: string;
  cleanName?: string;
  cleanTitle?: string;
  subTitle?: string;
  isMichelin?: boolean;
  category: PoiCategory;
  city: PoiCity;
  lat: number;
  lng: number;
  address?: string | null;
  image: string;
  gallery?: string[];
  description: string;
  rating: number;
  visitDuration: string;
  ecoScore: number;
  openHours?: string | null;
  estimatedCost?: number | null;
  isLocalBusiness?: boolean;
  // Taxonomy V2 fields
  sub_category?: string | null;
  cuisine?: CuisineType | string | null;
  budget_tier?: '$' | '$$' | '$$$' | 'free' | string | null;
  vibes?: string[];
  best_time?: string[];
  eco_features?: string[];
  ai_metadata?: AiMetadata | null;
  // Commercial B2B Contact & Operating Hours
  phone_number?: string | null;
  website_url?: string | null;
  social_links?: Record<string, string> | null;
  opening_hours?: OpeningHoursInfo | null;
  email?: string | null;
  matchScore?: number;
}

export interface BackendPoiItem {
  id: number | string;
  name?: string | null;
  category?: string | null;
  description?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
  city?: string | null;
  open_hours?: string | null;
  estimated_cost?: number | null;
  average_visit_minutes?: number | null;
  satisfaction_score?: number | null;
  green_score?: number | null;
  is_local_business?: boolean | null;
  local_business_type?: string | null;
  image_url?: string | null;
  gallery_urls?: string[] | null;
  // Taxonomy V2 fields
  sub_category?: string | null;
  cuisine?: CuisineType | string | null;
  budget_tier?: '$' | '$$' | '$$$' | 'free' | string | null;
  vibes?: string[] | null;
  best_time?: string[] | null;
  eco_features?: string[] | null;
  ai_metadata?: AiMetadata | null;
  phone_number?: string | null;
  website_url?: string | null;
  social_links?: Record<string, string> | null;
  opening_hours?: OpeningHoursInfo | null;
  email?: string | null;
  matchScore?: number;
}

export interface PaginationMetadata {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
  has_next: boolean;
  has_previous: boolean;
}

export interface PaginatedPoisResponse {
  items: BackendPoiItem[];
  pagination: PaginationMetadata;
}

export const categoryLabels: Record<PoiCategory, string> = {
  'chua': 'Chùa',
  'quan-an': 'Quán ăn',
  'canh-quan': 'Cảnh quan',
  'di-tich': 'Di tích',
};

export const DEFAULT_IMAGES_BY_CATEGORY: Record<PoiCategory, string[]> = {
  chua: [
    'https://images.unsplash.com/photo-1548013146-72479768bada?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1563897539633-7374c276c212?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1590523741831-ab7e8b8f9c7f?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1509099836639-18ba1795216d?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1548013146-72479768bada?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1528127269322-539801943592?auto=format&fit=crop&w=900&q=80',
  ],
  'quan-an': [
    'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1517433670267-08bbd4be890f?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=900&q=80',
  ],
  'canh-quan': [
    'https://upload.wikimedia.org/wikipedia/commons/2/22/Bai_bien_My_Khe.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/e/eb/Lang_Co_beach.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/5/52/Da_Nang_beach.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/3/36/Son_Tra_Peninsula_Beach.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/6/62/Thuan_An_Beach_Hue.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/1/14/Ngu_Hanh_Son_Da_Nang.jpg',
  ],
  'di-tich': [
    'https://upload.wikimedia.org/wikipedia/commons/4/4a/C%E1%BA%A7u_R%E1%BB%93ng.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/8/88/ThienMuPagoda.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/d/dd/Annam_-_Hu%C3%A9_-_Pavillons_sur_le_bassin_fleuri_au_Tombeau_de_Tu-Duc.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/c/c2/Khai_Dinh_Tomb_Hue.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/1/14/Ngu_Hanh_Son_Da_Nang.jpg',
  ],
};

export function getDeterministicImage(name: string, id: string | number, category: PoiCategory, city?: string): string {
  const lower = name.toLowerCase();
  const key = `${id}_${name}_${city || ''}`;
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  const pick = (arr: string[]) => arr[Math.abs(hash) % arr.length];

  // 1. Contextual subpools for 'quan-an'
  if (category === 'quan-an') {
    if (lower.includes('chay') || lower.includes('tịnh') || lower.includes('rau') || lower.includes('healthy')) {
      return pick([
        'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=900&q=80',
        'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=900&q=80',
        'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=900&q=80',
      ]);
    }
    if (lower.includes('tea') || lower.includes('trà') || lower.includes('tearoom')) {
      return pick([
        'https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=900&q=80',
        'https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=900&q=80',
        'https://images.unsplash.com/photo-1597481499750-3e6b22637e12?auto=format&fit=crop&w=900&q=80',
      ]);
    }
    if (lower.includes('cafe') || lower.includes('cà phê') || lower.includes('coffee')) {
      return pick([
        'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=900&q=80',
        'https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=900&q=80',
        'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=900&q=80',
        'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=900&q=80',
      ]);
    }
    if (lower.includes('dê') || lower.includes('bò') || lower.includes('nướng') || lower.includes('bbq') || lower.includes('lẩu')) {
      return pick([
        'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=900&q=80',
        'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=900&q=80',
        'https://images.unsplash.com/photo-1529193591184-b1d58069ecdd?auto=format&fit=crop&w=900&q=80',
      ]);
    }
    if (lower.includes('ăn vặt') || lower.includes('bánh') || lower.includes('chè') || lower.includes('ốc')) {
      return pick([
        'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=80',
        'https://images.unsplash.com/photo-1626804475297-41608ea09aeb?auto=format&fit=crop&w=900&q=80',
        'https://images.unsplash.com/photo-1517433670267-08bbd4be890f?auto=format&fit=crop&w=900&q=80',
      ]);
    }
    if (lower.includes('bún') || lower.includes('phở') || lower.includes('mì')) {
      return pick([
        'https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?auto=format&fit=crop&w=900&q=80',
        'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=900&q=80',
        'https://images.unsplash.com/photo-1617093727343-374698b1b08d?auto=format&fit=crop&w=900&q=80',
      ]);
    }
    if (lower.includes('hải sản') || lower.includes('seafood') || lower.includes('tôm') || lower.includes('cua')) {
      return pick([
        'https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?auto=format&fit=crop&w=900&q=80',
        'https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=900&q=80',
      ]);
    }
  }

  // 2. Contextual subpools for 'chua'
  if (category === 'chua') {
    if (lower.includes('thiên mụ')) {
      return pick([
        'https://images.unsplash.com/photo-1548013146-72479768bada?auto=format&fit=crop&w=900&q=80',
        'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=900&q=80',
      ]);
    }
    if (lower.includes('linh ứng') || lower.includes('tượng') || lower.includes('quán thế âm')) {
      return pick([
        'https://images.unsplash.com/photo-1563897539633-7374c276c212?auto=format&fit=crop&w=900&q=80',
        'https://images.unsplash.com/photo-1509099836639-18ba1795216d?auto=format&fit=crop&w=900&q=80',
      ]);
    }
    if (lower.includes('thiền viện') || lower.includes('trúc lâm') || lower.includes('sen')) {
      return pick([
        'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=900&q=80',
        'https://images.unsplash.com/photo-1590523741831-ab7e8b8f9c7f?auto=format&fit=crop&w=900&q=80',
      ]);
    }
  }

  // 3. Contextual subpools for 'canh-quan'
  if (category === 'canh-quan') {
    if (lower.includes('biển') || lower.includes('bãi') || lower.includes('mỹ khê') || lower.includes('non nước')) {
      return pick([
        'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=900&q=80',
        'https://images.unsplash.com/photo-1519046904884-53103b34b206?auto=format&fit=crop&w=900&q=80',
      ]);
    }
    if (lower.includes('đèo') || lower.includes('hải vân')) {
      return pick([
        'https://images.unsplash.com/photo-1506012787146-f92b2d7d6d96?auto=format&fit=crop&w=900&q=80',
        'https://images.unsplash.com/photo-1569154941061-e231b4725ef1?auto=format&fit=crop&w=900&q=80',
      ]);
    }
    if (lower.includes('sông') || lower.includes('hương') || lower.includes('hàn')) {
      return pick([
        'https://images.unsplash.com/photo-1507034589631-9433cc6bc453?auto=format&fit=crop&w=900&q=80',
        'https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&w=900&q=80',
      ]);
    }
    if (lower.includes('bà nà') || lower.includes('bana')) {
      return pick([
        'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=900&q=80',
        'https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=900&q=80',
      ]);
    }
  }

  // 4. Contextual subpools for 'di-tich'
  if (category === 'di-tich') {
    if (lower.includes('đại nội') || lower.includes('hoàng thành') || lower.includes('ngọ môn')) {
      return pick([
        'https://images.unsplash.com/photo-1583417319070-4a69db38a482?auto=format&fit=crop&w=900&q=80',
        'https://images.unsplash.com/photo-1528127269322-539801943592?auto=format&fit=crop&w=900&q=80',
      ]);
    }
    if (lower.includes('cầu rồng') || lower.includes('rồng')) {
      return pick([
        'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?auto=format&fit=crop&w=900&q=80',
        'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&w=900&q=80',
      ]);
    }
    if (lower.includes('tràng tiền') || lower.includes('cầu')) {
      return pick([
        'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?auto=format&fit=crop&w=900&q=80',
        'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&w=900&q=80',
      ]);
    }
    if (lower.includes('lăng') || lower.includes('khải định') || lower.includes('tự đức') || lower.includes('minh mạng')) {
      return pick([
        'https://images.unsplash.com/photo-1588668214407-6ea9a6d8c272?auto=format&fit=crop&w=900&q=80',
        'https://images.unsplash.com/photo-1599707367072-cd6ada2bc375?auto=format&fit=crop&w=900&q=80',
      ]);
    }
  }

  // Fallback FNV-1a distribution across the large curated pool
  const pool = DEFAULT_IMAGES_BY_CATEGORY[category] || DEFAULT_IMAGES_BY_CATEGORY['di-tich'];
  return pool[Math.abs(hash) % pool.length];
}

export function getGalleryImages(poi: Poi): string[] {
  const base = (poi.gallery && poi.gallery.length > 0) ? poi.gallery : [poi.image];
  const result: string[] = [poi.image, ...base.filter((img) => img !== poi.image)];

  if (result.length >= 5) {
    return result.slice(0, 5);
  }

  // Strictly cycle only from the place's own authentic photos to prevent leaking unrelated stock photos
  while (result.length < 5) {
    const cyclePhoto = base[result.length % base.length] || poi.image;
    result.push(cyclePhoto);
  }
  return result;
}

export function normalizeCategory(value?: string | null): PoiCategory {
  const normalized = (value ?? '').trim().toLowerCase();
  if (
    normalized.includes('chùa') ||
    normalized.includes('chua') ||
    normalized.includes('đền') ||
    normalized.includes('tâm linh')
  ) {
    return 'chua';
  }
  if (
    normalized.includes('ẩm thực') ||
    normalized.includes('quán ăn') ||
    normalized.includes('quan-an') ||
    normalized.includes('quan an') ||
    normalized.includes('cafe') ||
    normalized.includes('cà phê') ||
    normalized.includes('nhà hàng') ||
    normalized.includes('food') ||
    normalized.includes('giải khát')
  ) {
    return 'quan-an';
  }
  if (
    normalized.includes('cảnh quan') ||
    normalized.includes('canh-quan') ||
    normalized.includes('thiên nhiên') ||
    normalized.includes('biển') ||
    normalized.includes('núi') ||
    normalized.includes('đèo') ||
    normalized.includes('bãi') ||
    normalized.includes('landscape')
  ) {
    return 'canh-quan';
  }
  if (
    normalized.includes('di tích') ||
    normalized.includes('di-tich') ||
    normalized.includes('lịch sử') ||
    normalized.includes('văn hóa') ||
    normalized.includes('bảo tàng') ||
    normalized.includes('heritage')
  ) {
    return 'di-tich';
  }
  return 'di-tich';
}

export function normalizeCity(value?: string | null): PoiCity {
  const normalized = (value ?? '').trim().toLowerCase();
  if (normalized.includes('da nang') || normalized.includes('da-nang') || normalized === 'danang') return 'Đà Nẵng';
  if (normalized.includes('hue') || normalized.includes('huế')) return 'Huế';
  return 'Đà Nẵng';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizePoi(item: BackendPoiItem | Poi | any): Poi | null {
  if (!item) return null;
  if (item.id && item.name && Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lng)) && item.category && item.city) {
    return item as Poi;
  }
  const latitude = Number(item.latitude ?? item.lat);
  const longitude = Number(item.longitude ?? item.lng);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  const category = normalizeCategory(item.category);
  const city = normalizeCity(item.city);
  const rawName = (item.name ?? 'POI').trim() || 'POI';

  // Check if Michelin guide selected (name or description)
  const isMichelin = /michelin/i.test(rawName) || /michelin/i.test(item.description ?? '');
  // Clean up parenthesized notes like (Đạt chuẩn MICHELIN Selected) for a polished title
  const cleanName = rawName.replace(/\s*\([^)]*michelin[^)]*\)/gi, '').trim() || rawName;

  let cleanTitle = cleanName;
  let subTitle: string | undefined = undefined;
  const parenMatch = cleanName.match(/^(.*?)\s*\((.*?)\)$/);
  if (parenMatch && parenMatch[1] && parenMatch[2]) {
    cleanTitle = parenMatch[1].trim();
    subTitle = parenMatch[2].trim();
  }

  const image = item.image_url?.trim() || getDeterministicImage(cleanName, item.id, category, city);
  const gallery = Array.isArray(item.gallery_urls) && item.gallery_urls.length > 0 ? item.gallery_urls : undefined;

  const rawRating = Number(item.ai_metadata?.raw_rating);
  const rating = Number.isFinite(rawRating) && rawRating > 0
    ? rawRating
    : item.satisfaction_score
      ? Number(item.satisfaction_score)
      : 4.6;
  const visitMinutes = item.average_visit_minutes ? Number(item.average_visit_minutes) : 60;
  const rawRecHours = typeof item.ai_metadata?.recommended_duration_hours === 'string'
    ? item.ai_metadata.recommended_duration_hours.trim()
    : '';
  const visitDuration = rawRecHours
    ? `${rawRecHours.replace('-', '–')} giờ`
    : visitMinutes >= 60
      ? `${Math.round(visitMinutes / 60)} giờ`
      : `${visitMinutes} phút`;

  const rawGreen = item.green_score !== null && item.green_score !== undefined && Number.isFinite(Number(item.green_score)) ? Number(item.green_score) : 0.5;
  const ecoScore = Math.round(rawGreen <= 1 ? rawGreen * 100 : rawGreen);
  const estimatedCost = item.estimated_cost !== null && item.estimated_cost !== undefined && Number.isFinite(Number(item.estimated_cost)) ? Number(item.estimated_cost) : null;
  const statusOpenHours = typeof item.opening_hours?.status_text === 'string' ? item.opening_hours.status_text.trim() : '';

  return {
    id: String(item.id),
    name: rawName,
    cleanName,
    cleanTitle,
    subTitle,
    isMichelin,
    category,
    city,
    lat: latitude,
    lng: longitude,
    address: item.address?.trim() || null,
    image,
    gallery,
    description: (item.description ?? '').trim() || 'Địa điểm đáng ghé thăm trong hành trình của bạn.',
    rating,
    visitDuration,
    ecoScore,
    openHours: statusOpenHours || item.open_hours?.trim() || (category === 'quan-an' ? '09:30 – 21:30' : '07:30 – 17:30'),
    estimatedCost,
    isLocalBusiness: item.is_local_business ?? undefined,
    sub_category: item.sub_category ?? null,
    cuisine: item.cuisine ?? null,
    budget_tier: item.budget_tier ?? '$$',
    vibes: Array.isArray(item.vibes) ? item.vibes : [],
    best_time: Array.isArray(item.best_time) ? item.best_time : [],
    eco_features: Array.isArray(item.eco_features) ? item.eco_features : [],
    ai_metadata: item.ai_metadata ?? null,
    phone_number: item.phone_number?.trim() || null,
    website_url: item.website_url?.trim() || null,
    social_links: item.social_links && typeof item.social_links === 'object' ? item.social_links : null,
    opening_hours: item.opening_hours && typeof item.opening_hours === 'object' ? item.opening_hours : null,
    email: item.email?.trim() || null,
  };
}

export const SUB_CATEGORY_LABELS: Record<string, string> = {
  // Food
  traditional_noodles: 'Đặc sản món nước & sợi',
  street_bites_rolls: 'Món cuốn & bánh dân gian',
  coastal_seafood: 'Hải sản tươi sống',
  heritage_fine_dining: 'Cung đình & Cơm niêu',
  green_vegetarian: 'Chay & Thực dưỡng xanh',
  western_international: 'Món Âu - Mỹ & Pizza/Steak',
  asian_specialties: 'Món Á: Nhật, Hàn, Thái',
  // Cafe
  retro_street_cafe: 'Cafe Cóc & Vintage',
  scenic_view_cafe: 'Cafe View đẹp & Sống ảo',
  workspace_study_cafe: 'Cafe Làm việc 24/7',
  specialty_roastery: 'Cafe Specialty & Roastery',
  royal_herbal_tea: 'Trà Thảo mộc & Cung đình',
  nightlife_bars_pubs: 'Bar, Pub & Acoustic',
  desserts_bakery: 'Chè Huế, Kem & Bakery',
  // Nature
  beach_coastline: 'Bãi biển & Bờ vịnh',
  mountain_pass_peninsula: 'Đèo dốc & Bán đảo Sơn Trà',
  wetland_lagoon_rivers: 'Đầm phá & Sông nước',
  pine_hills_parks: 'Đồi thông & Công viên xanh',
  waterfalls_hotsprings: 'Suối khoáng nóng & Thác nước',
  // Culture
  imperial_citadel: 'Đại Nội & Hoàng thành',
  royal_mausoleums: 'Lăng tẩm Hoàng gia',
  museums_galleries: 'Bảo tàng & Mỹ thuật',
  iconic_urban_landmarks: 'Cầu Biểu tượng & Đô thị',
  craft_villages: 'Làng nghề truyền thống',
  performing_arts_heritage: 'Biểu diễn Nghệ thuật Di sản',
  historic_markets: 'Chợ truyền thống lâu đời',
  // Spiritual
  historic_zen_temples: 'Cổ tự & Chốn tổ thiền',
  grand_mountain_ocean_temples: 'Tượng Phật & Vách núi',
  forest_hermitage_monasteries: 'Thiền viện rừng sâu',
  cathedrals_heritage_churches: 'Thánh đường Gothic cổ',
  zen_retreats_healing: 'Retreat Chữa lành',
};

export const CUISINE_LABELS: Record<string, string> = {
  vietnamese_local: 'Bản địa Việt Nam',
  italian_pizza: 'Pizza & Pasta Ý',
  japanese_sushi: 'Sushi & Nhật Bản',
  korean_bbq: 'Nướng & BBQ Hàn Quốc',
  western_steak_burger: 'Steakhouse & Burger Âu-Mỹ',
  chinese_dimsum: 'Dimsum & Trung Hoa',
  thai_spicy: 'Món Thái chua cay',
  plant_based_vegan: 'Thuần chay thực dưỡng',
};

export const VIBE_LABELS: Record<string, string> = {
  trekking: 'Trekking rừng xanh',
  wildlife_watching: 'Ngắm động vật hoang dã',
  cloud_hunting: 'Săn mây bình minh',
  scenic_drive: 'Cung đường cảnh quan',
  nature_walk: 'Tản bộ giữa thiên nhiên',
  tea_relaxation: 'Thưởng trà an nhiên',
  ancient_trees: 'Quần thể cây cổ thụ',
  sightseeing: 'Ngắm cảnh sinh thái',
  kayak: 'Chèo thuyền Kayak',
  sup: 'Chèo SUP không động cơ',
  cycling: 'Đạp xe khám phá',
  picnic: 'Dã ngoại ngoài trời',
  camping: 'Cắm trại xanh',
  glamping: 'Glamping giữa thiên nhiên',
  healing: 'Chữa lành & sống chậm',
  river_view: 'Ven sông mát lành',
  bbq: 'Tiệc nướng ngoài trời',
  stream_bathing: 'Tắm suối tự nhiên',
  cafe: 'Cà phê không gian mở',
  photography: 'Góc ảnh thiên nhiên',
  eco_farm: 'Nông trại sinh thái',
  kids_activities: 'Trải nghiệm cho trẻ nhỏ',
  organic_farming: 'Thu hoạch rau hữu cơ',
  organic_shopping: 'Mua sắm nông sản sạch',
  local_produce: 'Nông sản bản địa',
  zero_waste_bag: 'Khuyến khích túi vải',
  zero_waste: 'Giảm rác thải nhựa',
  fruit_picking: 'Hái trái cây tại vườn',
  teambuilding: 'Gắn kết đội nhóm',
  eco_stay: 'Lưu trú sinh thái',
  family: 'Thân thiện gia đình',
  village_tour: 'Tham quan làng cổ',
  local_food: 'Ẩm thực bản địa',
  beach_walk: 'Dạo bộ ven biển',
  vegetarian: 'Ẩm thực chay thanh đạm',
  vegan: 'Thuần chay thực vật',
  local_vegan: 'Món chay địa phương',
  zen_dining: 'Không gian tĩnh tại',
  healthy_food: 'Thực dưỡng lành mạnh',
  garden_cafe: 'Cà phê sân vườn',
  workshop: 'Workshop thủ công xanh',
  handicraft: 'Nghề thủ công truyền thống',
  garden_house: 'Nhà vườn xứ Huế',
  pomelo_orchard: 'Vườn thanh trà cổ thụ',
  herbal_foot_bath: 'Ngâm chân thảo dược',
  mangrove_forest: 'Rừng ngập mặn',
  boat_trip: 'Đi thuyền sinh thái',
  sunset: 'Ngắm hoàng hôn đầm phá',
  national_park: 'Vườn quốc gia bảo tồn',
  waterfall: 'Thác nước rừng nguyên sinh',
  hot_spring: 'Khoáng nóng tự nhiên',
  meditation: 'Thiền định & tịnh tâm',
  heritage: 'Di sản kiến trúc & cảnh quan',
  farm_to_table: 'Từ nông trại đến bàn ăn',
  snorkeling: 'Lặn ngắm biển tự nhiên',
  walking: 'Đi bộ trải nghiệm',
  beach_stroll: 'Tản bộ bờ biển',
  dining: 'Ẩm thực tại chỗ',
  plastic_free_initiative: 'Tuyến phố giảm nhựa',
  healthy_dining: 'Thực đơn lành mạnh',
  brunch: 'Bữa sáng muộn (Brunch)',
  plant_milk: 'Sữa hạt tự nhiên',
  specialty_coffee: 'Cà phê đặc sản',
  traditional_music: 'Âm nhạc truyền thống',
  acoustic: 'Đêm nhạc mộc Acoustic',
  kombucha: 'Trà lên men Kombucha',
  relaxation: 'Thư giãn tĩnh lặng',
  work_friendly: 'Phù hợp đọc sách & làm việc',
  smoothie: 'Sinh tố trái cây tươi',
  bakery: 'Bánh thủ công',
  tropical_cafe: 'Không gian xanh nhiệt đới',
  salt_coffee: 'Cà phê muối xứ Huế',
  latte_art: 'Pha chế thủ công',
  koi_pond: 'Hồ cá Koi sinh thái',
  vegan_dining: 'Ẩm thực thuần chay',
  smoothie_bowl: 'Smoothie Bowl dinh dưỡng',
  cold_pressed_juice: 'Nước ép lạnh nguyên chất',
  artisan_pizza: 'Pizza thủ công từ nông trại',
  sustainable_dining: 'Ẩm thực bền vững',
  vegan_bakery: 'Bánh ngọt thuần chay',
  healthy_brunch: 'Brunch thực vật',
  plastic_free: 'Không nhựa dùng một lần',
  coastal_rock: 'Ghềnh đá ven biển hoang sơ',
  nature_photography: 'Nhiếp ảnh thiên nhiên',
  eco_museum: 'Bảo tàng sinh thái rừng',
  forest_garden: 'Khu vườn dưới tán rừng',
  art_gallery: 'Không gian nghệ thuật',
  hiking: 'Leo núi khám phá',
  cave_exploring: 'Khám phá hang động tự nhiên',
  pagoda: 'Chùa cổ thanh tịnh',
  panoramic_view: 'Tầm nhìn toàn cảnh',
  cotu_culture: 'Văn hóa bản địa Cơ Tu',
  forest_walk: 'Đi bộ dưới tán rừng',
  nature_relax: 'Nghỉ ngơi giữa thiên nhiên',
  sunrise: 'Đón bình minh',
  swimming: 'Tắm biển trong lành',
  fishing_village: 'Làng chài bản địa',
  eco_sport: 'Thể thao biển không động cơ',
  wooden_boat: 'Đò gỗ truyền thống',
  lagoon_seafood: 'Đặc sản đầm phá',
  clam_catching: 'Trải nghiệm bắt trìa đầm phá',
  fishing_experience: 'Trải nghiệm ngư dân đầm phá',
  mangrove_walk: 'Đi bộ xuyên rừng ngập mặn',
  observation_tower: 'Đài quan sát cảnh quan',
  birdwatching: 'Ngắm chim di cư',
  rural_market: 'Chợ quê truyền thống',
  farming_experience: 'Trải nghiệm nhà nông',
  eco_cleanup: 'Hoạt động giữ gìn môi trường',
  nature_conservation: 'Bảo tồn đa dạng sinh học',
  pine_forest: 'Rừng thông xanh mát',
  water_refill_station: 'Trạm tiếp nước giảm chai nhựa',
  electric_buggy: 'Xe điện thân thiện môi trường',
  royal_garden: 'Thượng uyển & vườn hoàng gia',
  unesco: 'Di sản Thế giới UNESCO',
  local_cuisine: 'Ẩm thực truyền thống xứ Huế',
  royal_tea: 'Thưởng trà cung đình',
  art: 'Thưởng lãm nghệ thuật',
  pool: 'Hồ bơi giữa vườn xanh',
  spa: 'Trị liệu thảo mộc tự nhiên',
  petting_zoo: 'Vườn thú thân thiện cho bé',
  hue_vegan: 'Cơm chay truyền thống Huế',
  garden_dining: 'Dùng bữa giữa sân vườn',
  garden_courtyard: 'Sân vườn rợp bóng cây',
  budget_friendly: 'Chi phí hợp lý',
  scenic_walk: 'Đường dạo bộ ngắm cảnh',
  lagoon_view: 'Ngắm cảnh đầm phá & núi',
  ancient_village: 'Làng cổ di sản',
  pottery_workshop: 'Trải nghiệm gốm cổ',
  bamboo_craft: 'Đan lát mây tre thủ công',
  eco_souvenir: 'Quà lưu niệm mây tre thay nhựa',
  onsen: 'Tắm khoáng nóng Onsen',
  forest_bathing: 'Tắm rừng chữa lành',
  eco_resort: 'Khu nghỉ dưỡng sinh thái',
  zen_meditation: 'Thiền định giữa núi rừng',
  boat_ride: 'Đi thuyền qua hồ Trừu Sơn',
  lake_view: 'Cảnh hồ non nước',
  spiritual: 'Không gian tâm linh tịnh độ',
  zen_garden: 'Vườn thiền & rừng thông',
  calligraphy: 'Thư pháp & thơ thiền',
  lotus_lake: 'Hồ sen cổ kính',
};

export function normalizePois(items: BackendPoiItem[] = []): Poi[] {
  return items
    .map((item) => normalizePoi(item))
    .filter((item): item is Poi => item !== null);
}

export const pois: Poi[] = [
  {
    id: 'madame-lan',
    name: 'Nhà hàng Madame Lân',
    category: 'quan-an',
    city: 'Đà Nẵng',
    lat: 16.0825,
    lng: 108.2238,
    image: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&q=80&w=800',
    description: 'Madame Lân là nhà hàng ẩm thực Việt nổi tiếng bên bờ sông Hàn, tái hiện nét văn hóa phố cổ với hơn 300 món ăn đặc trưng 3 miền Bắc - Trung - Nam.',
    rating: 4.8,
    visitDuration: '1–1.5 giờ',
    ecoScore: 89,
  },
  {
    id: 'cau-rong',
    name: 'Cầu Rồng',
    category: 'di-tich',
    city: 'Đà Nẵng',
    lat: 16.0756,
    lng: 108.2236,
    image: 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?auto=format&fit=crop&q=80&w=1280',
    description: 'Biểu tượng của Đà Nẵng, cầu quay phun lửa nước vào cuối tuần.',
    rating: 4.7,
    visitDuration: '30–45 phút',
    ecoScore: 78,
  },
  {
    id: 'my-khe',
    name: 'Bãi biển Mỹ Khê',
    category: 'canh-quan',
    city: 'Đà Nẵng',
    lat: 16.0544,
    lng: 108.2422,
    image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&q=80&w=1280',
    description: 'Top 6 bãi biển quyến rũ nhất hành tinh, cát mịn nước trong.',
    rating: 4.8,
    visitDuration: '2–3 giờ',
    ecoScore: 92,
  },
  {
    id: 'ngu-hanh-son',
    name: 'Ngũ Hành Sơn',
    category: 'canh-quan',
    city: 'Đà Nẵng',
    lat: 16.0012,
    lng: 108.2598,
    image: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&q=80&w=1280',
    description: 'Ngọn núi đá vôi với hang động và chùa cổ, năm ngọn linh thiêng.',
    rating: 4.6,
    visitDuration: '2–3 giờ',
    ecoScore: 85,
  },
  {
    id: 'linh-ung-son-tra',
    name: 'Chùa Linh Ứng Sơn Trà',
    category: 'chua',
    city: 'Đà Nẵng',
    lat: 16.1058,
    lng: 108.2933,
    image: 'https://images.unsplash.com/photo-1548013146-72479768bada?auto=format&fit=crop&q=80&w=1280',
    description: 'Chùa có tượng Phật bà cao nhất Việt Nam, nhìn ra biển Đà Nẵng.',
    rating: 4.7,
    visitDuration: '1–2 giờ',
    ecoScore: 88,
  },
  {
    id: 'ba-na-hills',
    name: 'Bà Nà Hills',
    category: 'canh-quan',
    city: 'Đà Nẵng',
    lat: 15.9989,
    lng: 107.9889,
    image: 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?auto=format&fit=crop&q=80&w=1280',
    description: 'Khu nghỉ dưỡng trên cao nguyên, cầu vàng icon nổi tiếng.',
    rating: 4.5,
    visitDuration: 'Cả ngày',
    ecoScore: 62,
  },
  {
    id: 'cho-han',
    name: 'Chợ Hàn',
    category: 'di-tich',
    city: 'Đà Nẵng',
    lat: 16.0684,
    lng: 108.2218,
    image: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&q=80&w=1280',
    description: 'Chợ truyền thống sầm uất, đặc sản hải sản và đồ lưu niệm.',
    rating: 4.3,
    visitDuration: '45–60 phút',
    ecoScore: 70,
  },
  {
    id: 'mi-quang',
    name: 'Mì Quảng 1A',
    category: 'quan-an',
    city: 'Đà Nẵng',
    lat: 16.0658,
    lng: 108.2186,
    image: 'https://upload.wikimedia.org/wikipedia/commons/e/ec/Mi_Quang_Da_Nang.jpg',
    description: 'Mì Quảng chuẩn vị Đà Nẵng, tôm thịt trứng gà, nước lèo đậm đà.',
    rating: 4.6,
    visitDuration: '30–45 phút',
    ecoScore: 82,
  },
  {
    id: 'dai-noi',
    name: 'Đại Nội (Hoàng Thành)',
    category: 'di-tich',
    city: 'Huế',
    lat: 16.4637,
    lng: 107.5809,
    image: 'https://images.unsplash.com/photo-1528181304800-259b08848526?auto=format&fit=crop&q=80&w=1280',
    description: 'Di sản thế giới UNESCO, trung tâm quyền lực triều Nguyễn.',
    rating: 4.8,
    visitDuration: '2–3 giờ',
    ecoScore: 80,
  },
  {
    id: 'thien-mu',
    name: 'Chùa Thiên Mụ',
    category: 'chua',
    city: 'Huế',
    lat: 16.4697,
    lng: 107.5489,
    image: 'https://upload.wikimedia.org/wikipedia/commons/8/88/ThienMuPagoda.jpg',
    description: 'Ngôi chùa cổ nhất Huế, tháp Phước Duyên biểu tượng bên sông Hương.',
    rating: 4.7,
    visitDuration: '1 giờ',
    ecoScore: 90,
  },
  {
    id: 'khai-dinh',
    name: 'Lăng Khải Định',
    category: 'di-tich',
    city: 'Huế',
    lat: 16.3942,
    lng: 107.5989,
    image: 'https://images.unsplash.com/photo-1582555172866-f73bb12a2ab3?auto=format&fit=crop&q=80&w=1280',
    description: 'Lăng tombs kiến trúc Đông – Tây giao thoa, sứ khảm trang trí.',
    rating: 4.6,
    visitDuration: '1–2 giờ',
    ecoScore: 74,
  },
  {
    id: 'tu-duc',
    name: 'Lăng Tự Đức',
    category: 'di-tich',
    city: 'Huế',
    lat: 16.4356,
    lng: 107.5733,
    image: 'https://upload.wikimedia.org/wikipedia/commons/d/dd/Annam_-_Hu%C3%A9_-_Pavillons_sur_le_bassin_fleuri_au_Tombeau_de_Tu-Duc.jpg',
    description: 'Lăng tẩm rộng nhất Huế, hồ Lưu Khiêm và vườn thơ mộng.',
    rating: 4.5,
    visitDuration: '1–2 giờ',
    ecoScore: 83,
  },
  {
    id: 'cho-dong-ba',
    name: 'Chợ Đông Ba',
    category: 'di-tich',
    city: 'Huế',
    lat: 16.4658,
    lng: 107.5818,
    image: 'https://images.unsplash.com/photo-1533900298318-6b8da08a523e?auto=format&fit=crop&q=80&w=1280',
    description: 'Chợ lớn nhất Huế, đặc sản mè xửng, bánh ép, nón bài thơ.',
    rating: 4.2,
    visitDuration: '45–60 phút',
    ecoScore: 72,
  },
  {
    id: 'bun-bo-hue',
    name: 'Bún Bò Huế Đông Ba',
    category: 'quan-an',
    city: 'Huế',
    lat: 16.4672,
    lng: 107.5795,
    image: 'https://upload.wikimedia.org/wikipedia/commons/e/e4/Bun-Bo-Hue.jpg',
    description: 'Bún bò Huế cay nồng chuẩn vị, nước lèo xương bò đậm đà.',
    rating: 4.7,
    visitDuration: '30–45 phút',
    ecoScore: 85,
  },
  {
    id: 'cau-truong-tien',
    name: 'Cầu Trường Tiền',
    category: 'di-tich',
    city: 'Huế',
    lat: 16.4647,
    lng: 107.5866,
    image: 'https://images.unsplash.com/photo-1583417319070-4a69db38a482?auto=format&fit=crop&q=80&w=1280',
    description: 'Cầu sắt sáu nhịp lịch sử bắc ngang sông Hương, biểu tượng Huế.',
    rating: 4.4,
    visitDuration: '20–30 phút',
    ecoScore: 76,
  },
];
