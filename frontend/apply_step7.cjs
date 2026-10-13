const fs = require('fs');
const path = require('path');

const filePath = path.join('d:', 'ĐỒ ÁN', 'Green Trip', 'src', 'components', 'auth', 'OnboardingModal.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add isReady state and useEffect for Step 7
const stateCode = `const [isReady, setIsReady] = useState(false);
  
  useEffect(() => {
    if (step === 7) {
      const timer = setTimeout(() => setIsReady(true), 2500);
      return () => clearTimeout(timer);
    }
  }, [step]);`;
  
if (!content.includes('const [isReady')) {
  content = content.replace(
    "const [finalNotes, setFinalNotes] = useState('');",
    "const [finalNotes, setFinalNotes] = useState('');\n  " + stateCode
  );
}

// 2. Change Step 6 Next Button to go to Step 7
const oldStep6NextBtn = `onClick={onClose}
                      className="rounded-full px-8 py-2.5 text-[14px] font-bold text-white transition-all bg-black hover:bg-gray-900"
                    >
                      Kế tiếp`;
const newStep6NextBtn = `onClick={() => setStep(7)}
                      className="rounded-full px-8 py-2.5 text-[14px] font-bold text-white transition-all bg-black hover:bg-gray-900"
                    >
                      Kế tiếp`;
content = content.replace(oldStep6NextBtn, newStep6NextBtn);

// 3. Add Step 7 UI
const step7UI = `
            {step === 7 && (
              <div className="animate-fadeIn mt-10">
                <h2 className="font-heading text-4xl font-extrabold tracking-tight text-black mb-6 leading-tight pr-4">
                  Bạn đã sẵn sàng
                </h2>
                
                <p className="text-[14px] font-light leading-[1.6] text-gray-700 mb-8 max-w-[360px]">
                  Tôi sẽ sử dụng những gì bạn đã chia sẻ để đưa ra những đề xuất cá nhân hóa hơn trong tương lai, và tôi sẽ tiếp tục học hỏi khi bạn sử dụng GreenTrip. Chúng ta cùng bắt đầu nhé!
                </p>

                <div className="min-h-[60px]">
                  {!isReady ? (
                    <div className="flex gap-2 items-center">
                      <div className="w-2.5 h-2.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }}></div>
                      <div className="w-2.5 h-2.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }}></div>
                      <div className="w-2.5 h-2.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }}></div>
                    </div>
                  ) : (
                    <button
                      onClick={onClose}
                      className="rounded-full px-8 py-3 text-[14px] font-bold text-white transition-all bg-black hover:bg-gray-900 animate-fadeIn"
                    >
                      Let's go
                    </button>
                  )}
                </div>
              </div>
            )}
`;
content = content.replace("            {step === 6 && (", step7UI + "\n            {step === 6 && (");

// 4. Update Images for Step 7
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
                    : step === 5
                      ? "https://images.unsplash.com/photo-1498623116890-37e912163d5d?auto=format&fit=crop&q=80"
                      : "https://images.unsplash.com/photo-1506929562872-bb421503ef21?auto=format&fit=crop&q=80"}
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
                      : step === 6
                        ? "https://images.unsplash.com/photo-1506929562872-bb421503ef21?auto=format&fit=crop&q=80"
                        : "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&q=80"}
            alt="Travel inspiration"
            className="h-full w-full object-cover animate-fadeIn"
          />`;

content = content.replace(oldImg, newImg);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Done');
