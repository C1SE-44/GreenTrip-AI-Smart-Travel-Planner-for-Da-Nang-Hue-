const fs = require('fs');
const path = require('path');

const filePath = path.join('d:', 'ĐỒ ÁN', 'Green Trip', 'src', 'pages', 'LandingPage.tsx');
let content = fs.readFileSync(filePath, 'utf8');

content = content.replace(/của bạn\.\/span>/g, 'của bạn.</span>');
content = content.replace(/quyết<br \/>định\.\/span>/g, 'quyết<br />định.</span>');
content = content.replace(/đập xanh\.\/span>/g, 'đập xanh.</span>');

fs.writeFileSync(filePath, content, 'utf8');
console.log("Fixed spans");
