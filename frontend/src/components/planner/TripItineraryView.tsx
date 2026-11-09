import React, { useState, useMemo, useEffect } from 'react';
import {
  ChevronLeft,
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  Sparkles,
  Plus,
  ArrowUp,
  ArrowDown,
  Trash2,
  CheckCircle2,
  PlayCircle,
  HelpCircle,
  XCircle,
  Footprints,
  Bike,
  Bus,
  Car,
  Check,
  ChevronDown,
  Eye,
  SlidersHorizontal,
  Lightbulb,
} from 'lucide-react';
import type { UserTrip } from '@/pages/ExplorePage';
import type { Poi } from '@/data/pois';
import PoiMap from '@/components/poi/PoiMap';
import { MorphStatusBadge } from '@/components/ui/MorphButton';
import { ThreeElevationWave } from '@/components/ui/ThreeElevationWave';

export interface ItineraryStop {
  id: string;
  poiId: string;
  name: string;
  category?: string;
  image?: string;
  address?: string;
  lat?: number;
  lng?: number;
  startTime: string;
  endTime: string;
  status: 'planned' | 'in_progress' | 'visited' | 'skipped';
  notes?: string;
  estimatedCost?: number;
  transitToNext?: {
    mode: 'walk' | 'bike' | 'ev_bus' | 'electric_taxi';
    durationMinutes: number;
    distanceMeters: number;
    co2SavedKg: number;
  };
}

export interface DaySchedule {
  dayNumber: number;
  dateStr?: string;
  themeTitle: string;
  stops: ItineraryStop[];
}

export interface TripItineraryViewProps {
  trip: UserTrip;
  allPois?: Poi[];
  onBack: () => void;
  onUpdateTrip?: (updatedTrip: UserTrip) => void;
}

// ─────────────────────────────────────────────
// Default Seed Days (Đà Nẵng & Huế)
// ─────────────────────────────────────────────
function generateDefaultDays(destination: string, count: number, allPois: Poi[]): DaySchedule[] {
  const isHue = /huế|hue/i.test(destination);
  const totalDays = Math.max(1, count || 3);
  const result: DaySchedule[] = [];

  // Tìm POIs theo tên hoặc danh mục
  const findPoi = (keywords: string[]) => {
    return allPois.find((p) => {
      const n = p.name.toLowerCase();
      return keywords.some((kw) => n.includes(kw.toLowerCase()));
    });
  };

  for (let d = 1; d <= totalDays; d++) {
    let theme = `Ngày ${d} • Khám phá trải nghiệm`;
    const stops: ItineraryStop[] = [];

    if (isHue) {
      if (d === 1) {
        theme = 'Ngày 1 • Đại Nội & Cổ tự thanh tịnh bên sông Hương';
        const p1 = findPoi(['mụ rơi', 'bún bò']) || allPois[0];
        const p2 = findPoi(['đại nội', 'hoàng cung']) || allPois[1];
        const p3 = findPoi(['thiên mụ']) || allPois[2];
        const p4 = findPoi(['không gian xưa', 'cơm niêu']) || allPois[3];

        if (p1) {
          stops.push({
            id: `stop-d1-1`,
            poiId: p1.id,
            name: p1.name,
            category: p1.category,
            image: p1.image,
            address: p1.address || 'Huế',
            lat: p1.lat,
            lng: p1.lng,
            startTime: '08:00',
            endTime: '09:15',
            status: 'visited',
            estimatedCost: p1.estimatedCost || 45000,
            transitToNext: { mode: 'walk', durationMinutes: 12, distanceMeters: 850, co2SavedKg: 0.18 },
          });
        }
        if (p2) {
          stops.push({
            id: `stop-d1-2`,
            poiId: p2.id,
            name: p2.name,
            category: p2.category,
            image: p2.image,
            address: p2.address || 'Đại Nội Huế',
            lat: p2.lat,
            lng: p2.lng,
            startTime: '09:30',
            endTime: '12:00',
            status: 'in_progress',
            estimatedCost: p2.estimatedCost || 200000,
            transitToNext: { mode: 'ev_bus', durationMinutes: 15, distanceMeters: 3200, co2SavedKg: 0.65 },
          });
        }
        if (p3) {
          stops.push({
            id: `stop-d1-3`,
            poiId: p3.id,
            name: p3.name,
            category: p3.category,
            image: p3.image,
            address: p3.address || 'Chùa Thiên Mụ',
            lat: p3.lat,
            lng: p3.lng,
            startTime: '14:30',
            endTime: '16:00',
            status: 'planned',
            estimatedCost: p3.estimatedCost || 0,
            transitToNext: { mode: 'bike', durationMinutes: 20, distanceMeters: 4100, co2SavedKg: 0.8 },
          });
        }
        if (p4) {
          stops.push({
            id: `stop-d1-4`,
            poiId: p4.id,
            name: p4.name,
            category: p4.category,
            image: p4.image,
            address: p4.address || 'Huế',
            lat: p4.lat,
            lng: p4.lng,
            startTime: '18:30',
            endTime: '20:30',
            status: 'planned',
            estimatedCost: p4.estimatedCost || 180000,
          });
        }
      } else {
        theme = `Ngày ${d} • Di sản lăng tẩm & Làng nghề truyền thống`;
        const p1 = findPoi(['khải định']) || allPois[4];
        const p2 = findPoi(['thủy xuân', 'làng hương']) || allPois[5];
        const p3 = findPoi(['trường tiền', 'sông hương']) || allPois[6];

        if (p1) {
          stops.push({
            id: `stop-d${d}-1`,
            poiId: p1.id,
            name: p1.name,
            category: p1.category,
            image: p1.image,
            address: p1.address || 'Huế',
            lat: p1.lat,
            lng: p1.lng,
            startTime: '08:30',
            endTime: '10:30',
            status: 'planned',
            estimatedCost: p1.estimatedCost || 150000,
            transitToNext: { mode: 'electric_taxi', durationMinutes: 10, distanceMeters: 2800, co2SavedKg: 0.4 },
          });
        }
        if (p2) {
          stops.push({
            id: `stop-d${d}-2`,
            poiId: p2.id,
            name: p2.name,
            category: p2.category,
            image: p2.image,
            address: p2.address || 'Thủy Xuân',
            lat: p2.lat,
            lng: p2.lng,
            startTime: '11:00',
            endTime: '13:00',
            status: 'planned',
            estimatedCost: p2.estimatedCost || 50000,
            transitToNext: { mode: 'walk', durationMinutes: 15, distanceMeters: 900, co2SavedKg: 0.2 },
          });
        }
        if (p3) {
          stops.push({
            id: `stop-d${d}-3`,
            poiId: p3.id,
            name: p3.name,
            category: p3.category,
            image: p3.image,
            address: p3.address || 'Cầu Trường Tiền',
            lat: p3.lat,
            lng: p3.lng,
            startTime: '18:30',
            endTime: '21:00',
            status: 'planned',
            estimatedCost: p3.estimatedCost || 0,
          });
        }
      }
    } else {
      // Đà Nẵng
      if (d === 1) {
        theme = 'Ngày 1 • Ẩm thực trung tâm, Cầu Rồng & Biển Mỹ Khê';
        const p1 = findPoi(['mì quảng 1a', 'mì quảng', 'bà mua']) || allPois[0];
        const p2 = findPoi(['điêu khắc chăm', 'chăm']) || allPois[1];
        const p3 = findPoi(['madame lân']) || allPois[2];
        const p4 = findPoi(['mỹ khê', 'biển']) || allPois[3];
        const p5 = findPoi(['cầu rồng']) || allPois[4];

        if (p1) {
          stops.push({
            id: `stop-d1-1`,
            poiId: p1.id,
            name: p1.name,
            category: p1.category,
            image: p1.image,
            address: p1.address || 'Đà Nẵng',
            lat: p1.lat,
            lng: p1.lng,
            startTime: '08:00',
            endTime: '09:00',
            status: 'visited',
            estimatedCost: p1.estimatedCost || 40000,
            transitToNext: { mode: 'walk', durationMinutes: 10, distanceMeters: 750, co2SavedKg: 0.16 },
          });
        }
        if (p2) {
          stops.push({
            id: `stop-d1-2`,
            poiId: p2.id,
            name: p2.name,
            category: p2.category,
            image: p2.image,
            address: p2.address || 'Bảo tàng Điêu khắc Chăm',
            lat: p2.lat,
            lng: p2.lng,
            startTime: '09:15',
            endTime: '11:15',
            status: 'in_progress',
            estimatedCost: p2.estimatedCost || 60000,
            transitToNext: { mode: 'bike', durationMinutes: 12, distanceMeters: 1800, co2SavedKg: 0.38 },
          });
        }
        if (p3) {
          stops.push({
            id: `stop-d1-3`,
            poiId: p3.id,
            name: p3.name,
            category: p3.category,
            image: p3.image,
            address: p3.address || 'Đà Nẵng',
            lat: p3.lat,
            lng: p3.lng,
            startTime: '11:30',
            endTime: '13:00',
            status: 'planned',
            estimatedCost: p3.estimatedCost || 150000,
            transitToNext: { mode: 'ev_bus', durationMinutes: 16, distanceMeters: 3800, co2SavedKg: 0.72 },
          });
        }
        if (p4) {
          stops.push({
            id: `stop-d1-4`,
            poiId: p4.id,
            name: p4.name,
            category: p4.category,
            image: p4.image,
            address: p4.address || 'Bãi biển Mỹ Khê',
            lat: p4.lat,
            lng: p4.lng,
            startTime: '15:30',
            endTime: '18:00',
            status: 'planned',
            estimatedCost: p4.estimatedCost || 0,
            transitToNext: { mode: 'bike', durationMinutes: 15, distanceMeters: 2500, co2SavedKg: 0.52 },
          });
        }
        if (p5) {
          stops.push({
            id: `stop-d1-5`,
            poiId: p5.id,
            name: p5.name,
            category: p5.category,
            image: p5.image,
            address: p5.address || 'Cầu Rồng',
            lat: p5.lat,
            lng: p5.lng,
            startTime: '18:30',
            endTime: '21:00',
            status: 'planned',
            estimatedCost: p5.estimatedCost || 0,
          });
        }
      } else {
        theme = `Ngày ${d} • Bán đảo Sơn Trà & Thắng cảnh Ngũ Hành Sơn`;
        const p1 = findPoi(['linh ứng', 'sơn trà']) || allPois[5];
        const p2 = findPoi(['bé mặn', 'hải sản']) || allPois[6];
        const p3 = findPoi(['ngũ hành sơn']) || allPois[7];

        if (p1) {
          stops.push({
            id: `stop-d${d}-1`,
            poiId: p1.id,
            name: p1.name,
            category: p1.category,
            image: p1.image,
            address: p1.address || 'Bán đảo Sơn Trà',
            lat: p1.lat,
            lng: p1.lng,
            startTime: '08:30',
            endTime: '11:00',
            status: 'planned',
            estimatedCost: p1.estimatedCost || 0,
            transitToNext: { mode: 'electric_taxi', durationMinutes: 15, distanceMeters: 6200, co2SavedKg: 0.9 },
          });
        }
        if (p2) {
          stops.push({
            id: `stop-d${d}-2`,
            poiId: p2.id,
            name: p2.name,
            category: p2.category,
            image: p2.image,
            address: p2.address || 'Đà Nẵng',
            lat: p2.lat,
            lng: p2.lng,
            startTime: '11:30',
            endTime: '13:30',
            status: 'planned',
            estimatedCost: p2.estimatedCost || 250000,
            transitToNext: { mode: 'ev_bus', durationMinutes: 20, distanceMeters: 7500, co2SavedKg: 1.1 },
          });
        }
        if (p3) {
          stops.push({
            id: `stop-d${d}-3`,
            poiId: p3.id,
            name: p3.name,
            category: p3.category,
            image: p3.image,
            address: p3.address || 'Ngũ Hành Sơn',
            lat: p3.lat,
            lng: p3.lng,
            startTime: '14:30',
            endTime: '17:00',
            status: 'planned',
            estimatedCost: p3.estimatedCost || 40000,
          });
        }
      }
    }

    result.push({
      dayNumber: d,
      dateStr: `Ngày ${d}`,
      themeTitle: theme,
      stops,
    });
  }

  return result;
}

export const TripItineraryView: React.FC<TripItineraryViewProps> = ({
  trip,
  allPois = [],
  onBack,
  onUpdateTrip,
}) => {
  // Lấy hoặc sinh danh sách ngày
  const [days, setDays] = useState<DaySchedule[]>(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (Array.isArray((trip as any).itineraryDays) && (trip as any).itineraryDays.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (trip as any).itineraryDays;
    }
    return generateDefaultDays(trip.destination, trip.daysCount || 3, allPois);
  });

  const [selectedDayNumber, setSelectedDayNumber] = useState<number>(1);
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const [hoveredStopId, setHoveredStopId] = useState<string | null>(null);
  const [showIdeasDrawer, setShowIdeasDrawer] = useState<boolean>(false);
  const [editingStopId, setEditingStopId] = useState<string | null>(null);
  const [editStartTime, setEditStartTime] = useState<string>('09:00');
  const [editEndTime, setEditEndTime] = useState<string>('10:30');

  // Lưu lịch trình mỗi khi thay đổi
  const saveDays = (newDays: DaySchedule[]) => {
    setDays(newDays);
    if (onUpdateTrip) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onUpdateTrip({ ...trip, itineraryDays: newDays } as any);
    }
  };

  const currentDay = useMemo(() => {
    return days.find((d) => d.dayNumber === selectedDayNumber) || days[0];
  }, [days, selectedDayNumber]);

  // Các POIs có trong ý tưởng nhưng chưa xếp vào ngày đang chọn
  const availableIdeaPois = useMemo(() => {
    const ideasList = trip.ideas || [];
    if (ideasList.length === 0) return [];
    const currentStopPoiIds = new Set(currentDay?.stops.map((s) => s.poiId) || []);
    return ideasList
      .map((id) => allPois.find((p) => p.id === id || p.name.toLowerCase() === id.toLowerCase()))
      .filter((p): p is Poi => p !== undefined && !currentStopPoiIds.has(p.id));
  }, [trip.ideas, allPois, currentDay]);

  // POIs cho bản đồ lộ trình của ngày hiện tại
  const mapPoisForDay = useMemo(() => {
    if (!currentDay) return [];
    return currentDay.stops
      .map((stop) => {
        const found = allPois.find((p) => p.id === stop.poiId);
        if (found) return found;
        if (stop.lat && stop.lng) {
          return {
            id: stop.poiId,
            name: stop.name,
            category: (stop.category as any) || 'canh-quan',
            city: (trip.destination.includes('Huế') ? 'Huế' : 'Đà Nẵng') as any,
            lat: stop.lat,
            lng: stop.lng,
            image: stop.image || 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=800&auto=format&fit=crop&q=80',
            description: stop.address || '',
            rating: 4.8,
            visitDuration: '1.5 giờ',
            ecoScore: 85,
          } as Poi;
        }
        return null;
      })
      .filter((p): p is Poi => p !== null);
  }, [currentDay, allPois, trip.destination]);

  // Đổi thứ tự điểm dừng (Reorder)
  const handleReorder = (stopIndex: number, direction: 'up' | 'down') => {
    if (!currentDay) return;
    const stops = [...currentDay.stops];
    const targetIdx = direction === 'up' ? stopIndex - 1 : stopIndex + 1;
    if (targetIdx < 0 || targetIdx >= stops.length) return;

    // Đổi chỗ
    const temp = stops[stopIndex];
    stops[stopIndex] = stops[targetIdx];
    stops[targetIdx] = temp;

    const newDays = days.map((d) => (d.dayNumber === currentDay.dayNumber ? { ...d, stops } : d));
    saveDays(newDays);
  };

  // Đổi trạng thái điểm dừng (Status)
  const handleStatusChange = (
    stopId: string,
    nextStatus: 'planned' | 'in_progress' | 'visited' | 'skipped'
  ) => {
    if (!currentDay) return;
    const stops = currentDay.stops.map((s) => (s.id === stopId ? { ...s, status: nextStatus } : s));
    const newDays = days.map((d) => (d.dayNumber === currentDay.dayNumber ? { ...d, stops } : d));
    saveDays(newDays);
  };

  // Xóa điểm dừng khỏi ngày
  const handleRemoveStop = (stopId: string) => {
    if (!currentDay) return;
    const stops = currentDay.stops.filter((s) => s.id !== stopId);
    const newDays = days.map((d) => (d.dayNumber === currentDay.dayNumber ? { ...d, stops } : d));
    saveDays(newDays);
  };

  // Thêm một POI từ ý tưởng vào ngày đang chọn
  const handleAddPoiToDay = (poi: Poi) => {
    if (!currentDay) return;
    const lastStop = currentDay.stops[currentDay.stops.length - 1];
    let start = '09:00';
    let end = '10:30';

    if (lastStop && lastStop.endTime) {
      const [h, m] = lastStop.endTime.split(':').map(Number);
      const nextH = Math.min(22, (h || 9) + 1);
      start = `${String(nextH).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`;
      end = `${String(Math.min(23, nextH + 1)).padStart(2, '0')}:30`;
    }

    const newStop: ItineraryStop = {
      id: `stop-${Date.now()}`,
      poiId: poi.id,
      name: poi.name,
      category: poi.category,
      image: poi.image,
      address: poi.address || poi.city,
      lat: poi.lat,
      lng: poi.lng,
      startTime: start,
      endTime: end,
      status: 'planned',
      estimatedCost: poi.estimatedCost || 50000,
    };

    // Nếu điểm trước đó chưa có transit, tạo transit xanh
    const stops = [...currentDay.stops];
    if (stops.length > 0) {
      stops[stops.length - 1] = {
        ...stops[stops.length - 1],
        transitToNext: stops[stops.length - 1].transitToNext || {
          mode: 'walk',
          durationMinutes: 10,
          distanceMeters: 800,
          co2SavedKg: 0.2,
        },
      };
    }
    stops.push(newStop);

    const newDays = days.map((d) => (d.dayNumber === currentDay.dayNumber ? { ...d, stops } : d));
    saveDays(newDays);
  };

  // Chuyển phương tiện di chuyển xanh
  const handleCycleTransitMode = (stopId: string) => {
    if (!currentDay) return;
    const modes: ('walk' | 'bike' | 'ev_bus' | 'electric_taxi')[] = [
      'walk',
      'bike',
      'ev_bus',
      'electric_taxi',
    ];
    const stops = currentDay.stops.map((s) => {
      if (s.id !== stopId || !s.transitToNext) return s;
      const currentMode = s.transitToNext.mode;
      const nextMode = modes[(modes.indexOf(currentMode) + 1) % modes.length];
      const dist = s.transitToNext.distanceMeters;
      let dur = 10;
      let co2 = 0.2;
      if (nextMode === 'walk') {
        dur = Math.round(dist / 75);
        co2 = 0.2;
      } else if (nextMode === 'bike') {
        dur = Math.round(dist / 200);
        co2 = 0.35;
      } else if (nextMode === 'ev_bus') {
        dur = Math.round(dist / 300) + 5;
        co2 = 0.6;
      } else {
        dur = Math.round(dist / 400);
        co2 = 0.45;
      }
      return {
        ...s,
        transitToNext: {
          ...s.transitToNext,
          mode: nextMode,
          durationMinutes: Math.max(5, dur),
          co2SavedKg: Math.round(co2 * 100) / 100,
        },
      };
    });
    const newDays = days.map((d) => (d.dayNumber === currentDay.dayNumber ? { ...d, stops } : d));
    saveDays(newDays);
  };

  // Thêm ngày mới
  const handleAddNewDay = () => {
    const nextNum = days.length + 1;
    const newDay: DaySchedule = {
      dayNumber: nextNum,
      dateStr: `Ngày ${nextNum}`,
      themeTitle: `Ngày ${nextNum} • Trải nghiệm mở rộng`,
      stops: [],
    };
    const updated = [...days, newDay];
    saveDays(updated);
    setSelectedDayNumber(nextNum);
  };

  // Helper render icon phương tiện di chuyển
  const renderTransitIcon = (mode: string) => {
    switch (mode) {
      case 'walk':
        return <Footprints size={13} className="text-emerald-700" />;
      case 'bike':
        return <Bike size={13} className="text-emerald-700" />;
      case 'ev_bus':
        return <Bus size={13} className="text-blue-600" />;
      case 'electric_taxi':
      default:
        return <Car size={13} className="text-indigo-600" />;
    }
  };

  const getTransitModeLabel = (mode: string) => {
    switch (mode) {
      case 'walk':
        return 'Đi bộ';
      case 'bike':
        return 'Xe đạp';
      case 'ev_bus':
        return 'Buýt điện Danabus';
      case 'electric_taxi':
      default:
        return 'Taxi điện xanh';
    }
  };

  
  // ─── AI SMART PACK (Agent Skills Autonomous Scheduling) ───
  const [smartPackNotification, setSmartPackNotification] = useState<string | null>(null);

  const handleAiSmartPack = () => {
    const ideasList = trip.ideas || [];
    if (ideasList.length === 0) {
      setSmartPackNotification('Ý tưởng của bạn đang trống! Hãy thêm địa điểm vào Ý tưởng trước.');
      setTimeout(() => setSmartPackNotification(null), 3500);
      return;
    }

    const allIdeaPois = ideasList
      .map((id) => allPois.find((p) => p.id === id || p.name.toLowerCase() === id.toLowerCase()))
      .filter((p): p is Poi => p !== undefined);

    if (allIdeaPois.length === 0) {
      setSmartPackNotification('Không tìm thấy dữ liệu địa điểm trong Ý tưởng.');
      setTimeout(() => setSmartPackNotification(null), 3500);
      return;
    }

    const updatedDays = days.map((day, dIdx) => {
      const assignedPois = allIdeaPois.filter((_, idx) => idx % days.length === dIdx);
      if (assignedPois.length === 0) return day;

      const newStops: ItineraryStop[] = assignedPois.map((poi, sIdx) => {
        const startHours = [9, 11, 14, 17, 19];
        const h = startHours[Math.min(sIdx, startHours.length - 1)];
        const modes: ('walk' | 'bike' | 'ev_bus' | 'electric_taxi')[] = ['walk', 'bike', 'ev_bus', 'electric_taxi'];
        const transitMode = modes[sIdx % modes.length];

        return {
          id: `smart-stop-${day.dayNumber}-${poi.id}-${Date.now()}`,
          poiId: poi.id,
          name: poi.name,
          category: poi.category,
          image: poi.image,
          address: poi.address || poi.city,
          lat: poi.lat,
          lng: poi.lng,
          startTime: `${String(h).padStart(2, '0')}:00`,
          endTime: `${String(h + 1).padStart(2, '0')}:30`,
          status: 'planned' as const,
          estimatedCost: poi.estimatedCost || 50000,
          transitToNext: {
            mode: transitMode,
            durationMinutes: 12 + sIdx * 3,
            distanceMeters: 800 + sIdx * 500,
            co2SavedKg: Math.round((0.25 + sIdx * 0.15) * 100) / 100,
          },
        };
      });

      return {
        ...day,
        stops: newStops,
      };
    });

    saveDays(updatedDays);
    setSmartPackNotification(`✨ AI Smart Pack đã tự động phân bổ và tối ưu lộ trình cho ${allIdeaPois.length} địa điểm trong ${days.length} ngày!`);
    setTimeout(() => setSmartPackNotification(null), 4500);
  };

  const totalDayCo2 = useMemo(() => {
    if (!currentDay) return 2.4;
    const sum = currentDay.stops.reduce((acc, s) => acc + (s.transitToNext?.co2SavedKg || 0.25), 0);
    return Math.round(sum * 10) / 10;
  }, [currentDay]);

  return (
    <div className="flex-1 h-full bg-[#FCFAF5] flex flex-col overflow-hidden select-none animate-fadeIn">
            {/* Smart Pack Toast Notification */}
      {smartPackNotification && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-neutral-900/95 text-white px-5 py-2.5 rounded-full text-xs font-bold shadow-xl border border-white/10 backdrop-blur-md flex items-center gap-2 animate-bounce">
          <Sparkles size={14} className="text-amber-400 shrink-0" />
          <span>{smartPackNotification}</span>
        </div>
      )}

      {/* ─── TOP HEADER ─── */}
      <header className="px-6 py-3.5 bg-white border-b border-gray-200/80 flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="w-8 h-8 rounded-full border border-gray-200 hover:bg-gray-100 flex items-center justify-center text-gray-700 hover:text-black transition cursor-pointer shrink-0"
            title="Quay lại chuyến đi"
          >
            <ChevronLeft size={18} />
          </button>
          <div className="min-w-0">
            <h1 className="font-extrabold text-[17px] sm:text-[19px] text-gray-950 truncate leading-snug">
              {trip.title || `Chuyến đi ${trip.destination}`}
            </h1>
            <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5 font-medium">
              <span>{trip.destination}</span>
              <span>•</span>
              <span className="font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full">
                {days.length} ngày lịch trình
              </span>
              <span>•</span>
              <span>{trip.startDate || 'Tháng 11/2026'}</span>
            </div>
          </div>
        </div>

        {/* Nút hành động phải: Thêm từ Ý tưởng & Đóng */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleAiSmartPack}
            className="h-9 px-3.5 rounded-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
            title="Tự động gom và xếp lịch trình tối ưu theo cự ly ngắn nhất"
          >
            <Sparkles size={13} className="text-amber-200" />
            <span className="hidden sm:inline">AI Smart Pack</span>
          </button>
          {trip.ideas && trip.ideas.length > 0 && (
            <button
              type="button"
              onClick={() => setShowIdeasDrawer(!showIdeasDrawer)}
              className={`h-9 px-4 rounded-full text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs ${
                showIdeasDrawer
                  ? 'bg-amber-500 text-white hover:bg-amber-600'
                  : 'bg-amber-50 border border-amber-200 text-amber-900 hover:bg-amber-100'
              }`}
            >
              <Lightbulb size={14} className={showIdeasDrawer ? 'text-white' : 'text-amber-600'} />
              <span>Ý tưởng ({trip.ideas.length})</span>
            </button>
          )}
          <button
            type="button"
            onClick={onBack}
            className="h-9 px-4 rounded-full bg-black hover:bg-neutral-800 text-white text-xs font-bold transition cursor-pointer shadow-xs"
          >
            Xong
          </button>
        </div>
      </header>

      {/* ─── THANH CHỌN NGÀY (DAYS NAVIGATION BAR) ─── */}
      <div className="px-6 py-2.5 bg-white border-b border-gray-100 flex items-center justify-between gap-2 overflow-x-auto auto-hide-scrollbar shrink-0">
        <div className="flex items-center gap-1.5 min-w-max">
          <span className="text-[12px] font-bold text-gray-400 uppercase tracking-wider mr-1">
            Chọn ngày:
          </span>
          {days.map((day) => {
            const isActive = day.dayNumber === selectedDayNumber;
            const stopCount = day.stops.length;
            return (
              <button
                key={day.dayNumber}
                type="button"
                onClick={() => setSelectedDayNumber(day.dayNumber)}
                className={`px-4 py-1.5 rounded-full text-[13px] font-bold transition cursor-pointer flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-black text-white shadow-xs'
                    : 'bg-gray-100/80 hover:bg-gray-200/80 text-gray-700'
                }`}
              >
                <span>Ngày {day.dayNumber}</span>
                <span
                  className={`text-[11px] px-1.5 py-0.2 rounded-full font-semibold ${
                    isActive ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-600'
                  }`}
                >
                  {stopCount} điểm
                </span>
              </button>
            );
          })}

          {/* Nút + Thêm ngày */}
          <button
            type="button"
            onClick={handleAddNewDay}
            className="px-3.5 py-1.5 rounded-full border border-dashed border-gray-300 hover:border-black text-gray-600 hover:text-black text-[12.5px] font-semibold transition cursor-pointer flex items-center gap-1"
          >
            <Plus size={13} />
            <span>Thêm ngày</span>
          </button>
        </div>

        <div className="text-xs text-gray-500 font-medium hidden md:block">
          💡 Nhấn <span className="font-bold text-gray-800">↑ / ↓</span> để đổi thứ tự, click vào trạng thái để cập nhật.
        </div>
      </div>

      {/* ─── MAIN CONTENT: 2 CỘT (TIMELINE LỊCH TRÌNH + BẢN ĐỒ LỘ TRÌNH) ─── */}
      <div className="flex-1 flex overflow-hidden">
        {/* CỘT TRÁI: TIMELINE LỊCH TRÌNH */}
        <div className="flex-1 max-w-2xl overflow-y-auto px-6 py-5 auto-hide-scrollbar space-y-4">
          {/* Tiêu đề Ngày đang chọn */}
          <div className="bg-white p-4 rounded-2xl border border-gray-200/80 shadow-2xs flex items-center justify-between">
            <div>
              <div className="text-xs font-bold text-emerald-800 uppercase tracking-wider">
                {currentDay.dateStr || `Ngày ${currentDay.dayNumber}`}
              </div>
              <h2 className="text-[17px] font-bold text-gray-950 mt-0.5">
                {currentDay.themeTitle}
              </h2>
            </div>
            <div className="text-right">
              <div className="text-[12px] font-bold text-gray-900">
                {currentDay.stops.length} điểm ghé thăm
              </div>
              <div className="text-[11px] text-gray-500">
                Tổng vé: {currentDay.stops.reduce((acc, s) => acc + (s.estimatedCost || 0), 0).toLocaleString()}đ
              </div>
            </div>
          </div>

          {/* DRAWER NHỎ: CHỌN TỪ Ý TƯỞNG CỦA CHUYẾN ĐI (NẾU MỞ) */}
          {showIdeasDrawer && (
            <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-4 shadow-sm animate-fadeIn">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1.5 font-bold text-[14px] text-amber-950">
                  <Lightbulb size={16} className="text-amber-600" />
                  <span>Chọn địa điểm từ Ý tưởng để gán vào Ngày {currentDay.dayNumber}:</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowIdeasDrawer(false)}
                  className="text-xs text-amber-800 hover:text-black font-semibold underline cursor-pointer"
                >
                  Thu gọn
                </button>
              </div>

              {availableIdeaPois.length === 0 ? (
                <p className="text-xs text-amber-800/80 italic">
                  Tất cả các địa điểm trong Ý tưởng đã được xếp vào lịch của ngày này hoặc danh sách ý tưởng đang trống!
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-56 overflow-y-auto pr-1 auto-hide-scrollbar">
                  {availableIdeaPois.map((poi) => (
                    <div
                      key={poi.id}
                      className="p-2.5 bg-white rounded-xl border border-amber-200/70 hover:border-amber-400 flex items-center justify-between gap-2 shadow-2xs group"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <img
                          src={poi.image}
                          alt={poi.name}
                          className="w-10 h-10 rounded-lg object-cover shrink-0"
                          onError={(e) => {
                            e.currentTarget.src =
                              'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=800&auto=format&fit=crop&q=80';
                          }}
                        />
                        <div className="min-w-0">
                          <h4 className="font-bold text-[13px] text-gray-900 truncate" title={poi.name}>
                            {poi.name}
                          </h4>
                          <p className="text-[11px] text-gray-500 truncate">
                            {poi.category === 'quan-an' ? 'Ẩm thực' : 'Tham quan'} • {poi.city}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleAddPoiToDay(poi)}
                        className="px-2.5 py-1 rounded-full bg-black hover:bg-neutral-800 text-white text-[11px] font-bold shrink-0 transition active:scale-95 cursor-pointer shadow-xs"
                      >
                        + Xếp lịch
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* DANH SÁCH TIMELINE CỦA CÁC ĐIỂM DỪNG */}
          {currentDay.stops.length === 0 ? (
            <div className="py-16 text-center bg-white rounded-2xl border border-dashed border-gray-300 p-6">
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 mx-auto mb-3">
                <CalendarIcon size={20} />
              </div>
              <h3 className="font-bold text-[15px] text-gray-900">Ngày này chưa có điểm dừng nào</h3>
              <p className="text-xs text-gray-500 max-w-sm mx-auto mt-1 mb-4">
                Hãy bấm nút bên dưới để chọn từ danh sách Ý tưởng hoặc thêm địa điểm mới vào lịch trình.
              </p>
              <button
                type="button"
                onClick={() => setShowIdeasDrawer(true)}
                className="px-5 py-2 rounded-full bg-black text-white text-xs font-bold hover:bg-neutral-800 transition shadow-xs cursor-pointer"
              >
                + Lấy từ Ý tưởng chuyến đi
              </button>
            </div>
          ) : (
            <div className="space-y-0 relative">
              {currentDay.stops.map((stop, idx) => {
                const isSelected = selectedStopId === stop.poiId;
                const isHovered = hoveredStopId === stop.poiId;
                const isFirst = idx === 0;
                const isLast = idx === currentDay.stops.length - 1;

                return (
                  <React.Fragment key={stop.id}>
                    {/* CARD ĐIỂM DỪNG */}
                    <div
                      onMouseEnter={() => setHoveredStopId(stop.poiId)}
                      onMouseLeave={() => setHoveredStopId(null)}
                      onClick={() => setSelectedStopId(stop.poiId)}
                      className={`relative p-4 rounded-2xl bg-white border transition-all cursor-pointer ${
                        isSelected || isHovered
                          ? 'border-black shadow-md ring-1 ring-black/10'
                          : 'border-gray-200/90 shadow-2xs hover:border-gray-400'
                      } ${stop.status === 'skipped' ? 'opacity-50' : ''}`}
                    >
                      <div className="flex items-start gap-3.5">
                        {/* Cột 1: Bước số + Mốc giờ */}
                        <div className="flex flex-col items-center shrink-0">
                          <span className="w-7 h-7 rounded-full bg-black text-white font-black text-xs flex items-center justify-center shadow-xs">
                            {idx + 1}
                          </span>
                          <span className="text-[11.5px] font-bold text-gray-700 mt-1.5 whitespace-nowrap">
                            {stop.startTime}
                          </span>
                          <span className="text-[10px] text-gray-400">
                            {stop.endTime}
                          </span>
                        </div>

                        {/* Cột 2: Thumbnail ảnh */}
                        <img
                          src={stop.image}
                          alt={stop.name}
                          className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl object-cover shrink-0 border border-gray-100"
                          onError={(e) => {
                            e.currentTarget.src =
                              'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=800&auto=format&fit=crop&q=80';
                          }}
                        />

                        {/* Cột 3: Chi tiết địa điểm */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline justify-between gap-1.5">
                            <h4
                              className={`font-bold text-[15px] sm:text-[16px] text-gray-950 truncate ${
                                stop.status === 'visited' ? 'line-through text-gray-500' : ''
                              }`}
                              title={stop.name}
                            >
                              {stop.name}
                            </h4>

                            {/* Badge trạng thái Morphicons với spring physics */}
                            <div className="shrink-0 flex items-center gap-1">
                              <MorphStatusBadge
                                status={stop.status}
                                onCycleStatus={() => {
                                  const nextMap: Record<string, 'planned' | 'in_progress' | 'visited' | 'skipped'> = {
                                    planned: 'in_progress',
                                    in_progress: 'visited',
                                    visited: 'planned',
                                    skipped: 'planned',
                                  };
                                  handleStatusChange(stop.id, nextMap[stop.status] || 'planned');
                                }}
                              />
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-1">
                            <MapPin size={12} className="text-gray-400 shrink-0" />
                            <span className="truncate">{stop.address || 'Đà Nẵng & Huế'}</span>
                          </div>

                          {/* Hàng hành động: Sắp xếp (↑ / ↓) & Bỏ qua & Xóa */}
                          <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-100 text-xs">
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                disabled={isFirst}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleReorder(idx, 'up');
                                }}
                                className={`w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center transition ${
                                  isFirst
                                    ? 'text-gray-300 cursor-not-allowed'
                                    : 'text-gray-700 hover:bg-gray-100 cursor-pointer'
                                }`}
                                title="Đưa lên trước"
                              >
                                <ArrowUp size={13} />
                              </button>
                              <button
                                type="button"
                                disabled={isLast}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleReorder(idx, 'down');
                                }}
                                className={`w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center transition ${
                                  isLast
                                    ? 'text-gray-300 cursor-not-allowed'
                                    : 'text-gray-700 hover:bg-gray-100 cursor-pointer'
                                }`}
                                title="Đưa xuống sau"
                              >
                                <ArrowDown size={13} />
                              </button>
                            </div>

                            <div className="flex items-center gap-2">
                              {stop.status !== 'skipped' ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleStatusChange(stop.id, 'skipped');
                                  }}
                                  className="text-gray-500 hover:text-black font-medium transition cursor-pointer"
                                >
                                  Bỏ qua
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleStatusChange(stop.id, 'planned');
                                  }}
                                  className="text-emerald-700 hover:text-emerald-900 font-bold transition cursor-pointer"
                                >
                                  Khôi phục
                                </button>
                              )}
                              <span>•</span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveStop(stop.id);
                                }}
                                className="text-rose-600 hover:text-rose-800 transition cursor-pointer flex items-center gap-0.5"
                                title="Xóa khỏi lịch trình ngày này"
                              >
                                <Trash2 size={12} />
                                <span>Xóa</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* VẠCH NỐI & GỢI Ý DI CHUYỂN XANH (GREEN TRANSIT CHUẨN PB13) */}
                    {!isLast && (
                      <div className="relative py-2 pl-6 sm:pl-7">
                        {/* Đường kẻ dọc nối liền 2 mốc */}
                        <div className="absolute left-[27px] sm:left-[31px] top-0 bottom-0 w-[2px] bg-emerald-200/80 -translate-x-1/2 z-0" />

                        {/* Khối gợi ý di chuyển xanh */}
                        {stop.transitToNext ? (
                          <div
                            onClick={() => handleCycleTransitMode(stop.id)}
                            className="relative z-10 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-medium hover:bg-emerald-100 transition cursor-pointer shadow-2xs group"
                            title="Nhấp để đổi phương tiện di chuyển xanh (Đi bộ ↔ Xe đạp ↔ Buýt điện ↔ Taxi điện)"
                          >
                            <span className="p-1 rounded-full bg-emerald-100 group-hover:scale-110 transition-transform">
                              {renderTransitIcon(stop.transitToNext.mode)}
                            </span>
                            <span className="font-bold">
                              {getTransitModeLabel(stop.transitToNext.mode)}
                            </span>
                            <span>•</span>
                            <span>{stop.transitToNext.durationMinutes} phút ({stop.transitToNext.distanceMeters}m)</span>
                            <span className="bg-emerald-600 text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full">
                              🍃 -{stop.transitToNext.co2SavedKg}kg CO2
                            </span>
                          </div>
                        ) : (
                          <div className="relative z-10 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gray-100 text-gray-600 text-[11px] font-medium">
                            <Clock size={11} />
                            <span>15–20 phút di chuyển</span>
                          </div>
                        )}
                      </div>
                    )}
                  </React.Fragment>
                );
              })}

              {/* Nút thêm điểm dừng vào ngày này */}
              <div className="pt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowIdeasDrawer(true)}
                  className="flex-1 py-3 rounded-2xl border-2 border-dashed border-gray-300 hover:border-black text-gray-700 hover:text-black font-bold text-xs transition cursor-pointer flex items-center justify-center gap-1.5 bg-white/60 hover:bg-white"
                >
                  <Plus size={14} />
                  <span>+ Thêm từ Ý tưởng hoặc Địa điểm mới</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* CỘT PHẢI: BẢN ĐỒ LỘ TRÌNH ĐỒNG BỘ */}
        <div className="hidden lg:block lg:w-1/2 h-full border-l border-gray-200 relative">
          <PoiMap
            pois={mapPoisForDay}
            selectedPoiId={selectedStopId}
            hoveredPoiId={hoveredStopId}
            onSelectPoi={setSelectedStopId}
            onHoverPoi={setHoveredStopId}
            hideTopControls={true}
          />

          {/* Three.js 3D Elevation & Green Transit Wave */}
          <div className="absolute bottom-28 left-6 right-6 z-[400] max-w-sm pointer-events-auto">
            <ThreeElevationWave co2SavedKg={totalDayCo2} />
          </div>

          {/* Floating Day Route Summary Card */}
          <div className="absolute bottom-6 left-6 z-[400] bg-white/95 backdrop-blur-md p-3.5 rounded-2xl border border-gray-200/80 shadow-lg max-w-xs select-none pointer-events-auto">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 animate-ping" />
              <span className="text-xs font-bold text-gray-950 uppercase tracking-wide">
                Lộ trình Ngày {currentDay.dayNumber}
              </span>
            </div>
            <p className="text-[12.5px] text-gray-600 leading-snug">
              {currentDay.stops.length} điểm ghé thăm xếp theo thứ tự địa lý và thời gian tối ưu.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TripItineraryView;
