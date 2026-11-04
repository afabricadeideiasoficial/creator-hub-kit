---
name: novo-video
description: Começa a edição de um vídeo com o kit do Creator Hub. Mostra a ficha do vídeo, escreve as legendas na marca da pessoa, abre a prévia e só renderiza com aprovação. Use quando a pessoa digitar /novo-video, colar "/novo-video estilo: <estilo>" vindo da vitrine, disser que tem vídeo novo ou pedir para legendar ou editar um vídeo.
---

# Novo vídeo

Quem usa isto nem sempre é técnico. Fale em português simples e mostre as escolhas em cartões. Nunca peça para a pessoa escrever um prompt nem abrir o Terminal.

Se a pasta do vídeo já tem `project.md`, leia o "Estado atual" e continue de onde parou. Não refaça a ficha.

Se uma ferramenta do kit disser que o Creator Hub não está ativo, mostre a mensagem com o link e pare. Se o Claude pedir login no conector, diga para a pessoa digitar `/mcp` e escolher `fabrica`.

## 1. Achar o vídeo

- Se a pessoa disse qual, use esse.
- Senão, procure em `~/Edicoes/*/*/Brutos/` os vídeos que ainda não têm pasta de projeto. Se houver mais de um, pergunte qual na ficha.
- Se não houver nenhum, explique onde colocar: `~/Edicoes/<Cliente>/<Mês>/Brutos/`, com o mês em português e maiúscula.
- Se o cliente ainda não tem pasta em `~/Edicoes`, ou se a pasta não tem `marca.json`, use a skill `cliente-novo` antes de continuar.

## 2. A ficha

Chame `listar_estilos`. Depois faça uma única chamada de `AskUserQuestion`, pulando o que já estiver respondido:

| Pergunta | Opções |
|---|---|
| Cliente | as pastas de cliente em `~/Edicoes` |
| Tipo de edição | Só legenda (vídeo já editado) |
| Estilo | os estilos prontos, com o nome e o resumo que a ferramenta devolveu, o Padrão da marca primeiro como recomendado |

Só use estilos que a ferramenta listou como prontos. Se a pessoa pedir um estilo que está "a caminho" ou corte de vídeo bruto, diga que ainda não chegou ao kit dela e ofereça a legenda.

## 3. Preparar

Crie a pasta do vídeo em `~/Edicoes/<Cliente>/<Mês>/<nome-sem-acento>/` e rode:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/ferramentas/preparar_legenda.sh" "<video>" "<pasta-do-video>" "<pasta-do-cliente>" "<id-do-estilo>"
```

A primeira transcrição do computador baixa o modelo e pode demorar. Avise antes.

Escreva `project.md` na pasta do vídeo, começando por "Estado atual", e atualize a cada etapa.

## 4. Roteiro

Chame `rascunhar_roteiro` e rode o comando que ela devolver, na pasta `2-legendas`, uma vez só por vídeo.

Revise `roteiro-legendas.txt` seguindo as instruções do topo do arquivo e as metas que o comando mostrou:

- Corrija a grafia só onde o Whisper errou um nome: as palavras precisam continuar as mesmas e na mesma ordem do `transcript.json`. Nomes recorrentes vão em `correcoes` no `marca.json` do cliente.
- Escolha os destaques pelo sentido da frase: a palavra que a pessoa enfatiza, o número, o conceito.
- Se ouvir no texto a voz de quem está gravando ("de novo", "boa", instruções), comece essa linha com `~`.

## 5. Gerar

Chame `gerar_legendas` com `modo: "so-legenda"` e rode o comando na pasta `2-legendas`. Se ele mostrar um erro ou uma conferência com ajustes, corrija o roteiro e rode o mesmo comando de novo enquanto o pedido valer. Passados 10 minutos, chame a ferramenta outra vez.

Nunca escreva o `index.html` à mão.

## 6. Prévia

Confira a margem e corrija o que sair dela:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/ferramentas/medir_margens.sh" "<pasta-do-video>/2-legendas"
```

Depois abra a prévia:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/ferramentas/previa.sh" "<pasta-do-video>/2-legendas"
```

Abra `http://localhost:30710` no painel do navegador. Diga em 2 ou 3 linhas o que entrou no vídeo e espere a pessoa aprovar ou pedir ajustes. A cada ajuste, volte ao passo 5.

## 7. Render

Só com a aprovação:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/ferramentas/legendar.sh" "<pasta-do-video>"
```

Confira as linhas de duração e do último quadro no fim da saída. Atualize o `project.md` e diga em uma linha onde está o arquivo. O vídeo original nunca é alterado.
