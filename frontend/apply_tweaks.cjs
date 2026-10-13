const fs = require('fs');
const path = require('path');

const filePath = path.join('d:', 'ĐỒ ÁN', 'Green Trip', 'src', 'components', 'auth', 'OnboardingModal.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Move everything up (pt-32 -> pt-20)
content = content.replace('className="max-w-[420px] w-full pt-32 pb-16"', 'className="max-w-[420px] w-full pt-20 pb-16"');

// 2. Make progress bar thicker
// The empty part is `h-[2px] w-full bg-gray-200`
content = content.replace(/h-\[2px\] w-full bg-gray-200/g, 'h-1 w-full bg-gray-200 rounded-full overflow-hidden');
// The filled part is `h-full bg-black transition-all duration-500 w-1/6`
content = content.replace(/h-full bg-black transition-all duration-500/g, 'h-full bg-black transition-all duration-500 rounded-full');

// 3. Shorten step 2 title
content = content.replace(
  'Trước khi đi sâu vào vấn đề, bạn muốn cuộc trò chuyện của chúng ta diễn ra như thế nào?',
  'Bạn muốn cuộc trò chuyện của chúng ta diễn ra như thế nào?'
);

// 4. Reduce card padding in Step 2
content = content.replace(
  /w-full text-left rounded-\[20px\] p-5 border/g,
  'w-full text-left rounded-[16px] px-5 py-3.5 border'
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Done');
