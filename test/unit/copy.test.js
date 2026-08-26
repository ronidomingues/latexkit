import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { assertUsableTarget, copyTree, renderVars } from '../../src/scaffold/copy.js';
import { toPackageName } from '../../src/scaffold/index.js';
import { UserError } from '../../src/util/log.js';
import { tempDir } from '../helpers/tmp.js';

test('renderVars substitui as chaves conhecidas', () => {
  assert.equal(renderVars('a {{x}} b {{ y }}', { x: '1', y: '2' }), 'a 1 b 2');
});

test('chave desconhecida e erro, para nao vazar {{...}} no arquivo final', () => {
  assert.throws(() => renderVars('{{ausente}}', { x: '1' }), UserError);
});

test('em JSON o valor e escapado para contexto de string', () => {
  // Um titulo com aspas geraria um package.json invalido sem isso.
  const out = renderVars('{"d": "{{t}}"}', { t: 'Titulo "com" aspas\\barra' }, { json: true });
  assert.equal(JSON.parse(out).d, 'Titulo "com" aspas\\barra');
});

test('copyTree renomeia gitignore para .gitignore', async (t) => {
  const from = join(await tempDir(t), 'src');
  const to = join(await tempDir(t), 'dst');
  await mkdir(from, { recursive: true });
  await writeFile(join(from, 'gitignore'), 'out/\n');

  const result = await copyTree(from, to, { vars: {} });
  assert.deepEqual(result.written, ['.gitignore']);
  assert.equal(await readFile(join(to, '.gitignore'), 'utf8'), 'out/\n');
});

test('copyTree nao sobrescreve o que ja existe', async (t) => {
  const from = join(await tempDir(t), 'src');
  const to = join(await tempDir(t), 'dst');
  await mkdir(from, { recursive: true });
  await mkdir(to, { recursive: true });
  await writeFile(join(from, 'a.tex'), 'do template');
  await writeFile(join(to, 'a.tex'), 'meu texto');

  const result = await copyTree(from, to, { vars: {} });
  assert.deepEqual(result.skipped, ['a.tex']);
  assert.equal(await readFile(join(to, 'a.tex'), 'utf8'), 'meu texto');
});

test('arquivos .tex nunca passam por substituicao', async (t) => {
  // Chaves sao sintaxe de LaTeX: tratar {{...}} em .tex quebraria o documento.
  const from = join(await tempDir(t), 'src');
  const to = join(await tempDir(t), 'dst');
  await mkdir(from, { recursive: true });
  await writeFile(join(from, 'a.tex'), '\\title{{{naoexiste}}}');

  await copyTree(from, to, { vars: {} });
  assert.equal(await readFile(join(to, 'a.tex'), 'utf8'), '\\title{{{naoexiste}}}');
});

test('assertUsableTarget recusa diretorio nao vazio', async (t) => {
  const dir = await tempDir(t);
  await writeFile(join(dir, 'algo.txt'), 'x');
  await assert.rejects(assertUsableTarget(dir), UserError);
  await assert.doesNotReject(assertUsableTarget(dir, { allowNonEmpty: true }));
});

test('toPackageName produz um nome valido de pacote npm', () => {
  assert.equal(toPackageName('Meu Artigo (2026)'), 'meu-artigo-2026');
  assert.equal(toPackageName('TCC-João'), 'tcc-joao');
  assert.equal(toPackageName('   '), 'documento-latex');
});
