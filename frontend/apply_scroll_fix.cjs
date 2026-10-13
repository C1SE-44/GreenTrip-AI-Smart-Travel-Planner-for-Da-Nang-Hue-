const fs = require('fs');
const path = require('path');

const filePath = path.join('d:', 'ĐỒ ÁN', 'Green Trip', 'src', 'components', 'auth', 'OnboardingModal.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Import useRef
if (!content.includes('useRef')) {
  content = content.replace("import { useEffect, useState } from 'react';", "import { useEffect, useState, useRef } from 'react';");
}

// 2. Add ref and useEffect
const hookCode = `const [mounted, setMounted] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo(0, 0);
    }
  }, [step]);`;
  
content = content.replace("const [mounted, setMounted] = useState(false);", hookCode);

// 3. Attach ref to the scrollable container
const oldContainer = `<div className="flex-1 flex flex-col px-10 lg:px-24 w-full max-w-2xl mx-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] overflow-y-auto">`;
const newContainer = `<div ref={scrollRef} className="flex-1 flex flex-col px-10 lg:px-24 w-full max-w-2xl mx-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] overflow-y-auto">`;

content = content.replace(oldContainer, newContainer);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Done');
