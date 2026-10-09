import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DAY_MS, MINUTE_MS } from '../../src/clock';
import { createTestContext, OWNER, seedExpense, seedOrder, seedPayment, TINY_JPEG, TINY_PDF, type TestContext } from '../helpers';

const jpeg = { bytes: TINY_JPEG, filename: 'slip.jpg', type: 'image/jpeg' };

async function signInAgain(ctx: TestContext) {
  const client = ctx.client();
  expect((await client.post('/api/auth/sign-in', { username: OWNER.username, password: OWNER.password })).status).toBe(200);
  return client;
}

// 004 quickstart P3 / FR-003, research R7.
describe('payment proofs', () => {
  it('uploads, attaches and serves a proof with safe headers (P3)', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const order = await seedOrder(owner);

    const upload = await owner.upload('/api/payment-proofs', jpeg);
    expect(upload.status).toBe(201);
    expect(upload.body).toEqual({ id: expect.any(String), mime: 'image/jpeg', size: TINY_JPEG.length });
    expect(ctx.sqlite.prepare('select kind from files where id = ?').get(upload.body.id)).toEqual({ kind: 'payment_proof' });

    const payment = await seedPayment(owner, order.id, { proofId: upload.body.id });
    expect(payment).toMatchObject({ hasProof: true, proofId: upload.body.id, proofMime: 'image/jpeg' });

    const file = await owner.getBytes(`/api/payments/${payment.id}/proof`);
    expect(file.status).toBe(200);
    expect(file.bytes).toEqual(TINY_JPEG);
    expect(file.headers.get('content-type')).toBe('image/jpeg');
    expect(file.headers.get('content-disposition')).toBe('inline');
    expect(file.headers.get('cache-control')).toBe('private, no-store');
    expect(file.headers.get('x-content-type-options')).toBe('nosniff');
    expect(file.headers.get('content-security-policy')).toBe('sandbox');

    const pdf = await owner.upload('/api/payment-proofs', { bytes: TINY_PDF, filename: 'slip.pdf', type: 'application/pdf' });
    const withPdf = await seedPayment(owner, order.id, { proofId: pdf.body.id });
    expect((await owner.getBytes(`/api/payments/${withPdf.id}/proof`)).headers.get('content-disposition')).toBe(
      `attachment; filename="proof-${withPdf.id}.pdf"`,
    );

    const without = await seedPayment(owner, order.id);
    expect((await owner.get(`/api/payments/${without.id}/proof`)).status).toBe(404);
    expect((await ctx.client().get(`/api/payments/${payment.id}/proof`)).status).toBe(401);
    expect((await ctx.client().upload('/api/payment-proofs', jpeg)).status).toBe(401);
  });

  it('keeps receipts and proofs apart, and attaches each file once (FR-003)', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const order = await seedOrder(owner);
    const base = { channel: 'bank', type: 'balance', amount: '10', currency: 'USD', paymentDate: '2026-10-07', rates: { USD: '7.1', MAD: '0.71' } };

    const receipt = await owner.upload('/api/receipts', jpeg);
    const asProof = await owner.post(`/api/orders/${order.id}/payments`, { ...base, proofId: receipt.body.id });
    expect(asProof.body.error.details.fields).toEqual({ proofId: 'proof_invalid' });

    const proof = await owner.upload('/api/payment-proofs', jpeg);
    const asReceipt = await owner.post(`/api/orders/${order.id}/expenses`, {
      name: 'Fuel',
      categoryId: 'cat-other',
      amount: '1',
      currency: 'CNY',
      expenseDate: '2026-10-07',
      receiptId: proof.body.id,
    });
    expect(asReceipt.body.error.details.fields).toEqual({ receiptId: 'receipt_invalid' });

    await seedPayment(owner, order.id, { proofId: proof.body.id });
    const reused = await owner.post(`/api/orders/${order.id}/payments`, { ...base, proofId: proof.body.id });
    expect(reused.body.error.details.fields).toEqual({ proofId: 'proof_invalid' });
    // The receipt is still usable by an expense.
    await seedExpense(owner, order.id, { receiptId: receipt.body.id });
  });

  it('removes proofs never attached after 24 h, and keeps attached ones', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const order = await seedOrder(owner);
    const attached = await owner.upload('/api/payment-proofs', jpeg);
    await seedPayment(owner, order.id, { proofId: attached.body.id });
    const orphan = await owner.upload('/api/payment-proofs', jpeg);

    ctx.clock.advance(DAY_MS + 60 * MINUTE_MS);
    const later = await signInAgain(ctx);
    await later.upload('/api/payment-proofs', jpeg);

    const stored = (id: string) => join(ctx.config.dataDir, 'receipts', id);
    expect(existsSync(stored(orphan.body.id))).toBe(false);
    expect(existsSync(stored(attached.body.id))).toBe(true);
    expect(ctx.sqlite.prepare('select count(*) as n from files where id = ?').get(orphan.body.id)).toEqual({ n: 0 });
  });
});
