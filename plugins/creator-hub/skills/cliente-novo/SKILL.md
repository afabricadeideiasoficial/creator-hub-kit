---
name: cliente-novo
description: Cria a pasta e a marca de um cliente novo no kit do Creator Hub (cores, fontes e grafia de nomes). Use quando a pessoa digitar /cliente-novo, disser que tem um cliente novo, quiser configurar a própria marca ou trocar as cores e as fontes das legendas.
---

# Cliente novo

Fale em português simples. "Cliente" pode ser a própria pessoa: quem edita os próprios vídeos tem um cliente só.

## 1. Perguntar

Use `AskUserQuestion`, sem exigir nada técnico:

- **Nome:** como a marca se chama. Vira a pasta `~/Edicoes/<Nome>/`, sem acento.
- **Cores:** a cor da marca. Se a pessoa não souber o código, peça o arquivo do logo ou um print do perfil, e veja a seção "Tirar a cor de uma imagem".
- **Fontes:** usar as fontes do kit (recomendado) ou as da marca. Se forem as da marca, peça os arquivos `.ttf` ou `.otf` e confirme que a pessoa pode usá-los.
- **Nomes difíceis:** nomes que o Whisper costuma errar, como o da marca e de produtos.

## Tirar a cor de uma imagem

Com a imagem no computador, rode este script, que serve no Mac e no Windows. Não escreva comando próprio para isso:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/ferramentas/cor_da_imagem.sh" "<imagem>"
```

Mostre à pessoa as cores que ele listar, em códigos e pelo nome (rosa, azul...), e confirme qual é a da marca. A última linha já traz os valores para o `marca.json`. Se a imagem veio só colada na conversa, sem arquivo, peça o arquivo ou diga a cor que você vê e confirme com a pessoa.

## 2. Gravar

Crie `~/Edicoes/<Nome>/marca.json` só com o que muda em relação ao padrão:

```json
{
  "corMarcacao": "#ff5a36",
  "gradienteDestaque": "linear-gradient(90deg, #ff8a5c, #ff5a36)",
  "correcoes": [["Creator Flow", "CreatorFlow"]]
}
```

| Campo | Para que serve |
|---|---|
| `corTexto` | cor da legenda (padrão branco) |
| `gradienteDestaque` | gradiente da palavra de destaque; sem ele, ela fica na cor do texto |
| `brilhoDestaque` | brilho atrás do destaque, como `rgba(255,90,54,.45)` |
| `corMarcacao` | X, risco, sublinhado e círculo |
| `correcoes` | grafia oficial: `[["como o Whisper escreve", "como é o certo"]]` |
| `fonteDestaque` | `{ "familia": "...", "arquivo": "assets/fonts/x.otf", "formato": "opentype", "peso": 400 }` |
| `fonteTitulo`, `fonteTexto` | nome da família, como `"\"Marca\", Arial, sans-serif"` |
| `fontesExtras` | `[{ "familia": "Marca", "arquivo": "assets/fonts/marca.ttf", "formato": "truetype" }]` |

Fontes próprias ficam em `~/Edicoes/<Nome>/fontes/`, e o preparo do vídeo as copia para `assets/fonts/`. O formato é `truetype` para `.ttf` e `opentype` para `.otf`.

Crie também `~/Edicoes/<Nome>/<Mês>/Brutos/`, com o mês atual em português e maiúscula.

## 3. Conferir

Explique em uma linha onde colocar os vídeos. Diga que a marca aparece na prévia do primeiro vídeo e que dá para ajustar falando, por exemplo "usa o rosa do logo nos destaques".

Quando a pessoa pedir para mudar a marca depois, altere o `marca.json`, rode de novo o preparo do vídeo e gere as legendas outra vez.
