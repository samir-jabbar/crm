import type { ReceiptUpload } from '@hanjing/shared';
import { useEffect, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useErrorMessage } from '@/api/errors';
import { uploadFile } from '@/api/http';
import { Button } from '@/components/ui/button';
import { reduceImage } from '@/lib/imageResize';
import { cn } from '@/lib/utils';

export interface ReceiptValue {
  id: string;
  mime: string;
  /** Thumbnail source: a local object URL for a new photo, or the stored receipt's URL. */
  previewUrl: string | null;
}

type State =
  | { phase: 'idle' }
  | { phase: 'uploading'; file: File; progress: number }
  | { phase: 'failed'; file: File | null; error: unknown };

const pickerClass =
  'inline-flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-border bg-surface px-4 text-sm font-medium hover:bg-muted focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary';

/**
 * One file per record: an expense receipt (003 FR-006) or a payment proof (004 FR-003). Take a photo or choose an
 * image/PDF. It is reduced on the phone, then uploaded at once (003 research R7) so a failed save never loses it;
 * a failed upload keeps the file for "Try again".
 */
export function ReceiptInput({
  value,
  onChange,
  onBusyChange,
  uploadPath = '/api/receipts',
  attachedLabel,
  previewLabel,
}: {
  value: ReceiptValue | null;
  onChange: (value: ReceiptValue | null) => void;
  onBusyChange?: (busy: boolean) => void;
  /** `/api/receipts` for expenses, `/api/payment-proofs` for payments. */
  uploadPath?: string;
  attachedLabel?: string;
  previewLabel?: string;
}) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const [state, setState] = useState<State>({ phase: 'idle' });

  useEffect(() => onBusyChange?.(state.phase === 'uploading'), [state.phase, onBusyChange]);
  // Release local thumbnails when they are replaced or the form closes.
  useEffect(() => {
    const url = value?.previewUrl;
    return () => {
      if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
    };
  }, [value?.previewUrl]);

  async function send(original: File) {
    let file: File | null = null;
    try {
      file = await reduceImage(original);
      const ready = file;
      setState({ phase: 'uploading', file: ready, progress: 0 });
      const uploaded = await uploadFile<ReceiptUpload>(uploadPath, ready, (progress) =>
        setState({ phase: 'uploading', file: ready, progress }),
      );
      setState({ phase: 'idle' });
      onChange({
        id: uploaded.id,
        mime: uploaded.mime,
        previewUrl: uploaded.mime.startsWith('image/') ? URL.createObjectURL(ready) : null,
      });
    } catch (error) {
      setState({ phase: 'failed', file, error });
    }
  }

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // picking the same file again must fire again
    if (file) void send(file);
  }

  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-border p-2">
        {value.previewUrl ? (
          <img src={value.previewUrl} alt={previewLabel ?? t('expenses.receipt.preview')} className="size-16 rounded object-cover" />
        ) : (
          <span className="inline-flex size-16 items-center justify-center rounded bg-muted text-xs font-semibold">PDF</span>
        )}
        <span className="min-w-0 flex-1 text-sm">{attachedLabel ?? t('expenses.receipt.attached')}</span>
        <Button variant="ghost" onClick={() => onChange(null)}>
          {t('expenses.receipt.remove')}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <label className={cn(pickerClass, state.phase === 'uploading' && 'pointer-events-none opacity-50')}>
          <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={onPick} />
          {t('expenses.receipt.takePhoto')}
        </label>
        <label className={cn(pickerClass, state.phase === 'uploading' && 'pointer-events-none opacity-50')}>
          <input type="file" accept="image/*,application/pdf" className="sr-only" onChange={onPick} />
          {t('expenses.receipt.chooseFile')}
        </label>
      </div>
      {state.phase === 'uploading' ? (
        <div role="status" aria-live="polite" className="space-y-1">
          <p className="text-sm text-muted-foreground">
            {t('expenses.receipt.uploading', { percent: Math.round(state.progress * 100) })}
          </p>
          <div className="h-2 overflow-hidden rounded bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${Math.round(state.progress * 100)}%` }} />
          </div>
        </div>
      ) : null}
      {state.phase === 'failed' ? (
        <div role="alert" className="space-y-2 rounded-lg border border-danger/40 p-2 text-sm">
          <p className="text-danger">{errorMessage(state.error)}</p>
          <div className="flex gap-2">
            {state.file ? (
              <Button variant="secondary" onClick={() => void send(state.file!)}>
                {t('expenses.receipt.retry')}
              </Button>
            ) : null}
            <Button variant="ghost" onClick={() => setState({ phase: 'idle' })}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
