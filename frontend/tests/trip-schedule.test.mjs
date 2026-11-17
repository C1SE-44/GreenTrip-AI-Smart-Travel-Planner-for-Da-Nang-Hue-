import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const ts=createRequire(import.meta.url)('typescript');
function load(mocks){const exports={};const source=readFileSync(new URL('../src/services/tripSchedule.ts',import.meta.url),'utf8');vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:()=>mocks});return exports;}
const trip={id:'trip-a',startDate:'2026-11-17',daysCount:3};
test('Date change reads current saved stops and waits for metadata before completing',async()=>{
 const events=[];let finish;const plan={days:[{stops:[{poi_id:'saved-stop'}]}]};
 const api=load({getTripItinerary:async()=>{events.push('read');return plan;},alignItineraryToTrip:p=>({itinerary:p}),saveTripItinerary:async p=>{events.push('itinerary');return p;},saveTripWorkspace:()=>new Promise(r=>{events.push('metadata');finish=r;})});
 let done=false;const pending=api.saveTripSchedule(trip).then(r=>{done=true;return r;});
 await new Promise(r=>setImmediate(r));assert.equal(done,false);assert.deepEqual(events,['read','itinerary','metadata']);finish({...trip,workspaceRevision:2});const result=await pending;assert.equal(result.trip.workspaceRevision,2);assert.equal(result.itinerary.days[0].stops[0].poi_id,'saved-stop');
});
test('Read failures do not create and overwrite an empty schedule',async()=>{
 let writes=0;const api=load({getTripItinerary:async()=>{throw Object.assign(new Error('Unavailable'),{status:503});},createEmptyItinerary:()=>assert.fail('Must not replace failed read'),saveTripItinerary:()=>writes++});
 await assert.rejects(api.saveTripSchedule(trip),/Unavailable/);assert.equal(writes,0);
});
test('A metadata save failure is not reported as a completed date change',async()=>{
 const api=load({getTripItinerary:async()=>({days:[]}),alignItineraryToTrip:p=>({itinerary:p}),saveTripItinerary:async p=>p,saveTripWorkspace:async()=>{throw new Error('Metadata failed');}});
 await assert.rejects(api.saveTripSchedule(trip),/Metadata failed/);
});
