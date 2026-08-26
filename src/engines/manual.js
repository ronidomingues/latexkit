/**
 * Motor manual: pdflatex/bibtex/pdflatex/pdflatex na mao.
 *
 * Usado quando ha um TeX instalado mas nao ha latexmk. Reimplementa o minimo
 * necessario: uma passada inicial, o backend de bibliografia, e passadas
 * extras enquanto o proprio LaTeX pedir ("Rerun to get ...").
 */

import { readFile } from 'node:fs/promises';
import { delimiter, join } from 'node:path';
import { run, which } from '../util/exec.js';

/** Teto de passadas extras. Documentos reais convergem em duas ou tres. */
const MAX_RERUNS = 4;

/** @type {import('./index.js').Engine} */
export const manual = {
  id: 'manual',
  label: 'pdflatex/bibtex direto (sem latexmk)',

  async detect(context) {
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
    const { root, entry, outDir, texEngine, bibliography, onLine } = context;
    const jobname = entry.replace(/\.tex$/i, '');
    const texArgs = [
      '-interaction=nonstopmode',
      '-file-line-error',
      `-output-directory=${outDir}`,
      entry,
    ];

    let last = await run(texEngine, texArgs, { cwd: root, onLine });
    if (last.code !== 0) return last;

    // O backend roda dentro do diretorio de saida, onde estao o .aux e o .bcf.
    // Mas o \bibdata gravado no .aux e relativo a raiz do projeto
    // ("bib/references"), entao a raiz precisa entrar no caminho de busca do
    // kpathsea; sem isso o bibtex nao acha o .bib e as referencias saem vazias.
    // O delimitador final preserva os diretorios padrao da distribuicao.
    const backend = bibliography === 'biblatex' ? 'biber' : 'bibtex';
    const searchPath = [root, join(root, 'bib'), ''].join(delimiter);
    const bibResult = await run(backend, [jobname], {
      cwd: join(root, outDir),
      env: { ...process.env, BIBINPUTS: searchPath, BSTINPUTS: searchPath },
      onLine,
    });
    // Um projeto sem nenhuma citacao faz o bibtex sair com erro; isso nao
    // impede a compilacao do documento, entao seguimos adiante.
    if (bibResult.code !== 0) {
      onLine?.(`[${backend}] terminou com codigo ${bibResult.code}; seguindo assim mesmo`);
    }

    for (let pass = 0; pass < MAX_RERUNS; pass += 1) {
      last = await run(texEngine, texArgs, { cwd: root, onLine });
      if (last.code !== 0) return last;
      if (!(await needsRerun(join(root, outDir, `${jobname}.log`)))) break;
    }

    return last;
  },
};

/**
 * O LaTeX avisa no .log quando referencias, sumario ou rotulos mudaram e uma
 * nova passada e necessaria.
 *
 * @param {string} logFile
 * @returns {Promise<boolean>}
 */
async function needsRerun(logFile) {
  try {
    const log = await readFile(logFile, 'utf8');
    return /Rerun to get|Rerun LaTeX|Please rerun|Label\(s\) may have changed/i.test(log);
  } catch {
    return false;
  }
}
