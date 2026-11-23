import {createRequire} from 'node:module';import assert from 'node:assert/strict';import {readFile,writeFile} from 'node:fs/promises';
const {chromium,request}=createRequire(import.meta.url)('C:/Users/ngoho/Documents/Codex/2026-11-13/b-y/work/qa-runtime/node_modules/playwright');
let raw='';for await(const chunk of process.stdin)raw+=chunk;const credentials=JSON.parse(raw);
const api=await request.newContext({baseURL:'http://127.0.0.1:8000'});const login=await api.post('/auth/login',{data:credentials});assert(login.ok(),'Login failed');const token=(await login.json()).access_token;
const headers={Authorization:'Bearer '+token};const trips=(await (await api.get('/trip-workspaces',{headers})).json()).items;
let trip;
for(const candidate of trips){
 if(candidate.ideas?.length!==5)continue;
 const query=new URLSearchParams();for(const id of candidate.ideas)query.append('ids',id);query.set('limit','100');
 const points=(await (await api.get('/pois?'+query,{headers})).json()).items;
 if(points.some(p=>p.name.startsWith('Angarden'))&&points.some(p=>p.name==='Cơm Hến Bà Cam')){trip=candidate;break;}
}
assert(trip,'No current trip matching the five places in the screenshot');
const cardIndex=trips.filter(t=>t.title===trip.title).indexOf(trip);
const conversations=(await (await api.get('/assistant/conversations?mode=planner&trip_id='+trip.id,{headers})).json()).items;const diagnostic=conversations.find(c=>c.title.startsWith('Tôi cần 3 quán'));
const browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',async route=>{const r=route.request();const u=new URL(r.url());if(u.port==='8000'&&!['GET','HEAD','OPTIONS'].includes(r.method())&&u.pathname!=='/assistant/chat')return route.abort();return route.continue();});
await page.addInitScript(token=>{localStorage.setItem('access_token',token);sessionStorage.setItem('access_token',token);},token);await page.goto('http://localhost:5173/my-trips');await page.getByText(trip.title,{exact:true}).nth(cardIndex).waitFor();await page.getByText(trip.title,{exact:true}).nth(cardIndex).click();await page.getByRole('button',{name:'Hỏi trợ lý AI',exact:true}).click();
const input=page.getByRole('textbox',{name:'Tin nhắn cho trợ lý'});await input.waitFor();await page.waitForFunction(()=>!document.body.innerText.includes('Đang tải hội thoại…'));
if(diagnostic){await page.getByLabel('Chọn hội thoại',{exact:true}).selectOption(String(diagnostic.id));await page.waitForFunction(()=>!document.body.innerText.includes('Đang tải hội thoại…'));}
async function send(message){await input.fill(message);const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/assistant/chat'&&r.request().method()==='POST',{timeout:60000});await page.getByRole('button',{name:'Gửi tin nhắn',exact:true}).click();const r=await response;assert.equal(r.status(),200);const result=await r.json();await page.waitForTimeout(300);return result;}
const ideas=await send('bạn xem cho tôi các ý tưởng tôi đang có gồm những gì rồi');assert.deepEqual(ideas.pois.map(p=>p.id),trip.ideas);assert.equal(ideas.trace.model_calls,0);assert.equal(ideas.trace.route,'rules');await page.screenshot({path:'D:/ĐỒ ÁN/repo/docs/live-ideas-list.png',animations:'disabled'});
const mixed=await send('tôi muốn tìm 3 địa điểm cà phê Huế, và 2 địa điểm chùa');assert.equal(mixed.pois.length,5);assert.equal(new Set(mixed.pois.map(p=>p.id)).size,5);assert(mixed.pois.every(p=>p.city==='Huế'));
const cafes=mixed.pois.filter(p=>/cafe|cà phê|ca phe|coffee/i.test(p.category+' '+p.name));assert.equal(cafes.length,3);const temples=mixed.pois.filter(p=>/chùa|thiền viện/i.test(p.name));assert.equal(temples.length,2);assert.equal(mixed.pois.length-temples.length,3);await page.screenshot({path:'D:/ĐỒ ÁN/repo/docs/live-mixed-five.png',animations:'disabled'});
assert.deepEqual(errors,[]);const results={url:'http://localhost:5173/my-trips',backend:'actual localhost:8000',screenshot_trip_matched:true,saved_ideas:{expected:5,actual:ideas.pois.length,ids_match:true,trace:ideas.trace},mixed:{expected:{cafe:3,temple:2,total:5},actual:{cafe:cafes.length,temple:temples.length,total:mixed.pois.length},trace:mixed.trace,engine:mixed.engine},online_itinerary_writes:'blocked in QA browser'};
await writeFile('D:/ĐỒ ÁN/repo/docs/LIVE_ASSISTANT_CHECK.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));await browser.close();await api.dispose();
