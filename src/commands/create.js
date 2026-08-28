/**
 * Comandos `new` e `init`.
 *
 * Sao a mesma operacao com duas politicas de destino: `new` exige um diretorio
 * novo ou vazio, `init` aceita um diretorio ja em uso e preserva o que existe.
 */

import { basename, resolve } from 'node:path';
import { loadTemplate, listTemplates } from '../templates.js';
import { scaffoldProject } from '../scaffold/index.js';
import { collectMetadata, isInteractive } from '../scaffold/prompts.js';
import { BIBLIOGRAPHIES, ENGINES } from '../config.js';
import { color, hint, info, step, success, warn, UserError } from '../util/log.js';

/**
 * @typedef {object} CreateArgs
 * @property {string} [template] id do template
 * @property {string} [dir] diretorio de destino
 * @property {Record<string, string>} metadata valores vindos de flags
 * @property {string} [bib]
 * @property {string} [engine]
 * @property {boolean} [yes] nao perguntar nada
 */

/**
 * @param {CreateArgs} args
 * @param {{ mode: 'new' | 'init' }} options
 */
export async function create(args, options) {
  const { mode } = options;

  if (!args.template) {
    throw new UserError(`Informe o template: latexkit ${mode} <template>${mode === 'new' ? ' <pasta>' : ''}`, [
      `Disponiveis: ${(await listTemplates()).map((item) => item.id).join(', ')}`,
      'Detalhes de cada um: latexkit list',
    ]);
  }

  const template = await loadTemplate(args.template);

  const bibliography = pickOption(args.bib ?? 'abntex2cite', BIBLIOGRAPHIES, '--bib');
  const engine = args.engine
    ? pickOption(args.engine, [...ENGINES, 'auto'], '--engine')
    : 'auto';

  const targetDir = resolve(mode === 'new' ? (args.dir ?? args.template) : (args.dir ?? '.'));

  // Sem o nome do documento, o diretorio de destino e o palpite mais util.
  const provided = { ...args.metadata };
  if (mode === 'new' && !provided.title) provided.title = basename(targetDir);

  const metadata = await collectMetadata(template, {
    provided,
    interactive: !args.yes && isInteractive(),
  });

  const result = await scaffoldProject({
    template,
    targetDir,
    metadata,
    bibliography: /** @type {import('../config.js').Bibliography} */ (bibliography),
    engine: /** @type {import('../config.js').EngineId | 'auto'} */ (engine),
    allowNonEmpty: mode === 'init',
  });

  report(result, template, mode);
}

/**
 * @param {import('../scaffold/index.js').ScaffoldResult} result
 * @param {import('../templates.js').Template} template
 * @param {'new' | 'init'} mode
 */
function report(result, template, mode) {
  success(`${template.name} criado em ${color.bold(result.root)}`);
  info(`  ${result.written.length} arquivos gravados`);

  if (result.skipped.length > 0) {
    warn(`${result.skipped.length} arquivo(s) ja existiam e foram preservados:`);
    for (const path of result.skipped) hint(path);
  }

  if (result.merged.length > 0) {
    info(`  package.json atualizado: ${result.merged.join(', ')}`);
  }

  if (result.conflicts.length > 0) {
    warn('Estes campos do package.json ja existiam e foram mantidos como estavam:');
    for (const field of result.conflicts) hint(field);
    hint('Rode os comandos do latexkit direto, se precisar: npx latexkit build');
  }

  info('');
  step('Proximos passos:');
  if (mode === 'new') hint(`cd ${result.root}`);
  hint('npm install       # instala o latexkit no projeto');
  hint('npm run build     # gera out/main.pdf');
  info('');
  hint('Edite o texto em content/ e os metadados em latexkit.config.json.');
}

/**
 * @param {string} value
 * @param {readonly string[]} allowed
 * @param {string} flag
 * @returns {string}
 */
function pickOption(value, allowed, flag) {
  if (!allowed.includes(value)) {
    throw new UserError(`Valor invalido para ${flag}: "${value}".`, [
      `Aceitos: ${allowed.join(', ')}`,
    ]);
  }
  return value;
}
