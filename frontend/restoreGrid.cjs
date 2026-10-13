const fs = require('fs');
const file = 'd:/ĐỒ ÁN/Green Trip/src/pages/LandingPage.tsx';
let content = fs.readFileSync(file, 'utf8');

// The file currently has Card 1 header, but its graphics were replaced by Khám Phá widget, and Card 2, 3, 4 were deleted.
// Let's find where the grid starts and ends.
const gridStart = /<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">[\s\S]*?(?=<\/section>)/;

const newGrid = `<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                
                {/* Card 1: Tiết kiệm */}
                <div className="relative flex flex-col overflow-visible rounded-[40px] bg-white p-8 shadow-sm hover:shadow-lg transition-shadow aspect-square w-full min-h-[300px]">
                  <div className="mb-4 text-black"><Bell size={22} strokeWidth={2.5} /></div>
                  <h3 className="mb-3 text-xl font-bold text-black">Cảnh báo</h3>
                  <p className="text-[13px] font-light text-gray-500 leading-relaxed">Luôn cập nhật thông tin với các cảnh báo ùn tắc, tính toán lại lịch trình theo thời gian thực.</p>
                  
                  {/* Graphics */}
                  <div className="absolute -bottom-6 left-0 right-0 flex flex-col items-center justify-end pb-4 space-y-3 pointer-events-none">
                    <div className="w-[85%] bg-white rounded-2xl shadow-xl border border-gray-100 p-3 flex items-center gap-3 rotate-[-2deg]">
                      <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center"><Bell size={20} className="text-orange-600"/></div>
                      <div>
                        <div className="text-xs font-bold text-gray-900">Mưa rào lúc 15:00</div>
                        <div className="text-[10px] text-green-600 font-semibold">Đã điều chỉnh lịch</div>
                      </div>
                    </div>
                    <div className="w-[85%] bg-black rounded-[20px] shadow-2xl p-3 flex items-center gap-3 translate-y-4 rotate-[1deg]">
                      <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center"><Navigation size={18} className="text-white"/></div>
                      <div>
                        <div className="text-xs font-bold text-white">Tránh kẹt xe</div>
                        <div className="text-[10px] text-gray-400 font-medium">Tiết kiệm 20 phút</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card 2: Xây dựng */}
                <div className="relative flex flex-col overflow-visible rounded-[40px] bg-white p-8 shadow-sm hover:shadow-lg transition-shadow aspect-square w-full min-h-[300px]">
                  <div className="mb-4 text-black"><CalendarCheck size={22} strokeWidth={2.5} /></div>
                  <h3 className="mb-3 text-xl font-bold text-black">Xây dựng</h3>
                  <p className="text-[13px] font-light text-gray-500 leading-relaxed">Lập kế hoạch chuyên sâu dựa trên thói quen và lưu trữ toàn bộ lịch trình ở cùng một nơi.</p>
                  
                  {/* Graphics */}
                  <div className="absolute -bottom-6 left-0 right-0 flex flex-col items-center gap-2 pointer-events-none">
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
                  </div>
                </div>

                {/* Card 3: Sinh thái */}
                <div className="relative flex flex-col overflow-visible rounded-[40px] bg-white p-8 shadow-sm hover:shadow-lg transition-shadow aspect-square w-full min-h-[300px]">
                  <div className="mb-4 text-black"><Leaf size={22} strokeWidth={2.5} /></div>
                  <h3 className="mb-3 text-xl font-bold text-black">Sinh thái</h3>
                  <p className="text-[13px] font-light text-gray-500 leading-relaxed">Theo dõi lượng phát thải và quy đổi thành Eco Score, giúp bạn chọn các hoạt động bảo vệ môi trường.</p>
                  
                  {/* Graphics */}
                  <div className="absolute -bottom-2 left-0 right-0 flex flex-col items-center gap-3 pointer-events-none">
                    <div className="flex gap-2">
                      <div className="bg-[#e6f4ea] text-green-700 text-[11px] font-bold px-4 py-2 rounded-full border border-green-200 shadow-sm rotate-[-3deg]">Di chuyển xanh</div>
                      <div className="bg-[#e6f4ea] text-green-700 text-[11px] font-bold px-4 py-2 rounded-full border border-green-200 shadow-sm rotate-[4deg]">Quán chay</div>
                    </div>
                    <div className="w-[85%] bg-white rounded-[20px] shadow-2xl border border-gray-100 p-4 flex justify-between items-center translate-y-4">
                       <div className="flex items-center gap-3">
                          <div className="bg-green-500 w-8 h-8 rounded-full flex items-center justify-center"><Leaf size={14} className="text-white"/></div>
                          <div>
                            <div className="text-xs font-bold text-black">Eco Score</div>
                            <div className="text-[10px] text-gray-500 font-medium">+150 điểm</div>
                          </div>
                       </div>
                       <div className="w-8 h-8 rounded-full bg-green-50 flex items-center justify-center text-sm">✨</div>
                    </div>
                  </div>
                </div>

                {/* Card 4: Khám phá */}
                <div className="relative flex flex-col overflow-visible rounded-[40px] bg-white p-8 shadow-sm hover:shadow-lg transition-shadow aspect-square w-full min-h-[300px]">
                  <div className="mb-4 text-black"><Compass size={22} strokeWidth={2.5} /></div>
                  <h3 className="mb-3 text-xl font-bold text-black">Khám phá</h3>
                  <p className="text-[13px] font-light text-gray-500 leading-relaxed">Bản đồ đa lớp (Multi-layer map) giúp tìm những địa điểm, sự kiện thú vị xung quanh bạn.</p>
                  
                  {/* Graphics */}
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
                  </div>
                </div>
              </div>
            </div>
`;

content = content.replace(gridStart, newGrid);

fs.writeFileSync(file, content);
console.log('Restored the whole grid properly!');
