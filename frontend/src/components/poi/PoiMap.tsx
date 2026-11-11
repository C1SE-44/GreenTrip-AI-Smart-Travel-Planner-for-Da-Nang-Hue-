import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import type { Poi } from '@/data/pois';
import { categoryLabels, getGalleryImages, cleanPoiName, getSpecificPoiIconClass, isCuratedHighlight } from '@/data/pois';
export { cleanPoiName, getSpecificPoiIconClass, isCuratedHighlight };

interface PoiMapProps {
  pois: Poi[];
  selectedPoiId: string | null;
  hoveredPoiId: string | null;
  onSelectPoi: (id: string | null) => void;
  onHoverPoi: (id: string | null) => void;
  onOpenDetails?: (id: string) => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  favorites?: Set<string>;
  pendingFavorites?: Set<string>;
  onToggleFavorite?: (id: string, poi?: Poi) => void;
  addedTrips?: Set<string>;
  onToggleAddTrip?: (id: string) => void;
  hideTopControls?: boolean;
  showMapLoader?: boolean;
  savedHeartMarkers?: boolean;
  hideFloatingPreview?: boolean;
}

interface MarkerOffset {
  position: 'right' | 'left' | 'top';
  xOffset?: number;
  yOffset?: number;
}


// 3. Tạo icon DivIcon cho Marker
// Ghim đang chọn: Nền đen dạng viên thuốc, icon trắng + ảnh tròn thu nhỏ

function getMapPoiPriceTier(poi: Poi): string {
  const display = poi.ai_metadata?.price_range_display?.toLowerCase() || '';
  if (display.includes('miễn phí') || poi.estimatedCost === 0) {
    return '$';
  }
  const cost = poi.estimatedCost ?? 0;
  if (cost > 0) {
    if (cost < 50000) return '$';
    if (cost <= 150000) return '$$';
    if (cost <= 400000) return '$$$';
    return '$$$$';
  }
  if (display.includes('$$$$')) return '$$$$';
  if (display.includes('$$$')) return '$$$';
  if (display.includes('$$')) return '$$';
  return '$$';
}

function createMindtripMarkerIcon(
  isSelected: boolean,
  isHovered: boolean,
  poi: Poi,
  offset: MarkerOffset = { position: 'right', yOffset: 0 },
  showLabel: boolean = true,
  isNewEntrance: boolean = false,
  entranceDelayMs: number = 0,
  savedHeartMarkers: boolean = false
): L.DivIcon {
  const isHighlighted = isSelected || isHovered;
  const displayName = cleanPoiName(poi.name);
  const iconClass = savedHeartMarkers ? 'ph-fill ph-heart text-amber-500' : getSpecificPoiIconClass(poi);

  let pinHtml = '';
  let labelHtml = '';

  if (isSelected) {
    // Ghim đang chọn trên bản đồ:
    // Nếu là Địa điểm xanh -> Nền xanh lục ngọc bích sang trọng (Emerald Luxury)
    // Nếu là địa điểm tiêu chuẩn -> Nền đen chuẩn Mindtrip
    const isEco = Boolean(poi.isGreen);
    pinHtml = `
      <div class="map-marker-pin absolute -left-[16px] -top-[16px] h-[32px] px-2.5 ${
        isEco
          ? 'bg-emerald-700 text-white shadow-[0_4px_16px_rgba(4,120,87,0.45)] ring-2 ring-emerald-500/50'
          : 'bg-black text-white shadow-[0_4px_16px_rgba(0,0,0,0.35)] ring-2 ring-black/20'
      } rounded-full flex items-center gap-1.5 z-[9999] pointer-events-auto transition-transform scale-105">
        <i class="${iconClass} text-[16px] text-white"></i>
        <img src="${poi.image}" referrerpolicy="no-referrer" class="w-5 h-5 rounded-full object-cover ring-1 ring-white/60" alt="" />
        <span class="text-[12px] font-bold text-white whitespace-nowrap leading-none pl-0.5">${displayName}</span>
      </div>
    `;
    labelHtml = '';
  } else {
    // Ghim chuẩn Tối Giản Trắng - Đen (Quiet Luxury):
    // - Trạng thái bình thường: Nền trắng tinh khiết, viền mỏng xám thanh lịch, đổ bóng mềm Mindtrip
    // - Khi trỏ tới (hover):
    //   + Địa điểm xanh (isGreen) -> Chuyển từ TRẮNG SANG XANH LỤC (Emerald) nổi bật, tươi mát, khác biệt
    //   + Địa điểm tiêu chuẩn -> Chuyển sang NỀN ĐEN icon trắng nổi bật
    const isEcoHigh = Boolean(poi.isGreen);
    const priceTier = getMapPoiPriceTier(poi);
    // Marker dạng pill gồm icon và mức giá ($$) chuẩn Mindtrip
    pinHtml = `
      <div class="map-marker-pin absolute -left-[24px] -top-[14px] h-[28px] px-2 rounded-full ${
        isHovered
          ? isEcoHigh
            ? 'bg-emerald-600 text-white shadow-[0_6px_20px_rgba(5,150,105,0.45)] scale-110 ring-2 ring-emerald-400/60'
            : 'bg-black text-white shadow-xl scale-110 ring-2 ring-black/25'
          : isEcoHigh
            ? 'bg-white text-zinc-950 shadow-[0_2px_8px_rgba(0,0,0,0.14)] border border-zinc-200/90 ring-1 ring-emerald-500/30'
            : 'bg-white text-zinc-950 shadow-[0_2px_8px_rgba(0,0,0,0.12)] border border-zinc-200/90'
      } flex items-center gap-1.5 shrink-0 transition-all duration-150 pointer-events-auto">
        <i class="${iconClass} text-[14px] ${isHovered ? 'text-white' : isEcoHigh ? 'text-emerald-700' : 'text-zinc-950'}"></i>
        <span class="text-[11px] font-bold leading-none ${isHovered ? 'text-white' : 'text-zinc-800'}">${priceTier}</span>
      </div>
    `;

    // Tên chỉ hiện khi chọn hoặc hover để bản đồ không bị đè nhãn
    if (isHovered) {
      let labelClass = 'map-marker-label absolute pointer-events-auto max-w-[170px] ';
      if (offset.position === 'top') {
        labelClass += 'bottom-[20px] left-1/2 -translate-x-1/2 text-center';
      } else if (offset.position === 'left') {
        labelClass += 'right-[28px] top-1/2 -translate-y-1/2 text-right';
      } else {
        labelClass += 'left-[28px] top-1/2 -translate-y-1/2 text-left';
      }

      labelHtml = `
        <div class="${labelClass} ${
          isEcoHigh
            ? 'bg-emerald-600 text-white border-emerald-500 shadow-[0_4px_16px_rgba(5,150,105,0.35)] font-medium z-50'
            : 'bg-black text-white border-black shadow-lg font-medium z-50'
        } backdrop-blur-[2px] px-2.5 py-1 rounded-full shadow-lg border transition-all duration-150">
          <span class="text-[11.5px] leading-tight whitespace-nowrap truncate inline-flex items-center text-white font-medium">
            <span>${displayName}</span>
          </span>
        </div>
      `;
    }
  }

  const transformParts: string[] = [];
  if (offset.xOffset) transformParts.push(`translateX(${offset.xOffset}px)`);
  if (offset.yOffset) transformParts.push(`translateY(${offset.yOffset}px)`);
  const transformStyle = transformParts.length > 0 ? `transform: ${transformParts.join(' ')};` : '';

  const animDelayStyle = !isHighlighted && isNewEntrance && entranceDelayMs > 0
    ? `animation-delay: ${entranceDelayMs}ms;`
    : '';

  const contentHtml = `
    <div class="relative cursor-pointer select-none ${
      isHighlighted ? 'z-[9999]' : 'z-20'
    }" style="${transformStyle}">
      <div 
        class="${isHighlighted ? 'scale-105' : isNewEntrance ? 'gt-ball-drop' : ''} transition-transform duration-150"
        style="${animDelayStyle}"
      >
        ${pinHtml}
        ${labelHtml}
      </div>
    </div>
  `;

  return L.divIcon({
    html: contentHtml,
    className: 'gt-map-marker',
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

interface FloatingDetailCardProps {
  poi: Poi;
  onClose?: () => void;
  onOpenDetails?: () => void;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
  isFavorite?: boolean;
  isFavoritePending?: boolean;
  onToggleFavorite?: (id: string, poi?: Poi) => void;
  isAdded?: boolean;
  onToggleAddTrip?: (id: string) => void;
}

// 4. Ô cơ bản trên map: hiển thị khi người dùng BẤM VÀO địa điểm trên bản đồ
function FloatingDetailCard({ 
  poi, 
  onClose,
  onOpenDetails,
  onPointerEnter,
  onPointerLeave,
  isFavorite = false,
  isFavoritePending = false,
  onToggleFavorite,
  isAdded = false,
  onToggleAddTrip,
}: FloatingDetailCardProps) {
  const map = useMap();
  const cardRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ left: number; top: number } | null>(null);
  const [imgIdx, setImgIdx] = useState(0);
  const [isHovered, setIsHovered] = useState(false);

  const gallery = useMemo(() => getGalleryImages(poi), [poi]);

  useEffect(() => {
    if (cardRef.current) {
      L.DomEvent.disableClickPropagation(cardRef.current);
      L.DomEvent.disableScrollPropagation(cardRef.current);
    }
  }, []);

  useEffect(() => {
    setImgIdx(0);
  }, [poi.id]);

  useEffect(() => {
    const updatePosition = () => {
      try {
        const pt = map.latLngToContainerPoint([poi.lat, poi.lng]);
        const mapSize = map.getSize();
        if (!mapSize || mapSize.x === 0 || mapSize.y === 0) return;

        // Kích thước card chuẩn nhỏ gọn Mindtrip (Screenshot 2: rộng ~308px, cao ~360px)
        const cardWidth = Math.min(308, mapSize.x - 24);
        const cardHeight = cardRef.current?.offsetHeight || 360;

        const minX = 14;
        const maxX = mapSize.x - 14;
        const minY = 14;
        const maxY = mapSize.y - 14;

        const pinRadiusX = 14;
        const pinRadiusY = 14;

        // Vùng cấm va chạm các nút điều khiển (kèm đệm 20px)
        const controlTopLeft = { left: 0, top: 0, right: 76, bottom: 74 };
        const controlTopRight = { left: mapSize.x - 76, top: 0, right: mapSize.x, bottom: 74 };
        const controlBottomRight = { left: mapSize.x - 76, top: mapSize.y - 210, right: mapSize.x, bottom: mapSize.y };
        const controlBottomLeft = { left: 0, top: mapSize.y - 80, right: 150, bottom: mapSize.y };

        const exclusionZones = [controlTopLeft, controlTopRight, controlBottomRight, controlBottomLeft];

        const doesOverlap = (
          rA: { left: number; top: number; right: number; bottom: number },
          rB: { left: number; top: number; right: number; bottom: number }
        ) => !(rA.right <= rB.left || rA.left >= rB.right || rA.bottom <= rB.top || rA.top >= rB.bottom);

        const isAllowed = (rect: { left: number; top: number; right: number; bottom: number }) => {
          if (rect.left < minX || rect.right > maxX || rect.top < minY || rect.bottom > maxY) {
            return false;
          }
          for (const zone of exclusionZones) {
            if (doesOverlap(rect, zone)) return false;
          }
          return true;
        };

        // Thứ tự ưu tiên: Phải -> Dưới -> Trái -> Trên (hoặc Phải -> Trên -> Trái -> Dưới)
        const directions: ('right' | 'bottom' | 'left' | 'top')[] = ['right', 'bottom', 'left', 'top'];
        let chosen: { left: number; top: number } | null = null;

        for (const dir of directions) {
          let left = 0;
          let top = 0;
          if (dir === 'right') {
            left = pt.x + pinRadiusX + 10;
            const desiredTop = pt.y - cardHeight / 2;
            top = Math.max(minY, Math.min(maxY - cardHeight, desiredTop));
          } else if (dir === 'bottom') {
            top = pt.y + pinRadiusY + 10;
            const desiredLeft = pt.x - cardWidth / 2;
            left = Math.max(minX, Math.min(maxX - cardWidth, desiredLeft));
          } else if (dir === 'left') {
            const right = pt.x - pinRadiusX - 10;
            left = right - cardWidth;
            const desiredTop = pt.y - cardHeight / 2;
            top = Math.max(minY, Math.min(maxY - cardHeight, desiredTop));
          } else if (dir === 'top') {
            const bottom = pt.y - pinRadiusY - 10;
            top = bottom - cardHeight;
            const desiredLeft = pt.x - cardWidth / 2;
            left = Math.max(minX, Math.min(maxX - cardWidth, desiredLeft));
          }

          const rect = { left, top, right: left + cardWidth, bottom: top + cardHeight };
          if (isAllowed(rect)) {
            chosen = { left, top };
            break;
          }
        }

        // Dự phòng nếu không hướng nào hoàn toàn nằm trong vùng trống
        if (!chosen) {
          const preferRight = pt.x <= mapSize.x / 2;
          const left = preferRight
            ? Math.max(minX, Math.min(maxX - cardWidth, pt.x + pinRadiusX + 10))
            : Math.max(minX, Math.min(maxX - cardWidth, pt.x - pinRadiusX - 10 - cardWidth));
          const top = Math.max(minY, Math.min(maxY - cardHeight, pt.y - cardHeight / 2));
          chosen = { left, top };
        }

        setCoords(chosen);
      } catch {
        // safe fallback
      }
    };

    updatePosition();
    map.on('move', updatePosition);
    map.on('zoom', updatePosition);
    map.on('resize', updatePosition);
    return () => {
      map.off('move', updatePosition);
      map.off('zoom', updatePosition);
      map.off('resize', updatePosition);
    };
  }, [poi, map]);

  if (!coords) return null;

  return (
    <div 
      ref={cardRef}
      onClick={(e) => {
        e.stopPropagation();
        onOpenDetails?.();
      }}
      onMouseEnter={() => {
        setIsHovered(true);
        onPointerEnter?.();
      }}
      onMouseLeave={() => {
        setIsHovered(false);
        onPointerLeave?.();
      }}
      className="floating-detail-card absolute z-[1000] w-[308px] max-w-[calc(100%-24px)] bg-white rounded-[20px] shadow-[0_8px_30px_rgba(0,0,0,0.18)] border border-gray-100 overflow-hidden pointer-events-auto cursor-pointer animate-fadeIn"
      style={{ 
        left: `${coords.left}px`, 
        top: `${coords.top}px`,
        transition: 'left 150ms ease-out, top 150ms ease-out'
      }}
      title="Bấm để xem chi tiết địa điểm"
    >
      {/* 1. Ảnh tỉ lệ chuẩn Mindtrip: cao 180px, bo góc trên */}
      <div className="relative w-full h-[180px] bg-neutral-900 overflow-hidden group">
        <img 
          alt={poi.name} 
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" 
          src={gallery[imgIdx] || poi.image}
        />

        {/* Nút đóng ô cơ bản (×) chuẩn Mindtrip */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose?.();
          }}
          className="absolute top-2.5 left-2.5 w-8 h-8 rounded-full bg-black/60 hover:bg-black/85 text-white backdrop-blur-md flex items-center justify-center transition-all cursor-pointer shadow-sm active:scale-95 z-20"
          title="Đóng ô thông tin"
          aria-label="Đóng"
        >
          <i className="ph ph-x text-[14px] font-bold"></i>
        </button>

        {/* Nút tròn chuyển ảnh ‹ (chỉ hiện khi hover và từ ảnh thứ 2 trở đi) */}
        {isHovered && imgIdx > 0 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setImgIdx((prev) => Math.max(0, prev - 1));
            }}
            className="absolute left-2.5 top-[45%] -translate-y-1/2 w-8 h-8 rounded-full bg-white text-zinc-900 shadow-md flex items-center justify-center hover:scale-105 active:scale-95 transition-all z-20 cursor-pointer"
            title="Ảnh trước"
          >
            <i className="ph ph-caret-left text-base font-bold"></i>
          </button>
        )}

        {/* Nút tròn chuyển ảnh › (chỉ hiện khi hover và chưa đến ảnh cuối) */}
        {isHovered && imgIdx < gallery.length - 1 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setImgIdx((prev) => Math.min(gallery.length - 1, prev + 1));
            }}
            className="absolute right-2.5 top-[45%] -translate-y-1/2 w-8 h-8 rounded-full bg-white text-zinc-900 shadow-md flex items-center justify-center hover:scale-105 active:scale-95 transition-all z-20 cursor-pointer"
            title="Ảnh kế tiếp"
          >
            <i className="ph ph-caret-right text-base font-bold"></i>
          </button>
        )}

        {/* Nút tim và "+" ở góc trên (nhỏ gọn 32px) */}
        <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 z-20">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite?.(poi.id, poi);
            }}
            className={`w-8 h-8 rounded-full backdrop-blur-md flex items-center justify-center transition-all cursor-pointer shadow-sm active:scale-95 ${
              isFavorite ? 'bg-white text-[#b45309]' : 'bg-black/40 hover:bg-black/60 text-white'
            }`}
            title="Lưu yêu thích"
          >
            <i className={`ph ${isFavorite ? 'ph-fill ph-heart text-[16px] text-[#b45309]' : 'ph-heart text-[16px]'}`}></i>
          </button>
          <button 
            onClick={(e) => {
              e.stopPropagation();
              onToggleAddTrip?.(poi.id);
            }}
            className={`w-8 h-8 rounded-full backdrop-blur-md flex items-center justify-center transition-all cursor-pointer shadow-sm active:scale-95 ${
              isAdded ? 'bg-emerald-600 text-white' : 'bg-black/40 hover:bg-black/60 text-white'
            }`}
            title="Thêm vào chuyến đi"
          >
            <i className={`ph ${isAdded ? 'ph-check text-[16px] font-bold' : 'ph-plus text-[16px]'}`}></i>
          </button>
        </div>

        {/* Chấm phân trang bên dưới */}
        <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex items-center gap-1 pointer-events-none z-10">
          {gallery.slice(0, 5).map((_, i) => (
            <span
              key={i}
              className={`w-1.5 h-1.5 rounded-full transition-all ${
                i === imgIdx ? 'bg-white scale-125 shadow-xs' : 'bg-white/40'
              }`}
            />
          ))}
        </div>

        {/* Icon ⓘ ở góc phải đáy */}
        <div className="absolute bottom-2.5 right-2.5 pointer-events-none z-10">
          <i className="ph ph-info text-white/80 hover:text-white text-[14px] drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]"></i>
        </div>
      </div>

      {/* 2. Chi tiết nội dung card: tên địa điểm, loại hình, địa chỉ, mô tả 3 dòng */}
      <div className="p-3.5 space-y-1">
        <h3 className="text-[15.5px] font-bold text-gray-950 tracking-tight leading-snug line-clamp-1">
          {cleanPoiName(poi.name)}
        </h3>

        {/* Dòng loại hình */}
        <div className="flex items-center gap-1.5 text-[12.5px] text-gray-500 font-medium">
          <span className="truncate">{categoryLabels[poi.category] || 'Điểm tham quan'}</span>
        </div>

        {/* Dòng địa điểm */}
        <div className="flex items-center gap-2 text-[12px] text-gray-400 font-normal">
          <i className="ph ph-map-pin text-[13px] text-gray-400 shrink-0"></i>
          <span className="truncate">{poi.address || `${poi.city}, Việt Nam`}</span>
        </div>

        {/* Mô tả 3 dòng */}
        <p className="text-[12.5px] text-gray-600 leading-snug line-clamp-3 font-normal pt-0.5">
          {poi.description}
        </p>

        {/* Footer: Rating & Nút Xem chi tiết */}
        <div className="text-[12px] text-gray-500 mt-2.5 pt-2 border-t border-gray-100 font-medium flex items-center justify-between">
          <span className="text-amber-500 font-bold flex items-center gap-1">
            ★ {poi.rating ? poi.rating.toFixed(1) : '4.5'}
            {poi.ai_metadata?.review_count ? (
              <span className="text-gray-400 font-normal text-[11px]">({poi.ai_metadata.review_count})</span>
            ) : null}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenDetails?.();
            }}
            className="text-xs font-bold text-black hover:text-emerald-700 flex items-center gap-1 cursor-pointer py-1 px-3 bg-neutral-100 hover:bg-neutral-200 rounded-full transition active:scale-95"
          >
            <span>Chi tiết</span>
            <i className="ph ph-arrow-right text-[11px] font-bold"></i>
          </button>
        </div>
      </div>
    </div>
  );
}
// Giữ cho map luôn cập nhật đúng kích thước khi cửa sổ hoặc panel mở rộng / thu nhỏ
function MapResizeListener() {
  const map = useMap();
  useEffect(() => {
    const handleResize = () => {
      map.invalidateSize();
    };
    window.addEventListener('resize', handleResize);
    const container = map.getContainer();
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && container) {
      ro = new ResizeObserver(() => {
        map.invalidateSize();
      });
      ro.observe(container);
    }
    return () => {
      window.removeEventListener('resize', handleResize);
      ro?.disconnect();
    };
  }, [map]);
  return null;
}

// Tự động căn khung hình (flyToBounds) khi người dùng đổi tỉnh thành hoặc bộ lọc
function MapAutoFitter({ pois }: { pois: Poi[] }) {
  const map = useMap();
  const prevIdsRef = useRef<string>('');

  useEffect(() => {
    if (!pois || pois.length === 0) return;
    const currentIds = pois.map((p) => p.id).sort().join(',');
    if (prevIdsRef.current === currentIds) return;

    const timer = setTimeout(() => {
      try {
        map.invalidateSize();
        const validPois = pois.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
        if (validPois.length === 0) return;

        // Ưu tiên hiển thị cụm đông nhất (Trung tâm Đà Nẵng / sông Hàn / biển Mỹ Khê)
        const dnCenter = validPois.filter((p) => p.lat >= 16.02 && p.lat <= 16.12 && p.lng >= 108.18 && p.lng <= 108.27);
        const hueCenter = validPois.filter((p) => p.lat >= 16.42 && p.lat <= 16.50 && p.lng >= 107.54 && p.lng <= 107.62);

        let targetPois = validPois;
        if (dnCenter.length >= 3) {
          targetPois = dnCenter;
        } else if (hueCenter.length >= 3) {
          targetPois = hueCenter;
        }

        const bounds = L.latLngBounds(targetPois.map((p) => [p.lat, p.lng] as [number, number]));
        if (bounds.isValid()) {
          if (prevIdsRef.current !== '') {
            // Khi lọc địa điểm: Lướt camera êm ái đến cụm đông
            map.flyToBounds(bounds, {
              padding: [45, 45],
              maxZoom: 14,
              duration: 0.75,
              easeLinearity: 0.25,
            });
          } else {
            // Lần đầu mở: Tự động ở khoảng nhìn thoải mái thấy trung tâm trước
            map.fitBounds(bounds, {
              padding: [40, 40],
              maxZoom: 13.5,
            });
          }
        }
      } catch {
        // safe fallback
      }
    }, 150);

    prevIdsRef.current = currentIds;
    return () => clearTimeout(timer);
  }, [pois, map]);

  return null;
}

// Cụm điều khiển Floating Controls
function MapControlsLayer({
  isExpanded,
  onToggleExpand,
  hideTopControls = false,
}: {
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  hideTopControls?: boolean;
  showMapLoader?: boolean;
}) {
  const map = useMap();

  return (
    <>
      {!hideTopControls && (
        <>
          {/* 0. Nút Thu gọn bản đồ (⇤) */}
          <div className="absolute top-3.5 left-4 z-[1000] group">
            <button 
              aria-label={isExpanded ? 'Mở lại danh sách' : 'Thu gọn bản đồ'}
              onClick={() => {
                onToggleExpand?.();
                setTimeout(() => map.invalidateSize(), 150);
              }}
              className="map-floating-btn w-10 h-10 bg-white rounded-full flex items-center justify-center text-zinc-700 hover:text-black transition cursor-pointer shadow-md active:scale-95"
              title={isExpanded ? 'Mở lại danh sách' : 'Thu gọn bản đồ'}
            >
              {isExpanded ? (
                <i className="ph ph-arrow-line-right text-lg text-zinc-800" aria-hidden="true"></i>
              ) : (
                <i className="ph ph-arrow-line-left text-lg text-zinc-800" aria-hidden="true"></i>
              )}
            </button>
            <div className="absolute top-12 left-0 hidden group-hover:block bg-black text-white text-[11px] font-semibold px-2.5 py-1 rounded-md shadow-md whitespace-nowrap pointer-events-none animate-fadeIn">
              {isExpanded ? 'Mở lại danh sách' : 'Thu gọn bản đồ'}
            </div>
          </div>

          {/* 1. Visibility / Eye Toggle (Top Right) */}
          <button 
            aria-label="Toggle visible items"
            className="map-floating-btn absolute top-3.5 right-4 w-10 h-10 bg-white rounded-full flex items-center justify-center text-zinc-700 hover:text-black z-[1000] transition cursor-pointer shadow-md"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" strokeLinecap="round" strokeLinejoin="round"></path>
              <path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" strokeLinecap="round" strokeLinejoin="round"></path>
            </svg>
          </button>
        </>
      )}

      {/* 2. Right Toolbar Layer - cách mép phải +15% khi ẩn top controls */}
      <div className={`absolute ${hideTopControls ? 'right-6' : 'right-4'} bottom-8 flex flex-col space-y-2 z-[1000]`}>
        <button 
          onClick={() => map.flyTo([16.0590, 108.2230], 15, { duration: 0.8 })}
          aria-label="Your location" 
          className="map-floating-btn w-10 h-10 bg-white rounded-full flex items-center justify-center text-zinc-700 hover:text-black transition cursor-pointer shadow-md"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="7"></circle>
            <path d="M12 2v3m0 14v3M2 12h3m14 0h3" strokeLinecap="round" strokeLinejoin="round"></path>
          </svg>
        </button>

        <button 
          aria-label="Map layers" 
          className="map-floating-btn w-10 h-10 bg-white rounded-full flex items-center justify-center text-zinc-700 hover:text-black transition cursor-pointer shadow-md"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" strokeLinecap="round" strokeLinejoin="round"></path>
          </svg>
        </button>

        <div className="map-floating-btn flex flex-col bg-white rounded-full overflow-hidden shadow-md">
          <button 
            onClick={() => map.zoomIn()}
            aria-label="Zoom in" 
            className="w-10 h-10 flex items-center justify-center text-zinc-700 hover:text-black hover:bg-zinc-50 border-b border-zinc-100 transition cursor-pointer"
          >
            <svg className="w-5 h-5 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M12 4v16m8-8H4" strokeLinecap="round" strokeLinejoin="round"></path>
            </svg>
          </button>
          <button 
            onClick={() => map.zoomOut()}
            aria-label="Zoom out" 
            className="w-10 h-10 flex items-center justify-center text-zinc-700 hover:text-black hover:bg-zinc-50 transition cursor-pointer"
          >
            <svg className="w-5 h-5 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M20 12H4" strokeLinecap="round" strokeLinejoin="round"></path>
            </svg>
          </button>
        </div>
      </div>

      {/* 3. Weather Widget: Đã đổi thành "31°C Ít mây" */}
      <div className="absolute bottom-6 left-4 z-[1000] pointer-events-auto">
        <div className="flex items-center space-x-1.5 px-3 py-1.5 bg-white/95 backdrop-blur-md rounded-full shadow-sm border border-zinc-200/80 text-xs font-semibold text-zinc-800">
          <span>🌤️</span>
          <span>31°C</span>
          <span className="font-normal text-zinc-600">Ít mây</span>
        </div>
      </div>

      {/* 4. Google Maps Footer */}
      <footer className="absolute bottom-0 left-0 right-0 h-6 bg-white/70 backdrop-blur-[2px] flex items-center justify-between px-3 text-[10px] text-zinc-600 z-[1000] pointer-events-none">
        <div className="pointer-events-auto">
          <span className="font-medium tracking-tight text-zinc-700">Google</span>
        </div>
        <div className="flex items-center space-x-3 pointer-events-auto select-none">
          <button className="hover:underline">Keyboard shortcuts</button>
          <span>Map Data ©2026 Google</span>
          <div className="flex items-center space-x-1">
            <div className="w-12 h-1 border-b-2 border-l border-r border-zinc-700"></div>
            <span>500 m</span>
          </div>
          <button className="hover:underline">Terms</button>
          <button className="hover:underline">Report a map error</button>
        </div>
      </footer>
    </>
  );
}

interface LabelBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

// ─────────────────────────────────────────────────────────────
// Thuật toán chọn lọc POI "Must Try" trong khung nhìn bản đồ (Dynamic Viewport Must-Try Selection)
// Chuẩn Mindtrip:
// 1. Giới hạn nghiêm ngặt số lượng ghim trên màn hình: tối đa ~20 địa điểm đổ lại
// 2. Ưu tiên các điểm "Must Try": Di tích/biểu tượng nổi tiếng, Michelin, Địa điểm xanh, Rating cao
// 3. Phân bổ đều theo lưới không gian 4x4 (Spatial Grid) để không bị dồn cục vào 1 góc phố
// 4. Luôn luôn bảo đảm các điểm đang chọn (Selected) hoặc đang trỏ (Hovered) được hiển thị
// 5. Khi di chuyển bản đồ đến khu vực mới (Sơn Trà, Huế, Hòa Vang...), tự động nạp Top ~20 Must-Try của khu vực đó
// ─────────────────────────────────────────────────────────────
export function selectMustTryViewportPois(
  candidates: Poi[],
  bounds: L.LatLngBounds | null,
  allPois: Poi[],
  selectedPoiId: string | null,
  hoveredPoiId: string | null,
  maxCount: number = 20
): Poi[] {
  const activeIds = new Set<string>();
  if (selectedPoiId) activeIds.add(selectedPoiId);
  if (hoveredPoiId) activeIds.add(hoveredPoiId);

  // Nếu số lượng ứng viên trong tầm nhìn đã <= maxCount, hiển thị toàn bộ
  if (candidates.length <= maxCount) {
    const res = [...candidates];
    activeIds.forEach((id) => {
      if (!res.some((p) => p.id === id)) {
        const found = allPois.find((p) => p.id === id);
        if (found) res.push(found);
      }
    });
    return res;
  }

  // 1. Chấm điểm Must-Try cho từng điểm (Độ hấp dẫn, biểu tượng, uy tín & điểm xanh)
  const getMustTryScore = (p: Poi): number => {
    if (activeIds.has(p.id)) return 100000;
    let score = 0;
    if (isCuratedHighlight(p)) score += 150;
    if (p.isMichelin) score += 80;
    if (p.isGreen) score += 60;
    score += (p.rating || 4.5) * 15;
    if (p.category === 'di-tich' || p.category === 'chua') score += 30;
    if (p.category === 'canh-quan') score += 25;
    if (p.budget_tier && p.budget_tier !== 'free') score += 10;
    return score;
  };

  const selectedMap = new Map<string, Poi>();

  // Thêm ngay các active POIs (đang chọn hoặc hover)
  activeIds.forEach((id) => {
    const found = allPois.find((p) => p.id === id);
    if (found) selectedMap.set(found.id, found);
  });

  // 2. Phân bổ không gian lưới 4x4 (Spatial Grid Bucket Selection)
  if (bounds && typeof bounds.isValid === 'function' && bounds.isValid()) {
    const south = bounds.getSouth();
    const north = bounds.getNorth();
    const west = bounds.getWest();
    const east = bounds.getEast();
    const latSpan = Math.max(0.0001, north - south);
    const lngSpan = Math.max(0.0001, east - west);

    const GRID_SIZE = 4;
    const cells: Poi[][] = Array.from({ length: GRID_SIZE * GRID_SIZE }, () => []);

    candidates.forEach((poi) => {
      const row = Math.min(GRID_SIZE - 1, Math.max(0, Math.floor(((poi.lat - south) / latSpan) * GRID_SIZE)));
      const col = Math.min(GRID_SIZE - 1, Math.max(0, Math.floor(((poi.lng - west) / lngSpan) * GRID_SIZE)));
      cells[row * GRID_SIZE + col].push(poi);
    });

    // Chọn điểm xuất sắc nhất trong mỗi ô lưới
    cells.forEach((cell) => {
      if (cell.length > 0 && selectedMap.size < maxCount) {
        cell.sort((a, b) => getMustTryScore(b) - getMustTryScore(a));
        const best = cell[0];
        if (!selectedMap.has(best.id)) {
          selectedMap.set(best.id, best);
        }
      }
    });
  }

  // 3. Nếu còn chỗ trống (< maxCount):
  //    Lấy thêm các điểm có điểm Must-Try cao nhất còn lại,
  //    ưu tiên các điểm không quá gần (khoảng cách tọa độ > 0.003 độ ≈ 300m)
  if (selectedMap.size < maxCount) {
    const remaining = candidates
      .filter((p) => !selectedMap.has(p.id))
      .sort((a, b) => getMustTryScore(b) - getMustTryScore(a));

    for (const poi of remaining) {
      if (selectedMap.size >= maxCount) break;

      const isTooClose = Array.from(selectedMap.values()).some((existing) => {
        const dLat = existing.lat - poi.lat;
        const dLng = existing.lng - poi.lng;
        return Math.hypot(dLat, dLng) < 0.003;
      });

      if (!isTooClose) {
        selectedMap.set(poi.id, poi);
      }
    }

    // Nếu vẫn chưa đủ maxCount, lấy tiếp các điểm có điểm cao nhất còn lại
    if (selectedMap.size < maxCount) {
      for (const poi of remaining) {
        if (selectedMap.size >= maxCount) break;
        if (!selectedMap.has(poi.id)) {
          selectedMap.set(poi.id, poi);
        }
      }
    }
  }

  return Array.from(selectedMap.values());
}

function DynamicMarkersLayer({
  pois,
  selectedPoiId,
  hoveredPoiId,
  savedHeartMarkers = false,
  onSelectPoi,
  onHoverMapPin,
  onMarkerHover,
  isDistantExpanded,
  setIsDistantExpanded,
  coreCluster,
  coreBounds,
  setIsMapLoading,
}: {
  pois: Poi[];
  selectedPoiId: string | null;
  hoveredPoiId: string | null;
  savedHeartMarkers?: boolean;
  onSelectPoi: (id: string) => void;
  onHoverMapPin: (id: string | null) => void;
  onMarkerHover?: (id: string, isEnter: boolean) => void;
  isDistantExpanded: boolean;
  setIsDistantExpanded: (val: boolean) => void;
  coreCluster: Poi[];
  coreBounds: L.LatLngBounds | null;
  setIsMapLoading?: (loading: boolean) => void;
}) {
  const map = useMap();
  const [viewportBounds, setViewportBounds] = useState<L.LatLngBounds | null>(() => {
    try {
      return map.getBounds();
    } catch {
      return null;
    }
  });
  const [currentZoom, setCurrentZoom] = useState<number>(() => {
    try {
      return map.getZoom();
    } catch {
      return 13.5;
    }
  });
  const [offsets, setOffsets] = useState<Record<string, MarkerOffset>>({});
  const [hiddenLabelIds, setHiddenLabelIds] = useState<Set<string>>(new Set());

  // Ref theo dõi các POI đã từng được vẽ trên màn hình hiện tại
  // Giúp các ghim ĐÃ CÓ MẶT giữ nguyên tĩnh lặng, TUYỆT ĐỐI không nảy/đổ lại khi rê chuột (hover)
  const renderedPoiIdsRef = useRef<Set<string>>(new Set());

  // Lắng nghe sự kiện di chuyển và thay đổi khung nhìn của bản đồ:
  // Khi bắt đầu kéo (movestart): hiện viên thuốc 3 chấm loading
  // Khi kết thúc kéo (moveend): debounce 220ms nạp vùng mới, cho ghim mới rơi nhẹ xuống, ẩn viên thuốc
  useEffect(() => {
    if (!map) return;
    let debounceTimer: NodeJS.Timeout | null = null;
    let hidePillTimer: NodeJS.Timeout | null = null;

    const handleMoveStart = () => {
      if (setIsMapLoading) setIsMapLoading(true);
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      if (hidePillTimer) {
        clearTimeout(hidePillTimer);
        hidePillTimer = null;
      }
    };

    const handleMoveEnd = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        try {
          setViewportBounds(map.getBounds());
          setCurrentZoom(map.getZoom());
        } catch {
          // safe fallback
        }
        hidePillTimer = setTimeout(() => {
          if (setIsMapLoading) setIsMapLoading(false);
        }, 160);
      }, 220);
    };

    map.on('movestart', handleMoveStart);
    map.on('zoomstart', handleMoveStart);
    map.on('moveend', handleMoveEnd);
    map.on('zoomend', handleMoveEnd);
    map.on('resize', handleMoveEnd);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      if (hidePillTimer) clearTimeout(hidePillTimer);
      map.off('movestart', handleMoveStart);
      map.off('zoomstart', handleMoveStart);
      map.off('moveend', handleMoveEnd);
      map.off('zoomend', handleMoveEnd);
      map.off('resize', handleMoveEnd);
    };
  }, [map, setIsMapLoading]);

  // Lọc thông minh danh sách POI cần vẽ marker (Dynamic Viewport Must-Try Selection - Chuẩn Mindtrip):
  // 1. Giới hạn tối đa ~20 địa điểm "Must Try" đổ lại trên bản đồ ở bất kỳ thời điểm nào.
  // 2. KHÔNG phụ thuộc vào hoveredPoiId để danh sách 20 điểm không bị xáo trộn hay giật cục khi lướt chuột.
  const visiblePois = useMemo(() => {
    if (pois.length <= 20) {
      return pois;
    }

    const currentBounds = viewportBounds || (map ? map.getBounds() : null);
    const paddedBounds = currentBounds && typeof currentBounds.pad === 'function'
      ? currentBounds.pad(0.08)
      : currentBounds;

    const inViewCandidates = paddedBounds
      ? pois.filter((p) => paddedBounds.contains([p.lat, p.lng]))
      : pois;

    return selectMustTryViewportPois(
      inViewCandidates,
      paddedBounds,
      pois,
      selectedPoiId,
      null, // Không cho hoveredPoiId làm thay đổi danh sách 20 điểm Must-Try!
      20
    );
  }, [pois, viewportBounds, map, selectedPoiId]);

  // Danh sách POI hiển thị: Nếu điểm đang hover nằm ngoài Top 20, chỉ bổ sung riêng điểm đó mà không làm xáo trộn 20 điểm sẵn có
  const displayedPois = useMemo(() => {
    if (!hoveredPoiId) return visiblePois;
    if (visiblePois.some((p) => p.id === hoveredPoiId)) return visiblePois;
    const hoveredPoi = pois.find((p) => p.id === hoveredPoiId);
    return hoveredPoi ? [...visiblePois, hoveredPoi] : visiblePois;
  }, [visiblePois, hoveredPoiId, pois]);

  // Ghi nhận các POI hiện tại đã được render sau khi hiệu ứng rơi bóng kết thúc (600ms)
  // Giúp các ghim đã hạ cánh không bao giờ bị rơi lại khi rê chuột (hover)
  useEffect(() => {
    const timer = setTimeout(() => {
      renderedPoiIdsRef.current = new Set(displayedPois.map((p) => p.id));
    }, 600);
    return () => clearTimeout(timer);
  }, [displayedPois]);

  // Thuật toán chống đè chữ / chống va chạm nhãn bản đồ thông minh (Cartographic Greedy Placement):
  // 1. Chấm điểm ưu tiên: Điểm đang chọn/hover > Địa điểm xanh (isGreen) > Rating > Di tích/thắng cảnh > Mức giá
  // 2. Điểm ưu tiên cao hơn được cấp nhãn trước
  // 3. Nếu nhãn bên phải hoặc bên trái va chạm với nhãn khác đã hiện: Tự động ẩn nhãn của điểm thấp hơn
  // 4. Khi người dùng phóng to (zoom in), khoảng cách pixel giãn nở, nhãn ẩn sẽ tự động hiển thị ra
  const computeOffsets = useCallback(() => {
    if (!map) return;
    try {
      const zoom = map.getZoom();
      setCurrentZoom(zoom);
      const mapSize = map.getSize();
      if (!mapSize || mapSize.x === 0 || mapSize.y === 0) return;

      const result: Record<string, MarkerOffset> = {};
      const hidden = new Set<string>();

      // 1. Phát hiện các điểm trùng tọa độ hoặc quá sát nhau (co-located POIs)
      // Tạo micro-offset để ghim không bị đè tuyệt đối lên nhau
      const coordGroups: Record<string, Poi[]> = {};
      displayedPois.forEach((p) => {
        const key = `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
        if (!coordGroups[key]) coordGroups[key] = [];
        coordGroups[key].push(p);
      });

      const microOffsets: Record<string, { x: number; y: number }> = {};
      Object.values(coordGroups).forEach((group) => {
        if (group.length > 1) {
          group.forEach((p, idx) => {
            if (idx === 0) {
              microOffsets[p.id] = { x: 0, y: 0 };
            } else {
              // Phân tán nhẹ các điểm tiếp theo xung quanh bán kính 14px để click được riêng biệt
              const angle = ((2 * Math.PI) / group.length) * idx;
              microOffsets[p.id] = {
                x: Math.round(14 * Math.cos(angle)),
                y: Math.round(14 * Math.sin(angle)),
              };
            }
          });
        }
      });

      const screenPoints = displayedPois.map((poi) => {
        const pt = map.latLngToContainerPoint([poi.lat, poi.lng]);
        const mo = microOffsets[poi.id] || { x: 0, y: 0 };
        return { poi, x: pt.x + mo.x, y: pt.y + mo.y, mo };
      });

      // Hàm chấm điểm độ ưu tiên hiển thị nhãn:
      const getPoiScore = (p: Poi) => {
        let score = 0;
        if (p.id === selectedPoiId || p.id === hoveredPoiId) score += 10000;
        if (p.isGreen) score += 60;
        if (p.rating) score += p.rating * 10;
        if (p.category === 'canh-quan' || p.category === 'di-tich') score += 15;
        if (p.budget_tier && p.budget_tier !== 'free') score += 10;
        return score;
      };

      // Ngưỡng đệm an toàn theo mức zoom (phóng to thì đệm nhỏ hơn, cho phép hiện dày hơn)
      const padX = zoom >= 15 ? 4 : zoom >= 14 ? 6 : 8;
      const padY = zoom >= 15 ? 3 : 5;

      const boxesOverlap = (b1: LabelBox, b2: LabelBox): boolean => {
        return !(
          b1.x2 + padX < b2.x1 ||
          b1.x1 - padX > b2.x2 ||
          b1.y2 + padY < b2.y1 ||
          b1.y1 - padY > b2.y2
        );
      };

      // Sắp xếp các điểm theo điểm ưu tiên giảm dần
      const sortedPoints = [...screenPoints].sort((a, b) => getPoiScore(b.poi) - getPoiScore(a.poi));
      const acceptedBoxes: LabelBox[] = [];
      const acceptedCenterPoints: { x: number; y: number }[] = [];

      for (const item of sortedPoints) {
        const { poi, x, y, mo } = item;
        const isTarget = poi.id === selectedPoiId || poi.id === hoveredPoiId;

        const cleanName = cleanPoiName(poi.name);
        const hasTier = Boolean(poi.budget_tier && poi.budget_tier !== 'free');
        const labelWidth = Math.min(150, Math.max(48, cleanName.length * 7.2 + (hasTier ? 20 : 0) + 16));

        // Hộp nhãn bên phải (mặc định)
        const boxRight: LabelBox = {
          x1: x + 16,
          y1: y - 13,
          x2: x + 16 + labelWidth,
          y2: y + 13,
        };

        // Hộp nhãn bên trái (khi gần mép phải hoặc bên phải bị che)
        const boxLeft: LabelBox = {
          x1: x - 16 - labelWidth,
          y1: y - 13,
          x2: x - 16,
          y2: y + 13,
        };

        // 1. Điểm đang được chọn hoặc trỏ chuột -> Bắt buộc luôn hiện nhãn
        if (isTarget) {
          if (boxRight.x2 < mapSize.x - 10) {
            result[poi.id] = { position: 'right', xOffset: mo.x, yOffset: mo.y };
            acceptedBoxes.push(boxRight);
            acceptedCenterPoints.push({ x, y });
          } else {
            result[poi.id] = { position: 'left', xOffset: mo.x, yOffset: mo.y };
            acceptedBoxes.push(boxLeft);
            acceptedCenterPoints.push({ x, y });
          }
          continue;
        }

        // 2. Khi thu nhỏ xa (zoom < 11.5) -> Chỉ hiện ghim tròn icon tối giản
        if (zoom < 11.5) {
          hidden.add(poi.id);
          result[poi.id] = { position: 'right', xOffset: mo.x, yOffset: mo.y };
          continue;
        }

        // 3. Quy tắc CHỐNG DÍNH CHÙM / CHỐNG PHÂN THÂN HAI ĐẦU (Co-located Anti-split Rule):
        // Nếu điểm này nằm quá gần một điểm ưu tiên cao hơn đã được hiển thị nhãn (khoảng cách tâm pin < 24px):
        // Tuyệt đối không cho phép tạo 2 nhãn mọc ra 2 bên của cùng 1 vị trí pin!
        // Điểm này sẽ chỉ hiển thị ghim icon tối giản, không hiện thêm nhãn để bản đồ không bị rối/trùng lặp.
        const isTooCloseToAcceptedPin = acceptedCenterPoints.some(
          (cp) => Math.hypot(cp.x - x, cp.y - y) < 24
        );
        if (isTooCloseToAcceptedPin) {
          hidden.add(poi.id);
          result[poi.id] = { position: 'right', xOffset: mo.x, yOffset: mo.y };
          continue;
        }

        // 4. Thử đặt nhãn bên PHẢI
        const fitsRight = boxRight.x2 < mapSize.x - 12;
        const collidesRight = acceptedBoxes.some((b) => boxesOverlap(boxRight, b));

        if (fitsRight && !collidesRight) {
          result[poi.id] = { position: 'right', xOffset: mo.x, yOffset: mo.y };
          acceptedBoxes.push(boxRight);
          acceptedCenterPoints.push({ x, y });
          continue;
        }

        // 5. Thử đặt nhãn bên TRÁI
        const fitsLeft = boxLeft.x1 > 12;
        const collidesLeft = acceptedBoxes.some((b) => boxesOverlap(boxLeft, b));

        if (fitsLeft && !collidesLeft) {
          result[poi.id] = { position: 'left', xOffset: mo.x, yOffset: mo.y };
          acceptedBoxes.push(boxLeft);
          acceptedCenterPoints.push({ x, y });
          continue;
        }

        // 6. Cả 2 phía đều va chạm -> Ẩn nhãn chữ, chỉ hiện ghim tròn biểu tượng sạch đẹp
        // Phóng to bản đồ (zoom in) sẽ tự động hiện thêm nhãn của điểm này!
        hidden.add(poi.id);
        result[poi.id] = { position: 'right', xOffset: mo.x, yOffset: mo.y };
      }

      setOffsets(result);
      setHiddenLabelIds(hidden);
    } catch {
      // safe fallback
    }
  }, [displayedPois, map, selectedPoiId, hoveredPoiId]);

  useEffect(() => {
    computeOffsets();
    const handleZoom = () => {
      setCurrentZoom(map.getZoom());
      computeOffsets();
    };
    map.on('zoomend', handleZoom);
    map.on('moveend', computeOffsets);
    map.on('resize', computeOffsets);
    return () => {
      map.off('zoomend', handleZoom);
      map.off('moveend', computeOffsets);
      map.off('resize', computeOffsets);
    };
  }, [map, computeOffsets]);

  // coreCluster và coreBounds được truyền từ PoiMap để dùng chung đồng nhất với nút Floating Return Control

  // Ref theo dõi việc bản đồ đang mở rộng để bao quát địa điểm ở xa
  const isDistantExpandedRef = useRef<boolean>(isDistantExpanded);
  useEffect(() => {
    isDistantExpandedRef.current = isDistantExpanded;
  }, [isDistantExpanded]);

  const prevActivePoiIdRef = useRef<string | null>(null);

  // Địa điểm đang được người dùng tương tác (chọn thẻ hoặc rê chuột debounced)
  const activePoiId = selectedPoiId || hoveredPoiId;

  // Xử lý camera thông minh theo hành vi người dùng (Chuẩn Mindtrip / GreenTrip UX):
  // 1. Mặc định: Tập trung vào "chỗ đông đúc" (cụm trung tâm zoom 13.5)
  // 2. Khi di chuyển tới ô địa điểm ở xa: Mở rộng mượt mà (flyToBounds) bao trọn [Chỗ đông đúc + Điểm ở xa]
  // 3. Khi di chuyển giữa các điểm ở xa cạnh nhau:
  //    - TUYỆT ĐỐI KHÔNG tự động co nhỏ về trung tâm khi chuột tạm thời rời thẻ (chấm dứt hiện tượng giật co vào rồi lại phóng to ra)
  //    - Nếu điểm ở xa tiếp theo đã nằm trong tầm mắt hiện tại: Giữ bản đồ HOÀN TOÀN TĨNH LẶNG, chỉ highlight ghim
  //    - Nếu điểm ở xa tiếp theo chưa hiển thị trọn vẹn: Mở rộng trực tiếp từ khung nhìn hiện tại tới điểm đó, không bao giờ nhảy về trung tâm trước
  // 4. Khi quay lại chọn/rê chuột vào địa điểm ở khu trung tâm: Bản đồ êm ái thu nhỏ mượt mà trở về cụm đông đúc
  useEffect(() => {
    if (!map || pois.length === 0) return;

    // Khi chuột rời khỏi thẻ (activePoiId === null):
    // GIỮ NGUYÊN tầm nhìn camera hiện tại! KHÔNG tự động nhảy về trung tâm gây giật hình hay cảm giác "bị cứng"!
    if (!activePoiId) {
      prevActivePoiIdRef.current = null;
      return;
    }

    if (prevActivePoiIdRef.current === activePoiId) return;
    prevActivePoiIdRef.current = activePoiId;

    const target = pois.find((p) => p.id === activePoiId);
    if (!target || !Number.isFinite(target.lat) || !Number.isFinite(target.lng)) return;

    try {
      const currentBounds = map.getBounds();
      const targetLatLng = L.latLng(target.lat, target.lng);
      // Kiểm tra xem target đã nằm trong khung hình hiện tại chưa (với lề đệm 10%)
      const isVisibleInCurrentView = currentBounds.pad(-0.1).contains(targetLatLng);

      // 1. Xác định thành phố của địa điểm đang tương tác (Đà Nẵng vs Huế)
      const isHueTarget = target.city === 'Huế' || (target.city as string) === 'hue' || target.lat >= 16.3;
      
      // 2. Xác định vị trí hiện tại của camera trên bản đồ
      const currentMapCenter = map.getCenter();
      const isMapInHue = currentMapCenter.lat >= 16.3;
      const isSameCity = isHueTarget === isMapInHue;

      if (!isSameCity) {
        // NGƯỜI DÙNG QUAN TÂM ĐẾN THÀNH PHỐ KHÁC (Đà Nẵng <-> Huế):
        // Bay trực tiếp tới thành phố đó với góc nhìn to, rõ ràng, chi tiết (zoom 13.5)!
        // TUYỆT ĐỐI KHÔNG thu nhỏ 100km để nối 2 thành phố gây nhỏ xíu!
        map.stop();
        map.flyTo([target.lat, target.lng], 13.5, {
          duration: 0.9,
          easeLinearity: 0.25,
        });
        setIsDistantExpanded(isHueTarget); // Hiện nút "Về trung tâm Đà Nẵng" khi đang ở Huế
        return;
      }

      // NẾU CAMERA ĐÃ Ở CÙNG THÀNH PHỐ VỚI ĐỊA ĐIỂM:
      if (isVisibleInCurrentView) {
        // Đã nằm trong tầm mắt: Giữ nguyên góc nhìn to rõ, chỉ highlight ghim
        return;
      }

      // Nếu địa điểm hơi lệch ra ngoài khung nhìn của thành phố đó:
      // Trượt êm ái (panTo) tới điểm đó mà vẫn giữ nguyên zoom 13.5 to rõ!
      map.stop();
      map.panTo([target.lat, target.lng], {
        animate: true,
        duration: 0.45,
      });
    } catch (e) {
      console.warn('Map camera transition error:', e);
    }
  }, [activePoiId, selectedPoiId, hoveredPoiId, pois, map, isDistantExpanded, setIsDistantExpanded]);

  return (
    <>
      {displayedPois.map((poi, idx) => {
        const isSelected = poi.id === selectedPoiId;
        const isHovered = poi.id === hoveredPoiId;
        const isHighlighted = isSelected || isHovered;
        const offset = offsets[poi.id] || { position: 'right', yOffset: 0 };
        
        // Tiêu chuẩn Mindtrip:
        // - Zoom >= 12.0: Hiện nhãn cho các điểm tiêu biểu và các điểm ngoài rìa (đã qua thuật toán chấm điểm ưu tiên & chống va chạm)
        // - Zoom >= 14.0: Hầu hết các điểm đều hiện nhãn rõ ràng kèm mức giá / biểu tượng
        // - Riêng ghim đang được Hover hoặc Đang chọn: LUÔN LUÔN hiện nhãn nổi bật
        const showLabel = (currentZoom >= 12.0 && !hiddenLabelIds.has(poi.id)) || isHighlighted;

        // Chỉ áp dụng hiệu ứng đổ xuống như trái bóng cho các POI MỚI chưa từng có mặt trên màn hình
        // Tuyệt đối KHÔNG đổ lại khi rê chuột (hover)
        const isNewEntrance = !renderedPoiIdsRef.current.has(poi.id);
        const entranceDelayMs = isNewEntrance ? (idx % 12) * 35 : 0;

        return (
          <Marker
            key={poi.id}
            position={[poi.lat, poi.lng]}
            zIndexOffset={isSelected ? 9999 : isHovered ? 9000 : 50}
            icon={createMindtripMarkerIcon(isSelected, isHovered, poi, offset, showLabel, isNewEntrance, entranceDelayMs, savedHeartMarkers)}
            eventHandlers={{
              click: () => onSelectPoi(poi.id),
              mouseover: () => {
                onHoverMapPin(poi.id);
                onMarkerHover?.(poi.id, true);
              },
              mouseout: () => {
                onHoverMapPin(null);
                onMarkerHover?.(poi.id, false);
              },
            }}
          />
        );
      })}
    </>
  );
}

function MapClickHandler({ onDismiss }: { onDismiss: () => void }) {
  useMapEvents({
    click: (e) => {
      const target = e.originalEvent?.target as HTMLElement | null;
      if (
        target?.closest('.map-marker-pin') || 
        target?.closest('.map-marker-label') || 
        target?.closest('.gt-map-marker') || 
        target?.closest('.floating-detail-card')
      ) {
        return;
      }
      onDismiss();
    },
  });
  return null;
}

export default function PoiMap({
  pois,
  selectedPoiId,
  hoveredPoiId,
  onSelectPoi,
  onHoverPoi,
  onOpenDetails,
  isExpanded = false,
  onToggleExpand,
  favorites,
  pendingFavorites,
  onToggleFavorite,
  addedTrips,
  onToggleAddTrip,
  hideTopControls = false,
  showMapLoader = true,
  savedHeartMarkers = false,
  hideFloatingPreview = false,
}: PoiMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const [hoveredMapPinId, setHoveredMapPinId] = useState<string | null>(null);
  const [isDistantExpanded, setIsDistantExpanded] = useState<boolean>(false);
  const [isMapLoading, setIsMapLoading] = useState<boolean>(false);

  // Bộ đếm thời gian tự động đóng ô cơ bản khi dời chuột ra ngoài (450ms, không tức thì để tránh giật)
  const autoCloseTimerRef = useRef<NodeJS.Timeout | null>(null);

  const startAutoCloseTimer = useCallback((delay = 450) => {
    if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
    autoCloseTimerRef.current = setTimeout(() => {
      onSelectPoi(null);
    }, delay);
  }, [onSelectPoi]);

  const cancelAutoCloseTimer = useCallback(() => {
    if (autoCloseTimerRef.current) {
      clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
    };
  }, []);

  const handleMarkerHover = useCallback((id: string, isEnter: boolean) => {
    if (id === selectedPoiId) {
      if (isEnter) {
        cancelAutoCloseTimer();
      } else {
        startAutoCloseTimer(450);
      }
    }
  }, [selectedPoiId, cancelAutoCloseTimer, startAutoCloseTimer]);

  // Xác định cụm điểm trung tâm đông đúc (chỗ đông đúc - core cluster):
  const coreCluster = useMemo(() => {
    const valid = pois.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
    if (valid.length === 0) return [];

    // Cụm đô thị trung tâm Đà Nẵng (sông Hàn, Sơn Trà, Mỹ Khê, Hải Châu, Thanh Khê)
    const dnCore = valid.filter((p) => p.lat >= 16.01 && p.lat <= 16.12 && p.lng >= 108.17 && p.lng <= 108.27);
    if (dnCore.length >= 3) return dnCore;

    // Cụm trung tâm Cố Đô Huế (Kinh thành, sông Hương)
    const hueCore = valid.filter((p) => p.lat >= 16.43 && p.lat <= 16.50 && p.lng >= 107.54 && p.lng <= 107.62);
    if (hueCore.length >= 3) return hueCore;

    return valid;
  }, [pois]);

  const coreBounds = useMemo(() => {
    if (coreCluster.length === 0) return null;
    return L.latLngBounds(coreCluster.map((p) => [p.lat, p.lng] as [number, number]));
  }, [coreCluster]);

  const handleReturnToCenter = useCallback(() => {
    if (mapRef.current) {
      mapRef.current.stop();
      mapRef.current.flyTo([16.0680, 108.2220], 13.5, {
        duration: 0.85,
        easeLinearity: 0.25,
      });
      setIsDistantExpanded(false);
    }
  }, []);

  // Ô cơ bản trên map: CHỈ HIỆN KHI BẤM VÀO (selectedPoiId), KHÔNG hiện khi hover để bản đồ luôn rõ ràng, thoáng mắt
  const selectedPoi = pois.find((p) => p.id === selectedPoiId) || null;

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#f4f2ee] rounded-[22px] [transform:translateZ(0)]">
      <style>{`
        .leaflet-container {
          background-color: #f2ede5 !important;
          outline: none !important;
        }
        .leaflet-control-attribution,
        .leaflet-bottom.leaflet-left,
        .leaflet-control-scale {
          display: none !important;
        }
        .leaflet-control-attribution a {
          font-size: 10px !important;
        }
        .leaflet-tile-pane {
          will-change: transform;
        }
        .leaflet-tile {
          transition: opacity 0.15s ease-in;
        }
        .leaflet-grab {
          cursor: grab !important;
        }
        .leaflet-grabbing {
          cursor: grabbing !important;
        }
        .gt-map-marker {
          width: auto !important;
          height: auto !important;
          background: transparent !important;
          border: none !important;
          overflow: visible !important;
          pointer-events: auto !important;
        }
        @keyframes mindtripBallDrop {
          0% {
            opacity: 0.3;
            transform: translateY(-28px) scale(0.92);
          }
          50% {
            opacity: 0.85;
            transform: translateY(4px) scale(1.05, 0.95);
          }
          72% {
            opacity: 1;
            transform: translateY(-3px) scale(0.98, 1.02);
          }
          90% {
            opacity: 1;
            transform: translateY(1px) scale(1.01);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        .gt-ball-drop {
          animation: mindtripBallDrop 0.52s cubic-bezier(0.22, 1, 0.36, 1) both;
          will-change: transform, opacity;
        }
        .gt-pin-drop {
          animation: mindtripBallDrop 0.52s cubic-bezier(0.22, 1, 0.36, 1) both;
          will-change: transform, opacity;
        }
        .gt-marker-bounce {
          animation: mindtripBallDrop 0.52s cubic-bezier(0.22, 1, 0.36, 1) both;
          will-change: transform, opacity;
        }
        .map-floating-btn {
          box-shadow: 0 2px 6px rgba(0,0,0,0.18);
          transition: background-color 0.15s ease, transform 0.1s ease;
        }
        .map-floating-btn:hover {
          background-color: #f8fafc;
          transform: translateY(-1px);
        }
        .map-floating-btn:active {
          transform: translateY(0);
        }
      `}</style>

      {/* Tâm bản đồ trung tâm Đà Nẵng, zoom 13.5 thấy các khu trung tâm trước */}
      <MapContainer
        center={[16.0680, 108.2220]}
        zoom={13.5}
        minZoom={7}
        maxZoom={18}
        zoomControl={false}
        attributionControl={false}
        wheelDebounceTime={40}
        wheelPxPerZoomLevel={120}
        inertia={true}
        inertiaDeceleration={2400}
        inertiaMaxSpeed={1600}
        easeLinearity={0.25}
        className="h-full w-full rounded-[22px] overflow-hidden"
        ref={(m) => { if (m) mapRef.current = m; }}
        scrollWheelZoom
      >
        {/* Tải trước 12 hàng ô gạch (keepBuffer=12) & cập nhật liên tục để xóa bỏ hoàn toàn hiện tượng mảng vuông bị khuyết khi lướt */}
        <TileLayer
          url="https://{s}.google.com/vt/lyrs=m&hl=vi&x={x}&y={y}&z={z}&apistyle=s.t:2|p.v:off,s.t:5|s.e:l.i|p.v:off,s.t:17|s.e:l.i|p.v:off,s.t:18|s.e:l.i|p.v:off,s.t:road|s.e:l.i|p.v:off,s.t:road.highway|s.e:labels.icon|p.v:off,s.t:road.arterial|s.e:labels.icon|p.v:off"
          subdomains={['mt0', 'mt1', 'mt2', 'mt3']}
          attribution='&copy; Google Maps'
          keepBuffer={12}
          updateWhenIdle={false}
          updateInterval={60}
        />

        <MapResizeListener />
        <MapAutoFitter pois={pois} />
        
        <MapControlsLayer 
          isExpanded={isExpanded}
          onToggleExpand={onToggleExpand}
          hideTopControls={hideTopControls}
        />

        <DynamicMarkersLayer
          pois={pois}
          selectedPoiId={selectedPoiId}
          hoveredPoiId={hoveredPoiId || hoveredMapPinId}
          savedHeartMarkers={savedHeartMarkers}
          onSelectPoi={(id) => {
            cancelAutoCloseTimer();
            onSelectPoi(id);
          }}
          onHoverMapPin={(id) => {
            setHoveredMapPinId(id);
            if (onHoverPoi) onHoverPoi(id);
          }}
          onMarkerHover={handleMarkerHover}
          isDistantExpanded={isDistantExpanded}
          setIsDistantExpanded={setIsDistantExpanded}
          coreCluster={coreCluster}
          coreBounds={coreBounds}
          setIsMapLoading={setIsMapLoading}
        />

        {/* Nút Floating chuẩn Mindtrip: Khi đang mở rộng xem điểm ở xa, hiện nút bấm êm ái quay về trung tâm */}
        {isDistantExpanded && (
          <div className="absolute top-3.5 left-1/2 -translate-x-1/2 z-[1000] animate-fadeIn pointer-events-auto">
            <button
              onClick={handleReturnToCenter}
              className="map-floating-btn px-4 py-2 bg-white/95 backdrop-blur-md rounded-full flex items-center gap-1.5 text-xs font-semibold text-neutral-800 hover:text-black hover:bg-white shadow-md border border-neutral-200/80 transition-all cursor-pointer active:scale-95"
            >
              <i className="ph ph-arrow-counter-clockwise text-sm font-bold text-emerald-700"></i>
              <span>Về Đà Nẵng</span>
            </button>
          </div>
        )}

        {/* 3-Dot Mindtrip Loading Pill: Chỉ hiển thị khi showMapLoader=true và pois.length > 20 (chế độ Khám phá), không hiển thị ở Lịch trình */}
        {showMapLoader && pois.length > 20 && (
          <div
            className={`absolute top-4 left-1/2 -translate-x-1/2 z-[1000] pointer-events-none transition-all duration-300 ease-out ${
              isMapLoading && !isDistantExpanded ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-2 scale-95 pointer-events-none'
            }`}
          >
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/95 backdrop-blur-md shadow-[0_4px_16px_rgba(0,0,0,0.14)] border border-neutral-200/90 text-xs font-semibold text-neutral-800">
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-neutral-900 animate-bounce" style={{ animationDuration: '0.6s', animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-neutral-900 animate-bounce" style={{ animationDuration: '0.6s', animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-neutral-900 animate-bounce" style={{ animationDuration: '0.6s', animationDelay: '300ms' }} />
              </div>
              <span className="text-[11.5px] font-medium text-neutral-700 tracking-tight">Tìm kiếm khu vực này...</span>
            </div>
          </div>
        )}

        <MapClickHandler onDismiss={() => {
          cancelAutoCloseTimer();
          onSelectPoi(null);
        }} />

        {/* Ô cơ bản trên map: CHỈ HIỆN KHI BẤM VÀO (selectedPoiId), tự động đóng sau 450ms khi dời chuột ra ngoài */}
        {selectedPoi && !hideFloatingPreview && (
          <FloatingDetailCard 
            poi={selectedPoi}
            onClose={() => {
              cancelAutoCloseTimer();
              onSelectPoi(null);
            }}
            onOpenDetails={() => {
              cancelAutoCloseTimer();
              if (onOpenDetails) {
                onOpenDetails(selectedPoi.id);
              } else {
                onSelectPoi(selectedPoi.id);
              }
            }}
            onPointerEnter={cancelAutoCloseTimer}
            onPointerLeave={() => startAutoCloseTimer(450)}
            isFavorite={favorites?.has(selectedPoi.id)}
            isFavoritePending={pendingFavorites?.has(selectedPoi.id)}
            onToggleFavorite={onToggleFavorite}
            isAdded={addedTrips?.has(selectedPoi.id)}
            onToggleAddTrip={onToggleAddTrip}
          />
        )}
      </MapContainer>
    </div>
  );
}
