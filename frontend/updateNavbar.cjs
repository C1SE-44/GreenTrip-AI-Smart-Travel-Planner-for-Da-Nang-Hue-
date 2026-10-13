const fs = require('fs');
const file = 'd:/ĐỒ ÁN/Green Trip/src/components/layout/Navbar.tsx';
let content = fs.readFileSync(file, 'utf8');

// Add import for LoginModal
if (!content.includes('LoginModal')) {
    content = content.replace(/import Logo from '@\/components\/ui\/Logo';/, "import Logo from '@/components/ui/Logo';\nimport LoginModal from '@/components/auth/LoginModal';");
}

// Add state for modal
if (!content.includes('isLoginOpen')) {
    content = content.replace(/const \[mobileOpen, setMobileOpen\] = useState\(false\);/, "const [mobileOpen, setMobileOpen] = useState(false);\n  const [isLoginOpen, setIsLoginOpen] = useState(false);");
}

// Change Desktop login button
content = content.replace(
    /<Link\s*to="\/login"\s*className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-5 py-2.5 text-sm font-bold text-black transition-all hover:border-gray-300 hover:shadow-sm"\s*>\s*<LogIn size=\{17\} strokeWidth=\{2\.5\} \/>\s*Đăng nhập\s*<\/Link>/,
    `<button
                onClick={() => setIsLoginOpen(true)}
                className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-5 py-2.5 text-sm font-bold text-black transition-all hover:border-gray-300 hover:shadow-sm"
              >
                <LogIn size={17} strokeWidth={2.5} />
                Đăng nhập
              </button>`
);

// Change Mobile login button
content = content.replace(
    /<Link\s*to="\/login"\s*className="flex items-center gap-3 rounded-2xl bg-black px-4 py-3 text-sm font-bold text-white mt-4"\s*>\s*<LogIn size=\{18\} strokeWidth=\{2\.5\} \/>\s*Đăng nhập\s*<\/Link>/,
    `<button
              onClick={() => {
                setMobileOpen(false);
                setIsLoginOpen(true);
              }}
              className="flex w-full items-center gap-3 rounded-2xl bg-black px-4 py-3 text-sm font-bold text-white mt-4"
            >
              <LogIn size={18} strokeWidth={2.5} />
              Đăng nhập
            </button>`
);

// Add the modal component at the end of the return statement before the closing fragment
content = content.replace(/<\/div>\s*\)\}\s*<\/>/, "</div>\n      )}\n\n      <LoginModal isOpen={isLoginOpen} onClose={() => setIsLoginOpen(false)} />\n    </>");

fs.writeFileSync(file, content);
console.log('Updated Navbar');
