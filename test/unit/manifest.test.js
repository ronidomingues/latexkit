import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { hashContent, hashFile, readManifest, writeManifest } from '../../src/scaffold/manifest.js';
import { tempDir } from '../helpers/tmp.js';

test('o hash ignora a diferenca entre CRLF e LF', async () => {
  // Um checkout do git no Windows pode converter as quebras de linha. Sem a
  // normalizacao, todo arquivo do template apareceria como editado e o
  // upgrade nunca atualizaria nada.
  assert.equal(hashContent('a\r\nb\r\n'), hashContent('a\nb\n'));
});

test('o hash distingue conteudos diferentes', () => {
  assert.notEqual(hashContent('a'), hashContent('b'));
});

test('hashFile devolve null para arquivo inexistente', async (t) => {
  const dir = await tempDir(t);
  assert.equal(await hashFile(join(dir, 'nao-existe.tex')), null);
});

test('o manifesto sobrevive a ida e volta do disco', async (t) => {
  const dir = await tempDir(t);
  const manifest = { template: 'article', version: '1.2.3', files: { 'main.tex': 'abc' } };
  await writeManifest(dir, manifest);
  assert.deepEqual(await readManifest(dir), manifest);
});

test('as chaves sao gravadas em ordem, para o diff nao virar ruido', async (t) => {
  const dir = await tempDir(t);
  await writeManifest(dir, {
    template: 'article',
    version: '1.0.0',
    files: { 'z.tex': '1', 'a.tex': '2', 'm.tex': '3' },
  });
  const written = await readManifest(dir);
  assert.ok(written, 'o manifesto recem-escrito deveria ser legivel');
  assert.deepEqual(Object.keys(written.files), ['a.tex', 'm.tex', 'z.tex']);
});

test('projeto sem manifesto devolve null, em vez de estourar', async (t) => {
  assert.equal(await readManifest(await tempDir(t)), null);
});
