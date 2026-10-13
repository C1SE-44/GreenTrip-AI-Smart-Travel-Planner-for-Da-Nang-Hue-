const fs = require('fs');
const path = require('path');

const filePath = path.join('d:', 'ĐỒ ÁN', 'Green Trip', 'src', 'components', 'auth', 'OnboardingModal.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Remove "Thêm thành viên gia đình" from Step 4
const famBlock = `{companions.includes('Gia đình') && (
                      <div className="mt-4">
                        <label className="mb-3 block text-[13.5px] font-bold text-black">Thêm thành viên gia đình</label>
                        <button className="flex items-center gap-2 px-5 py-2 rounded-full bg-gray-100 text-[13px] hover:bg-gray-200 transition-colors">
                          <Plus size={14} /> Thêm thành viên gia đình
                        </button>
                      </div>
                    )}`;
content = content.replace(famBlock, '');

// 2. Change Step 4's progress bar (from w-full to 4/5) and Next button
const oldStep4Progress = `<div className="h-full w-full bg-black transition-all duration-500"></div>`;
const newStep4Progress = `<div className="h-full w-4/5 bg-black transition-all duration-500"></div>`;
content = content.replace(oldStep4Progress, newStep4Progress);

const oldStep4NextBtn = `onClick={onClose}
                      disabled={!budget}
                      className={\`rounded-full px-8 py-2.5 text-[14px] font-bold text-white transition-all \${budget ? 'bg-black hover:bg-gray-900' : 'bg-[#B0B0B0] cursor-not-allowed'}\`}
                    >
                      Hoàn tất`;
const newStep4NextBtn = `onClick={() => setStep(5)}
                      disabled={!budget}
                      className={\`rounded-full px-8 py-2.5 text-[14px] font-bold text-white transition-all \${budget ? 'bg-black hover:bg-gray-900' : 'bg-[#B0B0B0] cursor-not-allowed'}\`}
                    >
                      Kế tiếp`;
content = content.replace(oldStep4NextBtn, newStep4NextBtn);

// 3. Add Step 5 States
const step5States = `const [restaurants, setRestaurants] = useState<string[]>([]);
  const [otherRestaurant, setOtherRestaurant] = useState('');
  const [diets, setDiets] = useState<string[]>([]);
  const [otherDiet, setOtherDiet] = useState('');`;
if (!content.includes('const [restaurants')) {
  content = content.replace(
    "const [otherSplurge, setOtherSplurge] = useState('');",
    "const [otherSplurge, setOtherSplurge] = useState('');\n  " + step5States
  );
}

// 4. Add Step 5 UI
const step5UI = `
            {step === 5 && (
              <div className="animate-fadeIn">
                <h2 className="font-heading text-3xl font-extrabold tracking-tight text-black mb-8 leading-tight pr-4">
                  Hãy chia sẻ một chút về sở thích ăn uống của bạn.
                </h2>

                <div className="space-y-8">
                  {/* Restaurants */}
                  <div>
                    <label className="mb-4 block text-[13.5px] font-bold text-black">
                      Bạn thích loại nhà hàng nào?
                    </label>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {['Ẩm thực cao cấp & món ngon', 'Đồ ăn đường phố địa phương', 'Quán cà phê/quán ăn nhỏ', 'Nhà hàng gia đình', 'Quán ăn chay/thuần chay', 'Xe bán đồ ăn lưu động', 'Ẩm thực dân tộc', 'Từ nông trại đến bàn ăn', 'Thức ăn nhanh', 'Đồ ăn quán rượu/quán bar', 'Tiệm bánh', 'Quán cà phê', 'Khác'].map(r => {
                        const isSelected = restaurants.includes(r);
                        return (
                          <button
                            key={r}
                            onClick={() => {
                              if (isSelected) setRestaurants(restaurants.filter(i => i !== r));
                              else setRestaurants([...restaurants, r]);
                            }}
                            className={\`px-5 py-2 rounded-full text-[13px] transition-all flex items-center gap-2 \${isSelected ? 'bg-white border-2 border-black font-bold text-black' : 'bg-white border border-gray-200 text-gray-700 hover:border-gray-400'}\`}
                          >
                            {r}
                          </button>
                        );
                      })}
                    </div>
                    {restaurants.includes('Khác') && (
                      <input
                        type="text"
                        placeholder="Tell us more"
                        value={otherRestaurant}
                        onChange={(e) => setOtherRestaurant(e.target.value)}
                        className="w-full rounded-full border border-gray-300 px-5 py-2.5 text-[14px] font-light text-gray-900 placeholder:text-gray-400 focus:border-black focus:outline-none focus:ring-1 focus:ring-black transition-all"
                      />
                    )}
                  </div>

                  {/* Diets */}
                  <div>
                    <label className="mb-4 block text-[13.5px] font-bold text-black">
                      Bạn có bất kỳ hạn chế nào về chế độ ăn uống mà tôi cần biết không?
                    </label>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {['Không chứa gluten', 'Không chứa sữa', 'Người ăn chay', 'Thuần chay', 'Người ăn chay trường (chỉ ăn cá)', 'Halal', 'Kosher', 'Khác'].map(d => {
                        const isSelected = diets.includes(d);
                        return (
                          <button
                            key={d}
                            onClick={() => {
                              if (isSelected) setDiets(diets.filter(i => i !== d));
                              else setDiets([...diets, d]);
                            }}
                            className={\`px-5 py-2 rounded-full text-[13px] transition-all \${isSelected ? 'bg-white border-2 border-black font-bold text-black' : 'bg-white border border-gray-200 text-gray-700 hover:border-gray-400'}\`}
                          >
                            {d}
                          </button>
                        );
                      })}
                    </div>
                    {diets.includes('Khác') && (
                      <input
                        type="text"
                        placeholder="Tell us more"
                        value={otherDiet}
                        onChange={(e) => setOtherDiet(e.target.value)}
                        className="w-full rounded-full border border-gray-300 px-5 py-2.5 text-[14px] font-light text-gray-900 placeholder:text-gray-400 focus:border-black focus:outline-none focus:ring-1 focus:ring-black transition-all"
                      />
                    )}
                  </div>
                </div>

                {/* Progress and Actions - Step 5 */}
                <div className="mt-12">
                  <div className="mb-5 h-[2px] w-full bg-gray-200">
                    <div className="h-full w-full bg-black transition-all duration-500"></div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <button onClick={() => setStep(4)} className="flex items-center gap-1.5 text-[12px] font-bold text-gray-400 hover:text-black transition-colors">
                      <ChevronLeft size={16} /> Sở thích ăn uống
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
content = content.replace("            {step === 4 && (", step5UI + "\n            {step === 4 && (");

// 5. Update Step 1-5 Images
const oldImg = `<img
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
                    : "https://images.unsplash.com/photo-1498623116890-37e912163d5d?auto=format&fit=crop&q=80"}
            alt="Travel inspiration"
            className="h-full w-full object-cover animate-fadeIn"
          />`;
content = content.replace(oldImg, newImg);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Done');
