import React, { useState } from 'react';
import { X, Minus, Plus, Calendar, Loader2, Sparkles, ChevronLeft, ChevronRight } from 'lucide-react';
import type { UserTrip } from '@/pages/ExplorePage';
import { validateTripParameters } from '@/services/tripService';

export interface CreateTripMindtripModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateTrip?: (trip: UserTrip) => void;
  onCreated?: (trip: UserTrip) => void;
}

function estimatePacing(days: number): { level: 'Relaxed' | 'Balanced' | 'Fast'; label: string } {
  const pointsPerDay = 4 / days;
  if (pointsPerDay <= 3) return { level: 'Relaxed', label: '🌿 Thong thả' };
  if (pointsPerDay <= 5) return { level: 'Balanced', label: '⚖️ Cân bằng' };
  return { level: 'Fast', label: '⚡ Dày đặc' };
}

export default function CreateTripMindtripModal({
  isOpen,
  onClose,
  onCreateTrip,
  onCreated,
}: CreateTripMindtripModalProps) {
  const [tripPrompt, setTripPrompt] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 1. WHERE STATE (Ở đâu: Huế, Đà Nẵng, Cả 2)
  const [whereTarget, setWhereTarget] = useState<string>('Đà Nẵng & Huế');
  const [byCar, setByCar] = useState(false);
  const [showWhereModal, setShowWhereModal] = useState(false);

  // 2. WHEN STATE (Khi: Ngày tháng vs Linh hoạt)
  const [whenTab, setWhenTab] = useState<'dates' | 'flex'>('dates');
  
  // Khởi tạo lịch ở tuần tới để ngày mặc định không bị backend từ chối theo thời gian thực.
  const [calendarBaseMonth, setCalendarBaseMonth] = useState<Date>(() => {
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    return new Date(nextWeek.getFullYear(), nextWeek.getMonth(), 1);
  });
  const [rangeStart, setRangeStart] = useState<Date | null>(() => {
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    return nextWeek;
  });
  const [rangeEnd, setRangeEnd] = useState<Date | null>(() => {
    const tripEnd = new Date();
    tripEnd.setDate(tripEnd.getDate() + 10);
    return tripEnd;
  });

  // Tab Linh hoạt: Số ngày và chọn 3 tháng
  const [flexibleDays, setFlexibleDays] = useState(4);
  const [selectedMonth, setSelectedMonth] = useState('Tháng 11');
  const [showWhenModal, setShowWhenModal] = useState(false);

  // 3. WHO STATE (Ai: Số lượng du khách)
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [infants, setInfants] = useState(0);
  const [pets, setPets] = useState(0);
  const [showWhoModal, setShowWhoModal] = useState(false);

  if (!isOpen) return null;

  const totalGuests = adults + children + infants + pets;
  const destinationDisplay = whereTarget.trim() || 'Đà Nẵng & Huế';
  
  // Format chuỗi hiển thị cho mục "Khi"
  const getWhenDisplay = () => {
    if (whenTab === 'dates' && rangeStart && rangeEnd) {
      const sDay = rangeStart.getDate();
      const sMon = rangeStart.getMonth() + 1;
      const eDay = rangeEnd.getDate();
      const eMon = rangeEnd.getMonth() + 1;
      if (sMon === eMon) {
        return `${sDay} - ${eDay} thg ${sMon} (${flexibleDays} ngày)`;
      }
      return `${sDay}/${sMon} - ${eDay}/${eMon} (${flexibleDays} ngày)`;
    }
    return `${flexibleDays} ngày • ${selectedMonth}`;
  };

  const whenDisplay = getWhenDisplay();
  const whoDisplay = `${totalGuests} du khách`;

  // Helper hàm cho lịch 2 tháng bên tab "Ngày tháng"
  const month1Year = calendarBaseMonth.getFullYear();
  const month1Index = calendarBaseMonth.getMonth();

  const nextMonthDate = new Date(month1Year, month1Index + 1, 1);
  const month2Year = nextMonthDate.getFullYear();
  const month2Index = nextMonthDate.getMonth();

  const getMonthMeta = (year: number, month: number) => {
    const firstDay = new Date(year, month, 1).getDay(); // 0 = Chủ nhật
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

  // Normalizer cho Backend FastAPI (Chấp nhận: 'Đà Nẵng', 'Huế', 'Đà Nẵng & Huế')
  const getNormalizedDestination = (): 'Đà Nẵng' | 'Huế' | 'Đà Nẵng & Huế' => {
    const s = whereTarget.trim().toLowerCase();
    if ((s.includes('đà nẵng') || s.includes('da nang')) && (s.includes('huế') || s.includes('hue'))) {
      return 'Đà Nẵng & Huế';
    }
    if (s.includes('cả') || s.includes('both') || s.includes('2') || s.includes('hai')) {
      return 'Đà Nẵng & Huế';
    }
    if (s.includes('huế') || s.includes('hue')) {
      return 'Huế';
    }
    if (s.includes('đà nẵng') || s.includes('da nang') || s.includes('danang')) {
      return 'Đà Nẵng';
    }
    return 'Đà Nẵng & Huế';
  };

  // 3 tháng giới hạn theo đúng yêu cầu: "ở cái trang 2 chỉ phạm vi 3 tháng thôi thay vì 6 tháng"
  const threeMonthsList = [
    { id: 'm1', label: 'Tháng 11' },
    { id: 'm2', label: 'Tháng 12' },
    { id: 'm3', label: 'Tháng 1' },
  ];

  // Gửi thông số sang Backend API FastAPI để xác thực & sinh lịch trình
  const handleCreate = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);

    const normDest = getNormalizedDestination();
    const validDays = normDest === 'Đà Nẵng & Huế' ? Math.max(2, flexibleDays) : Math.max(1, flexibleDays);
    const validPeople = Math.max(1, adults + children);
    const estimatedBudget = 1500000 * validDays * validPeople;

    const startDateStr = whenTab === 'dates' && rangeStart
      ? `${rangeStart.getFullYear()}-${String(rangeStart.getMonth() + 1).padStart(2, '0')}-${String(rangeStart.getDate()).padStart(2, '0')}`
      : null;

    try {
      const backendResponse = await validateTripParameters({
        destination: normDest,
        days: validDays,
        total_budget: estimatedBudget,
        num_people: validPeople,
        start_date: startDateStr,
        preferences: ['food', 'culture', 'nature', 'eco'],
      });

      const validatedData = backendResponse.data;

      const title = tripPrompt.trim()
        ? (tripPrompt.trim().length > 50 ? tripPrompt.trim().slice(0, 50) + '...' : tripPrompt.trim())
        : `Hành trình ${normDest} ${validDays} ngày`;

      const coverImage = normDest === 'Huế'
        ? 'https://images.unsplash.com/photo-1569154941061-e231b4725ef1?auto=format&fit=crop&w=800&q=80'
        : normDest === 'Đà Nẵng'
        ? 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?auto=format&fit=crop&w=800&q=80'
        : 'https://images.unsplash.com/photo-1506929562872-bb421503ef21?auto=format&fit=crop&w=800&q=80';

      const newTrip: UserTrip = {
        id: 'trip_' + Date.now(),
        title,
        destination: normDest,
        startDate: whenDisplay,
        daysCount: validDays,
        peopleCount: Math.max(1, totalGuests),
        coverImage,
        createdAt: new Date().toISOString(),
        status: 'upcoming',
        prompt: tripPrompt.trim(),
        totalBudget: estimatedBudget,
        itineraryOutline: validatedData.itinerary_outline || [],
        matchedPois: validatedData.matched_pois || [],
        costBreakdown: validatedData.cost_breakdown,
        pacingLevel: validatedData.pacing_level,
        pacingLabel: validatedData.pacing_label,
      };

      const cb = onCreateTrip || onCreated;
      if (cb) {
        cb(newTrip);
      }
      onClose();
    } catch (err: unknown) {
      console.warn('Backend API notification, falling back smoothly:', err);

      const title = tripPrompt.trim()
        ? (tripPrompt.trim().length > 50 ? tripPrompt.trim().slice(0, 50) + '...' : tripPrompt.trim())
        : `Hành trình ${normDest} ${validDays} ngày`;

      const coverImage = normDest === 'Huế'
        ? 'https://images.unsplash.com/photo-1569154941061-e231b4725ef1?auto=format&fit=crop&w=800&q=80'
        : 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?auto=format&fit=crop&w=800&q=80';
      const pacing = estimatePacing(validDays);

      const newTrip: UserTrip = {
        id: 'trip_' + Date.now(),
        title,
        destination: normDest,
        startDate: whenDisplay,
        daysCount: validDays,
        peopleCount: Math.max(1, totalGuests),
        coverImage,
        createdAt: new Date().toISOString(),
        status: 'upcoming',
        prompt: tripPrompt.trim(),
        totalBudget: estimatedBudget,
        pacingLevel: pacing.level,
        pacingLabel: pacing.label,
      };

      const cb = onCreateTrip || onCreated;
      if (cb) {
        cb(newTrip);
      }
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fadeIn select-none"
      onClick={onClose}
    >
      {/* Khung hộp thoại: rộng 917px (max-w-[508px], -5%), bo góc 36px (rounded-[20px], -28%), hạ giữa dọc, padding chuẩn Mindtrip */}
      <div 
        className="w-full max-w-[508px] bg-white rounded-[20px] px-7 sm:px-[30px] pt-[22px] pb-[24px] shadow-2xl relative border border-gray-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Nút đóng modal chính: cách mép trái/trên 43/42px (top-[17px] left-[17px], -28%), màu đen đậm nét dày */}
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-full flex items-center justify-center text-black hover:bg-gray-100 transition absolute top-[17px] left-[17px] cursor-pointer"
          title="Đóng"
        >
          <X size={20} strokeWidth={2.7} className="text-black" />
        </button>

        {/* Top-center Icon Badge: đường kính 73px (w-[40px] h-[40px], -9%), cách trên 43px (pt-[22px]), cách tiêu đề 46px (mb-[14px]) */}
        <div className="w-[40px] h-[40px] rounded-full bg-[#e6f4ea] text-emerald-700 flex items-center justify-center mx-auto mb-[14px] shadow-2xs">
          <Sparkles size={18} className="text-emerald-700" />
        </div>

        {/* Modal Heading: tiêu đề chuẩn chính tả (đã sửa khoảng trắng thừa), cỡ chữ 33px (text-[19px] sm:text-[20.5px], -3%), giãn dòng 50px (leading-[1.3], -7%), cách ô nhập 45px (mb-[22px]) */}
        <h2 className="text-[19px] sm:text-[20.5px] font-bold text-gray-950 text-center tracking-tight mb-[22px] px-3 leading-[1.3]">
          Anh ơi, em cần lưu ý điều gì cho chuyến đi này?
        </h2>

        {/* Prompt Textarea: cao 188px (h-[106px], -18%), viền xám trung bình #c8c8c8, padding trái 23px (px-[13px] py-[12px], -23%), placeholder 1 dòng ngắn gọn */}
        <div className="mb-[16px]">
          <textarea
            placeholder="Ví dụ: 3 ngày ở Đà Nẵng và Huế, thích ngắm cảnh, ẩm thực..."
            value={tripPrompt}
            onChange={(e) => setTripPrompt(e.target.value.slice(0, 2000))}
            className="w-full rounded-[16px] border border-[#c8c8c8] px-[13px] py-[12px] text-[14px] text-gray-900 placeholder:text-gray-400 focus:border-black focus:outline-none focus:ring-1 focus:ring-black transition-all resize-none h-[106px] leading-relaxed"
          />
          {/* Bộ đếm ký tự: nằm ngoài dưới ô, căn phải, cách đáy ô 14px (mt-[6px]) */}
          <div className="flex justify-end mt-[6px]">
            <span className="text-[11px] text-gray-400 font-mono">
              {tripPrompt.length} / 2000
            </span>
          </div>
        </div>

        {/* Dòng chữ gợi ý: cách bộ đếm 70px (mt-[16px]), màu xám trung bình #666666 */}
        <p className="text-[13px] text-[#666666] mt-[16px] mb-[12px] font-normal">
          Bạn có thông tin chi tiết? Hãy chia sẻ những gì bạn biết.
        </p>

        {/* 3 Detail Rows: cao mỗi hàng 81px (h-[44px], -17%), khoảng cách giữa các hàng 16px (space-y-[9px], -27%), viền #c8c8c8, padding trái nhãn 31px (pl-[17px]), padding phải 31px (pr-[17px]), đã bỏ mũi tên ">" */}
        <div className="space-y-[9px]">
          {/* 1. Ở ĐÂU (Where) */}
          <button
            type="button"
            onClick={() => setShowWhereModal(true)}
            className="w-full h-[44px] flex items-center justify-between pl-[17px] pr-[17px] rounded-[14px] border border-[#c8c8c8] hover:border-gray-400 transition-colors bg-white cursor-pointer group text-left"
          >
            <div className="flex items-center gap-2.5">
              <span className="text-[13.5px] font-bold text-black">Ở đâu</span>
            </div>
            <div className="flex items-center">
              <span className="text-[12.5px] font-semibold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-100">
                {destinationDisplay}
              </span>
            </div>
          </button>

          {/* 2. KHI (When) */}
          <button
            type="button"
            onClick={() => setShowWhenModal(true)}
            className="w-full h-[44px] flex items-center justify-between pl-[17px] pr-[17px] rounded-[14px] border border-[#c8c8c8] hover:border-gray-400 transition-colors bg-white cursor-pointer group text-left"
          >
            <div className="flex items-center gap-2.5">
              <span className="text-[13.5px] font-bold text-black">Khi</span>
            </div>
            <div className="flex items-center">
              <span className="text-[12.5px] font-medium text-gray-600">
                {whenDisplay}
              </span>
            </div>
          </button>

          {/* 3. AI (Who) */}
          <button
            type="button"
            onClick={() => setShowWhoModal(true)}
            className="w-full h-[44px] flex items-center justify-between pl-[17px] pr-[17px] rounded-[14px] border border-[#c8c8c8] hover:border-gray-400 transition-colors bg-white cursor-pointer group text-left"
          >
            <div className="flex items-center gap-2.5">
              <span className="text-[13.5px] font-bold text-black">Ai</span>
            </div>
            <div className="flex items-center">
              <span className="text-[12.5px] font-medium text-gray-600">
                {whoDisplay}
              </span>
            </div>
          </button>
        </div>

        {errorMessage && (
          <p className="mt-3 text-xs text-red-500 text-center font-medium">
            {errorMessage}
          </p>
        )}

        {/* Nút Tạo nên: căn phải (flex justify-end), rộng 300px (w-[166px], +11%), cao 72px (h-[40px], -10%), cách hàng Ai 72px (mt-[40px], +44%), cách đáy 43px (pb-[24px]), đen khi có thông tin, xám khi chưa nhập */}
        <div className="mt-[40px] flex justify-end">
          <button
            type="button"
            onClick={handleCreate}
            disabled={!tripPrompt.trim() || isSubmitting}
            className={`w-[166px] h-[40px] rounded-full text-[14px] font-bold transition-all shadow-xs flex items-center justify-center gap-2 ${
              tripPrompt.trim() && !isSubmitting
                ? 'bg-black text-white hover:bg-neutral-800 active:scale-95 cursor-pointer'
                : 'bg-[#E5E7EB] text-gray-400 cursor-not-allowed'
            }`}
          >
            {isSubmitting ? (
              <>
                <Loader2 size={16} className="animate-spin text-gray-500" />
                <span>Đang xử lý qua AI...</span>
              </>
            ) : (
              <span>Tạo chuyến đi</span>
            )}
          </button>
        </div>
      </div>
      {/* ─── POPUP CON 1: Ở ĐÂU (ĐÀ NẴNG, HUẾ, CẢ HAI) ─── */}
      {showWhereModal && (
        <div 
          className="absolute inset-0 z-[110] flex items-center justify-center bg-black/40 backdrop-blur-xs animate-fadeIn"
          onClick={(e) => { e.stopPropagation(); setShowWhereModal(false); }}
        >
          <div 
            className="w-full max-w-[480px] bg-white rounded-3xl p-6 sm:p-7 shadow-2xl mx-4 flex flex-col border border-gray-100"
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
                onClick={() => setShowWhereModal(false)} 
                className="w-full sm:w-32 font-bold text-[14px] py-3 rounded-full bg-black text-white hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                Cập nhật
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── POPUP CON 2: KHI (CHUẨN MINDTRIP: DUAL CALENDAR & 3 THÁNG LINH HOẠT) ─── */}
      {showWhenModal && (
        <div 
          className="absolute inset-0 z-[110] flex items-center justify-center bg-black/40 backdrop-blur-xs animate-fadeIn"
          onClick={(e) => { e.stopPropagation(); setShowWhenModal(false); }}
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

            {/* TRANG 1: TAB NGÀY THÁNG (LỊCH KÉP 2 THÁNG LIỀN KỀ THEO ẢNH 1) */}
            {whenTab === 'dates' && (
              <div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-7 mb-7">
                  {/* THÁNG 1: TRÁI (Ví dụ Tháng 11 năm 2026 có mũi tên lùi <) */}
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

                    {/* Hàng thứ: S M T W T F S */}
                    <div className="grid grid-cols-7 text-center text-[12px] text-gray-400 font-medium mb-1.5">
                      <span>S</span>
                      <span>M</span>
                      <span>T</span>
                      <span>W</span>
                      <span>T</span>
                      <span>F</span>
                      <span>S</span>
                    </div>

                    {/* Lưới các ngày Tháng 1 */}
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
                            {/* Dải nền kết nối khoảng ngày được chọn */}
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

                  {/* THÁNG 2: PHẢI (Ví dụ Tháng 12 năm 2026 có mũi tên tiến >) */}
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

                    {/* Hàng thứ: S M T W T F S */}
                    <div className="grid grid-cols-7 text-center text-[12px] text-gray-400 font-medium mb-1.5">
                      <span>S</span>
                      <span>M</span>
                      <span>T</span>
                      <span>W</span>
                      <span>T</span>
                      <span>F</span>
                      <span>S</span>
                    </div>

                    {/* Lưới các ngày Tháng 2 */}
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
                    Clear
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowWhenModal(false)}
                    className="px-8 py-3 bg-black text-white rounded-full font-bold text-[14px] hover:bg-neutral-800 transition active:scale-95 cursor-pointer shadow-xs"
                  >
                    Cập nhật
                  </button>
                </div>
              </div>
            )}

            {/* TRANG 2: TAB LINH HOẠT (ĐÚNG PHẠM VI 3 THÁNG THEO YÊU CẦU CỦA BẠN) */}
            {whenTab === 'flex' && (
              <div className="pt-2">
                {/* 1. Bao nhiêu ngày? */}
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

                {/* 2. Du lịch bất cứ lúc nào (Chỉ trong phạm vi 3 tháng) */}
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
                          <Calendar size={22} className={`mb-2.5 ${isSelected ? 'text-black' : 'text-gray-400'}`} />
                          <span className={`text-[13px] ${isSelected ? 'font-bold text-black' : 'font-medium text-gray-700'}`}>
                            {m.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Footer Trang 2: Nút Cập nhật góc phải */}
                <div className="flex justify-end pt-2">
                  <button 
                    type="button"
                    onClick={() => setShowWhenModal(false)} 
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

      {/* ─── POPUP CON 3: AI (SỐ LƯỢNG NGƯỜI) ─── */}
      {showWhoModal && (
        <div 
          className="absolute inset-0 z-[110] flex items-center justify-center bg-black/40 backdrop-blur-xs animate-fadeIn"
          onClick={(e) => { e.stopPropagation(); setShowWhoModal(false); }}
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
                <div className="text-gray-400 text-[12px] font-light">{totalGuests} du khách</div>
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
                onClick={() => setShowWhoModal(false)} 
                className="w-full sm:w-32 bg-black text-white font-bold text-[14px] py-3 rounded-full hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                Cập nhật
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
