/**
 * Conversao opcional de Markdown para LaTeX, via Pandoc.
 *
 * Markdown e opt-in: um projeto so de `.tex` nunca depende do Pandoc. Quando
 * existem `.md` em content/, cada um vira um `.generated.tex` ao lado, que o
 * main.tex inclui como qualquer outro arquivo. Manter o alvo com sufixo
 * proprio deixa claro o que e gerado e permite ignora-lo no git.
 */

import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { run, which } from './util/exec.js';
import { UserError } from './util/log.js';

/** Sufixo dos arquivos gerados a partir de Markdown. */
export const GENERATED_SUFFIX = '.generated.tex';

/** Diretorio varrido em busca de Markdown. */
export const CONTENT_DIR = 'content';

/**
 * Lista os arquivos Markdown do projeto, em caminhos relativos a raiz.
 *
 * @param {string} root
 * @returns {Promise<string[]>}
 */
export async function findMarkdown(root) {
  const dir = join(root, CONTENT_DIR);
  try {
    if (!(await stat(dir)).isDirectory()) return [];
  } catch {
    return [];
  }

  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile() && extname(entry.name).toLowerCase() === '.md')
    .map((entry) => relative(root, join(entry.parentPath ?? entry.path, entry.name)))
    .sort();
}

/**
 * Converte todo o Markdown do projeto para LaTeX.
 *
 * @param {string} root
 * @param {{ onLine?: (line: string) => void }} [options]
 * @returns {Promise<string[]>} caminhos relativos dos arquivos gerados
 */
export async function convertMarkdown(root, options = {}) {
  const sources = await findMarkdown(root);
  if (sources.length === 0) return [];

  if (!(await which('pandoc'))) {
    throw new UserError(
      `Ha ${sources.length} arquivo(s) Markdown em ${CONTENT_DIR}/, mas o Pandoc nao esta instalado.`,
      [
        ...sources.map((source) => `  ${source}`),
        '',
        'Instale o Pandoc para converte-los:',
        '  Debian/Ubuntu:  sudo apt install pandoc',
        '  Fedora:         sudo dnf install pandoc',
        '  macOS:          brew install pandoc',
        '  Windows:        winget install --id JohnMacFarlane.Pandoc',
        '',
        'Ou converta o conteudo para .tex e remova os .md.',
      ],
    );
  }

  /** @type {string[]} */
  const generated = [];
  for (const source of sources) {
    const target = source.replace(/\.md$/i, GENERATED_SUFFIX);
    const args = [
      '--from=markdown',
      '--to=latex',
      // Cabecalhos de nivel 1 viram \section: o main.tex ja define a classe e
      // o nivel do documento, entao o Pandoc nao deve criar capitulos.
      '--top-level-division=section',
      '--wrap=preserve',
      '--output',
      target,
      source,
    ];

    const result = await run('pandoc', args, { cwd: root, onLine: options.onLine });
    if (result.code !== 0) {
      throw new UserError(`O Pandoc falhou ao converter ${source}.`, [
        result.stderr.trim() || `codigo de saida ${result.code}`,
      ]);
    }

    await prependNotice(join(root, target), source);
    generated.push(target);
  }

  return generated;
}

/**
 * Marca o arquivo gerado, para que ninguem o edite por engano.
 *
 * @param {string} file caminho absoluto
 * @param {string} source caminho relativo do Markdown de origem
 */
async function prependNotice(file, source) {
  const body = await readFile(file, 'utf8');
  const notice = `% GERADO por latexgen a partir de ${source}. Nao edite: edite o .md.\n`;
  await writeFile(file, notice + body, 'utf8');
}
