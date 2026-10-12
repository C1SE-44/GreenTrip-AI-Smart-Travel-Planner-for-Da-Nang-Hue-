const fs = require('fs');

let f = fs.readFileSync('src/pages/LandingPage.tsx', 'utf8');

// 1. Reduce distance between 4 cards and text above
f = f.replace(
  'div className="mb-16 text-left flex flex-col items-start"',
  'div className="mb-8 text-left flex flex-col items-start"'
);

// 2. Reduce distance from bottom of cards to the gray background end
// Currently: className="bg-gradient-to-b from-cream to-[#dce0e5] rounded-b-[40px] lg:rounded-b-[80px] relative z-20 pb-[250px]"
f = f.replace(
  'z-20 pb-[250px]',
  'z-20 pb-[150px]'
);

// 3. Fix Card 4 graphics overlapping text
// Change: className="absolute bottom-2 left-4 right-4 h-32 flex items-center justify-start pointer-events-none"
f = f.replace(
  'absolute bottom-2 left-4 right-4 h-32',
  'absolute -bottom-10 left-4 right-4 h-32'
);

fs.writeFileSync('src/pages/LandingPage.tsx', f, 'utf8');
