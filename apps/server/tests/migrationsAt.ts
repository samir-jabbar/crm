import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { MIGRATIONS_DIR } from '../src/db/client';

/** A copy of the migrations folder as it was when journal entry `lastIdx` was the newest (e.g. 5 = end of 003). */
export function migrationsAt(root: string, lastIdx: number): string {
  const folder = join(root, `drizzle-upto-${lastIdx}`);
  cpSync(MIGRATIONS_DIR, folder, { recursive: true });
  const journalPath = join(folder, 'meta', '_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: { idx: number }[] };
  journal.entries = journal.entries.filter((entry) => entry.idx <= lastIdx);
  writeFileSync(journalPath, JSON.stringify(journal));
  return folder;
}
