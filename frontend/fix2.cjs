const fs = require('fs');

let f = fs.readFileSync('src/components/auth/OnboardingModal.tsx', 'utf8');

// Find the end of the root div.
// It looks like:
//       </div>
//     </div>{/* WHO MODAL POPUP */}
// Let's replace it so that WHO MODAL POPUP is inside the root div.
f = f.replace(/<\/div>\s*<\/div>\{\/\* WHO MODAL POPUP \*\/\}/, '</div>\n{/* WHO MODAL POPUP */}');

// And at the very end of the file, we need to make sure the root div is closed.
// Let's just find the last modal's closing tag and add `</div>, document.body); }`
f = f.replace(/<\/div>\s*\)\}\s*<\/div>,\s*document\.body\s*\);\s*\}\s*$/, '</div>\n      )}\n    </div>,\n    document.body\n  );\n}\n');

fs.writeFileSync('src/components/auth/OnboardingModal.tsx', f, 'utf8');
