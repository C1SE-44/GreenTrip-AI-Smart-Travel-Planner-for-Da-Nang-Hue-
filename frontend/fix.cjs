const fs = require('fs');
let f = fs.readFileSync('src/components/auth/OnboardingModal.tsx', 'utf8');
f = f.replace('\\n{/* WHO MODAL POPUP */}', '{/* WHO MODAL POPUP */}');
fs.writeFileSync('src/components/auth/OnboardingModal.tsx', f, 'utf8');
