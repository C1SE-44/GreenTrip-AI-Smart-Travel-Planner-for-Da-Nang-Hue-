const fs = require('fs');
const path = require('path');

const filePath = path.join('d:', 'ĐỒ ÁN', 'Green Trip', 'src', 'components', 'auth', 'OnboardingModal.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Add mock data above export default function
const mockData = `const MOCK_LOCATIONS = [
  { id: 1, name: 'Đà Nẵng', sub: 'Việt Nam', type: 'image', img: 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=100&h=100&fit=crop' },
  { id: 2, name: 'Đà Lạt', sub: 'Lâm Đồng, Việt Nam', type: 'image', img: 'https://images.unsplash.com/photo-1623067866504-20412b1898fb?w=100&h=100&fit=crop' },
  { id: 3, name: 'Dallas', sub: 'Texas, Hoa Kỳ', type: 'image', img: 'https://images.unsplash.com/photo-1542838686-37ed7a7ef3f3?w=100&h=100&fit=crop' },
  { id: 4, name: 'Dakar', sub: 'Senegal', type: 'image', img: 'https://images.unsplash.com/photo-1523805009345-7448845a9e53?w=100&h=100&fit=crop' }
];

export default function OnboardingModal`;

content = content.replace('export default function OnboardingModal', mockData);

// Add states
content = content.replace(
  "const [city, setCity] = useState('');",
  "const [city, setCity] = useState('');\n  const [showSuggestions, setShowSuggestions] = useState(false);"
);

// Add filter logic
const filterLogic = `const isFormValid = firstName.trim() !== '' && lastName.trim() !== '' && city.trim() !== '';

  const filteredLocations = MOCK_LOCATIONS.filter(loc => 
    loc.name.toLowerCase().includes(city.toLowerCase()) || loc.sub.toLowerCase().includes(city.toLowerCase())
  );

  const renderHighlightedText = (text: string, highlight: string) => {
    if (!highlight.trim()) return text;
    const parts = text.split(new RegExp(\`(\${highlight})\`, 'gi'));
    return parts.map((part, i) => 
      part.toLowerCase() === highlight.toLowerCase() ? <strong key={i} className="font-bold text-black">{part}</strong> : part
    );
  };`;

content = content.replace("const isFormValid = firstName.trim() !== '' && lastName.trim() !== '' && city.trim() !== '';", filterLogic);

// Replace City Field UI
const oldCityField = `{/* City Field */}
              <div>
                <label className="mb-3 block text-[13px] font-bold text-black">
                  Bạn sống ở đâu?
                </label>
                <input
                  type="text"
                  placeholder="Thành phố"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full rounded-full border border-gray-200 px-5 py-3 text-[14px] font-light text-gray-900 placeholder:text-gray-400 focus:border-black focus:outline-none focus:ring-1 focus:ring-black transition-all"
                />
              </div>`;

const newCityField = `{/* City Field */}
              <div className="relative">
                {/* Dropdown Suggestions */}
                {showSuggestions && city && filteredLocations.length > 0 && (
                  <div className="absolute bottom-full left-0 w-full mb-3 rounded-2xl border border-gray-200 bg-white shadow-xl py-2 z-20 max-h-[240px] overflow-y-auto">
                    {/* First generic suggestion */}
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
                    
                    {/* Location matches */}
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
              </div>`;

content = content.replace(oldCityField, newCityField);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Done');
