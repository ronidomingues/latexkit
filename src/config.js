import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { CONFIG_FILE } from './paths.js';
import { UserError } from './util/log.js';

/** Backends de bibliografia suportados. */
export const BIBLIOGRAPHIES = /** @type {const} */ (['abntex2cite', 'biblatex']);

/** Motores de compilacao, do mais rapido/leve ao mais pesado. */
export const ENGINES = /** @type {const} */ (['latexmk', 'manual', 'tectonic', 'docker']);

/**
 * @typedef {(typeof BIBLIOGRAPHIES)[number]} Bibliography
 * @typedef {(typeof ENGINES)[number]} EngineId
 *
 * @typedef {object} ProjectConfig
 * @property {string} template id do template usado no scaffold
 * @property {string} entry arquivo principal (main.tex)
 * @property {'pdflatex'|'xelatex'|'lualatex'} texEngine motor TeX exigido pelo documento
 * @property {Bibliography} bibliography
 * @property {EngineId | 'auto'} engine estrategia de compilacao; 'auto' usa a cadeia de fallback
 * @property {string} outDir diretorio de saida do PDF e auxiliares
 * @property {Record<string, string>} metadata valores das variaveis do template
 * @property {string} latexkitVersion versao que gerou o projeto
 */

/**
 * Sobe a arvore de diretorios procurando o latexkit.config.json.
 *
 * @param {string} [from] diretorio inicial; por padrao o cwd
 * @returns {string | null} caminho absoluto do arquivo, ou null
 */
export function findConfigFile(from = process.cwd()) {
  let dir = resolve(from);
  for (;;) {
    const candidate = join(dir, CONFIG_FILE);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Carrega a configuracao do projeto e devolve tambem sua raiz.
 *
 * @param {string} [from]
 * @returns {Promise<{ config: ProjectConfig, root: string, file: string }>}
 */
export async function loadConfig(from = process.cwd()) {
  const file = findConfigFile(from);
  if (!file) {
    throw new UserError(`Nenhum ${CONFIG_FILE} encontrado a partir de ${resolve(from)}.`, [
      'Este comando precisa ser executado dentro de um projeto latexkit.',
      'Para criar um projeto novo:      latexkit new article meu-artigo',
      'Para inicializar o diretorio atual: latexkit init article',
    ]);
  }

  let parsed;
  try {
    parsed = JSON.parse(await readFile(file, 'utf8'));
  } catch (cause) {
    throw new UserError(`${CONFIG_FILE} contem JSON invalido: ${file}`, [
      cause instanceof Error ? cause.message : String(cause),
    ]);
  }

  return { config: normalizeConfig(parsed, file), root: dirname(file), file };
}

/**
 * Valida e completa a configuracao com os padroes.
 *
 * @param {unknown} raw
 * @param {string} [source] caminho usado nas mensagens de erro
 * @returns {ProjectConfig}
 */
export function normalizeConfig(raw, source = CONFIG_FILE) {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new UserError(`${source} deve conter um objeto JSON.`);
  }
  const input = /** @type {Record<string, unknown>} */ (raw);

  const template = input.template;
  if (typeof template !== 'string' || !template) {
    throw new UserError(`${source}: campo "template" ausente ou invalido.`);
  }

  const bibliography = input.bibliography ?? 'abntex2cite';
  if (!isOneOf(bibliography, BIBLIOGRAPHIES)) {
    throw new UserError(
      `${source}: "bibliography" deve ser ${BIBLIOGRAPHIES.join(' ou ')}, e nao ${JSON.stringify(bibliography)}.`,
    );
  }

  const engine = input.engine ?? 'auto';
  if (engine !== 'auto' && !isOneOf(engine, ENGINES)) {
    throw new UserError(
      `${source}: "engine" deve ser "auto" ou um de ${ENGINES.join(', ')}, e nao ${JSON.stringify(engine)}.`,
    );
  }

  const texEngine = input.texEngine ?? 'pdflatex';
  if (!isOneOf(texEngine, /** @type {const} */ (['pdflatex', 'xelatex', 'lualatex']))) {
    throw new UserError(
      `${source}: "texEngine" deve ser pdflatex, xelatex ou lualatex, e nao ${JSON.stringify(texEngine)}.`,
    );
  }

  const metadata = input.metadata ?? {};
  if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) {
    throw new UserError(`${source}: "metadata" deve ser um objeto.`);
  }

  /** @type {Record<string, string>} */
  const cleanMetadata = {};
  for (const [key, value] of Object.entries(metadata)) {
    cleanMetadata[key] = value == null ? '' : String(value);
  }

  return {
    template,
    entry: typeof input.entry === 'string' && input.entry ? input.entry : 'main.tex',
    texEngine,
    bibliography,
    engine,
    outDir: typeof input.outDir === 'string' && input.outDir ? input.outDir : 'out',
    metadata: cleanMetadata,
    latexkitVersion: typeof input.latexkitVersion === 'string' ? input.latexkitVersion : '0.0.0',
  };
}

/**
 * @param {string} root
 * @param {ProjectConfig} config
 */
export async function writeConfig(root, config) {
  await writeFile(join(root, CONFIG_FILE), `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

/**
 * @template {readonly string[]} T
 * @param {unknown} value
 * @param {T} allowed
 * @returns {value is T[number]}
 */
function isOneOf(value, allowed) {
  return typeof value === 'string' && allowed.includes(value);
}
