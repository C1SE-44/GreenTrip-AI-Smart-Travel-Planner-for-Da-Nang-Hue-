const fs = require('fs');
const file = 'd:/ĐỒ ÁN/Green Trip/src/pages/LandingPage.tsx';
let content = fs.readFileSync(file, 'utf8');

// Rule 1: Widget chat messages (text-[13px] font-medium text-gray-800) → font-bold (these are labels, not captions)
content = content.replace(/text-\[13px\] font-medium text-gray-800/g, 'text-[13px] font-bold text-gray-800');

// Rule 2: Widget sub-labels (font-medium text-gray-400, font-medium text-gray-500, font-medium text-green-600) → font-light
content = content.replace(/text-\[10px\] text-gray-400 font-medium/g, 'text-[10px] text-gray-400 font-light');
content = content.replace(/text-\[10px\] text-green-600 font-semibold/g, 'text-[10px] text-green-600 font-light');
content = content.replace(/text-\[10px\] text-gray-500 font-medium/g, 'text-[10px] text-gray-500 font-light');

// Rule 3: Section subtitle (text-xl text-gray-500 max-w-3xl) — already no font class, add font-light
content = content.replace(/<p className="mt-6 text-xl text-gray-500 max-w-3xl">/g, '<p className="mt-6 text-xl font-light text-gray-500 max-w-3xl">');

// Rule 4: Destinations section subtitle
content = content.replace(/<p className="mt-6 text-lg text-muted max-w-3xl mb-12">/g, '<p className="mt-6 text-lg font-light text-muted max-w-3xl mb-12">');

fs.writeFileSync(file, content);
console.log('Fixed all font weights in LandingPage');
