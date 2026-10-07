import { AUDIT_ACTIONS } from '@hanjing/shared';
import { describe, expect, it } from 'vitest';
import { DAY_MS, MINUTE_MS } from '../../src/clock';
import { createTestContext, OWNER } from '../helpers';

async function withHistory() {
  const ctx = await createTestContext();
  const owner = await ctx.createOwner(); // setup.owner_created + auth.sign_in
  ctx.clock.advance(MINUTE_MS);
  await ctx.client('192.0.2.9').post('/api/auth/sign-in', { username: OWNER.username, password: 'bad-guess-000' });
  ctx.clock.advance(MINUTE_MS);
  await owner.patch('/api/me', { language: 'fr' });
  ctx.clock.advance(MINUTE_MS);
  await owner.post('/api/me/password', { currentPassword: OWNER.password, newPassword: 'Another-Long-Passphrase-7' });
  const ownerId = (await owner.get('/api/me')).body.user.id as string;
  return { ctx, owner, ownerId };
}

// Quickstart Q16, Q17 / US4, FR-020 – FR-023.
describe('audit log', () => {
  it('records who, what, when, device and network origin, newest first', async () => {
    const { owner } = await withHistory();
    const res = await owner.get('/api/audit');
    expect(res.status).toBe(200);
    const actions = res.body.items.map((e: any) => e.action);
    expect(actions).toEqual(['password.changed', 'profile.updated', 'auth.sign_in_failed', 'auth.sign_in', 'setup.owner_created']);
    const failed = res.body.items.find((e: any) => e.action === 'auth.sign_in_failed');
    expect(failed).toMatchObject({ ip: '192.0.2.9', deviceLabel: 'iPhone · Safari', actor: { label: OWNER.username } });
    const profile = res.body.items.find((e: any) => e.action === 'profile.updated');
    expect(profile).toMatchObject({ before: { language: 'en' }, after: { language: 'fr' } });
  });

  it('filters by person, exact action, action prefix and inclusive dates', async () => {
    const { ctx, ownerId } = await withHistory();
    // Two days later the old session has idled out (12 h); sign in again and change something.
    ctx.clock.advance(2 * DAY_MS);
    const owner = ctx.client();
    await owner.post('/api/auth/sign-in', { username: OWNER.username, password: 'Another-Long-Passphrase-7' });
    await owner.patch('/api/me', { language: 'ar' });

    const byAction = await owner.get('/api/audit?action=profile.updated');
    expect(byAction.body.items).toHaveLength(2);
    const byPrefix = await owner.get('/api/audit?action=auth.');
    expect(byPrefix.body.items.map((e: any) => e.action).sort()).toEqual([
      'auth.sign_in',
      'auth.sign_in',
      'auth.sign_in_failed',
    ]);
    const byActor = await owner.get(`/api/audit?actorId=${ownerId}`);
    expect(byActor.body.items.every((e: any) => e.actor.id === ownerId)).toBe(true);
    const sameDay = await owner.get('/api/audit?from=2026-10-07&to=2026-10-07');
    expect(sameDay.body.items).toHaveLength(5);
    const later = await owner.get('/api/audit?from=2026-10-08');
    expect(later.body.items.map((e: any) => e.action)).toEqual(['profile.updated', 'auth.sign_in']);
  });

  it('paginates newest first with a cursor', async () => {
    const { owner } = await withHistory();
    const first = await owner.get('/api/audit?limit=2');
    expect(first.body.items).toHaveLength(2);
    const second = await owner.get(`/api/audit?limit=2&cursor=${first.body.nextCursor}`);
    const third = await owner.get(`/api/audit?limit=2&cursor=${second.body.nextCursor}`);
    expect(third.body.items).toHaveLength(1);
    expect(third.body.nextCursor).toBeNull();
  });

  it('lists the known action codes and the people who appear in the log', async () => {
    const { owner, ownerId } = await withHistory();
    expect((await owner.get('/api/audit/actions')).body.items).toEqual([...AUDIT_ACTIONS]);
    expect((await owner.get('/api/audit/actors')).body.items).toEqual([{ id: ownerId, label: OWNER.username }]);
  });

  it('is Owner-only (FR-019)', async () => {
    const { ctx } = await withHistory();
    const worker = await ctx.createWorker();
    for (const path of ['/api/audit', '/api/audit/actions', '/api/audit/actors']) {
      const res = await worker.get(path);
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: { code: 'forbidden' } });
    }
  });

  it('cannot be changed or deleted, even with direct SQL (FR-022)', async () => {
    const { ctx } = await withHistory();
    expect(() => ctx.sqlite.prepare("update audit_entries set action = 'auth.sign_in'").run()).toThrow(/audit_append_only/);
    expect(() => ctx.sqlite.prepare('delete from audit_entries').run()).toThrow(/audit_append_only/);
  });
});
