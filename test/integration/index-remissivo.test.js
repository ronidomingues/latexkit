/**
 * Indice remissivo.
 *
 * O latexmk monta o indice sozinho; os demais motores nao. Sem tratamento, o
 * mesmo projeto sairia com ou sem indice conforme o motor que a cadeia
 * escolhesse — e sem nenhum aviso. Este teste fixa o comportamento de cada um.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { which } from '../../src/util/exec.js';
import { packageRoot } from '../../src/paths.js';
import { tempDir } from '../helpers/tmp.js';

const run = promisify(execFile);
const CLI = join(packageRoot, 'bin', 'latexgen.js');
const TIMEOUT = 300_000;

const BASE = ['--title', 'Livro com Indice', '--author', 'Autor de Teste'];

/**
 * @param {string[]} args
 * @param {string} [cwd]
 */
function latexgen(args, cwd) {
  return run(process.execPath, [CLI, ...args], { cwd, timeout: TIMEOUT, encoding: 'utf8' });
}

/**
 * O `book` marca termos com \index; o .ind so existe se o indice foi montado.
 *
 * @param {import('node:test').TestContext} t
 * @returns {Promise<string>}
 */
async function bookProject(t) {
  const dir = join(await tempDir(t), 'livro');
  await latexgen(['new', 'book', dir, '--yes', ...BASE]);
  return dir;
}

describe('indice remissivo', () => {
  for (const engine of ['latexmk', 'manual']) {
    test(`${engine} monta o indice`, { timeout: TIMEOUT }, async (t) => {
      if (!(await which(engine === 'latexmk' ? 'latexmk' : 'pdflatex'))) {
        return t.skip(`${engine} nao disponivel nesta maquina`);
      }
      if (!(await which('makeindex'))) return t.skip('makeindex nao disponivel');

      const dir = await bookProject(t);
      await latexgen(['build', `--engine=${engine}`], dir);

      const ind = join(dir, 'out', 'main.ind');
      assert.ok(existsSync(ind), `${engine} nao gerou o .ind`);

      // O .ind precisa ter entradas de verdade, nao so o ambiente vazio.
      const content = await readFile(ind, 'utf8');
      assert.match(content, /\\item tipografia/, 'o indice saiu sem as entradas do texto');
    });
  }

  test('o tectonic recusa o documento em vez de entregar indice vazio', { timeout: TIMEOUT }, async (t) => {
    if (!(await which('tectonic'))) return t.skip('tectonic nao instalado nesta maquina');

    const dir = await bookProject(t);
    await assert.rejects(latexgen(['build', '--engine=tectonic'], dir), (cause) => {
      const failure = /** @type {{stdout?: string, stderr?: string}} */ (cause);
      assert.match(`${failure.stdout ?? ''}${failure.stderr ?? ''}`, /indice/i);
      return true;
    });
  });
});
