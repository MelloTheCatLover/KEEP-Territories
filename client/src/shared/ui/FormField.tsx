import { type InputHTMLAttributes } from 'react';
import { Label } from './Label';
import { Input } from './Input';

type FormFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  htmlFor: string;
  error?: string;
};

export function FormField({ label, htmlFor, error, ...inputProps }: FormFieldProps) {
  return (
    <div>
      <Label htmlFor={htmlFor}>{label}</Label>
      <Input id={htmlFor} error={error} {...inputProps} />
      {error && <p className="text-xs text-danger-text mt-1">{error}</p>}
    </div>
  );
}
