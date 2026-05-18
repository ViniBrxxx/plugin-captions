/*
 * Vini Captions - Premiere Pro bridge
 * Runs inside ExtendScript through Adobe CEP.
 */
(function (global) {
  var VERSION = "1.0.0";
  var DATA_DIR_NAME = "ViniCaptions";
  var TICKS_PER_SECOND = 254016000000;
  var DEFAULT_MOGRT_HANDLE_SECONDS = 10;

  if (typeof JSON === "undefined") {
    JSON = {};
  }

  if (typeof JSON.stringify !== "function") {
    JSON.stringify = function (value) {
      function esc(str) {
        return String(str).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r/g, "\\r").replace(/\n/g, "\\n");
      }
      function encode(v) {
        var i;
        var parts;
        if (v === null) return "null";
        if (typeof v === "number" || typeof v === "boolean") return String(v);
        if (typeof v === "string") return '"' + esc(v) + '"';
        if (v instanceof Array) {
          parts = [];
          for (i = 0; i < v.length; i++) parts.push(encode(v[i]));
          return "[" + parts.join(",") + "]";
        }
        if (typeof v === "object") {
          parts = [];
          for (i in v) {
            if (v.hasOwnProperty(i)) parts.push('"' + esc(i) + '":' + encode(v[i]));
          }
          return "{" + parts.join(",") + "}";
        }
        return '""';
      }
      return encode(value);
    };
  }

  function replaceJsonTextValue(raw, text) {
    var s = String(raw || "");
    if (s.indexOf("textEditValue") === -1) return "";
    var escaped = String(text || "")
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\r/g, "\\r")
      .replace(/\n/g, "\\n");
    return s.replace(/("textEditValue"\s*:\s*")([\s\S]*?)(")/, "$1" + escaped + "$3");
  }

  function buildTextParamValue(current, text) {
    var value = current;
    var data = null;

    if (value && typeof value === "object") {
      data = value;
    } else if (typeof JSON.parse === "function") {
      try {
        data = JSON.parse(String(value || ""));
      } catch (parseErr) {
        data = null;
      }
    }

    if (!data || typeof data !== "object") {
      data = {
        capPropFontEdit: false,
        capPropFontFauxStyleEdit: false,
        capPropFontSizeEdit: false,
        capPropTextRunCount: 1,
        fontEditValue: [""],
        fontFSAllCapsValue: [false],
        fontFSBoldValue: [false],
        fontFSItalicValue: [false],
        fontFSSmallCapsValue: [false],
        fontSizeEditValue: [0],
        fontTextRunLength: [0],
        textEditValue: ""
      };
    }

    data.textEditValue = text;
    data.capPropTextRunCount = 1;
    data.fontTextRunLength = [String(text || "").length];

    try {
      return JSON.stringify(data);
    } catch (stringifyErr) {
      return replaceJsonTextValue(current, text);
    }
  }

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
      if (typeof JSON.parse !== "function") return fallback;
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

  function normalizeStyle(style) {
    style = style || {};
    return {
      allCaps: !!style.allCaps,
      duration: parseFloat(style.duration) || 3,
      startMode: style.startMode || "cti",
      presetId: style.presetId || "fade",
      positionX: typeof style.positionX !== "undefined" ? parseFloat(style.positionX) : 50,
      positionY: typeof style.positionY !== "undefined" ? parseFloat(style.positionY) : 84
    };
  }

  function cleanText(text, allCaps) {
    text = String(text || "")
      .replace(/<[^>]+>/g, "")
      .replace(/\{\\an\d\}/g, "")
      .replace(/^\s+|\s+$/g, "");
    return allCaps ? text.toUpperCase() : text;
  }

  function foldText(text) {
    return String(text || "").toLowerCase()
      .replace(/á/g, "a").replace(/à/g, "a").replace(/â/g, "a").replace(/ã/g, "a").replace(/ä/g, "a")
      .replace(/é/g, "e").replace(/è/g, "e").replace(/ê/g, "e").replace(/ë/g, "e")
      .replace(/í/g, "i").replace(/ì/g, "i").replace(/î/g, "i").replace(/ï/g, "i")
      .replace(/ó/g, "o").replace(/ò/g, "o").replace(/ô/g, "o").replace(/õ/g, "o").replace(/ö/g, "o")
      .replace(/ú/g, "u").replace(/ù/g, "u").replace(/û/g, "u").replace(/ü/g, "u")
      .replace(/ç/g, "c");
  }

  function wordSet(words) {
    var out = {};
    for (var i = 0; i < words.length; i++) out[words[i]] = true;
    return out;
  }

  var AUTOMATION_STOP_WORDS = wordSet([
    "a", "o", "as", "os", "um", "uma", "uns", "umas", "de", "da", "do", "das", "dos",
    "e", "ou", "que", "pra", "para", "por", "com", "sem", "em", "no", "na", "nos", "nas",
    "ao", "aos", "aqui", "ali", "la", "eu", "voce", "voces", "ele", "ela", "eles", "elas",
    "me", "te", "se", "meu", "minha", "seu", "sua", "isso", "isto", "esse", "essa", "este",
    "esta", "mas", "mais", "tambem", "ja", "foi", "ser", "sou", "era", "ter", "tem", "tava",
    "estava", "esta", "estao", "sao", "como", "quando", "onde", "porque"
  ]);

  var AUTOMATION_IMPACT_WORDS = wordSet([
    "agora", "novo", "nova", "nunca", "sempre", "facil", "rapido", "segredo", "metodo",
    "resultado", "resultados", "vender", "vende", "vendas", "dinheiro", "ganhar", "perder",
    "perdendo", "crescer", "crescimento", "erro", "erros", "certo", "errado", "verdade",
    "mentira", "gratis", "premium", "pro", "viral", "virais", "importante", "melhor",
    "pior", "primeiro", "ultimo", "mudou", "mudar", "transformar", "automacao", "automatizar",
    "cliente", "clientes", "lucro", "faturamento", "edicao", "video", "videos", "conteudo",
    "legenda", "legendas", "caption", "captions", "aprenda", "passo", "simples", "perfeito"
  ]);

  function tokenizeForAutomation(text) {
    var raw = cleanText(text, false).replace(/\s+/g, " ").split(" ");
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      var word = String(raw[i] || "").replace(/^[\s\.,;:!\?\(\)\[\]\{\}"'`´“”‘’]+|[\s\.,;:!\?\(\)\[\]\{\}"'`´“”‘’]+$/g, "");
      if (!word || !/[A-Za-z0-9]/.test(foldText(word))) continue;
      out.push({
        text: word,
        key: foldText(word),
        raw: raw[i],
        index: out.length
      });
    }
    return out;
  }

  function automationWordScore(token) {
    var key = token ? token.key : "";
    if (!key) return 0;
    if (AUTOMATION_STOP_WORDS[key]) return -2;
    var score = 1;
    if (key.length >= 5) score += 1;
    if (key.length >= 8) score += 1;
    if (/\d/.test(token.text)) score += 5;
    if (AUTOMATION_IMPACT_WORDS[key]) score += 5;
    if (/^[A-Z0-9]{2,}$/.test(foldText(token.text).toUpperCase()) && token.text === token.text.toUpperCase()) score += 2;
    if (/[!?]/.test(token.raw)) score += 2;
    if (key.indexOf("anti") === 0 || key.indexOf("auto") === 0) score += 1;
    return score;
  }

  function availableTemplateSizes(byWords) {
    var out = {};
    for (var k in byWords) {
      if (byWords.hasOwnProperty(k) && byWords[k] && byWords[k].length) out[k] = true;
    }
    return out;
  }

  function groupThreshold(size) {
    if (size <= 1) return 3;
    if (size === 2) return 4;
    if (size === 3) return 5;
    return 6;
  }

  function automationGroupCandidates(entry, byWords) {
    var tokens = tokenizeForAutomation(entry.text);
    var candidates = [];
    if (!tokens.length) return candidates;
    var available = availableTemplateSizes(byWords);

    for (var start = 0; start < tokens.length; start++) {
      for (var size = 1; size <= 4; size++) {
        if (!available[String(size)]) continue;
        if (start + size > tokens.length) continue;
        var first = tokens[start];
        var last = tokens[start + size - 1];
        if (AUTOMATION_STOP_WORDS[first.key] || AUTOMATION_STOP_WORDS[last.key]) continue;

        var words = [];
        var score = 0;
        var strong = 0;
        for (var i = 0; i < size; i++) {
          var token = tokens[start + i];
          var tokenScore = automationWordScore(token);
          score += tokenScore;
          if (tokenScore >= 4) strong++;
          words.push(token.text);
        }

        if (size > 1 && strong > 0) score += size;
        if (size === 3) score += 1.5;
        if (size === 4 && tokens.length >= 5) score += 1;
        if (size === tokens.length && size > 2) score += 1;
        if (score < groupThreshold(size)) continue;

        candidates.push({
          words: words,
          score: score,
          startIndex: start,
          endIndex: start + size - 1,
          tokenCount: tokens.length
        });
      }
    }

    return candidates;
  }

  function compareAutomationCandidates(a, b) {
    if (b.score !== a.score) return b.score - a.score;
    if (b.words.length !== a.words.length) return b.words.length - a.words.length;
    return a.startIndex - b.startIndex;
  }

  function compareAutomationTimeline(a, b) {
    return a.startIndex - b.startIndex;
  }

  function overlapsUsedRange(candidate, used) {
    for (var i = 0; i < used.length; i++) {
      if (candidate.startIndex <= used[i].end && candidate.endIndex >= used[i].start) return true;
    }
    return false;
  }

  function maxAutomationGroupsForEntry(entry, tokenCount) {
    var duration = Math.max(0, entry.outTime - entry.inTime);
    var byDuration = Math.max(1, Math.floor(duration / 0.65));
    var byTokens = Math.max(1, Math.floor(tokenCount / 2));
    return Math.min(4, byDuration, byTokens);
  }

  function chooseAutomationGroups(entry, byWords) {
    var candidates = automationGroupCandidates(entry, byWords);
    if (!candidates.length) return [];
    candidates.sort(compareAutomationCandidates);

    var limit = maxAutomationGroupsForEntry(entry, candidates[0].tokenCount || 1);
    var picked = [];
    var used = [];

    for (var i = 0; i < candidates.length && picked.length < limit; i++) {
      if (overlapsUsedRange(candidates[i], used)) continue;
      picked.push(candidates[i]);
      used.push({ start: candidates[i].startIndex, end: candidates[i].endIndex });
    }

    picked.sort(compareAutomationTimeline);
    return picked;
  }

  function timingForAutomationGroup(entry, group) {
    var duration = Math.max(0.35, entry.outTime - entry.inTime);
    var tokens = Math.max(1, group.tokenCount || group.words.length || 1);
    var start = entry.inTime + duration * (group.startIndex / tokens);
    var end = entry.inTime + duration * ((group.endIndex + 1) / tokens);
    if (end - start < 0.35) end = Math.min(entry.outTime, start + 0.35);
    if (end <= start) end = start + 0.35;
    return { start: start, end: end };
  }

  function buildTemplateGroups(catalogJson) {
    var list = parseJSON(catalogJson, []);
    var byWords = {};
    for (var i = 0; list && i < list.length; i++) {
      var words = parseInt(list[i].words, 10) || 0;
      var path = String(list[i].path || "");
      if (words < 1 || words > 4 || !path) continue;
      if (!byWords[String(words)]) byWords[String(words)] = [];
      byWords[String(words)].push({
        words: words,
        path: path,
        name: String(list[i].name || ("Animacao " + words))
      });
    }
    return byWords;
  }

  function bundledAutomationTemplateGroups() {
    var byWords = {};
    var defs = [
      { words: 1, rel: "assets/templates/1-palavra/animacao-1.mogrt", name: "Animacao 1" },
      { words: 1, rel: "assets/templates/1-palavra/animacao-4.mogrt", name: "Animacao 4" },
      { words: 1, rel: "assets/templates/1-palavra/animacao-5.mogrt", name: "Animacao 5" },
      { words: 1, rel: "assets/templates/1-palavra/animacao-6.mogrt", name: "Animacao 6" },
      { words: 2, rel: "assets/templates/2-palavras/animacao-7.mogrt", name: "Animacao 7" },
      { words: 3, rel: "assets/templates/3-palavras/animacao-2.mogrt", name: "Animacao 2" },
      { words: 3, rel: "assets/templates/3-palavras/animacao-3.mogrt", name: "Animacao 3" },
      { words: 3, rel: "assets/templates/3-palavras/animacao-9.mogrt", name: "Animacao 9" },
      { words: 3, rel: "assets/templates/3-palavras/animacao-10.mogrt", name: "Animacao 10" },
      { words: 3, rel: "assets/templates/3-palavras/animacao-12.mogrt", name: "Animacao 12" },
      { words: 4, rel: "assets/templates/4-palavras/animacao-11.mogrt", name: "Animacao 11" }
    ];
    var bridgeFile = new File($.fileName);
    var extensionRoot = bridgeFile.parent.parent;
    for (var i = 0; i < defs.length; i++) {
      var file = new File(extensionRoot.fsName + "/" + defs[i].rel);
      if (!file.exists) continue;
      var key = String(defs[i].words);
      if (!byWords[key]) byWords[key] = [];
      byWords[key].push({
        words: defs[i].words,
        path: file.fsName,
        name: defs[i].name
      });
    }
    return byWords;
  }

  function chooseTemplateForWords(count, byWords, usage) {
    var key = String(count);
    var list = byWords[key] || [];
    if (!list.length) return null;
    var used = usage[key] || 0;
    usage[key] = used + 1;
    return list[used % list.length];
  }

  function hasInjectableText(text) {
    return cleanText(text, false).length > 0;
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

  function activeSequence() {
    return app.project ? app.project.activeSequence : null;
  }

  function secondsToTime(seconds) {
    var t = new Time();
    try {
      t.seconds = seconds;
    } catch (e) {
      t.ticks = String(Math.round(seconds * TICKS_PER_SECOND));
    }
    return t;
  }

  function secondsToTicks(seconds) {
    return String(Math.round((Number(seconds) || 0) * TICKS_PER_SECOND));
  }

  function ticksToSeconds(ticks) {
    var n = Number(ticks);
    if (isNaN(n)) return 0;
    return n / TICKS_PER_SECOND;
  }

  function timeToSeconds(timeValue) {
    try {
      if (timeValue && typeof timeValue.seconds !== "undefined") return Number(timeValue.seconds) || 0;
      if (timeValue && timeValue.ticks) return ticksToSeconds(timeValue.ticks);
    } catch (e) {}
    return Number(timeValue) || 0;
  }

  function sequenceFrameSize(seq) {
    var width = 1920;
    var height = 1080;
    try {
      if (seq && seq.frameSizeHorizontal) width = Number(seq.frameSizeHorizontal) || width;
      if (seq && seq.frameSizeVertical) height = Number(seq.frameSizeVertical) || height;
    } catch (e0) {}
    try {
      var settings = seq.getSettings && seq.getSettings();
      if (settings) {
        width = Number(settings.videoFrameWidth || settings.frameSizeHorizontal || settings.videoFrameHorizontal) || width;
        height = Number(settings.videoFrameHeight || settings.frameSizeVertical || settings.videoFrameVertical) || height;
      }
    } catch (e1) {}
    return { width: width, height: height };
  }

  function getCtiSeconds(seq) {
    try {
      var pos = seq.getPlayerPosition();
      if (pos && typeof pos.seconds !== "undefined") return Number(pos.seconds) || 0;
      if (pos && pos.ticks) return ticksToSeconds(pos.ticks);
    } catch (e) {}
    return 0;
  }

  function addMarker(seq, startSec, endSec, text, index) {
    if (!seq || !seq.markers || !seq.markers.createMarker) return false;
    var marker = seq.markers.createMarker(startSec);
    marker.name = "Legenda " + index;
    marker.comments = text;
    try { marker.setTypeAsComment(); } catch (e0) {}
    try { marker.end = secondsToTime(endSec); } catch (e1) {
      try { marker.end = endSec; } catch (e2) {}
    }
    return true;
  }

  function findFreeVideoTrack(seq) {
    try {
      var count = seq.videoTracks ? seq.videoTracks.numTracks : 0;
      if (count > 0) return count - 1;
    } catch (e) {}
    return 0;
  }

  function setClipEnd(clip, endSec) {
    try {
      clip.end = secondsToTime(endSec);
      return true;
    } catch (e0) {}
    try {
      clip.end.seconds = endSec;
      return true;
    } catch (e1) {}
    try {
      clip.end = endSec;
      return true;
    } catch (e2) {}
    return false;
  }

  function setClipSourceWindow(clip, sourceDurationSec) {
    var duration = Math.max(DEFAULT_MOGRT_HANDLE_SECONDS, Number(sourceDurationSec) || 0);
    var changed = false;
    try {
      clip.inPoint = secondsToTime(0);
      changed = true;
    } catch (e0) {
      try {
        clip.inPoint.seconds = 0;
        changed = true;
      } catch (e1) {}
    }
    try {
      clip.outPoint = secondsToTime(duration);
      changed = true;
    } catch (e2) {
      try {
        clip.outPoint.seconds = duration;
        changed = true;
      } catch (e3) {}
    }
    return changed;
  }

  function isClipSelected(clip) {
    try {
      if (clip && clip.isSelected) return !!clip.isSelected();
    } catch (e0) {}
    try {
      return !!clip.selected;
    } catch (e1) {}
    return false;
  }

  function setClipDuration(clip, durationSec) {
    var startSec = 0;
    try { startSec = timeToSeconds(clip.start); } catch (e0) {}
    if (!startSec) {
      try { startSec = timeToSeconds(clip.inPoint); } catch (e1) {}
    }
    setClipSourceWindow(clip, durationSec);
    return setClipEnd(clip, startSec + durationSec);
  }

  function safeSetText(prop, text) {
    try {
      var current = prop.getValue();
      if ((current && typeof current === "object" && typeof current.textEditValue !== "undefined") ||
          (current && String(current).indexOf("textEditValue") !== -1)) {
        var updated = buildTextParamValue(current, text);
        if (updated) {
          prop.setValue(updated, 1);
          return true;
        }
      }
    } catch (e0) {}

    try {
      var built = buildTextParamValue("", text);
      prop.setValue(built, 1);
      return true;
    } catch (e1) {}

    try {
      prop.setValue(text, 1);
      return true;
    } catch (e2) {}

    try {
      prop.setValue(text);
      return true;
    } catch (e3) {}

    return false;
  }

  function textFromParamValue(value) {
    try {
      if (value && typeof value === "object" && typeof value.textEditValue !== "undefined") {
        return cleanText(value.textEditValue, false);
      }
    } catch (e0) {}
    try {
      var raw = String(value || "");
      if (!raw) return "";
      if (raw.indexOf("textEditValue") !== -1 && typeof JSON.parse === "function") {
        try {
          var data = JSON.parse(raw);
          if (data && typeof data.textEditValue !== "undefined") return cleanText(data.textEditValue, false);
        } catch (jsonErr) {}
      }
      if (raw.indexOf("textEditValue") !== -1) {
        var match = raw.match(/"textEditValue"\s*:\s*"([\s\S]*?)"/);
        if (match && match[1]) {
          return cleanText(match[1].replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\"), false);
        }
      }
    } catch (e1) {}
    return "";
  }

  function isUsableExtractedText(text) {
    text = cleanText(text, false);
    if (!text) return false;
    if (text === "[object Object]") return false;
    if (text.length > 160) return false;
    if (/^\d+(\.\d+)?$/.test(text)) return false;
    if (/^[A-Za-z]+-[A-Za-z0-9]+$/.test(text)) return false;
    return true;
  }

  function textFromPlainTextParam(value) {
    try {
      if (value === null || typeof value === "undefined") return "";
      if (typeof value !== "string") return "";
      if (value.indexOf("{") === 0 || value.indexOf("[") === 0) return "";
      return cleanText(value, false);
    } catch (e) {}
    return "";
  }

  function collectTextCandidates(props, out, depth) {
    if (!props || depth > 6) return;
    var total = 0;
    try { total = props.numProperties; } catch (e0) { total = 0; }
    if (!total) {
      try { total = props.numItems; } catch (e1) { total = 0; }
    }
    if (!total) {
      try { total = props.length; } catch (e2) { total = 0; }
    }

    for (var i = 0; i < total; i++) {
      var p = null;
      try { p = props[i]; } catch (idxErr) {}
      if (!p) continue;

      var name = "";
      try { name = String(p.displayName || p.name || "").toLowerCase(); } catch (nameErr) {}
      var isText = name.indexOf("text") !== -1 || name.indexOf("texto") !== -1 ||
        name.indexOf("source") !== -1 || name.indexOf("legenda") !== -1 ||
        name.indexOf("caption") !== -1 || name.indexOf("palavra") !== -1 ||
        name.indexOf("word") !== -1;

      var value = "";
      try { value = p.getValue(); } catch (readErr) {}
      var hasTextEditValue = value && String(value).indexOf("textEditValue") !== -1;
      if (hasTextEditValue) isText = true;
      if (isText && hasTextEditValue) {
        var found = textFromParamValue(value);
        if (isUsableExtractedText(found)) {
          out.push({
            text: found,
            score: (hasTextEditValue ? 100 : 0) + (name.indexOf("source") !== -1 ? 20 : 0) + (name.indexOf("text") !== -1 || name.indexOf("texto") !== -1 ? 10 : 0)
          });
        }
      } else if (isText) {
        var plain = textFromPlainTextParam(value);
        if (isUsableExtractedText(plain)) {
          out.push({
            text: plain,
            score: (name.indexOf("source") !== -1 ? 70 : 0) + (name.indexOf("text") !== -1 || name.indexOf("texto") !== -1 ? 60 : 0) + (name.indexOf("caption") !== -1 || name.indexOf("legenda") !== -1 ? 20 : 0)
          });
        }
      }

      try {
        if (p.properties) collectTextCandidates(p.properties, out, depth + 1);
      } catch (nestedErr) {}
      try {
        if (p.numProperties) collectTextCandidates(p, out, depth + 1);
      } catch (directNestedErr) {}
    }
  }

  function findFirstTextInProperties(props, depth) {
    var candidates = [];
    collectTextCandidates(props, candidates, depth || 0);
    if (!candidates.length) return "";
    candidates.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return b.text.length - a.text.length;
    });
    return candidates[0].text;
  }

  function textFromClip(clip) {
    try {
      if (clip && clip.getMGTComponent) {
        var mgtComponent = clip.getMGTComponent();
        if (mgtComponent && mgtComponent.properties) {
          var mgtText = findFirstTextInProperties(mgtComponent.properties, 0);
          if (mgtText) return mgtText;
        }
      }
      if (!clip || !clip.components) return "";
      var total = 0;
      try { total = clip.components.numItems; } catch (itemsErr) { total = 0; }
      if (!total) {
        try { total = clip.components.numComponents; } catch (componentsErr) { total = 0; }
      }
      if (!total) {
        try { total = clip.components.length; } catch (lengthErr) { total = 0; }
      }
      for (var c = 0; c < total; c++) {
        var comp = clip.components[c];
        if (comp && comp.properties) {
          var text = findFirstTextInProperties(comp.properties, 0);
          if (text) return text;
        }
      }
    } catch (e) {}
    return "";
  }

  function safeSetPosition(prop, x, y, normX, normY) {
    var values = [];
    try {
      var current = prop.getValue();
      if (current && current.length >= 2 && Math.abs(Number(current[0])) <= 2 && Math.abs(Number(current[1])) <= 2) {
        values.push([normX, normY]);
        values.push([normX, normY, 0]);
      }
    } catch (readErr) {}

    values.push([x, y]);
    values.push([x, y, 0]);
    values.push(x + "," + y);
    values.push(String(x) + "," + String(y));
    values.push([normX, normY]);
    values.push([normX, normY, 0]);

    for (var i = 0; i < values.length; i++) {
      try {
        prop.setValue(values[i], 1);
        return true;
      } catch (e0) {}
      try {
        prop.setValue(values[i]);
        return true;
      } catch (e1) {}
    }

    return false;
  }

  function scanMotionPosition(props, x, y, normX, normY, depth, inMotion) {
    var changed = 0;
    if (!props || depth > 5) return 0;
    var total = 0;
    try { total = props.numProperties; } catch (e0) { total = 0; }
    if (!total) {
      try { total = props.numItems; } catch (e1) { total = 0; }
    }
    if (!total) {
      try { total = props.length; } catch (e2) { total = 0; }
    }

    for (var i = 0; i < total; i++) {
      var p = null;
      try { p = props[i]; } catch (idxErr) {}
      if (!p) continue;

      var name = "";
      try { name = String(p.displayName || p.name || "").toLowerCase(); } catch (nameErr) {}
      var motionHere = inMotion || name.indexOf("motion") !== -1 || name.indexOf("movimento") !== -1;
      var isPosition = name.indexOf("position") !== -1 || name.indexOf("posicao") !== -1 || name.indexOf("posição") !== -1;

      if (motionHere && isPosition && safeSetPosition(p, x, y, normX, normY)) changed++;

      try {
        if (p.properties) changed += scanMotionPosition(p.properties, x, y, normX, normY, depth + 1, motionHere);
      } catch (nestedErr) {}
      try {
        if (p.numProperties) changed += scanMotionPosition(p, x, y, normX, normY, depth + 1, motionHere);
      } catch (directNestedErr) {}
    }

    return changed;
  }

  function setKnownMotionPositionParams(component, x, y, normX, normY) {
    var changed = 0;
    if (!component || !component.properties) return 0;
    var names = ["Position", "Posicao", "Posição", "Motion Position", "Movimento Posicao", "Movimento Posição"];

    for (var i = 0; i < names.length; i++) {
      try {
        if (component.properties.getParamForDisplayName) {
          var prop = component.properties.getParamForDisplayName(names[i]);
          if (prop && safeSetPosition(prop, x, y, normX, normY)) changed++;
        }
      } catch (e) {}
    }

    return changed;
  }

  function scanAnyPosition(props, x, y, normX, normY, depth) {
    var changed = 0;
    if (!props || depth > 4) return 0;
    var total = 0;
    try { total = props.numProperties; } catch (e0) { total = 0; }
    if (!total) {
      try { total = props.numItems; } catch (e1) { total = 0; }
    }
    if (!total) {
      try { total = props.length; } catch (e2) { total = 0; }
    }

    for (var i = 0; i < total; i++) {
      var p = null;
      try { p = props[i]; } catch (idxErr) {}
      if (!p) continue;

      var name = "";
      try { name = String(p.displayName || p.name || "").toLowerCase(); } catch (nameErr) {}
      var isPosition = name.indexOf("position") !== -1 || name.indexOf("posicao") !== -1 || name.indexOf("posi") !== -1;
      if (isPosition && safeSetPosition(p, x, y, normX, normY)) changed++;

      try {
        if (p.properties) changed += scanAnyPosition(p.properties, x, y, normX, normY, depth + 1);
      } catch (nestedErr) {}
      try {
        if (p.numProperties) changed += scanAnyPosition(p, x, y, normX, normY, depth + 1);
      } catch (directNestedErr) {}
    }

    return changed;
  }

  function applyClipMotionPosition(seq, clip, style) {
    var xPercent = typeof style.positionX !== "undefined" ? Number(style.positionX) : 50;
    var yPercent = typeof style.positionY !== "undefined" ? Number(style.positionY) : 84;
    if (isNaN(xPercent)) xPercent = 50;
    if (isNaN(yPercent)) yPercent = 84;

    var size = sequenceFrameSize(seq);
    var x = Math.round(size.width * Math.max(0, Math.min(100, xPercent)) / 100);
    var y = Math.round(size.height * Math.max(0, Math.min(100, yPercent)) / 100);
    var normX = Math.max(0, Math.min(100, xPercent)) / 100;
    var normY = Math.max(0, Math.min(100, yPercent)) / 100;
    var changed = 0;

    try {
      if (!clip || !clip.components) return { changed: 0, x: x, y: y, width: size.width, height: size.height };
      var total = 0;
      try { total = clip.components.numItems; } catch (itemsErr) { total = 0; }
      if (!total) {
        try { total = clip.components.numComponents; } catch (componentsErr) { total = 0; }
      }
      if (!total) {
        try { total = clip.components.length; } catch (lengthErr) { total = 0; }
      }

      for (var c = 0; c < total; c++) {
        var comp = clip.components[c];
        var compName = "";
        try { compName = String(comp.displayName || comp.name || "").toLowerCase(); } catch (nameErr) {}
        var isMotionComp = compName.indexOf("motion") !== -1 || compName.indexOf("movimento") !== -1;
        if (comp && comp.properties) {
          if (isMotionComp) changed += setKnownMotionPositionParams(comp, x, y, normX, normY);
          changed += scanMotionPosition(comp.properties, x, y, normX, normY, 0, isMotionComp);
        }
      }

      if (!changed) {
        for (var c2 = 0; c2 < total; c2++) {
          var fallbackComp = clip.components[c2];
          if (fallbackComp && fallbackComp.properties) {
            changed += setKnownMotionPositionParams(fallbackComp, x, y, normX, normY);
            changed += scanAnyPosition(fallbackComp.properties, x, y, normX, normY, 0);
          }
        }
      }
    } catch (e) {}

    return { changed: changed, x: x, y: y, width: size.width, height: size.height };
  }

  function scanPropertyCollection(props, text, depth) {
    var changed = 0;
    if (!props || depth > 6) return 0;
    var total = 0;
    try { total = props.numProperties; } catch (e0) { total = 0; }
    if (!total) {
      try { total = props.numItems; } catch (e1) { total = 0; }
    }
    if (!total) {
      try { total = props.length; } catch (e2) { total = 0; }
    }

    for (var i = 0; i < total; i++) {
      var p = null;
      try { p = props[i]; } catch (idxErr) {}
      if (!p) continue;

      var name = "";
      try { name = String(p.displayName || p.name || "").toLowerCase(); } catch (nameErr) {}

      var isText = name.indexOf("text") !== -1 || name.indexOf("texto") !== -1 ||
        name.indexOf("source") !== -1 || name.indexOf("legenda") !== -1 ||
        name.indexOf("caption") !== -1;

      var value = "";
      try { value = p.getValue(); } catch (readErr) {}
      if (value && String(value).indexOf("textEditValue") !== -1) isText = true;

      if (isText && safeSetText(p, text)) changed++;

      try {
        if (p.properties) changed += scanPropertyCollection(p.properties, text, depth + 1);
      } catch (nestedErr) {}
      try {
        if (p.numProperties) changed += scanPropertyCollection(p, text, depth + 1);
      } catch (directNestedErr) {}
    }

    return changed;
  }

  function setKnownMogrtTextParams(component, text) {
    var changed = 0;
    if (!component || !component.properties) return 0;
    var names = ["Caption Text", "MPL Caption Text", "Source Text", "Texto de origem", "Text", "Texto", "Legenda"];

    for (var i = 0; i < names.length; i++) {
      try {
        if (component.properties.getParamForDisplayName) {
          var prop = component.properties.getParamForDisplayName(names[i]);
          if (prop && safeSetText(prop, text)) changed++;
        }
      } catch (e) {}
    }

    return changed;
  }

  function fillMogrtText(clip, text) {
    var changed = 0;
    try {
      if (!clip) return 0;

      if (clip.getMGTComponent) {
        var mgtComponent = clip.getMGTComponent();
        changed += setKnownMogrtTextParams(mgtComponent, text);
        if (mgtComponent && mgtComponent.properties) {
          changed += scanPropertyCollection(mgtComponent.properties, text, 0);
        }
      }

      if (clip.components) {
        var total = 0;
        try { total = clip.components.numItems; } catch (itemsErr) { total = 0; }
        if (!total) {
          try { total = clip.components.numComponents; } catch (componentsErr) { total = 0; }
        }
        if (!total) {
          try { total = clip.components.length; } catch (lengthErr) { total = 0; }
        }
        for (var c = 0; c < total; c++) {
          var comp = clip.components[c];
          changed += scanPropertyCollection(comp.properties, text, 0);
        }
      }
    } catch (e) {}
    return changed;
  }

  function wordFieldNames(index) {
    return [
      "Palavra " + index,
      "Word " + index,
      "Texto " + index,
      "Text " + index,
      "Caption Text " + index,
      "Legenda " + index,
      "Linha " + index
    ];
  }

  function setWordTextByName(component, index, text) {
    var changed = 0;
    if (!component || !component.properties) return 0;
    var names = wordFieldNames(index);
    for (var i = 0; i < names.length; i++) {
      try {
        if (component.properties.getParamForDisplayName) {
          var prop = component.properties.getParamForDisplayName(names[i]);
          if (prop && safeSetText(prop, text)) return 1;
        }
      } catch (e) {}
    }
    return changed;
  }

  function collectTextProps(props, out, depth) {
    if (!props || depth > 6) return;
    var total = 0;
    try { total = props.numProperties; } catch (e0) { total = 0; }
    if (!total) {
      try { total = props.numItems; } catch (e1) { total = 0; }
    }
    if (!total) {
      try { total = props.length; } catch (e2) { total = 0; }
    }

    for (var i = 0; i < total; i++) {
      var p = null;
      try { p = props[i]; } catch (idxErr) {}
      if (!p) continue;

      var name = "";
      try { name = String(p.displayName || p.name || "").toLowerCase(); } catch (nameErr) {}
      var isText = name.indexOf("text") !== -1 || name.indexOf("texto") !== -1 ||
        name.indexOf("source") !== -1 || name.indexOf("legenda") !== -1 ||
        name.indexOf("caption") !== -1 || name.indexOf("palavra") !== -1 ||
        name.indexOf("word") !== -1;
      var value = "";
      try { value = p.getValue(); } catch (readErr) {}
      if (value && String(value).indexOf("textEditValue") !== -1) isText = true;
      if (isText) out.push(p);

      try {
        if (p.properties) collectTextProps(p.properties, out, depth + 1);
      } catch (nestedErr) {}
      try {
        if (p.numProperties) collectTextProps(p, out, depth + 1);
      } catch (directNestedErr) {}
    }
  }

  function fillMogrtWordTexts(clip, texts) {
    var changed = 0;
    var filled = [];
    var fallbackProps = [];
    for (var f = 0; f < texts.length; f++) filled[f] = false;
    try {
      if (!clip) return 0;
      if (clip.getMGTComponent) {
        var mgtComponent = clip.getMGTComponent();
        for (var i = 0; i < texts.length; i++) {
          if (setWordTextByName(mgtComponent, i + 1, texts[i])) {
            filled[i] = true;
            changed++;
          }
        }
        if (mgtComponent && mgtComponent.properties) collectTextProps(mgtComponent.properties, fallbackProps, 0);
      }

      if (clip.components) {
        var total = 0;
        try { total = clip.components.numItems; } catch (itemsErr) { total = 0; }
        if (!total) {
          try { total = clip.components.numComponents; } catch (componentsErr) { total = 0; }
        }
        if (!total) {
          try { total = clip.components.length; } catch (lengthErr) { total = 0; }
        }
        for (var c = 0; c < total; c++) {
          var comp = clip.components[c];
          if (comp && comp.properties) collectTextProps(comp.properties, fallbackProps, 0);
        }
      }

      var propIndex = 0;
      for (var t = 0; t < texts.length && propIndex < fallbackProps.length; t++) {
        if (filled[t]) continue;
        if (safeSetText(fallbackProps[propIndex], texts[t])) {
          filled[t] = true;
          changed++;
        }
        propIndex++;
      }
    } catch (e) {}
    return changed;
  }

  function selectedGraphicClips(seq) {
    var out = [];
    if (!seq || !seq.videoTracks) return out;
    try {
      for (var t = 0; t < seq.videoTracks.numTracks; t++) {
        var track = seq.videoTracks[t];
        if (!track || !track.clips) continue;
        for (var c = 0; c < track.clips.numItems; c++) {
          var clip = track.clips[c];
          if (!isClipSelected(clip)) continue;
          var text = textFromClip(clip);
          out.push({
            clip: clip,
            text: text,
            start: timeToSeconds(clip.start),
            end: timeToSeconds(clip.end)
          });
        }
      }
    } catch (e) {}
    out.sort(function (a, b) { return a.start - b.start; });
    return out;
  }

  function disableClipBestEffort(clip) {
    var changed = false;
    try {
      clip.disabled = true;
      changed = true;
    } catch (e0) {}
    try {
      if (clip.setDisabled) {
        clip.setDisabled(true);
        changed = true;
      }
    } catch (e1) {}
    try {
      if (clip.setEnabled) {
        clip.setEnabled(false);
        changed = true;
      }
    } catch (e2) {}
    return changed;
  }

  function startTimelinePlayback() {
    try { app.enableQE(); } catch (enableErr) {}
    try {
      if (typeof qe !== "undefined" && qe && qe.startPlayback) {
        qe.startPlayback();
        return true;
      }
    } catch (startErr) {}
    try {
      if (typeof qe !== "undefined" && qe && qe.project && qe.project.getActiveSequence) {
        var qSeq = qe.project.getActiveSequence();
        if (qSeq && qSeq.player && qSeq.player.play) {
          qSeq.player.play(1);
          return true;
        }
      }
    } catch (playerErr) {}
    return false;
  }

  function stopTimelinePlayback() {
    try { app.enableQE(); } catch (enableErr) {}
    try {
      if (typeof qe !== "undefined" && qe && qe.stopPlayback) {
        qe.stopPlayback();
        return true;
      }
    } catch (stopErr) {}
    try {
      if (typeof qe !== "undefined" && qe && qe.project && qe.project.getActiveSequence) {
        var qSeq = qe.project.getActiveSequence();
        if (qSeq && qSeq.player && qSeq.player.play) {
          qSeq.player.play(0);
          return true;
        }
      }
    } catch (playerErr) {}
    return false;
  }

  function previewImportedMogrt(seq, clip, startSec, endSec) {
    var selected = false;
    var moved = false;
    var started = false;
    var previewMs = Math.max(700, Math.min(8000, Math.round((endSec - startSec) * 1000)));

    try {
      if (clip && clip.setSelected) {
        clip.setSelected(1, 1);
        selected = true;
      }
    } catch (selectErr) {}

    try {
      if (seq && seq.setPlayerPosition) {
        seq.setPlayerPosition(secondsToTicks(startSec));
        moved = true;
      }
    } catch (ticksErr) {
      try {
        seq.setPlayerPosition(Number(startSec) || 0);
        moved = true;
      } catch (timeErr) {}
    }

    if (moved) started = startTimelinePlayback();

    return {
      previewSelected: selected,
      previewMoved: moved,
      previewStarted: started,
      previewMs: previewMs
    };
  }

  function importMogrt(seq, mogrtPath, startSec, endSec, text, style) {
    var file = new File(mogrtPath);
    if (!file.exists) throw new Error("MOGRT nao encontrado: " + mogrtPath);
    if (!seq.importMGT) throw new Error("sequence.importMGT indisponivel nesta versao do Premiere.");
    var start = secondsToTime(startSec);
    var trackIdx = findFreeVideoTrack(seq);
    var clip = null;
    try {
      clip = seq.importMGT(file.fsName, start.ticks, trackIdx, 0);
    } catch (e0) {
      clip = seq.importMGT(file.fsName, startSec, trackIdx, 0);
    }
    if (!clip) throw new Error("Falha ao importar MOGRT.");
    setClipSourceWindow(clip, endSec - startSec);
    setClipEnd(clip, endSec);
    var skippedTextInjection = !hasInjectableText(text);
    var changed = skippedTextInjection ? 0 : fillMogrtText(clip, cleanText(text, style.allCaps));
    var motion = applyClipMotionPosition(seq, clip, style);
    return {
      clip: clip,
      trackIdx: trackIdx,
      textPropsChanged: changed,
      textInjectionSkipped: skippedTextInjection,
      motionPropsChanged: motion.changed,
      motionX: motion.x,
      motionY: motion.y,
      sequenceWidth: motion.width,
      sequenceHeight: motion.height,
      startSec: startSec,
      endSec: endSec
    };
  }

  function importWordMogrt(seq, mogrtPath, startSec, endSec, texts, style) {
    var file = new File(mogrtPath);
    if (!file.exists) throw new Error("MOGRT nao encontrado: " + mogrtPath);
    if (!seq.importMGT) throw new Error("sequence.importMGT indisponivel nesta versao do Premiere.");
    var start = secondsToTime(startSec);
    var trackIdx = findFreeVideoTrack(seq);
    var clip = null;
    try {
      clip = seq.importMGT(file.fsName, start.ticks, trackIdx, 0);
    } catch (e0) {
      clip = seq.importMGT(file.fsName, startSec, trackIdx, 0);
    }
    if (!clip) throw new Error("Falha ao importar MOGRT.");
    setClipSourceWindow(clip, endSec - startSec);
    setClipEnd(clip, endSec);
    var cleaned = [];
    for (var i = 0; i < texts.length; i++) cleaned.push(cleanText(texts[i], style.allCaps));
    var changed = fillMogrtWordTexts(clip, cleaned);
    var motion = applyClipMotionPosition(seq, clip, style);
    return {
      clip: clip,
      trackIdx: trackIdx,
      textPropsChanged: changed,
      motionPropsChanged: motion.changed,
      motionX: motion.x,
      motionY: motion.y,
      sequenceWidth: motion.width,
      sequenceHeight: motion.height,
      startSec: startSec,
      endSec: endSec,
      words: cleaned
    };
  }

  function importFileToProject(path) {
    try {
      var file = new File(path);
      if (!file.exists) return false;
      var target = app.project.rootItem;
      return app.project.importFiles([file.fsName], true, target, false);
    } catch (e) {
      return false;
    }
  }

  function projectName() {
    try {
      if (app.project.name) return app.project.name;
      if (app.project.path) {
        var parts = String(app.project.path).split(/[\/\\]/);
        return parts[parts.length - 1];
      }
    } catch (e) {}
    return "(sem nome)";
  }

  global.EP_isReady = function () {
    return ok({ version: VERSION, host: "PR" });
  };

  global.EP_getPresetCatalog = function () {
    return ok({ presets: presets() });
  };

  global.EP_getHostInfo = function () {
    try {
      if (!app.project) return err("Nenhum projeto aberto.");
      var seq = activeSequence();
      return ok({
        version: VERSION,
        projectName: projectName(),
        sequenceName: seq ? ("Seq: " + seq.name) : "Nenhuma sequencia ativa",
        videoTracks: seq && seq.videoTracks ? seq.videoTracks.numTracks : 0,
        audioTracks: seq && seq.audioTracks ? seq.audioTracks.numTracks : 0
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

  global.EP_getBundledMogrtPath = function () {
    try {
      var bridgeFile = new File($.fileName);
      var extensionRoot = bridgeFile.parent.parent;
      var file = new File(extensionRoot.fsName + "/assets/Animacao_de_texto_1.mogrt");
      if (!file.exists) return err("MOGRT padrao nao encontrado na pasta do plugin.");
      return ok({
        path: file.fsName,
        name: file.name,
        bundled: true
      });
    } catch (e) {
      return err(e.toString());
    }
  };

  global.EP_createCaption = function (text, styleJson) {
    try {
      var seq = activeSequence();
      if (!seq) return err("Abra uma sequencia ativa.");
      var style = normalizeStyle(parseJSON(styleJson, {}));
      var start = style.startMode === "zero" ? 0 : getCtiSeconds(seq);
      var duration = Math.max(0.25, style.duration);
      var captionText = cleanText(text, style.allCaps);
      var okMarker = addMarker(seq, start, start + duration, captionText, 1);
      if (!okMarker) return err("API de markers indisponivel nesta versao do Premiere.");
      return ok({
        status: "Marker criado em " + start.toFixed(2) + "s.",
        start: start,
        end: start + duration
      });
    } catch (e) {
      return err(e.toString());
    }
  };

  global.EP_injectAnimatedCaption = function (text, styleJson, mogrtPath) {
    try {
      var seq = activeSequence();
      if (!seq) return err("Abra uma sequencia ativa.");
      var style = normalizeStyle(parseJSON(styleJson, {}));
      var start = style.startMode === "zero" ? 0 : getCtiSeconds(seq);
      var duration = Math.max(0.25, style.duration);
      var result = importMogrt(seq, mogrtPath, start, start + duration, text, style);
      var preview = previewImportedMogrt(seq, result.clip, result.startSec, result.endSec);
      return ok({
        status: "MOGRT injetado em V" + (result.trackIdx + 1) + " @ " + start.toFixed(2) + "s.",
        trackIdx: result.trackIdx,
        textPropsChanged: result.textPropsChanged,
        textInjectionSkipped: result.textInjectionSkipped,
        motionPropsChanged: result.motionPropsChanged,
        motionX: result.motionX,
        motionY: result.motionY,
        previewSelected: preview.previewSelected,
        previewMoved: preview.previewMoved,
        previewStarted: preview.previewStarted,
        previewMs: preview.previewMs
      });
    } catch (e) {
      return err(e.toString());
    }
  };

  global.EP_combineSelectedGraphicsAs3WordMogrt = function (styleJson, mogrtPath) {
    try {
      var seq = activeSequence();
      if (!seq) return err("Abra uma sequencia ativa.");
      var style = normalizeStyle(parseJSON(styleJson, {}));
      var selected = selectedGraphicClips(seq);
      if (selected.length !== 3) return err("Selecione exatamente 3 graphics na timeline.");

      var words = [];
      var start = selected[0].start;
      var end = selected[2].end;
      for (var i = 0; i < selected.length; i++) {
        if (!selected[i].text) return err("Nao consegui ler o texto editavel do graphic selecionado " + (i + 1) + ". Confirme se ele foi convertido para graphic e tem texto editavel no Essential Graphics.");
        words.push(selected[i].text);
        if (selected[i].start < start) start = selected[i].start;
        if (selected[i].end > end) end = selected[i].end;
      }
      if (end <= start) end = start + Math.max(0.25, style.duration);

      var result = importWordMogrt(seq, mogrtPath, start, end, words, style);
      var preview = previewImportedMogrt(seq, result.clip, result.startSec, result.endSec);
      return ok({
        status: "Template de 3 palavras criado em V" + (result.trackIdx + 1) + ".",
        trackIdx: result.trackIdx,
        words: result.words,
        textPropsChanged: result.textPropsChanged,
        motionPropsChanged: result.motionPropsChanged,
        motionX: result.motionX,
        motionY: result.motionY,
        previewSelected: preview.previewSelected,
        previewMoved: preview.previewMoved,
        previewStarted: preview.previewStarted,
        previewMs: preview.previewMs
      });
    } catch (e) {
      return err(e.toString());
    }
  };

  global.EP_applySelectedGraphicsAsWordMogrt = function (styleJson, mogrtPath, expectedWordsText, afterApplyMode) {
    try {
      var seq = activeSequence();
      if (!seq) return err("Abra uma sequencia ativa.");
      var style = normalizeStyle(parseJSON(styleJson, {}));
      var expectedWords = Math.max(1, Math.min(4, parseInt(expectedWordsText, 10) || 1));
      var selected = selectedGraphicClips(seq);
      if (!selected.length) return JSON.stringify({ ok: false, noSelection: true });
      if (selected.length !== expectedWords) {
        return err("Selecione exatamente " + expectedWords + " graphic(s) para este template. Selecionados: " + selected.length + ".");
      }

      var words = [];
      var start = selected[0].start;
      var end = selected[selected.length - 1].end;
      for (var i = 0; i < selected.length; i++) {
        if (!selected[i].text) return err("Nao consegui ler o texto editavel do graphic selecionado " + (i + 1) + ". Confirme se ele foi convertido para graphic e tem texto editavel no Essential Graphics.");
        words.push(selected[i].text);
        if (selected[i].start < start) start = selected[i].start;
        if (selected[i].end > end) end = selected[i].end;
      }
      if (end <= start) end = start + Math.max(0.25, style.duration);

      var result = importWordMogrt(seq, mogrtPath, start, end, words, style);
      var disabledOriginals = 0;
      if (String(afterApplyMode || "") === "disable") {
        for (var d = 0; d < selected.length; d++) {
          if (disableClipBestEffort(selected[d].clip)) disabledOriginals++;
        }
      }
      var preview = previewImportedMogrt(seq, result.clip, result.startSec, result.endSec);
      return ok({
        status: "Template de " + expectedWords + " palavra(s) criado em V" + (result.trackIdx + 1) + ".",
        trackIdx: result.trackIdx,
        words: result.words,
        textPropsChanged: result.textPropsChanged,
        motionPropsChanged: result.motionPropsChanged,
        motionX: result.motionX,
        motionY: result.motionY,
        disabledOriginals: disabledOriginals,
        previewSelected: preview.previewSelected,
        previewMoved: preview.previewMoved,
        previewStarted: preview.previewStarted,
        previewMs: preview.previewMs
      });
    } catch (e) {
      return err(e.toString(), { line: e.line || 0 });
    }
  };

  global.EP_importSRT = function (path, styleJson) {
    try {
      var seq = activeSequence();
      if (!seq) return err("Abra uma sequencia ativa.");
      var style = normalizeStyle(parseJSON(styleJson, {}));
      var entries = parseSrtContent(readTextFile(path));
      if (!entries.length) return err("Nenhuma legenda encontrada no SRT.");

      var didImport = importFileToProject(path);
      var markers = 0;
      for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        if (entry.outTime <= entry.inTime) entry.outTime = entry.inTime + 1;
        if (addMarker(seq, entry.inTime, entry.outTime, cleanText(entry.text, style.allCaps), i + 1)) markers++;
      }

      return ok({
        status: markers + " marker(s) criados" + (didImport ? " e SRT importado." : "."),
        count: markers,
        imported: !!didImport,
        entries: entries
      });
    } catch (e) {
      return err(e.toString());
    }
  };

  global.EP_injectSRTAsMogrt = function (path, styleJson, mogrtPath) {
    try {
      var seq = activeSequence();
      if (!seq) return err("Abra uma sequencia ativa.");
      var style = normalizeStyle(parseJSON(styleJson, {}));
      var entries = parseSrtContent(readTextFile(path));
      if (!entries.length) return err("Nenhuma legenda encontrada no SRT.");

      var created = 0;
      var textPropsChanged = 0;
      var motionPropsChanged = 0;
      var firstResult = null;
      for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        if (entry.outTime <= entry.inTime) entry.outTime = entry.inTime + 1;
        var result = importMogrt(seq, mogrtPath, entry.inTime, entry.outTime, entry.text, style);
        if (!firstResult) firstResult = result;
        created++;
        textPropsChanged += result.textPropsChanged;
        motionPropsChanged += result.motionPropsChanged;
      }

      var preview = firstResult ? previewImportedMogrt(seq, firstResult.clip, firstResult.startSec, firstResult.endSec) : {};

      return ok({
        status: created + " MOGRT(s) injetado(s) na timeline.",
        count: created,
        textPropsChanged: textPropsChanged,
        motionPropsChanged: motionPropsChanged,
        motionX: firstResult ? firstResult.motionX : 0,
        motionY: firstResult ? firstResult.motionY : 0,
        previewSelected: !!preview.previewSelected,
        previewMoved: !!preview.previewMoved,
        previewStarted: !!preview.previewStarted,
        previewMs: preview.previewMs || 0,
        entries: entries
      });
    } catch (e) {
      return err(e.toString());
    }
  };

  global.EP_automateSRTMogrts = function (path, styleJson, catalogJson) {
    try {
      var seq = activeSequence();
      if (!seq) return err("Abra uma sequencia ativa.");
      var style = normalizeStyle(parseJSON(styleJson, {}));
      var entries = parseSrtContent(readTextFile(path));
      if (!entries.length) return err("Nenhuma legenda encontrada no SRT.");

      var byWords = catalogJson ? buildTemplateGroups(catalogJson) : bundledAutomationTemplateGroups();
      var hasTemplates = false;
      for (var k in byWords) {
        if (byWords.hasOwnProperty(k) && byWords[k] && byWords[k].length) hasTemplates = true;
      }
      if (!hasTemplates) return err("Nenhum template MOGRT disponivel para automacao.");

      var created = 0;
      var skipped = 0;
      var textPropsChanged = 0;
      var motionPropsChanged = 0;
      var firstResult = null;
      var groups = [];
      var failures = [];
      var usage = {};
      var automatedEntries = 0;

      for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        if (entry.outTime <= entry.inTime) entry.outTime = entry.inTime + 1;
        if (entry.outTime - entry.inTime < 0.28) {
          skipped++;
          continue;
        }

        var entryGroups = chooseAutomationGroups(entry, byWords);
        if (!entryGroups.length) {
          skipped++;
          continue;
        }

        automatedEntries++;
        for (var g = 0; g < entryGroups.length; g++) {
          var group = entryGroups[g];
          var template = chooseTemplateForWords(group.words.length, byWords, usage);
          if (!template) {
            skipped++;
            continue;
          }
          var timing = timingForAutomationGroup(entry, group);

          try {
            var result = importWordMogrt(seq, template.path, timing.start, timing.end, group.words, style);
            if (!firstResult) firstResult = result;
            created++;
            textPropsChanged += result.textPropsChanged;
            motionPropsChanged += result.motionPropsChanged;
            if (groups.length < 36) groups.push(group.words.join(" "));
          } catch (importErr) {
            skipped++;
            if (failures.length < 6) failures.push(template.name + ": " + importErr.toString());
          }
        }
      }

      if (!created) {
        return err(failures.length ? ("Falha ao importar os templates: " + failures.join(" | ")) : "Nao encontrei trechos fortes o suficiente para automatizar neste SRT.");
      }

      var preview = firstResult ? previewImportedMogrt(seq, firstResult.clip, firstResult.startSec, firstResult.endSec) : {};

      return ok({
        status: created + " animacao(oes) criada(s) em " + automatedEntries + " bloco(s) do SRT.",
        count: created,
        skipped: skipped,
        automatedEntries: automatedEntries,
        textPropsChanged: textPropsChanged,
        motionPropsChanged: motionPropsChanged,
        motionX: firstResult ? firstResult.motionX : 0,
        motionY: firstResult ? firstResult.motionY : 0,
        previewSelected: !!preview.previewSelected,
        previewMoved: !!preview.previewMoved,
        previewStarted: !!preview.previewStarted,
        previewMs: preview.previewMs || 0,
        groups: groups,
        failures: failures,
        entries: entries
      });
    } catch (e) {
      return err(e.toString(), { line: e.line || 0 });
    }
  };

  global.EP_automateSRTMogrtsV2 = function (path, styleJson) {
    return global.EP_automateSRTMogrts(path, styleJson, "");
  };

  global.EP_automateSRTMogrtsV3 = function (path, styleJson) {
    return global.EP_automateSRTMogrts(path, styleJson, "");
  };

  global.EP_stopTimelinePreview = function () {
    try {
      return ok({
        status: stopTimelinePlayback() ? "Preview pausado." : "Nao foi possivel pausar o preview."
      });
    } catch (e) {
      return err(e.toString());
    }
  };

  global.EP_setSelectedMogrtDuration = function (durationText) {
    try {
      var seq = activeSequence();
      if (!seq) return err("Abra uma sequencia ativa.");
      var duration = Math.max(0.25, parseFloat(durationText) || 3);
      var checked = 0;
      var changed = 0;

      if (!seq.videoTracks) return err("Sequencia sem tracks de video.");
      for (var t = 0; t < seq.videoTracks.numTracks; t++) {
        var track = seq.videoTracks[t];
        if (!track || !track.clips) continue;
        for (var c = 0; c < track.clips.numItems; c++) {
          var clip = track.clips[c];
          checked++;
          if (isClipSelected(clip) && setClipDuration(clip, duration)) changed++;
        }
      }

      if (!changed) return err("Selecione um MOGRT na timeline antes de ajustar a duracao.");
      return ok({
        status: changed + " clip(s) ajustado(s) para " + duration.toFixed(2) + "s.",
        checked: checked,
        changed: changed,
        duration: duration
      });
    } catch (e) {
      return err(e.toString());
    }
  };

  global.EP_applyPresetToSelected = function () {
    return err("No Premiere, use markers/SRT ou um fluxo MOGRT dedicado para animacao visual.");
  };

  global.EP_getMachineId = function () {
    try {
      var parts = [
        $.getenv("COMPUTERNAME") || "",
        $.getenv("HOSTNAME") || "",
        $.getenv("USERNAME") || "",
        $.getenv("USER") || "",
        "PR"
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
