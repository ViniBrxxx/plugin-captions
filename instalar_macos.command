#!/bin/bash
set -e

PLUGIN_NAME="Vini Captions"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CEP_USER="$HOME/Library/Application Support/Adobe/CEP/extensions"
DATA_DIR="$HOME/Library/Application Support/ViniCaptions"

echo ""
echo "============================================"
echo "  $PLUGIN_NAME - Instalador macOS"
echo "============================================"
echo ""

echo "PASSO 1 - Encerrando processos Adobe..."
pkill -f "After Effects" 2>/dev/null || true
pkill -f "Adobe Premiere Pro" 2>/dev/null || true
pkill -f "CEPHtmlEngine" 2>/dev/null || true
sleep 1
echo "   OK"
echo ""

echo "PASSO 2 - Removendo versoes anteriores..."
for id in \
  "com.seuPlugin.legendas" \
  "com.seuplugin.legendas" \
  "com.seuplugin.legendas.panel" \
  "com.seuplugin.legendas.ae" \
  "com.seuplugin.legendas.premiere"; do
  rm -rf "$CEP_USER/$id" 2>/dev/null || true
done
echo "   OK"
echo ""

echo "PASSO 3 - Instalando extensoes CEP..."
mkdir -p "$CEP_USER"

AE_SRC="$SCRIPT_DIR/plugins/AE/com.seuplugin.legendas"
AE_DST="$CEP_USER/com.seuplugin.legendas.ae"
PR_SRC="$SCRIPT_DIR/plugins/Premiere/com.seuplugin.legendas"
PR_DST="$CEP_USER/com.seuplugin.legendas.premiere"

if [ ! -d "$AE_SRC" ]; then
  echo "   ERRO: pasta nao encontrada - $AE_SRC"
  exit 1
fi
if [ ! -d "$PR_SRC" ]; then
  echo "   ERRO: pasta nao encontrada - $PR_SRC"
  exit 1
fi

cp -R "$AE_SRC" "$AE_DST"
cp -R "$PR_SRC" "$PR_DST"
echo "   After Effects: $AE_DST"
echo "   Premiere Pro:  $PR_DST"
echo "   OK"
echo ""

echo "PASSO 4 - Habilitando extensoes Adobe CEP sem assinatura..."
for v in 9 10 11 12 13; do
  defaults write "com.adobe.CSXS.$v" PlayerDebugMode 1 2>/dev/null || true
done
echo "   OK"
echo ""

echo "PASSO 5 - Criando pasta de dados..."
mkdir -p "$DATA_DIR"
if [ -f "$SCRIPT_DIR/bootstrap/dados_iniciais.json" ]; then
  cp "$SCRIPT_DIR/bootstrap/dados_iniciais.json" "$DATA_DIR/dados_iniciais.json"
fi
echo "   $DATA_DIR"
echo "   OK"
echo ""

echo "============================================"
echo "  Instalacao concluida com sucesso!"
echo "============================================"
echo ""
echo "Abra novamente o aplicativo Adobe:"
echo "  After Effects  > Janela > Extensoes > Vini Captions"
echo "  Premiere Pro   > Janela > Extensoes > Vini Captions"
echo ""
