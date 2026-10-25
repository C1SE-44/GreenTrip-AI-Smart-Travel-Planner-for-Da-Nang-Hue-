import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Leaf } from 'lucide-react';
import type { PoiCategory, PoiCity, Poi } from '@/data/pois';
import { pois, normalizePois } from '@/data/pois';
import PoiMap from '@/components/poi/PoiMap';
import PoiCard from '@/components/poi/PoiCard';
import PoiDetailSection from '@/components/poi/PoiDetailSection';
import { PoiCardSkeleton } from '@/components/ui/Skeleton';
import { getPois } from '@/services/poi';
import { getMe, type UserProfile } from '@/services/auth';
import ExploreFilterModal, {
  type ExploreFilterValues,
  type PoiCategoryFilter,
  DEFAULT_FILTER_VALUES,
} from '@/components/poi/ExploreFilterModal';

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
  const [addedTrips, setAddedTrips] = useState<Set<string>>(new Set());
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMapExpanded, setIsMapExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allPois, setAllPois] = useState<Poi[]>([]);
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [isFilterPopoverOpen, setIsFilterPopoverOpen] = useState(false);
  const [filterValues, setFilterValues] = useState<ExploreFilterValues>(DEFAULT_FILTER_VALUES);

  const toggleSidebar = () => {
    setIsSidebarCollapsed((prev) => !prev);
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 320);
  };

  const toggleAddTrip = (id: string) => {
    setAddedTrips((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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
        const data = await getPois({ page_size: 350 });
        if (!active) return;

        const normalized = normalizePois(data.items);
        if (normalized.length > 0) {
          setAllPois(normalized);
        } else {
          setAllPois(pois);
        }
      } catch (loadError) {
        if (!active) return;
        console.warn('Backend POIs fetch failed, using fallback curated POIs:', loadError);
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
  }, []);

  const handleTabChange = (tabId: 'all' | PoiCategory) => {
    setActiveTab(tabId);
    setCategoryFilter(tabId);
  };

  const filteredPois = useMemo(() => {
    return allPois.filter((poi) => {
      const matchCity = cityFilter === 'all' || poi.city === cityFilter;
      const matchCat = categoryFilter === 'all' || poi.category === categoryFilter;
      const s = search.trim().toLowerCase();
      const matchSearch =
        !s ||
        poi.name.toLowerCase().includes(s) ||
        (poi.cleanName && poi.cleanName.toLowerCase().includes(s)) ||
        poi.description.toLowerCase().includes(s) ||
        (poi.address && poi.address.toLowerCase().includes(s));

      // Eco Priority
      let matchEco = true;
      if (filterValues.ecoPriority === 'basic') matchEco = poi.ecoScore >= 30;
      else if (filterValues.ecoPriority === 'balanced') matchEco = poi.ecoScore >= 55;
      else if (filterValues.ecoPriority === 'eco') matchEco = poi.ecoScore >= 75;
      else if (filterValues.ecoPriority === 'pure') matchEco = poi.ecoScore >= 90;

      // Budget
      let matchBudget = true;
      if (filterValues.budget === 'low') {
        matchBudget = poi.budget_tier === '$' || poi.budget_tier === 'free' || (poi.estimatedCost ?? 0) <= 50000;
      } else if (filterValues.budget === 'medium') {
        matchBudget = poi.budget_tier === '$$' || ((poi.estimatedCost ?? 0) > 50000 && (poi.estimatedCost ?? 0) <= 200000);
      } else if (filterValues.budget === 'high') {
        matchBudget = poi.budget_tier === '$$$' || (poi.estimatedCost ?? 0) > 200000;
      }

      // Rating filter
      if (filterValues.minRating !== null && poi.rating < filterValues.minRating) {
        return false;
      }

      // Eco Certified Only
      if (filterValues.ecoCertifiedOnly && poi.ecoScore < 75) {
        return false;
      }

      // Free Ticket Only
      if (filterValues.freeTicketOnly) {
        const isFree = poi.budget_tier === 'free' || (poi.estimatedCost ?? 0) === 0;
        if (!isFree) return false;
      }

      // Cuisines filter
      if (filterValues.cuisines.length > 0) {
        const matchCuisine = filterValues.cuisines.some((c) => {
          const cLower = c.toLowerCase();
          const pCuisine = (poi.cuisine || '').toLowerCase();
          const pSub = (poi.sub_category || '').toLowerCase();
          const pName = poi.name.toLowerCase();
          return pCuisine === cLower || pSub === cLower || pName.includes(cLower);
        });
        if (!matchCuisine) return false;
      }

      // Sub-categories filter
      if (filterValues.subCategories.length > 0) {
        const matchSub = filterValues.subCategories.some((sc) => {
          const scLower = sc.toLowerCase();
          const pSub = (poi.sub_category || '').toLowerCase();
          const pName = poi.name.toLowerCase();
          return pSub === scLower || pName.includes(scLower);
        });
        if (!matchSub) return false;
      }

      // Vibes filter
      if (filterValues.vibes.length > 0) {
        const pVibes = (poi.vibes || []).map((v) => v.toLowerCase());
        const matchVibe = filterValues.vibes.some((v) =>
          pVibes.some((pv) => pv.includes(v.toLowerCase()))
        );
        if (!matchVibe) return false;
      }

      // Category multi-select filter
      const matchCatFilter =
        filterValues.categories.length === 0 ||
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
    if (filterValues.cuisines.length > 0) count += filterValues.cuisines.length;
    if (filterValues.minRating !== null) count++;
    if (filterValues.openNowOnly) count++;
    if (filterValues.vibes.length > 0) count += filterValues.vibes.length;
    if (filterValues.subCategories.length > 0) count += filterValues.subCategories.length;
    if (filterValues.rainyDayFriendly) count++;
    if (filterValues.freeTicketOnly) count++;
    return count;
  }, [filterValues]);

  const handleSelectPoi = (id: string | null) => {
    setSelectedPoiId(id);
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
      {/* 1. LEFT SIDEBAR: Co giãn mượt mà */}
      <aside 
        className={`${
          isSidebarCollapsed ? "w-[68px]" : "w-[204px]"
        } px-4 shrink-0 h-full border-r border-gray-100 flex flex-col justify-between pt-2.5 pb-6 bg-white z-20 select-none transition-[width] duration-300 ease-in-out group/sidebar relative`} 
        data-purpose="sidebar"
      >
        <div className="flex flex-col">
          {/* Header Sidebar: Brand Logo */}
          <div className="flex items-center justify-between mb-[35px] relative h-10">
            <div className="relative flex items-center h-10">
              <div className="relative w-9 h-9 flex items-center justify-center shrink-0 group/logo">
                <div 
                  className={`flex items-center justify-center transition-all duration-300 ease-out transform ${
                    isSidebarCollapsed 
                      ? "group-hover/logo:rotate-[120deg] group-hover/logo:scale-0 group-hover/logo:opacity-0" 
                      : ""
                  }`}
                >
                  <Leaf size={24} strokeWidth={2.5} className="text-black" />
                </div>

                {isSidebarCollapsed && (
                  <>
                    <button
                      onClick={toggleSidebar}
                      aria-label="Mở rộng menu"
                      className="absolute inset-0 w-9 h-9 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center text-gray-800 hover:text-black hover:bg-gray-50 transition-all duration-300 ease-out transform -rotate-[120deg] scale-0 opacity-0 group-hover/logo:rotate-0 group-hover/logo:scale-100 group-hover/logo:opacity-100 cursor-pointer active:scale-90 z-30"
                    >
                      <i className="ph ph-caret-right text-xs font-bold"></i>
                    </button>
                    <div className="absolute left-[calc(100%+8px)] top-1/2 -translate-y-1/2 bg-black text-white text-[12px] font-medium px-2.5 py-1 rounded-md shadow-lg whitespace-nowrap pointer-events-none transition-all duration-200 delay-200 ease-out transform -translate-x-1.5 opacity-0 group-hover/logo:translate-x-0 group-hover/logo:opacity-100 z-50">
                      Mở rộng
                    </div>
                  </>
                )}
              </div>

              <span
                className={`font-body font-bold text-black tracking-tighter text-[24px] leading-tight pb-1 pt-0.5 transition-all duration-300 overflow-hidden whitespace-nowrap block ${
                  isSidebarCollapsed ? "max-w-0 opacity-0 ml-0" : "max-w-[130px] opacity-100 ml-1.5"
                }`}
              >
                greentrip
              </span>
            </div>

            {!isSidebarCollapsed && (
              <button
                onClick={toggleSidebar}
                aria-label="Thu gọn menu"
                className="w-7 h-7 rounded-full bg-white border border-gray-200 shadow-xs flex items-center justify-center text-gray-700 hover:text-black hover:bg-gray-50 opacity-0 group-hover/sidebar:opacity-100 transition-all duration-200 cursor-pointer shrink-0 group/collapse relative ml-auto"
                title="Thu gọn menu"
              >
                <i className="ph ph-caret-left text-xs font-bold"></i>
                <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-black text-white text-[11px] font-semibold px-2 py-0.5 rounded-md shadow-md whitespace-nowrap pointer-events-none opacity-0 group-hover/collapse:opacity-100 transition-opacity z-50">
                  Thu gọn
                </div>
              </button>
            )}
          </div>

          {/* Navigation Links */}
          <nav className="flex flex-col space-y-[21px] text-sm">
            {[
              { to: '/explore', icon: 'ph-fill ph-compass', label: 'Khám phá', active: true },
              { to: '/my-trips', icon: 'ph ph-heart', label: 'Đã lưu' },
              { to: '#', icon: 'ph ph-bell', label: 'Cập nhật' },
              { to: '/planner', icon: 'ph ph-calendar-plus', label: 'Lịch trình' },
              { to: '#', icon: 'ph ph-plus-square', label: 'Tạo nên' },
            ].map((item) => {
              const itemContent = (
                <div className="flex items-center py-0.5 text-black transition-colors group/item relative">
                  <div className="w-9 h-9 flex items-center justify-center shrink-0">
                    <i className={`${item.icon} text-[23px] text-black ${item.active ? '' : 'group-hover/item:opacity-75'} transition-opacity`}></i>
                  </div>
                  
                  <span
                    className={`text-[14px] tracking-tight text-black font-medium transition-all duration-300 overflow-hidden whitespace-nowrap ${
                      isSidebarCollapsed ? 'max-w-0 opacity-0 ml-0' : 'max-w-[120px] opacity-100 ml-2.5'
                    }`}
                  >
                    {item.label}
                  </span>

                  {isSidebarCollapsed && (
                    <div className="absolute left-[calc(100%+8px)] top-1/2 -translate-y-1/2 bg-black text-white text-[12px] font-medium px-2.5 py-1 rounded-md shadow-lg whitespace-nowrap pointer-events-none opacity-0 group-hover/item:opacity-100 transition-all duration-200 -translate-x-1 group-hover/item:translate-x-0 z-50">
                      {item.label}
                    </div>
                  )}
                </div>
              );

              return item.to === '#' ? (
                <a key={item.label} href="#">{itemContent}</a>
              ) : (
                <Link key={item.label} to={item.to}>{itemContent}</Link>
              );
            })}
          </nav>

          {/* Button Trò chuyện mới */}
          <div className="pt-6">
            {isSidebarCollapsed ? (
              <div className="w-9 h-9 flex items-center justify-center shrink-0">
                <button
                  className="w-9 h-9 bg-[#F0F2F5] hover:bg-[#E4E6EB] text-gray-950 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-xs active:scale-95 group/newchat relative"
                  title="Trò chuyện mới"
                >
                  <i className="ph ph-chat-circle-dots text-[19px] text-black"></i>
                  <div className="absolute left-[calc(100%+8px)] top-1/2 -translate-y-1/2 bg-black text-white text-[11.5px] font-medium px-2.5 py-1 rounded-md shadow-md whitespace-nowrap pointer-events-none opacity-0 group-hover/newchat:opacity-100 transition-opacity z-50">
                    Trò chuyện mới
                  </div>
                </button>
              </div>
            ) : (
              <button className="w-full py-2.5 px-4 bg-[#F0F2F5] hover:bg-[#E4E6EB] text-gray-950 font-semibold text-[13.5px] rounded-full transition-all text-center border-0 shadow-none cursor-pointer whitespace-nowrap overflow-hidden">
                Trò chuyện mới
              </button>
            )}
          </div>
        </div>

        {/* Sidebar Bottom / User Profile */}
        <div className="flex flex-col gap-4 relative">
          {showProfileMenu && (
            <div className={`absolute bottom-20 bg-white rounded-2xl shadow-xl border border-gray-100 p-2 z-50 animate-fadeIn ${
              isSidebarCollapsed ? "left-2 w-48" : "left-0 right-0"
            }`}>
              {currentUser ? (
                <div className="flex flex-col">
                  <div className="px-2.5 py-2 border-b border-gray-100">
                    <p className="text-xs font-bold text-gray-900 truncate">{currentUser.full_name}</p>
                    <p className="text-[11px] text-gray-400 truncate">{currentUser.email}</p>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="w-full text-left px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-xl transition mt-1 cursor-pointer"
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

          <div
            onClick={() => setShowProfileMenu((prev) => !prev)}
            className="flex items-center cursor-pointer hover:opacity-80 transition-all duration-300 py-0.5 justify-start px-0"
            title={currentUser?.full_name || 'Du khách'}
          >
            <div className="w-9 h-9 flex items-center justify-center shrink-0">
              <div className="w-[34px] h-[34px] rounded-full overflow-hidden bg-zinc-900 text-white flex items-center justify-center font-bold text-[12px] shrink-0 shadow-xs">
                {currentUser?.full_name ? currentUser.full_name.charAt(0).toUpperCase() : 'G'}
              </div>
            </div>
            <div
              className={`flex flex-col justify-center h-[34px] text-left min-w-0 transition-all duration-300 overflow-hidden ${
                isSidebarCollapsed ? "max-w-0 opacity-0 ml-0" : "max-w-[120px] opacity-100 ml-2.5"
              }`}
            >
              <span className="text-[14px] font-normal text-black leading-[17px] truncate whitespace-nowrap">
                {currentUser?.full_name || 'Du khách'}
              </span>
              <span className="text-[12px] text-gray-500 font-normal leading-[15px] truncate whitespace-nowrap">
                {currentUser?.email ? `@${currentUser.email.split('@')[0]}` : '@greentrip-user'}
              </span>
            </div>
          </div>
        </div>
      </aside>

      {/* 2. MIDDLE LIST (EXPLORE) */}
      <main
        className={`${
          isMapExpanded 
            ? "hidden" 
            : isSidebarCollapsed 
              ? "w-[715px] shrink-0" 
              : "w-[605px] shrink-0"
        } h-full relative bg-white flex flex-col select-none transition-[width] duration-300 ease-in-out`}
        data-purpose="content-list-stream"
      >
        <div className="w-full h-full overflow-y-auto auto-hide-scrollbar scroll-smooth">
          {/* Top Bar: Title & Search */}
          <header className="w-full bg-white px-6 pt-8 pb-3 space-y-3.5 sticky top-0 z-10 backdrop-blur-md bg-white/95">
            {/* Location Title Dropdown */}
            <div className="relative">
              <div 
                onClick={() => setShowCityDropdown(!showCityDropdown)}
                className="inline-flex items-center gap-1.5 cursor-pointer select-none group"
              >
                <h1 className="text-[22px] font-bold tracking-tight text-gray-950 group-hover:text-black">
                  {currentCityLabel}
                </h1>
                <i className="ph ph-caret-down font-bold text-gray-950 text-sm"></i>
              </div>

              {showCityDropdown && (
                <div className="absolute top-10 left-0 bg-white shadow-xl border border-gray-100 rounded-2xl py-2 w-48 z-50 animate-fadeIn">
                  <button
                    onClick={() => { setCityFilter('all'); setShowCityDropdown(false); }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center justify-between cursor-pointer ${cityFilter === 'all' ? 'font-bold text-black' : 'text-gray-700'}`}
                  >
                    <span>Tất cả địa điểm</span>
                    {cityFilter === 'all' && <i className="ph ph-check font-bold"></i>}
                  </button>
                  <button
                    onClick={() => { setCityFilter('Đà Nẵng'); setShowCityDropdown(false); }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center justify-between cursor-pointer ${cityFilter === 'Đà Nẵng' ? 'font-bold text-black' : 'text-gray-700'}`}
                  >
                    <span>Đà Nẵng</span>
                    {cityFilter === 'Đà Nẵng' && <i className="ph ph-check font-bold"></i>}
                  </button>
                  <button
                    onClick={() => { setCityFilter('Huế'); setShowCityDropdown(false); }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center justify-between cursor-pointer ${cityFilter === 'Huế' ? 'font-bold text-black' : 'text-gray-700'}`}
                  >
                    <span>Huế</span>
                    {cityFilter === 'Huế' && <i className="ph ph-check font-bold"></i>}
                  </button>
                </div>
              )}
            </div>

            {/* Search Box & Filter Button */}
            <div className="flex items-center gap-3">
              <div className="flex-1 relative flex items-center">
                <i className="ph ph-magnifying-glass text-gray-400 absolute left-4 text-xl"></i>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-12 pr-4 h-[50px] bg-[#F3F4F6] text-[15px] placeholder-gray-400 text-gray-900 rounded-full border-none focus:outline-none focus:ring-1 focus:ring-gray-300 transition"
                  placeholder="Tìm kiếm địa điểm, di tích, ẩm thực..."
                  type="text"
                />
                {search && (
                  <button 
                    onClick={() => setSearch('')}
                    className="absolute right-4 text-gray-400 hover:text-gray-600 cursor-pointer"
                  >
                    <i className="ph ph-x-circle text-lg"></i>
                  </button>
                )}
              </div>

              <button 
                onClick={() => setIsFilterPopoverOpen(true)}
                className={`flex items-center gap-2 px-5 h-[50px] rounded-full border transition text-[15px] font-medium cursor-pointer ${
                  activeFilterCount > 0 || isFilterPopoverOpen
                    ? 'bg-black text-white border-black shadow-sm'
                    : 'border-gray-200 hover:bg-gray-50 text-gray-800'
                }`}
              >
                <i className="ph ph-faders text-lg"></i>
                <span>Bộ lọc</span>
                {activeFilterCount > 0 && (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-[11px] font-bold text-white ml-1">
                    {activeFilterCount}
                  </span>
                )}
              </button>
            </div>

            {/* Category Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[14px] font-medium no-scrollbar">
              {TABS.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => handleTabChange(tab.id)}
                    className={`whitespace-nowrap transition-all cursor-pointer ${
                      isActive
                        ? 'px-3.5 py-1.5 bg-black text-white rounded-full font-medium shadow-xs text-[13px]'
                        : 'px-3 py-1.5 text-gray-700 hover:text-black hover:bg-gray-100/60 rounded-full font-normal text-[13.5px]'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </header>

          {/* Cards Grid */}
          <div className="px-6 py-2">
            <div className="mb-4 mt-2 flex items-center justify-between">
              <h2 className="text-[17px] font-bold text-gray-950 tracking-tight">
                Địa điểm ({filteredPois.length})
              </h2>
              {activeFilterCount > 0 && (
                <button
                  onClick={() => setFilterValues(DEFAULT_FILTER_VALUES)}
                  className="text-xs text-emerald-700 hover:underline font-medium cursor-pointer"
                >
                  Xóa bộ lọc
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-7 pb-16">
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
                      isAdded={addedTrips.has(poi.id)}
                      onClick={() => handleSelectPoi(poi.id)}
                      onHover={setHoveredPoiId}
                      onToggleFavorite={toggleFavorite}
                      onToggleAddTrip={toggleAddTrip}
                    />
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </main>

      {/* 3. RIGHT SECTION: Map hoặc Detail Section */}
      <section 
        className={`flex-1 h-full relative bg-white ${selectedPoi ? 'overflow-visible z-30' : 'overflow-hidden'}`} 
        data-purpose="right-panel-container"
      >
        <div className={`w-full h-full p-6 ${selectedPoi ? "invisible pointer-events-none" : "visible"}`}>
          <div className="w-full h-full rounded-[22px] overflow-hidden border border-gray-200/80 shadow-[0_2px_12px_rgba(0,0,0,0.06)] relative [transform:translateZ(0)]">
            <PoiMap
              pois={filteredPois}
              selectedPoiId={selectedPoiId}
              hoveredPoiId={hoveredPoiId}
              onSelectPoi={handleSelectPoi}
              onHoverPoi={setHoveredPoiId}
              isExpanded={isMapExpanded}
              onToggleExpand={() => {
                setIsMapExpanded((prev) => !prev);
                setTimeout(() => {
                  window.dispatchEvent(new Event("resize"));
                }, 200);
              }}
              favorites={favorites}
              onToggleFavorite={toggleFavorite}
              addedTrips={addedTrips}
              onToggleAddTrip={toggleAddTrip}
            />
          </div>
        </div>

        {/* Right Detail Panel trượt sang bên phải chuẩn Mindtrip */}
        {selectedPoi && (
          <div className="absolute inset-y-0 right-0 left-0 bg-white z-40 shadow-[-12px_0_36px_rgba(0,0,0,0.08)] rounded-l-[24px] overflow-hidden animate-slideInRight">
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

      {/* 4. Explore Filter Modal (Đa Tab chuẩn Quiet Luxury & Mindtrip) */}
      <ExploreFilterModal
        isOpen={isFilterPopoverOpen}
        onClose={() => setIsFilterPopoverOpen(false)}
        activeTab={activeTab}
        values={filterValues}
        onApply={(newValues) => setFilterValues(newValues)}
        onClearAll={() => setFilterValues(DEFAULT_FILTER_VALUES)}
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
      <p className="text-xs text-gray-400 mt-1">Thử tìm kiếm với từ khóa khác hoặc bỏ bớt bộ lọc</p>
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
