const fs = require('fs');
let f = fs.readFileSync('src/pages/ExplorePage.tsx', 'utf8');

// 1. Import Logo
if (!f.includes('import Logo')) {
  f = f.replace("import { Link } from 'react-router-dom';", "import { Link } from 'react-router-dom';\nimport Logo from '@/components/ui/Logo';");
}

// 2. Replace the custom logo div with the Logo component
const customLogoRegex = /<Link to="\/" className="flex items-center gap-2 mb-10 px-2 transition-opacity hover:opacity-80">[\s\S]*?<\/Link>/;

const properLogo = `<Link to="/" className="mb-10 px-2 transition-opacity hover:opacity-80 block">
            <Logo size="md" />
          </Link>`;

f = f.replace(customLogoRegex, properLogo);

fs.writeFileSync('src/pages/ExplorePage.tsx', f, 'utf8');
