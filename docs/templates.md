# Como adicionar um template

Um template e uma pasta em `templates/<id>/` com um `template.json` e os
arquivos que serao copiados para o projeto do usuario. Nao ha codigo a
escrever: a CLI descobre o template pela pasta e as flags de metadado saem do
manifesto.

## 1. O manifesto

`templates/<id>/template.json`:

```json
{
  "id": "tcc",
  "name": "Trabalho academico ABNT (NBR 14724)",
  "description": "TCC, dissertacao ou tese: capa, folha de rosto, ficha catalografica, listas, capitulos, apendices e anexos.",
  "documentClass": "abntex2",
  "engine": "pdflatex",
  "entry": "main.tex",
  "vars": [
    { "key": "title", "prompt": "Titulo do trabalho", "required": true },
    { "key": "author", "prompt": "Autor", "required": true },
    { "key": "advisor", "prompt": "Orientador", "default": "" },
    { "key": "year", "prompt": "Ano", "auto": "year" },
    { "key": "keywords", "prompt": "Palavras-chave", "default": "uma. outra.", "example": "uma. outra." }
  ],
  "features": { "bibliography": true, "markdown": true, "abstract": true, "figures": true },
  "checks": ["metadata", "example-values", "figure-caption", "figure-source", "orphan-citations", "uncited-entries", "unused-figures"]
}
```

| Campo | Para que serve |
| --- | --- |
| `id` | precisa bater com o nome da pasta |
| `documentClass` | usado pelo preflight para conferir se a classe esta instalada |
| `engine` | motor TeX exigido: `pdflatex`, `xelatex` ou `lualatex` |
| `vars` | vira prompt interativo, flag da CLI e macro no `metadata.tex` |
| `features.bibliography` | ativa a copia do `config/bibliography.tex` e o preflight do backend |
| `checks` | quais regras do `latexgen check` se aplicam |

Em `vars`: `required` faz o campo ser cobrado; `default` e o valor inicial;
`auto: "year"` preenche com o ano corrente; `example` marca um valor de
demonstracao, sobre o qual o `check` avisa enquanto nao for trocado.

## 2. Os arquivos

Estrutura minima:

```
templates/<id>/
├── template.json
├── main.tex
├── config/
│   ├── packages.tex     pacotes do preambulo
│   ├── docinfo.tex      liga as macros \lg* aos comandos da classe
│   └── style.tex        vazio ou com ajustes; o usuario edita este
├── content/*.tex        texto de exemplo
├── bib/references.bib   so com entradas que o texto realmente cita
├── figures/.gitkeep
└── gitignore            sem o ponto: o npm renomearia .gitignore ao empacotar
```

Nao inclua `config/metadata.tex` nem `config/bibliography.tex`: os dois sao
gerados no scaffold.

## 3. A regra que sustenta tudo

**Nenhum arquivo `.tex` do template contem placeholders.** Chaves `{}` sao
sintaxe de LaTeX, e misturar `{{var}}` no meio produziria arquivos que nao
compilam sozinhos.

Todo dado variavel chega pelo `config/metadata.tex` gerado, na forma de duas
macros por chave:

| Macro | O que faz |
| --- | --- |
| `\lgTitle` | o valor, ja escapado para LaTeX |
| `\lgIfTitle{sim}{nao}` | executa `sim` se o campo esta preenchido, `nao` se vazio |

O nome vem da chave em TitleCase: `titleEn` → `\lgTitleEn`, `sub-title` →
`\lgSubTitle`. Digitos viram algarismos por extenso, porque nomes de macro em
TeX so aceitam letras.

O `config/docinfo.tex` do template faz a ponte para os comandos da classe:

```latex
\titulo{\lgTitle}
\autor{\lgAuthor}
\lgIfAdvisor{\orientador{\lgAdvisor}}{}
```

A substituicao `{{var}}` existe, mas so em arquivos nao-LaTeX (`.json`, `.md`,
`.yml`, `.txt`), onde chaves nao tem significado. As variaveis disponiveis sao
os metadados mais `projectName`, `templateId`, `templateName` e
`latexgenVersion`.

## 4. A ordem do preambulo

O `main.tex` do template deve incluir as partes nesta ordem:

```latex
\input{config/packages}       % pacotes
\input{config/metadata}       % GERADO — define as macros \lg*
\input{config/style}          % do usuario — pode sobrescrever as macros
\input{config/docinfo}        % mapeia \lg* para os comandos da classe
\input{config/bibliography}   % GERADO — backend escolhido
```

`style.tex` vem antes de `docinfo.tex` de proposito: e o que permite ao usuario
escrever `\renewcommand{\lgTitle}{Titulo com $\alpha$}` e ver o efeito no
titulo de verdade.

## 5. Bibliografia

Se `features.bibliography` for `true`, o scaffold copia uma das variantes de
`templates/_shared/bib/` para `config/bibliography.tex`. As duas definem
`\lgPrintBibliography`, e o `main.tex` chama so essa macro — assim o mesmo
template serve para os dois backends.

No texto de exemplo, use `\cite` e `\citeonline`: a variante `biblatex`
redefine `\citeonline` sobre o `\textcite`, entao os dois backends aceitam os
mesmos comandos.

Inclua no `bib/references.bib` apenas entradas que o texto de exemplo cita.
Entradas orfas fazem `latexgen check` avisar num projeto recem-criado, e um dos
testes de integracao exige que ele nasca limpo.

## 6. Verificacao

```bash
node --test "test/integration/*.test.js"
```

A suite descobre os templates sozinha: basta a pasta existir para que ela gere
o projeto, compile o PDF com abntex2cite e com biblatex, e confira que o
`check` passa. Nao ha nada a registrar em nenhuma lista.

Antes disso, para iterar rapido no LaTeX sem passar pela CLI:

```bash
npx latexgen new <id> /tmp/prova --yes --title "Teste" --author "Autor" --institution "UFX"
cd /tmp/prova && npx latexgen build --verbose
```
