const fs = require('fs');
const path = require('path');

const filePath = path.join('d:', 'ĐỒ ÁN', 'Green Trip', 'src', 'pages', 'LandingPage.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Update titles (3 lines instead of 4)
content = content.replace(/>Học hỏi<br \/>phong<br \/>cách<br \/>của bạn\.</g, ">Học hỏi<br />phong cách<br />của bạn.");
content = content.replace(/>Tối ưu<br \/>hóa mọi<br \/>quyết<br \/>định\.</g, ">Tối ưu hóa<br />mọi quyết<br />định.");
content = content.replace(/>Thích nghi<br \/>với nhịp<br \/>đập<br \/>xanh\.</g, ">Thích nghi<br />với nhịp<br />đập xanh.");

// 2. Increase border radius of feature cards by 25% (16px to 20px)
content = content.replace(/rounded-2xl border border-white\/60/g, "rounded-[24px] border border-white/60");

// 3. Move the tabs down
// Currently: <div className="mb-8 flex flex-wrap gap-3">
// Let's add a large top margin to push it down in the flex container
content = content.replace(/<div className="mb-8 flex flex-wrap gap-3">/g, '<div className="mt-16 mb-8 flex flex-wrap gap-3">');

fs.writeFileSync(filePath, content, 'utf8');
console.log("Done");
