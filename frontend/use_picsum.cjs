const fs = require('fs');
const path = require('path');

const idToSeed = {
  'cau-rong': 'danang_1',
  'my-khe': 'danang_2',
  'ngu-hanh-son': 'danang_3',
  'linh-ung-son-tra': 'danang_4',
  'ba-na-hills': 'danang_5',
  'cho-han': 'danang_6',
  'mi-quang': 'danang_7',
  'dai-noi': 'hue_1',
  'thien-mu': 'hue_2',
  'khai-dinh': 'hue_3',
  'tu-duc': 'hue_4',
  'cho-dong-ba': 'hue_5',
  'bun-bo-hue': 'hue_6',
  'cau-truong-tien': 'hue_7',
};

// Update pois.ts
let poisPath = path.join(__dirname, 'src', 'data', 'pois.ts');
let poisContent = fs.readFileSync(poisPath, 'utf8');

for (const [id, seed] of Object.entries(idToSeed)) {
  const img = `https://picsum.photos/seed/${seed}/800/600`;
  const regex = new RegExp(`(id:\\s*'${id}'[\\s\\S]*?image:\\s*').*?(')`);
  poisContent = poisContent.replace(regex, `$1${img}$2`);
}
fs.writeFileSync(poisPath, poisContent);

// Update LoginPage
let loginPath = path.join(__dirname, 'src', 'pages', 'LoginPage.tsx');
let loginContent = fs.readFileSync(loginPath, 'utf8');
loginContent = loginContent.replace(/image=".*?"/, `image="https://picsum.photos/seed/danang_auth/1200/1600"`);
fs.writeFileSync(loginPath, loginContent);

// Update RegisterPage
let regPath = path.join(__dirname, 'src', 'pages', 'RegisterPage.tsx');
let regContent = fs.readFileSync(regPath, 'utf8');
regContent = regContent.replace(/image=".*?"/, `image="https://picsum.photos/seed/hue_auth/1200/1600"`);
fs.writeFileSync(regPath, regContent);
