import type React from 'react';
import { X } from 'lucide-react';
import {
  ACTIVITIES_BUDGET_OPTIONS,
  DINING_BUDGET_OPTIONS,
  LODGING_BUDGET_OPTIONS,
  type CategoryBudgets,
} from './tripOverviewConstants';

interface TripBudgetModalProps {
  categoryBudgets: CategoryBudgets;
  onChangeCategoryBudgets: React.Dispatch<React.SetStateAction<CategoryBudgets>>;
  totalBudget?: number | null;
  onChangeTotalBudget?: (value: number | null) => void;
  onClose: () => void;
  onSave: () => void;
}

export default function TripBudgetModal({
  categoryBudgets,
  onChangeCategoryBudgets,
  totalBudget,
  onChangeTotalBudget,
  onClose,
  onSave,
}: TripBudgetModalProps) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fadeIn select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[560px] bg-white rounded-[28px] p-6 sm:p-7 shadow-2xl relative border border-gray-100 flex flex-col max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Nút X đóng góc trên bên phải */}
        <button
          type="button"
          onClick={onClose}
          className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-black hover:bg-gray-100 transition absolute top-5 right-5 cursor-pointer"
          title="Đóng"
        >
          <X size={18} strokeWidth={2.5} />
        </button>

        {/* Tiêu đề & Phụ đề */}
        <div className="mb-5 pr-8">
          <h3 className="text-[19px] font-bold text-gray-950">Phân loại ngân sách chuyến đi</h3>
          <p className="text-[12.5px] text-gray-500 mt-0.5">
            Chọn mức chi tiêu riêng theo từng nhóm để nhận gợi ý địa điểm chính xác theo nhu cầu thực tế
          </p>
        </div>

        {/* 3 dòng lựa chọn độc lập */}
        <div className="space-y-4 mb-5">
          {/* DÒNG 1: 🍽️ Ăn uống */}
          <div className="p-3.5 bg-gray-50/80 rounded-2xl border border-gray-200/70">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[13.5px] font-bold text-gray-900 flex items-center gap-1.5">
                <span>🍽️</span> Ăn uống &amp; Ẩm thực
              </span>
              <span className="text-[11px] font-medium text-gray-500">
                {categoryBudgets.dining === 'any'
                  ? 'Mọi mức giá'
                  : DINING_BUDGET_OPTIONS.find((o) => o.id === categoryBudgets.dining)?.sub}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {DINING_BUDGET_OPTIONS.map((opt) => {
                const isSelected = categoryBudgets.dining === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onChangeCategoryBudgets((prev) => ({ ...prev, dining: opt.id }))}
                    className={`py-2 px-1.5 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                      isSelected
                        ? 'bg-black text-white border-black shadow-xs font-bold'
                        : 'bg-white hover:bg-gray-100 text-gray-800 border-gray-200/80 font-medium'
                    }`}
                  >
                    <span className="text-[13px] leading-tight">{opt.label}</span>
                    <span
                      className={`text-[10px] leading-tight truncate max-w-full ${
                        isSelected ? 'text-gray-300' : 'text-gray-500'
                      }`}
                    >
                      {opt.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* DÒNG 2: 🏨 Lưu trú */}
          <div className="p-3.5 bg-gray-50/80 rounded-2xl border border-gray-200/70">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[13.5px] font-bold text-gray-900 flex items-center gap-1.5">
                <span>🏨</span> Lưu trú &amp; Khách sạn
              </span>
              <span className="text-[11px] font-medium text-gray-500">
                {categoryBudgets.lodging === 'any'
                  ? 'Mọi loại phòng'
                  : LODGING_BUDGET_OPTIONS.find((o) => o.id === categoryBudgets.lodging)?.sub}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {LODGING_BUDGET_OPTIONS.map((opt) => {
                const isSelected = categoryBudgets.lodging === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onChangeCategoryBudgets((prev) => ({ ...prev, lodging: opt.id }))}
                    className={`py-2 px-1.5 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                      isSelected
                        ? 'bg-black text-white border-black shadow-xs font-bold'
                        : 'bg-white hover:bg-gray-100 text-gray-800 border-gray-200/80 font-medium'
                    }`}
                  >
                    <span className="text-[13px] leading-tight">{opt.label}</span>
                    <span
                      className={`text-[10px] leading-tight truncate max-w-full ${
                        isSelected ? 'text-gray-300' : 'text-gray-500'
                      }`}
                    >
                      {opt.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* DÒNG 3: 🎡 Hoạt động / Tham quan */}
          <div className="p-3.5 bg-gray-50/80 rounded-2xl border border-gray-200/70">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[13.5px] font-bold text-gray-900 flex items-center gap-1.5">
                <span>🎡</span> Hoạt động &amp; Tham quan
              </span>
              <span className="text-[11px] font-medium text-gray-500">
                {categoryBudgets.activities === 'any'
                  ? 'Mọi hoạt động'
                  : ACTIVITIES_BUDGET_OPTIONS.find((o) => o.id === categoryBudgets.activities)?.sub}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {ACTIVITIES_BUDGET_OPTIONS.map((opt) => {
                const isSelected = categoryBudgets.activities === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onChangeCategoryBudgets((prev) => ({ ...prev, activities: opt.id }))}
                    className={`py-2 px-1.5 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                      isSelected
                        ? 'bg-black text-white border-black shadow-xs font-bold'
                        : 'bg-white hover:bg-gray-100 text-gray-800 border-gray-200/80 font-medium'
                    }`}
                  >
                    <span className="text-[13px] leading-tight">{opt.label}</span>
                    <span
                      className={`text-[10px] leading-tight truncate max-w-full ${
                        isSelected ? 'text-gray-300' : 'text-gray-500'
                      }`}
                    >
                      {opt.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Chú thích thông minh */}
        {onChangeTotalBudget && (
          <div className="mb-5 rounded-2xl border border-gray-200/70 bg-gray-50/80 p-3.5">
            <label htmlFor="planner-total-budget" className="mb-2 block text-[13px] font-bold text-gray-900">
              Tổng ngân sách (VNĐ - tùy chọn)
            </label>
            <input
              id="planner-total-budget"
              type="number"
              min={0}
              step={500000}
              placeholder="Ví dụ: 10400000"
              value={totalBudget ?? ''}
              onChange={(event) => {
                const value = Number.parseInt(event.target.value, 10);
                onChangeTotalBudget(Number.isFinite(value) && value > 0 ? value : null);
              }}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-[13.5px] text-gray-900 focus:border-black focus:outline-none"
            />
          </div>
        )}

        <div className="p-3 bg-amber-50/70 border border-amber-200/60 rounded-xl text-[11.5px] text-amber-900 leading-relaxed mb-5">
          💡 <strong>Cơ chế gợi ý theo danh mục:</strong> Gợi ý Nhà hàng sẽ áp dụng ngân sách Ăn uống; Gợi ý Di tích &amp; Cảnh quan sẽ áp dụng ngân sách Hoạt động để không bị áp một mức chung cho cả chuyến đi.
        </div>

        {/* Nút Cập nhật góc dưới bên phải */}
        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={onSave}
            className="px-8 py-2.5 bg-black text-white font-bold text-[13.5px] rounded-full hover:bg-neutral-800 transition active:scale-95 cursor-pointer shadow-xs"
          >
            Cập nhật ngân sách
          </button>
        </div>
      </div>
    </div>
  );
}
