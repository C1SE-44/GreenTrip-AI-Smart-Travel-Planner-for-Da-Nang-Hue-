const fs = require('fs');

let f = fs.readFileSync('src/pages/LandingPage.tsx', 'utf8');

f = f.replace(
  'max-w-[1400px] overflow-hidden rounded-[40px] text-white text-center flex flex-col justify-center min-h-[560px]',
  'max-w-[1260px] overflow-hidden rounded-[40px] text-white text-center flex flex-col justify-center min-h-[680px]'
);

fs.writeFileSync('src/pages/LandingPage.tsx', f, 'utf8');
