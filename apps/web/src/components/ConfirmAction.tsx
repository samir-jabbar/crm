import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useErrorMessage } from '@/api/errors';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';

/** A button that asks for confirmation first (reject, suspend, sign out everywhere, delete a worker…). */
export function ConfirmAction({
  label,
  title,
  body,
  confirmLabel,
  danger = false,
  pending,
  error,
  onConfirm,
  children,
}: {
  label: string;
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  pending: boolean;
  error: unknown;
  onConfirm: () => void;
  /** Extra content inside the dialog (e.g. a suggestion to suspend instead). */
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" className={danger ? 'text-danger' : undefined} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={title} description={body}>
          {children}
          {error ? <Alert tone="danger">{errorMessage(error)}</Alert> : null}
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <DialogClose asChild>
              <Button variant="secondary">{t('common.cancel')}</Button>
            </DialogClose>
            <Button
              variant={danger ? 'danger' : 'primary'}
              disabled={pending}
              onClick={() => {
                onConfirm();
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
