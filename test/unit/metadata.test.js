import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeLatex, macroName, macroSuffix, renderMetadata } from '../../src/scaffold/metadata.js';

test('escapeLatex protege os caracteres especiais do LaTeX', () => {
  assert.equal(escapeLatex('A & B'), 'A \\& B');
  assert.equal(escapeLatex('100%'), '100\\%');
  assert.equal(escapeLatex('a_b'), 'a\\_b');
  assert.equal(escapeLatex('R$ 10'), 'R\\$ 10');
  assert.equal(escapeLatex('#1'), '\\#1');
  assert.equal(escapeLatex('{x}'), '\\{x\\}');
  assert.equal(escapeLatex('~'), '\\textasciitilde{}');
  assert.equal(escapeLatex('^'), '\\textasciicircum{}');
});

test('a barra invertida nao reescapa as chaves que ela mesma introduz', () => {
  // O bug seria produzir \textbackslash\{\}, que imprime literalmente "{}".
  assert.equal(escapeLatex('\\alpha'), '\\textbackslash{}alpha');
  assert.equal(escapeLatex('a\\b&c'), 'a\\textbackslash{}b\\&c');
});

test('macroSuffix aceita so letras, como exige o TeX', () => {
  assert.equal(macroSuffix('title'), 'Title');
  assert.equal(macroSuffix('sub-title'), 'SubTitle');
  assert.equal(macroSuffix('keywordsEn'), 'KeywordsEn');
  assert.equal(macroSuffix('nbr6022'), 'NbrSixZeroTwoTwo');
  assert.match(macroName('nbr6022'), /^\\lk[A-Za-z]+$/);
});

/** @type {Pick<import('../../src/templates.js').Template, 'id' | 'vars'>} */
const template = {
  id: 'article',
  vars: [
    { key: 'title', prompt: 'Titulo' },
    { key: 'advisor', prompt: 'Orientador' },
    { key: 'author', prompt: 'Autor' },
  ],
};

test('cada chave gera a macro de valor e a condicional', () => {
  const out = renderMetadata({ metadata: { title: 'Meu Artigo', author: 'Fulano' } }, template);
  assert.match(out, /\\newcommand\{\\lkTitle\}\{Meu Artigo\}/);
  assert.match(out, /\\newcommand\{\\lkIfTitle\}\[2\]\{#1\}/);
});

test('campo vazio produz a condicional que executa o ramo "nao"', () => {
  const out = renderMetadata({ metadata: { title: 'x', advisor: '' } }, template);
  assert.match(out, /\\newcommand\{\\lkAdvisor\}\{\}/);
  assert.match(out, /\\newcommand\{\\lkIfAdvisor\}\[2\]\{#2\}/);
});

test('campo so com espacos conta como vazio', () => {
  const out = renderMetadata({ metadata: { advisor: '   ' } }, template);
  assert.match(out, /\\newcommand\{\\lkIfAdvisor\}\[2\]\{#2\}/);
});

test('variavel declarada no template mas ausente do config vira macro vazia', () => {
  // Sem isso o documento quebraria com "Undefined control sequence".
  const out = renderMetadata({ metadata: {} }, template);
  for (const macro of ['lkTitle', 'lkAdvisor', 'lkAuthor']) {
    assert.match(out, new RegExp(`\\\\newcommand\\{\\\\${macro}\\}`));
  }
});

test('chave presente so no config tambem vira macro', () => {
  const out = renderMetadata({ metadata: { extra: 'valor' } }, template);
  assert.match(out, /\\newcommand\{\\lkExtra\}\{valor\}/);
});
