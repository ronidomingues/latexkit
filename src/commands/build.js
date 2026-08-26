/**
 * Comando `build`: regenera o que e derivado e compila o PDF.
 *
 * A sequencia e sempre a mesma — metadados, Markdown, compilacao — para que o
 * PDF nunca fique fora de sincronia com o latexgen.config.json.
 */

import { existsSync } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { loadConfig } from '../config.js';
import { loadTemplate } from '../templates.js';
import { writeMetadata } from '../scaffold/metadata.js';
import { convertMarkdown } from '../markdown.js';
import { contextFrom, resolveEngine } from '../engines/index.js';
import { color, info, step, success, UserError } from '../util/log.js';
import { summarizeLog } from '../texlog.js';
import { preflight } from '../preflight.js';

/**
 * @typedef {object} BuildArgs
 * @property {string} [engine] forca um motor
 * @property {boolean} [redetect] ignora o cache de deteccao
 * @property {boolean} [verbose] repassa a saida bruta do LaTeX
 * @property {boolean} [watch] recompila a cada alteracao
 */

/**
 * @param {BuildArgs} args
 * @returns {Promise<void>}
 */
export async function build(args = {}) {
  const { config, root } = await loadConfig();
  const template = await loadTemplate(config.template);

  if (!existsSync(join(root, config.entry))) {
    throw new UserError(`Arquivo principal nao encontrado: ${config.entry}`, [
      `Esperado em ${root}`,
      'Confira o campo "entry" do latexgen.config.json.',
    ]);
  }

  // 1. Metadados: o .tex derivado do config e reescrito a cada build, para que
  //    editar o JSON baste para o PDF mudar.
  await writeMetadata(root, config, template);

  // 2. Markdown, quando houver.
  const generated = await convertMarkdown(root, {
    onLine: args.verbose ? (line) => info(line) : undefined,
  });
  if (generated.length > 0) {
    step(`Pandoc converteu ${generated.length} arquivo(s) Markdown`);
  }

  // 3. Compilacao. O diretorio de saida precisa existir antes: o latexmk o
  //    cria sozinho, mas o pdflatex chamado direto falha com "I can't write
  //    on file" se ele nao estiver la.
  await mkdir(join(root, config.outDir), { recursive: true });

  const context = contextFrom(root, config, {
    watch: args.watch,
    onLine: args.verbose ? (line) => info(line) : undefined,
  });

  const { engine, source } = await resolveEngine(context, {
    requested: /** @type {import('../config.js').EngineId | 'auto'} */ (
      args.engine ?? config.engine
    ),
    redetect: args.redetect,
  });

  // O docker traz o proprio TeX Live: conferir os pacotes da maquina local
  // nesse caso so produziria um falso negativo.
  await preflight(config, template, { skip: engine.id === 'docker' });

  const origin = { requested: 'escolhido por voce', cache: 'do cache', detected: 'detectado' }[source];
  step(`Compilando com ${color.bold(engine.label)} ${color.dim(`(${origin})`)}`);

  const result = await engine.compile(context);
  const pdf = join(root, context.outDir, context.entry.replace(/\.tex$/i, '.pdf'));

  if (result.code !== 0) {
    const log = join(root, context.outDir, context.entry.replace(/\.tex$/i, '.log'));
    throw new UserError('A compilacao falhou.', [
      ...(await summarizeLog(log, result)),
      '',
      `Log completo: ${relative(process.cwd(), log)}`,
      'Para ver a saida bruta do LaTeX: latexgen build --verbose',
    ]);
  }

  if (!existsSync(pdf)) {
    throw new UserError('O motor terminou sem erro, mas nenhum PDF foi gerado.', [
      `Esperado: ${relative(process.cwd(), pdf)}`,
      'Rode com --verbose para ver a saida completa.',
    ]);
  }

  const { size } = await stat(pdf);
  success(`${relative(process.cwd(), pdf)} (${formatBytes(size)})`);
}

/**
 * @param {number} bytes
 * @returns {string}
 */
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
