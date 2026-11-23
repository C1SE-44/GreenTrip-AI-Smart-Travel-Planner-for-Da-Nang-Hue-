import {getPois} from '@/services/poi';
import {normalizePoi,type BackendPoiItem} from '@/data/pois';
import {poiImageUrl} from '@/utils/poiImage';
import {rankPlace,type PlaceCatalogItem} from '@/data/landingSampleModel';
const labels={'quan-an':'Ẩm thực','di-tich':'Văn hóa','chua':'Tâm linh','canh-quan':'Thiên nhiên','luu-tru':'Lưu trú xanh'};
export function cataloguePlace(raw:BackendPoiItem):PlaceCatalogItem|null {
  if((raw as BackendPoiItem&{is_active?:boolean}).is_active===false||raw.opening_hours?.is_temporarily_closed)return null;
  if (!['đà nẵng','da nang','da-nang','danang','huế','hue'].includes((raw.city || '').trim().toLowerCase()) || raw.latitude == null || raw.longitude == null || !raw.name?.trim()) return null;
  const poi=normalizePoi(raw);if(!poi||!['Đà Nẵng','Huế'].includes(poi.city))return null;
  const urls=[raw.image_url,...(raw.gallery_urls||[])].filter((s):s is string=>typeof s==='string'&&(/^(https?:\/\/|\/(?!\/))/.test(s)));
  const photos=[...new Set(urls)].slice(0,2).map(url=>({src:poiImageUrl(url,800),alt:poi.name}));
  const description=(raw.description||'').replace(/<[^>]*>/g,'').trim();
  const shortDescription=description || raw.address?.trim() || 'Xem thông tin địa điểm trong GreenTrip.';
  const rating=typeof raw.ai_metadata?.raw_rating==='number'?raw.ai_metadata.raw_rating:raw.satisfaction_score;
  const green=raw.green_score;
  poi.image=photos[0]?.src || ''; poi.gallery=photos.map(p=>p.src); poi.description=raw.description || ''; poi.openHours=raw.open_hours || '';
  poi.rating=typeof rating==='number' && rating>=0 && rating<=5 ? rating : 0;
  return {id:poi.id,name:poi.name,city:poi.city,category:labels[poi.category],shortDesc:shortDescription.length>180?shortDescription.slice(0,177)+'…':shortDescription,fullDesc:description || 'Chưa có mô tả chi tiết trong dữ liệu GreenTrip.',address:raw.address||'Chưa có địa chỉ chi tiết',photos,poi,
    suggestedWindow:raw.open_hours||'Kiểm tra giờ mở cửa trước khi đi',greenScore:typeof green==='number'?Math.max(0,Math.min(100,green<=1?green*100:green)):null,
    rating:typeof rating==='number'&&rating>=0&&rating<=5?rating:null,reviews:typeof raw.ai_metadata?.review_count==='number'?raw.ai_metadata.review_count:0};
}
const convert=(items:BackendPoiItem[])=>items.map(cataloguePlace).filter((p):p is PlaceCatalogItem=>p!==null).sort((a,b)=>rankPlace(b)-rankPlace(a)||a.id.localeCompare(b.id));
let cached:Promise<PlaceCatalogItem[]>|undefined;
let cachedAt = 0;
export function loadLandingCatalogue(){
 if(cached && Date.now()-cachedAt>60_000) cached=undefined;
 if(!cached){cachedAt=Date.now();cached=Promise.all(['Đà Nẵng','Huế'].map(city=>getPois({city,limit:100}))).then(pages=>{const items=convert(pages.flatMap(p=>p.items));if(!items.length)cached=undefined;return items;});void cached.catch(()=>{cached=undefined;});}
 return cached;
}
export async function searchLandingCatalogue(q:string,city?:string,_signal?:AbortSignal){
 const response=await getPois({city,limit:100});
 const needle=q.trim().toLowerCase();
 const items=convert(response.items);
 return needle?items.filter(p=>p.name.toLowerCase().includes(needle)||p.shortDesc.toLowerCase().includes(needle)||p.address.toLowerCase().includes(needle)):items;
}
