import type {UserTrip} from '@/pages/ExplorePage';
import {getAccessToken} from '@/services/auth';
import {validateSampleDetails} from './saveLandingSample';
import {getTripItinerary,saveTripItinerary} from './itineraryService';
import {saveTripWorkspace} from './tripWorkspace';
import {dateAt,vietnamNow} from '@/utils/tripDates';
export async function completeSampleTrip(trip: UserTrip) {
  validateSampleDetails({startDate:trip.startDate || '',peopleCount:trip.peopleCount,totalBudget:trip.totalBudget});
  const token = getAccessToken();
  const check = () => {if(!token || token !== getAccessToken()) throw new Error('Tài khoản đã thay đổi. Hãy đăng nhập lại.');};
  check();
  const previous = await getTripItinerary(trip.id); check();
  if(!previous) throw new Error('Chưa tải được lịch đã chọn. Thử lại.');
  const now=vietnamNow();
  const plan={...previous,start_date:trip.startDate!,days:previous.days.map(day=>{
    const date=dateAt(trip.startDate!,day.day_number-1);
    return {...day,date,stops:day.stops.map(stop=>{
      const parts=stop.start_time?.split(':').map(Number);
      return date===now.date && parts && parts[0]*60+parts[1]<now.minutes ? {...stop,start_time:null,end_time:null} : stop;
    })};
  })};
  await saveTripItinerary(plan); check();
  const saved=await saveTripWorkspace({...trip,needsTripSetup:false,status:'upcoming'}); check();
  return saved;
}
