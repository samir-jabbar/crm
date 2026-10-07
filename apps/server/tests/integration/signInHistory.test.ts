import { describe, expect, it } from 'vitest';
import { MINUTE_MS } from '../../src/clock';
import { createTestContext, OWNER } from '../helpers';

// US3 acceptance 6 / FR-016.
describe('sign-in history', () => {
  it('lists only my attempts, newest first, with device and network origin', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    ctx.clock.advance(MINUTE_MS);
    await ctx.client('192.0.2.99').post('/api/auth/sign-in', { username: OWNER.username, password: 'bad-guess-000' });
    ctx.clock.advance(MINUTE_MS);
    await ctx.client('192.0.2.50').post('/api/auth/sign-in', { username: 'stranger', password: 'whatever-000' });
    await ctx.createWorker();

    const res = await owner.get('/api/me/sign-in-history');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items[0]).toMatchObject({
      outcome: 'failure',
      reason: 'invalid_credentials',
      ip: '192.0.2.99',
      deviceLabel: 'iPhone · Safari',
    });
    expect(res.body.items[1]).toMatchObject({ outcome: 'success', reason: 'ok' });
    expect(res.body.nextCursor).toBeNull();
  });

  it('paginates with a cursor', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    for (let i = 0; i < 4; i++) {
      ctx.clock.advance(MINUTE_MS);
      await ctx.client(`192.0.2.${i}`).post('/api/auth/sign-in', { username: OWNER.username, password: OWNER.password });
    }
    const first = await owner.get('/api/me/sign-in-history?limit=3');
    expect(first.body.items).toHaveLength(3);
    expect(first.body.nextCursor).toEqual(expect.any(String));
    const second = await owner.get(`/api/me/sign-in-history?limit=3&cursor=${first.body.nextCursor}`);
    expect(second.body.items).toHaveLength(2);
    expect(second.body.nextCursor).toBeNull();
    const ids = [...first.body.items, ...second.body.items].map((i: any) => i.id);
    expect(new Set(ids).size).toBe(5);
  });
});
