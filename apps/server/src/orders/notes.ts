import { and, desc, eq, isNull } from 'drizzle-orm';
import { recordAudit } from '../audit/record';
import type { Clock } from '../clock';
import type { Executor } from '../db/client';
import { orderNotes, orders, users, type OrderNoteRow, type UserRow } from '../db/schema';
import { notFound } from '../lib/errors';
import { newId } from '../lib/ids';
import type { RequestCtx } from '../lib/requestContext';
import { softDelete } from '../softDelete';

export type NoteWithAuthor = OrderNoteRow & { authorLabel: string };

function requireOrder(db: Executor, orderId: string): void {
  const order = db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.id, orderId), isNull(orders.deletedAt)))
    .get();
  if (!order) throw notFound();
}

/** FR-017: newest first, non-deleted, with the author's username. */
export function listNotes(db: Executor, orderId: string): NoteWithAuthor[] {
  requireOrder(db, orderId);
  return db
    .select({
      id: orderNotes.id,
      orderId: orderNotes.orderId,
      body: orderNotes.body,
      authorUserId: orderNotes.authorUserId,
      createdAt: orderNotes.createdAt,
      deletedAt: orderNotes.deletedAt,
      deletedBy: orderNotes.deletedBy,
      authorLabel: users.username,
    })
    .from(orderNotes)
    .innerJoin(users, eq(orderNotes.authorUserId, users.id))
    .where(and(eq(orderNotes.orderId, orderId), isNull(orderNotes.deletedAt)))
    .orderBy(desc(orderNotes.createdAt), desc(orderNotes.id))
    .all();
}

export function addNote(tx: Executor, clock: Clock, orderId: string, body: string, actor: UserRow, ctx: RequestCtx): NoteWithAuthor {
  requireOrder(tx, orderId);
  const row = tx
    .insert(orderNotes)
    .values({ id: newId(), orderId, body, authorUserId: actor.id, createdAt: clock.now() })
    .returning()
    .get();
  recordAudit(tx, clock, {
    actorUserId: actor.id,
    actorLabel: actor.username,
    action: 'record.created',
    targetType: 'order_note',
    targetId: row.id,
    ctx,
    after: { orderId, body },
  });
  return { ...row, authorLabel: actor.username };
}

/** FR-018: recoverable deletion through the 001 helper (which writes the audit entry). */
export function deleteNote(tx: Executor, clock: Clock, orderId: string, noteId: string, actor: UserRow, ctx: RequestCtx): void {
  requireOrder(tx, orderId);
  const note = tx
    .select({ id: orderNotes.id })
    .from(orderNotes)
    .where(and(eq(orderNotes.id, noteId), eq(orderNotes.orderId, orderId)))
    .get();
  if (!note || !softDelete(tx, clock, orderNotes, 'order_note', noteId, actor, ctx)) throw notFound();
}
