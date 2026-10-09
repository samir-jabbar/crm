import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DAY_MS, MINUTE_MS } from '../../src/clock';
import { createTestContext, OWNER, seedExpense, seedOrder, TINY_JPEG, TINY_PDF, type TestContext } from '../helpers';

const jpeg = { bytes: TINY_JPEG, filename: 'receipt.jpg', type: 'image/jpeg' };
const stored = (ctx: TestContext, id: string) => join(ctx.config.dataDir, 'receipts', id);

async function signInAgain(ctx: TestContext) {
  const client = ctx.client();
  const res = await client.post('/api/auth/sign-in', { username: OWNER.username, password: OWNER.password });
  expect(res.status).toBe(200);
  return client;
}

// 003 quickstart X3 / FR-006, research R7.
describe('receipts', () => {
  it('uploads, attaches and serves a receipt with safe headers (X3)', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const order = await seedOrder(owner);

    const upload = await owner.upload('/api/receipts', jpeg);
    expect(upload.status).toBe(201);
    expect(upload.body).toEqual({ id: expect.any(String), mime: 'image/jpeg', size: TINY_JPEG.length });
    expect(new Uint8Array(readFileSync(stored(ctx, upload.body.id)))).toEqual(TINY_JPEG);

    const expense = await seedExpense(owner, order.id, { receiptId: upload.body.id });
    expect(expense).toMatchObject({ hasReceipt: true, receiptId: upload.body.id, receiptMime: 'image/jpeg' });

    const file = await owner.getBytes(`/api/expenses/${expense.id}/receipt`);
    expect(file.status).toBe(200);
    expect(file.bytes).toEqual(TINY_JPEG);
    expect(file.headers.get('content-type')).toBe('image/jpeg');
    expect(file.headers.get('content-disposition')).toBe('inline');
    expect(file.headers.get('cache-control')).toBe('private, no-store');
    expect(file.headers.get('x-content-type-options')).toBe('nosniff');
    expect(file.headers.get('content-security-policy')).toBe('sandbox');
  });

  it('serves PDFs as downloads, still sandboxed', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const order = await seedOrder(owner);
    const upload = await owner.upload('/api/receipts', { bytes: TINY_PDF, filename: 'invoice.pdf', type: 'application/pdf' });
    expect(upload.body.mime).toBe('application/pdf');
    const expense = await seedExpense(owner, order.id, { receiptId: upload.body.id });
    const file = await owner.getBytes(`/api/expenses/${expense.id}/receipt`);
    expect(file.headers.get('content-type')).toBe('application/pdf');
    // Downloaded rather than shown: browsers refuse their PDF viewer in a sandboxed document.
    expect(file.headers.get('content-disposition')).toBe(`attachment; filename="receipt-${expense.id}.pdf"`);
    expect(file.headers.get('content-security-policy')).toBe('sandbox');
    expect(file.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('refuses files over 10 MB, of other types, or without a file', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const big = (size: number) => {
      const bytes = new Uint8Array(size);
      bytes.set(TINY_JPEG.subarray(0, 4));
      return { bytes, filename: 'big.jpg', type: 'image/jpeg' };
    };
    const justOver = await owner.upload('/api/receipts', big(10_485_761));
    expect([justOver.status, justOver.body.error.code]).toEqual([413, 'file_too_large']);
    const wayOver = await owner.upload('/api/receipts', big(11 * 1024 * 1024));
    expect([wayOver.status, wayOver.body.error.code]).toEqual([413, 'file_too_large']);

    const html = new TextEncoder().encode('<!doctype html><script>alert(1)</script>');
    const disguised = await owner.upload('/api/receipts', { bytes: html, filename: 'photo.jpg', type: 'image/jpeg' });
    expect([disguised.status, disguised.body.error.code]).toEqual([400, 'file_type_invalid']);

    const noFile = await owner.request('POST', '/api/receipts', new FormData());
    expect([noFile.status, noFile.body.error.code]).toEqual([400, 'file_type_invalid']);
    expect(ctx.sqlite.prepare('select count(*) as n from files').get()).toEqual({ n: 0 });
  });

  it('only attaches a receipt uploaded by the same user and not used elsewhere', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const order = await seedOrder(owner);
    const upload = await owner.upload('/api/receipts', jpeg);
    await seedExpense(owner, order.id, { receiptId: upload.body.id });

    const base = { name: 'Again', categoryId: 'cat-other', amount: '1', currency: 'CNY', expenseDate: '2026-10-07' };
    const reused = await owner.post(`/api/orders/${order.id}/expenses`, { ...base, receiptId: upload.body.id });
    expect(reused.body.error.details.fields).toEqual({ receiptId: 'receipt_invalid' });

    await ctx.createWorker('assistant');
    ctx.sqlite
      .prepare("insert into files (id, kind, mime, size_bytes, sha256, created_by, created_at) values ('f-other', 'receipt', 'image/jpeg', 10, 'x', 'worker-assistant', ?)")
      .run(ctx.clock.now());
    const foreign = await owner.post(`/api/orders/${order.id}/expenses`, { ...base, receiptId: 'f-other' });
    expect(foreign.body.error.details.fields).toEqual({ receiptId: 'receipt_invalid' });
  });

  it('serves receipts only to signed-in users, and only when there is one', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const order = await seedOrder(owner);
    const without = await seedExpense(owner, order.id);
    expect((await owner.get(`/api/expenses/${without.id}/receipt`)).status).toBe(404);
    expect((await ctx.client().get(`/api/expenses/${without.id}/receipt`)).status).toBe(401);
    expect((await ctx.client().upload('/api/receipts', jpeg)).status).toBe(401);
  });

  it('removes uploads never attached after 24 h, and keeps attached ones (R7)', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const order = await seedOrder(owner);

    // Attached to an expense that is later deleted: still referenced, so kept for restore.
    const attached = await owner.upload('/api/receipts', jpeg);
    const expense = await seedExpense(owner, order.id, { receiptId: attached.body.id });
    ctx.sqlite.prepare('update expenses set deleted_at = ? where id = ?').run(ctx.clock.now(), expense.id);
    const orphan = await owner.upload('/api/receipts', jpeg);

    ctx.clock.advance(DAY_MS + 60 * MINUTE_MS);
    const later = await signInAgain(ctx);
    const fresh = await later.upload('/api/receipts', jpeg); // each upload also cleans up

    const ids = (ctx.sqlite.prepare('select id from files').all() as { id: string }[]).map((r) => r.id).sort();
    expect(ids).toEqual([attached.body.id, fresh.body.id].sort());
    expect(existsSync(stored(ctx, orphan.body.id))).toBe(false);
    expect(existsSync(stored(ctx, attached.body.id))).toBe(true);
    expect(existsSync(stored(ctx, fresh.body.id))).toBe(true);
  });
});
