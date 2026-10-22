import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  SlidersHorizontal,
  Search as SearchIcon,
  X as XIcon,
  RotateCcw,
  Sprout,
  Scale,
  Leaf,
  Sparkles,
  Award,
  Bus,
  Clock,
  MapPin,
} from 'lucide-react';
import type { PoiCategory, PoiCity, Poi } from '@/data/pois';
import { pois, categoryLabels, normalizePois, type PaginatedPoisResponse } from '@/data/pois';
import PoiMap from '@/components/poi/PoiMap';
import PoiDetailSection from '@/components/poi/PoiDetailSection';
import { PoiCardSkeleton } from '@/components/ui/Skeleton';
import Logo from '@/components/ui/Logo';
import { getPois } from '@/services/poi';
import { getMe, type UserProfile } from '@/services/auth';
import ExploreFilterPopover, { type ExploreFilterValues, type EcoPriority, type PoiCategoryFilter } from '@/components/poi/ExploreFilterPopover';

const ECO_LABEL_MAP: Record<EcoPriority, { label: string; icon: React.ComponentType<{ className?: string }> | null }> = {
  all: { label: 'Tất cả', icon: null },
  basic: { label: 'Cơ bản (≥30%)', icon: Sprout },
  balanced: { label: 'Cân bằng (≥55%)', icon: Scale },
  eco: { label: 'Thân thiện (≥75%)', icon: Leaf },
  pure: { label: 'Thuần sinh thái (≥90%)', icon: Sparkles },
};

type CityFilter = 'all' | PoiCity;
type CategoryFilter = 'all' | PoiCategory;

const TABS: { id: 'all' | PoiCategory; label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'di-tich', label: 'Di tích' },
  { id: 'canh-quan', label: 'Cảnh quan' },
  { id: 'chua', label: 'Chùa' },
  { id: 'quan-an', label: 'Quán ăn' },
];

export default function ExplorePage() {
  const [search, setSearch] = useState('');
  const [cityFilter, setCityFilter] = useState<CityFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [activeTab, setActiveTab] = useState<'all' | PoiCategory>('all');
  const [selectedPoiId, setSelectedPoiId] = useState<string | null>(null);
  const [hoveredPoiId, setHoveredPoiId] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allPois, setAllPois] = useState<Poi[]>([]);
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [isFilterPopoverOpen, setIsFilterPopoverOpen] = useState(false);
  const [filterValues, setFilterValues] = useState<ExploreFilterValues>({
    budget: 'all',
    ecoPriority: 'all',
    ecoCertifiedOnly: false,
    greenTransitOnly: false,
    categories: [],
    timeOfDay: [],
    radiusKm: null,
  });

  useEffect(() => {
    let active = true;

    async function loadUserProfile() {
      try {
        const profile = await getMe();
        if (active) setCurrentUser(profile);
      } catch {
        if (active) setCurrentUser(null);
      }
    }

    loadUserProfile();

    const onAuthChange = () => {
      loadUserProfile();
    };

    window.addEventListener('auth-change', onAuthChange);
    return () => {
      active = false;
      window.removeEventListener('auth-change', onAuthChange);
    };
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    sessionStorage.removeItem('access_token');
    window.dispatchEvent(new Event('auth-change'));
    setCurrentUser(null);
    setShowProfileMenu(false);
  };

  useEffect(() => {
    let active = true;

    async function loadPois() {
      try {
        setLoading(true);
        setError(null);

        const response = await getPois({
          limit: 100,
          page: 1,
          city: cityFilter !== 'all' ? cityFilter : undefined,
          category: categoryFilter !== 'all' ? categoryFilter : undefined,
          eco_priority: filterValues.ecoPriority,
          budget_tier: filterValues.budget,
          eco_certified_only: filterValues.ecoCertifiedOnly,
          green_transit_only: filterValues.greenTransitOnly,
        });

        const normalized = normalizePois(response.items);
        if (!active) return;
        setAllPois(normalized.length > 0 ? normalized : pois);
      } catch (loadError) {
        if (!active) return;
        console.warn('Backend POIs fetch failed, using fallback data:', loadError);
        setError(loadError instanceof Error ? loadError.message : 'Failed to load POIs');
        setAllPois(pois);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadPois();

    return () => {
      active = false;
    };
  }, [cityFilter, categoryFilter, filterValues]);

  const handleTabChange = (tabId: 'all' | PoiCategory) => {
    setActiveTab(tabId);
    setCategoryFilter(tabId);
  };

  const filteredPois = useMemo(() => {
    // ECO_SCORE_MAP mirrors what ExploreFilterPopover uses
    const ecoScoreMap: Record<EcoPriority, number> = { all: 0, basic: 30, balanced: 55, eco: 75, pure: 90 };
    const minEco = ecoScoreMap[filterValues.ecoPriority];

    return allPois.filter((poi) => {
      const matchCity = cityFilter === 'all' || poi.city === cityFilter;
      const matchCat = categoryFilter === 'all' || poi.category === categoryFilter;
      const matchSearch =
        !search ||
        poi.name.toLowerCase().includes(search.toLowerCase()) ||
        poi.description.toLowerCase().includes(search.toLowerCase());

      // Eco Score filter
      const ecoScore = poi.ecoScore ?? 80;
      let matchEco = ecoScore >= minEco;
      if (filterValues.ecoCertifiedOnly && ecoScore < 85) matchEco = false;

      // Budget filter (category-based proxy)
      let matchBudget = true;
      if (filterValues.budget !== 'all') {
        if (filterValues.budget === '$') {
          matchBudget = poi.category === 'chua' || poi.category === 'canh-quan';
        } else if (filterValues.budget === '$$') {
          matchBudget = poi.category === 'quan-an' || poi.category === 'chua';
        } else if (filterValues.budget === '$$$') {
          matchBudget = poi.category === 'di-tich' || poi.category === 'canh-quan';
        } else if (filterValues.budget === '$$$$') {
          matchBudget = poi.category === 'quan-an';
        }
      }

      // Category multi-select filter
      const matchCatFilter = filterValues.categories.length === 0 ||
        filterValues.categories.includes(poi.category as PoiCategoryFilter);

      return matchCity && matchCat && matchSearch && matchEco && matchBudget && matchCatFilter;
    });
  }, [allPois, search, cityFilter, categoryFilter, filterValues]);

  // Đếm số lượng filter đang active chuẩn Mindtrip
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filterValues.budget !== 'all') count++;
    if (filterValues.ecoPriority !== 'all') count++;
    if (filterValues.ecoCertifiedOnly) count++;
    if (filterValues.greenTransitOnly) count++;
    if (filterValues.categories.length > 0) count++;
    if (filterValues.timeOfDay.length > 0) count++;
    if (filterValues.radiusKm !== null) count++;
    return count;
  }, [filterValues]);

  const handleSelectPoi = (id: string | null) => {
    setSelectedPoiId((prev) => (prev === id ? null : id));
  };

  const selectedPoi = useMemo(() => {
    if (!selectedPoiId) return null;
    return allPois.find((poi) => poi.id === selectedPoiId) || null;
  }, [allPois, selectedPoiId]);

  const toggleFavorite = (id: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const currentCityLabel = cityFilter === 'all' ? 'Tất cả địa điểm' : cityFilter;

  return (
    <div className="flex h-screen overflow-hidden font-sans bg-white select-none">
      {/* 1. LEFT SIDEBAR */}
      <aside className="w-[240px] shrink-0 h-full border-r border-gray-100 flex flex-col justify-between p-4 bg-white z-20" data-purpose="sidebar">
        <div className="flex flex-col gap-6">
          {/* Brand Logo */}
          <Link to="/" className="flex items-center gap-2 px-2 pt-1 hover:opacity-80 transition">
            <Logo size="md" />
          </Link>

          {/* Navigation Links */}
          <nav className="flex flex-col space-y-0.5 text-sm font-medium">
            <Link to="/explore" className="flex items-center gap-3.5 px-3 py-2.5 rounded-xl bg-gray-100 text-black font-semibold transition-colors">
              <i className="ph ph-compass text-xl text-black"></i>
              <span>Khám phá</span>
            </Link>

            <Link to="/my-trips" className="flex items-center gap-3.5 px-3 py-2.5 rounded-xl text-gray-700 hover:bg-gray-50 transition-colors">
              <i className="ph ph-heart text-xl text-gray-800"></i>
              <span>Đã lưu</span>
            </Link>

            <a href="#" className="flex items-center gap-3.5 px-3 py-2.5 rounded-xl text-gray-700 hover:bg-gray-50 transition-colors">
              <i className="ph ph-bell text-xl text-gray-800"></i>
              <span>Cập nhật</span>
            </a>

            <Link to="/planner" className="flex items-center gap-3.5 px-3 py-2.5 rounded-xl text-gray-700 hover:bg-gray-50 transition-colors">
              <i className="ph ph-calendar-plus text-xl text-gray-800"></i>
              <span>Lịch trình</span>
            </Link>

            <a href="#" className="flex items-center gap-3.5 px-3 py-2.5 rounded-xl text-gray-700 hover:bg-gray-50 transition-colors">
              <i className="ph ph-plus-square text-xl text-gray-800"></i>
              <span>Tạo nên</span>
            </a>
          </nav>

          {/* Button Trò chuyện mới */}
          <div className="px-1 pt-1">
            <button className="w-full py-2.5 px-4 bg-gray-100 hover:bg-gray-200 text-gray-900 font-medium text-sm rounded-full transition-all text-center">
              Trò chuyện mới
            </button>
          </div>
        </div>

        {/* Sidebar Bottom / User & Footer */}
        <div className="flex flex-col gap-4 pt-4 border-t border-gray-100 relative">
          {/* Profile Dropdown Menu */}
          {showProfileMenu && (
            <div className="absolute bottom-20 left-2 right-2 bg-white rounded-2xl shadow-xl border border-gray-100 p-2 z-50 animate-fadeIn">
              {currentUser ? (
                <div className="flex flex-col">
                  <div className="px-3 py-2 border-b border-gray-100">
                    <p className="text-xs font-bold text-gray-900 truncate">{currentUser.full_name}</p>
                    <p className="text-[11px] text-gray-400 truncate">{currentUser.email}</p>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="w-full text-left px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-xl transition mt-1 cursor-pointer"
                  >
                    Đăng xuất
                  </button>
                </div>
              ) : (
                <Link
                  to="/login"
                  className="block text-center px-3 py-2 text-xs font-bold text-white bg-black hover:bg-gray-800 rounded-xl transition"
                >
                  Đăng nhập
                </Link>
              )}
            </div>
          )}

          {/* Profile Button */}
          <div
            onClick={() => setShowProfileMenu((prev) => !prev)}
            className="flex items-center justify-between px-2 cursor-pointer hover:bg-gray-50 py-1.5 rounded-xl transition"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full overflow-hidden bg-black text-white flex items-center justify-center font-bold text-xs shadow-xs">
                {currentUser?.full_name ? currentUser.full_name.charAt(0).toUpperCase() : 'G'}
              </div>
              <div className="flex flex-col text-left">
                <span className="text-xs font-semibold text-gray-900 leading-tight">
                  {currentUser?.full_name || 'Du khách'}
                </span>
                <span className="text-[11px] text-gray-400 font-normal leading-tight">
                  {currentUser?.email ? `@${currentUser.email.split('@')[0]}` : '@greentrip-user'}
                </span>
              </div>
            </div>
            <i className="ph ph-dots-three text-lg text-gray-600"></i>
          </div>

          {/* Legal footer */}
          <div className="px-2 text-[11px] text-gray-400 leading-relaxed font-normal">
            <p className="space-x-1">
              <span>Công ty</span><span>•</span><span>Liên hệ</span><span>•</span><span>Giúp đỡ</span>
            </p>
            <p className="space-x-1">
              <span>Điều khoản</span><span>•</span><span>Sự riêng tư</span>
            </p>
            <p className="mt-1 text-gray-400">© 2026 GreenTrip AI. Du lịch xanh & bền vững.</p>
          </div>
        </div>
      </aside>

      {/* 2. MIDDLE LIST (EXPLORE) */}
      <main className="w-[620px] shrink-0 h-full flex flex-col bg-white overflow-hidden border-r border-gray-100" data-purpose="content-list-stream">
        {/* Top Bar: Title & Search */}
        <header className="p-6 pb-2 space-y-4">
          {/* Location Title Dropdown */}
          <div className="relative">
            <div 
              onClick={() => setShowCityDropdown(!showCityDropdown)}
              className="inline-flex items-center gap-1.5 cursor-pointer select-none group"
            >
              <h1 className="text-2xl font-bold tracking-tight text-gray-950 group-hover:text-black">
                {currentCityLabel}
              </h1>
              <i className="ph ph-caret-down font-bold text-gray-950 text-base"></i>
            </div>

            {showCityDropdown && (
              <div className="absolute top-10 left-0 bg-white shadow-xl border border-gray-100 rounded-2xl py-2 w-48 z-50">
                <button
                  onClick={() => { setCityFilter('all'); setShowCityDropdown(false); }}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center justify-between ${cityFilter === 'all' ? 'font-bold text-black' : 'text-gray-700'}`}
                >
                  <span>Tất cả địa điểm</span>
                  {cityFilter === 'all' && <i className="ph ph-check font-bold"></i>}
                </button>
                <button
                  onClick={() => { setCityFilter('Đà Nẵng'); setShowCityDropdown(false); }}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center justify-between ${cityFilter === 'Đà Nẵng' ? 'font-bold text-black' : 'text-gray-700'}`}
                >
                  <span>Đà Nẵng</span>
                  {cityFilter === 'Đà Nẵng' && <i className="ph ph-check font-bold"></i>}
                </button>
                <button
                  onClick={() => { setCityFilter('Huế'); setShowCityDropdown(false); }}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center justify-between ${cityFilter === 'Huế' ? 'font-bold text-black' : 'text-gray-700'}`}
                >
                  <span>Huế</span>
                  {cityFilter === 'Huế' && <i className="ph ph-check font-bold"></i>}
                </button>
              </div>
            )}
          </div>

          {/* Search Box & Filter — GreenTrip Design System */}
          <div className="flex items-center gap-3">
            <div className="flex-1 relative flex items-center">
              <SearchIcon className="w-4 h-4 text-muted absolute left-4 pointer-events-none" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-11 pr-9 py-2.5 bg-[#F4EFEA]/80 hover:bg-[#F0EAE3] text-sm placeholder-muted text-charcoal rounded-full border border-[#E8E1D5] focus:outline-none focus:bg-white focus:border-forest-500 focus:ring-2 focus:ring-forest-500/15 transition-all"
                placeholder="Tìm kiếm địa điểm, di tích..."
                type="text"
              />
              {search && (
                <button 
                  onClick={() => setSearch('')}
                  className="absolute right-3 text-muted hover:text-charcoal p-1 rounded-full transition"
                  aria-label="Xóa từ khóa"
                >
                  <XIcon className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Nút Bộ lọc (Design System: Lucide SlidersHorizontal + Forest Badge) */}
            <button 
              onClick={() => setIsFilterPopoverOpen(true)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-full border transition-all text-sm font-medium ${
                activeFilterCount > 0 
                  ? 'border-forest-600 text-forest-900 bg-forest-50/70 font-bold shadow-xs' 
                  : 'border-[#E8E2D9] hover:border-forest-400 bg-white text-charcoal hover:bg-[#FAF8F5]'
              }`}
              title="Tùy chỉnh bộ lọc"
            >
              <SlidersHorizontal className="w-4 h-4 text-forest-700" />
              <span className="font-heading">Bộ lọc</span>
              {activeFilterCount > 0 && (
                <span className="w-5 h-5 rounded-full bg-forest-700 text-white text-[11px] font-bold flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>

          {/* Scrollable Category Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-medium no-scrollbar">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={`whitespace-nowrap transition-all px-4 py-1.5 rounded-full font-heading text-xs ${
                    isActive
                      ? 'bg-forest-800 text-white font-semibold shadow-xs'
                      : 'text-charcoal/70 hover:text-charcoal hover:bg-[#F4EFEA]'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Active Filter Chips Bar (Design System: Semantic badges with Lucide icons) */}
          {activeFilterCount > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto pt-1 pb-1 text-xs no-scrollbar animate-fadeIn">
              {filterValues.budget !== 'all' && (
                <button
                  onClick={() => setFilterValues((prev) => ({ ...prev, budget: 'all' }))}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-wood-50 hover:bg-wood-100 text-wood-800 border border-wood-200 text-[11px] font-semibold transition"
                  title="Bỏ lọc giá"
                >
                  <XIcon className="w-3 h-3 text-wood-600" />
                  <span>Giá: {filterValues.budget}</span>
                </button>
              )}

              {filterValues.ecoPriority !== 'all' && (
                <button
                  onClick={() => setFilterValues((prev) => ({ ...prev, ecoPriority: 'all' }))}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-forest-50 hover:bg-forest-100 text-forest-800 border border-forest-200 text-[11px] font-semibold transition"
                  title="Bỏ lọc Eco"
                >
                  <XIcon className="w-3 h-3 text-forest-600" />
                  {ECO_LABEL_MAP[filterValues.ecoPriority]?.icon &&
                    React.createElement(ECO_LABEL_MAP[filterValues.ecoPriority].icon!, {
                      className: 'w-3 h-3 text-forest-600',
                    })}
                  <span>{ECO_LABEL_MAP[filterValues.ecoPriority]?.label || filterValues.ecoPriority}</span>
                </button>
              )}

              {filterValues.ecoCertifiedOnly && (
                <button
                  onClick={() => setFilterValues((prev) => ({ ...prev, ecoCertifiedOnly: false }))}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-forest-50 hover:bg-forest-100 text-forest-800 border border-forest-200 text-[11px] font-semibold transition"
                  title="Bỏ lọc chứng nhận"
                >
                  <XIcon className="w-3 h-3 text-forest-600" />
                  <Award className="w-3 h-3 text-forest-600" />
                  <span>Eco-Certified</span>
                </button>
              )}

              {filterValues.greenTransitOnly && (
                <button
                  onClick={() => setFilterValues((prev) => ({ ...prev, greenTransitOnly: false }))}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-forest-50 hover:bg-forest-100 text-forest-800 border border-forest-200 text-[11px] font-semibold transition"
                  title="Bỏ lọc di chuyển xanh"
                >
                  <XIcon className="w-3 h-3 text-forest-600" />
                  <Bus className="w-3 h-3 text-forest-600" />
                  <span>Di chuyển xanh</span>
                </button>
              )}

              {filterValues.categories.length > 0 && (
                <button
                  onClick={() => setFilterValues((prev) => ({ ...prev, categories: [] }))}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F4EFEA] hover:bg-[#EAE2D6] text-charcoal border border-[#E8E1D5] text-[11px] font-semibold transition"
                  title="Bỏ lọc loại hình"
                >
                  <XIcon className="w-3 h-3 text-muted" />
                  <span>{filterValues.categories.length} loại hình</span>
                </button>
              )}

              {filterValues.timeOfDay.length > 0 && (
                <button
                  onClick={() => setFilterValues((prev) => ({ ...prev, timeOfDay: [] }))}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F4EFEA] hover:bg-[#EAE2D6] text-charcoal border border-[#E8E1D5] text-[11px] font-semibold transition"
                  title="Bỏ lọc khung giờ"
                >
                  <XIcon className="w-3 h-3 text-muted" />
                  <Clock className="w-3 h-3 text-muted" />
                  <span>{filterValues.timeOfDay.length} khung giờ</span>
                </button>
              )}

              {filterValues.radiusKm !== null && (
                <button
                  onClick={() => setFilterValues((prev) => ({ ...prev, radiusKm: null }))}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F4EFEA] hover:bg-[#EAE2D6] text-charcoal border border-[#E8E1D5] text-[11px] font-semibold transition"
                  title="Bỏ lọc bán kính"
                >
                  <XIcon className="w-3 h-3 text-muted" />
                  <MapPin className="w-3 h-3 text-muted" />
                  <span>&lt; {filterValues.radiusKm} km</span>
                </button>
              )}

              <button
                onClick={() =>
                  setFilterValues({
                    budget: 'all', ecoPriority: 'all', ecoCertifiedOnly: false,
                    greenTransitOnly: false, categories: [], timeOfDay: [], radiusKm: null,
                  })
                }
                className="text-[11px] text-muted hover:text-charcoal font-semibold underline pl-1 whitespace-nowrap flex items-center gap-1 transition"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Xóa hết</span>
              </button>
            </div>
          )}
        </header>

        {/* Cards Scrollable Area */}
        <div className="flex-1 overflow-y-auto px-6 py-3">
          <div className="grid grid-cols-2 gap-4 pb-12">
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => <PoiCardSkeleton key={i} />)
            ) : filteredPois.length === 0 ? (
              error ? (
                <ErrorState message={error} />
              ) : (
                <EmptyState />
              )
            ) : (
              filteredPois.map((poi, idx) => (
                <div key={poi.id} data-poi-id={poi.id}>
                  <PoiCard
                    poi={poi}
                    index={idx}
                    active={poi.id === selectedPoiId}
                    favorite={favorites.has(poi.id)}
                    onClick={() => handleSelectPoi(poi.id)}
                    onHover={setHoveredPoiId}
                    onToggleFavorite={toggleFavorite}
                  />
                </div>
              ))
            )}
          </div>
        </div>
      </main>

      {/* 3. RIGHT SECTION: DETAIL VIEW WHEN SELECTED, OR INTERACTIVE MAP */}
      <section className="flex-1 h-full relative overflow-hidden p-3 pl-1 bg-white" data-purpose="right-panel-container">
        {/* Interactive Map (remains mounted for fast performance) */}
        <div className={`w-full h-full rounded-[22px] overflow-hidden border border-gray-200/80 shadow-[0_2px_12px_rgba(0,0,0,0.06)] relative [transform:translateZ(0)] ${selectedPoi ? 'invisible pointer-events-none' : 'visible'}`}>
          <PoiMap
            pois={filteredPois}
            selectedPoiId={selectedPoiId}
            hoveredPoiId={hoveredPoiId}
            onSelectPoi={handleSelectPoi}
            onHoverPoi={setHoveredPoiId}
          />
        </div>

        {/* Right Detail Section */}
        {selectedPoi && (
          <div className="absolute inset-0 z-30 bg-white">
            <PoiDetailSection
              poi={selectedPoi}
              isFavorite={favorites.has(selectedPoi.id)}
              onClose={() => setSelectedPoiId(null)}
              onToggleFavorite={toggleFavorite}
              onViewOnMap={() => setSelectedPoiId(null)}
            />
          </div>
        )}
      </section>

      {/* 4. Explore Filter Popover Modal (Mindtrip-Style Floating Modal) */}
      <ExploreFilterPopover
        isOpen={isFilterPopoverOpen}
        onClose={() => setIsFilterPopoverOpen(false)}
        values={filterValues}
        onApply={(newValues) => setFilterValues(newValues)}
        onClearAll={() =>
          setFilterValues({
            budget: 'all', ecoPriority: 'all', ecoCertifiedOnly: false,
            greenTransitOnly: false, categories: [], timeOfDay: [], radiusKm: null,
          })
        }
        matchingCount={filteredPois.length}
      />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="col-span-2 flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 py-16 text-center animate-fadeIn">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
        <i className="ph ph-magnifying-glass text-xl text-gray-400"></i>
      </div>
      <p className="text-[14px] font-bold text-black">Không tìm thấy địa điểm</p>
      <p className="text-xs text-gray-400 mt-1">Thử tìm kiếm với từ khóa khác hoặc bỏ bộ lọc</p>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="col-span-2 flex flex-col items-center justify-center rounded-2xl border border-red-200 bg-red-50 py-12 text-center animate-fadeIn">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
        <i className="ph ph-warning-circle text-2xl text-red-600"></i>
      </div>
      <p className="text-sm font-medium text-red-700">Không thể tải địa điểm</p>
      <p className="mt-1 text-xs text-red-600">{message}</p>
    </div>
  );
}

function PoiCard({
  poi,
  active = false,
  favorite = false,
  onClick,
  onHover,
  onToggleFavorite,
}: {
  poi: Poi;
  index?: number;
  active?: boolean;
  favorite?: boolean;
  onClick: () => void;
  onHover: (id: string | null) => void;
  onToggleFavorite: (id: string) => void;
}) {
  return (
    <article
      onClick={onClick}
      onMouseEnter={() => onHover(poi.id)}
      onMouseLeave={() => onHover(null)}
      className="flex flex-col group cursor-pointer"
    >
      <div className={`relative w-full aspect-[4/3] rounded-2xl overflow-hidden bg-gray-100 shadow-sm transition-all ${active ? 'ring-2 ring-black' : ''}`}>
        <img
          src={poi.image}
          alt={poi.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />

        {/* Top Action Buttons (Heart + Plus) */}
        <div className="absolute top-3 right-3 flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(poi.id);
            }}
            className="w-8 h-8 rounded-full bg-black/40 backdrop-blur-md text-white flex items-center justify-center hover:bg-black/60 transition"
            title="Lưu yêu thích"
          >
            <i className={`ph ${favorite ? 'ph-fill ph-heart text-red-500' : 'ph-heart'} text-base`}></i>
          </button>
          <button 
            onClick={(e) => {
              e.stopPropagation();
            }}
            className="w-8 h-8 rounded-full bg-black/40 backdrop-blur-md text-white flex items-center justify-center hover:bg-black/60 transition"
            title="Thêm vào chuyến đi"
          >
            <i className="ph ph-plus text-base font-bold"></i>
          </button>
        </div>

        {/* Category tag badge bottom left */}
        <div className="absolute bottom-2.5 left-2.5">
          <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-black/55 backdrop-blur-md text-white shadow-sm">
            {categoryLabels[poi.category as keyof typeof categoryLabels] || 'Địa điểm'}
          </span>
        </div>
      </div>

      {/* Card Details */}
      <div className="mt-2.5 space-y-1">
        <h2 className="font-bold text-sm text-gray-900 tracking-tight truncate">{poi.name}</h2>
        <div className="flex items-center text-xs text-gray-500">
          <div className="flex items-center gap-1 font-normal">
            <i className="ph ph-map-pin text-[13px] text-gray-400"></i>
            <span>{poi.city}, Việt Nam</span>
          </div>
        </div>
      </div>
    </article>
  );
}
