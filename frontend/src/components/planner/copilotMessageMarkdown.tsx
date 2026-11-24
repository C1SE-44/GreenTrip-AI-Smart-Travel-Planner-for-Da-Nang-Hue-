import { MapPin } from 'lucide-react';
import type { CopilotSuggestedPoi } from '@/services/copilotService';

export interface CopilotChatMessageItem {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp?: string;
  suggestedPois?: CopilotSuggestedPoi[];
  avoidNotice?: string | null;
  greenImpact?: string | null;
  budgetImpact?: string | null;
  actionType?: string;
  factCheckWarning?: string | null;
  mutationSummary?: string[];
  updatedDaysCount?: number | null;
  updatedDestination?: string | null;
  hasMutatedItinerary?: boolean;
  reasoningTrace?: string;
}

export interface CopilotEntityLookupItem {
  id: string;
  name: string;
  city?: string;
}

function normalizeLookupText(value: string): string {
  return value
    .replace(/\(.*?\)/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferCityTag(value?: string): 'hue' | 'danang' | null {
  if (!value) return null;
  const norm = normalizeLookupText(value);
  const hasHue = norm.includes('hue');
  const hasDn = norm.includes('da nang') || norm.includes('danang') || norm.includes('hoi an');
  if (hasHue && !hasDn) return 'hue';
  if (hasDn && !hasHue) return 'danang';
  return null;
}

export function sanitizeCopilotReplyText(rawText: string, userPrompt = ''): string {
  const trimmed = (rawText || '').trim();
  const lower = trimmed.toLowerCase();
  const isRawTechError =
    lower === 'please wait...' ||
    lower === 'please wait' ||
    lower.includes('<title>please wait') ||
    lower.includes('just a moment...') ||
    lower.includes('enable javascript and cookies') ||
    lower.includes('<!doctype html') ||
    lower.includes('<html');

  if (!isRawTechError) return trimmed;

  const hasSocialUrl = /(?:tiktok\.com|vt\.tiktok\.com|facebook\.com|fb\.watch|instagram\.com|youtu\.be|youtube\.com)/i.test(
    userPrompt
  );
  if (hasSocialUrl) {
    return (
      'Mình chưa thể đọc trực tiếp nội dung từ liên kết mạng xã hội bạn vừa dán (do nền tảng chặn truy cập tự động).\n\n' +
      'Bạn chỉ cần gõ **tên địa điểm, tên quán hoặc mô tả ngắn trong video**, mình sẽ tra cứu ngay tọa độ thật, giá tham khảo và gợi ý khung giờ vắng khách cho bạn. Bạn đang quan tâm đến điểm nào trong video đó?'
    );
  }
  return 'Hệ thống đang tạm thời phản hồi chậm. Bạn vui lòng bấm thử lại hoặc nhập tên địa điểm bạn quan tâm nhé!';
}

export function findMatchingPoiIdForLabel(
  label: string,
  entityLookup?: CopilotEntityLookupItem[],
  preferredCity?: string
): string | null {
  if (!entityLookup || entityLookup.length === 0) return null;
  const cleaned = normalizeLookupText(label);
  if (cleaned.length < 3) return null;

  const preferredTag = inferCityTag(preferredCity);
  const labelCityTag = inferCityTag(label);
  const effectiveCityTag = labelCityTag || preferredTag;

  // Disambiguate the 3 Linh Ung Pagodas explicitly
  const isLinhUng = cleaned.includes('linh ung');
  const wantsSonTra = cleaned.includes('son tra') || cleaned.includes('bai but');
  const wantsBaNa = cleaned.includes('ba na');
  const wantsNonNuoc = cleaned.includes('non nuoc') || cleaned.includes('ngu hanh son');

  const isCompatibleCandidate = (item: CopilotEntityLookupItem, itemNorm: string): boolean => {
    if (isLinhUng) {
      if (wantsSonTra && (itemNorm.includes('ba na') || itemNorm.includes('non nuoc'))) return false;
      if (wantsBaNa && (itemNorm.includes('son tra') || itemNorm.includes('bai but') || itemNorm.includes('non nuoc'))) return false;
      if (wantsNonNuoc && (itemNorm.includes('ba na') || itemNorm.includes('son tra') || itemNorm.includes('bai but'))) return false;
    }
    if (effectiveCityTag) {
      const itemTag = inferCityTag(item.city);
      if (itemTag && itemTag !== effectiveCityTag) return false;
    }
    return true;
  };

  let bestPartialId: string | null = null;
  let bestPartialScore = 0;

  for (const item of entityLookup) {
    const itemFull = normalizeLookupText(item.name);
    if (!itemFull || !isCompatibleCandidate(item, itemFull)) continue;

    // 1. Exact normalized match always wins
    if (itemFull === cleaned) {
      return item.id;
    }

    // 1b. Explicit Linh Ung Pagoda site disambiguation (handles 'Bãi Bụt' sitting between 'Linh Ứng' and 'Sơn Trà')
    if (isLinhUng && itemFull.includes('linh ung')) {
      if (wantsSonTra && (itemFull.includes('son tra') || itemFull.includes('bai but'))) {
        return item.id;
      }
      if (wantsBaNa && itemFull.includes('ba na')) {
        return item.id;
      }
      if (wantsNonNuoc && (itemFull.includes('non nuoc') || itemFull.includes('ngu hanh son'))) {
        return item.id;
      }
    }

    // 2. Careful substring match: require strong length overlap (>= 60%) or explicit Linh Ung site match
    if (cleaned.length >= 6) {
      const contained = itemFull.includes(cleaned) || cleaned.includes(itemFull);
      if (contained) {
        const shorter = Math.min(cleaned.length, itemFull.length);
        const longer = Math.max(cleaned.length, itemFull.length);
        const ratio = shorter / longer;
        const tokenCount = cleaned.split(' ').filter(Boolean).length;
        if (ratio >= 0.6 || (isLinhUng && tokenCount >= 4)) {
          if (ratio > bestPartialScore) {
            bestPartialScore = ratio;
            bestPartialId = item.id;
          }
        }
      }
    }
  }

  return bestPartialId;
}

function renderInlineMarkdown(
  text: string,
  entityLookup?: CopilotEntityLookupItem[],
  onHoverPoi?: (id: string | null) => void,
  onSelectPoi?: (id: string) => void,
  preferredCity?: string
) {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      const inner = part.slice(2, -2);
      const matchedPoiId = findMatchingPoiIdForLabel(inner, entityLookup, preferredCity);
      if (matchedPoiId && (onHoverPoi || onSelectPoi)) {
        return (
          <button
            key={i}
            type="button"
            onMouseEnter={() => onHoverPoi?.(matchedPoiId)}
            onMouseLeave={() => onHoverPoi?.(null)}
            onClick={() => onSelectPoi?.(matchedPoiId)}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded-md bg-emerald-50/90 hover:bg-emerald-100 text-emerald-950 font-semibold border border-emerald-300/80 transition-colors cursor-pointer align-baseline shadow-2xs"
            title="Di chuột để sáng ghim trên bản đồ • Bấm để xem chi tiết địa điểm"
          >
            <MapPin size={11} className="text-emerald-700 shrink-0" />
            <span className="underline decoration-emerald-600/50 underline-offset-2">{inner}</span>
          </button>
        );
      }
      return (
        <strong key={i} className="font-semibold text-neutral-950">
          {inner}
        </strong>
      );
    }
    return part;
  });
}

export function FormattedCopilotMessage({
  text,
  entityLookup,
  preferredCity,
  onHoverPoi,
  onSelectPoi,
}: {
  text: string;
  entityLookup?: CopilotEntityLookupItem[];
  preferredCity?: string;
  onHoverPoi?: (id: string | null) => void;
  onSelectPoi?: (id: string) => void;
}) {
  const lines = text.split('\n');

  return (
    <div className="space-y-1.5 text-[13px] leading-relaxed text-neutral-800">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return <div key={idx} className="h-1" />;
        }

        // Special Badges: Di chuyển, Chi phí, Lý do
        if (trimmed.includes('📍') || trimmed.includes('Di chuyển:')) {
          return (
            <div key={idx} className="flex items-start gap-1.5 pl-2 my-1 text-[12px] text-neutral-700 bg-neutral-100/70 p-2 rounded-xl border border-neutral-200/50">
              <span className="shrink-0 text-xs">📍</span>
              <div className="flex-1 leading-normal">
                {renderInlineMarkdown(trimmed.replace(/^[-*]\s*/, ''), entityLookup, onHoverPoi, onSelectPoi, preferredCity)}
              </div>
            </div>
          );
        }

        if (trimmed.includes('💸') || trimmed.includes('Chi phí')) {
          return (
            <div key={idx} className="flex items-start gap-1.5 pl-2 my-1 text-[12px] text-amber-950 bg-amber-50/70 p-2 rounded-xl border border-amber-200/50 font-mono">
              <span className="shrink-0 text-xs">💸</span>
              <div className="flex-1 leading-normal">
                {renderInlineMarkdown(trimmed.replace(/^[-*]\s*/, ''), entityLookup, onHoverPoi, onSelectPoi, preferredCity)}
              </div>
            </div>
          );
        }

        if (trimmed.includes('✅') || trimmed.includes('Lý do:')) {
          return (
            <div key={idx} className="flex items-start gap-1.5 pl-2 my-1 text-[12px] text-emerald-950 bg-emerald-50/70 p-2 rounded-xl border border-emerald-200/50">
              <span className="shrink-0 text-xs">✅</span>
              <div className="flex-1 leading-normal">
                {renderInlineMarkdown(trimmed.replace(/^[-*]\s*/, ''), entityLookup, onHoverPoi, onSelectPoi, preferredCity)}
              </div>
            </div>
          );
        }

        // Numbered list item
        const numMatch = trimmed.match(/^(\d+)\.\s*(.*)/);
        if (numMatch) {
          const num = numMatch[1];
          const content = numMatch[2];
          return (
            <div key={idx} className="flex items-start gap-2.5 pl-1 my-1.5">
              <span className="font-bold text-[13px] text-neutral-900 shrink-0">
                {num}.
              </span>
              <div className="flex-1 leading-normal text-neutral-800">
                {renderInlineMarkdown(content, entityLookup, onHoverPoi, onSelectPoi, preferredCity)}
              </div>
            </div>
          );
        }

        // Bullet point lines starting with "- " or "* "
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          const content = trimmed.substring(2);
          return (
            <div key={idx} className="flex items-start gap-2 pl-1 my-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 mt-2 shrink-0" />
              <div className="flex-1 leading-normal text-neutral-800">
                {renderInlineMarkdown(content, entityLookup, onHoverPoi, onSelectPoi, preferredCity)}
              </div>
            </div>
          );
        }

        // Section header (e.g. "**1. Tiêu đề**" or "**Gợi ý 3 trải nghiệm...**")
        if (trimmed.startsWith('**') && trimmed.endsWith('**') && !trimmed.slice(2, -2).includes('**')) {
          const headerText = trimmed.slice(2, -2);
          return (
            <h4
              key={idx}
              className="font-bold text-[14px] text-neutral-950 mt-3 mb-1.5 pt-2 border-t border-neutral-100 first:border-0 first:pt-0 first:mt-0 tracking-tight"
            >
              {headerText}
            </h4>
          );
        }

        return (
          <p key={idx} className="leading-relaxed">
            {renderInlineMarkdown(trimmed, entityLookup, onHoverPoi, onSelectPoi, preferredCity)}
          </p>
        );
      })}
    </div>
  );
}
