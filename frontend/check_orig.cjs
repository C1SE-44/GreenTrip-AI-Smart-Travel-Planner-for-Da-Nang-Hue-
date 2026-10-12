const fs = require('fs');
const { parse } = require('@babel/parser');
const code = fs.readFileSync('src/pages/ExplorePage.tsx', 'utf8');

function check(c) {
  try {
    parse(c, {sourceType: 'module', plugins: ['jsx', 'typescript']});
    return 'OK';
  } catch(e) {
    return e.message;
  }
}

let start = code.indexOf('<div className="flex h-screen');
let end = code.indexOf(');', start);

let jsx = code.substring(start, end);

let wrapped = `function Test() { return ( ${jsx} ); }`;
console.log('Original:', check(wrapped));
