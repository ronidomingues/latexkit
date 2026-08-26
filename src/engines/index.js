/**
 * Escolha do motor de compilacao.
 *
 * A ordem e do mais rapido e leve ao mais pesado. O primeiro que estiver
 * completo (binario presente, motor TeX presente, backend de bibliografia
 * presente) vence. A escolha e guardada em .latexgen/engine.json com um
 * registro do que foi encontrado; se algo mudar na maquina, a deteccao roda
 * de novo em vez de falhar com um cache velho.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { STATE_DIR } from '../paths.js';
import { UserError } from '../util/log.js';
import { latexmk } from './latexmk.js';
import { manual } from './manual.js';
import { tectonic } from './tectonic.js';
import { docker } from './docker.js';

/**
 * @typedef {object} CompileContext
 * @property {string} root raiz do projeto
 * @property {string} entry arquivo principal, relativo a raiz
 * @property {string} outDir diretorio de saida, relativo a raiz
 * @property {'pdflatex'|'xelatex'|'lualatex'} texEngine
 * @property {import('../config.js').Bibliography} bibliography
 * @property {boolean} [watch] recompilar continuamente (so o latexmk suporta)
 * @property {(line: string) => void} [onLine] recebe cada linha da saida
 *
 * @typedef {{ available: true } | { available: false, reason: string }} Detection
 *
 * @typedef {object} Engine
 * @property {import('../config.js').EngineId} id
 * @property {string} label
 * @property {(context: CompileContext) => Promise<Detection>} detect
 * @property {(context: CompileContext) => Promise<import('../util/exec.js').RunResult>} compile
 * @property {(context: CompileContext) => Promise<import('../util/exec.js').RunResult>} [clean]
 */

/** Motores em ordem de preferencia. */
export const engines = [latexmk, manual, tectonic, docker];

/** @type {Map<import('../config.js').EngineId, Engine>} */
const byId = new Map(engines.map((engine) => [engine.id, engine]));

const CACHE_FILE = join(STATE_DIR, 'engine.json');

/**
 * Executa a deteccao de todos os motores, na ordem de preferencia.
 *
 * @param {CompileContext} context
 * @returns {Promise<Array<{ engine: Engine, detection: Detection }>>}
 */
export async function detectAll(context) {
  const results = [];
  for (const engine of engines) {
    results.push({ engine, detection: await engine.detect(context) });
  }
  return results;
}

/**
 * Resolve qual motor usar.
 *
 * @param {CompileContext} context
 * @param {{ requested?: import('../config.js').EngineId | 'auto', redetect?: boolean }} [options]
 * @returns {Promise<{ engine: Engine, source: 'requested' | 'cache' | 'detected' }>}
 */
export async function resolveEngine(context, options = {}) {
  const { requested = 'auto', redetect = false } = options;

  // 1. Pedido explicito: falha em vez de trocar de motor pelas costas.
  if (requested !== 'auto') {
    const engine = byId.get(requested);
    if (!engine) {
      throw new UserError(`Motor desconhecido: "${requested}".`, [
        `Disponiveis: ${engines.map((item) => item.id).join(', ')}`,
      ]);
    }
    const detection = await engine.detect(context);
    if (!detection.available) {
      throw new UserError(`O motor "${requested}" nao esta utilizavel: ${detection.reason}.`, [
        ...installHints(requested),
        'Ou deixe o latexgen escolher: remova --engine (ou use engine="auto").',
      ]);
    }
    return { engine, source: 'requested' };
  }

  // 2. Cache da execucao anterior.
  if (!redetect) {
    const cached = await readCache(context.root);
    if (cached) {
      const engine = byId.get(cached);
      if (engine && (await engine.detect(context)).available) {
        return { engine, source: 'cache' };
      }
    }
  }

  // 3. Sondagem na ordem de preferencia.
  const results = await detectAll(context);
  const winner = results.find((result) => result.detection.available);
  if (!winner) {
    throw new UserError('Nenhum motor de compilacao LaTeX disponivel.', [
      ...results.map(
        ({ engine, detection }) =>
          `${engine.id}: ${detection.available ? 'ok' : /** @type {{reason:string}} */ (detection).reason}`,
      ),
      '',
      'Instale uma das opcoes abaixo e rode novamente:',
      ...installHints(),
    ]);
  }

  await writeCache(context.root, winner.engine.id);
  return { engine: winner.engine, source: 'detected' };
}

/**
 * Instrucoes de instalacao, por motor.
 *
 * @param {import('../config.js').EngineId} [only]
 * @returns {string[]}
 */
export function installHints(only) {
  /** @type {Record<import('../config.js').EngineId, string[]>} */
  const hints = {
    latexmk: [
      'TeX Live completo (recomendado, inclui abntex2 e latexmk):',
      '  Debian/Ubuntu:  sudo apt install texlive-full latexmk',
      '  Fedora:         sudo dnf install texlive-scheme-full',
      '  macOS:          brew install --cask mactex',
      '  Windows:        https://miktex.org/download',
    ],
    manual: ['Qualquer instalacao de TeX Live ou MiKTeX ja fornece pdflatex e bibtex.'],
    tectonic: [
      'Tectonic (binario unico, baixa pacotes sob demanda):',
      '  https://tectonic-typesetting.github.io/install.html',
    ],
    docker: ['Docker (compila em container, sem LaTeX local):', '  https://docs.docker.com/get-docker/'],
  };
  return only ? hints[only] : Object.values(hints).flat();
}

/**
 * @param {string} root
 * @returns {Promise<import('../config.js').EngineId | null>}
 */
async function readCache(root) {
  try {
    const raw = JSON.parse(await readFile(join(root, CACHE_FILE), 'utf8'));
    return byId.has(raw.engine) ? raw.engine : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} root
 * @param {import('../config.js').EngineId} engine
 */
async function writeCache(root, engine) {
  try {
    await mkdir(join(root, STATE_DIR), { recursive: true });
    await writeFile(
      join(root, CACHE_FILE),
      `${JSON.stringify({ engine, note: 'Cache do latexgen. Apague para forcar nova deteccao.' }, null, 2)}\n`,
      'utf8',
    );
  } catch {
    // Cache e otimizacao: nao poder grava-lo nao impede a compilacao.
  }
}

/**
 * Monta o contexto de compilacao a partir da configuracao do projeto.
 *
 * @param {string} root
 * @param {import('../config.js').ProjectConfig} config
 * @param {Partial<CompileContext>} [overrides]
 * @returns {CompileContext}
 */
export function contextFrom(root, config, overrides = {}) {
  return {
    root,
    entry: config.entry,
    outDir: config.outDir,
    texEngine: config.texEngine,
    bibliography: config.bibliography,
    ...overrides,
  };
}
