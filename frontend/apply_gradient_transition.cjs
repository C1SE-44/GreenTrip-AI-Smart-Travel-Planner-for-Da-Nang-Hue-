const fs = require('fs');

let f = fs.readFileSync('src/pages/LandingPage.tsx', 'utf8');

f = f.replace(
  'bg-gradient-to-b from-[#F5F5F7] to-[#EAEAEF] rounded-b-[40px]',
  'bg-gradient-to-b from-white via-[#F5F5F7] via-15% to-[#EAEAEF] rounded-b-[40px]'
);

fs.writeFileSync('src/pages/LandingPage.tsx', f, 'utf8');
