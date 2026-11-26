import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type WheelEvent } from 'react';
import { X } from 'lucide-react';
import './AvatarCropModal.css';

export interface AvatarCropModalProps {
  imageSrc: string;
  fileName: string;
  onCancel: () => void;
  onApply: (croppedFile: File) => void;
}

const STAGE_SIZE = 280;
const CIRCLE_DIAMETER = 240;

export default function AvatarCropModal({
  imageSrc,
  fileName,
  onCancel,
  onApply,
}: AvatarCropModalProps) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [instant, setInstant] = useState(false);
  const [applying, setApplying] = useState(false);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const dragStateRef = useRef({ active: false, sx: 0, sy: 0, ox: 0, oy: 0 });
  const wheelTimerRef = useRef<number | null>(null);

  const clampOffset = useCallback((nx: number, ny: number, nz: number) => {
    const maxOffset = Math.max(0, (STAGE_SIZE * nz - CIRCLE_DIAMETER) / 2);
    return {
      x: Math.max(-maxOffset, Math.min(maxOffset, nx)),
      y: Math.max(-maxOffset, Math.min(maxOffset, ny)),
    };
  }, []);

  useEffect(() => {
    stageRef.current?.focus({ preventScroll: true });
    return () => {
      if (wheelTimerRef.current !== null) {
        window.clearTimeout(wheelTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const onWindowKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', onWindowKey);
    return () => window.removeEventListener('keydown', onWindowKey);
  }, [onCancel]);

  const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    dragStateRef.current = {
      active: true,
      sx: e.clientX,
      sy: e.clientY,
      ox: offset.x,
      oy: offset.y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  };

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragStateRef.current.active) return;
    const stageEl = stageRef.current;
    const scaleRatio = stageEl ? stageEl.offsetWidth / Math.max(1, stageEl.getBoundingClientRect().width) : 1;
    const nx = dragStateRef.current.ox + (e.clientX - dragStateRef.current.sx) * scaleRatio;
    const ny = dragStateRef.current.oy + (e.clientY - dragStateRef.current.sy) * scaleRatio;
    setOffset(clampOffset(nx, ny, zoom));
  };

  const endDrag = () => {
    dragStateRef.current.active = false;
    setDragging(false);
  };

  const handleWheel = (e: WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    setInstant(true);
    const nextZoom = Math.max(1, Math.min(3, zoom * (e.deltaY < 0 ? 1.06 : 0.94)));
    setZoom(nextZoom);
    setOffset((prev) => clampOffset(prev.x, prev.y, nextZoom));
    if (wheelTimerRef.current !== null) window.clearTimeout(wheelTimerRef.current);
    wheelTimerRef.current = window.setTimeout(() => setInstant(false), 120);
  };

  const handleStageKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 20 : 6;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setOffset((prev) => clampOffset(prev.x + step, prev.y, zoom));
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      setOffset((prev) => clampOffset(prev.x - step, prev.y, zoom));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setOffset((prev) => clampOffset(prev.x, prev.y + step, zoom));
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOffset((prev) => clampOffset(prev.x, prev.y - step, zoom));
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      const nextZoom = Math.min(3, zoom + 0.1);
      setZoom(nextZoom);
      setOffset((prev) => clampOffset(prev.x, prev.y, nextZoom));
    } else if (e.key === '-') {
      e.preventDefault();
      const nextZoom = Math.max(1, zoom - 0.1);
      setZoom(nextZoom);
      setOffset((prev) => clampOffset(prev.x, prev.y, nextZoom));
    }
  };

  const handleApply = () => {
    const img = imgRef.current;
    if (!img || !img.naturalWidth || !img.naturalHeight) return;
    setApplying(true);

    const outSize = 512;
    const canvas = document.createElement('canvas');
    canvas.width = outSize;
    canvas.height = outSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setApplying(false);
      return;
    }

    const scaleToOut = outSize / CIRCLE_DIAMETER;
    ctx.translate(outSize / 2 + offset.x * scaleToOut, outSize / 2 + offset.y * scaleToOut);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(zoom, zoom);

    const baseScale = Math.max(STAGE_SIZE / img.naturalWidth, STAGE_SIZE / img.naturalHeight) * scaleToOut;
    const drawW = img.naturalWidth * baseScale;
    const drawH = img.naturalHeight * baseScale;
    ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);

    canvas.toBlob(
      (blob) => {
        setApplying(false);
        if (!blob) return;
        const cleanBase = fileName.replace(/\.[^/.]+$/, '') || 'avatar';
        const cropped = new File([blob], `${cleanBase}.png`, { type: 'image/png' });
        onApply(cropped);
      },
      'image/png',
      0.92,
    );
  };

  const zoomPercent = Math.round(zoom * 100);
  const trackFill = `${(((zoom - 1) / 2) * 100).toFixed(1)}%`;

  return (
    <div className="gt-crop-backdrop" onClick={onCancel}>
      <section
        className="gt-crop-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="gt-avatar-crop-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="gt-crop-top">
          <div>
            <h2 id="gt-avatar-crop-title">Cắt &amp; căn chỉnh ảnh đại diện</h2>
            <p>Kéo ảnh vào khung tròn, cuộn để phóng to</p>
          </div>
          <button
            type="button"
            className="gt-crop-close"
            aria-label="Đóng trình cắt ảnh"
            onClick={onCancel}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div
          ref={stageRef}
          className={`gt-crop-stage ${dragging ? 'drag' : ''} ${instant ? 'now' : ''}`.trim()}
          tabIndex={0}
          role="application"
          aria-roledescription="trình cắt ảnh"
          aria-label="Kéo hoặc dùng phím mũi tên để di chuyển ảnh, dùng + và - để phóng to hoặc thu nhỏ"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onWheel={handleWheel}
          onKeyDown={handleStageKeyDown}
        >
          <img
            ref={imgRef}
            src={imageSrc}
            alt="Ảnh xem trước để cắt"
            className="gt-crop-img"
            style={{
              transform: `translate(${offset.x.toFixed(1)}px, ${offset.y.toFixed(1)}px) rotate(${rotation}deg) scale(${zoom.toFixed(3)})`,
            }}
          />
          <span className="gt-crop-shade" aria-hidden="true" />
          <span className="gt-crop-grid" aria-hidden="true" />
          <span className="gt-crop-ring" aria-hidden="true" />
        </div>

        <div className="gt-crop-tools">
          <svg viewBox="0 0 18 18" aria-hidden="true">
            <circle cx="8" cy="8" r="5" />
            <path d="M12 12l4 4M6 8h4" />
          </svg>
          <input
            className="gt-crop-z"
            type="range"
            min={100}
            max={300}
            value={zoomPercent}
            aria-label="Thu phóng ảnh"
            aria-valuetext={`${zoomPercent}%`}
            style={{ '--f': trackFill } as CSSProperties}
            onChange={(e) => {
              setInstant(true);
              const nextZoom = Number(e.target.value) / 100;
              setZoom(nextZoom);
              setOffset((prev) => clampOffset(prev.x, prev.y, nextZoom));
            }}
            onMouseUp={() => setInstant(false)}
            onTouchEnd={() => setInstant(false)}
          />
          <svg viewBox="0 0 18 18" aria-hidden="true">
            <circle cx="8" cy="8" r="5" />
            <path d="M12 12l4 4M6 8h4M8 6v4" />
          </svg>
          <button
            type="button"
            className="gt-crop-rot"
            aria-label="Xoay ảnh 90 độ"
            title="Xoay 90°"
            onClick={() => setRotation((prev) => prev + 90)}
          >
            <svg viewBox="0 0 18 18" aria-hidden="true">
              <path d="M14.5 9A5.5 5.5 0 1 1 9 3.5h3M10.5 1.5L12.5 3.5 10.5 5.5" />
            </svg>
          </button>
        </div>

        <div className="gt-crop-acts">
          <button type="button" className="gt-crop-btn ghost" onClick={onCancel}>
            Hủy
          </button>
          <button
            type="button"
            className="gt-crop-btn main"
            disabled={applying}
            onClick={handleApply}
          >
            {applying ? 'Đang xử lý…' : 'Áp dụng ảnh'}
          </button>
        </div>
      </section>
    </div>
  );
}
