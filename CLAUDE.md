# CLAUDE.md

## Diretrizes do projeto

- Manter o projeto sem etapa de build obrigatoria.
- Preferir HTML/CSS/JS puro e ExtendScript compativel com CEP.
- Nao depender de CDN para o painel carregar.
- Manter AE e Premiere em pastas separadas.
- Usar IDs instalados separados:
  - `com.seuplugin.legendas.ae`
  - `com.seuplugin.legendas.premiere`
- Retornar sempre JSON string nas funcoes `EP_*` da bridge.
- Persistir dados em `Folder.userData/ViniCaptions`.

## Contrato UI -> Host

Todas as chamadas passam por:

```javascript
cs.evalScript("EP_nomeDaFuncao(...)", callback)
```

Funcoes minimas esperadas em cada host:

- `EP_isReady()`
- `EP_getHostInfo()`
- `EP_getPresetCatalog()`
- `EP_openSRTDialog()`
- `EP_parseSRTFile(path)`
- `EP_importSRT(path, styleJson)`
- `EP_createCaption(text, styleJson)`
- `EP_applyPresetToSelected(styleJson)`
- `EP_getMachineId()`
- `EP_saveLocalData(filename, content)`
- `EP_loadLocalData(filename)`
- `EP_openDataFolder()`

## Limitacoes conhecidas

- Premiere Pro: texto grafico animado real exige fluxo MOGRT. A v1 cria markers e importa SRT.
- After Effects: o preset Typewriter tenta usar Text Animator e cai para fade quando a API nao aceita a propriedade.
