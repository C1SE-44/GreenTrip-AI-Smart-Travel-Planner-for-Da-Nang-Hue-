import { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children: ReactNode;
}

const variantClasses: Record<Variant, string> = {
  primary:
    'bg-forest-500 text-cream hover:bg-forest-600 focus-visible:ring-forest-300 shadow-soft',
  secondary:
    'bg-wood-500 text-cream hover:bg-wood-600 focus-visible:ring-wood-300 shadow-soft',
  ghost:
    'bg-transparent text-forest-700 hover:bg-forest-50 focus-visible:ring-forest-300 border border-beige',
};

const sizeClasses: Record<Size, string> = {
  sm: 'text-sm px-3 py-2 gap-1.5',
  md: 'text-sm px-4 py-2.5 gap-2',
  lg: 'text-base px-6 py-3 gap-2',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  children,
  className = '',
  ...rest
}: ButtonProps) {
  return (
    <button
      className={`
        inline-flex items-center justify-center rounded-xl font-medium
        transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-cream
        disabled:opacity-50 disabled:cursor-not-allowed
        ${variantClasses[variant]} ${sizeClasses[size]} ${className}
      `}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Loader2 size={size === 'lg' ? 20 : 16} className="animate-spin" />}
      {children}
    </button>
  );
}
