import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const ts=createRequire(import.meta.url)('typescript');
function setup(fetchJson){
 const entries=new Map();const storage={getItem:k=>entries.get(k)||null,setItem:(k,v)=>entries.set(k,v)};
 const exports={};
 const source=readFileSync(new URL('../src/services/itineraryService.ts',import.meta.url),'utf8');
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,localStorage:storage,sessionStorage:storage,console,require:()=>({fetchJson,tripStartDate:()=>null,vietnamNow:()=>({date:'2026-11-17',minutes:600})})});
 return {api:exports,entries};
}

test('A guest cannot read or save cached private itineraries',async()=>{
 let calls=0;const {api,entries}=setup(()=>{calls++;});
 entries.set('greentrip_itinerary_trip-a','{"trip_id":"trip-a","title":"Alice private"}');
 await assert.rejects(api.getTripItinerary('trip-a'),/Đăng nhập/);
 await assert.rejects(api.saveTripItinerary({trip_id:'trip-a',days:[]}),/Đăng nhập/);
 assert.equal(calls,0);
});

test('Forbidden reads never fall back to a browser cache',async()=>{
 const {api,entries}=setup(async()=>{throw Object.assign(new Error('Forbidden'),{status:403});});
 entries.set('access_token','bob');entries.set('greentrip_itinerary_trip-a','{"title":"Alice private"}');
 await assert.rejects(api.getTripItinerary('trip-a'),/Forbidden/);
});

test('A backend save error never becomes a locally successful save',async()=>{
 const {api,entries}=setup(async(_path,init)=>{throw Object.assign(new Error(init?.method==='PUT'?'Save failed':'Missing'),{status:init?.method==='PUT'?500:404});});
 entries.set('access_token','alice');
 await assert.rejects(api.saveTripItinerary({trip_id:'trip-a',days:[],start_date:null}),/Save failed/);
 assert.equal(entries.has('greentrip_itinerary_trip-a'),false);
});

test('Switching account while a read is pending cannot return the previous account response',async()=>{
 let resolveAlice;const calls=[];
 const {api,entries}=setup(async(_path,init)=>{
  calls.push(init.headers.Authorization);
  if(init.headers.Authorization==='Bearer alice')return new Promise(resolve=>{resolveAlice=resolve;});
  return {trip_id:'trip-a',title:'Bob response'};
 });
 entries.set('access_token','alice');
 const old=api.getTripItinerary('trip-a');const rejected=assert.rejects(old,/Tài khoản đã thay đổi/);
 await new Promise(resolve=>setImmediate(resolve));
 entries.set('access_token','bob');
 const current=await api.getTripItinerary('trip-a');assert.equal(current.title,'Bob response');
 resolveAlice({trip_id:'trip-a',title:'Alice private'});await rejected;
 assert.deepEqual(calls,['Bearer alice','Bearer bob']);
});
