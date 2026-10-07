import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useErrorMessage } from '@/api/errors';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';

/**
 * "Delete" with a confirmation dialog. Deletions are recoverable (FR-019), and the dialog says so.
 * Errors such as `in_use` (with a count) are shown inside the dialog.
 */
export function ConfirmDelete({
  title,
  body,
  pending,
  error,
  onConfirm,
  onReset,
}: {
  title: string;
  body: string;
  pending: boolean;
  error: unknown;
  onConfirm: () => void;
  onReset?: () => void;
}) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="secondary"
        className="text-danger"
        onClick={() => {
          onReset?.();
          setOpen(true);
        }}
      >
        {t('common.delete')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={title} description={body}>
          {error ? <Alert tone="danger">{errorMessage(error)}</Alert> : null}
          <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DialogClose asChild>
              <Button variant="secondary">{t('common.cancel')}</Button>
            </DialogClose>
            <Button variant="danger" onClick={onConfirm} disabled={pending}>
              {t('common.delete')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
