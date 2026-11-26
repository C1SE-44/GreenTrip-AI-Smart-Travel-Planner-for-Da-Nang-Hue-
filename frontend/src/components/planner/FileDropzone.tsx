import { useState, type DragEvent, type KeyboardEvent } from 'react';
import { Upload } from 'lucide-react';
import './FileDropzone.css';

export interface FileDropzoneProps {
  onPickFile: (file: File) => void;
  onBrowseClick: () => void;
}

export default function FileDropzone({ onPickFile, onBrowseClick }: FileDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const picked = e.dataTransfer.files?.[0];
    if (picked) onPickFile(picked);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onBrowseClick();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Kéo thả ảnh hoặc tệp vào đây, hoặc nhấn để chọn tệp"
      className={`gt-dz ${isDragging ? 'is-drag' : ''}`.trim()}
      onClick={onBrowseClick}
      onKeyDown={handleKeyDown}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <span className="gt-dz-ar" aria-hidden="true">
        <Upload size={18} strokeWidth={2.1} />
      </span>
      <span className="gt-dz-title">
        {isDragging ? 'Thả tệp để đính kèm ngay' : 'Kéo thả ảnh, ảnh chụp màn hình hoặc PDF'}
      </span>
      <span className="gt-dz-sub">Hoặc bấm để chọn tệp từ thiết bị · Tối đa 10 MB</span>
    </div>
  );
}
