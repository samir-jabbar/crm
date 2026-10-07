/**
 * Owner password reset, run on the server only (FR-012, ROADMAP D9). There is no HTTP route for this.
 *
 *   npm run owner:reset-password -w apps/server                 # prompts twice, input hidden
 *   echo 'new password' | npm run owner:reset-password -w apps/server -- --password-stdin
 */
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { eq } from 'drizzle-orm';
import { recordAudit } from '../audit/record';
import { checkPasswordPolicy, hashPassword } from '../auth/password';
import { revokeAllForUser } from '../auth/sessions';
import { systemClock, type Clock } from '../clock';
import { loadConfig } from '../config';
import { openDb, runMigrations, type DB } from '../db/client';
import { users } from '../db/schema';
import { SYSTEM_CTX } from '../lib/requestContext';

export async function resetOwnerPassword(db: DB, clock: Clock, newPassword: string): Promise<{ sessionsEnded: number }> {
  const owner = db.select().from(users).where(eq(users.role, 'owner')).get();
  if (!owner) throw new Error('No owner account exists yet — complete first-launch setup instead.');
  const policyError = checkPasswordPolicy(newPassword);
  if (policyError) throw new Error(`Password rejected: ${policyError}`);
  const passwordHash = await hashPassword(newPassword);

  return db.transaction((tx) => {
    const now = clock.now();
    tx.update(users).set({ passwordHash, passwordChangedAt: now, updatedAt: now }).where(eq(users.id, owner.id)).run();
    const sessionsEnded = revokeAllForUser(tx, clock, owner.id, 'server_reset');
    recordAudit(tx, clock, {
      actorUserId: null,
      actorLabel: 'system:cli',
      action: 'password.server_reset',
      targetType: 'user',
      targetId: owner.id,
      ctx: SYSTEM_CTX,
      after: { sessionsEnded },
    });
    return { sessionsEnded };
  });
}

function promptHidden(question: string): Promise<string> {
  const { stdin, stdout } = process;
  if (!stdin.isTTY) return Promise.reject(new Error('No terminal available: use --password-stdin.'));
  stdout.write(question);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding('utf8');
  return new Promise((resolvePrompt, reject) => {
    let value = '';
    const cleanup = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off('data', onData);
    };
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          cleanup();
          stdout.write('\n');
          resolvePrompt(value);
          return;
        }
        if (ch === '\u0003') {
          cleanup();
          reject(new Error('Cancelled.'));
          return;
        }
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.on('data', onData);
  });
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk as Buffer));
  return Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '');
}

async function main() {
  const config = loadConfig();
  const dbPath = resolve(config.dataDir, 'app.db');
  let password: string;
  if (process.argv.includes('--password-stdin')) {
    password = await readStdin();
  } else {
    password = await promptHidden('New owner password: ');
    const confirm = await promptHidden('Repeat new password: ');
    if (password !== confirm) throw new Error('The two passwords do not match.');
  }
  const { db, sqlite } = openDb(dbPath);
  try {
    runMigrations(db);
    const { sessionsEnded } = await resetOwnerPassword(db, systemClock, password);
    console.log(`[owner:reset-password] Done. ${sessionsEnded} session(s) signed out. Database: ${dbPath}`);
  } finally {
    sqlite.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(`[owner:reset-password] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
