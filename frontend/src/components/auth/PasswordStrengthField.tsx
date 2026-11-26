import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import './PasswordStrengthField.css';

const STRENGTH_LABELS = ['', 'Yếu', 'Trung bình', 'Khá', 'Mạnh'] as const;

export interface PasswordStrengthFieldProps {
  id: string;
  name?: string;
  label: string;
  value: string;
  onChange: (nextValue: string) => void;
  onEnter?: () => void;
  autoComplete?: string;
  placeholder?: string;
  required?: boolean;
  maxLength?: number;
  hasError?: boolean;
  showStrength?: boolean;
  headerRight?: React.ReactNode;
}

function evaluatePasswordScore(value: string): number {
  if (!value) return 0;
  const checks =
    (value.length >= 8 ? 1 : 0) +
    (/\d/.test(value) ? 1 : 0) +
    (/[^A-Za-z0-9\s]/.test(value) ? 1 : 0) +
    (value.length >= 12 || (/[a-z]/.test(value) && /[A-Z]/.test(value)) ? 1 : 0);
  return Math.max(1, checks);
}

export default function PasswordStrengthField({
  id,
  name = 'password',
  label,
  value,
  onChange,
  onEnter,
  autoComplete = 'new-password',
  placeholder,
  required = false,
  maxLength = 128,
  hasError = false,
  showStrength = false,
  headerRight,
}: PasswordStrengthFieldProps) {
  const [visible, setVisible] = useState(false);
  const rulesUid = useId().replace(/[^a-zA-Z0-9_-]/g, '');

  const rules = useMemo(
    () => [
      { id: `${rulesUid}-len`, label: 'Tối thiểu 8 ký tự', ok: value.length >= 8 },
      { id: `${rulesUid}-num`, label: 'Có ít nhất 1 chữ số', ok: /\d/.test(value) },
      { id: `${rulesUid}-sym`, label: 'Có ký tự đặc biệt (!@#…)', ok: /[^A-Za-z0-9\s]/.test(value) },
    ],
    [rulesUid, value],
  );

  const level = showStrength ? evaluatePasswordScore(value) : 0;
  const describedBy = showStrength ? rules.map((r) => r.id).join(' ') : undefined;

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && onEnter) {
      onEnter();
    }
  };

  return (
    <div className="gt-pw" data-lv={level}>
      <div className="flex items-center justify-between mb-1.5">
        <label htmlFor={id} className="text-xs font-semibold text-neutral-700">
          {label}
        </label>
        {headerRight}
      </div>

      <div className="relative">
        <input
          id={id}
          name={name}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          placeholder={placeholder}
          value={value}
          required={required}
          maxLength={maxLength}
          aria-describedby={describedBy}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          className={`w-full min-h-12 rounded-xl border bg-white px-4 py-3 pr-12 text-[15px] text-neutral-950 placeholder:text-neutral-500 focus:outline-none transition-colors ${
            hasError
              ? 'border-rose-500 focus:border-rose-600 focus:ring-2 focus:ring-rose-500/20'
              : 'border-neutral-400 focus:border-neutral-950 focus:ring-2 focus:ring-neutral-950/15'
          }`}
        />
        <button
          type="button"
          className="gt-pw-eye"
          aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
          aria-pressed={visible}
          onClick={() => setVisible((prev) => !prev)}
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <g className="lid">
              <path d="M2 10s3-5.2 8-5.2S18 10 18 10s-3 5.2-8 5.2S2 10 2 10z" />
              <circle cx="10" cy="10" r="2.4" />
            </g>
            <g className="lash">
              <path d="M3 10.4c2 2.4 4.4 3.4 7 3.4s5-1 7-3.4M6 13l-1 1.6M10 14v1.8M14 13l1 1.6" />
            </g>
          </svg>
        </button>
      </div>

      {showStrength && (
        <>
          <div className="gt-pw-st">
            <div
              className="gt-pw-bars"
              role="meter"
              aria-label="Độ mạnh mật khẩu"
              aria-valuemin={0}
              aria-valuemax={4}
              aria-valuenow={level}
              aria-valuetext={STRENGTH_LABELS[level]}
            >
              {[0, 1, 2, 3].map((idx) => (
                <i key={idx} className={idx < level ? 'is-on' : ''} />
              ))}
            </div>
            <em>{STRENGTH_LABELS[level]}</em>
          </div>

          <ul className="gt-pw-rules">
            {rules.map((rule) => (
              <li key={rule.id} id={rule.id} className={rule.ok ? 'is-ok' : ''}>
                <svg viewBox="0 0 18 18" aria-hidden="true">
                  <circle cx="9" cy="9" r="8" />
                  <path d="M5.6 9.3l2.3 2.3 4.6-4.8" />
                </svg>
                <span>{rule.label}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
