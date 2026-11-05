// TripOverviewView - Updated with Ideas & 2-Stage PB09 Recommendations
import React, { useState, useMemo, useEffect } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  Sparkles, 
  Lightbulb, 
  Calendar as CalendarIcon, 
  MapPin, 
  Info, 
  Share2, 
  MoreHorizontal, 
  UserPlus, 
  Plus, 
  Minus,
  Send, 
  Car, 
  Mic, 
  X,
  Compass,
  Check,
  Search,
  SlidersHorizontal,
  Trash2,
  Star,
  ChevronDown,
} from 'lucide-react';
import type { UserTrip } from '@/pages/ExplorePage';
import { 
  pois as allPois, 
  normalizePois, 
  normalizeCategory, 
  normalizeCity, 
  getDeterministicImage,
  type Poi 
} from '@/data/pois';
import { fetchJson } from '@/lib/api';
import PoiMap from '@/components/poi/PoiMap';
import PoiDetailSection from '@/components/poi/PoiDetailSection';
import ExplanationModal from '@/components/poi/ExplanationModal';

export interface TripOverviewViewProps {
  trip: UserTrip;
  onBack: () => void;
  onOpenItineraryDetails: () => void;
  onUpdateTrip?: (updatedTrip: UserTrip) => void;
}

// 5 lựa chọn ngân sách chuẩn Mindtrip theo ảnh người dùng gửi
const BUDGET_OPTIONS = [
  { id: 'any', label: 'Bất kỳ ngân sách nào', pillLabel: 'Ngân sách' },
  { id: 'budget', label: '$  Với ngân sách hạn chế', pillLabel: '$ Ngân sách hạn chế' },
  { id: 'standard', label: '$$  Giá cả hợp lý', pillLabel: '$$ Giá cả hợp lý' },
  { id: 'upgrade', label: '$$$  Nâng cấp', pillLabel: '$$$ Nâng cấp' },
  { id: 'luxury', label: '$$$$  Sang trọng', pillLabel: '$$$$ Sang trọng' },
];

export default function TripOverviewView({
  trip,
  onBack,
  onOpenItineraryDetails,
  onUpdateTrip,
}: TripOverviewViewProps) {
  // ─── STATE CỦA 4 POPUP ĐIỀU CHỈNH THÔNG SỐ CHUYẾN ĐI ───
  // 1. Popup Ở đâu
  const [showWhereModal, setShowWhereModal] = useState(false);
  const [whereTarget, setWhereTarget] = useState<string>(trip.destination || 'Đà Nẵng');
  const [byCar, setByCar] = useState(false);

  // 2. Popup Khi
  const [showWhenModal, setShowWhenModal] = useState(false);
  const [whenTab, setWhenTab] = useState<'dates' | 'flex'>('dates');
  const [calendarBaseMonth, setCalendarBaseMonth] = useState<Date>(new Date(2026, 10, 1));
  const [rangeStart, setRangeStart] = useState<Date | null>(new Date(2026, 10, 2));
  const [rangeEnd, setRangeEnd] = useState<Date | null>(new Date(2026, 10, 5));
  const [flexibleDays, setFlexibleDays] = useState(trip.daysCount || 4);
  const [selectedMonth, setSelectedMonth] = useState('Tháng 11');

  // 3. Popup Ai (Du khách)
  const [showWhoModal, setShowWhoModal] = useState(false);
  const [adults, setAdults] = useState(trip.peopleCount || 2);
  const [children, setChildren] = useState(0);
  const [infants, setInfants] = useState(0);
  const [pets, setPets] = useState(0);

  // 4. Popup Ngân sách
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [selectedBudgetTier, setSelectedBudgetTier] = useState<string>(trip.budgetTier || 'any');

  // Đồng bộ khi trip prop thay đổi
  useEffect(() => {
    setWhereTarget(trip.destination);
    setFlexibleDays(trip.daysCount || 4);
    setSelectedBudgetTier(trip.budgetTier || 'any');
    setAdults(trip.peopleCount || 2);
  }, [trip]);

  // Slide pagination cho khối AI Insight (1 trong 2)
  const [currentSlide, setCurrentSlide] = useState(1);
  const totalSlides = 2;

  // Active quick action popover (Thời tiết, Đóng gói, Sân bay, Miễn nhiệm)
  const [activeQuickTip, setActiveQuickTip] = useState<string | null>(null);

  // Chat message state
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<Array<{ sender: 'user' | 'ai'; text: string }>>([
    {
      sender: 'ai',
      text: `Chào bạn! Tôi đã chuẩn bị xong kế hoạch hành trình ${trip.destination} ${trip.daysCount} ngày. Bạn cần hỏi thêm về ăn uống, đi lại hay điều chỉnh hoạt động nào không?`,
    },
  ]);

  // Tab con kích hoạt khi bấm vào Ý tưởng hoặc Lịch
  const [activeRightDrawer, setActiveRightDrawer] = useState<'ideas' | 'calendar' | null>(null);

  // ─── DANH SÁCH Ý TƯỞNG (IDEAS / WISHLIST) CỦA CHUYẾN ĐI ───
  const [tripIdeas, setTripIdeas] = useState<string[]>(() => trip.ideas || []);

  // ─── STATE CHO GỢI Ý ĐỊA ĐIỂM (TOP 10 TỐI ƯU THEO BACKEND PB09) ───
  const [recommendedPois, setRecommendedPois] = useState<Poi[]>([]);
  const [isLoadingRecommendations, setIsLoadingRecommendations] = useState(false);
  const [recommendationTitle, setRecommendationTitle] = useState('Gợi ý cho bạn');
  const [recommendationSubtitle, setRecommendationSubtitle] = useState('Theo gu và hành trình của bạn.');
  const [explanationPoi, setExplanationPoi] = useState<{ id: string; name: string; snippet?: string } | null>(null);

  // State điều khiển hiển thị panel Ý tưởng ở cột phải (thay thế 4 ô + bản đồ)
  const [showIdeasView, setShowIdeasView] = useState(false);

  // State điều khiển Modal "Thêm vào chuyến đi" (Add to trip)
  const [showAddIdeasModal, setShowAddIdeasModal] = useState(false);
  const [modalTab, setModalTab] = useState<'search' | 'saved' | 'custom'>('search');
  const [modalCity, setModalCity] = useState<'all' | 'Đà Nẵng' | 'Huế'>('all');
  const [modalSearch, setModalSearch] = useState('');
  const [modalCategory, setModalCategory] = useState<'for-you' | 'experiences' | 'restaurants' | 'spiritual' | 'all'>('for-you');
  const [customIdeaInput, setCustomIdeaInput] = useState('');

  // State bản đồ & chọn POI chi tiết
  const [selectedMapPoiId, setSelectedMapPoiId] = useState<string | null>(null);
  const [hoveredMapPoiId, setHoveredMapPoiId] = useState<string | null>(null);

  useEffect(() => {
    if (trip.ideas) {
      setTripIdeas(trip.ideas);
    }
  }, [trip.ideas]);

  const handleToggleIdea = (poiId: string) => {
    setTripIdeas((prev) => {
      const next = prev.includes(poiId) ? prev.filter((id) => id !== poiId) : [...prev, poiId];
      if (onUpdateTrip) {
        onUpdateTrip({ ...trip, ideas: next });
      }
      return next;
    });
  };

  // Helper kiểm tra điểm đến linh hoạt
  const isDaNang = (c?: string) => /da\s*nang|đà\s*nẵng/i.test(c || '');
  const isHue = (c?: string) => /hue|huế/i.test(c || '');

  // Lọc POIs liên quan đến chuyến đi để hiển thị trên bản đồ (Ưu tiên danh sách quán/địa điểm gợi ý)
  const relevantPois = useMemo(() => {
    const map = new Map<string, Poi>();

    // 1. Luôn đưa toàn bộ các quán/địa điểm gợi ý vào bản đồ để khớp 100% với danh sách thẻ
    recommendedPois.forEach((p) => {
      if (p.lat && p.lng) map.set(p.id, p);
    });

    // 2. Thêm các POIs đã được lưu trong ý tưởng (tripIdeas)
    tripIdeas.forEach((id) => {
      if (!map.has(id)) {
        const found = allPois.find((p) => p.id === id);
        if (found && found.lat && found.lng) map.set(found.id, found);
      }
    });

    // 3. Nếu số lượng quán gợi ý chưa đủ, bổ sung thêm POIs thuộc thành phố tương ứng
    if (map.size < 6) {
      const dest = trip.destination || '';
      const hasDn = isDaNang(dest);
      const hasHue = isHue(dest);

      allPois.forEach((p) => {
        if (!map.has(p.id) && p.lat && p.lng) {
          if (hasDn && hasHue) {
            map.set(p.id, p);
          } else if (hasHue && isHue(p.city)) {
            map.set(p.id, p);
          } else if (hasDn && isDaNang(p.city)) {
            map.set(p.id, p);
          }
        }
      });
    }

    return Array.from(map.values());
  }, [recommendedPois, tripIdeas, trip.destination]);

  // POI đang được chọn để mở Card chi tiết lớn (PoiDetailSection) chuẩn trang Explore
  const selectedPoi = useMemo(() => {
    if (!selectedMapPoiId) return null;
    return (
      relevantPois.find((p) => p.id === selectedMapPoiId) ||
      recommendedPois.find((p) => p.id === selectedMapPoiId) ||
      allPois.find((p) => p.id === selectedMapPoiId) ||
      null
    );
  }, [relevantPois, recommendedPois, selectedMapPoiId]);

  // Gọi trực tiếp Backend API (/api/v1/recommendations/poi) khi Điểm đến, Ngân sách hoặc Ý tưởng thay đổi
  useEffect(() => {
    let isCancelled = false;

    async function fetchBackendRecommendations() {
      setIsLoadingRecommendations(true);
      try {
        const payload = {
          destination: trip.destination || 'Đà Nẵng & Huế',
          budget_tier: selectedBudgetTier,
          trip_days: trip.daysCount || 4,
          ideas: tripIdeas.map((id) => {
            const found = allPois.find((p) => p.id === id);
            return found ? found.name : id;
          }),
          top_k: 10,
        };

        const res = await // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fetchJson<{ status: string; total: number; data: any[] }>(
          '/api/v1/recommendations/poi',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          }
        );

        if (isCancelled) return;

        if (res && res.data && res.data.length > 0) {
          const mapped: Poi[] = res.data.map((item, idx) => {
            const foundLocal = allPois.find(
              (p) => p.id === item.poi_id || p.name.toLowerCase() === item.name.toLowerCase()
            );
            const category = normalizeCategory(item.category_name);
            const city = normalizeCity(item.city);
            return {
              id: item.poi_id || `rec-${idx}`,
              name: item.name,
              category,
              city,
              lat: item.lat || 16.0,
              lng: item.lng || 108.0,
              image: item.image || foundLocal?.image || getDeterministicImage(item.name, item.poi_id || idx, category, city),
              description: item.explanation_snippet || foundLocal?.description || 'Địa điểm hấp dẫn cho chuyến đi của bạn.',
              rating: item.satisfaction_score || foundLocal?.rating || 4.6,
              visitDuration: '1–2 giờ',
              ecoScore: Math.round((item.green_score || 0.85) <= 1 ? (item.green_score || 0.85) * 100 : item.green_score),
              estimatedCost: item.estimated_cost || foundLocal?.estimatedCost || 50000,
              matchScore: typeof item.match_score === 'number' ? Math.round(item.match_score) : undefined,
            };
          });

          setRecommendedPois(mapped.slice(0, 10));
          setRecommendationTitle('Gợi ý cho bạn');
          setRecommendationSubtitle('Theo gu và hành trình của bạn.');
          setIsLoadingRecommendations(false);
          return;
        }
      } catch (err) {
        console.warn('Backend recommendation fetch error, using local fallback:', err);
      }

      if (isCancelled) return;

      // Fallback cục bộ nếu backend chưa kịp phản hồi
      const rawPois = allPois;
      const dest = trip.destination || '';
      const hasDn = isDaNang(dest);
      const hasHue = isHue(dest);

      let destinationPois = rawPois;
      if (hasDn && hasHue) destinationPois = rawPois;
      else if (hasHue) destinationPois = rawPois.filter((p) => isHue(p.city));
      else if (hasDn) destinationPois = rawPois.filter((p) => isDaNang(p.city));
      if (destinationPois.length === 0) destinationPois = rawPois;

      const ranked = [...destinationPois];
      if (selectedBudgetTier === 'budget') {
        ranked.sort((a, b) => (a.estimatedCost || 0) - (b.estimatedCost || 0));
      } else if (selectedBudgetTier === 'upgrade' || selectedBudgetTier === 'luxury') {
        ranked.sort((a, b) => (b.estimatedCost || 0) - (a.estimatedCost || 0));
      } else {
        ranked.sort((a, b) => (b.rating || 0) - (a.rating || 0));
      }

      setRecommendedPois(ranked.slice(0, 10));
      setRecommendationTitle(`Top 10 địa điểm gợi ý cho ${trip.destination}`);
      setRecommendationSubtitle(`Được tối ưu tự động dựa trên mức ngân sách & điểm đến của bạn.`);
      setIsLoadingRecommendations(false);
    }

    void fetchBackendRecommendations();

    return () => {
      isCancelled = true;
    };
  }, [trip.destination, selectedBudgetTier, tripIdeas]);

  const getRecommendationReason = (poi: Poi) => {
    let text = poi.description || 'Địa điểm hấp dẫn cho hành trình của bạn.';
    text = text.replace(/📍\s*/g, '');
    text = text.replace(/Cùng khu vực với ['"]?([^'",(]+)['"]?\s*\(trong bán kính ~?([0-9.]+)km\):?(?:\s*[^:]+:)?\s*/gi, 'Cách $1 ~$2km. ');
    text = text.replace(/Thuận tiện kết hợp cùng cụm di chuyển với ['"]?([^'",]+)['"]?:?(?:\s*[^:]+:)?\s*/gi, 'Gần $1. ');
    text = text.replace(/Cùng trung tâm thành phố, rất tiện ghé thăm sau ['"]?([^'",]+)['"]?:?(?:\s*[^:]+:)?\s*/gi, 'Tiện ghé sau $1. ');
    text = text.replace(/Ngay gần\s+([^–-]+)[–-][^.]+\.\s*/gi, 'Ngay gần $1. ');
    text = text.replace(/Cách\s+([^–-]+)[–-][^.]+\s+~([0-9.]+km)/gi, 'Cách $1 ~$2');
    text = text.replace(/Trải nghiệm nổi bật tại\s+[^:]+:\s*/gi, '');
    text = text.replace(/tại\s+Da\s*Nang\s*:\s*/gi, '');
    text = text.replace(/tại\s+Đà\s*Nẵng\s*:\s*/gi, '');
    text = text.replace(/tại\s+Huế\s*:\s*/gi, '');
    text = text.replace(/\(phân khúc[^)]*\):\s*/gi, '');
    text = text.replace(/\(phân khúc[^)]*\)/gi, '');
    text = text.replace(/\(\d+(\.\d+)?\s*[★⭐]?\)/gi, '');
    text = text.replace(/\s{2,}/g, ' ').trim();
    return text;
  };

  // ─── LỌC POIS CHO MODAL "THÊM VÀO CHUYẾN ĐI" (ADD TO TRIP MODAL) ───
  const modalFilteredPois = useMemo(() => {
    let list = allPois;

    // 1. Lọc theo Thành phố
    if (modalCity === 'Đà Nẵng') {
      list = list.filter((p) => isDaNang(p.city));
    } else if (modalCity === 'Huế') {
      list = list.filter((p) => isHue(p.city));
    }

    // 2. Lọc theo Danh mục (Tabs & Pills)
    if (modalCategory === 'for-you') {
      list = [...list].sort((a, b) => b.rating - a.rating);
    } else if (modalCategory === 'experiences') {
      list = list.filter((p) => p.category === 'di-tich' || p.category === 'canh-quan');
    } else if (modalCategory === 'restaurants') {
      list = list.filter((p) => p.category === 'quan-an');
    } else if (modalCategory === 'spiritual') {
      list = list.filter((p) => p.category === 'chua');
    }

    // 3. Lọc theo từ khóa tìm kiếm
    if (modalSearch.trim()) {
      const q = modalSearch.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.city.toLowerCase().includes(q)
      );
    }

    // 4. Tab "Đã lưu" (Saved)
    if (modalTab === 'saved') {
      list = list.filter((p) => tripIdeas.includes(p.id));
    }

    return list;
  }, [modalCity, modalCategory, modalSearch, modalTab, tripIdeas]);

  // Tiêu đề lớn hiển thị (1 dòng rút gọn chuẩn Mindtrip)
  const displayTitle = `Chuyến đi ${trip.destination || 'Đà Nẵng & Huế'}`;

  // Rút gọn ngày bắt đầu cho viên thuốc metadata (ví dụ: "Từ 2 thg 11")
  const formatDateBrief = (dateStr?: string) => {
    if (!dateStr) return 'Từ 2 thg 11';
    const match = dateStr.match(/^(\d+)\s*-\s*\d+\s+thg\s+(\d+)/i);
    if (match) return `Từ ${match[1]} thg ${match[2]}`;
    if (dateStr.toLowerCase().startsWith('từ')) return dateStr;
    const parts = dateStr.split('-');
    if (parts.length > 0 && parts[0].trim()) return `Từ ${parts[0].trim()}`;
    return dateStr;
  };

  // Rút gọn nhãn Ngân sách (ví dụ: $$$$, không nền đen)
  const getBudgetBrief = (tier?: string) => {
    if (tier === 'budget') return '$';
    if (tier === 'standard') return '$$';
    if (tier === 'upgrade') return '$$$';
    if (tier === 'luxury') return '$$$$';
    return 'Ngân sách';
  };
  const budgetBriefText = getBudgetBrief(selectedBudgetTier);

  // ─── CÁC HÀM CẬP NHẬT THÔNG SỐ KHI BẤM NÚT "CẬP NHẬT" ───
  // 1. Cập nhật Điểm đến
  const handleSaveWhere = () => {
    const norm = whereTarget.trim() || 'Đà Nẵng';
    const updated: UserTrip = {
      ...trip,
      destination: norm,
      title: `Chuyến đi ${norm}, ${trip.startDate || 'tháng 11 năm 2026'}`,
    };
    onUpdateTrip?.(updated);
    setShowWhereModal(false);
  };

  // 2. Cập nhật Thời gian
  const handleSaveWhen = () => {
    let newStartDate = trip.startDate || 'Tháng 11, 2026';
    let newDays = flexibleDays;

    if (whenTab === 'dates' && rangeStart && rangeEnd) {
      const sDay = rangeStart.getDate();
      const eDay = rangeEnd.getDate();
      const m = rangeStart.getMonth() + 1;
      const diffMs = Math.abs(rangeEnd.getTime() - rangeStart.getTime());
      newDays = Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1;
      newStartDate = `Ngày ${sDay} – ${eDay} tháng ${m}`;
    } else {
      newStartDate = `${flexibleDays} ngày • ${selectedMonth}`;
    }

    const updated: UserTrip = {
      ...trip,
      startDate: newStartDate,
      daysCount: newDays,
      title: `Chuyến đi ${trip.destination}, ${newStartDate}`,
    };
    onUpdateTrip?.(updated);
    setShowWhenModal(false);
  };

  // 3. Cập nhật Du khách
  const handleSaveWho = () => {
    const totalGuests = Math.max(1, adults + children + infants + pets);
    const updated: UserTrip = {
      ...trip,
      peopleCount: totalGuests,
    };
    onUpdateTrip?.(updated);
    setShowWhoModal(false);
  };

  // 4. Cập nhật Ngân sách
  const handleSaveBudget = () => {
    const updated: UserTrip = {
      ...trip,
      budgetTier: selectedBudgetTier,
    };
    onUpdateTrip?.(updated);
    setShowBudgetModal(false);
  };

  // ─── HELPER CHO LỊCH 2 THÁNG LIỀN KỀ BÊN TAB "NGÀY THÁNG" ───
  const month1Year = calendarBaseMonth.getFullYear();
  const month1Index = calendarBaseMonth.getMonth();
  const nextMonthDate = new Date(month1Year, month1Index + 1, 1);
  const month2Year = nextMonthDate.getFullYear();
  const month2Index = nextMonthDate.getMonth();

  const getMonthMeta = (year: number, month: number) => {
    const firstDay = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    return { firstDay, totalDays };
  };

  const meta1 = getMonthMeta(month1Year, month1Index);
  const meta2 = getMonthMeta(month2Year, month2Index);

  const isSameDay = (d1: Date | null, d2: Date | null) => {
    if (!d1 || !d2) return false;
    return (
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate()
    );
  };

  const isDayInRange = (date: Date) => {
    if (!rangeStart || !rangeEnd) return false;
    const t = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const s = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate()).getTime();
    const e = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), rangeEnd.getDate()).getTime();
    return t > s && t < e;
  };

  const handleSelectDate = (year: number, month: number, day: number) => {
    const clicked = new Date(year, month, day);
    if (!rangeStart || (rangeStart && rangeEnd)) {
      setRangeStart(clicked);
      setRangeEnd(null);
    } else if (rangeStart && !rangeEnd) {
      if (clicked.getTime() < rangeStart.getTime()) {
        setRangeStart(clicked);
        setRangeEnd(null);
      } else {
        setRangeEnd(clicked);
        const diffMs = clicked.getTime() - rangeStart.getTime();
        const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1;
        setFlexibleDays(Math.min(14, Math.max(1, diffDays)));
      }
    }
  };

  const handlePrevMonth = () => {
    setCalendarBaseMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCalendarBaseMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const handleClearDates = () => {
    setRangeStart(null);
    setRangeEnd(null);
  };

  // 3 tháng giới hạn chuẩn
  const threeMonthsList = [
    { id: 'm1', label: 'Tháng 11' },
    { id: 'm2', label: 'Tháng 12' },
    { id: 'm3', label: 'Tháng 1' },
  ];

  // Xử lý gửi tin nhắn trò chuyện cho chuyến đi này
  const handleSendChatMessage = () => {
    if (!chatInput.trim()) return;
    const userText = chatInput.trim();
    setChatMessages((prev) => [...prev, { sender: 'user', text: userText }]);
    setChatInput('');

    setTimeout(() => {
      let aiReply = `Tôi đã ghi nhận câu hỏi về "${userText}". Dựa trên dữ liệu chuyến đi ${trip.destination}, các điểm đến như Cầu Rồng, Đại Nội và các quán ẩm thực xanh đều đang sẵn sàng cho ngày tham quan của bạn!`;
      if (userText.toLowerCase().includes('ăn') || userText.toLowerCase().includes('uống')) {
        aiReply = `Tại ${trip.destination}, bạn nhất định nên thử mì Quảng, bún bò, bánh bèo chén và ghé các quán ăn địa phương đạt tiêu chuẩn xanh nhé!`;
      } else if (userText.toLowerCase().includes('xe') || userText.toLowerCase().includes('đi lại')) {
        aiReply = `Hệ thống đề xuất bạn sử dụng taxi điện hoặc xe đạp công cộng để giảm phát thải carbon cho chuyến đi ${trip.destination}.`;
      }
      setChatMessages((prev) => [...prev, { sender: 'ai', text: aiReply }]);
    }, 700);
  };

  return (
    <div className="flex-1 h-full bg-white overflow-y-auto auto-hide-scrollbar select-none animate-fadeIn flex flex-col">
      <div className="max-w-[1360px] w-full mx-auto px-6 sm:px-10 pt-5 sm:pt-6 pb-12 flex flex-col">
        {/* ─── TOP ROW: NÚT BACK VÀ CÁC THAO TÁC (MỜI, SHARE, MORE) CHUẨN MINDTRIP ─── */}
        <div className="flex items-center justify-between mb-5 sm:mb-6 shrink-0">
        <button
          onClick={onBack}
          className="w-9 h-9 rounded-full border border-gray-200/90 hover:border-black flex items-center justify-center text-gray-700 hover:text-black hover:bg-gray-50 transition cursor-pointer shadow-2xs"
          title="Quay lại danh sách chuyến đi"
        >
          <ChevronLeft size={18} />
        </button>

        <div className="flex items-center gap-2.5">
          {/* Nút Mời (Invite) */}
          <button 
            type="button"
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-gray-200 hover:border-gray-300 text-[13px] font-semibold text-gray-800 bg-white hover:bg-gray-50 transition cursor-pointer shadow-2xs"
          >
            <div className="w-5 h-5 rounded-full bg-neutral-900 text-white flex items-center justify-center text-[10px] font-bold">
              <UserPlus size={12} />
            </div>
            <span>Mời</span>
          </button>

          {/* Nút Share */}
          <button 
            type="button"
            className="w-9 h-9 rounded-full border border-gray-200 hover:border-gray-300 flex items-center justify-center text-gray-700 hover:text-black hover:bg-gray-50 transition cursor-pointer shadow-2xs"
            title="Chia sẻ chuyến đi"
          >
            <Share2 size={16} />
          </button>

          {/* Nút More Options */}
          <button 
            type="button"
            className="w-9 h-9 rounded-full border border-gray-200 hover:border-gray-300 flex items-center justify-center text-gray-700 hover:text-black hover:bg-gray-50 transition cursor-pointer shadow-2xs"
            title="Thao tác khác"
          >
            <MoreHorizontal size={18} />
          </button>
        </div>
        </div>

        {/* ─── NỘI DUNG CHÍNH: 2 CỘT CHUẨN MINDTRIP (CHIA ĐỀU 6-6, TĂNG MAP ~15-20%) ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* ────── CỘT TRÁI (LEFT COLUMN - 6 COLS, THU GỌN BỀ NGANG CARD) ────── */}
        <div className="lg:col-span-6 flex flex-col space-y-5">
          {/* 1. Tiêu đề lớn & Khung Metadata (Gộp 1 khung viền mảnh chuẩn Mindtrip) */}
          <div>
            <h1 className="text-[26px] sm:text-[30px] font-extrabold text-gray-950 tracking-tight leading-tight mb-3">
              {displayTitle}
            </h1>

            {/* Khung thông tin tóm tắt: Gộp 1 khung viền mảnh, ngăn vạch dọc chuẩn Mindtrip */}
            <div className="inline-flex items-center rounded-full border border-gray-200/90 divide-x divide-gray-200 bg-white shadow-2xs h-[38px] overflow-hidden">
              {/* 1. Điểm đến */}
              <button
                type="button"
                onClick={() => setShowWhereModal(true)}
                className="px-3.5 h-full flex items-center hover:bg-gray-50 text-gray-800 text-[13px] font-medium transition cursor-pointer"
                title="Bấm để thay đổi điểm đến"
              >
                {trip.destination}
              </button>

              {/* 2. Ngày bắt đầu (Ví dụ: Từ 2 thg 11) */}
              <button
                type="button"
                onClick={() => setShowWhenModal(true)}
                className="px-3.5 h-full flex items-center hover:bg-gray-50 text-gray-800 text-[13px] font-medium transition cursor-pointer"
                title="Bấm để thay đổi ngày và thời gian"
              >
                {formatDateBrief(trip.startDate)}
              </button>

              {/* 3. Số khách (Ví dụ: 2 du khách) */}
              <button
                type="button"
                onClick={() => setShowWhoModal(true)}
                className="px-3.5 h-full flex items-center hover:bg-gray-50 text-gray-800 text-[13px] font-medium transition cursor-pointer"
                title="Bấm để thay đổi số lượng người đi"
              >
                {trip.peopleCount ? `${trip.peopleCount} du khách` : '2 du khách'}
              </button>

              {/* 4. Ngân sách (Ví dụ: $$$$, KHÔNG nền đen) */}
              <button
                type="button"
                onClick={() => setShowBudgetModal(true)}
                className="px-3.5 h-full flex items-center hover:bg-gray-50 text-gray-500 hover:text-gray-900 text-[13px] font-medium transition cursor-pointer"
                title="Bấm để thay đổi phạm vi ngân sách"
              >
                {budgetBriefText}
              </button>
            </div>
          </div>

          {/* 2. Khối Gợi ý địa điểm (Loại bỏ logo và subtitle thừa, tiết kiệm chiều cao) */}
          <div>
            {/* Header: Tiêu đề gọn gàng + Phân trang trên cùng 1 hàng */}
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[17px] font-bold text-gray-950 tracking-tight">
                Gợi ý cho bạn
              </h3>

              <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500">
                <button
                  type="button"
                  onClick={() => setCurrentSlide((prev) => (prev > 1 ? prev - 1 : totalSlides))}
                  className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-gray-100 transition cursor-pointer text-gray-600"
                  title="Trang trước"
                >
                  <ChevronLeft size={15} />
                </button>
                <span>{currentSlide} / {totalSlides}</span>
                <button
                  type="button"
                  onClick={() => setCurrentSlide((prev) => (prev < totalSlides ? prev + 1 : 1))}
                  className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-gray-100 transition cursor-pointer text-gray-600"
                  title="Trang tiếp"
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>

            {/* ─── SLIDE 1: GỢI Ý ĐỊA ĐIỂM ─── */}
            {currentSlide === 1 ? (
              <div>
                {/* Vertical List of Recommended POIs (Card cao thoáng, thoải mái mắt người nhìn) */}
                <div className="space-y-3.5 max-h-[640px] overflow-y-auto pr-1.5 auto-hide-scrollbar">
                  {recommendedPois.map((poi) => {
                    const isAdded = tripIdeas.includes(poi.id);
                    const reason = getRecommendationReason(poi);
                    const isHovered = hoveredMapPoiId === poi.id;

                    return (
                      <div
                        key={poi.id}
                        onMouseEnter={() => setHoveredMapPoiId(poi.id)}
                        onMouseLeave={() => setHoveredMapPoiId(null)}
                        onClick={() => {
                          setSelectedMapPoiId(poi.id);
                          setHoveredMapPoiId(null);
                        }}
                        className={`p-3.5 rounded-[22px] border transition-all flex flex-col sm:flex-row gap-4 items-start sm:items-stretch group cursor-pointer ${
                          isHovered
                            ? 'border-black bg-zinc-50/70 shadow-sm ring-1 ring-black/10'
                            : 'border-gray-200/90 bg-white hover:border-neutral-400 hover:shadow-2xs'
                        }`}
                      >
                        {/* Thumbnail ảnh tăng 20% (~172px), tự động ôm khít chiều cao card, sát mép viền tinh tế */}
                        <div className="relative w-full sm:w-[172px] min-h-[168px] sm:self-stretch rounded-[16px] overflow-hidden bg-gray-100 shrink-0">
                          <img
                            src={poi.image}
                            alt={poi.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            onError={(e) => {
                              e.currentTarget.src = 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=800&auto=format&fit=crop&q=80';
                            }}
                          />
                          {tripIdeas.length > 0 && typeof poi.matchScore === 'number' && (
                            <span className="absolute top-2 left-2 bg-black/80 backdrop-blur-md text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-xs">
                              {poi.matchScore}% Phù hợp
                            </span>
                          )}
                        </div>

                        {/* Thông tin POI: Tên, Đánh giá, Trải nghiệm & Nút lưu rộng rãi, thoải mái */}
                        <div className="flex-1 flex flex-col justify-between min-w-0 py-1">
                          <div>
                            {/* Hàng 1: Tên địa điểm rõ ràng, thoáng mắt */}
                            <h4 className="font-bold text-[16px] sm:text-[16.5px] text-gray-950 truncate leading-snug group-hover:text-black mb-1.5" title={poi.name}>
                              {poi.name}
                            </h4>

                            {/* Hàng 2: Đánh giá sao & Danh mục, Thành phố */}
                            <div className="flex items-center gap-1.5 text-[12.5px] text-gray-500 mb-2.5">
                              {typeof poi.rating === 'number' && poi.rating > 0 && (
                                <>
                                  <span className="flex items-center text-amber-500 font-bold">
                                    <Star size={12} className="fill-amber-500 mr-0.5" />
                                    {poi.rating}
                                  </span>
                                  <span>•</span>
                                </>
                              )}
                              <span>
                                {poi.category === 'quan-an' ? 'Ẩm thực' : poi.category === 'di-tich' ? 'Di tích' : poi.category === 'canh-quan' ? 'Cảnh quan' : 'Tâm linh'} • {poi.city}
                              </span>
                            </div>

                            {/* Hàng 3: Điểm nhấn trải nghiệm (Thoáng hơn, dễ đọc) */}
                            <p className="text-[13px] text-gray-600 line-clamp-2 leading-relaxed">
                              {reason}
                            </p>
                          </div>

                          {/* Hàng 4: Nút Lưu góc dưới bên phải, kích thước chuẩn dễ bấm */}
                          <div className="flex items-center justify-end mt-3 pt-1">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleIdea(poi.id);
                              }}
                              className={`h-8 px-4 rounded-full text-[12.5px] font-semibold flex items-center gap-1.5 transition active:scale-95 cursor-pointer shadow-2xs ${
                                isAdded
                                  ? 'bg-zinc-100 text-zinc-900 hover:bg-zinc-200'
                                  : 'bg-black text-white hover:bg-neutral-800'
                              }`}
                              title={isAdded ? 'Đã lưu vào ý tưởng' : 'Lưu vào ý tưởng chuyến đi'}
                            >
                              {isAdded ? (
                                <>
                                  <Check size={13} strokeWidth={2.5} className="text-emerald-700" />
                                  <span>Đã lưu</span>
                                </>
                              ) : (
                                <>
                                  <Plus size={13} strokeWidth={2.5} />
                                  <span>Lưu vào ý tưởng</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* ─── SLIDE 2: TRỢ LÝ AI GREENTRIP (HỎI ĐÁP SAU NÀY) ─── */
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 text-[11px] font-bold">
                    Trợ lý hành trình AI
                  </span>
                  <span className="text-xs text-gray-400">• Tương tác hỏi đáp</span>
                </div>

                <p className="text-[20px] sm:text-[22px] font-bold text-gray-950 leading-snug tracking-tight mb-4">
                  {`Chuyến bay đến ${trip.destination} dự kiến diễn ra vào thứ Hai, và các chi tiết ban đầu vẫn đang được công bố. Bạn có thể hỏi trợ lý AI về thời tiết, hành lý cần chuẩn bị hoặc mẹo du lịch xanh tại đây.`}
                </p>

                {/* Các nút bấm thao tác nhanh (Pills) */}
                <div className="flex items-center gap-2.5 flex-wrap">
                  {[
                    { 
                      id: 'weather', 
                      label: 'Dự báo thời tiết',
                      tip: `Thời tiết tại ${trip.destination} dự kiến dao động từ 24°C - 28°C, có gió mát nhẹ, rất thích hợp cho các hoạt động tham quan ngoài trời.`
                    },
                    { 
                      id: 'packing', 
                      label: 'Hỗ trợ đóng gói',
                      tip: 'Gợi ý hành lý: Trang phục thoáng mát, áo khoác mỏng chống nắng, mũ nón, kem chống nắng, giày thể thao đi bộ và bình nước cá nhân.'
                    },
                    { 
                      id: 'airport', 
                      label: 'Đến sân bay',
                      tip: trip.destination === 'Huế' 
                        ? 'Sân bay quốc tế Phú Bài cách trung tâm Huế khoảng 15km. Bạn có thể đón xe buýt trung chuyển hoặc taxi điện Xanh SM.'
                        : 'Sân bay quốc tế Đà Nẵng chỉ cách trung tâm thành phố 3km, di chuyển vào trung tâm chỉ mất khoảng 10-15 phút.'
                    },
                    { 
                      id: 'explore', 
                      label: 'Miễn nhiệm',
                      tip: `Tất cả các thông tin và đề xuất cho chuyến đi ${trip.destination} đã được AI đồng bộ và bạn có toàn quyền chỉnh sửa bất cứ lúc nào.`
                    },
                  ].map((pill) => {
                    const isActive = activeQuickTip === pill.id;
                    return (
                      <button
                        key={pill.id}
                        type="button"
                        onClick={() => setActiveQuickTip(isActive ? null : pill.id)}
                        className={`px-4 py-2 rounded-full text-[13px] font-medium transition cursor-pointer ${
                          isActive 
                            ? 'bg-black text-white shadow-xs' 
                            : 'bg-gray-100 hover:bg-gray-200 text-gray-800'
                        }`}
                      >
                        {pill.label}
                      </button>
                    );
                  })}
                </div>

                {/* Gợi ý câu hỏi nhanh cho trợ lý AI */}
                <div className="pt-2">
                  <p className="text-xs font-semibold text-gray-500 mb-2">Gợi ý câu hỏi nhanh:</p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      `Món ăn đặc sản nhất định phải thử ở ${trip.destination}?`,
                      `Cách di chuyển xanh tiết kiệm nhất tại ${trip.destination}?`,
                      `Thời tiết này nên mặc trang phục gì chụp ảnh đẹp?`,
                    ].map((q, qIdx) => (
                      <button
                        key={qIdx}
                        type="button"
                        onClick={() => setChatInput(q)}
                        className="text-left text-xs bg-gray-50 hover:bg-gray-100 border border-gray-200/80 rounded-full px-3.5 py-1.5 text-gray-700 transition cursor-pointer"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Hộp thông tin popover khi bấm vào các nút thao tác nhanh */}
                {activeQuickTip && (
                  <div className="mt-3 p-3.5 rounded-2xl bg-gray-50 border border-gray-200 text-[13px] text-gray-800 leading-relaxed flex items-start justify-between animate-fadeIn">
                    <div className="flex items-start gap-2">
                      <Info size={16} className="text-emerald-700 shrink-0 mt-0.5" />
                      <span>
                        {activeQuickTip === 'weather' && `Thời tiết tại ${trip.destination}: 24°C - 28°C, gió mát, thích hợp du ngoạn ngoài trời.`}
                        {activeQuickTip === 'packing' && 'Gợi ý hành lý: Trang phục nhẹ nhàng, giày đi bộ, kem chống nắng, sạc dự phòng, bình nước cá nhân.'}
                        {activeQuickTip === 'airport' && `Di chuyển từ sân bay đến trung tâm ${trip.destination}: Ưu tiên sử dụng xe buýt điện hoặc taxi điện Xanh SM.`}
                        {activeQuickTip === 'explore' && 'Kế hoạch đã được tối ưu bảo đảm ngân sách và thời gian di chuyển hợp lý.'}
                      </span>
                    </div>
                    <button 
                      onClick={() => setActiveQuickTip(null)}
                      className="text-gray-400 hover:text-black cursor-pointer ml-2"
                    >
                      <X size={15} />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 3. Khung Trò chuyện chuyến đi (Chat Box ở đáy cột trái) */}
          <div className="pt-4">
            <div className="rounded-[24px] border border-gray-200/90 p-4 shadow-sm bg-white hover:border-gray-300 transition-all flex flex-col justify-between min-h-[110px]">
              {/* Input text */}
              <input
                type="text"
                placeholder="Bắt đầu một cuộc trò chuyện mới cho chuyến đi này"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSendChatMessage();
                }}
                className="w-full text-[14px] text-gray-900 placeholder:text-gray-400 focus:outline-none bg-transparent pt-1"
              />

              {/* Hàng nút dưới cùng của ô chat: (+) bên trái, (xe, mic, gửi) bên phải */}
              <div className="flex items-center justify-between pt-3 border-t border-gray-100/70 mt-3">
                <button
                  type="button"
                  className="w-8 h-8 rounded-full flex items-center justify-center text-gray-500 hover:text-black hover:bg-gray-100 transition cursor-pointer"
                  title="Thêm tệp hoặc địa điểm"
                >
                  <Plus size={18} />
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="w-8 h-8 rounded-full flex items-center justify-center text-gray-500 hover:text-black hover:bg-gray-100 transition cursor-pointer"
                    title="Phương tiện di chuyển xanh"
                  >
                    <Car size={17} />
                  </button>

                  <button
                    type="button"
                    className="w-8 h-8 rounded-full flex items-center justify-center text-gray-500 hover:text-black hover:bg-gray-100 transition cursor-pointer"
                    title="Ghi chú giọng nói"
                  >
                    <Mic size={17} />
                  </button>

                  <button
                    type="button"
                    onClick={handleSendChatMessage}
                    className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center hover:bg-neutral-800 transition active:scale-95 cursor-pointer shadow-xs"
                    title="Gửi"
                  >
                    <Send size={14} className="ml-0.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Lịch sử tin nhắn trao đổi nhanh */}
            {chatMessages.length > 1 && (
              <div className="mt-3 space-y-2 max-h-48 overflow-y-auto pr-1">
                {chatMessages.slice(-3).map((msg, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-2xl text-[13px] leading-relaxed ${
                      msg.sender === 'user'
                        ? 'bg-neutral-900 text-white ml-auto max-w-[80%]'
                        : 'bg-gray-50 text-gray-800 mr-auto max-w-[90%] border border-gray-100'
                    }`}
                  >
                    {msg.text}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ────── CỘT PHẢI (RIGHT COLUMN - 6 COLS, MỞ RỘNG BẢN ĐỒ) ────── */}
        <div className="lg:col-span-6 flex flex-col space-y-4">
          {selectedPoi ? (
            /* ─── GIAO DIỆN CHI TIẾT ĐỊA ĐIỂM (POI DETAIL SECTION CHUẨN TRANG EXPLORE) ─── */
            <div className="bg-white rounded-3xl border border-gray-200/90 flex flex-col shadow-sm overflow-hidden h-[640px] animate-fadeIn">
              <PoiDetailSection
                poi={selectedPoi}
                isFavorite={tripIdeas.includes(selectedPoi.id)}
                onClose={() => setSelectedMapPoiId(null)}
                onToggleFavorite={handleToggleIdea}
                onViewOnMap={() => setSelectedMapPoiId(null)}
              />
            </div>
          ) : showIdeasView ? (
            /* ─── GIAO DIỆN Ý TƯỞNG (IDEAS VIEW CHUẨN MINDTRIP THEO ẢNH) ─── */
            <div className="bg-white rounded-3xl border border-gray-200/90 p-6 flex flex-col shadow-xs min-h-[540px] animate-fadeIn">
              {/* Top Bar: Nút Đóng, Quay lại và Nút Thêm ý tưởng */}
              <div className="flex items-center justify-between pb-4 border-b border-gray-100 mb-5">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowIdeasView(false)}
                    className="w-8 h-8 rounded-full border border-gray-200 hover:border-black flex items-center justify-center text-gray-700 hover:text-black hover:bg-gray-50 transition cursor-pointer"
                    title="Đóng bảng ý tưởng"
                  >
                    <X size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowIdeasView(false)}
                    className="w-8 h-8 rounded-full border border-gray-200 hover:border-black flex items-center justify-center text-gray-700 hover:text-black hover:bg-gray-50 transition cursor-pointer"
                    title="Quay lại"
                  >
                    <ChevronLeft size={16} />
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddIdeasModal(true)}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-black text-white hover:bg-neutral-800 text-[12.5px] font-semibold transition cursor-pointer shadow-2xs active:scale-95"
                  >
                    <Plus size={13} />
                    <span>+ Thêm ý tưởng</span>
                  </button>
                </div>
              </div>

              {/* Header Title */}
              <div className="mb-4">
                <h2 className="text-[26px] font-extrabold text-gray-950 tracking-tight leading-tight">
                  Ý tưởng
                </h2>
                <p className="text-xs text-gray-500 mt-1">
                  {tripIdeas.length > 0 
                    ? `${tripIdeas.length} địa điểm bạn dự kiến ghé thăm`
                    : 'Thêm địa điểm bạn muốn đến. Hãy xem đây là danh sách "có thể ghé thăm" của bạn.'}
                </p>
              </div>

              {/* Body: Empty State vs Has Ideas */}
              {tripIdeas.length === 0 ? (
                /* Empty State với đồ họa polaroid stack chuẩn Mindtrip */
                <div className="flex-1 flex flex-col items-center justify-center text-center py-10 px-4">
                  <div className="relative w-52 h-40 mb-6 flex items-center justify-center">
                    {/* Card trái: Biển / Phao */}
                    <div className="absolute w-26 h-30 bg-white p-1.5 rounded-2xl shadow-md border border-gray-200 transform -rotate-12 -translate-x-12 translate-y-2">
                      <img
                        src="https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=300&q=80"
                        alt="Biển"
                        className="w-full h-22 object-cover rounded-xl"
                      />
                    </div>
                    {/* Card phải: Cầu Rồng / Núi */}
                    <div className="absolute w-26 h-30 bg-white p-1.5 rounded-2xl shadow-md border border-gray-200 transform rotate-12 translate-x-12 translate-y-1">
                      <img
                        src="https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?auto=format&fit=crop&w=300&q=80"
                        alt="Cầu Rồng"
                        className="w-full h-22 object-cover rounded-xl"
                      />
                    </div>
                    {/* Card giữa: Đại Nội */}
                    <div className="relative z-10 w-28 h-32 bg-white p-1.5 rounded-2xl shadow-lg border border-gray-200 transform -rotate-2">
                      <img
                        src="https://images.unsplash.com/photo-1528181304800-259b08848526?auto=format&fit=crop&w=300&q=80"
                        alt="Đại Nội"
                        className="w-full h-24 object-cover rounded-xl"
                      />
                    </div>
                  </div>

                  <h3 className="text-[17px] font-bold text-gray-950 mb-1.5">
                    Thêm địa điểm bạn muốn đến.
                  </h3>
                  <p className="text-[13px] text-gray-500 max-w-xs leading-relaxed mb-6">
                    Có ý tưởng gì không? Thêm vào đây. Hãy xem đây là danh sách "có thể ghé thăm" của bạn.
                  </p>

                  <button
                    type="button"
                    onClick={() => setShowAddIdeasModal(true)}
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-black text-white hover:bg-neutral-800 text-[13.5px] font-bold transition-all shadow-md active:scale-95 cursor-pointer"
                  >
                    <Plus size={16} />
                    <span>+ Thêm ý tưởng</span>
                  </button>
                </div>
              ) : (
                /* Danh sách các POI đã thêm vào Ý tưởng */
                <div className="flex-1 space-y-3 overflow-y-auto pr-1 max-h-[460px]">
                  {allPois
                    .filter((p) => tripIdeas.includes(p.id))
                    .map((poi) => (
                      <div
                        key={poi.id}
                        className="p-3 bg-gray-50/80 hover:bg-gray-100/80 rounded-2xl border border-gray-100 flex items-center justify-between gap-3 transition-colors group"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <img
                            src={poi.image}
                            alt={poi.name}
                            className="w-13 h-13 rounded-xl object-cover shrink-0"
                          />
                          <div className="min-w-0">
                            <h4 className="text-[13.5px] font-bold text-gray-950 truncate leading-snug">
                              {poi.name}
                            </h4>
                            <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                              <span>
                                {poi.category === 'quan-an' ? 'Ẩm thực' : poi.category === 'di-tich' ? 'Di tích' : poi.category === 'canh-quan' ? 'Cảnh quan' : 'Tâm linh'} • {poi.city}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => setExplanationPoi({ id: poi.id, name: poi.name, snippet: getRecommendationReason(poi) })}
                            className="w-7 h-7 rounded-full flex items-center justify-center text-emerald-700 hover:bg-emerald-50 transition cursor-pointer"
                            title="Vì sao nơi này?"
                          >
                            <Sparkles size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleIdea(poi.id)}
                            className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 transition cursor-pointer"
                            title="Xóa khỏi ý tưởng"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          ) : (
            /* ─── GIAO DIỆN MẶC ĐỊNH: 4 THẺ + BẢN ĐỒ ─── */
            <>
              {/* Lưới 4 thẻ điều hướng: Ý tưởng, Lịch trình, Ưu tiên chuyến đi, Lịch */}
              <div className="grid grid-cols-2 gap-3">
                {/* 1. Ý tưởng (Bấm vào sẽ mở Ideas View ở cột phải) */}
                <button
                  type="button"
                  onClick={() => setShowIdeasView(true)}
                  className="p-4 rounded-2xl border border-gray-200/90 bg-white hover:border-black transition-all cursor-pointer flex items-center justify-between text-left shadow-2xs group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-gray-100 group-hover:bg-black group-hover:text-white transition-colors flex items-center justify-center text-gray-800">
                      <Lightbulb size={18} />
                    </div>
                    <span className="text-[14px] font-bold text-gray-900">Ý tưởng</span>
                  </div>
                  {tripIdeas.length > 0 && (
                    <span className="w-5 h-5 rounded-full bg-emerald-600 text-white text-[11px] font-bold flex items-center justify-center shadow-xs">
                      {tripIdeas.length}
                    </span>
                  )}
                </button>

                {/* 2. Lịch trình (Mở bảng chi tiết lịch trình ngày 1, 2, 3) */}
                <button
                  type="button"
                  onClick={onOpenItineraryDetails}
                  className="p-4 rounded-2xl border border-gray-200/90 bg-white hover:border-black transition-all cursor-pointer flex items-center gap-3 text-left shadow-2xs group"
                >
                  <div className="w-9 h-9 rounded-full bg-gray-100 group-hover:bg-black group-hover:text-white transition-colors flex items-center justify-center text-gray-800">
                    <Compass size={18} />
                  </div>
                  <span className="text-[14px] font-bold text-gray-900">Lịch trình</span>
                </button>

                {/* 3. Ưu tiên chuyến đi: Mở trực tiếp Modal Ngân sách & Phạm vi chi tiêu (Không hiện BE cũ) */}
                <button
                  type="button"
                  onClick={() => setShowBudgetModal(true)}
                  className="p-4 rounded-2xl border border-gray-200/90 bg-white hover:border-black transition-all cursor-pointer flex items-center gap-3 text-left shadow-2xs group"
                >
                  <div className="w-9 h-9 rounded-full bg-gray-100 group-hover:bg-black group-hover:text-white transition-colors flex items-center justify-center text-gray-800">
                    <Info size={18} />
                  </div>
                  <span className="text-[14px] font-bold text-gray-900">Ưu tiên chuyến đi</span>
                </button>

                {/* 4. Lịch */}
                <button
                  type="button"
                  onClick={() => setActiveRightDrawer('calendar')}
                  className="p-4 rounded-2xl border border-gray-200/90 bg-white hover:border-black transition-all cursor-pointer flex items-center gap-3 text-left shadow-2xs group"
                >
                  <div className="w-9 h-9 rounded-full bg-gray-100 group-hover:bg-black group-hover:text-white transition-colors flex items-center justify-center text-gray-800">
                    <CalendarIcon size={18} />
                  </div>
                  <span className="text-[14px] font-bold text-gray-900">Lịch</span>
                </button>
              </div>

              {/* Bản đồ tương tác trực quan (Interactive Map) */}
              <div className="w-full h-[520px] rounded-3xl overflow-hidden border border-gray-200 shadow-sm relative [transform:translateZ(0)]">
                <PoiMap
                  pois={relevantPois}
                  selectedPoiId={selectedMapPoiId}
                  hoveredPoiId={hoveredMapPoiId}
                  onSelectPoi={setSelectedMapPoiId}
                  onHoverPoi={setHoveredMapPoiId}
                  favorites={new Set(tripIdeas)}
                  onToggleFavorite={handleToggleIdea}
                />
              </div>
            </>
          )}
        </div>

      </div>
      </div>

      {/* ─── MODAL 1: Ở ĐÂU (KHI BẤM VÀO PILL ĐIỂM ĐẾN) ─── */}
      {showWhereModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fadeIn select-none"
          onClick={() => setShowWhereModal(false)}
        >
          <div 
            className="w-full max-w-[480px] bg-white rounded-3xl p-6 sm:p-7 shadow-2xl mx-4 flex flex-col border border-gray-100 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-6">
              <button 
                onClick={() => setShowWhereModal(false)} 
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 cursor-pointer"
              >
                <X size={18} />
              </button>
              <div className="text-[16px] font-bold text-black">Ở đâu</div>
              <div className="w-8"></div>
            </div>

            {/* Input + Ô tô toggle chuẩn OnboardingModal */}
            <div className="relative mb-5">
              <input
                type="text"
                placeholder="Vị trí"
                value={whereTarget}
                onChange={(e) => setWhereTarget(e.target.value)}
                className="w-full rounded-full border border-gray-200 px-5 py-3 pr-36 text-[14px] font-light text-gray-900 focus:border-black focus:outline-none focus:ring-1 focus:ring-black transition-all"
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                <span className="text-[12px] font-bold text-black">Đi bằng ô tô?</span>
                <button 
                  type="button"
                  onClick={() => setByCar(!byCar)} 
                  className={`w-9 h-5 rounded-full flex items-center p-0.5 transition-colors cursor-pointer ${byCar ? 'bg-black' : 'bg-gray-200'}`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white shadow-xs transition-transform ${byCar ? 'translate-x-4' : 'translate-x-0'}`}></div>
                </button>
              </div>
            </div>

            {/* 3 Nút chọn vị trí: Huế, Đà Nẵng, Cả 2 */}
            <div className="flex gap-2 mb-6 flex-wrap">
              <button 
                type="button"
                onClick={() => setWhereTarget('Huế')} 
                className={`px-4 py-2 rounded-full border text-[13px] font-semibold transition-all cursor-pointer ${
                  whereTarget === 'Huế' ? 'bg-black text-white border-black shadow-xs' : 'border-gray-200 text-gray-800 hover:border-black'
                }`}
              >
                Huế
              </button>
              <button 
                type="button"
                onClick={() => setWhereTarget('Đà Nẵng')} 
                className={`px-4 py-2 rounded-full border text-[13px] font-semibold transition-all cursor-pointer ${
                  whereTarget === 'Đà Nẵng' ? 'bg-black text-white border-black shadow-xs' : 'border-gray-200 text-gray-800 hover:border-black'
                }`}
              >
                Đà Nẵng
              </button>
              <button 
                type="button"
                onClick={() => setWhereTarget('Đà Nẵng & Huế')} 
                className={`px-4 py-2 rounded-full border text-[13px] font-semibold transition-all cursor-pointer ${
                  whereTarget === 'Đà Nẵng & Huế' ? 'bg-black text-white border-black shadow-xs' : 'border-gray-200 text-gray-800 hover:border-black'
                }`}
              >
                Cả 2
              </button>
            </div>

            <div className="mt-auto flex justify-end">
              <button 
                type="button"
                onClick={handleSaveWhere} 
                className="w-full sm:w-32 font-bold text-[14px] py-3 rounded-full bg-black text-white hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                Cập nhật
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL 2: KHI (KHI BẤM VÀO PILL NGÀY THÁNG - THEO ẢNH 2 USER GỬI) ─── */}
      {showWhenModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fadeIn select-none"
          onClick={() => setShowWhenModal(false)}
        >
          <div 
            className="w-full max-w-[620px] bg-white rounded-3xl p-6 sm:p-7 shadow-2xl mx-4 border border-gray-100 flex flex-col relative"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Nút X đóng */}
            <button 
              onClick={() => setShowWhenModal(false)} 
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 cursor-pointer absolute top-6 left-6"
            >
              <X size={18} />
            </button>

            {/* Header: Title Khi + Pill switch Ngày tháng / Linh hoạt */}
            <div className="flex flex-col items-center mb-6">
              <div className="text-[17px] font-bold text-black mb-3">Khi</div>
              <div className="bg-gray-100 p-1 rounded-full flex gap-1">
                <button 
                  type="button"
                  onClick={() => setWhenTab('dates')} 
                  className={`px-5 py-1.5 rounded-full text-[13px] font-bold transition-all cursor-pointer ${
                    whenTab === 'dates' ? 'bg-white shadow-xs text-black' : 'text-gray-500 hover:text-black'
                  }`}
                >
                  Ngày tháng
                </button>
                <button 
                  type="button"
                  onClick={() => setWhenTab('flex')} 
                  className={`px-5 py-1.5 rounded-full text-[13px] font-bold transition-all cursor-pointer ${
                    whenTab === 'flex' ? 'bg-white shadow-xs text-black' : 'text-gray-500 hover:text-black'
                  }`}
                >
                  Linh hoạt
                </button>
              </div>
            </div>

            {/* TAB NGÀY THÁNG (LỊCH KÉP 2 THÁNG) */}
            {whenTab === 'dates' && (
              <div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-7 mb-7">
                  {/* THÁNG 1: TRÁI */}
                  <div>
                    <div className="flex items-center justify-between mb-3 px-1">
                      <button 
                        type="button" 
                        onClick={handlePrevMonth}
                        className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-gray-100 cursor-pointer text-gray-600"
                      >
                        <ChevronLeft size={18} />
                      </button>
                      <span className="font-bold text-[14px] text-gray-900">
                        {`Tháng ${month1Index + 1} năm ${month1Year}`}
                      </span>
                      <div className="w-7"></div>
                    </div>

                    <div className="grid grid-cols-7 text-center text-[12px] text-gray-400 font-medium mb-1.5">
                      <span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span>
                    </div>

                    <div className="grid grid-cols-7 text-center">
                      {Array.from({ length: meta1.firstDay }).map((_, idx) => (
                        <div key={`empty-1-${idx}`} className="h-9"></div>
                      ))}

                      {Array.from({ length: meta1.totalDays }).map((_, idx) => {
                        const dayNum = idx + 1;
                        const thisDate = new Date(month1Year, month1Index, dayNum);
                        const isStart = isSameDay(thisDate, rangeStart);
                        const isEnd = isSameDay(thisDate, rangeEnd);
                        const inRange = isDayInRange(thisDate);

                        return (
                          <div key={`day-1-${dayNum}`} className="relative h-9 flex items-center justify-center">
                            {inRange && <div className="absolute inset-0 bg-[#f0f0f0]" />}
                            {isStart && rangeEnd && <div className="absolute top-0 bottom-0 right-0 left-1/2 bg-[#f0f0f0]" />}
                            {isEnd && rangeStart && <div className="absolute top-0 bottom-0 left-0 right-1/2 bg-[#f0f0f0]" />}

                            <button
                              type="button"
                              onClick={() => handleSelectDate(month1Year, month1Index, dayNum)}
                              className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center text-[13px] cursor-pointer transition-all ${
                                isStart || isEnd
                                  ? 'bg-black text-white font-bold shadow-xs'
                                  : 'text-gray-900 hover:bg-gray-200/80 font-normal'
                              }`}
                            >
                              {dayNum}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* THÁNG 2: PHẢI */}
                  <div>
                    <div className="flex items-center justify-between mb-3 px-1">
                      <div className="w-7"></div>
                      <span className="font-bold text-[14px] text-gray-900">
                        {`Tháng ${month2Index + 1} năm ${month2Year}`}
                      </span>
                      <button 
                        type="button" 
                        onClick={handleNextMonth}
                        className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-gray-100 cursor-pointer text-gray-600"
                      >
                        <ChevronRight size={18} />
                      </button>
                    </div>

                    <div className="grid grid-cols-7 text-center text-[12px] text-gray-400 font-medium mb-1.5">
                      <span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span>
                    </div>

                    <div className="grid grid-cols-7 text-center">
                      {Array.from({ length: meta2.firstDay }).map((_, idx) => (
                        <div key={`empty-2-${idx}`} className="h-9"></div>
                      ))}

                      {Array.from({ length: meta2.totalDays }).map((_, idx) => {
                        const dayNum = idx + 1;
                        const thisDate = new Date(month2Year, month2Index, dayNum);
                        const isStart = isSameDay(thisDate, rangeStart);
                        const isEnd = isSameDay(thisDate, rangeEnd);
                        const inRange = isDayInRange(thisDate);

                        return (
                          <div key={`day-2-${dayNum}`} className="relative h-9 flex items-center justify-center">
                            {inRange && <div className="absolute inset-0 bg-[#f0f0f0]" />}
                            {isStart && rangeEnd && <div className="absolute top-0 bottom-0 right-0 left-1/2 bg-[#f0f0f0]" />}
                            {isEnd && rangeStart && <div className="absolute top-0 bottom-0 left-0 right-1/2 bg-[#f0f0f0]" />}

                            <button
                              type="button"
                              onClick={() => handleSelectDate(month2Year, month2Index, dayNum)}
                              className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center text-[13px] cursor-pointer transition-all ${
                                isStart || isEnd
                                  ? 'bg-black text-white font-bold shadow-xs'
                                  : 'text-gray-900 hover:bg-gray-200/80 font-normal'
                              }`}
                            >
                              {dayNum}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Footer Trang 1: Clear bên trái, Cập nhật bên phải */}
                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={handleClearDates}
                    className="text-[14px] font-semibold text-black hover:underline cursor-pointer"
                  >
                    Thông thoáng
                  </button>

                  <button
                    type="button"
                    onClick={handleSaveWhen}
                    className="px-8 py-3 bg-black text-white rounded-full font-bold text-[14px] hover:bg-neutral-800 transition active:scale-95 cursor-pointer shadow-xs"
                  >
                    Cập nhật
                  </button>
                </div>
              </div>
            )}

            {/* TAB LINH HOẠT (3 THÁNG) */}
            {whenTab === 'flex' && (
              <div className="pt-2">
                <div className="text-center mb-7">
                  <div className="text-[15px] font-bold text-gray-950 mb-3.5">
                    Bao nhiêu ngày?
                  </div>
                  <div className="flex items-center justify-center gap-4">
                    <button 
                      type="button"
                      onClick={() => setFlexibleDays(Math.max(1, flexibleDays - 1))} 
                      className="w-9 h-9 rounded-full border border-gray-300 flex items-center justify-center hover:border-black transition cursor-pointer text-gray-700"
                    >
                      <Minus size={15}/>
                    </button>
                    <div className="w-20 py-2 border border-gray-300 rounded-full text-center font-bold text-[16px] text-black">
                      {flexibleDays}
                    </div>
                    <button 
                      type="button"
                      onClick={() => setFlexibleDays(Math.min(14, flexibleDays + 1))} 
                      className="w-9 h-9 rounded-full border border-gray-300 flex items-center justify-center hover:border-black transition cursor-pointer text-gray-700"
                    >
                      <Plus size={15}/>
                    </button>
                  </div>
                </div>

                <div className="text-center mb-8">
                  <div className="text-[15px] font-bold text-gray-950 mb-4">
                    Du lịch bất cứ lúc nào
                  </div>
                  <div className="flex justify-center gap-3.5">
                    {threeMonthsList.map((m) => {
                      const isSelected = selectedMonth === m.label;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setSelectedMonth(m.label)}
                          className={`w-[110px] h-[105px] border rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all ${
                            isSelected
                              ? 'border-black bg-gray-50 ring-1 ring-black shadow-xs'
                              : 'border-gray-200 hover:border-gray-400 bg-white'
                          }`}
                        >
                          <CalendarIcon size={22} className={`mb-2.5 ${isSelected ? 'text-black' : 'text-gray-400'}`} />
                          <span className={`text-[13px] ${isSelected ? 'font-bold text-black' : 'font-medium text-gray-700'}`}>
                            {m.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button 
                    type="button"
                    onClick={handleSaveWhen} 
                    className="px-8 py-3 bg-black text-white font-bold text-[14px] rounded-full hover:bg-neutral-800 transition active:scale-95 cursor-pointer shadow-xs"
                  >
                    Cập nhật
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── MODAL 3: AI (KHI BẤM VÀO PILL DU KHÁCH) ─── */}
      {showWhoModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fadeIn select-none"
          onClick={() => setShowWhoModal(false)}
        >
          <div 
            className="w-full max-w-[420px] bg-white rounded-3xl p-6 sm:p-7 shadow-2xl mx-4 border border-gray-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-6">
              <button 
                onClick={() => setShowWhoModal(false)} 
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 cursor-pointer"
              >
                <X size={18} />
              </button>
              <div className="text-center">
                <div className="font-bold text-black text-[16px]">Ai</div>
                <div className="text-gray-400 text-[12px] font-light">{adults + children + infants + pets} du khách</div>
              </div>
              <div className="w-8 h-8"></div>
            </div>

            <div className="space-y-4 mb-6">
              {/* Người lớn */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[14px] font-bold text-black">Người lớn</div>
                  <div className="text-[12px] text-gray-400 font-light">Từ 13 tuổi trở lên</div>
                </div>
                <div className="flex items-center gap-3">
                  <button 
                    type="button"
                    onClick={() => setAdults(Math.max(1, adults - 1))} 
                    className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center hover:border-gray-400 cursor-pointer"
                  >
                    <Minus size={14}/>
                  </button>
                  <span className="w-5 text-center text-[14px] font-bold">{adults}</span>
                  <button 
                    type="button"
                    onClick={() => setAdults(adults + 1)} 
                    className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center hover:border-gray-400 cursor-pointer"
                  >
                    <Plus size={14}/>
                  </button>
                </div>
              </div>

              {/* Những đứa trẻ */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[14px] font-bold text-black">Những đứa trẻ</div>
                  <div className="text-[12px] text-gray-400 font-light">Độ tuổi 2–12</div>
                </div>
                <div className="flex items-center gap-3">
                  <button 
                    type="button"
                    onClick={() => setChildren(Math.max(0, children - 1))} 
                    className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center hover:border-gray-400 cursor-pointer"
                  >
                    <Minus size={14}/>
                  </button>
                  <span className="w-5 text-center text-[14px] font-bold">{children}</span>
                  <button 
                    type="button"
                    onClick={() => setChildren(children + 1)} 
                    className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center hover:border-gray-400 cursor-pointer"
                  >
                    <Plus size={14}/>
                  </button>
                </div>
              </div>

              {/* Trẻ sơ sinh */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[14px] font-bold text-black">Trẻ sơ sinh</div>
                  <div className="text-[12px] text-gray-400 font-light">Dưới 2 tuổi</div>
                </div>
                <div className="flex items-center gap-3">
                  <button 
                    type="button"
                    onClick={() => setInfants(Math.max(0, infants - 1))} 
                    className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center hover:border-gray-400 cursor-pointer"
                  >
                    <Minus size={14}/>
                  </button>
                  <span className="w-5 text-center text-[14px] font-bold">{infants}</span>
                  <button 
                    type="button"
                    onClick={() => setInfants(infants + 1)} 
                    className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center hover:border-gray-400 cursor-pointer"
                  >
                    <Plus size={14}/>
                  </button>
                </div>
              </div>

              {/* Thú cưng */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[14px] font-bold text-black">Thú cưng</div>
                  <div className="text-[12px] text-gray-400 font-light underline">Bạn có mang theo thú cưng không?</div>
                </div>
                <div className="flex items-center gap-3">
                  <button 
                    type="button"
                    onClick={() => setPets(Math.max(0, pets - 1))} 
                    className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center hover:border-gray-400 cursor-pointer"
                  >
                    <Minus size={14}/>
                  </button>
                  <span className="w-5 text-center text-[14px] font-bold">{pets}</span>
                  <button 
                    type="button"
                    onClick={() => setPets(pets + 1)} 
                    className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center hover:border-gray-400 cursor-pointer"
                  >
                    <Plus size={14}/>
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <button 
                type="button"
                onClick={handleSaveWho} 
                className="w-full sm:w-32 bg-black text-white font-bold text-[14px] py-3 rounded-full hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                Cập nhật
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL 4: NGÂN SÁCH (KHI BẤM VÀO PILL NGÂN SÁCH) ─── */}
      {showBudgetModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fadeIn select-none"
          onClick={() => setShowBudgetModal(false)}
        >
          <div 
            className="w-full max-w-[450px] bg-white rounded-[28px] p-7 sm:p-8 shadow-2xl relative border border-gray-100 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Nút X đóng góc trên bên trái */}
            <button
              type="button"
              onClick={() => setShowBudgetModal(false)}
              className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-black hover:bg-gray-100 transition absolute top-6 left-6 cursor-pointer"
              title="Đóng"
            >
              <X size={18} strokeWidth={2.5} />
            </button>

            {/* Tiêu đề & Phụ đề căn giữa */}
            <div className="text-center mb-6 pt-1">
              <h3 className="text-[19px] font-bold text-gray-950">Ngân sách</h3>
              <p className="text-[13px] text-gray-500 mt-1">Chọn phạm vi ngân sách của bạn</p>
            </div>

            {/* 5 lựa chọn Radio chuẩn Mindtrip */}
            <div className="space-y-4 mb-7 px-1">
              {BUDGET_OPTIONS.map((opt) => {
                const isChecked = selectedBudgetTier === opt.id;
                return (
                  <div
                    key={opt.id}
                    onClick={() => setSelectedBudgetTier(opt.id)}
                    className="flex items-center gap-3.5 cursor-pointer group py-1 select-none"
                  >
                    {/* Nút Radio tròn viền đen có chấm đen bên trong khi chọn */}
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors shrink-0 ${
                      isChecked ? 'border-black' : 'border-gray-400 group-hover:border-gray-600'
                    }`}>
                      {isChecked && (
                        <div className="w-2.5 h-2.5 rounded-full bg-black"></div>
                      )}
                    </div>

                    {/* Nhãn văn bản */}
                    <span className={`text-[14.5px] transition-colors ${
                      isChecked ? 'font-bold text-black' : 'font-normal text-gray-800 group-hover:text-black'
                    }`}>
                      {opt.label}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Nút Cập nhật góc dưới bên phải */}
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={handleSaveBudget}
                className="px-8 py-3 bg-black text-white font-bold text-[14px] rounded-full hover:bg-neutral-800 transition active:scale-95 cursor-pointer shadow-xs"
              >
                Cập nhật
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL PHỤ CHO Ý TƯỞNG & LỊCH ─── */}
      {activeRightDrawer && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-fadeIn"
          onClick={() => setActiveRightDrawer(null)}
        >
          <div 
            className="w-full max-w-[540px] bg-white rounded-3xl p-6 sm:p-7 shadow-2xl relative border border-gray-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-4 border-b border-gray-100 mb-5">
              <h3 className="font-bold text-[17px] text-gray-950">
                {activeRightDrawer === 'ideas' && '💡 Ý tưởng & Điểm gợi ý'}
                {activeRightDrawer === 'calendar' && '📅 Lịch trình tổng quát'}
              </h3>
              <button 
                onClick={() => setActiveRightDrawer(null)} 
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100 text-gray-500 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Nội dung Lịch */}
            {activeRightDrawer === 'calendar' && (
              <div className="space-y-3">
                <p className="text-xs text-gray-500">Khung thời gian cho chuyến đi:</p>
                <div className="p-4 bg-gray-50 rounded-2xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CalendarIcon size={20} className="text-emerald-700" />
                    <div>
                      <div className="text-[14px] font-bold text-gray-900">{trip.startDate || `${trip.daysCount} ngày`}</div>
                      <div className="text-xs text-gray-500">{trip.destination} • {trip.daysCount} ngày</div>
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      setActiveRightDrawer(null);
                      onOpenItineraryDetails();
                    }} 
                    className="text-xs font-bold text-black underline cursor-pointer"
                  >
                    Xem chi tiết ngày
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── MODAL "THÊM VÀO CHUYẾN ĐI" (ADD TO TRIP MODAL CHUẨN MINDTRIP) ─── */}
      {showAddIdeasModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 sm:p-6 animate-fadeIn select-none"
          onClick={() => setShowAddIdeasModal(false)}
        >
          <div
            className="bg-white w-full max-w-[840px] rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh] border border-gray-100"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-6 py-4 flex items-center justify-between border-b border-gray-100">
              <button
                type="button"
                onClick={() => setShowAddIdeasModal(false)}
                className="w-9 h-9 rounded-full flex items-center justify-center text-gray-500 hover:text-black hover:bg-gray-100 transition cursor-pointer"
                title="Đóng"
              >
                <X size={18} />
              </button>
              <h3 className="font-bold text-[17px] text-gray-950 flex-1 text-center pr-9">
                Thêm vào chuyến đi
              </h3>
            </div>

            {/* Modal Tabs: Tìm kiếm | Đã lưu | Tùy chỉnh */}
            <div className="flex items-center gap-8 px-6 border-b border-gray-100 text-[13.5px]">
              <button
                type="button"
                onClick={() => setModalTab('search')}
                className={`py-3.5 border-b-2 transition font-semibold cursor-pointer ${
                  modalTab === 'search'
                    ? 'border-black text-black font-bold'
                    : 'border-transparent text-gray-500 hover:text-gray-900'
                }`}
              >
                Tìm kiếm
              </button>
              <button
                type="button"
                onClick={() => setModalTab('saved')}
                className={`py-3.5 border-b-2 transition font-semibold cursor-pointer flex items-center gap-1.5 ${
                  modalTab === 'saved'
                    ? 'border-black text-black font-bold'
                    : 'border-transparent text-gray-500 hover:text-gray-900'
                }`}
              >
                <span>Đã lưu</span>
                {tripIdeas.length > 0 && (
                  <span className="w-4.5 h-4.5 rounded-full bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center">
                    {tripIdeas.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setModalTab('custom')}
                className={`py-3.5 border-b-2 transition font-semibold cursor-pointer ${
                  modalTab === 'custom'
                    ? 'border-black text-black font-bold'
                    : 'border-transparent text-gray-500 hover:text-gray-900'
                }`}
              >
                Tùy chỉnh
              </button>
            </div>

            {/* Tab Body: Search & Saved */}
            {modalTab !== 'custom' ? (
              <div className="p-6 flex flex-col space-y-4 overflow-hidden flex-1">
                {/* Search Bar + City Selector + Filter Button */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  {/* Dropdown City */}
                  <div className="relative shrink-0">
                    <select
                      value={modalCity}
                      onChange={(e) => setModalCity(e.target.value as 'all' | 'Đà Nẵng' | 'Huế')}
                      className="font-extrabold text-[16px] text-gray-900 bg-transparent pr-6 py-1 cursor-pointer focus:outline-none"
                    >
                      <option value="all">Tất cả điểm đến</option>
                      <option value="Đà Nẵng">Đà Nẵng</option>
                      <option value="Huế">Huế</option>
                    </select>
                  </div>

                  {/* Search Input */}
                  <div className="relative flex-1">
                    <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={modalSearch}
                      onChange={(e) => setModalSearch(e.target.value)}
                      placeholder="Tìm kiếm địa điểm, di tích, ẩm thực..."
                      className="w-full h-10 pl-10 pr-4 rounded-full border border-gray-200 focus:border-black focus:outline-none text-[13px] text-gray-900 shadow-2xs"
                    />
                  </div>

                  {/* Filter Reset Button */}
                  <button
                    type="button"
                    onClick={() => {
                      setModalCategory('all');
                      setModalSearch('');
                      setModalCity('all');
                    }}
                    className="flex items-center justify-center gap-1.5 px-4 h-10 rounded-full border border-gray-200 hover:border-black text-[13px] font-semibold text-gray-800 transition cursor-pointer shadow-2xs shrink-0"
                  >
                    <SlidersHorizontal size={14} />
                    <span>Bộ lọc</span>
                  </button>
                </div>

                {/* Category Pills (For you, Experiences, Restaurants, Spiritual, All) */}
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
                  {[
                    { id: 'for-you', label: 'Dành cho bạn' },
                    { id: 'experiences', label: 'Trải nghiệm' },
                    { id: 'restaurants', label: 'Quán ăn' },
                    { id: 'spiritual', label: 'Tâm linh' },
                    { id: 'all', label: 'Tất cả' },
                  ].map((cat) => {
                    const isActive = modalCategory === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setModalCategory(cat.id as 'for-you' | 'experiences' | 'restaurants' | 'spiritual' | 'all')}
                        className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition cursor-pointer shrink-0 shadow-2xs ${
                          isActive
                            ? 'bg-black text-white'
                            : 'bg-gray-100 hover:bg-gray-200/90 text-gray-800 border border-gray-200/60'
                        }`}
                      >
                        {cat.label}
                      </button>
                    );
                  })}
                </div>

                {/* Section Title */}
                <div className="pt-1">
                  <h4 className="font-bold text-[15px] text-gray-950">
                    {modalCategory === 'restaurants'
                      ? 'Quán ăn & Ẩm thực'
                      : modalCategory === 'experiences'
                      ? 'Trải nghiệm & Thắng cảnh'
                      : modalCategory === 'spiritual'
                      ? 'Chùa & Điểm tâm linh'
                      : modalTab === 'saved'
                      ? 'Địa điểm đã lưu'
                      : 'Trải nghiệm đề xuất'} ({modalFilteredPois.length})
                  </h4>
                </div>

                {/* Grid POI Cards */}
                <div className="flex-1 overflow-y-auto pr-1 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 pb-4 auto-hide-scrollbar max-h-[48vh]">
                  {modalFilteredPois.length === 0 ? (
                    <div className="col-span-full py-12 text-center text-gray-500 text-sm">
                      {modalTab === 'saved'
                        ? 'Chưa có địa điểm nào được lưu vào Ý tưởng. Hãy chuyển sang tab Tìm kiếm để thêm nhé!'
                        : 'Không tìm thấy địa điểm phù hợp với bộ lọc hiện tại.'}
                    </div>
                  ) : (
                    modalFilteredPois.map((poi) => {
                      const isAdded = tripIdeas.includes(poi.id);
                      return (
                        <div
                          key={poi.id}
                          className="rounded-2xl border border-gray-200/90 bg-white p-2.5 shadow-xs hover:shadow-md transition flex flex-col justify-between group"
                        >
                          <div>
                            {/* Card Image */}
                            <div className="relative aspect-[1.18/1] w-full rounded-xl overflow-hidden bg-gray-100 mb-2.5">
                              <img
                                src={poi.image}
                                alt={poi.name}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                onError={(e) => {
                                  e.currentTarget.src = 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=800&auto=format&fit=crop&q=80';
                                }}
                              />
                              {/* Pill Button Top Right: + Add / Added */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleIdea(poi.id);
                                }}
                                className={`absolute top-2 right-2 px-3 py-1 rounded-full text-[11px] font-bold transition shadow-md cursor-pointer active:scale-95 flex items-center gap-1 ${
                                  isAdded
                                    ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                    : 'bg-white/95 text-gray-900 hover:bg-black hover:text-white backdrop-blur-xs'
                                }`}
                              >
                                {isAdded ? (
                                  <>
                                    <Check size={11} className="font-bold" />
                                    Đã thêm
                                  </>
                                ) : (
                                  <>
                                    <Plus size={11} />
                                    + Thêm
                                  </>
                                )}
                              </button>
                            </div>

                            {/* Info */}
                            <h5 className="font-bold text-[13.5px] text-gray-950 truncate leading-snug" title={poi.name}>
                              {poi.name}
                            </h5>
                            <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-1">
                              <span className="flex items-center text-amber-500 font-bold">
                                <Star size={11} className="fill-amber-500 mr-0.5" />
                                {poi.rating}
                              </span>
                              <span>•</span>
                              <span className="truncate">
                                {poi.category === 'quan-an' ? 'Ẩm thực' : poi.category === 'di-tich' ? 'Di tích' : poi.category === 'canh-quan' ? 'Cảnh quan' : 'Tâm linh'} • {poi.city}
                              </span>
                            </div>
                          </div>

                          <div className="pt-2 text-[11px] text-gray-400 border-t border-gray-100 mt-2 truncate">
                            👥 Được {Math.floor(poi.rating * 18 + 12)} du khách yêu thích
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ) : (
              /* Tab Tùy chỉnh (Custom) */
              <div className="p-6 flex flex-col space-y-4">
                <p className="text-[13.5px] text-gray-600">
                  Bạn có một địa điểm riêng muốn lưu vào chuyến đi này? Nhập tên bên dưới để thêm ngay vào Ý tưởng:
                </p>
                <div className="space-y-3 max-w-md">
                  <input
                    type="text"
                    value={customIdeaInput}
                    onChange={(e) => setCustomIdeaInput(e.target.value)}
                    placeholder="Ví dụ: Quán cafe ven biển Sơn Trà, Tiệm bánh ép Huế..."
                    className="w-full p-3 rounded-2xl border border-gray-200 focus:border-black focus:outline-none text-[13.5px]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!customIdeaInput.trim()) return;
                      // Tạo ID tạm
                      const customId = `custom-${Date.now()}`;
                      handleToggleIdea(customId);
                      setCustomIdeaInput('');
                      setShowAddIdeasModal(false);
                      setShowIdeasView(true);
                    }}
                    className="px-6 py-2.5 rounded-full bg-black text-white font-bold text-[13px] hover:bg-neutral-800 transition active:scale-95 cursor-pointer shadow-xs"
                  >
                    + Thêm vào ý tưởng
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Explanation Modal (KG + AI) */}
      {explanationPoi && (
        <ExplanationModal
          poiId={explanationPoi.id}
          poiName={explanationPoi.name}
          explanationSnippet={explanationPoi.snippet}
          isOpen={Boolean(explanationPoi)}
          onClose={() => setExplanationPoi(null)}
        />
      )}
    </div>
  );
}
