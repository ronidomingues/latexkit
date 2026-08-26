/**
 * Comando `clean`: remove o que a compilacao produziu.
 *
 * Por padrao apaga o diretorio de saida inteiro e os `.tex` gerados a partir
 * de Markdown. Nada em content/, config/ ou bib/ e tocado: o clean nunca pode
 * apagar o que o usuario escreveu.
 */

import { rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from '../config.js';
import { findMarkdown, GENERATED_SUFFIX } from '../markdown.js';
import { STATE_DIR } from '../paths.js';
import { hint, info, success } from '../util/log.js';

/**
 * @param {{ all?: boolean }} [args] `all` remove tambem o cache de deteccao de motor
 */
export async function clean(args = {}) {
  const { config, root } = await loadConfig();

  /** @type {string[]} */
  const removed = [];

  const outDir = join(root, config.outDir);
  if (existsSync(outDir)) {
    await rm(outDir, { recursive: true, force: true });
    removed.push(`${config.outDir}/`);
  }

  for (const source of await findMarkdown(root)) {
    const generated = source.replace(/\.md$/i, GENERATED_SUFFIX);
    if (existsSync(join(root, generated))) {
      await rm(join(root, generated), { force: true });
      removed.push(generated);
    }
  }

  if (args.all && existsSync(join(root, STATE_DIR))) {
    await rm(join(root, STATE_DIR), { recursive: true, force: true });
    removed.push(`${STATE_DIR}/`);
  }

  if (removed.length === 0) {
    info('Nada a limpar.');
    return;
  }

  success(`${removed.length} item(ns) removido(s):`);
  for (const item of removed) hint(item);
}
