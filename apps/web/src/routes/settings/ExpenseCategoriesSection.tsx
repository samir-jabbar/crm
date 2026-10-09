import type { ExpenseCategory } from '@hanjing/shared';
import { useId, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { fieldErrors, useErrorMessage } from '@/api/errors';
import { useCreateCategory, useExpenseCategories, usePatchCategory } from '@/api/expenses';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { categoryLabel } from '@/lib/categories';
import { cn } from '@/lib/utils';

function CategoryRow({ category }: { category: ExpenseCategory }) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const patch = usePatchCategory();
  const inputId = useId();
  const label = categoryLabel(category, t);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(label);

  function rename(e: FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!name.trim() || name.trim() === label) return setEditing(false);
    patch.mutate({ id: category.id, name: name.trim() }, { onSuccess: () => setEditing(false) });
  }

  return (
    <li className={cn('space-y-2 py-2', category.hidden && 'opacity-60')}>
      {editing ? (
        <form className="flex flex-wrap items-end gap-2" onSubmit={rename} noValidate>
          <div className="min-w-0 flex-1">
            <Label htmlFor={inputId}>{t('settings.categories.newName')}</Label>
            <Input id={inputId} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} dir="auto" autoFocus />
          </div>
          <Button type="submit" disabled={patch.isPending}>
            {t('common.save')}
          </Button>
          <Button variant="ghost" onClick={() => setEditing(false)}>
            {t('common.cancel')}
          </Button>
        </form>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="min-w-0 text-sm" dir="auto">
            {label}
            {category.hidden ? <span className="ms-2 text-xs text-muted-foreground">({t('settings.categories.hiddenTag')})</span> : null}
          </span>
          <span className="flex gap-1">
            <Button
              variant="ghost"
              aria-label={t('settings.categories.renameLabel', { name: label })}
              onClick={() => {
                setName(label);
                setEditing(true);
              }}
            >
              {t('settings.categories.rename')}
            </Button>
            <Button
              variant="ghost"
              aria-label={t(category.hidden ? 'settings.categories.showLabel' : 'settings.categories.hideLabel', { name: label })}
              disabled={patch.isPending}
              onClick={() => patch.mutate({ id: category.id, hidden: !category.hidden })}
            >
              {category.hidden ? t('settings.categories.show') : t('settings.categories.hide')}
            </Button>
          </span>
        </div>
      )}
      {patch.error ? <Alert tone="danger">{errorMessage(patch.error)}</Alert> : null}
    </li>
  );
}

/**
 * 003 FR-021 / FR-022: the default categories follow the user's language; the Owner adds (any script), renames,
 * hides and shows. Hidden ones stay on existing expenses. There is no deletion.
 */
export function ExpenseCategoriesSection() {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const headingId = useId();
  const newId = useId();
  const categories = useExpenseCategories({ includeHidden: true });
  const create = useCreateCategory();
  const [name, setName] = useState('');
  const nameError = fieldErrors(create.error).name;

  function add(e: FormEvent) {
    e.preventDefault();
    create.mutate({ name }, { onSuccess: () => setName('') });
  }

  return (
    <section aria-labelledby={headingId}>
      <Card className="space-y-3">
        <h2 id={headingId} className="text-lg font-semibold">
          {t('settings.categories.title')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('settings.categories.description')}</p>
        {categories.error ? <Alert tone="danger">{errorMessage(categories.error)}</Alert> : null}
        <ul className="divide-y divide-border" aria-label={t('settings.categories.title')}>
          {(categories.data ?? []).map((category) => (
            <CategoryRow key={`${category.id}:${category.name ?? ''}`} category={category} />
          ))}
        </ul>
        <form className="flex flex-wrap items-end gap-2 border-t border-border pt-3" onSubmit={add} noValidate>
          <div className="min-w-0 flex-1">
            <Label htmlFor={newId}>{t('settings.categories.add')}</Label>
            <Input
              id={newId}
              value={name}
              maxLength={60}
              placeholder={t('settings.categories.addPlaceholder')}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={nameError ? true : undefined}
              dir="auto"
            />
          </div>
          <Button type="submit" disabled={create.isPending}>
            {t('settings.categories.addButton')}
          </Button>
        </form>
        {nameError ? <p className="text-sm text-danger">{t(`errors.${nameError}`)}</p> : null}
      </Card>
    </section>
  );
}
