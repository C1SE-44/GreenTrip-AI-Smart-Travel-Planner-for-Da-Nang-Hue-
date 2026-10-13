const fs = require('fs');
const file = 'd:/ĐỒ ÁN/Green Trip/src/pages/LandingPage.tsx';
let content = fs.readFileSync(file, 'utf8');

const regex = /<div className=\"absolute -bottom-12 -right-8 flex justify-end items-center pointer-events-none \nrotate-\[35deg\] scale-\[1\.15\]\">[\s\S]*?(?=<\/div><\/div>\n              <\/div>\n            <\/div>\n          <\/section>)/;

// Wait, I need a regex that just catches the whole graphics block of Khám Phá.
// It starts with {/* Graphics */} and ends right before </div></div> (which closes the flex col and the relative card).
const regexGeneric = /\{\/\* Graphics \*\/\}\s*<div className=\"absolute.*?pointer-events-none[\s\S]*?(?=<\/div>\s*<\/div>\s*<\/div>\s*<\/section>)/;

const newMap = `{/* Graphics */}
                  <div className="absolute -bottom-20 left-0 right-0 flex justify-center items-center pointer-events-none">
                      {/* Back Card */}
                      <div className="absolute w-[55%] rotate-[-6deg] translate-x-[-20px] translate-y-[-15px] z-0">
                         <div className="bg-white p-1.5 rounded-2xl shadow-xl border border-gray-100">
                             <img src="https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&q=80" className="aspect-[4/5] w-full object-cover rounded-xl" />
                             <div className="px-2 py-2">
                                <div className="text-[11px] font-bold text-black">Đại Nội</div>
                                <div className="text-[9px] text-gray-500 font-medium">Huế</div>
                             </div>
                         </div>
                      </div>
                      {/* Front Card */}
                      <div className="relative w-[55%] rotate-[12deg] translate-x-[20px] translate-y-[30px] z-10">
                         <div className="bg-white p-1.5 rounded-2xl shadow-2xl border border-gray-100">
                             <img src="https://images.unsplash.com/photo-1506012787146-f92b2d7d6d96?auto=format&fit=crop&q=80" className="aspect-[4/5] w-full object-cover rounded-xl" />
                             <div className="px-2 py-2">
                                <div className="text-[11px] font-bold text-black">Cầu Rồng</div>
                                <div className="text-[9px] text-gray-500 font-medium">Đà Nẵng</div>
                             </div>
                         </div>
                         <div className="absolute -top-4 -right-4 w-10 h-10 bg-black rounded-full shadow-xl flex items-center justify-center border-2 border-white">
                            <MapPin size={16} className="text-white" />
                         </div>
                      </div>
                  </div>`;

content = content.replace(regexGeneric, newMap);
fs.writeFileSync(file, content);
console.log('Fixed exactly like Mindtrip');
