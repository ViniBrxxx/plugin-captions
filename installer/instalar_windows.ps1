param(
  [string]$SrcDir,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($SrcDir)) {
  $SrcDir = Split-Path -Parent $PSScriptRoot
}
$SrcDir = $SrcDir.Trim().Trim('"')
$SrcDir = (Resolve-Path -LiteralPath $SrcDir).Path

$PLUGIN_NAME = 'Vini Captions'
$DATA_DIR = [System.IO.Path]::Combine($env:APPDATA, 'ViniCaptions')

$cep = [System.IO.Path]::Combine($env:APPDATA, 'Adobe', 'CEP', 'extensions')

$extensions = @(
  @{
    Host = 'After Effects'
    Source = [System.IO.Path]::Combine($SrcDir, 'plugins', 'AE', 'com.seuplugin.legendas')
    DestinationName = 'com.seuplugin.legendas.ae'
  },
  @{
    Host = 'Premiere Pro'
    Source = [System.IO.Path]::Combine($SrcDir, 'plugins', 'Premiere', 'com.seuplugin.legendas')
    DestinationName = 'com.seuplugin.legendas.premiere'
  }
)

function Remove-Safe {
  param([string]$Path)
  if (Test-Path -LiteralPath $Path) {
    try {
      if (-not $DryRun) {
        Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction Stop
      }
      Write-Host "   Removido: $Path"
    } catch {
      Write-Host "   AVISO: nao foi possivel remover $Path"
      Write-Host "   $_"
    }
  }
}

function Stop-AdobeProcesses {
  $procs = Get-Process -ErrorAction SilentlyContinue | Where-Object {
    $_.ProcessName -match 'AfterFX|Adobe Premiere Pro|Premiere|CEPHtmlEngine'
  }
  if (-not $procs) { return }
  Write-Host 'Encerrando processos Adobe...'
  $procs | ForEach-Object {
    try {
      Stop-Process -Id $_.Id -Force
      Write-Host "   Encerrado: $($_.ProcessName)"
    } catch {
      Write-Host "   AVISO: $($_.ProcessName)"
    }
  }
  Start-Sleep -Seconds 2
}

Write-Host ''
Write-Host '============================================'
Write-Host "  $PLUGIN_NAME - Instalador Windows"
Write-Host '============================================'
Write-Host ''
Write-Host "Origem: $SrcDir"
Write-Host "Destino CEP: $cep"
Write-Host ''

if (-not $DryRun) {
  Stop-AdobeProcesses
}

Write-Host 'PASSO 1 - Removendo versoes anteriores...'
$legacyIds = @(
  'com.seuPlugin.legendas',
  'com.seuplugin.legendas',
  'com.seuplugin.legendas.panel',
  'com.seuplugin.legendas.ae',
  'com.seuplugin.legendas.premiere'
)
foreach ($id in $legacyIds) {
  Remove-Safe ([System.IO.Path]::Combine($cep, $id))
  Remove-Safe ([System.IO.Path]::Combine($env:APPDATA, 'Adobe', 'CEP', 'extensions', $id))
}
Write-Host '   OK'
Write-Host ''

Write-Host 'PASSO 2 - Instalando extensoes CEP...'
if (-not $DryRun -and !(Test-Path -LiteralPath $cep)) {
  New-Item -Path $cep -ItemType Directory -Force | Out-Null
}
foreach ($ext in $extensions) {
  $src = $ext.Source
  $dst = [System.IO.Path]::Combine($cep, $ext.DestinationName)
  if (-not (Test-Path -LiteralPath $src)) {
    Write-Host "   ERRO: pasta nao encontrada - $src"
    exit 1
  }
  if (-not $DryRun) {
    Copy-Item -LiteralPath $src -Destination $dst -Recurse -Force
  }
  Write-Host "   $($ext.Host): $dst"
}
Write-Host '   OK'
Write-Host ''

Write-Host 'PASSO 3 - Habilitando extensoes Adobe CEP sem assinatura...'
foreach ($v in 9, 10, 11, 12, 13) {
  $ku = "HKCU:\SOFTWARE\Adobe\CSXS.$v"
  if (-not $DryRun) {
    if (!(Test-Path $ku)) { New-Item $ku -Force | Out-Null }
    Set-ItemProperty $ku PlayerDebugMode '1'
  }
}
Write-Host '   OK'
Write-Host ''

Write-Host 'PASSO 4 - Criando pasta de dados...'
if (-not $DryRun -and !(Test-Path -LiteralPath $DATA_DIR)) {
  New-Item $DATA_DIR -ItemType Directory -Force | Out-Null
}
$bootstrap = [System.IO.Path]::Combine($SrcDir, 'bootstrap', 'dados_iniciais.json')
if (-not $DryRun -and (Test-Path -LiteralPath $bootstrap)) {
  Copy-Item -LiteralPath $bootstrap -Destination ([System.IO.Path]::Combine($DATA_DIR, 'dados_iniciais.json')) -Force
}
Write-Host "   $DATA_DIR"
Write-Host '   OK'
Write-Host ''

Write-Host '============================================'
Write-Host '  Instalacao concluida com sucesso!'
Write-Host '============================================'
Write-Host ''
Write-Host 'Abra novamente o aplicativo Adobe:'
Write-Host '  After Effects  > Janela > Extensoes > Vini Captions'
Write-Host '  Premiere Pro   > Janela > Extensoes > Vini Captions'
Write-Host ''
