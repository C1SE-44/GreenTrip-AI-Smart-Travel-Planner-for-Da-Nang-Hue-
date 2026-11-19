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

function findMatchingPoiIdForLabel(
  label: string,
  entityLookup?: Array<{ id: string; name: string }>
): string | null {
  if (!entityLookup || entityLookup.length === 0) return null;
  const cleaned = label.replace(/\(.*?\)/g, '').trim().toLowerCase();
  if (cleaned.length < 3) return null;
  for (const item of entityLookup) {
    const itemName = item.name.toLowerCase();
    const itemClean = itemName.replace(/\(.*?\)/g, '').trim();
    if (
      itemName === cleaned ||
      itemClean === cleaned ||
      (cleaned.length >= 5 && (itemName.includes(cleaned) || cleaned.includes(itemClean)))
    ) {
      return item.id;
    }
  }
  return null;
}

function renderInlineMarkdown(
  text: string,
  entityLookup?: Array<{ id: string; name: string }>,
  onHoverPoi?: (id: string | null) => void,
  onSelectPoi?: (id: string) => void
) {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      const inner = part.slice(2, -2);
      const matchedPoiId = findMatchingPoiIdForLabel(inner, entityLookup);
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
  onHoverPoi,
  onSelectPoi,
}: {
  text: string;
  entityLookup?: Array<{ id: string; name: string }>;
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
                {renderInlineMarkdown(trimmed.replace(/^[-*]\s*/, ''), entityLookup, onHoverPoi, onSelectPoi)}
              </div>
            </div>
          );
        }

        if (trimmed.includes('💸') || trimmed.includes('Chi phí')) {
          return (
            <div key={idx} className="flex items-start gap-1.5 pl-2 my-1 text-[12px] text-amber-950 bg-amber-50/70 p-2 rounded-xl border border-amber-200/50 font-mono">
              <span className="shrink-0 text-xs">💸</span>
              <div className="flex-1 leading-normal">
                {renderInlineMarkdown(trimmed.replace(/^[-*]\s*/, ''), entityLookup, onHoverPoi, onSelectPoi)}
              </div>
            </div>
          );
        }

        if (trimmed.includes('✅') || trimmed.includes('Lý do:')) {
          return (
            <div key={idx} className="flex items-start gap-1.5 pl-2 my-1 text-[12px] text-emerald-950 bg-emerald-50/70 p-2 rounded-xl border border-emerald-200/50">
              <span className="shrink-0 text-xs">✅</span>
              <div className="flex-1 leading-normal">
                {renderInlineMarkdown(trimmed.replace(/^[-*]\s*/, ''), entityLookup, onHoverPoi, onSelectPoi)}
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
                {renderInlineMarkdown(content, entityLookup, onHoverPoi, onSelectPoi)}
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
                {renderInlineMarkdown(content, entityLookup, onHoverPoi, onSelectPoi)}
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
            {renderInlineMarkdown(trimmed, entityLookup, onHoverPoi, onSelectPoi)}
          </p>
        );
      })}
    </div>
  );
}
