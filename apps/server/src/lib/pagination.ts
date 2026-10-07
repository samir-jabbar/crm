import { and, eq, lt, or, type SQL } from 'drizzle-orm';
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';
import { AppError } from './errors';

/** Opaque keyset cursor over (timestamp DESC, id DESC). */
export interface Cursor {
  at: number;
  id: string;
}

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify([cursor.at, cursor.id])).toString('base64url');
}

export function decodeCursor(raw: string | undefined): Cursor | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (Array.isArray(parsed) && typeof parsed[0] === 'number' && typeof parsed[1] === 'string') {
      return { at: parsed[0], id: parsed[1] };
    }
  } catch {
    /* fall through */
  }
  throw new AppError(400, 'validation_failed', { fields: { cursor: 'invalid_value' } });
}

/** WHERE clause for "older than the cursor" in (at DESC, id DESC) order. */
export function olderThan(atColumn: SQLiteColumn, idColumn: SQLiteColumn, cursor: Cursor | null): SQL | undefined {
  if (!cursor) return undefined;
  return or(lt(atColumn, cursor.at), and(eq(atColumn, cursor.at), lt(idColumn, cursor.id)));
}

/** Fetch limit+1 rows, return a page and the next cursor. */
export function toPage<T extends { id: string }>(rows: T[], limit: number, at: (row: T) => number) {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items.at(-1);
  return { items, nextCursor: hasMore && last ? encodeCursor({ at: at(last), id: last.id }) : null };
}
