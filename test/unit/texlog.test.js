import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTexLog } from '../../src/texlog.js';

test('le o formato -file-line-error', () => {
  const errors = parseTexLog('./content/01-intro.tex:12: Undefined control sequence.');
  assert.equal(errors.length, 1);
  assert.equal(errors[0].file, './content/01-intro.tex');
  assert.equal(errors[0].line, 12);
  assert.equal(errors[0].message, 'Undefined control sequence.');
});

test('le o formato classico e recupera a linha da marca l.NNN', () => {
  const errors = parseTexLog(['! LaTeX Error: File `abnt.bbx\' not found.', '', 'l.42 \\usepackage'].join('\n'));
  assert.equal(errors.length, 1);
  assert.equal(errors[0].line, 42);
  assert.match(errors[0].message, /abnt\.bbx/);
});

test('descarta o encerramento "==> Fatal error", que so repete o erro anterior', () => {
  const errors = parseTexLog(['! Undefined control sequence.', '! ==> Fatal error occurred'].join('\n'));
  assert.equal(errors.length, 1);
});

test('nao repete o mesmo erro visto em varias passadas', () => {
  const line = './main.tex:3: Missing $ inserted.';
  assert.equal(parseTexLog([line, line, line].join('\n')).length, 1);
});

test('ignora as linhas comuns do log', () => {
  const log = [
    'This is pdfTeX, Version 3.141592653',
    'LaTeX Warning: Citation `x\' undefined.',
    'Output written on out/main.pdf (3 pages).',
  ].join('\n');
  assert.deepEqual(parseTexLog(log), []);
});

test('descarta o "==> Fatal error" tambem no formato com arquivo e linha', () => {
  const log = [
    './content/03-conclusao.tex:7: Undefined control sequence.',
    './content/03-conclusao.tex:7: ==> Fatal error occurred, no output PDF file produced!',
  ].join('\n');
  const errors = parseTexLog(log);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].message, 'Undefined control sequence.');
});
