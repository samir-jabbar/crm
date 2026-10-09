import { ORDER_SCOPES, type OrderScope } from '@hanjing/shared';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { CustomerPicker } from '@/components/AddressPicker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface ScopeDraft {
  orderScope: OrderScope;
  customers: { id: string; name: string }[];
  ownEntriesOnly: boolean;
  accessEndsOn: string;
}

/**
 * 005 FR-018 – FR-023: which orders the worker reaches, whether they see only their own expenses and payments,
 * and when their access ends (end of that day, China time). Assigned orders are managed below it on the page.
 */
export function ScopeEditor({ value, onChange }: { value: ScopeDraft; onChange: (next: ScopeDraft) => void }) {
  const { t } = useTranslation();
  const groupId = useId();
  const endId = useId();
  const set = (patch: Partial<ScopeDraft>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-4">
      <fieldset className="space-y-2">
        <legend id={groupId} className="font-semibold">
          {t('users.scope.title')}
        </legend>
        {ORDER_SCOPES.map((scope) => (
          <label key={scope} className="flex min-h-11 cursor-pointer items-center gap-3">
            <input type="radio" name={groupId} className="size-5" checked={value.orderScope === scope} onChange={() => set({ orderScope: scope })} />
            {t(`workers.scope.${scope}`)}
          </label>
        ))}
      </fieldset>

      {value.orderScope === 'customers' ? (
        <div className="space-y-2">
          <ul className="flex flex-wrap gap-2" aria-label={t('users.scope.customers')}>
            {value.customers.map((c) => (
              <li key={c.id} className="flex items-center gap-1 rounded-full bg-muted ps-3">
                <bdi>{c.name}</bdi>
                <Button
                  variant="ghost"
                  aria-label={t('users.scope.removeCustomer', { name: c.name })}
                  onClick={() => set({ customers: value.customers.filter((x) => x.id !== c.id) })}
                >
                  ×
                </Button>
              </li>
            ))}
          </ul>
          <CustomerPicker
            label={t('users.scope.addCustomer')}
            value={null}
            allowCreate={false}
            onSelect={(picked) =>
              picked && !value.customers.some((c) => c.id === picked.id) && set({ customers: [...value.customers, { id: picked.id, name: picked.name }] })
            }
          />
        </div>
      ) : null}

      <label className="flex min-h-11 cursor-pointer items-start gap-3">
        <input type="checkbox" className="mt-1 size-5 shrink-0" checked={value.ownEntriesOnly} onChange={(e) => set({ ownEntriesOnly: e.target.checked })} />
        <span>
          <span className="block font-medium">{t('users.scope.ownEntries')}</span>
          <span className="block text-xs text-muted-foreground">{t('users.scope.ownEntriesHint')}</span>
        </span>
      </label>

      <div>
        <Label htmlFor={endId}>{t('users.scope.endsOn')}</Label>
        <Input id={endId} type="date" value={value.accessEndsOn} onChange={(e) => set({ accessEndsOn: e.target.value })} dir="ltr" />
        <p className="mt-1 text-xs text-muted-foreground">{t('users.scope.endsOnHint')}</p>
      </div>
    </div>
  );
}
