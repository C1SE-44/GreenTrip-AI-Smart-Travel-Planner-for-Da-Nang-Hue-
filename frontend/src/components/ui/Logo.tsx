import { Leaf } from 'lucide-react';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  className?: string;
  textClassName?: string;
}

const sizeMap = {
  sm: { icon: 18, text: 'text-lg' },
  md: { icon: 24, text: 'text-[24px]' },
  lg: { icon: 28, text: 'text-[28px]' },
};

export default function Logo({
  size = 'md',
  showText = true,
  className = '',
  textClassName = '',
}: LogoProps) {
  const s = sizeMap[size];

  return (
    <div className={`flex items-center gap-[5px] ${className}`}>
      {/* Icon lá màu đen đứng độc lập không có nền */}
      <Leaf size={s.icon} strokeWidth={2.5} className="text-black" />
      
      {showText && (
        <span className={`font-body font-bold text-black tracking-tighter leading-none ${s.text} ${textClassName}`}>
          greentrip
        </span>
      )}
    </div>
  );
}
