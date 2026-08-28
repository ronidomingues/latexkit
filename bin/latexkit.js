#!/usr/bin/env node
/**
 * Ponto de entrada da CLI.
 *
 * Mantido minimo de proposito: so descobre a versao, delega ao roteador e
 * traduz excecoes em codigo de saida.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { packageRoot } from '../src/paths.js';
import { runCli, reportError } from '../src/cli.js';

try {
  const manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
  await runCli(process.argv.slice(2), { version: manifest.version });
} catch (cause) {
  process.exitCode = reportError(cause);
}
