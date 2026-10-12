const fs = require('fs');
let f = fs.readFileSync('src/pages/ExplorePage.tsx', 'utf8');

// Sidebar
f = f.replace(
  'w-[190px] flex-shrink-0 border-r border-gray-100 flex flex-col justify-between py-6 px-2 z-10',
  'w-[240px] shrink-0 border-r border-gray-100 flex flex-col justify-between py-6 px-4 z-10'
);
// Also in case it doesn't have z-10 yet
f = f.replace(
  'w-[190px] flex-shrink-0 border-r border-gray-100 flex flex-col justify-between py-6 px-2',
  'w-[240px] shrink-0 border-r border-gray-100 flex flex-col justify-between py-6 px-4 z-10'
);

// Middle List
f = f.replace(
  'w-[60%] lg:w-[55%] xl:w-[50%] flex-shrink-0 border-r border-gray-200 flex flex-col bg-white overflow-y-auto',
  'w-[620px] shrink-0 border-r border-gray-200 flex flex-col bg-white overflow-y-auto'
);

// Padding of SidebarItem
f = f.replace(
  'w-full flex items-center justify-between px-2 py-2 rounded-xl transition-colors',
  'w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-colors'
);

fs.writeFileSync('src/pages/ExplorePage.tsx', f, 'utf8');
