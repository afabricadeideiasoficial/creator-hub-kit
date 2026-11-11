---
name: mascote-3d
description: Faz vídeos verticais em 3D low-poly de histórias "e se?" com o mascote do canal da pessoa, do tema ao MP4 para postar, e cria esse mascote por escolhas ou a partir de uma selfie. Use quando a pessoa pedir "vídeo com mascote", "mascote 3D", "e se o mundo...", "o que aconteceria se...", "próximo episódio", "cria meu mascote", "faz um mascote com a minha selfie" ou digitar /mascote-3d. Não serve para vídeo com a pessoa gravada: isso é /novo-video.
---

# Vídeo com mascote 3D

Cada vídeo é uma história inventada que responde a um "e se?", em 3D low-poly vertical, com o mascote do canal como protagonista.

Quem usa isto nem sempre é técnico. Fale em português simples e mostre as escolhas em cartões. Nunca peça para a pessoa escrever um prompt nem abrir o Terminal.

O caminho tem pontos de aprovação de propósito: roteiro, voz e animação dependem um do outro, e um erro aprovado cedo vira retrabalho depois.

Rode os comandos que as ferramentas devolvem exatamente como vieram, sem acrescentar nada a eles. Cada comando de ferramenta vale 10 minutos e uma vez só: se o `curl` responder que o pedido não existe ou venceu, chame a mesma ferramenta de novo. Para conferir, use só os scripts do kit, e não comandos próprios como `ls`, `ffmpeg` ou `node`: cada um abre uma janela de permissão para a pessoa. Se faltar uma informação, diga isso à pessoa em vez de improvisar.

Se uma ferramenta do kit disser que o Creator Hub não está ativo ou que o Mascote 3D não está liberado, mostre a mensagem e pare. Se o Claude pedir login no conector, diga para a pessoa digitar `/mcp` e escolher `fabrica`.

## 1. Instalar o formato

```bash
bash "${CLAUDE_PLUGIN_ROOT}/ferramentas/mascote/instalar_mascote.sh"
```

Se ele disser que falta, chame `baixar_mascote`, rode o comando que ela devolver e rode o script de novo.

Daqui em diante, as ferramentas são o `mascote.sh`, sempre assim:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/ferramentas/mascote/mascote.sh" <comando> <argumentos>
```

O guia das cenas fica em `~/.creator-hub/mascote-3d/references/cenas.md`, e os modelos das fichas em `~/.creator-hub/mascote-3d/assets/template/`.

## 2. O canal

Todo vídeo pertence a um canal: uma pasta `~/Edicoes/<Canal>/` com duas fichas.

- `canal.json`: nome do canal, nome do mascote, tema, duração máxima, voz e correções de nome para a transcrição. Leia as `notas`: elas trazem o que já deu errado naquele canal.
- `mascote.js`: o visual do mascote.

Se a pessoa já tem canal, use o dela; com mais de um, pergunte qual. Se não tem, crie: leia o modelo `canal.json` e escreva a ficha na pasta do canal, com nome do canal, nome do mascote e tema perguntados num cartão. A voz fica para a etapa 5.

## 3. O mascote

A ficha `mascote.js` define cor da pele e das manchas, cabelo (mullet, curto, longo, cacheado, social, raspado ou careca), rosto (bigode, barba, cavanhaque ou nenhum, e o tipo de bigode), cor das sobrancelhas e dos olhos, óculos (nenhum, redondo ou quadrado), chapéu (boné, gorro ou nenhum), o texto do boné e as cores da roupa. Os comentários do modelo explicam cada campo.

Pergunte num cartão se a pessoa quer montar o mascote por escolhas ou a partir de uma selfie. Leia o modelo `mascote.js` e escreva a ficha em `~/Edicoes/<Canal>/mascote.js`.

**A partir de uma selfie.** Peça uma selfie de frente, com o rosto bem iluminado e sem filtro. O mascote sai com as cores reais da pessoa e com o tipo de cabelo, de barba e de óculos dela. A cabeça continua um planetinha e os olhos continuam grandes de desenho: fica parecido, não é um rosto clonado. Diga que a foto não sai do computador.

1. Gere a foto com grade e olhe para ela:
   ```bash
   bash "${CLAUDE_PLUGIN_ROOT}/ferramentas/mascote/mascote.sh" cores "<selfie>"
   ```
2. Escolha pontos na imagem da grade (`<selfie>-grade.jpg`) e meça as cores:
   ```bash
   bash "${CLAUDE_PLUGIN_ROOT}/ferramentas/mascote/mascote.sh" cores "<selfie>" testa=x,y bochecha=x,y cabelo=x,y barba=x,y camiseta=x,y
   ```
   Pegue a pele na testa e na bochecha e use um tom no meio, porque luz e sombra mudam a cor. Sobrancelha fina demais para medir fica na cor do cabelo. Olhos: estime pela foto (castanho-escuro `#3b2618`, castanho `#6b4423`, verde `#4a7a4a`, azul `#3b6ea5`).
3. Escolha os tipos olhando a foto: o curto com volume em cima é "social"; com barba ou cavanhaque, o bigode fino já vem junto. A calça e o calçado não aparecem na selfie: pergunte ou use cores neutras.

**Prévia do mascote.** Mostre a imagem com as 5 vistas (com selfie, acrescente `--foto "<selfie>"` e mostre também a comparação lado a lado):

```bash
bash "${CLAUDE_PLUGIN_ROOT}/ferramentas/mascote/mascote.sh" ver "$HOME/Edicoes/<Canal>/mascote.js"
```

Ajuste a ficha e gere de novo até a pessoa aprovar. Para mudar o mascote depois, mude a ficha do canal.

## 4. Roteiro (pare e peça aprovação)

Siga `references/roteiro.md`, com o tema, o mascote e a duração do `canal.json`. Crie a pasta do vídeo em `~/Edicoes/<Canal>/<Mês>/video-NN-nome/` e escreva nela:

- `roteiro.md`: tabela cena a cena com tempo, fala, animação e o que prende a atenção
- `narracao.txt`: só o texto falado, com números por extenso

Mostre o roteiro inteiro, com a duração estimada. Só siga depois da aprovação: mudar o texto depois exige gerar a voz de novo. Escreva também o `project.md`, começando por "Estado atual", e atualize a cada etapa.

## 5. Projeto e voz

```bash
bash "${CLAUDE_PLUGIN_ROOT}/ferramentas/mascote/mascote.sh" novo "<pasta-do-video>"
```

A voz é a do canal (`voz` no `canal.json`). Pergunte num cartão:

- **A pessoa gera e manda o arquivo:** ela cola o `narracao.txt` na voz dela no ElevenLabs (ou grava a própria voz) e manda o arquivo. Diga a ela os ajustes da voz do canal, como em `references/voz.md`: modelo, estabilidade, similaridade e, no clone profissional, a força do clone. Salve como `assets/narracao.mp3`.
- **Você gera pelo navegador:** só se o Claude in Chrome estiver ligado e logado na conta dela. Siga `references/voz.md`.

Cada vídeo de 2 minutos gasta perto de 1.400 créditos do ElevenLabs: confirme antes de gerar de novo.

## 6. Transcrever

A primeira transcrição do computador baixa o modelo e pode demorar. Avise antes.

```bash
bash "${CLAUDE_PLUGIN_ROOT}/ferramentas/mascote/mascote.sh" transcrever "<pasta-do-video>"
```

Compare o `transcript.json` com o `narracao.txt`. A transcrição erra nomes e pode trocar palavras: corrija nomes em `correcoes` no `video.json` (se o erro for de sempre, também no `canal.json`) e avise a pessoa quando houver diferença de sentido, porque só ela consegue ouvir o áudio. Os tempos das cenas saem desse arquivo, não da estimativa do roteiro. Ponha no `video.json` o `duracao_voz` que o script mostrou e a `duracao` com uns 3 s a mais, para dar tempo de ler as opções A e B.

## 7. Cenas

Leia o guia `~/.creator-hub/mascote-3d/references/cenas.md` antes de escrever. Tudo é desenhado em `assets/film.js`, em função do tempo; os capítulos, cards, carimbos, balões, opções A e B e sons ficam no `video.json`. Se o pacote trouxer `~/.creator-hub/mascote-3d/assets/exemplo/`, reaproveite os cenários de lá.

**Prévia de 3 cenas (pare e peça aprovação).** Antes de animar tudo, construa só o gancho, o dilema e o final. Monte e abra a prévia:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/ferramentas/mascote/mascote.sh" montar "<pasta-do-video>"
```

```bash
bash "${CLAUDE_PLUGIN_ROOT}/ferramentas/previa.sh" "<pasta-do-video>"
```

Abra no painel do navegador o endereço da última linha. Diga que basta apertar o play, ignorando os outros botões da tela. Isso mostra cedo se o visual e o tom estão certos. Depois construa o resto.

**Conferir.** Tire fotos de todas as cenas e olhe cada uma: uma checagem sem erro não mostra se a câmera entrou na cabeça de alguém ou se a legenda cobriu a boca do mascote.

```bash
bash "${CLAUDE_PLUGIN_ROOT}/ferramentas/plano/fotos.sh" "<pasta-do-video>" "<tempos separados por vírgula>"
```

## 8. Som

Trilha de tensão feita aqui, sem custo e sem crédito de autoria:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/ferramentas/mascote/mascote.sh" trilha "<pasta-do-video>/assets/sfx/bed-1.mp3" 40 --fade-in 2 --fade-out 1.2
```

Deixe silêncio nos momentos de maior tensão. Os efeitos do kit ficam em `~/.creator-hub/efeitos` (se faltarem, `baixar_efeitos`). Música, só uma que a pessoa mandar.

## 9. Entregar

Monte de novo, abra a prévia e espere a aprovação. Só então renderize, nunca por cima de um vídeo aprovado (o script recusa; use `-v2`, `-v3`). Ele também faz uma cópia leve para ver no celular:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/ferramentas/mascote/mascote.sh" renderizar "<pasta-do-video>" "$HOME/Edicoes/<Canal>/<Mês>/Prontos/<nome>.mp4"
```

```bash
bash "${CLAUDE_PLUGIN_ROOT}/ferramentas/abrir.sh" "$HOME/Edicoes/<Canal>/<Mês>/Prontos/<nome>.mp4"
```

Diga o que foi conferido e o que não foi. Você não ouve o áudio: peça para a pessoa assistir com som antes de postar. Atualize o `project.md` e diga em uma linha o caminho completo do arquivo. Nunca escreva link para o arquivo: o app procura o link a partir da pasta da sessão, e ele quebra.

## O que não muda de um vídeo para outro

- Ficção "e se?", com no máximo a duração do `canal.json` (padrão: 2 minutos)
- Vertical 1080x1920, 30 quadros por segundo
- Protagonista: o mascote do canal, com `makeRig(cena, { mascote: true })`. Não redesenhe; um prop feito à mão com a pele do mascote (mão, pé) usa `mascotePele.skin` e `mascotePele.emissive`
- A voz do canal
- Legenda palavra a palavra, com palavras-chave em amarelo
- Final com pergunta ao espectador e opções A e B na tela até o último quadro

## Limites

- Confirme antes de gastar créditos além do combinado, como muitas regenerações de voz.
- Não invente o que a pessoa "combinou". Se não achar o registro, diga isso e pergunte.
- Publicar é com a pessoa. A skill termina no MP4 pronto.
