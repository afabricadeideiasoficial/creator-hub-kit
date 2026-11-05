---
name: plano-continuo
description: Faz um vídeo animado em plano contínuo, sem filmagem, em cima de uma narração que a pessoa manda. Uma câmera só passeia por um mundo de papel, interface ou quadro, e cada cena nasce da anterior, sincronizada com as palavras da narração. Use quando a pessoa pedir "vídeo animado", "plano contínuo", "explicador animado", "vídeo sem rosto", digitar /plano-continuo ou escolher um estilo de vídeo animado. Não serve para editar vídeo com a pessoa na tela: isso é /novo-video.
---

# Vídeo animado

Quem usa isto nem sempre é técnico. Fale em português simples e mostre as escolhas em cartões. Nunca peça para a pessoa escrever um prompt nem abrir o Terminal.

Se a pasta do vídeo já tem `project.md`, leia o "Estado atual" e continue de onde parou. Não refaça a ficha.

Se uma ferramenta do kit disser que o Creator Hub não está ativo, mostre a mensagem com o link e pare. Se o Claude pedir login no conector, diga para a pessoa digitar `/mcp` e escolher `fabrica`.

A voz é sempre a narração que a pessoa manda: áudio do celular, gravador ou vídeo. Se ela não tiver narração, peça para gravar. Rode os comandos que as ferramentas devolvem exatamente como vieram, na pasta indicada, sem acrescentar nada a eles. Para conferir, use só os scripts do kit, e não comandos próprios como `ls`, `ffmpeg` ou `node`: cada um abre uma janela de permissão para a pessoa. Se faltar uma informação, diga isso à pessoa em vez de improvisar.

## 1. A ficha

Chame `listar_estilos` e use só os estilos marcados como vídeo animado. Depois faça uma única chamada de `AskUserQuestion`, pulando o que já estiver respondido:

| Pergunta | Opções |
|---|---|
| Cliente | as pastas de cliente em `~/Edicoes` |
| Estilo | os estilos animados, com o nome e o resumo que a ferramenta devolveu |
| Legenda da narração | Sem legenda, porque o texto das cenas já conta a história (recomendado) · Com legenda |
| Música | Sem música · Vou escolher um arquivo. A música é da pessoa: peça o caminho do arquivo |

Se o cliente ainda não tem pasta em `~/Edicoes`, ou se a pasta não tem `marca.json`, use a skill `cliente-novo` antes.

Crie a pasta do vídeo em `~/Edicoes/<Cliente>/<Mês>/<nome-sem-acento>/`. Escreva `project.md` nela, começando por "Estado atual", e atualize a cada etapa.

## 2. Preparar a narração

Confira os efeitos sonoros, que trazem o som das viagens de câmera:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/ferramentas/instalar_efeitos.sh"
```

Se ele disser que faltam, chame `baixar_efeitos`, rode o comando que ela devolver e rode este script de novo.

A primeira transcrição do computador baixa o modelo e pode demorar. Avise antes. Acrescente `--legenda` e `--musica "<arquivo>"` conforme a ficha:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/ferramentas/plano/preparar_plano.sh" "<narração>" "<pasta-do-video>" "<pasta-do-cliente>" "<id-do-estilo>"
```

Mostre o texto transcrito e corrija palavras erradas no `plano/transcript.json`, porque as cenas se prendem nelas.

Se a narração tiver erros, pausas longas ou repetições, corte antes pelo caminho de corte da skill `novo-video` e prepare de novo com o `1-corte/edited_voz.mp4` e `--sem-tratar`.

## 3. Escrever as cenas

Leia a transcrição inteira e divida em ideias. Escreva `plano/cenas.txt`: o formato está nos comentários do topo dele.

- **Uma ideia por cena**, de 2 a 4 s. O texto da tela é o essencial da frase, de 3 a 6 palavras, nunca a frase inteira. Pode reescrever com as palavras da pessoa.
- **Comece a cena na palavra-chave** da ideia, não no "e", "então" ou "que".
- **Texto principal sem @:** ele já está lá quando a câmera chega. Use `@palavra` só para itens de lista, números que contam e um segundo texto.
- **Profundidade:** pelo menos 2 mergulhos ou recuos; nunca 3 transições iguais seguidas, nem 3 tipos de cena iguais seguidos; `corte` quase nunca.
- **Mergulho** só sai de cena com portal natural: o anel do número, um cartão, a tela do celular, o nó central da rede ou a `*palavra*` destacada.
- **Recuo** revela o contexto: a cena anterior encolhe e vira a tela do celular, o cartão ou o nó da cena nova.
- **Destaque** `*palavra*` de 1 a 3 palavras, uma ou duas por cena no máximo.
- **Fecho** na última ideia. O nome da marca entra sozinho depois do texto.

## 4. Gerar e conferir

Chame `plano_continuo` e rode o comando na pasta `plano`. Resolva todos os avisos de ritmo mexendo nas palavras de início das cenas e nas transições. Depois de um ajuste, chame a ferramenta de novo, porque o pedido já fechou.

Confira a margem e corrija o que sair dela:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/ferramentas/medir_margens.sh" "<pasta-do-video>/plano"
```

Tire fotos e olhe cada uma: o meio de cada mergulho, cerca de 0,3 s antes da palavra da cena nova; o começo de cada recuo; e a última cena, em que a marca aparece.

```bash
bash "${CLAUDE_PLUGIN_ROOT}/ferramentas/plano/fotos.sh" "<pasta-do-video>/plano" "<tempos separados por vírgula>"
```

## 5. Prévia e render

**Prévia.**

```bash
bash "${CLAUDE_PLUGIN_ROOT}/ferramentas/previa.sh" "<pasta-do-video>/plano"
```

Abra no painel do navegador o endereço que o script mostrar na última linha: ele muda quando já há outra prévia aberta. Diga que basta apertar o play, ignorando os outros botões da tela. Espere a pessoa aprovar ou pedir ajustes.

**Render.** Só com a aprovação. O rastro de movimento deixa a câmera mais natural, e o render leva umas 4 vezes mais tempo:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/ferramentas/plano/renderizar_plano.sh" "<pasta-do-video>/plano" "<pasta-do-cliente>/<Mês>/Prontos/<nome>.mp4" --desfoque
```

Confira as linhas de duração, volume e último quadro no fim da saída. Depois abra o vídeo para a pessoa:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/ferramentas/abrir.sh" "<pasta-do-cliente>/<Mês>/Prontos/<nome>.mp4"
```

Atualize o `project.md` e diga em uma linha o caminho completo do arquivo. Nunca escreva link para o arquivo: o app procura o link a partir da pasta da sessão, e ele quebra.
