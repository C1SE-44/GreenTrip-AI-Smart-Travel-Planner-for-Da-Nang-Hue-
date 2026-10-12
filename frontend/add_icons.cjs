const fs = require('fs');
let f = fs.readFileSync('index.html', 'utf8');
if (!f.includes('@phosphor-icons/web')) {
  f = f.replace('</head>', '    <script src="https://unpkg.com/@phosphor-icons/web"></script>\n  </head>');
  fs.writeFileSync('index.html', f, 'utf8');
}
