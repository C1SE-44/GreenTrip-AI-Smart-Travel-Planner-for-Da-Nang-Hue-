const fs = require('fs');
const file = 'd:/ĐỒ ÁN/Green Trip/src/pages/LandingPage.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1 & 2. Fix the wrapper's border radius and padding
content = content.replace(
    /<div className="bg-gradient-to-b from-cream to-\[#f4f5f7\] rounded-b-\[40px\] lg:rounded-b-\[80px\] relative z-20 pb-32">/g,
    '<div className="bg-gradient-to-b from-cream to-[#f4f5f7] rounded-b-[60px] lg:rounded-b-[140px] relative z-20 pb-[250px]">'
);

// 3. Remove the straight line from the Carousel section
content = content.replace(
    /\{(\/\*\s*4\. DESTINATIONS CAROUSEL\s*\*\/)\}\s*<section className="px-4 py-20 md:px-8 bg-cream border-t border-beige\/50">/g,
    '{$1}\n        <section className="px-4 py-20 md:px-8 bg-cream">'
);

fs.writeFileSync(file, content);
console.log('Fixed rounded borders, padding, and removed straight line');
