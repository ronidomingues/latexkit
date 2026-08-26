/**
 * Comando `doctor`: relatorio do ambiente.
 *
 * Existe para transformar "nao compila aqui" em uma lista concreta do que
 * falta e de como instalar. Roda fora de um projeto tambem, para conferir a
 * maquina antes de comecar.
 */

import { findConfigFile, loadConfig } from '../config.js';
import { contextFrom, detectAll, installHints } from '../engines/index.js';
import { texFileExists, which } from '../util/exec.js';
import { color, hint, info, success, warn } from '../util/log.js';

/** Binarios consultados no relatorio. */
const BINARIES = [
  { name: 'latexmk', why: 'orquestra as passadas de compilacao' },
  { name: 'pdflatex', why: 'motor TeX padrao' },
  { name: 'xelatex', why: 'motor TeX com fontes do sistema' },
  { name: 'lualatex', why: 'motor TeX com Lua' },
  { name: 'bibtex', why: 'bibliografia com abntex2cite' },
  { name: 'biber', why: 'bibliografia com biblatex' },
  { name: 'makeindex', why: 'indice remissivo' },
  { name: 'pandoc', why: 'conversao de Markdown (opcional)' },
  { name: 'tectonic', why: 'motor alternativo (opcional)' },
  { name: 'docker', why: 'compilacao em container (opcional)' },
];

/** Arquivos do TeX conferidos via kpsewhich. */
const TEX_FILES = [
  { file: 'abntex2.cls', why: 'classe base dos documentos ABNT', install: 'texlive-humanities' },
  { file: 'abntex2cite.sty', why: 'citacoes ABNT com BibTeX', install: 'texlive-humanities' },
  { file: 'beamer.cls', why: 'apresentacoes', install: 'texlive-latex-recommended' },
  { file: 'memoir.cls', why: 'base da abntex2', install: 'texlive-latex-extra' },
  { file: 'biblatex.sty', why: 'bibliografia moderna (opcional)', install: 'texlive-bibtex-extra' },
  {
    // O pacote se chama biblatex-abnt, mas instala abnt.bbx e abnt.cbx.
    file: 'abnt.bbx',
    why: 'estilo ABNT para biblatex (opcional)',
    install: 'texlive-bibtex-extra',
  },
];

export async function doctor() {
  info(color.bold('\nAmbiente\n'));
  info(`  node       ${process.version}`);
  info(`  plataforma ${process.platform} ${process.arch}`);

  info(color.bold('\nBinarios\n'));
  for (const { name, why } of BINARIES) {
    const path = await which(name);
    const mark = path ? color.green('✔') : color.yellow('–');
    const detail = path ? color.dim(path) : color.dim(`nao encontrado · ${why}`);
    info(`  ${mark} ${name.padEnd(10)} ${detail}`);
  }

  info(color.bold('\nPacotes LaTeX\n'));
  const hasKpsewhich = Boolean(await which('kpsewhich'));
  if (!hasKpsewhich) {
    warn('  kpsewhich ausente: nao da para verificar os pacotes instalados.');
  } else {
    /** @type {Set<string>} */
    const missing = new Set();
    for (const { file, why, install } of TEX_FILES) {
      const found = await texFileExists(file);
      if (!found) missing.add(install);
      const mark = found ? color.green('✔') : color.yellow('–');
      info(`  ${mark} ${file.padEnd(20)} ${color.dim(why)}`);
    }
    if (missing.size > 0) {
      info('');
      hint(`Para instalar o que falta: sudo apt install ${[...missing].join(' ')}`);
      hint('Ou, com tlmgr: tlmgr install abntex2 biblatex-abnt');
    }
  }

  await reportEngines();
}

async function reportEngines() {
  const configFile = findConfigFile();
  info(color.bold('\nMotores de compilacao\n'));

  if (!configFile) {
    info(color.dim('  Fora de um projeto latexgen: usando pdflatex + abntex2cite como referencia.'));
    info('');
  }

  const context = configFile
    ? await (async () => {
        const { config, root } = await loadConfig();
        return contextFrom(root, config);
      })()
    : {
        root: process.cwd(),
        entry: 'main.tex',
        outDir: 'out',
        texEngine: /** @type {const} */ ('pdflatex'),
        bibliography: /** @type {const} */ ('abntex2cite'),
      };

  const results = await detectAll(context);
  for (const { engine, detection } of results) {
    const mark = detection.available ? color.green('✔') : color.yellow('–');
    const detail = detection.available
      ? color.dim(engine.label)
      : color.dim(/** @type {{reason: string}} */ (detection).reason);
    info(`  ${mark} ${engine.id.padEnd(10)} ${detail}`);
  }

  const chosen = results.find((result) => result.detection.available);
  info('');
  if (chosen) {
    success(`O build usaria: ${color.bold(chosen.engine.label)}`);
  } else {
    warn('Nenhum motor disponivel. Instale uma das opcoes:');
    for (const line of installHints()) hint(line);
  }
  info('');
}
