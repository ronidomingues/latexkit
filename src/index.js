/**
 * API programatica do latexkit.
 *
 * Exposta para quem quiser gerar projetos a partir de um script proprio, sem
 * passar pela linha de comando.
 */

export { listTemplates, loadTemplate } from './templates.js';
export { scaffoldProject } from './scaffold/index.js';
export { renderMetadata, writeMetadata } from './scaffold/metadata.js';
export { loadConfig, normalizeConfig, writeConfig } from './config.js';
export { resolveEngine, detectAll, contextFrom, engines } from './engines/index.js';
export { convertMarkdown, findMarkdown } from './markdown.js';
export { parseTexLog } from './texlog.js';
export { UserError } from './util/log.js';
