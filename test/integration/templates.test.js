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
const CLI = join(packageRoot, 'bin', 'latexgen.js');

/** Uma compilacao completa pode passar de um minuto em maquina fria. */
const TIMEOUT = 300_000;

/** Valores usados nos campos obrigatorios de qualquer template. */
const METADATA = [
  '--title', 'Documento de Teste com Acentuacao & Simbolos',
  '--titleEn', 'Test Document',
  '--author', 'Autor de Teste',
  '--institution', 'Universidade de Teste',
  '--city', 'Cidade',
];

/**
 * @param {string[]} args
 * @param {string} [cwd]
 */
function latexgen(args, cwd) {
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
        await latexgen(['new', template.id, dir, '--yes', ...METADATA]);

        // A estrutura precisa estar completa antes de compilar.
        for (const file of ['main.tex', 'latexgen.config.json', 'package.json', 'README.md']) {
          assert.ok(existsSync(join(dir, file)), `faltou ${file}`);
        }
        assert.ok(existsSync(join(dir, 'config', 'metadata.tex')));
        assert.ok(existsSync(join(dir, 'config', 'bibliography.tex')));

        const { stdout } = await latexgen(['build'], dir);
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
        await latexgen(['new', template.id, dir, '--yes', ...METADATA]);

        // O check sai com codigo 1 quando ha erro; avisos nao derrubam.
        await assert.doesNotReject(
          latexgen(['check'], dir),
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
        await latexgen(['new', template.id, dir, '--yes', '--bib=biblatex', ...METADATA]);

        try {
          await latexgen(['build'], dir);
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
      await latexgen(['new', 'article', dir, '--yes', ...METADATA]);

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
        await latexgen(['clean'], dir);
        await latexgen(['build', `--engine=${id}`], dir);
        assert.ok(existsSync(join(dir, 'out', 'main.pdf')), `${id} nao gerou o PDF`);
      }
    },
  );
});
