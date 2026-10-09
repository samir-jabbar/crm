import type { ForeignCurrency } from '@hanjing/shared';
import type { ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { normalizeAmountInput } from '@/components/MoneyInput';

export interface RateFieldProps {
  id: string;
  label: string;
  currency: ForeignCurrency;
  value: string;
  onValueChange: (value: string) => void;
  error?: string | null;
  /** Shown under the field when there is no error (rate source, warnings). */
  hint?: ReactNode;
  /** Extra controls on the same row (e.g. "Fetch rate"). */
  action?: ReactNode;
}

/**
 * A rate to CNY, always shown the way the Owner thinks of it: "1 USD = [7.100000] CNY" (003 research R2).
 * Western digits, decimal keypad, `,` or `.` accepted. The row reads left to right in every language.
 */
export function RateField({ id, label, currency, value, onValueChange, error, hint, action }: RateFieldProps) {
  const describedBy = [hint && !error ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined;
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="flex flex-wrap items-center gap-2">
        <div dir="ltr" className="flex min-w-0 flex-1 items-center gap-2">
          <span className="shrink-0 text-sm text-muted-foreground">1 {currency} =</span>
          <Input
            id={id}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            className="min-w-0 flex-1"
            value={value}
            onChange={(e) => onValueChange(normalizeAmountInput(e.target.value))}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
          />
          <span className="shrink-0 text-sm text-muted-foreground">CNY</span>
        </div>
        {action}
      </div>
      {hint && !error ? (
        <div id={`${id}-hint`} className="mt-1 text-xs text-muted-foreground">
          {hint}
        </div>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
