/**
 * Conferencia dos pacotes LaTeX exigidos, antes de chamar o compilador.
 *
 * Sem isso, faltar um pacote produz um erro do TeX no meio de centenas de
 * linhas de log — algo como "File `abnt.bbx' not found". Perguntar ao
 * kpsewhich primeiro custa milissegundos e permite dizer exatamente qual
 * pacote instalar.
 */

import { texFileExists, which } from './util/exec.js';
import { UserError } from './util/log.js';

/**
 * @typedef {object} Requirement
 * @property {string} file arquivo procurado pelo kpsewhich
 * @property {string} why para que ele serve
 * @property {string} debian pacote da distribuicao Debian/Ubuntu
 * @property {string} tlmgr nome no tlmgr, para as demais distribuicoes
 */

/** @type {Record<string, Requirement>} */
const BY_CLASS = {
  abntex2: {
    file: 'abntex2.cls',
    why: 'classe dos documentos ABNT',
    debian: 'texlive-humanities',
    tlmgr: 'abntex2',
  },
  beamer: {
    file: 'beamer.cls',
    why: 'classe das apresentacoes',
    debian: 'texlive-latex-recommended',
    tlmgr: 'beamer',
  },
};

/** @type {Record<import('./config.js').Bibliography, Requirement>} */
const BY_BIBLIOGRAPHY = {
  abntex2cite: {
    file: 'abntex2cite.sty',
    why: 'citacoes ABNT com BibTeX',
    debian: 'texlive-humanities',
    tlmgr: 'abntex2',
  },
  biblatex: {
    // O pacote se chama biblatex-abnt, mas os arquivos instalados sao
    // abnt.bbx e abnt.cbx; procurar por "biblatex-abnt.sty" nunca acha nada.
    file: 'abnt.bbx',
    why: 'estilo ABNT para biblatex',
    debian: 'texlive-bibtex-extra',
    tlmgr: 'biblatex-abnt',
  },
};

/**
 * Verifica os pacotes exigidos pela configuracao do projeto.
 *
 * A checagem so acontece quando o kpsewhich existe. No motor docker, o TeX
 * que importa e o do container, nao o da maquina — checar aqui daria um falso
 * negativo, entao ela e pulada.
 *
 * @param {import('./config.js').ProjectConfig} config
 * @param {import('./templates.js').Template} template
 * @param {{ skip?: boolean }} [options]
 * @returns {Promise<void>}
 */
export async function preflight(config, template, options = {}) {
  if (options.skip) return;
  if (!(await which('kpsewhich'))) return;

  /** @type {Requirement[]} */
  const required = [];
  const forClass = BY_CLASS[template.documentClass];
  if (forClass) required.push(forClass);
  if (template.features.bibliography) required.push(BY_BIBLIOGRAPHY[config.bibliography]);

  /** @type {Requirement[]} */
  const missing = [];
  for (const requirement of required) {
    if (!(await texFileExists(requirement.file))) missing.push(requirement);
  }

  if (missing.length === 0) return;

  const debian = [...new Set(missing.map((item) => item.debian))].join(' ');
  const tlmgr = [...new Set(missing.map((item) => item.tlmgr))].join(' ');

  throw new UserError(
    `Faltam ${missing.length} pacote(s) LaTeX exigido(s) por este documento.`,
    [
      ...missing.map((item) => `  ${item.file} — ${item.why}`),
      '',
      'Instale com:',
      `  Debian/Ubuntu:  sudo apt install ${debian}`,
      `  Outros:         tlmgr install ${tlmgr}`,
      '',
      'Ou compile em container, sem instalar nada: latexkit build --engine=docker',
    ],
  );
}
