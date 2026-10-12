const fs = require('fs');
let f = fs.readFileSync('src/pages/ExplorePage.tsx', 'utf8');

f = f.replace(
  'w-full flex items-center justify-between px-4 py-2 rounded-xl transition-colors',
  'w-full flex items-center justify-between px-2 py-2 rounded-xl transition-colors'
);

fs.writeFileSync('src/pages/ExplorePage.tsx', f, 'utf8');
