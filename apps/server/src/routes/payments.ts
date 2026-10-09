import { isHidden } from '@hanjing/shared';
import {
  orderPaymentsQuerySchema,
  paymentInputSchema,
  paymentPlanSchema,
  type OrderPayments,
  type Payment,
  type PaymentsConfig,
  type PlanStage,
} from '@hanjing/shared';
import type { Hono } from 'hono';
import type { Deps } from '../deps';
import type { AppEnv } from '../env';
import { readFile } from '../files/store';
import { notFound } from '../lib/errors';
import { parseWith, readJsonBody } from '../lib/validate';
import { accessOf, requireChannel, requirePermission, visibleChannels } from '../policy/authorize';
import { ownEntries, requireEntryInScope, requireOrderInScope } from '../policy/scope';
import { payments } from '../db/schema';
import { presentPayment, presentPaymentsConfig, presentPaymentSummary, presentPlanStage } from '../policy/present';
import { route } from '../policy/route';
import { listOrderPayments, paymentSummary, requireLiveOrder } from '../payments/query';
import { replacePlan } from '../payments/plan';
import { createPayment, deletePayment, requirePayment, restorePayment, updatePayment } from '../payments/service';
import { listBanks, readPaymentSettings } from '../payments/settings';

/**
 * 004 FR-001 – FR-011 (payments). Every route declares a payments:<action> policy (FR-028), and every payment
 * read or write also checks its channel (research R9).
 */
export function registerPaymentRoutes(app: Hono<AppEnv>, deps: Deps): void {
  const { db } = deps;
  const id = (c: { req: { param: (k: string) => string | undefined } }) => c.req.param('id') ?? '';

  route(app, 'GET', '/api/orders/:id/payments', { module: 'payments', action: 'view' }, (c) => {
    const viewer = c.get('user')!;
    const { deleted } = parseWith(orderPaymentsQuerySchema, c.req.query());
    if (deleted) requirePermission(viewer, 'payments', 'delete');
    const access = accessOf(viewer);
    requireOrderInScope(db, access, id(c));
    const order = requireLiveOrder(db, id(c));
    const channels = visibleChannels(viewer);
    const own = ownEntries(access, payments.createdBy);
    return c.json<OrderPayments>({
      items: listOrderPayments(db, order.id, { deleted, channels, filter: own }).map((view) => presentPayment(view, { viewer })),
      summary: presentPaymentSummary(paymentSummary(db, order, channels, own), { viewer }),
    });
  });

  route(app, 'POST', '/api/orders/:id/payments', { module: 'payments', action: 'create' }, async (c) => {
    const viewer = c.get('user')!;
    // A missing, deleted or out-of-scope order is a 404 before any field is checked.
    requireOrderInScope(db, accessOf(viewer), id(c));
    requireLiveOrder(db, id(c));
    const input = parseWith(paymentInputSchema, await readJsonBody(c));
    return c.json<Payment>(presentPayment(createPayment(deps, id(c), input, viewer, c.get('reqCtx')), { viewer }), 201);
  });

  // FR-014: the whole plan is replaced at once. It covers both channels, so both must be editable.
  route(app, 'PUT', '/api/orders/:id/payment-plan', { module: 'payments', action: 'edit' }, async (c) => {
    const viewer = c.get('user')!;
    requireOrderInScope(db, accessOf(viewer), id(c));
    const order = requireLiveOrder(db, id(c));
    requireChannel(viewer, 'direct', 'edit');
    requireChannel(viewer, 'bank', 'edit');
    const { stages } = parseWith(paymentPlanSchema, await readJsonBody(c));
    const plan = db.transaction((tx) => replacePlan(tx, deps.clock, order, stages, viewer, c.get('reqCtx')));
    return c.json<{ plan: PlanStage[] }>({ plan: plan.map((s) => presentPlanStage(s, { viewer })) });
  });

  // Fixed paths are registered before `/:id`: the first matching route wins.
  route(app, 'GET', '/api/payments/config', { module: 'payments', action: 'view' }, (c) => {
    const settings = readPaymentSettings(db);
    const config: PaymentsConfig = {
      channels: { direct: { name: settings.directChannelName }, bank: { name: settings.bankChannelName } },
      banks: listBanks(db),
    };
    return c.json<PaymentsConfig>(presentPaymentsConfig(config, { viewer: c.get('user')! }));
  });

  route(app, 'GET', '/api/payments/:id', { module: 'payments', action: 'view' }, (c) => {
    requireEntryInScope(db, accessOf(c.get('user')!), payments, id(c));
    const viewer = c.get('user')!;
    return c.json<Payment>(presentPayment(requirePayment(db, viewer, id(c), 'view'), { viewer }));
  });

  route(app, 'PUT', '/api/payments/:id', { module: 'payments', action: 'edit' }, async (c) => {
    requireEntryInScope(db, accessOf(c.get('user')!), payments, id(c));
    const viewer = c.get('user')!;
    // A missing payment, or one of a deleted order, is a 404 before any field is checked.
    requirePayment(db, viewer, id(c), 'edit');
    const input = parseWith(paymentInputSchema, await readJsonBody(c));
    return c.json<Payment>(presentPayment(updatePayment(deps, id(c), input, viewer, c.get('reqCtx')), { viewer }));
  });

  route(app, 'DELETE', '/api/payments/:id', { module: 'payments', action: 'delete' }, (c) => {
    requireEntryInScope(db, accessOf(c.get('user')!), payments, id(c));
    deletePayment(deps, id(c), c.get('user')!, c.get('reqCtx'));
    return c.body(null, 204);
  });

  route(app, 'POST', '/api/payments/:id/restore', { module: 'payments', action: 'delete' }, (c) => {
    requireEntryInScope(db, accessOf(c.get('user')!), payments, id(c));
    const viewer = c.get('user')!;
    return c.json<Payment>(presentPayment(restorePayment(deps, id(c), viewer, c.get('reqCtx')), { viewer }));
  });

  // Like receipts (003 R7): only through the gate, typed by the bytes, never run by the browser.
  route(app, 'GET', '/api/payments/:id/proof', { module: 'payments', action: 'view' }, (c) => {
    requireEntryInScope(db, accessOf(c.get('user')!), payments, id(c));
    const payment = requirePayment(db, c.get('user')!, id(c), 'view');
    // 005 FR-033: a proof shows the amount, so it follows the payment-amounts group.
    if (isHidden(accessOf(c.get('user')!), 'paymentAmounts')) throw notFound();
    const file = payment.proofFileId ? readFile(deps, payment.proofFileId) : undefined;
    if (!file) throw notFound();
    c.set('cspOverride', 'sandbox');
    const disposition = file.mime === 'application/pdf' ? `attachment; filename="proof-${payment.id}.pdf"` : 'inline';
    return c.body(new Uint8Array(file.bytes), 200, {
      'Content-Type': file.mime,
      'Content-Disposition': disposition,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
  });
}
