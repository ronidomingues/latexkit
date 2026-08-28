/**
 * Comando `watch`: recompila a cada alteracao.
 *
 * Quando o motor resolvido e o latexmk, delegamos ao seu proprio modo `-pvc`,
 * que ja sabe exatamente de quais arquivos o documento depende (inclusive
 * imagens e .bib) por ler o .fls da compilacao anterior. Para os demais
 * motores, um observador proprio cobre os diretorios que o usuario edita.
 */

import { watch as watchFs } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from '../config.js';
import { loadTemplate } from '../templates.js';
import { contextFrom, resolveEngine } from '../engines/index.js';
import { build } from './build.js';
import { color, error, info, step, UserError } from '../util/log.js';

/** Diretorios observados no modo proprio. */
const WATCHED = ['content', 'config', 'bib', 'figures', 'tables'];

/** Espera antes de recompilar, para agrupar salvamentos em rajada. */
const DEBOUNCE_MS = 300;

/**
 * @param {import('./build.js').BuildArgs} [args]
 */
export async function watch(args = {}) {
  const { config, root } = await loadConfig();
  const template = await loadTemplate(config.template);
  const context = contextFrom(root, config, { needsIndex: template.features.index });
  const { engine } = await resolveEngine(context, {
    requested: /** @type {import('../config.js').EngineId | 'auto'} */ (
      args.engine ?? config.engine
    ),
    redetect: args.redetect,
  });

  if (engine.id === 'latexmk') {
    step(`Observando com ${color.bold(engine.label)}. Ctrl+C para sair.`);
    const result = await build({ ...args, watch: true });
    return result;
  }

  step(`Observando ${WATCHED.join(', ')} e ${config.entry}. Ctrl+C para sair.`);
  await runBuild();

  let timer = /** @type {NodeJS.Timeout | null} */ (null);
  let running = false;
  let queued = false;

  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      if (running) {
        queued = true;
        return;
      }
      running = true;
      await runBuild();
      running = false;
      if (queued) {
        queued = false;
        schedule();
      }
    }, DEBOUNCE_MS);
  };

  /** @type {import('node:fs').FSWatcher[]} */
  const watchers = [];
  for (const dir of [...WATCHED.map((name) => join(root, name)), root]) {
    try {
      watchers.push(
        watchFs(dir, { recursive: dir !== root }, (_event, filename) => {
          if (!filename) return;
          const name = String(filename);
          // Arquivos gerados sao produto da propria compilacao: reagir a eles
          // criaria um laco infinito.
          if (name.includes('.generated.tex') || name.startsWith('.')) return;
          if (dir === root && !name.endsWith('.tex') && name !== 'latexkit.config.json') return;
          schedule();
        }),
      );
    } catch {
      // Diretorio inexistente no template atual: nada a observar.
    }
  }

  await new Promise((resolve) => {
    process.on('SIGINT', () => {
      for (const watcher of watchers) watcher.close();
      info('\nObservacao encerrada.');
      resolve(undefined);
    });
  });

  async function runBuild() {
    try {
      await build({ ...args, watch: false });
    } catch (cause) {
      // Um erro de LaTeX nao pode derrubar o modo watch: o usuario corrige e
      // salva de novo.
      if (cause instanceof UserError) {
        error(cause.message);
        for (const line of cause.hints) info(`  ${color.dim(line)}`);
      } else {
        error(cause instanceof Error ? cause.message : String(cause));
      }
    }
  }
}
