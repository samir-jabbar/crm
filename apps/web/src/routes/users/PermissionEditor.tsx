import {
  HIDDEN_GROUPS,
  MODULE_ACTIONS,
  MODULES,
  normalizePermissionSet,
  permissionConflict,
  type HiddenGroup,
  type Module,
  type PermissionSet,
  type PolicyAction,
} from '@hanjing/shared';
import { useTranslation } from 'react-i18next';
import { Alert } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

/** Modules whose screens arrive in later features (FR-009): they can be set now and apply when built. */
const LATER: ReadonlySet<Module> = new Set(['shipments', 'documents', 'invoices', 'advisor']);

function Chip({ pressed, onClick, children, label }: { pressed: boolean; onClick: () => void; children: string; label: string }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={label}
      onClick={onClick}
      className={cn(
        'min-h-11 rounded-full border px-3 text-sm',
        pressed ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-surface hover:bg-muted',
      )}
    >
      {children}
    </button>
  );
}

/**
 * 005 FR-007, FR-008, FR-025, FR-032, FR-044: one row per module with its actions, then the hidden value groups.
 * Every change is normalized the way the server stores it (Create/Edit/Delete/Export include View), and combinations
 * that cannot work are explained at once.
 */
export function PermissionEditor({ value, onChange }: { value: PermissionSet; onChange: (next: PermissionSet) => void }) {
  const { t } = useTranslation();
  const conflict = permissionConflict(value);

  const setActions = (module: Module, actions: PolicyAction[]) =>
    onChange(normalizePermissionSet({ ...value, modules: { ...value.modules, [module]: actions } }));
  const toggle = (module: Module, action: PolicyAction) => {
    const current = value.modules[module] ?? [];
    if (!current.includes(action)) return setActions(module, [...current, action]);
    // Removing View removes everything: no action works without it.
    return setActions(module, action === 'view' ? [] : current.filter((a) => a !== action));
  };
  const toggleGroup = (group: HiddenGroup) =>
    onChange(
      normalizePermissionSet({
        ...value,
        hidden: value.hidden.includes(group) ? value.hidden.filter((g) => g !== group) : [...value.hidden, group],
      }),
    );

  return (
    <div className="space-y-5">
      <section className="space-y-3" aria-label={t('users.editor.modules')}>
        <h3 className="font-semibold">{t('users.editor.modules')}</h3>
        <ul className="divide-y divide-border">
          {MODULES.map((module) => {
            const actions = value.modules[module] ?? [];
            const name = t(`workers.module.${module}`);
            return (
              <li key={module} className="space-y-2 py-3">
                <p className="font-medium">
                  {name}
                  {LATER.has(module) ? <span className="ms-2 text-xs font-normal text-muted-foreground">{t('workers.moduleLater')}</span> : null}
                </p>
                <div className="flex flex-wrap gap-2" role="group" aria-label={name}>
                  <Chip pressed={actions.length === 0} onClick={() => setActions(module, [])} label={`${name}: ${t('workers.action.none')}`}>
                    {t('workers.action.none')}
                  </Chip>
                  {MODULE_ACTIONS[module].map((action) => (
                    <Chip
                      key={action}
                      pressed={actions.includes(action)}
                      onClick={() => toggle(module, action)}
                      label={`${name}: ${t(`workers.action.${action}`)}`}
                    >
                      {t(`workers.action.${action}`)}
                    </Chip>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="space-y-3" aria-label={t('users.editor.hidden')}>
        <h3 className="font-semibold">{t('users.editor.hidden')}</h3>
        <p className="text-sm text-muted-foreground">{t('users.editor.hiddenHint')}</p>
        {HIDDEN_GROUPS.map((group) => (
          <label key={group} className="flex min-h-11 cursor-pointer items-start gap-3">
            <input type="checkbox" className="mt-1 size-5 shrink-0" checked={value.hidden.includes(group)} onChange={() => toggleGroup(group)} />
            <span>
              <span className="block font-medium">{t(`workers.group.${group}`)}</span>
              <span className="block text-xs text-muted-foreground">{t(`workers.groupHint.${group}`)}</span>
            </span>
          </label>
        ))}
      </section>

      {conflict ? <Alert tone="danger">{t(`workers.conflict.${conflict}`)}</Alert> : null}
    </div>
  );
}
