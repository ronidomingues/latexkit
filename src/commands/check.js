/**
 * Comando `check`: conferencia do documento antes de entregar.
 *
 * As regras sao heuristicas sobre o texto-fonte, nao uma validacao formal da
 * norma: elas pegam os esquecimentos que custam caro numa banca (figura sem
 * fonte, citacao sem referencia, campo de exemplo nunca preenchido), e nao
 * substituem a leitura da NBR.
 *
 * Erros derrubam o comando (codigo 1), avisos nao — assim o check serve de
 * porta no CI sem travar por questoes de estilo.
 */

import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { loadConfig } from '../config.js';
import { loadTemplate } from '../templates.js';
import { walk } from '../scaffold/copy.js';
import { color, error, info, success, warn, UserError } from '../util/log.js';

/**
 * @typedef {object} Finding
 * @property {'error' | 'warning'} level
 * @property {string} rule
 * @property {string} message
 * @property {string} [file] caminho relativo a raiz do projeto
 * @property {number} [line]
 */

export async function check() {
  const { config, root } = await loadConfig();
  const template = await loadTemplate(config.template);
  const enabled = new Set(template.checks);

  const sources = await readSources(root);
  const text = sources.map((source) => source.content).join('\n');

  /** @type {Finding[]} */
  const findings = [
    ...(enabled.has('metadata') ? checkMetadata(config, template) : []),
    ...(enabled.has('example-values') ? checkExampleValues(config, template) : []),
    ...(enabled.has('figure-caption') ? checkFigures(sources, 'caption') : []),
    ...(enabled.has('figure-source') ? checkFigures(sources, 'source') : []),
    ...(await citationFindings(root, config, text, enabled)),
    ...(enabled.has('unused-figures') ? await checkUnusedFigures(root, text) : []),
  ];

  report(findings, root);

  const errors = findings.filter((finding) => finding.level === 'error');
  if (errors.length > 0) {
    process.exitCode = 1;
  }
}

/**
 * Le todos os .tex do projeto, exceto os gerados.
 *
 * @param {string} root
 * @returns {Promise<Array<{ file: string, content: string }>>}
 */
async function readSources(root) {
  /** @type {Array<{ file: string, content: string }>} */
  const sources = [];
  for (const dir of ['content', 'config']) {
    const full = join(root, dir);
    if (!existsSync(full)) continue;
    for (const file of await walk(full)) {
      if (extname(file) !== '.tex') continue;
      if (file.endsWith('.generated.tex') || file.endsWith('metadata.tex')) continue;
      sources.push({ file: relative(root, file), content: await readFile(file, 'utf8') });
    }
  }
  return sources;
}

/**
 * Campos obrigatorios do template que continuam vazios.
 *
 * @param {import('../config.js').ProjectConfig} config
 * @param {import('../templates.js').Template} template
 * @returns {Finding[]}
 */
function checkMetadata(config, template) {
  return template.vars
    .filter((variable) => variable.required && !(config.metadata[variable.key] ?? '').trim())
    .map((variable) => ({
      level: /** @type {const} */ ('error'),
      rule: 'metadata',
      message: `Campo obrigatorio vazio: "${variable.key}" (${variable.prompt}).`,
      file: 'latexgen.config.json',
    }));
}

/**
 * Campos que ainda estao com o valor de exemplo do template.
 *
 * @param {import('../config.js').ProjectConfig} config
 * @param {import('../templates.js').Template} template
 * @returns {Finding[]}
 */
function checkExampleValues(config, template) {
  return template.vars
    .filter((variable) => variable.example && config.metadata[variable.key] === variable.example)
    .map((variable) => ({
      level: /** @type {const} */ ('warning'),
      rule: 'example-values',
      message: `"${variable.key}" ainda contem o valor de exemplo do template.`,
      file: 'latexgen.config.json',
    }));
}

/**
 * Figuras sem legenda ou sem indicacao de fonte.
 *
 * A NBR 14724 exige legenda acima e fonte abaixo de toda ilustracao. Blocos
 * inteiramente comentados sao ignorados: o template traz um de exemplo.
 *
 * @param {Array<{ file: string, content: string }>} sources
 * @param {'caption' | 'source'} kind
 * @returns {Finding[]}
 */
function checkFigures(sources, kind) {
  /** @type {Finding[]} */
  const findings = [];

  for (const { file, content } of sources) {
    // Comentarios saem antes da busca pelo ambiente: um bloco de exemplo
    // comentado nao e uma figura do documento. stripComments preserva as
    // quebras de linha, entao a numeracao continua valendo.
    const active = stripComments(content);
    const pattern = /\\begin\{figure\}([\s\S]*?)\\end\{figure\}/g;
    for (const match of active.matchAll(pattern)) {
      const body = match[1];
      if (!body.trim()) continue;

      const line = active.slice(0, match.index).split('\n').length;
      if (kind === 'caption' && !/\\caption\s*\{/.test(body)) {
        findings.push({
          level: 'error',
          rule: 'figure-caption',
          message: 'Figura sem \\caption. A NBR 14724 exige legenda acima da ilustracao.',
          file,
          line,
        });
      }
      if (kind === 'source' && !/\\fonte\s*[\[{]|Fonte:/.test(body)) {
        findings.push({
          level: 'warning',
          rule: 'figure-source',
          message: 'Figura sem indicacao de fonte. Use \\fonte{...} abaixo da imagem.',
          file,
          line,
        });
      }
    }
  }

  return findings;
}

/**
 * Cruza as citacoes do texto com as entradas do .bib.
 *
 * @param {string} root
 * @param {import('../config.js').ProjectConfig} config
 * @param {string} text
 * @param {Set<string>} enabled
 * @returns {Promise<Finding[]>}
 */
async function citationFindings(root, config, text, enabled) {
  const wantsOrphans = enabled.has('orphan-citations');
  const wantsUncited = enabled.has('uncited-entries');
  if (!wantsOrphans && !wantsUncited) return [];

  const bibFile = join(root, 'bib', 'references.bib');
  if (!existsSync(bibFile)) return [];

  const bib = await readFile(bibFile, 'utf8');
  const entries = new Set(
    [...stripComments(bib).matchAll(/@\w+\s*\{\s*([^,\s]+)\s*,/g)].map((match) => match[1]),
  );
  const cited = collectCitations(stripComments(text));

  /** @type {Finding[]} */
  const findings = [];

  if (wantsOrphans) {
    for (const key of [...cited].sort()) {
      if (entries.has(key)) continue;
      findings.push({
        level: 'error',
        rule: 'orphan-citations',
        message: `\\cite{${key}} nao tem entrada correspondente no bib/references.bib.`,
        file: 'bib/references.bib',
      });
    }
  }

  if (wantsUncited) {
    for (const key of [...entries].sort()) {
      if (cited.has(key)) continue;
      findings.push({
        level: 'warning',
        rule: 'uncited-entries',
        message: `A entrada "${key}" nunca e citada no texto${
          config.bibliography === 'abntex2cite' ? ' e nao aparecera nas referencias' : ''
        }.`,
        file: 'bib/references.bib',
      });
    }
  }

  return findings;
}

/**
 * Extrai as chaves citadas, cobrindo os comandos dos dois backends.
 * Um mesmo comando pode listar varias chaves separadas por virgula.
 *
 * @param {string} text
 * @returns {Set<string>}
 */
export function collectCitations(text) {
  /** @type {Set<string>} */
  const keys = new Set();
  const pattern =
    /\\(?:cite|citeonline|citeauthor|citeyear|citetitle|nocite|parencite|textcite|footcite|autocite|apud)\*?\s*(?:\[[^\]]*\]){0,2}\s*\{([^}]*)\}/g;

  for (const match of text.matchAll(pattern)) {
    for (const key of match[1].split(',')) {
      const trimmed = key.trim();
      // `\nocite{*}` inclui tudo: nao e uma chave real.
      if (trimmed && trimmed !== '*') keys.add(trimmed);
    }
  }
  return keys;
}

/**
 * Imagens em figures/ que nenhum \includegraphics referencia.
 *
 * @param {string} root
 * @param {string} text
 * @returns {Promise<Finding[]>}
 */
async function checkUnusedFigures(root, text) {
  const dir = join(root, 'figures');
  if (!existsSync(dir)) return [];

  const files = (await readdir(dir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
    .map((entry) => entry.name);

  const included = stripComments(text);
  return files
    .filter((name) => {
      const stem = name.replace(/\.[^.]+$/, '');
      // O \graphicspath aponta para figures/, entao o .tex pode citar a imagem
      // com ou sem extensao e com ou sem o prefixo do diretorio.
      return !included.includes(stem);
    })
    .map((name) => ({
      level: /** @type {const} */ ('warning'),
      rule: 'unused-figures',
      message: `figures/${name} nao e usada por nenhum \\includegraphics.`,
      file: `figures/${name}`,
    }));
}

/**
 * Remove comentarios de LaTeX, preservando `\%` escapado.
 *
 * @param {string} content
 * @returns {string}
 */
export function stripComments(content) {
  return content
    .split('\n')
    .map((line) => line.replace(/(^|[^\\])%.*$/, '$1'))
    .join('\n');
}

/**
 * @param {Finding[]} findings
 * @param {string} root
 */
function report(findings, root) {
  if (findings.length === 0) {
    success('Nenhum problema encontrado.');
    return;
  }

  const errors = findings.filter((finding) => finding.level === 'error');
  const warnings = findings.filter((finding) => finding.level === 'warning');

  for (const finding of [...errors, ...warnings]) {
    const where = finding.file
      ? color.dim(`${finding.file}${finding.line ? `:${finding.line}` : ''}  `)
      : '';
    const line = `${where}${finding.message} ${color.dim(`[${finding.rule}]`)}`;
    if (finding.level === 'error') error(line);
    else warn(line);
  }

  info('');
  const parts = [];
  if (errors.length) parts.push(color.red(`${errors.length} erro(s)`));
  if (warnings.length) parts.push(color.yellow(`${warnings.length} aviso(s)`));
  info(`${parts.join(', ')} em ${relative(process.cwd(), root) || '.'}`);

  if (errors.length === 0) {
    info(color.dim('Avisos nao impedem a entrega; erros sim.'));
  }
}
