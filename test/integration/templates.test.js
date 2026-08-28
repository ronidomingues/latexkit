/**
 * Testes que compilam de verdade.
 *
 * Cada template e gerado em um diretorio temporario e compilado com o motor
 * que a maquina oferecer. Um template que deixe de compilar quebra aqui, e nao
 * na mao de quem instalou o pacote.
 *
 * Sao lentos por natureza (um latexmk completo por template) e dependem de uma
 * instalacao de LaTeX; sem motor disponivel, os testes sao pulados com aviso
 * em vez de falharem.
 */

import { test, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { listTemplates } from '../../src/templates.js';
import { detectAll } from '../../src/engines/index.js';
import { packageRoot } from '../../src/paths.js';
import { tempDir } from '../helpers/tmp.js';

const run = promisify(execFile);
const CLI = join(packageRoot, 'bin', 'latexkit.js');

/** Uma compilacao completa pode passar de um minuto em maquina fria. */
const TIMEOUT = 300_000;

/**
 * Valores conhecidos, usados quando o template declara essas chaves.
 * O titulo carrega `&` de proposito: e o caractere que mais quebra escape.
 */
const KNOWN_VALUES = {
  title: 'Documento de Teste com Acentuacao & Simbolos',
  titleEn: 'Test Document',
  author: 'Autor de Teste',
  institution: 'Universidade de Teste',
  advisor: 'Prof. Dr. Orientador de Teste',
  city: 'Cidade',
};

/**
 * Monta as flags de metadado a partir do manifesto do template.
 *
 * Derivar do manifesto, em vez de fixar uma lista, e o que mantem a promessa
 * de que basta criar a pasta do template para a suite cobri-lo: um template
 * novo que exija um campo novo passa a receber esse campo sozinho.
 *
 * @param {import('../../src/templates.js').Template} template
 * @returns {string[]}
 */
function metadataArgs(template) {
  /** @type {string[]} */
  const args = [];
  for (const variable of template.vars) {
    const known = KNOWN_VALUES[/** @type {keyof typeof KNOWN_VALUES} */ (variable.key)];
    if (known !== undefined) {
      args.push(`--${variable.key}`, known);
    } else if (variable.required) {
      args.push(`--${variable.key}`, `Valor de teste para ${variable.key}`);
    }
  }
  return args;
}

/**
 * @param {string[]} args
 * @param {string} [cwd]
 */
function latexkit(args, cwd) {
  return run(process.execPath, [CLI, ...args], { cwd, timeout: TIMEOUT, encoding: 'utf8' });
}

let available = false;

before(async () => {
  const results = await detectAll({
    root: process.cwd(),
    entry: 'main.tex',
    outDir: 'out',
    texEngine: 'pdflatex',
    bibliography: 'abntex2cite',
  });
  available = results.some((result) => result.detection.available);
  if (!available) {
    console.warn('Nenhum motor LaTeX disponivel: os testes de compilacao serao pulados.');
  }
});

const templates = await listTemplates();

for (const template of templates) {
  describe(`template ${template.id}`, () => {
    test(
      'gera o projeto e compila o PDF',
      { timeout: TIMEOUT },
      async (t) => {
        if (!available) return t.skip('sem motor LaTeX nesta maquina');

        const dir = join(await tempDir(t), template.id);
        await latexkit(['new', template.id, dir, '--yes', ...metadataArgs(template)]);

        // A estrutura precisa estar completa antes de compilar.
        for (const file of ['main.tex', 'latexkit.config.json', 'package.json', 'README.md']) {
          assert.ok(existsSync(join(dir, file)), `faltou ${file}`);
        }
        assert.ok(existsSync(join(dir, 'config', 'metadata.tex')));
        assert.equal(
          existsSync(join(dir, 'config', 'bibliography.tex')),
          Boolean(template.features.bibliography),
          'config/bibliography.tex deve existir exatamente quando o template declara bibliografia',
        );

        const { stdout } = await latexkit(['build'], dir);
        assert.match(stdout, /out\/main\.pdf/);

        const pdf = join(dir, 'out', 'main.pdf');
        assert.ok(existsSync(pdf), 'o PDF nao foi gerado');
        assert.ok((await stat(pdf)).size > 10_000, 'o PDF saiu pequeno demais para ter conteudo');
      },
    );

    test(
      'um projeto recem-criado passa no check',
      { timeout: TIMEOUT },
      async (t) => {
        const dir = join(await tempDir(t), template.id);
        await latexkit(['new', template.id, dir, '--yes', ...metadataArgs(template)]);

        // O check sai com codigo 1 quando ha erro; avisos nao derrubam.
        await assert.doesNotReject(
          latexkit(['check'], dir),
          'o template gerado ja nasce com erros de check',
        );
      },
    );

    test(
      'compila tambem com biblatex',
      { timeout: TIMEOUT },
      async (t) => {
        if (!available) return t.skip('sem motor LaTeX nesta maquina');
        if (!template.features.bibliography) return t.skip('template sem bibliografia');

        const dir = join(await tempDir(t), `${template.id}-biblatex`);
        await latexkit(['new', template.id, dir, '--yes', '--bib=biblatex', ...metadataArgs(template)]);

        try {
          await latexkit(['build'], dir);
        } catch (cause) {
          // biblatex-abnt e opcional: sem ele, o preflight avisa e o teste e
          // pulado, em vez de acusar um defeito do template.
          const failure = /** @type {{stdout?: string, stderr?: string}} */ (cause);
          const output = `${failure.stdout ?? ''}${failure.stderr ?? ''}`;
          if (/abnt\.bbx|biblatex-abnt/.test(output)) {
            return t.skip('biblatex-abnt nao instalado nesta maquina');
          }
          throw cause;
        }

        assert.ok(existsSync(join(dir, 'out', 'main.pdf')));
      },
    );
  });
}

describe('cadeia de motores', () => {
  test(
    'o mesmo documento compila em todos os motores disponiveis',
    { timeout: TIMEOUT },
    async (t) => {
      if (!available) return t.skip('sem motor LaTeX nesta maquina');

      const dir = join(await tempDir(t), 'multi-engine');
      const article = templates.find((item) => item.id === 'article');
      assert.ok(article, 'o template article deveria existir');
      await latexkit(['new', 'article', dir, '--yes', ...metadataArgs(article)]);

      const results = await detectAll({
        root: dir,
        entry: 'main.tex',
        outDir: 'out',
        texEngine: 'pdflatex',
        bibliography: 'abntex2cite',
      });

      // O docker fica de fora: baixar a imagem de varios GB nao cabe em um
      // teste. A cobertura dele esta na deteccao, exercitada nos unitarios.
      const usable = results
        .filter((result) => result.detection.available && result.engine.id !== 'docker')
        .map((result) => result.engine.id);

      assert.ok(usable.length > 0, 'nenhum motor local disponivel');

      for (const id of usable) {
        await latexkit(['clean'], dir);
        await latexkit(['build', `--engine=${id}`], dir);
        assert.ok(existsSync(join(dir, 'out', 'main.pdf')), `${id} nao gerou o PDF`);
      }
    },
  );
});
