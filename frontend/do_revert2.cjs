const fs = require('fs');
const path = require('path');

const filePath = path.join('d:', 'ĐỒ ÁN', 'Green Trip', 'src', 'components', 'auth', 'OnboardingModal.tsx');
let content = fs.readFileSync(filePath, 'utf8');

const splitIndex = content.indexOf('return createPortal(');
const beforeReturn = content.substring(0, splitIndex);

// Re-read from a known structure
const afterReturnFixed = content.substring(splitIndex);

// I will extract the blocks manually using match All
const step1Code = content.match(/<label className="mb-3 block text-\[13px\] font-bold text-black">\s*Tên của bạn là gì\?[\s\S]*?(?=\{\s*step === 2)/)[0];
const step2Code = content.match(/<label className="mb-4 block text-\[15px\] font-bold text-black">\s*Nhân cách[\s\S]*?(?=\{\s*step === 3)/)[0];
const step3Code = content.match(/<button\s*onClick=\{\(\) => setHasPlan\(true\)\}[\s\S]*?(?=\{\s*step === 4)/)[0];
const step4Code = content.match(/<label className="mb-3 block text-\[13\.5px\] font-bold text-black">\s*Bạn thường đi du lịch với ai\?[\s\S]*?(?=\{\s*step === 5)/)[0];
const step5Code = content.match(/<label className="mb-4 block text-\[13\.5px\] font-bold text-black">\s*Bạn thích loại nhà hàng nào\?[\s\S]*?(?=\{\s*step === 6)/)[0];
const step6Code = content.match(/<label className="mb-4 block text-\[13\.5px\] font-bold text-black">\s*Bạn thích giải trí như thế nào vào cuối tuần\?[\s\S]*?(?=\{\s*step === 7)/)[0];
const step7Code = content.match(/<div className="min-h-\[60px\]">[\s\S]*?(?=<\/div>\s*\{\/\* PROGRESS BARS)/)[0];

const footerMatch = content.match(/\{\/\* PROGRESS BARS AND BUTTONS FOR ALL STEPS EXCEPT 7 \*\/\}[\s\S]*?(?=\s*<\/div>\s*<\/div>\s*\{\/\* Right Column)/);
const footerCode = footerMatch ? footerMatch[0] : '';

const modalsMatch = afterReturnFixed.match(/\{\/\* WHO MODAL POPUP \*\/\}[\s\S]*/);
const existingModals = modalsMatch ? modalsMatch[0] : '';

const clean = (str) => {
    // Strip trailing closing div tags from step matches
    let res = str.replace(/<\/div>\s*<\/div>\s*$/, '');
    res = res.replace(/<\/div>\s*$/, '');
    return res;
};

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
                <div className="animate-fadeIn space-y-8">
                  \${clean(step1Code)}
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="animate-fadeIn">
                <h2 className="font-heading text-3xl font-extrabold tracking-tight text-black mb-8 leading-tight pr-4">
                  Trước khi đi sâu vào vấn đề, bạn muốn cuộc trò chuyện của chúng ta diễn ra như thế nào?
                </h2>
                <div className="animate-fadeIn">
                  \${clean(step2Code)}
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="animate-fadeIn">
                <h2 className="font-heading text-3xl font-extrabold tracking-tight text-black mb-6 leading-tight pr-4">
                  Bạn đã có kế hoạch cho chuyến đi nào chưa?
                </h2>
                <div className="flex gap-3 mb-6">
                  \${clean(step3Code)}
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="animate-fadeIn">
                <h2 className="font-heading text-3xl font-extrabold tracking-tight text-black mb-4 leading-tight pr-4">
                  Hãy kể cho tôi một chút về chuyến đi của bạn.
                </h2>
                <p className="text-[14px] font-light leading-[1.6] text-gray-700 mb-8">
                  Hãy chia sẻ những điều quan trọng đối với bạn khi đi du lịch.
                </p>
                <div className="animate-fadeIn space-y-8">
                  \${clean(step4Code)}
                </div>
              </div>
            )}

            {step === 5 && (
              <div className="animate-fadeIn">
                <h2 className="font-heading text-3xl font-extrabold tracking-tight text-black mb-8 leading-tight pr-4">
                  Hãy chia sẻ một chút về sở thích ăn uống của bạn.
                </h2>
                <div className="animate-fadeIn space-y-8">
                  \${clean(step5Code)}
                </div>
              </div>
            )}

            {step === 6 && (
              <div className="animate-fadeIn">
                <h2 className="font-heading text-3xl font-extrabold tracking-tight text-black mb-8 leading-tight pr-4">
                  Tóm lại
                </h2>
                <div className="animate-fadeIn space-y-8">
                  \${clean(step6Code)}
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
                \${clean(step7Code)}
              </div>
            )}

            \${footerCode}
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

fs.writeFileSync(filePath, beforeReturn + newReturn + "\\n" + existingModals, 'utf8');
console.log('Done');
