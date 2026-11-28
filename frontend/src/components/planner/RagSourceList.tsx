import React, { useState } from 'react';
import { BookOpen, ChevronDown, ChevronUp, FileText, CheckCircle2 } from 'lucide-react';
import type { RagSourceItem } from '@/services/copilotService';

export interface RagSourceListProps {
  sources?: RagSourceItem[];
  className?: string;
}

export function RagSourceCard({
  source,
  index,
}: {
  source: RagSourceItem;
  index: number;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const cardId = `rag-source-detail-${index}-${source.title.replace(/\s+/g, '-').toLowerCase()}`;

  const scorePercent = typeof source.score === 'number' ? Math.round(source.score * 100) : null;

  return (
    <div className="rounded-xl border border-neutral-200/90 bg-neutral-50/70 p-3 text-xs text-neutral-800 transition-colors hover:bg-neutral-50">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <span className="font-semibold text-neutral-950 truncate max-w-[200px] sm:max-w-[280px]">
              {source.title}
            </span>
            {source.city && (
              <span className="rounded-md bg-emerald-100/80 px-1.5 py-0.5 text-[11px] font-medium text-emerald-900">
                {source.city}
              </span>
            )}
            {source.category && (
              <span className="rounded-md bg-neutral-200/70 px-1.5 py-0.5 text-[11px] text-neutral-700">
                {source.category}
              </span>
            )}
            {scorePercent !== null && (
              <span className="rounded-md bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-800 border border-blue-200/60">
                {scorePercent}% phù hợp
              </span>
            )}
          </div>
          <p className="text-[11px] text-neutral-600 truncate flex items-center gap-1">
            <FileText size={12} className="shrink-0 text-neutral-500" />
            <span className="truncate">{source.source}</span>
          </p>
        </div>

        <button
          type="button"
          aria-expanded={isExpanded}
          aria-controls={cardId}
          onClick={() => setIsExpanded(!isExpanded)}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-neutral-200 bg-white px-2 py-1 text-[11px] font-medium text-neutral-700 shadow-2xs hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 cursor-pointer"
        >
          {isExpanded ? (
            <>
              <span>Thu gọn</span>
              <ChevronUp size={13} />
            </>
          ) : (
            <>
              <span>Trích dẫn</span>
              <ChevronDown size={13} />
            </>
          )}
        </button>
      </div>

      {isExpanded && (
        <div id={cardId} className="mt-2.5 pt-2.5 border-t border-neutral-200/80 space-y-1.5">
          <div className="rounded-lg bg-white p-2.5 border border-neutral-200/80 text-[12px] leading-relaxed text-neutral-700 font-normal">
            <p className="italic">"{source.snippet}"</p>
          </div>
          <div className="flex items-center gap-1 text-[11px] text-emerald-800 font-medium pt-0.5">
            <CheckCircle2 size={12} className="text-emerald-700" />
            <span>Tài liệu du lịch đã kiểm chứng từ cơ sở dữ liệu GreenTrip</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function RagSourceList({ sources, className = '' }: RagSourceListProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (!sources || sources.length === 0) {
    return null;
  }

  return (
    <section
      aria-label="Nguồn tham khảo đã kiểm chứng"
      className={`mt-3 rounded-2xl border border-emerald-200/80 bg-emerald-50/40 p-3 text-neutral-900 ${className}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-800">
            <BookOpen size={13} />
          </div>
          <span className="text-xs font-semibold text-emerald-950">
            Nguồn tham khảo ({sources.length})
          </span>
          <span className="text-[11px] text-emerald-800/90 hidden sm:inline">
            • Dữ liệu kiểm chứng từ cẩm nang địa phương
          </span>
        </div>

        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
          className="inline-flex items-center gap-1 text-xs font-medium text-emerald-900 hover:text-emerald-950 hover:underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 rounded px-1.5 py-0.5"
        >
          <span>{isOpen ? 'Ẩn nguồn' : 'Xem danh sách'}</span>
          {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {isOpen && (
        <div className="mt-3 space-y-2 pt-2 border-t border-emerald-200/60">
          {sources.map((source, index) => (
            <RagSourceCard
              key={`${source.title}-${index}`}
              source={source}
              index={index}
            />
          ))}
        </div>
      )}
    </section>
  );
}
