import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary';
}

export function Button({ variant = 'primary', className, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-[var(--radius-chip)] px-4 py-2 text-sm font-medium transition-colors duration-150',
        'disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'primary'
          ? 'bg-accent text-bg hover:bg-accent-dim'
          : 'border border-border bg-transparent text-fg hover:border-accent',
        className,
      )}
      {...props}
    />
  );
}
