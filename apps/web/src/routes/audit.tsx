import type { AuditActionsResponse, AuditActorsResponse, AuditEntryItem, Page } from '@hanjing/shared';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useErrorMessage } from '@/api/errors';
import { api } from '@/api/http';
import { queryKeys } from '@/api/queries';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { formatDateTime } from '@/i18n/format';

interface Filters {
  actorId: string;
  action: string;
  from: string;
  to: string;
}

const EMPTY: Filters = { actorId: '', action: '', from: '', to: '' };

/** Local-day bounds from date inputs, sent as UTC instants so the server needs no timezone. */
function toQuery(filters: Filters, cursor: string): string {
  const params = new URLSearchParams({ limit: '30' });
  if (filters.actorId) params.set('actorId', filters.actorId);
  if (filters.action) params.set('action', filters.action);
  if (filters.from) params.set('from', new Date(`${filters.from}T00:00:00`).toISOString());
  if (filters.to) params.set('to', new Date(`${filters.to}T23:59:59.999`).toISOString());
  if (cursor) params.set('cursor', cursor);
  return params.toString();
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

function Changes({ entry }: { entry: AuditEntryItem }) {
  const { t } = useTranslation();
  const keys = [...new Set([...Object.keys(entry.before ?? {}), ...Object.keys(entry.after ?? {})])];
  if (keys.length === 0) return null;
  return (
    <details className="mt-2 text-sm">
      <summary className="min-h-11 cursor-pointer py-2 font-medium text-primary">{t('audit.showChanges')}</summary>
      <dl className="space-y-2">
        {keys.map((key) => (
          <div key={key} className="rounded-lg bg-muted px-3 py-2">
            <dt className="text-xs font-medium text-muted-foreground">{t(`audit.field.${key}`, { defaultValue: key })}</dt>
            <dd className="mt-0.5 break-words">
              {entry.before && key in entry.before ? (
                <>
                  <span className="text-muted-foreground line-through" dir="auto">
                    {formatValue(entry.before[key])}
                  </span>{' '}
                  <span aria-hidden className="rtl:-scale-x-100 inline-block">
                    →
                  </span>{' '}
                </>
              ) : null}
              <span dir="auto">{formatValue(entry.after?.[key])}</span>
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

/** US4: the Owner's read-only audit log (FR-022, FR-023). No edit or delete controls exist. */
export function AuditPage() {
  const { t, i18n } = useTranslation();
  const errorMessage = useErrorMessage();
  const [filters, setFilters] = useState<Filters>(EMPTY);

  const actions = useQuery({
    queryKey: queryKeys.auditActions,
    queryFn: () => api<AuditActionsResponse>('GET', '/api/audit/actions'),
    staleTime: Infinity,
  });
  const actors = useQuery({
    queryKey: ['audit-actors'],
    queryFn: () => api<AuditActorsResponse>('GET', '/api/audit/actors'),
  });
  const entries = useInfiniteQuery({
    queryKey: queryKeys.audit(filters),
    queryFn: ({ pageParam }) => api<Page<AuditEntryItem>>('GET', `/api/audit?${toQuery(filters, pageParam)}`),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = entries.data?.pages.flatMap((p) => p.items) ?? [];

  const set = (name: keyof Filters) => (e: { target: { value: string } }) =>
    setFilters((f) => ({ ...f, [name]: e.target.value }));
  const actorLabel = (label: string) => (label === 'system:cli' ? t('audit.systemActor') : label);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">{t('audit.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('audit.description')}</p>
      </div>

      <Card className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="audit-actor">{t('audit.filters.person')}</Label>
          <Select id="audit-actor" value={filters.actorId} onChange={set('actorId')}>
            <option value="">{t('audit.filters.everyone')}</option>
            {actors.data?.items.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="audit-action">{t('audit.filters.action')}</Label>
          <Select id="audit-action" value={filters.action} onChange={set('action')}>
            <option value="">{t('audit.filters.allActions')}</option>
            {actions.data?.items.map((code) => (
              <option key={code} value={code}>
                {t(`audit.action.${code}`)}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="audit-from">{t('audit.filters.from')}</Label>
          <Input id="audit-from" type="date" value={filters.from} onChange={set('from')} max={filters.to || undefined} />
        </div>
        <div>
          <Label htmlFor="audit-to">{t('audit.filters.to')}</Label>
          <Input id="audit-to" type="date" value={filters.to} onChange={set('to')} min={filters.from || undefined} />
        </div>
        <div className="sm:col-span-2">
          <Button variant="ghost" onClick={() => setFilters(EMPTY)} disabled={filters === EMPTY}>
            {t('audit.filters.clear')}
          </Button>
        </div>
      </Card>

      {entries.error ? <Alert tone="danger">{errorMessage(entries.error)}</Alert> : null}
      {entries.isPending ? <p className="text-sm text-muted-foreground">{t('common.loading')}</p> : null}
      {entries.data && items.length === 0 ? <p className="text-sm text-muted-foreground">{t('audit.empty')}</p> : null}

      <ul aria-label={t('audit.listLabel')} className="space-y-3">
        {items.map((entry) => (
          <li key={entry.id}>
            <Card>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="font-semibold">{t(`audit.action.${entry.action}`)}</p>
                <time dateTime={entry.occurredAt} className="text-sm text-muted-foreground">
                  {formatDateTime(entry.occurredAt, i18n.language, { dateStyle: 'medium', timeStyle: 'medium' })}
                </time>
              </div>
              <p className="mt-1 text-sm">
                <bdi>{actorLabel(entry.actor.label)}</bdi>
              </p>
              {entry.deviceLabel || entry.ip ? (
                <p className="text-xs text-muted-foreground">
                  {entry.deviceLabel ? <bdi>{entry.deviceLabel}</bdi> : null}
                  {entry.deviceLabel && entry.ip ? ' · ' : null}
                  {entry.ip ? <bdi dir="ltr">{entry.ip}</bdi> : null}
                </p>
              ) : null}
              <Changes entry={entry} />
            </Card>
          </li>
        ))}
      </ul>

      {entries.hasNextPage ? (
        <Button variant="secondary" onClick={() => void entries.fetchNextPage()} disabled={entries.isFetchingNextPage}>
          {t('common.loadMore')}
        </Button>
      ) : null}
    </div>
  );
}
