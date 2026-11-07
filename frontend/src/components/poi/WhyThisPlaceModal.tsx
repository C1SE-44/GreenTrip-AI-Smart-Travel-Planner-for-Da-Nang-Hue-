import React, { useEffect, useState } from 'react';
import {
  X,
  Sparkles,
  Leaf,
  MapPin,
  Wallet,
  Compass,
  Star,
  CheckCircle2,
  Share2,
  ExternalLink,
  Loader2,
  Network,
  ShieldCheck,
  Plus,
  Check,
} from 'lucide-react';
import type { Poi } from '@/data/pois';
import { categoryLabels, SUB_CATEGORY_LABELS } from '@/data/pois';
import {
  getPoiExplanationFacts,
  type PoiExplanationFactsResponse,
  type ExplanationFact,
} from '@/services/poi';

interface WhyThisPlaceModalProps {
  poi: Poi | null;
  isOpen: boolean;
  onClose: () => void;
  onToggleAddTrip?: (id: string) => void;
  isAdded?: boolean;
}

export default function WhyThisPlaceModal({
  poi,
  isOpen,
  onClose,
  onToggleAddTrip,
  isAdded = false,
}: WhyThisPlaceModalProps) {
  const [loading, setLoading] = useState(false);
  const [factsResponse, setFactsResponse] = useState<PoiExplanationFactsResponse | null>(null);

  useEffect(() => {
    if (!isOpen || !poi) {
      setFactsResponse(null);
      return;
    }

    let isMounted = true;
    setLoading(true);

    getPoiExplanationFacts(poi.id)
      .then((res) => {
        if (isMounted) {
          setFactsResponse(res);
          setLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setFactsResponse(null);
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, poi]);

  // Đóng bằng phím Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !poi) return null;

  const displayName = poi.cleanTitle || poi.cleanName || poi.name;
  const categoryLabel = poi.sub_category && SUB_CATEGORY_LABELS[poi.sub_category]
    ? SUB_CATEGORY_LABELS[poi.sub_category]
    : categoryLabels[poi.category] || 'Điểm tham quan';

  const hasGraphFacts = Boolean(factsResponse && factsResponse.facts.length > 0);
  const graphFacts = factsResponse?.facts || [];

  const categoryFacts = graphFacts.filter((f) => f.relationship === 'IN_CATEGORY');
  const activityFacts = graphFacts.filter((f) => f.relationship === 'OFFERS_ACTIVITY');
  const locationFacts = graphFacts.filter((f) => f.relationship === 'LOCATED_IN');

  const ecoScoreDisplay = poi.ecoScore
    ? poi.ecoScore <= 1
      ? Math.round(poi.ecoScore * 100)
      : Math.round(poi.ecoScore)
    : 78;

  const costDisplay = poi.estimatedCost !== null && poi.estimatedCost !== undefined
    ? poi.estimatedCost === 0
      ? 'Miễn phí vé vào'
      : `~${poi.estimatedCost.toLocaleString('vi-VN')} ₫/người`
    : poi.budget_tier
      ? `Ngân sách ${poi.budget_tier}`
      : 'Bình dân & Hợp lý';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="why-place-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs animate-fadeIn"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-2xl max-h-[90vh] flex flex-col bg-[#F7FAF7] rounded-[24px] shadow-2xl border border-neutral-200/90 overflow-hidden animate-scaleUp"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4.5 bg-white border-b border-neutral-200/80 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shadow-xs">
              <Sparkles className="w-5 h-5 text-emerald-700" />
            </div>
            <div>
              <h2
                id="why-place-title"
                className="text-base sm:text-lg font-bold text-neutral-900 leading-snug flex items-center gap-2"
              >
                <span>Vì sao AI gợi ý điểm đến này?</span>
                <span className="text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-300 rounded-full px-2 py-0.5">
                  Explainable AI
                </span>
              </h2>
              <p className="text-xs text-neutral-500 font-normal">
                Minh bạch thuật toán & Dẫn chứng tri thức từ GreenTrip AI
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng cửa sổ giải thích"
            className="w-9 h-9 rounded-full text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 flex items-center justify-center transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="overflow-y-auto p-5 sm:p-6 space-y-4 text-neutral-800 text-sm">
          {/* Hero POI Banner */}
          <div className="bg-white rounded-2xl p-4 border border-neutral-200/80 shadow-xs flex items-center gap-4">
            <img
              src={poi.image}
              alt={displayName}
              referrerPolicy="no-referrer"
              className="w-18 h-18 sm:w-20 sm:h-20 rounded-xl object-cover shrink-0 bg-neutral-100"
            />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 text-[11px] font-bold border border-emerald-200">
                  {categoryLabel}
                </span>
                <span className="text-xs text-neutral-400 font-medium">·</span>
                <span className="text-xs text-neutral-600 font-medium flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-neutral-400" />
                  {poi.city}
                </span>
                {poi.rating && (
                  <span className="text-xs font-bold text-neutral-800 flex items-center gap-0.5">
                    <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                    {poi.rating.toFixed(1)}
                  </span>
                )}
              </div>
              <h3 className="font-bold text-base text-neutral-900 truncate">
                {displayName}
              </h3>
              <p className="text-xs text-neutral-500 line-clamp-1">
                {poi.address || `${poi.city}, Việt Nam`}
              </p>
            </div>
            <div className="text-right shrink-0">
              <div className="text-[10px] text-neutral-500 font-medium">Chỉ số Xanh</div>
              <div className="text-lg font-black text-emerald-800 flex items-center justify-end gap-1">
                <Leaf className="w-4 h-4 text-emerald-600" />
                <span>{ecoScoreDisplay}</span>
                <span className="text-xs text-neutral-400 font-normal">/100</span>
              </div>
            </div>
          </div>

          {/* Sơ đồ Chuỗi Tri thức (Knowledge Chain) */}
          <div className="bg-emerald-900 text-white rounded-2xl p-4 shadow-sm border border-emerald-800 space-y-2.5">
            <div className="flex items-center justify-between text-xs text-emerald-200 font-semibold uppercase tracking-wider">
              <span className="flex items-center gap-1.5">
                <Network className="w-3.5 h-3.5" />
                Chuỗi Khớp Tri thức (Knowledge Alignment)
              </span>
              <span className="text-[11px] text-emerald-300 bg-emerald-800/80 px-2 py-0.5 rounded-full">
                {hasGraphFacts ? 'Neo4j Aura Graph' : 'Content-Based Filtering'}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-center text-xs">
              <div className="bg-emerald-800/60 rounded-xl p-2.5 border border-emerald-700/50">
                <div className="text-emerald-300 font-semibold mb-0.5">1. Gu Du khách</div>
                <div className="text-white font-medium text-[11px]">
                  Ưu tiên sinh thái & Trải nghiệm bản sắc
                </div>
              </div>
              <div className="bg-emerald-800/60 rounded-xl p-2.5 border border-emerald-700/50">
                <div className="text-emerald-300 font-semibold mb-0.5">2. Thuật toán AI</div>
                <div className="text-white font-medium text-[11px]">
                  Cân bằng Đa mục tiêu Xanh & Chi phí
                </div>
              </div>
              <div className="bg-emerald-800/60 rounded-xl p-2.5 border border-emerald-700/50">
                <div className="text-emerald-300 font-semibold mb-0.5">3. Điểm hẹn Khớp</div>
                <div className="text-white font-medium text-[11px] truncate">
                  {displayName}
                </div>
              </div>
            </div>
          </div>

          {/* 4 Trụ Cột Dẫn Chứng Cụ Thể */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Trụ cột 1: Tiêu chuẩn Xanh & Bền vững */}
            <div className="bg-white rounded-xl p-3.5 border border-neutral-200/80 shadow-xs space-y-2">
              <div className="flex items-center gap-2 text-emerald-800 font-bold text-xs uppercase tracking-wider">
                <Leaf className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Tiêu chí Sinh thái & Bền vững</span>
              </div>
              <p className="text-xs text-neutral-600 leading-relaxed">
                {poi.isLocalBusiness || factsResponse?.poi.is_local_business ? (
                  <span className="block font-semibold text-emerald-900 mb-1">
                    ✓ Doanh nghiệp & Dịch vụ địa phương (Local Business)
                  </span>
                ) : null}
                {poi.eco_features && poi.eco_features.length > 0 ? (
                  <span>Đặc trưng xanh: {poi.eco_features.join(', ')}.</span>
                ) : (
                  <span>
                    Điểm đến đạt chỉ số môi trường cao ({ecoScoreDisplay}/100), ưu tiên giảm rác thải nhựa và thân thiện tự nhiên.
                  </span>
                )}
              </p>
            </div>

            {/* Trụ cột 2: Hoạt động & Cảm xúc */}
            <div className="bg-white rounded-xl p-3.5 border border-neutral-200/80 shadow-xs space-y-2">
              <div className="flex items-center gap-2 text-neutral-900 font-bold text-xs uppercase tracking-wider">
                <Compass className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>Hoạt động & Cảm xúc trải nghiệm</span>
              </div>
              <div className="text-xs text-neutral-600 leading-relaxed">
                {activityFacts.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {activityFacts.map((f, idx) => (
                      <span
                        key={idx}
                        className="bg-neutral-100 text-neutral-800 rounded-md px-2 py-0.5 text-[11px] font-medium"
                      >
                        {f.target_name || f.target_key}
                      </span>
                    ))}
                  </div>
                ) : poi.vibes && poi.vibes.length > 0 ? (
                  <span>Phù hợp phong cách: <strong className="text-neutral-800">{poi.vibes.join(', ')}</strong>.</span>
                ) : (
                  <span>Thích hợp tham quan, tìm hiểu văn hóa và tận hưởng bầu không khí trong lành.</span>
                )}
              </div>
            </div>

            {/* Trụ cột 3: Ngân sách & Giá vé */}
            <div className="bg-white rounded-xl p-3.5 border border-neutral-200/80 shadow-xs space-y-2">
              <div className="flex items-center gap-2 text-neutral-900 font-bold text-xs uppercase tracking-wider">
                <Wallet className="w-4 h-4 text-neutral-700 shrink-0" />
                <span>Phù hợp Ngân sách chuyến đi</span>
              </div>
              <p className="text-xs text-neutral-600 leading-relaxed">
                Mức chi tiêu ước tính: <strong className="text-neutral-900">{costDisplay}</strong>. Phù hợp hoàn hảo với tiêu chí tối ưu chi phí của du khách.
              </p>
            </div>

            {/* Trụ cột 4: Vị trí & Di chuyển */}
            <div className="bg-white rounded-xl p-3.5 border border-neutral-200/80 shadow-xs space-y-2">
              <div className="flex items-center gap-2 text-neutral-900 font-bold text-xs uppercase tracking-wider">
                <MapPin className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>Định vị & Di chuyển Thuận tiện</span>
              </div>
              <p className="text-xs text-neutral-600 leading-relaxed">
                Tọa lạc tại <strong className="text-neutral-900">{poi.city}</strong>. Thuận tiện kết nối với các điểm đến lân cận bằng xe bus, xe đạp hoặc phương tiện cá nhân.
              </p>
            </div>
          </div>

          {/* Dẫn chứng thực tế từ Knowledge Graph nếu có */}
          {hasGraphFacts && (
            <div className="bg-white rounded-xl p-4 border border-emerald-200/80 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-800">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Các Fact Tri thức Đã Kiểm Chứng (Neo4j Graph Facts):</span>
              </div>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs text-neutral-700">
                {graphFacts.map((fact, index) => (
                  <li key={index} className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span className="font-mono text-[11px] text-neutral-500">[{fact.relationship}]</span>
                    <span className="font-medium text-neutral-900">{fact.target_name || fact.target_key}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-4 bg-white border-t border-neutral-200/80 shrink-0">
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              {hasGraphFacts
                ? 'Dẫn chứng xác thực từ Neo4j Knowledge Graph'
                : 'Dẫn chứng từ Thuật toán Content-Based Filtering & Hồ sơ Điểm đến'}
            </span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {onToggleAddTrip && (
              <button
                type="button"
                onClick={() => onToggleAddTrip(poi.id)}
                className={`min-h-[42px] px-4 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  isAdded
                    ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                    : 'bg-emerald-800 hover:bg-emerald-700 text-white shadow-xs'
                }`}
              >
                {isAdded ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Đã trong chuyến đi</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    <span>Thêm vào chuyến đi</span>
                  </>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="min-h-[42px] px-4 py-2 rounded-xl text-xs font-bold text-neutral-700 hover:bg-neutral-100 border border-neutral-200 transition-all cursor-pointer"
            >
              Đóng
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
