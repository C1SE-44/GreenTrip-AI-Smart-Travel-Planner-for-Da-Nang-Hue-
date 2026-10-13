interface PasswordStrengthProps {
  password: string;
}

type Strength = 'empty' | 'weak' | 'medium' | 'strong';

function getStrength(pw: string): Strength {
  if (!pw) return 'empty';
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^a-zA-Z0-9]/.test(pw)) score++;
  if (score <= 2) return 'weak';
  if (score <= 3) return 'medium';
  return 'strong';
}

const config: Record<Strength, { label: string; color: string; bars: number }> = {
  empty: { label: '', color: 'bg-beige', bars: 0 },
  weak: { label: 'Yếu', color: 'bg-errorText', bars: 1 },
  medium: { label: 'Trung bình', color: 'bg-amber-300', bars: 2 },
  strong: { label: 'Mạnh', color: 'bg-forest-500', bars: 3 },
};

export default function PasswordStrength({ password }: PasswordStrengthProps) {
  const strength = getStrength(password);
  const c = config[strength];

  if (strength === 'empty') return null;

  return (
    <div className="mt-2 flex items-center gap-2">
      <div className="flex flex-1 gap-1.5">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
              i <= c.bars ? c.color : 'bg-beige'
            }`}
          />
        ))}
      </div>
      <span className="text-xs font-medium text-muted w-20 text-right">{c.label}</span>
    </div>
  );
}
