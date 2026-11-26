import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import './AiPromptComposer.css';

const DEFAULT_GHOST_SUGGESTIONS = [
  'Gợi ý lịch trình 3 ngày Đà Nẵng – Huế ít đông, ưu tiên xe đạp và ẩm thực bản địa',
  'Lên kế hoạch 2 ngày ở Huế tham quan Đại Nội, chùa Thiên Mụ và ăn chay thanh tịnh',
  'Tìm quán cà phê yên tĩnh view sông Hàn để làm việc buổi sáng',
  'Sắp xếp lại lịch trình ngày 2 nhẹ nhàng hơn cho gia đình có trẻ nhỏ',
];

export interface AiPromptComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onPaste?: (e: ClipboardEvent<HTMLTextAreaElement>) => void;
  onDropFile?: (file: File) => void;
  textareaRef?: React.RefObject<HTMLTextAreaElement>;
  placeholder: string;
  ariaLabel: string;
  isGenerating?: boolean;
  canSend?: boolean;
  sendAriaLabel?: string;
  sendTitle?: string;
  topSlot?: ReactNode;
  leftActions?: ReactNode;
  rightActions?: ReactNode;
  suggestions?: readonly string[];
}

export default function AiPromptComposer({
  value,
  onChange,
  onSubmit,
  onPaste,
  onDropFile,
  textareaRef: externalRef,
  placeholder,
  ariaLabel,
  isGenerating = false,
  canSend = Boolean(value.trim()),
  sendAriaLabel = 'Gửi tin nhắn',
  sendTitle = 'Gửi',
  topSlot,
  leftActions,
  rightActions,
  suggestions = DEFAULT_GHOST_SUGGESTIONS,
}: AiPromptComposerProps) {
  const internalRef = useRef<HTMLTextAreaElement | null>(null);
  const resolvedRef = externalRef ?? internalRef;
  const overlayRef = useRef<HTMLDivElement | null>(null);

  const [isDragOver, setIsDragOver] = useState(false);
  const [ghostSuffix, setGhostSuffix] = useState('');
  const [ghostVisible, setGhostVisible] = useState(false);
  const [isTakingGhost, setIsTakingGhost] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const pauseTimerRef = useRef<number | null>(null);
  const takeTimerRef = useRef<number | null>(null);

  const findMatch = useCallback(
    (text: string): string => {
      if (text.length < 3) return '';
      const lower = text.toLowerCase();
      for (const candidate of suggestions) {
        if (candidate.length > text.length && candidate.toLowerCase().startsWith(lower)) {
          return candidate.slice(text.length);
        }
      }
      return '';
    },
    [suggestions],
  );

  const syncHeight = useCallback(() => {
    const ta = resolvedRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const nextHeight = Math.max(24, Math.min(120, ta.scrollHeight));
    ta.style.height = `${nextHeight}px`;
  }, [resolvedRef]);

  useEffect(() => {
    syncHeight();
  }, [value, syncHeight]);

  useEffect(() => {
    return () => {
      if (pauseTimerRef.current !== null) window.clearTimeout(pauseTimerRef.current);
      if (takeTimerRef.current !== null) window.clearTimeout(takeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (pauseTimerRef.current !== null) window.clearTimeout(pauseTimerRef.current);
    if (dismissed || isTakingGhost || isGenerating) {
      setGhostVisible(false);
      setGhostSuffix('');
      return;
    }

    const match = findMatch(value);
    if (!match) {
      setGhostVisible(false);
      setGhostSuffix('');
      return;
    }

    pauseTimerRef.current = window.setTimeout(() => {
      const ta = resolvedRef.current;
      if (ta && ta.selectionStart === value.length && ta.selectionEnd === value.length) {
        setGhostSuffix(match);
        setGhostVisible(true);
      }
    }, 420);
  }, [value, dismissed, isTakingGhost, isGenerating, findMatch, resolvedRef]);

  const acceptGhost = () => {
    if (!ghostVisible || !ghostSuffix || isTakingGhost) return;
    setIsTakingGhost(true);
    const completed = value + ghostSuffix;

    takeTimerRef.current = window.setTimeout(() => {
      onChange(completed);
      setGhostVisible(false);
      setGhostSuffix('');
      setIsTakingGhost(false);
      window.requestAnimationFrame(() => {
        const ta = resolvedRef.current;
        if (ta) {
          ta.setSelectionRange(completed.length, completed.length);
        }
      });
    }, 260);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab' && !e.shiftKey && ghostVisible && ghostSuffix) {
      e.preventDefault();
      acceptGhost();
      return;
    }
    if (
      e.key === 'ArrowRight' &&
      ghostVisible &&
      ghostSuffix &&
      resolvedRef.current?.selectionStart === value.length
    ) {
      e.preventDefault();
      acceptGhost();
      return;
    }
    if (e.key === 'Escape' && ghostVisible) {
      e.preventDefault();
      e.stopPropagation();
      setDismissed(true);
      setGhostVisible(false);
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file || !onDropFile) return;
    e.preventDefault();
    onDropFile(file);
  };

  return (
    <div
      className={`gt-prompt-wrap ${isGenerating ? 'is-gen' : ''} ${ghostVisible ? 'is-ghost' : ''} ${isTakingGhost ? 'is-take' : ''}`.trim()}
    >
      <div
        className={`gt-prompt-box ${isDragOver ? 'is-drag' : ''}`.trim()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) {
            e.preventDefault();
            resolvedRef.current?.focus({ preventScroll: true });
          }
        }}
      >
        <i className="gt-prompt-glow" aria-hidden="true" />
        {topSlot}

        <div className="gt-prompt-input-wrap">
          {ghostSuffix ? (
            <div ref={overlayRef} className="gt-prompt-ov" aria-hidden="true">
              <span>{value}</span>
              <span className="gt-prompt-gh">
                <span className="gt-prompt-gt">{ghostSuffix}</span>
                <kbd className="gt-prompt-kb">Tab</kbd>
              </span>
            </div>
          ) : null}

          <textarea
            ref={resolvedRef}
            rows={1}
            value={value}
            onChange={(e) => {
              setDismissed(false);
              onChange(e.target.value);
            }}
            onPaste={onPaste}
            onScroll={() => {
              if (overlayRef.current && resolvedRef.current) {
                overlayRef.current.scrollTop = resolvedRef.current.scrollTop;
              }
            }}
            onBlur={() => setGhostVisible(false)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            aria-label={ariaLabel}
            className="gt-prompt-ta"
          />
        </div>

        <div className="gt-prompt-bar">
          <div className="flex items-center gap-1">{leftActions}</div>
          <div className="flex items-center gap-1.5">
            {rightActions}
            <button
              type="button"
              onClick={onSubmit}
              disabled={!canSend || isGenerating}
              aria-label={isGenerating ? 'Đang tạo phản hồi' : sendAriaLabel}
              title={sendTitle}
              className="gt-prompt-send"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 19V5.5M6 11l6-6 6 6" />
              </svg>
              <i className="gt-prompt-sq" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
