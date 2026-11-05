---
name: novo-video
description: Começa a edição de um vídeo com o kit do Creator Hub. Mostra a ficha do vídeo, corta o bruto, escreve as legendas na marca da pessoa, monta o mapa de edição, abre a prévia e só renderiza com aprovação. Use quando a pessoa digitar /novo-video, colar "/novo-video estilo: <estilo>" vindo da vitrine, disser que tem vídeo novo ou pedir para legendar ou editar um vídeo.
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
| Tipo de edição | Edição completa (bruto: corte, legenda e mapa de edição) · Só legenda (vídeo já editado) |
| Estilo | os estilos prontos, com o nome e o resumo que a ferramenta devolveu, o Padrão da marca primeiro como recomendado |
| Música (na edição completa) | Sem música · Vou escolher um arquivo. A música é da pessoa: peça o caminho do arquivo |

Só use estilos que a ferramenta listou como prontos. Se a pessoa pedir um estilo que está "a caminho", diga que ainda não chegou ao kit dela.

Crie a pasta do vídeo em `~/Edicoes/<Cliente>/<Mês>/<nome-sem-acento>/`. Escreva `project.md` nela, começando por "Estado atual", e atualize a cada etapa.

Rode os comandos que as ferramentas devolvem exatamente como vieram, na pasta indicada, sem acrescentar nada a eles. Edite os arquivos com a sua ferramenta de edição, nunca com um script: script pede permissão à pessoa a cada vez. Nunca escreva à mão um arquivo que uma ferramenta gera.

## 3. Edição completa

Vá até o fim destes passos e depois siga para "Mapa, prévia e render".

**Preparar o bruto.** A primeira transcrição do computador baixa o modelo e pode demorar. Avise antes.

```bash
bash "${CLAUDE_PLUGIN_ROOT}/ferramentas/preparar_corte.sh" "<bruto>" "<pasta-do-video>" "<pasta-do-cliente>" "<id-do-estilo>"
```

**Escolher os takes.** Chame `analisar_falas` e rode o comando na pasta `1-corte`. Leia o `falas.txt` inteiro e escreva o `takes.json` no formato que o comando mostrou.

- Não use fala marcada como `fundo`: costuma ser a voz de quem está gravando. Confira as marcadas como `duvida` pelo contexto.
- Entre tentativas da mesma frase, prefira a mais completa e firme. A última costuma ser a melhor.
- Se a gravação acaba no meio de uma fala, não use esse take.
- A ordem do `takes.json` é a ordem do vídeo final.

**Cortar.** Chame `decidir_cortes` e rode o comando na pasta `1-corte`. Leia os avisos: se apontarem algum problema, ajuste o `takes.json`, chame a ferramenta de novo e rode o novo comando. Depois:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/ferramentas/cortar.sh" "<pasta-do-video>"
```

**Conferir o corte e preparar as legendas.** Sem música, omita o último argumento:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/ferramentas/preparar_depois_do_corte.sh" "<pasta-do-video>" "<pasta-do-cliente>" "<id-do-estilo>" "<arquivo-da-musica>"
```

Leia o texto de `2-legendas/transcript.json` e compare com as falas do `takes.json`. Se faltar uma palavra no começo de um trecho, use `"forcar_inicio": true` nesse take; se faltar no fim, aumente o `fim`. Se uma palavra sair partida ou diferente, ponha a pausa daquele ponto em `"nao_cortar"` nesse take. Se sobrar voz de bastidor, encurte o take. Nesses casos, volte a "Cortar".

**Roteiro.** Chame `rascunhar_roteiro` e rode o comando na pasta `2-legendas`, uma vez só por vídeo. Revise como em "Revisar o roteiro".

**Gerar.** Chame `gerar_legendas` com `modo: "com-video"` e rode o comando na pasta `2-legendas`.

- Se ele mostrar um erro, corrija o roteiro e rode o mesmo comando de novo.
- Se ele mostrar uma conferência com ajustes, corrija o roteiro e chame `gerar_legendas` de novo, porque o pedido já fechou.

Só use tela de impacto em frase de virada e quando a pessoa não estiver mostrando nada com as mãos.

Confira a margem e corrija o que sair dela:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/ferramentas/medir_margens.sh" "<pasta-do-video>/2-legendas"
```

## 4. Só legenda

Vá até o fim destes passos e depois siga para "Prévia e render do só legenda".

**Preparar.** A primeira transcrição do computador baixa o modelo e pode demorar. Avise antes.

```bash
bash "${CLAUDE_PLUGIN_ROOT}/ferramentas/preparar_legenda.sh" "<video>" "<pasta-do-video>" "<pasta-do-cliente>" "<id-do-estilo>"
```

**Roteiro.** Chame `rascunhar_roteiro` e rode o comando na pasta `2-legendas`, uma vez só por vídeo. Revise como em "Revisar o roteiro".

**Gerar.** Chame `gerar_legendas` com `modo: "so-legenda"` e rode o comando na pasta `2-legendas`.

- Se ele mostrar um erro, corrija o roteiro e rode o mesmo comando de novo.
- Se ele mostrar uma conferência com ajustes, corrija o roteiro e chame `gerar_legendas` de novo, porque o pedido já fechou.

Confira a margem e corrija o que sair dela:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/ferramentas/medir_margens.sh" "<pasta-do-video>/2-legendas"
```

## Revisar o roteiro

Siga as instruções do topo do `roteiro-legendas.txt` e as metas que o comando mostrou.

- Corrija a grafia só onde o Whisper errou um nome: as palavras precisam continuar as mesmas e na mesma ordem do `transcript.json`. Nomes recorrentes vão em `correcoes` no `marca.json` do cliente; depois disso, rode o preparo de novo.
- Escolha os destaques pelo sentido da frase: a palavra que a pessoa enfatiza, o número, o conceito.
- Ponha as marcações em palavras seguidas de pausa, nunca na frase de abertura colada na seguinte.
- Se ouvir no texto a voz de quem está gravando ("de novo", "boa", instruções), comece essa linha com `~`.

## Mapa, prévia e render

**Mapa.** Escreva `2-legendas/mapa.json`:

```json
{ "titulo": "<título>", "cliente": "<cliente>", "video": "2-legendas/assets/video.mp4", "notas": [] }
```

Em `notas`, ponha as decisões que não estão na comp, como a música: `{ "t": 0, "tipo": "musica", "o_que": "<música>", "por_que": "<motivo>" }`. Chame `montar_mapa` e rode o comando na pasta `2-legendas`. Se um motivo sair genérico, troque em `ajustes`, como o comando mostra, e rode de novo.

Diga à pessoa para abrir o `mapa.html`, na pasta do vídeo, com dois cliques. Explique em 3 ou 4 linhas o que vai acontecer no vídeo e espere ela aprovar ou pedir ajustes, como "no 0:23 tira o zoom". A cada ajuste, atualize o roteiro, gere de novo e monte o mapa de novo.

**Prévia.**

```bash
bash "${CLAUDE_PLUGIN_ROOT}/ferramentas/previa.sh" "<pasta-do-video>/2-legendas"
```

Abra `http://localhost:30710` no painel do navegador. Diga que basta apertar o play, ignorando os outros botões da tela. Espere a pessoa aprovar.

**Render.** Só com a aprovação:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/ferramentas/renderizar.sh" "<pasta-do-video>" "<pasta-do-cliente>/<Mês>/Prontos/<nome>.mp4"
```

Confira as linhas de duração, volume e último quadro no fim da saída. Atualize o `project.md` e diga em uma linha onde está o arquivo. O bruto nunca é alterado.

## Prévia e render do só legenda

**Prévia.** Para a pessoa ver a legenda sobre o vídeo, chame `gerar_legendas` com `modo: "com-video"` e rode o comando. Ignore a conferência desse resultado, porque ela já foi feita. Depois:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/ferramentas/previa.sh" "<pasta-do-video>/2-legendas"
```

Abra `http://localhost:30710` no painel do navegador. Diga em 2 ou 3 linhas o que entrou no vídeo e que basta apertar o play, ignorando os outros botões da tela. Espere a pessoa aprovar ou pedir ajustes. A cada ajuste, volte a "Gerar".

**Render.** Só com a aprovação. Chame `gerar_legendas` com `modo: "so-legenda"`, rode o comando e depois:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/ferramentas/legendar.sh" "<pasta-do-video>"
```

Confira as linhas de duração e do último quadro no fim da saída. Atualize o `project.md` e diga em uma linha onde está o arquivo. O vídeo original nunca é alterado.
