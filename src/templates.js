import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { templatesDir } from './paths.js';
import { UserError } from './util/log.js';

/**
 * @typedef {object} TemplateVar
 * @property {string} key
 * @property {string} prompt
 * @property {boolean} [required]
 * @property {string} [default] valor padrao literal
 * @property {'year'} [auto] valor derivado do ambiente quando nao informado
 * @property {string} [example] valor de exemplo; `check` avisa se permanecer intacto
 *
 * @typedef {object} TemplateFeatures
 * @property {boolean} [bibliography]
 * @property {boolean} [markdown]
 * @property {boolean} [abstract]
 * @property {boolean} [figures]
 * @property {boolean} [index] o documento monta um indice remissivo (\index/\printindex)
 *
 * @typedef {object} Template
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {string} documentClass
 * @property {'pdflatex'|'xelatex'|'lualatex'} engine motor TeX exigido pelo template
 * @property {string} entry arquivo principal, normalmente main.tex
 * @property {TemplateVar[]} vars
 * @property {TemplateFeatures} features
 * @property {string[]} checks regras de lint aplicaveis
 * @property {string} dir caminho absoluto do template no disco
 */

/**
 * Lista os templates disponiveis, em ordem alfabetica de id.
 * Pastas iniciadas por `_` sao partials compartilhados, nao templates.
 *
 * @returns {Promise<Template[]>}
 */
export async function listTemplates() {
  const entries = await readdir(templatesDir, { withFileTypes: true });
  const ids = entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
    .map((entry) => entry.name)
    .sort();

  const templates = [];
  for (const id of ids) {
    try {
      templates.push(await loadTemplate(id));
    } catch {
      // pasta sem template.json valido nao aparece na listagem
    }
  }
  return templates;
}

/**
 * Carrega um template pelo id.
 *
 * @param {string} id
 * @returns {Promise<Template>}
 */
export async function loadTemplate(id) {
  const dir = join(templatesDir, id);
  let raw;
  try {
    raw = await readFile(join(dir, 'template.json'), 'utf8');
  } catch {
    const available = (await readdir(templatesDir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
      .map((entry) => entry.name)
      .sort();
    throw new UserError(`Template desconhecido: "${id}".`, [
      `Disponiveis: ${available.join(', ')}`,
      'Veja detalhes com: latexgen list',
    ]);
  }

  /** @type {Omit<Template, 'dir'>} */
  const manifest = JSON.parse(raw);
  return { ...manifest, dir };
}
