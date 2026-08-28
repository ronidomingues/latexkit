# Como contribuir

## Rodando o projeto

Nao ha dependencias de runtime; as de desenvolvimento sao o TypeScript (so
para conferir tipos) e os tipos do Node.

```bash
git clone https://github.com/ronidomingues/latexgen.git
cd latexgen
npm install

npm run test:unit          # rapido, nao precisa de LaTeX
npm run typecheck
npm run test:integration    # gera e compila cada template de verdade
```

Para experimentar a CLI sem instalar nada:

```bash
node bin/latexgen.js new article /tmp/prova --yes \
  --title "Teste" --author "Autor" --institution "UFX" --city "Cidade"
cd /tmp/prova && node /caminho/para/latexgen/bin/latexgen.js build --verbose
```

## O que voce precisa instalado

O minimo e Node 20.10 e uma instalacao de LaTeX com `abntex2`. Rode
`node bin/latexgen.js doctor` para ver o que falta na sua maquina e como
instalar.

Os testes de integracao pulam sozinhos o que o ambiente nao tem: sem Pandoc,
os de Markdown; sem Tectonic, os dele; sem `biblatex-abnt`, os desse backend.
Nenhum deles falha por ausencia de ferramenta — se um teste falhar, e defeito
de verdade.

## Adicionando um template

Veja [docs/templates.md](docs/templates.md). O resumo: crie
`templates/<id>/` com um `template.json` e os arquivos do documento. Nao ha
codigo a escrever nem lista a atualizar — a CLI descobre o template pela pasta,
as flags de metadado saem do manifesto e a suite de integracao passa a cobrir
o template novo sozinha.

Duas regras valem sempre:

1. **Nenhum `.tex` de template contem placeholder `{{...}}`.** Chaves sao
   sintaxe de LaTeX. Todo dado variavel chega pelas macros `\lg*` geradas em
   `config/metadata.tex`. Assim todo template compila sozinho, o que torna os
   testes triviais.
2. **O `bib/references.bib` do template so tem entradas que o texto de exemplo
   cita.** Um dos testes exige que um projeto recem-criado passe no `check`
   sem erros, e entradas orfas geram aviso.

## Codigo

- JavaScript ESM puro, com tipos em JSDoc conferidos por `tsc --noEmit`.
- Sem dependencias de runtime. E o que mantem o `npx latexgen` instantaneo;
  antes de acrescentar uma, verifique se o Node ja resolve (`util.parseArgs`,
  `node:test`, `readline/promises`, `fs.cpSync`).
- Ao usar uma API recente do Node, confira desde quando ela existe. O minimo
  suportado e o 20.10, e o CI roda a suite unitaria a partir dele — foi assim
  que se descobriu que `util.styleText` so nasceu no 20.12.
- Comentarios explicam **por que**, nao o que. Se um trecho nao e obvio, o
  comentario deve dizer o que se perderia ao simplifica-lo.
- Mensagens de erro dizem o que fazer em seguida. Compare:
  `File abnt.bbx not found` contra `Faltam 1 pacote(s) LaTeX (...). Instale
  com: sudo apt install texlive-bibtex-extra`.

## Antes de abrir um PR

```bash
npm run typecheck && npm test
```

Se a mudanca altera o comportamento visivel, atualize o `CHANGELOG.md` em
`[Nao publicado]`.

## Publicando (mantenedores)

```bash
npm version <patch|minor|major>   # atualiza package.json e cria a tag
npm publish                       # prepublishOnly roda typecheck + unit
git push --follow-tags
```

O `npm publish` nao roda os testes de integracao, que precisam de LaTeX. Rode
`npm test` completo antes, ou confira que o CI passou no commit que voce vai
publicar.
