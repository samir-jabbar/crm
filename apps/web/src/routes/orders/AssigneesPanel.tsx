import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useErrorMessage } from '@/api/errors';
import { useOrderAssignees, useSetOrderAssignees, useUsers } from '@/api/users';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

/** 005 FR-019: the workers assigned to this order. Shown to the Owner only. */
export function AssigneesPanel({ orderId }: { orderId: string }) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const selectId = useId();
  const assignees = useOrderAssignees(orderId);
  const users = useUsers();
  const save = useSetOrderAssignees(orderId);
  const [adding, setAdding] = useState('');
  const current = assignees.data ?? [];
  const candidates = (users.data?.items ?? []).filter((u) => u.status !== 'pending' && !current.some((a) => a.userId === u.id));
  const set = (userIds: string[]) => save.mutate(userIds, { onSuccess: () => setAdding('') });

  return (
    <Card className="space-y-3 text-sm" aria-label={t('orders.assignees.title')}>
      <h2 className="font-semibold">{t('orders.assignees.title')}</h2>
      {current.length === 0 ? <p className="text-muted-foreground">{t('orders.assignees.none')}</p> : null}
      <ul className="flex flex-wrap gap-2">
        {current.map((a) => (
          <li key={a.userId} className="flex items-center gap-1 rounded-full bg-muted ps-3">
            <bdi>{a.displayName}</bdi>
            <Button
              variant="ghost"
              aria-label={t('orders.assignees.remove', { name: a.displayName })}
              disabled={save.isPending}
              onClick={() => set(current.filter((x) => x.userId !== a.userId).map((x) => x.userId))}
            >
              ×
            </Button>
          </li>
        ))}
      </ul>
      {candidates.length > 0 ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-48 flex-1">
            <Label htmlFor={selectId}>{t('orders.assignees.add')}</Label>
            <Select id={selectId} value={adding} onChange={(e) => setAdding(e.target.value)}>
              <option value="">—</option>
              {candidates.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName}
                </option>
              ))}
            </Select>
          </div>
          <Button variant="secondary" disabled={!adding || save.isPending} onClick={() => set([...current.map((a) => a.userId), adding])}>
            {t('orders.assignees.assign')}
          </Button>
        </div>
      ) : null}
      {save.error ? <Alert tone="danger">{errorMessage(save.error)}</Alert> : null}
    </Card>
  );
}
