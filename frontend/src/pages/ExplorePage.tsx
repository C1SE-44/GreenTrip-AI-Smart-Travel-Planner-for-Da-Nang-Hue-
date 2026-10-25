import { Leaf } from 'lucide-react';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import type { PoiCategory, PoiCity, Poi } from '@/data/pois';
import { pois, categoryLabels, normalizePois, getGalleryImages, type PaginatedPoisResponse } from '@/data/pois';
import PoiMap from '@/components/poi/PoiMap';
import PoiDetailSection from '@/components/poi/PoiDetailSection';
import { PoiCardSkeleton } from '@/components/ui/Skeleton';
import Logo from '@/components/ui/Logo';
import { fetchJson } from '@/lib/api';
import { getMe, type UserProfile } from '@/services/auth';

type CityFilter = 'all' | PoiCity;
type CategoryFilter = 'all' | PoiCategory;

const TABS: { id: 'all' | PoiCategory; label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'di-tich', label: 'Di tích' },
  { id: 'canh-quan', label: 'Cảnh quan' },
  { id: 'chua', label: 'Chùa' },
  { id: 'quan-an', label: 'Quán ăn' },
];

const CATEGORY_META: Record<PoiCategory, { icon: string; label: string }> = {
  'quan-an': { icon: 'ph-fork-knife', label: 'Quán ăn' },
  'di-tich': { icon: 'ph-landmark', label: 'Di tích' },
  'chua': { icon: 'ph-hands-praying', label: 'Chùa & Tâm linh' },
  'canh-quan': { icon: 'ph-mountains', label: 'Cảnh quan' },
};


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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allPois, setAllPois] = useState<Poi[]>([]);
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [isMapExpanded, setIsMapExpanded] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [thumbTop, setThumbTop] = useState(0);
  const [thumbHeight, setThumbHeight] = useState(0);

  const mainScrollRef = useRef<HTMLDivElement>(null);
  const dragStartYRef = useRef(0);
  const dragStartScrollTopRef = useRef(0);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const updateThumb = useCallback(() => {
    const el = mainScrollRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollHeight <= clientHeight + 4) {
      setThumbHeight(0);
      return;
    }
    const trackPadding = 12;
    const availableTrack = clientHeight - trackPadding * 2;
    const calculatedHeight = Math.max(36, (clientHeight / scrollHeight) * availableTrack);
    const maxScroll = scrollHeight - clientHeight;
    const maxThumbTop = availableTrack - calculatedHeight;
    const calculatedTop = trackPadding + (scrollTop / maxScroll) * maxThumbTop;

    setThumbHeight(calculatedHeight);
    setThumbTop(calculatedTop);
  }, []);

  const handleScroll = useCallback(() => {
    updateThumb();
    setIsScrolling(true);
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      setIsScrolling(false);
    }, 700);
  }, [updateThumb]);

  const handleThumbMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    dragStartYRef.current = e.clientY;
    dragStartScrollTopRef.current = mainScrollRef.current?.scrollTop || 0;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const el = mainScrollRef.current;
      if (!el) return;
      const { scrollHeight, clientHeight } = el;
      const trackPadding = 12;
      const availableTrack = clientHeight - trackPadding * 2;
      const calculatedHeight = Math.max(36, (clientHeight / scrollHeight) * availableTrack);
      const maxScroll = scrollHeight - clientHeight;
      const maxThumbTop = availableTrack - calculatedHeight;

      const deltaY = moveEvent.clientY - dragStartYRef.current;
      const scrollRatio = maxScroll / maxThumbTop;
      el.scrollTop = dragStartScrollTopRef.current + deltaY * scrollRatio;
    };

    const onMouseUp = () => {
      setIsDragging(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  useEffect(() => {
    updateThumb();
    const el = mainScrollRef.current;
    if (!el) return;

    const observer = new ResizeObserver(() => {
      updateThumb();
    });
    observer.observe(el);

    window.addEventListener('resize', updateThumb);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateThumb);
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    };
  }, [updateThumb, allPois]);

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
        const response = await fetchJson<PaginatedPoisResponse>('/pois?limit=100&page=1');
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
  }, []);

  const handleTabChange = (tabId: 'all' | PoiCategory) => {
    setActiveTab(tabId);
    setCategoryFilter(tabId);
  };

  const filteredPois = useMemo(() => {
    return allPois.filter((poi) => {
      const matchCity = cityFilter === 'all' || poi.city === cityFilter;
      const matchCat = categoryFilter === 'all' || poi.category === categoryFilter;
      const matchSearch =
        !search ||
        poi.name.toLowerCase().includes(search.toLowerCase()) ||
        poi.description.toLowerCase().includes(search.toLowerCase());
      return matchCity && matchCat && matchSearch;
    });
  }, [allPois, search, cityFilter, categoryFilter]);

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
      {/* 1. LEFT SIDEBAR: Padding px-4 cố định, các icon giữ nguyên tọa độ 100%, không bị dịch chuyển */}
      <aside 
        className={`${
          isSidebarCollapsed ? "w-[68px]" : "w-[204px]"
        } px-4 shrink-0 h-full border-r border-gray-100/90 flex flex-col justify-between pt-2.5 pb-6 bg-white z-20 select-none transition-[width] duration-300 ease-in-out group/sidebar relative`} 
        data-purpose="sidebar"
      >
        <div className="flex flex-col">
          {/* Header Sidebar: Brand Logo + Hiệu ứng xoáy sang phải mượt mà khi hover vào logo */}
          <div className="flex items-center justify-between mb-[35px] relative h-10">
            <div className="relative flex items-center h-10">
              {/* Vị trí khung Logo luôn cố định 36x36px ở tọa độ không đổi */}
              <div className="relative w-9 h-9 flex items-center justify-center shrink-0 group/logo">
                {/* 1. Icon Lá: Khi rời chuột là hình lá bình thường; khi menu thu gọn và chạm vào thì xoáy sang phải (120deg) rồi mờ đi */}
                <div 
                  className={`flex items-center justify-center transition-all duration-300 ease-out transform ${
                    isSidebarCollapsed 
                      ? "group-hover/logo:rotate-[120deg] group-hover/logo:scale-0 group-hover/logo:opacity-0" 
                      : ""
                  }`}
                >
                  <Leaf size={24} strokeWidth={2.5} className="text-black" />
                </div>

                {/* 2. Nút tròn ( > ): Chỉ kích hoạt khi thu gọn, tự xoay từ góc -120deg ra 0deg độc lập */}
                {isSidebarCollapsed && (
                  <>
                    <button
                      onClick={toggleSidebar}
                      aria-label="Mở rộng menu"
                      className="absolute inset-0 w-9 h-9 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center text-gray-800 hover:text-black hover:bg-gray-50 transition-all duration-300 ease-out transform -rotate-[120deg] scale-0 opacity-0 group-hover/logo:rotate-0 group-hover/logo:scale-100 group-hover/logo:opacity-100 cursor-pointer active:scale-90 z-30"
                    >
                      <i className="ph ph-caret-right text-xs font-bold"></i>
                    </button>

                    {/* 3. Ô popup đen "Mở rộng" (tiếng Việt): Nằm ngoài nút xoay nên KHÔNG BỊ XOÁY THEO!
                        Khi nút xoay xong (delay-200), ô Mở rộng trôi nhẹ sang bên cạnh mượt mà */}
                    <div className="absolute left-[calc(100%+8px)] top-1/2 -translate-y-1/2 bg-black text-white text-[12px] font-medium px-2.5 py-1 rounded-md shadow-lg whitespace-nowrap pointer-events-none transition-all duration-200 delay-200 ease-out transform -translate-x-1.5 opacity-0 group-hover/logo:translate-x-0 group-hover/logo:opacity-100 z-50">
                      Mở rộng
                    </div>
                  </>
                )}
              </div>

              {/* Chữ greentrip: Chiều cao và đệm pb-1 pt-0.5 đảm bảo chữ 'g' và 'p' không bao giờ bị cắt mất phần dưới */}
              <span
                className={`font-body font-bold text-black tracking-tighter text-[24px] leading-tight pb-1 pt-0.5 transition-all duration-300 overflow-hidden whitespace-nowrap block ${
                  isSidebarCollapsed ? "max-w-0 opacity-0 ml-0" : "max-w-[130px] opacity-100 ml-1.5"
                }`}
              >
                greentrip
              </span>
            </div>

            {/* Nút thu gọn ( < ) khi menu đang mở rộng */}
            {!isSidebarCollapsed && (
              <button
                onClick={toggleSidebar}
                aria-label="Thu gọn menu"
                className="w-7 h-7 rounded-full bg-white border border-gray-200/90 shadow-xs flex items-center justify-center text-gray-700 hover:text-black hover:bg-gray-50 opacity-0 group-hover/sidebar:opacity-100 transition-all duration-200 cursor-pointer shrink-0 group/collapse relative ml-auto"
                title="Thu gọn menu"
              >
                <i className="ph ph-caret-left text-xs font-bold"></i>
                <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-black text-white text-[11px] font-semibold px-2 py-0.5 rounded-md shadow-md whitespace-nowrap pointer-events-none opacity-0 group-hover/collapse:opacity-100 transition-opacity z-50">
                  Thu gọn
                </div>
              </button>
            )}
          </div>

          {/* Navigation Links - Khung icon 36x36px cố định vĩnh viễn, không dịch chuyển một pixel nào */}
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
                  {/* Khung icon cố định 36x36px ở tọa độ không đổi */}
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

                  {/* Tooltip khi thu gọn menu (Icon-only mode) */}
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

          {/* Button Trò chuyện mới - Cố định tọa độ */}
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

        {/* Sidebar Bottom / User & Footer - Cố định tọa độ */}
        <div className="flex flex-col gap-4 relative">
          {/* Profile Dropdown Menu */}
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

          {/* Profile Button - Cố định tọa độ Avatar */}
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
            
            <div
              className={`flex items-center gap-[2.5px] shrink-0 ml-auto p-1 transition-all duration-300 overflow-hidden ${
                isSidebarCollapsed ? "max-w-0 opacity-0" : "max-w-[24px] opacity-100"
              }`}
              title="Tuỳ chọn"
            >
              <span className="w-[3px] h-[3px] rounded-full bg-black inline-block"></span>
              <span className="w-[3px] h-[3px] rounded-full bg-black inline-block"></span>
              <span className="w-[3px] h-[3px] rounded-full bg-black inline-block"></span>
            </div>
          </div>

          {/* Legal footer */}
          <div className="overflow-hidden transition-all duration-300">
            {!isSidebarCollapsed ? (
              <div className="px-0 text-[11.5px] text-gray-500/80 leading-relaxed font-normal mt-1 animate-fadeIn">
                <p className="space-x-1">
                  <span>Công ty</span><span>•</span><span>Liên hệ</span><span>•</span><span>Giúp đỡ</span>
                </p>
                <p className="space-x-1">
                  <span>Điều khoản</span><span>•</span><span>Sự riêng tư</span>
                </p>
                <p className="mt-1.5 text-gray-500/80 text-[11px]">© 2026 GreenTrip, Inc.</p>
              </div>
            ) : (
              <div className="w-9 h-9 flex items-center justify-center shrink-0">
                <div className="flex justify-center text-gray-400 hover:text-black transition cursor-pointer text-xs" title="© 2026 GreenTrip, Inc.">
                  <i className="ph ph-info text-[16px]"></i>
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* 2. MIDDLE LIST (EXPLORE): Khi thu gọn sidebar, phần giữa to rộng hơn (715px) có hiệu ứng chuyển động mượt mà, map chỉ nhích nhẹ */}
      <main
        className={`${
          isMapExpanded 
            ? "hidden" 
            : isSidebarCollapsed 
              ? "w-[715px] shrink-0" 
              : "w-[605px] shrink-0"
        } h-full relative bg-white flex flex-col select-none transition-[width] duration-300 ease-in-out`}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        data-purpose="content-list-stream"
      >
        {/* Scrollable Container (no native scrollbar) */}
        <div
          ref={mainScrollRef}
          onScroll={handleScroll}
          className="w-full h-full overflow-y-auto no-scrollbar scroll-smooth"
        >
        {/* Top Bar: Title & Search (di chuyển theo toàn bộ luồng cuộn như landing page) */}
        <header className="w-full bg-white px-6 pt-10 pb-3 space-y-3.5">
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

          {/* Search Box & Filter (+25% height, scaled text & icons) */}
          <div className="flex items-center gap-3">
            <div className="flex-1 relative flex items-center">
              <i className="ph ph-magnifying-glass text-gray-400 absolute left-4 text-xl"></i>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-12 pr-4 h-[50px] bg-[#F3F4F6] text-[15px] placeholder-gray-400 text-gray-900 rounded-full border-none focus:outline-none focus:ring-1 focus:ring-gray-300 transition"
                placeholder="Tìm kiếm địa điểm, di tích..."
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
              onClick={() => {
                setCategoryFilter((prev) => (prev === 'all' ? 'di-tich' : 'all'));
                setActiveTab((prev) => (prev === 'all' ? 'di-tich' : 'all'));
              }}
              className={`flex items-center gap-2 px-5 h-[50px] rounded-full border transition text-[15px] font-medium cursor-pointer ${categoryFilter !== 'all' ? 'bg-black text-white border-black' : 'border-gray-200 hover:bg-gray-50 text-gray-800'}`}
            >
              <i className="ph ph-faders text-lg"></i>
              <span>Bộ lọc</span>
            </button>
          </div>

          {/* Scrollable Category Tabs (+20% size and padding) */}
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

        {/* Cards Scrollable Area */}
        <div className="px-6 py-1">
          {/* Section Subheading matching Mindtrip Locations */}
          <div className="mb-5 mt-4">
            <h2 className="text-[17px] font-bold text-gray-950 tracking-tight">Địa điểm</h2>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-7 pb-12">
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

        {/* Floating Auto-Hiding Scrollbar (Mindtrip Style) */}
        {thumbHeight > 0 && (
          <div
            className={`absolute top-0 right-1 bottom-0 w-1.5 pointer-events-none z-30 transition-opacity duration-250 ease-out ${
              isHovered || isScrolling || isDragging ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <div
              onMouseDown={handleThumbMouseDown}
              className="w-full rounded-full bg-black/25 hover:bg-black/45 active:bg-black/60 cursor-grab active:cursor-grabbing pointer-events-auto shadow-xs"
              style={{
                height: `${thumbHeight}px`,
                transform: `translateY(${thumbTop}px)`,
                transition: isDragging ? 'none' : 'transform 0.05s linear',
              }}
            />
          </div>
        )}
      </main>

      {/* 3. RIGHT SECTION: Map giữ khoảng cách p-6 bo góc 22px. Khi xem chi tiết: Card trượt từ bên phải qua, bo cong 24px mép trái chuẩn Mindtrip, đổ bóng mờ khuếch tán sang trái */}
      <section 
        className={`flex-1 h-full relative bg-white ${selectedPoi ? 'overflow-visible z-30' : 'overflow-hidden'}`} 
        data-purpose="right-panel-container"
      >
        {/* Interactive Map (giữ nguyên khoảng cách p-6 và card bo góc 22px như cũ, ẩn khi mở chi tiết để ko lộ màu) */}
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

        {/* Right Detail Section: Card trượt từ bên phải qua, bo cong 24px ở mép trái chuẩn Mindtrip, bóng mờ khuếch tán sang trái */}
        {selectedPoi && (
          <div 
            className="absolute inset-y-0 right-0 w-full z-40 bg-white rounded-l-[24px] border-l border-t border-b border-gray-200/90 shadow-[-16px_0_40px_rgba(0,0,0,0.08),-4px_0_12px_rgba(0,0,0,0.04)] flex flex-col overflow-hidden animate-slideInRight"
          >
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
  isAdded = false,
  onClick,
  onHover,
  onToggleFavorite,
  onToggleAddTrip,
}: {
  poi: Poi;
  index?: number;
  active?: boolean;
  favorite?: boolean;
  isAdded?: boolean;
  onClick: () => void;
  onHover: (id: string | null) => void;
  onToggleFavorite: (id: string) => void;
  onToggleAddTrip?: (id: string) => void;
}) {
  const [imgIdx, setImgIdx] = useState(0);
  const [isCardHovered, setIsCardHovered] = useState(false);

  const gallery = useMemo(() => getGalleryImages(poi), [poi]);

  return (
    <article
      onClick={onClick}
      onMouseEnter={() => {
        setIsCardHovered(true);
        onHover(poi.id);
      }}
      onMouseLeave={() => {
        setIsCardHovered(false);
        onHover(null);
      }}
      className="flex flex-col group cursor-pointer"
    >
      {/* 1. Card Image Box: aspect-[1.05/1], rounded-[20px], isolate để các nút con không bao giờ thoát ra ngoài đè lên header */}
      <div className={`relative w-full aspect-[1.05/1] rounded-[20px] overflow-hidden bg-gray-100 shadow-sm transition-all duration-200 isolate ${active ? 'ring-2 ring-black' : ''}`}>
        <img
          src={gallery[imgIdx] || poi.image}
          alt={poi.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />

        {/* Nút tròn chuyển ảnh ‹ (chỉ hiện khi hover và từ ảnh thứ 2 trở đi) */}
        {isCardHovered && imgIdx > 0 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setImgIdx((prev) => Math.max(0, prev - 1));
            }}
            className="absolute left-3.5 top-[45%] -translate-y-1/2 w-10 h-10 rounded-full bg-white text-zinc-900 shadow-md flex items-center justify-center hover:scale-105 active:scale-95 transition-all z-10 cursor-pointer"
            title="Ảnh trước"
          >
            <i className="ph ph-caret-left text-lg font-bold"></i>
          </button>
        )}

        {/* Nút tròn chuyển ảnh › (chỉ hiện khi hover và chưa đến ảnh cuối) */}
        {isCardHovered && imgIdx < gallery.length - 1 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setImgIdx((prev) => Math.min(gallery.length - 1, prev + 1));
            }}
            className="absolute right-3.5 top-[45%] -translate-y-1/2 w-10 h-10 rounded-full bg-white text-zinc-900 shadow-md flex items-center justify-center hover:scale-105 active:scale-95 transition-all z-10 cursor-pointer"
            title="Ảnh kế tiếp"
          >
            <i className="ph ph-caret-right text-lg font-bold"></i>
          </button>
        )}

        {/* Nút tim và "+" ở góc trên (giữ nguyên khi hover, chuyển trạng thái khi đã lưu / thêm) */}
        <div className="absolute top-3 right-3 flex items-center gap-1.5 z-10">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(poi.id);
            }}
            className={`w-8 h-8 rounded-full backdrop-blur-md flex items-center justify-center transition-all cursor-pointer shadow-sm active:scale-95 ${
              favorite ? 'bg-white text-[#b45309]' : 'bg-black/35 hover:bg-black/55 text-white'
            }`}
            title="Lưu yêu thích"
          >
            <i className={`ph ${favorite ? 'ph-fill ph-heart text-[18px] text-[#b45309]' : 'ph-heart text-[18px]'}`}></i>
          </button>
          <button 
            onClick={(e) => {
              e.stopPropagation();
              onToggleAddTrip?.(poi.id);
            }}
            className={`w-8 h-8 rounded-full backdrop-blur-md flex items-center justify-center transition-all cursor-pointer shadow-sm active:scale-95 ${
              isAdded ? 'bg-emerald-600 text-white' : 'bg-black/35 hover:bg-black/55 text-white'
            }`}
            title="Thêm vào chuyến đi"
          >
            <i className={`ph ${isAdded ? 'ph-check text-[18px] font-bold' : 'ph-plus text-[18px]'}`}></i>
          </button>
        </div>

        {/* Chấm phân trang bên dưới đổi theo ảnh đang xem (chấm đang chọn trắng đậm, các chấm còn lại mờ) */}
        <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex items-center gap-1.5 pointer-events-none z-10">
          {gallery.slice(0, 5).map((_: string, i: number) => (
            <span
              key={i}
              className={`w-1.5 h-1.5 rounded-full transition-all ${
                i === imgIdx ? 'bg-white scale-125 shadow-xs' : 'bg-white/40'
              }`}
            />
          ))}
        </div>

        {/* Icon ⓘ ở góc phải đáy */}
        <div className="absolute bottom-2.5 right-2.5 pointer-events-none z-10">
          <i className="ph ph-info text-white/80 hover:text-white text-[15px] drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]"></i>
        </div>
      </div>

      {/* 2. Card Details: Tên, loại hình, địa chỉ (bỏ ★ và người đánh giá) */}
      <div className="mt-2.5 space-y-1">
        {/* Dòng 1: Tên địa điểm */}
        <div className="flex items-center justify-between gap-1.5 min-w-0">
          <h3 className="font-bold text-[15px] text-gray-950 tracking-tight truncate leading-tight group-hover:text-black">
            {poi.name}
          </h3>
        </div>

        {/* Dòng 2: Icon loại hình + Tên loại hình */}
        <div className="flex items-center gap-1.5 text-[13px] text-gray-500 font-normal">
          <i className={`ph ${CATEGORY_META[poi.category]?.icon || 'ph-map-pin'} text-gray-400 text-[14px] shrink-0`}></i>
          <span className="truncate">{CATEGORY_META[poi.category]?.label || 'Điểm tham quan'}</span>
        </div>

        {/* Dòng 3: Dòng địa điểm */}
        <div className="text-[12.5px] text-gray-400 font-normal truncate">
          <span>{poi.address || `${poi.city === 'Đà Nẵng' ? 'Hải Châu, Đà Nẵng' : `${poi.city}, Việt Nam`}`}</span>
        </div>
      </div>
    </article>
  );
}
