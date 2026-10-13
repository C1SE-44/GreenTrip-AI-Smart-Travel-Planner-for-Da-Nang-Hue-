const fs = require('fs');
let f = fs.readFileSync('src/components/auth/OnboardingModal.tsx', 'utf8');
f = f.replace('scrollRef.current.scrollTo(0, 0);', 'scrollRef.current.scrollTop = 0;');
fs.writeFileSync('src/components/auth/OnboardingModal.tsx', f, 'utf8');
