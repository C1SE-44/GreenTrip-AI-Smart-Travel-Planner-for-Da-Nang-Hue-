import { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  hover?: boolean;
}

export default function Card({ children, className = '', onClick, hover = false }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={`
        rounded-2xl bg-ivory border border-beige shadow-soft
        ${hover ? 'transition-all duration-250 hover:shadow-cardHover hover:border-forest-200 cursor-pointer' : ''}
        ${className}
      `}
    >
      {children}
    </div>
  );
}
