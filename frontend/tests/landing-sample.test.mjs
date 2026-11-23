import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const ts = createRequire(import.meta.url)('typescript');
function load(file, dependencies={}, globals={}) {
  const exports={};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(`../src/${file}`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {exports,require:name=>{if(!(name in dependencies)) throw Error(`Unexpected ${name}`);return dependencies[name];},URL,AbortController,console,crypto:globalThis.crypto,...globals});
  return exports;
}
const model=load('data/landingSampleModel.ts');
const dates=load('utils/tripDates.ts');
const pois=load('data/pois.ts');
const image=load('utils/poiImage.ts');
const raw=(id,city='Đà Nẵng',category='Di tích lịch sử và văn hóa')=>({id,name:`Place ${id}`,city,category,latitude:city==='Huế'?16.46:16.06,longitude:city==='Huế'?107.59:108.22,description:'Mô tả thực',image_url:'https://example.test/photo.jpg',satisfaction_score:4.7});
const adapter=load('services/landingCatalogue.ts',{'@/services/poi':{getPois:async()=>({items:[]})},'@/data/pois':pois,'@/utils/poiImage':image,'@/data/landingSampleModel':model});
const catalogue=['Đà Nẵng','Huế'].flatMap((city,c)=>Array.from({length:20},(_,i)=>adapter.cataloguePlace(raw(`${c}-${i}`,city,['Di tích lịch sử và văn hóa','Ẩm thực và quán ăn','Tâm linh & Tôn giáo','Cảnh quan và thiên nhiên'][i%4]))));
test('Presets use real IDs without duplicates, with correct cities and days',()=>{
  for(const destination of ['danang','hue','danang-hue']) for(const days of model.getSupportedDurationsForDestination(destination)) {
    const preset=model.findSamplePreset(catalogue,destination,days);
    assert.equal(preset.daysPlan.length,days);
    const ids=preset.daysPlan.flatMap(d=>d.stops.map(s=>s.placeId));
    assert.equal(new Set(ids).size,ids.length);
    for(const id of ids) assert.ok(catalogue.find(p=>p.id===id));
    if(destination!=='danang-hue') for(const id of ids) assert.equal(catalogue.find(p=>p.id===id).city,destination==='hue'?'Huế':'Đà Nẵng');
  }
  assert.equal(model.findSamplePreset([], 'hue',1),undefined);
  assert.equal(model.findSamplePreset(catalogue,'danang-hue',1),undefined);
});
test('Move preserves input, clears affected times; add/replace prevent duplicate POIs across days',()=>{
  const original=model.buildInitialDayPlans(model.findSamplePreset(catalogue,'danang',2));
  const first=original[0].stops[0],second=original[0].stops[1];
  const moved=model.moveSampleStop(original,1,0,1);
  assert.equal(moved[0].stops[0].placeId,second.placeId);assert.equal(moved[0].stops[1].timeSlot,null);assert.ok(first.timeSlot);
  assert.equal(model.applySamplePlace(original,2,first.placeId,'new'),original);
  const available=catalogue.find(p=>p.city==='Đà Nẵng'&&!original.flatMap(d=>d.stops).some(s=>s.placeId===p.id));
  const replaced=model.applySamplePlace(original,1,available.id,'unused',first.instanceId);
  assert.equal(replaced[0].stops.length,4);assert.equal(replaced[0].stops[0].placeId,available.id);assert.equal(replaced[0].stops[0].timeSlot,null);
});
test('Catalogue does not invent photos, descriptions, ratings or green scores',()=>{
  const p=adapter.cataloguePlace({...raw('missing'),description:'',image_url:null,satisfaction_score:null,green_score:null});
  assert.equal(p.photos.length,0);assert.equal(p.rating,null);assert.equal(p.greenScore,null);assert.match(p.fullDesc,/Chưa có/);
  assert.equal(adapter.cataloguePlace({...raw('unknown'),city:'Unknown'}),null);
  assert.equal(adapter.cataloguePlace({...raw('missing-coords'),latitude:null}),null);
  assert.equal(adapter.cataloguePlace({...raw('inactive'),is_active:false}),null);
  assert.equal(adapter.cataloguePlace({...raw('closed'),opening_hours:{is_temporarily_closed:true}}),null);
  assert.equal(adapter.cataloguePlace({...raw('unsafe'),image_url:'javascript:alert(1)'}).photos.length,0);
});
test('Save sends the exact edited plan to Ideas and itinerary; retry reuses ID after a partial failure',async()=>{
  let token='a', fail=true; const calls=[];
  const service=load('services/saveLandingSample.ts',{
    '@/utils/tripDates':dates,
    '@/services/auth':{getAccessToken:()=>token},
    '@/services/tripWorkspace':{saveTripWorkspace:async trip=>{calls.push(['workspace',trip]);return trip;}},
    '@/services/itineraryService':{stopFromPoi:poi=>({poi_id:poi.id,title:poi.name}),saveTripItinerary:async plan=>{calls.push(['itinerary',plan]);if(fail) throw Error('offline');return plan;}}
  });
  const plan=model.moveSampleStop(model.buildInitialDayPlans(model.findSamplePreset(catalogue,'danang',1)),1,0,1);
  const draft={plan,places:catalogue,destination:'danang',days:1,details:{startDate:'2030-01-30',peopleCount:3,totalBudget:5000000}};
  const payload=service.sampleTripPayload(draft,'fixed-id');
  assert.deepEqual(Array.from(payload.trip.ideas),Array.from(plan[0].stops,s=>s.placeId));
  assert.equal(payload.itinerary.days[0].stops[0].start_time,null);
  assert.equal(payload.itinerary.start_date,'2030-01-30');
  assert.equal(payload.trip.peopleCount,3);
  assert.equal(payload.trip.totalBudget,5000000);
  await assert.rejects(service.saveLandingSample(draft,'fixed-id','a'),/offline/);
  fail=false; await service.saveLandingSample(draft,'fixed-id','a');
  assert.ok(calls.every(([kind,data])=>(kind==='workspace'?data.id:data.trip_id)==='fixed-id'));
  token='b';const before=calls.length;await assert.rejects(service.saveLandingSample(draft,'fixed-id','a'),/Tài khoản/);assert.equal(calls.length,before);
});


test('Chosen dates fill every day, preserve edited order, and clear only past hours today',()=>{
  const service=load('services/saveLandingSample.ts',{'@/utils/tripDates':dates,'@/services/auth':{},'@/services/tripWorkspace':{},'@/services/itineraryService':{stopFromPoi:poi=>({poi_id:poi.id,title:poi.name})}});
  const plan=model.buildInitialDayPlans(model.findSamplePreset(catalogue,'danang',2));
  const draft={plan,places:catalogue,destination:'danang',days:2,details:{startDate:'2026-11-18',peopleCount:2}};
  const {itinerary,trip}=service.sampleTripPayload(draft,'dated-id',new Date('2026-11-18T06:00:00Z'));
  assert.equal(itinerary.days[0].date,'2026-11-18');assert.equal(itinerary.days[1].date,'2026-11-19');
  assert.equal(itinerary.days[0].stops[0].start_time,null);assert.equal(itinerary.days[0].stops[2].start_time,'14:30');
  assert.equal(itinerary.days[1].stops[0].start_time,'09:00');
  assert.deepEqual(Array.from(trip.ideas),Array.from(plan.flatMap(d=>d.stops.map(s=>s.placeId))));
  for(const details of [{startDate:'',peopleCount:2},{startDate:'2026-11-17',peopleCount:2},{startDate:'2030-02-30',peopleCount:2},{startDate:'2030-01-01',peopleCount:0},{startDate:'2030-01-01',peopleCount:21},{startDate:'2030-01-01',peopleCount:2,totalBudget:-1}]) assert.throws(()=>service.validateSampleDetails(details,new Date('2026-11-18T06:00:00Z')));
  assert.doesNotThrow(()=>service.validateSampleDetails({startDate:'2030-01-01',peopleCount:2},new Date('2026-11-18T06:00:00Z')));
});


test('Calendar uses saved start/end times and never invents a slot for an unscheduled stop',()=>{
  const {calendarStopSlot}=load('utils/calendarSlots.ts');
  assert.equal(calendarStopSlot({start_time:null,end_time:null,duration_minutes:60}),null);
  assert.equal(calendarStopSlot({start_time:'99:00',end_time:'10:00',duration_minutes:null}),null);
  const slot=calendarStopSlot({start_time:'14:30',end_time:'15:30',duration_minutes:null});
  assert.equal(slot.hour,14);assert.equal(slot.minute,30);assert.equal(slot.duration,60);
});


test('Calendar expands to early/late saved hours so a user-edited stop cannot disappear',()=>{
  const {calendarHoursFor}=load('utils/calendarSlots.ts');
  const hours=calendarHoursFor([{start_time:'06:00',end_time:'07:00',duration_minutes:null},{start_time:'23:00',end_time:'23:30',duration_minutes:null}]);
  assert.equal(hours[0],6);assert.equal(hours[hours.length-1],23);
  assert.ok(hours.includes(7));assert.ok(hours.includes(22));
  const defaults=calendarHoursFor([]);assert.equal(defaults[0],7);assert.equal(defaults[defaults.length-1],22);
});


test('Saving before trip questions creates a real undated trip with the selected itinerary',()=>{
 const service=load('services/saveLandingSample.ts',{'@/utils/tripDates':dates,'@/services/auth':{},'@/services/tripWorkspace':{},'@/services/itineraryService':{stopFromPoi:poi=>({poi_id:poi.id})}});
 const plan=model.buildInitialDayPlans(model.findSamplePreset(catalogue,'hue',1));
 const {trip,itinerary}=service.sampleTripPayload({plan,places:catalogue,destination:'hue',days:1},'draft-id');
 assert.equal(trip.needsTripSetup,true);assert.equal(itinerary.start_date,null);assert.equal(itinerary.days[0].stops.length,4);
 assert.deepEqual(Array.from(trip.ideas),Array.from(plan[0].stops,s=>s.placeId));
});

test('Completing an existing sample updates dates and metadata without generating a second trip',async()=>{
 let metadata;const old={trip_id:'same',days:[{day_number:1,date:null,stops:[{stop_id:'chosen',poi_id:'real',start_time:null,end_time:null}]}]};
 const service=load('services/completeSampleTrip.ts',{
  '@/services/auth':{getAccessToken:()=> 'token'},'./saveLandingSample':{validateSampleDetails:()=>{}},'@/utils/tripDates':dates,
  './itineraryService':{getTripItinerary:async()=>old,saveTripItinerary:async plan=>{assert.equal(plan.trip_id,'same');assert.equal(plan.days[0].date,'2030-01-30');assert.equal(plan.days[0].stops[0].stop_id,'chosen');}},
  './tripWorkspace':{saveTripWorkspace:async trip=>{metadata=trip;return trip;}}
 });
 await service.completeSampleTrip({id:'same',startDate:'2030-01-30',peopleCount:3,needsTripSetup:true,ideas:['real'],totalBudget:5000000});
 assert.equal(metadata.needsTripSetup,false);assert.equal(metadata.id,'same');assert.equal(metadata.peopleCount,3);assert.equal(metadata.ideas[0],'real');
});

test('Cancelled Google/signup responses can be inspected without mutating the current session',async()=>{
 const writes=[];
 const service=load('services/auth.ts',{'../lib/api':{API_BASE_URL:'https://local.test'}},{
  AbortSignal,fetch:async()=>({ok:true,json:async()=>({access_token:'test-token'})}),
  localStorage:{setItem:(...args)=>writes.push(args)},sessionStorage:{removeItem:(...args)=>writes.push(args)}
 });
 await service.googleLogin('fixture',false);await service.signup({email:'fixture@test.invalid'},false);
 assert.equal(writes.length,0);
 await service.googleLogin('fixture');assert.equal(writes.length,2);
});

test('Failed itinerary completion keeps setup pending; retry uses the same trip and clears only past times',async()=>{
 let fail=true;const metadata=[],plans=[];
 const previous={trip_id:'same',days:[{day_number:1,stops:[{stop_id:'past',start_time:'09:00',end_time:'10:00'},{stop_id:'future',start_time:'17:00',end_time:'18:00'}]}]};
 const service=load('services/completeSampleTrip.ts',{
  '@/services/auth':{getAccessToken:()=> 'token'},'./saveLandingSample':{validateSampleDetails:()=>{}},
  '@/utils/tripDates':{...dates,vietnamNow:()=>({date:'2030-01-30',minutes:900})},
  './itineraryService':{getTripItinerary:async()=>previous,saveTripItinerary:async plan=>{plans.push(plan);if(fail)throw Error('offline');}},
  './tripWorkspace':{saveTripWorkspace:async trip=>{metadata.push(trip);return trip;}}
 });
 const trip={id:'same',startDate:'2030-01-30',peopleCount:2,needsTripSetup:true};
 await assert.rejects(service.completeSampleTrip(trip),/offline/);assert.equal(metadata.length,0);
 fail=false;await service.completeSampleTrip(trip);
 assert.ok(plans.every(p=>p.trip_id==='same'));assert.equal(plans[1].days[0].stops[0].start_time,null);
 assert.equal(plans[1].days[0].stops[1].start_time,'17:00');assert.equal(previous.days[0].stops[0].start_time,'09:00');
 assert.equal(metadata[0].needsTripSetup,false);
});
