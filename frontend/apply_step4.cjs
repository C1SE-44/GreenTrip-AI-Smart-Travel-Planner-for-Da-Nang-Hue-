const fs = require('fs');
const path = require('path');

const filePath = path.join('d:', 'ĐỒ ÁN', 'Green Trip', 'src', 'components', 'auth', 'OnboardingModal.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add states for step 4
const step4States = `const [companions, setCompanions] = useState<string[]>([]);
  const [budget, setBudget] = useState<string>('');
  const [splurges, setSplurges] = useState<string[]>([]);
  const [otherSplurge, setOtherSplurge] = useState('');`;

if (!content.includes('const [companions')) {
  content = content.replace(
    "const [byCar, setByCar] = useState(false);",
    "const [byCar, setByCar] = useState(false);\n  " + step4States
  );
}

// 2. Change Step 3's Kế tiếp button to go to Step 4
const oldStep3NextBtn = `onClick={onClose}
                      disabled={hasPlan === null}
                      className={\`rounded-full px-8 py-2.5 text-[14px] font-bold text-white transition-all \${hasPlan !== null ? 'bg-black hover:bg-gray-900' : 'bg-[#B0B0B0] cursor-not-allowed'}\`}
                    >
                      Kế tiếp`;
                      
const newStep3NextBtn = `onClick={() => setStep(4)}
                      disabled={hasPlan === null}
                      className={\`rounded-full px-8 py-2.5 text-[14px] font-bold text-white transition-all \${hasPlan !== null ? 'bg-black hover:bg-gray-900' : 'bg-[#B0B0B0] cursor-not-allowed'}\`}
                    >
                      Kế tiếp`;
content = content.replace(oldStep3NextBtn, newStep3NextBtn);

// 3. Add Step 4 UI
const step4UI = `
            {step === 4 && (
              <div className="animate-fadeIn">
                <h2 className="font-heading text-3xl font-extrabold tracking-tight text-black mb-4 leading-tight pr-4">
                  Hãy kể cho tôi một chút về chuyến đi của bạn.
                </h2>
                
                <p className="text-[14px] font-light leading-[1.6] text-gray-700 mb-8">
                  Hãy chia sẻ những điều quan trọng đối với bạn khi đi du lịch.
                </p>

                <div className="space-y-8">
                  {/* Companions */}
                  <div>
                    <label className="mb-3 block text-[13.5px] font-bold text-black">
                      Bạn thường đi du lịch với ai?
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {['Độc lập', 'Cặp đôi', 'Gia đình', 'Bạn'].map(comp => {
                        const isSelected = companions.includes(comp);
                        return (
                          <button
                            key={comp}
                            onClick={() => {
                              if (isSelected) setCompanions(companions.filter(c => c !== comp));
                              else setCompanions([...companions, comp]);
                            }}
                            className={\`px-5 py-2 rounded-full text-[13px] transition-all \${isSelected ? 'bg-white border-2 border-black font-bold text-black' : 'bg-white border border-gray-200 text-black hover:border-gray-400'}\`}
                          >
                            {comp}
                          </button>
                        );
                      })}
                    </div>
                    {companions.includes('Gia đình') && (
                      <div className="mt-4">
                        <label className="mb-3 block text-[13.5px] font-bold text-black">Thêm thành viên gia đình</label>
                        <button className="flex items-center gap-2 px-5 py-2 rounded-full bg-gray-100 text-[13px] hover:bg-gray-200 transition-colors">
                          <Plus size={14} /> Thêm thành viên gia đình
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Budget */}
                  <div>
                    <label className="mb-3 block text-[13.5px] font-bold text-black">
                      Ngân sách du lịch điển hình của bạn thường được mô tả như thế nào?
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {['Với ngân sách hạn chế', '$$ Giá cả hợp lý', '$$$ Cao cấp', '$$$$ Sang trọng'].map(b => (
                        <button
                          key={b}
                          onClick={() => setBudget(b)}
                          className={\`px-5 py-2 rounded-full text-[13px] transition-all \${budget === b ? 'bg-white border-2 border-black font-bold text-black' : 'bg-white border border-gray-200 text-black hover:border-gray-400'}\`}
                        >
                          {b}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Splurges */}
                  <div>
                    <label className="mb-3 block text-[13.5px] font-bold text-black">
                      Bạn thường chi tiêu mạnh tay vào những việc gì?
                    </label>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {['Ở lại', 'Nhà hàng', 'Trải nghiệm', 'Khác'].map(s => {
                        const isSelected = splurges.includes(s);
                        return (
                          <button
                            key={s}
                            onClick={() => {
                              if (isSelected) setSplurges(splurges.filter(i => i !== s));
                              else setSplurges([...splurges, s]);
                            }}
                            className={\`px-5 py-2 rounded-full text-[13px] transition-all \${isSelected ? 'bg-white border-2 border-black font-bold text-black' : 'bg-white border border-gray-200 text-black hover:border-gray-400'}\`}
                          >
                            {s}
                          </button>
                        );
                      })}
                    </div>
                    {splurges.includes('Khác') && (
                      <input
                        type="text"
                        placeholder="Tell us more"
                        value={otherSplurge}
                        onChange={(e) => setOtherSplurge(e.target.value)}
                        className="w-full rounded-full border border-gray-300 px-5 py-2.5 text-[14px] font-light text-gray-900 placeholder:text-gray-400 focus:border-black focus:outline-none focus:ring-1 focus:ring-black transition-all"
                      />
                    )}
                  </div>
                </div>

                {/* Progress and Actions - Step 4 */}
                <div className="mt-12">
                  <div className="mb-5 h-[2px] w-full bg-gray-200">
                    <div className="h-full w-full bg-black transition-all duration-500"></div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <button onClick={() => setStep(3)} className="flex items-center gap-1.5 text-[12px] font-bold text-gray-400 hover:text-black transition-colors">
                      <ChevronLeft size={16} /> Phong cách du lịch
                    </button>
                    <button
                      onClick={onClose}
                      disabled={!budget}
                      className={\`rounded-full px-8 py-2.5 text-[14px] font-bold text-white transition-all \${budget ? 'bg-black hover:bg-gray-900' : 'bg-[#B0B0B0] cursor-not-allowed'}\`}
                    >
                      Hoàn tất
                    </button>
                  </div>
                </div>
              </div>
            )}
`;

content = content.replace("            {step === 3 && (", step4UI + "\n            {step === 3 && (");

// 4. Update the image for Step 4
const oldImg = `<img
            key={step} 
            src={step === 1 
              ? "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&q=80" 
              : "https://images.unsplash.com/photo-1498623116890-37e912163d5d?auto=format&fit=crop&q=80"}
            alt="Travel inspiration"
            className="h-full w-full object-cover animate-fadeIn"
          />`;
const newImg = `<img
            key={step} 
            src={step === 1 
              ? "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&q=80" 
              : step === 2 
                ? "https://images.unsplash.com/photo-1498623116890-37e912163d5d?auto=format&fit=crop&q=80"
                : step === 3
                  ? "https://images.unsplash.com/photo-1506929562872-bb421503ef21?auto=format&fit=crop&q=80"
                  : "https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&q=80"}
            alt="Travel inspiration"
            className="h-full w-full object-cover animate-fadeIn"
          />`;
content = content.replace(oldImg, newImg);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Done');
