import React, { useState } from 'react';
import {
  Sparkles,
  Compass,
  CalendarPlus,
  Send,
  Plus,
  Mic,
  AudioWaveform as Waveform,
  ChevronRight,
  ArrowRight,
  MapPin,
  Clock,
  CheckCircle2,
  X,
  Share2,
  MessageSquare,
  Flame,
  Leaf,
  Layers,
  Star,
} from 'lucide-react';
import OnboardingModal from '@/components/auth/OnboardingModal';

export interface HomeDashboardViewProps {
  onNavigateToExplore: () => void;
  onNavigateToTrips: () => void;
  onNavigateToSaved: () => void;
  onCreateTrip: (defaultDestination?: string, defaultTitle?: string) => void;
  currentUser?: { full_name?: string; email?: string } | null;
}

const TOP_CATEGORIES = [
  { id: 'stays', label: 'Lưu trú', icon: 'ph-bed', bg: 'bg-purple-100', text: 'text-purple-700' },
  { id: 'flights', label: 'Vé máy bay', icon: 'ph-airplane-tilt', bg: 'bg-sky-100', text: 'text-sky-700' },
  { id: 'eats', label: 'Ẩm thực', icon: 'ph-fork-knife', bg: 'bg-amber-100', text: 'text-amber-700' },
  { id: 'experiences', label: 'Trải nghiệm', icon: 'ph-sparkle', bg: 'bg-emerald-100', text: 'text-emerald-700' },
  { id: 'events', label: 'Sự kiện', icon: 'ph-ticket', bg: 'bg-indigo-100', text: 'text-indigo-700' },
  { id: 'trips', label: 'Lịch trình', icon: 'ph-calendar-check', bg: 'bg-teal-100', text: 'text-teal-700' },
];

const MUST_TRY_PACKAGES = [
  {
    id: 'pkg-danang-food',
    title: 'Ẩm thực đường phố & Cầu Rồng Đà Nẵng',
    destination: 'Đà Nẵng',
    duration: '1 ngày • 4 điểm ghé thăm',
    badge: 'Must Try 🔥',
    ecoScore: '92/100',
    co2Saved: 'Giảm ~1.5kg CO₂',
    image: 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=800&auto=format&fit=crop&q=80',
    description: 'Bánh xèo Bà Dưỡng, Cầu Rồng phun lửa, chợ đêm Sơn Trà và dạo mát sông Hàn.',
    stops: ['Bánh xèo Bà Dưỡng', 'Cầu Rồng', 'Chợ đêm Sơn Trà', 'Cầu Tình Yêu'],
  },
  {
    id: 'pkg-hue-heritage',
    title: 'Dấu ấn Cố đô & Lăng tẩm Hoàng gia Huế',
    destination: 'Huế',
    duration: '2 ngày • 5 điểm ghé thăm',
    badge: 'Di sản UNESCO 🏛️',
    ecoScore: '95/100',
    co2Saved: 'Giảm ~2.1kg CO₂',
    image: 'https://images.unsplash.com/photo-1583417319070-4a69db38a482?w=800&auto=format&fit=crop&q=80',
    description: 'Khám phá Đại Nội Huế, Chùa Thiên Mụ cổ kính, Lăng Khải Định và thưởng thức cơm hến vỉa hè.',
    stops: ['Đại Nội Huế', 'Chùa Thiên Mụ', 'Lăng Khải Định', 'Cơm Hến Bà Cam', 'Cầu Trường Tiền'],
  },
  {
    id: 'pkg-green-nature',
    title: 'Hành trình Xanh: Bán đảo Sơn Trà & Biển Mỹ Khê',
    destination: 'Đà Nẵng',
    duration: '1 ngày • 3 điểm ghé thăm',
    badge: 'Xanh Sinh Thái 🌿',
    ecoScore: '98/100',
    co2Saved: 'Giảm ~3.0kg CO₂',
    image: 'https://images.unsplash.com/photo-1507034589631-9433cc6bc453?w=800&auto=format&fit=crop&q=80',
    description: 'Khám phá thiên nhiên nguyên sơ, ngắm Voọc chà vá chân nâu, viếng Chùa Linh Ứng và tắm biển.',
    stops: ['Chùa Linh Ứng Bãi Bụt', 'Đỉnh Bàn Cờ', 'Bãi biển Mỹ Khê'],
  },
];

const SUGGESTED_PROMPTS = [
  'Lên ý tưởng chuyến đi Đà Nẵng 3 ngày 2 đêm',
  'Gợi ý các quán ăn ngon nhất định phải thử tại Huế',
  'Lịch trình du lịch xanh tiết kiệm CO2 cho gia đình',
];

export default function HomeDashboardView({
  onNavigateToExplore,
  onNavigateToTrips,
  onNavigateToSaved,
  onCreateTrip,
  currentUser,
}: HomeDashboardViewProps) {
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [chatPrompt, setChatPrompt] = useState('');
  const [isGeneratingIdea, setIsGeneratingIdea] = useState(false);
  const [generatedIdea, setGeneratedIdea] = useState<{
    title: string;
    destination: string;
    days: string[];
    summary: string;
  } | null>(null);
  const [showForumModal, setShowForumModal] = useState(false);
  const [activeTabFilter, setActiveTabFilter] = useState('all');

  const displayName = currentUser?.full_name?.split(' ')[0] || 'bạn';

  // Xử lý khi gửi prompt lên ý tưởng cho chatbot
  const handleSendPrompt = (promptText?: string) => {
    const query = (promptText || chatPrompt).trim();
    if (!query) return;

    setIsGeneratingIdea(true);
    setChatPrompt(query);

    // Giả lập tạo ý tưởng thông minh cho người dùng
    setTimeout(() => {
      const isHue = /huế|hue/i.test(query);
      const destination = isHue ? 'Huế' : 'Đà Nẵng';
      setGeneratedIdea({
        title: query.length > 40 ? `Hành trình ${destination}` : query,
        destination,
        summary: `GreenTrip AI đã phác thảo hành trình tối ưu hóa cung đường và ưu tiên phương tiện giao thông xanh tại ${destination}.`,
        days: [
          `Ngày 1: Check-in, ghé quán ăn đặc sản chuẩn vị và dạo ngắm cảnh biểu tượng ${destination}`,
          `Ngày 2: Trải nghiệm văn hóa di tích lịch sử và danh lam thắng cảnh thiên nhiên`,
          `Ngày 3: Mua sắm quà lưu niệm địa phương, tận hưởng không khí thư thái trước khi trở về`,
        ],
      });
      setIsGeneratingIdea(false);
    }, 600);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#fcfcfd] overflow-y-auto no-scrollbar relative select-none">
      {/* ─── 1. TOP BAR CATEGORY PILLS (CHUẨN MINDTRIP Ở ẢNH) ─── */}
      <header className="pt-5 pb-3 px-6 sm:px-10 flex items-center justify-center shrink-0">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
          {TOP_CATEGORIES.map((cat) => {
            const isActive = activeTabFilter === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  setActiveTabFilter(isActive ? 'all' : cat.id);
                  if (cat.id === 'experiences' || cat.id === 'eats') {
                    onNavigateToExplore();
                  } else if (cat.id === 'trips') {
                    onNavigateToTrips();
                  }
                }}
                className={`h-9 px-3.5 rounded-full border transition-all cursor-pointer flex items-center gap-2 text-xs font-semibold shrink-0 shadow-2xs active:scale-95 ${
                  isActive
                    ? 'border-black bg-black text-white'
                    : 'border-gray-200/80 bg-white hover:border-gray-300 text-gray-800 hover:bg-gray-50'
                }`}
              >
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[12px] ${
                    isActive ? 'bg-white/20 text-white' : `${cat.bg} ${cat.text}`
                  }`}
                >
                  <i className={`ph ${cat.icon}`}></i>
                </span>
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>
      </header>

      {/* ─── MAIN CONTENT CONTAINER ─── */}
      <div className="max-w-5xl w-full mx-auto px-6 sm:px-10 pt-4 pb-36 flex flex-col gap-8">
        {/* ─── 2. HERO GREETING SECTION (CHUẨN MINDTRIP) ─── */}
        <section className="flex flex-col items-start gap-4">
          {/* Sparkle Assistant Avatar */}
          <div className="w-11 h-11 rounded-full bg-black flex items-center justify-center text-white shadow-md">
            <Sparkles size={20} className="fill-white" />
          </div>

          {/* Headline Text */}
          <div className="space-y-1.5 max-w-2xl">
            <h1 className="text-[22px] sm:text-[25px] font-bold text-gray-950 tracking-tight leading-snug">
              Xin chào, {displayName}. Tôi là trợ lý du lịch cá nhân của bạn.
            </h1>
            <p className="text-[14.5px] text-gray-600 leading-relaxed font-normal">
              Hãy giúp tôi tìm hiểu phong cách bạn thích đi du lịch, và tôi sẽ cá nhân hóa mọi hành trình tối ưu dành riêng cho bạn.
            </p>
          </div>

          {/* Primary CTA Button: Hoàn tất thiết lập trợ lý */}
          <button
            type="button"
            onClick={() => setIsOnboardingOpen(true)}
            className="h-10 px-5 rounded-full bg-black hover:bg-neutral-800 text-white text-[13px] font-bold transition shadow-sm active:scale-95 cursor-pointer flex items-center gap-2 group"
          >
            <span>Hoàn tất thiết lập trợ lý</span>
            <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
          </button>
        </section>

        {/* ─── 3. ROW OF 4 ACTION CARDS (CHUẨN 1:1 MINDTRIP Ở ẢNH) ─── */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* CARD 1: HOÀN TẤT THIẾT LẬP TRỢ LÝ (NAVY BLUE GRADIENT) */}
          <div
            onClick={() => setIsOnboardingOpen(true)}
            className="h-[210px] rounded-[22px] p-5 flex flex-col justify-between relative overflow-hidden cursor-pointer group shadow-sm hover:shadow-xl transition-all duration-300 bg-gradient-to-br from-[#122e57] via-[#0d213f] to-[#071324] text-white border border-white/10"
          >
            {/* Center Graphic: Pulsing Audio Waveform Circle */}
            <div className="flex-1 flex items-center justify-center">
              <div className="w-16 h-16 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-inner group-hover:scale-110 transition-transform duration-300">
                <i className="ph ph-waveform text-white text-2xl animate-pulse"></i>
              </div>
            </div>
            {/* Bottom Content */}
            <div className="relative z-10">
              <h3 className="font-bold text-[14px] leading-tight text-white group-hover:text-sky-200 transition-colors">
                Hoàn tất thiết lập trợ lý
              </h3>
              <p className="text-[11px] text-white/70 mt-1 line-clamp-1">
                Cá nhân hóa sở thích & phong cách
              </p>
            </div>
            {/* Subtle glow effect */}
            <div className="absolute inset-0 bg-radial from-sky-500/10 via-transparent to-transparent pointer-events-none" />
          </div>

          {/* CARD 2: GỢI Ý LÝ TƯỞNG CHO NGƯỜI DÙNG CHUYÊN SÂU (OCEAN BLUE GRADIENT) */}
          <div
            onClick={onNavigateToExplore}
            className="h-[210px] rounded-[22px] p-5 flex flex-col justify-between relative overflow-hidden cursor-pointer group shadow-sm hover:shadow-xl transition-all duration-300 bg-gradient-to-br from-[#1b557a] via-[#103a54] to-[#072132] text-white border border-white/10"
          >
            {/* Center Graphic: Overlapping Photo Cards */}
            <div className="flex-1 flex items-center justify-center relative">
              <div className="relative w-28 h-20 group-hover:scale-105 transition-transform duration-300">
                <div className="absolute left-0 bottom-0 w-16 h-18 rounded-lg overflow-hidden shadow-md -rotate-6 border-2 border-white/80">
                  <img
                    src="https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=300&auto=format&fit=crop&q=80"
                    alt="Chùa Linh Ứng"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="absolute right-0 top-0 w-16 h-18 rounded-lg overflow-hidden shadow-md rotate-6 border-2 border-white/80">
                  <img
                    src="https://images.unsplash.com/photo-1507034589631-9433cc6bc453?w=300&auto=format&fit=crop&q=80"
                    alt="Ẩm thực"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
            </div>
            {/* Bottom Content */}
            <div className="relative z-10">
              <h3 className="font-bold text-[14px] leading-tight text-white group-hover:text-cyan-200 transition-colors">
                Gợi ý lý tưởng chuyên sâu
              </h3>
              <p className="text-[11px] text-white/70 mt-1 line-clamp-1">
                Điểm đến chọn lọc, local & hidden gems
              </p>
            </div>
            <div className="absolute inset-0 bg-radial from-cyan-500/10 via-transparent to-transparent pointer-events-none" />
          </div>

          {/* CARD 3: LÊN KẾ HOẠCH CHUYẾN ĐI (TERRACOTTA RUST GRADIENT) */}
          <div
            onClick={() => onCreateTrip('Đà Nẵng', 'Chuyến đi của tôi')}
            className="h-[210px] rounded-[22px] p-5 flex flex-col justify-between relative overflow-hidden cursor-pointer group shadow-sm hover:shadow-xl transition-all duration-300 bg-gradient-to-br from-[#7d321c] via-[#5c2211] to-[#381105] text-white border border-white/10"
          >
            {/* Center Graphic: Mockup Card Itinerary */}
            <div className="flex-1 flex items-center justify-center">
              <div className="w-36 bg-white/95 rounded-xl shadow-lg p-2 text-left group-hover:scale-105 transition-transform duration-300 -rotate-2 group-hover:rotate-0">
                <div className="flex items-center justify-between pb-1 border-b border-gray-100">
                  <span className="text-[9px] font-bold text-gray-900 truncate">Đà Nẵng & Huế</span>
                  <span className="text-[8px] px-1 py-0.2 rounded-full bg-orange-100 text-orange-700 font-bold">Lịch trình</span>
                </div>
                <div className="mt-1 space-y-0.5">
                  <div className="text-[8.5px] font-bold text-gray-800 truncate">Ngày 1: Cầu Rồng & Biển</div>
                  <div className="text-[7.5px] text-gray-500 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    <span>3 điểm ghé thăm</span>
                  </div>
                </div>
              </div>
            </div>
            {/* Bottom Content */}
            <div className="relative z-10">
              <h3 className="font-bold text-[14px] leading-tight text-white group-hover:text-amber-200 transition-colors">
                Lên kế hoạch chuyến đi
              </h3>
              <p className="text-[11px] text-white/70 mt-1 line-clamp-1">
                Tự xếp lịch hoặc để AI tối ưu
              </p>
            </div>
            <div className="absolute inset-0 bg-radial from-amber-500/10 via-transparent to-transparent pointer-events-none" />
          </div>

          {/* CARD 4: DIỄN ĐÀN & GÓI ĐỊA ĐIỂM MUST-TRY (FOREST GREEN GRADIENT) */}
          <div
            onClick={() => setShowForumModal(true)}
            className="h-[210px] rounded-[22px] p-5 flex flex-col justify-between relative overflow-hidden cursor-pointer group shadow-sm hover:shadow-xl transition-all duration-300 bg-gradient-to-br from-[#1d4c2b] via-[#12361d] to-[#091f10] text-white border border-white/10"
          >
            {/* Center Graphic: Receipt / Checklist Voucher */}
            <div className="flex-1 flex items-center justify-center">
              <div className="w-20 bg-white/95 rounded-t-lg rounded-b-sm shadow-lg p-2.5 text-center group-hover:scale-105 transition-transform duration-300 border-b-2 border-dashed border-gray-300">
                <div className="text-[8px] font-extrabold text-emerald-800 tracking-wider">MUST TRY</div>
                <div className="my-1.5 border-t border-gray-200"></div>
                <div className="space-y-1">
                  <div className="w-full h-1 bg-gray-200 rounded-full"></div>
                  <div className="w-3/4 h-1 bg-gray-200 rounded-full mx-auto"></div>
                  <div className="w-1/2 h-1 bg-emerald-400 rounded-full mx-auto"></div>
                </div>
              </div>
            </div>
            {/* Bottom Content */}
            <div className="relative z-10">
              <h3 className="font-bold text-[14px] leading-tight text-white group-hover:text-emerald-200 transition-colors">
                Diễn đàn & Gói Must-Try
              </h3>
              <p className="text-[11px] text-white/70 mt-1 line-clamp-1">
                Gói điểm đến & kinh nghiệm du lịch xanh
              </p>
            </div>
            <div className="absolute inset-0 bg-radial from-emerald-500/10 via-transparent to-transparent pointer-events-none" />
          </div>
        </section>

        {/* ─── 4. PHẦN DIỄN ĐÀN GÓI ĐỊA ĐIỂM MUST-TRY (CHO NGƯỜI DÙNG THAM KHẢO) ─── */}
        <section className="space-y-4 pt-2">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[18px] font-bold text-gray-950 flex items-center gap-2">
                <span>Gói địa điểm Must-Try cho chuyến đi</span>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Du lịch xanh
                </span>
              </h2>
              <p className="text-[13px] text-gray-500 mt-0.5">
                Các gói hành trình được tuyển chọn kỹ lưỡng, tối ưu khoảng cách và chỉ số bảo vệ môi trường.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowForumModal(true)}
              className="text-xs font-bold text-gray-700 hover:text-black flex items-center gap-1 cursor-pointer"
            >
              <span>Xem diễn đàn</span>
              <ChevronRight size={14} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {MUST_TRY_PACKAGES.map((pkg) => (
              <div
                key={pkg.id}
                className="bg-white rounded-2xl border border-gray-200/90 shadow-2xs hover:shadow-md transition-all overflow-hidden flex flex-col group select-none"
              >
                <div className="h-40 relative overflow-hidden bg-gray-100">
                  <img
                    src={pkg.image}
                    alt={pkg.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 pointer-events-none"
                  />
                  <div className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-full bg-black/70 backdrop-blur-xs text-white text-[10.5px] font-bold">
                    {pkg.badge}
                  </div>
                  <div className="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-bold flex items-center gap-1 shadow-xs">
                    <Leaf size={10} />
                    <span>{pkg.co2Saved}</span>
                  </div>
                </div>

                <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                  <div>
                    <div className="text-[11px] font-bold text-gray-400 flex items-center gap-1.5">
                      <MapPin size={11} className="text-gray-400" />
                      <span>{pkg.destination}</span>
                      <span>•</span>
                      <Clock size={11} className="text-gray-400" />
                      <span>{pkg.duration}</span>
                    </div>
                    <h3 className="font-bold text-[14px] text-gray-950 mt-1 line-clamp-1 group-hover:text-black">
                      {pkg.title}
                    </h3>
                    <p className="text-[12px] text-gray-500 mt-1 line-clamp-2 leading-relaxed">
                      {pkg.description}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                      Điểm xanh: {pkg.ecoScore}
                    </span>
                    <button
                      type="button"
                      onClick={() => onCreateTrip(pkg.destination, pkg.title)}
                      className="px-3 py-1.5 rounded-full bg-black hover:bg-neutral-800 text-white text-xs font-bold transition shadow-2xs cursor-pointer active:scale-95 flex items-center gap-1"
                    >
                      <Plus size={12} />
                      <span>Chọn gói này</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ─── 5. FLOATING CHATBOT "ASK GREENTRIP" BAR (CHUẨN 1:1 MINDTRIP Ở ẢNH) ─── */}
      <div className="fixed bottom-6 inset-x-0 z-40 flex flex-col items-center pointer-events-none px-4">
        {/* Quick prompt suggestions chips (gợi ý khi chưa biết đi đâu) */}
        <div className="mb-2.5 flex items-center gap-2 overflow-x-auto max-w-2xl w-full justify-center pointer-events-auto no-scrollbar">
          {SUGGESTED_PROMPTS.map((prompt, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleSendPrompt(prompt)}
              className="whitespace-nowrap px-3 py-1 rounded-full bg-white/95 backdrop-blur-md border border-gray-200/90 hover:border-black text-[11.5px] font-medium text-gray-700 hover:text-black transition shadow-2xs cursor-pointer active:scale-95"
            >
              💡 {prompt}
            </button>
          ))}
        </div>

        {/* Floating Input Pill Bar */}
        <div className="w-full max-w-2xl bg-white/95 backdrop-blur-xl border border-gray-200/90 rounded-full shadow-[0_12px_36px_rgba(0,0,0,0.12)] p-2 pl-3 flex items-center gap-2 pointer-events-auto transition-all focus-within:ring-2 focus-within:ring-black">
          {/* Nút + Tùy chọn */}
          <button
            type="button"
            onClick={() => setIsOnboardingOpen(true)}
            className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-600 hover:text-black transition cursor-pointer shrink-0"
            title="Thêm yêu cầu hoặc mở khảo sát sở thích"
          >
            <Plus size={17} />
          </button>

          {/* Ô nhập Ask Chatbot */}
          <input
            type="text"
            value={chatPrompt}
            onChange={(e) => setChatPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSendPrompt();
            }}
            placeholder="Hỏi GreenTrip AI... (Lên ý tưởng chuyến đi, hỏi thời tiết, quán ăn ngon...)"
            className="flex-1 bg-transparent text-[13.5px] text-gray-900 placeholder-gray-400 focus:outline-none min-w-0"
          />

          {/* Right Action Icons: Microphone + Waveform / Send */}
          <div className="flex items-center gap-1.5 shrink-0 pr-1">
            <button
              type="button"
              onClick={() => handleSendPrompt('Gợi ý cho tôi chuyến đi xanh 2 ngày tại Đà Nẵng')}
              className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500 hover:text-black transition cursor-pointer"
              title="Nhập bằng giọng nói (Voice)"
            >
              <Mic size={17} />
            </button>

            {chatPrompt.trim() ? (
              <button
                type="button"
                onClick={() => handleSendPrompt()}
                disabled={isGeneratingIdea}
                className="w-8 h-8 rounded-full bg-black text-white hover:bg-neutral-800 flex items-center justify-center transition shadow-xs cursor-pointer active:scale-95"
                title="Gửi câu hỏi"
              >
                <Send size={14} />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleSendPrompt('Lên ý tưởng lịch trình ngẫu nhiên')}
                className="w-8 h-8 rounded-full bg-black text-white hover:bg-neutral-800 flex items-center justify-center transition shadow-xs cursor-pointer active:scale-95"
                title="Kích hoạt trợ lý AI"
              >
                <i className="ph ph-waveform text-white text-[15px]"></i>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ─── POPUP TRẢ LỜI Ý TƯỞNG CỦA CHATBOT (KHI NGƯỜI DÙNG HỎI) ─── */}
      {generatedIdea && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-gray-100 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-black text-white flex items-center justify-center">
                  <Sparkles size={14} className="fill-white" />
                </div>
                <h3 className="font-bold text-[15px] text-gray-950">
                  Gợi ý từ Trợ lý GreenTrip AI
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setGeneratedIdea(null)}
                className="w-7 h-7 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-black cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-2">
              <h4 className="font-extrabold text-[16px] text-gray-950">
                {generatedIdea.title}
              </h4>
              <p className="text-[13px] text-gray-600 leading-relaxed">
                {generatedIdea.summary}
              </p>
            </div>

            <div className="bg-gray-50 rounded-2xl p-3.5 space-y-2 border border-gray-100">
              <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                Khung lịch trình đề xuất:
              </div>
              {generatedIdea.days.map((dayText, idx) => (
                <div key={idx} className="flex items-start gap-2 text-xs text-gray-800 font-medium">
                  <CheckCircle2 size={14} className="text-emerald-600 shrink-0 mt-0.5" />
                  <span>{dayText}</span>
                </div>
              ))}
            </div>

            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setGeneratedIdea(null)}
                className="px-4 py-2 rounded-full border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 cursor-pointer"
              >
                Đóng
              </button>
              <button
                type="button"
                onClick={() => {
                  onCreateTrip(generatedIdea.destination, generatedIdea.title);
                  setGeneratedIdea(null);
                }}
                className="px-5 py-2 rounded-full bg-black hover:bg-neutral-800 text-white text-xs font-bold shadow-xs cursor-pointer active:scale-95 flex items-center gap-1.5"
              >
                <CalendarPlus size={14} />
                <span>Tạo lịch trình từ ý tưởng này</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL DIỄN ĐÀN & CẨM NANG DU LỊCH MUST-TRY ─── */}
      {showForumModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <i className="ph ph-chat-centered-text text-xl text-black"></i>
                <h3 className="font-bold text-[16px] text-gray-950">
                  Diễn đàn & Gói địa điểm Must-Try
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowForumModal(false)}
                className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500 hover:text-black cursor-pointer"
              >
                <X size={17} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              <p className="text-[13.5px] text-gray-600 leading-relaxed">
                Nơi tổng hợp các gói địa điểm, lịch trình chuẩn và đánh giá từ cộng đồng du khách xanh. Chọn một gói bất kỳ để đưa thẳng vào kế hoạch của bạn:
              </p>

              <div className="space-y-4">
                {MUST_TRY_PACKAGES.map((pkg) => (
                  <div
                    key={pkg.id}
                    className="p-4 rounded-2xl border border-gray-200/90 hover:border-black transition flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between bg-white"
                  >
                    <div className="space-y-1 max-w-md">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                          {pkg.badge}
                        </span>
                        <span className="text-xs text-gray-400 font-medium">{pkg.duration}</span>
                      </div>
                      <h4 className="font-bold text-[14px] text-gray-950">{pkg.title}</h4>
                      <p className="text-xs text-gray-500 line-clamp-1">{pkg.description}</p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        onCreateTrip(pkg.destination, pkg.title);
                        setShowForumModal(false);
                      }}
                      className="px-4 py-2 rounded-full bg-black text-white text-xs font-bold hover:bg-neutral-800 transition shrink-0 cursor-pointer shadow-xs active:scale-95"
                    >
                      + Lên lịch trình ngay
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── ONBOARDING MODAL (KHẢO SÁT THIẾT LẬP NGƯỜI DÙNG CỦA BẠN) ─── */}
      <OnboardingModal
        isOpen={isOnboardingOpen}
        onClose={() => setIsOnboardingOpen(false)}
      />
    </div>
  );
}
