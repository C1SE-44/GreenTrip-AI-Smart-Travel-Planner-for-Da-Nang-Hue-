import { useState, useRef, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { Poi } from '@/data/pois';
import { categoryLabels } from '@/data/pois';

interface PoiMapProps {
  pois: Poi[];
  selectedPoiId: string | null;
  hoveredPoiId: string | null;
  onSelectPoi: (id: string | null) => void;
  onHoverPoi: (id: string | null) => void;
}

interface MarkerOffset {
  yOffset: number;
  isLeft: boolean;
}

// Marker Pin với hiệu ứng chuyển màu ĐEN khi HOVER hoặc CLICK chuẩn Mindtrip
// Luôn nằm NGANG: [Icon Tròn] ở giữa, nhãn có thể ở BÊN TRÁI hoặc BÊN PHẢI linh hoạt
function createMarkerIcon(
  isSelected: boolean,
  isHovered: boolean,
  poi: Poi,
  offset: MarkerOffset = { yOffset: 0, isLeft: false }
): L.DivIcon {
  const isHighlighted = isSelected || isHovered;

  // Nút tròn: Luôn cố định tâm chính xác tại tọa độ (0, 0)
  const pinHtml = `
    <div class="map-marker-pin absolute -left-[13px] -top-[13px] w-[26px] h-[26px] rounded-full ${
      isHighlighted 
        ? 'bg-black text-white shadow-xl ring-2 ring-black/20 scale-105' 
        : 'bg-white text-zinc-900'
    } shadow-[0_2px_5px_rgba(0,0,0,0.18)] border ${
      isHighlighted ? 'border-black' : 'border-zinc-200'
    } flex items-center justify-center shrink-0 transition-all duration-150">
      <svg class="w-3 h-3 ${isHighlighted ? 'text-white' : 'text-zinc-800'}" fill="currentColor" viewBox="0 0 24 24">
        <path d="M11 9H9V2H7v7H5V2H3v7c0 2.12 1.66 3.84 3.75 3.97V22h2.5v-9.03C11.34 12.84 13 11.12 13 9V2h-2v7zm5-3v8h2.5v8H21V2c-2.76 0-5 2.24-5 4z"></path>
      </svg>
    </div>
  `;

  // Thẻ chữ nằm ngang: Có thể ở BÊN TRÁI (right-[17px]) hoặc BÊN PHẢI (left-[17px])
  const labelPosition = offset.isLeft ? 'right-[17px]' : 'left-[17px]';

  // Thẻ chữ CHỈ xuất hiện khi Hover hoặc Chọn (chuẩn Mindtrip/Google Maps, xóa hoàn toàn tag rối mắt)
  const labelHtml = isHighlighted ? `
    <div class="map-marker-label absolute ${labelPosition} -top-[12px] bg-neutral-900 text-white border-neutral-900 shadow-xl font-bold z-50 backdrop-blur-[2px] px-2.5 py-1 rounded-md border transition-all duration-150 max-w-[175px] pointer-events-auto">
      <span class="text-[11px] leading-none whitespace-nowrap truncate block text-white font-bold">
        ${poi.cleanName || poi.name}
      </span>
    </div>
  ` : '';

  const transformStyle = offset.yOffset !== 0 ? `transform: translateY(${offset.yOffset}px);` : '';

  const contentHtml = `
    <div class="relative cursor-pointer select-none ${
      isHighlighted ? 'z-50' : 'z-20'
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

function FloatingDetailCard({ 
  poi, 
  onClick,
  onHoverPoi,
}: { 
  poi: Poi; 
  onClick?: () => void;
  onHoverPoi?: (id: string | null) => void;
}) {
  const map = useMap();
  const [coords, setCoords] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    const updatePosition = () => {
      const pt = map.latLngToContainerPoint([poi.lat, poi.lng]);
      const mapSize = map.getSize();
      
      // Tính toán vị trí hiển thị card cạnh marker một cách thông minh
      const placeLeft = pt.x > mapSize.x - 330;
      const left = placeLeft ? Math.max(16, pt.x - 315) : Math.min(mapSize.x - 310, pt.x + 25);
      const top = Math.max(16, Math.min(mapSize.y - 370, pt.y - 120));
      
      setCoords({ left, top });
    };

    updatePosition();
    map.on('move', updatePosition);
    map.on('zoom', updatePosition);
    return () => {
      map.off('move', updatePosition);
      map.off('zoom', updatePosition);
    };
  }, [poi, map]);

  if (!coords) return null;

  return (
    <div 
      onClick={onClick}
      onMouseEnter={() => onHoverPoi?.(poi.id)}
      onMouseLeave={() => onHoverPoi?.(null)}
      className="absolute z-[1000] w-[295px] bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden pointer-events-auto transition-opacity duration-150 animate-fadeIn cursor-pointer"
      style={{ left: `${coords.left}px`, top: `${coords.top}px` }}
    >
      {/* Card Carousel Hero Image */}
      <div className="relative w-full h-44 bg-gray-900 group">
        <img 
          alt={poi.name} 
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" 
          src={poi.image}
        />
        
        {/* Card Action Icons */}
        <div className="absolute top-3 right-3 flex items-center gap-1.5">
          <button 
            onClick={(e) => { e.stopPropagation(); }}
            className="w-7 h-7 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white hover:bg-black/60 transition"
          >
            <i className="ph ph-heart text-sm"></i>
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); }}
            className="w-7 h-7 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white hover:bg-black/60 transition"
          >
            <i className="ph ph-plus text-sm"></i>
          </button>
        </div>

        {/* Category Pill Tag */}
        <div className="absolute bottom-3 left-3">
          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase bg-black/60 text-white backdrop-blur-md shadow-sm">
            {categoryLabels[poi.category] || 'Địa điểm'}
          </span>
        </div>
      </div>

      {/* Card Body Content */}
      <div className="p-4">
        <h3 className="text-sm font-bold text-gray-900 leading-snug line-clamp-1">{poi.name}</h3>

        {/* Subtitle info */}
        <div className="flex items-center gap-1 text-xs text-gray-500 mt-1 font-medium">
          <i className="ph ph-map-pin text-xs text-gray-400"></i>
          <span>{poi.city}, Việt Nam</span>
        </div>

        {/* Description snippet */}
        <p className="text-xs text-gray-600 mt-2 leading-relaxed line-clamp-2">
          {poi.description}
        </p>

        {/* Action Link */}
        <div className="text-[11px] text-gray-500 mt-2.5 font-medium flex items-center justify-end border-t border-gray-100 pt-2">
          <span className="text-xs font-semibold text-black hover:underline">Chi tiết →</span>
        </div>
      </div>
    </div>
  );
}

function FitBounds({ pois }: { pois: Poi[] }) {
  const map = useMap();
  const initialFitRef = useRef(false);

  useEffect(() => {
    if (pois.length === 0 || initialFitRef.current) return;
    const bounds = L.latLngBounds(pois.map((p) => [p.lat, p.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [50, 50], animate: false });
    initialFitRef.current = true;
  }, [pois, map]);
  return null;
}

// Giữ cho map luôn cập nhật đúng kích thước khi cửa sổ hoặc panel co giãn
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

// Cụm điều khiển Floating Controls - Cố định luôn ở đầu bản đồ và không bao giờ bị biến mất khi đổi kích thước
function MapControlsLayer() {
  const map = useMap();

  return (
    <>
      {/* 0. Collapse map button (Top Left) */}
      <button 
        aria-label="Collapse map" 
        onClick={() => map.invalidateSize()}
        className="map-floating-btn absolute top-4 left-4 w-10 h-10 bg-white rounded-full flex items-center justify-center text-zinc-700 hover:text-black z-[1000] transition cursor-pointer shadow-md"
      >
        <svg className="w-5 h-5 stroke-[2.2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M10 19l-7-7m0 0l7-7m-7 7h18" strokeLinecap="round" strokeLinejoin="round"></path>
        </svg>
      </button>

      {/* 1. Explore this area Pill (Top Center) - Cố định ở đầu map */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] pointer-events-auto">
        <button 
          onClick={() => map.invalidateSize()}
          className="flex items-center space-x-2 bg-black text-white hover:bg-zinc-800 py-2.5 px-5 rounded-full shadow-lg transition active:scale-95 cursor-pointer whitespace-nowrap"
        >
          <svg className="w-4 h-4 text-white stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" strokeLinecap="round" strokeLinejoin="round"></path>
          </svg>
          <span className="text-xs font-bold tracking-wide">Explore this area</span>
        </button>
      </div>

      {/* 2. Visibility / Eye Toggle (Top Right) */}
      <button 
        aria-label="Toggle visible items"
        className="map-floating-btn absolute top-4 right-4 w-10 h-10 bg-white rounded-full flex items-center justify-center text-zinc-700 hover:text-black z-[1000] transition cursor-pointer shadow-md"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" strokeLinecap="round" strokeLinejoin="round"></path>
          <path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" strokeLinecap="round" strokeLinejoin="round"></path>
        </svg>
      </button>

      {/* 3. Right Toolbar Layer */}
      <div className="absolute right-4 bottom-14 flex flex-col space-y-2 z-[1000]">
        <button 
          onClick={() => map.flyTo([16.0544, 108.2422], 12, { duration: 0.8 })}
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

      {/* 4. Weather Widget */}
      <div className="absolute bottom-6 left-4 z-[1000] pointer-events-auto">
        <div className="flex items-center space-x-1.5 px-3 py-1.5 bg-white/95 backdrop-blur-md rounded-full shadow-sm border border-zinc-200/80 text-xs font-semibold text-zinc-800">
          <span>🌤️</span>
          <span>81°F</span>
          <span className="font-normal text-zinc-600">Light rain</span>
        </div>
      </div>

      {/* 5. Google Maps Footer */}
      <footer className="absolute bottom-0 left-0 right-0 h-6 bg-white/60 backdrop-blur-[2px] flex items-center justify-between px-3 text-[10px] text-zinc-600 z-[1000] pointer-events-none">
        <div className="pointer-events-auto">
          <span className="font-medium tracking-tight text-zinc-700">Google</span>
        </div>
        <div className="flex items-center space-x-3 pointer-events-auto select-none">
          <button className="hover:underline">Keyboard shortcuts</button>
          <span>Map Data ©2026</span>
          <div className="flex items-center space-x-1">
            <div className="w-12 h-1 border-b-2 border-l border-r border-zinc-700"></div>
            <span>1 km</span>
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
  hoveredMapPinId,
  onSelectPoi,
  onHoverMapPin,
}: {
  pois: Poi[];
  selectedPoiId: string | null;
  hoveredPoiId: string | null;
  hoveredMapPinId: string | null;
  onSelectPoi: (id: string) => void;
  onHoverMapPin: (id: string | null) => void;
}) {
  const map = useMap();
  const [offsets, setOffsets] = useState<Record<string, MarkerOffset>>({});

  const computeOffsets = useCallback(() => {
    if (!map) return;
    try {
      const mapSize = map.getSize();
      if (!mapSize || mapSize.x === 0 || mapSize.y === 0) return;

      const result: Record<string, MarkerOffset> = {};

      // Khởi tạo mặc định: nằm ngang bình thường (yOffset = 0, isLeft = false)
      pois.forEach((p) => {
        result[p.id] = { yOffset: 0, isLeft: false };
      });

      // Lấy tọa độ pixel màn hình hiện tại của từng địa điểm
      const screenPoints = pois.map((poi) => {
        const pt = map.latLngToContainerPoint([poi.lat, poi.lng]);
        return { poi, x: pt.x, y: pt.y };
      });

      // Sắp xếp theo chiều dọc Y
      screenPoints.sort((a, b) => a.y - b.y);

      // Kiểm tra mép màn hình trước
      screenPoints.forEach((p) => {
        if (p.x > mapSize.x - 170) {
          result[p.poi.id].isLeft = true;
        }
      });

      // Kiểm tra va chạm giữa các cặp điểm
      for (let i = 0; i < screenPoints.length; i++) {
        for (let j = i + 1; j < screenPoints.length; j++) {
          const p1 = screenPoints[i];
          const p2 = screenPoints[j];
          const dx = Math.abs(p1.x - p2.x);
          const dy = Math.abs(p1.y - p2.y);

          // Khi 2 địa điểm gần nhau trong không gian màn hình (dx < 150px và dy < 34px)
          if (dx < 150 && dy < 34) {
            // Cho điểm bên trái quay nhãn sang BÊN TRÁI, điểm bên phải quay nhãn sang BÊN PHẢI
            if (p1.x < p2.x) {
              result[p1.poi.id].isLeft = true;
              result[p2.poi.id].isLeft = false;
            } else {
              result[p1.poi.id].isLeft = false;
              result[p2.poi.id].isLeft = true;
            }

            // Nếu 2 điểm quá thẳng hàng dọc (dx < 50), so le thêm độ cao Y
            if (dx < 50) {
              if (p1.y < p2.y) {
                result[p1.poi.id].yOffset = -14;
                result[p2.poi.id].yOffset = 14;
              } else {
                result[p1.poi.id].yOffset = 14;
                result[p2.poi.id].yOffset = -14;
              }
            }
          }
        }
      }

      setOffsets(result);
    } catch {
      // safe fallback if map is initializing
    }
  }, [pois, map]);

  useEffect(() => {
    computeOffsets();
    map.on('zoomend', computeOffsets);
    map.on('moveend', computeOffsets);
    map.on('resize', computeOffsets);
    return () => {
      map.off('zoomend', computeOffsets);
      map.off('moveend', computeOffsets);
      map.off('resize', computeOffsets);
    };
  }, [map, computeOffsets]);

  // Tự động đưa địa điểm vào tầm nhìn nếu đang ở ngoài màn hình (như Bà Nà Hills)
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
        const isHovered = poi.id === hoveredPoiId || poi.id === hoveredMapPinId;
        const isHighlighted = isSelected || isHovered;
        const offset = offsets[poi.id] || { yOffset: 0, isLeft: false };

        return (
          <Marker
            key={`${poi.id}-${isHighlighted ? 'active' : 'idle'}-${offset.isLeft ? 'L' : 'R'}-${offset.yOffset}`}
            position={[poi.lat, poi.lng]}
            zIndexOffset={isHighlighted ? 1000 : 0}
            icon={createMarkerIcon(isSelected, isHovered, poi, offset)}
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
}: PoiMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  
  // Chỉ hiện Card chi tiết khi con chuột rê trực tiếp lên Marker trên bản đồ
  const [hoveredMapPinId, setHoveredMapPinId] = useState<string | null>(null);
  const pinToPreview = pois.find((p) => p.id === hoveredMapPinId) || null;

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#f4f2ee] rounded-[22px] [transform:translateZ(0)]">
      <style>{`
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

      <MapContainer
        center={[16.0544, 108.2422]}
        zoom={13}
        minZoom={7}
        maxZoom={18}
        zoomControl={false}
        className="h-full w-full rounded-[22px] overflow-hidden"
        ref={(m) => { if (m) mapRef.current = m; }}
        scrollWheelZoom
      >
        <TileLayer
          url="https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&apistyle=s.t:2|p.v:off,s.t:4|p.v:off"
          subdomains={['mt0', 'mt1', 'mt2', 'mt3']}
          attribution='&copy; Google Maps'
        />

        <FitBounds pois={pois} />
        <MapResizeListener />
        <MapControlsLayer />

        {/* Dynamic Markers Layer: Luôn nằm ngang, đổi màu đen khi chạm thẻ ở giữa hoặc marker */}
        <DynamicMarkersLayer
          pois={pois}
          selectedPoiId={selectedPoiId}
          hoveredPoiId={hoveredPoiId}
          hoveredMapPinId={hoveredMapPinId}
          onSelectPoi={onSelectPoi}
          onHoverMapPin={setHoveredMapPinId}
        />

        {/* Floating Detail Card CHỈ xuất hiện khi rê chuột trực tiếp vào marker trên map */}
        {pinToPreview && (
          <FloatingDetailCard 
            poi={pinToPreview} 
            onClick={() => onSelectPoi(pinToPreview.id)}
            onHoverPoi={setHoveredMapPinId}
          />
        )}
      </MapContainer>
    </div>
  );
}
