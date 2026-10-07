import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'primary';

const tones: Record<Tone, string> = {
  neutral: 'bg-muted text-foreground',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/20 text-foreground',
  danger: 'bg-danger/15 text-danger',
  primary: 'bg-primary/10 text-primary',
};

export function Badge({ className, tone = 'neutral', ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', tones[tone], className)}
      {...props}
    />
  );
}
