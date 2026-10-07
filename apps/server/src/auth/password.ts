import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { hash, verify, type Options } from '@node-rs/argon2';
import { PASSWORD_LENGTH, type ErrorCode } from '@hanjing/shared';
import { SERVER_ROOT } from '../config';

/** Argon2id (the library default algorithm) with OWASP-recommended cost (research R5). */
let hashOptions: Options = { memoryCost: 65_536, timeCost: 3, parallelism: 1 };

/** Tests lower the cost; production never calls this. */
export function configurePasswordHashing(options: Pick<Options, 'memoryCost' | 'timeCost'>): void {
  hashOptions = { ...hashOptions, ...options };
  dummyHash = null;
}

export function hashPassword(password: string): Promise<string> {
  return hash(password, hashOptions);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | null = null;

/** Spend the same time as a real check for unknown usernames, so timing reveals nothing (R6). */
export async function verifyAgainstDummy(password: string): Promise<false> {
  dummyHash ??= hashPassword('hj-dummy-password-never-valid');
  await verifyPassword(await dummyHash, password);
  return false;
}

let commonPasswords: Set<string> | null = null;

function loadCommonPasswords(): Set<string> {
  if (!commonPasswords) {
    const raw = readFileSync(resolve(SERVER_ROOT, 'assets', 'common-passwords.txt'), 'utf8');
    commonPasswords = new Set(raw.split('\n').map((l) => l.trim()).filter(Boolean));
  }
  return commonPasswords;
}

export function isCommonPassword(password: string): boolean {
  return loadCommonPasswords().has(password.toLowerCase());
}

/** FR-008: length 10–128 and not a commonly used password. No composition rules, no rotation. */
export function checkPasswordPolicy(password: string): ErrorCode | null {
  if (password.length < PASSWORD_LENGTH.min) return 'password_too_short';
  if (password.length > PASSWORD_LENGTH.max) return 'password_too_long';
  if (isCommonPassword(password)) return 'password_too_common';
  return null;
}
