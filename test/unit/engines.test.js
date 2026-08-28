import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { detectAll, resolveEngine } from '../../src/engines/index.js';
import { clearWhichCache } from '../../src/util/exec.js';
import { UserError } from '../../src/util/log.js';
import { tempDir } from '../helpers/tmp.js';

/**
 * Monta um PATH artificial contendo apenas os binarios pedidos, para exercitar
 * a cadeia de fallback sem depender do que a maquina tem instalado.
 *
 * @param {import('node:test').TestContext} t
 * @param {string[]} binaries
 * @returns {Promise<string>} raiz de projeto ficticia
 */
async function withFakePath(t, binaries) {
  const dir = await tempDir(t);
  const bin = join(dir, 'bin');
  await mkdir(bin, { recursive: true });

  for (const name of binaries) {
    const file = join(bin, name);
    // O `docker` sonda o daemon com `docker info`; o stub responde com sucesso.
    await writeFile(file, '#!/bin/sh\nexit 0\n', 'utf8');
    await chmod(file, 0o755);
  }

  const original = process.env.PATH;
  process.env.PATH = bin;
  clearWhichCache();
  t.after(() => {
    process.env.PATH = original;
    clearWhichCache();
  });

  return dir;
}

/** @param {string} root */
const contextFor = (root, overrides = {}) => ({
  root,
  entry: 'main.tex',
  outDir: 'out',
  texEngine: /** @type {const} */ ('pdflatex'),
  bibliography: /** @type {const} */ ('abntex2cite'),
  ...overrides,
});

test('latexmk vence quando o toolchain completo esta presente', async (t) => {
  const root = await withFakePath(t, ['latexmk', 'pdflatex', 'bibtex']);
  const { engine, source } = await resolveEngine(contextFor(root));
  assert.equal(engine.id, 'latexmk');
  assert.equal(source, 'detected');
});

test('sem latexmk, cai para o motor manual', async (t) => {
  const root = await withFakePath(t, ['pdflatex', 'bibtex']);
  const { engine } = await resolveEngine(contextFor(root));
  assert.equal(engine.id, 'manual');
});

test('sem TeX local, cai para o tectonic', async (t) => {
  const root = await withFakePath(t, ['tectonic']);
  const { engine } = await resolveEngine(contextFor(root));
  assert.equal(engine.id, 'tectonic');
});

test('sem nada local, cai para o docker', async (t) => {
  const root = await withFakePath(t, ['docker']);
  const { engine } = await resolveEngine(contextFor(root));
  assert.equal(engine.id, 'docker');
});

test('sem nenhum motor, o erro lista o motivo de cada um', async (t) => {
  const root = await withFakePath(t, []);
  await assert.rejects(resolveEngine(contextFor(root)), (error) => {
    assert.ok(error instanceof UserError);
    assert.match(error.message, /Nenhum motor/);
    // O usuario precisa saber por que cada opcao foi descartada.
    for (const id of ['latexmk', 'manual', 'tectonic', 'docker']) {
      assert.ok(error.hints.some((hint) => hint.includes(id)), `faltou explicar ${id}`);
    }
    return true;
  });
});

test('bibliografia biblatex exige biber, e nao bibtex', async (t) => {
  const root = await withFakePath(t, ['latexmk', 'pdflatex', 'bibtex']);
  const results = await detectAll(contextFor(root, { bibliography: 'biblatex' }));
  const latexmk = results.find((item) => item.engine.id === 'latexmk');
  assert.ok(latexmk, 'o latexmk deveria aparecer na deteccao');
  assert.equal(latexmk.detection.available, false);
  assert.match(/** @type {{reason: string}} */ (latexmk.detection).reason, /biber/);
});

test('o tectonic e descartado com biblatex, porque nao roda biber', async (t) => {
  const root = await withFakePath(t, ['tectonic']);
  const results = await detectAll(contextFor(root, { bibliography: 'biblatex' }));
  const tectonic = results.find((item) => item.engine.id === 'tectonic');
  assert.ok(tectonic, 'o tectonic deveria aparecer na deteccao');
  assert.equal(tectonic.detection.available, false);
});

test('motor pedido que nao existe erra, em vez de trocar em silencio', async (t) => {
  const root = await withFakePath(t, ['latexmk', 'pdflatex', 'bibtex']);
  await assert.rejects(resolveEngine(contextFor(root), { requested: 'tectonic' }), (error) => {
    assert.ok(error instanceof UserError);
    assert.match(error.message, /tectonic/);
    return true;
  });
});

test('motor desconhecido e recusado', async (t) => {
  const root = await withFakePath(t, ['latexmk', 'pdflatex', 'bibtex']);
  await assert.rejects(
    resolveEngine(contextFor(root), { requested: /** @type {any} */ ('inexistente') }),
    UserError,
  );
});

test('a escolha detectada e reaproveitada do cache na chamada seguinte', async (t) => {
  const root = await withFakePath(t, ['latexmk', 'pdflatex', 'bibtex']);
  assert.equal((await resolveEngine(contextFor(root))).source, 'detected');
  assert.equal((await resolveEngine(contextFor(root))).source, 'cache');
  assert.equal((await resolveEngine(contextFor(root), { redetect: true })).source, 'detected');
});

test('cache de um motor que sumiu da maquina e descartado', async (t) => {
  const root = await withFakePath(t, ['latexmk', 'pdflatex', 'bibtex']);
  await resolveEngine(contextFor(root));

  // Mesma raiz, mas agora sem latexmk no PATH: o cache aponta para um motor
  // que nao existe mais e a deteccao precisa recomecar.
  const bin = join(await tempDir(t), 'bin');
  await mkdir(bin, { recursive: true });
  for (const name of ['pdflatex', 'bibtex']) {
    await writeFile(join(bin, name), '#!/bin/sh\nexit 0\n', 'utf8');
    await chmod(join(bin, name), 0o755);
  }
  process.env.PATH = bin;
  clearWhichCache();

  const { engine } = await resolveEngine(contextFor(root));
  assert.equal(engine.id, 'manual');
});

test('o tectonic sai da escolha quando o documento tem indice remissivo', async (t) => {
  // O tectonic nao chama makeindex nem enxerga um .ind produzido por fora: o
  // documento sairia com o indice vazio e sem erro. Recusar na deteccao faz a
  // cadeia cair para o proximo motor sozinha.
  const root = await withFakePath(t, ['tectonic']);
  const results = await detectAll(contextFor(root, { needsIndex: true }));
  const tectonic = results.find((item) => item.engine.id === 'tectonic');
  assert.ok(tectonic, 'o tectonic deveria aparecer na deteccao');
  assert.equal(tectonic.detection.available, false);
  assert.match(/** @type {{reason: string}} */ (tectonic.detection).reason, /indice/i);
});

test('com indice e so o tectonic instalado, a cadeia acusa a falta', async (t) => {
  const root = await withFakePath(t, ['tectonic']);
  await assert.rejects(resolveEngine(contextFor(root, { needsIndex: true })), UserError);
});

test('sem indice, o tectonic continua elegivel', async (t) => {
  const root = await withFakePath(t, ['tectonic']);
  const { engine } = await resolveEngine(contextFor(root, { needsIndex: false }));
  assert.equal(engine.id, 'tectonic');
});
