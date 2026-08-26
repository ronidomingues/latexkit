/**
 * Motor latexmk: o preferido quando disponivel.
 *
 * O latexmk decide sozinho quantas passadas sao necessarias e quando rodar
 * bibtex, biber e makeindex, o que evita reimplementar essa logica.
 */

import { run, which } from '../util/exec.js';

/** @type {import('./index.js').Engine} */
export const latexmk = {
  id: 'latexmk',
  label: 'latexmk (TeX Live/MiKTeX local)',

  async detect(context) {
    if (!(await which('latexmk'))) {
      return { available: false, reason: 'latexmk nao encontrado no PATH' };
    }
    if (!(await which(context.texEngine))) {
      return { available: false, reason: `${context.texEngine} nao encontrado no PATH` };
    }
    const backend = context.bibliography === 'biblatex' ? 'biber' : 'bibtex';
    if (!(await which(backend))) {
      return {
        available: false,
        reason: `${backend} nao encontrado, exigido por bibliography="${context.bibliography}"`,
      };
    }
    return { available: true };
  },

  async compile(context) {
    const engineFlag = { pdflatex: '-pdf', xelatex: '-pdfxe', lualatex: '-pdflua' }[
      context.texEngine
    ];

    const args = [
      engineFlag,
      `-outdir=${context.outDir}`,
      '-interaction=nonstopmode',
      '-file-line-error',
      '-halt-on-error',
    ];

    // O latexmk escolhe bibtex por padrao; biblatex/biber precisa ser pedido.
    if (context.bibliography === 'biblatex') args.push('-bibtex');

    if (context.watch) args.push('-pvc', '-view=none');

    args.push(context.entry);

    return run('latexmk', args, { cwd: context.root, onLine: context.onLine });
  },

  async clean(context) {
    // -C remove tambem o PDF; -c preservaria a saida final.
    return run('latexmk', ['-C', `-outdir=${context.outDir}`, context.entry], {
      cwd: context.root,
    });
  },
};
