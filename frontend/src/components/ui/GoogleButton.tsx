import { ButtonHTMLAttributes } from 'react';

interface GoogleButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
}

export default function GoogleButton({ children, className = '', ...rest }: GoogleButtonProps) {
  return (
    <button
      type="button"
      className={`
        flex w-full items-center justify-center gap-3 rounded-xl border border-beige bg-ivory
        px-4 py-3 text-sm font-medium text-charcoal transition-all duration-200
        hover:border-forest-200 hover:bg-forest-50/40
        focus:outline-none focus-visible:ring-2 focus-visible:ring-forest-300
        disabled:opacity-50 disabled:cursor-not-allowed
        ${className}
      `}
      {...rest}
    >
      <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M16.51 8.18c0-.59-.05-1.16-.14-1.71H9v3.24h4.21c-.18.97-.74 1.79-1.58 2.34v1.94h2.56c1.5-1.38 2.37-3.42 2.37-5.81z"
          fill="#4285F4"
        />
        <path
          d="M9 17c2.13 0 3.92-.71 5.22-1.92l-2.56-1.94c-.71.48-1.62.76-2.66.76-2.04 0-3.77-1.38-4.39-3.23H1.93v2.03A8 8 0 0 0 9 17z"
          fill="#34A853"
        />
        <path
          d="M4.61 10.67c-.16-.48-.25-.99-.25-1.52s.09-1.04.25-1.52V5.6H1.93A8 8 0 0 0 1 9.15c0 1.29.31 2.51.93 3.55l2.68-2.03z"
          fill="#FBBC05"
        />
        <path
          d="M9 4.38c1.16 0 2.2.4 3.02 1.18l2.27-2.27C12.91 1.95 11.12 1.15 9 1.15A8 8 0 0 0 1.93 5.6l2.68 2.03C5.23 5.76 6.96 4.38 9 4.38z"
          fill="#EA4335"
        />
      </svg>
      {children}
    </button>
  );
}
