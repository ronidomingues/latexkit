/**
 * Leitura do .log do LaTeX.
 *
 * O log traz centenas de linhas irrelevantes em volta de duas ou tres que
 * importam. Extrair so os erros e o que separa uma mensagem acionavel de um
 * despejo que o usuario nao vai ler.
 */

import { readFile } from 'node:fs/promises';

/** Quantos erros mostrar antes de resumir o restante. */
const MAX_ERRORS = 5;

/**
 * @typedef {object} TexError
 * @property {string} message texto do erro
 * @property {string} [file] arquivo, quando o log informa
 * @property {number} [line] linha, quando o log informa
 * @property {string} [context] o trecho que o TeX estava lendo
 */

/**
 * Extrai os erros de um log do LaTeX.
 *
 * Reconhece os dois formatos que o TeX produz: o de `-file-line-error`
 * (`arquivo:linha: mensagem`) e o classico, que comeca com `!` e traz a linha
 * em uma marca `l.NNN` logo abaixo.
 *
 * @param {string} log
 * @returns {TexError[]}
 */
export function parseTexLog(log) {
  /** @type {TexError[]} */
  const errors = [];
  const lines = log.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    const withPosition = /^(.+?):(\d+):\s*(.+)$/.exec(line);
    // "==> Fatal error occurred" e so o encerramento da compilacao: o erro de
    // verdade ja foi reportado logo acima, e repeti-lo empurraria para fora do
    // limite de exibicao o que o usuario precisa ler.
    if (
      withPosition &&
      !withPosition[3].startsWith('==>') &&
      !/^\s*[A-Za-z]+:\s*$/.test(withPosition[3])
    ) {
      errors.push({
        file: withPosition[1],
        line: Number(withPosition[2]),
        message: withPosition[3].trim(),
        context: findContext(lines, index),
      });
      continue;
    }

    if (line.startsWith('! ')) {
      const message = line.slice(2).trim();
      // "! ==> Fatal error occurred" e apenas o encerramento, ja precedido
      // pelo erro real; repeti-lo so ocuparia espaco.
      if (message.startsWith('==>')) continue;
      const marker = findLineMarker(lines, index);
      errors.push({ message, ...marker, context: findContext(lines, index) });
    }
  }

  return dedupe(errors);
}

/**
 * Resume a falha de uma compilacao em linhas prontas para exibir.
 *
 * @param {string} logFile caminho do .log
 * @param {import('./util/exec.js').RunResult} result
 * @returns {Promise<string[]>}
 */
export async function summarizeLog(logFile, result) {
  let errors = /** @type {TexError[]} */ ([]);
  try {
    errors = parseTexLog(await readFile(logFile, 'utf8'));
  } catch {
    // Sem log em disco resta a saida capturada do processo.
  }

  if (errors.length === 0) {
    errors = parseTexLog(`${result.stdout}\n${result.stderr}`);
  }

  if (errors.length === 0) {
    const tail = `${result.stderr}\n${result.stdout}`
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .slice(-8);
    return tail.length > 0 ? tail : [`O motor saiu com codigo ${result.code}.`];
  }

  /** @type {string[]} */
  const out = [];
  for (const error of errors.slice(0, MAX_ERRORS)) {
    const where = error.file
      ? `${error.file}${error.line ? `:${error.line}` : ''}: `
      : error.line
        ? `linha ${error.line}: `
        : '';
    out.push(`${where}${error.message}`);
    if (error.context) out.push(`    ${error.context}`);
  }

  if (errors.length > MAX_ERRORS) {
    out.push(`... e mais ${errors.length - MAX_ERRORS} erro(s).`);
  }
  return out;
}

/**
 * Procura a marca `l.NNN` que o TeX escreve abaixo do erro.
 *
 * @param {string[]} lines
 * @param {number} from
 * @returns {{ line?: number }}
 */
function findLineMarker(lines, from) {
  for (let index = from + 1; index < Math.min(from + 6, lines.length); index += 1) {
    const match = /^l\.(\d+)/.exec(lines[index]);
    if (match) return { line: Number(match[1]) };
  }
  return {};
}

/**
 * Recupera o trecho de origem que o TeX imprime junto do erro.
 *
 * @param {string[]} lines
 * @param {number} from
 * @returns {string | undefined}
 */
function findContext(lines, from) {
  for (let index = from + 1; index < Math.min(from + 6, lines.length); index += 1) {
    const match = /^l\.\d+\s*(.*)$/.exec(lines[index]);
    if (match && match[1].trim()) return match[1].trim();
  }
  return undefined;
}

/**
 * O TeX repete o mesmo erro em cada passada; mostrar so uma vez cada.
 *
 * @param {TexError[]} errors
 * @returns {TexError[]}
 */
function dedupe(errors) {
  /** @type {Map<string, TexError>} */
  const seen = new Map();
  for (const error of errors) {
    seen.set(`${error.file ?? ''}:${error.line ?? ''}:${error.message}`, error);
  }
  return [...seen.values()];
}
