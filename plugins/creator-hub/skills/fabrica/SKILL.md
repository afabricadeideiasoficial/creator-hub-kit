---
name: fabrica
description: Menu do kit do Creator Hub. Mostra o que dá para pedir, confere a instalação deste computador e explica como atualizar. Use quando a pessoa digitar /fabrica, pedir "menu", "o que dá pra fazer", "ajuda com o kit" ou "confere a instalação".
---

# Menu do kit

Fale em português simples.

## O que dá para pedir

| Pedido | O que acontece |
|---|---|
| `/novo-video` ou "edita esse vídeo" | ficha, corte, legendas na marca, mapa de edição, prévia e render com a sua aprovação |
| "legenda esse vídeo" | o mesmo caminho, sem o corte, para vídeo já editado |
| `/cortes` ou "extrai os cortes dessa gravação" | transforma uma gravação longa em vários vídeos curtos: acha os melhores momentos, você aprova e ele edita |
| `/plano-continuo` ou "faz um vídeo animado" | vídeo animado sobre uma narração sua, sem filmagem |
| `/cliente-novo` ou "muda as cores da minha marca" | cria ou ajusta a marca |
| "quais estilos eu tenho?" | a lista dos estilos prontos e dos que estão a caminho |

Para saber os estilos, chame `listar_estilos`.

## Conferir a instalação

Confira, sem instalar nada:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/ferramentas/conferir_instalacao.sh"
```

Depois chame `listar_estilos`. Se ela responder, a assinatura e o conector estão certos. Se o script disser que falta algo, rode você mesmo a instalação de novo, como em "Atualizar".

Não investigue a instalação além disso: nada de listar pastas nem de ler `~/.claude/plugins`. Cada comando próprio abre uma janela de permissão para a pessoa. Se o script e a ferramenta responderam, a instalação está certa. Se algo ainda parecer errado, diga isso à pessoa e indique o suporte.

## Atualizar

Os estilos e os motores ficam no servidor e chegam sozinhos. As instruções do kit mudam de vez em quando. Para atualizar, rode a instalação de novo, que só refaz o que mudou.

Rode você mesmo o comando, nesta sessão. Nunca mande a pessoa abrir o Terminal: fora do Claude, o instalador não acha o `claude` e não liga o plugin. Se o app pedir permissão, explique que é a atualização do kit.

- no Mac:

```bash
curl -fsSL https://raw.githubusercontent.com/afabricadeideiasoficial/creator-hub-kit/main/instalador/instalar.sh | zsh
```

- no Windows:

```bash
powershell -NoProfile -Command "irm https://raw.githubusercontent.com/afabricadeideiasoficial/creator-hub-kit/main/instalador/instalar.ps1 | iex"
```

Depois, peça para a pessoa abrir uma sessão nova.

## Problemas

- **O conector pede login ou diz "token expirado":** digite `/mcp` e escolha `fabrica`, aqui mesmo nesta sessão do app, sem abrir terminal. Não use `/login`.
- **"O Creator Hub não está ativo":** a mensagem traz o link para renovar.
- **Ainda não deu certo:** use o botão de suporte da área de membros.
