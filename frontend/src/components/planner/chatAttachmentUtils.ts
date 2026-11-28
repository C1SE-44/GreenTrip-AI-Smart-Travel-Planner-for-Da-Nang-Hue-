import type { CopilotAttachmentPayload, CopilotSuggestedPoi } from '@/services/copilotService';

export interface ReadyAttachment {
  payload: CopilotAttachmentPayload;
  previewUrl?: string;
  displayTitle: string;
  subtitle: string;
}

export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024; // 4 MB
const SUPPORTED_EXT_RE = /\.(jpe?g|png|webp|gif|pdf|txt|md|csv)$/i;

export function detectPlatformLabel(rawUrl: string): string {
  const lower = rawUrl.toLowerCase();
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'YouTube';
  if (lower.includes('tiktok.com')) return 'TikTok';
  if (lower.includes('instagram.com')) return 'Instagram';
  if (lower.includes('facebook.com') || lower.includes('fb.watch')) return 'Facebook';
  if (lower.includes('pinterest.com') || lower.includes('pin.it')) return 'Pinterest';
  if (lower.includes('maps.google') || lower.includes('maps.app.goo.gl')) return 'Google Maps';
  return 'Bài viết du lịch';
}

export function extractYouTubeVideoId(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();
    const idRe = /^[A-Za-z0-9_-]{11}$/;
    if (host.includes('youtu.be')) {
      const seg = parsed.pathname.replace(/^\/+/, '').split('/')[0] || '';
      return idRe.test(seg) ? seg : null;
    }
    if (host.includes('youtube.com')) {
      if (parsed.pathname === '/watch') {
        const v = parsed.searchParams.get('v') || '';
        return idRe.test(v) ? v : null;
      }
      const parts = parsed.pathname.split('/').filter(Boolean);
      if (parts.length >= 2 && ['shorts', 'embed', 'live', 'v'].includes(parts[0])) {
        return idRe.test(parts[1]) ? parts[1] : null;
      }
    }
  } catch {
    return null;
  }
  return null;
}

export function normalizeUrlInput(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    const host = parsed.hostname.toLowerCase();
    if (
      !host ||
      !host.includes('.') ||
      host === 'localhost' ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      /^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) ||
      host === '[::1]'
    ) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error('Không thể đọc tệp đã chọn.'));
    reader.readAsDataURL(file);
  });
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error('Không thể đọc nội dung tệp văn bản.'));
    reader.readAsText(file, 'utf-8');
  });
}

export async function fileToReadyAttachment(
  file: File,
  mode: 'file' | 'receipt'
): Promise<ReadyAttachment> {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error('Tệp vượt quá giới hạn 4 MB. Vui lòng chọn ảnh hoặc PDF nhẹ hơn.');
  }

  const mime = (file.type || '').toLowerCase();
  const isImage = mime.startsWith('image/');
  const isPdf = mime === 'application/pdf' || /\.pdf$/i.test(file.name);
  const isText = mime.startsWith('text/') || /\.(txt|md|csv)$/i.test(file.name);

  if (!isImage && !isPdf && !(mode === 'file' && isText) && !SUPPORTED_EXT_RE.test(file.name)) {
    throw new Error(
      mode === 'receipt'
        ? 'Chỉ hỗ trợ ảnh (PNG, JPG, WebP) hoặc PDF xác nhận đặt chỗ.'
        : 'Định dạng tệp chưa được hỗ trợ. Vui lòng chọn ảnh, PDF hoặc tệp văn bản.'
    );
  }

  let contentBase64: string | undefined;
  let previewUrl: string | undefined;
  let extractedText: string | undefined;

  if (isText && mode === 'file') {
    extractedText = (await readFileAsText(file)).slice(0, 6000);
  } else {
    const dataUrl = await readFileAsDataUrl(file);
    contentBase64 = dataUrl;
    if (isImage) {
      previewUrl = dataUrl;
    }
  }

  return {
    payload: {
      type: mode,
      file_name: file.name,
      mime_type: mime || (isPdf ? 'application/pdf' : isText ? 'text/plain' : 'application/octet-stream'),
      content_base64: contentBase64,
      extracted_text: extractedText,
    },
    previewUrl,
    displayTitle: file.name,
    subtitle:
      mode === 'receipt'
        ? 'Vé / Xác nhận đặt chỗ'
        : isImage
          ? 'Ảnh chụp / Hình ảnh du lịch'
          : 'Tệp đính kèm',
  };
}

export function getDefaultAttachmentPrompt(attachment: ReadyAttachment): string {
  if (attachment.payload.type === 'link') {
    return `Phân tích đường dẫn ${attachment.subtitle} này và liệt kê các địa điểm nổi bật`;
  }
  if (attachment.payload.type === 'receipt') {
    return `Đọc vé / xác nhận đặt chỗ "${attachment.displayTitle}" và đồng bộ gợi ý chuyến đi`;
  }
  return `Phân tích tệp "${attachment.displayTitle}" và nhận diện các điểm đến xanh phù hợp`;
}

export function getAttachmentPlaceholder(
  attachment: ReadyAttachment | null | undefined,
  defaultPlaceholder: string
): string {
  if (attachment?.payload.type === 'link') {
    return 'Bạn muốn làm gì với đường dẫn này? (VD: Liệt kê tất cả các địa điểm trong video)...';
  }
  if (attachment?.payload.type === 'file') {
    return 'Bạn muốn làm gì với tệp / ảnh này? (VD: Đây là địa điểm nào, gợi ý quán ăn gần đây)...';
  }
  if (attachment?.payload.type === 'receipt') {
    return 'Bạn muốn đồng bộ hóa đơn / xác nhận đặt chỗ này như thế nào?...';
  }
  return defaultPlaceholder;
}

export function toAttachmentSummary(attachment: ReadyAttachment) {
  return {
    type: attachment.payload.type,
    displayTitle: attachment.displayTitle,
    subtitle: attachment.subtitle,
    previewUrl: attachment.previewUrl,
    url: attachment.payload.url,
  };
}

const AB_CHOICE_PARAGRAPH_RE =
  /(?:\*\*\s*A\s*[—–-]|phương án\s+\*?\*?A\b|\bA\s*[—–-]\s*.+?\bhay\s+\*?\*?B\s*[—–-])/i;

export function normalizeCopilotMessageSingleCta(rawText: string): string {
  const text = (rawText || '').trim();
  if (!text) return '';
  const paragraphs = text.split(/\n{2,}/);
  if (paragraphs.length >= 2) {
    const last = paragraphs[paragraphs.length - 1].trim();
    const prev = paragraphs[paragraphs.length - 2].trim();
    if (AB_CHOICE_PARAGRAPH_RE.test(last) && prev.endsWith('?')) {
      return paragraphs.slice(0, -1).join('\n\n').trim();
    }
    if (last.endsWith('?') && prev.endsWith('?') && last.toLowerCase() === prev.toLowerCase()) {
      return paragraphs.slice(0, -1).join('\n\n').trim();
    }
  }
  return text;
}

function foldComparisonText(input: string): string {
  return input
    .toLowerCase()
    .replace(/^[💡✨🧭🌱]+\s*/gu, '')
    .replace(/^(?:chọn|chốt)\s*(?:phương án\s*)?[ab]\s*[:—–-]\s*/i, '')
    .replace(/^(?:bạn\s+(?:có\s+)?muốn\s+(?:mình|greentrip\s*ai)\s+)/i, '')
    .replace(/\s+không\s*\?*$/i, '')
    .replace(/[?!.,;:*"'()[\]]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function sanitizeQuickReplyChips(
  chips: string[] | undefined,
  messageText: string
): string[] {
  if (!chips || chips.length === 0) return [];
  const normalizedMsg = normalizeCopilotMessageSingleCta(messageText);
  const paragraphs = normalizedMsg
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const trailingQuestion =
    [...paragraphs].reverse().find((line) => line.endsWith('?')) || '';
  const foldedQuestion = trailingQuestion ? foldComparisonText(trailingQuestion) : '';

  const seen = new Set<string>();
  const result: string[] = [];

  for (const rawChip of chips) {
    const cleaned = (rawChip || '')
      .replace(/^[💡✨]+\s*/u, '')
      .replace(/^(?:Chọn|Chốt)\s*(?:phương án\s*)?[AB]\s*[:—–-]\s*/i, '')
      .trim();
    if (!cleaned) continue;

    const foldedChip = foldComparisonText(cleaned);
    if (!foldedChip || seen.has(foldedChip)) continue;

    // Prevent chip from repeating the exact trailing question in message text
    if (
      foldedQuestion &&
      (foldedChip === foldedQuestion ||
        (cleaned.endsWith('?') &&
          (foldedQuestion.includes(foldedChip) || foldedChip.includes(foldedQuestion))))
    ) {
      continue;
    }

    seen.add(foldedChip);
    result.push(cleaned);
    if (result.length >= 3) break;
  }

  return result;
}

export function getPoiGreenScoreExplanation(
  poi: Pick<
    CopilotSuggestedPoi,
    'green_score' | 'eco_practices' | 'category' | 'sub_category' | 'carbon_saved'
  >
): string {
  const firstPractice = poi.eco_practices?.find((item) => item && item.trim().length > 0)?.trim();
  if (firstPractice) {
    return firstPractice;
  }
  if (poi.carbon_saved && poi.carbon_saved.trim().length > 0) {
    return poi.carbon_saved.trim();
  }
  const cat = `${poi.category || ''} ${poi.sub_category || ''}`.toLowerCase();
  const score = poi.green_score || 88;
  if (cat.includes('lưu trú') || cat.includes('hotel') || cat.includes('homestay') || cat.includes('resort')) {
    return `Điểm xanh ${score}/100: Lưu trú ưu tiên kiến trúc thoáng tự nhiên, tiết kiệm điện nước & giảm nhựa dùng một lần.`;
  }
  if (cat.includes('ẩm thực') || cat.includes('quán ăn') || cat.includes('cafe') || cat.includes('food')) {
    return `Điểm xanh ${score}/100: Ưu tiên nguyên liệu bản địa tươi theo mùa và hạn chế bao bì nhựa dùng một lần.`;
  }
  if (cat.includes('di tích') || cat.includes('chùa') || cat.includes('tâm linh') || cat.includes('heritage')) {
    return `Điểm xanh ${score}/100: Không gian di sản bảo tồn cây xanh lâu năm, khuyến khích tản bộ êm ái ít khói bụi.`;
  }
  return `Điểm xanh ${score}/100: Không gian sinh thái mở, mật độ cây xanh tự nhiên cao và thân thiện môi trường.`;
}
