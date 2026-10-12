const fs = require('fs');
let f = fs.readFileSync('src/pages/ExplorePage.tsx', 'utf8');

// Fix //>
f = f.replace(/\/\/>/g, '/>');

// Check for other common HTML to JSX issues
f = f.replace(/stroke-width/g, 'strokeWidth');
f = f.replace(/stroke-linecap/g, 'strokeLinecap');
f = f.replace(/stroke-linejoin/g, 'strokeLinejoin');
f = f.replace(/fill-rule/g, 'fillRule');
f = f.replace(/clip-rule/g, 'clipRule');

fs.writeFileSync('src/pages/ExplorePage.tsx', f, 'utf8');
