import { Check } from 'lucide-react';

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  id?: string;
  error?: string;
}

export default function Checkbox({ checked, onChange, label, id, error }: CheckboxProps) {
  const checkId = id || label.toLowerCase().replace(/\s+/g, '-');

  return (
    <div>
      <label
        htmlFor={checkId}
        className="flex cursor-pointer items-start gap-2.5 select-none"
      >
        <button
          type="button"
          role="checkbox"
          id={checkId}
          aria-checked={checked}
          onClick={() => onChange(!checked)}
          className={`
            mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border transition-all duration-200
            ${
              checked
                ? 'bg-forest-500 border-forest-500 text-cream'
                : 'bg-ivory border-beige hover:border-forest-300'
            }
            ${error ? 'border-errorText/50' : ''}
          `}
        >
          {checked && <Check size={14} strokeWidth={3} />}
        </button>
        <span className={`text-sm leading-relaxed ${error ? 'text-errorText' : 'text-charcoal'}`}>
          {label}
        </span>
      </label>
      {error && <p className="mt-1 ml-7 text-sm text-errorText">{error}</p>}
    </div>
  );
}
