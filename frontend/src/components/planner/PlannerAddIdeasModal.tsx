import { useState } from 'react';
import { Check, Heart, Info, MapPin, Plus, Star, X } from 'lucide-react';
import type { Poi } from '@/data/pois';

interface PlannerAddIdeasModalProps {
  title?: string;
  modalTab: 'search' | 'saved' | 'custom';
  onChangeTab: (tab: 'search' | 'saved' | 'custom') => void;
  modalCity: 'all' | 'Đà Nẵng' | 'Huế';
  onChangeCity: (city: 'all' | 'Đà Nẵng' | 'Huế') => void;
  modalSearch: string;
  onChangeSearch: (search: string) => void;
  modalCategory: string;
  onChangeCategory: (category: string) => void;
  categoryTabs: ReadonlyArray<{ id: string; label: string }>;
  filteredPois: Poi[];
  savedIdsSize: number;
  customIdeaInput: string;
  onChangeCustomIdeaInput: (value: string) => void;
  onClose: () => void;
  isPoiAdded: (poiId: string) => boolean;
  onTogglePoi: (poi: Poi) => void;
  onSelectPoi: (poiId: string) => void;
  onSubmitCustomIdea: () => void;
  onResetFilters: () => void;
}

export default function PlannerAddIdeasModal({
  title = 'Thêm vào chuyến đi',
  modalTab,
  onChangeTab,
  modalCity,
  onChangeCity,
  modalSearch,
  onChangeSearch,
  modalCategory,
  onChangeCategory,
  categoryTabs,
  filteredPois,
  savedIdsSize,
  customIdeaInput,
  onChangeCustomIdeaInput,
  onClose,
  isPoiAdded,
  onTogglePoi,
  onSelectPoi,
  onSubmitCustomIdea,
  onResetFilters,
}: PlannerAddIdeasModalProps) {
  const [showCityDropdown, setShowCityDropdown] = useState(false);

  const savedCountBadge = (() => {
    let count = savedIdsSize;
    try {
      const rawFav = localStorage.getItem('greentrip_favorites');
      if (rawFav) count = Math.max(count, (JSON.parse(rawFav) as string[]).length);
    } catch {
      // ignore
    }
    return count > 0 ? (
      <span className="w-4.5 h-4.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
        {count}
      </span>
    ) : null;
  })();

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-xs py-6 px-4 animate-fadeIn select-none"
      onClick={onClose}
    >
      {/* Khung hộp gọn gàng chuẩn Mindtrip: Rộng ~750px, Bo góc 24px */}
      <div
        className="relative bg-white w-[750px] max-w-[calc(100vw-32px)] h-[calc(100vh-80px)] max-h-[820px] rounded-[24px] shadow-2xl flex flex-col border border-gray-100 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Phần cố định: Tiêu đề + tab (có đường kẻ ngang dưới #eee, cao ~72px) */}
        <div className="relative h-[72px] shrink-0 border-b border-gray-200 bg-white rounded-t-[24px] flex flex-col justify-between">
          {/* Nút đóng × */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3.5 left-4 w-8 h-8 rounded-full flex items-center justify-center text-gray-500 hover:text-black hover:bg-gray-100 transition cursor-pointer z-20"
            title="Đóng"
          >
            <X size={17} />
          </button>

          {/* Tiêu đề căn giữa */}
          <div className="pt-3 text-center">
            <h3 className="font-bold text-[15px] text-gray-950">{title}</h3>
          </div>

          {/* Tabs: Tìm kiếm, Đã lưu, Tùy chỉnh */}
          <div className="px-6 flex items-center gap-6 text-[13.5px]">
            <button
              type="button"
              onClick={() => onChangeTab('search')}
              className={`pb-2.5 border-b-2 transition font-semibold cursor-pointer -mb-[1px] ${
                modalTab === 'search'
                  ? 'border-black text-black font-bold'
                  : 'border-transparent text-gray-500 hover:text-gray-900'
              }`}
            >
              Tìm kiếm
            </button>
            <button
              type="button"
              onClick={() => onChangeTab('saved')}
              className={`pb-2.5 border-b-2 transition font-semibold cursor-pointer flex items-center gap-1.5 -mb-[1px] ${
                modalTab === 'saved'
                  ? 'border-black text-black font-bold'
                  : 'border-transparent text-gray-500 hover:text-gray-900'
              }`}
            >
              <Heart size={14} className={modalTab === 'saved' ? 'fill-red-500 text-red-500' : 'text-gray-400'} />
              <span>Đã thích</span>
              {savedCountBadge}
            </button>
            <button
              type="button"
              onClick={() => onChangeTab('custom')}
              className={`pb-2.5 border-b-2 transition font-semibold cursor-pointer -mb-[1px] ${
                modalTab === 'custom'
                  ? 'border-black text-black font-bold'
                  : 'border-transparent text-gray-500 hover:text-gray-900'
              }`}
            >
              Tùy chỉnh
            </button>
          </div>
        </div>

        {/* Vùng cuộn duy nhất: Tên khu vực → Tìm kiếm → Lọc → Lưới thẻ */}
        <div className="flex-1 overflow-y-auto px-6 pb-10 [&::-webkit-scrollbar]:w-[5px] [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-gray-400 [&::-webkit-scrollbar-track]:bg-transparent">
          {modalTab !== 'custom' ? (
            <>
              {/* Tên khu vực */}
              <div className="pt-4 shrink-0">
                <div className="relative inline-block">
                  <div
                    onClick={() => setShowCityDropdown((prev) => !prev)}
                    className="inline-flex items-center gap-1.5 cursor-pointer select-none group"
                  >
                    <h2 className="text-[22px] font-bold text-gray-950 tracking-tight leading-tight group-hover:text-black">
                      {modalCity === 'all' ? 'Đà Nẵng & Huế' : modalCity}
                    </h2>
                    <i className="ph ph-caret-down text-[18px] font-bold text-gray-950 group-hover:translate-y-0.5 transition-transform"></i>
                  </div>

                  {showCityDropdown && (
                    <div className="absolute top-10 left-0 bg-white shadow-xl border border-gray-100 rounded-xl py-1.5 w-48 z-50 animate-fadeIn">
                      <button
                        type="button"
                        onClick={() => {
                          onChangeCity('all');
                          setShowCityDropdown(false);
                        }}
                        className={`w-full text-left px-4 py-2 text-[13.5px] hover:bg-gray-50 flex items-center justify-between cursor-pointer ${
                          modalCity === 'all' ? 'font-bold text-black' : 'text-gray-700'
                        }`}
                      >
                        <span>Tất cả khu vực (Đà Nẵng &amp; Huế)</span>
                        {modalCity === 'all' && <i className="ph ph-check font-bold"></i>}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onChangeCity('Đà Nẵng');
                          setShowCityDropdown(false);
                        }}
                        className={`w-full text-left px-4 py-2 text-[13.5px] hover:bg-gray-50 flex items-center justify-between cursor-pointer ${
                          modalCity === 'Đà Nẵng' ? 'font-bold text-black' : 'text-gray-700'
                        }`}
                      >
                        <span>Đà Nẵng</span>
                        {modalCity === 'Đà Nẵng' && <i className="ph ph-check font-bold"></i>}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onChangeCity('Huế');
                          setShowCityDropdown(false);
                        }}
                        className={`w-full text-left px-4 py-2 text-[13.5px] hover:bg-gray-50 flex items-center justify-between cursor-pointer ${
                          modalCity === 'Huế' ? 'font-bold text-black' : 'text-gray-700'
                        }`}
                      >
                        <span>Huế</span>
                        {modalCity === 'Huế' && <i className="ph ph-check font-bold"></i>}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Ô tìm kiếm & Nút bộ lọc */}
              <div className="mt-3 flex items-center gap-2.5 shrink-0">
                <div className="flex-1 relative flex items-center min-w-0">
                  <i className="ph ph-magnifying-glass text-gray-400 absolute left-4 text-lg"></i>
                  <input
                    type="text"
                    value={modalSearch}
                    onChange={(e) => onChangeSearch(e.target.value)}
                    placeholder="Tìm kiếm địa điểm, di tích, ẩm thực..."
                    className="w-full h-[42px] pl-10 pr-9 bg-white text-[13.5px] placeholder-gray-400 text-gray-900 rounded-full border border-gray-300 focus:border-black focus:outline-none shadow-2xs transition"
                  />
                  {modalSearch && (
                    <button
                      type="button"
                      onClick={() => onChangeSearch('')}
                      className="absolute right-3.5 text-gray-400 hover:text-gray-600 cursor-pointer"
                    >
                      <i className="ph ph-x-circle text-lg"></i>
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={onResetFilters}
                  className="h-[42px] px-4 rounded-full border border-gray-300 hover:border-black hover:bg-gray-50 text-[13px] font-medium text-gray-800 transition cursor-pointer flex items-center gap-1.5 shrink-0 shadow-2xs"
                >
                  <i className="ph ph-faders text-lg"></i>
                  <span>Bộ lọc</span>
                </button>
              </div>

              {/* Hàng danh mục tabs */}
              <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-0.5 no-scrollbar shrink-0">
                {categoryTabs.map((tab) => {
                  const isActive = modalCategory === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => onChangeCategory(tab.id)}
                      className={`whitespace-nowrap h-[32px] px-3.5 text-[12.5px] rounded-full transition-all cursor-pointer shrink-0 flex items-center justify-center ${
                        isActive
                          ? 'bg-black text-white font-medium shadow-xs'
                          : 'text-gray-700 hover:text-black hover:bg-gray-100 font-medium'
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {/* Tiêu đề nhóm */}
              <div className="mt-4 shrink-0">
                <h4 className="font-bold text-[16px] text-gray-950 tracking-tight">
                  {modalTab === 'saved'
                    ? 'Địa điểm đã thích ở trang Khám phá'
                    : modalCategory === 'quan-an' || modalCategory === 'restaurants'
                    ? 'Ẩm thực & Cafe'
                    : modalCategory === 'di-tich' || modalCategory === 'experiences'
                    ? 'Trải nghiệm'
                    : modalCategory === 'canh-quan' || modalCategory === 'scenic'
                    ? 'Địa điểm'
                    : modalCategory === 'chua'
                    ? 'Tâm linh'
                    : modalCategory === 'luu-tru'
                    ? 'Lưu trú xanh'
                    : modalCategory === 'all'
                    ? 'Tất cả địa điểm'
                    : 'Trải nghiệm đề xuất'}
                </h4>
              </div>

              {/* Lưới thẻ 3 cột */}
              <div className="mt-3 grid grid-cols-3 gap-x-3.5 gap-y-5">
                {filteredPois.length === 0 ? (
                  <div className="col-span-full py-16 text-center text-gray-500 text-sm">
                    {modalTab === 'saved'
                      ? savedIdsSize === 0
                        ? 'Bạn chưa thích địa điểm nào ở trang Khám phá. Hãy bấm thả tim ❤️ tại trang Explore để chọn nhanh vào Ý tưởng tại đây!'
                        : 'Không tìm thấy địa điểm đã thích nào phù hợp với bộ lọc hiện tại.'
                      : 'Không tìm thấy địa điểm phù hợp với bộ lọc hiện tại.'}
                  </div>
                ) : (
                  filteredPois.map((poi) => {
                    const isAdded = isPoiAdded(poi.id);
                    const ratingVal = (typeof poi.rating === 'number' ? poi.rating : Number(poi.rating || 4.5)).toFixed(1);

                    return (
                      <div
                        key={poi.id}
                        onClick={() => onSelectPoi(poi.id)}
                        className="flex flex-col group cursor-pointer text-left select-none"
                      >
                        {/* Ảnh thẻ tỉ lệ 1.05 : 1, bo góc 16px */}
                        <div className="relative aspect-[1.05/1] w-full rounded-[16px] overflow-hidden bg-gray-100 shadow-2xs">
                          <img
                            src={poi.image}
                            alt={poi.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            onError={(e) => {
                              e.currentTarget.src =
                                'https://ydqzobtzakttljslkiez.supabase.co/storage/v1/object/public/poi-images/52be8ea6-571d-47f9-a9a5-375270c73243.webp';
                            }}
                          />

                          {/* Huy hiệu Địa điểm xanh */}
                          {poi.isGreen && (
                            <div className="absolute top-2.5 left-2.5 z-10 bg-emerald-950/80 text-emerald-200 border border-emerald-400/40 text-[10.5px] font-bold px-2 py-0.5 rounded-full shadow-md backdrop-blur-md flex items-center gap-1 pointer-events-none">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                              <span>🌱 Địa điểm xanh</span>
                            </div>
                          )}

                          {/* Nút “+ Thêm” trên thẻ */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onTogglePoi(poi);
                            }}
                            className={`absolute top-2.5 right-2.5 h-[28px] px-2.5 rounded-full font-semibold text-[12px] transition shadow-xs cursor-pointer active:scale-95 flex items-center justify-center gap-1 z-10 ${
                              isAdded
                                ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                : 'bg-white text-gray-900 hover:bg-black hover:text-white'
                            }`}
                          >
                            {isAdded ? (
                              <>
                                <Check size={13} strokeWidth={2.5} />
                                <span>Đã thêm</span>
                              </>
                            ) : (
                              <>
                                <Plus size={13} strokeWidth={2.5} />
                                <span>Thêm</span>
                              </>
                            )}
                          </button>

                          {/* 5 chấm phân trang dưới đáy ảnh chuẩn Mindtrip */}
                          <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex items-center gap-1 pointer-events-none z-10">
                            <span className="w-1.5 h-1.5 rounded-full bg-white shadow-xs" />
                            <span className="w-1.5 h-1.5 rounded-full bg-white/60" />
                            <span className="w-1.5 h-1.5 rounded-full bg-white/60" />
                            <span className="w-1.5 h-1.5 rounded-full bg-white/60" />
                            <span className="w-1.5 h-1.5 rounded-full bg-white/60" />
                          </div>

                          {/* Icon ⓘ ở góc dưới bên phải */}
                          <div className="absolute bottom-2.5 right-2.5 pointer-events-none z-10 text-white/90 drop-shadow-xs">
                            <Info size={13} />
                          </div>
                        </div>

                        {/* Dưới ảnh thẻ */}
                        <div className="mt-2 flex items-baseline justify-between gap-1.5 min-w-0">
                          <h4 className="font-bold text-[13px] text-gray-950 truncate leading-snug group-hover:text-black" title={poi.name}>
                            {poi.name}
                          </h4>
                          {Number(poi.rating) > 0 && (
                            <span className="text-[12px] font-bold text-gray-950 shrink-0 flex items-center gap-0.5">
                              <Star size={11} className="fill-black text-black" />
                              <span>{ratingVal}</span>
                            </span>
                          )}
                        </div>

                        <div className="mt-0.5 flex items-center gap-1 text-[11.5px] text-gray-500 font-normal">
                          <MapPin size={11} className="text-gray-400 shrink-0" />
                          <span className="truncate">
                            {(() => {
                              const isCafe = Boolean(
                                poi.sub_category?.includes('cafe') ||
                                  poi.sub_category?.includes('coffee') ||
                                  /coffee|cafe|cà phê|tiệm trà|workspace/i.test(poi.name)
                              );
                              if (isCafe) return 'Quán cà phê';
                              if (poi.category === 'quan-an') return 'Ẩm thực';
                              if (poi.category === 'di-tich') return 'Di tích lịch sử';
                              if (poi.category === 'canh-quan') return 'Cảnh quan & Thắng cảnh';
                              if (poi.category === 'luu-tru') return 'Lưu trú';
                              return 'Chùa & Tâm linh';
                            })()}
                          </span>
                        </div>

                        <div className="mt-0.5 text-[11.5px] text-gray-400 font-normal truncate">
                          {poi.address || `${poi.city}, Việt Nam`}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          ) : (
            /* Tab Tùy chỉnh (Custom) */
            <div className="pt-4 flex flex-col space-y-4 max-w-lg">
              <p className="text-[13.5px] text-gray-700 leading-relaxed">
                Bạn có một địa điểm riêng muốn lưu vào chuyến đi này? Nhập tên bên dưới để thêm ngay vào Ý tưởng:
              </p>
              <div className="space-y-3">
                <input
                  type="text"
                  value={customIdeaInput}
                  onChange={(e) => onChangeCustomIdeaInput(e.target.value)}
                  placeholder="Ví dụ: Quán cà phê Yên, Tiệm bánh mì..."
                  className="w-full h-[42px] px-4 rounded-xl border border-gray-300 focus:border-black focus:outline-none text-[13.5px] shadow-2xs"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && customIdeaInput.trim()) {
                      onSubmitCustomIdea();
                    }
                  }}
                />
                <div className="flex justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      onChangeCustomIdeaInput('');
                      onClose();
                    }}
                    className="h-[38px] px-5 rounded-full border border-gray-200 text-gray-600 text-[13px] font-medium hover:bg-gray-50 transition cursor-pointer"
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    onClick={onSubmitCustomIdea}
                    className="h-[38px] px-6 rounded-full bg-black text-white font-bold text-[13px] hover:bg-neutral-800 transition active:scale-95 cursor-pointer shadow-2xs"
                  >
                    + Thêm vào ý tưởng
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
