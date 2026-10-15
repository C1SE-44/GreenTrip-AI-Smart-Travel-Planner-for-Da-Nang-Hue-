import React, { useState, useMemo, useCallback } from 'react';
import { 
  Leaf, 
  Coins, 
  Users, 
  Landmark, 
  Clock, 
  Sparkles, 
  Lock, 
  Unlock, 
  RotateCcw, 
  ArrowRight,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';

export interface SliderObjective {
  id: string;
  name: string;
  sublabel: string;
  description: string;
  icon: React.ElementType;
  color: string;
  trackColor: string;
  defaultValue: number;
  minLabel: string;
  maxLabel: string;
  isPrimary?: boolean;
}

export const SLIDER_OBJECTIVES: SliderObjective[] = [
  {
    id: 'co2',
    name: 'Ưu tiên Du lịch Xanh (Phát thải CO₂)',
    sublabel: 'Tối thiểu hóa carbon footprint',
    description: 'Ưu tiên phương tiện công cộng (Tàu hỏa, xe bus điện, xe đạp) và các điểm lưu trú sinh thái bền vững.',
    icon: Leaf,
    color: '#22362B',
    trackColor: 'bg-[#22362B]',
    defaultValue: 26,
    minLabel: 'Bình thường',
    maxLabel: 'Tối đa sinh thái',
    isPrimary: true,
  },
  {
    id: 'budget',
    name: 'Tối ưu Chi phí & Ngân sách',
    sublabel: 'Kiểm soát tài chính chuyến đi',
    description: 'Ưu tiên các điểm tham quan miễn phí/giá rẻ, ẩm thực đường phố và vé trọn gói ưu đãi.',
    icon: Coins,
    color: '#6B7280',
    trackColor: 'bg-[#6B7280]',
    defaultValue: 11,
    minLabel: 'Thoải mái',
    maxLabel: 'Tiết kiệm tối đa',
    isPrimary: true,
  },
  {
    id: 'crowd',
    name: 'Tránh đông đúc & Quá tải',
    sublabel: 'Giãn luồng khách giờ cao điểm',
    description: 'Tự động gợi ý khung giờ vắng vẻ và các điểm đến ít người biết (hidden gems).',
    icon: Users,
    color: '#9CA3AF',
    trackColor: 'bg-[#9CA3AF]',
    defaultValue: 18,
    minLabel: 'Chấp nhận đông',
    maxLabel: 'Không gian tĩnh lặng',
  },
  {
    id: 'local',
    name: 'Bảo tồn Văn hóa & Bản địa',
    sublabel: 'Hỗ trợ kinh tế cộng đồng địa phương',
    description: 'Ưu tiên các làng nghề truyền thống, tour do người bản xứ hướng dẫn và sản phẩm OCOP.',
    icon: Landmark,
    color: '#194D33',
    trackColor: 'bg-[#194D33]',
    defaultValue: 21,
    minLabel: 'Tham quan phổ biến',
    maxLabel: '100% Bản địa',
  },
  {
    id: 'satisfaction',
    name: 'Mức độ Hài lòng Cá nhân',
    sublabel: 'Phù hợp sở thích cá nhân',
    description: 'Cân nhắc đánh giá của du khách cùng gu và chất lượng dịch vụ được chứng nhận.',
    icon: Sparkles,
    color: '#2D4A3E',
    trackColor: 'bg-[#2D4A3E]',
    defaultValue: 16,
    minLabel: 'Tiêu chuẩn',
    maxLabel: 'Trải nghiệm đỉnh cao',
  },
  {
    id: 'time',
    name: 'Tối ưu Thời gian & Khoảng cách',
    sublabel: 'Hạn chế di chuyển lòng vòng',
    description: 'Thuật toán gom cụm điểm đến theo tuyến đường ngắn nhất giữa Đà Nẵng và Huế.',
    icon: Clock,
    color: '#4B5563',
    trackColor: 'bg-[#4B5563]',
    defaultValue: 8,
    minLabel: 'Thư thả',
    maxLabel: 'Tối ưu hành trình',
  },
];

export interface SustainabilityPreset {
  id: string;
  name: string;
  description: string;
  weights: Record<string, number>;
}

export const PRESETS: SustainabilityPreset[] = [
  {
    id: 'eco-max',
    name: 'Xanh nhất',
    description: 'Ưu tiên mức độ giảm phát thải CO2 và bảo vệ môi trường cao nhất',
    weights: { co2: 45, budget: 10, crowd: 15, local: 20, satisfaction: 5, time: 5 },
  },
  {
    id: 'balanced',
    name: 'Cân bằng',
    description: 'Hài hòa giữa sinh thái, chi phí hợp lý và trải nghiệm du lịch trọn vẹn',
    weights: { co2: 26, budget: 11, crowd: 18, local: 21, satisfaction: 16, time: 8 },
  },
  {
    id: 'budget-saver',
    name: 'Tiết kiệm',
    description: 'Tập trung tối ưu hóa ngân sách và chi phí sinh hoạt cho chuyến đi',
    weights: { co2: 15, budget: 45, crowd: 10, local: 15, satisfaction: 10, time: 5 },
  },
  {
    id: 'time-efficient',
    name: 'Nhanh gọn',
    description: 'Tối ưu thời gian di chuyển, khám phá được nhiều điểm nhất',
    weights: { co2: 15, budget: 15, crowd: 10, local: 10, satisfaction: 15, time: 35 },
  },
  {
    id: 'local-heritage',
    name: 'Bản địa',
    description: 'Đậm đà văn hóa Cố đô Huế và di sản địa phương miền Trung',
    weights: { co2: 20, budget: 10, crowd: 15, local: 40, satisfaction: 10, time: 5 },
  },
];

export interface SustainabilitySlidersProps {
  initialWeights?: Record<string, number>;
  onChange?: (weights: Record<string, number>) => void;
  onGeneratePlan?: (weights: Record<string, number>) => void;
}

export default function SustainabilitySliders({
  initialWeights,
  onChange,
  onGeneratePlan,
}: SustainabilitySlidersProps) {
  // 1. Initial State
  const defaultWeightsMap = useMemo(() => {
    const map: Record<string, number> = {};
    SLIDER_OBJECTIVES.forEach((obj) => {
      map[obj.id] = initialWeights?.[obj.id] ?? obj.defaultValue;
    });
    return map;
  }, [initialWeights]);

  const [weights, setWeights] = useState<Record<string, number>>(defaultWeightsMap);
  const [lockedMap, setLockedMap] = useState<Record<string, boolean>>({
    co2: true, // Default lock for Green Priority as design spec
  });
  const [activePreset, setActivePreset] = useState<string>('balanced');
  const [activeDraggingId, setActiveDraggingId] = useState<string | null>(null);

  // 2. Sum Verification
  const totalWeight = useMemo(() => {
    return Object.values(weights).reduce((sum, val) => sum + val, 0);
  }, [weights]);

  // 3. Auto-normalization Algorithm
  const handleSliderChange = useCallback((changedId: string, rawNewValue: number) => {
    setActivePreset('custom');
    const clampedNewVal = Math.max(0, Math.min(100, Math.round(rawNewValue)));

    setWeights((prev) => {
      // If only 1 slider or all other sliders are locked, clamp to available budget
      const lockedSum = Object.entries(prev)
        .filter(([id]) => id !== changedId && lockedMap[id])
        .reduce((sum, [, val]) => sum + val, 0);

      const maxAllowed = Math.max(0, 100 - lockedSum);
      const targetVal = Math.min(clampedNewVal, maxAllowed);

      const unlockedOtherIds = SLIDER_OBJECTIVES
        .map((o) => o.id)
        .filter((id) => id !== changedId && !lockedMap[id]);

      if (unlockedOtherIds.length === 0) {
        // Can't redistribute, clamp exactly to remaining
        const next = { ...prev, [changedId]: targetVal };
        onChange?.(next);
        return next;
      }

      const remainingToDistribute = 100 - lockedSum - targetVal;
      const currentUnlockedSum = unlockedOtherIds.reduce((sum, id) => sum + (prev[id] || 0), 0);

      const next = { ...prev, [changedId]: targetVal };

      if (currentUnlockedSum === 0) {
        // Distribute equally
        const evenShare = Math.floor(remainingToDistribute / unlockedOtherIds.length);
        let rem = remainingToDistribute % unlockedOtherIds.length;
        unlockedOtherIds.forEach((id) => {
          next[id] = evenShare + (rem > 0 ? 1 : 0);
          if (rem > 0) rem--;
        });
      } else {
        // Distribute proportionally
        let allocated = 0;
        unlockedOtherIds.forEach((id, index) => {
          if (index === unlockedOtherIds.length - 1) {
            next[id] = Math.max(0, remainingToDistribute - allocated);
          } else {
            const prop = (prev[id] || 0) / currentUnlockedSum;
            const share = Math.max(0, Math.round(remainingToDistribute * prop));
            next[id] = share;
            allocated += share;
          }
        });
      }

      onChange?.(next);
      return next;
    });
  }, [lockedMap, onChange]);

  // 4. Toggle Lock
  const toggleLock = (id: string) => {
    setLockedMap((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // 5. Select Preset
  const applyPreset = (preset: SustainabilityPreset) => {
    setActivePreset(preset.id);
    setWeights(preset.weights);
    onChange?.(preset.weights);
  };

  // 6. Reset to Balanced
  const handleReset = () => {
    const balanced = PRESETS.find((p) => p.id === 'balanced') || PRESETS[1];
    applyPreset(balanced);
    setLockedMap({ co2: true });
  };

  // 7. Dynamic Impact Estimation Calculations
  const co2Val = weights['co2'] || 0;
  const localVal = weights['local'] || 0;
  const budgetVal = weights['budget'] || 0;

  const co2ReductionPercent = Math.min(50, Math.max(10, Math.round(co2Val * 0.8 + 12)));
  const ecoScore = Math.min(98, Math.max(65, Math.round(55 + co2Val * 0.7 + localVal * 0.25)));
  const dailyCostText = budgetVal >= 35 ? '1,8 tr đ' : budgetVal >= 20 ? '2,4 tr đ' : '2,8 tr đ';

  return (
    <div className="w-full space-y-6 text-gray-900 font-sans" data-purpose="sustainability-sliders-root">
      {/* PB07 Trip Context Breadcrumb Bar */}
      <div className="inline-flex flex-wrap items-center gap-2 bg-[#F8F9FA] rounded-full p-1.5 pr-4 border border-gray-100 text-xs text-gray-700 shadow-2xs">
        <span className="bg-[#22362B] text-[#D1FAE5] font-semibold px-2.5 py-1 rounded-full text-[11px] tracking-wide">
          PB07 • Chuyến đi
        </span>
        <span className="font-semibold text-gray-900">Đà Nẵng – Huế</span>
        <span className="text-gray-300">•</span>
        <span>3 ngày 2 đêm</span>
        <span className="text-gray-300">•</span>
        <span>Ngân sách: <strong className="font-semibold text-gray-900">{dailyCostText}</strong> / ngày</span>
        <span className="text-gray-300">•</span>
        <span className="text-emerald-700 font-medium">Tàu hỏa & Xe điện</span>
      </div>

      {/* Main Title & Guiding Text */}
      <div className="space-y-2">
        <h1 className="text-[26px] md:text-[30px] font-display font-extrabold text-gray-950 tracking-tight leading-snug">
          Chuyến đi này, bạn ưu tiên điều gì?
        </h1>
        <p className="text-[13.5px] text-gray-500 leading-relaxed max-w-2xl">
          Kéo các thanh trượt bên dưới để cân bằng giữa <strong className="font-semibold text-gray-800">Du lịch Xanh</strong>, 
          <strong className="font-semibold text-gray-800"> Ngân sách</strong> và các mục tiêu bền vững. Hệ thống tự động chuẩn hóa 
          tổng tỷ trọng <strong className="font-bold text-gray-900">∑wᵢ = 100%</strong>. Bấm biểu tượng 🔒 để cố định tiêu chí bạn mong muốn.
        </p>
      </div>

      {/* Quick Presets Section */}
      <div className="space-y-3 pt-1">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-gray-800 uppercase tracking-wider text-[11px]">Gợi ý nhanh (Presets)</span>
          <span className="bg-[#ECFDF5] text-[#065F46] border border-emerald-200 font-semibold px-2.5 py-0.5 rounded-full text-[11px] flex items-center gap-1 shadow-2xs">
            <CheckCircle2 size={13} className="text-emerald-600" />
            Tổng tỷ trọng: {totalWeight}% {totalWeight === 100 ? '(Đạt chuẩn 1.00)' : ''}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map((preset) => {
            const isActive = activePreset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer ${
                  isActive
                    ? 'bg-black text-white font-semibold shadow-xs scale-102'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200 hover:text-black'
                }`}
                title={preset.description}
              >
                {preset.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Stacked 100% Visual Distribution Bar */}
      <div className="space-y-1.5 pt-1">
        <div className="w-full h-3 rounded-full overflow-hidden flex bg-gray-200 p-0.5 gap-0.5 shadow-inner">
          {SLIDER_OBJECTIVES.map((obj) => {
            const val = weights[obj.id] || 0;
            if (val <= 0) return null;
            return (
              <div
                key={obj.id}
                style={{ width: `${val}%`, backgroundColor: obj.color }}
                className="h-full rounded-full transition-all duration-300 relative group cursor-pointer"
                title={`${obj.name}: ${val}%`}
              />
            );
          })}
        </div>
        <div className="flex flex-wrap justify-between text-[11px] text-gray-500 font-medium px-0.5">
          {SLIDER_OBJECTIVES.map((obj) => (
            <span key={obj.id} className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: obj.color }} />
              <strong className="text-gray-900">{obj.name.split('(')[0].trim()}:</strong> {weights[obj.id] || 0}%
            </span>
          ))}
        </div>
      </div>

      {/* Primary Highlights: Green Priority & Budget Sliders */}
      <div className="space-y-3 pt-2">
        <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">
          Hai tiêu chí trọng tâm (PB08 Core Sliders)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {SLIDER_OBJECTIVES.filter((o) => o.isPrimary).map((obj) => renderSliderCard(obj, true))}
        </div>
      </div>

      {/* Secondary Multi-Objective Sliders */}
      <div className="space-y-3 pt-2">
        <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">
          Các mục tiêu cân bằng bổ sung
        </h2>
        <div className="grid grid-cols-1 gap-2.5">
          {SLIDER_OBJECTIVES.filter((o) => !o.isPrimary).map((obj) => renderSliderCard(obj, false))}
        </div>
      </div>

      {/* Bottom Sticky Action Bar */}
      <div className="pt-4 border-t border-gray-100 flex flex-wrap items-center justify-between gap-4">
        <button
          type="button"
          onClick={handleReset}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all cursor-pointer"
        >
          <RotateCcw size={14} />
          Đặt lại về Cân bằng
        </button>

        <button
          type="button"
          onClick={() => onGeneratePlan?.(weights)}
          className="inline-flex items-center gap-2.5 px-6 py-2.5 rounded-full bg-black text-white text-xs font-semibold hover:bg-gray-800 transition-all shadow-md hover:shadow-lg cursor-pointer transform active:scale-98"
        >
          <span>Tạo hành trình xanh với tỷ trọng này</span>
          <ArrowRight size={15} />
        </button>
      </div>

      {/* Floating Dynamic Metric Summary */}
      <div className="rounded-2xl border border-emerald-100 bg-gradient-to-r from-[#F4F7F5] to-[#ECFDF5] p-4 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#22362B] text-[#D1FAE5] flex items-center justify-center font-bold text-lg shadow-xs">
            🌿
          </div>
          <div>
            <h4 className="text-xs font-bold text-gray-900">Dự báo tác động môi trường & chi phí</h4>
            <p className="text-[11px] text-gray-500">Dựa trên trọng số thời gian thực bạn vừa thiết lập</p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-center">
          <div className="px-3 py-1 bg-white rounded-xl border border-gray-100 shadow-2xs">
            <span className="block text-[10px] text-gray-500 font-medium">Giảm phát thải</span>
            <strong className="text-sm font-extrabold text-emerald-700">-{co2ReductionPercent}% CO₂</strong>
          </div>
          <div className="px-3 py-1 bg-white rounded-xl border border-gray-100 shadow-2xs">
            <span className="block text-[10px] text-gray-500 font-medium">Chỉ số Eco-Score</span>
            <strong className="text-sm font-extrabold text-[#22362B]">{ecoScore}/100</strong>
          </div>
          <div className="px-3 py-1 bg-white rounded-xl border border-gray-100 shadow-2xs">
            <span className="block text-[10px] text-gray-500 font-medium">Ước tính ngân sách</span>
            <strong className="text-sm font-extrabold text-gray-900">~{dailyCostText}</strong>
          </div>
        </div>
      </div>
    </div>
  );

  // Helper renderer for each slider card
  function renderSliderCard(obj: SliderObjective, isFeatured: boolean) {
    const val = weights[obj.id] || 0;
    const isLocked = !!lockedMap[obj.id];
    const isDragging = activeDraggingId === obj.id;
    const IconComponent = obj.icon;

    return (
      <div
        key={obj.id}
        className={`rounded-2xl border transition-all ${
          isFeatured
            ? 'p-4 bg-white border-gray-200 hover:border-gray-300 shadow-xs'
            : 'p-3.5 bg-[#FAFBFB] border-gray-150 hover:bg-white hover:border-gray-200'
        }`}
      >
        {/* Top Header of Card */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2.5">
            <div 
              className="w-7 h-7 rounded-lg flex items-center justify-center text-white"
              style={{ backgroundColor: obj.color }}
            >
              <IconComponent size={14} />
            </div>
            <div>
              <span className="text-[13px] font-bold text-gray-900 block leading-tight">
                {obj.name}
              </span>
              <span className="text-[11px] text-gray-500 block leading-tight">
                {obj.sublabel}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Lock Button */}
            <button
              type="button"
              onClick={() => toggleLock(obj.id)}
              className={`w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                isLocked 
                  ? 'bg-[#22362B] text-[#D1FAE5] shadow-xs' 
                  : 'bg-gray-100 text-gray-400 hover:text-gray-700 hover:bg-gray-200'
              }`}
              title={isLocked ? 'Đang khóa (Tỷ trọng cố định)' : 'Chưa khóa (Tự động cân bằng)'}
              aria-label={isLocked ? `Mở khóa ${obj.name}` : `Khóa ${obj.name}`}
            >
              {isLocked ? <Lock size={12} /> : <Unlock size={12} />}
            </button>

            {/* Percentage Display Badge */}
            <div className={`px-2.5 py-0.5 rounded-full font-display font-extrabold text-xs transition-colors ${
              isLocked 
                ? 'bg-gray-100 text-gray-800 border border-gray-200' 
                : 'bg-black text-white'
            }`}>
              {val}%
            </div>
          </div>
        </div>

        {/* Short description */}
        <p className="text-[11.5px] text-gray-500 leading-relaxed mb-3 line-clamp-2">
          {obj.description}
        </p>

        {/* Custom Range Slider Track */}
        <div className="relative flex items-center py-1">
          {/* Active Fill Track */}
          <div className="w-full h-2 bg-gray-200 rounded-full relative overflow-hidden pointer-events-none">
            <div
              className="h-full rounded-full transition-all duration-75"
              style={{
                width: `${val}%`,
                backgroundColor: obj.color,
              }}
            />
          </div>

          {/* Native Range Input for accessibility & smooth dragging */}
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={val}
            disabled={isLocked}
            onChange={(e) => handleSliderChange(obj.id, Number(e.target.value))}
            onMouseDown={() => setActiveDraggingId(obj.id)}
            onMouseUp={() => setActiveDraggingId(null)}
            onTouchStart={() => setActiveDraggingId(obj.id)}
            onTouchEnd={() => setActiveDraggingId(null)}
            className={`absolute inset-0 w-full opacity-0 cursor-pointer ${
              isLocked ? 'cursor-not-allowed' : ''
            }`}
            aria-label={obj.name}
          />

          {/* Custom Visual Thumb */}
          <div
            className={`absolute w-5 h-5 rounded-full bg-white border-[3px] shadow-sm pointer-events-none -translate-x-1/2 transition-transform duration-75 ${
              isDragging ? 'scale-125 border-[#D1FAE5]' : 'scale-100'
            }`}
            style={{
              left: `${val}%`,
              borderColor: isDragging ? '#10B981' : obj.color,
              boxShadow: isDragging ? `0 0 0 6px rgba(34, 54, 43, 0.15)` : '0 1px 3px rgba(0,0,0,0.2)',
            }}
          />
        </div>

        {/* Ticks & Boundary Labels */}
        <div className="flex justify-between text-[10px] text-gray-400 font-medium pt-1">
          <span>{obj.minLabel}</span>
          <span className="text-gray-300">50%</span>
          <span>{obj.maxLabel}</span>
        </div>
      </div>
    );
  }
}
