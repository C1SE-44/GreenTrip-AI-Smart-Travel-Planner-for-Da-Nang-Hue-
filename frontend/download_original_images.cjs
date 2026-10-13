const fs = require('fs');
const path = require('path');
const https = require('https');

const images = {
  'danang_auth': 'https://upload.wikimedia.org/wikipedia/commons/e/ec/Dragon_Bridge_Danang.jpg',
  'hue_auth': 'https://upload.wikimedia.org/wikipedia/commons/9/9f/Thien_Mu_Pagoda%2C_Hue%2C_Vietnam.jpg',
  'cau_rong': 'https://upload.wikimedia.org/wikipedia/commons/e/ec/Dragon_Bridge_Danang.jpg',
  'my_khe': 'https://upload.wikimedia.org/wikipedia/commons/2/2f/My_Khe_Beach%2C_Da_Nang%2C_Vietnam.jpg',
  'ngu_hanh_son': 'https://upload.wikimedia.org/wikipedia/commons/6/66/Marble_Mountains.jpg',
  'linh_ung': 'https://upload.wikimedia.org/wikipedia/commons/c/c9/Linh_Ung_Pagoda%2C_Da_Nang_01.jpg',
  'ba_na': 'https://upload.wikimedia.org/wikipedia/commons/c/cb/Golden_Bridge%2C_Ba_Na_Hills.jpg',
  'cho_han': 'https://upload.wikimedia.org/wikipedia/commons/3/3d/Han_Market%2C_Da_Nang.jpg',
  'mi_quang': 'https://upload.wikimedia.org/wikipedia/commons/f/fe/M%C3%AC_Qu%E1%BA%A3ng_-_Da_Nang.jpg',
  'dai_noi': 'https://upload.wikimedia.org/wikipedia/commons/c/c3/Hue_Imperial_City.jpg',
  'thien_mu': 'https://upload.wikimedia.org/wikipedia/commons/9/9f/Thien_Mu_Pagoda%2C_Hue%2C_Vietnam.jpg',
  'khai_dinh': 'https://upload.wikimedia.org/wikipedia/commons/5/5e/Tomb_of_Khai_Dinh.jpg',
  'tu_duc': 'https://upload.wikimedia.org/wikipedia/commons/9/98/Tomb_of_Tu_Duc.jpg',
  'cho_dong_ba': 'https://upload.wikimedia.org/wikipedia/commons/8/87/Dong_Ba_Market.jpg',
  'bun_bo': 'https://upload.wikimedia.org/wikipedia/commons/3/36/Bun_bo_Hue.jpg',
  'truong_tien': 'https://upload.wikimedia.org/wikipedia/commons/7/7b/Truong_Tien_Bridge.jpg',
};

const dir = path.join(__dirname, 'public', 'images');

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        return download(response.headers.location, dest).then(resolve).catch(reject);
      }
      if (response.statusCode !== 200) {
        reject(new Error(`Status ${response.statusCode} for ${url}`));
        return;
      }
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
}

main();
