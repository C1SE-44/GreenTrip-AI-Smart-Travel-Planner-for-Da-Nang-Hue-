const fs = require('fs');
const { parse } = require('@babel/parser');
const code = fs.readFileSync('src/pages/ExplorePage.tsx', 'utf8');

function check(c) {
  try {
    parse(c, {sourceType: 'module', plugins: ['jsx', 'typescript']});
    return true;
  } catch(e) {
    return false;
  }
}

// binary search to find the problematic component part
let start = code.indexOf('<div className="flex h-screen');
let end = code.indexOf(');', start);

let jsx = code.substring(start, end);

// let's try replacing sidebarHtml with empty string
let jsxNoSidebar = jsx.replace(/<aside[\s\S]*?<\/aside>/, '');
let wrapped1 = `function Test() { return ( ${jsxNoSidebar} ); }`;
console.log('No sidebar:', check(wrapped1));

let jsxNoMain = jsx.replace(/<main[\s\S]*?<\/main>/, '');
let wrapped2 = `function Test() { return ( ${jsxNoMain} ); }`;
console.log('No main:', check(wrapped2));
