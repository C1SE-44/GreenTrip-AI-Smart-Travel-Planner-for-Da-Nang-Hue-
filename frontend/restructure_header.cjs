const fs = require('fs');
const path = require('path');

const filePath = path.join('d:', 'ĐỒ ÁN', 'Green Trip', 'src', 'components', 'auth', 'OnboardingModal.tsx');
let content = fs.readFileSync(filePath, 'utf8');

const splitIndex = content.indexOf('return createPortal(');
const beforeReturn = content.substring(0, splitIndex);

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

        {/* STATIC HEADER AREA - NEVER MOVES */}
        <div className="w-full max-w-[420px] mx-auto pt-20 px-4 lg:px-0 shrink-0">
          <div className="mb-6 flex h-10 w-10 items-center justify-center rounded-full bg-black">
            <Leaf size={20} strokeWidth={2.5} className="text-white" />
          </div>

          <h2 className={\`font-heading font-extrabold tracking-tight text-black mb-4 leading-tight pr-4 \${step === 7 ? 'text-4xl' : 'text-3xl'}\`}>
            {step === 1 && "Xin chào, tôi là trợ lý du lịch của bạn."}
            {step === 2 && "Trước khi đi sâu vào vấn đề, bạn muốn cuộc trò chuyện của chúng ta diễn ra như thế nào?"}
            {step === 3 && "Bạn đã có kế hoạch cho chuyến đi nào chưa?"}
            {step === 4 && "Hãy kể cho tôi một chút về chuyến đi của bạn."}
            {step === 5 && "Hãy chia sẻ một chút về sở thích ăn uống của bạn."}
            {step === 6 && "Tóm lại"}
            {step === 7 && "Bạn đã sẵn sàng"}
          </h2>

          {step === 1 && (
            <p className="text-[14px] font-light leading-[1.6] text-gray-700 mb-6">
              Để cá nhân hóa trải nghiệm và đề xuất lịch trình phù hợp nhất, hãy chia sẻ một vài thông tin cơ bản về bạn.
            </p>
          )}
          {step === 4 && (
            <p className="text-[14px] font-light leading-[1.6] text-gray-700 mb-6">
              Hãy chia sẻ những điều quan trọng đối với bạn khi đi du lịch.
            </p>
          )}
          {step === 7 && (
            <p className="text-[14px] font-light leading-[1.6] text-gray-700 mb-6 max-w-[360px]">
              Tôi sẽ sử dụng những gì bạn đã chia sẻ để đưa ra những đề xuất cá nhân hóa hơn trong tương lai, và tôi sẽ tiếp tục học hỏi khi bạn sử dụng GreenTrip. Chúng ta cùng bắt đầu nhé!
            </p>
          )}
        </div>

        {/* SCROLLABLE CONTENT AREA */}
        <div className="flex-1 w-full max-w-[420px] mx-auto px-4 lg:px-0 pb-12 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] overflow-y-auto flex flex-col">
          
          <div className="flex-1">
            {step === 1 && (
              <div className="animate-fadeIn space-y-8">
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

                <div className="relative">
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
            )}

            {step === 2 && (
              <div className="animate-fadeIn">
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
              </div>
            )}

            {step === 3 && (
              <div className="animate-fadeIn">
                <div className="flex gap-3 mb-6">
                  <button
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
                  </button>
                </div>

                {hasPlan === true && (
                  <div className="animate-fadeIn">
                    <div className="relative mb-6">
                      <textarea
                        placeholder="5-day Tokyo trip this Octob"
                        value={tripDetails}
                        onChange={(e) => setTripDetails(e.target.value)}
                        className="w-full rounded-[16px] border border-gray-200 p-4 text-[14px] font-light text-gray-900 placeholder:text-gray-400 focus:border-black focus:outline-none focus:ring-1 focus:ring-black transition-all resize-none h-28"
                      />
                      <div className="absolute bottom-4 right-4 flex items-center justify-end">
                        <span className="text-[11px] text-gray-400">{tripDetails.length} / 2000</span>
                      </div>
                    </div>

                    <p className="text-[13px] text-gray-500 mb-3">Bạn có thông tin chi tiết? Hãy chia sẻ những gì bạn biết.</p>

                    <div className="space-y-3">
                      <button onClick={() => setShowWhereModal(true)} className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-gray-200 hover:border-gray-300 transition-colors bg-white">
                        <span className="text-[13.5px] font-bold text-black">Ở đâu</span>
                        <span className="text-[13px] font-light text-gray-500">{whereTarget || 'Chọn điểm đến'}</span>
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
                  </div>
                )}
              </div>
            )}

            {step === 4 && (
              <div className="animate-fadeIn space-y-8">
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
                </div>

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
            )}

            {step === 5 && (
              <div className="animate-fadeIn space-y-8">
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
            )}

            {step === 6 && (
              <div className="animate-fadeIn space-y-8">
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
            )}

            {step === 7 && (
              <div className="animate-fadeIn mt-4">
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
          </div>

          {/* PROGRESS BARS AND BUTTONS FOR ALL STEPS EXCEPT 7 */}
          {step < 7 && (
            <div className="mt-12 shrink-0">
              <div className="mb-5 h-[2px] w-full bg-gray-200">
                <div className={\`h-full bg-black transition-all duration-500 \${
                  step === 1 ? 'w-1/6' : 
                  step === 2 ? 'w-2/6' : 
                  step === 3 ? 'w-3/6' : 
                  step === 4 ? 'w-4/6' : 
                  step === 5 ? 'w-5/6' : 'w-full'
                }\`}></div>
              </div>
              
              <div className="flex items-center justify-between">
                {step === 1 ? (
                  <span className="text-[12px] font-bold text-gray-400">Cơ bản</span>
                ) : (
                  <button 
                    onClick={() => setStep(step - 1)} 
                    className="flex items-center gap-1.5 text-[12px] font-bold text-gray-400 hover:text-black transition-colors"
                  >
                    <ChevronLeft size={16} /> 
                    {step === 2 && "Cá tính"}
                    {step === 3 && "Chuyến đi tiếp theo của bạn"}
                    {step === 4 && "Phong cách du lịch"}
                    {step === 5 && "Sở thích ăn uống"}
                    {step === 6 && "Tóm lại"}
                  </button>
                )}

                <button
                  onClick={() => {
                    if (step === 1) setStep(2);
                    else if (step === 2) setStep(3);
                    else if (step === 3) setStep(4);
                    else if (step === 4) setStep(5);
                    else if (step === 5) setStep(6);
                    else if (step === 6) setStep(7);
                  }}
                  disabled={
                    (step === 1 && !isFormValid) ||
                    (step === 3 && hasPlan === null) ||
                    (step === 4 && !budget)
                  }
                  className={\`rounded-full px-8 py-2.5 text-[14px] font-bold text-white transition-all \${
                    (step === 1 && !isFormValid) || (step === 3 && hasPlan === null) || (step === 4 && !budget)
                      ? 'bg-[#B0B0B0] cursor-not-allowed'
                      : 'bg-black hover:bg-gray-900'
                  }\`}
                >
                  Kế tiếp
                </button>
              </div>
            </div>
          )}

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
    </div>,
    document.body
  );
}`;

content = content.replace(beforeReturn, beforeReturn);
const splitIndexFixed = content.indexOf('return createPortal(');
const beforeReturnFixed = content.substring(0, splitIndexFixed);
const afterReturnFixed = content.substring(splitIndexFixed);

// Since there are multiple modals in the document after return createPortal, 
// I need to be careful to inject the modals properly.
// The easiest way is to append the modals to the end of the new return, before the closing bracket.
const modalsMatch = afterReturnFixed.match(/\{\/\* WHO MODAL POPUP \*\/\}[\s\S]*/);
const existingModals = modalsMatch ? modalsMatch[0] : '';
// wait, existingModals contains the closing `</div>, document.body); }`
// so I need to remove that from my newReturn

const finalReturnString = newReturn.replace('    </div>,\n    document.body\n  );\n}', '') + "\n" + (existingModals || '    </div>,\n    document.body\n  );\n}');

fs.writeFileSync(filePath, beforeReturnFixed + finalReturnString, 'utf8');
console.log('Done');
