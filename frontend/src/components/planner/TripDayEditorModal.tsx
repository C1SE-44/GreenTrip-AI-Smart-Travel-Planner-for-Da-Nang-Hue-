import { X } from 'lucide-react';
import { displayDateVi } from './tripItineraryUtils';

interface TripDayEditorModalProps {
  dayEditor: { dayNumber: number; field: 'title' | 'note' };
  dayDate?: string | null;
  value: string;
  onChangeValue: (val: string) => void;
  onClose: () => void;
  onSave: () => void;
}

export default function TripDayEditorModal({
  dayEditor,
  dayDate,
  value,
  onChangeValue,
  onClose,
  onSave,
}: TripDayEditorModalProps) {
  return (
    <div
      className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/50 px-4 py-6"
      onClick={onClose}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="day-editor-title"
        className="relative w-full max-w-xl rounded-[28px] bg-white p-7 shadow-2xl sm:p-10"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng"
          className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
        >
          <X size={21} />
        </button>
        <div className="text-center">
          <h2 id="day-editor-title" className="text-2xl font-bold text-gray-950">
            {dayEditor.field === 'title' ? 'Thêm tiêu đề' : 'Thêm ghi chú'}
          </h2>
          <p className="mt-2 text-base text-gray-700">
            Ngày {dayEditor.dayNumber}
            {dayDate ? ` · ${displayDateVi(dayDate)}` : ''}
          </p>
        </div>
        {dayEditor.field === 'title' ? (
          <input
            autoFocus
            type="text"
            maxLength={200}
            value={value}
            onChange={(event) => onChangeValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onSave();
            }}
            placeholder="Nhập tiêu đề cho ngày này"
            className="mt-9 h-16 w-full rounded-full border-2 border-gray-900 px-6 text-lg text-gray-950 placeholder:text-gray-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
          />
        ) : (
          <textarea
            autoFocus
            maxLength={2000}
            rows={4}
            value={value}
            onChange={(event) => onChangeValue(event.target.value)}
            placeholder="Ghi chú cho ngày này"
            className="mt-9 w-full resize-y rounded-2xl border border-gray-300 px-5 py-4 text-base text-gray-950 placeholder:text-gray-500 focus:border-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
          />
        )}
        <button
          type="button"
          onClick={onSave}
          className="mt-8 min-h-14 w-full rounded-full bg-gray-950 px-6 text-lg font-semibold text-white hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2"
        >
          Lưu
        </button>
      </section>
    </div>
  );
}
