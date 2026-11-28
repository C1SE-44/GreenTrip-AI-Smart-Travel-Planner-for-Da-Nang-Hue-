import { X } from 'lucide-react';

export const TRIP_INTERESTS = [
  { id: 'beach', label: 'Biển' },
  { id: 'nature', label: 'Thiên nhiên' },
  { id: 'culture', label: 'Văn hóa – Lịch sử' },
  { id: 'food', label: 'Ẩm thực' },
  { id: 'coffee', label: 'Cà phê' },
  { id: 'checkin', label: 'Check-in' },
  { id: 'adventure', label: 'Phiêu lưu' },
  { id: 'relaxation', label: 'Nghỉ dưỡng' },
  { id: 'spiritual', label: 'Tâm linh' },
  { id: 'local', label: 'Trải nghiệm địa phương' },
] as const;

interface TripPreferencesModalProps {
  selectedInterests: string[];
  preferenceText: string;
  onToggleInterest: (interestId: string) => void;
  onChangePreferenceText: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
  nested?: boolean;
}

export default function TripPreferencesModal({
  selectedInterests,
  preferenceText,
  onToggleInterest,
  onChangePreferenceText,
  onClose,
  onSave,
  nested = false,
}: TripPreferencesModalProps) {
  return (
    <div
      className={`${nested ? 'absolute' : 'fixed'} inset-0 z-[110] flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs animate-fadeIn`}
      onClick={(event) => {
        event.stopPropagation();
        onClose();
      }}
    >
      <div
        className="w-full max-w-[480px] max-h-[90vh] overflow-y-auto bg-white rounded-3xl p-6 sm:p-7 shadow-2xl mx-4 flex flex-col border border-gray-100"
        role="dialog"
        aria-modal="true"
        aria-label="Sở thích"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6">
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-800"
            aria-label="Đóng sở thích"
          >
            <X size={18} />
          </button>
          <div className="text-[16px] font-bold text-black">Sở thích</div>
          <div className="w-8" aria-hidden="true" />
        </div>
        <p className="mb-3 text-[13px] font-semibold text-gray-800">Sở thích gợi ý</p>
        <div className="mb-5 flex flex-wrap gap-2">
          {TRIP_INTERESTS.map((interest) => {
            const selected = selectedInterests.includes(interest.id);
            return (
              <button
                key={interest.id}
                type="button"
                aria-pressed={selected}
                onClick={() => onToggleInterest(interest.id)}
                className={`px-4 py-2 rounded-full border text-[13px] font-semibold transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-800 ${
                  selected
                    ? 'bg-black text-white border-black shadow-xs'
                    : 'border-gray-200 text-gray-800 hover:border-black'
                }`}
              >
                {interest.label}
              </button>
            );
          })}
        </div>
        <label htmlFor="trip-preference-text" className="mb-2 text-[13px] font-semibold text-gray-800">
          Sở thích khác <span className="font-normal text-gray-600">(không bắt buộc)</span>
        </label>
        <textarea
          id="trip-preference-text"
          value={preferenceText}
          onChange={(event) => onChangePreferenceText(event.target.value)}
          placeholder="Ví dụ: Thích nơi yên tĩnh, ngắm bình minh, ăn món địa phương..."
          className="w-full min-h-[76px] resize-y rounded-[14px] border border-[#c8c8c8] px-3 py-2.5 text-[13px] leading-relaxed text-gray-900 placeholder:text-gray-500 focus:border-black focus:outline-none focus:ring-1 focus:ring-black transition-all"
        />
        <div className="flex justify-end pt-5">
          <button
            type="button"
            onClick={onSave}
            className="w-full sm:w-32 font-bold text-[14px] py-3 rounded-full bg-black text-white hover:bg-neutral-800 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-800"
          >
            Cập nhật
          </button>
        </div>
      </div>
    </div>
  );
}
