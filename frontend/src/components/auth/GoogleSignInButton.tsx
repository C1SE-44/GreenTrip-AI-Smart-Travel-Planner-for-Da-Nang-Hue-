import './GoogleSignInButton.css';

export interface GoogleSignInButtonProps {
  busy?: boolean;
  success?: boolean;
  disabled?: boolean;
  label?: string;
  busyLabel?: string;
  successLabel?: string;
  onClick: () => void;
}

export default function GoogleSignInButton({
  busy = false,
  success = false,
  disabled = false,
  label = 'Tiếp tục với Google',
  busyLabel = 'Đang kết nối Google…',
  successLabel = 'Đã kết nối Google',
  onClick,
}: GoogleSignInButtonProps) {
  return (
    <button
      type="button"
      className={`gt-gbtn ${busy ? 'is-busy' : ''} ${success ? 'is-ok' : ''}`.trim()}
      aria-busy={busy}
      disabled={disabled || busy}
      onClick={onClick}
    >
      <span className="gt-gbtn-ic" aria-hidden="true">
        <svg className="gt-gbtn-g" viewBox="0 0 48 48">
          <path
            fill="#EA4335"
            d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
          />
          <path
            fill="#4285F4"
            d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
          />
          <path
            fill="#FBBC05"
            d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
          />
          <path
            fill="#34A853"
            d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
          />
        </svg>
        <svg className="gt-gbtn-arc" viewBox="0 0 20 20">
          <g>
            <circle cx="10" cy="10" r="8" stroke="#EA4335" strokeDashoffset="0" />
            <circle cx="10" cy="10" r="8" stroke="#4285F4" strokeDashoffset="-12.57" />
            <circle cx="10" cy="10" r="8" stroke="#34A853" strokeDashoffset="-25.13" />
            <circle cx="10" cy="10" r="8" stroke="#FBBC05" strokeDashoffset="-37.7" />
          </g>
        </svg>
        <svg className="gt-gbtn-ck" viewBox="0 0 20 20">
          <path d="M4.8 10.4l3.4 3.4 7-7.4" />
        </svg>
      </span>
      <span className="gt-gbtn-lb">
        <span className="s0">{label}</span>
        <span className="s1" aria-hidden={!busy}>
          {busyLabel}
        </span>
        <span className="s2" aria-hidden={!success}>
          {successLabel}
        </span>
      </span>
    </button>
  );
}
