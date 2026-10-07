import { isAmount, lineTotalMinor, parseAmount, formatAmount, type CurrencyCode } from '@hanjing/shared';
import { useTranslation } from 'react-i18next';
import { AmountText } from '@/components/AmountText';
import { SupplierPicker, type PickedEntity } from '@/components/AddressPicker';
import { Field } from '@/components/Field';
import { MoneyInput } from '@/components/MoneyInput';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';

export interface ItemDraft {
  /** Stable React key for new and existing lines. */
  key: string;
  /** Present for lines that already exist on the server. */
  id?: string;
  productName: string;
  brandModel: string;
  year: string;
  quantity: string;
  unitPrice: string;
  hsCode: string;
  specs: string;
  supplier: PickedEntity | null;
}

let keySeq = 0;
export const newItemDraft = (): ItemDraft => ({
  key: `new-${++keySeq}`,
  productName: '',
  brandModel: '',
  year: '',
  quantity: '1',
  unitPrice: '',
  hsCode: '',
  specs: '',
  supplier: null,
});

/** Line total in minor units, or null while the inputs are not valid yet. */
export function draftLineTotalMinor(item: ItemDraft): number | null {
  const qty = Number(item.quantity);
  if (!Number.isInteger(qty) || qty < 1 || !isAmount(item.unitPrice)) return null;
  return lineTotalMinor(qty, parseAmount(item.unitPrice));
}

export function ItemsEditor({
  items,
  currency,
  onChange,
  errorFor,
}: {
  items: ItemDraft[];
  currency: CurrencyCode;
  onChange: (items: ItemDraft[]) => void;
  /** Translated error for `items.<index>.<field>`, or null. */
  errorFor: (path: string) => string | null;
}) {
  const { t } = useTranslation();
  const update = (index: number, patch: Partial<ItemDraft>) =>
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target]!, next[index]!];
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {items.map((item, index) => {
        const total = draftLineTotalMinor(item);
        const err = (field: string) => errorFor(`items.${index}.${field}`);
        return (
          <Card key={item.key} className="space-y-3" aria-label={t('orders.items.itemN', { n: index + 1 })}>
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold">{t('orders.items.itemN', { n: index + 1 })}</p>
              <div className="flex gap-1">
                <Button variant="ghost" onClick={() => move(index, -1)} disabled={index === 0} aria-label={t('orders.items.moveUp')}>
                  ↑
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => move(index, 1)}
                  disabled={index === items.length - 1}
                  aria-label={t('orders.items.moveDown')}
                >
                  ↓
                </Button>
                <Button variant="ghost" className="text-danger" onClick={() => onChange(items.filter((_, i) => i !== index))}>
                  {t('orders.items.remove')}
                </Button>
              </div>
            </div>
            <Field
              label={t('orders.items.productName')}
              value={item.productName}
              onChange={(e) => update(index, { productName: e.target.value })}
              error={err('productName')}
              dir="auto"
            />
            <div className="grid grid-cols-2 gap-3">
              <Field
                label={t('orders.items.brandModel')}
                value={item.brandModel}
                onChange={(e) => update(index, { brandModel: e.target.value })}
                error={err('brandModel')}
                dir="auto"
              />
              <Field
                label={t('orders.items.year')}
                value={item.year}
                onChange={(e) => update(index, { year: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                error={err('year')}
                inputMode="numeric"
                dir="ltr"
              />
              <Field
                label={t('orders.items.quantity')}
                value={item.quantity}
                onChange={(e) => update(index, { quantity: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                error={err('quantity')}
                inputMode="numeric"
                dir="ltr"
              />
              <div>
                <Label htmlFor={`${item.key}-price`}>{t('orders.items.unitPrice', { currency })}</Label>
                <MoneyInput
                  id={`${item.key}-price`}
                  value={item.unitPrice}
                  onValueChange={(v) => update(index, { unitPrice: v })}
                  aria-invalid={err('unitPrice') ? true : undefined}
                />
                {err('unitPrice') ? <p className="mt-1 text-sm text-danger">{err('unitPrice')}</p> : null}
              </div>
            </div>
            <Field
              label={t('orders.items.hsCode')}
              value={item.hsCode}
              onChange={(e) => update(index, { hsCode: e.target.value })}
              error={err('hsCode')}
              dir="ltr"
            />
            <div>
              <Label htmlFor={`${item.key}-specs`}>{t('orders.items.specs')}</Label>
              <textarea
                id={`${item.key}-specs`}
                value={item.specs}
                onChange={(e) => update(index, { specs: e.target.value })}
                rows={3}
                dir="auto"
                className="block w-full rounded-lg border border-border bg-surface px-3 py-2 text-base"
              />
            </div>
            <SupplierPicker
              label={t('orders.items.supplier')}
              value={item.supplier}
              onSelect={(supplier) => update(index, { supplier })}
              error={err('supplierId')}
            />
            <p className="flex justify-between border-t border-border pt-2 text-sm">
              <span className="text-muted-foreground">{t('orders.items.lineTotal')}</span>
              {total === null ? <span>—</span> : <AmountText value={formatAmount(total)} currency={currency} className="font-medium" />}
            </p>
          </Card>
        );
      })}
      <Button variant="secondary" size="lg" onClick={() => onChange([...items, newItemDraft()])}>
        {t('orders.items.add')}
      </Button>
    </div>
  );
}
