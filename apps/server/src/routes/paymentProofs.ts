import { MAX_RECEIPT_BYTES, type PaymentProofUpload } from '@hanjing/shared';
import type { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { Deps } from '../deps';
import type { AppEnv } from '../env';
import { removeOrphans, saveFile } from '../files/store';
import { AppError } from '../lib/errors';
import { presentReceiptUpload } from '../policy/present';
import { route } from '../policy/route';

/** Room for the multipart boundaries and headers around a file of exactly MAX_RECEIPT_BYTES. */
const MULTIPART_OVERHEAD = 64 * 1024;

/** 004 FR-003: like receipts, proofs are uploaded first and attached when the payment is saved. */
export function registerPaymentProofRoutes(app: Hono<AppEnv>, deps: Deps): void {
  route(
    app,
    'POST',
    '/api/payment-proofs',
    { module: 'payments', action: 'create' },
    bodyLimit({
      maxSize: MAX_RECEIPT_BYTES + MULTIPART_OVERHEAD,
      onError: (c) => c.json({ error: { code: 'file_too_large' } }, 413),
    }),
    async (c) => {
      const viewer = c.get('user')!;
      const body = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);
      const file = body.file;
      if (!(file instanceof File)) throw new AppError(400, 'file_type_invalid');
      if (file.size > MAX_RECEIPT_BYTES) throw new AppError(413, 'file_too_large');
      const row = saveFile(deps, new Uint8Array(await file.arrayBuffer()), viewer, 'payment_proof');
      removeOrphans(deps);
      return c.json<PaymentProofUpload>(presentReceiptUpload(row, { viewer }), 201);
    },
  );
}
