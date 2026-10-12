const fs = require('fs');

let f = fs.readFileSync('src/pages/LandingPage.tsx', 'utf8');

// 1. Root div
f = f.replace(
  '<div className="flex min-h-screen flex-col bg-[#F5F5F7]">',
  '<div className="flex min-h-screen flex-col bg-white">'
);

// 2. Hero section
f = f.replace(
  '<section className="relative flex min-h-screen flex-col items-center justify-end overflow-hidden pb-12 text-center bg-[#F5F5F7]">',
  '<section className="relative flex min-h-screen flex-col items-center justify-end overflow-hidden pb-12 text-center bg-white">'
);

// 3. Hero gradient
f = f.replace(
  'bg-gradient-to-t from-[#F5F5F7] via-[#F5F5F7]/90',
  'bg-gradient-to-t from-white via-white/90'
);

// 4. Ensure Grid features gradient stays F5F5F7 (it is currently from-[#F5F5F7] to-[#EAEAEF])
// No change needed for this one.

fs.writeFileSync('src/pages/LandingPage.tsx', f, 'utf8');
