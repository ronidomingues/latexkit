# latexgen

[![npm](https://img.shields.io/npm/v/latexgen)](https://www.npmjs.com/package/latexgen)
[![CI](https://github.com/ronidomingues/latexgen/actions/workflows/test.yml/badge.svg)](https://github.com/ronidomingues/latexgen/actions/workflows/test.yml)
[![node](https://img.shields.io/node/v/latexgen)](https://nodejs.org)

Projetos LaTeX academicos prontos para compilar, em um comando.

O que o `create-vite` faz pelo front-end, o `latexgen` faz pelo LaTeX: gera a
estrutura completa de um documento — `main.tex` no papel do `index.html`, mais
as pastas de imagens, tabelas, bibliografia e configuracao — e compila o PDF
sem que voce precise lembrar a sequencia `pdflatex → bibtex → pdflatex →
pdflatex`.

```bash
npx latexgen new article meu-artigo
cd meu-artigo
npm install
npm run build          # out/main.pdf
```

## Instalacao

Nao precisa instalar nada: `npx latexgen` baixa e executa na hora. Para usar em
um projeto ja existente:

```bash
npm install -D latexgen
npx latexgen init article
```

O unico requisito real e ter LaTeX na maquina — e, se nao tiver, o `latexgen`
compila em container com o Docker. Rode `npx latexgen doctor` para ver o que
existe no seu ambiente.

## Templates

| id | Documento | Classe |
| --- | --- | --- |
| `article` | Artigo cientifico ABNT (NBR 6022) | abntex2 |
| `tcc` | TCC, monografia, dissertacao ou tese ABNT (NBR 14724) | abntex2 |
| `report` | Relatorio tecnico-cientifico ABNT (NBR 10719) | abntex2 |
| `book` | Livro, com partes, epigrafes e indice remissivo | memoir |
| `beamer` | Apresentacao de slides | beamer |
| `letter` | Carta ou oficio no padrao oficio (MRPR) | article |

Cada template gera um projeto que compila de imediato, com texto de exemplo
mostrando como usar figuras, tabelas, equacoes e citacoes.

## Comandos

| Comando | O que faz |
| --- | --- |
| `latexgen new <template> <pasta>` | cria um projeto novo |
| `latexgen init <template>` | monta a estrutura em um diretorio existente, sem sobrescrever nada |
| `latexgen build` | gera o PDF |
| `latexgen watch` | recompila a cada arquivo salvo |
| `latexgen check` | confere metadados, figuras e citacoes |
| `latexgen clean` | remove os arquivos gerados |
| `latexgen upgrade` | traz melhorias do template sem tocar no seu texto |
| `latexgen doctor` | mostra o que esta instalado e qual motor seria usado |
| `latexgen list` | lista os templates |

Todo projeto gerado ja traz esses comandos como scripts npm: `npm run build`,
`npm run watch`, `npm run check`, `npm run clean`.

## Como um projeto e organizado

```
meu-artigo/
├── main.tex                 so \input: e o indice do documento
├── latexgen.config.json     titulo, autor, instituicao, palavras-chave
├── config/
│   ├── metadata.tex         GERADO a partir do config — nao edite
│   ├── packages.tex         pacotes do preambulo
│   ├── bibliography.tex     backend de citacoes
│   ├── docinfo.tex          liga os metadados aos comandos da classe
│   └── style.tex            seus ajustes de estilo
├── content/                 o texto, um arquivo por secao
├── bib/references.bib       referencias
├── figures/  tables/        imagens e tabelas
└── out/main.pdf             o resultado
```

Templates mais longos acrescentam pastas a esse esqueleto. O `tcc` e o
`report` separam os elementos que a norma exige:

```
minha-tese/
├── pretextual/              capa, folha de rosto, ficha catalografica,
│                            folha de aprovacao, dedicatoria, agradecimentos,
│                            epigrafe, resumo/abstract e listas
├── content/                 os capitulos
└── postextual/              apendices e anexos
```

Apendices e anexos sao numerados sozinhos (APENDICE A, ANEXO A): cada
`\chapter` dentro de `postextual/apendices.tex` vira uma letra. A ficha
catalografica e a folha de aprovacao vem com instrucoes de como substitui-las
pelo que a sua biblioteca e a sua banca fornecerem.

O `book` usa a divisao classica de um livro:

```
meu-livro/
├── frontmatter/             folha de rosto, creditos, dedicatoria, prefacio
├── content/                 os capitulos, agrupados em partes
└── backmatter/              posfacio, referencias e indice remissivo
```

A abertura e numerada em algarismos romanos e o miolo recomeca em arabicos,
como manda a convencao editorial. Termos marcados com `\index{termo}` no texto
alimentam o indice remissivo sozinhos.

A `letter` e um documento de uma pagina so: o texto fica em
`content/corpo.tex`, e todo o resto (timbre, identificacao, destinatario,
assunto, fecho e assinatura) e montado a partir do `latexgen.config.json`.

### Metadados

Titulo, autor e instituicao vivem no `latexgen.config.json`, nunca no `.tex`:

```json
{
  "metadata": {
    "title": "Analise Comparativa de Metodos",
    "author": "Seu Nome",
    "institution": "Universidade Federal do Exemplo",
    "advisor": "Prof. Dr. Fulano de Tal"
  }
}
```

A cada `build`, esses valores viram macros em `config/metadata.tex`
(`\lgTitle`, `\lgAuthor`, ...), ja escapadas para LaTeX. Os templates sao
LaTeX literal: nenhum `.tex` do template contem placeholders, o que os mantem
compilaveis e legiveis.

Para usar LaTeX dentro de um valor, sobrescreva a macro em `config/style.tex`,
que e carregado depois:

```latex
\renewcommand{\lgTitle}{Convergencia de $\alpha$ em redes esparsas}
```

## Compilacao: qual motor o latexgen usa

O `build` procura um motor utilizavel, do mais rapido ao mais pesado, e usa o
primeiro que estiver completo:

1. **`latexmk`** — o TeX Live da sua maquina. Resolve sozinho quantas passadas
   sao necessarias e quando rodar bibtex, biber e makeindex.
2. **`manual`** — `pdflatex` + `bibtex` chamados direto, quando ha TeX mas nao
   ha latexmk.
3. **`tectonic`** — binario unico que baixa os pacotes sob demanda. Nao monta
   indice remissivo, entao sai da escolha quando o documento tem um.
4. **`docker`** — compila em `texlive/texlive`, sem nenhum LaTeX instalado.

A escolha e guardada em `.latexgen/engine.json` e refeita sozinha se algo mudar
na maquina. Para forcar um motor: `npm run build -- --engine=docker`. Para
refazer a deteccao: `--redetect`.

A sondagem confere o toolchain inteiro, nao so o binario principal: um projeto
com `bibliography: "biblatex"` exige `biber`, e o motor que nao o tiver e
descartado com o motivo explicito. O mesmo vale para o indice remissivo do
`book`. A regra e sempre a mesma: um motor que produziria um documento
incompleto e recusado com o motivo a vista, em vez de entregar o PDF errado em
silencio. Rode `latexgen doctor` para ver a tabela.

## Bibliografia

Duas opcoes, escolhidas no scaffold:

```bash
npx latexgen new article tese                    # abntex2cite (padrao)
npx latexgen new article tese --bib=biblatex     # biblatex + biber
```

Os dois backends expoem os mesmos comandos, entao o texto do documento nao
muda ao trocar de um para o outro:

```latex
Segundo \citeonline{silva2020}, o metodo converge.   % citacao na frase
O metodo converge \cite{silva2020}.                  % citacao entre parenteses
```

## Escrevendo em Markdown

Arquivos `.md` em `content/` sao convertidos para LaTeX pelo Pandoc durante a
compilacao: `content/01-intro.md` gera `content/01-intro.generated.tex`, que o
`main.tex` inclui normalmente. Markdown e opcional — um projeto so de `.tex`
nunca depende do Pandoc.

## `latexgen check`

Um lint para os esquecimentos que custam caro numa banca:

- campos obrigatorios vazios ou ainda com o valor de exemplo
- figura sem `\caption` ou sem indicacao de fonte
- `\cite{chave}` sem entrada correspondente no `.bib`
- entradas do `.bib` que voce esqueceu de citar
- imagens em `figures/` que nenhum `\includegraphics` usa

Erros derrubam o comando; avisos nao. Isso o torna utilizavel como porta no CI.

## `latexgen upgrade`

Quando sai uma versao nova do latexgen, o `upgrade` traz as correcoes do
template para um projeto que ja existe — sem tocar em uma linha do que voce
escreveu.

```bash
npm update latexgen
npx latexgen upgrade --dry-run   # o que mudaria
npx latexgen upgrade             # aplica
```

A decisao e por arquivo, e se apoia no `.latexgen/manifest.json` gravado
quando o projeto foi criado:

| Situacao do arquivo | O que acontece |
| --- | --- |
| igual a como o template entregou | recebe a versao nova |
| novo no template | e criado |
| voce editou (`config/`, `main.tex`, CI) | fica como esta; a versao nova vai para `<arquivo>.new` |
| voce editou (`content/`, `bib/`, `figures/`) | fica como esta, e so |

A distincao da ultima linha e proposital: um `.new` ao lado da sua introducao
conteria apenas o texto-exemplo do template, que voce ja substituiu de
proposito.

Compare o que interessar e limpe depois:

```bash
diff config/packages.tex config/packages.tex.new
npx latexgen upgrade --clean-pending
```

Duas garantias que o comando nunca quebra: **nada e apagado** e **nada fora do
template e tocado**. Projetos criados antes de o manifesto existir precisam de
`--force`, que trata todo arquivo como editado — nada e sobrescrito e tudo vai
para `.new`.

Por isso o `.latexgen/manifest.json` **deve ser versionado** (o `.gitignore`
gerado ja cuida disso, ignorando apenas o `engine.json` ao lado, que e cache
local da maquina).

## Integracao continua

Todo projeto gerado ja vem com `.github/workflows/build-pdf.yml`: a cada push o
PDF e compilado em container e anexado a execucao; em tags `v*`, tambem vai
para a release.

## Desenvolvimento

```bash
npm install
npm run test:unit          # rapido, sem LaTeX
npm run test:integration   # gera e compila cada template de verdade
npm run typecheck
```

Os testes de integracao pulam sozinhos o que a maquina nao tem: sem Pandoc, os
de Markdown; sem Tectonic, os dele. O CI roda a suite unitaria do Node 20.10
(o minimo declarado) ao 24, e a de integracao dentro do container do TeX Live.

Para adicionar um template, veja [docs/templates.md](docs/templates.md).
Para o resto — como rodar, o que o ambiente precisa ter, como publicar —
veja [CONTRIBUTING.md](CONTRIBUTING.md).

O que mudou em cada versao esta no [CHANGELOG.md](CHANGELOG.md).

## Licenca

MIT — veja [LICENSE](LICENSE).
