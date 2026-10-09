import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    /** Root of the per-test-context data directories (receipts); removed after the run. */
    dataRoot: string;
  }
}

export default function setup(project: TestProject) {
  const root = mkdtempSync(join(tmpdir(), 'hj-test-'));
  project.provide('dataRoot', root);
  return () => rmSync(root, { recursive: true, force: true });
}
