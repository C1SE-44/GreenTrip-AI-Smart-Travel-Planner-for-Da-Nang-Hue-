const fs = require('fs');
let f = fs.readFileSync('src/pages/ExplorePage.tsx', 'utf8');

// 1. Add Link import
if (!f.includes('import { Link }')) {
  f = f.replace("import { useState", "import { Link } from 'react-router-dom';\nimport { useState");
}

// 2. Change sidebar width from w-[240px] to w-[190px] and px-4 to px-2
f = f.replace(
  'w-[240px] flex-shrink-0 border-r border-gray-100 flex flex-col justify-between py-6 px-4',
  'w-[190px] flex-shrink-0 border-r border-gray-100 flex flex-col justify-between py-6 px-2'
);

// 3. Replace the logo with the exact GreenTrip logo
const oldLogo = `<div className="flex items-center gap-2 mb-10 px-2">
            <Sparkles size={24} className="text-black fill-black" />
            <span className="text-xl font-bold tracking-tight text-black">greentrip.</span>
          </div>`;
          
const newLogo = `<Link to="/" className="flex items-center gap-2 mb-10 px-2 transition-opacity hover:opacity-80">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-forest-900">
              <Leaf size={16} strokeWidth={2.5} className="text-[#FDFBF7]" />
            </div>
            <span className="font-display text-xl font-bold tracking-tight text-[#2D332F]">
              greentrip
            </span>
          </Link>`;
          
f = f.replace(oldLogo, newLogo);

// 4. Increase middle section width
f = f.replace(
  'w-[45%] lg:w-[40%] xl:w-[35%] flex-shrink-0 border-r border-gray-200 flex flex-col bg-white overflow-y-auto',
  'w-[60%] lg:w-[55%] xl:w-[50%] flex-shrink-0 border-r border-gray-200 flex flex-col bg-white overflow-y-auto'
);

fs.writeFileSync('src/pages/ExplorePage.tsx', f, 'utf8');
