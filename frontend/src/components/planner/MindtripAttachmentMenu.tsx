import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Link2,
  MapPin,
  ReceiptText,
  Upload,
} from 'lucide-react';
import type { CopilotAttachmentPayload } from '@/services/copilotService';

export interface ReadyAttachment {
  payload: CopilotAttachmentPayload;
  previewUrl?: string;
  displayTitle: string;
  subtitle: string;
}

export interface MindtripAttachmentMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectAttachment: (attachment: ReadyAttachment) => void;
  align?: 'left' | 'right';
}

type PopoverView = 'menu' | 'link' | 'receipt';

const MAX_FILE_BYTES = 4 * 1024 * 1024; // 4 MB

function detectPlatformLabel(rawUrl: string): string {
  const lower = rawUrl.toLowerCase();
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'YouTube';
  if (lower.includes('tiktok.com')) return 'TikTok';
  if (lower.includes('instagram.com')) return 'Instagram';
  if (lower.includes('facebook.com') || lower.includes('fb.watch')) return 'Facebook';
  if (lower.includes('pinterest.com') || lower.includes('pin.it')) return 'Pinterest';
  if (lower.includes('maps.google') || lower.includes('maps.app.goo.gl')) return 'Google Maps';
  return 'Bài viết du lịch';
}

function extractYouTubeVideoId(rawUrl: string): string | null {
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

function normalizeUrlInput(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(candidate);
    if (!parsed.hostname || !parsed.hostname.includes('.')) return null;
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

/** 5 crisp monochrome social platform icons matching Mindtrip AI's 'Add a link' row */
function SocialPlatformIcons() {
  return (
    <span className="inline-flex items-center gap-1.5 ml-1.5 align-middle text-neutral-900" aria-hidden="true">
      {/* Instagram */}
      <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
      </svg>
      {/* YouTube */}
      <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="currentColor">
        <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31.4 31.4 0 0 0 0 12a31.4 31.4 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31.4 31.4 0 0 0 24 12a31.4 31.4 0 0 0-.5-5.8ZM9.6 15.6V8.4l6.3 3.6-6.3 3.6Z" />
      </svg>
      {/* TikTok */}
      <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19.6 6.7a4.8 4.8 0 0 1-3.8-4.7h-3.1v13.2a2.6 2.6 0 1 1-1.8-2.5V9.5a5.8 5.8 0 1 0 4.9 5.7V8.5a7.9 7.9 0 0 0 4.6 1.5V6.9c-.3 0-.6-.1-.8-.2Z" />
      </svg>
      {/* Facebook */}
      <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="currentColor">
        <path d="M24 12a12 12 0 1 0-13.9 11.9v-8.4H7.1V12h3V9.4c0-3 1.8-4.7 4.5-4.7 1.3 0 2.7.2 2.7.2v3h-1.5c-1.5 0-2 .9-2 1.9V12h3.4l-.5 3.5h-2.9v8.4A12 12 0 0 0 24 12Z" />
      </svg>
      {/* Pinterest */}
      <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0a12 12 0 0 0-4.4 23.2c-.1-1-.1-2.4 0-3.4l1.5-6.2s-.4-.7-.4-1.8c0-1.7 1-3 2.2-3 1 0 1.6.8 1.6 1.7 0 1-.7 2.6-1 4.1-.3 1.2.6 2.2 1.8 2.2 2.2 0 3.8-2.3 3.8-5.5 0-2.9-2.1-4.9-5-4.9-3.4 0-5.4 2.6-5.4 5.2 0 1 .4 2.1.9 2.7a.36.36 0 0 1 .1.3l-.3 1.3c-.1.2-.2.3-.4.2-1.5-.7-2.4-2.9-2.4-4.7 0-3.8 2.8-7.3 8-7.3 4.2 0 7.5 3 7.5 7 0 4.2-2.6 7.5-6.3 7.5-1.2 0-2.4-.6-2.8-1.4l-.8 2.9c-.3 1-1 2.4-1.5 3.2A12 12 0 1 0 12 0Z" />
      </svg>
    </span>
  );
}

export default function MindtripAttachmentMenu({
  isOpen,
  onClose,
  onSelectAttachment,
  align = 'left',
}: MindtripAttachmentMenuProps) {
  const [view, setView] = useState<PopoverView>('menu');
  const [linkInput, setLinkInput] = useState('');
  const [showScreenshotPreview, setShowScreenshotPreview] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const receiptInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setView('menu');
      setLinkInput('');
      setShowScreenshotPreview(false);
      setIsDraggingOver(false);
      setError(null);
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (view !== 'menu') {
          setView('menu');
          setError(null);
        } else {
          onClose();
        }
      }
    };

    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [isOpen, view, onClose]);

  if (!isOpen) return null;

  const processFile = async (file: File, mode: 'file' | 'receipt') => {
    setError(null);
    if (file.size > MAX_FILE_BYTES) {
      setError('Tệp vượt quá giới hạn 4 MB. Vui lòng chọn ảnh hoặc PDF nhẹ hơn.');
      return;
    }

    const mime = (file.type || '').toLowerCase();
    const isImage = mime.startsWith('image/');
    const isText = mime.startsWith('text/') || /\.(txt|md|csv)$/i.test(file.name);

    try {
      let contentBase64: string | undefined;
      let previewUrl: string | undefined;
      let extractedText: string | undefined;

      if (isText) {
        extractedText = (await readFileAsText(file)).slice(0, 6000);
      } else {
        const dataUrl = await readFileAsDataUrl(file);
        contentBase64 = dataUrl;
        if (isImage) {
          previewUrl = dataUrl;
        }
      }

      onSelectAttachment({
        payload: {
          type: mode,
          file_name: file.name,
          mime_type: mime || (isText ? 'text/plain' : 'application/octet-stream'),
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
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể xử lý tệp này.');
    }
  };

  const handleLinkSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = normalizeUrlInput(linkInput);
    if (!normalized) {
      setError('Vui lòng dán đường dẫn hợp lệ (ví dụ: https://www.youtube.com/watch?v=...).');
      return;
    }

    const platform = detectPlatformLabel(normalized);
    const ytVideoId = extractYouTubeVideoId(normalized);
    onSelectAttachment({
      payload: {
        type: 'link',
        url: normalized,
      },
      previewUrl: ytVideoId ? `https://i.ytimg.com/vi/${ytVideoId}/hqdefault.jpg` : undefined,
      displayTitle: normalized.replace(/^https?:\/\/(www\.)?/i, '').slice(0, 64),
      subtitle: platform,
    });
    onClose();
  };

  const normalizedValidUrl = normalizeUrlInput(linkInput);

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-label={
        view === 'link'
          ? 'Thêm đường dẫn'
          : view === 'receipt'
            ? 'Thêm vé hoặc hóa đơn'
            : 'Đính kèm đa phương thức'
      }
      className={`absolute bottom-full mb-3 z-50 ${
        align === 'right' ? 'right-0' : 'left-0'
      } ${
        view === 'receipt'
          ? 'w-[min(496px,calc(100vw-2rem))]'
          : 'w-[min(471px,calc(100vw-2rem))]'
      } rounded-[24px] bg-white border border-neutral-200/90 shadow-[0_12px_40px_rgba(0,0,0,0.14),0_2px_8px_rgba(0,0,0,0.06)] p-4 text-left animate-fadeIn`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Hidden native file pickers */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf,.txt,.md"
        className="hidden"
        onChange={(e) => {
          const picked = e.target.files?.[0];
          e.target.value = '';
          if (picked) void processFile(picked, 'file');
        }}
      />
      <input
        ref={receiptInputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          const picked = e.target.files?.[0];
          e.target.value = '';
          if (picked) void processFile(picked, 'receipt');
        }}
      />

      {/* VIEW 1: MAIN MENU (Matches Mindtrip 471x226px popover 1:1) */}
      {view === 'menu' && (
        <div className="space-y-1 relative">
          {/* Screenshot Mini Preview Floating Card (Matches Mindtrip #_r_d6_ 214x294px card) */}
          {showScreenshotPreview && (
            <div
              role="tooltip"
              className="hidden sm:flex flex-col w-[214px] rounded-2xl bg-white border border-neutral-200 shadow-2xl p-2.5 absolute -top-[276px] right-4 z-50 pointer-events-none animate-fadeIn"
            >
              <div className="relative h-[168px] rounded-xl overflow-hidden bg-neutral-100">
                <img
                  src="https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=400&auto=format&fit=crop&q=80"
                  alt="Ví dụ ảnh chụp màn hình review Đà Nẵng"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/80 via-black/40 to-transparent text-white">
                  <p className="text-xs font-bold leading-tight">Top 3 quán ngon Đà Nẵng 🍜</p>
                  <p className="text-[11px] text-white/85 truncate">@reviewdanang · Lưu lại đi ngay</p>
                </div>
              </div>
              <div className="mt-2 space-y-1">
                <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold">
                  <MapPin size={11} className="text-emerald-700 shrink-0" />
                  <span>Tự nhận diện địa điểm</span>
                </div>
                <p className="text-xs text-neutral-600 leading-snug">
                  Chụp màn hình bài đăng Instagram, TikTok hoặc Google Maps — AI sẽ tự bóc tách thành lịch trình xanh.
                </p>
              </div>
            </div>
          )}

          {/* Row 1: Upload a file */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            className="w-full flex items-start gap-3 rounded-2xl px-3 py-2.5 hover:bg-neutral-100/90 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
          >
            <ImageIcon size={18} strokeWidth={1.85} className="text-neutral-900 mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-[14.5px] font-semibold text-neutral-950 leading-snug">
                Tải ảnh hoặc tệp lên
              </div>
              <p className="text-xs text-neutral-600 mt-0.5 leading-relaxed">
                Bắt đầu hành trình từ ảnh du lịch,{' '}
                <button
                  type="button"
                  onMouseEnter={() => setShowScreenshotPreview(true)}
                  onMouseLeave={() => setShowScreenshotPreview(false)}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowScreenshotPreview((prev) => !prev);
                  }}
                  aria-expanded={showScreenshotPreview}
                  className="inline border-b border-dotted border-neutral-500 text-neutral-700 hover:text-black hover:border-black font-medium cursor-pointer"
                >
                  ảnh chụp màn hình
                </button>{' '}
                hoặc PDF.
              </p>
            </div>
          </div>

          {/* Row 2: Add a link */}
          <button
            type="button"
            onClick={() => {
              setShowScreenshotPreview(false);
              setError(null);
              setView('link');
            }}
            className="w-full flex items-center gap-3 rounded-2xl px-3 py-2.5 hover:bg-neutral-100/90 transition cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
          >
            <Link2 size={18} strokeWidth={1.85} className="text-neutral-900 self-start mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-[14.5px] font-semibold text-neutral-950 leading-snug">
                Thêm đường dẫn
              </div>
              <p className="text-xs text-neutral-600 mt-0.5 leading-relaxed">
                Chuyển video, bài đăng mạng xã hội và bài viết thành kế hoạch chuyến đi.
                <SocialPlatformIcons />
              </p>
            </div>
            <ChevronRight size={16} className="text-neutral-500 shrink-0" />
          </button>

          {/* Row 3: Add a receipt */}
          <button
            type="button"
            onClick={() => {
              setShowScreenshotPreview(false);
              setError(null);
              setView('receipt');
            }}
            className="w-full flex items-center gap-3 rounded-2xl px-3 py-2.5 hover:bg-neutral-100/90 transition cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
          >
            <ReceiptText size={18} strokeWidth={1.85} className="text-neutral-900 self-start mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-[14.5px] font-semibold text-neutral-950 leading-snug">
                Thêm vé / Hóa đơn
              </div>
              <p className="text-xs text-neutral-600 mt-0.5 leading-relaxed">
                Tải lên ảnh vé tàu, máy bay hoặc xác nhận đặt phòng để đồng bộ lịch trình.
              </p>
            </div>
            <ChevronRight size={16} className="text-neutral-500 shrink-0" />
          </button>
        </div>
      )}

      {/* VIEW 2: ADD A LINK (Matches Mindtrip 471x185px sub-dialog 1:1) */}
      {view === 'link' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setView('menu');
                setError(null);
              }}
              aria-label="Quay lại"
              className="w-8 h-8 rounded-full hover:bg-neutral-100 flex items-center justify-center text-neutral-800 cursor-pointer transition"
            >
              <ChevronLeft size={17} />
            </button>
            <Link2 size={16} className="text-neutral-900 shrink-0" />
            <h2 className="text-[15px] font-semibold text-neutral-950">Thêm đường dẫn</h2>
          </div>

          <form onSubmit={handleLinkSubmit} className="space-y-3">
            <input
              type="text"
              autoFocus
              value={linkInput}
              onChange={(e) => {
                setLinkInput(e.target.value);
                if (error) setError(null);
              }}
              placeholder="YouTube, TikTok, Instagram, Facebook, Pinterest hoặc link bài viết…"
              aria-label="Đường dẫn video, bài đăng hoặc bài viết du lịch"
              className="w-full h-11 rounded-full border border-neutral-900 px-4 text-sm text-neutral-950 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-900/15 transition"
            />
            <button
              type="submit"
              disabled={!normalizedValidUrl}
              className={`w-full h-11 rounded-full text-sm font-semibold transition ${
                normalizedValidUrl
                  ? 'bg-neutral-950 hover:bg-neutral-800 text-white cursor-pointer active:scale-[0.99]'
                  : 'bg-neutral-300 text-white cursor-not-allowed'
              }`}
            >
              Thêm
            </button>
          </form>
        </div>
      )}

      {/* VIEW 3: ADD A RECEIPT (Matches Mindtrip 496x311px sub-dialog 1:1) */}
      {view === 'receipt' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setView('menu');
                setError(null);
              }}
              aria-label="Quay lại"
              className="w-8 h-8 rounded-full hover:bg-neutral-100 flex items-center justify-center text-neutral-800 cursor-pointer transition"
            >
              <ChevronLeft size={17} />
            </button>
            <ReceiptText size={16} className="text-neutral-900 shrink-0" />
            <h2 className="text-[15px] font-semibold text-neutral-950">Thêm vé / Hóa đơn</h2>
          </div>

          <div
            role="button"
            tabIndex={0}
            onClick={() => receiptInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                receiptInputRef.current?.click();
              }
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDraggingOver(true);
            }}
            onDragLeave={() => setIsDraggingOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDraggingOver(false);
              const dropped = e.dataTransfer.files?.[0];
              if (dropped) void processFile(dropped, 'receipt');
            }}
            className={`min-h-[168px] rounded-2xl px-5 py-8 flex flex-col items-center justify-center text-center gap-3 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${
              isDraggingOver
                ? 'bg-emerald-50 border-2 border-dashed border-emerald-700 text-emerald-950'
                : 'bg-neutral-100/95 hover:bg-neutral-200/75 border border-transparent text-neutral-700'
            }`}
          >
            <Upload size={22} strokeWidth={1.75} className="text-neutral-700" />
            <p className="text-sm font-medium text-neutral-700">
              Kéo thả ảnh vé, xác nhận đặt chỗ hoặc bấm để tải lên
            </p>
          </div>

          <p className="text-xs text-neutral-600 text-center">
            Hỗ trợ vé tàu di sản, vé máy bay, xác nhận khách sạn (PNG, JPG, PDF — tối đa 4 MB)
          </p>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2.5 rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-xs font-medium text-rose-800">
          {error}
        </p>
      )}
    </div>
  );
}
