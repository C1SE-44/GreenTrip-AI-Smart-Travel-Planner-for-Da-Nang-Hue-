import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { Poi } from '@/data/pois';
import { categoryLabels, getGalleryImages } from '@/data/pois';

interface PoiMapProps {
  pois: Poi[];
  selectedPoiId: string | null;
  hoveredPoiId: string | null;
  onSelectPoi: (id: string | null) => void;
  onHoverPoi: (id: string | null) => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  favorites?: Set<string>;
  onToggleFavorite?: (id: string) => void;
  addedTrips?: Set<string>;
  onToggleAddTrip?: (id: string) => void;
}

interface MarkerOffset {
  position: 'right' | 'left' | 'top';
  yOffset: number;
}

// 1. Rút gọn tên hiển thị trên marker (bỏ ngoặc đơn nếu có)
function cleanPoiName(name: string): string {
  if (!name) return '';
  return name.replace(/\s*\([^)]*\)/g, '').trim();
}

// 2. Icon danh mục hiển thị trong pin
function getCategoryIconSvg(category: string, isHighlighted: boolean): string {
  const color = isHighlighted ? '#ffffff' : '#18181b';
  switch (category) {
    case 'quan-an':
      return `<svg width="15" height="15" viewBox="0 0 24 24" fill="${color}"><path d="M11 9H9V2H7v7H5V2H3v7c0 2.12 1.66 3.84 3.75 3.97V22h2.5v-9.03C11.34 12.84 13 11.12 13 9V2h-2v7zm5-3v8h2.5v8H21V2c-2.76 0-5 2.24-5 4z"/></svg>`;
    case 'di-tich':
      return `<svg width="15" height="15" viewBox="0 0 24 24" fill="${color}"><path d="M12 2L2 7v3h20V7L12 2zm-7 9v8H3v-8h2zm5 0v8H8v-8h2zm5 0v8h-2v-8h2zm5 0v8h-2v-8h2zm3 10H1v2h22v-2z"/></svg>`;
    case 'chua':
      return `<svg width="15" height="15" viewBox="0 0 24 24" fill="${color}"><path d="M12 2c1.5 2.5 3.5 5 3.5 8 0 3-1.8 5.5-3.5 6-1.7-.5-3.5-3-3.5-6 0-3 2-5.5 3.5-8zm6.5 7.5c-.3 2.5-1.5 4.8-3 6.5 1.5 1 3.5 1.5 5 1.5-1-2.5-1.5-5.5-2-8zm-13 0c-.5 2.5-1 5.5-2 8 1.5 0 3.5-.5 5-1.5-1.5-1.7-2.7-4-3-6.5zM12 18c-3 0-6.5 1.2-8 3h16c-1.5-1.8-5-3-8-3z"/></svg>`;
    case 'canh-quan':
    default:
      return `<svg width="15" height="15" viewBox="0 0 24 24" fill="${color}"><path d="M14 6l-4.5 7.5 2 3.5h7L14 6zm-7 5L1 21h22l-6-10-3 5-7-5z"/></svg>`;
  }
}

// 3. Tạo icon DivIcon cho Marker
// Ghim đang chọn: Nền đen dạng viên thuốc, icon trắng + ảnh tròn thu nhỏ
function createMindtripMarkerIcon(
  isSelected: boolean,
  isHovered: boolean,
  poi: Poi,
  offset: MarkerOffset = { position: 'right', yOffset: 0 },
  showLabel: boolean = true
): L.DivIcon {
  const isHighlighted = isSelected || isHovered;
  const displayName = cleanPoiName(poi.name);
  const iconSvg = getCategoryIconSvg(poi.category, isHighlighted);

  let pinHtml = '';
  let labelHtml = '';

  if (isSelected) {
    // Ghim đang chọn trên bản đồ: Nền đen dạng viên thuốc, icon trắng + ảnh tròn thu nhỏ (Mindtrip Image 1 & 2)
    pinHtml = `
      <div class="map-marker-pin absolute -left-[16px] -top-[16px] h-[32px] px-2.5 bg-black text-white rounded-full shadow-[0_4px_16px_rgba(0,0,0,0.35)] ring-2 ring-black/20 flex items-center gap-1.5 z-[9999] pointer-events-auto transition-transform scale-105">
        ${iconSvg}
        <img src="${poi.image}" referrerpolicy="no-referrer" class="w-5 h-5 rounded-full object-cover ring-1 ring-white/60" alt="" />
        <span class="text-[12px] font-bold text-white whitespace-nowrap leading-none pl-0.5">${displayName}</span>
      </div>
    `;
    labelHtml = '';
  } else {
    // Ghim bình thường / hover: Ghim tròn 28px + Khung chữ thường nền trắng
    pinHtml = `
      <div class="map-marker-pin absolute -left-[14px] -top-[14px] w-[28px] h-[28px] rounded-full ${
        isHovered
          ? 'bg-black text-white shadow-xl scale-110 ring-2 ring-black/20'
          : 'bg-white text-zinc-900 shadow-[0_2px_6px_rgba(0,0,0,0.18)] border border-zinc-200/90'
      } flex items-center justify-center shrink-0 transition-transform duration-150 pointer-events-auto">
        ${iconSvg}
      </div>
    `;

    // Chỉ hiển thị nhãn chữ khi showLabel=true hoặc khi đang được trỏ/hover chuột
    if (showLabel || isHovered) {
      // Vị trí nhãn chữ: 'top' (trên ghim), 'left' (bên trái), 'right' (bên phải)
      let labelClass = 'map-marker-label absolute pointer-events-auto max-w-[160px] ';
      if (offset.position === 'top') {
        labelClass += 'bottom-[18px] left-1/2 -translate-x-1/2 text-center';
      } else if (offset.position === 'left') {
        labelClass += 'right-[18px] top-1/2 -translate-y-1/2 text-right';
      } else {
        labelClass += 'left-[18px] top-1/2 -translate-y-1/2 text-left';
      }

      // Nhãn chữ thường có khung nền trắng chứa, bo góc 5px thanh lịch
      labelHtml = `
        <div class="${labelClass} ${
          isHovered
            ? 'bg-black text-white border-black shadow-lg font-medium z-50'
            : 'bg-white/95 text-zinc-800 border-zinc-200/90 font-medium'
        } backdrop-blur-[2px] px-2 py-0.5 rounded-[5px] shadow-[0_1px_3px_rgba(0,0,0,0.12)] border transition-all duration-150">
          <span class="text-[11.5px] leading-tight whitespace-nowrap truncate block ${
            isHovered ? 'text-white' : 'text-zinc-800'
          }">
            ${displayName}
          </span>
        </div>
      `;
    }
  }

  const transformStyle = offset.yOffset !== 0 ? `transform: translateY(${offset.yOffset}px);` : '';

  const contentHtml = `
    <div class="relative cursor-pointer select-none ${
      isHighlighted ? 'z-[9999]' : 'z-20'
    }" style="${transformStyle}">
      ${pinHtml}
      ${labelHtml}
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
  onClick?: () => void;
  onHoverPoi?: (id: string | null) => void;
  isFavorite?: boolean;
  onToggleFavorite?: (id: string) => void;
  isAdded?: boolean;
  onToggleAddTrip?: (id: string) => void;
}

// 4. Card xem trước khi trỏ/chọn ghim trên bản đồ (nhỏ gọn chuẩn Mindtrip: rộng ~308px, ảnh cao 180px)
function FloatingDetailCard({ 
  poi, 
  onClick,
  onHoverPoi,
  isFavorite = false,
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
      onClick={onClick}
      onMouseEnter={() => {
        setIsHovered(true);
        onHoverPoi?.(poi.id);
      }}
      onMouseLeave={() => {
        setIsHovered(false);
        onHoverPoi?.(null);
      }}
      className="absolute z-[1000] w-[308px] max-w-[calc(100%-24px)] bg-white rounded-[20px] shadow-[0_8px_30px_rgba(0,0,0,0.18)] border border-gray-100 overflow-hidden pointer-events-auto cursor-pointer animate-fadeIn"
      style={{ 
        left: `${coords.left}px`, 
        top: `${coords.top}px`,
        transition: 'left 150ms ease-out, top 150ms ease-out'
      }}
    >
      {/* 1. Ảnh tỉ lệ chuẩn Mindtrip: cao 180px, bo góc trên */}
      <div className="relative w-full h-[180px] bg-neutral-900 overflow-hidden group">
        <img 
          alt={poi.name} 
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" 
          src={gallery[imgIdx] || poi.image}
        />

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
              onToggleFavorite?.(poi.id);
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

        {/* Footer */}
        <div className="text-[11px] text-gray-400 mt-2.5 pt-2 border-t border-gray-100 font-medium flex items-center justify-between">
          <span>Nhấn để xem chi tiết</span>
          <span className="text-xs font-semibold text-black hover:underline flex items-center gap-0.5">
            Chi tiết <span>→</span>
          </span>
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

    if (prevIdsRef.current !== '') {
      try {
        const bounds = L.latLngBounds(pois.map((p) => [p.lat, p.lng] as [number, number]));
        if (bounds.isValid()) {
          map.flyToBounds(bounds, {
            padding: [48, 48],
            maxZoom: 15,
            duration: 0.9,
            easeLinearity: 0.25,
          });
        }
      } catch {
        // safe fallback
      }
    }
    prevIdsRef.current = currentIds;
  }, [pois, map]);

  return null;
}

// Cụm điều khiển Floating Controls
function MapControlsLayer({
  isExpanded,
  onToggleExpand,
}: {
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}) {
  const map = useMap();

  return (
    <>
      {/* 0. Nút Thu gọn / Mở rộng toàn màn hình bản đồ */}
      <div className="absolute top-3.5 left-4 z-[1000] group">
        <button 
          aria-label={isExpanded ? 'Thu nhỏ bản đồ' : 'Mở rộng bản đồ'}
          onClick={() => {
            onToggleExpand?.();
            setTimeout(() => map.invalidateSize(), 150);
          }}
          className="map-floating-btn w-10 h-10 bg-white rounded-full flex items-center justify-center text-zinc-700 hover:text-black transition cursor-pointer shadow-md active:scale-95"
        >
          {isExpanded ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 19l7-7-7-7M18 5v14" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 19l-7-7 7-7M6 5v14" />
            </svg>
          )}
        </button>
        <div className="absolute top-12 left-0 hidden group-hover:block bg-black text-white text-[11px] font-semibold px-2.5 py-1 rounded-md shadow-md whitespace-nowrap pointer-events-none animate-fadeIn">
          {isExpanded ? 'Thu nhỏ' : 'Mở rộng'}
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

      {/* 2. Right Toolbar Layer */}
      <div className="absolute right-4 bottom-8 flex flex-col space-y-2 z-[1000]">
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

function DynamicMarkersLayer({
  pois,
  selectedPoiId,
  hoveredPoiId,
  onSelectPoi,
  onHoverMapPin,
}: {
  pois: Poi[];
  selectedPoiId: string | null;
  hoveredPoiId: string | null;
  onSelectPoi: (id: string) => void;
  onHoverMapPin: (id: string | null) => void;
}) {
  const map = useMap();
  const [currentZoom, setCurrentZoom] = useState<number>(() => map.getZoom());
  const [offsets, setOffsets] = useState<Record<string, MarkerOffset>>({});
  const [hiddenLabelIds, setHiddenLabelIds] = useState<Set<string>>(new Set());

  const computeOffsets = useCallback(() => {
    if (!map) return;
    try {
      const zoom = map.getZoom();
      setCurrentZoom(zoom);
      const mapSize = map.getSize();
      if (!mapSize || mapSize.x === 0 || mapSize.y === 0) return;

      const result: Record<string, MarkerOffset> = {};
      const hidden = new Set<string>();

      pois.forEach((p) => {
        if (p.id === 'con-market' || p.id === 'madame-lan' || p.id === 'quang-truong-bach-dang') {
          result[p.id] = { position: 'top', yOffset: 0 };
        } else {
          result[p.id] = { position: 'right', yOffset: 0 };
        }
      });

      const screenPoints = pois.map((poi) => {
        const pt = map.latLngToContainerPoint([poi.lat, poi.lng]);
        return { poi, x: pt.x, y: pt.y };
      });

      // Kiểm tra mép phải màn hình: Giữ nhãn trong khung, lật sang bên trái nếu nhãn chạm mép
      screenPoints.forEach((p) => {
        if (p.x > mapSize.x - 175) {
          result[p.poi.id] = { position: 'left', yOffset: 0 };
        }
      });

      // Kiểm tra va chạm gần nhau khi zoom >= 14
      for (let i = 0; i < screenPoints.length; i++) {
        for (let j = i + 1; j < screenPoints.length; j++) {
          const p1 = screenPoints[i];
          const p2 = screenPoints[j];
          const dx = Math.abs(p1.x - p2.x);
          const dy = Math.abs(p1.y - p2.y);

          // Nếu hai điểm quá sát nhau (< 36px trên màn hình), ẩn bớt nhãn của điểm không được chọn/hover
          if (dx < 36 && dy < 36) {
            if (p1.poi.id !== selectedPoiId && p1.poi.id !== hoveredPoiId) {
              hidden.add(p1.poi.id);
            } else if (p2.poi.id !== selectedPoiId && p2.poi.id !== hoveredPoiId) {
              hidden.add(p2.poi.id);
            }
          } else if (dx < 140 && dy < 30) {
            if (p1.x < p2.x) {
              result[p1.poi.id] = { position: 'left', yOffset: 0 };
              result[p2.poi.id] = { position: 'right', yOffset: 0 };
            } else {
              result[p1.poi.id] = { position: 'right', yOffset: 0 };
              result[p2.poi.id] = { position: 'left', yOffset: 0 };
            }

            if (dx < 45) {
              if (p1.y < p2.y) {
                result[p1.poi.id].yOffset = -12;
                result[p2.poi.id].yOffset = 12;
              } else {
                result[p1.poi.id].yOffset = 12;
                result[p2.poi.id].yOffset = -12;
              }
            }
          }
        }
      }

      setOffsets(result);
      setHiddenLabelIds(hidden);
    } catch {
      // safe fallback
    }
  }, [pois, map, selectedPoiId, hoveredPoiId]);

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

  useEffect(() => {
    if (!hoveredPoiId) return;
    const target = pois.find((p) => p.id === hoveredPoiId);
    if (!target) return;
    try {
      const bounds = map.getBounds();
      if (!bounds.contains([target.lat, target.lng])) {
        map.panTo([target.lat, target.lng], { animate: true, duration: 0.5 });
      }
    } catch {
      // safe fallback
    }
  }, [hoveredPoiId, pois, map]);

  return (
    <>
      {pois.map((poi) => {
        const isSelected = poi.id === selectedPoiId;
        const isHovered = poi.id === hoveredPoiId;
        const isHighlighted = isSelected || isHovered;
        const offset = offsets[poi.id] || { position: 'right', yOffset: 0 };
        
        // Tiêu chuẩn Mindtrip:
        // - Zoom < 14: Ẩn nhãn chữ để tránh tắc nghẽn (chỉ hiện chấm pin danh mục gọn đẹp)
        // - Zoom >= 14: Hiện nhãn chữ (đã qua lọc chống va chạm)
        // - Riêng ghim đang được Hover hoặc Đang chọn: LUÔN LUÔN hiện nhãn nổi bật
        const showLabel = (currentZoom >= 14 && !hiddenLabelIds.has(poi.id)) || isHighlighted;

        return (
          <Marker
            key={`${poi.id}-${isHighlighted ? 'active' : 'idle'}-${showLabel ? 'lbl' : 'nolbl'}-${offset.position}-${offset.yOffset}`}
            position={[poi.lat, poi.lng]}
            zIndexOffset={isSelected ? 9999 : isHovered ? 9000 : 50}
            icon={createMindtripMarkerIcon(isSelected, isHovered, poi, offset, showLabel)}
            eventHandlers={{
              click: () => onSelectPoi(poi.id),
              mouseover: () => onHoverMapPin(poi.id),
              mouseout: () => onHoverMapPin(null),
            }}
          />
        );
      })}
    </>
  );
}

export default function PoiMap({
  pois,
  selectedPoiId,
  hoveredPoiId,
  onSelectPoi,
  isExpanded = false,
  onToggleExpand,
  favorites,
  onToggleFavorite,
  addedTrips,
  onToggleAddTrip,
}: PoiMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const [hoveredMapPinId, setHoveredMapPinId] = useState<string | null>(null);

  // Chỉ hiện Card xem trước khi con chuột rê trực tiếp lên Marker trên bản đồ (hover)
  const pinToPreview = pois.find((p) => p.id === hoveredMapPinId) || null;

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#f4f2ee] rounded-[22px] [transform:translateZ(0)]">
      <style>{`
        .leaflet-container {
          background-color: #f2ede5 !important;
          outline: none !important;
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

      {/* Dịch tâm bản đồ xuống 15% (16.0590, 108.2230) và zoom thêm 1 mức (zoom=15) để ghim dồn vào giữa khung */}
      <MapContainer
        center={[16.0590, 108.2230]}
        zoom={15}
        minZoom={7}
        maxZoom={18}
        zoomControl={false}
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
        />

        <DynamicMarkersLayer
          pois={pois}
          selectedPoiId={selectedPoiId}
          hoveredPoiId={hoveredPoiId || hoveredMapPinId}
          onSelectPoi={onSelectPoi}
          onHoverMapPin={setHoveredMapPinId}
        />

        {/* Card xem trước khi rê chuột (hover) hoặc chọn ghim trên bản đồ */}
        {pinToPreview && (
          <FloatingDetailCard 
            poi={pinToPreview}
            onClick={() => onSelectPoi(pinToPreview.id)}
            onHoverPoi={setHoveredMapPinId}
            isFavorite={favorites?.has(pinToPreview.id)}
            onToggleFavorite={onToggleFavorite}
            isAdded={addedTrips?.has(pinToPreview.id)}
            onToggleAddTrip={onToggleAddTrip}
          />
        )}
      </MapContainer>
    </div>
  );
}
