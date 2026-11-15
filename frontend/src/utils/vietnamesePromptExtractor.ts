/**
 * Bộ trích xuất ý định du lịch từ ngôn ngữ tự nhiên tiếng Việt & tiếng Anh (Mindtrip-grade Travel Intent Parser).
 * Hỗ trợ đầy đủ các kịch bản:
 *  - Đa điểm đến theo đúng thứ tự hành trình (VD: "Đà Nẵng → Huế", "Huế → Đà Nẵng → Hội An")
 *  - Cộng dồn thời lượng đa chặng (VD: "2 ngày ở Đà Nẵng và 3 ngày ở Huế" => 5 ngày)
 *  - Chuẩn hóa X ngày Y đêm / 4N3Đ (không cộng nhầm số đêm vào số ngày)
 *  - Nhận diện khoảng ngày cụ thể ("từ 10/12 đến 15/12", "10-15/12", "28/11 - 2/12")
 *  - Nhận diện tháng linh hoạt ("7 ngày trong Tháng 12") hoặc chỉ thời lượng ("5 ngày")
 *  - Phân tách chính xác Người lớn, Trẻ em (2-12t), Em bé (<2t), Thú cưng và mối quan hệ (Cặp đôi, Bố mẹ, Gia đình, Nhóm bạn, Solo)
 *  - Bóc tách Ngân sách cụ thể (VNĐ: triệu, tr, củ, nghìn, k) & tự động quy đổi sang hạng ngân sách ($ Tiết kiệm / $$ Tiêu chuẩn / $$$ Cao cấp)
 */

export interface CityLeg {
  city: string;
  days: number;
}

export interface ExtractedTripIntent {
  /** Điểm đến chuẩn hóa cho Backend ('Đà Nẵng' | 'Huế' | 'Đà Nẵng & Huế') */
  destination: 'Đà Nẵng' | 'Huế' | 'Đà Nẵng & Huế';
  /** Nhãn hành trình hiển thị chuẩn Mindtrip (VD: "Đà Nẵng → Huế", "Huế → Đà Nẵng → Hội An") */
  routeDisplay: string;
  /** Danh sách các chặng thành phố kèm số ngày (nếu người dùng chia ngày theo thành phố) */
  cityLegs: CityLeg[];
  /** Tổng số ngày của chuyến đi */
  days: number;
  /** Chế độ hiển thị mục "Khi": ngày cụ thể, số ngày trong tháng, hoặc chỉ số ngày */
  whenMode: 'dates' | 'month_duration' | 'duration' | 'month_only';
  /** Ngày bắt đầu (nếu người dùng nhập ngày cụ thể) */
  startDate: Date | null;
  /** Ngày kết thúc (nếu người dùng nhập ngày cụ thể) */
  endDate: Date | null;
  /** Tháng được nhắc tới (1-12) nếu có */
  monthNumber: number | null;
  /** Nhãn tháng ("Tháng 11", "Tháng 12", ...) nếu có */
  monthLabel: string | null;
  /** Chuỗi hiển thị trực tiếp ở dòng "Khi" chuẩn Mindtrip */
  whenDisplay: string;
  /** Chi tiết số lượng hành khách */
  guests: {
    adults: number;
    children: number;
    infants: number;
    pets: number;
  };
  totalGuests: number;
  companionshipType: 'family_seniors' | 'family_kids' | 'couple' | 'friends' | 'solo' | 'general';
  companionshipLabel: string;
  /** Chuỗi hiển thị trực tiếp ở dòng "Ai" chuẩn Mindtrip */
  whoDisplay: string;
  paceNote?: string;
  /** Ngân sách tổng (VNĐ) nếu người dùng nhập con số cụ thể */
  budgetAmountVnd: number | null;
  /** Hạng ngân sách tự động suy luận */
  budgetTier: 'budget' | 'standard' | 'luxury';
  /** Chuỗi hiển thị trực tiếp ở dòng "Ngân sách" */
  budgetDisplay: string;
  detectedTags: string[];
  summaryPill: string;
}

const VIET_NUMBER_WORDS: Record<string, number> = {
  'một': 1,
  'mot': 1,
  'hai': 2,
  'ba': 3,
  'bốn': 4,
  'bon': 4,
  'tư': 4,
  'năm': 5,
  'nam': 5,
  'sáu': 6,
  'sau': 6,
  'bảy': 7,
  'bay': 7,
  'tám': 8,
  'tam': 8,
  'chín': 9,
  'chin': 9,
  'mười': 10,
  'muoi': 10,
};

const ENGLISH_MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

function formatVndShort(amountVnd: number): string {
  if (amountVnd >= 1_000_000) {
    const millions = amountVnd / 1_000_000;
    const formatted = Number.isInteger(millions)
      ? millions.toString()
      : millions.toFixed(1).replace(/\.0$/, '').replace('.', ',');
    return `${formatted} triệu ₫`;
  }
  if (amountVnd >= 1_000) {
    return `${Math.round(amountVnd / 1_000)}k ₫`;
  }
  return `${amountVnd.toLocaleString('vi-VN')} ₫`;
}

export function extractTripIntentFromPrompt(input: string): ExtractedTripIntent {
  const text = (input || '').trim();
  const lower = text.toLowerCase();

  // -------------------------------------------------------------
  // 1. Nhận diện Điểm đến & Thứ tự Hành trình (Where / Route Order)
  // Lưu ý: Không dùng \b cho tiếng Việt có dấu vì RegExp JS chỉ coi ASCII là word char!
  // -------------------------------------------------------------
  interface PlaceToken {
    canonical: 'Đà Nẵng' | 'Huế' | 'Hội An';
    index: number;
  }

  const placePatterns: Array<{ canonical: 'Đà Nẵng' | 'Huế' | 'Hội An'; regex: RegExp }> = [
    {
      canonical: 'Đà Nẵng',
      regex: /(?:đà\s*nẵng|da\s*nang|danang|(?:^|[\s,.;:!?()/-])đn(?=$|[\s,.;:!?()/-])|bà\s*nà|ba\s*na|cầu\s*vàng|cau\s*vang|sơn\s*trà|son\s*tra|mỹ\s*khê|my\s*khe|ngũ\s*hành\s*sơn|ngu\s*hanh\s*son|cầu\s*rồng|sông\s*hàn)/gi,
    },
    {
      canonical: 'Huế',
      regex: /(?:thừa\s*thiên\s*huế|cố\s*đô\s*huế|huế|(?:^|[\s,.;:!?()/-])hue(?=$|[\s,.;:!?()/-])|đại\s*nội|dai\s*noi|kinh\s*thành|lăng\s*tự\s*đức|lăng\s*khải\s*định|lăng\s*minh\s*mạng|chùa\s*thiên\s*mụ|sông\s*hương|đồi\s*vọng\s*cảnh|lăng\s*cô|đầm\s*lập\s*an|phá\s*tam\s*giang)/gi,
    },
    {
      canonical: 'Hội An',
      regex: /(?:hội\s*an|hoi\s*an|phố\s*cổ|cù\s*lao\s*chàm|rừng\s*dừa\s*bảy\s*mẫu|an\s*bàng)/gi,
    },
  ];

  const allHits: PlaceToken[] = [];
  for (const p of placePatterns) {
    let m: RegExpExecArray | null;
    const re = new RegExp(p.regex.source, 'gi');
    while ((m = re.exec(lower)) !== null) {
      allHits.push({ canonical: p.canonical, index: m.index });
    }
  }
  allHits.sort((a, b) => a.index - b.index);

  const orderedUniquePlaces: Array<'Đà Nẵng' | 'Huế' | 'Hội An'> = [];
  for (const hit of allHits) {
    if (!orderedUniquePlaces.includes(hit.canonical)) {
      orderedUniquePlaces.push(hit.canonical);
    }
  }

  let destination: 'Đà Nẵng' | 'Huế' | 'Đà Nẵng & Huế' = 'Đà Nẵng & Huế';
  const hasDanangOrHoiAn =
    orderedUniquePlaces.includes('Đà Nẵng') || orderedUniquePlaces.includes('Hội An');
  const hasHue = orderedUniquePlaces.includes('Huế');

  if (hasDanangOrHoiAn && hasHue) {
    destination = 'Đà Nẵng & Huế';
  } else if (hasHue) {
    destination = 'Huế';
  } else if (hasDanangOrHoiAn) {
    destination = 'Đà Nẵng';
  }

  const routeDisplay =
    orderedUniquePlaces.length > 0 ? orderedUniquePlaces.join(' → ') : 'Đà Nẵng & Huế';

  // -------------------------------------------------------------
  // 2. Nhận diện Ngày cụ thể, Tháng & Tổng thời lượng (When / Duration)
  // -------------------------------------------------------------
  const now = new Date();
  const currentYear = now.getFullYear();

  // Tạo bản sao để bóc tách thời lượng mà không bị nhiễu bởi số tuổi ("6 tuổi") hay tiền ("10 triệu")
  let cleanForDuration = lower
    // Xóa cụm tuổi: "6 tuổi", "18 tháng tuổi"
    .replace(/\d+\s*(?:tuổi|tuoi|tháng\s*tuổi|thang\s*tuoi)/gi, ' ')
    // Chuẩn hóa "X ngày Y đêm" / "4N3Đ" / "5 ngày 4 đêm" -> "X ngày"
    .replace(/(\d+)\s*ngày\s*(\d+)\s*đêm/gi, '$1 ngày')
    .replace(/(\d+)\s*ngay\s*(\d+)\s*dem/gi, '$1 ngày')
    .replace(/(\d+)\s*n\s*(\d+)\s*[đd](?=$|[\s,.;:!?()/-])/gi, '$1 ngày');

  // Thay từ chỉ số tiếng Việt đi kèm "ngày" / "đêm" ("hai ngày" -> "2 ngày", "ba đêm" -> "3 đêm")
  for (const [word, num] of Object.entries(VIET_NUMBER_WORDS)) {
    const wordDayRe = new RegExp(`(?:^|[\\s,.;:!?()/-])(${word})\\s+(ngày|ngay|đêm|dem|tuần|tuan)(?=$|[\\s,.;:!?()/-])`, 'gi');
    cleanForDuration = cleanForDuration.replace(wordDayRe, ` ${num} $2`);
  }

  let startDate: Date | null = null;
  let endDate: Date | null = null;
  let monthNumber: number | null = null;
  let monthLabel: string | null = null;

  // 2A. Kiểm tra khoảng ngày cụ thể:
  // Pattern 1: "từ 10/12 đến 15/12", "10/12 - 15/12", "28/11 đến 2/12"
  const slashRangeMatch = cleanForDuration.match(
    /(?:từ\s*(?:ngày\s*)?)?(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\s*(?:đến|tới|->|-|–|to)\s*(?:ngày\s*)?(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?/i
  );
  // Pattern 2: "từ ngày 10 đến 15 tháng 12", "10 - 15/12", "10 - 15 thg 12"
  const sameMonthRangeMatch = !slashRangeMatch
    ? cleanForDuration.match(
        /(?:từ\s*(?:ngày\s*)?)?(\d{1,2})\s*(?:đến|tới|->|-|–|to)\s*(?:ngày\s*)?(\d{1,2})\s*(?:tháng|thg|\/)\s*(\d{1,2})(?:[/-](\d{2,4}))?/i
      )
    : null;
  // Pattern 3: English "Dec 10 - 15" or "Dec 10 to Dec 17"
  const engRangeMatch = !slashRangeMatch && !sameMonthRangeMatch
    ? cleanForDuration.match(
        /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})\s*(?:-|–|to)\s*(?:[a-z]+\s+)?(\d{1,2})\b/i
      )
    : null;

  if (slashRangeMatch) {
    const d1 = parseInt(slashRangeMatch[1], 10);
    const m1 = parseInt(slashRangeMatch[2], 10);
    const y1 = slashRangeMatch[3]
      ? slashRangeMatch[3].length === 2
        ? 2000 + parseInt(slashRangeMatch[3], 10)
        : parseInt(slashRangeMatch[3], 10)
      : currentYear;
    const d2 = parseInt(slashRangeMatch[4], 10);
    const m2 = parseInt(slashRangeMatch[5], 10);
    const y2 = slashRangeMatch[6]
      ? slashRangeMatch[6].length === 2
        ? 2000 + parseInt(slashRangeMatch[6], 10)
        : parseInt(slashRangeMatch[6], 10)
      : m2 < m1
      ? y1 + 1
      : y1;

    if (m1 >= 1 && m1 <= 12 && m2 >= 1 && m2 <= 12 && d1 >= 1 && d1 <= 31 && d2 >= 1 && d2 <= 31) {
      startDate = new Date(y1, m1 - 1, d1);
      endDate = new Date(y2, m2 - 1, d2);
      monthNumber = m1;
      monthLabel = `Tháng ${m1}`;
      cleanForDuration = cleanForDuration.replace(slashRangeMatch[0], ' ');
    }
  } else if (sameMonthRangeMatch) {
    const d1 = parseInt(sameMonthRangeMatch[1], 10);
    const d2 = parseInt(sameMonthRangeMatch[2], 10);
    const m = parseInt(sameMonthRangeMatch[3], 10);
    const y = sameMonthRangeMatch[4]
      ? sameMonthRangeMatch[4].length === 2
        ? 2000 + parseInt(sameMonthRangeMatch[4], 10)
        : parseInt(sameMonthRangeMatch[4], 10)
      : currentYear;

    if (m >= 1 && m <= 12 && d1 >= 1 && d1 <= 31 && d2 >= d1 && d2 <= 31) {
      startDate = new Date(y, m - 1, d1);
      endDate = new Date(y, m - 1, d2);
      monthNumber = m;
      monthLabel = `Tháng ${m}`;
      cleanForDuration = cleanForDuration.replace(sameMonthRangeMatch[0], ' ');
    }
  } else if (engRangeMatch) {
    const m = ENGLISH_MONTHS[engRangeMatch[1].toLowerCase()];
    const d1 = parseInt(engRangeMatch[2], 10);
    const d2 = parseInt(engRangeMatch[3], 10);
    if (m && d1 >= 1 && d1 <= 31 && d2 >= d1 && d2 <= 31) {
      startDate = new Date(currentYear, m - 1, d1);
      endDate = new Date(currentYear, m - 1, d2);
      monthNumber = m;
      monthLabel = `Tháng ${m}`;
      cleanForDuration = cleanForDuration.replace(engRangeMatch[0], ' ');
    }
  }

  // 2B. Kiểm tra Tháng cụ thể (nếu chưa có khoảng ngày)
  if (!monthNumber) {
    const vietMonthMatch = cleanForDuration.match(/(?:tháng|thang|thg)\s*(\d{1,2})(?=$|[\s,.;:!?()/-])/i);
    if (vietMonthMatch) {
      const m = parseInt(vietMonthMatch[1], 10);
      if (m >= 1 && m <= 12) {
        monthNumber = m;
        monthLabel = `Tháng ${m}`;
      }
    } else {
      for (const [engName, mNum] of Object.entries(ENGLISH_MONTHS)) {
        if (new RegExp(`\\b${engName}\\b`, 'i').test(cleanForDuration)) {
          monthNumber = mNum;
          monthLabel = `Tháng ${mNum}`;
          break;
        }
      }
    }
  }

  // 2C. Bóc tách các chặng số ngày theo thành phố (VD: "2 ngày ở Đà Nẵng và 3 ngày ở Huế" hoặc "Huế 3 ngày rồi vào Đà Nẵng 4 ngày")
  const cityLegs: CityLeg[] = [];
  let legWorkText = cleanForDuration;

  interface RawLegHit {
    index: number;
    city: string;
    days: number;
  }
  const rawLegHits: RawLegHit[] = [];

  // Ưu tiên 1: "2 ngày ở Đà Nẵng", "3 ngày tại Huế"
  const forwardLegRe = /(\d+)\s*(?:ngày|ngay|đêm|dem|days?|nights?)\s*(?:ở|tại|tai|o|đi|bên|vào|ra)\s*(đà\s*nẵng|da\s*nang|danang|huế|hue|hội\s*an|hoi\s*an)/gi;
  let fm: RegExpExecArray | null;
  while ((fm = forwardLegRe.exec(legWorkText)) !== null) {
    const d = parseInt(fm[1], 10);
    const rawCity = fm[2].toLowerCase();
    if (d >= 1 && d <= 14) {
      const canonicalCity =
        rawCity.includes('huế') || rawCity.includes('hue')
          ? 'Huế'
          : rawCity.includes('hội') || rawCity.includes('hoi')
          ? 'Hội An'
          : 'Đà Nẵng';
      rawLegHits.push({ index: fm.index, city: canonicalCity, days: d });
    }
  }
  // Xóa các cụm đã khớp ở Ưu tiên 1 bằng khoảng trắng có cùng độ dài để không bắt trùng
  legWorkText = legWorkText.replace(forwardLegRe, (match) => ' '.repeat(match.length));

  // Ưu tiên 2: "Huế 3 ngày", "Đà Nẵng Hội An 4 ngày"
  const reverseLegRe = /(đà\s*nẵng|da\s*nang|danang|huế|hue|hội\s*an|hoi\s*an)(?:\s*(?:và|&|-)?\s*(?:đà\s*nẵng|da\s*nang|danang|huế|hue|hội\s*an|hoi\s*an))?\s*(\d+)\s*(?:ngày|ngay|đêm|dem|days?|nights?)/gi;
  let rm: RegExpExecArray | null;
  while ((rm = reverseLegRe.exec(legWorkText)) !== null) {
    const rawCity = rm[1].toLowerCase();
    const d = parseInt(rm[2], 10);
    if (d >= 1 && d <= 14) {
      const canonicalCity =
        rawCity.includes('huế') || rawCity.includes('hue')
          ? 'Huế'
          : rawCity.includes('hội') || rawCity.includes('hoi')
          ? 'Hội An'
          : 'Đà Nẵng';
      rawLegHits.push({ index: rm.index, city: canonicalCity, days: d });
    }
  }

  rawLegHits.sort((a, b) => a.index - b.index);
  for (const hit of rawLegHits) {
    const existing = cityLegs.find((l) => l.city === hit.city);
    if (existing) {
      existing.days += hit.days;
    } else {
      cityLegs.push({ city: hit.city, days: hit.days });
    }
  }

  // 2D. Tính tổng số ngày từ tất cả các cụm "X ngày" / "X đêm" trong câu
  let days = 0;
  let hasExplicitDuration = false;

  if (startDate && endDate) {
    const diffMs = endDate.getTime() - startDate.getTime();
    days = Math.max(1, Math.min(30, Math.round(diffMs / 86400000) + 1));
    hasExplicitDuration = true;
  } else {
    const dayMatches = Array.from(
      cleanForDuration.matchAll(/(\d+)\s*(?:ngày|ngay|days?|hôm|hom)(?=$|[\s,.;:!?()/-])/gi)
    )
      .map((m) => parseInt(m[1], 10))
      .filter((n) => n >= 1 && n <= 21);

    if (dayMatches.length > 0) {
      hasExplicitDuration = true;
      if (dayMatches.length === 1) {
        days = dayMatches[0];
      } else {
        const first = dayMatches[0];
        const restSum = dayMatches.slice(1).reduce((acc, v) => acc + v, 0);
        if (first === restSum) {
          days = first;
        } else {
          days = dayMatches.reduce((acc, v) => acc + v, 0);
        }
      }
    } else {
      const nightMatches = Array.from(
        cleanForDuration.matchAll(/(\d+)\s*(?:đêm|dem|nights?)(?=$|[\s,.;:!?()/-])/gi)
      )
        .map((m) => parseInt(m[1], 10))
        .filter((n) => n >= 1 && n <= 21);

      if (nightMatches.length > 0) {
        hasExplicitDuration = true;
        const first = nightMatches[0];
        const restSum = nightMatches.slice(1).reduce((acc, v) => acc + v, 0);
        days =
          nightMatches.length > 1 && first === restSum
            ? first
            : nightMatches.reduce((acc, v) => acc + v, 0);
      } else if (/(?:1|một)\s*tuần|\ba\s*week\b/i.test(cleanForDuration)) {
        days = 7;
        hasExplicitDuration = true;
      } else if (/(?:2|hai)\s*tuần|\btwo\s*weeks\b/i.test(cleanForDuration)) {
        days = 14;
        hasExplicitDuration = true;
      } else if (/cuối\s*tuần|cuoi\s*tuan|weekend/i.test(cleanForDuration)) {
        days = 2;
        hasExplicitDuration = true;
      }
    }
  }

  if (days <= 0) {
    days = destination === 'Đà Nẵng & Huế' ? 4 : 3;
  } else {
    days = Math.min(21, Math.max(1, days));
  }

  // Kiểm tra trường hợp "khởi hành ngày 10/12 đi 5 ngày" (1 ngày bắt đầu + thời lượng)
  if (!startDate && hasExplicitDuration) {
    const singleStartMatch = cleanForDuration.match(
      /(?:từ|khởi\s*hành|bắt\s*đầu|đi\s*ngày|ngày)\s*(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?/i
    );
    if (singleStartMatch) {
      const d1 = parseInt(singleStartMatch[1], 10);
      const m1 = parseInt(singleStartMatch[2], 10);
      const y1 = singleStartMatch[3]
        ? singleStartMatch[3].length === 2
          ? 2000 + parseInt(singleStartMatch[3], 10)
          : parseInt(singleStartMatch[3], 10)
        : currentYear;
      if (m1 >= 1 && m1 <= 12 && d1 >= 1 && d1 <= 31) {
        startDate = new Date(y1, m1 - 1, d1);
        endDate = new Date(startDate.getTime() + (days - 1) * 86400000);
        monthNumber = m1;
        monthLabel = `Tháng ${m1}`;
      }
    }
  }

  // Xác định whenMode & whenDisplay chuẩn Mindtrip
  let whenMode: ExtractedTripIntent['whenMode'] = 'duration';
  let whenDisplay = `${days} ngày`;

  if (startDate && endDate) {
    whenMode = 'dates';
    const sDay = startDate.getDate();
    const sMon = startDate.getMonth() + 1;
    const eDay = endDate.getDate();
    const eMon = endDate.getMonth() + 1;
    if (sMon === eMon) {
      whenDisplay = `${sDay} – ${eDay} thg ${sMon} (${days} ngày)`;
    } else {
      whenDisplay = `${sDay}/${sMon} – ${eDay}/${eMon} (${days} ngày)`;
    }
  } else if (monthLabel && hasExplicitDuration) {
    whenMode = 'month_duration';
    whenDisplay = `${days} ngày trong ${monthLabel}`;
  } else if (monthLabel && !hasExplicitDuration) {
    whenMode = 'month_only';
    whenDisplay = `Trong ${monthLabel} (${days} ngày)`;
  } else {
    whenMode = 'duration';
    if (cityLegs.length >= 2) {
      const legSummary = cityLegs.map((l) => `${l.days}N ${l.city}`).join(' · ');
      whenDisplay = `${days} ngày (${legSummary})`;
    } else {
      whenDisplay = `${days} ngày`;
    }
  }

  // -------------------------------------------------------------
  // 3. Nhận diện Thành phần đoàn & Số khách (Who / Companionship)
  // -------------------------------------------------------------
  let adults = 2;
  let children = 0;
  let infants = 0;
  let pets = 0;
  let companionshipType: ExtractedTripIntent['companionshipType'] = 'general';
  let companionshipLabel = '';
  let paceNote = '';
  const detectedTags: string[] = [];

  let cleanForGuests = lower;
  for (const [word, num] of Object.entries(VIET_NUMBER_WORDS)) {
    const guestWordRe = new RegExp(
      `(?:^|[\\s,.;:!?()/-])(${word})\\s+(người|nguoi|khách|khach|vợ\\s*chồng|trẻ|tre|bé|be|em\\s*bé|con|cháu|bạn|anh\\s*em|chị\\s*em|đứa|chú\\s*chó|con\\s*chó|con\\s*mèo|thú\\s*cưng)(?=$|[\\s,.;:!?()/-])`,
      'gi'
    );
    cleanForGuests = cleanForGuests.replace(guestWordRe, ` ${num} $2`);
  }

  // 3A. Bóc tách số lượng cụ thể từng nhóm tuổi
  // 1) Em bé / Trẻ sơ sinh (< 2 tuổi)
  const explicitInfantMatches = Array.from(
    cleanForGuests.matchAll(/(\d+)\s*(?:em\s*bé|em\s*be|trẻ\s*sơ\s*sinh|tre\s*so\s*sinh|infants?|babies|baby)(?=$|[\s,.;:!?()/-])/gi)
  );
  if (explicitInfantMatches.length > 0) {
    infants = explicitInfantMatches.reduce((acc, m) => acc + parseInt(m[1], 10), 0);
    for (const m of explicitInfantMatches) {
      cleanForGuests = cleanForGuests.replace(m[0], ' ');
    }
  }

  // Kiểm tra thêm "X bé 1 tuổi" hoặc "X bé Y tháng tuổi" (dưới 2 tuổi => tính vào infants)
  const infantByAgeMatches = Array.from(
    cleanForGuests.matchAll(/(\d+)\s*(?:bé|be|con|trẻ|tre)\s*(?:nhỏ\s*)?(?:1\s*tuổi|dưới\s*2\s*tuổi|\d+\s*tháng(?:\s*tuổi)?)/gi)
  );
  if (infantByAgeMatches.length > 0) {
    infants += infantByAgeMatches.reduce((acc, m) => acc + parseInt(m[1], 10), 0);
    for (const m of infantByAgeMatches) {
      cleanForGuests = cleanForGuests.replace(m[0], ' ');
    }
  }

  // 2) Trẻ em (2 - 12 tuổi)
  const explicitChildMatches = Array.from(
    cleanForGuests.matchAll(/(\d+)\s*(?:trẻ\s*em|tre\s*em|trẻ\s*nhỏ|tre\s*nho|con\s*nhỏ|con\s*nho|bé|be|con|cháu|kids?|children|child)(?=$|[\s,.;:!?()/-])/gi)
  );
  if (explicitChildMatches.length > 0) {
    children = explicitChildMatches.reduce((acc, m) => acc + parseInt(m[1], 10), 0);
    for (const m of explicitChildMatches) {
      cleanForGuests = cleanForGuests.replace(m[0], ' ');
    }
  } else if (/(?:con\s*nhỏ|bé\s*nhỏ|trẻ\s*nhỏ|trẻ\s*em)/i.test(cleanForGuests)) {
    children = 1;
  }

  // Xóa các cụm tuổi còn sót lại ("6 tuổi", "10 tuổi")
  cleanForGuests = cleanForGuests.replace(/\d+\s*(?:tuổi|tuoi|tháng|thang)/gi, ' ');

  // 3) Thú cưng (Pets)
  const explicitPetMatches = Array.from(
    cleanForGuests.matchAll(/(\d+)\s*(?:thú\s*cưng|thu\s*cung|chú\s*chó|con\s*chó|chú\s*cún|con\s*cún|chú\s*mèo|con\s*mèo|pets?|dogs?|cats?)(?:\s*nhỏ)?/gi)
  );
  if (explicitPetMatches.length > 0) {
    pets = explicitPetMatches.reduce((acc, m) => acc + parseInt(m[1], 10), 0);
    for (const m of explicitPetMatches) {
      cleanForGuests = cleanForGuests.replace(m[0], ' ');
    }
  } else if (/(?:thú\s*cưng|thu\s*cung|chú\s*chó|con\s*chó|cún\s*cưng|mang\s*theo\s*chó|mang\s*theo\s*mèo|mang\s*theo\s*cún|\bpet\b)/i.test(cleanForGuests)) {
    pets = 1;
  }
  if (pets > 0) {
    detectedTags.push('has_pet');
  }

  // 4) Người lớn tường minh ("2 người lớn", "3 adults")
  const explicitAdultMatches = Array.from(
    cleanForGuests.matchAll(/(\d+)\s*(?:người\s*lớn|nguoi\s*lon|adults?)(?=$|[\s,.;:!?()/-])/gi)
  );
  const hasExplicitAdults = explicitAdultMatches.length > 0;
  if (hasExplicitAdults) {
    adults = explicitAdultMatches.reduce((acc, m) => acc + parseInt(m[1], 10), 0);
    for (const m of explicitAdultMatches) {
      cleanForGuests = cleanForGuests.replace(m[0], ' ');
    }
  }

  // 3B. Nhận diện quan hệ gia đình / cặp đôi / bố mẹ / nhóm bạn / solo
  const hasParents =
    /(?:ba\s*tôi|mẹ\s*tôi|bố\s*tôi|má\s*tôi|ba\s*mẹ|bố\s*mẹ|phụ\s*huynh|cha\s*mẹ|ba\s*em|mẹ\s*em|bố\s*em|má\s*em|người\s*lớn\s*tuổi|người\s*già|cao\s*tuổi)/i.test(lower);
  const hasGrandparents = /(?:ông\s*bà|ông\s*tôi|bà\s*tôi|ông\s*ngoại|bà\s*ngoại|ông\s*nội|bà\s*nội)/i.test(lower);

  const isCouplePhrase =
    /(?:vợ\s*chồng|hai\s*vợ\s*chồng|2\s*vợ\s*chồng|người\s*yêu|bạn\s*gái|bạn\s*trai|crush|cặp\s*đôi|\bcouple\b|trăng\s*mật|honeymoon|kỷ\s*niệm\s*ngày\s*cưới|2\s*đứa|hai\s*đứa|với\s*vợ|với\s*chồng|cùng\s*vợ|cùng\s*chồng)/i.test(lower);

  const isSoloPhrase =
    /(?:một\s*mình|1\s*mình|mot\s*minh|\bsolo\b|tự\s*túc\s*1\s*người|độc\s*hành|doc\s*hanh|phượt\s*1\s*mình|du\s*lịch\s*1\s*người)/i.test(lower);

  if (hasParents || hasGrandparents) {
    companionshipType = 'family_seniors';
    detectedTags.push('has_seniors', 'family');
    paceNote = 'Nhịp độ nhẹ nhàng, hạn chế leo bậc thang';

    if (!hasExplicitAdults) {
      const isJoiningWithSpeaker =
        /(?:cùng|với|và|dẫn|đưa|tôi|mình|em|anh|vợ\s*chồng)/i.test(lower) &&
        !/(?:đặt\s*cho\s*bố\s*mẹ|cho\s*bố\s*mẹ\s*đi\s*riêng)/i.test(lower);
      const hasBothParents =
        /(?:ba\s*mẹ|bố\s*mẹ|phụ\s*huynh|cha\s*mẹ|ông\s*bà)/i.test(lower) ||
        (lower.includes('bố') && lower.includes('mẹ')) ||
        (lower.includes('ba') && lower.includes('mẹ'));
      const alsoWithSpouse = /(?:vợ\s*chồng|bạn\s*gái|bạn\s*trai|vợ|chồng)/i.test(lower);

      if (hasBothParents) {
        adults = isJoiningWithSpeaker ? (alsoWithSpouse ? 4 : 3) : 2;
        companionshipLabel = 'Gia đình có bố mẹ';
      } else {
        adults = isJoiningWithSpeaker ? (alsoWithSpouse ? 3 : 2) : 1;
        companionshipLabel = 'Gia đình có người lớn tuổi';
      }
    } else {
      companionshipLabel = 'Gia đình có bố mẹ';
    }
  } else if (isCouplePhrase) {
    if (!hasExplicitAdults) {
      adults = 2;
    }
    if (children > 0 || infants > 0) {
      companionshipType = 'family_kids';
      companionshipLabel = 'Gia đình nhỏ';
      paceNote = 'Điểm đến an toàn, tiện nghi cho trẻ';
      detectedTags.push('has_kids', 'family');
    } else {
      companionshipType = 'couple';
      companionshipLabel = 'Cặp đôi / Lãng mạn';
      paceNote = 'Không gian riêng tư, lãng mạn';
      detectedTags.push('is_couple', 'romantic');
    }
  } else if (isSoloPhrase) {
    if (!hasExplicitAdults) {
      adults = 1;
    }
    companionshipType = 'solo';
    companionshipLabel = 'Độc hành';
    paceNote = 'Linh hoạt, trải nghiệm tự do';
    detectedTags.push('is_solo');
  }

  if (children > 0 || infants > 0) {
    if (!detectedTags.includes('has_kids')) {
      detectedTags.push('has_kids', 'family');
    }
    if (companionshipType === 'general') {
      companionshipType = 'family_kids';
      companionshipLabel = 'Gia đình';
      paceNote = 'Điểm đến an toàn, thân thiện với trẻ';
    }
  }

  // 3C. Kiểm tra tổng số người ("Gia đình 4 người", "Nhóm 5 người", "đi 6 anh em")
  if (!hasExplicitAdults) {
    const totalGroupMatch = cleanForGuests.match(
      /(?:gia\s*đình|nhóm|đoàn|hội|đi|cho|gồm|tổng\s*cộng)?\s*(\d+)\s*(?:người|nguoi|khách|khach|thành\s*viên|du\s*khách|anh\s*em|chị\s*em|bạn\s*bè|bạn|đứa|adults?|travelers?|people)(?=$|[\s,.;:!?()/-])/i
    );
    if (totalGroupMatch) {
      const totalMentioned = parseInt(totalGroupMatch[1], 10);
      if (totalMentioned >= 1 && totalMentioned <= 40) {
        const kidsCount = children + infants;
        if (kidsCount > 0 && totalMentioned > kidsCount) {
          adults = totalMentioned - kidsCount;
        } else if (kidsCount === 0) {
          adults = totalMentioned;
        }
        if (companionshipType === 'general') {
          if (adults === 1 && kidsCount === 0) {
            companionshipType = 'solo';
            companionshipLabel = 'Độc hành';
          } else if (adults === 2 && kidsCount === 0 && !/bạn|anh\s*em|chị\s*em/i.test(totalGroupMatch[0])) {
            companionshipType = 'couple';
            companionshipLabel = '2 người';
          } else if (/gia\s*đình/i.test(lower)) {
            companionshipType = 'family_kids';
            companionshipLabel = 'Gia đình';
          } else {
            companionshipType = 'friends';
            companionshipLabel = 'Nhóm bạn';
            paceNote = 'Năng động, trải nghiệm sôi nổi';
          }
        }
      }
    } else if (
      companionshipType === 'general' &&
      /(?:với\s*bạn|cùng\s*bạn|với\s*anh|với\s*chị|với\s*em)/i.test(lower)
    ) {
      adults = 2;
      companionshipLabel = '2 người';
    }
  }

  // Định dạng whoDisplay chuẩn Mindtrip ("2 người lớn", "2 người lớn, 1 trẻ em, 1 em bé, 1 thú cưng")
  const guestParts: string[] = [`${adults} người lớn`];
  if (children > 0) guestParts.push(`${children} trẻ em`);
  if (infants > 0) guestParts.push(`${infants} em bé`);
  if (pets > 0) guestParts.push(`${pets} thú cưng`);

  const baseWhoText = guestParts.join(', ');
  const whoDisplay =
    companionshipLabel && children === 0 && infants === 0 && pets === 0
      ? `${baseWhoText} (${companionshipLabel})`
      : baseWhoText;

  // -------------------------------------------------------------
  // 4. Nhận diện Ngân sách (Budget Amount & Tier)
  // -------------------------------------------------------------
  let budgetAmountVnd: number | null = null;
  let budgetTier: 'budget' | 'standard' | 'luxury' = 'standard';

  const halfMillionMatch = lower.match(/(\d+)\s*(?:triệu|trieu|tr|củ|cu)\s*(?:rưỡi|ruoi|5)(?=$|[\s,.;:!?()/-])/i);
  const decimalMillionMatch = !halfMillionMatch
    ? lower.match(/(\d+)[.,](\d+)\s*(?:triệu|trieu|tr|củ|cu)(?=$|[\s,.;:!?()/-])/i)
    : null;
  const intMillionMatch = !halfMillionMatch && !decimalMillionMatch
    ? lower.match(/(\d+)\s*(?:triệu|trieu|tr|củ|cu)(?=$|[\s,.;:!?()/-])/i)
    : null;
  const rawFormattedVndMatch = !halfMillionMatch && !decimalMillionMatch && !intMillionMatch
    ? lower.match(/(\d{1,3}(?:\.\d{3}){2,})\s*(?:đ|đồng|vnd|vnđ)?/i)
    : null;
  const thousandMatch = !halfMillionMatch && !decimalMillionMatch && !intMillionMatch && !rawFormattedVndMatch
    ? lower.match(/(\d+)\s*(?:nghìn|nghin|ngàn|ngan|k)(?=$|[\s,.;:!?()/-])/i)
    : null;

  if (halfMillionMatch) {
    budgetAmountVnd = (parseInt(halfMillionMatch[1], 10) + 0.5) * 1_000_000;
  } else if (decimalMillionMatch) {
    const whole = parseInt(decimalMillionMatch[1], 10);
    const frac = parseInt(decimalMillionMatch[2], 10) / Math.pow(10, decimalMillionMatch[2].length);
    budgetAmountVnd = Math.round((whole + frac) * 1_000_000);
  } else if (intMillionMatch) {
    budgetAmountVnd = parseInt(intMillionMatch[1], 10) * 1_000_000;
  } else if (rawFormattedVndMatch) {
    budgetAmountVnd = parseInt(rawFormattedVndMatch[1].replace(/\./g, ''), 10);
  } else if (thousandMatch) {
    budgetAmountVnd = parseInt(thousandMatch[1], 10) * 1_000;
  }

  const humanGuestCount = Math.max(1, adults + children);
  const isPerPersonBudget =
    /(?:mỗi\s*người|1\s*người|\/người|\/khách|đầu\s*người)/i.test(lower);
  const isPerDayBudget =
    /(?:mỗi\s*ngày|1\s*ngày|\/ngày)/i.test(lower);

  if (budgetAmountVnd !== null) {
    if (isPerPersonBudget && isPerDayBudget) {
      budgetAmountVnd = budgetAmountVnd * humanGuestCount * days;
    } else if (isPerPersonBudget) {
      budgetAmountVnd = budgetAmountVnd * humanGuestCount;
    } else if (isPerDayBudget) {
      budgetAmountVnd = budgetAmountVnd * days;
    }
  }

  const hasLuxuryKeywords =
    /(?:cao\s*cấp|sang\s*trọng|nghỉ\s*dưỡng\s*5\s*sao|5\s*sao|resort\s*5\s*sao|luxury|vip|xịn\s*sò|đắt\s*nhất|thoải\s*mái\s*tài\s*chính|không\s*lo\s*về\s*giá)/i.test(lower);
  const hasBudgetKeywords =
    /(?:tiết\s*kiệm|tiet\s*kiem|bình\s*dân|binh\s*dan|giá\s*rẻ|gia\s*re|sinh\s*viên|sinh\s*vien|bụi|phượt\s*rẻ|low\s*cost|chi\s*phí\s*thấp)/i.test(lower);

  if (hasLuxuryKeywords) {
    budgetTier = 'luxury';
  } else if (hasBudgetKeywords) {
    budgetTier = 'budget';
  } else if (budgetAmountVnd !== null) {
    const perPersonPerDay = budgetAmountVnd / (Math.max(1, days) * humanGuestCount);
    if (perPersonPerDay < 750_000) {
      budgetTier = 'budget';
    } else if (perPersonPerDay >= 2_200_000) {
      budgetTier = 'luxury';
    } else {
      budgetTier = 'standard';
    }
  }

  const tierLabel =
    budgetTier === 'budget'
      ? '$ Tiết kiệm'
      : budgetTier === 'luxury'
      ? '$$$ Cao cấp'
      : '$$ Tiêu chuẩn';

  const budgetDisplay =
    budgetAmountVnd !== null
      ? `${formatVndShort(budgetAmountVnd)} (${tierLabel})`
      : tierLabel;

  // -------------------------------------------------------------
  // 5. Cờ ẩm thực và sống xanh
  // -------------------------------------------------------------
  if (/(?:ăn\s*chay|đồ\s*chay|quán\s*chay|thuần\s*chay|vegetarian|vegan)/i.test(lower)) {
    detectedTags.push('is_vegetarian');
  }
  if (/(?:xanh|sinh\s*thái|môi\s*trường|bền\s*vững|tàu\s*hỏa|xe\s*đạp|xe\s*điện|\beco\b)/i.test(lower)) {
    detectedTags.push('eco_friendly');
  }

  const totalGuests = adults + children + infants + pets;

  // Format nhãn tổng hợp cho Pill hiển thị ngay dưới ô nhập
  const summaryParts: string[] = [
    routeDisplay,
    whenDisplay,
    `${adults + children + infants} khách${pets > 0 ? ` + ${pets} thú cưng` : ''}`,
  ];
  if (budgetAmountVnd !== null) {
    summaryParts.push(formatVndShort(budgetAmountVnd));
  } else if (hasLuxuryKeywords || hasBudgetKeywords) {
    summaryParts.push(tierLabel);
  }

  const summaryPill = summaryParts.join(' • ');

  return {
    destination,
    routeDisplay,
    cityLegs,
    days,
    whenMode,
    startDate,
    endDate,
    monthNumber,
    monthLabel,
    whenDisplay,
    guests: {
      adults,
      children,
      infants,
      pets,
    },
    totalGuests,
    companionshipType,
    companionshipLabel,
    whoDisplay,
    paceNote,
    budgetAmountVnd,
    budgetTier,
    budgetDisplay,
    detectedTags,
    summaryPill,
  };
}
