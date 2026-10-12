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

const DEFAULT_IMAGE_BY_CATEGORY: Record<PoiCategory, string> = {
  chua: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=900&q=80',
  'quan-an': 'https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=900&q=80',
  'canh-quan': 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=900&q=80',
  'di-tich': 'https://images.unsplash.com/photo-1528127269322-539801943592?auto=format&fit=crop&w=900&q=80',
};

export function normalizeCategory(value?: string | null): PoiCategory {
  const normalized = (value ?? '').trim().toLowerCase();
  if (normalized === 'chua' || normalized === 'chùa') return 'chua';
  if (normalized === 'quan-an' || normalized === 'quan an' || normalized === 'food') return 'quan-an';
  if (normalized === 'canh-quan' || normalized === 'cảnh quan' || normalized === 'landscape') return 'canh-quan';
  if (normalized === 'di-tich' || normalized === 'di tích' || normalized === 'heritage') return 'di-tich';
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

  return {
    id: String(item.id),
    name,
    category,
    city,
    lat: latitude,
    lng: longitude,
    image: DEFAULT_IMAGE_BY_CATEGORY[category],
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
