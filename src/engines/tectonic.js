/**
 * Motor tectonic: binario unico que baixa os pacotes que faltam sob demanda.
 *
 * Instalacao trivial e resultado reprodutivel, mas o suporte a pacotes
 * brasileiros depende do que existe no bundle do tectonic. Por isso ele fica
 * abaixo do latexmk na ordem de preferencia: quando ha TeX Live local com
 * abntex2, ele e mais rapido e mais previsivel.
 */

import { run, which } from '../util/exec.js';

/** @type {import('./index.js').Engine} */
export const tectonic = {
  id: 'tectonic',
  label: 'tectonic (baixa pacotes sob demanda)',

  async detect(context) {
    if (!(await which('tectonic'))) {
      return { available: false, reason: 'tectonic nao encontrado no PATH' };
    }
    if (context.bibliography === 'biblatex') {
      return {
        available: false,
        reason: 'o tectonic nao roda biber; use bibliography="abntex2cite" ou outro motor',
      };
    }
    if (context.texEngine !== 'pdflatex') {
      return {
        available: false,
        reason: `o tectonic nao oferece ${context.texEngine}`,
      };
    }
    if (context.needsIndex) {
      // O tectonic nao chama processadores externos de indice, e tambem nao
      // enxerga um .ind produzido por fora: o documento sairia com o indice
      // remissivo vazio, sem erro nenhum. Melhor ficar de fora da escolha.
      return {
        available: false,
        reason: 'o tectonic nao monta indice remissivo, exigido por este documento',
      };
    }
    return { available: true };
  },

  async compile(context) {
    const args = [
      '-X',
      'compile',
      '--keep-intermediates',
      '--keep-logs',
      '--outdir',
      context.outDir,
      context.entry,
    ];
    return run('tectonic', args, { cwd: context.root, onLine: context.onLine });
  },
};
