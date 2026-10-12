export type PoiCategory = 'chua' | 'quan-an' | 'canh-quan' | 'di-tich';
export type PoiCity = 'Đà Nẵng' | 'Huế';

export interface Poi {
  id: string;
  name: string;
  category: PoiCategory;
  city: PoiCity;
  lat: number;
  lng: number;
  image: string;
  description: string;
  rating: number;
  visitDuration: string;
  ecoScore: number;
}

export interface BackendPoiItem {
  id: number;
  name?: string | null;
  category?: string | null;
  description?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
  city?: string | null;
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
    'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=900&q=80',
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
    'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1506012787146-f92b2d7d6d96?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1627993077303-3450e1cd1639?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1507034589631-9433cc6bc453?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1519046904884-53103b34b206?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1513836279014-a89f7a76ae86?auto=format&fit=crop&w=900&q=80',
  ],
  'di-tich': [
    'https://images.unsplash.com/photo-1583417319070-4a69db38a482?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1528127269322-539801943592?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1588668214407-6ea9a6d8c272?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1599707367072-cd6ada2bc375?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1568084680786-a84f91d1153c?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=900&q=80',
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
        'https://images.unsplash.com/photo-1627993077303-3450e1cd1639?auto=format&fit=crop&w=900&q=80',
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
        'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&w=900&q=80',
        'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=900&q=80',
      ]);
    }
    if (lower.includes('tràng tiền') || lower.includes('cầu')) {
      return pick([
        'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=900&q=80',
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
  const pool = DEFAULT_IMAGES_BY_CATEGORY[poi.category] || DEFAULT_IMAGES_BY_CATEGORY['di-tich'];
  const result: string[] = [poi.image];
  const remaining = pool.filter((img) => img !== poi.image);

  let hash = 2166136261;
  const key = `${poi.id}_${poi.name}`;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  for (let i = 0; i < 4; i++) {
    const idx = (Math.abs(hash) + i * 3 + 1) % (remaining.length || 1);
    result.push(remaining[idx] || pool[(i + 1) % pool.length]);
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

export function normalizePoi(item: BackendPoiItem): Poi | null {
  const latitude = Number(item.latitude);
  const longitude = Number(item.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  const category = normalizeCategory(item.category);
  const city = normalizeCity(item.city);
  const name = (item.name ?? 'POI').trim() || 'POI';
  const image = getDeterministicImage(name, item.id, category, city);

  return {
    id: String(item.id),
    name,
    category,
    city,
    lat: latitude,
    lng: longitude,
    image,
    description: (item.description ?? '').trim() || 'Địa điểm đáng ghé thăm trong hành trình của bạn.',
    rating: 4.5,
    visitDuration: '1–2 giờ',
    ecoScore: 80,
  };
}

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
    image: 'https://picsum.photos/seed/danang_1/800/600',
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
    image: 'https://picsum.photos/seed/danang_2/800/600',
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
    image: 'https://picsum.photos/seed/danang_3/800/600',
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
    image: 'https://picsum.photos/seed/danang_4/800/600',
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
    image: 'https://picsum.photos/seed/danang_5/800/600',
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
    image: 'https://picsum.photos/seed/danang_6/800/600',
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
    image: 'https://picsum.photos/seed/danang_7/800/600',
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
    image: 'https://picsum.photos/seed/hue_1/800/600',
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
    image: 'https://picsum.photos/seed/hue_2/800/600',
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
    image: 'https://picsum.photos/seed/hue_3/800/600',
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
    image: 'https://picsum.photos/seed/hue_4/800/600',
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
    image: 'https://picsum.photos/seed/hue_5/800/600',
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
    image: 'https://picsum.photos/seed/hue_6/800/600',
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
    image: 'https://picsum.photos/seed/hue_7/800/600',
    description: 'Cầu sắt sáu nhịp lịch sử bắc ngang sông Hương, biểu tượng Huế.',
    rating: 4.4,
    visitDuration: '20–30 phút',
    ecoScore: 76,
  },
];
