/*
 * Gerador de MOGRT de teste para Vini Captions.
 * Rode este script no After Effects: File > Scripts > Run Script File...
 */
(function () {
  var scriptFile = new File($.fileName);
  var PROJECT_ROOT = scriptFile.parent.parent.fsName.replace(/\\/g, "/");
  var OUT_DIR = PROJECT_ROOT + "/mogrt-teste";
  var TEMPLATE_NAME = "MPL_Legenda_Teste";
  var PLACEHOLDER = "Adjust text styles";
  var LOG_FILE = OUT_DIR + "/gerador-log.txt";

  function writeLog(message) {
    try {
      var folder = new Folder(OUT_DIR);
      if (!folder.exists) folder.create();
      var file = new File(LOG_FILE);
      file.encoding = "UTF-8";
      file.open(file.exists ? "a" : "w");
      file.writeln("[" + (new Date()).toString() + "] " + message);
      file.close();
    } catch (e) {}
  }

  function ensureFolder(path) {
    var folder = new Folder(path);
    if (!folder.exists) folder.create();
    return folder;
  }

  function removeIfExists(path) {
    var file = new File(path);
    if (file.exists) {
      try { file.remove(); } catch (e) {}
    }
  }

  function addTextControls(comp, textLayer) {
    writeLog("Expondo Source Text no Essential Graphics...");
    var sourceText = textLayer.property("ADBE Text Properties").property("ADBE Text Document");
    var added = false;

    try {
      if (sourceText.canAddToMotionGraphicsTemplate(comp)) {
        sourceText.addToMotionGraphicsTemplateAs(comp, "Caption Text");
        added = true;
        writeLog("Source Text exposto como Caption Text.");
      }
    } catch (e1) { writeLog("Falha addToMotionGraphicsTemplateAs: " + e1.toString()); }

    if (!added) {
      try {
        sourceText.addToMotionGraphicsTemplate(comp);
        added = true;
        writeLog("Source Text exposto com nome padrao.");
      } catch (e2) { writeLog("Falha addToMotionGraphicsTemplate: " + e2.toString()); }
    }

    if (!added) {
      writeLog("ERRO: Source Text nao foi exposto.");
    }
  }

  function createTemplate() {
    writeLog("Iniciando geracao do MOGRT.");
    var outFolder = ensureFolder(OUT_DIR);
    removeIfExists(OUT_DIR + "/" + TEMPLATE_NAME + ".aep");

    app.newProject();
    writeLog("Projeto novo criado.");
    app.beginUndoGroup("Criar MOGRT de teste");

    var comp = app.project.items.addComp(TEMPLATE_NAME, 1080, 1920, 1, 5, 30);
    comp.motionGraphicsTemplateName = TEMPLATE_NAME;
    comp.openInViewer();
    writeLog("Composicao criada.");

    var textLayer = comp.layers.addText(PLACEHOLDER);
    textLayer.name = "MPL Caption Text";
    textLayer.inPoint = 0;
    textLayer.outPoint = comp.duration;

    var sourceText = textLayer.property("ADBE Text Properties").property("ADBE Text Document");
    var textDoc = sourceText.value;
    textDoc.text = PLACEHOLDER;
    textDoc.fontSize = 88;
    textDoc.fillColor = [1, 1, 1];
    textDoc.applyFill = true;
    textDoc.applyStroke = true;
    textDoc.strokeColor = [0.02, 0.02, 0.02];
    textDoc.strokeWidth = 8;
    textDoc.strokeOverFill = false;
    textDoc.justification = ParagraphJustification.CENTER_JUSTIFY;
    try { textDoc.font = "Arial-BoldMT"; } catch (fontErr) {}
    sourceText.setValue(textDoc);

    var rect = textLayer.sourceRectAtTime(0, false);
    textLayer.property("ADBE Transform Group").property("ADBE Anchor Point").setValue([
      rect.left + rect.width / 2,
      rect.top + rect.height / 2
    ]);
    textLayer.property("ADBE Transform Group").property("ADBE Position").setValue([540, 1475]);

    var opacity = textLayer.property("ADBE Transform Group").property("ADBE Opacity");
    opacity.setValueAtTime(0.00, 0);
    opacity.setValueAtTime(0.18, 100);
    opacity.setValueAtTime(4.75, 100);
    opacity.setValueAtTime(5.00, 0);

    var position = textLayer.property("ADBE Transform Group").property("ADBE Position");
    position.setValueAtTime(0.00, [540, 1535]);
    position.setValueAtTime(0.24, [540, 1475]);

    var scale = textLayer.property("ADBE Transform Group").property("ADBE Scale");
    scale.setValueAtTime(0.00, [86, 86]);
    scale.setValueAtTime(0.18, [108, 108]);
    scale.setValueAtTime(0.28, [100, 100]);

    addTextControls(comp, textLayer);

    app.endUndoGroup();

    writeLog("Salvando AEP...");
    app.project.save(new File(OUT_DIR + "/" + TEMPLATE_NAME + ".aep"));

    var exported = false;
    try {
      writeLog("Exportando MOGRT...");
      exported = comp.exportAsMotionGraphicsTemplate(true, outFolder.fsName);
    } catch (exportErr) {
      writeLog("ERRO exportAsMotionGraphicsTemplate: " + exportErr.toString());
      alert("Erro ao exportar MOGRT: " + exportErr.toString());
      return;
    }

    if (exported) {
      writeLog("MOGRT exportado com sucesso.");
      alert("MOGRT criado:\n" + OUT_DIR + "/" + TEMPLATE_NAME + ".mogrt\n\nSelecione este arquivo no plugin.");
    } else {
      writeLog("After Effects retornou false na exportacao.");
      alert("After Effects nao confirmou a exportacao. Verifique a pasta:\n" + OUT_DIR);
    }
  }

  try {
    createTemplate();
  } catch (fatalErr) {
    writeLog("ERRO fatal: " + fatalErr.toString());
    alert("Erro fatal no gerador de MOGRT:\n" + fatalErr.toString() + "\n\nVeja o log:\n" + LOG_FILE);
  }
})();
