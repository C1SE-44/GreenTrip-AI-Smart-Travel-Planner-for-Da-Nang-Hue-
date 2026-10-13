const fs = require('fs');
const file = 'd:/ĐỒ ÁN/Green Trip/src/pages/LandingPage.tsx';
let content = fs.readFileSync(file, 'utf8');

// Replace the gradient and border radius
content = content.replace(
    /to-\[#f4f5f7\] rounded-b-\[60px\] lg:rounded-b-\[140px\]/g,
    'to-[#dce0e5] rounded-b-[40px] lg:rounded-b-[80px]'
);

fs.writeFileSync(file, content);
console.log('Fixed gradient and border radius');
