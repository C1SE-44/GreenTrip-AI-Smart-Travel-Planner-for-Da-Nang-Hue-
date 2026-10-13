const fs = require('fs');
const path = require('path');

const filePath = path.join('d:', 'ĐỒ ÁN', 'Green Trip', 'src', 'components', 'auth', 'OnboardingModal.tsx');
let content = fs.readFileSync(filePath, 'utf8');

const newMockLocations = `const MOCK_LOCATIONS = [
  { id: 1, name: 'Đà Nẵng', sub: 'Việt Nam', type: 'image', img: 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=100&h=100&fit=crop' },
  { id: 2, name: 'Đà Lạt', sub: 'Lâm Đồng, Việt Nam', type: 'image', img: 'https://images.unsplash.com/photo-1623067866504-20412b1898fb?w=100&h=100&fit=crop' },
  { id: 3, name: 'Dallas', sub: 'Texas, Hoa Kỳ', type: 'image', img: 'https://images.unsplash.com/photo-1542838686-37ed7a7ef3f3?w=100&h=100&fit=crop' },
  { id: 4, name: 'Dakar', sub: 'Senegal', type: 'image', img: 'https://images.unsplash.com/photo-1523805009345-7448845a9e53?w=100&h=100&fit=crop' },
  { id: 5, name: 'Hà Nội', sub: 'Việt Nam', type: 'image', img: 'https://images.unsplash.com/photo-1599839619722-39751411ea63?w=100&h=100&fit=crop' },
  { id: 6, name: 'Hồ Chí Minh', sub: 'Việt Nam', type: 'image', img: 'https://images.unsplash.com/photo-1583417319070-4a69db38a482?w=100&h=100&fit=crop' },
  { id: 7, name: 'Hội An', sub: 'Quảng Nam, Việt Nam', type: 'image', img: 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=100&h=100&fit=crop' },
  { id: 8, name: 'Huế', sub: 'Thừa Thiên Huế, Việt Nam', type: 'image', img: 'https://images.unsplash.com/photo-1600861194942-f883de0bce24?w=100&h=100&fit=crop' },
  { id: 9, name: 'Hạ Long', sub: 'Quảng Ninh, Việt Nam', type: 'image', img: 'https://images.unsplash.com/photo-1528127269322-539801943592?w=100&h=100&fit=crop' },
  { id: 10, name: 'Nha Trang', sub: 'Khánh Hòa, Việt Nam', type: 'image', img: 'https://images.unsplash.com/photo-1588667500591-6679549f3e4f?w=100&h=100&fit=crop' },
  { id: 11, name: 'Ninh Bình', sub: 'Việt Nam', type: 'image', img: 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=100&h=100&fit=crop' },
  { id: 12, name: 'New York', sub: 'New York, Hoa Kỳ', type: 'image', img: 'https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?w=100&h=100&fit=crop' },
  { id: 13, name: 'Tokyo', sub: 'Nhật Bản', type: 'image', img: 'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=100&h=100&fit=crop' },
  { id: 14, name: 'London', sub: 'Vương quốc Anh', type: 'image', img: 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=100&h=100&fit=crop' },
  { id: 15, name: 'Paris', sub: 'Pháp', type: 'image', img: 'https://images.unsplash.com/photo-1502602898657-3e90760b3844?w=100&h=100&fit=crop' },
  { id: 16, name: 'Phú Quốc', sub: 'Kiên Giang, Việt Nam', type: 'image', img: 'https://images.unsplash.com/photo-1602001923146-24e5d5904fc7?w=100&h=100&fit=crop' },
  { id: 17, name: 'Sapa', sub: 'Lào Cai, Việt Nam', type: 'image', img: 'https://images.unsplash.com/photo-1600861194942-f883de0bce24?w=100&h=100&fit=crop' },
  { id: 18, name: 'Hải Phòng', sub: 'Việt Nam', type: 'image', img: 'https://images.unsplash.com/photo-1599839619722-39751411ea63?w=100&h=100&fit=crop' }
];`;

content = content.replace(/const MOCK_LOCATIONS = \[[^\]]+\];/, newMockLocations);

const filterLogic = `const removeAccents = (str: string) => {
    return str.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
  };

  const filteredLocations = MOCK_LOCATIONS.filter(loc => {
    const search = removeAccents(city);
    return removeAccents(loc.name).includes(search) || removeAccents(loc.sub).includes(search);
  });

  const renderHighlightedText = (text: string, highlight: string) => {
    if (!highlight.trim()) return text;
    
    const search = removeAccents(highlight);
    const unaccentedText = removeAccents(text);
    
    // Nếu tìm thấy ở đầu câu (rất phổ biến khi gõ chữ)
    if (unaccentedText.startsWith(search)) {
      let originalIndex = 0;
      let searchIndex = 0;
      while (searchIndex < search.length && originalIndex < text.length) {
         if (removeAccents(text[originalIndex]) !== '') searchIndex++;
         originalIndex++;
      }
      return <><strong className="font-bold text-black">{text.substring(0, originalIndex)}</strong>{text.substring(originalIndex)}</>;
    }
    
    // Tìm kiếm thông thường
    const strictRegex = new RegExp(\`(\${highlight})\`, 'gi');
    if (strictRegex.test(text)) {
      const parts = text.split(strictRegex);
      return parts.map((part, i) => 
        part.toLowerCase() === highlight.toLowerCase() ? <strong key={i} className="font-bold text-black">{part}</strong> : part
      );
    }
    
    return text;
  };`;

content = content.replace(/const filteredLocations = MOCK_LOCATIONS\.filter\([\s\S]*?renderHighlightedText[\s\S]*?\}\;\s*\};/m, filterLogic);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Done');
