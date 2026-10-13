const fs = require('fs');
const path = require('path');

const filePath = path.join('d:', 'ĐỒ ÁN', 'Green Trip', 'src', 'components', 'auth', 'OnboardingModal.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Remove Mic icon, update character counter
const oldTextareaWrapper = `<div className="absolute bottom-4 right-4 flex items-center justify-between left-4">
                    <span className="text-[11px] text-gray-400 opacity-0">...</span>
                    <div className="flex items-center gap-2">
                      <Mic size={18} className="text-gray-600 hover:text-black cursor-pointer transition-colors" />
                      <span className="text-[11px] text-gray-400">0 / 2000</span>
                    </div>
                  </div>`;
                  
const newTextareaWrapper = `<div className="absolute bottom-4 right-4 flex items-center justify-end">
                    <span className="text-[11px] text-gray-400">{tripDetails.length} / 2000</span>
                  </div>`;
                  
content = content.replace(oldTextareaWrapper, newTextareaWrapper);

// 2. Limit Flexible months to 4 (current + 3 next) dynamically
// In the current code, it's hardcoded as 4 buttons.
const oldMonthsCode = `<div className="text-center">
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
                  </div>`;

const newMonthsCode = `<div className="text-center">
                    <div className="text-[14px] font-bold text-black mb-4">Du lịch bất cứ lúc nào</div>
                    <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-none justify-center px-2">
                      {[0, 1, 2, 3].map(offset => {
                        const d = new Date();
                        d.setMonth(d.getMonth() + offset);
                        const mText = "Tháng " + (d.getMonth() + 1);
                        return (
                          <button key={offset} className="shrink-0 w-24 h-24 border border-gray-200 rounded-2xl flex flex-col items-center justify-center hover:border-black transition-colors bg-white">
                            <Calendar size={20} className="mb-2 text-gray-400" />
                            <span className="text-[13px] font-bold text-black">{mText}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>`;

content = content.replace(oldMonthsCode, newMonthsCode);

// 3. Add "Ở đâu" (Where) modal state and UI
if (!content.includes('const [showWhereModal')) {
  content = content.replace(
    "const [flexibleDays, setFlexibleDays] = useState(5);",
    "const [flexibleDays, setFlexibleDays] = useState(5);\n  const [showWhereModal, setShowWhereModal] = useState(false);\n  const [whereTarget, setWhereTarget] = useState('');\n  const [byCar, setByCar] = useState(false);"
  );
}

// Attach onClick to "Ở đâu" button
const oldWhereBtn = `<button className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-gray-200 hover:border-gray-300 transition-colors bg-white">
                    <span className="text-[13.5px] font-bold text-black">Ở đâu</span>
                    <span className="text-[13px] font-light text-gray-500">Chọn điểm đến</span>
                  </button>`;
const newWhereBtn = `<button onClick={() => setShowWhereModal(true)} className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-gray-200 hover:border-gray-300 transition-colors bg-white">
                    <span className="text-[13.5px] font-bold text-black">Ở đâu</span>
                    <span className="text-[13px] font-light text-gray-500">{whereTarget || 'Chọn điểm đến'}</span>
                  </button>`;
content = content.replace(oldWhereBtn, newWhereBtn);

// Add Where Modal Popup code at the bottom near the other modals
const whereModalCode = `
      {/* WHERE MODAL POPUP */}
      {showWhereModal && (
        <div className="absolute inset-0 z-[110] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-[500px] bg-white rounded-3xl p-6 shadow-2xl mx-4 min-h-[300px] flex flex-col">
             <div className="flex justify-between items-center mb-6">
               <button onClick={() => setShowWhereModal(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100"><X size={18} /></button>
               <div className="text-[16px] font-bold text-black">Ở đâu</div>
               <div className="w-8 h-8"></div>
             </div>

             <div className="relative mb-6">
               <input
                 type="text"
                 placeholder="Vị trí"
                 value={whereTarget}
                 onChange={(e) => setWhereTarget(e.target.value)}
                 className="w-full rounded-full border border-gray-200 px-5 py-3 text-[14px] font-light text-gray-900 focus:border-black focus:outline-none focus:ring-1 focus:ring-black transition-all"
               />
               <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                 <span className="text-[12px] font-bold text-black">Đi du lịch bằng ô tô?</span>
                 <button 
                   onClick={() => setByCar(!byCar)} 
                   className={\`w-9 h-5 rounded-full flex items-center p-0.5 transition-colors \${byCar ? 'bg-black' : 'bg-gray-200'}\`}
                 >
                   <div className={\`w-4 h-4 rounded-full bg-white shadow-sm transition-transform \${byCar ? 'translate-x-4' : 'translate-x-0'}\`}></div>
                 </button>
               </div>
             </div>
             
             <div className="flex gap-2 mb-8 flex-wrap">
               <button onClick={() => setWhereTarget('Huế')} className="px-4 py-1.5 rounded-full border border-gray-200 text-[13px] hover:border-black transition-all text-black">Huế</button>
               <button onClick={() => setWhereTarget('Đà Nẵng')} className="px-4 py-1.5 rounded-full border border-gray-200 text-[13px] hover:border-black transition-all text-black">Đà Nẵng</button>
               <button onClick={() => setWhereTarget('Huế & Đà Nẵng')} className="px-4 py-1.5 rounded-full border border-gray-200 text-[13px] hover:border-black transition-all text-black">Cả 2</button>
             </div>

             <div className="mt-auto flex justify-end">
               <button 
                 onClick={() => setShowWhereModal(false)} 
                 className={\`w-32 font-bold text-[14px] py-3 rounded-full transition-colors \${whereTarget ? 'bg-black text-white hover:bg-gray-900' : 'bg-gray-300 text-white'}\`}
               >
                 Cứu
               </button>
             </div>
          </div>
        </div>
      )}
`;

content = content.replace("      {/* WHEN MODAL POPUP */}", whereModalCode + "\n      {/* WHEN MODAL POPUP */}");

fs.writeFileSync(filePath, content, 'utf8');
console.log('Done');
