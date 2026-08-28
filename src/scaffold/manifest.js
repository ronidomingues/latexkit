/**
 * Manifesto do que o scaffold escreveu.
 *
 * O `upgrade` precisa responder a uma pergunta que nao da para adivinhar
 * olhando so o arquivo: "isto ainda e como o template entregou, ou a pessoa
 * mexeu?". Guardar o hash de cada arquivo no momento em que ele foi escrito
 * responde essa pergunta com exatidao — arquivo intocado pode ser substituido
 * sem risco, arquivo editado nunca.
 *
 * O manifesto e propriedade do projeto, nao da maquina: ele vai para o git,
 * junto com o resto. Quem clonar o repositorio consegue atualizar o template
 * do mesmo jeito. (O cache de deteccao de motor, esse sim especifico da
 * maquina, fica ao lado em .latexgen/engine.json e e ignorado pelo git.)
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { STATE_DIR } from '../paths.js';

/** Caminho do manifesto, relativo a raiz do projeto. */
export const MANIFEST_FILE = join(STATE_DIR, 'manifest.json');

/**
 * @typedef {object} Manifest
 * @property {string} template id do template usado
 * @property {string} version versao do latexgen que escreveu estes arquivos
 * @property {Record<string, string>} files caminho relativo -> hash do conteudo
 */

/**
 * Hash do conteudo de um arquivo.
 *
 * As quebras de linha sao normalizadas antes: um checkout do git no Windows
 * pode converter LF em CRLF, e sem isso todo arquivo apareceria como editado
 * pelo usuario. Os templates sao todos texto, entao a normalizacao e segura.
 *
 * @param {string} content
 * @returns {string}
 */
export function hashContent(content) {
  return createHash('sha256').update(content.replace(/\r\n/g, '\n'), 'utf8').digest('hex');
}

/**
 * Hash de um arquivo em disco. Devolve null se ele nao existir.
 *
 * @param {string} file caminho absoluto
 * @returns {Promise<string | null>}
 */
export async function hashFile(file) {
  try {
    return hashContent(await readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Grava o manifesto.
 *
 * @param {string} root
 * @param {Manifest} manifest
 */
export async function writeManifest(root, manifest) {
  const file = join(root, MANIFEST_FILE);
  await mkdir(dirname(file), { recursive: true });

  // Chaves ordenadas: o manifesto e versionado, e uma ordem estavel evita
  // diffs de ruido a cada regravacao.
  const files = Object.fromEntries(Object.entries(manifest.files).sort(([a], [b]) => (a < b ? -1 : 1)));

  await writeFile(
    file,
    `${JSON.stringify({ ...manifest, files }, null, 2)}\n`,
    'utf8',
  );
}

/**
 * Le o manifesto. Devolve null quando o projeto nao tem um — o caso de quem
 * gerou o projeto com uma versao anterior a existencia deste arquivo.
 *
 * @param {string} root
 * @returns {Promise<Manifest | null>}
 */
export async function readManifest(root) {
  try {
    const raw = JSON.parse(await readFile(join(root, MANIFEST_FILE), 'utf8'));
    if (typeof raw?.files !== 'object' || raw.files === null) return null;
    return {
      template: String(raw.template ?? ''),
      version: String(raw.version ?? '0.0.0'),
      files: raw.files,
    };
  } catch {
    return null;
  }
}

/**
 * Calcula os hashes de uma lista de arquivos do projeto.
 *
 * @param {string} root
 * @param {string[]} relativePaths
 * @returns {Promise<Record<string, string>>}
 */
export async function hashAll(root, relativePaths) {
  /** @type {Record<string, string>} */
  const files = {};
  for (const path of relativePaths) {
    const hash = await hashFile(join(root, path));
    if (hash !== null) files[path] = hash;
  }
  return files;
}
