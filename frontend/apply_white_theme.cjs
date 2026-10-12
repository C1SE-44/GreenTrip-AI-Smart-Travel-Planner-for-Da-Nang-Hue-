const fs = require('fs');

let f = fs.readFileSync('src/pages/LandingPage.tsx', 'utf8');

// Backgrounds
f = f.replace(/bg-cream/g, 'bg-white');
f = f.replace(/from-cream/g, 'from-white');
f = f.replace(/via-cream\/90/g, 'via-white/90');
f = f.replace(/to-\[\#dce0e5\]/g, 'to-gray-100'); // If cream goes to white, the bottom gradient to gray-200 or gray-100 is better

// The tags and borders
f = f.replace(/bg-beige/g, 'bg-gray-100');
f = f.replace(/border-beige/g, 'border-gray-100');

// Text (keep as is or change to white)
f = f.replace(/text-cream/g, 'text-white');
f = f.replace(/text-cream\/80/g, 'text-white/80');
f = f.replace(/text-cream\/50/g, 'text-white/50');

fs.writeFileSync('src/pages/LandingPage.tsx', f, 'utf8');
