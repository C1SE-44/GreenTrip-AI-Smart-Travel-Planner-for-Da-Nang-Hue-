const fs = require('fs');

let f = fs.readFileSync('src/pages/LandingPage.tsx', 'utf8');

f = f.replace(
  'div className="mb-8 text-left flex flex-col items-start"',
  'div className="mb-10 text-left flex flex-col items-start"'
);

f = f.replace(
  'z-20 pb-[150px]',
  'z-20 pb-[200px]'
);

fs.writeFileSync('src/pages/LandingPage.tsx', f, 'utf8');
