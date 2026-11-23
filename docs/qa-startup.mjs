import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('C:/Users/ngoho/Documents/Codex/2026-11-13/b-y/work/qa-runtime/node_modules/playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});const results=[];
for(const width of [1440,320]){
 const page=await browser.newPage({viewport:{width,height:900}});let release;const gate=new Promise(r=>release=r);
 await page.route('**/src/main.tsx',async route=>{await gate;await route.continue();});
 await page.goto('http://localhost:5173/',{waitUntil:'commit'});await page.locator('.app-shell h1').waitFor();
 const image=await page.evaluate(async()=>{const img=new Image();img.src='/images/landing/danang-1400.webp';await img.decode();return {width:img.naturalWidth,background:getComputedStyle(document.querySelector('.app-shell')).backgroundImage,overflow:document.documentElement.scrollWidth>innerWidth};});
 assert(image.width>0);assert(image.background.includes('danang-1400.webp'));assert.equal(image.overflow,false);
 await page.screenshot({path:`D:/ĐỒ ÁN/repo/docs/startup-first-paint-${width}.png`});release();await page.locator('.hero-search').waitFor();assert.equal(await page.locator('.app-shell').count(),0);
 results.push({width,first_paint_image:true,horizontal_overflow:false,react_form_ready:true});await page.close();
}
await writeFile('D:/ĐỒ ÁN/repo/docs/STARTUP_UI.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));await browser.close();
