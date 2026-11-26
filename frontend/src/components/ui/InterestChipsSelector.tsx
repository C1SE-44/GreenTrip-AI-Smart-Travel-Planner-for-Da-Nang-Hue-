import { useEffect, useRef, useState } from 'react';
import './InterestChipsSelector.css';

export interface InterestChipsSelectorProps {
  options: readonly string[];
  selected: readonly string[];
  maxSelect?: number;
  label: string;
  onChange: (nextSelected: string[]) => void;
}

export default function InterestChipsSelector({
  options,
  selected,
  maxSelect = 5,
  label,
  onChange,
}: InterestChipsSelectorProps) {
  const [warnActive, setWarnActive] = useState(false);
  const [shakingItem, setShakingItem] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const toggleOption = (option: string) => {
    const isOn = selected.includes(option);
    if (isOn) {
      onChange(selected.filter((item) => item !== option));
      return;
    }

    if (selected.length >= maxSelect) {
      setShakingItem(option);
      setWarnActive(true);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        setShakingItem(null);
        setWarnActive(false);
      }, 1500);
      return;
    }

    onChange([...selected, option]);
  };

  return (
    <div className={`gt-chips ${warnActive ? 'is-warn' : ''}`.trim()}>
      <div className="gt-chips-head">
        <span className="text-[13.5px] font-bold text-black">{label}</span>
        <span className="gt-chips-cnt">
          <span className="gt-chips-dots" aria-hidden="true">
            {Array.from({ length: maxSelect }).map((_, idx) => (
              <i key={idx} className={idx < selected.length ? 'on' : ''} />
            ))}
          </span>
          <span>
            {selected.length}/{maxSelect}
          </span>
        </span>
      </div>

      <div className="gt-chips-list" role="group" aria-label={`${label} (tối đa ${maxSelect})`}>
        {options.map((option) => {
          const pressed = selected.includes(option);
          const shaking = shakingItem === option;
          return (
            <button
              key={option}
              type="button"
              aria-pressed={pressed}
              className={`gt-chip ${shaking ? 'is-no' : ''}`.trim()}
              onClick={() => toggleOption(option)}
            >
              <i aria-hidden="true">
                <svg viewBox="0 0 16 16">
                  <path d="M3.5 8.4l3 3 6-6.4" />
                </svg>
              </i>
              <span>{option}</span>
            </button>
          );
        })}
      </div>

      <p className="gt-chips-msg" aria-live="polite">
        {warnActive
          ? `Bạn chỉ có thể chọn tối đa ${maxSelect} sở thích.`
          : selected.length >= maxSelect
            ? `Đã chọn đủ ${maxSelect} sở thích.`
            : ''}
      </p>
    </div>
  );
}
