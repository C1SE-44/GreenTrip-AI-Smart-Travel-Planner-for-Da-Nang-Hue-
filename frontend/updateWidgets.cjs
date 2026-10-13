const fs = require('fs');
const file = 'd:/ĐỒ ÁN/Green Trip/src/pages/LandingPage.tsx';
let content = fs.readFileSync(file, 'utf8');

const mapRegex = /<div className="absolute -bottom-8 left-0 right-0 flex justify-center pointer-events-none">[\s\S]*?(?=<\/div>\s*<\/div>\s*<\/div>\s*<\/section>)/;
const newMap = `<div className="absolute -bottom-8 left-0 right-0 flex justify-center items-center pointer-events-none">
                    {/* Back Card (Đại Nội Huế) */}
                    <div className="absolute w-[75%] rotate-[-6deg] translate-x-[-15px] translate-y-[-10px] z-0">
                       <img src="https://images.unsplash.com/photo-1580837119756-563d608ca11a?auto=format&fit=crop&q=80" className="w-full h-28 object-cover rounded-[24px] shadow-lg border-[3px] border-white" />
                       <div className="absolute bottom-2 left-2 bg-white/95 backdrop-blur-sm px-2 py-1 rounded-lg shadow-sm">
                          <div className="text-[9px] font-bold text-black">Đại Nội</div>
                          <div className="text-[7px] text-gray-500 font-medium">Huế</div>
                       </div>
                    </div>
                    {/* Front Card (Cầu Rồng) */}
                    <div className="relative w-[80%] rotate-[4deg] translate-x-[15px] z-10">
                       <img src="https://images.unsplash.com/photo-1555921015-c262060f64be?auto=format&fit=crop&q=80" className="w-full h-32 object-cover rounded-[24px] shadow-2xl border-[3px] border-white" />
                       <div className="absolute bottom-3 left-3 bg-white/95 backdrop-blur-sm px-3 py-1.5 rounded-xl shadow-sm">
                          <div className="text-[11px] font-bold text-black">Phố Cổ</div>
                          <div className="text-[9px] text-gray-500 font-medium">Hội An</div>
                       </div>
                       <div className="absolute -top-3 -right-3 w-10 h-10 bg-black rounded-full shadow-xl flex items-center justify-center border-[3px] border-white">
                          <MapPin size={16} className="text-white" />
                       </div>
                    </div>
                  </div>`;
content = content.replace(mapRegex, newMap);

const hueRegex = /<div className="absolute -bottom-8 left-0 right-0 flex flex-col items-center gap-2 pointer-events-none">[\s\S]*?(?=<\/div>\s*<\/div>\s*<\/div>\s*\{\/\* Card 3: Sinh thái \*\/\} )/;
const newHue = `<div className="absolute -bottom-6 left-0 right-0 flex flex-col items-center gap-2 pointer-events-none">
                    <div className="w-[80%] bg-white rounded-3xl shadow-2xl border border-gray-100 p-3 relative translate-y-4">
                       <div className="flex justify-between items-center mb-3">
                          <div className="text-[11px] font-bold text-black">Lịch trình Huế 3 ngày</div>
                          <div className="w-5 h-5 rounded-full bg-blue-100 text-[9px] flex items-center justify-center font-bold">+</div>
                       </div>
                       <div className="space-y-2.5">
                          <div className="flex gap-2 items-center">
                             <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                             <div className="flex-1 space-y-1"><div className="h-1.5 w-[70%] bg-gray-200 rounded-full"></div><div className="h-1 w-[40%] bg-gray-100 rounded-full"></div></div>
                          </div>
                          <div className="flex gap-2 items-center">
                             <div className="w-2 h-2 rounded-full bg-gray-300"></div>
                             <div className="flex-1 space-y-1"><div className="h-1.5 w-[50%] bg-gray-200 rounded-full"></div><div className="h-1 w-[80%] bg-gray-100 rounded-full"></div></div>
                          </div>
                          <div className="flex gap-2 items-center">
                             <div className="w-2 h-2 rounded-full bg-gray-300"></div>
                             <div className="flex-1 space-y-1"><div className="h-1.5 w-[90%] bg-gray-200 rounded-full"></div><div className="h-1 w-[30%] bg-gray-100 rounded-full"></div></div>
                          </div>
                       </div>
                    </div>
                  </div>`;
content = content.replace(hueRegex, newHue);

fs.writeFileSync(file, content);
console.log('Fixed completely');
