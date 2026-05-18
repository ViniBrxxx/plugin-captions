/*
 * Minimal CSInterface bridge for Adobe CEP panels.
 * Based on Adobe CEP Resources (Apache 2.0).
 */
(function (window) {
  "use strict";

  var SystemPath = {
    USER_DATA: "userData",
    COMMON_FILES: "commonFiles",
    MY_DOCUMENTS: "myDocuments",
    APPLICATION: "application",
    EXTENSION: "extension",
    HOST_APPLICATION: "hostApplication"
  };

  function CSInterface() {
    this.hostEnvironment = this.getHostEnvironment();
  }

  CSInterface.THEME_COLOR_CHANGED_EVENT = "com.adobe.csxs.events.ThemeColorChanged";

  CSInterface.prototype.getHostEnvironment = function () {
    try {
      if (!window.__adobe_cep__) return {};
      return JSON.parse(window.__adobe_cep__.getHostEnvironment());
    } catch (e) {
      return {};
    }
  };

  CSInterface.prototype.evalScript = function (script, callback) {
    try {
      if (!window.__adobe_cep__ || !window.__adobe_cep__.evalScript) {
        if (typeof callback === "function") {
          callback('{"ok":false,"error":"CEP runtime not available"}');
        }
        return;
      }
      window.__adobe_cep__.evalScript(script, function (raw) {
        if (raw === "EvalScript error." && typeof callback === "function") {
          callback(JSON.stringify({
            ok: false,
            error: "EvalScript error.",
            script: String(script || "").slice(0, 900)
          }));
          return;
        }
        if (typeof callback === "function") callback(raw);
      });
    } catch (e) {
      if (typeof callback === "function") {
        callback('{"ok":false,"error":' + JSON.stringify(String(e)) + "}");
      }
    }
  };

  CSInterface.prototype.getSystemPath = function (pathType) {
    try {
      if (!window.__adobe_cep__) return "";
      return decodeURI(window.__adobe_cep__.getSystemPath(pathType));
    } catch (e) {
      return "";
    }
  };

  CSInterface.prototype.getOSInformation = function () {
    try {
      return window.__adobe_cep__ ? window.__adobe_cep__.getOSInformation() : navigator.platform;
    } catch (e) {
      return navigator.platform || "";
    }
  };

  CSInterface.prototype.openURLInDefaultBrowser = function (url) {
    try {
      if (window.cep && window.cep.util && window.cep.util.openURLInDefaultBrowser) {
        window.cep.util.openURLInDefaultBrowser(url);
      } else {
        window.open(url, "_blank");
      }
    } catch (e) {}
  };

  CSInterface.prototype.addEventListener = function (type, listener, obj) {
    try {
      if (window.__adobe_cep__) window.__adobe_cep__.addEventListener(type, listener, obj);
    } catch (e) {}
  };

  CSInterface.prototype.removeEventListener = function (type, listener, obj) {
    try {
      if (window.__adobe_cep__) window.__adobe_cep__.removeEventListener(type, listener, obj);
    } catch (e) {}
  };

  CSInterface.prototype.dispatchEvent = function (event) {
    try {
      if (window.__adobe_cep__) window.__adobe_cep__.dispatchEvent(event);
    } catch (e) {}
  };

  CSInterface.prototype.closeExtension = function () {
    try {
      if (window.__adobe_cep__) window.__adobe_cep__.closeExtension();
    } catch (e) {}
  };

  window.SystemPath = window.SystemPath || SystemPath;
  window.CSInterface = window.CSInterface || CSInterface;
})(window);
