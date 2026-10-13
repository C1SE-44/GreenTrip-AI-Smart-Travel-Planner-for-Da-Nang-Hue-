const fs = require('fs');
let f = fs.readFileSync('src/components/auth/OnboardingModal.tsx', 'utf8');
f = f.replace(/\\\\`/g, '`');
f = f.replace(/\\\\\\$/g, '$');
fs.writeFileSync('src/components/auth/OnboardingModal.tsx', f, 'utf8');
