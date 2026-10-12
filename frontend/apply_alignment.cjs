const fs = require('fs');

let f = fs.readFileSync('src/pages/LandingPage.tsx', 'utf8');

// The section uses max-w-[1400px]
f = f.replace(
  'mx-auto max-w-[1400px]',
  'mx-auto max-w-[1200px]'
);

fs.writeFileSync('src/pages/LandingPage.tsx', f, 'utf8');
