const fs = require('fs');
let html = fs.readFileSync('code_copy.txt', 'utf8');

// Convert class=" to className="
html = html.replace(/class="/g, 'className="');
// Convert viewbox to viewBox
html = html.replace(/viewbox="/g, 'viewBox="');
// Self-close standard HTML tags
html = html.replace(/<img([^>]*)>/g, '<img$1/>');
html = html.replace(/<input([^>]*)>/g, '<input$1/>');

// Extract LeftSidebar
const sidebarMatch = html.match(/(<aside[\s\S]*?<\/aside>)/);
let sidebarHtml = sidebarMatch ? sidebarMatch[1] : '';

// Replace the logo in sidebarHtml with the GreenTrip logo
// We'll replace the SVG and "mindtrip." text with the <Logo /> component, but since it's HTML string, we will embed <Logo size="md" /> directly.
sidebarHtml = sidebarHtml.replace(/<svg[\s\S]*?<\/svg>\s*<span[^>]*>mindtrip\.<\/span>/, '<Logo size="md" />');

// Extract MiddleContentList
const mainMatch = html.match(/(<main[\s\S]*?<\/main>)/);
let mainHtml = mainMatch ? mainMatch[1] : '';

// Convert internal comments to JSX comments
sidebarHtml = sidebarHtml.replace(/<!--(.*?)-->/g, '{/* $1 */}');
mainHtml = mainHtml.replace(/<!--(.*?)-->/g, '{/* $1 */}');

// The layout in ExplorePage.tsx needs to have:
// <div className="flex h-screen overflow-hidden font-sans bg-white">
//   {sidebarHtml}
//   {mainHtml}
//   <div className="flex-1 relative"> <PoiMap ... /> </div>
// </div>

let f = fs.readFileSync('src/pages/ExplorePage.tsx', 'utf8');

// I'll replace the whole return statement of ExplorePage with the new one
const returnRegex = /return \([\s\S]*?\n  \);\n}/;

const newReturn = `return (
    <div className="flex h-screen overflow-hidden font-sans bg-white">
      {/* 1. LEFT SIDEBAR */}
      ${sidebarHtml}

      {/* 2. MIDDLE LIST (EXPLORE) */}
      ${mainHtml}

      {/* 3. RIGHT MAP */}
      <div className="flex-1 relative">
        <PoiMap
          pois={filteredPois}
          selectedPoiId={selectedPoiId}
          hoveredPoiId={hoveredPoiId}
          onSelectPoi={handleSelectPoi}
          onHoverPoi={setHoveredPoiId}
        />
        
        {/* Map Header Overlay (Optional, matches Mindtrip's aesthetic) */}
        <div className="absolute top-4 left-4 z-10 flex gap-2">
          <button className="w-10 h-10 rounded-full bg-white shadow-md flex items-center justify-center hover:bg-gray-50 transition-colors">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-black"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          </button>
        </div>
      </div>
    </div>
  );
}`;

f = f.replace(returnRegex, newReturn);
fs.writeFileSync('src/pages/ExplorePage.tsx', f, 'utf8');
