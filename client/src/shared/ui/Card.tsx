import { type ReactNode } from 'react';

type CardProps = {
  children: ReactNode;
  className?: string;
};

export function Card({ children, className = '' }: CardProps) {
  return (
    <div className={`bg-glass-medium backdrop-blur-glass border border-glass rounded-lg shadow-2 p-6 ${className}`}>
      {children}
    </div>
  );
}
