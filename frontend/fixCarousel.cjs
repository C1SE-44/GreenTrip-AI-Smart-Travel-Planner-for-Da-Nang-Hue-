const fs = require('fs');
const file = 'd:/ĐỒ ÁN/Green Trip/src/pages/LandingPage.tsx';
let content = fs.readFileSync(file, 'utf8');

const oldSection = `{/* 4. DESTINATIONS CAROUSEL */}
          <section className="px-4 py-20 md:px-8 bg-cream">
          <div className="mx-auto max-w-[1400px]">
            <h2 className="font-heading text-4xl font-extrabold tracking-tight text-charcoal sm:text-5xl lg:text-6xl max-w-2xl leading-[1.1]">
              Được hình thành từ trải nghiệm thực tế.
            </h2>
            <p className="mt-6 text-lg font-light text-muted max-w-3xl mb-12">
              Khám phá những điểm đến hấp dẫn nhất tại miền Trung thông qua lăng kính của hàng ngàn chuyến đi đã được tối ưu.
            </p>`;

const newSection = `{/* 4. DESTINATIONS CAROUSEL */}
          <section className="px-4 py-20 md:px-8 bg-cream">
          <div className="mx-auto max-w-[1400px]">
            <h2 className="font-heading text-4xl font-extrabold tracking-tight text-charcoal sm:text-5xl lg:text-6xl max-w-2xl leading-[1.1]">
              Từ Đại Nội cổ kính đến Cầu Rồng rực lửa.
            </h2>
            <p className="mt-6 text-lg font-light text-muted max-w-2xl mb-12">
              Miền Trung ẩn chứa hàng trăm điểm đến chưa được khai phá. GreenTrip giúp bạn tìm ra con đường riêng của mình — xanh hơn, thú vị hơn.
            </p>`;

// Try exact replace, but the file has garbled UTF-8 in it, so use regex instead
const sectionRegex = /\{\/\* 4\. DESTINATIONS CAROUSEL \*\/\}\s*<section className="px-4 py-20 md:px-8 bg-cream">\s*<div className="mx-auto max-w-\[1400px\]">\s*<h2 className="font-heading text-4xl font-extrabold tracking-tight text-charcoal sm:text-5xl lg:text-6xl \s*max-w-2xl leading-\[1\.1\]">\s*[^<]*<\/h2>\s*<p className="mt-6 text-lg font-light text-muted max-w-3xl mb-12">\s*[^<]*<\/p>/;

content = content.replace(sectionRegex, newSection);

// Fix card images and add location/tag info with Mindtrip-like card structure
const cardsRegex = /<div className="flex gap-6 overflow-x-auto scrollbar-thin pb-8 -mx-4 px-4 md:mx-0 md:px-0">\s*\{[\s\S]*?\}\.map\(\(item, i\) => \(\s*<div key=\{i\} className="min-w-\[280px\] lg:min-w-\[320px\] flex-shrink-0 group cursor-pointer">\s*<div className="relative h-\[400px\] overflow-hidden rounded-\[32px\] mb-4">\s*<img src=\{item\.img\}[^/]*\/>\s*<div className="absolute top-4 left-4 bg-white\/90[^>]*>\s*\{item\.count\}\s*<\/div>\s*<\/div>\s*<h4[^>]*>\{item\.title\}<\/h4>\s*<p[^>]*>\s*<MapPin size=\{14\} \/>[^<]*<\/p>\s*<\/div>\s*\)\)}\s*<\/div>/;

const newCards = `<div className="flex gap-5 overflow-x-auto scrollbar-thin pb-8 -mx-4 px-4 md:mx-0 md:px-0">
              {[
                {
                  title: 'Cầu Rồng phun lửa',
                  location: 'Đà Nẵng, Việt Nam',
                  tag: 'Biểu tượng',
                  img: 'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&q=80',
                  count: '12 điểm',
                },
                {
                  title: 'Đại Nội Kinh thành Huế',
                  location: 'Huế, Việt Nam',
                  tag: 'Di sản thế giới',
                  img: 'https://images.unsplash.com/photo-1528127269322-539801943592?auto=format&fit=crop&q=80',
                  count: '8 điểm',
                },
                {
                  title: 'Phố cổ Hội An về đêm',
                  location: 'Hội An, Việt Nam',
                  tag: 'Phố lồng đèn',
                  img: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&q=80',
                  count: '15 điểm',
                },
                {
                  title: 'Bà Nà Hills & Cầu Vàng',
                  location: 'Đà Nẵng, Việt Nam',
                  tag: 'Kỳ quan',
                  img: 'https://images.unsplash.com/photo-1627993077303-3450e1cd1639?auto=format&fit=crop&q=80',
                  count: '6 điểm',
                },
                {
                  title: 'Lăng Cô & Đèo Hải Vân',
                  location: 'Thừa Thiên Huế, Việt Nam',
                  tag: 'Thiên nhiên',
                  img: 'https://images.unsplash.com/photo-1506012787146-f92b2d7d6d96?auto=format&fit=crop&q=80',
                  count: '5 điểm',
                },
              ].map((item, i) => (
                <div key={i} className="min-w-[260px] lg:min-w-[300px] flex-shrink-0 group cursor-pointer">
                  <div className="relative h-[360px] overflow-hidden rounded-[24px] mb-4">
                    <img src={item.img} alt={item.title} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
                    <div className="absolute top-4 left-4 bg-black/70 backdrop-blur-sm px-3 py-1 rounded-full text-[11px] font-bold text-white">
                      {item.count}
                    </div>
                  </div>
                  <h4 className="text-[17px] font-bold text-charcoal leading-snug">{item.title}</h4>
                  <div className="flex items-center gap-2 mt-1.5">
                    <MapPin size={13} className="text-muted shrink-0" />
                    <p className="text-[13px] font-light text-muted">{item.location}</p>
                  </div>
                  <span className="inline-block mt-2 text-[11px] font-light text-muted bg-beige px-2.5 py-1 rounded-full">{item.tag}</span>
                </div>
              ))}
            </div>

            {/* CTA Row — like Mindtrip */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mt-10">
              <button className="inline-flex items-center gap-2 rounded-full bg-black px-7 py-3.5 text-[15px] font-bold text-white hover:bg-gray-900 transition-colors">
                Khám phá địa điểm
              </button>
              <a href="#" className="text-[15px] font-light text-charcoal hover:underline flex items-center gap-1">
                Xem toàn bộ lịch trình mẫu →
              </a>
            </div>`;

content = content.replace(cardsRegex, newCards);

fs.writeFileSync(file, content);
console.log('Updated destinations carousel section');
