const fs = require('fs');
const path = require('path');

const images = {
  danang_auth: 'https://upload.wikimedia.org/wikipedia/commons/e/ec/Dragon_Bridge_Danang.jpg',
  hue_auth: 'https://upload.wikimedia.org/wikipedia/commons/9/9f/Thien_Mu_Pagoda%2C_Hue%2C_Vietnam.jpg',
  cau_rong: 'https://upload.wikimedia.org/wikipedia/commons/e/ec/Dragon_Bridge_Danang.jpg',
  my_khe: 'https://upload.wikimedia.org/wikipedia/commons/2/2f/My_Khe_Beach%2C_Da_Nang%2C_Vietnam.jpg',
  ngu_hanh_son: 'https://upload.wikimedia.org/wikipedia/commons/6/66/Marble_Mountains.jpg',
  linh_ung: 'https://upload.wikimedia.org/wikipedia/commons/c/c9/Linh_Ung_Pagoda%2C_Da_Nang_01.jpg',
  ba_na: 'https://upload.wikimedia.org/wikipedia/commons/c/cb/Golden_Bridge%2C_Ba_Na_Hills.jpg',
  cho_han: 'https://upload.wikimedia.org/wikipedia/commons/3/3d/Han_Market%2C_Da_Nang.jpg',
  mi_quang: 'https://upload.wikimedia.org/wikipedia/commons/f/fe/M%C3%AC_Qu%E1%BA%A3ng_-_Da_Nang.jpg',
  dai_noi: 'https://upload.wikimedia.org/wikipedia/commons/c/c3/Hue_Imperial_City.jpg',
  thien_mu: 'https://upload.wikimedia.org/wikipedia/commons/9/9f/Thien_Mu_Pagoda%2C_Hue%2C_Vietnam.jpg',
  khai_dinh: 'https://upload.wikimedia.org/wikipedia/commons/5/5e/Tomb_of_Khai_Dinh.jpg',
  tu_duc: 'https://upload.wikimedia.org/wikipedia/commons/9/98/Tomb_of_Tu_Duc.jpg',
  cho_dong_ba: 'https://upload.wikimedia.org/wikipedia/commons/8/87/Dong_Ba_Market.jpg',
  bun_bo: 'https://upload.wikimedia.org/wikipedia/commons/3/36/Bun_bo_Hue.jpg',
  truong_tien: 'https://upload.wikimedia.org/wikipedia/commons/7/7b/Truong_Tien_Bridge.jpg',
};

// Update LoginPage
let loginPath = path.join(__dirname, 'src', 'pages', 'LoginPage.tsx');
let loginContent = fs.readFileSync(loginPath, 'utf8');
loginContent = loginContent.replace(/image=".*?"/, `image="${images.danang_auth}"`);
fs.writeFileSync(loginPath, loginContent);

// Update RegisterPage
let regPath = path.join(__dirname, 'src', 'pages', 'RegisterPage.tsx');
let regContent = fs.readFileSync(regPath, 'utf8');
regContent = regContent.replace(/image=".*?"/, `image="${images.hue_auth}"`);
fs.writeFileSync(regPath, regContent);

// Update pois.ts
let poisPath = path.join(__dirname, 'src', 'data', 'pois.ts');
let poisContent = fs.readFileSync(poisPath, 'utf8');
const idToImage = {
  'cau-rong': images.cau_rong,
  'my-khe': images.my_khe,
  'ngu-hanh-son': images.ngu_hanh_son,
  'linh-ung-son-tra': images.linh_ung,
  'ba-na-hills': images.ba_na,
  'cho-han': images.cho_han,
  'mi-quang': images.mi_quang,
  'dai-noi': images.dai_noi,
  'thien-mu': images.thien_mu,
  'khai-dinh': images.khai_dinh,
  'tu-duc': images.tu_duc,
  'cho-dong-ba': images.cho_dong_ba,
  'bun-bo-hue': images.bun_bo,
  'cau-truong-tien': images.truong_tien,
};

for (const [id, img] of Object.entries(idToImage)) {
  const regex = new RegExp(`(id:\\s*'${id}'[\\s\\S]*?image:\\s*').*?(')`);
  poisContent = poisContent.replace(regex, `$1${img}$2`);
}
fs.writeFileSync(poisPath, poisContent);
console.log('Images fixed');
