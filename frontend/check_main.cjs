const fs = require('fs');
const code = fs.readFileSync('src/pages/ExplorePage.tsx', 'utf8');
const main = code.substring(code.indexOf('<main'), code.indexOf('<div className="grid'));
console.log('div', main.match(/<div/g)?.length, main.match(/<\/div>/g)?.length);
console.log('header', main.match(/<header/g)?.length, main.match(/<\/header>/g)?.length);
