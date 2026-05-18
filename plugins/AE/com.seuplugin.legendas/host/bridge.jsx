/*
 * Vini Captions - After Effects bridge
 * Runs inside ExtendScript through Adobe CEP.
 */
(function (global) {
  var VERSION = "1.0.0";
  var DATA_DIR_NAME = "ViniCaptions";

  function ok(extra) {
    var out = { ok: true };
    if (extra) {
      for (var k in extra) {
        if (extra.hasOwnProperty(k)) out[k] = extra[k];
      }
    }
    return JSON.stringify(out);
  }

  function err(message, extra) {
    var out = { ok: false, error: String(message) };
    if (extra) {
      for (var k in extra) {
        if (extra.hasOwnProperty(k)) out[k] = extra[k];
      }
    }
    return JSON.stringify(out);
  }

  function parseJSON(text, fallback) {
    try {
      if (!text) return fallback;
      return JSON.parse(text);
    } catch (e) {
      return fallback;
    }
  }

  function presets() {
    return [
      { id: "fade", name: "Fade", durationFrames: 10 },
      { id: "slide-up", name: "Slide Up", durationFrames: 12 },
      { id: "scale-pop", name: "Scale Pop", durationFrames: 10 },
      { id: "typewriter", name: "Typewriter", durationFrames: 16 },
      { id: "bounce", name: "Bounce", durationFrames: 14 }
    ];
  }

  function dataFolder() {
    var dir = new Folder(Folder.userData + "/" + DATA_DIR_NAME);
    if (!dir.exists) dir.create();
    return dir;
  }

  function safeFilename(name) {
    return String(name || "").replace(/[\\\/:\*\?"<>\|]+/g, "_");
  }

  function getComp() {
    var comp = app.project ? app.project.activeItem : null;
    if (!comp || !(comp instanceof CompItem)) return null;
    return comp;
  }

  function hexToRgb(hex, fallback) {
    fallback = fallback || [1, 1, 1];
    hex = String(hex || "").replace("#", "");
    if (hex.length !== 6) return fallback;
    var r = parseInt(hex.substr(0, 2), 16);
    var g = parseInt(hex.substr(2, 2), 16);
    var b = parseInt(hex.substr(4, 2), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return fallback;
    return [r / 255, g / 255, b / 255];
  }

  function normalizeStyle(style) {
    style = style || {};
    return {
      fontFamily: style.fontFamily || "Arial-BoldMT",
      fontSize: parseInt(style.fontSize, 10) || 54,
      fillColor: style.fillColor || "#ffffff",
      strokeColor: style.strokeColor || "#111111",
      strokeWidth: parseInt(style.strokeWidth, 10) || 0,
      positionY: parseInt(style.positionY, 10) || 84,
      allCaps: !!style.allCaps,
      presetId: style.presetId || "slide-up",
      durationFrames: parseInt(style.durationFrames, 10) || 12,
      startMode: style.startMode || "cti",
      duration: parseFloat(style.duration) || 3
    };
  }

  function cleanText(text, allCaps) {
    text = String(text || "")
      .replace(/<[^>]+>/g, "")
      .replace(/\{\\an\d\}/g, "")
      .replace(/^\s+|\s+$/g, "");
    return allCaps ? text.toUpperCase() : text;
  }

  function secondsFromMatch(match, offset) {
    var h = parseInt(match[offset], 10) || 0;
    var m = parseInt(match[offset + 1], 10) || 0;
    var s = parseInt(match[offset + 2], 10) || 0;
    var ms = parseInt((match[offset + 3] || "0").substr(0, 3), 10) || 0;
    return h * 3600 + m * 60 + s + ms / 1000;
  }

  function parseSrtContent(content) {
    content = String(content || "").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    var blocks = content.split(/\n\s*\n+/);
    var entries = [];
    for (var i = 0; i < blocks.length; i++) {
      var lines = blocks[i].split("\n");
      var timeIndex = -1;
      for (var j = 0; j < lines.length; j++) {
        if (lines[j].indexOf("-->") !== -1) {
          timeIndex = j;
          break;
        }
      }
      if (timeIndex < 0) continue;
      var match = lines[timeIndex].match(/(\d+):(\d+):(\d+)[,.](\d+)\s*-->\s*(\d+):(\d+):(\d+)[,.](\d+)/);
      if (!match) continue;
      var textLines = [];
      for (var t = timeIndex + 1; t < lines.length; t++) {
        if (lines[t].replace(/\s/g, "").length) textLines.push(lines[t]);
      }
      var text = cleanText(textLines.join("\n"), false);
      if (!text) continue;
      entries.push({
        index: entries.length + 1,
        inTime: secondsFromMatch(match, 1),
        outTime: secondsFromMatch(match, 5),
        text: text
      });
    }
    return entries;
  }

  function readTextFile(path) {
    var file = new File(path);
    if (!file.exists) throw new Error("Arquivo nao encontrado: " + path);
    file.encoding = "UTF-8";
    if (!file.open("r")) throw new Error("Nao foi possivel abrir: " + path);
    var content = file.read();
    file.close();
    return content;
  }

  function setTextStyle(layer, text, style) {
    var source = layer.property("Source Text");
    var doc = source.value;
    doc.text = cleanText(text, style.allCaps);
    doc.fontSize = style.fontSize;
    doc.fillColor = hexToRgb(style.fillColor, [1, 1, 1]);
    doc.justification = ParagraphJustification.CENTER_JUSTIFY;
    try { doc.font = style.fontFamily; } catch (e0) {}
    try {
      doc.applyFill = true;
      doc.applyStroke = style.strokeWidth > 0;
      doc.strokeColor = hexToRgb(style.strokeColor, [0, 0, 0]);
      doc.strokeWidth = style.strokeWidth;
      doc.strokeOverFill = false;
    } catch (e1) {}
    source.setValue(doc);
  }

  function centerAnchor(layer, time) {
    try {
      var rect = layer.sourceRectAtTime(time, false);
      layer.property("Transform").property("Anchor Point").setValue([
        rect.left + rect.width / 2,
        rect.top + rect.height / 2
      ]);
    } catch (e) {}
  }

  function setCaptionPosition(layer, comp, style) {
    var y = comp.height * Math.max(5, Math.min(95, style.positionY)) / 100;
    layer.property("Transform").property("Position").setValue([comp.width / 2, y]);
  }

  function setEase(prop, keyIndex) {
    try {
      var easeIn = new KeyframeEase(0, 65);
      var easeOut = new KeyframeEase(0, 65);
      prop.setTemporalEaseAtKey(keyIndex, [easeIn], [easeOut]);
    } catch (e) {}
  }

  function addOpacityFade(layer, inTime, outTime, dur) {
    var opacity = layer.property("Transform").property("Opacity");
    var endIn = Math.min(inTime + dur, outTime);
    var startOut = Math.max(inTime, outTime - dur);
    opacity.setValueAtTime(inTime, 0);
    opacity.setValueAtTime(endIn, 100);
    if (outTime - inTime > dur * 1.5) {
      opacity.setValueAtTime(startOut, 100);
      opacity.setValueAtTime(outTime, 0);
    }
    for (var i = 1; i <= opacity.numKeys; i++) setEase(opacity, i);
  }

  function applyPreset(layer, comp, style) {
    var fps = comp.frameRate || 30;
    var dur = Math.max(1 / fps, style.durationFrames / fps);
    var inTime = layer.inPoint;
    var outTime = layer.outPoint;
    var presetId = style.presetId || "fade";
    var transform = layer.property("Transform");
    var pos = transform.property("Position");
    var scale = transform.property("Scale");
    var basePos = pos.value;

    addOpacityFade(layer, inTime, outTime, dur);

    if (presetId === "slide-up") {
      pos.setValueAtTime(inTime, [basePos[0], basePos[1] + comp.height * 0.045]);
      pos.setValueAtTime(Math.min(inTime + dur, outTime), basePos);
    } else if (presetId === "scale-pop") {
      scale.setValueAtTime(inTime, [78, 78]);
      scale.setValueAtTime(Math.min(inTime + dur * .65, outTime), [108, 108]);
      scale.setValueAtTime(Math.min(inTime + dur, outTime), [100, 100]);
    } else if (presetId === "bounce") {
      pos.setValueAtTime(inTime, [basePos[0], basePos[1] + comp.height * 0.035]);
      pos.setValueAtTime(Math.min(inTime + dur * .55, outTime), [basePos[0], basePos[1] - comp.height * 0.012]);
      pos.setValueAtTime(Math.min(inTime + dur, outTime), basePos);
      scale.setValueAtTime(inTime, [94, 94]);
      scale.setValueAtTime(Math.min(inTime + dur * .55, outTime), [104, 104]);
      scale.setValueAtTime(Math.min(inTime + dur, outTime), [100, 100]);
    } else if (presetId === "typewriter") {
      addTypewriterFallback(layer, inTime, Math.min(inTime + dur, outTime));
    }

    for (var p = 1; p <= pos.numKeys; p++) setEase(pos, p);
    for (var s = 1; s <= scale.numKeys; s++) setEase(scale, s);
  }

  function addTypewriterFallback(layer, inTime, endTime) {
    try {
      var textProps = layer.property("ADBE Text Properties");
      var animators = textProps.property("ADBE Text Animators");
      var animator = animators.addProperty("ADBE Text Animator");
      animator.name = "EP Typewriter";
      var selector = animator.property("ADBE Text Selectors").addProperty("ADBE Text Selector");
      var animatorProps = animator.property("ADBE Text Animator Properties");
      var opacity = animatorProps.addProperty("ADBE Text Opacity");
      opacity.setValue(0);
      selector.property("ADBE Text Percent Start").setValueAtTime(inTime, 0);
      selector.property("ADBE Text Percent Start").setValueAtTime(endTime, 100);
    } catch (e) {
      layer.property("Transform").property("Opacity").setValueAtTime(inTime, 0);
      layer.property("Transform").property("Opacity").setValueAtTime(endTime, 100);
    }
  }

  function createTextLayer(comp, text, style, startTime, endTime, name) {
    var layer = comp.layers.addText(cleanText(text, style.allCaps));
    setTextStyle(layer, text, style);
    layer.name = name || "Legenda";
    layer.inPoint = Math.max(0, startTime);
    layer.outPoint = Math.max(layer.inPoint + 0.05, Math.min(endTime, comp.duration));
    centerAnchor(layer, layer.inPoint);
    setCaptionPosition(layer, comp, style);
    applyPreset(layer, comp, style);
    return layer;
  }

  global.EP_isReady = function () {
    return ok({ version: VERSION, host: "AE" });
  };

  global.EP_getPresetCatalog = function () {
    return ok({ presets: presets() });
  };

  global.EP_getHostInfo = function () {
    try {
      if (!app.project) return err("Nenhum projeto aberto.");
      var comp = getComp();
      return ok({
        version: VERSION,
        projectName: app.project.file ? app.project.file.name : "(sem nome)",
        itemCount: app.project.numItems,
        activeItem: comp ? (comp.name + " " + comp.width + "x" + comp.height + " @" + comp.frameRate.toFixed(2) + "fps") : "Nenhuma composicao ativa"
      });
    } catch (e) {
      return err(e.toString());
    }
  };

  global.EP_parseSRTFile = function (path) {
    try {
      var entries = parseSrtContent(readTextFile(path));
      if (!entries.length) return err("Nenhuma legenda encontrada no SRT.");
      return ok({ path: path, count: entries.length, entries: entries });
    } catch (e) {
      return err(e.toString());
    }
  };

  global.EP_openSRTDialog = function () {
    try {
      var file = File.openDialog("Selecione o arquivo SRT", "SRT:*.srt,Todos:*.*");
      if (!file) return JSON.stringify({ ok: false, cancelled: true });
      return ok({ path: file.fsName });
    } catch (e) {
      return err(e.toString());
    }
  };

  global.EP_createCaption = function (text, styleJson) {
    var undoOpen = false;
    try {
      var comp = getComp();
      if (!comp) return err("Abra uma composicao ativa.");
      var style = normalizeStyle(parseJSON(styleJson, {}));
      var start = style.startMode === "zero" ? 0 : comp.time;
      var end = Math.min(comp.duration, start + Math.max(0.25, style.duration));
      app.beginUndoGroup("Vini Captions - Criar legenda");
      undoOpen = true;
      var layer = createTextLayer(comp, text, style, start, end, "Legenda - " + cleanText(text, false).substr(0, 32));
      app.endUndoGroup();
      undoOpen = false;
      return ok({ status: "Layer criada: " + layer.name, layerName: layer.name, layerIndex: layer.index });
    } catch (e) {
      if (undoOpen) {
        try { app.endUndoGroup(); } catch (endErr) {}
      }
      return err(e.toString());
    }
  };

  global.EP_importSRT = function (path, styleJson) {
    var undoOpen = false;
    try {
      var comp = getComp();
      if (!comp) return err("Abra uma composicao ativa.");
      var style = normalizeStyle(parseJSON(styleJson, {}));
      var entries = parseSrtContent(readTextFile(path));
      if (!entries.length) return err("Nenhuma legenda encontrada no SRT.");

      app.beginUndoGroup("Vini Captions - Importar SRT");
      undoOpen = true;
      var created = 0;
      for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        if (entry.inTime >= comp.duration) continue;
        if (entry.outTime <= entry.inTime) entry.outTime = entry.inTime + 1;
        createTextLayer(comp, entry.text, style, entry.inTime, Math.min(entry.outTime, comp.duration), "Legenda " + (i + 1));
        created++;
      }
      app.endUndoGroup();
      undoOpen = false;
      return ok({
        status: created + " legenda(s) criada(s) no AE.",
        count: created,
        entries: entries
      });
    } catch (e) {
      if (undoOpen) {
        try { app.endUndoGroup(); } catch (endErr) {}
      }
      return err(e.toString());
    }
  };

  global.EP_applyPresetToSelected = function (styleJson) {
    var undoOpen = false;
    try {
      var comp = getComp();
      if (!comp) return err("Abra uma composicao ativa.");
      if (!comp.selectedLayers || comp.selectedLayers.length === 0) return err("Selecione uma ou mais layers.");
      var style = normalizeStyle(parseJSON(styleJson, {}));
      app.beginUndoGroup("Vini Captions - Aplicar preset");
      undoOpen = true;
      for (var i = 0; i < comp.selectedLayers.length; i++) {
        var layer = comp.selectedLayers[i];
        setCaptionPosition(layer, comp, style);
        try {
          if (layer.property("Source Text")) {
            var doc = layer.property("Source Text").value;
            setTextStyle(layer, doc.text, style);
          }
        } catch (textErr) {}
        applyPreset(layer, comp, style);
      }
      app.endUndoGroup();
      undoOpen = false;
      return ok({ status: "Preset aplicado em " + comp.selectedLayers.length + " layer(s)." });
    } catch (e) {
      if (undoOpen) {
        try { app.endUndoGroup(); } catch (endErr) {}
      }
      return err(e.toString());
    }
  };

  global.EP_getMachineId = function () {
    try {
      var parts = [
        $.getenv("COMPUTERNAME") || "",
        $.getenv("HOSTNAME") || "",
        $.getenv("USERNAME") || "",
        $.getenv("USER") || "",
        "AE"
      ].join("|");
      var hash = 5381;
      for (var i = 0; i < parts.length; i++) {
        hash = ((hash << 5) + hash) + parts.charCodeAt(i);
        hash = hash & hash;
      }
      return ok({ machineId: "MPL-" + Math.abs(hash).toString(16).toUpperCase() });
    } catch (e) {
      return err(e.toString());
    }
  };

  global.EP_saveLocalData = function (filename, content) {
    try {
      var file = new File(dataFolder().fsName + "/" + safeFilename(filename));
      file.encoding = "UTF-8";
      if (!file.open("w")) return err("Nao foi possivel gravar " + filename);
      file.write(String(content || ""));
      file.close();
      return ok({ path: file.fsName });
    } catch (e) {
      return err(e.toString());
    }
  };

  global.EP_loadLocalData = function (filename) {
    try {
      var file = new File(dataFolder().fsName + "/" + safeFilename(filename));
      if (!file.exists) return JSON.stringify({ ok: false, notFound: true });
      file.encoding = "UTF-8";
      if (!file.open("r")) return err("Nao foi possivel ler " + filename);
      var content = file.read();
      file.close();
      return ok({ content: content, path: file.fsName });
    } catch (e) {
      return err(e.toString());
    }
  };

  global.EP_openDataFolder = function () {
    try {
      var dir = dataFolder();
      dir.execute();
      return ok({ status: "Pasta de dados aberta.", path: dir.fsName });
    } catch (e) {
      return err(e.toString());
    }
  };

})($.global);

true;
