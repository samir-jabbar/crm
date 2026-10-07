import type { InputHTMLAttributes } from 'react';
import { Input } from '@/components/ui/input';

/** Spaces of any kind (regular, no-break U+00A0, narrow no-break U+202F) used as thousands separators. */
const SPACES = new RegExp('[\\s\\u00a0\\u202f]', 'g');

/** Normalize what people type on any keyboard: "85 000,50" becomes "85000.50". */
export function normalizeAmountInput(raw: string): string {
  return raw.replace(SPACES, '').replace(',', '.');
}

/** Decimal keypad on phones, Western digits, value kept as a string (exact money, research R1). */
export function MoneyInput({
  value,
  onValueChange,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: string;
  onValueChange: (value: string) => void;
}) {
  return (
    <Input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      dir="ltr"
      value={value}
      onChange={(e) => onValueChange(normalizeAmountInput(e.target.value))}
      {...props}
    />
  );
}
