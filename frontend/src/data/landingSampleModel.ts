import type {Poi} from '@/data/pois';
export type DestinationScope='danang'|'hue'|'danang-hue';
export type DurationDays=1|2|3|4;
export interface PlacePhoto {src:string;alt:string;objectPosition?:string}
export interface PlaceCatalogItem {id:string;name:string;city:Poi['city'];category:string;shortDesc:string;fullDesc:string;suggestedWindow:string;address:string;photos:PlacePhoto[];poi:Poi;greenScore:number|null;rating:number|null;reviews:number}
export interface ItineraryStopItem {instanceId:string;placeId:string;timeSlot:string|null}
export interface ItineraryDayPlan {dayNumber:number;title:string;stops:ItineraryStopItem[]}
export interface SamplePresetDefinition {destination:DestinationScope;days:DurationDays;daysPlan:ItineraryDayPlan[]}
export const DESTINATION_OPTIONS=[{id:'danang' as const,label:'Đà Nẵng'},{id:'hue' as const,label:'Huế'},{id:'danang-hue' as const,label:'Đà Nẵng & Huế'}];
export const DURATION_OPTIONS:DurationDays[]=[1,2,3,4];
export const getPresetKey=(destination:DestinationScope,days:DurationDays)=>`${destination}-${days}`;
export const getSupportedDurationsForDestination=(destination:DestinationScope):DurationDays[]=>destination==='danang-hue'?[2,3,4]:[1,2,3,4];
export const rankPlace=(p:PlaceCatalogItem)=>(p.rating??0)*10+Math.min(10,Math.log1p(Math.max(0,p.reviews))*2)+(p.greenScore??0)*.2;
function distance(a:PlaceCatalogItem,b:PlaceCatalogItem){const dy=(a.poi.lat-b.poi.lat)*111,dx=(a.poi.lng-b.poi.lng)*107;return Math.hypot(dx,dy);}
export function findSamplePreset(catalog:PlaceCatalogItem[],destination:DestinationScope,days:DurationDays):SamplePresetDefinition|undefined {
  if(!getSupportedDurationsForDestination(destination).includes(days))return;
  const used=new Set<string>(),daysPlan:ItineraryDayPlan[]=[];
  for(let d=1;d<=days;d++){
    const city=destination==='hue'?'Huế':destination==='danang'?'Đà Nẵng':d<=Math.ceil(days/2)?'Đà Nẵng':'Huế';
    const pool=catalog.filter(p=>p.city===city&&!used.has(p.id)).sort((a,b)=>rankPlace(b)-rankPlace(a)||a.id.localeCompare(b.id));
    if(!pool.length)return;
    const chosen:PlaceCatalogItem[]=[];
    for(const category of ['di-tich','quan-an','chua','canh-quan']){
      const available=pool.filter(p=>!used.has(p.id));
      const relevant=available.filter(p=>p.poi.category===category);
      const options=relevant.length?relevant:available;
      // Prefer nearby candidates within the day; this remains a reference, not a routed itinerary.
      options.sort((a,b)=>(rankPlace(b)-(chosen[0]?distance(b,chosen[0])*1.5:0))-(rankPlace(a)-(chosen[0]?distance(a,chosen[0])*1.5:0))||a.id.localeCompare(b.id));
      const p=options[0];if(!p)break;used.add(p.id);chosen.push(p);
    }
    const hours=['09:00 – 10:00','11:30 – 12:30','14:30 – 15:30','17:00 – 18:00'];
    daysPlan.push({dayNumber:d,title:`Ngày ${d} · ${city}`,stops:chosen.map((p,i)=>({instanceId:`${getPresetKey(destination,days)}-${d}-${p.id}`,placeId:p.id,timeSlot:hours[i]}))});
  }
  return {destination,days,daysPlan};
}
export const buildInitialDayPlans=(preset:SamplePresetDefinition):ItineraryDayPlan[]=>preset.daysPlan.map(d=>({...d,stops:d.stops.map(s=>({...s}))}));
export function moveSampleStop(plan:ItineraryDayPlan[],dayNumber:number,index:number,direction:-1|1){
 return plan.map(day=>{const target=index+direction;if(day.dayNumber!==dayNumber||target<0||index<0||index>=day.stops.length||target>=day.stops.length)return day;
 const stops=day.stops.map(s=>({...s}));[stops[index],stops[target]]=[{...stops[target],timeSlot:null},{...stops[index],timeSlot:null}];return {...day,stops};});
}
export function applySamplePlace(plan:ItineraryDayPlan[],dayNumber:number,placeId:string,instanceId:string,replaceId?:string){
 if(plan.some(day=>day.stops.some(stop=>stop.placeId===placeId&&stop.instanceId!==replaceId)))return plan;
 return plan.map(day=>day.dayNumber!==dayNumber?day:{...day,stops:replaceId?day.stops.map(s=>s.instanceId===replaceId?{...s,placeId,timeSlot:null}:s):[...day.stops,{instanceId,placeId,timeSlot:null}]});
}
