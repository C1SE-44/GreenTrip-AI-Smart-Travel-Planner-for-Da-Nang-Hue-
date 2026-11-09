import React from 'react';
import { MorphIcon } from 'morphicons/react';

// Standard 24x24 SVG path definitions
export const ICONS = {
  heartOutline: "M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z",
  heartFilled: "M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z",
  plus: "M12 5v14M5 12h14",
  check: "M20 6L9 17l-5-5",
  clock: "M12 6v6l4 2M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z",
  play: "M5 3l14 9-14 9V3z",
};

export interface MorphFavoriteButtonProps {
  isFavorited: boolean;
  onToggle: () => void;
  className?: string;
}

export const MorphFavoriteButton: React.FC<MorphFavoriteButtonProps> = ({
  isFavorited,
  onToggle,
  className = '',
}) => {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={`w-8 h-8 rounded-full backdrop-blur-md flex items-center justify-center transition-all duration-300 shadow-sm active:scale-90 ${
        isFavorited
          ? 'bg-white shadow-[0_4px_16px_rgba(225,29,72,0.25)] ring-1 ring-rose-100'
          : 'bg-black/35 hover:bg-black/55 text-white'
      } ${className}`}
      title={isFavorited ? 'Bỏ yêu thích' : 'Lưu yêu thích'}
    >
      <MorphIcon
        icon={isFavorited ? ICONS.heartFilled : ICONS.heartOutline}
        size={16}
        color={isFavorited ? '#E11D48' : '#FFFFFF'}
        strokeWidth={2}
        fill={isFavorited ? '#E11D48' : 'none'}
        spring="bouncy"
      />
    </button>
  );
};

export interface MorphAddButtonProps {
  isAdded: boolean;
  onToggle: () => void;
  className?: string;
}

export const MorphAddButton: React.FC<MorphAddButtonProps> = ({
  isAdded,
  onToggle,
  className = '',
}) => {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={`w-8 h-8 rounded-full backdrop-blur-md flex items-center justify-center transition-all duration-300 shadow-sm active:scale-90 ${
        isAdded
          ? 'bg-emerald-600 text-white shadow-[0_4px_16px_rgba(5,150,105,0.3)] ring-1 ring-emerald-300'
          : 'bg-black/35 hover:bg-black/55 text-white'
      } ${className}`}
      title={isAdded ? 'Đã thêm vào chuyến đi' : 'Thêm vào chuyến đi'}
    >
      <MorphIcon
        icon={isAdded ? ICONS.check : ICONS.plus}
        size={16}
        color="#FFFFFF"
        strokeWidth={2.4}
        spring="snappy"
      />
    </button>
  );
};

export interface MorphStatusBadgeProps {
  status: 'planned' | 'in_progress' | 'visited' | 'skipped';
  onCycleStatus: () => void;
  className?: string;
}

export const MorphStatusBadge: React.FC<MorphStatusBadgeProps> = ({
  status,
  onCycleStatus,
  className = '',
}) => {
  const getIcon = () => {
    switch (status) {
      case 'in_progress':
        return ICONS.play;
      case 'visited':
        return ICONS.check;
      case 'skipped':
        return "M18 6L6 18M6 6l12 12";
      case 'planned':
      default:
        return ICONS.clock;
    }
  };

  const getLabel = () => {
    switch (status) {
      case 'in_progress':
        return 'Đang ghé';
      case 'visited':
        return 'Đã đến';
      case 'skipped':
        return 'Bỏ qua';
      case 'planned':
      default:
        return 'Chưa đi';
    }
  };

  const getStyles = () => {
    switch (status) {
      case 'in_progress':
        return 'bg-blue-50 text-blue-700 border-blue-200 ring-2 ring-blue-100 animate-pulse';
      case 'visited':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'skipped':
        return 'bg-neutral-100 text-neutral-500 border-neutral-200';
      case 'planned':
      default:
        return 'bg-neutral-100 text-neutral-700 border-neutral-200 hover:bg-neutral-200/80';
    }
  };

  const getColor = () => {
    switch (status) {
      case 'in_progress':
        return '#1D4ED8';
      case 'visited':
        return '#047857';
      case 'skipped':
        return '#737373';
      case 'planned':
      default:
        return '#374151';
    }
  };

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onCycleStatus();
      }}
      className={`px-2.5 py-1 rounded-full border text-[11px] font-bold flex items-center gap-1.5 transition-all duration-300 cursor-pointer active:scale-95 shadow-2xs ${getStyles()} ${className}`}
      title="Nhấn để đổi trạng thái kế tiếp (Chưa đi → Đang ghé → Đã đến)"
    >
      <MorphIcon
        icon={getIcon()}
        size={13}
        color={getColor()}
        strokeWidth={2.4}
        spring="snappy"
      />
      <span>{getLabel()}</span>
    </button>
  );
};
