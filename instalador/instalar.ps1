# Instalador do kit de edicao do Creator Hub para Windows 10/11 (64 bits). E o par do instalar.sh do Mac.
# Nao pede senha nem administrador. Pode rodar quantas vezes quiser: o que ja esta pronto e pulado.
#
#   irm <url> | iex                                          instala o que falta
#   $env:KIT_CHECAR=1; irm <url> | iex                       so confere, sem instalar nada
#   powershell -ExecutionPolicy Bypass -File instalar.ps1 [--checar]    o mesmo, rodando do arquivo
#
# So para testar: $env:KIT_FONTE=<pasta> copia os arquivos do kit dessa pasta em vez de baixar do GitHub.
#
# Onde as coisas ficam: tudo em $HOME\.creator-hub e $HOME\Edicoes, com quatro excecoes. Tres tem o caminho
# fixo nas proprias ferramentas: $HOME\.cache\puppeteer (o Chrome do Puppeteer), $HOME\.cache\hyperframes
# (o Chrome que o HyperFrames usa no render) e $HOME\.hyperframes (configuracao do HyperFrames, com a
# telemetria desligada). A quarta e a variavel de usuario PYTHONUTF8=1: sem ela o Python do Windows
# estraga os acentos dos arquivos.
#
# Regras para quem mexer aqui:
# - Este arquivo so tem caracteres ASCII, de proposito. Rodando do arquivo, o PowerShell 5.1 sem BOM le em
#   outra codificacao e estraga os acentos; com BOM, o iex quebra. Por isso os acentos das mensagens sao
#   escritos como \u00e3 e a funcao A os traduz na hora de mostrar. Mensagem nao leva caminho de pasta.
# - Sem exit dentro do bloco: no iex ele fecharia a janela da pessoa. Sem $PSScriptRoot: no iex ele nao existe.
# - Roda em Windows PowerShell 5.1: nada de ternario, &&, ||, nem Join-Path com mais de dois caminhos.
# - O plugin entra por um marketplace numa pasta local, porque "marketplace add" com fonte no GitHub chama o git.
#   O escopo e o da pasta Edicoes: o plugin nao aparece em outros projetos da pessoa. Computador da empresa, que
#   tem o kit em Edicoes com skills de mesmo nome, nao recebe o plugin.
# - Com 2>&1 em comando externo, $ErrorActionPreference tem de ficar em Continue, senao o 5.1 trata
#   qualquer linha no stderr como erro fatal. Funcao que devolve verdadeiro/falso nao pode deixar sair
#   mais nada: New-Item e companhia vao para Out-Null.

& {
  # Versoes revisadas. Para atualizar, troque a versao e o SHA-256 juntos, e teste de novo.
  $NODE_VERSAO = '22.23.4'
  $NODE_SHA = 'cbc74b5e0982c9dbb41525fd8fb5dcd32fbee237863f7829072f4639a1ce5f20'
  $FFMPEG_VERSAO = '9.0.2'
  $FFMPEG_SHA = '60f467265b1e312373dbcd92200c2618a74850f98d3d078e94296bb3fa2047ba'
  $UV_VERSAO = '0.13.4'
  $UV_SHA = 'ccec7508a07d9933d7cb1261880633efcf1f30d6e6eddab21823f1dae6f23225'
  $VIDEO_USE_COMMIT = 'b877063835e6ea6e457124da7e28a0ae26691dc3'
  # 3.12 e a versao com pacote pronto de tudo nos tres sistemas (igual ao instalar.sh).
  $PYTHON_VERSAO = '3.12'
  # Pacotes de Python publicados ate esta data: o assinante recebe o que foi testado, nao o lancamento de hoje.
  $PYTHON_PACOTES_ATE = '2026-11-01T00:00:00Z'

  $KIT_RAW = 'https://raw.githubusercontent.com/afabricadeideiasoficial/creator-hub-kit/main'
  $KIT_ZIP = 'https://codeload.github.com/afabricadeideiasoficial/creator-hub-kit/zip/refs/heads/main'
  $ARQ_TRANSCRICAO = 'plugins/creator-hub/ferramentas/transcribe_local.py'
  $ARQ_PACKAGE = 'plugins/creator-hub/ferramentas/modelo/package.json'
  $ARQ_LOCK = 'plugins/creator-hub/ferramentas/modelo/package-lock.json'

  $ErrorActionPreference = 'Continue'
  $ProgressPreference = 'SilentlyContinue'   # no 5.1 a barra de progresso deixa o download dezenas de vezes mais lento
  try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch {}
  try { [Console]::OutputEncoding = New-Object Text.UTF8Encoding($false) } catch {}

  $CHECAR = ($args -contains '--checar') -or ($args -contains '-checar') -or ($env:KIT_CHECAR -eq '1')
  $FALHAS = New-Object System.Collections.Generic.List[string]
  $E = @{ erro = ''; saida = ''; empresa = $false }

  $RAIZ = Join-Path $HOME '.creator-hub'
  $BIN = Join-Path $RAIZ 'bin'
  $NODE = Join-Path $BIN 'node.exe'
  $NPM_CLI = Join-Path $BIN 'node_modules\npm\bin\npm-cli.js'
  $FFMPEG = Join-Path $BIN 'ffmpeg.exe'
  $FFPROBE = Join-Path $BIN 'ffprobe.exe'
  $UV = Join-Path $BIN 'uv.exe'
  $VU = Join-Path $RAIZ 'video-use'
  $VENV = Join-Path $VU '.venv'
  $PY = Join-Path $VENV 'Scripts\python.exe'
  $PAC = Join-Path $RAIZ 'pacotes'
  $HF_CLI = Join-Path $PAC 'node_modules\hyperframes\dist\cli.js'
  $MARCA = Join-Path $PAC 'node_modules\.kit-lock'
  $EDICOES = Join-Path $HOME 'Edicoes'
  $MKT = Join-Path $RAIZ 'marketplace'
  # O Node acha a pasta do Chrome pelo USERPROFILE, que quase sempre e igual ao $HOME.
  $PERFIL = $env:USERPROFILE
  if (-not $PERFIL) { $PERFIL = $HOME }

  # -------------------------------------------------------------------------
  # Mensagens e controle dos passos

  function A([string]$t) { [regex]::Replace($t, '\\u([0-9a-fA-F]{4})', { param($m) [string][char][Convert]::ToInt32($m.Groups[1].Value, 16) }) }
  function Titulo($t) { Write-Host ''; Write-Host (A $t) }
  function Linha($t) { Write-Host ('  ' + (A $t)) }
  function Aviso($t) { Write-Host ('  ' + (A "ATEN\u00c7\u00c3O: $t")) }
  function AnotarFalha($t) { $FALHAS.Add((A $t)) }

  function Registra($texto) {
    if ($LOG -and $texto) { try { Add-Content -LiteralPath $LOG -Value $texto -Encoding UTF8 } catch {} }
  }

  # Passo <nome> <funcao que confere> <funcao que instala> <o que esta fazendo>
  # O passo so conta como pronto se a conferencia passar depois de instalar.
  function Passo($nome, $conferir, $instalar, $andamento) {
    if (& $conferir) { Linha "${nome}: ok"; return $true }
    if ($CHECAR) {
      Linha "${nome}: falta"
      AnotarFalha $nome
      return $false
    }
    Write-Host (A "  ${nome}: $andamento... ") -NoNewline
    $E.erro = ''
    if ((& $instalar) -and (& $conferir)) { Write-Host 'pronto'; return $true }
    Write-Host (A 'n\u00e3o deu certo')
    $msg = $E.erro
    if (-not $msg) { $msg = 'n\u00e3o ficou pronto. Rode o instalador de novo: ele continua de onde parou.' }
    AnotarFalha "${nome}: $msg"
    return $false
  }

  # Roda um programa, guarda o que ele escreveu no registro e diz se deu certo.
  function Roda([string]$exe, [string[]]$params) {
    try {
      $saida = & $exe @params 2>&1 | ForEach-Object { "$_" }
      $rc = $LASTEXITCODE
    } catch {
      Registra "$_"
      $E.saida = "$_"
      return $false
    }
    Registra $saida
    $E.saida = ($saida -join "`n")
    return ($rc -eq 0)
  }

  function PrimeiraLinha([string]$exe, [string[]]$params) {
    if (-not (Test-Path -LiteralPath $exe)) { return '' }
    try { $s = @(& $exe @params 2>$null) } catch { return '' }
    if ($s.Count -gt 0) { return [string]$s[0] }
    return ''
  }

  function NovaPasta($p) { New-Item -ItemType Directory -Force -Path $p -ErrorAction Stop | Out-Null }

  # O antivirus pode segurar um arquivo recem-baixado por alguns segundos: tenta de novo antes de desistir.
  function Trocar($origem, $destino) {
    for ($i = 1; $i -le 5; $i++) {
      try {
        if (Test-Path -LiteralPath $destino) { Remove-Item -LiteralPath $destino -Recurse -Force -ErrorAction Stop }
        Move-Item -LiteralPath $origem -Destination $destino -Force -ErrorAction Stop
        return
      } catch {
        if ($i -eq 5) { throw }
        Start-Sleep -Seconds 2
      }
    }
  }

  function Iguais($a, $b) {
    (Get-FileHash -LiteralPath $a -Algorithm SHA256).Hash -eq (Get-FileHash -LiteralPath $b -Algorithm SHA256).Hash
  }

  function Achou($pasta, $arquivo) {
    if (-not (Test-Path -LiteralPath $pasta)) { return $false }
    return [bool](Get-ChildItem -LiteralPath $pasta -Recurse -File -Filter $arquivo -ErrorAction SilentlyContinue | Select-Object -First 1)
  }

  # -------------------------------------------------------------------------
  # Downloads

  function Baixar($oque, $url, $destino) {
    for ($i = 1; $i -le 3; $i++) {
      try {
        Invoke-WebRequest -Uri $url -OutFile $destino -UseBasicParsing -ErrorAction Stop
        return $true
      } catch {
        Registra "$url -> $_"
        if ($i -lt 3) { Start-Sleep -Seconds 3 }
      }
    }
    Remove-Item -LiteralPath $destino -Force -ErrorAction SilentlyContinue
    $E.erro = "n\u00e3o consegui baixar $oque. Confira a internet e rode o instalador de novo: ele continua de onde parou."
    return $false
  }

  function BaixarConferido($oque, $url, $sha, $destino) {
    if (-not (Baixar $oque $url $destino)) { return $false }
    if ((Get-FileHash -LiteralPath $destino -Algorithm SHA256).Hash -ne $sha) {
      Remove-Item -LiteralPath $destino -Force -ErrorAction SilentlyContinue
      $E.erro = "o arquivo baixado veio diferente do esperado e foi descartado, por seguran\u00e7a. Rode o instalador de novo. Se repetir, fale com o suporte."
      return $false
    }
    return $true
  }

  function Extrair($zip, $pasta) {
    try {
      Add-Type -AssemblyName System.IO.Compression.FileSystem
      [IO.Compression.ZipFile]::ExtractToDirectory($zip, $pasta)
      return $true
    } catch {
      Registra "$zip -> $_"
      $E.erro = 'n\u00e3o consegui abrir o arquivo baixado. Rode o instalador de novo: ele continua de onde parou.'
      return $false
    }
  }

  function NoKit($caminho) { Join-Path $TMP "kit/$caminho" }

  # Deixa o arquivo do kit em $TMP/kit/<caminho>.
  function PegarDoKit($caminho) {
    $destino = NoKit $caminho
    if (Test-Path -LiteralPath $destino) { return $true }
    try {
      NovaPasta (Split-Path -Parent $destino)
      if ($env:KIT_FONTE) {
        Copy-Item -LiteralPath (Join-Path $env:KIT_FONTE $caminho) -Destination $destino -ErrorAction Stop
        return $true
      }
    } catch {
      Registra "$caminho -> $_"
      $E.erro = "n\u00e3o achei o arquivo $caminho do kit."
      return $false
    }
    return (Baixar "o arquivo $caminho do kit" "$KIT_RAW/$caminho" $destino)
  }

  # -------------------------------------------------------------------------
  # bin\: Node, ffmpeg, ffprobe e uv

  function ConferirNode {
    return ((PrimeiraLinha $NODE @('-v')) -eq "v$NODE_VERSAO") -and (Test-Path -LiteralPath $NPM_CLI)
  }

  function InstalarNode {
    $nome = "node-v$NODE_VERSAO-win-x64"
    $zip = Join-Path $TMP 'node.zip'
    if (-not (BaixarConferido 'o Node' "https://nodejs.org/dist/v$NODE_VERSAO/$nome.zip" $NODE_SHA $zip)) { return $false }
    $aberto = Join-Path $TMP 'node'
    if (-not (Extrair $zip $aberto)) { return $false }
    $origem = Join-Path $aberto $nome
    try {
      NovaPasta $BIN
      # o node vai por ultimo: se ele esta la na versao certa, o npm tambem esta
      foreach ($n in 'node_modules', 'npm', 'npm.cmd', 'npx', 'npx.cmd', 'node.exe') {
        Trocar (Join-Path $origem $n) (Join-Path $BIN $n)
      }
      return $true
    } catch {
      Registra "$_"
      return $false
    }
  }

  function ConferirFfmpeg { return (PrimeiraLinha $FFMPEG @('-version')) -like "ffmpeg version $FFMPEG_VERSAO*" }
  function ConferirFfprobe { return (PrimeiraLinha $FFPROBE @('-version')) -like "ffprobe version $FFMPEG_VERSAO*" }

  # O ffmpeg e o ffprobe vem no mesmo arquivo.
  function InstalarFfmpeg {
    $nome = "ffmpeg-$FFMPEG_VERSAO-essentials_build"
    $zip = Join-Path $TMP 'ffmpeg.zip'
    if (-not (BaixarConferido 'o ffmpeg' "https://github.com/GyanD/codexffmpeg/releases/download/$FFMPEG_VERSAO/$nome.zip" $FFMPEG_SHA $zip)) { return $false }
    $aberto = Join-Path $TMP 'ffmpeg'
    if (-not (Extrair $zip $aberto)) { return $false }
    $origem = Join-Path $aberto "$nome\bin"
    try {
      NovaPasta $BIN
      Trocar (Join-Path $origem 'ffmpeg.exe') $FFMPEG
      Trocar (Join-Path $origem 'ffprobe.exe') $FFPROBE
      return $true
    } catch {
      Registra "$_"
      return $false
    }
  }

  function ConferirUv { return (PrimeiraLinha $UV @('--version')) -like "uv $UV_VERSAO*" }

  function InstalarUv {
    $zip = Join-Path $TMP 'uv.zip'
    if (-not (BaixarConferido 'o uv' "https://github.com/astral-sh/uv/releases/download/$UV_VERSAO/uv-x86_64-pc-windows-msvc.zip" $UV_SHA $zip)) { return $false }
    $aberto = Join-Path $TMP 'uv'
    if (-not (Extrair $zip $aberto)) { return $false }
    try {
      NovaPasta $BIN
      Trocar (Join-Path $aberto 'uv.exe') $UV
      return $true
    } catch {
      Registra "$_"
      return $false
    }
  }

  # -------------------------------------------------------------------------
  # video-use\: cortes e transcricao

  function ConferirVideoUse {
    $commit = Join-Path $VU '.commit'
    if (-not (Test-Path -LiteralPath $commit)) { return $false }
    return ((Get-Content -LiteralPath $commit -Raw).Trim() -eq $VIDEO_USE_COMMIT) -and (Test-Path -LiteralPath (Join-Path $VU 'helpers\render.py'))
  }

  function InstalarVideoUse {
    $zip = Join-Path $TMP 'video-use.zip'
    if (-not (Baixar 'o video-use' "https://codeload.github.com/browser-use/video-use/zip/$VIDEO_USE_COMMIT" $zip)) { return $false }
    $aberto = Join-Path $TMP 'video-use'
    if (-not (Extrair $zip $aberto)) { return $false }
    try {
      TirarAtalho (Join-Path $VENV 'bin')
      Trocar (Join-Path $aberto "video-use-$VIDEO_USE_COMMIT") $VU
      Set-Content -LiteralPath (Join-Path $VU '.commit') -Value $VIDEO_USE_COMMIT -Encoding Ascii -ErrorAction Stop
      return $true
    } catch {
      Registra "$_"
      return $false
    }
  }

  function ConferirTranscricao {
    $instalado = Join-Path $VU 'helpers\transcribe_local.py'
    if (-not (Test-Path -LiteralPath $instalado)) { return $false }
    if (-not (PegarDoKit $ARQ_TRANSCRICAO)) { return $true }   # sem internet para comparar, fica o que ja esta la
    return (Iguais (NoKit $ARQ_TRANSCRICAO) $instalado)
  }

  function InstalarTranscricao {
    if (-not (PegarDoKit $ARQ_TRANSCRICAO)) { return $false }
    try {
      Copy-Item -LiteralPath (NoKit $ARQ_TRANSCRICAO) -Destination (Join-Path $VU 'helpers\transcribe_local.py') -Force -ErrorAction Stop
      return $true
    } catch {
      Registra "$_"
      return $false
    }
  }

  function TirarAtalho($atalho) {
    $i = Get-Item -LiteralPath $atalho -Force -ErrorAction SilentlyContinue
    if ($i -and $i.LinkType) { cmd /c rmdir "$atalho" | Out-Null }
  }

  # Atalho de pasta como juncao, que nao pede administrador. Nunca symlink.
  function Junta($atalho, $alvo) {
    $i = Get-Item -LiteralPath $atalho -Force -ErrorAction SilentlyContinue
    if ($i -and -not $i.LinkType) { return $false }   # pasta de verdade: nao mexe
    TirarAtalho $atalho
    New-Item -ItemType Junction -Path $atalho -Target $alvo -ErrorAction SilentlyContinue | Out-Null
    return (Test-Path -LiteralPath $atalho)
  }

  function ImportaTudo { return (Roda $PY @('-c', 'import librosa, matplotlib, numpy, PIL, requests, faster_whisper')) }

  function ConferirAmbiente {
    if (-not (Test-Path -LiteralPath $PY)) { return $false }
    if (-not (Test-Path -LiteralPath (Join-Path $VENV 'bin\python.exe'))) { return $false }
    return (ImportaTudo)
  }

  # PC sem o Visual C++ da Microsoft: o motor da transcricao precisa do msvcp140.dll, que so existe no Windows
  # depois que algum programa o instalou. O instalador oficial pede administrador, entao as bibliotecas
  # vem de um pacote (msvc-runtime) e vao para perto do Python. So roda se a transcricao nao abriu.
  function InstalarBibliotecasMicrosoft {
    if (-not (Roda $UV @('pip', 'install', '-q', '--python', $PY, '--only-binary', ':all:', 'msvc-runtime'))) { return }
    try {
      $casa = PrimeiraLinha $PY @('-c', 'import sys; print(sys.base_prefix)')
      if ($casa) { Get-ChildItem -LiteralPath (Join-Path $VENV 'Scripts') -Filter '*.dll' | Copy-Item -Destination $casa -Force -ErrorAction Stop }
    } catch {
      Registra "$_"
    }
  }

  function InstalarAmbiente {
    $E.erro = 'n\u00e3o consegui preparar a transcri\u00e7\u00e3o. Confira a internet e rode o instalador de novo: ele continua de onde parou.'
    TirarAtalho (Join-Path $VENV 'bin')
    if (-not (Roda $UV @('venv', '-q', '--clear', '--python', $PYTHON_VERSAO, $VENV))) { return $false }
    # so pacote pronto: compilar pediria ferramentas que o assinante nao tem
    if (-not (Roda $UV @('pip', 'install', '-q', '--python', $PY, '--only-binary', ':all:', '-r', (Join-Path $VU 'pyproject.toml'), 'faster-whisper>=1.1'))) { return $false }
    if (-not (Roda $UV @('pip', 'install', '-q', '--python', $PY, '--no-deps', '-e', $VU))) { return $false }
    # os caminhos do kit (.venv/bin/python) valem igual no Mac e no Git Bash do Windows
    if (-not (Junta (Join-Path $VENV 'bin') (Join-Path $VENV 'Scripts'))) { return $false }
    if (ImportaTudo) { return $true }
    if ($E.saida -match 'DLL load failed') {
      InstalarBibliotecasMicrosoft
      $E.erro = 'falta um componente da Microsoft (Visual C++). Baixe e instale https://aka.ms/vs/17/release/vc_redist.x64.exe e rode o instalador de novo.'
    }
    return $true   # quem decide agora e a conferencia do Passo
  }

  # Sem isto o Python do Windows le e grava texto em outra codificacao e estraga os acentos dos arquivos.
  function ConferirUtf8 { return [Environment]::GetEnvironmentVariable('PYTHONUTF8', 'User') -eq '1' }
  function InstalarUtf8 {
    [Environment]::SetEnvironmentVariable('PYTHONUTF8', '1', 'User')
    return $true
  }

  # -------------------------------------------------------------------------
  # pacotes\: HyperFrames, Puppeteer (com o Chrome) e GSAP

  function ConferirPacotes {
    if (-not ((Test-Path -LiteralPath $HF_CLI) -and (Test-Path -LiteralPath $MARCA))) { return $false }
    if (PegarDoKit $ARQ_LOCK) {
      if (-not (Iguais (NoKit $ARQ_LOCK) $MARCA)) { return $false }
    }
    if (-not (Roda $NODE @($HF_CLI, '--version'))) { return $false }
    return (Achou (Join-Path $PERFIL '.cache\puppeteer\chrome') 'chrome.exe') -and (Achou (Join-Path $PERFIL '.cache\hyperframes\chrome') 'chrome-headless-shell.exe')
  }

  function InstalarPacotes {
    if (-not ((PegarDoKit $ARQ_PACKAGE) -and (PegarDoKit $ARQ_LOCK))) { return $false }
    $E.erro = 'n\u00e3o consegui instalar as ferramentas de v\u00eddeo. Confira a internet e rode o instalador de novo: ele continua de onde parou.'
    try {
      NovaPasta $PAC
      Copy-Item -LiteralPath (NoKit $ARQ_PACKAGE) -Destination (Join-Path $PAC 'package.json') -Force -ErrorAction Stop
      Copy-Item -LiteralPath (NoKit $ARQ_LOCK) -Destination (Join-Path $PAC 'package-lock.json') -Force -ErrorAction Stop
      # chama o npm pelo node, sem o npm.cmd: assim um nome de pasta com espaco ou parenteses nao passa pelo cmd
      Push-Location -LiteralPath $PAC
      try { $ok = Roda $NODE @($NPM_CLI, 'ci', '--no-audit', '--no-fund', '--loglevel=error') } finally { Pop-Location }
      if (-not $ok) { return $false }
      # O render do HyperFrames usa um Chrome proprio e o baixaria no primeiro video: o browser ensure ja o traz.
      if (-not (Roda $NODE @($HF_CLI, 'browser', 'ensure'))) { return $false }
      # O npm ci apaga node_modules ao comecar: a marca so existe depois de uma instalacao inteira.
      Copy-Item -LiteralPath (NoKit $ARQ_LOCK) -Destination $MARCA -Force -ErrorAction Stop
      return $true
    } catch {
      Registra "$_"
      return $false
    }
  }

  # -------------------------------------------------------------------------
  # Pasta Edicoes

  function CopiarInicial($caminho) {
    $origem = "instalador/pasta-inicial/$caminho"
    $destino = Join-Path $EDICOES $caminho
    if (Test-Path -LiteralPath $destino) {
      # Ligar o plugin acrescenta o marketplace a este arquivo, entao ele nao fica igual ao modelo.
      if (($caminho -eq '.claude/settings.json') -and ((Get-Content -LiteralPath $destino -Raw) -like '*creator-hub*')) {
        Linha "Pasta Edicoes, ${caminho}: ok"
        return
      }
      if ((PegarDoKit $origem) -and -not (Iguais (NoKit $origem) $destino)) {
        Aviso "o arquivo $caminho j\u00e1 existe na pasta Edicoes e \u00e9 diferente do modelo. N\u00e3o mexi nele."
      } else {
        Linha "Pasta Edicoes, ${caminho}: ok"
      }
      return
    }
    if ($CHECAR) {
      Linha "Pasta Edicoes, ${caminho}: falta"
      AnotarFalha "Pasta Edicoes, $caminho"
      return
    }
    $E.erro = ''
    $ok = PegarDoKit $origem
    if ($ok) {
      try {
        NovaPasta (Split-Path -Parent $destino)
        Copy-Item -LiteralPath (NoKit $origem) -Destination $destino -ErrorAction Stop
      } catch {
        Registra "$_"
        $ok = $false
      }
    }
    if ($ok) {
      Linha "Pasta Edicoes, ${caminho}: pronto"
    } else {
      Linha "Pasta Edicoes, ${caminho}: n\u00e3o deu certo"
      $msg = $E.erro
      if (-not $msg) { $msg = 'n\u00e3o consegui copiar o arquivo. Rode o instalador de novo.' }
      AnotarFalha "Pasta Edicoes, ${caminho}: $msg"
    }
  }

  # -------------------------------------------------------------------------

  # -------------------------------------------------------------------------
  # Plugin do kit

  function AcharClaude {
    if ($env:CLAUDE_CODE_EXECPATH -and (Test-Path -LiteralPath $env:CLAUDE_CODE_EXECPATH)) { return $env:CLAUDE_CODE_EXECPATH }
    $c = Get-Command claude -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($c) { return $c.Source }
    return $null
  }

  function BaixarMarketplace {
    $novo = "$MKT.novo"
    try {
      if (Test-Path -LiteralPath $novo) { Remove-Item -LiteralPath $novo -Recurse -Force -ErrorAction Stop }
      NovaPasta $novo
      if ($env:KIT_FONTE) {
        $origem = $env:KIT_FONTE
      } else {
        $zip = Join-Path $TMP 'kit.zip'
        $pasta = Join-Path $TMP 'kit-zip'
        if (-not (Baixar 'o plugin do kit' $KIT_ZIP $zip)) { return $false }
        if (-not (Extrair $zip $pasta)) { return $false }
        $origem = (Get-ChildItem -LiteralPath $pasta -Directory | Select-Object -First 1).FullName
      }
      if (-not (Test-Path -LiteralPath (Join-Path $origem 'plugins/creator-hub/.claude-plugin/plugin.json'))) { throw 'plugin incompleto' }
      Copy-Item -LiteralPath (Join-Path $origem '.claude-plugin') -Destination $novo -Recurse -ErrorAction Stop
      Copy-Item -LiteralPath (Join-Path $origem 'plugins') -Destination $novo -Recurse -ErrorAction Stop
      Trocar $novo $MKT
      return $true
    } catch {
      Registra "marketplace -> $_"
      $E.erro = 'o plugin baixado veio incompleto. Rode o instalador de novo.'
      return $false
    }
  }

  function LigarPlugin($claude) {
    Push-Location -LiteralPath $EDICOES
    try {
      return ((Roda $claude @('plugin', 'marketplace', 'add', $MKT, '--scope', 'project')) -and
        (Roda $claude @('plugin', 'marketplace', 'update', 'creator-hub')) -and
        (Roda $claude @('plugin', 'install', 'creator-hub@creator-hub', '--scope', 'project')) -and
        (Roda $claude @('plugin', 'update', 'creator-hub@creator-hub', '--scope', 'project')))
    } finally {
      Pop-Location
    }
  }

  function PluginLigado($claude) {
    Push-Location -LiteralPath $EDICOES
    try {
      if (-not (Roda $claude @('plugin', 'list', '--json'))) { return $false }
      # O Roda junta o stderr na saida: o JSON e o que esta entre o primeiro [ e o ultimo ].
      $t = $E.saida
      $i = $t.IndexOf('[')
      $f = $t.LastIndexOf(']')
      if ($i -lt 0 -or $f -lt $i) { return $false }
      foreach ($p in ($t.Substring($i, $f - $i + 1) | ConvertFrom-Json)) {
        if ($p.id -eq 'creator-hub@creator-hub' -and $p.enabled) { return $true }
      }
      return $false
    } catch {
      Registra "lista de plugins -> $_"
      return $false
    } finally {
      Pop-Location
    }
  }

  function InstalarPlugin {
    if (Test-Path -LiteralPath (Join-Path $EDICOES '.claude/skills/novo-video/SKILL.md')) {
      $E.empresa = $true
      Linha 'Plugin do kit: este computador j\u00e1 tem o kit da empresa na pasta Edicoes. N\u00e3o instalei, para n\u00e3o misturar os dois.'
      return
    }
    $claude = AcharClaude
    if ($CHECAR) {
      if (-not $claude) {
        Linha 'Plugin do kit: s\u00f3 d\u00e1 para conferir de dentro do app do Claude.'
      } elseif (PluginLigado $claude) {
        Linha 'Plugin do kit: ok'
      } else {
        Linha 'Plugin do kit: falta'
        AnotarFalha 'Plugin do kit'
      }
      return
    }
    Write-Host -NoNewline (A '  Plugin do kit: baixando... ')
    $E.erro = ''
    if (-not (BaixarMarketplace)) {
      Write-Host (A 'n\u00e3o deu certo')
      AnotarFalha "Plugin do kit: $($E.erro)"
      return
    }
    Write-Host 'pronto'
    if (-not $claude) {
      Linha 'Plugin do kit: falta ligar.'
      AnotarFalha 'Plugin do kit: este comando n\u00e3o rodou dentro do Claude. Abra o app do Claude numa sess\u00e3o qualquer e pe\u00e7a para ele rodar este mesmo comando de instala\u00e7\u00e3o.'
      return
    }
    Write-Host -NoNewline (A '  Plugin do kit: ligando na pasta Edicoes... ')
    if ((LigarPlugin $claude) -and (PluginLigado $claude)) {
      Write-Host 'pronto'
      return
    }
    Write-Host (A 'n\u00e3o deu certo')
    AnotarFalha 'Plugin do kit: n\u00e3o consegui ligar o plugin na pasta Edicoes. Rode o instalador de novo.'
  }

  function Resumo {
    Titulo 'Resumo'
    if ($FALHAS.Count -eq 0) {
      if ($CHECAR) { Linha 'Tudo instalado.' } else { Linha 'Tudo pronto: programas, transcri\u00e7\u00e3o, ferramentas de v\u00eddeo e pasta Edicoes.' }
      if ($E.empresa) {
        Linha 'Este computador continua usando o kit da empresa.'
      } elseif (-not $CHECAR) {
        Linha 'Agora abra uma sess\u00e3o NOVA no app do Claude, na pasta Edicoes (na sua pasta de usu\u00e1rio), e digite /fabrica.'
        Linha 'A sess\u00e3o que est\u00e1 aberta agora n\u00e3o enxerga o plugin.'
      }
      return
    }
    Linha "$($FALHAS.Count) item(ns) com problema:"
    foreach ($f in $FALHAS) { Write-Host "  - $f" }
    if ($CHECAR) {
      Linha 'Rode o instalador sem --checar para resolver.'
    } else {
      Linha 'Basta rodar o instalador de novo: ele continua de onde parou. Se repetir, mostre esta mensagem ao Claude (detalhes em .creator-hub/instalador.log, na sua pasta de usu\u00e1rio).'
    }
  }

  if (-not [Environment]::Is64BitOperatingSystem) {
    Write-Host (A 'O kit precisa do Windows de 64 bits, e este computador \u00e9 de 32 bits.')
    $global:LASTEXITCODE = 1
    return
  }

  try {
    if ($CHECAR) {
      $TMP = Join-Path ([IO.Path]::GetTempPath()) "creator-hub-$PID"
      $LOG = $null
    } else {
      $TMP = Join-Path $RAIZ '.tmp'   # no mesmo disco do destino: mover entre discos falha no 5.1
      $LOG = Join-Path $RAIZ 'instalador.log'
    }
    try {
      if (Test-Path -LiteralPath $TMP) { Remove-Item -LiteralPath $TMP -Recurse -Force -ErrorAction Stop }
      NovaPasta $TMP
      if ($LOG) { Set-Content -LiteralPath $LOG -Value '' -Encoding UTF8 -ErrorAction Stop }
    } catch {
      Write-Host (A 'N\u00e3o consegui criar a pasta do kit na sua pasta de usu\u00e1rio.')
      $global:LASTEXITCODE = 1
      return
    }

    $env:PATH = $BIN + [IO.Path]::PathSeparator + $env:PATH
    # Tudo fica dentro de .creator-hub, e nada de Python do sistema nem configuracao de fora.
    $env:UV_CACHE_DIR = Join-Path $RAIZ 'cache\uv'
    $env:UV_PYTHON_INSTALL_DIR = Join-Path $RAIZ 'python'
    $env:UV_PYTHON_BIN_DIR = Join-Path $RAIZ 'python\bin'
    $env:UV_PYTHON_PREFERENCE = 'only-managed'
    $env:UV_PYTHON_INSTALL_REGISTRY = '0'
    $env:UV_NO_CONFIG = '1'
    $env:UV_EXCLUDE_NEWER = $PYTHON_PACOTES_ATE
    $env:NPM_CONFIG_CACHE = Join-Path $RAIZ 'cache\npm'
    $env:NPM_CONFIG_UPDATE_NOTIFIER = 'false'
    $env:MPLCONFIGDIR = Join-Path $TMP 'matplotlib'
    $env:PYTHONUTF8 = '1'
    # Sem telemetria e sem procurar atualizacao nos comandos deste instalador.
    $env:DO_NOT_TRACK = '1'
    $env:HYPERFRAMES_NO_TELEMETRY = '1'
    $env:HYPERFRAMES_NO_UPDATE_CHECK = '1'
    Remove-Item Env:VIRTUAL_ENV, Env:PYTHONHOME, Env:PYTHONPATH -ErrorAction SilentlyContinue

    Titulo 'Kit de edi\u00e7\u00e3o do Creator Hub'
    $livre = $null
    try { $livre = [math]::Floor((Get-PSDrive -Name ($HOME.Substring(0, 1)) -ErrorAction Stop).Free / 1GB) } catch {}
    if ($null -ne $livre) {
      Linha "Windows 64 bits, $livre GB livres no disco"
      if ($livre -lt 30) { Aviso 'pouco espa\u00e7o no disco. O kit ocupa cerca de 4 GB, contando o modelo de transcri\u00e7\u00e3o, e cada v\u00eddeo pede mais alguns. Libere espa\u00e7o assim que puder.' }
    } else {
      Linha 'Windows 64 bits'
    }

    Titulo 'Programas'
    [void](Passo "Node $NODE_VERSAO" 'ConferirNode' 'InstalarNode' 'baixando')
    [void](Passo "ffmpeg $FFMPEG_VERSAO" 'ConferirFfmpeg' 'InstalarFfmpeg' 'baixando')
    [void](Passo "ffprobe $FFMPEG_VERSAO" 'ConferirFfprobe' 'InstalarFfmpeg' 'baixando')
    [void](Passo "uv $UV_VERSAO" 'ConferirUv' 'InstalarUv' 'baixando')

    Titulo 'Transcri\u00e7\u00e3o e cortes'
    if (Passo 'video-use' 'ConferirVideoUse' 'InstalarVideoUse' 'baixando') {
      [void](Passo 'Transcri\u00e7\u00e3o local' 'ConferirTranscricao' 'InstalarTranscricao' 'copiando')
      if (ConferirUv) {
        [void](Passo 'Ambiente de transcri\u00e7\u00e3o' 'ConferirAmbiente' 'InstalarAmbiente' 'preparando (alguns minutos)')
      } else {
        AnotarFalha 'Ambiente de transcri\u00e7\u00e3o: depende do uv, que n\u00e3o ficou pronto.'
      }
      [void](Passo 'Acentos no Python' 'ConferirUtf8' 'InstalarUtf8' 'ajustando')
    }

    Titulo 'Ferramentas de v\u00eddeo'
    if (ConferirNode) {
      $pacotesOk = Passo 'HyperFrames e Chrome' 'ConferirPacotes' 'InstalarPacotes' 'instalando (alguns minutos)'
      if ($pacotesOk -and -not $CHECAR) { [void](Roda $NODE @($HF_CLI, 'telemetry', 'disable')) }
    } else {
      AnotarFalha 'HyperFrames e Chrome: depende do Node, que n\u00e3o ficou pronto.'
    }

    Titulo 'Sua pasta de trabalho'
    if (Test-Path -LiteralPath $EDICOES) {
      Linha 'Pasta Edicoes: ok'
    } elseif ($CHECAR) {
      Linha 'Pasta Edicoes: falta'
      AnotarFalha 'Pasta Edicoes'
    } else {
      try {
        NovaPasta $EDICOES
        Linha 'Pasta Edicoes: criada'
      } catch {
        Linha 'Pasta Edicoes: n\u00e3o deu certo'
        AnotarFalha 'Pasta Edicoes: n\u00e3o consegui criar a pasta na sua pasta de usu\u00e1rio.'
      }
    }
    CopiarInicial 'CLAUDE.md'
    CopiarInicial '.claude/settings.json'
    InstalarPlugin

    # O cache so serve para retomar uma instalacao interrompida.
    if ((-not $CHECAR) -and $FALHAS.Count -eq 0) {
      Remove-Item -LiteralPath (Join-Path $RAIZ 'cache') -Recurse -Force -ErrorAction SilentlyContinue
    }

    Resumo
    if ($FALHAS.Count -eq 0) { $global:LASTEXITCODE = 0 } else { $global:LASTEXITCODE = 1 }
  } finally {
    if ($TMP) { Remove-Item -LiteralPath $TMP -Recurse -Force -ErrorAction SilentlyContinue }
  }
} @args

# Rodando do arquivo, devolve o resultado para quem chamou. No iex, o exit fecharia a janela da pessoa.
if ($PSCommandPath) { exit $LASTEXITCODE }
