import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectCitations, stripComments } from '../../src/commands/check.js';

test('stripComments remove comentarios e preserva o \\% escapado', () => {
  assert.equal(stripComments('texto % comentario'), 'texto ');
  assert.equal(stripComments('% linha inteira'), '');
  assert.equal(stripComments('100\\% de acerto'), '100\\% de acerto');
});

test('stripComments preserva a contagem de linhas', () => {
  // O check reporta numeros de linha calculados sobre o texto ja limpo.
  const input = 'a\n% b\nc';
  assert.equal(stripComments(input).split('\n').length, input.split('\n').length);
});

test('reconhece os comandos de citacao dos dois backends', () => {
  const text = String.raw`
    \cite{a} \citeonline{b} \citeauthor{c} \nocite{d}
    \parencite{e} \textcite{f} \autocite{g} \footcite{h}
  `;
  assert.deepEqual([...collectCitations(text)].sort(), ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
});

test('separa varias chaves em um mesmo comando', () => {
  assert.deepEqual([...collectCitations(String.raw`\cite{a, b ,c}`)].sort(), ['a', 'b', 'c']);
});

test('aceita as formas com argumento opcional e com asterisco', () => {
  const text = String.raw`\cite[p. 30]{a} \citeonline[cap. 2][p. 5]{b} \cite*{c}`;
  assert.deepEqual([...collectCitations(text)].sort(), ['a', 'b', 'c']);
});

test('\\nocite{*} nao e uma chave', () => {
  assert.deepEqual([...collectCitations(String.raw`\nocite{*}`)], []);
});

test('citacao comentada nao conta', () => {
  // O template traz blocos de exemplo comentados; eles nao sao do documento.
  assert.deepEqual([...collectCitations(stripComments(String.raw`% \cite{exemplo}`))], []);
});
