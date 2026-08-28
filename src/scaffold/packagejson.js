/**
 * Integracao com um package.json que ja existe.
 *
 * O `init` roda em projetos ja em uso, e preservar o package.json inteiro
 * deixaria o usuario sem `npm run build`. A saida e mesclar: acrescentar o que
 * falta e nunca tocar no que ja esta la.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { UserError } from '../util/log.js';

/** Scripts que todo projeto latexkit expoe. */
export const SCRIPTS = {
  build: 'latexkit build',
  pdf: 'latexkit build',
  watch: 'latexkit watch',
  clean: 'latexkit clean',
  check: 'latexkit check',
  doctor: 'latexkit doctor',
};

/**
 * Acrescenta ao package.json existente o que falta para o projeto funcionar.
 *
 * Um script com o mesmo nome ja definido pelo usuario e mantido: sobrescrever
 * o `build` de alguem seria destrutivo, e o aviso deixa o conflito visivel.
 *
 * @param {string} root
 * @param {string} version versao do latexkit, para o devDependencies
 * @returns {Promise<{ added: string[], kept: string[] }>}
 */
export async function mergePackageJson(root, version) {
  const file = join(root, 'package.json');

  let manifest;
  try {
    manifest = JSON.parse(await readFile(file, 'utf8'));
  } catch (cause) {
    throw new UserError(`Nao foi possivel ler o package.json existente: ${file}`, [
      cause instanceof Error ? cause.message : String(cause),
    ]);
  }

  /** @type {string[]} */
  const added = [];
  /** @type {string[]} */
  const kept = [];

  manifest.scripts ??= {};
  for (const [name, command] of Object.entries(SCRIPTS)) {
    if (manifest.scripts[name] === undefined) {
      manifest.scripts[name] = command;
      added.push(`scripts.${name}`);
    } else if (manifest.scripts[name] !== command) {
      kept.push(`scripts.${name}`);
    }
  }

  const declared =
    manifest.dependencies?.latexkit ?? manifest.devDependencies?.latexkit ?? undefined;
  if (declared === undefined) {
    manifest.devDependencies ??= {};
    manifest.devDependencies.latexkit = `^${version}`;
    added.push('devDependencies.latexkit');
  }

  if (added.length > 0) {
    await writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  }

  return { added, kept };
}
