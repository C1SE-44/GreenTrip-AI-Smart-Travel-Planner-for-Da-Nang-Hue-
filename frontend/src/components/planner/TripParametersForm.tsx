import { useState, useId } from 'react';
import { 
  Calendar, 
  Users, 
  Wallet, 
  MapPin, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle, 
  ArrowRight, 
  Loader2, 
  Minus, 
  Plus, 
  Leaf,
  Compass,
  Check
} from 'lucide-react';
import { 
  validateTripParameters, 
  TripParametersPayload, 
  TripParametersResponse, 
  ValidationError 
} from '@/services/tripService';

const DESTINATIONS = [
  {
    id: 'Đà Nẵng',
    name: 'Đà Nẵng',
    tagline: 'Thành phố biển năng động & đáng sống',
    image: '/images/danang_banner.png',
    highlights: ['Cầu Rồng', 'Biển Mỹ Khê', 'Bán đảo Sơn Trà', 'Bà Nà Hills'],
    badge: 'Biển & Nghỉ dưỡng',
    accentColor: 'border-emerald-500 ring-emerald-500',
  },
  {
    id: 'Huế',
    name: 'Cố đô Huế',
    tagline: 'Vùng đất di sản thơ mộng & trầm mặc',
    image: '/images/hue_banner.jpg',
    highlights: ['Đại Nội Huế', 'Sông Hương', 'Lăng Khải Định', 'Chùa Thiên Mụ'],
    badge: 'Di sản & Văn hóa',
    accentColor: 'border-amber-600 ring-amber-600',
  },
  {
    id: 'Đà Nẵng & Huế',
    name: 'Cả Đà Nẵng & Huế',
    tagline: 'Hành trình trọn vẹn kết hợp Di sản & Biển',
    image: '/images/danang_hue_banner.jpg',
    highlights: ['Đèo Hải Vân', 'Vịnh Lăng Cô', 'Trọn vẹn 2 miền văn hóa'],
    badge: 'Hành trình Eco Tour',
    accentColor: 'border-forest-600 ring-forest-600',
  },
];

const PREFERENCE_OPTIONS = [
  { id: 'culture', label: 'Văn hóa & Di sản', icon: '🏛️' },
  { id: 'food', label: 'Ẩm thực miền Trung', icon: '🍲' },
  { id: 'eco', label: 'Du lịch Xanh & Bền vững', icon: '🌿' },
  { id: 'beach', label: 'Biển & Nghỉ dưỡng', icon: '🏖️' },
  { id: 'nature', label: 'Thiên nhiên & Sinh thái', icon: '⛰️' },
  { id: 'checkin', label: 'Check-in & Nhiếp ảnh', icon: '📸' },
  { id: 'relaxation', label: 'Thư giãn & Chữa lành', icon: '🧘' },
  { id: 'family', label: 'Phù hợp gia đình', icon: '👨‍👩‍👧' },
];

const BUDGET_PRESETS = [
  { label: 'Tiết kiệm', dailyEstimate: 800000, desc: '~800k / người / ngày' },
  { label: 'Hợp lý', dailyEstimate: 1800000, desc: '~1.8tr / người / ngày' },
  { label: 'Cao cấp', dailyEstimate: 3500000, desc: '~3.5tr / người / ngày' },
];

export default function TripParametersForm() {
  const formId = useId();
  // Form States
  const [destination, setDestination] = useState<string>('Đà Nẵng');
  const [days, setDays] = useState<number>(3);
  const [numPeople, setNumPeople] = useState<number>(2);
  const [totalBudget, setTotalBudget] = useState<number>(6000000);
  const [startDate, setStartDate] = useState<string>('');
  const [preferences, setPreferences] = useState<string[]>(['culture', 'food', 'eco']);

  // API Interaction States
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<TripParametersResponse | null>(null);

  // Quick preset handlers
  const handleDayPreset = (d: number) => {
    setDays(d);
    // recalculate suggested budget if needed
    const minRequired = 200000 * d * numPeople;
    if (totalBudget < minRequired) {
      setTotalBudget(minRequired);
    }
  };

  const handleBudgetPreset = (dailyPerPerson: number) => {
    setTotalBudget(dailyPerPerson * days * numPeople);
  };

  const handleBudgetInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Strip all non-digit characters and format using toLocaleString()
    const rawDigits = e.target.value.replace(/\D/g, '');
    if (!rawDigits) {
      setTotalBudget(0);
      return;
    }
    const numericValue = parseInt(rawDigits, 10);
    // Cap at 1,000,000,000 VND
    if (numericValue <= 1_000_000_000) {
      setTotalBudget(numericValue);
    }
  };

  const togglePreference = (prefId: string) => {
    setPreferences((prev) =>
      prev.includes(prefId) ? prev.filter((p) => p !== prefId) : [...prev, prefId]
    );
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('vi-VN').format(Math.round(val)) + ' ₫';
  };

  const dailyBudgetPerPerson = Math.round(totalBudget / (days * numPeople));
  const interestsPerDay = preferences.length / days;
  const pacing = interestsPerDay <= 3
    ? { level: 'Relaxed', label: '🌿 Thong thả', description: 'Nhịp độ nghỉ dưỡng, phù hợp trải nghiệm sâu và thư giãn.', progress: Math.min(100, (interestsPerDay / 3) * 100), color: 'bg-emerald-500', text: 'text-emerald-800' }
    : interestsPerDay <= 5
      ? { level: 'Balanced', label: '⚖️ Cân bằng', description: 'Số lượng điểm đến lý tưởng, hài hòa giữa khám phá và nghỉ ngơi.', progress: 66 + ((interestsPerDay - 3) / 2) * 17, color: 'bg-amber-500', text: 'text-amber-800' }
      : { level: 'Fast', label: '⚡ Dày đặc', description: 'Lịch trình di chuyển liên tục, phù hợp cho người thích check-in nhiều địa điểm.', progress: Math.min(100, 83 + ((interestsPerDay - 5) / 3) * 17), color: 'bg-orange-500', text: 'text-orange-800' };
  const minRecommendedBudget = days * numPeople * 400_000;
  const isBudgetBelowRecommendation = totalBudget < minRecommendedBudget;
  const budgetWarning = `💡 Mẹo từ GreenTrip: Ngân sách tối thiểu đề xuất cho ${numPeople} người đi ${days} ngày tại ${destination} là khoảng ${minRecommendedBudget.toLocaleString('en-US')} VNĐ để có trải nghiệm cơ bản nhất.`;

  const todayStr = new Date().toISOString().split('T')[0];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return; // Guard: prevent duplicate submissions when clicked rapidly

    setLoading(true);
    setErrorMessage(null);
    setFieldErrors({});

    const payload: TripParametersPayload = {
      destination,
      days,
      total_budget: totalBudget,
      num_people: numPeople,
      start_date: startDate ? startDate : null,
      preferences,
    };

    try {
      // Minimum delay (500ms) to ensure loading spinner feedback is visibly smooth
      const [response] = await Promise.all([
        validateTripParameters(payload),
        new Promise((resolve) => setTimeout(resolve, 500)),
      ]);
      setResult(response);
      // Smooth scroll to result
      setTimeout(() => {
        document.getElementById('validation-result-card')?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } catch (err: unknown) {
      if (err instanceof ValidationError) {
        setErrorMessage(err.message);
        setFieldErrors(err.errors);
      } else if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Đã xảy ra lỗi không xác định khi xác thực thông số.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl">
      {/* Form Card Container */}
      <div className="rounded-3xl bg-white p-6 sm:p-10 shadow-card border border-stone-100">
        <div className="mb-8 border-b border-stone-100 pb-6">
          <div className="inline-flex items-center gap-2 rounded-full bg-forest-50 px-3.5 py-1 text-xs font-semibold text-forest-700 mb-3">
            <Leaf size={14} className="text-forest-600" />
            PB07 • Smart Trip Parameters Form
          </div>
          <h2 className="font-heading text-2xl sm:text-3xl font-extrabold tracking-tight text-forest-900">
            Thiết Lập Thông Số Chuyến Đi
          </h2>
          <p className="mt-2 text-sm text-stone-600 leading-relaxed">
            Nhập số ngày, ngân sách và địa điểm để thuật toán AI của GreenTrip tính toán phân bổ chi phí, 
            kiểm tra tính khả thi và cá nhân hóa lịch trình Đà Nẵng - Huế cho bạn.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-10">
          {/* SECTION 1: DESTINATION SELECTION (Rule 5: Exposed choices) */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-bold text-stone-900 flex items-center gap-2">
                <MapPin size={17} className="text-forest-600" />
                1. Chọn Điểm Đến Du Lịch
              </label>
              <span className="text-xs text-stone-600">Đà Nẵng & Huế</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {DESTINATIONS.map((dest) => {
                const isSelected = destination === dest.id;
                return (
                  <div
                    key={dest.id}
                    onClick={() => setDestination(dest.id)}
                    className={`
                      relative cursor-pointer overflow-hidden rounded-2xl border-2 p-4 transition-all duration-200
                      ${isSelected 
                        ? 'border-forest-600 bg-forest-50/40 shadow-sm ring-2 ring-forest-500/20' 
                        : 'border-stone-200 bg-white hover:border-stone-300 hover:shadow-subtle'
                      }
                    `}
                  >
                    <div className="relative h-28 w-full overflow-hidden rounded-xl mb-3">
                      <img
                        src={dest.image}
                        alt={dest.name}
                        className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
                      />
                      <div className="absolute top-2 right-2">
                        {isSelected ? (
                          <div className="h-6 w-6 rounded-full bg-forest-600 text-white flex items-center justify-center shadow-md">
                            <Check size={14} strokeWidth={3} />
                          </div>
                        ) : (
                          <div className="h-6 w-6 rounded-full bg-black/40 backdrop-blur-sm text-white/80 flex items-center justify-center" />
                        )}
                      </div>
                      <span className="absolute bottom-2 left-2 rounded-full bg-black/60 backdrop-blur-md px-2.5 py-0.5 text-[11px] font-medium text-white">
                        {dest.badge}
                      </span>
                    </div>

                    <h4 className="font-heading text-lg font-bold text-stone-900">{dest.name}</h4>
                    <p className="mt-1 text-xs text-stone-600 line-clamp-1">{dest.tagline}</p>

                    <div className="mt-3 flex flex-wrap gap-1">
                      {dest.highlights.slice(0, 3).map((hl) => (
                        <span key={hl} className="rounded-md bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-600">
                          {hl}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            {fieldErrors.destination && (
              <p className="mt-2 text-xs font-medium text-red-600 flex items-center gap-1">
                <AlertCircle size={13} /> {fieldErrors.destination}
              </p>
            )}
          </div>

          {/* SECTION 2: TRIP DURATION (DAYS) & START DATE */}
          <div className="rounded-2xl border border-stone-200/80 bg-stone-50/50 p-5 sm:p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-200/60 pb-4">
              <div>
                <label className="text-sm font-bold text-stone-900 flex items-center gap-2">
                  <Calendar size={17} className="text-forest-600" />
                  2. Thời Lượng Chuyến Đi (Số Ngày)
                </label>
                <p className="text-xs text-stone-600 mt-0.5">
                  Tối thiểu 1 ngày, tối đa 14 ngày (Đà Nẵng & Huế kết hợp khuyến nghị từ 2-4 ngày).
                </p>
              </div>

              {/* Days Counter / Stepper */}
              <div className="flex items-center gap-3 bg-white border border-stone-200 px-3 py-1.5 rounded-xl shadow-xs self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => handleDayPreset(Math.max(1, days - 1))}
                  disabled={days <= 1}
                  className="h-8 w-8 rounded-lg border border-stone-200 flex items-center justify-center text-stone-700 hover:bg-stone-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Minus size={15} />
                </button>
                <div className="w-16 text-center">
                  <span className="font-heading text-xl font-extrabold text-stone-900">{days}</span>
                  <span className="text-xs text-stone-600 ml-1">ngày</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleDayPreset(Math.min(14, days + 1))}
                  disabled={days >= 14}
                  className="h-8 w-8 rounded-lg border border-stone-200 flex items-center justify-center text-stone-700 hover:bg-stone-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Plus size={15} />
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-forest-100 bg-white/90 p-4 shadow-xs" aria-live="polite">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">Nhịp độ chuyến đi · {pacing.level}</p>
                  <p className={`mt-1 text-sm font-bold ${pacing.text}`}>{pacing.label}</p>
                  <p className="mt-1 text-xs leading-relaxed text-stone-600">{pacing.description}</p>
                </div>
                <span className="text-xs font-semibold text-stone-500">{preferences.length} sở thích / {days} ngày</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-stone-100" role="progressbar" aria-label={`Nhịp độ ${pacing.level}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pacing.progress)}>
                <div className={`h-full rounded-full transition-all duration-500 ease-out ${pacing.color}`} style={{ width: `${pacing.progress}%` }} />
              </div>
            </div>

            {/* Quick Days Preset Pills */}
            <div>
              <span className="text-xs font-semibold text-stone-600 block mb-2">Gợi ý nhanh số ngày:</span>
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5, 7, 10].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => handleDayPreset(d)}
                    className={`
                      px-4 py-2 rounded-xl text-xs font-bold transition-all
                      ${days === d
                        ? 'bg-forest-600 text-white shadow-sm'
                        : 'bg-white border border-stone-200 text-stone-700 hover:border-stone-300 hover:bg-stone-50'
                      }
                    `}
                  >
                    {d} ngày {d === 3 && '✨ (Chuẩn)'}
                  </button>
                ))}
              </div>
            </div>

            {/* Optional Start Date Picker */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div>
                <label htmlFor={`${formId}-start-date`} className="text-xs font-semibold text-stone-700 block mb-1.5">
                  Ngày bắt đầu (Tùy chọn):
                </label>
                <input
                  id={`${formId}-start-date`}
                  type="date"
                  min={todayStr}
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 text-xs font-medium text-stone-800 shadow-xs focus:border-forest-600 focus:outline-none focus:ring-1 focus:ring-forest-600"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-stone-700 block mb-1.5">
                  Ngày kết thúc dự kiến:
                </label>
                <div className="w-full rounded-xl border border-stone-200/80 bg-stone-100/70 px-3.5 py-2.5 text-xs text-stone-600 font-medium">
                  {startDate ? (
                    (() => {
                      const d = new Date(startDate);
                      d.setDate(d.getDate() + (days - 1));
                      return d.toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                    })()
                  ) : (
                    `Sau ${days} ngày kể từ khi khởi hành`
                  )}
                </div>
              </div>
            </div>

            {fieldErrors.days && (
              <p className="text-xs font-medium text-red-600 flex items-center gap-1">
                <AlertCircle size={13} /> {fieldErrors.days}
              </p>
            )}
          </div>

          {/* SECTION 3: TRAVELERS & BUDGET INPUTS (Rule 4: Slider + Direct Input) */}
          <div className="space-y-6">
            {/* 3.1: Travelers Count */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-bold text-stone-900 flex items-center gap-2">
                  <Users size={17} className="text-forest-600" />
                  3. Số Lượng Du Khách
                </label>
                <span className="text-xs font-medium text-forest-700 bg-forest-50 px-2 py-0.5 rounded-md">
                  {numPeople === 1 && 'Độc hành (Solo)'}
                  {numPeople === 2 && 'Cặp đôi (Couple) / Đôi bạn'}
                  {numPeople >= 3 && numPeople <= 5 && 'Gia đình nhỏ / Nhóm bạn'}
                  {numPeople > 5 && 'Đoàn đông người'}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-3 bg-white border border-stone-200 px-3 py-1.5 rounded-xl shadow-xs">
                  <button
                    type="button"
                    onClick={() => setNumPeople(Math.max(1, numPeople - 1))}
                    disabled={numPeople <= 1}
                    className="h-8 w-8 rounded-lg border border-stone-200 flex items-center justify-center text-stone-700 hover:bg-stone-50 disabled:opacity-40 transition-colors"
                  >
                    <Minus size={15} />
                  </button>
                  <div className="w-14 text-center">
                    <span className="font-heading text-xl font-bold text-stone-900">{numPeople}</span>
                    <span className="text-xs text-stone-600 ml-1">người</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setNumPeople(Math.min(20, numPeople + 1))}
                    disabled={numPeople >= 20}
                    className="h-8 w-8 rounded-lg border border-stone-200 flex items-center justify-center text-stone-700 hover:bg-stone-50 disabled:opacity-40 transition-colors"
                  >
                    <Plus size={15} />
                  </button>
                </div>

                <div className="text-xs text-stone-600">
                  (Thuật toán sẽ tự động tính toán phòng lưu trú và chi phí vé phù hợp cho {numPeople} người)
                </div>
              </div>
            </div>

            {/* 3.2: Budget Inputs (Range Slider + Number Input) */}
            <div className="rounded-2xl border border-stone-200/80 bg-stone-50/50 p-5 sm:p-6 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <label htmlFor={`${formId}-total-budget`} className="text-sm font-bold text-stone-900 flex items-center gap-2">
                    <Wallet size={17} className="text-forest-600" />
                    4. Tổng Ngân Sách Dự Kiến (VNĐ)
                  </label>
                  <p className="text-xs text-stone-600 mt-0.5">
                    Tối thiểu 200.000 ₫/người/ngày cho chi phí lưu trú, ăn uống & đi lại cơ bản.
                  </p>
                </div>

                {/* Direct Number Input formatted with toLocaleString() */}
                <div className="relative">
                  <input
                    id={`${formId}-total-budget`}
                    type="text"
                    inputMode="numeric"
                    value={totalBudget > 0 ? totalBudget.toLocaleString('vi-VN') : ''}
                    onChange={handleBudgetInputChange}
                    placeholder="0"
                    disabled={loading}
                    className="w-48 rounded-xl border border-stone-200 bg-white py-2 pl-3 pr-8 text-right font-heading text-lg font-bold text-stone-900 shadow-xs focus:border-forest-600 focus:outline-none focus:ring-1 focus:ring-forest-600 disabled:bg-stone-50 disabled:text-stone-400"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-stone-600 pointer-events-none">
                    ₫
                  </span>
                </div>
              </div>

              {/* Slider (Rule 4) */}
              <div>
                <input
                  type="range"
                  min={Math.max(500000, 200000 * days * numPeople)}
                  max={Math.max(30000000, 5000000 * days * numPeople)}
                  step={200000}
                  value={totalBudget}
                  onChange={(e) => setTotalBudget(Number(e.target.value))}
                  className="w-full h-2 bg-stone-200 rounded-lg appearance-none cursor-pointer accent-forest-600"
                />
                <div className="flex justify-between text-[11px] text-stone-600 mt-1.5 font-medium">
                  <span>{formatCurrency(Math.max(500000, 200000 * days * numPeople))}</span>
                  <span className="font-bold text-forest-700 bg-forest-50 px-2 py-0.5 rounded-full">
                    {formatCurrency(totalBudget)}
                  </span>
                  <span>{formatCurrency(Math.max(30000000, 5000000 * days * numPeople))}</span>
                </div>
              </div>

              {isBudgetBelowRecommendation && (
                <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50/90 p-4 text-amber-950 sm:flex-row sm:items-center sm:justify-between" role="status" aria-live="polite">
                  <p className="text-xs leading-relaxed">{budgetWarning}</p>
                  <button
                    type="button"
                    onClick={() => setTotalBudget(minRecommendedBudget)}
                    className="inline-flex shrink-0 items-center justify-center rounded-full border border-amber-300 bg-white px-3.5 py-2 text-xs font-bold text-amber-900 shadow-xs transition-all duration-200 hover:border-amber-400 hover:bg-amber-100 active:scale-[0.98]"
                  >
                    ⚡ Tự động chỉnh về ngân sách đề xuất
                  </button>
                </div>
              )}

              {/* Real-time Calculation Badge & Presets */}
              <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-stone-200/60">
                <div className="text-xs text-stone-700">
                  Ước tính trung bình:{' '}
                  <span className="font-bold text-stone-900">{formatCurrency(dailyBudgetPerPerson)}</span> / người / ngày
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-stone-600 mr-1">Tùy chọn nhanh:</span>
                  {BUDGET_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => handleBudgetPreset(preset.dailyEstimate)}
                      className="px-2.5 py-1 rounded-lg border border-stone-200 bg-white text-[11px] font-semibold text-stone-700 hover:border-forest-500 hover:text-forest-700 transition-colors"
                      title={preset.desc}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {fieldErrors.total_budget && (
                <p className="text-xs font-medium text-red-600 flex items-center gap-1">
                  <AlertCircle size={13} /> {fieldErrors.total_budget}
                </p>
              )}
            </div>
          </div>

          {/* SECTION 4: PREFERENCES & TRAVEL STYLES (Rule 9: Toggle Tokens) */}
          <div>
            <label className="text-sm font-bold text-stone-900 flex items-center gap-2 mb-1">
              <Compass size={17} className="text-forest-600" />
              5. Sở Thích & Phong Cách Du Lịch
            </label>
            <p className="text-xs text-stone-600 mb-3">
              Chọn các mục bạn quan tâm để AI ưu tiên điểm đến phù hợp (ưu tiên tiêu chí Eco / Du lịch Xanh):
            </p>

            <div className="flex flex-wrap gap-2.5">
              {PREFERENCE_OPTIONS.map((item) => {
                const isChecked = preferences.includes(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => togglePreference(item.id)}
                    className={`
                      inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-medium transition-all duration-150
                      ${isChecked
                        ? 'bg-forest-700 text-white shadow-xs ring-1 ring-forest-700'
                        : 'bg-white border border-stone-200 text-stone-700 hover:border-stone-300 hover:bg-stone-50'
                      }
                    `}
                  >
                    <span>{item.icon}</span>
                    <span>{item.label}</span>
                    {isChecked && <Check size={12} strokeWidth={3} className="ml-0.5" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ERROR ALERT BANNER (If validation fails) */}
          {errorMessage && (
            <div className="rounded-2xl border border-red-200 bg-red-50/80 p-4 text-red-800 flex items-start gap-3">
              <AlertCircle size={20} className="text-red-600 shrink-0 mt-0.5" />
              <div className="text-xs leading-relaxed">
                <p className="font-bold">Không thể xác thực thông số chuyến đi:</p>
                <p className="mt-0.5 text-red-700">{errorMessage}</p>
              </div>
            </div>
          )}

          {/* SUBMIT BUTTON (Confirm & Check Trip Parameters) */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              aria-busy={loading}
              title="Confirm & Check Trip Parameters"
              className={`
                w-full sm:w-auto inline-flex items-center justify-center gap-2.5 rounded-full px-8 py-3.5 
                font-bold text-white shadow-md transition-all duration-200 select-none
                ${loading
                  ? 'bg-forest-800/80 cursor-not-allowed opacity-85 pointer-events-none ring-2 ring-forest-400/40'
                  : 'bg-forest-600 hover:bg-forest-700 hover:shadow-lg active:scale-[0.99] cursor-pointer'
                }
              `}
            >
              {loading ? (
                <>
                  <Loader2 size={19} className="animate-spin text-white shrink-0" />
                  <span>Đang kiểm tra & xác thực thông số...</span>
                </>
              ) : (
                <>
                  <Sparkles size={18} className="shrink-0" />
                  <span>Xác Nhận & Kiểm Tra Thông Số Chuyến Đi</span>
                  <ArrowRight size={16} className="shrink-0" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* RESULT CARD (Rendered after successful API validation) */}
      {result && result.data && (
        <div
          id="validation-result-card"
          className="mt-8 rounded-3xl bg-white p-6 sm:p-8 shadow-card border-2 border-forest-200 animate-fadeIn"
        >
          <div className="flex items-center gap-3 border-b border-stone-100 pb-4 mb-6">
            <div className="h-10 w-10 rounded-full bg-forest-100 text-forest-700 flex items-center justify-center shrink-0">
              <CheckCircle2 size={24} />
            </div>
            <div>
              <h3 className="font-heading text-xl font-extrabold text-forest-900">
                Thông Số Chuyến Đi Hợp Lệ!
              </h3>
              <p className="text-xs text-stone-600">{result.message}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <div className="rounded-2xl bg-stone-50 p-3.5 border border-stone-200/60">
              <span className="text-[11px] text-stone-600 block">Điểm đến</span>
              <span className="font-heading text-base font-bold text-stone-900">{result.data.destination}</span>
            </div>
            <div className="rounded-2xl bg-stone-50 p-3.5 border border-stone-200/60">
              <span className="text-[11px] text-stone-600 block">Thời lượng & Người</span>
              <span className="font-heading text-base font-bold text-stone-900">
                {result.data.days} ngày • {result.data.num_people} người
              </span>
            </div>
            <div className="rounded-2xl bg-stone-50 p-3.5 border border-stone-200/60">
              <span className="text-[11px] text-stone-600 block">Tổng ngân sách</span>
              <span className="font-heading text-base font-bold text-forest-700">
                {formatCurrency(result.data.total_budget)}
              </span>
            </div>
            <div className="rounded-2xl bg-stone-50 p-3.5 border border-stone-200/60">
              <span className="text-[11px] text-stone-600 block">Phân khúc chi tiêu</span>
              <span className="font-heading text-base font-bold capitalize text-stone-900">
                {result.data.budget_tier === 'budget' && '🌱 Tiết kiệm'}
                {result.data.budget_tier === 'standard' && '⭐ Cân bằng'}
                {result.data.budget_tier === 'luxury' && '👑 Cao cấp'}
              </span>
            </div>
          </div>

          {/* Cost Allocation Chart Breakdown (Dynamic & Visual) */}
          {(() => {
            const pct = result.data.cost_breakdown.percentage_breakdown || {};
            const pctAccom = pct.accommodation ?? 35;
            const pctFood = pct.food_and_beverage ?? 30;
            const pctTrans = pct.transportation ?? 20;
            const pctAct = pct.activities_and_tickets ?? 15;

            return (
              <div className="rounded-2xl bg-forest-50/60 p-4 sm:p-5 border border-forest-100 mb-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-forest-900 flex items-center gap-1.5">
                    <Wallet size={15} className="text-forest-600" />
                    Đề xuất phân bổ ngân sách AI (Dynamic Cost Allocation)
                  </h4>
                  <span className="text-[11px] text-stone-500 font-medium">
                    Tối ưu theo phân khúc: <strong className="capitalize text-stone-800">{result.data.budget_tier}</strong>
                  </span>
                </div>

                {/* Visual Stacked Progress Bar */}
                <div className="w-full h-3 rounded-full overflow-hidden flex bg-stone-200/80 mb-3.5 shadow-2xs">
                  <div
                    style={{ width: `${pctAccom}%` }}
                    className="bg-emerald-600 transition-all duration-500"
                    title={`Lưu trú: ${pctAccom}%`}
                  />
                  <div
                    style={{ width: `${pctFood}%` }}
                    className="bg-amber-500 transition-all duration-500"
                    title={`Ẩm thực: ${pctFood}%`}
                  />
                  <div
                    style={{ width: `${pctTrans}%` }}
                    className="bg-sky-500 transition-all duration-500"
                    title={`Đi lại: ${pctTrans}%`}
                  />
                  <div
                    style={{ width: `${pctAct}%` }}
                    className="bg-rose-500 transition-all duration-500"
                    title={`Hoạt động: ${pctAct}%`}
                  />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="rounded-xl bg-white p-3 border border-emerald-100 shadow-2xs">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[11px] text-stone-600">🏨 Lưu trú</span>
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded">
                        {pctAccom}%
                      </span>
                    </div>
                    <span className="text-sm font-bold text-stone-900">
                      {formatCurrency(result.data.cost_breakdown.accommodation)}
                    </span>
                  </div>

                  <div className="rounded-xl bg-white p-3 border border-amber-100 shadow-2xs">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[11px] text-stone-600">🍲 Ẩm thực</span>
                      <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded">
                        {pctFood}%
                      </span>
                    </div>
                    <span className="text-sm font-bold text-stone-900">
                      {formatCurrency(result.data.cost_breakdown.food_and_beverage)}
                    </span>
                  </div>

                  <div className="rounded-xl bg-white p-3 border border-sky-100 shadow-2xs">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[11px] text-stone-600">🚗 Đi lại</span>
                      <span className="text-[10px] font-bold text-sky-700 bg-sky-50 px-1.5 py-0.2 rounded">
                        {pctTrans}%
                      </span>
                    </div>
                    <span className="text-sm font-bold text-stone-900">
                      {formatCurrency(result.data.cost_breakdown.transportation)}
                    </span>
                  </div>

                  <div className="rounded-xl bg-white p-3 border border-rose-100 shadow-2xs">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[11px] text-stone-600">🎟️ Hoạt động</span>
                      <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-1.5 py-0.2 rounded">
                        {pctAct}%
                      </span>
                    </div>
                    <span className="text-sm font-bold text-stone-900">
                      {formatCurrency(result.data.cost_breakdown.activities_and_tickets)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* REAL DATABASE POIS SUGGESTIONS */}
          {result.data.matched_pois && result.data.matched_pois.length > 0 && (
            <div className="mb-6 rounded-2xl border border-stone-200/90 bg-stone-50/50 p-4 sm:p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3.5 pb-2.5 border-b border-stone-200/60">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-forest-900 flex items-center gap-1.5">
                    <MapPin size={15} className="text-forest-600" />
                    Gợi ý địa điểm & trải nghiệm nổi bật
                  </h4>
                  <p className="text-[11px] text-stone-500 mt-0.5">
                    Các điểm đến tiêu biểu phù hợp với ngân sách và sở thích tại {result.data.destination}
                  </p>
                </div>
                <span className="text-[11px] font-bold text-forest-700 bg-white border border-forest-200 px-2.5 py-0.5 rounded-full shadow-2xs self-start sm:self-auto">
                  {result.data.matched_pois.length} địa điểm tiêu biểu
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {result.data.matched_pois.map((poi, idx) => (
                  <div
                    key={idx}
                    className="flex flex-col justify-between rounded-xl border border-stone-200 bg-white p-3.5 hover:border-forest-500 hover:shadow-subtle transition-all duration-200"
                  >
                    <div>
                      {/* Image if available */}
                      {poi.image_url && (
                        <div className="mb-2.5 h-32 w-full overflow-hidden rounded-lg bg-stone-100">
                          <img
                            src={poi.image_url}
                            alt={poi.name}
                            loading="lazy"
                            className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
                            onError={(e) => {
                              const parent = e.currentTarget.parentElement;
                              if (parent) parent.style.display = 'none';
                            }}
                          />
                        </div>
                      )}

                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="inline-block rounded-md bg-forest-50 border border-forest-100 px-2 py-0.5 text-[10px] font-bold text-forest-800">
                            {poi.highlight_tag}
                          </span>
                          {poi.green_score !== undefined && poi.green_score !== null && (
                            <span className="inline-flex items-center gap-0.5 rounded-md bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                              🌿 {Math.round(poi.green_score * 100)}/100
                            </span>
                          )}
                        </div>
                        <span className="rounded-full bg-stone-50 border border-stone-200 px-2 py-0.5 text-[10px] font-bold text-emerald-700 shrink-0">
                          {poi.estimated_price_range}
                        </span>
                      </div>

                      <h5 className="font-bold text-stone-900 text-sm leading-snug mb-1.5">{poi.name}</h5>

                      {poi.description && (
                        <p className="text-xs text-stone-600 line-clamp-2 leading-relaxed mb-2">
                          {poi.description}
                        </p>
                      )}

                      {/* Eco features list */}
                      {poi.eco_features && poi.eco_features.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2.5">
                          {poi.eco_features.map((feat, fIdx) => (
                            <span
                              key={fIdx}
                              className="text-[10px] bg-stone-100 text-stone-600 rounded px-1.5 py-0.5"
                            >
                              ✓ {feat}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-stone-500 pt-2 border-t border-stone-100 mt-1">
                      <span className="flex items-center gap-1 truncate max-w-[190px]">
                        <MapPin size={11} className="shrink-0 text-stone-400" />
                        {poi.address || poi.city}
                      </span>
                      <span className="font-medium text-stone-600 bg-stone-100 px-2 py-0.5 rounded text-[10px]">
                        {poi.category}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* DYNAMIC DAY-BY-DAY OUTLINE */}
          {result.data.itinerary_outline && result.data.itinerary_outline.length > 0 && (
            <div className="mb-6 rounded-2xl border border-stone-200/90 bg-white p-4 sm:p-5">
              <div className="mb-3.5 pb-2.5 border-b border-stone-100">
                <h4 className="text-xs font-bold uppercase tracking-wider text-forest-900 flex items-center gap-1.5">
                  <Calendar size={15} className="text-forest-600" />
                  Khung lịch trình {result.data.days} ngày đề xuất (Pacing)
                </h4>
                <p className="text-[11px] text-stone-500 mt-0.5">
                  Phân bổ nhịp độ di chuyển tối ưu để chuyến đi thư thái, tránh di chuyển dồn dập.
                </p>
              </div>

              <div className="space-y-2.5">
                {result.data.itinerary_outline.map((item) => (
                  <div
                    key={item.day}
                    className="rounded-xl border border-stone-100 bg-stone-50/70 p-3 hover:bg-stone-50 transition-colors"
                  >
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <span className="rounded-md bg-forest-600 text-white px-2 py-0.5 text-[11px] font-bold">
                        Ngày {item.day}
                      </span>
                      <span className="font-bold text-stone-900 text-xs sm:text-sm">
                        {item.theme}
                      </span>
                      <span className="ml-auto text-[10px] font-medium text-forest-800 bg-forest-100/70 px-2 py-0.5 rounded">
                        {item.focus_city}
                      </span>
                    </div>

                    <ul className="space-y-1 pl-4 text-xs text-stone-600">
                      {item.suggested_activities.map((act, actIdx) => (
                        <li key={actIdx} className="list-disc leading-relaxed">
                          {act}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AI Recommendations */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-stone-700 mb-2 flex items-center gap-1.5">
              <Sparkles size={14} className="text-amber-500" />
              Khuyến nghị hành trình & Du lịch Bền vững
            </h4>
            <ul className="space-y-1.5 text-xs text-stone-700">
              {result.data.recommendations.map((rec, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-forest-600 font-bold shrink-0">•</span>
                  <span>{rec}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
