import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type Tone = 'info' | 'success' | 'warning' | 'danger';

const tones: Record<Tone, string> = {
  info: 'border-primary/30 bg-primary/5 text-foreground',
  success: 'border-success/40 bg-success/10 text-foreground',
  warning: 'border-warning/50 bg-warning/10 text-foreground',
  danger: 'border-danger/40 bg-danger/10 text-foreground',
};

export function Alert({ className, tone = 'info', ...props }: HTMLAttributes<HTMLDivElement> & { tone?: Tone }) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('rounded-lg border px-3 py-2.5 text-sm', tones[tone], className)}
      {...props}
    />
  );
}
