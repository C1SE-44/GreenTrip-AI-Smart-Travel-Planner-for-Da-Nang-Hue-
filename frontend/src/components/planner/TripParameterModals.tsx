import { useState } from 'react';
import { Calendar as CalendarIcon, Minus, Plus, X } from 'lucide-react';
import DateRangeCalendar from './DateRangeCalendar';

interface TripWhereModalProps {
  whereTarget: string;
  onChangeWhereTarget: (val: string) => void;
  byCar: boolean;
  onToggleByCar: () => void;
  onClose: () => void;
  onSave: () => void;
}

export function TripWhereModal({
  whereTarget,
  onChangeWhereTarget,
  byCar,
  onToggleByCar,
  onClose,
  onSave,
}: TripWhereModalProps) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fadeIn select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[480px] bg-white rounded-3xl p-6 sm:p-7 shadow-2xl mx-4 flex flex-col border border-gray-100 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6">
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 cursor-pointer"
          >
            <X size={18} />
          </button>
          <div className="text-[16px] font-bold text-black">Ở đâu</div>
          <div className="w-8"></div>
        </div>

        {/* Input + Ô tô toggle chuẩn OnboardingModal */}
        <div className="relative mb-5">
          <input
            type="text"
            placeholder="Vị trí"
            value={whereTarget}
            onChange={(e) => onChangeWhereTarget(e.target.value)}
            className="w-full rounded-full border border-gray-200 px-5 py-3 pr-36 text-[14px] font-light text-gray-900 focus:border-black focus:outline-none focus:ring-1 focus:ring-black transition-all"
          />
          <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
            <span className="text-[12px] font-bold text-black">Đi bằng ô tô?</span>
            <button
              type="button"
              onClick={onToggleByCar}
              className={`w-9 h-5 rounded-full flex items-center p-0.5 transition-colors cursor-pointer ${byCar ? 'bg-black' : 'bg-gray-200'}`}
            >
              <div className={`w-4 h-4 rounded-full bg-white shadow-xs transition-transform ${byCar ? 'translate-x-4' : 'translate-x-0'}`}></div>
            </button>
          </div>
        </div>

        {/* 3 Nút chọn vị trí: Huế, Đà Nẵng, Cả 2 */}
        <div className="flex gap-2 mb-6 flex-wrap">
          <button
            type="button"
            onClick={() => onChangeWhereTarget('Huế')}
            className={`px-4 py-2 rounded-full border text-[13px] font-semibold transition-all cursor-pointer ${
              whereTarget === 'Huế' ? 'bg-black text-white border-black shadow-xs' : 'border-gray-200 text-gray-800 hover:border-black'
            }`}
          >
            Huế
          </button>
          <button
            type="button"
            onClick={() => onChangeWhereTarget('Đà Nẵng')}
            className={`px-4 py-2 rounded-full border text-[13px] font-semibold transition-all cursor-pointer ${
              whereTarget === 'Đà Nẵng' ? 'bg-black text-white border-black shadow-xs' : 'border-gray-200 text-gray-800 hover:border-black'
            }`}
          >
            Đà Nẵng
          </button>
          <button
            type="button"
            onClick={() => onChangeWhereTarget('Đà Nẵng & Huế')}
            className={`px-4 py-2 rounded-full border text-[13px] font-semibold transition-all cursor-pointer ${
              whereTarget === 'Đà Nẵng & Huế' ? 'bg-black text-white border-black shadow-xs' : 'border-gray-200 text-gray-800 hover:border-black'
            }`}
          >
            Cả 2
          </button>
        </div>

        <div className="mt-auto flex justify-end">
          <button
            type="button"
            onClick={onSave}
            className="w-full sm:w-32 font-bold text-[14px] py-3 rounded-full bg-black text-white hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            Cập nhật
          </button>
        </div>
      </div>
    </div>
  );
}

const THREE_MONTHS_LIST = [
  { id: 'm1', label: 'Tháng 11' },
  { id: 'm2', label: 'Tháng 12' },
  { id: 'm3', label: 'Tháng 1' },
];

interface TripWhenModalProps {
  whenTab: 'dates' | 'flex';
  onChangeWhenTab: (tab: 'dates' | 'flex') => void;
  rangeStart: Date | null;
  rangeEnd: Date | null;
  onChangeRangeStart: (d: Date | null) => void;
  onChangeRangeEnd: (d: Date | null) => void;
  flexibleDays: number;
  onChangeFlexibleDays: (days: number) => void;
  selectedMonth: string;
  onChangeSelectedMonth: (month: string) => void;
  onClose: () => void;
  onSave: () => void;
}

export function TripWhenModal({
  whenTab,
  onChangeWhenTab,
  rangeStart,
  rangeEnd,
  onChangeRangeStart,
  onChangeRangeEnd,
  flexibleDays,
  onChangeFlexibleDays,
  selectedMonth,
  onChangeSelectedMonth,
  onClose,
  onSave,
}: TripWhenModalProps) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fadeIn select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[620px] bg-white rounded-3xl p-6 sm:p-7 shadow-2xl mx-4 border border-gray-100 flex flex-col relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Nút X đóng */}
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 cursor-pointer absolute top-6 left-6"
        >
          <X size={18} />
        </button>

        {/* Header: Title Khi + Pill switch Ngày tháng / Linh hoạt */}
        <div className="flex flex-col items-center mb-6">
          <div className="text-[17px] font-bold text-black mb-3">Khi</div>
          <div className="bg-gray-100 p-1 rounded-full flex gap-1">
            <button
              type="button"
              onClick={() => onChangeWhenTab('dates')}
              className={`px-5 py-1.5 rounded-full text-[13px] font-bold transition-all cursor-pointer ${
                whenTab === 'dates' ? 'bg-white shadow-xs text-black' : 'text-gray-500 hover:text-black'
              }`}
            >
              Ngày tháng
            </button>
            <button
              type="button"
              onClick={() => onChangeWhenTab('flex')}
              className={`px-5 py-1.5 rounded-full text-[13px] font-bold transition-all cursor-pointer ${
                whenTab === 'flex' ? 'bg-white shadow-xs text-black' : 'text-gray-500 hover:text-black'
              }`}
            >
              Linh hoạt
            </button>
          </div>
        </div>

        {/* TAB NGÀY THÁNG */}
        {whenTab === 'dates' && (
          <DateRangeCalendar
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            onSelectRange={(s, e) => {
              onChangeRangeStart(s);
              onChangeRangeEnd(e);
              if (s && e) {
                const diffDays = Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
                onChangeFlexibleDays(Math.min(14, Math.max(1, diffDays)));
              }
            }}
            onClear={() => {
              onChangeRangeStart(null);
              onChangeRangeEnd(null);
            }}
            onApply={onSave}
            applyLabel="Cập nhật"
          />
        )}

        {/* TAB LINH HOẠT (3 THÁNG) */}
        {whenTab === 'flex' && (
          <div className="pt-2">
            <div className="text-center mb-7">
              <div className="text-[15px] font-bold text-gray-950 mb-3.5">
                Bao nhiêu ngày?
              </div>
              <div className="flex items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={() => onChangeFlexibleDays(Math.max(1, flexibleDays - 1))}
                  className="w-9 h-9 rounded-full border border-gray-300 flex items-center justify-center hover:border-black transition cursor-pointer text-gray-700"
                >
                  <Minus size={15} />
                </button>
                <div className="w-20 py-2 border border-gray-300 rounded-full text-center font-bold text-[16px] text-black">
                  {flexibleDays}
                </div>
                <button
                  type="button"
                  onClick={() => onChangeFlexibleDays(Math.min(14, flexibleDays + 1))}
                  className="w-9 h-9 rounded-full border border-gray-300 flex items-center justify-center hover:border-black transition cursor-pointer text-gray-700"
                >
                  <Plus size={15} />
                </button>
              </div>
            </div>

            <div className="text-center mb-8">
              <div className="text-[15px] font-bold text-gray-950 mb-4">
                Du lịch bất cứ lúc nào
              </div>
              <div className="flex justify-center gap-3.5">
                {THREE_MONTHS_LIST.map((m) => {
                  const isSelected = selectedMonth === m.label;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => onChangeSelectedMonth(m.label)}
                      className={`w-[110px] h-[105px] border rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all ${
                        isSelected
                          ? 'border-black bg-gray-50 ring-1 ring-black shadow-xs'
                          : 'border-gray-200 hover:border-gray-400 bg-white'
                      }`}
                    >
                      <CalendarIcon size={22} className={`mb-2.5 ${isSelected ? 'text-black' : 'text-gray-400'}`} />
                      <span className={`text-[13px] ${isSelected ? 'font-bold text-black' : 'font-medium text-gray-700'}`}>
                        {m.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={onSave}
                className="px-8 py-3 bg-black text-white font-bold text-[14px] rounded-full hover:bg-neutral-800 transition active:scale-95 cursor-pointer shadow-xs"
              >
                Cập nhật
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface TripWhoModalProps {
  adults: number;
  childrenCount: number;
  infants: number;
  pets: number;
  onChangeAdults: (v: number) => void;
  onChangeChildren: (v: number) => void;
  onChangeInfants: (v: number) => void;
  onChangePets: (v: number) => void;
  onClose: () => void;
  onSave: () => void;
}

export function TripWhoModal({
  adults,
  childrenCount,
  infants,
  pets,
  onChangeAdults,
  onChangeChildren,
  onChangeInfants,
  onChangePets,
  onClose,
  onSave,
}: TripWhoModalProps) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fadeIn select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[420px] bg-white rounded-3xl p-6 sm:p-7 shadow-2xl mx-4 border border-gray-100"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-6">
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 cursor-pointer"
          >
            <X size={18} />
          </button>
          <div className="text-center">
            <div className="font-bold text-black text-[16px]">Ai</div>
            <div className="text-gray-400 text-[12px] font-light">{adults + childrenCount + infants + pets} du khách</div>
          </div>
          <div className="w-8 h-8"></div>
        </div>

        <div className="space-y-4 mb-6">
          {/* Người lớn */}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[14px] font-bold text-black">Người lớn</div>
              <div className="text-[12px] text-gray-400 font-light">Từ 13 tuổi trở lên</div>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => onChangeAdults(Math.max(1, adults - 1))}
                className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center hover:border-gray-400 cursor-pointer"
              >
                <Minus size={14} />
              </button>
              <span className="w-5 text-center text-[14px] font-bold">{adults}</span>
              <button
                type="button"
                onClick={() => onChangeAdults(adults + 1)}
                className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center hover:border-gray-400 cursor-pointer"
              >
                <Plus size={14} />
              </button>
            </div>
          </div>

          {/* Những đứa trẻ */}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[14px] font-bold text-black">Những đứa trẻ</div>
              <div className="text-[12px] text-gray-400 font-light">Độ tuổi 2–12</div>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => onChangeChildren(Math.max(0, childrenCount - 1))}
                className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center hover:border-gray-400 cursor-pointer"
              >
                <Minus size={14} />
              </button>
              <span className="w-5 text-center text-[14px] font-bold">{childrenCount}</span>
              <button
                type="button"
                onClick={() => onChangeChildren(childrenCount + 1)}
                className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center hover:border-gray-400 cursor-pointer"
              >
                <Plus size={14} />
              </button>
            </div>
          </div>

          {/* Trẻ sơ sinh */}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[14px] font-bold text-black">Trẻ sơ sinh</div>
              <div className="text-[12px] text-gray-400 font-light">Dưới 2 tuổi</div>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => onChangeInfants(Math.max(0, infants - 1))}
                className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center hover:border-gray-400 cursor-pointer"
              >
                <Minus size={14} />
              </button>
              <span className="w-5 text-center text-[14px] font-bold">{infants}</span>
              <button
                type="button"
                onClick={() => onChangeInfants(infants + 1)}
                className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center hover:border-gray-400 cursor-pointer"
              >
                <Plus size={14} />
              </button>
            </div>
          </div>

          {/* Thú cưng */}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[14px] font-bold text-black">Thú cưng</div>
              <div className="text-[12px] text-gray-400 font-light underline">Bạn có mang theo thú cưng không?</div>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => onChangePets(Math.max(0, pets - 1))}
                className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center hover:border-gray-400 cursor-pointer"
              >
                <Minus size={14} />
              </button>
              <span className="w-5 text-center text-[14px] font-bold">{pets}</span>
              <button
                type="button"
                onClick={() => onChangePets(pets + 1)}
                className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center hover:border-gray-400 cursor-pointer"
              >
                <Plus size={14} />
              </button>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onSave}
            className="w-full sm:w-32 bg-black text-white font-bold text-[14px] py-3 rounded-full hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            Cập nhật
          </button>
        </div>
      </div>
    </div>
  );
}
