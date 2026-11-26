import type { FeasibilityResult } from '@/utils/tripFeasibility';
import { useEffect, useRef } from 'react';

interface FeasibilityWarningDialogProps {
  result: FeasibilityResult | null;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function statusLabel(result: FeasibilityResult): string {
  switch (result.status) {
    case 'FEASIBLE': return 'Chưa phát hiện rủi ro đáng kể';
    case 'TIGHT': return 'Lịch trình có thể khá dày';
    case 'LIKELY_INFEASIBLE': return 'Có rủi ro về thời gian hoặc chi phí';
    case 'INSUFFICIENT_DATA': return 'Chưa đủ dữ liệu để kết luận';
  }
}

function minutesLabel(value: number | null): string {
  if (value === null) return 'Chưa đủ dữ liệu';
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return hours ? `${hours} giờ ${minutes ? `${minutes} phút` : ''}`.trim() : `${minutes} phút`;
}

export function FeasibilitySummary({ result }: { result: FeasibilityResult }) {
  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-neutral-900" aria-label="Đánh giá sơ bộ tính khả thi">
      <h3 className="font-semibold">Đánh giá sơ bộ · {statusLabel(result)}</h3>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-neutral-700">
        <dt>Thời gian tham quan</dt><dd>{minutesLabel(result.total_visit_minutes)}</dd>
        <dt>Di chuyển ước tính</dt><dd>{minutesLabel(result.estimated_travel_minutes)}</dd>
        <dt>Thời gian nghỉ dự phòng</dt><dd>{minutesLabel(result.estimated_break_minutes)}</dd>
        <dt>Tổng khung giả định</dt><dd>{minutesLabel(result.available_minutes)}</dd>
        <dt>Độ phủ thời lượng</dt><dd>{result.time_coverage.known}/{result.time_coverage.total} POI</dd>
        {result.estimated_known_cost !== null && <>
          <dt>Chi phí POI đã biết</dt><dd>{Math.round(result.estimated_known_cost).toLocaleString('vi-VN')} VND</dd>
          <dt>Ngân sách chuyến</dt><dd>{result.budget_limit?.toLocaleString('vi-VN') ?? 'Chưa chuẩn hóa'} VND</dd>
          <dt>Độ phủ giá</dt><dd>{result.cost_coverage.known}/{result.cost_coverage.total} POI</dd>
        </>}
      </dl>
      {result.warnings.length > 0 && (
        <ul className="mt-3 list-disc space-y-1 pl-5">
          {result.warnings.map((warning, index) => <li key={`${warning.code}-${warning.poiIds?.join('-') ?? index}`}>{warning.reason}</li>)}
        </ul>
      )}
      {result.unknown_fields.length > 0 && (
        <p className="mt-2 text-neutral-700">Chưa xác định: {result.unknown_fields.join(', ')}.</p>
      )}
      {result.assumptions.length > 0 && (
        <details className="mt-3">
          <summary className="min-h-10 cursor-pointer font-medium">Xem dữ liệu và giả định</summary>
          <ul className="list-disc space-y-1 pl-5 text-neutral-700">
            {result.assumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}
          </ul>
        </details>
      )}
      <p className="mt-3 text-neutral-700">Đây là cảnh báo tham khảo. Bạn vẫn có quyền giữ POI; hệ thống không tự xóa địa điểm hoặc sửa lịch đã xác nhận.</p>
    </section>
  );
}

export default function FeasibilityWarningDialog({ result, confirmLabel, onConfirm, onCancel }: FeasibilityWarningDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!result) return;
    cancelRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), summary, [href], [tabindex]:not([tabindex="-1"])'));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [result, onCancel]);

  if (!result) return null;
  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-neutral-950/55 p-3 sm:p-6" role="presentation">
      <section
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="feasibility-dialog-title"
        aria-describedby="feasibility-dialog-description"
        className="max-h-[calc(100dvh-24px)] w-full max-w-xl overflow-y-auto rounded-3xl border border-neutral-200 bg-white p-5 shadow-2xl sm:p-6"
      >
        <h2 id="feasibility-dialog-title" className="text-lg font-semibold text-neutral-950">{statusLabel(result)}</h2>
        <p id="feasibility-dialog-description" className="mt-1 text-sm leading-relaxed text-neutral-700">
          GreenTrip kiểm tra dữ liệu hiện có để giúp bạn cân nhắc. Cảnh báo không chặn lựa chọn và không tự thay đổi chuyến đi.
        </p>
        <div className="mt-4"><FeasibilitySummary result={result} /></div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button ref={cancelRef} type="button" onClick={onCancel} className="min-h-11 rounded-xl border border-neutral-300 px-4 text-sm font-semibold text-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-800">
            Hủy
          </button>
          <button type="button" onClick={onConfirm} className="min-h-11 rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-800">
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
