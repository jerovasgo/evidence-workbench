import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
}

export function Button({ variant = 'primary', className, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-[var(--radius-pill)] px-4 py-2 text-sm font-medium transition-colors duration-150',
        'disabled:cursor-not-allowed disabled:opacity-40',
        variant === 'primary' && 'bg-fg text-bg hover:bg-fg/90',
        variant === 'secondary' && 'glass text-fg hover:border-border-strong',
        variant === 'ghost' && 'text-muted hover:text-fg',
        className,
      )}
      {...props}
    />
  );
}
