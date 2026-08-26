/**
 * Motor docker: compila dentro de uma imagem com TeX Live completo.
 *
 * E o ultimo recurso da cadeia — a imagem passa de 2 GB e a primeira execucao
 * e lenta —, mas funciona em qualquer maquina sem nenhum LaTeX instalado, e e
 * o unico caminho totalmente reprodutivel entre maquinas diferentes.
 */

import { run, which } from '../util/exec.js';

/** Imagem oficial do TeX Live: traz abntex2, biber e latexmk. */
export const DEFAULT_IMAGE = 'texlive/texlive:latest';

/** @type {import('./index.js').Engine} */
export const docker = {
  id: 'docker',
  label: `docker (${DEFAULT_IMAGE})`,

  async detect() {
    if (!(await which('docker'))) {
      return { available: false, reason: 'docker nao encontrado no PATH' };
    }
    // Ter o cliente nao basta: sem daemon acessivel, `docker run` falharia
    // depois de ja termos anunciado o motor como disponivel.
    const { code } = await run('docker', ['info', '--format', '{{.ServerVersion}}']);
    if (code !== 0) {
      return { available: false, reason: 'o daemon do docker nao esta acessivel' };
    }
    return { available: true };
  },

  async compile(context) {
    const engineFlag = { pdflatex: '-pdf', xelatex: '-pdfxe', lualatex: '-pdflua' }[
      context.texEngine
    ];

    const inner = [
      'latexmk',
      engineFlag,
      `-outdir=${context.outDir}`,
      '-interaction=nonstopmode',
      '-file-line-error',
      '-halt-on-error',
    ];
    if (context.bibliography === 'biblatex') inner.push('-bibtex');
    inner.push(context.entry);

    return run('docker', [...dockerArgs(context), ...inner], {
      cwd: context.root,
      onLine: context.onLine,
    });
  },

  async clean(context) {
    return run(
      'docker',
      [...dockerArgs(context), 'latexmk', '-C', `-outdir=${context.outDir}`, context.entry],
      { cwd: context.root },
    );
  },
};

/**
 * Argumentos comuns do `docker run`.
 *
 * O container roda com o uid/gid do usuario para que os arquivos gerados em
 * out/ pertencam a quem chamou, e nao ao root.
 *
 * @param {import('./index.js').CompileContext} context
 * @returns {string[]}
 */
function dockerArgs(context) {
  const args = ['run', '--rm', '-v', `${context.root}:/doc`, '-w', '/doc'];
  if (process.platform !== 'win32' && typeof process.getuid === 'function') {
    args.push('-u', `${process.getuid()}:${process.getgid?.() ?? process.getuid()}`);
    // Sem HOME gravavel, o latexmk nao consegue escrever seu cache.
    args.push('-e', 'HOME=/tmp');
  }
  args.push(DEFAULT_IMAGE);
  return args;
}
