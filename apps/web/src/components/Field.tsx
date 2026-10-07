import { useId, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  hint?: ReactNode;
  error?: string | null;
}

/** Labelled input with hint and translated error, wired for screen readers. */
export function Field({ label, hint, error, ...inputProps }: FieldProps) {
  const id = useId();
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined;
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...inputProps} />
      {hint && !error ? (
        <p id={`${id}-hint`} className="mt-1 text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Password input with a show/hide toggle (the toggle text avoids the word "password" for clear labelling). */
export function PasswordField(props: Omit<FieldProps, 'type'>) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const id = useId();
  const { label, hint, error, ...inputProps } = props;
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined;
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? 'text' : 'password'}
          // The input is always LTR (passwords type naturally), but the toggle sits at the page's end side,
          // so reserve space on the physical side matching the page direction.
          className="pr-20 pl-3 rtl:pl-20 rtl:pr-3"
          dir="ltr"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...inputProps}
        />
        <button
          type="button"
          aria-pressed={visible}
          aria-controls={id}
          onClick={() => setVisible((v) => !v)}
          className="absolute inset-y-0 end-0 min-w-16 rounded-e-lg px-3 text-sm font-medium text-primary"
        >
          {visible ? t('common.hide') : t('common.show')}
        </button>
      </div>
      {hint && !error ? (
        <p id={`${id}-hint`} className="mt-1 text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
