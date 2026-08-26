/** Comando `list`: mostra os templates disponiveis. */

import { listTemplates } from '../templates.js';
import { color, info } from '../util/log.js';

export async function list() {
  const templates = await listTemplates();
  const width = Math.max(...templates.map((template) => template.id.length));

  info(color.bold('\nTemplates disponiveis\n'));
  for (const template of templates) {
    info(`  ${color.cyan(template.id.padEnd(width))}  ${template.name}`);
    info(`  ${' '.repeat(width)}  ${color.dim(template.description)}`);
    info('');
  }
  info(color.dim('  Uso: latexgen new <template> <pasta>\n'));
}
