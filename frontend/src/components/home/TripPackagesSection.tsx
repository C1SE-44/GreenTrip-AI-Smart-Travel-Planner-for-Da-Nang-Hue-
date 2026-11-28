import { useEffect, useMemo, useState, type SyntheticEvent } from 'react';
import { CalendarDays, ChevronDown, ChevronRight, Clock3, ExternalLink, Hotel, MapPin, Phone, RotateCcw, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import type { Poi } from '@/data/pois';
import {
  hasPoiContactInfo,
  packageBudgetLabel,
  packageNightlyPrice,
  resolveTripPackages,
  type ResolvedTripPackage,
  type TripPackageLaunch,
} from './tripPackages';

function isGenericFallbackImage(image: string | undefined): boolean {
  return Boolean(image && image.includes('images.unsplash.com'));
}

function packageImageFallback(poi: Poi): string | null {
  const name = (poi.cleanName || poi.name).toLocaleLowerCase('vi-VN');
  if (poi.category === 'luu-tru') return null;
  if (name.includes('bánh xèo bà dưỡng')) return '/images/landing/studio/eatery_baduong_banhxeo.webp';
  if (name.includes('mì quảng')) return '/images/landing/studio/eatery_dung_miquang.webp';
  if (name.includes('bún bò')) return '/images/landing/studio/eatery_mekeo_bunbo.webp';
  if (name.includes('cầu rồng')) return '/images/landing/studio/plan_caurong_river_real.webp';
  if (name.includes('hải vân')) return '/images/landing/studio/plan_haivan_pass_real.webp';
  if (name.includes('thiên mụ')) return '/images/landing/studio/plan_thienmu_tower_crop.webp';
  return poi.city === 'Huế' ? '/images/landing/hue-hero-640.webp' : '/images/landing/danang-hero-640.webp';
}

function packagePoiImage(poi: Poi): string | null {
  if (!isGenericFallbackImage(poi.image)) return poi.image;
  return packageImageFallback(poi);
}

function handlePackageImageError(event: SyntheticEvent<HTMLImageElement>, poi: Poi): void {
  const image = event.currentTarget;
  let attemptedImages: string[] = [];
  try {
    const parsed: unknown = JSON.parse(image.dataset.attemptedImages || '[]');
    if (Array.isArray(parsed)) attemptedImages = parsed.filter((value): value is string => typeof value === 'string');
  } catch {
    attemptedImages = [];
  }
  attemptedImages.push(image.currentSrc || image.src);
  image.dataset.attemptedImages = JSON.stringify(attemptedImages);

  const nextGalleryImage = (poi.gallery || []).find((galleryImage) => galleryImage && !isGenericFallbackImage(galleryImage) && !attemptedImages.includes(galleryImage));
  if (nextGalleryImage) {
    image.src = nextGalleryImage;
    return;
  }
  const fallbackImage = packageImageFallback(poi);
  if (image.dataset.fallbackApplied === 'true' || !fallbackImage) {
    image.style.visibility = 'hidden';
    return;
  }
  image.dataset.fallbackApplied = 'true';
  image.src = fallbackImage;
}

interface TripPackagesSectionProps {
  pois: Poi[];
  isLoading: boolean;
  loadError: string | null;
  onSelectPackage: (launch: TripPackageLaunch) => void;
  onExplorePois: () => void;
}

type PackageFilter =
  | 'all' | 'Đà Nẵng' | 'Huế' | 'eco' | 'family' | 'food' | 'heritage'
  | 'luxury' | 'checkin' | 'budget' | 'coffee' | 'spiritual' | 'shopping'
  | 'couple' | 'adventure' | 'rainy' | 'route';

type DurationFilter = 'all' | '2' | '3';
type StayBudgetFilter = 'all' | '$' | '$$' | '$$$';

const FILTERS: Array<{ id: PackageFilter; label: string }> = [
  { id: 'all', label: 'Tất cả' },
  { id: 'Đà Nẵng', label: 'Đà Nẵng' },
  { id: 'Huế', label: 'Huế' },
  { id: 'eco', label: 'Du lịch xanh' },
  { id: 'family', label: 'Gia đình' },
  { id: 'food', label: 'Ẩm thực' },
  { id: 'heritage', label: 'Di sản' },
  { id: 'luxury', label: 'Cao cấp' },
  { id: 'checkin', label: 'Check-in' },
  { id: 'budget', label: 'Tiết kiệm' },
  { id: 'coffee', label: 'Cà phê & chill' },
  { id: 'spiritual', label: 'Tâm linh' },
  { id: 'shopping', label: 'Làng nghề & mua sắm' },
  { id: 'couple', label: 'Cặp đôi' },
  { id: 'adventure', label: 'Phiêu lưu' },
  { id: 'rainy', label: 'Ngày mưa' },
  { id: 'route', label: 'Đà Nẵng – Huế' },
];

const QUICK_THEME_FILTERS: Array<{ id: PackageFilter; label: string }> = [
  { id: 'eco', label: 'Du lịch xanh' },
  { id: 'family', label: 'Gia đình' },
  { id: 'budget', label: 'Tiết kiệm' },
  { id: 'heritage', label: 'Di sản' },
];

function contactLinks(poi: Poi): Array<{ label: string; href: string; icon: 'phone' | 'web' }> {
  const links: Array<{ label: string; href: string; icon: 'phone' | 'web' }> = [];
  if (poi.phone_number?.trim()) {
    links.push({ label: poi.phone_number, href: `tel:${poi.phone_number.replace(/[^+\d]/g, '')}`, icon: 'phone' });
  }
  if (poi.website_url?.trim() && /^https?:\/\//i.test(poi.website_url)) {
    links.push({ label: 'Trang web', href: poi.website_url, icon: 'web' });
  }
  if (poi.email?.trim()) {
    links.push({ label: 'Email', href: `mailto:${poi.email}`, icon: 'web' });
  }
  Object.entries(poi.social_links || {}).forEach(([network, value]) => {
    if (typeof value === 'string' && /^https?:\/\//i.test(value.trim()) && !links.some((link) => link.href === value.trim())) {
      links.push({ label: network.replace(/[_-]/g, ' '), href: value.trim(), icon: 'web' });
    }
  });
  return links;
}

function packageStopCost(poi: Poi): string {
  if (poi.estimatedCost === null || poi.estimatedCost === undefined || !Number.isFinite(poi.estimatedCost)) {
    return 'Chưa có dữ liệu chi phí';
  }
  if (poi.estimatedCost === 0) return '0 ₫ theo dữ liệu POI';
  return `Khoảng ${new Intl.NumberFormat('vi-VN').format(poi.estimatedCost)} ₫ (tham khảo)`;
}

function lastVerifiedLabel(poi: Poi): string | null {
  const value = poi.ai_metadata?.last_verified_at;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('vi-VN', { day: 'numeric', month: 'numeric', year: 'numeric' }).format(date);
}

function PackageDetail({
  tripPackage,
  onClose,
  onSelect,
}: {
  tripPackage: ResolvedTripPackage;
  onClose: () => void;
  onSelect: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-neutral-950/55 p-3 sm:p-6" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section role="dialog" aria-modal="true" aria-labelledby="trip-package-dialog-title" className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-2xl">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-neutral-200 px-5 py-4 sm:px-7">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">{tripPackage.definition.label} · {tripPackage.days.length} ngày · {tripPackage.days.reduce((total, day) => total + day.stops.length, 0)} điểm tham quan</p>
            <h3 id="trip-package-dialog-title" className="mt-1 text-lg font-bold text-neutral-950 sm:text-xl">{tripPackage.definition.title}</h3>
            <p className="mt-1 text-sm text-neutral-700">{tripPackage.definition.summary}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng chi tiết gói" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-neutral-700 hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"><X size={20} /></button>
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-5 py-5 sm:px-7">
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-neutral-700">
            <span className="inline-flex items-center gap-2"><MapPin size={16} className="text-emerald-800" />{tripPackage.definition.destination}</span>
            <span className="inline-flex items-center gap-2"><CalendarDays size={16} className="text-emerald-800" />{tripPackage.days.length} ngày</span>
            <span className="inline-flex items-center gap-2"><Clock3 size={16} className="text-emerald-800" />{tripPackage.definition.season}</span>
          </div>
          <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-950">
            Khung giờ và mùa phù hợp là gợi ý, không phải giờ mở cửa đã xác nhận. Chi phí điểm tham quan chỉ hiển thị khi danh mục có dữ liệu; giá nơi lưu trú là tham khảo theo đêm. Gói không bao gồm đặt phòng hay vé — hãy liên hệ cơ sở để xác nhận giá, chỗ trống và điều kiện.
          </p>

          <div className="space-y-3">
            <h4 className="text-base font-bold text-neutral-950">Lịch trình và điểm dừng cụ thể</h4>
            {tripPackage.days.map((day, index) => (
              <section key={`${tripPackage.definition.id}-day-${index + 1}`} className="rounded-2xl border border-neutral-200 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h5 className="font-semibold text-neutral-950">Ngày {index + 1} · {day.theme}</h5>
                  <span className="text-xs font-medium text-neutral-700">{day.city}</span>
                </div>
                <ol className="space-y-2">
                  {day.stops.map(({ poi, timeSlot }, stopIndex) => (
                    <li key={poi.id} className="flex items-center gap-3 rounded-xl bg-neutral-50 p-2.5">
                      {packagePoiImage(poi) ? <img src={packagePoiImage(poi) || undefined} alt="" loading="lazy" onError={(event) => handlePackageImageError(event, poi)} className="h-12 w-14 shrink-0 rounded-lg bg-neutral-200 object-cover" /> : <div className="flex h-12 w-14 shrink-0 items-center justify-center rounded-lg bg-neutral-100" aria-hidden="true"><MapPin size={18} className="text-neutral-500" /></div>}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-neutral-950">{stopIndex + 1}. {poi.cleanName || poi.name}</p>
                        <p className="mt-0.5 text-xs text-neutral-700">{timeSlot} dự kiến · {poi.visitDuration} · {packageStopCost(poi)}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </div>

          <div className="space-y-3">
            <h4 className="inline-flex items-center gap-2 text-base font-bold text-neutral-950"><Hotel size={18} className="text-emerald-800" />Nơi lưu trú trong gói</h4>
            {tripPackage.stays.map((stay) => {
              const price = packageNightlyPrice(stay);
              const links = contactLinks(stay);
              const verifiedAt = lastVerifiedLabel(stay);
              return (
                <article key={stay.id} className="flex flex-col gap-3 rounded-2xl border border-neutral-200 p-3 sm:flex-row">
                  {!isGenericFallbackImage(stay.image) ? <img src={stay.image} alt={`Ảnh ${stay.name}`} loading="lazy" onError={(event) => handlePackageImageError(event, stay)} className="h-36 w-full rounded-xl bg-neutral-100 object-cover sm:h-28 sm:w-40" /> : <div role="img" aria-label={`Chưa có ảnh xác minh cho ${stay.name}`} className="flex h-36 w-full items-center justify-center rounded-xl bg-neutral-100 text-neutral-600 sm:h-28 sm:w-40"><Hotel size={24} aria-hidden="true" /></div>}
                  <div className="min-w-0 flex-1">
                    <h5 className="font-semibold text-neutral-950">{stay.name}</h5>
                    <p className="mt-1 text-sm text-neutral-700">{stay.city} · {packageBudgetLabel(stay)}</p>
                    <p className="mt-1 text-sm font-medium text-neutral-800">{price ? `${price} (tham khảo theo đêm)` : 'Chưa có giá theo đêm trong dữ liệu; vui lòng liên hệ cơ sở.'}</p>
                    {stay.address && <p className="mt-1 text-sm text-neutral-700">{stay.address}</p>}
                    {verifiedAt && <p className="mt-1 text-xs text-neutral-700">Dữ liệu lưu trú được rà soát: {verifiedAt}</p>}
                    {stay.eco_features && stay.eco_features.length > 0 && <p className="mt-1 text-sm text-neutral-700">Thông tin xanh có trong dữ liệu: {stay.eco_features.join(', ')}</p>}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {links.map((link) => (
                        <a key={`${stay.id}-${link.href}`} href={link.href} target={link.href.startsWith('http') ? '_blank' : undefined} rel={link.href.startsWith('http') ? 'noreferrer' : undefined} className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-neutral-300 px-3 text-xs font-semibold text-neutral-900 hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700">
                          {link.icon === 'phone' ? <Phone size={14} /> : <ExternalLink size={14} />}{link.label}
                        </a>
                      ))}
                      {links.length === 0 && <p className="text-sm text-neutral-700">Chưa có liên kết liên hệ dùng được trong danh mục POI.</p>}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-neutral-200 bg-white px-5 py-4 sm:flex-row sm:justify-end sm:px-7">
          <button type="button" onClick={onClose} className="min-h-11 rounded-full border border-neutral-300 px-5 text-sm font-semibold text-neutral-800 hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700">Để xem sau</button>
          <button type="button" onClick={onSelect} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-neutral-950 px-5 text-sm font-semibold text-white hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"><Sparkles size={16} />Dùng gói này</button>
        </div>
      </section>
    </div>
  );
}

export default function TripPackagesSection({ pois, isLoading, loadError, onSelectPackage, onExplorePois }: TripPackagesSectionProps) {
  const [filter, setFilter] = useState<PackageFilter>('all');
  const [durationFilter, setDurationFilter] = useState<DurationFilter>('all');
  const [stayBudgetFilter, setStayBudgetFilter] = useState<StayBudgetFilter>('all');
  const [isFilterExpanded, setIsFilterExpanded] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<ResolvedTripPackage | null>(null);
  const resolvedPackages = useMemo(() => resolveTripPackages(pois), [pois]);
  const filteredPackages = useMemo(() => resolvedPackages.filter((tripPackage) => {
    const matchesCategory = filter === 'all'
      || (filter === 'Đà Nẵng' || filter === 'Huế'
        ? tripPackage.days.some((day) => day.city === filter)
        : tripPackage.definition.theme === filter);
    const matchesDuration = durationFilter === 'all' || tripPackage.days.length === Number(durationFilter);
    const matchesStayBudget = stayBudgetFilter === 'all'
      || tripPackage.stays.some((stay) => stay.budget_tier === stayBudgetFilter);
    return matchesCategory && matchesDuration && matchesStayBudget;
  }), [durationFilter, filter, resolvedPackages, stayBudgetFilter]);
  const visiblePackages = showAll ? filteredPackages : filteredPackages.slice(0, 3);
  const hasActiveFilters = filter !== 'all' || durationFilter !== 'all' || stayBudgetFilter !== 'all';
  const quickThemeFilters = QUICK_THEME_FILTERS.map((item) => ({
    ...item,
    count: resolvedPackages.filter((tripPackage) => tripPackage.definition.theme === item.id
      && (durationFilter === 'all' || tripPackage.days.length === Number(durationFilter))
      && (stayBudgetFilter === 'all' || tripPackage.stays.some((stay) => stay.budget_tier === stayBudgetFilter))).length,
  }));
  const clearFilters = () => {
    setFilter('all');
    setDurationFilter('all');
    setStayBudgetFilter('all');
    setShowAll(false);
  };

  return (
    <section id="trip-packages" className="space-y-4 pt-2 scroll-mt-6" aria-labelledby="trip-packages-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="trip-packages-title" className="flex flex-wrap items-center gap-2 text-lg font-bold text-neutral-950">
            Gói hành trình có lịch trình & nơi lưu trú
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-neutral-700">Mỗi chủ đề có ít nhất hai lựa chọn 2–3 ngày. Lọc theo điểm đến, nhu cầu, số ngày và mức giá lưu trú.</p>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Đang tải dữ liệu gói hành trình">
          {[0, 1, 2].map((item) => <div key={item} className="h-80 animate-pulse rounded-2xl border border-neutral-200 bg-neutral-100" />)}
        </div>
      ) : resolvedPackages.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-6 text-center">
          <Hotel size={24} className="mx-auto text-emerald-800" aria-hidden="true" />
          <p className="mt-3 text-sm font-semibold text-neutral-950">Chưa đủ địa điểm và thông tin liên hệ để xác minh gói.</p>
          <p className="mx-auto mt-1 max-w-xl text-sm leading-relaxed text-neutral-700">Gói chỉ hiện khi toàn bộ điểm dừng và nơi lưu trú có trong danh mục POI đang tải. {loadError ? 'Danh mục đang gặp lỗi kết nối.' : 'Thử tải danh mục POI hoặc kiểm tra dữ liệu nơi lưu trú.'}</p>
          <button type="button" onClick={onExplorePois} className="mt-4 min-h-11 rounded-full bg-neutral-950 px-5 text-sm font-semibold text-white hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700">Mở danh sách địa điểm</button>
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-2.5 sm:p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <button
                  type="button"
                  aria-expanded={isFilterExpanded}
                  aria-controls="trip-package-filters"
                  onClick={() => setIsFilterExpanded((expanded) => !expanded)}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                >
                  <SlidersHorizontal size={16} aria-hidden="true" />
                  Lọc gói
                  {hasActiveFilters && <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-100 px-1.5 text-xs font-bold text-emerald-900">{Number(filter !== 'all') + Number(durationFilter !== 'all') + Number(stayBudgetFilter !== 'all')}</span>}
                  <ChevronDown size={15} aria-hidden="true" className={isFilterExpanded ? 'rotate-180 transition-transform' : 'transition-transform'} />
                </button>
                <span className="truncate text-sm font-medium text-neutral-700">
                  {filter === 'all' ? 'Tất cả chủ đề' : FILTERS.find((item) => item.id === filter)?.label}
                  {durationFilter !== 'all' && ` · ${durationFilter} ngày`}
                  {stayBudgetFilter !== 'all' && ` · ${stayBudgetFilter === '$' ? 'Tiết kiệm' : stayBudgetFilter === '$$' ? 'Vừa phải' : 'Cao cấp'}`}
                </span>
              </div>
              {hasActiveFilters && <div className="flex flex-wrap items-center justify-end gap-2">
                <span className="text-sm font-medium text-neutral-700">{filteredPackages.length} gói phù hợp</span>
                {!isFilterExpanded && <button type="button" onClick={clearFilters} className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-emerald-900 underline underline-offset-2 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"><RotateCcw size={14} aria-hidden="true" />Xóa lọc</button>}
              </div>}
            </div>
            <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2 border-t border-neutral-200 pt-2" role="group" aria-label="Lọc nhanh theo chủ đề">
              <span className="shrink-0 text-sm font-semibold text-neutral-700">Chủ đề</span>
              {quickThemeFilters.map((item) => {
                const isUnavailable = item.count === 0 && filter !== item.id;
                return <button key={item.id} type="button" aria-pressed={filter === item.id} aria-label={`${item.label}: ${item.count} gói`} disabled={isUnavailable} onClick={() => { setFilter((current) => current === item.id ? 'all' : item.id); setShowAll(false); }} className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 disabled:cursor-not-allowed disabled:border-neutral-200 disabled:bg-neutral-100 disabled:text-neutral-500 ${filter === item.id ? 'border-neutral-950 bg-neutral-950 text-white' : 'border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-100'}`}>
                  {item.label}<span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${filter === item.id ? 'bg-white/15 text-white' : 'bg-neutral-100 text-neutral-700'}`}>{item.count}</span>
                </button>;
              })}
            </div>
            <div id="trip-package-filters" hidden={!isFilterExpanded} className="mt-3 space-y-3 border-t border-neutral-200 pt-3">
              <div className="flex flex-wrap gap-2" role="group" aria-label="Lọc gói theo điểm đến và chủ đề">
              {FILTERS.map((item) => {
                const count = item.id === 'all'
                  ? resolvedPackages.length
                  : item.id === 'Đà Nẵng' || item.id === 'Huế'
                    ? resolvedPackages.filter((tripPackage) => tripPackage.days.some((day) => day.city === item.id)).length
                    : resolvedPackages.filter((tripPackage) => tripPackage.definition.theme === item.id).length;
                return (
                  <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => { setFilter(item.id); setShowAll(false); }} className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-3.5 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${filter === item.id ? 'border-neutral-950 bg-neutral-950 text-white' : 'border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-100'}`}>
                    {item.label}<span className={`rounded-full px-1.5 py-0.5 text-xs ${filter === item.id ? 'bg-white/15 text-white' : 'bg-neutral-100 text-neutral-700'}`}>{count}</span>
                  </button>
                );
              })}
              </div>
              <div className="flex flex-col gap-2 border-t border-neutral-200 pt-3 sm:flex-row sm:items-end">
              <label className="flex min-h-11 flex-1 flex-col gap-1 text-xs font-semibold text-neutral-700">
                Thời lượng
                <select value={durationFilter} onChange={(event) => { setDurationFilter(event.target.value as DurationFilter); setShowAll(false); }} aria-label="Lọc gói theo thời lượng" className="min-h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm font-medium text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700">
                  <option value="all">Tất cả số ngày</option>
                  <option value="2">2 ngày</option>
                  <option value="3">3 ngày</option>
                </select>
              </label>
              <label className="flex min-h-11 flex-1 flex-col gap-1 text-xs font-semibold text-neutral-700">
                Ngân sách lưu trú
                <select value={stayBudgetFilter} onChange={(event) => { setStayBudgetFilter(event.target.value as StayBudgetFilter); setShowAll(false); }} aria-label="Lọc gói theo ngân sách lưu trú" className="min-h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm font-medium text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700">
                  <option value="all">Mọi mức giá</option>
                  <option value="$">₫ · Tiết kiệm</option>
                  <option value="$$">₫₫ · Vừa phải</option>
                  <option value="$$$">₫₫₫ · Cao cấp</option>
                </select>
              </label>
              {hasActiveFilters && <button type="button" onClick={clearFilters} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-800 hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"><RotateCcw size={15} aria-hidden="true" />Xóa lọc</button>}
              </div>
            </div>
          </div>

          {filteredPackages.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-6 text-center">
              <p className="text-sm font-semibold text-neutral-950">Chưa có gói đủ dữ liệu cho bộ lọc này.</p>
              <p className="mt-1 text-sm text-neutral-700">Chọn chủ đề khác để xem các gói đã đối chiếu với danh mục POI hiện có.</p>
              <button type="button" onClick={clearFilters} className="mt-4 min-h-11 rounded-full border border-neutral-300 px-5 text-sm font-semibold text-neutral-900 hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700">Xóa bộ lọc</button>
            </div>
          ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visiblePackages.map((tripPackage) => {
              const { definition } = tripPackage;
              const coverPoi = tripPackage.coverPoi;
              const primaryStay = tripPackage.stays[0];
              const stopCount = tripPackage.days.reduce((total, day) => total + day.stops.length, 0);
              const price = packageNightlyPrice(primaryStay);
              return (
                <article key={definition.id} className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm transition-shadow hover:shadow-md">
                  <div className="relative h-40 bg-neutral-100">
                    <img src={tripPackage.coverImage} alt={tripPackage.coverImageAlt} loading="lazy" onError={(event) => handlePackageImageError(event, coverPoi)} className="h-full w-full object-cover" />
                    <span className="absolute left-3 top-3 rounded-full bg-neutral-950/85 px-3 py-1 text-xs font-semibold text-white">{definition.label}</span>
                    <span className="absolute bottom-3 right-3 rounded-full bg-white/95 px-3 py-1 text-xs font-semibold text-neutral-950">{definition.destination}</span>
                  </div>
                  <div className="space-y-3 p-4">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-neutral-700">
                      <span className="inline-flex items-center gap-1.5"><CalendarDays size={14} />{tripPackage.days.length} ngày</span>
                      <span>{stopCount} điểm dừng</span>
                      <span>Lưu trú · {packageBudgetLabel(primaryStay)}</span>
                    </div>
                    <h3 className="line-clamp-2 min-h-12 text-base font-bold leading-snug text-neutral-950">{definition.title}</h3>
                    <p className="line-clamp-2 min-h-10 text-sm leading-relaxed text-neutral-700">{definition.summary}</p>
                    <div className="rounded-xl bg-neutral-50 p-3">
                      <div className="flex items-start gap-2">
                        <Hotel size={16} className="mt-0.5 shrink-0 text-emerald-800" />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-neutral-950">{primaryStay.name}</p>
                          <p className="mt-1 text-xs text-neutral-700">{price ? `${price} tham khảo / đêm` : 'Liên hệ để xác nhận giá theo đêm'}</p>
                          <p className="mt-1 text-xs text-neutral-700">{hasPoiContactInfo(primaryStay) ? 'Có số điện thoại hoặc liên kết liên hệ' : 'Có thể liên hệ cơ sở lưu trú'}</p>
                        </div>
                      </div>
                    </div>
                    <p className="text-xs leading-relaxed text-neutral-700">Mùa phù hợp: {definition.season}</p>
                    <p className="text-xs leading-relaxed text-neutral-700">Giá hiển thị là dữ liệu tham khảo của nơi lưu trú; chưa phải tổng giá chuyến đi.</p>
                    <button type="button" onClick={() => setSelectedPackage(tripPackage)} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-neutral-950 px-4 text-sm font-semibold text-white hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700">Xem điểm theo ngày và liên hệ <ChevronRight size={16} /></button>
                  </div>
                </article>
              );
            })}
          </div>
          )}

          {filteredPackages.length > 3 && (
            <div className="flex justify-center">
              <button type="button" onClick={() => setShowAll((current) => !current)} aria-expanded={showAll} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-neutral-300 bg-white px-5 text-sm font-semibold text-neutral-900 hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700">
                {showAll ? 'Thu gọn gói' : `Xem tất cả ${filteredPackages.length} gói`}<ChevronDown size={16} className={showAll ? 'rotate-180 transition-transform' : 'transition-transform'} />
              </button>
            </div>
          )}
        </>
      )}

      <p className="text-xs leading-relaxed text-neutral-700">
        Mùa phù hợp là gợi ý khí hậu cấp thành phố, không phải cam kết thời tiết. Tham khảo <a href="https://vietnam.travel/place-to-go/south-central-coast-central-highlands/da-nang/" target="_blank" rel="noreferrer" className="font-semibold text-emerald-900 underline">Đà Nẵng</a> và <a href="https://vietnam.travel/place-to-go/north-central-coast/hue/" target="_blank" rel="noreferrer" className="font-semibold text-emerald-900 underline">Huế</a> từ Vietnam Tourism.
      </p>

      {selectedPackage && (
        <PackageDetail
          tripPackage={selectedPackage}
          onClose={() => setSelectedPackage(null)}
          onSelect={() => {
            onSelectPackage(selectedPackage.launch);
            setSelectedPackage(null);
          }}
        />
      )}
    </section>
  );
}
