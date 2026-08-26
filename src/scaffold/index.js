/**
 * Montagem de um projeto a partir de um template.
 *
 * A ordem importa: os arquivos do template vem primeiro, depois os arquivos
 * comuns a todos os projetos, e por ultimo o que e gerado (bibliografia
 * escolhida, latexgen.config.json e config/metadata.tex).
 */

import { mkdir, copyFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { sharedDir, packageRoot } from '../paths.js';
import { assertUsableTarget, copyTree } from './copy.js';
import { writeMetadata } from './metadata.js';
import { writeConfig } from '../config.js';
import { mergePackageJson } from './packagejson.js';
import { UserError } from '../util/log.js';

/** Arquivos do template que nao vao para o projeto do usuario. */
const TEMPLATE_INTERNALS = new Set(['template.json']);

/**
 * @typedef {object} ScaffoldOptions
 * @property {import('../templates.js').Template} template
 * @property {string} targetDir diretorio de destino (sera criado se preciso)
 * @property {Record<string, string>} metadata
 * @property {import('../config.js').Bibliography} bibliography
 * @property {import('../config.js').EngineId | 'auto'} [engine]
 * @property {boolean} [allowNonEmpty] permite escrever em diretorio ja usado (init)
 *
 * @typedef {object} ScaffoldResult
 * @property {string} root caminho absoluto do projeto
 * @property {import('../config.js').ProjectConfig} config
 * @property {string[]} written caminhos relativos criados
 * @property {string[]} skipped caminhos relativos preservados por ja existirem
 * @property {string[]} merged campos acrescentados a um package.json existente
 * @property {string[]} conflicts campos do package.json mantidos como estavam
 */

/**
 * @param {ScaffoldOptions} options
 * @returns {Promise<ScaffoldResult>}
 */
export async function scaffoldProject(options) {
  const {
    template,
    targetDir,
    metadata,
    bibliography,
    engine = 'auto',
    allowNonEmpty = false,
  } = options;

  const root = resolve(targetDir);
  await assertUsableTarget(root, { allowNonEmpty });
  await mkdir(root, { recursive: true });

  const version = await readPackageVersion();

  /** @type {Record<string, string>} */
  const vars = {
    ...metadata,
    projectName: toPackageName(basename(root)),
    templateId: template.id,
    templateName: template.name,
    latexgenVersion: version,
  };

  const fromTemplate = await copyTree(template.dir, root, {
    vars,
    filter: (path) => !TEMPLATE_INTERNALS.has(path),
  });

  const fromShared = await copyTree(join(sharedDir, 'project'), root, { vars });

  // Se o package.json ja existia, o copyTree o preservou — e o projeto ficaria
  // sem `npm run build`. Mesclar acrescenta so o que falta.
  const packageJson = fromShared.skipped.includes('package.json')
    ? await mergePackageJson(root, version)
    : { added: [], kept: [] };

  // A variante de bibliografia e um arquivo unico com nome fixo, para que o
  // main.tex nao precise saber qual backend esta em uso.
  const bibTarget = join(root, 'config', 'bibliography.tex');
  await mkdir(dirname(bibTarget), { recursive: true });
  await copyFile(join(sharedDir, 'bib', `${bibliography}.tex`), bibTarget);

  /** @type {import('../config.js').ProjectConfig} */
  const config = {
    template: template.id,
    entry: template.entry,
    texEngine: template.engine,
    bibliography,
    engine,
    outDir: 'out',
    metadata,
    latexgenVersion: version,
  };

  await writeConfig(root, config);
  await writeMetadata(root, config, template);

  return {
    root,
    config,
    written: [
      ...fromTemplate.written,
      ...fromShared.written,
      'config/bibliography.tex',
      'latexgen.config.json',
      'config/metadata.tex',
    ].sort(),
    skipped: [...fromTemplate.skipped, ...fromShared.skipped].sort(),
    merged: packageJson.added,
    conflicts: packageJson.kept,
  };
}

/**
 * Converte um nome de diretorio em um nome valido de pacote npm.
 * Diretorios como "Meu Artigo (2026)" viram "meu-artigo-2026".
 *
 * @param {string} name
 * @returns {string}
 */
export function toPackageName(name) {
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[-._]+|[-._]+$/g, '')
    .slice(0, 214);
  return slug || 'documento-latex';
}

/** Versao do proprio latexgen, usada no devDependencies do projeto gerado. */
async function readPackageVersion() {
  try {
    const raw = await readFile(join(packageRoot, 'package.json'), 'utf8');
    return JSON.parse(raw).version ?? '0.0.0';
  } catch {
    throw new UserError('Nao foi possivel ler a versao do latexgen (package.json ausente).');
  }
}
