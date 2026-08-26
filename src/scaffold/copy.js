/**
 * Copia de arquivos do template para o projeto do usuario.
 *
 * Regra geral: arquivos sao copiados literalmente. A unica excecao sao os
 * arquivos nao-LaTeX (package.json, README.md, workflow do CI), onde a
 * substituicao `{{chave}}` e segura porque chaves nao tem significado sintatico.
 */

import { mkdir, readdir, readFile, writeFile, copyFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { UserError } from '../util/log.js';

/** Extensoes que passam por substituicao `{{chave}}`. Nunca inclui `.tex`. */
const RENDERABLE = new Set(['.json', '.md', '.yml', '.yaml', '.txt']);

/**
 * Arquivos gravados com nome diferente do que tem no template.
 * `.gitignore` nao pode ser publicado no npm com esse nome (o npm o renomeia
 * para `.npmignore` ao empacotar), entao no template ele se chama `gitignore`.
 */
const RENAMES = new Map([['gitignore', '.gitignore']]);

/**
 * @typedef {object} CopyOptions
 * @property {Record<string, string>} [vars] valores para substituicao `{{chave}}`
 * @property {(relativePath: string) => boolean} [filter] false descarta o arquivo
 * @property {boolean} [overwrite] sobrescreve arquivos existentes (padrao: false)
 *
 * @typedef {object} CopyResult
 * @property {string[]} written caminhos relativos gravados
 * @property {string[]} skipped caminhos relativos preservados por ja existirem
 */

/**
 * Copia uma arvore de diretorios aplicando filtro, renomeacao e substituicao.
 *
 * Arquivos existentes no destino sao preservados por padrao: `init` roda em
 * diretorios que ja tem conteudo, e sobrescrever o texto de alguem em silencio
 * seria destrutivo.
 *
 * @param {string} from diretorio de origem
 * @param {string} to diretorio de destino
 * @param {CopyOptions} [options]
 * @returns {Promise<CopyResult>}
 */
export async function copyTree(from, to, options = {}) {
  const { vars = {}, filter, overwrite = false } = options;
  /** @type {CopyResult} */
  const result = { written: [], skipped: [] };

  for (const source of await walk(from)) {
    const rel = relative(from, source);
    const target = applyRenames(rel);

    if (filter && !filter(target)) continue;

    const destination = join(to, target);
    if (!overwrite && existsSync(destination)) {
      result.skipped.push(target);
      continue;
    }

    await mkdir(dirname(destination), { recursive: true });
    const extension = extensionOf(target);
    if (extension && RENDERABLE.has(extension)) {
      const raw = await readFile(source, 'utf8');
      await writeFile(destination, renderVars(raw, vars, { json: extension === '.json' }), 'utf8');
    } else {
      await copyFile(source, destination);
    }
    result.written.push(target);
  }

  return result;
}

/**
 * Lista recursivamente os arquivos de um diretorio, em ordem estavel.
 *
 * @param {string} dir
 * @returns {Promise<string[]>} caminhos absolutos
 */
export async function walk(dir) {
  /** @type {string[]} */
  const files = [];
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    files.push(join(entry.parentPath ?? entry.path, entry.name));
  }
  return files.sort();
}

/**
 * Substitui ocorrencias de `{{chave}}` pelos valores fornecidos.
 * Uma chave desconhecida e um erro: em silencio ela vazaria para o arquivo final.
 *
 * Em arquivos JSON os valores sao escapados para contexto de string, senao um
 * titulo com aspas ou barra invertida geraria um package.json invalido.
 *
 * @param {string} content
 * @param {Record<string, string>} vars
 * @param {{ json?: boolean }} [options]
 * @returns {string}
 */
export function renderVars(content, vars, options = {}) {
  return content.replace(/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g, (match, key) => {
    if (!(key in vars)) {
      throw new UserError(`Variavel de template desconhecida: ${match}`, [
        `Disponiveis: ${Object.keys(vars).sort().join(', ') || '(nenhuma)'}`,
      ]);
    }
    const value = vars[key];
    return options.json ? JSON.stringify(value).slice(1, -1) : value;
  });
}

/**
 * Aplica as renomeacoes de nome de arquivo (por exemplo `gitignore` -> `.gitignore`).
 *
 * @param {string} relativePath
 * @returns {string}
 */
function applyRenames(relativePath) {
  const parts = relativePath.split(sep);
  const name = parts.pop();
  if (name === undefined) return relativePath;
  return [...parts, RENAMES.get(name) ?? name].join(sep);
}

/**
 * Extensao do arquivo, incluindo o ponto. Null para nomes sem extensao ou
 * que comecam com ponto (`.gitkeep`).
 *
 * @param {string} relativePath
 * @returns {string | null}
 */
function extensionOf(relativePath) {
  const name = relativePath.split(sep).pop() ?? '';
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot) : null;
}

/**
 * Garante que o diretorio de destino pode receber um scaffold.
 *
 * @param {string} dir
 * @param {{ allowNonEmpty?: boolean }} [options]
 */
export async function assertUsableTarget(dir, options = {}) {
  if (!existsSync(dir)) return;

  const info = await stat(dir);
  if (!info.isDirectory()) {
    throw new UserError(`O caminho de destino existe e nao e um diretorio: ${dir}`);
  }

  if (options.allowNonEmpty) return;

  const entries = await readdir(dir);
  if (entries.length > 0) {
    throw new UserError(`O diretorio de destino nao esta vazio: ${dir}`, [
      'Use um caminho novo, ou entre nele e rode: latexgen init <template>',
    ]);
  }
}
