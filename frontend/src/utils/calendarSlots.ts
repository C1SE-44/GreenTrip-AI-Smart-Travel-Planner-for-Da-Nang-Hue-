import type {ItineraryStop} from '@/services/itineraryService';
export function calendarStopSlot(stop: Pick<ItineraryStop,'start_time'|'end_time'|'duration_minutes'>) {
  if (!stop.start_time || !/^([01]\d|2[0-3]):[0-5]\d$/.test(stop.start_time)) return null;
  const [hour,minute] = stop.start_time.split(':').map(Number);
  const end = stop.end_time?.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  const minutes = end ? Number(end[1])*60+Number(end[2])-hour*60-minute : 0;
  return {hour,minute,duration:minutes > 0 ? minutes : stop.duration_minutes || 90};
}

export function calendarHoursFor(stops: Pick<ItineraryStop,'start_time'|'end_time'|'duration_minutes'>[]) {
  let first = 7, last = 22;
  for (const stop of stops) {
    const slot = calendarStopSlot(stop);
    if (!slot) continue;
    first = Math.min(first,slot.hour);
    last = Math.max(last,Math.min(23,Math.ceil((slot.hour*60+slot.minute+slot.duration)/60)-1));
  }
  return Array.from({length:last-first+1},(_,index)=>first+index);
}
