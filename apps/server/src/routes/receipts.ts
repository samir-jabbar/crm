import { MAX_RECEIPT_BYTES, type ReceiptUpload } from '@hanjing/shared';
import type { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { Deps } from '../deps';
import type { AppEnv } from '../env';
import { removeOrphans, saveReceipt } from '../files/store';
import { AppError } from '../lib/errors';
import { presentReceiptUpload } from '../policy/present';
import { route } from '../policy/route';

/** Room for the multipart boundaries and headers around a file of exactly MAX_RECEIPT_BYTES. */
const MULTIPART_OVERHEAD = 64 * 1024;

/**
 * 003 FR-006, research R7: upload first, attach on save. The file stays unattached (and is cleaned up after 24 h)
 * until an expense references it, so a failed save never loses the photo.
 */
export function registerReceiptRoutes(app: Hono<AppEnv>, deps: Deps): void {
  route(
    app,
    'POST',
    '/api/receipts',
    { module: 'expenses', action: 'create' },
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
      const row = saveReceipt(deps, new Uint8Array(await file.arrayBuffer()), viewer);
      removeOrphans(deps);
      return c.json<ReceiptUpload>(presentReceiptUpload(row, { viewer }), 201);
    },
  );
}
