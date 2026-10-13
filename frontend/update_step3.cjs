const fs = require('fs');
const path = require('path');

const filePath = path.join('d:', 'ĐỒ ÁN', 'Green Trip', 'src', 'components', 'auth', 'OnboardingModal.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Imports
content = content.replace(
  "import { Leaf, X, MapPin, ChevronLeft } from 'lucide-react';",
  "import { Leaf, X, MapPin, ChevronLeft, Mic, Minus, Plus, Calendar } from 'lucide-react';"
);

// State variables
const statesToAdd = `const [hasPlan, setHasPlan] = useState(true);
  const [tripDetails, setTripDetails] = useState('');
  const [showWhoModal, setShowWhoModal] = useState(false);
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [infants, setInfants] = useState(0);
  const [pets, setPets] = useState(0);
  const [showWhenModal, setShowWhenModal] = useState(false);
  const [whenTab, setWhenTab] = useState('dates');
  const [flexibleDays, setFlexibleDays] = useState(5);`;

if (!content.includes('const [hasPlan')) {
  content = content.replace(
    "const [personality, setPersonality] = useState('binh_thuong');",
    "const [personality, setPersonality] = useState('binh_thuong');\n  " + statesToAdd
  );
}

// Step 2 next button fix (it should go to step 3 instead of closing)
content = content.replace(
  `onClick={onClose}
                      className="rounded-full bg-black px-8 py-2.5 text-[14px] font-bold text-white hover:bg-gray-900 transition-all"
                    >
                      Kế tiếp`,
  `onClick={() => setStep(3)}
                      className="rounded-full bg-black px-8 py-2.5 text-[14px] font-bold text-white hover:bg-gray-900 transition-all"
                    >
                      Kế tiếp`
);

// Step 3 UI
const step3UI = `
            {step === 3 && (
              <div className="animate-fadeIn">
                <h2 className="font-heading text-3xl font-extrabold tracking-tight text-black mb-6 leading-tight pr-4">
                  Bạn đã có kế hoạch cho chuyến đi nào chưa?
                </h2>
                
                <div className="flex gap-3 mb-6">
                  <button
                    onClick={() => setHasPlan(true)}
                    className={\`px-6 py-2 rounded-full text-[13px] font-bold transition-all \${hasPlan ? 'bg-black text-white' : 'border border-gray-200 text-black hover:border-gray-300'}\`}
                  >
                    Đúng
                  </button>
                  <button
                    onClick={() => setHasPlan(false)}
                    className={\`px-6 py-2 rounded-full text-[13px] font-bold transition-all \${!hasPlan ? 'bg-black text-white' : 'border border-gray-200 text-black hover:border-gray-300'}\`}
                  >
                    KHÔNG
                  </button>
                </div>

                <div className="relative mb-6">
                  <textarea
                    placeholder="5-day Tokyo trip this Octob"
                    value={tripDetails}
                    onChange={(e) => setTripDetails(e.target.value)}
                    className="w-full rounded-[16px] border border-gray-200 p-4 text-[14px] font-light text-gray-900 placeholder:text-gray-400 focus:border-black focus:outline-none focus:ring-1 focus:ring-black transition-all resize-none h-28"
                  />
                  <div className="absolute bottom-4 right-4 flex items-center justify-between left-4">
                    <span className="text-[11px] text-gray-400 opacity-0">...</span>
                    <div className="flex items-center gap-2">
                      <Mic size={18} className="text-gray-600 hover:text-black cursor-pointer transition-colors" />
                      <span className="text-[11px] text-gray-400">0 / 2000</span>
                    </div>
                  </div>
                </div>

                <p className="text-[13px] text-gray-500 mb-3">Bạn có thông tin chi tiết? Hãy chia sẻ những gì bạn biết.</p>

                <div className="space-y-3">
                  <button className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-gray-200 hover:border-gray-300 transition-colors bg-white">
                    <span className="text-[13.5px] font-bold text-black">Ở đâu</span>
                    <span className="text-[13px] font-light text-gray-500">Chọn điểm đến</span>
                  </button>
                  <button onClick={() => setShowWhenModal(true)} className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-gray-200 hover:border-gray-300 transition-colors bg-white">
                    <span className="text-[13.5px] font-bold text-black">Khi</span>
                    <span className="text-[13px] font-light text-gray-500">Chọn ngày</span>
                  </button>
                  <button onClick={() => setShowWhoModal(true)} className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-gray-200 hover:border-gray-300 transition-colors bg-white">
                    <span className="text-[13.5px] font-bold text-black">Ai</span>
                    <span className="text-[13px] font-light text-gray-500">{adults + children + infants + pets > 0 ? \`\${adults + children + infants + pets} du khách\` : 'Thêm người'}</span>
                  </button>
                </div>

                {/* Progress and Actions - Step 3 */}
                <div className="mt-12">
                  <div className="mb-5 h-[2px] w-full bg-gray-200">
                    <div className="h-full w-3/4 bg-black transition-all duration-500"></div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <button onClick={() => setStep(2)} className="flex items-center gap-1.5 text-[12px] font-bold text-gray-400 hover:text-black transition-colors">
                      <ChevronLeft size={16} /> Chuyến đi tiếp theo của bạn
                    </button>
                    <button
                      onClick={onClose}
                      className="rounded-full bg-black px-8 py-2.5 text-[14px] font-bold text-white hover:bg-gray-900 transition-all"
                    >
                      Kế tiếp
                    </button>
                  </div>
                </div>
              </div>
            )}
`;

content = content.replace("            {step === 2 && (", step3UI + "\n            {step === 2 && (");

const modals = `
      {/* WHO MODAL POPUP */}
      {showWhoModal && (
        <div className="absolute inset-0 z-[110] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-[400px] bg-white rounded-3xl p-6 shadow-2xl mx-4">
             <div className="flex justify-between items-start mb-6">
               <button onClick={() => setShowWhoModal(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100"><X size={18} /></button>
               <div className="text-center">
                 <div className="font-bold text-black text-[16px]">Ai</div>
                 <div className="text-gray-400 text-[12px] font-light">{adults + children + infants + pets} du khách</div>
               </div>
               <div className="w-8 h-8"></div>
             </div>

             <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[14px] font-bold text-black">Người lớn</div>
                    <div className="text-[12px] text-gray-400 font-light">Từ 13 tuổi trở lên</div>
                  </div>
                  <div className="flex items-center gap-4">
                    <button onClick={() => setAdults(Math.max(1, adults - 1))} className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center hover:border-gray-400"><Minus size={14}/></button>
                    <span className="w-4 text-center text-[14px] font-bold">{adults}</span>
                    <button onClick={() => setAdults(adults + 1)} className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center hover:border-gray-400"><Plus size={14}/></button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[14px] font-bold text-black">Những đứa trẻ</div>
                    <div className="text-[12px] text-gray-400 font-light">Độ tuổi 2–12</div>
                  </div>
                  <div className="flex items-center gap-4">
                    <button onClick={() => setChildren(Math.max(0, children - 1))} className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center hover:border-gray-400"><Minus size={14}/></button>
                    <span className="w-4 text-center text-[14px] font-bold">{children}</span>
                    <button onClick={() => setChildren(children + 1)} className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center hover:border-gray-400"><Plus size={14}/></button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[14px] font-bold text-black">Trẻ sơ sinh</div>
                    <div className="text-[12px] text-gray-400 font-light">Dưới 2 tuổi</div>
                  </div>
                  <div className="flex items-center gap-4">
                    <button onClick={() => setInfants(Math.max(0, infants - 1))} className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center hover:border-gray-400"><Minus size={14}/></button>
                    <span className="w-4 text-center text-[14px] font-bold">{infants}</span>
                    <button onClick={() => setInfants(infants + 1)} className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center hover:border-gray-400"><Plus size={14}/></button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[14px] font-bold text-black">Thú cưng</div>
                    <div className="text-[12px] text-gray-400 font-light underline">Bạn có mang theo động vật hỗ trợ không?</div>
                  </div>
                  <div className="flex items-center gap-4">
                    <button onClick={() => setPets(Math.max(0, pets - 1))} className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center hover:border-gray-400"><Minus size={14}/></button>
                    <span className="w-4 text-center text-[14px] font-bold">{pets}</span>
                    <button onClick={() => setPets(pets + 1)} className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center hover:border-gray-400"><Plus size={14}/></button>
                  </div>
                </div>
             </div>

             <div className="mt-8 flex justify-end">
               <button onClick={() => setShowWhoModal(false)} className="w-32 bg-black text-white font-bold text-[14px] py-3 rounded-full hover:bg-gray-900 transition-colors">Cập nhật</button>
             </div>
          </div>
        </div>
      )}

      {/* WHEN MODAL POPUP */}
      {showWhenModal && (
        <div className="absolute inset-0 z-[110] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-[500px] bg-white rounded-3xl p-6 shadow-2xl mx-4">
             <div className="flex justify-between items-center mb-6">
               <button onClick={() => setShowWhenModal(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100"><X size={18} /></button>
               <div className="text-[16px] font-bold text-black">Khi</div>
               <div className="w-8 h-8"></div>
             </div>

             <div className="flex justify-center mb-8">
               <div className="bg-gray-100 p-1 rounded-full flex gap-1">
                 <button onClick={() => setWhenTab('dates')} className={\`px-4 py-1.5 rounded-full text-[13px] font-bold transition-all \${whenTab === 'dates' ? 'bg-white shadow-sm' : 'text-gray-500 hover:text-black'}\`}>Ngày tháng</button>
                 <button onClick={() => setWhenTab('flex')} className={\`px-4 py-1.5 rounded-full text-[13px] font-bold transition-all \${whenTab === 'flex' ? 'bg-white shadow-sm' : 'text-gray-500 hover:text-black'}\`}>Linh hoạt</button>
               </div>
             </div>

             {whenTab === 'dates' ? (
                <div className="text-center text-gray-500 py-16 bg-gray-50 rounded-2xl border border-gray-100">
                  {/* Fake Calendar Placeholder */}
                  <Calendar size={48} className="mx-auto mb-4 opacity-20" />
                  <p className="text-[14px]">Tính năng chọn ngày chuẩn trên lịch sẽ được tích hợp sau.</p>
                </div>
             ) : (
                <div className="px-4">
                  <div className="text-center mb-8">
                    <div className="text-[14px] font-bold text-black mb-4">Bao nhiêu ngày?</div>
                    <div className="flex items-center justify-center gap-6">
                      <button onClick={() => setFlexibleDays(Math.max(1, flexibleDays - 1))} className="w-10 h-10 rounded-full border border-gray-200 flex items-center justify-center hover:border-gray-400"><Minus size={16}/></button>
                      <div className="w-12 text-center text-[18px] font-bold px-4 py-1 border border-gray-200 rounded-2xl">{flexibleDays}</div>
                      <button onClick={() => setFlexibleDays(flexibleDays + 1)} className="w-10 h-10 rounded-full border border-gray-200 flex items-center justify-center hover:border-gray-400"><Plus size={16}/></button>
                    </div>
                  </div>

                  <div className="text-center">
                    <div className="text-[14px] font-bold text-black mb-4">Du lịch bất cứ lúc nào</div>
                    <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-none justify-start px-2">
                      <button className="shrink-0 w-24 h-24 border border-gray-200 rounded-2xl flex flex-col items-center justify-center hover:border-black transition-colors bg-white">
                        <Calendar size={20} className="mb-2 text-gray-400" />
                        <span className="text-[13px] font-bold text-black">Tháng 10</span>
                      </button>
                      <button className="shrink-0 w-24 h-24 border border-gray-200 rounded-2xl flex flex-col items-center justify-center hover:border-black transition-colors bg-white">
                        <Calendar size={20} className="mb-2 text-gray-400" />
                        <span className="text-[13px] font-bold text-black">Tháng 11</span>
                      </button>
                      <button className="shrink-0 w-24 h-24 border border-gray-200 rounded-2xl flex flex-col items-center justify-center hover:border-black transition-colors bg-white">
                        <Calendar size={20} className="mb-2 text-gray-400" />
                        <span className="text-[13px] font-bold text-black">Tháng 12</span>
                      </button>
                      <button className="shrink-0 w-24 h-24 border border-gray-200 rounded-2xl flex flex-col items-center justify-center hover:border-black transition-colors bg-white">
                        <Calendar size={20} className="mb-2 text-gray-400" />
                        <span className="text-[13px] font-bold text-black">Tháng 1</span>
                      </button>
                    </div>
                  </div>
                </div>
             )}

             <div className="mt-8 flex justify-end">
               <button onClick={() => setShowWhenModal(false)} className="w-32 bg-black text-white font-bold text-[14px] py-3 rounded-full hover:bg-gray-900 transition-colors">Cập nhật</button>
             </div>
          </div>
        </div>
      )}
`;

content = content.replace("    <div className=\"fixed inset-0 z-[100] flex bg-white animate-fadeIn h-screen w-screen overflow-hidden\">", "    <div className=\"fixed inset-0 z-[100] flex bg-white animate-fadeIn h-screen w-screen overflow-hidden\">" + modals);


fs.writeFileSync(filePath, content, 'utf8');
console.log('Done');
