const fs = require('fs');

let html = fs.readFileSync('code_copy.txt', 'utf8');

// Convert class=" to className="
html = html.replace(/class="/g, 'className="');
html = html.replace(/viewbox="/g, 'viewBox="');
html = html.replace(/<img([^>]*)>/g, '<img$1/>');
html = html.replace(/<input([^>]*)>/g, '<input$1/>');
html = html.replace(/<!--(.*?)-->/g, '{/* $1 */}');

// Extract LeftSidebar
const sidebarMatch = html.match(/(<aside[\s\S]*?<\/aside>)/);
let sidebarHtml = sidebarMatch ? sidebarMatch[1] : '';
// Replace Logo
sidebarHtml = sidebarHtml.replace(/<svg[\s\S]*?<\/svg>\s*<span[^>]*>mindtrip\.<\/span>/, '<Logo size="md" />');

// For the main section, we want the <main> opening tag and everything up to the <div class="grid..."> which contains the cards.
// We will replace the cards with our dynamic <PoiCard />.
let mainMatch = html.match(/(<main[\s\S]*?)<div className="grid/);
let mainHeaderHtml = mainMatch ? mainMatch[1] : '';
mainHeaderHtml = mainHeaderHtml.replace(/<main/, '<main className="w-[620px] shrink-0 h-full flex flex-col bg-white overflow-hidden border-r border-gray-100"'); // Ensure strict width

// Create a new return statement for ExplorePage.tsx
let f = fs.readFileSync('src/pages/ExplorePage.tsx', 'utf8');

const returnRegex = /return \([\s\S]*?\n  \);\n}/;

const newReturn = `return (
    <div className="flex h-screen overflow-hidden font-sans bg-white">
      {/* 1. LEFT SIDEBAR */}
      ${sidebarHtml}

      {/* 2. MIDDLE LIST (EXPLORE) */}
      ${mainHeaderHtml}
        <div className="grid grid-cols-2 gap-4 pb-12">
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => <PoiCardSkeleton key={i} />)
          ) : filteredPois.length === 0 ? (
            <EmptyState />
          ) : (
            filteredPois.map((poi) => (
              <div key={poi.id} data-poi-id={poi.id}>
                <PoiCard
                  poi={poi}
                  active={poi.id === selectedPoiId}
                  favorite={favorites.has(poi.id)}
                  onClick={() => handleSelectPoi(poi.id)}
                  onHover={setHoveredPoiId}
                  onToggleFavorite={toggleFavorite}
                />
              </div>
            ))
          )}
        </div>
        </div>
      </main>

      {/* 3. RIGHT MAP */}
      <div className="flex-1 relative h-full overflow-hidden">
        <PoiMap
          pois={filteredPois}
          selectedPoiId={selectedPoiId}
          hoveredPoiId={hoveredPoiId}
          onSelectPoi={handleSelectPoi}
          onHoverPoi={setHoveredPoiId}
        />
        
        {/* Top left button over map */}
        <div className="absolute top-4 left-4 z-[400]">
          <button className="w-9 h-9 rounded-full bg-white shadow-md border border-gray-200 flex items-center justify-center text-gray-700 hover:bg-gray-50 transition">
            <i className="ph ph-arrow-line-left text-base font-bold"></i>
          </button>
        </div>
      </div>
    </div>
  );
}`;

f = f.replace(returnRegex, newReturn);

// Also replace PoiCard to match the HTML EXACTLY
const poiCardRegex = /function PoiCard\([\s\S]*?<\/article>\n  \);\n}/;
const newPoiCard = `function PoiCard({
  poi,
  active = false,
  favorite = false,
  onClick,
  onHover,
  onToggleFavorite,
}: {
  poi: any;
  active?: boolean;
  favorite?: boolean;
  onClick: () => void;
  onHover: (id: string | null) => void;
  onToggleFavorite: (id: string) => void;
}) {
  return (
    <article
      onClick={onClick}
      onMouseEnter={() => onHover(poi.id)}
      onMouseLeave={() => onHover(null)}
      className="flex flex-col group cursor-pointer pt-3"
    >
      <div className={\`relative w-full aspect-[4/3] rounded-2xl overflow-hidden bg-gray-100 shadow-sm transition-all \${active ? 'ring-2 ring-black' : ''}\`}>
        <img src={poi.image} alt={poi.name} className="w-full h-full object-cover group-hover:scale-105 transition duration-500"/>
        
        <div className="absolute top-3 right-3 flex items-center gap-2">
          <button 
            onClick={(e) => { e.stopPropagation(); onToggleFavorite(poi.id); }}
            className="w-8 h-8 rounded-full bg-black/40 backdrop-blur-md text-white flex items-center justify-center hover:bg-black/60 transition"
          >
            <i className={\`ph \${favorite ? 'ph-fill ph-heart text-red-500' : 'ph-heart'} text-sm\`}></i>
          </button>
          <button className="w-8 h-8 rounded-full bg-black/40 backdrop-blur-md text-white flex items-center justify-center hover:bg-black/60 transition">
            <i className="ph ph-plus text-sm"></i>
          </button>
        </div>

        <div className="absolute bottom-2.5 inset-x-0 px-3 flex items-center justify-between">
          <div className="flex-1 flex justify-center items-center gap-1 pl-4">
            <div className="w-1.5 h-1.5 rounded-full bg-white shadow-sm"></div>
            <div className="w-1.5 h-1.5 rounded-full bg-white/50 shadow-sm"></div>
            <div className="w-1.5 h-1.5 rounded-full bg-white/50 shadow-sm"></div>
            <div className="w-1.5 h-1.5 rounded-full bg-white/50 shadow-sm"></div>
          </div>
          <button className="w-5 h-5 rounded-full bg-black/40 backdrop-blur-md text-white flex items-center justify-center hover:bg-black/60 transition">
            <i className="ph ph-info text-[10px]"></i>
          </button>
        </div>
      </div>
      
      <div className="mt-2.5 space-y-0.5">
        <h2 className="font-bold text-sm text-gray-900 tracking-tight truncate">{poi.name}</h2>
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-500 flex items-center gap-1">
            <i className="ph ph-building text-gray-400"></i>
            {categoryLabels[poi.category as keyof typeof categoryLabels]}
          </p>
          <div className="flex items-center gap-1">
            <i className="ph-fill ph-star text-black text-xs"></i>
            <span className="text-xs font-bold text-gray-900">{poi.rating.toFixed(1)}</span>
            <span className="text-[10px] text-gray-400">(1.2k)</span>
          </div>
        </div>
        <p className="text-xs text-gray-400 truncate">{poi.city}</p>
        
        <div className="flex items-center gap-1 mt-1">
          <div className="flex -space-x-1">
            <img className="w-4 h-4 rounded-full border border-white" src="https://i.pravatar.cc/100?img=1" />
            <img className="w-4 h-4 rounded-full border border-white" src="https://i.pravatar.cc/100?img=2" />
          </div>
          <span className="text-[10px] text-gray-500 ml-1">Đề xuất bởi 12 người</span>
        </div>
      </div>
    </article>
  );
}`;

f = f.replace(poiCardRegex, newPoiCard);

// Clean up SVG tag closures inside React (like fill-rule -> fillRule) in the new code if any
f = f.replace(/fill-rule/g, 'fillRule');
f = f.replace(/clip-rule/g, 'clipRule');

fs.writeFileSync('src/pages/ExplorePage.tsx', f, 'utf8');
