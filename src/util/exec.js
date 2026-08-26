import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import { delimiter, join, isAbsolute } from 'node:path';

/**
 * @typedef {object} RunResult
 * @property {number} code codigo de saida (0 = sucesso)
 * @property {string} stdout
 * @property {string} stderr
 */

/**
 * Executa um comando capturando a saida. Nunca rejeita por codigo != 0 —
 * quem chama decide o que fazer com `code`.
 *
 * @param {string} command
 * @param {string[]} args
 * @param {{cwd?: string, env?: NodeJS.ProcessEnv, inherit?: boolean, onLine?: (line: string) => void}} [options]
 * @returns {Promise<RunResult>}
 */
export function run(command, args, options = {}) {
  const { cwd, env, inherit = false, onLine } = options;
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: env ?? process.env,
      stdio: inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let pending = '';

    if (!inherit) {
      child.stdout?.setEncoding('utf8');
      child.stderr?.setEncoding('utf8');
      child.stdout?.on('data', (chunk) => {
        stdout += chunk;
        if (!onLine) return;
        pending += chunk;
        const lines = pending.split('\n');
        pending = lines.pop() ?? '';
        for (const line of lines) onLine(line);
      });
      child.stderr?.on('data', (chunk) => {
        stderr += chunk;
      });
    }

    child.on('error', reject);
    child.on('close', (code) => {
      if (onLine && pending) onLine(pending);
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

/** Cache por processo: a sondagem de motores consulta os mesmos binarios varias vezes. */
/** @type {Map<string, string | null>} */
const whichCache = new Map();

/**
 * Localiza um executavel no PATH. Retorna o caminho absoluto ou null.
 * Respeita PATHEXT no Windows.
 *
 * @param {string} binary
 * @returns {Promise<string | null>}
 */
export async function which(binary) {
  const cached = whichCache.get(binary);
  if (cached !== undefined) return cached;

  const resolved = await locate(binary);
  whichCache.set(binary, resolved);
  return resolved;
}

/** Limpa o cache de `which` — usado pelos testes e por `--redetect`. */
export function clearWhichCache() {
  whichCache.clear();
}

/**
 * @param {string} binary
 * @returns {Promise<string | null>}
 */
async function locate(binary) {
  const isWindows = process.platform === 'win32';
  const extensions = isWindows
    ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM').split(';').filter(Boolean)
    : [''];

  const candidates = isAbsolute(binary)
    ? [binary]
    : (process.env.PATH ?? '').split(delimiter).filter(Boolean).map((dir) => join(dir, binary));

  for (const candidate of candidates) {
    for (const ext of extensions) {
      const full = candidate + ext;
      try {
        await access(full, isWindows ? constants.F_OK : constants.X_OK);
        return full;
      } catch {
        // segue para o proximo candidato
      }
    }
  }
  return null;
}

/**
 * Pergunta ao kpathsea se um arquivo do TeX (classe, pacote, estilo) esta instalado.
 * Retorna false quando `kpsewhich` nao existe — nesse caso nao ha como afirmar nada.
 *
 * @param {string} file por exemplo 'abntex2.cls'
 * @returns {Promise<boolean>}
 */
export async function texFileExists(file) {
  if (!(await which('kpsewhich'))) return false;
  const { code } = await run('kpsewhich', [file]);
  return code === 0;
}
