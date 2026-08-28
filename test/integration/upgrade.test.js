/**
 * Comando `upgrade`.
 *
 * A promessa e estreita e precisa valer sempre: trazer as melhorias do
 * template sem tocar em uma linha do que a pessoa escreveu. Cada teste aqui
 * fixa um lado dessa promessa.
 *
 * Para simular uma versao mais nova do latexkit, o pacote e copiado para um
 * diretorio temporario, a versao no package.json e elevada e os templates da
 * copia sao alterados. A CLI dessa copia e quem roda o upgrade — e o mesmo
 * que aconteceria com um `npm update latexkit` de verdade.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { appendFile, cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { packageRoot } from '../../src/paths.js';
import { tempDir } from '../helpers/tmp.js';

const run = promisify(execFile);
const CLI = join(packageRoot, 'bin', 'latexkit.js');
const TIMEOUT = 300_000;

const BASE = [
  '--title', 'Artigo para Upgrade',
  '--author', 'Autor de Teste',
  '--institution', 'Universidade de Teste',
  '--city', 'Cidade',
];

/**
 * @param {string} cli caminho do bin a usar
 * @param {string[]} args
 * @param {string} [cwd]
 */
function latexkit(cli, args, cwd) {
  return run(process.execPath, [cli, ...args], { cwd, timeout: TIMEOUT, encoding: 'utf8' });
}

/**
 * Copia o pacote, eleva a versao e aplica mudancas ao template `article`.
 *
 * @param {import('node:test').TestContext} t
 * @returns {Promise<string>} caminho do bin da "versao nova"
 */
async function newerRelease(t) {
  const dir = join(await tempDir(t), 'latexkit-0.2.0');
  await mkdir(dir, { recursive: true });

  // So o necessario para rodar: copiar node_modules seria lento e inutil,
  // porque o pacote nao tem dependencias de runtime.
  for (const part of ['bin', 'src', 'templates', 'package.json']) {
    await cp(join(packageRoot, part), join(dir, part), { recursive: true });
  }

  const manifestPath = join(dir, 'package.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.version = '99.0.0';
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  // Encanamento melhorado, e um arquivo novo trazido pela versao.
  await appendFile(join(dir, 'templates/article/config/docinfo.tex'), '\n% melhoria da versao nova\n');
  await appendFile(join(dir, 'templates/article/config/packages.tex'), '\n% outra melhoria\n');
  await writeFile(join(dir, 'templates/article/content/09-novo.tex'), '% arquivo novo do template\n');

  return join(dir, 'bin', 'latexkit.js');
}

/**
 * Projeto na versao atual, com edicoes do usuario em tres lugares.
 *
 * @param {import('node:test').TestContext} t
 * @returns {Promise<string>}
 */
async function editedProject(t) {
  const dir = join(await tempDir(t), 'projeto');
  await latexkit(CLI, ['new', 'article', dir, '--yes', ...BASE]);

  await appendFile(join(dir, 'config/packages.tex'), '\\usepackage{siunitx}\n');
  await appendFile(join(dir, 'config/style.tex'), '% ajuste meu\n');
  await appendFile(join(dir, 'content/01-introducao.tex'), 'Texto que eu escrevi.\n');

  return dir;
}

describe('upgrade', () => {
  test('na mesma versao, nao faz nada', { timeout: TIMEOUT }, async (t) => {
    const dir = await editedProject(t);
    const { stdout } = await latexkit(CLI, ['upgrade'], dir);
    assert.match(stdout, /ja esta na versao/);
  });

  test('atualiza o intocado, preserva o editado e cria o novo', { timeout: TIMEOUT }, async (t) => {
    const dir = await editedProject(t);
    const newer = await newerRelease(t);

    const before = await readFile(join(dir, 'config/packages.tex'), 'utf8');
    await latexkit(newer, ['upgrade'], dir);

    // Intocado pelo usuario: recebe a melhoria.
    const docinfo = await readFile(join(dir, 'config/docinfo.tex'), 'utf8');
    assert.match(docinfo, /melhoria da versao nova/);

    // Novo no template: aparece no projeto.
    assert.ok(existsSync(join(dir, 'content/09-novo.tex')));

    // Editado pelo usuario: byte a byte como estava.
    assert.equal(await readFile(join(dir, 'config/packages.tex'), 'utf8'), before);
    assert.match(before, /siunitx/);

    // E a versao nova fica ao lado, para comparacao.
    const pending = await readFile(join(dir, 'config/packages.tex.new'), 'utf8');
    assert.match(pending, /outra melhoria/);
    assert.doesNotMatch(pending, /siunitx/);
  });

  test('conteudo do usuario nao ganha .new: nao ha o que comparar', { timeout: TIMEOUT }, async (t) => {
    const dir = await editedProject(t);
    const newer = await newerRelease(t);
    await latexkit(newer, ['upgrade'], dir);

    const intro = await readFile(join(dir, 'content/01-introducao.tex'), 'utf8');
    assert.match(intro, /Texto que eu escrevi/);
    assert.ok(
      !existsSync(join(dir, 'content/01-introducao.tex.new')),
      'um .new ao lado da introducao do usuario e so ruido',
    );
  });

  test('--dry-run nao escreve nada', { timeout: TIMEOUT }, async (t) => {
    const dir = await editedProject(t);
    const newer = await newerRelease(t);

    const before = await readFile(join(dir, 'config/docinfo.tex'), 'utf8');
    const { stdout } = await latexkit(newer, ['upgrade', '--dry-run'], dir);

    assert.match(stdout, /Simulacao/);
    assert.equal(await readFile(join(dir, 'config/docinfo.tex'), 'utf8'), before);
    assert.ok(!existsSync(join(dir, 'config/packages.tex.new')));
    assert.ok(!existsSync(join(dir, 'content/09-novo.tex')));
  });

  test('o manifesto e a config passam a registrar a nova versao', { timeout: TIMEOUT }, async (t) => {
    const dir = await editedProject(t);
    const newer = await newerRelease(t);
    await latexkit(newer, ['upgrade'], dir);

    const manifest = JSON.parse(await readFile(join(dir, '.latexkit/manifest.json'), 'utf8'));
    const config = JSON.parse(await readFile(join(dir, 'latexkit.config.json'), 'utf8'));
    assert.equal(manifest.version, '99.0.0');
    assert.equal(config.latexkitVersion, '99.0.0');

    // Rodar de novo nao tem mais o que fazer.
    const { stdout } = await latexkit(newer, ['upgrade'], dir);
    assert.match(stdout, /ja esta na versao/);
  });

  test('o projeto continua compilando depois do upgrade', { timeout: TIMEOUT }, async (t) => {
    const dir = await editedProject(t);
    const newer = await newerRelease(t);
    await latexkit(newer, ['upgrade'], dir);

    await latexkit(CLI, ['build'], dir);
    assert.ok(existsSync(join(dir, 'out', 'main.pdf')));
  });

  test('sem manifesto, recusa e explica o --force', { timeout: TIMEOUT }, async (t) => {
    const dir = await editedProject(t);
    const newer = await newerRelease(t);
    // Projeto gerado antes de o manifesto existir.
    await run('rm', ['-rf', join(dir, '.latexkit')]);

    await assert.rejects(latexkit(newer, ['upgrade'], dir), (cause) => {
      const failure = /** @type {{stdout?: string, stderr?: string}} */ (cause);
      assert.match(`${failure.stdout ?? ''}${failure.stderr ?? ''}`, /--force/);
      return true;
    });
  });

  test('com --force e sem manifesto, nada e sobrescrito', { timeout: TIMEOUT }, async (t) => {
    const dir = await editedProject(t);
    const newer = await newerRelease(t);
    await run('rm', ['-rf', join(dir, '.latexkit')]);

    const before = await readFile(join(dir, 'config/docinfo.tex'), 'utf8');
    await latexkit(newer, ['upgrade', '--force'], dir);

    // Sem manifesto nao ha como provar que o arquivo esta intocado, entao ele
    // e tratado como editado — a melhoria fica no .new.
    assert.equal(await readFile(join(dir, 'config/docinfo.tex'), 'utf8'), before);
    assert.match(await readFile(join(dir, 'config/docinfo.tex.new'), 'utf8'), /melhoria da versao nova/);
  });

  test('--clean-pending apaga os .new e nada mais', { timeout: TIMEOUT }, async (t) => {
    const dir = await editedProject(t);
    const newer = await newerRelease(t);
    await latexkit(newer, ['upgrade'], dir);
    assert.ok(existsSync(join(dir, 'config/packages.tex.new')));

    await latexkit(CLI, ['upgrade', '--clean-pending'], dir);
    assert.ok(!existsSync(join(dir, 'config/packages.tex.new')));
    assert.ok(existsSync(join(dir, 'config/packages.tex')), 'o original nao pode sumir junto');
  });

  test('scripts proprios do package.json sobrevivem', { timeout: TIMEOUT }, async (t) => {
    const dir = await editedProject(t);
    const newer = await newerRelease(t);

    const file = join(dir, 'package.json');
    const manifest = JSON.parse(await readFile(file, 'utf8'));
    manifest.scripts.deploy = 'meu-script-de-deploy';
    await writeFile(file, JSON.stringify(manifest, null, 2), 'utf8');

    await latexkit(newer, ['upgrade'], dir);

    const after = JSON.parse(await readFile(file, 'utf8'));
    assert.equal(after.scripts.deploy, 'meu-script-de-deploy');
    assert.equal(after.scripts.build, 'latexkit build');
  });
});
