/**
 * Coleta dos metadados do documento.
 *
 * Valores vindos da linha de comando sempre vencem. O que faltar e perguntado,
 * desde que haja um terminal interativo; em CI ou com `--yes`, cai no padrao.
 */

import { createInterface } from 'node:readline/promises';
import { color, UserError } from '../util/log.js';

/**
 * @param {import('../templates.js').TemplateVar} variable
 * @returns {string}
 */
function defaultValue(variable) {
  if (variable.auto === 'year') return String(new Date().getFullYear());
  return variable.default ?? '';
}

/**
 * Resolve os valores das variaveis do template.
 *
 * @param {import('../templates.js').Template} template
 * @param {{ provided?: Record<string, string>, interactive?: boolean }} [options]
 * @returns {Promise<Record<string, string>>}
 */
export async function collectMetadata(template, options = {}) {
  const { provided = {}, interactive = true } = options;

  /** @type {Record<string, string>} */
  const values = {};
  /** @type {import('../templates.js').TemplateVar[]} */
  const toAsk = [];

  for (const variable of template.vars) {
    const given = provided[variable.key];
    if (given !== undefined && given !== '') {
      values[variable.key] = given;
    } else {
      values[variable.key] = defaultValue(variable);
      toAsk.push(variable);
    }
  }

  if (toAsk.length > 0 && interactive) {
    await ask(template, toAsk, values);
  }

  const missing = template.vars
    .filter((variable) => variable.required && !values[variable.key])
    .map((variable) => variable.key);

  if (missing.length > 0) {
    throw new UserError(`Campos obrigatorios nao informados: ${missing.join(', ')}.`, [
      `Informe-os por flag, por exemplo: --${missing[0]} "..."`,
      'Ou preencha-os depois em latexgen.config.json e rode: latexgen build',
    ]);
  }

  return values;
}

/**
 * @param {import('../templates.js').Template} template
 * @param {import('../templates.js').TemplateVar[]} variables
 * @param {Record<string, string>} values
 */
async function ask(template, variables, values) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log(`\n${color.bold(template.name)}`);
    console.log(color.dim('Enter aceita o valor entre colchetes. Campos com * sao obrigatorios.\n'));

    for (const variable of variables) {
      const fallback = values[variable.key];
      const mark = variable.required ? color.red('*') : ' ';
      const suffix = fallback ? color.dim(` [${fallback}]`) : '';

      for (;;) {
        const answer = (await rl.question(`${mark} ${variable.prompt}${suffix}: `)).trim();
        const value = answer || fallback;
        if (value || !variable.required) {
          values[variable.key] = value;
          break;
        }
        console.log(color.yellow('  Campo obrigatorio.'));
      }
    }
    console.log('');
  } finally {
    rl.close();
  }
}

/** Ha um terminal interativo em ambas as pontas? */
export function isInteractive() {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}
