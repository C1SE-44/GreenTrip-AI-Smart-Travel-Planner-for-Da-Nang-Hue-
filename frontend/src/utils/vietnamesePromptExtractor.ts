/**
 * Bộ trích xuất ý định du lịch từ ngôn ngữ tự nhiên tiếng Việt (Vietnamese Travel Intent Parser).
 * Thiết kế may đo theo chuẩn Mindtrip AI: Nhận diện điểm đến, thời lượng, thành phần đoàn,
 * quan hệ gia đình (người lớn tuổi, trẻ em, cặp đôi, nhóm bạn), và cờ ngữ cảnh nhịp độ.
 */

export interface ExtractedTripIntent {
  destination: string;
  days: number;
  guests: {
    adults: number;
    children: number;
    infants: number;
    pets: number;
  };
  totalGuests: number;
  companionshipType: 'family_seniors' | 'family_kids' | 'couple' | 'friends' | 'solo' | 'general';
  companionshipLabel: string;
  paceNote?: string;
  detectedTags: string[];
  summaryPill: string;
}

export function extractTripIntentFromPrompt(input: string): ExtractedTripIntent {
  const text = (input || '').trim();
  const lower = text.toLowerCase();

  // -------------------------------------------------------------
  // 1. Nhận diện Điểm đến (Destination / Where)
  // -------------------------------------------------------------
  let destination = 'Đà Nẵng & Huế';
  const hasDanang = lower.includes('đà nẵng') || lower.includes('da nang') || lower.includes('danang');
  const hasHue = lower.includes('huế') || lower.includes('hue');

  if (hasDanang && hasHue) {
    destination = 'Đà Nẵng & Huế';
  } else if (hasDanang) {
    destination = 'Đà Nẵng';
  } else if (hasHue) {
    destination = 'Huế';
  }

  // -------------------------------------------------------------
  // 2. Nhận diện Số ngày (Duration / When)
  // -------------------------------------------------------------
  let days = 4; // Mặc định chuẩn
  const dayDigitMatch = lower.match(/(\d+)\s*(?:ngày|ngay|day|days|hôm)/i) || lower.match(/(\d+)n(\d+)d/i);
  if (dayDigitMatch) {
    const parsedDays = parseInt(dayDigitMatch[1], 10);
    if (parsedDays >= 1 && parsedDays <= 14) {
      days = parsedDays;
    }
  } else if (lower.includes('1 tuần') || lower.includes('một tuần') || lower.includes('mot tuan')) {
    days = 7;
  } else if (lower.includes('hai tuần') || lower.includes('2 tuần')) {
    days = 14;
  } else if (lower.includes('cuối tuần') || lower.includes('cuoi tuan') || lower.includes('weekend')) {
    days = 2;
  } else if (lower.includes('một ngày') || lower.includes('trong ngày') || lower.includes('1 ngày')) {
    days = 1;
  } else if (lower.includes('hai ngày') || lower.includes('2 ngày')) {
    days = 2;
  } else if (lower.includes('ba ngày') || lower.includes('3 ngày')) {
    days = 3;
  } else if (lower.includes('bốn ngày') || lower.includes('4 ngày')) {
    days = 4;
  } else if (lower.includes('năm ngày') || lower.includes('5 ngày')) {
    days = 5;
  } else if (lower.includes('sáu ngày') || lower.includes('6 ngày')) {
    days = 6;
  } else if (lower.includes('bảy ngày') || lower.includes('7 ngày')) {
    days = 7;
  } else if (lower.includes('tám ngày') || lower.includes('8 ngày')) {
    days = 8;
  }

  // -------------------------------------------------------------
  // 3. Nhận diện Thành phần đoàn & Số khách (Who / Companionship)
  // -------------------------------------------------------------
  let adults = 2;
  let children = 0;
  const infants = 0;
  let pets = 0;
  let companionshipType: ExtractedTripIntent['companionshipType'] = 'general';
  let companionshipLabel = '';
  let paceNote = '';
  const detectedTags: string[] = [];

  // A. Trường hợp đi với Ba Mẹ / Bố Mẹ / Phụ huynh / Ông Bà (Senior-friendly)
  const hasParents = 
    lower.includes('ba tôi') || lower.includes('mẹ tôi') || lower.includes('bố tôi') || lower.includes('má tôi') ||
    lower.includes('ba mẹ') || lower.includes('bố mẹ') || lower.includes('phụ huynh') || lower.includes('cha mẹ') ||
    lower.includes('ba em') || lower.includes('mẹ em') || lower.includes('bố em') || lower.includes('má em');

  const hasGrandparents = lower.includes('ông bà') || lower.includes('ông tôi') || lower.includes('bà tôi');

  if (hasParents || hasGrandparents) {
    companionshipType = 'family_seniors';
    detectedTags.push('has_seniors', 'family');
    paceNote = 'Nhịp độ nhẹ nhàng, hạn chế leo dốc';

    // Đếm cụ thể quan hệ
    const mentionsSelf = lower.includes('tôi') || lower.includes('mình') || lower.includes('em') || lower.includes('anh');
    const hasBothBaAndMe = 
      (lower.includes('ba') && lower.includes('mẹ')) || 
      (lower.includes('bố') && lower.includes('mẹ')) || 
      lower.includes('ba mẹ') || lower.includes('bố mẹ') || lower.includes('phụ huynh') || lower.includes('cha mẹ');

    if (hasBothBaAndMe) {
      adults = mentionsSelf ? 3 : 2; // "Tôi đi với ba và mẹ" -> 3 người; "cho bố mẹ đi" -> 2 người
      companionshipLabel = 'Gia đình có bố mẹ';
    } else if (lower.includes('ba tôi') || lower.includes('bố tôi') || lower.includes('ba em') || lower.includes('bố em')) {
      adults = mentionsSelf ? 2 : 1;
      companionshipLabel = 'Gia đình đi cùng bố';
    } else if (lower.includes('mẹ tôi') || lower.includes('má tôi') || lower.includes('mẹ em') || lower.includes('má em')) {
      adults = mentionsSelf ? 2 : 1;
      companionshipLabel = 'Gia đình đi cùng mẹ';
    } else if (hasGrandparents) {
      adults = mentionsSelf ? 3 : 2;
      companionshipLabel = 'Gia đình có ông bà';
    } else {
      adults = 3;
      companionshipLabel = 'Gia đình có người lớn tuổi';
    }
  }

  // B. Nhận diện trẻ em đi kèm gia đình
  const kidMatch = 
    lower.match(/(\d+)\s*(?:bé|con|trẻ|cháu|con nhỏ|em bé|kids?|children)/i) ||
    lower.match(/(?:kèm|mang theo|có)\s*(\d+)\s*(?:bé|con|trẻ|cháu)/i);

  if (kidMatch) {
    children = parseInt(kidMatch[1], 10);
    detectedTags.push('has_kids', 'family');
    companionshipType = 'family_kids';
    companionshipLabel = `Gia đình (${children} bé)`;
    paceNote = 'Điểm đến an toàn, thân thiện với trẻ';
  } else if (lower.includes('con nhỏ') || lower.includes('bé nhỏ') || lower.includes('em bé')) {
    children = 1;
    detectedTags.push('has_kids', 'family');
    companionshipType = 'family_kids';
    companionshipLabel = 'Gia đình có con nhỏ';
    paceNote = 'Điểm đến an toàn, thân thiện với trẻ';
  }

  // C. Trường hợp Cặp đôi / Vợ chồng / Người yêu / Trăng mật (khi chưa có trẻ nhỏ)
  if (
    lower.includes('vợ chồng') || lower.includes('hai vợ chồng') ||
    lower.includes('người yêu') || lower.includes('bạn gái') || lower.includes('bạn trai') || lower.includes('crush') ||
    lower.includes('cặp đôi') || lower.includes('trăng mật') || lower.includes('honeymoon') ||
    lower.includes('kỷ niệm ngày cưới') || lower.includes('2 đứa mình') || lower.includes('hai đứa mình')
  ) {
    if (children > 0) {
      // Vợ chồng có con -> Gia đình
      companionshipType = 'family_kids';
      companionshipLabel = `Gia đình (bố mẹ & ${children} con)`;
      paceNote = 'Điểm đến an toàn, tiện nghi cho trẻ';
    } else {
      companionshipType = 'couple';
      companionshipLabel = 'Cặp đôi / Lãng mạn';
      paceNote = 'Không gian riêng tư, lãng mạn';
      detectedTags.push('is_couple', 'romantic');
      adults = 2;
    }
  }

  // D. Trường hợp Độc hành (Solo Traveler)
  else if (
    lower.includes('một mình') || lower.includes('1 mình') || lower.includes('mot minh') ||
    lower.includes('solo') || lower.includes('tự túc 1 người') || lower.includes('độc hành') ||
    lower.includes('phượt 1 mình') || lower.includes('du lịch 1 người')
  ) {
    companionshipType = 'solo';
    companionshipLabel = 'Độc hành (1 người)';
    paceNote = 'Linh hoạt, trải nghiệm tự do';
    detectedTags.push('is_solo');
    adults = 1;
  }

  // E. Nhận diện thú cưng
  if (lower.includes('cún') || lower.includes('chó') || lower.includes('mèo') || lower.includes('thú cưng') || lower.includes('pet')) {
    pets = 1;
    detectedTags.push('has_pet');
  }

  // F. Trường hợp có số đếm rõ ràng (Digit guest match) nếu chưa được phân loại gia đình
  if (companionshipType === 'general') {
    const guestMatch = lower.match(/(?:nhóm|đoàn|đi|cho)?\s*(\d+)\s*(?:người|khách|thành viên|adults?|travelers?|du khách|đứa|bạn)/i);
    if (guestMatch) {
      const g = parseInt(guestMatch[1], 10);
      if (g >= 1 && g <= 30) {
        adults = g;
        if (g === 1) {
          companionshipType = 'solo';
          companionshipLabel = 'Độc hành';
        } else if (g === 2) {
          companionshipType = 'couple';
          companionshipLabel = '2 người';
        } else if (g <= 5) {
          companionshipType = 'friends';
          companionshipLabel = `Nhóm bạn (${g} người)`;
          paceNote = 'Năng động, check-in sôi nổi';
        } else {
          companionshipType = 'friends';
          companionshipLabel = `Đoàn đông (${g} người)`;
          paceNote = 'Không gian rộng, thuận tiện đi lại';
        }
      }
    } else if (lower.includes('hai người') || lower.includes('2 người')) {
      adults = 2;
      companionshipLabel = '2 du khách';
    } else if (lower.includes('ba người') || lower.includes('3 người')) {
      adults = 3;
      companionshipLabel = '3 du khách';
    } else if (lower.includes('bốn người') || lower.includes('4 người')) {
      adults = 4;
      companionshipLabel = '4 du khách';
    } else if (lower.includes('năm người') || lower.includes('5 người')) {
      adults = 5;
      companionshipLabel = '5 du khách';
    }
  }

  // G. Cờ ẩm thực và sống xanh
  if (lower.includes('ăn chay') || lower.includes('chay') || lower.includes('vegetarian')) {
    detectedTags.push('is_vegetarian');
  }
  if (lower.includes('xanh') || lower.includes('sinh thái') || lower.includes('môi trường') || lower.includes('tàu hỏa') || lower.includes('xe buýt')) {
    detectedTags.push('eco_friendly');
  }

  const totalGuests = adults + children + infants + pets;

  // Format nhãn tổng hợp cho Pill hiển thị
  let summaryPill = `${destination} • ${days} ngày • ${totalGuests} người`;
  if (companionshipLabel) {
    if (paceNote) {
      summaryPill += ` (${companionshipLabel} - ${paceNote})`;
    } else {
      summaryPill += ` (${companionshipLabel})`;
    }
  }

  return {
    destination,
    days,
    guests: {
      adults,
      children,
      infants,
      pets,
    },
    totalGuests,
    companionshipType,
    companionshipLabel,
    paceNote,
    detectedTags,
    summaryPill,
  };
}
