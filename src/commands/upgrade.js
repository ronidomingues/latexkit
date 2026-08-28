/**
 * Comando `upgrade`: traz as melhorias do template para um projeto existente,
 * sem tocar no que voce escreveu.
 *
 * A decisao central e por arquivo, e se apoia no manifesto gravado no
 * scaffold: se o arquivo em disco ainda tem o hash com que foi entregue,
 * ninguem mexeu nele e a nova versao pode entrar; se o hash mudou, a pessoa
 * editou, e o arquivo e preservado — a versao nova fica ao lado, com sufixo
 * `.new`, para ser comparada com calma.
 *
 * Duas regras que o comando nunca quebra:
 *
 *   - nada e apagado, nunca. Arquivos que o template deixou de trazer
 *     continuam onde estao.
 *   - nada fora do template e tocado. `content/`, `bib/` e `figures/` sao
 *     seus; o upgrade so conhece os caminhos que ele mesmo entregou.
 */

import { mkdir, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { loadConfig, writeConfig } from '../config.js';
import { loadTemplate } from '../templates.js';
import { planFiles, renderVars, walk } from '../scaffold/copy.js';
import { hashContent, hashFile, readManifest, writeManifest } from '../scaffold/manifest.js';
import { mergePackageJson } from '../scaffold/packagejson.js';
import { writeMetadata } from '../scaffold/metadata.js';
import { documentTitle, readPackageVersion, toPackageName } from '../scaffold/index.js';
import { sharedDir } from '../paths.js';
import { color, hint, info, step, success, warn, UserError } from '../util/log.js';

/** Sufixo dos arquivos deixados para comparacao manual. */
const PENDING_SUFFIX = '.new';

/** Arquivos do template que nao vao para o projeto. */
const TEMPLATE_INTERNALS = new Set(['template.json']);

/** Extensoes que passam por substituicao `{{chave}}`; nunca inclui `.tex`. */
const RENDERABLE = new Set(['.json', '.md', '.yml', '.yaml', '.txt']);

/**
 * Diretorios onde mora o que voce escreve.
 *
 * Um arquivo editado aqui e o seu texto: a versao nova do template e apenas o
 * conteudo-exemplo, e deixar um `.new` ao lado da sua introducao so produziria
 * ruido. Nos demais caminhos — o encanamento do template — a versao nova pode
 * trazer correcoes que valem a pena, e ai o `.new` e util.
 */
const CONTENT_DIRS = ['content', 'bib', 'figures', 'tables', 'pretextual', 'postextual', 'frontmatter', 'backmatter'];

/** Onde procurar arquivos .new pendentes, alem da raiz. */
const PENDING_DIRS = ['config', 'content', 'pretextual', 'postextual', 'frontmatter', 'backmatter', '.github'];

/**
 * @typedef {'atualizado' | 'criado' | 'preservado' | 'seu' | 'igual'} Outcome
 *
 * @typedef {object} FileResult
 * @property {string} target caminho relativo no projeto
 * @property {Outcome} outcome
 */

/**
 * @param {{ dryRun?: boolean, force?: boolean }} [args]
 */
export async function upgrade(args = {}) {
  const { config, root } = await loadConfig();
  const template = await loadTemplate(config.template);
  const manifest = await readManifest(root);
  const version = await readPackageVersion();

  if (!manifest && !args.force) {
    throw new UserError('Este projeto nao tem manifesto: nao da para saber o que voce editou.', [
      'O manifesto (.latexgen/manifest.json) passou a ser gravado em versoes mais',
      'novas do latexgen. Sem ele, o upgrade nao consegue distinguir o encanamento',
      'do template do texto que voce escreveu.',
      '',
      'Com --force, todo arquivo do template e tratado como editado: nada e',
      'sobrescrito e as versoes novas ficam ao lado, com sufixo .new, para voce',
      'comparar uma a uma.',
      '',
      '  latexgen upgrade --force',
    ]);
  }

  if (manifest && manifest.version === version && !args.force) {
    success(`O projeto ja esta na versao ${version} do latexgen.`);
    info(color.dim('  Use --force para reescrever mesmo assim.'));
    return;
  }

  /** @type {Record<string, string>} */
  const vars = {
    ...config.metadata,
    projectName: toPackageName(basename(root)),
    templateId: template.id,
    templateName: template.name,
    latexgenVersion: version,
    documentTitle: documentTitle(config.metadata, template, basename(root)),
  };

  const sources = [
    ...(await planFiles(template.dir, { filter: (path) => !TEMPLATE_INTERNALS.has(path) })),
    ...(await planFiles(join(sharedDir, 'project'))),
  ];

  if (template.features.bibliography) {
    sources.push({
      source: join(sharedDir, 'bib', `${config.bibliography}.tex`),
      target: join('config', 'bibliography.tex'),
    });
  }

  /** @type {FileResult[]} */
  const results = [];
  /** @type {Record<string, string>} */
  const hashes = { ...manifest?.files };

  for (const { source, target } of sources) {
    // O package.json e mesclado campo a campo mais adiante: sobrescreve-lo
    // apagaria os scripts e dependencias que a pessoa acrescentou.
    if (target === 'package.json') continue;

    const result = await applyFile({ root, source, target, vars, manifest, hashes, args });
    results.push(result);
  }

  // Metadados sao sempre regerados a partir do config: nao ha o que comparar.
  if (!args.dryRun) {
    await writeMetadata(root, config, template);
  }

  const merged = args.dryRun ? { added: [], kept: [] } : await mergePackageJson(root, version);

  if (!args.dryRun) {
    await writeConfig(root, { ...config, latexgenVersion: version });
    await writeManifest(root, { template: template.id, version, files: hashes });
  }

  report(results, merged, manifest, version, args);
}

/**
 * Decide e aplica o destino de um arquivo.
 *
 * @param {object} params
 * @param {string} params.root
 * @param {string} params.source
 * @param {string} params.target
 * @param {Record<string, string>} params.vars
 * @param {import('../scaffold/manifest.js').Manifest | null} params.manifest
 * @param {Record<string, string>} params.hashes acumulador do novo manifesto
 * @param {{ dryRun?: boolean, force?: boolean }} params.args
 * @returns {Promise<FileResult>}
 */
async function applyFile({ root, source, target, vars, manifest, hashes, args }) {
  const destination = join(root, target);
  const incoming = await render(source, target, vars);
  const incomingHash = hashContent(incoming);

  // Arquivo novo, trazido por uma versao mais recente do template.
  if (!existsSync(destination)) {
    if (!args.dryRun) await write(destination, incoming);
    hashes[target] = incomingHash;
    return { target, outcome: 'criado' };
  }

  const currentHash = await hashFile(destination);

  // Ja e exatamente o que seria escrito: nao ha o que fazer.
  if (currentHash === incomingHash) {
    hashes[target] = incomingHash;
    return { target, outcome: 'igual' };
  }

  const recorded = manifest?.files[target];
  const untouched = recorded !== undefined && recorded === currentHash;

  if (untouched && !args.force) {
    if (!args.dryRun) await write(destination, incoming);
    hashes[target] = incomingHash;
    return { target, outcome: 'atualizado' };
  }

  // Editado (ou sem registro que prove o contrario). O arquivo fica como esta.
  if (currentHash) hashes[target] = currentHash;

  // Se e conteudo seu, para por aqui: nao ha nada de util para comparar.
  if (isContent(target)) return { target, outcome: 'seu' };

  // Encanamento do template: a versao nova espera ao lado para comparacao.
  if (!args.dryRun) {
    await write(`${destination}${PENDING_SUFFIX}`, incoming);
  }
  return { target, outcome: 'preservado' };
}

/**
 * O caminho esta em um diretorio de conteudo do usuario?
 *
 * @param {string} target caminho relativo a raiz do projeto
 * @returns {boolean}
 */
function isContent(target) {
  const [first] = target.split(/[\\/]/);
  return CONTENT_DIRS.includes(first);
}

/**
 * @param {string} source
 * @param {string} target
 * @param {Record<string, string>} vars
 * @returns {Promise<string>}
 */
async function render(source, target, vars) {
  const name = target.split(/[\\/]/).pop() ?? '';
  const dot = name.lastIndexOf('.');
  const extension = dot > 0 ? name.slice(dot) : null;

  const raw = await readFile(source, 'utf8');
  if (extension && RENDERABLE.has(extension)) {
    return renderVars(raw, vars, { json: extension === '.json' });
  }
  return raw;
}

/**
 * @param {string} file
 * @param {string} content
 */
async function write(file, content) {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, content, 'utf8');
}

/**
 * @param {FileResult[]} results
 * @param {{ added: string[], kept: string[] }} merged
 * @param {import('../scaffold/manifest.js').Manifest | null} manifest
 * @param {string} version
 * @param {{ dryRun?: boolean, force?: boolean }} args
 */
function report(results, merged, manifest, version, args) {
  /** @param {Outcome} outcome */
  const by = (outcome) => results.filter((item) => item.outcome === outcome);
  const updated = by('atualizado');
  const created = by('criado');
  const preserved = by('preservado');
  const yours = by('seu');

  if (args.dryRun) {
    step(color.bold('Simulacao: nada foi escrito.'));
    info('');
  }

  const from = manifest ? manifest.version : 'desconhecida';
  step(`Template ${color.bold(manifest?.template ?? '')}: ${from} -> ${version}`);
  info('');

  if (created.length > 0) {
    success(`${created.length} arquivo(s) novo(s) do template:`);
    for (const item of created) hint(item.target);
    info('');
  }

  if (updated.length > 0) {
    success(`${updated.length} arquivo(s) atualizado(s) (estavam intocados):`);
    for (const item of updated) hint(item.target);
    info('');
  }

  if (preserved.length > 0) {
    warn(`${preserved.length} arquivo(s) que voce editou foram preservados.`);
    info(color.dim('  A versao nova esta ao lado, com sufixo .new:'));
    for (const item of preserved) hint(`${item.target}${PENDING_SUFFIX}`);
    info('');
    hint('Compare e traga o que interessar, por exemplo:');
    hint(`  diff ${preserved[0].target} ${preserved[0].target}${PENDING_SUFFIX}`);
    hint('Depois apague os .new: latexgen upgrade --clean-pending');
    info('');
  }

  if (yours.length > 0) {
    info(`${yours.length} arquivo(s) de conteudo seu mantidos intactos.`);
    info(color.dim('  (content/, bib/, figures/ e afins: nada a comparar com o exemplo do template)'));
    info('');
  }

  if (merged.added.length > 0) {
    info(`package.json atualizado: ${merged.added.join(', ')}`);
  }

  if (updated.length === 0 && created.length === 0 && preserved.length === 0) {
    success('Nada a fazer: o projeto ja esta igual ao template.');
    return;
  }

  if (!args.dryRun) {
    hint('Compile para conferir: npm run build');
  }
}

/**
 * Remove os arquivos `.new` deixados por um upgrade anterior.
 *
 * @returns {Promise<void>}
 */
export async function cleanPending() {
  const { root } = await loadConfig();

  // Varre so o que o upgrade poderia ter escrito. Percorrer a raiz inteira
  // entraria em out/ e node_modules/, que nao interessam e sao grandes.
  /** @type {string[]} */
  const files = [];
  for (const dir of PENDING_DIRS) {
    const full = join(root, dir);
    if (!existsSync(full)) continue;
    files.push(...(await walk(full)).filter((file) => file.endsWith(PENDING_SUFFIX)));
  }
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(PENDING_SUFFIX)) files.push(join(root, entry.name));
  }
  if (files.length === 0) {
    info('Nenhum arquivo .new pendente.');
    return;
  }

  for (const file of files) await rm(file, { force: true });
  success(`${files.length} arquivo(s) .new removido(s).`);
}
