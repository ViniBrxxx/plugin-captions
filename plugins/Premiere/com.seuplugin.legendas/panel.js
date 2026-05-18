(function () {
  "use strict";

  var VERSION = "1.0.0";
  var HOST = (document.body.getAttribute("data-host") || "AE").toUpperCase();
  var HOST_NAME = HOST === "PR" || HOST === "PPRO" ? "Premiere Pro" : "After Effects";
  var LICENSE_FILE = "session.json";
  var STYLE_FILE = "style.json";
  var API_KEY = "mpl_api_base";
  var MOGRT_KEY = "mpl_mogrt_path";
  var LAYOUT_KEY = "mpl_panel_layout";
  var LOG_LIMIT = 180;
  var POSITION_KEY = "mpl_caption_position";
  var cs = null;
  var logLines = [];
  var previewStart = Date.now();
  var timelinePreviewStopTimer = null;

  var defaults = {
    fontFamily: "Arial-BoldMT",
    fontSize: 54,
    fillColor: "#ffffff",
    strokeColor: "#111111",
    strokeWidth: 3,
    positionY: 84,
    allCaps: false,
    presetId: "slide-up",
    durationFrames: 12,
    videoTrack: 1,
    positionX: 50
  };

  var state = {
    licensed: false,
    session: null,
    hostReady: false,
    presets: [],
    lastSrtPath: "",
    lastSrtEntries: [],
    previewDragging: false,
    selectedTemplateWords: 1,
    style: copy(defaults)
  };

  function $(id) {
    return document.getElementById(id);
  }

  var ui = {
    hostLabel: $("host-label"),
    hostInfo: $("host-info"),
    statusDot: $("status-dot"),
    statusbar: $("statusbar"),
    statusMessage: $("status-message"),
    btnToggleLog: $("btn-toggle-log"),
    logDrawer: $("log-drawer"),
    btnRefresh: $("btn-refresh"),
    captionText: $("caption-text"),
    singleStart: $("single-start"),
    singleDuration: $("single-duration"),
    btnCreateCaption: $("btn-create-caption"),
    btnInjectCaption: $("btn-inject-caption"),
    btnCombineSelectedWords: $("btn-combine-selected-words"),
    btnStretchSelectedMogrt: $("btn-stretch-selected-mogrt"),
    btnApplySelected: $("btn-apply-selected"),
    srtSummary: $("srt-summary"),
    btnImportSrt: $("btn-import-srt"),
    btnAutoSrt: $("btn-auto-srt"),
    btnInjectSrtMogrt: $("btn-inject-srt-mogrt"),
    btnPreviewSrt: $("btn-preview-srt"),
    srtTable: $("srt-table"),
    previewCanvas: $("preview-canvas"),
    templatePreviewImage: $("template-image-preview"),
    templatePreviewVideo: $("template-video-preview"),
    srtPositionCanvas: $("srt-position-canvas"),
    presetSelect: $("preset-select"),
    fontSize: $("font-size"),
    positionY: $("position-y"),
    fillColor: $("fill-color"),
    strokeColor: $("stroke-color"),
    strokeWidth: $("stroke-width"),
    durationFrames: $("duration-frames"),
    allCaps: $("all-caps"),
    btnSaveStyle: $("btn-save-style"),
    licenseState: $("license-state"),
    licenseEmail: $("license-email"),
    licenseKey: $("license-key"),
    apiBase: $("api-base"),
    btnActivateLicense: $("btn-activate-license"),
    btnDevLicense: $("btn-dev-license"),
    btnClearLicense: $("btn-clear-license"),
    logOutput: $("log-output"),
    btnOpenData: $("btn-open-data"),
    btnCopyLog: $("btn-copy-log")
  };

  function copy(obj) {
    var out = {};
    for (var k in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, k)) out[k] = obj[k];
    }
    return out;
  }

  function merge(base, extra) {
    var out = copy(base);
    if (extra) {
      for (var k in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, k)) out[k] = extra[k];
      }
    }
    return out;
  }

  function pad(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function nowStamp() {
    var d = new Date();
    return pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
  }

  function setDot(kind) {
    ui.statusDot.className = "status-dot" + (kind ? " " + kind : "");
  }

  function setStatus(message, kind) {
    if (ui.statusMessage) ui.statusMessage.textContent = message || "";
    else ui.statusbar.textContent = message || "";
    if (ui.statusbar) ui.statusbar.className = "statusbar" + (kind ? " " + kind : "");
    if (message) log(message, kind || "info");
  }

  function log(message, kind) {
    var line = "[" + nowStamp() + "] " + (kind ? kind.toUpperCase() + ": " : "") + String(message || "");
    logLines.push(line);
    if (logLines.length > LOG_LIMIT) logLines.shift();
    if (!ui.logOutput) return;
    ui.logOutput.textContent = logLines.join("\n");
    ui.logOutput.scrollTop = ui.logOutput.scrollHeight;
  }

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function parseRaw(raw) {
    if (raw && typeof raw === "object") return raw;
    try {
      return JSON.parse(raw);
    } catch (e) {
      if (typeof raw === "string" && raw.length) return { ok: false, error: raw };
      return null;
    }
  }

  function arg(value) {
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    if (value === null || typeof value === "undefined") return "null";
    return JSON.stringify(String(value));
  }

  function callHost(name, args, callback) {
    var script = name + "(" + (args || []).map(arg).join(",") + ")";
    if (!cs) {
      callback && callback({ ok: false, error: "CSInterface indisponivel" });
      return;
    }
    try {
      cs.evalScript(script, function (raw) {
        var res = parseRaw(raw);
        if (!res) res = { ok: false, error: "Resposta invalida do host" };
        callback && callback(res, raw);
      });
    } catch (e) {
      callback && callback({ ok: false, error: String(e) });
    }
  }

  function escapeEvalFilePath(path) {
    return String(path || "").replace(/\\/g, "/").replace(/'/g, "\\'");
  }

  function extensionRoot() {
    try {
      if (cs && typeof SystemPath !== "undefined") {
        var fromCep = cs.getSystemPath(SystemPath.EXTENSION);
        if (fromCep) return fromCep;
      }
    } catch (e) {}
    try {
      var href = decodeURIComponent(String(window.location.href || ""));
      href = href.replace(/^file:\/\/\/?/i, "");
      href = href.replace(/\\/g, "/");
      if (href.charAt(0) !== "/" && !/^[A-Za-z]:\//.test(href)) href = "/" + href;
      return href.replace(/\/[^\/]*$/, "");
    } catch (e2) {
      return "";
    }
  }

  function assetFilePath(relPath) {
    var root = extensionRoot();
    if (!root || !relPath) return "";
    return root.replace(/\/+$/, "") + "/" + String(relPath).replace(/^\/+/, "");
  }

  function loadBridge(callback) {
    var root = extensionRoot();
    var bridgePath = root.replace(/\/+$/, "") + "/host/bridge.jsx";
    var safePath = escapeEvalFilePath(bridgePath);
    var script = "(function(){var p='" + safePath + "';" +
      "function q(s){return String(s).replace(/\\\\/g,'\\\\\\\\').replace(/\"/g,'\\\\\"').replace(/\\r/g,' ').replace(/\\n/g,' ');}" +
      "try{$.evalFile(new File(p));" +
      "if(typeof $.global.EP_isReady==='function'){return $.global.EP_isReady();}" +
      "return '{\"ok\":false,\"error\":\"EP_isReady nao carregou\",\"path\":\"'+q(p)+'\"}';" +
      "}catch(e){return '{\"ok\":false,\"error\":\"Falha ao carregar bridge: '+q(e.toString())+'\",\"path\":\"'+q(p)+'\"}';}" +
      "})()";

    try {
      cs.evalScript(script, function (raw) {
        var res = parseRaw(raw);
        callback && callback(res || { ok: false, error: String(raw || "Bridge sem resposta") });
      });
    } catch (e) {
      callback && callback({ ok: false, error: String(e) });
    }
  }

  function postJson(url, data, callback) {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open("POST", url, true);
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.timeout = 15000;
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        var payload = parseRaw(xhr.responseText) || {};
        if (xhr.status >= 200 && xhr.status < 300) {
          callback(payload);
        } else {
          callback({ ok: false, error: payload.error || ("HTTP " + xhr.status) });
        }
      };
      xhr.ontimeout = function () {
        callback({ ok: false, error: "Tempo esgotado ao validar licenca." });
      };
      xhr.onerror = function () {
        callback({ ok: false, error: "Falha de rede ao validar licenca." });
      };
      xhr.send(JSON.stringify(data));
    } catch (e) {
      callback({ ok: false, error: String(e) });
    }
  }

  function getStyleFromUi() {
    return {
      fontFamily: state.style.fontFamily || defaults.fontFamily,
      fontSize: clamp(parseInt(ui.fontSize.value, 10) || defaults.fontSize, 12, 220),
      fillColor: ui.fillColor.value || defaults.fillColor,
      strokeColor: ui.strokeColor.value || defaults.strokeColor,
      strokeWidth: clamp(parseInt(ui.strokeWidth.value, 10) || 0, 0, 20),
      positionX: clamp(typeof state.style.positionX !== "undefined" ? state.style.positionX : defaults.positionX, 0, 100),
      positionY: clamp(parseFloat(ui.positionY.value) || state.style.positionY || defaults.positionY, 0, 100),
      allCaps: !!ui.allCaps.checked,
      presetId: ui.presetSelect.value || defaults.presetId,
      durationFrames: clamp(parseInt(ui.durationFrames.value, 10) || defaults.durationFrames, 1, 90),
      videoTrack: defaults.videoTrack
    };
  }

  function setStyleUi(style) {
    var savedPosition = readCaptionPosition();
    state.style = merge(defaults, style || {});
    if (typeof state.style.positionX === "undefined") state.style.positionX = savedPosition.x;
    if (typeof state.style.positionY === "undefined") state.style.positionY = savedPosition.y;
    ui.fontSize.value = state.style.fontSize;
    ui.fillColor.value = state.style.fillColor;
    ui.strokeColor.value = state.style.strokeColor;
    ui.strokeWidth.value = state.style.strokeWidth;
    ui.positionY.value = state.style.positionY;
    ui.durationFrames.value = state.style.durationFrames;
    ui.allCaps.checked = !!state.style.allCaps;
    if (ui.presetSelect.options.length) ui.presetSelect.value = state.style.presetId || defaults.presetId;
  }

  function clamp(n, min, max) {
    n = Number(n);
    if (isNaN(n)) n = min;
    return Math.max(min, Math.min(max, n));
  }

  function readLayoutPrefs() {
    try {
      if (!localStorage.getItem(LAYOUT_KEY)) return {};
      return JSON.parse(localStorage.getItem(LAYOUT_KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  function writeLayoutPrefs(prefs) {
    try {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(prefs || {}));
    } catch (e) {}
  }

  function applyLayoutPrefs() {
    var prefs = readLayoutPrefs();
    if (prefs.categoryWidth) {
      document.documentElement.style.setProperty("--category-width", clamp(prefs.categoryWidth, 64, 220) + "px");
    }
    if (prefs.applyHeight) {
      document.documentElement.style.setProperty("--apply-height", clamp(prefs.applyHeight, 104, 220) + "px");
    }
  }

  function readCaptionPosition() {
    try {
      if (!localStorage.getItem(POSITION_KEY)) return { x: defaults.positionX, y: defaults.positionY };
      var saved = JSON.parse(localStorage.getItem(POSITION_KEY)) || {};
      return {
        x: clamp(saved.x, 0, 100),
        y: clamp(saved.y, 0, 100)
      };
    } catch (e) {
      return { x: defaults.positionX, y: defaults.positionY };
    }
  }

  function saveCaptionPosition(x, y) {
    state.style.positionX = clamp(x, 0, 100);
    state.style.positionY = clamp(y, 0, 100);
    try {
      localStorage.setItem(POSITION_KEY, JSON.stringify({ x: state.style.positionX, y: state.style.positionY }));
    } catch (e) {}
    if (ui.positionY) ui.positionY.value = Math.round(state.style.positionY);
  }

  function saveStyle() {
    state.style = getStyleFromUi();
    callHost("EP_saveLocalData", [STYLE_FILE, JSON.stringify(state.style)], function (res) {
      if (res && res.ok) setStatus("Estilo salvo.", "ok");
      else setStatus((res && res.error) || "Nao foi possivel salvar estilo.", "err");
    });
  }

  function loadStyle() {
    callHost("EP_loadLocalData", [STYLE_FILE], function (res) {
      if (res && res.ok && res.content) {
        try {
          setStyleUi(JSON.parse(res.content));
          log("Estilo local restaurado.", "info");
        } catch (e) {
          setStyleUi(defaults);
        }
      } else {
        setStyleUi(defaults);
      }
    });
  }

  function setLocked(locked) {
    if (ui.btnCreateCaption) ui.btnCreateCaption.disabled = locked || !state.hostReady;
    ui.btnImportSrt.disabled = locked || !state.hostReady;
    ui.btnPreviewSrt.disabled = !state.hostReady;
    if (ui.btnApplySelected) ui.btnApplySelected.disabled = locked || !state.hostReady || HOST !== "AE";
    if (ui.btnInjectCaption) ui.btnInjectCaption.disabled = locked || !state.hostReady || HOST !== "PR";
    if (ui.btnCombineSelectedWords) ui.btnCombineSelectedWords.disabled = locked || !state.hostReady || HOST !== "PR";
    if (ui.btnAutoSrt) ui.btnAutoSrt.disabled = locked || !state.hostReady || HOST !== "PR";
    if (ui.btnInjectSrtMogrt) ui.btnInjectSrtMogrt.disabled = locked || !state.hostReady || HOST !== "PR";
    if (ui.btnStretchSelectedMogrt) ui.btnStretchSelectedMogrt.disabled = locked || !state.hostReady || HOST !== "PR";
  }

  function sessionValid(session) {
    if (!session || !session.email) return false;
    if (!session.expiresAt) return true;
    return new Date(session.expiresAt).getTime() > Date.now();
  }

  function setLicensed(session) {
    state.session = session || null;
    state.licensed = sessionValid(session);
    if (state.licensed) {
      ui.licenseState.textContent = "Licenca ativa: " + session.email;
      ui.licenseState.className = "license-state ok";
      if (session.email) ui.licenseEmail.value = session.email;
      setLocked(false);
    } else {
      ui.licenseState.textContent = session && session.expiresAt ? "Licenca expirada" : "Licenca nao verificada";
      ui.licenseState.className = "license-state err";
      setLocked(true);
    }
  }

  function loadSession() {
    callHost("EP_loadLocalData", [LICENSE_FILE], function (res) {
      if (res && res.ok && res.content) {
        try {
          var session = JSON.parse(res.content);
          setLicensed(session);
          if (state.licensed) setStatus("Sessao restaurada.", "ok");
          else setStatus("Ative a licenca para liberar o painel.", "err");
        } catch (e) {
          setLicensed(null);
        }
      } else {
        setLicensed(null);
        setStatus("Ative a licenca para liberar o painel.", "err");
      }
    });
  }

  function saveSession(session, callback) {
    callHost("EP_saveLocalData", [LICENSE_FILE, JSON.stringify(session)], function (res) {
      if (res && res.ok) {
        setLicensed(session);
        callback && callback(true);
      } else {
        setStatus((res && res.error) || "Nao foi possivel salvar licenca.", "err");
        callback && callback(false);
      }
    });
  }

  function activateLocal(email, key, source) {
    var expires = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    saveSession({
      email: email || "teste@local",
      key: key || "LOCAL-DEV",
      source: source || "local",
      host: HOST,
      plan: "local-test",
      expiresAt: expires.toISOString(),
      activatedAt: new Date().toISOString()
    }, function (ok) {
      if (ok) setStatus("Licenca local ativa por 14 dias.", "ok");
    });
  }

  function activateLicense() {
    var email = (ui.licenseEmail.value || "").trim();
    var key = (ui.licenseKey.value || "").trim();
    var apiBase = (ui.apiBase.value || "").replace(/\/+$/, "");
    if (!email || !key) {
      setStatus("Preencha e-mail e chave.", "err");
      return;
    }
    if (apiBase) localStorage.setItem(API_KEY, apiBase);

    ui.btnActivateLicense.disabled = true;
    setDot("busy");
    setStatus("Validando licenca...");
    callHost("EP_getMachineId", [], function (machine) {
      var machineId = machine && machine.machineId ? machine.machineId : "UNKNOWN";
      if (!apiBase) {
        if (key.length < 8) {
          ui.btnActivateLicense.disabled = false;
          setDot(state.hostReady ? "ok" : "err");
          setStatus("Chave muito curta.", "err");
          return;
        }
        ui.btnActivateLicense.disabled = false;
        setDot("ok");
        activateLocal(email, key, "manual-local");
        return;
      }
      postJson(apiBase + "/validate-key", {
        email: email,
        key: key,
        machineId: machineId,
        plugin: HOST
      }, function (data) {
        ui.btnActivateLicense.disabled = false;
        if (data && (data.ok || data.valid)) {
          saveSession({
            email: email,
            key: key,
            token: data.token || "",
            plan: data.plan || "active",
            host: HOST,
            machineId: machineId,
            source: "api",
            expiresAt: data.expiresAt || data.validUntil || "",
            activatedAt: new Date().toISOString()
          }, function (ok) {
            setDot(ok ? "ok" : "err");
            if (ok) setStatus("Licenca validada.", "ok");
          });
        } else {
          setDot("err");
          setStatus((data && data.error) || "Licenca invalida.", "err");
        }
      });
    });
  }

  function clearLicense() {
    callHost("EP_saveLocalData", [LICENSE_FILE, "{}"], function () {
      setLicensed(null);
      setStatus("Licenca removida.", "info");
    });
  }

  function renderPresets() {
    ui.presetSelect.innerHTML = "";
    var list = state.presets.length ? state.presets : [
      { id: "fade", name: "Fade" },
      { id: "slide-up", name: "Slide Up" },
      { id: "scale-pop", name: "Scale Pop" }
    ];
    for (var i = 0; i < list.length; i++) {
      var opt = document.createElement("option");
      opt.value = list[i].id;
      opt.textContent = list[i].name;
      ui.presetSelect.appendChild(opt);
    }
    ui.presetSelect.value = state.style.presetId || defaults.presetId;
  }

  function loadPresets() {
    callHost("EP_getPresetCatalog", [], function (res) {
      if (res && res.ok && res.presets && res.presets.length) {
        state.presets = res.presets;
        renderPresets();
        log("Presets carregados: " + res.presets.length, "ok");
      } else {
        renderPresets();
        log("Usando presets locais do painel.", "info");
      }
    });
  }

  function formatTime(sec) {
    sec = Math.max(0, Number(sec) || 0);
    var h = Math.floor(sec / 3600);
    var m = Math.floor((sec % 3600) / 60);
    var s = Math.floor(sec % 60);
    var ms = Math.round((sec - Math.floor(sec)) * 1000);
    return pad(h) + ":" + pad(m) + ":" + pad(s) + "." + ("00" + ms).slice(-3);
  }

  function renderSrt(entries) {
    entries = entries || [];
    ui.srtTable.innerHTML = "";
    for (var i = 0; i < Math.min(entries.length, 80); i++) {
      var tr = document.createElement("tr");
      tr.innerHTML = "<td>" + (i + 1) + "</td><td>" + formatTime(entries[i].inTime) +
        "</td><td>" + escapeHtml(entries[i].text) + "</td>";
      ui.srtTable.appendChild(tr);
    }
    ui.srtSummary.textContent = entries.length ? (entries.length + " legenda(s) em " + shortPath(state.lastSrtPath)) : "Nenhum SRT carregado";
  }

  function shortPath(path) {
    if (!path) return "";
    var parts = String(path).split(/[\/\\]/);
    return parts[parts.length - 1] || path;
  }

  function savedMogrtPath() {
    return localStorage.getItem(MOGRT_KEY) || "";
  }

  function setMogrtPath(path, words) {
    if (path) localStorage.setItem(MOGRT_KEY, path);
    if (words) state.selectedTemplateWords = clamp(parseInt(words, 10) || 1, 1, 4);
  }

  function afterApplyMode() {
    var selected = document.querySelector('input[name="after-apply"]:checked');
    if (!selected) return "keep";
    var label = selected.parentNode ? String(selected.parentNode.innerText || "").toLowerCase() : "";
    return label.indexOf("desativar") !== -1 ? "disable" : "keep";
  }

  function setTemplatePreview(src) {
    if (!ui.previewCanvas) return;
    var isVideo = /\.(mp4|webm|mov)(\?|#|$)/i.test(String(src || ""));
    var currentVideoSrc = ui.templatePreviewVideo ? ui.templatePreviewVideo.getAttribute("data-preview-src") : "";
    var currentImageSrc = ui.templatePreviewImage ? ui.templatePreviewImage.getAttribute("data-preview-src") : "";

    if (isVideo && src && ui.templatePreviewVideo && currentVideoSrc === src) {
      if (ui.templatePreviewImage) ui.templatePreviewImage.classList.remove("active");
      ui.templatePreviewVideo.classList.add("active");
      ui.previewCanvas.classList.add("preview-hidden");
      try { ui.templatePreviewVideo.play(); } catch (sameVideoErr) {}
      return;
    }

    if (!isVideo && src && ui.templatePreviewImage && currentImageSrc === src) {
      if (ui.templatePreviewVideo) ui.templatePreviewVideo.classList.remove("active");
      ui.templatePreviewImage.classList.add("active");
      ui.previewCanvas.classList.add("preview-hidden");
      return;
    }

    if (ui.templatePreviewImage) {
      ui.templatePreviewImage.removeAttribute("src");
      ui.templatePreviewImage.removeAttribute("data-preview-src");
      ui.templatePreviewImage.classList.remove("active");
    }
    if (ui.templatePreviewVideo) {
      ui.templatePreviewVideo.pause();
      ui.templatePreviewVideo.removeAttribute("src");
      ui.templatePreviewVideo.removeAttribute("data-preview-src");
      ui.templatePreviewVideo.load();
      ui.templatePreviewVideo.classList.remove("active");
    }
    if (src) {
      if (isVideo && ui.templatePreviewVideo) {
        ui.templatePreviewVideo.setAttribute("data-preview-src", src);
        ui.templatePreviewVideo.src = src;
        ui.templatePreviewVideo.classList.add("active");
        try { ui.templatePreviewVideo.play(); } catch (e) {}
      } else if (ui.templatePreviewImage) {
        ui.templatePreviewImage.setAttribute("data-preview-src", src);
        ui.templatePreviewImage.src = src;
        ui.templatePreviewImage.classList.add("active");
      }
      ui.previewCanvas.classList.add("preview-hidden");
    } else {
      ui.previewCanvas.classList.remove("preview-hidden");
    }
  }

  function loadBundledMogrtDefault() {
    if (savedMogrtPath()) return;
    callHost("EP_getBundledMogrtPath", [], function (res) {
      if (res && res.ok && res.path) {
        setMogrtPath(res.path);
        log("MOGRT padrao carregado: " + shortPath(res.path), "ok");
      } else {
        setMogrtPath("");
        log((res && res.error) || "MOGRT padrao indisponivel.", "err");
      }
    });
  }

  function chooseSrt(callback) {
    callHost("EP_openSRTDialog", [], function (res) {
      if (!res || res.cancelled) {
        setStatus("Selecao cancelada.", "info");
        return;
      }
      if (!res.ok || !res.path) {
        setStatus((res && res.error) || "Arquivo SRT nao selecionado.", "err");
        return;
      }
      state.lastSrtPath = res.path;
      callback && callback(res.path);
    });
  }

  function previewSrt() {
    chooseSrt(function (path) {
      setDot("busy");
      setStatus("Lendo SRT...");
      callHost("EP_parseSRTFile", [path], function (res) {
        if (res && res.ok) {
          state.lastSrtEntries = res.entries || [];
          renderSrt(state.lastSrtEntries);
          setDot("ok");
          setStatus("SRT carregado para preview.", "ok");
        } else {
          setDot("err");
          setStatus((res && res.error) || "Falha ao ler SRT.", "err");
        }
      });
    });
  }

  function importSrt() {
    var run = function (path) {
      setDot("busy");
      setStatus("Importando SRT no " + HOST_NAME + "...");
      callHost("EP_importSRT", [path, JSON.stringify(getStyleFromUi())], function (res) {
        if (res && res.ok) {
          if (res.entries) {
            state.lastSrtEntries = res.entries;
            renderSrt(res.entries);
          }
          setDot("ok");
          setStatus(res.status || "SRT importado.", "ok");
        } else {
          setDot("err");
          setStatus((res && res.error) || "Falha ao importar SRT.", "err");
        }
      });
    };
    if (state.lastSrtPath) run(state.lastSrtPath);
    else chooseSrt(run);
  }

  function createCaption() {
    var text = (ui.captionText.value || "").trim();
    if (!text) {
      setStatus("Digite o texto da legenda.", "err");
      return;
    }
    var payload = getStyleFromUi();
    payload.startMode = ui.singleStart.value;
    payload.duration = clamp(parseFloat(ui.singleDuration.value) || 3, .25, 60);
    setDot("busy");
    setStatus("Criando legenda...");
    callHost("EP_createCaption", [text, JSON.stringify(payload)], function (res) {
      if (res && res.ok) {
        setDot("ok");
        setStatus(res.status || "Legenda criada.", "ok");
      } else {
        setDot("err");
        setStatus((res && res.error) || "Falha ao criar legenda.", "err");
      }
    });
  }

  function scheduleTimelinePreviewStop(res) {
    if (timelinePreviewStopTimer) {
      window.clearTimeout(timelinePreviewStopTimer);
      timelinePreviewStopTimer = null;
    }

    if (!res || !res.previewMoved) return;

    if (res.previewStarted) {
      var ms = clamp(Number(res.previewMs) || 2500, 700, 8000);
      log("Preview do MOGRT iniciado no Program Monitor.", "ok");
      timelinePreviewStopTimer = window.setTimeout(function () {
        callHost("EP_stopTimelinePreview", [], function () {});
        timelinePreviewStopTimer = null;
      }, ms);
    } else {
      log("MOGRT selecionado e playhead movido para o preview. Aperte espaco no Premiere para reproduzir.", "warn");
    }
  }

  function injectAnimatedCaption() {
    var text = ui.captionText ? (ui.captionText.value || "").trim() : "";
    var mogrtPath = savedMogrtPath();
    if (!mogrtPath) {
      setStatus("Selecione um MOGRT animado primeiro.", "err");
      return;
    }
    var payload = getStyleFromUi();
    payload.startMode = ui.singleStart ? ui.singleStart.value : "cti";
    payload.duration = ui.singleDuration ? clamp(parseFloat(ui.singleDuration.value) || 3, .25, 60) : 3;
    setDot("busy");
    setStatus("Injetando MOGRT animado...");
    callHost("EP_injectAnimatedCaption", [text, JSON.stringify(payload), mogrtPath], function (res) {
      if (res && res.ok) {
        setDot("ok");
        setStatus(res.status || "Legenda animada injetada.", "ok");
        scheduleTimelinePreviewStop(res);
        if (res.textInjectionSkipped) {
          log("MOGRT inserido mantendo o texto padrao do template.", "ok");
        } else if (typeof res.textPropsChanged !== "undefined" && Number(res.textPropsChanged) === 0) {
          log("MOGRT inserido, mas nenhum campo de texto editavel foi encontrado. Exporte o texto no Essential Graphics.", "err");
        }
        if (typeof res.motionPropsChanged !== "undefined") {
          if (Number(res.motionPropsChanged) > 0) {
            log("Posicao aplicada no Motion do clip: X " + res.motionX + " / Y " + res.motionY + ".", "ok");
          } else {
            log("Nao foi possivel aplicar Motion > Position automaticamente neste clip.", "err");
          }
        }
      } else {
        setDot("err");
        setStatus((res && res.error) || "Falha ao injetar legenda animada.", "err");
      }
    });
  }

  function applyTemplate() {
    var mogrtPath = savedMogrtPath();
    if (!mogrtPath) {
      setStatus("Selecione um template primeiro.", "err");
      return;
    }
    setDot("busy");
    setStatus("Lendo graphics selecionados...");
    callHost("EP_applySelectedGraphicsAsWordMogrt", [
      JSON.stringify(getStyleFromUi()),
      mogrtPath,
      String(state.selectedTemplateWords || 1),
      afterApplyMode()
    ], function (res) {
      if (res && res.ok) {
        setDot("ok");
        setStatus(res.status || "Template aplicado aos selecionados.", "ok");
        scheduleTimelinePreviewStop(res);
        if (res.words) log("Textos aplicados: " + res.words.join(" | "), "ok");
        if (res.disabledOriginals) log("Graphics originais desativados: " + res.disabledOriginals + ".", "ok");
        if (typeof res.textPropsChanged !== "undefined" && Number(res.textPropsChanged) < Number(state.selectedTemplateWords || 1)) {
          log("Nem todos os campos de palavra foram encontrados no MOGRT.", "err");
        }
      } else if (res && res.noSelection) {
        injectAnimatedCaption();
      } else {
        setDot("err");
        setStatus((res && res.error) || "Falha ao aplicar template aos selecionados.", "err");
      }
    });
  }

  function injectSrtMogrt() {
    var mogrtPath = savedMogrtPath();
    if (!mogrtPath) {
      setStatus("Selecione um MOGRT animado primeiro.", "err");
      return;
    }
    var run = function (path) {
      setDot("busy");
      setStatus("Injetando SRT com MOGRT na posicao do preview...");
      callHost("EP_injectSRTAsMogrt", [path, JSON.stringify(getStyleFromUi()), mogrtPath], function (res) {
        if (res && res.ok) {
          if (res.entries) {
            state.lastSrtEntries = res.entries;
            renderSrt(res.entries);
          }
          setDot("ok");
          setStatus(res.status || "SRT injetado como MOGRT.", "ok");
          scheduleTimelinePreviewStop(res);
          if (typeof res.textPropsChanged !== "undefined" && Number(res.textPropsChanged) === 0) {
            log("MOGRTs inseridos, mas nenhum campo de texto editavel foi encontrado. O template precisa expor o texto no Essential Graphics.", "err");
          }
          if (typeof res.motionPropsChanged !== "undefined") {
            if (Number(res.motionPropsChanged) > 0) {
              log("Posicao aplicada aos MOGRTs via Motion > Position.", "ok");
            } else {
              log("Nao foi possivel aplicar Motion > Position automaticamente aos MOGRTs.", "err");
            }
          }
        } else {
          setDot("err");
          setStatus((res && res.error) || "Falha ao injetar SRT com MOGRT.", "err");
        }
      });
    };
    if (state.lastSrtPath) run(state.lastSrtPath);
    else chooseSrt(run);
  }

  function templateCatalog() {
    var cards = document.querySelectorAll(".template-card");
    var out = [];
    for (var i = 0; i < cards.length; i++) {
      var rel = cards[i].getAttribute("data-mogrt");
      var words = parseInt(cards[i].getAttribute("data-words"), 10) || 0;
      if (!rel || words < 1) continue;
      out.push({
        words: words,
        path: assetFilePath(rel),
        name: (cards[i].innerText || "").replace(/\s+/g, " ").trim()
      });
    }
    return out;
  }

  function automateSrt() {
    var run = function (path) {
      setDot("busy");
      setStatus("Criando automacao inteligente do SRT v3...");
      callHost("EP_automateSRTMogrtsV3", [path, JSON.stringify(getStyleFromUi())], function (res) {
        if (res && res.ok) {
          if (res.entries) {
            state.lastSrtEntries = res.entries;
            renderSrt(res.entries);
          }
          setDot("ok");
          setStatus(res.status || "Automacao SRT aplicada.", "ok");
          scheduleTimelinePreviewStop(res);
          if (res.automatedEntries) log("Blocos com animacao: " + res.automatedEntries + ".", "ok");
          if (res.skipped) log("Trechos sem destaque suficiente ou pulados: " + res.skipped + ".", "info");
          if (res.groups) log("Destaques: " + res.groups.join(" | "), "ok");
          if (res.failures && res.failures.length) log("Alguns templates falharam e foram pulados: " + res.failures.join(" | "), "err");
          if (typeof res.textPropsChanged !== "undefined" && Number(res.textPropsChanged) === 0) {
            log("MOGRTs criados, mas nenhum campo de texto editavel foi encontrado.", "err");
          }
        } else {
          setDot("err");
          setStatus((res && res.error) || "Falha na automacao SRT.", "err");
        }
      });
    };
    if (state.lastSrtPath) run(state.lastSrtPath);
    else chooseSrt(run);
  }

  function combineSelectedWords() {
    var mogrtPath = savedMogrtPath();
    if (!mogrtPath) {
      setStatus("Selecione um MOGRT animado primeiro.", "err");
      return;
    }
    setDot("busy");
    setStatus("Combinando 3 graphics selecionados...");
    callHost("EP_combineSelectedGraphicsAs3WordMogrt", [JSON.stringify(getStyleFromUi()), mogrtPath], function (res) {
      if (res && res.ok) {
        setDot("ok");
        setStatus(res.status || "Template de 3 palavras aplicado.", "ok");
        scheduleTimelinePreviewStop(res);
        if (res.words) log("Palavras aplicadas: " + res.words.join(" | "), "ok");
        if (typeof res.textPropsChanged !== "undefined" && Number(res.textPropsChanged) < 3) {
          log("Alguns campos de palavra nao foram encontrados. Exponha Palavra 1, Palavra 2 e Palavra 3 no MOGRT.", "err");
        }
      } else {
        setDot("err");
        setStatus((res && res.error) || "Falha ao combinar selecionados.", "err");
      }
    });
  }

  function stretchSelectedMogrt() {
    var duration = clamp(parseFloat(ui.singleDuration.value) || 3, .25, 60);
    setDot("busy");
    setStatus("Ajustando duracao do MOGRT selecionado...");
    callHost("EP_setSelectedMogrtDuration", [String(duration)], function (res) {
      if (res && res.ok) {
        setDot("ok");
        setStatus(res.status || "Duracao ajustada.", "ok");
      } else {
        setDot("err");
        setStatus((res && res.error) || "Falha ao ajustar duracao.", "err");
      }
    });
  }

  function applySelected() {
    setDot("busy");
    callHost("EP_applyPresetToSelected", [JSON.stringify(getStyleFromUi())], function (res) {
      if (res && res.ok) {
        setDot("ok");
        setStatus(res.status || "Preset aplicado.", "ok");
      } else {
        setDot("err");
        setStatus((res && res.error) || "Nao foi possivel aplicar preset.", "err");
      }
    });
  }

  function refreshHostInfo() {
    setDot("busy");
    callHost("EP_getHostInfo", [], function (res) {
      if (res && res.ok) {
        state.hostReady = true;
        var details = [];
        if (res.projectName) details.push(res.projectName);
        if (res.activeItem) details.push(res.activeItem);
        if (res.sequenceName) details.push(res.sequenceName);
        ui.hostInfo.textContent = details.length ? details.join(" | ") : (HOST_NAME + " pronto");
        setDot("ok");
        setStatus("Host conectado.", "ok");
      } else {
        state.hostReady = false;
        ui.hostInfo.textContent = (res && res.error) || "Host indisponivel";
        setDot("err");
        setStatus(ui.hostInfo.textContent, "err");
      }
      setLocked(!state.licensed);
    });
  }

  function drawPreview() {
    drawPositionPreview(ui.previewCanvas, {
      sample: ui.captionText && ui.captionText.value ? ui.captionText.value.replace(/\s+/g, " ").trim() : "Caldo de cana",
      animated: true,
      vertical: true
    });
    drawPositionPreview(ui.srtPositionCanvas, {
      sample: "Posicione sua legenda aqui",
      animated: false,
      vertical: true
    });
    window.requestAnimationFrame(drawPreview);
  }

  function drawPositionPreview(canvas, options) {
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext("2d");
    var w = canvas.width;
    var h = canvas.height;
    var elapsed = ((Date.now() - previewStart) % 2200) / 2200;
    var style = getStyleFromUi();
    var sample = (options && options.sample) || "Legenda com impacto";
    if (style.allCaps) sample = sample.toUpperCase();
    var enter = Math.min(1, elapsed * 3.2);
    var exit = elapsed > .78 ? Math.max(0, 1 - ((elapsed - .78) / .22)) : 1;
    var t = options && options.animated === false ? 1 : easeOutCubic(Math.min(enter, exit));
    var preset = style.presetId;
    var alpha = t;
    var x = w * ((typeof style.positionX !== "undefined" ? style.positionX : defaults.positionX) / 100);
    var y = h * (style.positionY / 100);
    var scale = 1;
    var visibleChars = sample.length;

    if (options && options.animated === false) {
      alpha = 1;
    } else if (preset === "slide-up") {
      y += (1 - t) * 42;
    } else if (preset === "scale-pop") {
      scale = .75 + t * .35;
      if (t > .75) scale = 1.08 - (t - .75) * .32;
    } else if (preset === "typewriter") {
      visibleChars = Math.max(1, Math.round(sample.length * enter));
      alpha = exit;
    } else if (preset === "bounce") {
      y += Math.sin((1 - t) * Math.PI * 2) * (1 - t) * 28;
      scale = 1 + Math.sin(t * Math.PI) * .08;
    }

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#141414";
    ctx.fillRect(0, 0, w, h);
    drawGrid(ctx, w, h);
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    var fontScale = options && options.vertical ? (w / 720) : (w / 1280);
    var fontPx = Math.max(18, Math.round(style.fontSize * fontScale));
    ctx.font = "700 " + fontPx + "px Segoe UI, Arial";
    var drawText = sample.slice(0, visibleChars);
    while (drawText.length > 4 && ctx.measureText(drawText).width > w * .86) {
      drawText = drawText.substr(0, drawText.length - 2);
    }
    if (style.strokeWidth > 0) {
      ctx.strokeStyle = style.strokeColor;
      ctx.lineWidth = Math.max(1, style.strokeWidth * (w / 640));
      ctx.strokeText(drawText, 0, 0);
    }
    ctx.fillStyle = style.fillColor;
    ctx.fillText(drawText, 0, 0);
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = "rgba(255,151,15,.92)";
    ctx.fillStyle = "rgba(255,151,15,.92)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - 12, y);
    ctx.lineTo(x + 12, y);
    ctx.moveTo(x, y - 12);
    ctx.lineTo(x, y + 12);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawGrid(ctx, w, h) {
    ctx.strokeStyle = "rgba(255,151,15,.07)";
    ctx.lineWidth = 1;
    for (var x = 0; x <= w; x += 80) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (var y = 0; y <= h; y += 60) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
  }

  function openDataFolder() {
    callHost("EP_openDataFolder", [], function (res) {
      setStatus((res && (res.status || res.error)) || "Pasta solicitada.", res && res.ok ? "ok" : "err");
    });
  }

  function copyLog() {
    var text = logLines.join("\n");
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text);
        setStatus("Diagnostico copiado.", "ok");
        return;
      }
    } catch (e) {}
    var area = document.createElement("textarea");
    area.value = text;
    document.body.appendChild(area);
    area.select();
    try { document.execCommand("copy"); } catch (e2) {}
    document.body.removeChild(area);
    setStatus("Diagnostico copiado.", "ok");
  }

  function toggleLogDrawer() {
    var open = !document.body.classList.contains("log-open");
    document.body.classList.toggle("log-open", open);
    if (ui.btnToggleLog) {
      ui.btnToggleLog.textContent = open ? "▾" : "▴";
      ui.btnToggleLog.setAttribute("aria-expanded", open ? "true" : "false");
    }
    if (open && ui.logOutput) ui.logOutput.scrollTop = ui.logOutput.scrollHeight;
  }

  function bindTabs() {
    var tabs = document.querySelectorAll(".tab");
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].addEventListener("click", function () {
        var tab = this.getAttribute("data-tab");
        var pages = document.querySelectorAll(".tab-page");
        for (var p = 0; p < pages.length; p++) pages[p].classList.remove("active");
        for (var t = 0; t < tabs.length; t++) tabs[t].classList.remove("active");
        this.classList.add("active");
        $("page-" + tab).classList.add("active");
      });
    }
  }

  function bindTemplateLibrary() {
    var cards = document.querySelectorAll(".template-card");
    var search = $("template-search");
    var activeFilter = "all";

    function cardMatchesFilter(card) {
      if (activeFilter === "all") return true;
      if (activeFilter.indexOf("words:") === 0) {
        return String(card.getAttribute("data-words") || "") === activeFilter.split(":")[1];
      }
      return true;
    }

    function cardMatchesSearch(card) {
      if (!search) return true;
      var q = String(search.value || "").toLowerCase();
      if (!q) return true;
      return String(card.innerText || "").toLowerCase().indexOf(q) !== -1;
    }

    function applyTemplateFilters() {
      for (var c = 0; c < cards.length; c++) {
        cards[c].style.display = cardMatchesFilter(cards[c]) && cardMatchesSearch(cards[c]) ? "" : "none";
      }
    }

    function renderTemplateCategories() {
      var sidebar = $("template-sidebar");
      if (!sidebar) return;
      var counts = { "1": 0, "2": 0, "3": 0, "4": 0 };
      for (var c = 0; c < cards.length; c++) {
        var words = String(cards[c].getAttribute("data-words") || "");
        if (counts.hasOwnProperty(words)) counts[words]++;
      }
      sidebar.innerHTML =
        '<div class="side-title">Categorias</div>' +
        '<button class="side-link active" data-filter="all">Geral</button>' +
        '<div class="side-title">Palavras</div>' +
        '<button class="side-link" data-filter="words:1">1 Palavra (' + counts["1"] + ')</button>' +
        '<button class="side-link" data-filter="words:2">2 Palavras (' + counts["2"] + ')</button>' +
        '<button class="side-link" data-filter="words:3">3 Palavras (' + counts["3"] + ')</button>' +
        '<button class="side-link" data-filter="words:4">4 Palavras (' + counts["4"] + ')</button>';

      var links = sidebar.querySelectorAll(".side-link");
      for (var l = 0; l < links.length; l++) {
        links[l].addEventListener("click", function () {
          for (var i = 0; i < links.length; i++) links[i].classList.remove("active");
          this.classList.add("active");
          activeFilter = this.getAttribute("data-filter") || "all";
          applyTemplateFilters();
        });
      }
    }

    renderTemplateCategories();

    for (var i = 0; i < cards.length; i++) {
      cards[i].addEventListener("click", function () {
        for (var c = 0; c < cards.length; c++) cards[c].classList.remove("active");
        this.classList.add("active");
        var label = this.innerText.replace(/\s+/g, " ").trim();
        var mogrtRel = this.getAttribute("data-mogrt");
        var previewRel = this.getAttribute("data-preview");
        if (mogrtRel) setMogrtPath(assetFilePath(mogrtRel), this.getAttribute("data-words"));
        setTemplatePreview(previewRel || "");
        setStatus("Template selecionado: " + label, "ok");
      });
    }

    for (var a = 0; a < cards.length; a++) {
      if (cards[a].classList.contains("active")) {
        var initialMogrt = cards[a].getAttribute("data-mogrt");
        var initialPreview = cards[a].getAttribute("data-preview");
        if (initialMogrt) setMogrtPath(assetFilePath(initialMogrt), cards[a].getAttribute("data-words"));
        setTemplatePreview(initialPreview || "");
        break;
      }
    }

    if (search) {
      search.addEventListener("input", function () {
        applyTemplateFilters();
      });
    }

    applyTemplateFilters();
  }

  function bindLayoutResizers() {
    var categoryHandle = $("category-resizer");
    var applyHandle = $("apply-resizer");

    if (categoryHandle) {
      categoryHandle.addEventListener("mousedown", function (event) {
        event.preventDefault();
        var layout = document.querySelector(".template-layout");
        var prefs = readLayoutPrefs();
        var dragging = true;
        categoryHandle.classList.add("dragging");

        function move(moveEvent) {
          if (!dragging || !layout) return;
          var rect = layout.getBoundingClientRect();
          var width = clamp(moveEvent.clientX - rect.left, 64, Math.min(260, rect.width - 160));
          document.documentElement.style.setProperty("--category-width", width + "px");
          prefs.categoryWidth = width;
        }

        function up() {
          dragging = false;
          categoryHandle.classList.remove("dragging");
          document.removeEventListener("mousemove", move);
          document.removeEventListener("mouseup", up);
          writeLayoutPrefs(prefs);
        }

        document.addEventListener("mousemove", move);
        document.addEventListener("mouseup", up);
      });
    }

    if (applyHandle) {
      applyHandle.addEventListener("mousedown", function (event) {
        event.preventDefault();
        var page = $("page-create");
        var prefs = readLayoutPrefs();
        var dragging = true;
        applyHandle.classList.add("dragging");

        function move(moveEvent) {
          if (!dragging || !page) return;
          var rect = page.getBoundingClientRect();
          var height = clamp(rect.bottom - moveEvent.clientY, 104, Math.min(220, rect.height - 120));
          document.documentElement.style.setProperty("--apply-height", height + "px");
          prefs.applyHeight = height;
        }

        function up() {
          dragging = false;
          applyHandle.classList.remove("dragging");
          document.removeEventListener("mousemove", move);
          document.removeEventListener("mouseup", up);
          writeLayoutPrefs(prefs);
        }

        document.addEventListener("mousemove", move);
        document.addEventListener("mouseup", up);
      });
    }
  }

  function setPreviewPositionFromEvent(event, canvas) {
    if (!canvas) return;
    var rect = canvas.getBoundingClientRect();
    var x = ((event.clientX - rect.left) / rect.width) * 100;
    var y = ((event.clientY - rect.top) / rect.height) * 100;
    saveCaptionPosition(x, y);
  }

  function bindPreviewPositioning() {
    var canvases = [ui.previewCanvas, ui.srtPositionCanvas];
    var activeCanvas = null;

    function bindCanvas(canvas) {
      if (!canvas) return;
      canvas.addEventListener("mousedown", function (event) {
        activeCanvas = canvas;
        state.previewDragging = true;
        setPreviewPositionFromEvent(event, activeCanvas);
        setStatus("Posicao do preview ajustada.", "ok");
      });
    }

    for (var i = 0; i < canvases.length; i++) bindCanvas(canvases[i]);

    document.addEventListener("mousemove", function (event) {
      if (!state.previewDragging || !activeCanvas) return;
      setPreviewPositionFromEvent(event, activeCanvas);
    });

    document.addEventListener("mouseup", function () {
      if (!state.previewDragging) return;
      state.previewDragging = false;
      activeCanvas = null;
      setStatus("Posicao do preview ajustada.", "ok");
    });

    if (ui.positionY) {
      ui.positionY.addEventListener("change", function () {
        saveCaptionPosition(state.style.positionX, parseFloat(ui.positionY.value) || defaults.positionY);
      });
    }
  }

  function bindEvents() {
    ui.btnRefresh.addEventListener("click", refreshHostInfo);
    if (ui.btnCreateCaption) ui.btnCreateCaption.addEventListener("click", createCaption);
    if (ui.btnInjectCaption) ui.btnInjectCaption.addEventListener("click", applyTemplate);
    if (ui.btnCombineSelectedWords) ui.btnCombineSelectedWords.addEventListener("click", combineSelectedWords);
    if (ui.btnStretchSelectedMogrt) ui.btnStretchSelectedMogrt.addEventListener("click", stretchSelectedMogrt);
    if (ui.btnApplySelected) ui.btnApplySelected.addEventListener("click", applySelected);
    ui.btnImportSrt.addEventListener("click", importSrt);
    if (ui.btnAutoSrt) ui.btnAutoSrt.addEventListener("click", automateSrt);
    if (ui.btnInjectSrtMogrt) ui.btnInjectSrtMogrt.addEventListener("click", injectSrtMogrt);
    ui.btnPreviewSrt.addEventListener("click", previewSrt);
    ui.btnSaveStyle.addEventListener("click", saveStyle);
    if (ui.btnActivateLicense) ui.btnActivateLicense.addEventListener("click", activateLicense);
    if (ui.btnDevLicense) ui.btnDevLicense.addEventListener("click", function () {
      activateLocal((ui.licenseEmail.value || "teste@local").trim(), "LOCAL-DEV", "dev-button");
    });
    if (ui.btnClearLicense) ui.btnClearLicense.addEventListener("click", clearLicense);
    if (ui.btnOpenData) ui.btnOpenData.addEventListener("click", openDataFolder);
    if (ui.btnCopyLog) ui.btnCopyLog.addEventListener("click", copyLog);
    if (ui.btnToggleLog) ui.btnToggleLog.addEventListener("click", toggleLogDrawer);

    var styleInputs = [ui.presetSelect, ui.fontSize, ui.positionY, ui.fillColor, ui.strokeColor, ui.strokeWidth, ui.durationFrames, ui.allCaps];
    for (var i = 0; i < styleInputs.length; i++) {
      if (!styleInputs[i]) continue;
      styleInputs[i].addEventListener("change", function () {
        state.style = getStyleFromUi();
      });
    }
  }

  function boot() {
    applyLayoutPrefs();
    ui.hostLabel.textContent = HOST_NAME + " | v" + VERSION;
    ui.apiBase.value = localStorage.getItem(API_KEY) || "";
    setMogrtPath(savedMogrtPath());
    bindTabs();
    bindEvents();
    bindTemplateLibrary();
    bindLayoutResizers();
    bindPreviewPositioning();
    setLocked(true);

    if (typeof CSInterface === "undefined") {
      setDot("err");
      setStatus("CSInterface nao carregou.", "err");
      return;
    }

    cs = new CSInterface();
    setDot("busy");
    setStatus("Conectando ao " + HOST_NAME + "...");
    loadBridge(function (res) {
      if (res && res.ok) {
        state.hostReady = true;
        setDot("ok");
        loadPresets();
        loadStyle();
        loadSession();
        loadBundledMogrtDefault();
        refreshHostInfo();
        drawPreview();
      } else {
        setDot("err");
        setStatus((res && res.error) || "Bridge nao respondeu.", "err");
        if (res && res.script) log("Script que falhou: " + res.script, "err");
        if (res && res.path) log("Bridge path: " + res.path, "err");
      }
    });
  }

  boot();
})();
