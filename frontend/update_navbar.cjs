const fs = require('fs');
const path = require('path');

const filePath = path.join('d:', 'ĐỒ ÁN', 'Green Trip', 'src', 'components', 'layout', 'Navbar.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Add import
content = content.replace(
  "import LoginModal from '@/components/auth/LoginModal';",
  "import LoginModal from '@/components/auth/LoginModal';\nimport OnboardingModal from '@/components/auth/OnboardingModal';"
);

// Add state
content = content.replace(
  "const [isLoginOpen, setIsLoginOpen] = useState(false);",
  "const [isLoginOpen, setIsLoginOpen] = useState(false);\n  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);"
);

// Add modal component and prop
content = content.replace(
  "<LoginModal isOpen={isLoginOpen} onClose={() => setIsLoginOpen(false)} />",
  `<LoginModal isOpen={isLoginOpen} onClose={() => setIsLoginOpen(false)} onRegisterSuccess={() => setIsOnboardingOpen(true)} />
      <OnboardingModal isOpen={isOnboardingOpen} onClose={() => setIsOnboardingOpen(false)} />`
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Done');
