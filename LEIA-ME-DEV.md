# Vini Captions - Guia do Desenvolvedor

Projeto CEP para Adobe After Effects e Adobe Premiere Pro.

## Estrutura

```text
meu-plugin-legendas/
  instalar_windows.bat
  instalar_macos.command
  installer/
    instalar_windows.ps1
  bootstrap/
    dados_iniciais.json
  plugins/
    AE/
      com.seuplugin.legendas/
        CSXS/manifest.xml
        CSInterface.js
        index.html
        panel.css
        panel.js
        host/bridge.jsx
    Premiere/
      com.seuplugin.legendas/
        CSXS/manifest.xml
        CSInterface.js
        index.html
        panel.css
        panel.js
        host/bridge.jsx
```

## O que esta implementado

- Painel CEP completo para AE e Premiere.
- CSInterface minimo embutido.
- Parser SRT compartilhado nas bridges.
- Preview visual dos presets no painel.
- Presets: Fade, Slide Up, Scale Pop, Typewriter e Bounce.
- Licenca local/API: se a API estiver vazia, o painel permite ativacao local de teste por 14 dias.
- Dados locais em `ViniCaptions` no AppData/Application Support.
- Instalador Windows e macOS instalando AE e Premiere com IDs separados.

## After Effects

No AE o plugin cria text layers reais dentro da composicao ativa.

Funcionalidades:

- Criar uma legenda avulsa no tempo atual ou em 0:00.
- Importar um SRT e criar uma layer por entrada.
- Aplicar estilo, posicao e preset nas layers selecionadas.
- Salvar estilo padrao local.

## Premiere Pro

No Premiere o CEP/ExtendScript nao oferece o mesmo controle direto para criar texto grafico nativo sem MOGRT. Por isso o fluxo estavel implementado e:

- Importar o SRT para o projeto.
- Criar markers sincronizados na sequencia ativa com nome, comentario e duracao.
- Criar marker avulso no CTI com o texto informado.

Para animacao visual real no Premiere, o proximo passo natural e conectar um fluxo MOGRT via `sequence.importMGT`.

## Instalacao

Windows:

```bat
instalar_windows.bat
```

O instalador Windows instala em `%APPDATA%\Adobe\CEP\extensions`, sem exigir administrador.

macOS:

```bash
./instalar_macos.command
```

Depois de instalar, feche e abra novamente o aplicativo Adobe.

- After Effects: `Janela > Extensoes > Vini Captions`
- Premiere Pro: `Janela > Extensoes > Vini Captions`

## Licenciamento

O painel aceita duas formas:

- API: preencha `API opcional` com a base do backend. O painel chama `POST /validate-key`.
- Local: deixe API vazia e use uma chave com pelo menos 8 caracteres, ou clique em `Ativar teste local`.

Resposta esperada da API:

```json
{ "ok": true, "token": "...", "plan": "monthly", "expiresAt": "2026-12-31T23:59:59.000Z" }
```

Erro:

```json
{ "ok": false, "error": "Chave invalida ou expirada." }
```

## Desenvolvimento

1. Edite `panel.js`/`panel.css` para UI.
2. Edite `host/bridge.jsx` para funcoes do host.
3. Reinstale ou copie a pasta da extensao para o destino CEP.
4. No painel Adobe, clique com o botao direito e use `Reload Extension`.

## MOGRT de teste

Para gerar um template simples com texto editavel:

```bat
criar_mogrt_teste.bat
```

O After Effects abrira, criara `mogrt-teste/MPL_Legenda_Teste.mogrt` e exportara um texto chamado `Caption Text` no Essential Graphics. Selecione esse `.mogrt` no plugin do Premiere para testar a injecao de legendas animadas.

## Observacoes

- Os IDs instalados sao `com.seuplugin.legendas.ae` e `com.seuplugin.legendas.premiere`, evitando que um host sobrescreva o outro.
- A pasta antiga `com.seuPlugin.legendas` do zip original nao e usada pelos instaladores novos.
- O zip original trazia uma pasta `{plugins` acidental. Ela nao faz parte do projeto funcional.
