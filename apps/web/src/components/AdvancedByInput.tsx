import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAdvancedBySuggestions } from '@/api/expenses';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useDebounced } from '@/lib/useDebounced';

/**
 * "Advanced by" (003 FR-019): free text with the names already used suggested as you type, so the same person
 * is not entered twice with different spellings. The server groups spellings anyway (research R9).
 */
export function AdvancedByInput({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
}) {
  const { t } = useTranslation();
  const inputId = useId();
  const listId = useId();
  const hintId = useId();
  const [open, setOpen] = useState(false);
  const q = useDebounced(value);
  const suggestions = useAdvancedBySuggestions(q);
  const options = (suggestions.data ?? []).filter((name) => name !== value);
  const showList = open && options.length > 0;

  return (
    <div className="relative">
      <Label htmlFor={inputId}>{t('expenses.form.advancedBy')}</Label>
      <Input
        id={inputId}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-describedby={hintId}
        aria-invalid={error ? true : undefined}
        value={value}
        maxLength={80}
        autoComplete="off"
        dir="auto"
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {showList ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={t('expenses.form.advancedBySuggestions')}
          className="absolute inset-x-0 z-30 mt-1 max-h-60 overflow-auto rounded-lg border border-border bg-surface shadow-lg"
        >
          {options.map((name) => (
            <li key={name} role="option" aria-selected={false}>
              <button
                type="button"
                className="flex min-h-11 w-full items-center px-3 text-start hover:bg-muted"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(name);
                  setOpen(false);
                }}
                dir="auto"
              >
                {name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <p id={hintId} className="mt-1 text-xs text-muted-foreground">
        {error ?? t('expenses.form.advancedByHint')}
      </p>
    </div>
  );
}
