const fs = require('fs');
const file = 'd:/ĐỒ ÁN/Green Trip/src/pages/LandingPage.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace('https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&q=80', 'https://images.unsplash.com/photo-1580837119756-563d608ca11a?auto=format&fit=crop&q=80');
content = content.replace('https://images.unsplash.com/photo-1506012787146-f92b2d7d6d96?auto=format&fit=crop&q=80', 'https://images.unsplash.com/photo-1555921015-c262060f64be?auto=format&fit=crop&q=80');
content = content.replace('Cầu Rồng', 'Phố Cổ');
content = content.replace('Đà Nẵng</div>', 'Hội An</div>');

fs.writeFileSync(file, content);
console.log('Fixed URLs');
