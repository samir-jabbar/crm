import type { InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'block min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base text-foreground',
        'placeholder:text-muted-foreground',
        'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary',
        'aria-[invalid=true]:border-danger',
        'disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
