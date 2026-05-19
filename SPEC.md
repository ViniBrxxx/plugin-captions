# SPEC - Vini Captions

## Objetivo

Entregar um plugin de legendas instalavel para Adobe After Effects e Adobe Premiere Pro, usando CEP, com UI unica, parser SRT, presets visuais, persistencia local, uso livre sem bloqueio por licenca e instaladores.

## Ordem de implementacao

1. Scaffold e conexao minima
   - Criar estrutura CEP por host.
   - Adicionar manifests, CSInterface e painel carregavel.
   - Validar ponte `evalScript` com `EP_isReady`.

2. Engine e presets
   - Implementar parser SRT.
   - Criar catalogo de presets.
   - Implementar aplicacao de keyframes no AE.
   - Implementar markers/importacao SRT no Premiere.

3. UI do painel
   - Criar abas Criar, SRT, Estilo, Licenca e Log.
   - Adicionar preview em canvas.
   - Conectar controles de estilo ao host.

4. Injecao no host
   - AE: criar layers de texto, importar SRT, aplicar presets em selecionados.
   - Premiere: importar SRT no projeto e criar markers sincronizados na sequencia.

5. Polish e distribuicao
   - Salvar estilo e sessao local.
   - Liberar o uso sem chave, API ou expiracao.
   - Atualizar instaladores Windows/macOS.
   - Documentar uso e limitacoes tecnicas.

## Requisitos funcionais

- O painel deve carregar em AE 22+ e Premiere 22+ via CEP 11+.
- O usuario deve conseguir criar uma legenda avulsa.
- O usuario deve conseguir selecionar um SRT, visualizar entradas e importar.
- O usuario deve conseguir escolher preset e estilo antes da importacao.
- O painel deve persistir estilo e sessao local.
- O instalador deve instalar AE e Premiere sem conflito de ID.

## Decisoes tecnicas

- CEP foi mantido porque o pacote original ja estava nesse formato.
- O Premiere usa markers como saida scriptavel estavel. Criacao de grafico animado no Premiere depende de MOGRT externo e fica como evolucao.
- O painel usa HTML/CSS/JS puro para nao exigir build step.
- CSInterface e minimo, cobrindo somente os metodos usados pelo painel.
