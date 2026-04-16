import { type ButtonHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger';
  isLoading?: boolean;
};

const variantClasses: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-brand-500 hover:bg-brand-400 active:bg-brand-600 text-neutral-1000',
  secondary: 'bg-neutral-200 hover:bg-neutral-300 border border-neutral-400 text-neutral-900',
  danger: 'bg-danger hover:bg-danger-hover text-neutral-1000',
};

export function Button({
  variant = 'primary',
  isLoading = false,
  disabled,
  children,
  className = '',
  ...rest
}: ButtonProps) {
  return (
    <button
      disabled={disabled || isLoading}
      className={`font-semibold text-base px-4 py-2 rounded-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none ${variantClasses[variant]} ${className}`}
      {...rest}
    >
      {isLoading ? (
        <span className="flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          {children}
        </span>
      ) : (
        children
      )}
    </button>
  );
}
