/**
 * Conversao de Markdown para LaTeX.
 *
 * Markdown e opcional, entao ha dois caminhos a garantir: com Pandoc, o .md
 * vira .tex e entra no PDF; sem Pandoc, o erro diz quais arquivos estao
 * envolvidos e como instalar. Os dois sao testados — o segundo simulando a
 * ausencia do Pandoc por meio de um PATH sem ele.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { which } from '../../src/util/exec.js';
import { packageRoot } from '../../src/paths.js';
import { tempDir } from '../helpers/tmp.js';

const run = promisify(execFile);
const CLI = join(packageRoot, 'bin', 'latexkit.js');
const TIMEOUT = 300_000;

const BASE = [
  '--title', 'Artigo em Markdown',
  '--author', 'Autor de Teste',
  '--institution', 'Universidade de Teste',
  '--city', 'Cidade',
];

/** Markdown com os elementos que mais mudam de forma na conversao. */
const MARKDOWN = `# Desenvolvimento

Texto em **negrito** e em *italico*, com \`codigo\`.

## Uma subsecao

- primeiro item
- segundo item

A taxa foi de 40% no periodo, e a citacao \\cite{knuth1984} segue valendo.
`;

/**
 * @param {string[]} args
 * @param {string} [cwd]
 * @param {NodeJS.ProcessEnv} [env]
 */
function latexkit(args, cwd, env) {
  return run(process.execPath, [CLI, ...args], {
    cwd,
    env: env ?? process.env,
    timeout: TIMEOUT,
    encoding: 'utf8',
  });
}

/**
 * Cria um projeto com uma secao escrita em Markdown no lugar do .tex.
 *
 * @param {import('node:test').TestContext} t
 * @returns {Promise<string>}
 */
async function projectWithMarkdown(t) {
  const dir = join(await tempDir(t), 'md');
  await latexkit(['new', 'article', dir, '--yes', ...BASE]);

  await rm(join(dir, 'content', '02-desenvolvimento.tex'));
  await writeFile(join(dir, 'content', '02-desenvolvimento.md'), MARKDOWN, 'utf8');

  const main = join(dir, 'main.tex');
  const content = await readFile(main, 'utf8');
  await writeFile(
    main,
    content.replace(
      '\\input{content/02-desenvolvimento}',
      '\\input{content/02-desenvolvimento.generated}',
    ),
    'utf8',
  );

  return dir;
}

describe('markdown', () => {
  test('converte o .md e o inclui no PDF', { timeout: TIMEOUT }, async (t) => {
    if (!(await which('pandoc'))) return t.skip('pandoc nao instalado nesta maquina');

    const dir = await projectWithMarkdown(t);
    const { stdout } = await latexkit(['build'], dir);
    assert.match(stdout, /Pandoc converteu 1/);

    const generated = join(dir, 'content', '02-desenvolvimento.generated.tex');
    assert.ok(existsSync(generated), 'o .tex derivado do .md nao foi gerado');

    const tex = await readFile(generated, 'utf8');
    assert.match(tex, /^% GERADO por latexkit/m, 'falta a marca de arquivo gerado');
    // O nivel de secao importa: a classe ja define o documento, e o Pandoc nao
    // pode promover um "# titulo" a capitulo.
    assert.match(tex, /\\section\{Desenvolvimento\}/);
    assert.match(tex, /\\textbf\{negrito\}/);
    // A citacao e LaTeX puro e precisa atravessar a conversao intacta.
    assert.match(tex, /\\cite\{knuth1984\}/);

    assert.ok(existsSync(join(dir, 'out', 'main.pdf')));
  });

  test('o clean remove o .tex derivado, mas nunca o .md', { timeout: TIMEOUT }, async (t) => {
    if (!(await which('pandoc'))) return t.skip('pandoc nao instalado nesta maquina');

    const dir = await projectWithMarkdown(t);
    await latexkit(['build'], dir);
    await latexkit(['clean'], dir);

    assert.ok(!existsSync(join(dir, 'content', '02-desenvolvimento.generated.tex')));
    assert.ok(existsSync(join(dir, 'content', '02-desenvolvimento.md')), 'o clean apagou a fonte');
  });

  test('o check le as citacoes que estao no .md', { timeout: TIMEOUT }, async (t) => {
    const dir = await projectWithMarkdown(t);

    // knuth1984 so e citada dentro do .md. Se o check ignorasse os .md, ela
    // apareceria como entrada nunca citada.
    //
    // Os achados saem em stderr e o resumo em stdout, entao a assercao precisa
    // olhar os dois: so o stdout passaria mesmo com o aviso presente.
    const { stdout, stderr } = await latexkit(['check'], dir);
    assert.doesNotMatch(`${stdout}${stderr}`, /knuth1984/, 'o check nao enxergou a citacao no .md');
  });

  test('citacao orfa dentro do .md derruba o check', { timeout: TIMEOUT }, async (t) => {
    const dir = await projectWithMarkdown(t);
    const file = join(dir, 'content', '02-desenvolvimento.md');
    await writeFile(file, `${MARKDOWN}\nOutra: \\cite{naoexiste2030}.\n`, 'utf8');

    await assert.rejects(latexkit(['check'], dir), (cause) => {
      const failure = /** @type {{code?: number, stdout?: string, stderr?: string}} */ (cause);
      assert.equal(failure.code, 1);
      assert.match(`${failure.stdout ?? ''}${failure.stderr ?? ''}`, /naoexiste2030/);
      return true;
    });
  });

  test('sem pandoc, o erro nomeia o arquivo e como instalar', { timeout: TIMEOUT }, async (t) => {
    const dir = await projectWithMarkdown(t);

    // PATH sem pandoc, mas com o TeX: isola a ausencia do Pandoc.
    await assert.rejects(latexkit(['build'], dir, { ...process.env, PATH: '/usr/bin:/bin' }), () => true);

    const withoutPandoc = { ...process.env, PATH: '/nonexistent' };
    await assert.rejects(latexkit(['build'], dir, withoutPandoc), (cause) => {
      const failure = /** @type {{stdout?: string, stderr?: string}} */ (cause);
      const output = `${failure.stdout ?? ''}${failure.stderr ?? ''}`;
      assert.match(output, /02-desenvolvimento\.md/, 'o erro deveria nomear o arquivo');
      assert.match(output, /pandoc/i);
      return true;
    });
  });
});
