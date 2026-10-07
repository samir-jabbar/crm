import { ORDER_NUMBER_TIME_ZONE } from '@hanjing/shared';
import { eq, sql } from 'drizzle-orm';
import type { Clock } from '../clock';
import type { Executor } from '../db/client';
import { orderNumberCounters } from '../db/schema';

const yearFormat = new Intl.DateTimeFormat('en-US', { timeZone: ORDER_NUMBER_TIME_ZONE, year: 'numeric' });

/** Calendar year of an instant in China time (order numbers restart each January there). */
export function chinaYear(ms: number): number {
  return Number(yearFormat.format(ms));
}

/** `HJ-2026-007`; the counter grows past 3 digits when needed (`HJ-2026-1000`). */
export function formatOrderNumber(prefix: string, year: number, seq: number): string {
  return `${prefix}-${year}-${String(seq).padStart(3, '0')}`;
}

/**
 * Take the next number for the current year (research R2). Call inside the order-creating transaction,
 * opened with `behavior: 'immediate'`, so concurrent creates are serialized on the write lock.
 * The counter is shared by all prefixes and never decremented: numbers are never reused.
 */
export function nextOrderNumber(tx: Executor, clock: Clock, prefix: string): { number: string; year: number; seq: number } {
  const year = chinaYear(clock.now());
  const row = tx
    .insert(orderNumberCounters)
    .values({ year, lastValue: 1 })
    .onConflictDoUpdate({ target: orderNumberCounters.year, set: { lastValue: sql`${orderNumberCounters.lastValue} + 1` } })
    .returning()
    .get();
  return { number: formatOrderNumber(prefix, year, row.lastValue), year, seq: row.lastValue };
}

/** What the next order would be numbered, without reserving anything (Settings preview). */
export function previewNextOrderNumber(db: Executor, clock: Clock, prefix: string): string {
  const year = chinaYear(clock.now());
  const row = db.select().from(orderNumberCounters).where(eq(orderNumberCounters.year, year)).get();
  return formatOrderNumber(prefix, year, (row?.lastValue ?? 0) + 1);
}
