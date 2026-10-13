const fs = require('fs');
const file = 'd:/ĐỒ ÁN/Green Trip/src/pages/LandingPage.tsx';
let content = fs.readFileSync(file, 'utf8');

const mapRegex = /<div className="absolute -bottom-10 -right-4 flex justify-center items-center pointer-events-none rotate-\[20deg\] scale-110">[\s\S]*?(?=<\/div>\s*<\/div>\s*<\/div>\s*<\/section>)/;
const fallbackRegex = /<div className="absolute -bottom-8 left-0 right-0 flex justify-center items-center pointer-events-none">[\s\S]*?(?=<\/div>\s*<\/div>\s*<\/div>\s*<\/section>)/;

const newMap = `<div className="absolute -bottom-12 -right-8 flex justify-end items-center pointer-events-none rotate-[35deg] scale-[1.15]">
                      {/* Back Card (Đại Nội Huế) */}
                      <div className="absolute w-[60%] rotate-[-15deg] translate-x-[-40px] translate-y-[-10px] z-0">
                         <img src="https://images.unsplash.com/photo-1580837119756-563d608ca11a?auto=format&fit=crop&q=80" className="aspect-square w-full object-cover rounded-[24px] shadow-lg border-[3px] border-white" />
                         <div className="absolute bottom-2 left-2 bg-white/95 backdrop-blur-sm px-2 py-1 rounded-lg shadow-sm">
                            <div className="text-[9px] font-bold text-black">Đại Nội</div>
                            <div className="text-[7px] text-gray-500 font-medium">Huế</div>
                         </div>
                      </div>
                      {/* Front Card (Phố Cổ) */}
                      <div className="relative w-[65%] rotate-[10deg] translate-x-[10px] translate-y-[20px] z-10">
                         <img src="https://images.unsplash.com/photo-1555921015-c262060f64be?auto=format&fit=crop&q=80" className="aspect-square w-full object-cover rounded-[24px] shadow-2xl border-[3px] border-white" />
                         <div className="absolute bottom-3 left-3 bg-white/95 backdrop-blur-sm px-3 py-1.5 rounded-xl shadow-sm">
                            <div className="text-[11px] font-bold text-black">Phố Cổ</div>
                            <div className="text-[9px] text-gray-500 font-medium">Hội An</div>
                         </div>
                         <div className="absolute -top-3 -right-3 w-10 h-10 bg-black rounded-full shadow-xl flex items-center justify-center border-[3px] border-white">
                            <MapPin size={16} className="text-white" />
                         </div>
                      </div>
                    </div>`;

if (content.match(mapRegex)) {
    content = content.replace(mapRegex, newMap);
} else {
    content = content.replace(fallbackRegex, newMap);
}
fs.writeFileSync(file, content);
console.log('Fixed images and rotation completely');
