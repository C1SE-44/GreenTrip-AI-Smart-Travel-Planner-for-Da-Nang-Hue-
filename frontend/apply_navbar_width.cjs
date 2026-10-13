const fs = require('fs');

let f = fs.readFileSync('src/components/layout/Navbar.tsx', 'utf8');

f = f.replace(
  '<nav className={`mx-auto max-w-[1400px] flex w-full items-center',
  '<nav className={`mx-auto w-full max-w-full flex items-center'
);

fs.writeFileSync('src/components/layout/Navbar.tsx', f, 'utf8');
