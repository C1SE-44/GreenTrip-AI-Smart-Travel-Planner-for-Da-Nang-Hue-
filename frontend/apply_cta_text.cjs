const fs = require('fs');

let f = fs.readFileSync('src/pages/LandingPage.tsx', 'utf8');

// Replace the inner content of the CTA card
const oldContentRegex = /<h2 className="font-heading text-5xl font-extrabold leading-tight tracking-tight lg:text-7xl drop-shadow-lg">[\s\S]*?<\/div>\s*<\/div>/;

const newContent = `<h2 className="font-heading text-5xl font-extrabold leading-tight tracking-tight lg:text-[5.5rem] drop-shadow-lg">
              Mỗi chuyến đi,<br />nhiều bản sắc hơn.
            </h2>
            <div className="mt-20">
              <p className="mx-auto max-w-3xl text-[18px] font-light text-white drop-shadow-md leading-relaxed">
                Trả lời vài câu hỏi để giúp GreenTrip hiểu hơn về phong cách của bạn. Trợ lý du lịch sẽ học hỏi những điều bạn quan tâm và giúp mọi chuyến đi trở nên mượt mà hơn.
              </p>
              <div className="mt-8">
                <Link
                  to="/explore"
                  className="inline-flex items-center gap-2 rounded-full bg-white px-8 py-4 text-[17px] font-normal text-black transition-transform hover:scale-105 shadow-xl"
                >
                  Thiết lập lịch trình ngay
                </Link>
              </div>
            </div>
          </div>`;

f = f.replace(oldContentRegex, newContent);

fs.writeFileSync('src/pages/LandingPage.tsx', f, 'utf8');
