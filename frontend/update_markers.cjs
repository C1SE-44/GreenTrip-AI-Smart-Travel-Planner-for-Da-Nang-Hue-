const fs = require('fs');
let mapCode = fs.readFileSync('src/components/poi/PoiMap.tsx', 'utf8');

// We will change createMarkerIcon
const oldMarkerFunc = /function createMarkerIcon[\s\S]*?return L\.divIcon\({[\s\S]*?}\);[\s\S]*?}/;

const newMarkerFunc = `function createMarkerIcon(isSelected: boolean, isHovered: boolean, poi: Poi): L.DivIcon {
  const isHighlighted = isSelected || isHovered;
  
  // Style giống Mindtrip: Nền trắng, viền xám, icon/chữ đen
  const html = \`
    <div class="flex items-center gap-1.5 cursor-pointer z-10 group \${isHighlighted ? 'scale-110' : ''} transition-transform" style="margin-left: -50%; margin-top: -50%;">
      <div class="w-6 h-6 rounded-full \${isSelected ? 'bg-black text-white' : 'bg-white text-gray-700'} shadow-md flex items-center justify-center border \${isSelected ? 'border-black' : 'border-gray-200'}">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
          <circle cx="12" cy="10" r="3"></circle>
        </svg>
      </div>
      <span class="\${isSelected ? 'bg-black text-white border-black' : 'bg-white/95 text-gray-800 border-gray-100'} px-2 py-0.5 text-[11px] font-semibold rounded shadow-sm border whitespace-nowrap">
        \${poi.name}
      </span>
    </div>
  \`;
  
  return L.divIcon({
    html,
    className: '', // Tailwind classes take over
    iconSize: [0, 0], // Anchor automatically based on HTML content because we use negative margin above
    iconAnchor: [0, 0], // Let negative margin handle centering
    popupAnchor: [0, -15],
  });
}`;

mapCode = mapCode.replace(oldMarkerFunc, newMarkerFunc);

// We need to update the call from createMarkerIcon(isSelected, isHovered, poi.category) to createMarkerIcon(isSelected, isHovered, poi)
mapCode = mapCode.replace(/createMarkerIcon\(poi\.id === selectedPoiId, poi\.id === hoveredPoiId, poi\.category\)/g, 'createMarkerIcon(poi.id === selectedPoiId, poi.id === hoveredPoiId, poi)');

fs.writeFileSync('src/components/poi/PoiMap.tsx', mapCode, 'utf8');
