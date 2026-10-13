const fs = require('fs');
const file = 'd:/ĐỒ ÁN/Green Trip/src/pages/LandingPage.tsx';
let content = fs.readFileSync(file, 'utf8');

const regex = /\{\/\* Graphics \*\/\}\s*<div className="absolute -bottom-20 left-0 right-0 flex justify-center items-center pointer-events-none">[\s\S]*?(?=<\/div>\s*<\/div>\s*<\/div>\s*<\/section>)/;

const newGraphics = `{/* Graphics */}
                  <div className="absolute -bottom-12 left-4 right-4 h-32 flex items-center justify-start pointer-events-none">
                      
                      {/* Back Card */}
                      <div className="absolute left-[10%] w-[45%] rotate-[-6deg] translate-y-2 z-0">
                         <div className="bg-white p-1.5 rounded-2xl shadow-xl border border-gray-100">
                             <img src="https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&q=80" className="aspect-[4/5] w-full object-cover rounded-xl" />
                             <div className="px-2 py-2 flex justify-between items-center">
                                <div>
                                  <div className="text-[10px] font-bold text-black">Đại Nội</div>
                                  <div className="text-[8px] text-gray-500 font-medium mt-0.5">Huế</div>
                                </div>
                                <div className="text-[8px] font-bold text-gray-300">⭐</div>
                             </div>
                         </div>
                      </div>
                      
                      {/* Front Card */}
                      <div className="absolute left-[25%] w-[45%] rotate-[12deg] translate-y-12 z-10">
                         <div className="bg-white p-1.5 rounded-2xl shadow-2xl border border-gray-100">
                             <img src="https://images.unsplash.com/photo-1506012787146-f92b2d7d6d96?auto=format&fit=crop&q=80" className="aspect-[4/5] w-full object-cover rounded-xl" />
                             <div className="px-2 py-2 flex justify-between items-center">
                                <div>
                                  <div className="text-[10px] font-bold text-black">Cầu Rồng</div>
                                  <div className="text-[8px] text-gray-500 font-medium mt-0.5">Đà Nẵng</div>
                                </div>
                                <div className="text-[8px] font-bold text-gray-300">⭐</div>
                             </div>
                         </div>
                      </div>

                      {/* Floating Element (Like Binoculars) */}
                      <div className="absolute right-[5%] -top-4 w-12 h-12 bg-[#1a1a1a] rounded-full shadow-2xl flex items-center justify-center border-4 border-white rotate-[15deg]">
                          <MapPin size={20} className="text-white" />
                      </div>
                      
                  </div>`;

content = content.replace(regex, newGraphics);
fs.writeFileSync(file, content);
console.log('Fixed overlapping');
