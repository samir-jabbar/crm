import type { SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/** Native select: the best touch experience on phones and correct in RTL. */
export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'block min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base text-foreground',
        'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary',
        className,
      )}
      {...props}
    />
  );
}
