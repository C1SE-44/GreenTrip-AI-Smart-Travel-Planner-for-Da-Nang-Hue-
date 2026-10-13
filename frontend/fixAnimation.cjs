const fs = require('fs');
const file = 'd:/ĐỒ ÁN/Green Trip/src/components/auth/LoginModal.tsx';
let content = fs.readFileSync(file, 'utf8');
content = content.replace('animate-scaleUp', 'animate-fadeInScale');
fs.writeFileSync(file, content);
