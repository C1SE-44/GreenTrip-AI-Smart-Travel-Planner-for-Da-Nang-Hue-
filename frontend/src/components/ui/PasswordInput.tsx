import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import Input from './Input';

interface PasswordInputProps extends Omit<React.ComponentProps<typeof Input>, 'icon' | 'type'> {
  label?: string;
}

export default function PasswordInput({ label, id, ...rest }: PasswordInputProps) {
  const [show, setShow] = useState(false);

  return (
    <div className="relative">
      <Input id={id} label={label} type={show ? 'text' : 'password'} {...rest} />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-3 top-[38px] -translate-y-0 text-muted hover:text-forest-600 transition-colors"
        aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
        tabIndex={-1}
      >
        {show ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}
