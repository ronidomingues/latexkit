# Changelog

Segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o
[Versionamento Semantico](https://semver.org/lang/pt-BR/).

Enquanto a versao for `0.x`, mudancas incompativeis podem sair em uma minor —
o contrato de template e o formato do manifesto ainda vao se acomodar com o
uso real.

## [Nao publicado]

## [0.1.0] — 2026-08-28

Primeira publicacao.

### Adicionado

**Templates.** Seis tipos de documento, todos compilando de imediato e com
texto de exemplo mostrando figuras, tabelas, equacoes e citacoes:

- `article` — artigo cientifico ABNT (NBR 6022), sobre abntex2
- `tcc` — TCC, monografia, dissertacao ou tese ABNT (NBR 14724), com capa,
  folha de rosto, ficha catalografica, folha de aprovacao, dedicatoria,
  agradecimentos, epigrafe, resumo/abstract, listas, sumario, capitulos, e
  apendices e anexos numerados sozinhos
- `report` — relatorio tecnico-cientifico ABNT (NBR 10719)
- `book` — livro sobre memoir, com partes, epigrafes, numeracao romana na
  abertura e indice remissivo
- `beamer` — apresentacao de slides 16:9, com slides de secao e notas do
  apresentador
- `letter` — carta ou oficio no padrao oficio do Manual de Redacao da
  Presidencia da Republica

**Comandos.** `new`, `init`, `build`, `watch`, `clean`, `check`, `upgrade`,
`doctor` e `list`.

**Cadeia de motores.** O `build` procura um motor utilizavel do mais leve ao
mais pesado — `latexmk`, `pdflatex` direto, `tectonic`, `docker` — e usa o
primeiro completo. A sondagem confere o toolchain inteiro, nao so o binario
principal: um projeto com `biblatex` exige `biber`, e um documento com indice
remissivo descarta o tectonic, que nao sabe monta-lo. A escolha fica em cache
e e refeita sozinha quando a maquina muda.

**Metadados como dados.** Titulo, autor e instituicao vivem no
`latexkit.config.json` e chegam ao documento como macros geradas em
`config/metadata.tex`. Nenhum `.tex` de template contem placeholder, o que os
mantem compilaveis e legiveis por si.

**Bibliografia configuravel.** `abntex2cite` (padrao) ou `biblatex`, com os
mesmos comandos de citacao nos dois — trocar de backend nao exige reescrever o
texto.

**Markdown opcional.** Arquivos `.md` em `content/` sao convertidos por Pandoc
durante a compilacao. Um projeto so de `.tex` nunca depende do Pandoc.

**`latexkit check`.** Confere campos obrigatorios, valores de exemplo nunca
trocados, figura sem legenda ou sem fonte, citacao sem entrada no `.bib`,
entrada nunca citada e imagem nunca usada. Erros derrubam o comando, avisos
nao, o que o torna utilizavel como porta no CI.

**`latexkit upgrade`.** Traz melhorias do template para um projeto existente
sem tocar no que foi escrito, decidindo arquivo a arquivo pelo hash gravado no
`.latexkit/manifest.json`. Nada e apagado e nada fora do template e tocado.

**Integracao continua.** Todo projeto gerado ja vem com um workflow que compila
o PDF a cada push e o anexa a execucao.

### Notas

- Zero dependencias de runtime: `npx latexkit` nao baixa arvore nenhuma.
- Node 20.10 ou mais novo. A suite unitaria roda do 20.10 ao 24 no CI.
- Os templates foram verificados no TeX Live 2021 e no 2026.

[Nao publicado]: https://github.com/ronidomingues/latexkit/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/ronidomingues/latexkit/releases/tag/v0.1.0
