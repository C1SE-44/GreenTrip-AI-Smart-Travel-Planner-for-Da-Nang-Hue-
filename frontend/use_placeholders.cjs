const fs = require('fs');
const path = require('path');

const idToName = {
  'cau-rong': 'Cầu Rồng',
  'my-khe': 'Bãi biển Mỹ Khê',
  'ngu-hanh-son': 'Ngũ Hành Sơn',
  'linh-ung-son-tra': 'Chùa Linh Ứng',
  'ba-na-hills': 'Bà Nà Hills',
  'cho-han': 'Chợ Hàn',
  'mi-quang': 'Mì Quảng',
  'dai-noi': 'Đại Nội Huế',
  'thien-mu': 'Chùa Thiên Mụ',
  'khai-dinh': 'Lăng Khải Định',
  'tu-duc': 'Lăng Tự Đức',
  'cho-dong-ba': 'Chợ Đông Ba',
  'bun-bo-hue': 'Bún Bò Huế',
  'cau-truong-tien': 'Cầu Trường Tiền',
};

// Update pois.ts
let poisPath = path.join(__dirname, 'src', 'data', 'pois.ts');
let poisContent = fs.readFileSync(poisPath, 'utf8');

for (const [id, name] of Object.entries(idToName)) {
  const encodedName = encodeURIComponent(name);
  const img = `https://placehold.co/600x400/2F5D50/FFFDF8?text=${encodedName}`;
  const regex = new RegExp(`(id:\\s*'${id}'[\\s\\S]*?image:\\s*').*?(')`);
  poisContent = poisContent.replace(regex, `$1${img}$2`);
}
fs.writeFileSync(poisPath, poisContent);

// Update LoginPage
let loginPath = path.join(__dirname, 'src', 'pages', 'LoginPage.tsx');
let loginContent = fs.readFileSync(loginPath, 'utf8');
loginContent = loginContent.replace(/image=".*?"/, `image="https://placehold.co/800x1200/2F5D50/FFFDF8?text=Da+Nang"`);
fs.writeFileSync(loginPath, loginContent);

// Update RegisterPage
let regPath = path.join(__dirname, 'src', 'pages', 'RegisterPage.tsx');
let regContent = fs.readFileSync(regPath, 'utf8');
regContent = regContent.replace(/image=".*?"/, `image="https://placehold.co/800x1200/8B5E3C/FFFDF8?text=Hue"`);
fs.writeFileSync(regPath, regContent);
