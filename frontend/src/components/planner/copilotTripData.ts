import type { CopilotSuggestedPoi } from '@/services/copilotService';
import type { ExtractedTripIntent } from '@/utils/vietnamesePromptExtractor';

export interface BudgetSummary {
  lodging: string;
  dining: string;
  tickets: string;
  transit: string;
  totalTarget: string;
}

export interface DayNarrativeItem {
  slotTitle: string;
  transit: string;
  cost: string;
  reason: string;
  greenImpact: string;
}

export interface DayNarrative {
  day: number;
  title: string;
  intro: string;
  items: DayNarrativeItem[];
  dateText?: string;
  weatherTemp?: string;
  weatherCondition?: 'rain' | 'sun' | 'cloud' | string;
  experienceCount?: number;
  highlights?: string;
  image?: string;
}

export interface CopilotTripMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  thinkingProcess?: string;
  thinkingDuration?: string;
  budgetSummary?: BudgetSummary;
  dayNarratives?: DayNarrative[];
  suggestedPois?: CopilotSuggestedPoi[];
  actionType?: 'replace_stop' | 'add_stop' | 'none' | string;
  targetSlot?: string | null;
  avoidNotice?: string | null;
  greenImpactSummary?: string | null;
  budgetImpactSummary?: string | null;
  nextSuggestedPrompts?: string[];
}

export interface CopilotStop {
  id: string;
  poiId?: string;
  timeSlot: string;
  name: string;
  category: string;
  distanceKm?: number;
  note?: string;
  estimatedCost?: string;
  image?: string;
  greenScore?: number;
}

export interface CopilotDayOutline {
  day: number;
  theme: string;
  focus_city: string;
  suggested_activities?: string[];
  hotel?: {
    name: string;
    checkInNote: string;
    isEcoCertified?: boolean;
  };
  stops: CopilotStop[];
}

/**
 * Sinh ra Lịch trình mẫu chuẩn Mindtrip.ai nối kết đúng các POI thật trong cơ sở dữ liệu Đà Nẵng & Huế
 */
export const buildDefaultCopilotItinerary = (
  destination: string = 'Đà Nẵng & Huế',
  daysCount: number = 4
): CopilotDayOutline[] => {
  const normDest = destination.trim() || 'Đà Nẵng & Huế';
  const isHueOnly = normDest.toLowerCase().includes('huế') && !normDest.toLowerCase().includes('đà nẵng');
  const isBoth = (normDest.toLowerCase().includes('đà nẵng') || normDest.toLowerCase().includes('da nang')) &&
    (normDest.toLowerCase().includes('huế') || normDest.toLowerCase().includes('hue'));
  const days = Math.max(1, Math.min(14, daysCount || 4));

  const defaultDays: CopilotDayOutline[] = [];

  // Day 1: Chăm cổ & nhịp sông Hàn
  defaultDays.push({
    day: 1,
    theme: isHueOnly ? 'Khám phá Kinh Thành & Cố đô Huế' : 'Chăm cổ & nhịp sông Hàn',
    focus_city: isHueOnly ? 'Huế' : 'Đà Nẵng',
    hotel: {
      name: isHueOnly ? 'Khách sạn Cố Đô Xanh (Huế)' : 'Red Palace Hotel (Đà Nẵng)',
      checkInNote: 'Gửi hành lý từ 08:00 • Nhận phòng sau 14:00 • 2 đêm lưu trú',
      isEcoCertified: true,
    },
    stops: [
      {
        id: 'stop-1-1',
        timeSlot: '09:00 - 11:00',
        name: isHueOnly ? 'Đại Nội Huế (Hoàng Thành)' : 'Bảo tàng Điêu khắc Chăm',
        category: 'di-tich',
        distanceKm: isHueOnly ? 2.5 : 3.0,
        note: isHueOnly ? 'Hoàng thành triều Nguyễn với bề dày lịch sử' : 'Mở đầu văn hóa Chăm pa, tham quan trong nhà mát mẻ',
        estimatedCost: isHueOnly ? '200.000 đ' : '60.000 đ',
        image: isHueOnly
          ? 'https://images.unsplash.com/photo-1569154941061-e231b4725ef1?w=800&auto=format&fit=crop&q=80'
          : 'https://images.unsplash.com/photo-1596422846543-75c6fc197f07?w=800&auto=format&fit=crop&q=80',
        greenScore: 95,
      },
      {
        id: 'stop-1-2',
        timeSlot: '11:30 - 12:30',
        name: isHueOnly ? 'Bún Bò Mụ Kéo' : 'Cơm Gà Lan',
        category: 'quan-an',
        distanceKm: 1.2,
        note: isHueOnly ? 'Tô bún bò chả cua chuẩn vị Cố Đô' : 'Cơm gà xé vàng ươm đậm đà chuẩn vị bản xứ',
        estimatedCost: isHueOnly ? '45.000 đ' : '65.000 đ',
        image: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800&auto=format&fit=crop&q=80',
        greenScore: 92,
      },
      {
        id: 'stop-1-3',
        timeSlot: '15:30 - 17:00',
        name: isHueOnly ? 'Đi bộ đường hoa Lê Lợi & Ngắm Sông Hương' : 'Đi bộ bờ sông Hàn & Cầu Rồng',
        category: 'canh-quan',
        distanceKm: 0.8,
        note: isHueOnly ? 'Dạo mát bờ nam sông Hương thư thái' : 'Tản bộ ngắm sông Hàn, tận hưởng không khí trong lành',
        estimatedCost: 'Miễn phí',
        image: 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=800&auto=format&fit=crop&q=80',
        greenScore: 98,
      },
      {
        id: 'stop-1-4',
        timeSlot: '18:30 - 19:45',
        name: isHueOnly ? 'Bánh Bèo Nậm Lọc Bà Đỏ' : 'Bánh Xèo Tôm Nhảy Cô Ba',
        category: 'quan-an',
        distanceKm: 1.5,
        note: isHueOnly ? 'Khay bánh cung đình trứ danh xứ Huế' : 'Vỏ bánh giòn rụm, tôm đất nhảy và rau mầm tươi xanh',
        estimatedCost: isHueOnly ? '60.000 đ' : '85.000 đ',
        image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&auto=format&fit=crop&q=80',
        greenScore: 89,
      },
    ],
  });

  // Day 2: Núi đá, rừng biển Sơn Trà
  if (days >= 2) {
    defaultDays.push({
      day: 2,
      theme: isHueOnly ? 'Lăng tẩm Cung đình & Vườn rường Huế' : 'Núi đá, rừng biển Sơn Trà',
      focus_city: isHueOnly ? 'Huế' : 'Đà Nẵng',
      hotel: {
        name: isHueOnly ? 'Nghỉ tại Khách sạn Cố Đô Xanh' : 'Nghỉ tại Red Palace Hotel',
        checkInNote: 'Tiếp tục kỳ nghỉ thư thái',
        isEcoCertified: true,
      },
      stops: [
        {
          id: 'stop-2-1',
          timeSlot: '08:30 - 11:00',
          name: isHueOnly ? 'Lăng Khải Định' : 'Danh thắng Ngũ Hành Sơn',
          category: 'di-tich',
          distanceKm: isHueOnly ? 9.0 : 8.0,
          note: isHueOnly ? 'Tuyệt tác khảm sành sứ độc đáo' : 'Hệ thống hang động thạch anh và chùa Tam Thai cổ kính',
          estimatedCost: isHueOnly ? '150.000 đ' : '55.000 đ',
          image: isHueOnly
            ? 'https://images.unsplash.com/photo-1583417319070-4a69db38a482?w=800&auto=format&fit=crop&q=80'
            : 'https://images.unsplash.com/photo-1528127269322-539801943592?w=800&auto=format&fit=crop&q=80',
          greenScore: 94,
        },
        {
          id: 'stop-2-2',
          timeSlot: '11:30 - 13:00',
          name: isHueOnly ? 'Nhà hàng chay Sân Mây' : 'Bếp Vừng (Cơm nhà miền Trung)',
          category: 'quan-an',
          distanceKm: 3.5,
          note: isHueOnly ? 'Ẩm thực thực dưỡng trong khuôn viên nhà rường' : 'Mô hình nhà hàng sinh thái giảm thiểu rác thải nhựa',
          estimatedCost: isHueOnly ? '90.000 đ' : '95.000 đ',
          image: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800&auto=format&fit=crop&q=80',
          greenScore: 93,
        },
        {
          id: 'stop-2-3',
          timeSlot: '14:30 - 17:30',
          name: isHueOnly ? 'Đồi Vọng Cảnh & Sông Hương' : 'Bán đảo Sơn Trà & Chùa Linh Ứng',
          category: 'canh-quan',
          distanceKm: isHueOnly ? 6.1 : 12.0,
          note: isHueOnly ? 'Ngắm khúc uốn sông Hương trong hoàng hôn' : 'Quan sát Voọc chà vá chân nâu từ xa, không để lại rác thải',
          estimatedCost: 'Miễn phí',
          image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&auto=format&fit=crop&q=80',
          greenScore: 96,
        },
      ],
    });
  }

  // Day 3: Chuyến tàu di sản qua Đèo Hải Vân đến Cố Đô Huế
  if (days >= 3) {
    defaultDays.push({
      day: 3,
      theme: isBoth ? 'Chuyến tàu Di sản qua Đèo Hải Vân đến Cố đô' : (isHueOnly ? 'Làng nghề & Chùa thanh tịnh' : 'Biển xanh Mỹ Khê & Làng đá Non Nước'),
      focus_city: isBoth ? 'Đà Nẵng → Huế' : (isHueOnly ? 'Huế' : 'Đà Nẵng'),
      hotel: {
        name: isBoth ? 'Khách sạn Cố Đô Huế' : (isHueOnly ? 'Khách sạn Cố Đô Xanh' : 'Red Palace Hotel'),
        checkInNote: isBoth ? 'Nhận phòng sau 14:00 tại Cố Đô Huế' : 'Nghỉ đêm thư giãn',
        isEcoCertified: true,
      },
      stops: [
        {
          id: 'stop-3-1',
          timeSlot: '07:50 - 11:05',
          name: isBoth ? 'Tàu di sản Đà Nẵng – Huế' : (isHueOnly ? 'Chùa Thiên Mụ' : 'Bãi biển Mỹ Khê'),
          category: 'canh-quan',
          distanceKm: isBoth ? 102.0 : 3.5,
          note: isBoth ? 'Tuyến tàu hỏa ven biển vịnh Lăng Cô tuyệt đẹp, giảm phát thải carbon' : 'Không gian xanh mát, đón gió biển',
          estimatedCost: isBoth ? '210.000 đ' : 'Miễn phí',
          image: isBoth
            ? 'https://images.unsplash.com/photo-1532103054090-a33923a78210?w=800&auto=format&fit=crop&q=80'
            : 'https://images.unsplash.com/photo-1571508601891-ca5e7a713859?w=800&auto=format&fit=crop&q=80',
          greenScore: 98,
        },
        {
          id: 'stop-3-2',
          timeSlot: '12:30 - 13:30',
          name: isBoth ? 'Bún Bò Huế Bà Cam' : 'Roots Plant-based Cafe',
          category: 'quan-an',
          distanceKm: 2.5,
          note: 'Ẩm thực chuẩn vị với nguồn nguyên liệu tươi xanh sạch',
          estimatedCost: '50.000 đ',
          image: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=800&auto=format&fit=crop&q=80',
          greenScore: 91,
        },
        {
          id: 'stop-3-3',
          timeSlot: '14:30 - 17:00',
          name: isBoth ? 'Đại Nội Huế (Hoàng Thành & Tử Cấm Thành)' : 'Làng đá mỹ nghệ Non Nước',
          category: 'di-tich',
          distanceKm: 1.5,
          note: 'Quần thể di tích Cố Đô triều Nguyễn được UNESCO công nhận',
          estimatedCost: isBoth ? '200.000 đ' : 'Miễn phí',
          image: 'https://images.unsplash.com/photo-1569154941061-e231b4725ef1?w=800&auto=format&fit=crop&q=80',
          greenScore: 95,
        },
        {
          id: 'stop-3-4',
          timeSlot: '17:30 - 19:00',
          name: isBoth ? 'Bánh khoái & Nem lụi Hồng Mai' : 'Hải sản Mộc Quán',
          category: 'quan-an',
          distanceKm: 1.5,
          note: 'Nước tương béo bùi, nem nướng than hoa thơm nồng vị xứ Huế',
          estimatedCost: '75.000 đ',
          image: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800&auto=format&fit=crop&q=80',
          greenScore: 88,
        },
      ],
    });
  }

  // Day 4: Chùa cổ & Vườn lăng Cố đô Huế
  if (days >= 4) {
    defaultDays.push({
      day: 4,
      theme: isBoth ? 'Lăng tẩm Hoàng gia & Ẩm thực thanh tịnh' : 'Chợ truyền thống & Mua sắm đặc sản Xanh',
      focus_city: isBoth ? 'Huế' : normDest,
      hotel: {
        name: isBoth ? 'Nghỉ tại Khách sạn Cố Đô Huế' : 'Nghỉ tại Red Palace Hotel',
        checkInNote: 'Ngày kết thúc hành trình trọn vẹn',
        isEcoCertified: true,
      },
      stops: [
        {
          id: 'stop-4-1',
          timeSlot: '08:00 - 09:30',
          name: isBoth ? 'Chùa Thiên Mụ' : 'Chợ Hàn (Mua sắm đặc sản bao bì xanh)',
          category: isBoth ? 'chua' : 'di-tich',
          distanceKm: 4.8,
          note: isBoth ? 'Ngôi chùa cổ kính 400 năm soi bóng dòng sông Hương' : 'Trải nghiệm mua sắm đặc sản bao bì thân thiện môi trường',
          estimatedCost: 'Miễn phí',
          image: 'https://images.unsplash.com/photo-1571508601891-ca5e7a713859?w=800&auto=format&fit=crop&q=80',
          greenScore: 96,
        },
        {
          id: 'stop-4-2',
          timeSlot: '10:00 - 12:00',
          name: isBoth ? 'Lăng Tự Đức & Vườn thông' : 'Cà phê Muối Chú Long / Specialty Coffee',
          category: isBoth ? 'di-tich' : 'quan-an',
          distanceKm: 5.6,
          note: isBoth ? 'Kiến trúc lăng tẩm kết hợp vườn hoa hồ nước thơ mộng' : 'Thưởng thức hương vị cà phê muối đặc trưng miền Trung',
          estimatedCost: isBoth ? '150.000 đ' : '45.000 đ',
          image: 'https://images.unsplash.com/photo-1583417319070-4a69db38a482?w=800&auto=format&fit=crop&q=80',
          greenScore: 92,
        },
        {
          id: 'stop-4-3',
          timeSlot: '12:30 - 14:00',
          name: isBoth ? 'Cơm chay thực dưỡng An Nhiên Garden' : 'Bánh tráng cuốn thịt heo Quê Xưa',
          category: 'quan-an',
          distanceKm: 3.2,
          note: 'Bữa ăn chay thanh tịnh trong nhà rường cổ kính, giảm 60% dấu chân carbon',
          estimatedCost: '95.000 đ',
          image: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=800&auto=format&fit=crop&q=80',
          greenScore: 97,
        },
      ],
    });
  }

  return defaultDays;
};

/**
 * Tạo lịch sử hội thoại chuẩn Mindtrip.ai (User prompt + AI Thought + Budget Card + Day-by-day Guide)
 */
export const buildDefaultCopilotConversation = (
  destination: string = 'Đà Nẵng & Huế',
  days: number = 4,
  people: number = 2,
  userPrompt?: string,
  intent?: ExtractedTripIntent | null
): CopilotTripMessage[] => {
  const normDest = destination.trim() || 'Đà Nẵng & Huế';
  const defaultPromptText = userPrompt && userPrompt.trim().length > 0
    ? userPrompt.trim()
    : `Lập một chuyến đi ${days} ngày tại ${normDest} cho ${people} du khách với ngân sách 6 triệu đồng mỗi người, không bao gồm chi phí di chuyển đến Việt Nam. Chúng tôi thích ẩm thực địa phương, văn hóa và thiên nhiên. Ưu tiên các trải nghiệm thân thiện với môi trường, thời gian di chuyển hợp lý và không quá bốn hoạt động chính mỗi ngày. Tạo lịch trình chi tiết theo từng ngày kèm chi phí ước tính, khoảng cách di chuyển và lý do cho mỗi đề xuất.`;

  // Tùy biến lời mở đầu theo ngữ cảnh thấu hiểu
  let customGreeting = `Chào Minh Nguyên — mình đã lên lịch trình ${days} ngày tại ${normDest}, ưu tiên cụm điểm gần nhau để di chuyển hợp lý, tối đa 4 hoạt động chính/ngày, thiên về trải nghiệm "xanh" và bám sát ngân sách phù hợp.`;
  let customThinking = `Phân tích yêu cầu từ du khách:\n- Điểm đến: ${normDest} (${days} ngày, ${people} người)\n- Tối ưu tuyến đường: Gom cụm các điểm gần nhau, tránh việc di chuyển con thoi gây lãng phí thời gian và phát thải CO2.\n- Giới hạn tải: Tối đa 4 hoạt động chính/ngày để du khách tận hưởng trọn vẹn, không vội vã.\n- Tiêu chuẩn Du lịch Xanh: Taxi điện, tàu hỏa di sản, ưu tiên ẩm thực bản địa sạch và giảm thiểu rác thải nhựa.`;

  if (intent?.companionshipType === 'family_seniors') {
    customGreeting = `Chào Minh Nguyên — mình đã thiết kế lịch trình ${days} ngày tại ${normDest} dành riêng cho chuyến đi cùng gia đình (${intent.companionshipLabel || 'ba mẹ'}, ${people} người). Vì trong đoàn có người lớn tuổi, mình đặc biệt tối ưu nhịp độ thật thong thả, các điểm tham quan bằng phẳng dễ đi, ưu tiên taxi điện đưa đón tận nơi và gợi ý các bữa ăn cơm nhà đậm đà, thanh đạm dễ tiêu hóa.`;
    customThinking = `Phân tích yêu cầu từ du khách:\n- Điểm đến: ${normDest} (${days} ngày, ${people} người)\n- Thành phần đoàn: ${intent.companionshipLabel} (Có người lớn tuổi / ba mẹ)\n- Ràng buộc quan trọng: ${intent.paceNote || 'Nhịp độ nhẹ nhàng, hạn chế leo dốc, bậc thang gắt'}\n- Phương tiện ưu tiên: Xe taxi điện êm ái, hạn chế đi bộ nắng gắt giữa trưa.\n- Ẩm thực: Cơm niêu gia đình miền Trung, ẩm thực cung đình Huế nhẹ nhàng, không quá cay nồng.`;
  } else if (intent?.companionshipType === 'family_kids') {
    customGreeting = `Chào Minh Nguyên — mình đã lên lịch trình ${days} ngày tại ${normDest} cho gia đình bạn (${intent.companionshipLabel}). Lịch trình được bố trí các điểm tham quan an toàn, vui tươi cho các bé, giãn cách thời gian để bé không bị mệt và ưu tiên không gian sinh thái trong lành.`;
    customThinking = `Phân tích yêu cầu từ du khách:\n- Điểm đến: ${normDest} (${days} ngày, ${people} người)\n- Thành phần đoàn: ${intent.companionshipLabel}\n- Ràng buộc quan trọng: Điểm đến an toàn cho trẻ, có chỗ nghỉ ngơi, thời gian ăn uống đúng bữa.`;
  } else if (intent?.companionshipType === 'couple') {
    customGreeting = `Chào Minh Nguyên — mình đã lên lịch trình ${days} ngày tại ${normDest} cho 2 bạn (${intent.companionshipLabel}). Lịch trình tập trung vào các không gian lãng mạn, các quán cafe view ngắm hoàng hôn, nhà hàng ẩm thực ấm cúng và những khoảnh khắc thư thái bên nhau.`;
    customThinking = `Phân tích yêu cầu từ du khách:\n- Điểm đến: ${normDest} (${days} ngày, 2 người)\n- Thành phần đoàn: Cặp đôi / Kỷ niệm lãng mạn\n- Trọng tâm: Không gian riêng tư, view đẹp, khoảnh khắc hoàng hôn và ẩm thực tinh tế.`;
  } else if (intent?.companionshipType === 'solo') {
    customGreeting = `Chào Minh Nguyên — mình đã lên lịch trình khám phá ${days} ngày tại ${normDest} dành riêng cho chuyến độc hành của bạn. Lịch trình được tối ưu linh hoạt, đậm chất khám phá văn hóa bản địa, cafe chill và các quán ăn đường phố thân thiện với du khách một mình.`;
    customThinking = `Phân tích yêu cầu từ du khách:\n- Điểm đến: ${normDest} (${days} ngày, 1 người)\n- Phong cách: Độc hành tự do, linh hoạt lịch trình, trải nghiệm sâu sắc văn hóa địa phương.`;
  }

  return [
    {
      id: 'msg_user_init',
      sender: 'user',
      text: defaultPromptText,
      timestamp: '16:05',
    },
    {
      id: 'msg_assistant_init',
      sender: 'assistant',
      thinkingDuration: '2.8s',
      thinkingProcess: customThinking,
      text: `${customGreeting}\n\nLưu ý: Trip của bạn đang để "dates are flexible", nên mình trình bày theo Day 1–Day ${days} (không gắn ngày cụ thể). Các con số chi phí là ước tính thực tế để bạn cân đối.`,
      budgetSummary: {
        lodging: '~1.000.000–2.200.000 VND',
        dining: '~1.200.000–1.800.000 VND',
        tickets: '~600.000–800.000 VND',
        transit: '~1.000.000–1.600.000 VND',
        totalTarget: '~3.8–6.4 triệu VND/người (linh hoạt theo hạng phòng & mức đi taxi/Grab)',
      },
      dayNarratives: [
        {
          day: 1,
          title: 'Day 1 — 📍 Đà Nẵng: Văn hóa Chăm + nhịp sông Hàn 🌿',
          intro: 'Nhẹ nhàng, đi bộ nhiều, "local food" giá dễ chịu để vào gu ngay từ đầu.',
          dateText: 'Day 1 • Wed, Nov 11',
          weatherTemp: '27°C',
          weatherCondition: 'rain',
          experienceCount: 5,
          highlights: 'Arrival and Hotel Check-in • Bảo tàng Điêu khắc Chăm • Cơm Gà Lan • Tản bộ bờ sông Hàn & Cầu Rồng • Bánh Xèo Tôm Nhảy Cô Ba',
          image: 'https://images.unsplash.com/photo-1596422846543-75c6fc197f07?w=800&auto=format&fit=crop&q=80',
          items: [
            {
              slotTitle: '1) Tham quan 🏛️ Bảo tàng Điêu khắc Chăm',
              transit: 'từ trung tâm ~3 km (~8 phút taxi điện)',
              cost: '~60.000 VND/người (vé vào cổng)',
              reason: 'mở đầu bằng văn hóa - lịch sử miền Trung, tham quan trong nhà nên đỡ mệt, phù hợp nhịp ngày 1.',
              greenImpact: 'Công trình kiến trúc di sản mở thoáng, đi bộ tham quan.',
            },
            {
              slotTitle: '2) Ăn trưa 🍗 Cơm Gà Lan',
              transit: 'cách bảo tàng ~1.2 km',
              cost: '~55.000–80.000 VND/người',
              reason: 'cơm gà xé vàng ươm, nước sốt đậm đà, quán địa phương uy tín đông khách bản xứ.',
              greenImpact: 'Ưu tiên nguyên liệu thực phẩm tươi sạch nuôi trồng địa phương.',
            },
            {
              slotTitle: '3) Tản bộ chiều 🌊 Đi bộ bờ sông Hàn & Cầu Rồng',
              transit: 'tản bộ dọc bờ sông',
              cost: '0 VND',
              reason: 'trải nghiệm gió mát lành từ sông Hàn, ngắm nhìn nhịp sống yên bình của thành phố.',
              greenImpact: 'Hoạt động đi bộ giảm 100% lượng khí thải phương tiện cá nhân.',
            },
            {
              slotTitle: '4) Ăn tối 🥟 Bánh Xèo Tôm Nhảy Cô Ba',
              transit: '~1.5 km',
              cost: '~70.000–110.000 VND/người',
              reason: 'vỏ bánh giòn rụm, tôm đất nhảy tươi ngon, đĩa rau rừng dồi dào tươi mát.',
              greenImpact: 'Nông sản hữu cơ sạch đạt chứng nhận nguồn gốc.',
            },
          ],
        },
        {
          day: 2,
          title: 'Day 2 — ⛰️ Núi đá, rừng biển Sơn Trà',
          intro: 'Khám phá thiên nhiên kỳ vĩ, hít thở không khí trong lành từ biển và núi rừng.',
          dateText: 'Day 2 • Thu, Nov 12',
          weatherTemp: '26°C',
          weatherCondition: 'sun',
          experienceCount: 5,
          highlights: 'Danh thắng Ngũ Hành Sơn • Bếp Vừng Cơm nhà • Bán đảo Sơn Trà & Chùa Linh Ứng • Ngắm hoàng hôn Biển Mỹ Khê • Chợ Đêm Helio',
          image: 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=800&auto=format&fit=crop&q=80',
          items: [
            {
              slotTitle: '1) Buổi sáng ⛰️ Danh thắng Ngũ Hành Sơn',
              transit: 'cách trung tâm ~8 km',
              cost: '~40.000 VND/người (vé) + ~15.000 VND thang máy',
              reason: 'hệ thống hang động thạch anh và chùa Tam Thai cổ kính, không khí thanh tịnh.',
              greenImpact: 'Khu bảo tồn danh thắng tự nhiên, khuyến khích leo bậc thang rèn luyện sức khỏe.',
            },
            {
              slotTitle: '2) Ăn trưa 🍲 Bếp Vừng (Cơm nhà miền Trung)',
              transit: 'cách chân núi ~3.5 km',
              cost: '~85.000–130.000 VND/người',
              reason: 'bữa cơm nhà ấm cúng với cá kho tộ, canh cua rau đay và cà pháo giòn tan.',
              greenImpact: 'Mô hình nhà hàng sinh thái giảm thiểu rác thải nhựa và thực phẩm dư thừa.',
            },
            {
              slotTitle: '3) Buổi chiều 🐒 Bán đảo Sơn Trà & Chùa Linh Ứng',
              transit: '~12 km men theo cung đường biển',
              cost: 'Miễn phí vé',
              reason: 'ngắm tượng Phật Bà 67m hướng biển, tận mắt quan sát đàn Voọc chà vá chân nâu quý hiếm.',
              greenImpact: 'Không cho thú hoang ăn, tuyệt đối không xả rác tại khu bảo tồn sinh quyển.',
            },
          ],
        },
        {
          day: 3,
          title: 'Day 3 — 🚆 Chuyến tàu di sản qua Đèo Hải Vân đến Cố Đô Huế',
          intro: 'Hành trình di chuyển xanh bằng đường sắt ngắm trọn cảnh sắc vịnh Lăng Cô và dãy Bạch Mã.',
          dateText: 'Day 3 • Fri, Nov 13',
          weatherTemp: '29°C',
          weatherCondition: 'rain',
          experienceCount: 5,
          highlights: 'Tàu hỏa Di sản Đèo Hải Vân • Đại Nội Huế & Tử Cấm Thành • Bánh khoái & Nem lụi Hồng Mai • Ca Huế trên Sông Hương • Phố đi bộ Hoàng Thành',
          image: 'https://images.unsplash.com/photo-1569154941061-e231b4725ef1?w=800&auto=format&fit=crop&q=80',
          items: [
            {
              slotTitle: '1) Sáng sớm 🚆 Tàu hỏa du lịch Di sản Đèo Hải Vân',
              transit: 'Ga Đà Nẵng → Ga Huế (~102 km, ~3 giờ)',
              cost: '~180.000–210.000 VND/vé',
              reason: 'tuyến tàu đẹp nhất Việt Nam, toa tàu hoài cổ có biểu diễn ca Huế và ẩm thực nhẹ.',
              greenImpact: 'Phương tiện đường sắt giảm 75% khí phát thải so với đi ô tô riêng.',
            },
            {
              slotTitle: '2) Chiều 🏛️ Đại Nội Huế (Hoàng Thành & Tử Cấm Thành)',
              transit: 'cách ga Huế ~2.5 km',
              cost: '~200.000 VND/người (vé tham quan)',
              reason: 'quần thể di tích Cố Đô triều Nguyễn được UNESCO công nhận, kiến trúc cung đình tráng lệ.',
              greenImpact: 'Di sản lịch sử được gìn giữ nghiêm ngặt, khuôn viên nhiều cây cổ thụ xanh mát.',
            },
            {
              slotTitle: '3) Chiều muộn 🥢 Bánh khoái & Nem lụi Hồng Mai',
              transit: 'cách Đại Nội ~1.5 km (phố Đinh Tiên Hoàng)',
              cost: '~60.000–90.000 VND/người',
              reason: 'nước lèo tương đậu phộng gia truyền thơm béo, nem nướng than hoa thơm lừng.',
              greenImpact: 'Quán ăn lâu đời bảo tồn hương vị truyền thống xứ Huế.',
            },
          ],
        },
        {
          day: 4,
          title: 'Day 4 — 🏯 Lăng tẩm Hoàng gia & Ẩm thực thanh tịnh xứ Huế',
          intro: 'Trải nghiệm không gian an yên, đắm mình trong thiền định và ẩm thực thực dưỡng.',
          dateText: 'Day 4 • Sat, Nov 14',
          weatherTemp: '30°C',
          weatherCondition: 'sun',
          experienceCount: 4,
          highlights: 'Chùa Thiên Mụ • Lăng Tự Đức & Vườn thông • Cơm chay thực dưỡng An Nhiên • Thưởng thức Cà phê Muối Cố Đô',
          image: 'https://images.unsplash.com/photo-1571508601891-ca5e7a713859?w=800&auto=format&fit=crop&q=80',
          items: [
            {
              slotTitle: '1) Buổi sáng 🏯 Chùa Thiên Mụ & Lăng Tự Đức',
              transit: '~5 km dọc đường Kim Long men theo sông Hương',
              cost: 'Chùa Thiên Mụ miễn phí, Lăng Tự Đức ~150.000 VND/người',
              reason: 'lăng tẩm có phong cảnh sơn thủy hữu tình nhất của triều Nguyễn, hòa quyện với rừng thông.',
              greenImpact: 'Hệ sinh thái vườn lăng cổ gìn giữ thảm thực vật tự nhiên.',
            },
            {
              slotTitle: '2) Buổi trưa 🌿 Cơm chay thực dưỡng An Nhiên Garden',
              transit: 'cách lăng ~3 km',
              cost: '~90.000–150.000 VND/người',
              reason: 'không gian nhà rường Huế cổ kính rợp bóng cây, các món chay thanh tao từ rau nấm tự nhiên.',
              greenImpact: 'Bữa ăn chay giảm 60% dấu chân carbon, thanh lọc cơ thể trước khi kết thúc chuyến đi.',
            },
          ],
        },
      ],
      nextSuggestedPrompts: [
        'Quán ăn ngon đặc sản ở Đà Nẵng',
        'Đổi quán ăn trưa sang quán chay',
        'Trời mưa thì đi đâu chơi?',
        'Quán cafe view đẹp ngắm hoàng hôn',
      ],
      timestamp: '16:06',
    },
  ];
};


/**
 * Builds standard MindTrip DayNarrative array from an existing itineraryOutline.
 * Used for legacy trips or dynamic itinerary summary responses in chat.
 */
export function buildDayNarrativesFromOutline(
  outline: CopilotDayOutline[],
  startDateStr?: string
): DayNarrative[] {
  if (!outline || outline.length === 0) return [];

  const weathers: Array<{ temp: string; cond: 'rain' | 'sun' | 'cloud' }> = [
    { temp: '27°C', cond: 'rain' },
    { temp: '26°C', cond: 'sun' },
    { temp: '29°C', cond: 'rain' },
    { temp: '30°C', cond: 'sun' },
    { temp: '28°C', cond: 'cloud' },
    { temp: '27°C', cond: 'cloud' },
    { temp: '26°C', cond: 'rain' },
  ];

  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  let baseDate = new Date();
  if (startDateStr) {
    const parsed = new Date(startDateStr);
    if (!isNaN(parsed.getTime())) {
      baseDate = parsed;
    }
  }

  return outline.map((dayItem: CopilotDayOutline, idx: number) => {
    const curDate = new Date(baseDate);
    curDate.setDate(baseDate.getDate() + idx);
    const dayName = daysOfWeek[curDate.getDay()];
    const monthName = months[curDate.getMonth()];
    const dateNum = curDate.getDate();
    const dateText = 'Day ' + dayItem.day + ' • ' + dayName + ', ' + monthName + ' ' + dateNum;

    const weather = weathers[idx % weathers.length];
    const stops = dayItem.stops || [];
    const experienceCount = stops.length || 4;
    const highlights = stops.map((s: CopilotStop) => s.name).join(' • ');
    const image =
      stops[0]?.image ||
      'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=800&auto=format&fit=crop&q=80';

    return {
      day: dayItem.day,
      title: dayItem.theme || ('Khám phá Ngày ' + dayItem.day),
      intro: 'Lịch trình chi tiết ngày ' + dayItem.day + ' với ' + experienceCount + ' điểm trải nghiệm xanh và văn hóa bản địa.',
      dateText,
      weatherTemp: weather.temp,
      weatherCondition: weather.cond,
      experienceCount,
      highlights,
      image,
      items: stops.map((stop: CopilotStop, sIdx: number) => ({
        slotTitle: (sIdx + 1) + ') ' + (stop.timeSlot || '09:00 - 11:00') + ' ' + stop.name,
        transit: stop.distanceKm ? ('~' + stop.distanceKm + ' km') : 'Tản bộ',
        cost: stop.estimatedCost || 'Miễn phí',
        reason: stop.note || 'Trải nghiệm văn hóa & ẩm thực đặc sắc',
        greenImpact: 'Điểm xanh ' + (stop.greenScore || 90) + '/100',
      })),
    };
  });
}


// Backward-compatibility aliases for smooth transition
export type MindtripCopilotMessage = CopilotTripMessage;
export type MindtripStop = CopilotStop;
export type MindtripDayOutline = CopilotDayOutline;
export const buildDefaultMindtripItinerary = buildDefaultCopilotItinerary;
export const buildDefaultMindtripConversation = buildDefaultCopilotConversation;
