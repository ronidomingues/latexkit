/** Diretorios temporarios descartaveis para os testes. */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Cria um diretorio temporario e o remove ao fim do teste.
 *
 * @param {import('node:test').TestContext} t
 * @returns {Promise<string>}
 */
export async function tempDir(t) {
  const dir = await mkdtemp(join(tmpdir(), 'latexkit-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}
