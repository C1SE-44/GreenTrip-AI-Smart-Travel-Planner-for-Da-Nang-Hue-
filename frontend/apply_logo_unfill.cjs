const fs = require('fs');
let f = fs.readFileSync('src/components/ui/Logo.tsx', 'utf8');

// Remove fill-black
f = f.replace('className="text-black fill-black"', 'className="text-black"');

fs.writeFileSync('src/components/ui/Logo.tsx', f, 'utf8');
