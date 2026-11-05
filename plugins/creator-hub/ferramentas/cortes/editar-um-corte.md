# Editar um corte de uma gravação longa

A pessoa já aprovou este momento. Vá do começo ao fim sem perguntar nada e pare antes da prévia: quem mostra o resultado é a conversa principal.

Se a pasta do corte já tem takes, cortes ou legendas, leia o "Estado atual" do `project.md` e continue de onde parou. Atualize o "Estado atual" a cada etapa.

Rode os comandos que as ferramentas devolvem exatamente como vieram, na pasta indicada. Cada comando de ferramenta vale 10 minutos e uma vez só. Se o `curl` responder que o pedido não existe ou venceu, ou der erro 404, chame a mesma ferramenta de novo e rode o comando novo: acontece quando a edição fica parada. Rode cada script sozinho, sem variável antes e sem `|`, `;` ou `&&`, e não rode comandos próprios como `ls`, `cat`, `grep`, `ffmpeg` ou `node`: cada um abre uma janela de permissão para a pessoa. Para ler um arquivo, use a sua ferramenta de leitura. Edite os arquivos com a sua ferramenta de edição. Nunca escreva à mão um arquivo que uma ferramenta gera.

Abaixo, `<ferramentas>`, `<corte>`, `<cliente>`, `<estilo>` e `<musica>` são o que o pedido informou.

## Escolher os takes

Leia o `project.md`: ele diz o que a fala deste momento cobre e por que ela foi escolhida. Chame `analisar_falas` e rode o comando em `<corte>/1-corte`. Leia o `falas.txt` e escreva `1-corte/takes.json` no formato que o comando mostrou.

- Fique dentro do que o `project.md` diz. O resto é folga.
- A primeira frase do vídeo tem de fazer sentido para quem não viu nada. Se ela depende do que veio antes ("ela", "aquela", "nisso"), comece na primeira frase que se sustenta sozinha.
- Nunca termine um take no meio de uma frase, a não ser que o take seguinte a complete.
- Em `fala`, escreva o texto inteiro do take, sem resumir: a conferência das palavras compara o corte com ele.
- Se o momento tem dois trechos, o primeiro é o gancho. A ordem do `takes.json` é a ordem do vídeo.
- Tire o que não ajuda: repetição, frase começada de novo, "né" solto, comentário de bastidor.
- Não use fala marcada como `fundo`: costuma ser a voz de quem grava ou entrevista. Confira as marcadas como `duvida` pelo contexto.
- Entre tentativas da mesma frase, prefira a mais completa e firme.
- O corte tem de fazer sentido sozinho, sem mudar o que a pessoa quis dizer.
- Numa gravação longa, a pessoa segue falando depois do fim do momento. No último take, use `"forcar_fim": true`, com o `fim` 0,5 s depois da última palavra, ou 0,1 s antes da fala seguinte, se ela vier antes disso. Sem isso, o vídeo termina pegando o começo da próxima frase.

## Cortar

Chame `decidir_cortes` e rode o comando em `<corte>/1-corte`. Leia os avisos: se apontarem algum problema, ajuste o `takes.json`, chame a ferramenta de novo e rode o novo comando. Depois:

```bash
bash "<ferramentas>/cortar.sh" "<corte>"
```

Sem música, omita o último argumento:

```bash
bash "<ferramentas>/preparar_depois_do_corte.sh" "<corte>" "<cliente>" "<estilo>" "<musica>"
```

O script termina com a conferência das palavras. Se ela apontar uma diferença:

- Se faltou uma palavra no começo de um trecho, use `"forcar_inicio": true` nesse take. Se faltou no fim, aumente o `fim`.
- Se uma palavra saiu partida ou trocada, como `era "esse", ouvi "o"`, ponha a pausa daquele ponto em `"nao_cortar"` nesse take. Se for o começo do take, use `"forcar_inicio": true`.
- Se sobrou voz de bastidor, encurte o take.

Nesses casos, volte a "Cortar". Se a diferença for só outra grafia de um nome, siga. Para ver palavras e volume de um trecho:

```bash
bash "<ferramentas>/ver_trecho.sh" "<corte>" 3.9-5.4
```

## Legendas

Num estilo com receita, não há roteiro, gerador nem mapa. Chame `ler_receita` com o id do estilo, rode `bash "<ferramentas>/receita/preparar_receita.sh" "<corte>"`, faça o plano que a receita pede, escreva `2-legendas/index.html` seguindo a receita e pare em "Ao terminar", com o plano em 3 ou 4 linhas no seu relatório. Se uma cena usa um quadro do vídeo, rode `bash "<ferramentas>/receita/quadro.sh" "<corte>/2-legendas" "<segundos>"`. Confira com `medir_margens.sh`, como abaixo, e olhe as fotos com `bash "<ferramentas>/plano/fotos.sh" "<corte>/2-legendas" "<tempos separados por vírgula>"`.

Nos outros estilos, chame `rascunhar_roteiro` e rode o comando em `<corte>/2-legendas`, uma vez só. Siga as instruções do topo do `roteiro-legendas.txt` e as metas que o comando mostrou.

- As palavras precisam continuar as mesmas e na mesma ordem do `transcript.json`. Corrija a grafia só onde o Whisper errou um nome.
- Escolha os destaques pelo sentido da frase: a palavra que a pessoa enfatiza, o número, o conceito. O destaque vale para a linha inteira: `mais / **força**`, nunca `mais **força** pra falar`.
- Edite o roteiro com a sua ferramenta de edição, mesmo que sejam muitas linhas. Script de `python` ou `sed` abre uma janela de permissão para a pessoa.
- Ponha as marcações em palavras seguidas de pausa, nunca na frase de abertura colada na seguinte.
- Toda tela de impacto leva uma palavra grande: `>> frase curta / **PALAVRA**`. Só use em frase de virada e quando a pessoa não estiver mostrando nada com as mãos.
- Se ouvir no texto a voz de quem está gravando, comece essa linha com `~`.

Chame `gerar_legendas` com `modo: "com-video"` e rode o comando em `<corte>/2-legendas`. Se ele mostrar um erro, corrija o roteiro e rode o mesmo comando de novo. Se mostrar uma conferência com ajustes, corrija o roteiro e chame `gerar_legendas` de novo, porque o pedido já fechou.

Confira a margem e corrija o que sair dela:

```bash
bash "<ferramentas>/medir_margens.sh" "<corte>/2-legendas"
```

## Mapa

Escreva `2-legendas/mapa.json`:

```json
{ "titulo": "<título do corte>", "cliente": "<nome do cliente>", "video": "2-legendas/assets/video.mp4", "notas": [] }
```

Com música, ponha em `notas`: `{ "t": 0, "tipo": "musica", "o_que": "<música>", "por_que": "<motivo>" }`. Chame `montar_mapa` e rode o comando em `<corte>/2-legendas`.

## Ao terminar

Não abra a prévia nem renderize. Atualize o "Estado atual" do `project.md` e responda em até 3 linhas: a duração do vídeo, o que ficou de fora e qualquer problema que a pessoa precise saber.
