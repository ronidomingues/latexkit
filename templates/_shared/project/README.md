# {{documentTitle}}

{{templateName}}, gerado com [latexgen](https://github.com/ronidomingues/latexgen).

## Comandos

```bash
npm install        # instala o latexgen (uma vez)
npm run build      # compila e gera out/main.pdf
npm run watch      # recompila a cada arquivo salvo
npm run check      # confere metadados, figuras e citacoes
npm run clean      # remove os arquivos auxiliares
npm run doctor     # mostra quais motores LaTeX estao disponiveis
```

O PDF final fica em `out/main.pdf`.

## Onde mexer

| O que | Onde |
| --- | --- |
| Titulo, autor, instituicao, palavras-chave | `latexgen.config.json` |
| Texto do documento | `content/*.tex` |
| Referencias bibliograficas | `bib/references.bib` |
| Imagens | `figures/` |
| Pacotes do preambulo | `config/packages.tex` |
| Ajustes de estilo | `config/style.tex` |

`config/metadata.tex` e gerado a cada compilacao a partir do
`latexgen.config.json` — nao edite esse arquivo a mao. Para usar LaTeX dentro
de um metadado, sobrescreva a macro em `config/style.tex`:

```latex
\renewcommand{\lgTitle}{Efeito do $\alpha$ na convergencia}
```

## Escrevendo em Markdown

Arquivos `.md` em `content/` sao convertidos para LaTeX pelo
[Pandoc](https://pandoc.org/) durante a compilacao. Um `content/01-intro.md`
gera `content/01-intro.generated.tex`, que o `main.tex` inclui normalmente com
`\input{content/01-intro.generated}`.
