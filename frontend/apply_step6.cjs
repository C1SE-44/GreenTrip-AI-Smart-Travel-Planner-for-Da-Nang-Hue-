const fs = require('fs');
const path = require('path');

const filePath = path.join('d:', 'ĐỒ ÁN', 'Green Trip', 'src', 'components', 'auth', 'OnboardingModal.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add states for Step 6
const step6States = `const [activities, setActivities] = useState<string[]>([]);
  const [otherActivity, setOtherActivity] = useState('');
  const [finalNotes, setFinalNotes] = useState('');`;

if (!content.includes('const [activities')) {
  content = content.replace(
    "const [otherDiet, setOtherDiet] = useState('');",
    "const [otherDiet, setOtherDiet] = useState('');\n  " + step6States
  );
}

// 2. Adjust progress bars for all steps
// Step 1: w-1/4 -> w-1/6
content = content.replace('className="h-full w-1/4 bg-black transition-all duration-500"', 'className="h-full w-1/6 bg-black transition-all duration-500"');
// Step 2: w-2/4 -> w-2/6
content = content.replace('className="h-full w-2/4 bg-black transition-all duration-500"', 'className="h-full w-2/6 bg-black transition-all duration-500"');
// Step 3: w-3/4 -> w-3/6
content = content.replace('className="h-full w-3/4 bg-black transition-all duration-500"', 'className="h-full w-3/6 bg-black transition-all duration-500"');
// Step 4: w-4/5 -> w-4/6
content = content.replace('className="h-full w-4/5 bg-black transition-all duration-500"', 'className="h-full w-4/6 bg-black transition-all duration-500"');
// Step 5: w-full -> w-5/6
content = content.replace(
  `{/* Progress and Actions - Step 5 */}
                <div className="mt-12">
                  <div className="mb-5 h-[2px] w-full bg-gray-200">
                    <div className="h-full w-full bg-black transition-all duration-500"></div>
                  </div>`,
  `{/* Progress and Actions - Step 5 */}
                <div className="mt-12">
                  <div className="mb-5 h-[2px] w-full bg-gray-200">
                    <div className="h-full w-5/6 bg-black transition-all duration-500"></div>
                  </div>`
);

// 3. Step 5's Kế tiếp button -> goes to step 6
const oldStep5NextBtn = `onClick={onClose}
                      className="rounded-full px-8 py-2.5 text-[14px] font-bold text-white transition-all bg-black hover:bg-gray-900"
                    >
                      Kế tiếp`;
const newStep5NextBtn = `onClick={() => setStep(6)}
                      className="rounded-full px-8 py-2.5 text-[14px] font-bold text-white transition-all bg-black hover:bg-gray-900"
                    >
                      Kế tiếp`;
content = content.replace(oldStep5NextBtn, newStep5NextBtn);


// 4. Add Step 6 UI
const step6UI = `
            {step === 6 && (
              <div className="animate-fadeIn">
                <h2 className="font-heading text-3xl font-extrabold tracking-tight text-black mb-8 leading-tight pr-4">
                  Tóm lại
                </h2>

                <div className="space-y-8">
                  {/* Activities */}
                  <div>
                    <label className="mb-4 block text-[13.5px] font-bold text-black">
                      Bạn thích giải trí như thế nào vào cuối tuần?
                    </label>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {['Ngoài trời', 'Nhạc sống', 'Nghệ thuật và bảo tàng', 'Quán bar & cuộc sống về đêm', 'Trò chơi thể thao', 'Sự thích hợp', 'Mua sắm', 'Phim & rạp chiếu phim', 'Chương trình hài kịch', 'Chăm sóc sức khỏe & spa', 'Khác'].map(a => {
                        const isSelected = activities.includes(a);
                        return (
                          <button
                            key={a}
                            onClick={() => {
                              if (isSelected) setActivities(activities.filter(i => i !== a));
                              else setActivities([...activities, a]);
                            }}
                            className={\`px-5 py-2 rounded-full text-[13px] transition-all \${isSelected ? 'bg-white border-2 border-black font-bold text-black' : 'bg-white border border-gray-200 text-gray-700 hover:border-gray-400'}\`}
                          >
                            {a}
                          </button>
                        );
                      })}
                    </div>
                    {activities.includes('Khác') && (
                      <input
                        type="text"
                        placeholder="Tell us more"
                        value={otherActivity}
                        onChange={(e) => setOtherActivity(e.target.value)}
                        className="w-full rounded-full border border-gray-300 px-5 py-2.5 text-[14px] font-light text-gray-900 placeholder:text-gray-400 focus:border-black focus:outline-none focus:ring-1 focus:ring-black transition-all"
                      />
                    )}
                  </div>

                  {/* Final Notes */}
                  <div>
                    <label className="mb-4 block text-[13.5px] font-bold text-black leading-[1.6]">
                      Còn điều gì cần làm rõ hoặc những điều cuối cùng mà tôi cần biết với tư cách là trợ lý du lịch cá nhân của bạn không?
                    </label>
                    <textarea
                      value={finalNotes}
                      onChange={(e) => setFinalNotes(e.target.value)}
                      className="w-full rounded-[16px] border border-gray-200 p-4 text-[14px] font-light text-gray-900 focus:border-black focus:outline-none focus:ring-1 focus:ring-black transition-all resize-none h-28"
                    />
                  </div>
                </div>

                {/* Progress and Actions - Step 6 */}
                <div className="mt-12">
                  <div className="mb-5 h-[2px] w-full bg-gray-200">
                    <div className="h-full w-full bg-black transition-all duration-500"></div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <button onClick={() => setStep(5)} className="flex items-center gap-1.5 text-[12px] font-bold text-gray-400 hover:text-black transition-colors">
                      <ChevronLeft size={16} /> Tóm lại
                    </button>
                    <button
                      onClick={onClose}
                      className="rounded-full px-8 py-2.5 text-[14px] font-bold text-white transition-all bg-black hover:bg-gray-900"
                    >
                      Kế tiếp
                    </button>
                  </div>
                </div>
              </div>
            )}
`;
content = content.replace("            {step === 5 && (", step6UI + "\n            {step === 5 && (");

// 5. Update Step 1-6 Images
const oldImg = `<img
            key={step} 
            src={step === 1 
              ? "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&q=80" 
              : step === 2 
                ? "https://images.unsplash.com/photo-1498623116890-37e912163d5d?auto=format&fit=crop&q=80"
                : step === 3
                  ? "https://images.unsplash.com/photo-1506929562872-bb421503ef21?auto=format&fit=crop&q=80"
                  : step === 4
                    ? "https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&q=80"
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
                  : step === 4
                    ? "https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&q=80"
                    : step === 5
                      ? "https://images.unsplash.com/photo-1498623116890-37e912163d5d?auto=format&fit=crop&q=80"
                      : "https://images.unsplash.com/photo-1506929562872-bb421503ef21?auto=format&fit=crop&q=80"}
            alt="Travel inspiration"
            className="h-full w-full object-cover animate-fadeIn"
          />`;

content = content.replace(oldImg, newImg);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Done');
