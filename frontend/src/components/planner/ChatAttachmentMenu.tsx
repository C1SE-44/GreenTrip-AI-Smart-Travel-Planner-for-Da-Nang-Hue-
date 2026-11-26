import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Link2,
  MapPin,
  ReceiptText,
  X,
} from 'lucide-react';
import {
  detectPlatformLabel,
  extractYouTubeVideoId,
  fileToReadyAttachment,
  normalizeUrlInput,
  type ReadyAttachment,
} from './chatAttachmentUtils';
import FileDropzone from './FileDropzone';

export interface ChatAttachmentMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectAttachment: (attachment: ReadyAttachment) => void;
  align?: 'left' | 'right';
}

type PopoverView = 'menu' | 'link';

export function AttachmentThumbnail({
  previewUrl,
  alt,
  type,
  tone = 'light',
}: {
  previewUrl?: string;
  alt: string;
  type: 'file' | 'link' | 'receipt';
  tone?: 'light' | 'dark';
}) {
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [previewUrl]);

  if (previewUrl && !imgFailed) {
    return (
      <img
        src={previewUrl}
        alt={alt}
        onError={() => setImgFailed(true)}
        className={`rounded-xl object-cover shrink-0 ${
          tone === 'dark' ? 'w-10 h-10 border border-white/20' : 'w-12 h-12 border border-neutral-200'
        }`}
      />
    );
  }

  return (
    <div
      className={`rounded-xl flex items-center justify-center shrink-0 ${
        tone === 'dark'
          ? 'w-9 h-9 bg-white/15 text-white'
          : 'w-10 h-10 bg-emerald-50 border border-emerald-200 text-emerald-800'
      }`}
    >
      {type === 'link' ? (
        <Link2 size={17} />
      ) : type === 'receipt' ? (
        <ReceiptText size={17} />
      ) : (
        <ImageIcon size={17} />
      )}
    </div>
  );
}

export function StagedAttachmentChip({
  attachment,
  onRemove,
}: {
  attachment: ReadyAttachment;
  onRemove: () => void;
}) {
  return (
    <div
      data-testid="staged-attachment-chip"
      className="mb-2.5 inline-flex items-center gap-2.5 rounded-2xl border border-neutral-200 bg-neutral-50 p-1.5 pr-2 max-w-full"
    >
      <AttachmentThumbnail
        previewUrl={attachment.previewUrl}
        alt={attachment.displayTitle}
        type={attachment.payload.type}
      />
      <div className="min-w-0 text-left">
        <p className="text-xs font-semibold text-neutral-950 truncate max-w-[220px]">
          {attachment.displayTitle}
        </p>
        <p className="text-xs text-neutral-600 truncate">
          {attachment.subtitle} · Nhập câu hỏi rồi bấm gửi
        </p>
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label="Gỡ tệp đính kèm"
        className="w-10 h-10 rounded-full hover:bg-neutral-200 flex items-center justify-center text-neutral-700 shrink-0 cursor-pointer transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
      >
        <X size={15} />
      </button>
    </div>
  );
}

function SocialPlatformIcons() {
  return (
    <span className="inline-flex items-center gap-1.5 ml-1.5 align-middle text-neutral-900" aria-hidden="true">
      <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
      </svg>
      <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="currentColor">
        <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31.4 31.4 0 0 0 0 12a31.4 31.4 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31.4 31.4 0 0 0 24 12a31.4 31.4 0 0 0-.5-5.8ZM9.6 15.6V8.4l6.3 3.6-6.3 3.6Z" />
      </svg>
      <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19.6 6.7a4.8 4.8 0 0 1-3.8-4.7h-3.1v13.2a2.6 2.6 0 1 1-1.8-2.5V9.5a5.8 5.8 0 1 0 4.9 5.7V8.5a7.9 7.9 0 0 0 4.6 1.5V6.9c-.3 0-.6-.1-.8-.2Z" />
      </svg>
      <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="currentColor">
        <path d="M24 12a12 12 0 1 0-13.9 11.9v-8.4H7.1V12h3V9.4c0-3 1.8-4.7 4.5-4.7 1.3 0 2.7.2 2.7.2v3h-1.5c-1.5 0-2 .9-2 1.9V12h3.4l-.5 3.5h-2.9v8.4A12 12 0 0 0 24 12Z" />
      </svg>
      <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0a12 12 0 0 0-4.4 23.2c-.1-1-.1-2.4 0-3.4l1.5-6.2s-.4-.7-.4-1.8c0-1.7 1-3 2.2-3 1 0 1.6.8 1.6 1.7 0 1-.7 2.6-1 4.1-.3 1.2.6 2.2 1.8 2.2 2.2 0 3.8-2.3 3.8-5.5 0-2.9-2.1-4.9-5-4.9-3.4 0-5.4 2.6-5.4 5.2 0 1 .4 2.1.9 2.7a.36.36 0 0 1 .1.3l-.3 1.3c-.1.2-.2.3-.4.2-1.5-.7-2.4-2.9-2.4-4.7 0-3.8 2.8-7.3 8-7.3 4.2 0 7.5 3 7.5 7 0 4.2-2.6 7.5-6.3 7.5-1.2 0-2.4-.6-2.8-1.4l-.8 2.9c-.3 1-1 2.4-1.5 3.2A12 12 0 1 0 12 0Z" />
      </svg>
    </span>
  );
}

export default function ChatAttachmentMenu({
  isOpen,
  onClose,
  onSelectAttachment,
  align = 'left',
}: ChatAttachmentMenuProps) {
  const [view, setView] = useState<PopoverView>('menu');
  const [linkInput, setLinkInput] = useState('');
  const [showScreenshotPreview, setShowScreenshotPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setView('menu');
      setLinkInput('');
      setShowScreenshotPreview(false);
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

  const processFile = async (file: File) => {
    setError(null);
    try {
      const ready = await fileToReadyAttachment(file, 'file');
      onSelectAttachment(ready);
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
      aria-label={view === 'link' ? 'Thêm đường dẫn' : 'Đính kèm đa phương thức'}
      className={`absolute bottom-full mb-3 z-50 ${
        align === 'right' ? 'right-0' : 'left-0'
      } w-[min(471px,calc(100vw-2rem))] rounded-[24px] bg-white border border-neutral-200/90 shadow-[0_12px_40px_rgba(0,0,0,0.14),0_2px_8px_rgba(0,0,0,0.06)] p-4 text-left animate-fadeIn`}
      onClick={(e) => e.stopPropagation()}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf,.txt,.md,.csv"
        className="hidden"
        onChange={(e) => {
          const picked = e.target.files?.[0];
          e.target.value = '';
          if (picked) void processFile(picked);
        }}
      />

      {view === 'menu' && (
        <div className="space-y-1 relative">
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
                  <p className="text-xs font-bold leading-tight">Top 3 quán ngon Đà Nẵng</p>
                  <p className="text-xs text-white/90 truncate">@reviewdanang · Lưu lại đi ngay</p>
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

          <FileDropzone
            onPickFile={(picked) => void processFile(picked)}
            onBrowseClick={() => fileInputRef.current?.click()}
          />

          {/* Row 1: Upload a file (non-nested interactive controls) */}
          <div className="w-full flex items-start gap-3 rounded-2xl px-3 py-2.5 hover:bg-neutral-100/90 transition relative min-h-[44px]">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Tải ảnh hoặc tệp lên"
              className="absolute inset-0 rounded-2xl cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
            />
            <ImageIcon size={18} strokeWidth={1.85} className="text-neutral-900 mt-0.5 shrink-0 relative pointer-events-none" />
            <div className="min-w-0 flex-1 relative pointer-events-none">
              <div className="text-[14.5px] font-semibold text-neutral-950 leading-snug">
                Tải ảnh hoặc tệp lên
              </div>
              <p className="text-xs text-neutral-600 mt-0.5 leading-relaxed">
                Bắt đầu hành trình từ ảnh du lịch,{' '}
                <button
                  type="button"
                  onMouseEnter={() => setShowScreenshotPreview(true)}
                  onMouseLeave={() => setShowScreenshotPreview(false)}
                  onFocus={() => setShowScreenshotPreview(true)}
                  onBlur={() => setShowScreenshotPreview(false)}
                  onClick={() => setShowScreenshotPreview((prev) => !prev)}
                  aria-expanded={showScreenshotPreview}
                  className="pointer-events-auto relative z-10 inline border-b border-dotted border-neutral-600 text-neutral-700 hover:text-black hover:border-black font-medium cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 rounded-xs"
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
            className="w-full min-h-[44px] flex items-center gap-3 rounded-2xl px-3 py-2.5 hover:bg-neutral-100/90 transition cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
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
            <ChevronRight size={16} className="text-neutral-600 shrink-0" />
          </button>
        </div>
      )}

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
              className="w-10 h-10 rounded-full hover:bg-neutral-100 flex items-center justify-center text-neutral-800 cursor-pointer transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
            >
              <ChevronLeft size={18} />
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
              aria-invalid={Boolean(linkInput.trim() && !normalizedValidUrl)}
              className="w-full h-11 rounded-full border border-neutral-900 px-4 text-sm text-neutral-950 placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-neutral-900/15 transition"
            />
            {linkInput.trim().length > 0 && !normalizedValidUrl && !error && (
              <p className="text-xs text-amber-800 px-2" role="status">
                Nhập đường dẫn công khai có tên miền hợp lệ (VD: youtube.com, tiktok.com, facebook.com…).
              </p>
            )}
            <button
              type="submit"
              disabled={!normalizedValidUrl}
              className={`w-full h-11 rounded-full text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${
                normalizedValidUrl
                  ? 'bg-neutral-950 hover:bg-neutral-800 text-white cursor-pointer active:scale-[0.99]'
                  : 'bg-neutral-300 text-neutral-700 cursor-not-allowed'
              }`}
            >
              Thêm
            </button>
          </form>
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
