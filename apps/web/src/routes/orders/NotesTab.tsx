import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useErrorMessage } from '@/api/errors';
import { useAddOrderNote, useDeleteOrderNote, useOrderNotes } from '@/api/orders';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { formatDateTime } from '@/i18n/format';

/** US4 / FR-017, FR-018: timestamped notes, newest first; add or delete (with confirmation). */
export function NotesTab({ orderId }: { orderId: string }) {
  const { t, i18n } = useTranslation();
  const errorMessage = useErrorMessage();
  const notes = useOrderNotes(orderId);
  const add = useAddOrderNote(orderId);
  const remove = useDeleteOrderNote(orderId);
  const [body, setBody] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    const submitted = body;
    // Clear only what was sent: anything typed while saving (slow links) must not be lost.
    add.mutate(submitted, { onSuccess: () => setBody((current) => (current === submitted ? '' : current)) });
  }

  return (
    <div className="space-y-4">
      <Card>
        <form className="space-y-3" onSubmit={onSubmit}>
          <Label htmlFor="new-note">{t('orders.notes.label')}</Label>
          <textarea
            id="new-note"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            maxLength={2000}
            dir="auto"
            placeholder={t('orders.notes.placeholder')}
            className="block w-full rounded-lg border border-border bg-surface px-3 py-2 text-base"
          />
          {add.error ? <Alert tone="danger">{errorMessage(add.error)}</Alert> : null}
          <Button type="submit" disabled={add.isPending || !body.trim()}>
            {t('orders.notes.add')}
          </Button>
        </form>
      </Card>

      {notes.error ? <Alert tone="danger">{errorMessage(notes.error)}</Alert> : null}
      {notes.data && notes.data.items.length === 0 ? <p className="text-sm text-muted-foreground">{t('orders.notes.empty')}</p> : null}
      <ul aria-label={t('orders.tabs.notes')} className="space-y-2">
        {notes.data?.items.map((note) => (
          <li key={note.id}>
            <Card className="space-y-2">
              <p className="whitespace-pre-line" dir="auto">
                {note.body}
              </p>
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  <bdi>{note.author.label}</bdi> · {formatDateTime(note.createdAt, i18n.language)}
                </span>
                <Button variant="ghost" className="text-danger" onClick={() => setConfirming(note.id)}>
                  {t('orders.notes.delete')}
                </Button>
              </div>
            </Card>
          </li>
        ))}
      </ul>

      <Dialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
        <DialogContent title={t('orders.notes.confirmTitle')} description={t('orders.notes.confirmBody')}>
          {remove.error ? <Alert tone="danger">{errorMessage(remove.error)}</Alert> : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DialogClose asChild>
              <Button variant="secondary">{t('common.cancel')}</Button>
            </DialogClose>
            <Button
              variant="danger"
              disabled={remove.isPending}
              onClick={() => confirming && remove.mutate(confirming, { onSuccess: () => setConfirming(null) })}
            >
              {t('orders.notes.delete')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
