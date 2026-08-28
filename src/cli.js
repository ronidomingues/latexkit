/**
 * Roteamento da linha de comando.
 *
 * As flags de metadado sao declaradas a partir dos templates, e nao fixadas
 * aqui: um template novo que declare `--coorientador` passa a aceita-lo sem
 * mudanca na CLI.
 */

import { parseArgs } from 'node:util';
import { listTemplates } from './templates.js';
import { color, error, info, UserError } from './util/log.js';

/** Flags comuns a todos os comandos. */
const BASE_OPTIONS = /** @type {const} */ ({
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'v' },
  engine: { type: 'string' },
  bib: { type: 'string' },
  yes: { type: 'boolean', short: 'y' },
  verbose: { type: 'boolean' },
  redetect: { type: 'boolean' },
  all: { type: 'boolean' },
  fix: { type: 'boolean' },
  force: { type: 'boolean' },
  'dry-run': { type: 'boolean' },
  'clean-pending': { type: 'boolean' },
});

/**
 * @param {string[]} argv argumentos ja sem `node` e sem o caminho do script
 * @param {{ version: string }} options
 */
export async function runCli(argv, options) {
  const metadataKeys = await metadataFlags();

  /** @type {Record<string, {type: 'string' | 'boolean', short?: string}>} */
  const config = { ...BASE_OPTIONS };
  for (const key of metadataKeys) config[key] = { type: 'string' };

  let parsed;
  try {
    parsed = parseArgs({ args: argv, options: config, allowPositionals: true, strict: true });
  } catch (cause) {
    throw new UserError(cause instanceof Error ? cause.message : String(cause), [
      'Veja as opcoes com: latexkit --help',
    ]);
  }

  const { values, positionals } = parsed;
  const [command, ...rest] = positionals;

  if (values.version) {
    info(options.version);
    return;
  }

  if (!command || values.help) {
    await printHelp(command);
    return;
  }

  /** @type {Record<string, string>} */
  const metadata = {};
  for (const key of metadataKeys) {
    const value = values[key];
    if (typeof value === 'string') metadata[key] = value;
  }

  const shared = {
    engine: /** @type {string | undefined} */ (values.engine),
    bib: /** @type {string | undefined} */ (values.bib),
    yes: Boolean(values.yes),
    verbose: Boolean(values.verbose),
    redetect: Boolean(values.redetect),
  };

  switch (command) {
    case 'new':
    case 'init': {
      const { create } = await import('./commands/create.js');
      const [template, dir] = rest;
      return create({ template, dir, metadata, ...shared }, { mode: command });
    }
    case 'build':
    case 'pdf': {
      const { build } = await import('./commands/build.js');
      return build(shared);
    }
    case 'watch': {
      const { watch } = await import('./commands/watch.js');
      return watch(shared);
    }
    case 'clean': {
      const { clean } = await import('./commands/clean.js');
      return clean({ all: Boolean(values.all) });
    }
    case 'check': {
      const { check } = await import('./commands/check.js');
      return check();
    }
    case 'upgrade': {
      const { upgrade, cleanPending } = await import('./commands/upgrade.js');
      if (values['clean-pending']) return cleanPending();
      return upgrade({ dryRun: Boolean(values['dry-run']), force: Boolean(values.force) });
    }
    case 'doctor': {
      const { doctor } = await import('./commands/doctor.js');
      return doctor();
    }
    case 'list':
    case 'templates': {
      const { list } = await import('./commands/list.js');
      return list();
    }
    case 'help':
      return printHelp(rest[0]);
    default:
      throw new UserError(`Comando desconhecido: "${command}".`, [
        'Comandos: new, init, build, watch, clean, check, upgrade, doctor, list',
        'Ajuda completa: latexkit --help',
      ]);
  }
}

/**
 * Uniao das variaveis declaradas por todos os templates.
 *
 * @returns {Promise<string[]>}
 */
async function metadataFlags() {
  const templates = await listTemplates();
  const keys = new Set(templates.flatMap((template) => template.vars.map((item) => item.key)));
  return [...keys].sort();
}

/**
 * @param {string} [topic]
 */
async function printHelp(topic) {
  const templates = await listTemplates();

  info(`
${color.bold('latexkit')} — projetos LaTeX academicos prontos para compilar

${color.bold('USO')}
  latexkit <comando> [opcoes]

${color.bold('COMANDOS')}
  ${color.cyan('new')} <template> [pasta]   cria um projeto novo
  ${color.cyan('init')} <template> [pasta]  monta a estrutura em um diretorio existente
  ${color.cyan('build')}                    compila e gera o PDF
  ${color.cyan('watch')}                    recompila a cada alteracao
  ${color.cyan('check')}                    confere metadados, figuras e citacoes
  ${color.cyan('clean')}                    remove os arquivos gerados
  ${color.cyan('upgrade')}                  traz melhorias do template sem tocar no seu texto
  ${color.cyan('doctor')}                   mostra o que esta instalado na maquina
  ${color.cyan('list')}                     lista os templates disponiveis

${color.bold('TEMPLATES')}
${templates.map((template) => `  ${color.cyan(template.id.padEnd(10))} ${template.name}`).join('\n')}

${color.bold('OPCOES')}
  --bib=<backend>     abntex2cite (padrao) ou biblatex
  --engine=<motor>    latexmk, manual, tectonic, docker; o padrao detecta
  --redetect          refaz a deteccao de motor, ignorando o cache
  --verbose           mostra a saida bruta do LaTeX
  -y, --yes           aceita os padroes sem perguntar
  --all               no clean, remove tambem o cache de deteccao
  --dry-run           no upgrade, mostra o que mudaria sem escrever nada
  --force             no upgrade, trata todo arquivo como editado (nada e sobrescrito)
  --clean-pending     no upgrade, apaga os arquivos .new de uma execucao anterior
  -h, --help          esta ajuda
  -v, --version       versao do latexkit

${color.bold('METADADOS')}
  Toda variavel de template vira uma flag. Por exemplo:
  ${color.dim('latexkit new article tese --title "Meu titulo" --author "Seu nome"')}

${color.bold('EXEMPLOS')}
  ${color.dim('npx latexkit new article meu-artigo')}
  ${color.dim('npx latexkit new beamer defesa --bib=biblatex')}
  ${color.dim('npm i -D latexkit && npx latexkit init article')}
  ${color.dim('npm run build')}
`);

  if (topic) info(color.dim(`  (ajuda por comando ainda nao detalhada para "${topic}")\n`));
}

/**
 * Imprime um erro no formato da CLI.
 *
 * @param {unknown} cause
 * @returns {number} codigo de saida
 */
export function reportError(cause) {
  if (cause instanceof UserError) {
    error(cause.message);
    for (const line of cause.hints) info(`  ${color.dim(line)}`);
    return 1;
  }
  error(cause instanceof Error ? (cause.stack ?? cause.message) : String(cause));
  return 1;
}
