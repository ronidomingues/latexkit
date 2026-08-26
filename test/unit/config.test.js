import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig } from '../../src/config.js';
import { UserError } from '../../src/util/log.js';

test('preenche os padroes a partir do minimo', () => {
  const config = normalizeConfig({ template: 'article' });
  assert.equal(config.entry, 'main.tex');
  assert.equal(config.texEngine, 'pdflatex');
  assert.equal(config.bibliography, 'abntex2cite');
  assert.equal(config.engine, 'auto');
  assert.equal(config.outDir, 'out');
  assert.deepEqual(config.metadata, {});
});

test('exige o campo template', () => {
  assert.throws(() => normalizeConfig({}), UserError);
  assert.throws(() => normalizeConfig({ template: '' }), UserError);
});

test('recusa valores fora do conjunto permitido', () => {
  assert.throws(() => normalizeConfig({ template: 'a', bibliography: 'apa' }), UserError);
  assert.throws(() => normalizeConfig({ template: 'a', engine: 'xelatexmk' }), UserError);
  assert.throws(() => normalizeConfig({ template: 'a', texEngine: 'ptex' }), UserError);
});

test('aceita "auto" como motor, alem dos motores reais', () => {
  assert.equal(normalizeConfig({ template: 'a', engine: 'auto' }).engine, 'auto');
  assert.equal(normalizeConfig({ template: 'a', engine: 'docker' }).engine, 'docker');
});

test('recusa raiz e metadata que nao sejam objetos', () => {
  assert.throws(() => normalizeConfig(null), UserError);
  assert.throws(() => normalizeConfig([]), UserError);
  assert.throws(() => normalizeConfig({ template: 'a', metadata: [] }), UserError);
});

test('converte valores de metadata para texto', () => {
  // Um ano digitado como numero no JSON nao pode virar "1970" nem quebrar o
  // escape, que espera string.
  const config = normalizeConfig({ template: 'a', metadata: { year: 2026, advisor: null } });
  assert.equal(config.metadata.year, '2026');
  assert.equal(config.metadata.advisor, '');
});
