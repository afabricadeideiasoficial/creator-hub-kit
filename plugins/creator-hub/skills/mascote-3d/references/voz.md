# Voz no ElevenLabs

Os dados da voz estão no `canal.json` do canal, em `voz`: nome da voz em My Voices, tipo de clone (`clone`: `instantaneo` ou `profissional`), modelo, estabilidade, similaridade, força do clone, créditos por vídeo e pastas onde o navegador salva o download. Se o serviço não for o ElevenLabs, siga o jeito dele e mantenha as regras de conta, de escolha e de download daqui.

Use **Claude in Chrome**, onde o ElevenLabs do usuário está logado.

## Confirmar a conta antes de clicar

Com mais de um perfil do Chrome é fácil abrir a conta errada. Antes de gerar:

1. Abra `elevenlabs.io/app/voice-lab` e confirme que a voz do canal (`voz.nome`) aparece em My Voices.
2. Se a voz não estiver lá, é a conta errada. Pare e avise.
3. Na tela de assinatura, veja os créditos restantes e compare com `voz.creditos_por_video` (um texto de 2 minutos gasta perto de 1.400 créditos).

A extensão só enxerga navegadores logados na mesma conta do Claude desta sessão.

## Gerar

1. Abra `elevenlabs.io/app/speech-synthesis/text-to-speech`.
2. Se houver um rascunho do usuário na caixa de texto, não apague sem perguntar.
3. Selecione a voz: botão "Select voice", aba **My voices**, a voz do canal, e **Use**.
4. Modelo, Stability e Similarity do `canal.json` (padrão do kit: **Eleven v4**, **30%** e **90%**). Se a voz for clone profissional (`voz.clone`; na dúvida, pergunte), ponha também a **Clone Strength** em `voz.forca_do_clone` (padrão **20%**): ela só aparece no clone profissional com o Eleven v4. Idioma automático e sem efeitos.
5. Digite o texto de `narracao.txt` e confira na página se entrou inteiro.
6. Clique em **Generate speech**. Saem duas gerações, e a primeira toca sozinha.
7. Peça ao usuário para ouvir. Você não avalia a qualidade da voz.

## Baixar

Baixe só a geração escolhida, em MP3 44,1 kHz 128 kbps. Não trate o áudio (sem redução de ruído, equalização ou compressão): no máximo ajuste o volume na mixagem. O Chrome salva na última pasta usada, que pode não ser Downloads. Procure nas pastas do `canal.json` (`voz.pastas_de_download`), por exemplo:

```bash
find ~/Downloads ~/Desktop -maxdepth 5 -type f -iname 'ElevenLabs*' -mmin -5
```

Se vários downloads seguidos não aparecerem, o Chrome pode estar pedindo permissão para múltiplos downloads. Use o botão de download do player inferior ou peça para o usuário liberar. Confirme qual geração baixou pela duração com `ffprobe`.

## Trocar só um trecho

Quando o usuário gostar de uma geração mas quiser mudar a última frase, gere só o parágrafo novo e emende, em vez de refazer tudo:

1. Ache as pausas: `ffmpeg -i narracao.mp3 -af silencedetect=noise=-35dB:d=0.25 -f null -`
2. Corte no meio de uma pausa.
3. Iguale o volume do trecho novo com `volumedetect`.
4. Junte com `atrim` e `concat`, com fades curtos de 0,03 a 0,08 s, e reencode em 192 kbps.
5. Transcreva o resultado para confirmar a emenda.
