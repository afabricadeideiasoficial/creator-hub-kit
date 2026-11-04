---
name: fabrica
description: Menu do kit do Creator Hub. Mostra o que dá para pedir, confere a instalação deste computador e explica como atualizar. Use quando a pessoa digitar /fabrica, pedir "menu", "o que dá pra fazer", "ajuda com o kit" ou "confere a instalação".
---

# Menu do kit

Fale em português simples.

## O que dá para pedir

| Pedido | O que acontece |
|---|---|
| `/novo-video` ou "legenda esse vídeo" | ficha, legendas na marca, prévia e render com a sua aprovação |
| `/cliente-novo` ou "muda as cores da minha marca" | cria ou ajusta a marca |
| "quais estilos eu tenho?" | a lista dos estilos prontos e dos que estão a caminho |

Para saber os estilos, chame `listar_estilos`.

## Conferir a instalação

Confira, sem instalar nada:

```bash
ls "$HOME/.creator-hub/bin" "$HOME/.creator-hub/pacotes/node_modules/hyperframes/package.json" "$HOME/.creator-hub/video-use/helpers/transcribe_local.py"
```

Depois chame `listar_estilos`. Se ela responder, a assinatura e o conector estão certos. Se faltar algum arquivo, oriente a pessoa a rodar o instalador do Creator Hub de novo, como ensina a aula de instalação.

## Atualizar

Os estilos e os motores ficam no servidor e chegam sozinhos. Só as instruções do kit precisam de atualização, e o app mostra isso na lista de plugins: digite `/plugin`, escolha `creator-hub` e atualize.

## Problemas

- **O conector pede login ou diz "token expirado":** digite `/mcp` e escolha `fabrica`. Não use `/login`.
- **"O Creator Hub não está ativo":** a mensagem traz o link para renovar.
- **Ainda não deu certo:** use o botão de suporte da área de membros.
