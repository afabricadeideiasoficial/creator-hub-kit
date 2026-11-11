---
name: referencia
description: Transforma um vídeo de referência, por arquivo ou link, num estilo de edição seu, para usar no /novo-video. Copia o jeito de editar (legenda, ritmo, movimento, telas e som), nunca o conteúdo. Use quando a pessoa digitar /referencia, mandar um vídeo ou um link dizendo "quero nesse estilo", "edita igual a esse", "copia esse estilo", "analisa essa referência" ou "cria um estilo a partir desse vídeo", ou pedir para mudar um estilo que ela já criou.
---

# Referência vira estilo

Quem usa isto nem sempre é técnico. Fale em português simples e mostre as escolhas em cartões. Nunca peça para a pessoa escrever um prompt nem abrir o Terminal.

O objetivo é copiar o **jeito de editar**, nunca o conteúdo. Os textos, as imagens, a música, os logos e a marca da referência não entram em vídeo nenhum. O estilo novo usa a marca da pessoa.

Para mostrar um arquivo à pessoa, rode `abrir.sh`, que abre o arquivo sozinho, e cite o caminho completo que ele mostrar. Nunca escreva link para o arquivo.

Se uma ferramenta do kit disser que o Creator Hub não está ativo, mostre a mensagem com o link e pare. Se o Claude pedir login no conector, diga para a pessoa digitar `/mcp` e escolher `fabrica`.

**Para conferir, use só os scripts do kit.** Não rode comandos próprios, como `ls`, `cat`, `cp`, `mv`, `ffmpeg` ou `node`: cada um abre uma janela de permissão para a pessoa. Rode cada script sozinho, sem variável antes e sem `|`, `;` ou `&&`. Para ver o que há numa pasta, use a sua ferramenta de busca de arquivos. Para ler um arquivo ou olhar uma imagem, use a sua ferramenta de leitura de arquivos.

Os estilos da pessoa ficam em `~/Edicoes/Estilos/<id>/`, um por pasta. O `<id>` vai sem acento, sem espaço e em minúsculas, com hífen, como `legenda-amarela`.

## 1. Liberar

Chame `ler_receita` com `estilo: "estilo-proprio"`.

- Se a resposta disser que ainda não liberou, mostre a data e pare: a cópia de estilos chega junto com os estilos com receita.
- Senão, guarde a resposta. Ela traz as regras do arquivo do vídeo e o guia "Criar um estilo a partir de uma referência", que valem até o fim.

## 2. Pegar o vídeo

Se a pessoa ainda não mandou, peça o link ou o arquivo do vídeo. Uma referência por estilo: se ela mandou duas, pergunte qual vale, ou faça dois estilos.

Escolha um id provisório, como `referencia-1`, e confira com a busca de arquivos que `~/Edicoes/Estilos/<id>/` ainda não existe. A `<pasta-do-estilo>` é o caminho completo dessa pasta, com a pasta da pessoa no lugar do `~`. Depois rode:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/ferramentas/referencia/analisar.sh" "<arquivo ou link>" "<pasta-do-estilo>"
```

- Avise antes: a primeira vez instala o baixador de vídeos, e a transcrição pode demorar.
- Se o link não baixar, peça para a pessoa salvar o vídeo no computador e dizer onde ele está. Com o Instagram isso é comum.
- O original nunca é alterado: o script guarda uma cópia na pasta do estilo.

## 3. Olhar e descrever

Abra, com a ferramenta de leitura, o `analise/analise.json` e todas as imagens da pasta `analise`: `folha.jpg`, `cortes.jpg`, `gancho.jpg` e `quadro-01.jpg` a `quadro-04.jpg`. Anote cada parte que o guia do `ler_receita` pede para olhar, com números: tamanhos, posições em porcentagem da altura e tempos.

Para a legenda e os títulos, escolha a fonte mais parecida destas, que o kit traz:

| Jeito da letra | Fonte |
|---|---|
| condensada em caixa alta | Bebas Neue, Anton, Barlow Condensed SemiBold ou Bold |
| grossa e redonda, a mais comum em vídeo curto | Poppins ExtraBold, Inter ExtraBold |
| limpa, de aplicativo | Inter Bold, Poppins Medium, SemiBold ou Bold, Montserrat SemiBold |
| com serifa, de revista | Libre Baskerville Regular, Bold ou Italic |
| itálico elegante | Cormorant SemiBold Italic |
| escrita à mão | Kaushan Script (pincel), Shadows Into Light (caneta) |
| letreiro arredondado | Bungee |

Se a pessoa tem o arquivo de uma fonte que pode usar, ele vai em `~/Edicoes/Estilos/<id>/fontes/`, e o estilo pode citá-la pelo nome do arquivo. As fontes da marca da pessoa também valem.

## 4. Mostrar e confirmar

Abra a folha para a pessoa:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/ferramentas/abrir.sh" "<pasta-do-estilo>/analise/folha.jpg"
```

Diga em 5 a 8 linhas o que dá para copiar e o que fica de fora, sem termos técnicos. Depois faça uma única chamada de `AskUserQuestion`:

| Pergunta | Opções |
|---|---|
| Nome do estilo | 2 ou 3 sugestões curtas pelo jeito do vídeo, a melhor primeiro |
| Quando usar | 2 ou 3 sugestões pelo tipo de vídeo da referência, como "dica rápida e lista" ou "anúncio" |

## 5. Escrever o estilo

Escreva `<pasta-do-estilo>/estilo.md` como o guia do `ler_receita` manda, com o nome e o "quando usar" da ficha. Escreva o arquivo inteiro uma vez e depois só faça edições pequenas.

Se o nome escolhido não é o id provisório, dê o nome final à pasta, com o id sem acento:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/ferramentas/referencia/nomear.sh" "<pasta-do-estilo>" "<id-final>"
```

A capa do estilo é um quadro da referência. Se outro quadro mostrar melhor o jeito do estilo, troque:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/ferramentas/referencia/capa.sh" "<pasta-do-estilo>/referencia.<ext>" "<segundos>" "<pasta-do-estilo>"
```

## 6. Testar num vídeo

O estilo só está pronto depois do primeiro vídeo. Diga à pessoa que o estilo foi criado, em que pasta ele está, e pergunte se ela quer editar um vídeo nele agora. Se sim, use a skill `novo-video` com este estilo. Os ajustes que ela pedir nesse primeiro vídeo e que valem para todo vídeo do estilo entram também no `estilo.md`.

Na primeira vez que um vídeo sair pronto nesse estilo, ofereça trocar a capa por um quadro dele, com o `capa.sh`: a capa passa a mostrar a marca da pessoa.

## Mudar um estilo que já existe

Se a pessoa pedir para mudar um estilo dela, como "no meu estilo amarelo, a legenda maior", chame `ler_receita` como no passo 1, leia o `estilo.md` dele e faça uma edição pequena nas medidas ou no molde. Diga o que mudou. Os vídeos que já saíram não mudam.
