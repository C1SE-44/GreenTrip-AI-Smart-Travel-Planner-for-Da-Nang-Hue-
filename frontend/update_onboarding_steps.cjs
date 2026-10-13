const fs = require('fs');
const path = require('path');

const filePath = path.join('d:', 'ĐỒ ÁN', 'Green Trip', 'src', 'components', 'auth', 'OnboardingModal.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Add ChevronLeft to lucide imports
content = content.replace("import { Leaf, X, MapPin } from 'lucide-react';", "import { Leaf, X, MapPin, ChevronLeft } from 'lucide-react';");

// Add step state and personality state
content = content.replace(
  "const [showSuggestions, setShowSuggestions] = useState(false);",
  "const [showSuggestions, setShowSuggestions] = useState(false);\n  const [step, setStep] = useState(1);\n  const [personality, setPersonality] = useState('binh_thuong');"
);

// Replace the return block entirely
const returnRegex = /return createPortal\([\s\S]*\}\;/;

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

        {/* Content Area - Fixed top padding so Logo never moves */}
        <div className="flex-1 flex flex-col px-10 lg:px-24 w-full max-w-2xl mx-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] overflow-y-auto">
          
          <div className="max-w-[420px] w-full pt-32 pb-16">
            {/* Logo / Icon */}
            <div className="mb-6 flex h-10 w-10 items-center justify-center rounded-full bg-black">
              <Leaf size={20} strokeWidth={2.5} className="text-white" />
            </div>

            {step === 1 && (
              <>
                <h2 className="font-heading text-3xl font-extrabold tracking-tight text-black mb-4 leading-tight">
                  Xin chào, tôi là trợ lý du lịch của bạn.
                </h2>
                
                <p className="text-[14px] font-light leading-[1.6] text-gray-700 mb-10">
                  Để cá nhân hóa trải nghiệm và đề xuất lịch trình phù hợp nhất, hãy chia sẻ một vài thông tin cơ bản về bạn.
                </p>

                {/* Form */}
                <div className="space-y-8">
                  {/* Name Fields */}
                  <div>
                    <label className="mb-3 block text-[13px] font-bold text-black">
                      Tên của bạn là gì?
                    </label>
                    <div className="flex gap-4">
                      <input
                        type="text"
                        placeholder="Tên"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className="w-full rounded-full border border-gray-200 px-5 py-3 text-[14px] font-light text-gray-900 placeholder:text-gray-400 focus:border-black focus:outline-none focus:ring-1 focus:ring-black transition-all"
                      />
                      <input
                        type="text"
                        placeholder="Họ"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        className="w-full rounded-full border border-gray-200 px-5 py-3 text-[14px] font-light text-gray-900 placeholder:text-gray-400 focus:border-black focus:outline-none focus:ring-1 focus:ring-black transition-all"
                      />
                    </div>
                  </div>

                  {/* City Field */}
                  <div className="relative">
                    {/* Dropdown Suggestions */}
                    {showSuggestions && city && filteredLocations.length > 0 && (
                      <div className="absolute bottom-full left-0 w-full mb-3 rounded-2xl border border-gray-200 bg-white shadow-xl py-2 z-20 max-h-[240px] overflow-y-auto">
                        <button 
                          onClick={() => { setCity(city); setShowSuggestions(false); }}
                          className="w-full px-4 py-2.5 hover:bg-gray-50 flex items-center gap-4 text-left transition-colors"
                        >
                          <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                            <MapPin size={18} className="text-gray-600" />
                          </div>
                          <div className="text-[14px] font-light text-gray-900 truncate">
                            {renderHighlightedText(\`Khu vực \${city}\`, city)}
                          </div>
                        </button>
                        
                        {filteredLocations.map(loc => (
                          <button 
                            key={loc.id}
                            onClick={() => { setCity(loc.name); setShowSuggestions(false); }}
                            className="w-full px-4 py-2.5 hover:bg-gray-50 flex items-center gap-4 text-left transition-colors"
                          >
                            <img src={loc.img} alt={loc.name} className="w-10 h-10 rounded-lg object-cover shrink-0" />
                            <div className="text-[14px] font-light text-gray-900 truncate">
                              {renderHighlightedText(loc.name, city)}, <span className="text-gray-500">{renderHighlightedText(loc.sub, city)}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}

                    <label className="mb-3 block text-[13px] font-bold text-black">
                      Bạn sống ở đâu?
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Thành phố"
                        value={city}
                        onChange={(e) => {
                          setCity(e.target.value);
                          setShowSuggestions(true);
                        }}
                        onFocus={() => setShowSuggestions(true)}
                        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                        className="w-full rounded-full border border-gray-200 px-5 py-3 pr-12 text-[14px] font-light text-gray-900 placeholder:text-gray-400 focus:border-black focus:outline-none focus:ring-1 focus:ring-black transition-all"
                      />
                      {city && (
                        <button 
                          onClick={() => { setCity(''); setShowSuggestions(false); }}
                          className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center justify-center w-5 h-5 rounded-full bg-gray-200 hover:bg-gray-300 text-gray-600 transition-colors"
                        >
                          <X size={12} strokeWidth={3} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                
                {/* Progress and Actions - Step 1 */}
                <div className="mt-16">
                  <div className="mb-5 h-[2px] w-full bg-gray-200">
                    <div className="h-full w-1/4 bg-black transition-all duration-500"></div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-bold text-gray-400">Cơ bản</span>
                    <button
                      disabled={!isFormValid}
                      onClick={() => setStep(2)}
                      className={\`rounded-full px-8 py-2.5 text-[14px] font-bold transition-all \${
                        isFormValid 
                          ? 'bg-black text-white hover:bg-gray-900' 
                          : 'bg-[#B0B0B0] text-white cursor-not-allowed'
                      }\`}
                    >
                      Tiếp theo
                    </button>
                  </div>
                </div>
              </>
            )}

            {step === 2 && (
              <div className="animate-fadeIn">
                <h2 className="font-heading text-3xl font-extrabold tracking-tight text-black mb-8 leading-tight pr-4">
                  Trước khi đi sâu vào vấn đề, bạn muốn cuộc trò chuyện của chúng ta diễn ra như thế nào?
                </h2>
                
                {/* Personality Options */}
                <div>
                  <label className="mb-4 block text-[15px] font-bold text-black">
                    Nhân cách
                  </label>
                  <div className="space-y-3">
                    <button
                      onClick={() => setPersonality('binh_thuong')}
                      className={\`w-full text-left rounded-[20px] p-5 border transition-all \${personality === 'binh_thuong' ? 'border-black ring-1 ring-black' : 'border-gray-200 hover:border-gray-300'}\`}
                    >
                      <div className="font-bold text-black text-[14px] mb-1">Bình thường</div>
                      <div className="text-[13px] text-gray-500 font-light">Vui vẻ, coi việc lập kế hoạch là một hoạt động thú vị.</div>
                    </button>
                    
                    <button
                      onClick={() => setPersonality('trung_lap')}
                      className={\`w-full text-left rounded-[20px] p-5 border transition-all \${personality === 'trung_lap' ? 'border-black ring-1 ring-black' : 'border-gray-200 hover:border-gray-300'}\`}
                    >
                      <div className="font-bold text-black text-[14px] mb-1">Trung lập</div>
                      <div className="text-[13px] text-gray-500 font-light">Rõ ràng, mạch lạc, hữu ích. Có chính kiến khi được hỏi, không nịnh hót.</div>
                    </button>

                    <button
                      onClick={() => setPersonality('chuyen_nghiep')}
                      className={\`w-full text-left rounded-[20px] p-5 border transition-all \${personality === 'chuyen_nghiep' ? 'border-black ring-1 ring-black' : 'border-gray-200 hover:border-gray-300'}\`}
                    >
                      <div className="font-bold text-black text-[14px] mb-1">Chuyên nghiệp</div>
                      <div className="text-[13px] text-gray-500 font-light">Có năng lực và hiệu quả. Thân thiện nhưng không quá thân mật.</div>
                    </button>
                  </div>
                </div>

                {/* Progress and Actions - Step 2 */}
                <div className="mt-16">
                  <div className="mb-5 h-[2px] w-full bg-gray-200">
                    <div className="h-full w-2/4 bg-black transition-all duration-500"></div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <button onClick={() => setStep(1)} className="flex items-center gap-1.5 text-[12px] font-bold text-gray-400 hover:text-black transition-colors">
                      <ChevronLeft size={16} /> Cá tính
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

          </div>
        </div>
      </div>

      {/* Right Column (Image) - Hidden on mobile */}
      <div className="hidden lg:block lg:w-1/2 p-4 pl-0">
        <div className="h-full w-full overflow-hidden rounded-[32px] bg-gray-100">
          <img
            key={step} // Force re-render image when step changes for fade effect
            src={step === 1 
              ? "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&q=80" 
              : "https://images.unsplash.com/photo-1498623116890-37e912163d5d?auto=format&fit=crop&q=80"}
            alt="Travel inspiration"
            className="h-full w-full object-cover animate-fadeIn"
          />
        </div>
      </div>
    </div>,
    document.body
  );
}`;

content = content.replace(returnRegex, newReturn);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Done');
