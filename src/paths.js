import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Raiz do pacote latexgen (uma pasta acima de src/). */
export const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Diretorio que contem os templates embutidos. */
export const templatesDir = join(packageRoot, 'templates');

/** Partials compartilhados entre templates (bibliografia, .gitignore, workflow de CI). */
export const sharedDir = join(templatesDir, '_shared');

/** Nome do arquivo de configuracao dentro de um projeto gerado. */
export const CONFIG_FILE = 'latexgen.config.json';

/** Diretorio de estado local do projeto (cache de motor). Nao versionado. */
export const STATE_DIR = '.latexgen';
