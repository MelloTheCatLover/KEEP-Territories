import { type InputHTMLAttributes } from 'react';

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  error?: string;
};

export function Input({ error, className = '', ...rest }: InputProps) {
  return (
    <input
      className={`w-full bg-neutral-200 border rounded-sm px-3 py-2 text-base text-neutral-900 focus:border-brand-500 focus:outline-none disabled:opacity-40 ${
        error ? 'border-danger' : 'border-neutral-400'
      } ${className}`}
      {...rest}
    />
  );
}
