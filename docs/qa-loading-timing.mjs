import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('C:/Users/ngoho/Documents/Codex/2026-11-13/b-y/work/qa-runtime/node_modules/playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage();const start=Date.now();
page.on('response',r=>{if(r.url().startsWith('http://localhost:5173')&&Date.now()-start>2000)console.log(Date.now()-start,r.status(),new URL(r.url()).pathname.slice(0,120));});
await page.goto('http://localhost:5173',{waitUntil:'domcontentloaded'});console.log('DOMContentLoaded',Date.now()-start);
await page.locator('.hero-search').waitFor();console.log('Hero form',Date.now()-start);
await page.screenshot({path:'D:/ĐỒ ÁN/repo/docs/loading-before.png'});await browser.close();
