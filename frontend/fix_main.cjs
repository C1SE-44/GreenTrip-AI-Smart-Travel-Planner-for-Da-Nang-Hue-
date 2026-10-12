const fs = require('fs');
let f = fs.readFileSync('src/pages/ExplorePage.tsx', 'utf8');

f = f.replace(
  /<main className="w-\[620px\] shrink-0 h-full flex flex-col bg-white overflow-hidden border-r border-gray-100" className="[^"]*" data-purpose="content-list-stream">/,
  '<main className="w-[620px] shrink-0 h-full flex flex-col bg-white overflow-hidden border-r border-gray-100" data-purpose="content-list-stream">'
);

fs.writeFileSync('src/pages/ExplorePage.tsx', f, 'utf8');
