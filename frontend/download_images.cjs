const fs = require('fs');
const path = require('path');
const https = require('https');

const images = {
  'danang_auth': 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ec/Dragon_Bridge_Danang.jpg/800px-Dragon_Bridge_Danang.jpg',
  'hue_auth': 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9f/Thien_Mu_Pagoda%2C_Hue%2C_Vietnam.jpg/800px-Thien_Mu_Pagoda%2C_Hue%2C_Vietnam.jpg',
  'cau_rong': 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ec/Dragon_Bridge_Danang.jpg/800px-Dragon_Bridge_Danang.jpg',
  'my_khe': 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/My_Khe_Beach%2C_Da_Nang%2C_Vietnam.jpg/800px-My_Khe_Beach%2C_Da_Nang%2C_Vietnam.jpg',
  'ngu_hanh_son': 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/Marble_Mountains.jpg/800px-Marble_Mountains.jpg',
  'linh_ung': 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c9/Linh_Ung_Pagoda%2C_Da_Nang_01.jpg/800px-Linh_Ung_Pagoda%2C_Da_Nang_01.jpg',
  'ba_na': 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cb/Golden_Bridge%2C_Ba_Na_Hills.jpg/800px-Golden_Bridge%2C_Ba_Na_Hills.jpg',
  'cho_han': 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/Han_Market%2C_Da_Nang.jpg/800px-Han_Market%2C_Da_Nang.jpg',
  'mi_quang': 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fe/M%C3%AC_Qu%E1%BA%A3ng_-_Da_Nang.jpg/800px-M%C3%AC_Qu%E1%BA%A3ng_-_Da_Nang.jpg',
  'dai_noi': 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c3/Hue_Imperial_City.jpg/800px-Hue_Imperial_City.jpg',
  'thien_mu': 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9f/Thien_Mu_Pagoda%2C_Hue%2C_Vietnam.jpg/800px-Thien_Mu_Pagoda%2C_Hue%2C_Vietnam.jpg',
  'khai_dinh': 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Tomb_of_Khai_Dinh.jpg/800px-Tomb_of_Khai_Dinh.jpg',
  'tu_duc': 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/98/Tomb_of_Tu_Duc.jpg/800px-Tomb_of_Tu_Duc.jpg',
  'cho_dong_ba': 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Dong_Ba_Market.jpg/800px-Dong_Ba_Market.jpg',
  'bun_bo': 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/Bun_bo_Hue.jpg/800px-Bun_bo_Hue.jpg',
  'truong_tien': 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/Truong_Tien_Bridge.jpg/800px-Truong_Tien_Bridge.jpg',
};

const dir = path.join(__dirname, 'public', 'images');
if (!fs.existsSync(dir)){
    fs.mkdirSync(dir, { recursive: true });
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (response) => {
      response.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => reject(err));
    });
  });
}

async function main() {
  for (const [key, url] of Object.entries(images)) {
    const dest = path.join(dir, `${key}.jpg`);
    try {
      await download(url, dest);
      console.log(`Downloaded ${key}`);
    } catch (e) {
      console.error(`Failed ${key}`, e);
    }
  }

  // Update pois.ts
  let poisPath = path.join(__dirname, 'src', 'data', 'pois.ts');
  let poisContent = fs.readFileSync(poisPath, 'utf8');
  const idToImage = {
    'cau-rong': '/images/cau_rong.jpg',
    'my-khe': '/images/my_khe.jpg',
    'ngu-hanh-son': '/images/ngu_hanh_son.jpg',
    'linh-ung-son-tra': '/images/linh_ung.jpg',
    'ba-na-hills': '/images/ba_na.jpg',
    'cho-han': '/images/cho_han.jpg',
    'mi-quang': '/images/mi_quang.jpg',
    'dai-noi': '/images/dai_noi.jpg',
    'thien-mu': '/images/thien_mu.jpg',
    'khai-dinh': '/images/khai_dinh.jpg',
    'tu-duc': '/images/tu_duc.jpg',
    'cho-dong-ba': '/images/cho_dong_ba.jpg',
    'bun-bo-hue': '/images/bun_bo.jpg',
    'cau-truong-tien': '/images/truong_tien.jpg',
  };
  for (const [id, img] of Object.entries(idToImage)) {
    const regex = new RegExp(`(id:\\s*'${id}'[\\s\\S]*?image:\\s*').*?(')`);
    poisContent = poisContent.replace(regex, `$1${img}$2`);
  }
  fs.writeFileSync(poisPath, poisContent);

  // Update LoginPage
  let loginPath = path.join(__dirname, 'src', 'pages', 'LoginPage.tsx');
  let loginContent = fs.readFileSync(loginPath, 'utf8');
  loginContent = loginContent.replace(/image=".*?"/, `image="/images/danang_auth.jpg"`);
  fs.writeFileSync(loginPath, loginContent);

  // Update RegisterPage
  let regPath = path.join(__dirname, 'src', 'pages', 'RegisterPage.tsx');
  let regContent = fs.readFileSync(regPath, 'utf8');
  regContent = regContent.replace(/image=".*?"/, `image="/images/hue_auth.jpg"`);
  fs.writeFileSync(regPath, regContent);
  
  console.log('Done modifying paths');
}

main();
