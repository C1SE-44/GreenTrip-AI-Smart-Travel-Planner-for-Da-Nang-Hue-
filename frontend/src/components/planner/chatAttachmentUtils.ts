import type { CopilotAttachmentPayload } from '@/services/copilotService';

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
