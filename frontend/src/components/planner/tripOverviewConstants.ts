// Danh mục bộ lọc & hằng số ngân sách cho TripOverviewView
export type ModalCategory =
  | 'for-you'
  | 'all'
  | 'di-tich'
  | 'canh-quan'
  | 'chua'
  | 'quan-an'
  | 'luu-tru'
  | 'experiences'
  | 'restaurants'
  | 'scenic';

export const MODAL_CATEGORY_TABS: { id: ModalCategory; label: string }[] = [
  { id: 'for-you', label: 'Dành cho bạn' },
  { id: 'all', label: 'Tất cả' },
  { id: 'di-tich', label: 'Di tích' },
  { id: 'canh-quan', label: 'Cảnh quan' },
  { id: 'chua', label: 'Chùa' },
  { id: 'quan-an', label: 'Quán ăn' },
  { id: 'luu-tru', label: 'Lưu trú' },
];

export interface CategoryBudgets {
  dining: string;
  lodging: string;
  activities: string;
}

export function parseCategoryBudgets(raw?: string): CategoryBudgets {
  const def: CategoryBudgets = { dining: 'any', lodging: 'any', activities: 'any' };
  if (!raw) return def;
  if (raw.includes('dining:') || raw.includes('lodging:') || raw.includes('activities:')) {
    const parts = raw.split(';');
    for (const p of parts) {
      const [k, v] = p.split(':');
      if (k === 'dining') def.dining = v || 'any';
      if (k === 'lodging') def.lodging = v || 'any';
      if (k === 'activities') def.activities = v || 'any';
    }
    return def;
  }
  if (raw === '$' || raw === 'budget') {
    return { dining: '$', lodging: '$', activities: '$' };
  }
  if (raw === '$$$' || raw === 'luxury' || raw === 'upgrade') {
    return { dining: '$$$', lodging: '$$$', activities: '$$$' };
  }
  if (raw === '$$' || raw === 'standard') {
    return { dining: '$$', lodging: '$$', activities: '$$' };
  }
  return def;
}

export const DINING_BUDGET_OPTIONS = [
  { id: 'any', label: 'Tất cả', desc: 'Mọi mức giá' },
  { id: '$', label: '$', desc: '< 100k', sub: 'Bình dân / chợ đêm' },
  { id: '$$', label: '$$', desc: '150k – 300k', sub: 'Tiêu chuẩn / nhà hàng' },
  { id: '$$$', label: '$$$', desc: '> 500k', sub: 'Cao cấp / Michelin' },
];

export const LODGING_BUDGET_OPTIONS = [
  { id: 'any', label: 'Tất cả', desc: 'Mọi loại phòng' },
  { id: '$', label: '$', desc: '< 400k/đêm', sub: 'Homestay / Hostel' },
  { id: '$$', label: '$$', desc: '500k – 1tr/đêm', sub: 'Khách sạn 3 sao' },
  { id: '$$$', label: '$$$', desc: '> 1.5tr/đêm', sub: 'Resort / 4–5 sao' },
];

export const ACTIVITIES_BUDGET_OPTIONS = [
  { id: 'any', label: 'Tất cả', desc: 'Mọi hoạt động' },
  { id: '$', label: '$', desc: '< 100k/vé', sub: 'Miễn phí / vé rẻ' },
  { id: '$$', label: '$$', desc: '150k – 400k/vé', sub: 'Tour / Vé phổ thông' },
  { id: '$$$', label: '$$$', desc: '> 500k/vé', sub: 'Trải nghiệm cao cấp' },
];
