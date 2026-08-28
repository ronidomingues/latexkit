import * as nodeUtil from 'node:util';

/**
 * `util.styleText` so existe a partir do Node 20.12. Importa-lo por nome
 * quebraria a CLI inteira no Node 20.10 e 20.11 — com um SyntaxError de
 * modulo, antes mesmo de qualquer comando rodar. Cor e cosmetica: onde a
 * funcao nao existe, o texto sai sem enfeite.
 *
 * @type {((format: string, text: string) => string) | undefined}
 */
const styleText = /** @type {any} */ (nodeUtil).styleText;

/** Cores sao desligadas sem TTY, com NO_COLOR, ou sem suporte no runtime. */
const enabled = Boolean(styleText) && process.stdout.isTTY === true && !process.env.NO_COLOR;

/**
 * @param {string} format
 * @param {string} text
 */
function paint(format, text) {
  return enabled && styleText ? styleText(format, text) : text;
}

export const color = {
  /** @param {string} s */ bold: (s) => paint('bold', s),
  /** @param {string} s */ dim: (s) => paint('dim', s),
  /** @param {string} s */ red: (s) => paint('red', s),
  /** @param {string} s */ green: (s) => paint('green', s),
  /** @param {string} s */ yellow: (s) => paint('yellow', s),
  /** @param {string} s */ blue: (s) => paint('blue', s),
  /** @param {string} s */ cyan: (s) => paint('cyan', s),
};

/** @param {string} msg */
export function info(msg) {
  console.log(msg);
}

/** @param {string} msg */
export function step(msg) {
  console.log(`${color.blue('›')} ${msg}`);
}

/** @param {string} msg */
export function success(msg) {
  console.log(`${color.green('✔')} ${msg}`);
}

/** @param {string} msg */
export function warn(msg) {
  console.warn(`${color.yellow('⚠')} ${msg}`);
}

/** @param {string} msg */
export function error(msg) {
  console.error(`${color.red('✖')} ${msg}`);
}

/** @param {string} msg */
export function hint(msg) {
  console.log(`  ${color.dim(msg)}`);
}

/** Erro esperado: a CLI imprime apenas a mensagem, sem stack trace. */
export class UserError extends Error {
  /**
   * @param {string} message
   * @param {string[]} [hints] linhas de orientacao mostradas abaixo da mensagem
   */
  constructor(message, hints = []) {
    super(message);
    this.name = 'UserError';
    this.hints = hints;
  }
}
