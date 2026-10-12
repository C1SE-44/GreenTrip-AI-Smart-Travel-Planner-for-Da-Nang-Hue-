const fs = require('fs');

let f = fs.readFileSync('src/pages/LandingPage.tsx', 'utf8');

// 1. Change root and top sections to light gray #F5F5F7
f = f.replace(
  '<div className="flex min-h-screen flex-col bg-white">',
  '<div className="flex min-h-screen flex-col bg-[#F5F5F7]">'
);
f = f.replace(
  '<section className="relative flex min-h-screen flex-col items-center justify-end overflow-hidden pb-12 text-center bg-white">',
  '<section className="relative flex min-h-screen flex-col items-center justify-end overflow-hidden pb-12 text-center bg-[#F5F5F7]">'
);
f = f.replace(
  'bg-gradient-to-t from-white via-white/90',
  'bg-gradient-to-t from-[#F5F5F7] via-[#F5F5F7]/90'
);
f = f.replace(
  'bg-gradient-to-b from-white to-gray-100',
  'bg-gradient-to-b from-[#F5F5F7] to-[#EAEAEF]'
);

// 2. Change the CTA block to a large image
const oldCtaRegex = /<section className="px-4 py-20 md:px-8 bg-white">\s*<div className="mx-auto max-w-\[1000px\] overflow-hidden rounded-\[40px\] bg-charcoal text-white text-center p-12 md:p-20">[\s\S]*?<\/section>/;

const newCta = `<section className="px-4 py-24 md:px-8 bg-white">
        <div className="relative mx-auto max-w-[1400px] overflow-hidden rounded-[40px] text-white text-center flex flex-col justify-center min-h-[560px] p-12 md:p-20 shadow-2xl">
          {/* Background Image */}
          <div className="absolute inset-0 z-0">
            <img src="https://images.unsplash.com/photo-1540541338287-41700207dee6?auto=format&fit=crop&q=80" alt="Resort Pool" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]"></div>
          </div>
          
          <div className="relative z-10 mx-auto max-w-3xl">
            <h2 className="font-heading text-5xl font-extrabold leading-tight tracking-tight lg:text-7xl drop-shadow-lg">
              Mỗi chuyến đi,<br />nhiều bản sắc hơn.
            </h2>
            <p className="mx-auto mt-6 max-w-xl text-lg text-white font-medium drop-shadow-md">
              Trả lời vài câu hỏi để giúp GreenTrip hiểu hơn về phong cách của bạn. Trợ lý du lịch sẽ học hỏi những điều bạn quan tâm và giúp mọi chuyến đi trở nên mượt mà hơn.
            </p>
            <div className="mt-10">
              <Link
                to="/explore"
                className="inline-flex items-center gap-2 rounded-full bg-white px-10 py-5 text-lg font-bold text-black transition-transform hover:scale-105 shadow-xl"
              >
                Thiết lập lịch trình ngay
              </Link>
            </div>
          </div>
        </div>
      </section>`;

f = f.replace(oldCtaRegex, newCta);

fs.writeFileSync('src/pages/LandingPage.tsx', f, 'utf8');
