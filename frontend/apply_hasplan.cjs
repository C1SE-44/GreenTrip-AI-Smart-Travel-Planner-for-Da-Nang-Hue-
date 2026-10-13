const fs = require('fs');
const path = require('path');

const filePath = path.join('d:', 'ĐỒ ÁN', 'Green Trip', 'src', 'components', 'auth', 'OnboardingModal.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Change state initialization
content = content.replace(
  "const [hasPlan, setHasPlan] = useState(true);",
  "const [hasPlan, setHasPlan] = useState<boolean | null>(null);"
);

// 2. Wrap the detailed inputs
const oldUIStart = `<div className="relative mb-6">
                  <textarea`;
const newUIStart = `{hasPlan === true && (
                  <div className="animate-fadeIn">
                    <div className="relative mb-6">
                      <textarea`;

const oldUIEnd = `Ai</span>
                    <span className="text-[13px] font-light text-gray-500">{adults + children + infants + pets > 0 ? \`\${adults + children + infants + pets} du khách\` : 'Thêm người'}</span>
                  </button>
                </div>`;
const newUIEnd = `Ai</span>
                    <span className="text-[13px] font-light text-gray-500">{adults + children + infants + pets > 0 ? \`\${adults + children + infants + pets} du khách\` : 'Thêm người'}</span>
                  </button>
                </div>
              </div>
            )}`;

content = content.replace(oldUIStart, newUIStart);
content = content.replace(oldUIEnd, newUIEnd);

// 3. Update the Kế tiếp button for Step 3 to be disabled when null
const oldNextBtn = `onClick={onClose}
                      className="rounded-full bg-black px-8 py-2.5 text-[14px] font-bold text-white hover:bg-gray-900 transition-all"`;
const newNextBtn = `onClick={onClose}
                      disabled={hasPlan === null}
                      className={\`rounded-full px-8 py-2.5 text-[14px] font-bold text-white transition-all \${hasPlan !== null ? 'bg-black hover:bg-gray-900' : 'bg-[#B0B0B0] cursor-not-allowed'}\`}`;

// Wait, the "Kế tiếp" button in step 3 might be targeted correctly, but there are multiple "Kế tiếp" buttons maybe?
// Actually, I only want to replace the one in step 3. Let's do it safely.
// In Step 3, the button is below: <ChevronLeft size={16} /> Chuyến đi tiếp theo của bạn
const oldFooterBtn = `<button onClick={() => setStep(2)} className="flex items-center gap-1.5 text-[12px] font-bold text-gray-400 hover:text-black transition-colors">
                      <ChevronLeft size={16} /> Chuyến đi tiếp theo của bạn
                    </button>
                    <button
                      onClick={onClose}
                      className="rounded-full bg-black px-8 py-2.5 text-[14px] font-bold text-white hover:bg-gray-900 transition-all"
                    >
                      Kế tiếp
                    </button>`;

const newFooterBtn = `<button onClick={() => setStep(2)} className="flex items-center gap-1.5 text-[12px] font-bold text-gray-400 hover:text-black transition-colors">
                      <ChevronLeft size={16} /> Chuyến đi tiếp theo của bạn
                    </button>
                    <button
                      onClick={onClose}
                      disabled={hasPlan === null}
                      className={\`rounded-full px-8 py-2.5 text-[14px] font-bold text-white transition-all \${hasPlan !== null ? 'bg-black hover:bg-gray-900' : 'bg-[#B0B0B0] cursor-not-allowed'}\`}
                    >
                      Kế tiếp
                    </button>`;

content = content.replace(oldFooterBtn, newFooterBtn);

// 4. Update the Đúng / Không buttons to handle null cleanly
const oldBtnContainer = `<button
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
                  </button>`;
                  
const newBtnContainer = `<button
                    onClick={() => setHasPlan(true)}
                    className={\`px-6 py-2 rounded-full text-[13px] font-bold transition-all \${hasPlan === true ? 'bg-black text-white' : 'border border-gray-200 text-black hover:border-gray-300'}\`}
                  >
                    Đúng
                  </button>
                  <button
                    onClick={() => setHasPlan(false)}
                    className={\`px-6 py-2 rounded-full text-[13px] font-bold transition-all \${hasPlan === false ? 'bg-black text-white' : 'border border-gray-200 text-black hover:border-gray-300'}\`}
                  >
                    KHÔNG
                  </button>`;

content = content.replace(oldBtnContainer, newBtnContainer);


fs.writeFileSync(filePath, content, 'utf8');
console.log('Done');
