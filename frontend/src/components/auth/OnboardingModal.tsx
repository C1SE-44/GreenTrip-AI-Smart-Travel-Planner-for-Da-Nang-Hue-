import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Leaf, X, MapPin, ChevronLeft, Minus, Plus, Calendar } from 'lucide-react';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const MOCK_LOCATIONS = [
  { id: 1, name: 'Đà Nẵng', sub: 'Việt Nam', type: 'image', img: 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=100&h=100&fit=crop' },
  { id: 2, name: 'Đà Lạt', sub: 'Lâm Đồng, Việt Nam', type: 'image', img: 'https://images.unsplash.com/photo-1623067866504-20412b1898fb?w=100&h=100&fit=crop' },
  { id: 3, name: 'Dallas', sub: 'Texas, Hoa Kỳ', type: 'image', img: 'https://images.unsplash.com/photo-1542838686-37ed7a7ef3f3?w=100&h=100&fit=crop' },
  { id: 4, name: 'Dakar', sub: 'Senegal', type: 'image', img: 'https://images.unsplash.com/photo-1523805009345-7448845a9e53?w=100&h=100&fit=crop' },
  { id: 5, name: 'Hà Nội', sub: 'Việt Nam', type: 'image', img: 'https://images.unsplash.com/photo-1583417319070-4a69db38a482?w=100&h=100&fit=crop' },
  { id: 6, name: 'Hồ Chí Minh', sub: 'Việt Nam', type: 'image', img: 'https://images.unsplash.com/photo-1583417319070-4a69db38a482?w=100&h=100&fit=crop' },
  { id: 7, name: 'Hội An', sub: 'Quảng Nam, Việt Nam', type: 'image', img: 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=100&h=100&fit=crop' },
  { id: 8, name: 'Huế', sub: 'Thừa Thiên Huế, Việt Nam', type: 'image', img: 'https://images.unsplash.com/photo-1583417319070-4a69db38a482?w=100&h=100&fit=crop' },
  { id: 9, name: 'Nha Trang', sub: 'Khánh Hòa, Việt Nam', type: 'image', img: 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=100&h=100&fit=crop' },
  { id: 10, name: 'Phú Quốc', sub: 'Kiên Giang, Việt Nam', type: 'image', img: 'https://images.unsplash.com/photo-1623067866504-20412b1898fb?w=100&h=100&fit=crop' },
  { id: 11, name: 'Vũng Tàu', sub: 'Bà Rịa - Vũng Tàu, Việt Nam', type: 'image', img: 'https://images.unsplash.com/photo-1542838686-37ed7a7ef3f3?w=100&h=100&fit=crop' },
  { id: 12, name: 'Sapa', sub: 'Lào Cai, Việt Nam', type: 'image', img: 'https://images.unsplash.com/photo-1523805009345-7448845a9e53?w=100&h=100&fit=crop' },
  { id: 13, name: 'Quy Nhơn', sub: 'Bình Định, Việt Nam', type: 'image', img: 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=100&h=100&fit=crop' },
  { id: 14, name: 'Cần Thơ', sub: 'Việt Nam', type: 'image', img: 'https://images.unsplash.com/photo-1583417319070-4a69db38a482?w=100&h=100&fit=crop' },
  { id: 15, name: 'Đồng Hới', sub: 'Quảng Bình, Việt Nam', type: 'image', img: 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=100&h=100&fit=crop' },
  { id: 16, name: 'Mũi Né', sub: 'Bình Thuận, Việt Nam', type: 'image', img: 'https://images.unsplash.com/photo-1623067866504-20412b1898fb?w=100&h=100&fit=crop' },
  { id: 17, name: 'Hạ Long', sub: 'Quảng Ninh, Việt Nam', type: 'image', img: 'https://images.unsplash.com/photo-150861194942-f883de0bce24?w=100&h=100&fit=crop' },
  { id: 18, name: 'Hải Phòng', sub: 'Việt Nam', type: 'image', img: 'https://images.unsplash.com/photo-1599839619722-39751411ea63?w=100&h=100&fit=crop' }
];

export default function OnboardingModal({ isOpen, onClose }: OnboardingModalProps) {
  const [mounted, setMounted] = useState(false);
  
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [city, setCity] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [step, setStep] = useState(1);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [step]);
  const [personality, setPersonality] = useState('binh_thuong');
  const [hasPlan, setHasPlan] = useState<boolean | null>(null);
  const [tripDetails, setTripDetails] = useState('');
  const [showWhoModal, setShowWhoModal] = useState(false);
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [infants, setInfants] = useState(0);
  const [pets, setPets] = useState(0);
  const [showWhenModal, setShowWhenModal] = useState(false);
  const [whenTab, setWhenTab] = useState('dates');
  const [flexibleDays, setFlexibleDays] = useState(5);
  const [showWhereModal, setShowWhereModal] = useState(false);
  const [whereTarget, setWhereTarget] = useState('');
  const [byCar, setByCar] = useState(false);
  const [companions, setCompanions] = useState<string[]>([]);
  const [budget, setBudget] = useState<string>('');
  const [splurges, setSplurges] = useState<string[]>([]);
  const [otherSplurge, setOtherSplurge] = useState('');
  const [restaurants, setRestaurants] = useState<string[]>([]);
  const [otherRestaurant, setOtherRestaurant] = useState('');
  const [diets, setDiets] = useState<string[]>([]);
  const [otherDiet, setOtherDiet] = useState('');
  const [activities, setActivities] = useState<string[]>([]);
  const [otherActivity, setOtherActivity] = useState('');
  const [finalNotes, setFinalNotes] = useState('');
  const [isReady, setIsReady] = useState(false);
  
  useEffect(() => {
    if (step === 7) {
      const timer = setTimeout(() => setIsReady(true), 2500);
      return () => clearTimeout(timer);
    }
  }, [step]);

  const handleSkip = () => {
    localStorage.setItem('greentrip_onboarding_completed', 'true');
    onClose();
  };

  const handleFinish = () => {
    try {
      const profile = {
        firstName,
        lastName,
        city,
        personality,
        hasPlan,
        tripDetails,
        companions,
        budget,
        splurges,
        restaurants,
        diets,
        activities,
        finalNotes,
        completedAt: new Date().toISOString(),
      };
      localStorage.setItem('greentrip_onboarding_profile', JSON.stringify(profile));
      localStorage.setItem('greentrip_onboarding_completed', 'true');
    } catch {
      // Ignore local storage write errors
    }
    onClose();
  };

  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      document.body.style.overflow = 'hidden';
      // Pre-fill profile if already exists
      try {
        const saved = localStorage.getItem('greentrip_onboarding_profile');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.firstName && !firstName) setFirstName(parsed.firstName);
          if (parsed.lastName && !lastName) setLastName(parsed.lastName);
          if (parsed.city && !city) setCity(parsed.city);
        }
      } catch {
        // Ignore local storage read errors
      }
    } else {
      setTimeout(() => setMounted(false), 300);
      document.body.style.overflow = 'auto';
    }
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, [isOpen]);

  if (!mounted) return null;

  const removeAccents = (str: string) => {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  };

  const searchTerm = removeAccents(city);
  
  const filteredLocations = city.length > 0 
    ? MOCK_LOCATIONS.filter(loc => removeAccents(loc.name).includes(searchTerm))
    : [];

  const isFormValid = firstName.length > 0 && lastName.length > 0 && city.length > 0;

  const renderHighlightedText = (text: string, highlight: string) => {
    if (!highlight.trim()) return text;
    const cleanHighlight = removeAccents(highlight);
    const cleanText = removeAccents(text);
    const index = cleanText.indexOf(cleanHighlight);
    
    if (index === -1) return text;
    
    return (
      <>
        {text.substring(0, index)}
        <span className="font-bold text-black">{text.substring(index, index + highlight.length)}</span>
        {text.substring(index + highlight.length)}
      </>
    );
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex bg-white animate-fadeIn h-screen w-screen overflow-hidden">
      {/* Left Column (Content) */}
      <div className="relative flex w-full lg:w-1/2 flex-col h-full bg-white">
        {/* Top Header: Close & Skip Button */}
        <div className="absolute top-6 left-6 right-6 z-10 flex items-center justify-between">
          <button
            onClick={handleSkip}
            className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-gray-100 transition-colors text-black cursor-pointer"
            title="Đóng"
          >
            <X size={20} strokeWidth={2} />
          </button>

          <button
            onClick={handleSkip}
            className="text-[13px] font-semibold text-gray-500 hover:text-black px-4 py-1.5 rounded-full hover:bg-gray-100 transition-all cursor-pointer"
          >
            Bỏ qua bước này
          </button>
        </div>

        {/* Content Area - Natural Scroll */}
        <div ref={scrollRef} className="flex-1 flex flex-col px-10 lg:px-24 w-full max-w-2xl mx-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] overflow-y-auto">
          
          <div className="max-w-[420px] w-full pt-20 pb-16">
            {/* Logo / Icon */}
            <div className="mb-6 flex h-10 w-10 items-center justify-center rounded-full bg-black">
              <Leaf size={20} strokeWidth={2.5} className="text-white" />
            </div>

            {step === 1 && (
              <div className="animate-fadeIn space-y-8">
                <div>
                  <h2 className="font-heading text-3xl font-extrabold tracking-tight text-black mb-4 leading-tight pr-4">
                    Xin chào, tôi là trợ lý du lịch của bạn.
                  </h2>
                  <p className="text-[14px] font-light leading-[1.6] text-gray-700 mb-8">
                    Để cá nhân hóa trải nghiệm và đề xuất lịch trình phù hợp nhất, hãy chia sẻ một vài thông tin cơ bản về bạn.
                  </p>
                </div>

                <div>
                  <label className="mb-3 block text-[13px] font-bold text-black">
                    Tên của bạn là gì?
                  </label>
                  <div className="flex gap-4">
                    <input
                      type="text"
                      placeholder="Tên"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="w-full rounded-full border border-gray-200 px-5 py-3 text-[14px] font-light text-gray-900 placeholder:text-gray-400 focus:border-black focus:outline-none focus:ring-1 focus:ring-black transition-all"
                    />
                    <input
                      type="text"
                      placeholder="Họ"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="w-full rounded-full border border-gray-200 px-5 py-3 text-[14px] font-light text-gray-900 placeholder:text-gray-400 focus:border-black focus:outline-none focus:ring-1 focus:ring-black transition-all"
                    />
                  </div>
                </div>

                <div className="relative">
                  {showSuggestions && city && filteredLocations.length > 0 && (
                    <div className="absolute bottom-full left-0 w-full mb-3 rounded-2xl border border-gray-200 bg-white shadow-xl py-2 z-20 max-h-[240px] overflow-y-auto">
                      <button 
                        onClick={() => { setCity(city); setShowSuggestions(false); }}
                        className="w-full px-4 py-2.5 hover:bg-gray-50 flex items-center gap-4 text-left transition-colors"
                      >
                        <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                          <MapPin size={18} className="text-gray-600" />
                        </div>
                        <div className="text-[14px] font-light text-gray-900 truncate">
                          {renderHighlightedText(`Khu vực ${city}`, city)}
                        </div>
                      </button>
                      
                      {filteredLocations.map(loc => (
                        <button 
                          key={loc.id}
                          onClick={() => { setCity(loc.name); setShowSuggestions(false); }}
                          className="w-full px-4 py-2.5 hover:bg-gray-50 flex items-center gap-4 text-left transition-colors"
                        >
                          <img src={loc.img} alt={loc.name} className="w-10 h-10 rounded-lg object-cover shrink-0" />
                          <div className="text-[14px] font-light text-gray-900 truncate">
                            {renderHighlightedText(loc.name, city)}, <span className="text-gray-500">{renderHighlightedText(loc.sub, city)}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  <label className="mb-3 block text-[13px] font-bold text-black">
                    Bạn sống ở đâu?
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Thành phố"
                      value={city}
                      onChange={(e) => {
                        setCity(e.target.value);
                        setShowSuggestions(true);
                      }}
                      onFocus={() => setShowSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                      className="w-full rounded-full border border-gray-200 px-5 py-3 pr-12 text-[14px] font-light text-gray-900 placeholder:text-gray-400 focus:border-black focus:outline-none focus:ring-1 focus:ring-black transition-all"
                    />
                    {city && (
                      <button 
                        onClick={() => { setCity(''); setShowSuggestions(false); }}
                        className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center justify-center w-5 h-5 rounded-full bg-gray-200 hover:bg-gray-300 text-gray-600 transition-colors"
                      >
                        <X size={12} strokeWidth={3} />
                      </button>
                    )}
                  </div>
                  {/* Quick City Suggestions */}
                  <div className="flex gap-2 mt-2.5 flex-wrap">
                    {['Đà Nẵng', 'Huế', 'Hội An', 'Hà Nội', 'TP. Hồ Chí Minh'].map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => { setCity(c); setShowSuggestions(false); }}
                        className={`text-[12px] px-3 py-1 rounded-full border transition-all cursor-pointer ${
                          city === c ? 'border-black bg-black text-white font-semibold' : 'border-gray-200 text-gray-600 hover:border-gray-400 bg-white'
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Progress and Actions - Step 1 */}
                <div className="mt-12">
                  <div className="mb-5 h-1 w-full bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full w-1/6 bg-black transition-all duration-500"></div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-bold text-gray-400">Cơ bản</span>
                    <button
                      onClick={() => setStep(2)}
                      disabled={!isFormValid}
                      className={`rounded-full px-8 py-2.5 text-[14px] font-bold text-white transition-all ${isFormValid ? 'bg-black hover:bg-gray-900' : 'bg-[#B0B0B0] cursor-not-allowed'}`}
                    >
                      Kế tiếp
                    </button>
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="animate-fadeIn">
                <h2 className="font-heading text-3xl font-extrabold tracking-tight text-black mb-8 leading-tight pr-4">
                  Bạn muốn cuộc trò chuyện của chúng ta diễn ra như thế nào?
                </h2>
                
                {/* Personality Options */}
                <div>
                  <label className="mb-4 block text-[15px] font-bold text-black">
                    Nhân cách
                  </label>
                  <div className="space-y-3">
                    <button
                      onClick={() => setPersonality('binh_thuong')}
                      className={`w-full text-left rounded-[16px] px-5 py-3.5 border transition-all ${personality === 'binh_thuong' ? 'border-black ring-1 ring-black' : 'border-gray-200 hover:border-gray-300'}`}
                    >
                      <div className="font-bold text-black text-[14px] mb-1">Bình thường</div>
                      <div className="text-[13px] text-gray-500 font-light">Vui vẻ, coi việc lập kế hoạch là một hoạt động thú vị.</div>
                    </button>
                    
                    <button
                      onClick={() => setPersonality('trung_lap')}
                      className={`w-full text-left rounded-[16px] px-5 py-3.5 border transition-all ${personality === 'trung_lap' ? 'border-black ring-1 ring-black' : 'border-gray-200 hover:border-gray-300'}`}
                    >
                      <div className="font-bold text-black text-[14px] mb-1">Trung lập</div>
                      <div className="text-[13px] text-gray-500 font-light">Rõ ràng, mạch lạc, hữu ích. Có chính kiến khi được hỏi, không nịnh hót.</div>
                    </button>

                    <button
                      onClick={() => setPersonality('chuyen_nghiep')}
                      className={`w-full text-left rounded-[16px] px-5 py-3.5 border transition-all ${personality === 'chuyen_nghiep' ? 'border-black ring-1 ring-black' : 'border-gray-200 hover:border-gray-300'}`}
                    >
                      <div className="font-bold text-black text-[14px] mb-1">Chuyên nghiệp</div>
                      <div className="text-[13px] text-gray-500 font-light">Có năng lực và hiệu quả. Thân thiện nhưng không quá thân mật.</div>
                    </button>
                  </div>
                </div>

                {/* Progress and Actions - Step 2 */}
                <div className="mt-16">
                  <div className="mb-5 h-1 w-full bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full w-2/6 bg-black transition-all duration-500"></div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <button onClick={() => setStep(1)} className="flex items-center gap-1.5 text-[12px] font-bold text-gray-400 hover:text-black transition-colors">
                      <ChevronLeft size={16} /> Cá tính
                    </button>
                    <button
                      onClick={() => setStep(3)}
                      className="rounded-full bg-black px-8 py-2.5 text-[14px] font-bold text-white hover:bg-gray-900 transition-all"
                    >
                      Kế tiếp
                    </button>
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="animate-fadeIn">
                <h2 className="font-heading text-3xl font-extrabold tracking-tight text-black mb-6 leading-tight pr-4">
                  Bạn đã có kế hoạch cho chuyến đi nào chưa?
                </h2>
                
                <div className="flex gap-3 mb-6">
                  <button
                    onClick={() => setHasPlan(true)}
                    className={`px-6 py-2 rounded-full text-[13px] font-bold transition-all ${hasPlan === true ? 'bg-black text-white' : 'border border-gray-200 text-black hover:border-gray-300'}`}
                  >
                    Đúng
                  </button>
                  <button
                    onClick={() => setHasPlan(false)}
                    className={`px-5 py-2 rounded-full text-[13px] font-bold transition-all cursor-pointer ${hasPlan === false ? 'bg-black text-white' : 'border border-gray-200 text-black hover:border-gray-300'}`}
                  >
                    Tôi đang tìm cảm hứng (chưa có ngày)
                  </button>
                </div>

                {hasPlan === true && (
                  <div className="animate-fadeIn">
                    <div className="relative mb-6">
                      <textarea
                        placeholder="5-day Tokyo trip this Octob"
                        value={tripDetails}
                        onChange={(e) => setTripDetails(e.target.value)}
                        className="w-full rounded-[16px] border border-gray-200 p-4 text-[14px] font-light text-gray-900 placeholder:text-gray-400 focus:border-black focus:outline-none focus:ring-1 focus:ring-black transition-all resize-none h-28"
                      />
                      <div className="absolute bottom-4 right-4 flex items-center justify-end">
                        <span className="text-[11px] text-gray-400">{tripDetails.length} / 2000</span>
                      </div>
                    </div>

                    <p className="text-[13px] text-gray-500 mb-3">Bạn có thông tin chi tiết? Hãy chia sẻ những gì bạn biết.</p>

                    <div className="space-y-3">
                      <button onClick={() => setShowWhereModal(true)} className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-gray-200 hover:border-gray-300 transition-colors bg-white">
                        <span className="text-[13.5px] font-bold text-black">Ở đâu</span>
                        <span className="text-[13px] font-light text-gray-500">{whereTarget || 'Chọn điểm đến'}</span>
                      </button>
                      <button onClick={() => setShowWhenModal(true)} className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-gray-200 hover:border-gray-300 transition-colors bg-white">
                        <span className="text-[13.5px] font-bold text-black">Khi</span>
                        <span className="text-[13px] font-light text-gray-500">Chọn ngày</span>
                      </button>
                      <button onClick={() => setShowWhoModal(true)} className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-gray-200 hover:border-gray-300 transition-colors bg-white">
                        <span className="text-[13.5px] font-bold text-black">Ai</span>
                        <span className="text-[13px] font-light text-gray-500">{adults + children + infants + pets > 0 ? `${adults + children + infants + pets} du khách` : 'Thêm người'}</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Progress and Actions - Step 3 */}
                <div className="mt-12">
                  <div className="mb-5 h-1 w-full bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full w-3/6 bg-black transition-all duration-500"></div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <button onClick={() => setStep(2)} className="flex items-center gap-1.5 text-[12px] font-bold text-gray-400 hover:text-black transition-colors">
                      <ChevronLeft size={16} /> Chuyến đi tiếp theo của bạn
                    </button>
                    <button
                      onClick={() => {
                        if (hasPlan === null) setHasPlan(false);
                        setStep(4);
                      }}
                      className="rounded-full px-8 py-2.5 text-[14px] font-bold text-white transition-all bg-black hover:bg-gray-900 cursor-pointer shadow-xs active:scale-[0.98]"
                    >
                      Kế tiếp
                    </button>
                  </div>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="animate-fadeIn">
                <h2 className="font-heading text-3xl font-extrabold tracking-tight text-black mb-4 leading-tight pr-4">
                  Hãy kể cho tôi một chút về chuyến đi của bạn.
                </h2>
                <p className="text-[14px] font-light leading-[1.6] text-gray-700 mb-8">
                  Hãy chia sẻ những điều quan trọng đối với bạn khi đi du lịch.
                </p>

                <div className="space-y-8">
                  <div>
                    <label className="mb-3 block text-[13.5px] font-bold text-black">
                      Bạn thường đi du lịch với ai?
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {['Độc lập', 'Cặp đôi', 'Gia đình', 'Bạn'].map(comp => {
                        const isSelected = companions.includes(comp);
                        return (
                          <button
                            key={comp}
                            onClick={() => {
                              if (isSelected) setCompanions(companions.filter(c => c !== comp));
                              else setCompanions([...companions, comp]);
                            }}
                            className={`px-5 py-2 rounded-full text-[13px] transition-all ${isSelected ? 'bg-white border-2 border-black font-bold text-black' : 'bg-white border border-gray-200 text-black hover:border-gray-400'}`}
                          >
                            {comp}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="mb-3 block text-[13.5px] font-bold text-black">
                      Ngân sách du lịch điển hình của bạn thường được mô tả như thế nào?
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {['Với ngân sách hạn chế', '$$ Giá cả hợp lý', '$$$ Cao cấp', '$$$$ Sang trọng'].map(b => (
                        <button
                          key={b}
                          onClick={() => setBudget(b)}
                          className={`px-5 py-2 rounded-full text-[13px] transition-all ${budget === b ? 'bg-white border-2 border-black font-bold text-black' : 'bg-white border border-gray-200 text-black hover:border-gray-400'}`}
                        >
                          {b}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="mb-3 block text-[13.5px] font-bold text-black">
                      Bạn thường chi tiêu mạnh tay vào những việc gì?
                    </label>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {['Ở lại', 'Nhà hàng', 'Trải nghiệm', 'Khác'].map(s => {
                        const isSelected = splurges.includes(s);
                        return (
                          <button
                            key={s}
                            onClick={() => {
                              if (isSelected) setSplurges(splurges.filter(i => i !== s));
                              else setSplurges([...splurges, s]);
                            }}
                            className={`px-5 py-2 rounded-full text-[13px] transition-all ${isSelected ? 'bg-white border-2 border-black font-bold text-black' : 'bg-white border border-gray-200 text-black hover:border-gray-400'}`}
                          >
                            {s}
                          </button>
                        );
                      })}
                    </div>
                    {splurges.includes('Khác') && (
                      <input
                        type="text"
                        placeholder="Tell us more"
                        value={otherSplurge}
                        onChange={(e) => setOtherSplurge(e.target.value)}
                        className="w-full rounded-full border border-gray-300 px-5 py-2.5 text-[14px] font-light text-gray-900 placeholder:text-gray-400 focus:border-black focus:outline-none focus:ring-1 focus:ring-black transition-all"
                      />
                    )}
                  </div>
                </div>

                {/* Progress and Actions - Step 4 */}
                <div className="mt-12">
                  <div className="mb-5 h-1 w-full bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full w-4/6 bg-black transition-all duration-500"></div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <button onClick={() => setStep(3)} className="flex items-center gap-1.5 text-[12px] font-bold text-gray-400 hover:text-black transition-colors">
                      <ChevronLeft size={16} /> Phong cách du lịch
                    </button>
                    <button
                      onClick={() => setStep(5)}
                      disabled={!budget}
                      className={`rounded-full px-8 py-2.5 text-[14px] font-bold text-white transition-all ${budget ? 'bg-black hover:bg-gray-900' : 'bg-[#B0B0B0] cursor-not-allowed'}`}
                    >
                      Kế tiếp
                    </button>
                  </div>
                </div>
              </div>
            )}

            {step === 5 && (
              <div className="animate-fadeIn">
                <h2 className="font-heading text-3xl font-extrabold tracking-tight text-black mb-8 leading-tight pr-4">
                  Hãy chia sẻ một chút về sở thích ăn uống của bạn.
                </h2>

                <div className="space-y-8">
                  <div>
                    <label className="mb-4 block text-[13.5px] font-bold text-black">
                      Bạn thích loại nhà hàng nào?
                    </label>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {['Ẩm thực cao cấp & món ngon', 'Đồ ăn đường phố địa phương', 'Quán cà phê/quán ăn nhỏ', 'Nhà hàng gia đình', 'Quán ăn chay/thuần chay', 'Xe bán đồ ăn lưu động', 'Ẩm thực dân tộc', 'Từ nông trại đến bàn ăn', 'Thức ăn nhanh', 'Đồ ăn quán rượu/quán bar', 'Tiệm bánh', 'Quán cà phê', 'Khác'].map(r => {
                        const isSelected = restaurants.includes(r);
                        return (
                          <button
                            key={r}
                            onClick={() => {
                              if (isSelected) setRestaurants(restaurants.filter(i => i !== r));
                              else setRestaurants([...restaurants, r]);
                            }}
                            className={`px-5 py-2 rounded-full text-[13px] transition-all flex items-center gap-2 ${isSelected ? 'bg-white border-2 border-black font-bold text-black' : 'bg-white border border-gray-200 text-gray-700 hover:border-gray-400'}`}
                          >
                            {r}
                          </button>
                        );
                      })}
                    </div>
                    {restaurants.includes('Khác') && (
                      <input
                        type="text"
                        placeholder="Tell us more"
                        value={otherRestaurant}
                        onChange={(e) => setOtherRestaurant(e.target.value)}
                        className="w-full rounded-full border border-gray-300 px-5 py-2.5 text-[14px] font-light text-gray-900 placeholder:text-gray-400 focus:border-black focus:outline-none focus:ring-1 focus:ring-black transition-all"
                      />
                    )}
                  </div>

                  <div>
                    <label className="mb-4 block text-[13.5px] font-bold text-black">
                      Bạn có bất kỳ hạn chế nào về chế độ ăn uống mà tôi cần biết không?
                    </label>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {['Không chứa gluten', 'Không chứa sữa', 'Người ăn chay', 'Thuần chay', 'Người ăn chay trường (chỉ ăn cá)', 'Halal', 'Kosher', 'Khác'].map(d => {
                        const isSelected = diets.includes(d);
                        return (
                          <button
                            key={d}
                            onClick={() => {
                              if (isSelected) setDiets(diets.filter(i => i !== d));
                              else setDiets([...diets, d]);
                            }}
                            className={`px-5 py-2 rounded-full text-[13px] transition-all ${isSelected ? 'bg-white border-2 border-black font-bold text-black' : 'bg-white border border-gray-200 text-gray-700 hover:border-gray-400'}`}
                          >
                            {d}
                          </button>
                        );
                      })}
                    </div>
                    {diets.includes('Khác') && (
                      <input
                        type="text"
                        placeholder="Tell us more"
                        value={otherDiet}
                        onChange={(e) => setOtherDiet(e.target.value)}
                        className="w-full rounded-full border border-gray-300 px-5 py-2.5 text-[14px] font-light text-gray-900 placeholder:text-gray-400 focus:border-black focus:outline-none focus:ring-1 focus:ring-black transition-all"
                      />
                    )}
                  </div>
                </div>

                {/* Progress and Actions - Step 5 */}
                <div className="mt-12">
                  <div className="mb-5 h-1 w-full bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full w-5/6 bg-black transition-all duration-500"></div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <button onClick={() => setStep(4)} className="flex items-center gap-1.5 text-[12px] font-bold text-gray-400 hover:text-black transition-colors">
                      <ChevronLeft size={16} /> Sở thích ăn uống
                    </button>
                    <button
                      onClick={() => setStep(6)}
                      className="rounded-full px-8 py-2.5 text-[14px] font-bold text-white transition-all bg-black hover:bg-gray-900"
                    >
                      Kế tiếp
                    </button>
                  </div>
                </div>
              </div>
            )}

            {step === 6 && (
              <div className="animate-fadeIn">
                <h2 className="font-heading text-3xl font-extrabold tracking-tight text-black mb-8 leading-tight pr-4">
                  Tóm lại
                </h2>

                <div className="space-y-8">
                  <div>
                    <label className="mb-4 block text-[13.5px] font-bold text-black">
                      Bạn thích giải trí như thế nào vào cuối tuần?
                    </label>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {['Ngoài trời', 'Nhạc sống', 'Nghệ thuật và bảo tàng', 'Quán bar & cuộc sống về đêm', 'Trò chơi thể thao', 'Sự thích hợp', 'Mua sắm', 'Phim & rạp chiếu phim', 'Chương trình hài kịch', 'Chăm sóc sức khỏe & spa', 'Khác'].map(a => {
                        const isSelected = activities.includes(a);
                        return (
                          <button
                            key={a}
                            onClick={() => {
                              if (isSelected) setActivities(activities.filter(i => i !== a));
                              else setActivities([...activities, a]);
                            }}
                            className={`px-5 py-2 rounded-full text-[13px] transition-all ${isSelected ? 'bg-white border-2 border-black font-bold text-black' : 'bg-white border border-gray-200 text-gray-700 hover:border-gray-400'}`}
                          >
                            {a}
                          </button>
                        );
                      })}
                    </div>
                    {activities.includes('Khác') && (
                      <input
                        type="text"
                        placeholder="Tell us more"
                        value={otherActivity}
                        onChange={(e) => setOtherActivity(e.target.value)}
                        className="w-full rounded-full border border-gray-300 px-5 py-2.5 text-[14px] font-light text-gray-900 placeholder:text-gray-400 focus:border-black focus:outline-none focus:ring-1 focus:ring-black transition-all"
                      />
                    )}
                  </div>

                  <div>
                    <label className="mb-4 block text-[13.5px] font-bold text-black leading-[1.6]">
                      Còn điều gì cần làm rõ hoặc những điều cuối cùng mà tôi cần biết với tư cách là trợ lý du lịch cá nhân của bạn không?
                    </label>
                    <textarea
                      value={finalNotes}
                      onChange={(e) => setFinalNotes(e.target.value)}
                      className="w-full rounded-[16px] border border-gray-200 p-4 text-[14px] font-light text-gray-900 focus:border-black focus:outline-none focus:ring-1 focus:ring-black transition-all resize-none h-28"
                    />
                  </div>
                </div>

                {/* Progress and Actions - Step 6 */}
                <div className="mt-12">
                  <div className="mb-5 h-1 w-full bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full w-full bg-black transition-all duration-500"></div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <button onClick={() => setStep(5)} className="flex items-center gap-1.5 text-[12px] font-bold text-gray-400 hover:text-black transition-colors">
                      <ChevronLeft size={16} /> Tóm lại
                    </button>
                    <button
                      onClick={() => setStep(7)}
                      className="rounded-full px-8 py-2.5 text-[14px] font-bold text-white transition-all bg-black hover:bg-gray-900"
                    >
                      Kế tiếp
                    </button>
                  </div>
                </div>
              </div>
            )}

            {step === 7 && (
              <div className="animate-fadeIn mt-10">
                <h2 className="font-heading text-4xl font-extrabold tracking-tight text-black mb-6 leading-tight pr-4">
                  Bạn đã sẵn sàng
                </h2>
                
                <p className="text-[14px] font-light leading-[1.6] text-gray-700 mb-8 max-w-[360px]">
                  Tôi sẽ sử dụng những gì bạn đã chia sẻ để đưa ra những đề xuất cá nhân hóa hơn trong tương lai, và tôi sẽ tiếp tục học hỏi khi bạn sử dụng GreenTrip. Chúng ta cùng bắt đầu nhé!
                </p>

                <div className="min-h-[60px]">
                  {!isReady ? (
                    <div className="flex gap-2 items-center">
                      <div className="w-2.5 h-2.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }}></div>
                      <div className="w-2.5 h-2.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }}></div>
                      <div className="w-2.5 h-2.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }}></div>
                    </div>
                  ) : (
                    <button
                      onClick={handleFinish}
                      className="rounded-full px-8 py-3 text-[14px] font-bold text-white transition-all bg-black hover:bg-gray-900 animate-fadeIn cursor-pointer shadow-sm active:scale-[0.98]"
                    >
                      Let's go
                    </button>
                  )}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>

      {/* Right Column (Image) - Hidden on mobile */}
      <div className="hidden lg:block lg:w-1/2 p-4 pl-0">
        <div className="h-full w-full overflow-hidden rounded-[32px] bg-gray-100">
          <img
            key={step} 
            src={step === 1 
              ? "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&q=80" 
              : step === 2 
                ? "https://images.unsplash.com/photo-1498623116890-37e912163d5d?auto=format&fit=crop&q=80"
                : step === 3
                  ? "https://images.unsplash.com/photo-1506929562872-bb421503ef21?auto=format&fit=crop&q=80"
                  : step === 4
                    ? "https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&q=80"
                    : step === 5
                      ? "https://images.unsplash.com/photo-1498623116890-37e912163d5d?auto=format&fit=crop&q=80"
                      : step === 6
                        ? "https://images.unsplash.com/photo-1506929562872-bb421503ef21?auto=format&fit=crop&q=80"
                        : "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&q=80"}
            alt="Travel inspiration"
            className="h-full w-full object-cover animate-fadeIn"
          />
        </div>
      </div>

      {/* WHO MODAL POPUP */}
      {showWhoModal && (
        <div className="absolute inset-0 z-[110] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-[400px] bg-white rounded-3xl p-6 shadow-2xl mx-4">
             <div className="flex justify-between items-start mb-6">
               <button onClick={() => setShowWhoModal(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100"><X size={18} /></button>
               <div className="text-center">
                 <div className="font-bold text-black text-[16px]">Ai</div>
                 <div className="text-gray-400 text-[12px] font-light">{adults + children + infants + pets} du khách</div>
               </div>
               <div className="w-8 h-8"></div>
             </div>

             <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[14px] font-bold text-black">Người lớn</div>
                    <div className="text-[12px] text-gray-400 font-light">Từ 13 tuổi trở lên</div>
                  </div>
                  <div className="flex items-center gap-4">
                    <button onClick={() => setAdults(Math.max(1, adults - 1))} className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center hover:border-gray-400"><Minus size={14}/></button>
                    <span className="w-4 text-center text-[14px] font-bold">{adults}</span>
                    <button onClick={() => setAdults(adults + 1)} className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center hover:border-gray-400"><Plus size={14}/></button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[14px] font-bold text-black">Những đứa trẻ</div>
                    <div className="text-[12px] text-gray-400 font-light">Độ tuổi 2–12</div>
                  </div>
                  <div className="flex items-center gap-4">
                    <button onClick={() => setChildren(Math.max(0, children - 1))} className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center hover:border-gray-400"><Minus size={14}/></button>
                    <span className="w-4 text-center text-[14px] font-bold">{children}</span>
                    <button onClick={() => setChildren(children + 1)} className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center hover:border-gray-400"><Plus size={14}/></button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[14px] font-bold text-black">Trẻ sơ sinh</div>
                    <div className="text-[12px] text-gray-400 font-light">Dưới 2 tuổi</div>
                  </div>
                  <div className="flex items-center gap-4">
                    <button onClick={() => setInfants(Math.max(0, infants - 1))} className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center hover:border-gray-400"><Minus size={14}/></button>
                    <span className="w-4 text-center text-[14px] font-bold">{infants}</span>
                    <button onClick={() => setInfants(infants + 1)} className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center hover:border-gray-400"><Plus size={14}/></button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[14px] font-bold text-black">Thú cưng</div>
                    <div className="text-[12px] text-gray-400 font-light underline">Bạn có mang theo động vật hỗ trợ không?</div>
                  </div>
                  <div className="flex items-center gap-4">
                    <button onClick={() => setPets(Math.max(0, pets - 1))} className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center hover:border-gray-400"><Minus size={14}/></button>
                    <span className="w-4 text-center text-[14px] font-bold">{pets}</span>
                    <button onClick={() => setPets(pets + 1)} className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center hover:border-gray-400"><Plus size={14}/></button>
                  </div>
                </div>
             </div>

             <div className="mt-8 flex justify-end">
               <button onClick={() => setShowWhoModal(false)} className="w-32 bg-black text-white font-bold text-[14px] py-3 rounded-full hover:bg-gray-900 transition-colors">Cập nhật</button>
             </div>
          </div>
        </div>
      )}

      {/* WHEN MODAL POPUP */}
      {showWhenModal && (
        <div className="absolute inset-0 z-[110] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-[500px] bg-white rounded-3xl p-6 shadow-2xl mx-4">
             <div className="flex justify-between items-center mb-6">
               <button onClick={() => setShowWhenModal(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100"><X size={18} /></button>
               <div className="text-[16px] font-bold text-black">Khi</div>
               <div className="w-8 h-8"></div>
             </div>

             <div className="flex justify-center mb-8">
               <div className="bg-gray-100 p-1 rounded-full flex gap-1">
                 <button onClick={() => setWhenTab('dates')} className={`px-4 py-1.5 rounded-full text-[13px] font-bold transition-all ${whenTab === 'dates' ? 'bg-white shadow-sm' : 'text-gray-500 hover:text-black'}`}>Ngày tháng</button>
                 <button onClick={() => setWhenTab('flex')} className={`px-4 py-1.5 rounded-full text-[13px] font-bold transition-all ${whenTab === 'flex' ? 'bg-white shadow-sm' : 'text-gray-500 hover:text-black'}`}>Linh hoạt</button>
               </div>
             </div>

             {whenTab === 'dates' ? (
                <div className="text-center text-gray-500 py-16 bg-gray-50 rounded-2xl border border-gray-100">
                  <Calendar size={48} className="mx-auto mb-4 opacity-20" />
                  <p className="text-[14px]">Tính năng chọn ngày chuẩn trên lịch sẽ được tích hợp sau.</p>
                </div>
             ) : (
                <div className="px-4">
                  <div className="text-center mb-8">
                    <div className="text-[14px] font-bold text-black mb-4">Bao nhiêu ngày?</div>
                    <div className="flex items-center justify-center gap-6">
                      <button onClick={() => setFlexibleDays(Math.max(1, flexibleDays - 1))} className="w-10 h-10 rounded-full border border-gray-200 flex items-center justify-center hover:border-gray-400"><Minus size={16}/></button>
                      <div className="w-12 text-center text-[18px] font-bold px-4 py-1 border border-gray-200 rounded-2xl">{flexibleDays}</div>
                      <button onClick={() => setFlexibleDays(flexibleDays + 1)} className="w-10 h-10 rounded-full border border-gray-200 flex items-center justify-center hover:border-gray-400"><Plus size={16}/></button>
                    </div>
                  </div>

                  <div className="text-center">
                    <div className="text-[14px] font-bold text-black mb-4">Du lịch bất cứ lúc nào</div>
                    <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-none justify-center px-2">
                      {[0, 1, 2, 3].map(offset => {
                        const d = new Date();
                        d.setMonth(d.getMonth() + offset);
                        const mText = "Tháng " + (d.getMonth() + 1);
                        return (
                          <button key={offset} className="shrink-0 w-24 h-24 border border-gray-200 rounded-2xl flex flex-col items-center justify-center hover:border-black transition-colors bg-white">
                            <Calendar size={20} className="mb-2 text-gray-400" />
                            <span className="text-[13px] font-bold text-black">{mText}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
             )}

             <div className="mt-8 flex justify-end">
               <button onClick={() => setShowWhenModal(false)} className="w-32 bg-black text-white font-bold text-[14px] py-3 rounded-full hover:bg-gray-900 transition-colors">Cập nhật</button>
             </div>
          </div>
        </div>
      )}

      {/* WHERE MODAL POPUP */}
      {showWhereModal && (
        <div className="absolute inset-0 z-[110] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-[500px] bg-white rounded-3xl p-6 shadow-2xl mx-4 min-h-[300px] flex flex-col">
             <div className="flex justify-between items-center mb-6">
               <button onClick={() => setShowWhereModal(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100"><X size={18} /></button>
               <div className="text-[16px] font-bold text-black">Ở đâu</div>
               <div className="w-8 h-8"></div>
             </div>

             <div className="relative mb-6">
               <input
                 type="text"
                 placeholder="Vị trí"
                 value={whereTarget}
                 onChange={(e) => setWhereTarget(e.target.value)}
                 className="w-full rounded-full border border-gray-200 px-5 py-3 text-[14px] font-light text-gray-900 focus:border-black focus:outline-none focus:ring-1 focus:ring-black transition-all"
               />
               <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                 <span className="text-[12px] font-bold text-black">Đi du lịch bằng ô tô?</span>
                 <button 
                   onClick={() => setByCar(!byCar)} 
                   className={`w-9 h-5 rounded-full flex items-center p-0.5 transition-colors ${byCar ? 'bg-black' : 'bg-gray-200'}`}
                 >
                   <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${byCar ? 'translate-x-4' : 'translate-x-0'}`}></div>
                 </button>
               </div>
             </div>
             
             <div className="flex gap-2 mb-8 flex-wrap">
               <button onClick={() => setWhereTarget('Huế')} className="px-4 py-1.5 rounded-full border border-gray-200 text-[13px] hover:border-black transition-all text-black">Huế</button>
               <button onClick={() => setWhereTarget('Đà Nẵng')} className="px-4 py-1.5 rounded-full border border-gray-200 text-[13px] hover:border-black transition-all text-black">Đà Nẵng</button>
               <button onClick={() => setWhereTarget('Huế & Đà Nẵng')} className="px-4 py-1.5 rounded-full border border-gray-200 text-[13px] hover:border-black transition-all text-black">Cả 2</button>
             </div>

             <div className="mt-auto flex justify-end">
               <button 
                 onClick={() => setShowWhereModal(false)} 
                 className={`w-32 font-bold text-[14px] py-3 rounded-full transition-colors ${whereTarget ? 'bg-black text-white hover:bg-gray-900' : 'bg-gray-300 text-white'}`}
               >
                 Cứu
               </button>
             </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
