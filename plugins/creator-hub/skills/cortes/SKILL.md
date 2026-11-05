---
name: cortes
description: Transforma uma gravação longa (bate-papo, podcast, entrevista, aula) em vários vídeos curtos. Transcreve uma vez, acha os melhores momentos, mostra a lista com o motivo de cada um e edita os que a pessoa aprovar. Use quando a pessoa digitar /cortes, pedir para extrair cortes, achar os melhores momentos ou fazer vários vídeos de uma gravação.
---

# Vários cortes de uma gravação longa

Quem usa isto nem sempre é técnico. Fale em português simples e mostre as escolhas em cartões. Nunca peça para a pessoa escrever um prompt nem abrir o Terminal.

Se a pasta da gravação já tem `project.md`, leia o "Estado atual" e continue de onde parou. Não refaça a ficha nem a transcrição. Se o limite do plano do Claude parar o trabalho no meio, é assim que se retoma.

Se uma ferramenta do kit disser que o Creator Hub não está ativo, mostre a mensagem com o link e pare. Se o Claude pedir login no conector, diga para a pessoa digitar `/mcp` e escolher `fabrica`.

Rode os comandos que as ferramentas devolvem exatamente como vieram, na pasta indicada. Cada comando de ferramenta vale 10 minutos e uma vez só. Se o `curl` responder que o pedido não existe ou venceu, ou der erro 404, chame a mesma ferramenta de novo e rode o comando novo: acontece quando a edição fica parada. Rode cada script do kit sozinho, sem `|`, `;` ou `&&`, e não rode comandos próprios como `ls`, `cat` ou `ffmpeg`: cada um abre uma janela de permissão para a pessoa. Para mostrar um arquivo à pessoa, rode `abrir.sh`, nunca escreva link para o arquivo.

## 1. A ficha

- A gravação fica em `~/Edicoes/<Cliente>/<Mês>/Brutos/`. Se a pessoa disse qual, use essa. Senão, procure nessa pasta e pergunte.
- Se o cliente ainda não tem pasta em `~/Edicoes`, ou se a pasta não tem `marca.json`, use a skill `cliente-novo` antes de continuar.

Chame `listar_estilos`. Faça uma única chamada de `AskUserQuestion`, pulando o que já estiver respondido. A ficha vale para todos os cortes:

| Pergunta | Opções |
|---|---|
| Cliente | as pastas de cliente em `~/Edicoes` |
| Estilo | os estilos prontos, sem os de vídeo animado, com o Padrão da marca primeiro como recomendado. Diga que estilo "com receita" gasta mais do plano por corte |
| Música | Sem música · Vou escolher um arquivo |
| Cor | Vídeo normal (celular ou câmera sem LOG), recomendado · Gravei em LOG: Sony S-Log3 · Panasonic V-Log · iPhone Apple Log |

Crie a pasta da gravação em `~/Edicoes/<Cliente>/<Mês>/<nome-sem-acento>/`. Escreva `project.md` nela, começando por "Estado atual", com a ficha, e atualize a cada etapa.

Confira os efeitos sonoros:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/ferramentas/instalar_efeitos.sh"
```

Se ele disser que faltam, chame `baixar_efeitos`, rode o comando que ela devolver e rode este script de novo.

## 2. Transcrever, uma vez só

A transcrição roda no computador da pessoa e não usa o plano do Claude. Antes de começar, descubra quanto ela demora aqui e repita o que o script disser:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/ferramentas/cortes/como_transcreve.sh"
```

Peça para deixar o computador na tomada e sem fechar a tampa.

Rode em segundo plano, com `run_in_background`, e espere o aviso de que terminou, sem ficar conferindo:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/ferramentas/cortes/preparar_gravacao.sh" "<gravacao>" "<pasta-da-gravacao>" "<pasta-do-cliente>" "<id-do-estilo>"
```

Se a pessoa gravou em LOG, corrija a cor uma vez, para todos os cortes, e siga quando ela aprovar a comparação:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/ferramentas/cor/preparar_cor.sh" "<pasta-da-gravacao>" "<entrada>"
```

```bash
bash "${CLAUDE_PLUGIN_ROOT}/ferramentas/abrir.sh" "<pasta-da-gravacao>/1-corte/cor-comparacao.jpg"
```

Use `slog3`, `vlog` ou `applelog`. Se o rosto ficar escuro, rode de novo com `--exposicao 0.5` ou `--exposicao 1`.

## 3. Achar os melhores momentos

A transcrição inteira é grande. Para ela não ocupar esta conversa até o fim, quem lê é um subagente: chame a ferramenta `Agent`, sem trocar o modelo, com este pedido:

> Ache os melhores momentos da gravação em `<pasta-da-gravacao>/momentos`. Chame a ferramenta `achar_momentos`, rode o comando que ela devolver nessa pasta e siga o que o resultado disser. Leia o `momentos.txt` inteiro com a sua ferramenta de leitura de arquivos, em partes se ele for grande, escreva o `momentos.json` e chame `conferir_momentos`. Corrija o que os avisos apontarem. Não rode outros comandos. No fim, responda só com a lista que o `conferir_momentos` mostrou, inteira, e os avisos que sobraram.

Mostre a lista à pessoa como veio: número, tempo na gravação, duração, título e motivo. Depois, dê este aviso:

> Editar vários cortes em sequência consome bastante do seu plano do Claude, e os planos menores podem chegar ao limite antes de terminar. Se isso acontecer, o que já foi feito fica salvo na pasta, e dá para continuar quando o limite renovar. Comece por poucos cortes e veja quanto gastou antes de pedir o resto.

Pergunte quais editar com `AskUserQuestion`: "Os 3 mais fortes" (recomendado) · "Os 5 mais fortes" · "Todos". A pessoa também pode digitar os números ou pedir outro momento, como "faltou a parte em que falo do meu irmão": nesse caso, peça ao subagente que ajuste a lista.

## 4. Editar cada corte

Abra as pastas dos cortes aprovados, com os números separados por vírgula:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/ferramentas/cortes/abrir_cortes.sh" "<pasta-da-gravacao>" "<pasta-do-cliente>" "<numeros>"
```

Para cada corte, um de cada vez e na ordem da lista, chame a ferramenta `Agent` com `model: "sonnet"` e este pedido:

> Edite o corte em `<pasta-do-corte>`. Cliente: `<pasta-do-cliente>`. Estilo: `<id-do-estilo>`. Música: `<arquivo da música ou "sem música">`. As ferramentas do kit estão em `${CLAUDE_PLUGIN_ROOT}/ferramentas`. Rode `bash "${CLAUDE_PLUGIN_ROOT}/ferramentas/cortes/instrucoes_do_corte.sh"` e siga o que ele mostrar até o fim.

Cada corte fica num subagente separado para um não carregar o histórico do outro, o que gastaria mais do plano da pessoa.

Antes do primeiro, atualize o `project.md` da gravação com a lista aprovada, para dar para retomar. Depois de cada um, diga em uma linha em qual está, como "corte 2 de 5 pronto: o erro de quem vende", e atualize o `project.md` da gravação. Se um subagente disser que algo deu errado, mostre à pessoa e siga para o próximo.

## 5. Aprovar, um por vez

Mostre um corte por vez, dizendo em qual está. Abra o mapa:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/ferramentas/abrir.sh" "<pasta-do-corte>/mapa.html"
```

Diga que o vídeo do mapa mostra só o corte, ainda sem legendas e efeitos, e que eles aparecem na prévia. Peça a aprovação para abrir a prévia. Depois, abra a prévia:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/ferramentas/previa.sh" "<pasta-do-corte>/2-legendas"
```

Abra no painel do navegador o endereço que o script mostrar na última linha. Diga que basta apertar o play, ignorando os outros botões da tela. Se a pessoa pedir um ajuste, atualize o `2-legendas/roteiro-legendas.txt`, chame `gerar_legendas` com `modo: "com-video"` e rode o comando na pasta `2-legendas`. Se ela não gostar do corte em si, chame um novo subagente para esse corte, dizendo o que mudar.

Quando ela aprovar, feche a prévia e passe ao próximo:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/ferramentas/fechar_previa.sh" "<pasta-do-corte>/2-legendas"
```

## 6. Renderizar

Só quando a pessoa pedir, como "pode renderizar todos". Um depois do outro, cada um em segundo plano, avisando ao terminar:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/ferramentas/renderizar.sh" "<pasta-do-corte>" "<pasta-do-cliente>/<Mês>/Prontos/<nome-da-gravacao>-<nome-do-corte>.mp4"
```

Confira as linhas de duração, volume e último quadro no fim de cada saída. Diga que leva alguns minutos por vídeo, com o computador na tomada e sem fechar a tampa. No fim, abra o último vídeo com `abrir.sh`, diga em uma linha a pasta `Prontos` e atualize o `project.md`. A gravação original nunca é alterada.
