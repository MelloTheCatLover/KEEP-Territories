import { type LabelHTMLAttributes, type ReactNode } from 'react';

type LabelProps = LabelHTMLAttributes<HTMLLabelElement> & {
  children: ReactNode;
};

export function Label({ children, className = '', ...rest }: LabelProps) {
  return (
    <label className={`label text-neutral-800 block mb-1 ${className}`} {...rest}>
      {children}
    </label>
  );
}
