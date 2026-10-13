import { ReactNode } from 'react';
import { Leaf } from 'lucide-react';

type BadgeVariant = 'forest' | 'wood' | 'danang' | 'hue' | 'beige' | 'error' | 'success';

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

const variantClasses: Record<BadgeVariant, string> = {
  forest: 'bg-forest-50 text-forest-700',
  wood: 'bg-wood-50 text-wood-700',
  danang: 'bg-danangLight/40 text-danang',
  hue: 'bg-hueLight/30 text-hue',
  beige: 'bg-beige/60 text-muted',
  error: 'bg-errorBg text-errorText',
  success: 'bg-successBg text-successText',
};

export default function Badge({ children, variant = 'forest', className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${variantClasses[variant]} ${className}`}
    >
      {children}
    </span>
  );
}

interface CityTagProps {
  city: 'Đà Nẵng' | 'Huế';
}

export function CityTag({ city }: CityTagProps) {
  if (city === 'Đà Nẵng') {
    return (
      <Badge variant="danang">
        <span className="h-1.5 w-1.5 rounded-full bg-danang" />
        Đà Nẵng
      </Badge>
    );
  }
  return (
    <Badge variant="hue">
      <span className="h-1.5 w-1.5 rounded-full bg-hue" />
      Huế
    </Badge>
  );
}

interface EcoBadgeProps {
  score: number;
  size?: 'sm' | 'md';
}

export function EcoBadge({ score, size = 'sm' }: EcoBadgeProps) {
  const sizeClasses = {
    sm: 'px-2 py-0.5 text-[10px] gap-1',
    md: 'px-3 py-1 text-xs gap-1.5',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full bg-forest-50 text-forest-700 font-semibold ${sizeClasses[size]}`}
      title={`Eco score: ${score}/100`}
    >
      <Leaf size={size === 'sm' ? 10 : 12} className="text-forest-500" />
      Eco {score}
    </span>
  );
}
