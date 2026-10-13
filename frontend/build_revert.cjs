const fs = require('fs');
const path = require('path');

const filePath = path.join('d:', 'ĐỒ ÁN', 'Green Trip', 'src', 'components', 'auth', 'OnboardingModal.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// I will just use regex to extract the step contents from the current file,
// then reconstruct the old layout.

// 1. Get the step blocks
const step1Match = content.match(/\{step === 1 && \(\s*<div className="animate-fadeIn space-y-8">([\s\S]*?)<\/div>\s*\)\}/);
const step2Match = content.match(/\{step === 2 && \(\s*<div className="animate-fadeIn">([\s\S]*?)(?=\{step === 3)/);
const step3Match = content.match(/\{step === 3 && \(\s*<div className="animate-fadeIn">([\s\S]*?)(?=\{step === 4)/);
const step4Match = content.match(/\{step === 4 && \(\s*<div className="animate-fadeIn space-y-8">([\s\S]*?)(?=\{step === 5)/);
const step5Match = content.match(/\{step === 5 && \(\s*<div className="animate-fadeIn space-y-8">([\s\S]*?)(?=\{step === 6)/);
const step6Match = content.match(/\{step === 6 && \(\s*<div className="animate-fadeIn space-y-8">([\s\S]*?)(?=\{step === 7)/);
const step7Match = content.match(/\{step === 7 && \(\s*<div className="animate-fadeIn mt-4">([\s\S]*?)(?=<\/div>\s*\{\/\* PROGRESS BARS)/);

const footerMatch = content.match(/\{\/\* PROGRESS BARS AND BUTTONS FOR ALL STEPS EXCEPT 7 \*\/\}[\s\S]*?(?=<\/div>\s*<\/div>\s*\{\/\* Right Column)/);

// I will rebuild the oldReturn
const newReturn = `return createPortal(
    <div className="fixed inset-0 z-[100] flex bg-white animate-fadeIn h-screen w-screen overflow-hidden">
      {/* Left Column (Content) */}
      <div className="relative flex w-full lg:w-1/2 flex-col h-full bg-white">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-6 left-6 z-10 flex h-10 w-10 items-center justify-center rounded-full hover:bg-gray-100 transition-colors text-black"
        >
          <X size={20} strokeWidth={2} />
        </button>

        <div className="flex-1 flex flex-col px-10 lg:px-24 w-full max-w-2xl mx-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] overflow-y-auto">
          
          <div className="max-w-[420px] w-full pt-32 pb-16">
            <div className="mb-6 flex h-10 w-10 items-center justify-center rounded-full bg-black">
              <Leaf size={20} strokeWidth={2.5} className="text-white" />
            </div>

            {step === 1 && (
              <div className="animate-fadeIn">
                <h2 className="font-heading text-3xl font-extrabold tracking-tight text-black mb-4 leading-tight pr-4">
                  Xin chào, tôi là trợ lý du lịch của bạn.
                </h2>
                <p className="text-[14px] font-light leading-[1.6] text-gray-700 mb-8">
                  Để cá nhân hóa trải nghiệm và đề xuất lịch trình phù hợp nhất, hãy chia sẻ một vài thông tin cơ bản về bạn.
                </p>
                <div className="space-y-8">
                  \${step1Match ? step1Match[1] : ''}
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="animate-fadeIn">
                <h2 className="font-heading text-3xl font-extrabold tracking-tight text-black mb-8 leading-tight pr-4">
                  Trước khi đi sâu vào vấn đề, bạn muốn cuộc trò chuyện của chúng ta diễn ra như thế nào?
                </h2>
                \${step2Match ? step2Match[1] : ''}
            )}

            {step === 3 && (
              <div className="animate-fadeIn">
                <h2 className="font-heading text-3xl font-extrabold tracking-tight text-black mb-6 leading-tight pr-4">
                  Bạn đã có kế hoạch cho chuyến đi nào chưa?
                </h2>
                \${step3Match ? step3Match[1] : ''}
            )}

            {step === 4 && (
              <div className="animate-fadeIn">
                <h2 className="font-heading text-3xl font-extrabold tracking-tight text-black mb-4 leading-tight pr-4">
                  Hãy kể cho tôi một chút về chuyến đi của bạn.
                </h2>
                <p className="text-[14px] font-light leading-[1.6] text-gray-700 mb-8">
                  Hãy chia sẻ những điều quan trọng đối với bạn khi đi du lịch.
                </p>
                <div className="space-y-8">
                  \${step4Match ? step4Match[1] : ''}
                </div>
              </div>
            )}

            {step === 5 && (
              <div className="animate-fadeIn">
                <h2 className="font-heading text-3xl font-extrabold tracking-tight text-black mb-8 leading-tight pr-4">
                  Hãy chia sẻ một chút về sở thích ăn uống của bạn.
                </h2>
                <div className="space-y-8">
                  \${step5Match ? step5Match[1] : ''}
                </div>
              </div>
            )}

            {step === 6 && (
              <div className="animate-fadeIn">
                <h2 className="font-heading text-3xl font-extrabold tracking-tight text-black mb-8 leading-tight pr-4">
                  Tóm lại
                </h2>
                <div className="space-y-8">
                  \${step6Match ? step6Match[1] : ''}
                </div>
              </div>
            )}

            {step === 7 && (
              <div className="animate-fadeIn mt-10">
                <h2 className="font-heading text-4xl font-extrabold tracking-tight text-black mb-6 leading-tight pr-4">
                  Bạn đã sẵn sàng
                </h2>
                <p className="text-[14px] font-light leading-[1.6] text-gray-700 mb-8 max-w-[360px]">
                  Tôi sẽ sử dụng những gì bạn đã chia sẻ để đưa ra những đề xuất cá nhân hóa hơn trong tương lai, và tôi sẽ tiếp tục học hỏi khi bạn sử dụng GreenTrip. Chúng ta cùng bắt đầu nhé!
                </p>
                \${step7Match ? step7Match[1] : ''}
            )}

            \${footerMatch ? footerMatch[0] : ''}

          </div>
        </div>
      </div>

      {/* Right Column (Image) - Hidden on mobile */}
      <div className="hidden lg:block lg:w-1/2 p-4 pl-0">
        <div className="h-full w-full overflow-hidden rounded-[32px] bg-gray-100">
          <img
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
          />
        </div>
      </div>
    </div>`;

const splitIndex = content.indexOf('return createPortal(');
const beforeReturn = content.substring(0, splitIndex);
const afterReturnFixed = content.substring(splitIndex);

const modalsMatch = afterReturnFixed.match(/\{\/\* WHO MODAL POPUP \*\/\}[\s\S]*/);
const existingModals = modalsMatch ? modalsMatch[0] : '';

const finalReturnString = newReturn + "\\n" + (existingModals || '    </div>,\\n    document.body\\n  );\\n}');

fs.writeFileSync('d:\\\\ĐỒ ÁN\\\\Green Trip\\\\revert_header.cjs', \`const fs = require('fs');
fs.writeFileSync(
  'd:\\\\ĐỒ ÁN\\\\Green Trip\\\\src\\\\components\\\\auth\\\\OnboardingModal.tsx',
  \`\${beforeReturn}\${finalReturnString}\`,
  'utf8'
);\`, 'utf8');
console.log('Script built');
