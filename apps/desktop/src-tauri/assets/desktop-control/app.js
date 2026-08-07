(() => {
  "use strict";

  const CONTROL_COMMANDS = Object.freeze({
    checkUpdate: "desktop_control_check_for_updates",
    exportDiagnostics: "export_desktop_diagnostics_bundle",
    getState: "get_desktop_control_state",
    installUpdate: "desktop_control_install_update",
    recover: "desktop_control_recover",
    requestNotification: "desktop_control_request_notification_permission",
    saveShortcuts: "configure_desktop_voice_shortcuts",
  });
  const RECOVERY_ACTIONS = Object.freeze({
    hideOverlay: "hide-overlay",
    recoverOverlay: "refresh-overlay",
    recoverVoiceMini: "reopen-voice-mini",
    resetMainWindow: "reset-main-window",
  });
  const byId = (id) => document.getElementById(id);
  const actionButtons = () => Array.from(document.querySelectorAll("[data-action]"));
  let currentState = null;
  let availableUpdateVersion = null;

  function setGlobalStatus(message, tone = "neutral") {
    const status = byId("global-status");
    status.textContent = message;
    status.dataset.tone = tone;
  }

  function formatError(error) {
    const message = typeof error === "string" ? error : error?.message;
    return message && message.length <= 240 ? message : "Desktop Control operation failed.";
  }

  async function invoke(command, args = {}) {
    const tauriInvoke = window.__TAURI_INTERNALS__?.invoke;
    if (typeof tauriInvoke !== "function") {
      throw new Error("Trusted desktop IPC is unavailable.");
    }
    return tauriInvoke(command, args);
  }

  async function runOperation(button, operation) {
    if (button?.disabled) return;
    if (button) button.disabled = true;
    setGlobalStatus("Working…");
    try {
      const result = await operation();
      setGlobalStatus("Operation completed.", "success");
      return result;
    } catch (error) {
      setGlobalStatus(formatError(error), "error");
      throw error;
    } finally {
      if (button) button.disabled = false;
      updateInstallButton();
    }
  }

  function describeSurface(surface) {
    if (!surface?.exists) return "Not created";
    if (surface.minimized) return "Minimized";
    return surface.visible ? "Visible" : "Hidden";
  }

  function renderPermissions(permissions) {
    const list = byId("permission-list");
    list.replaceChildren();
    for (const permission of permissions ?? []) {
      const card = document.createElement("div");
      card.className = "permission-card";
      const title = document.createElement("strong");
      title.textContent = `${permission.label}: ${permission.status}`;
      const detail = document.createElement("p");
      detail.textContent = permission.instructions;
      card.append(title, detail);
      list.append(card);
    }
  }

  function renderShortcuts(shortcuts) {
    byId("shortcuts-enabled").checked = Boolean(shortcuts?.enabled);
    const values = new Map(
      (shortcuts?.registered ?? []).map((entry) => [entry.action, entry.shortcut]),
    );
    byId("toggle-mute").value = values.get("toggleMute") ?? "";
    byId("toggle-deafen").value = values.get("toggleDeafen") ?? "";
    byId("push-to-talk").value = values.get("pushToTalk") ?? "";
    byId("hide-game-overlay").value = values.get("hideGameOverlay") ?? "";
    byId("toggle-admin-console").value = values.get("toggleAdminConsole") ?? "";
  }

  function renderState(state) {
    currentState = state;
    byId("app-version").textContent = `${state.app.appVersion} · ${state.app.releaseRing}`;
    byId("platform").textContent = `${state.platform.os} / ${state.platform.arch}`;
    byId("updater-summary").textContent = state.updater.enabled ? "Configured" : "Disabled";
    byId("shortcut-summary").textContent = state.shortcuts.enabled
      ? `${state.shortcuts.registered.length} active`
      : "Disabled";
    byId("voice-mini-summary").textContent = describeSurface(state.companionSurfaces.voiceMini);
    byId("overlay-summary").textContent = describeSurface(state.companionSurfaces.gameOverlay);
    byId("update-status").textContent = state.updater.message;
    renderShortcuts(state.shortcuts);
    renderPermissions(state.permissions);
    updateInstallButton();
  }

  function updateInstallButton() {
    const button = document.querySelector('[data-action="install-update"]');
    button.disabled = !currentState?.updater.enabled || !availableUpdateVersion;
  }

  async function refreshState(button) {
    const state = await runOperation(button, () => invoke(CONTROL_COMMANDS.getState));
    renderState(state);
    setGlobalStatus("Local desktop state refreshed.", "success");
  }

  function shortcutConfig(enabled) {
    return {
      hideGameOverlay: enabled ? byId("hide-game-overlay").value : null,
      pushToTalk: enabled ? byId("push-to-talk").value : null,
      shortcutsEnabled: enabled,
      toggleAdminConsole: enabled ? byId("toggle-admin-console").value : null,
      toggleDeafen: enabled ? byId("toggle-deafen").value : null,
      toggleMute: enabled ? byId("toggle-mute").value : null,
    };
  }

  async function saveShortcuts(button, enabled) {
    const status = await runOperation(button, () =>
      invoke(CONTROL_COMMANDS.saveShortcuts, { config: shortcutConfig(enabled) }),
    );
    currentState.shortcuts = status;
    renderShortcuts(status);
    byId("shortcut-summary").textContent = status.enabled
      ? `${status.registered.length} active`
      : "Disabled";
  }

  async function exportDiagnostics(button) {
    const result = await runOperation(button, () => invoke(CONTROL_COMMANDS.exportDiagnostics));
    byId("diagnostics-result").textContent = `Saved: ${result.path}`;
  }

  async function checkUpdate(button) {
    const result = await runOperation(button, () => invoke(CONTROL_COMMANDS.checkUpdate));
    availableUpdateVersion = result.available ? result.latestVersion : null;
    byId("update-status").textContent = result.message;
  }

  async function installUpdate(button) {
    if (!availableUpdateVersion) return;
    const confirmed = window.confirm(
      `Download signed update ${availableUpdateVersion}, install it, then restart Whispr?`,
    );
    if (!confirmed) {
      setGlobalStatus("Update install cancelled.");
      return;
    }
    byId("update-status").textContent = "Downloading and verifying signed update…";
    await runOperation(button, () =>
      invoke(CONTROL_COMMANDS.installUpdate, {
        confirmed: true,
        expectedVersion: availableUpdateVersion,
      }),
    );
  }

  async function requestNotification(button) {
    const result = await runOperation(button, () => invoke(CONTROL_COMMANDS.requestNotification));
    setGlobalStatus(result.message, "success");
    await refreshState(null);
  }

  async function recover(button, action) {
    const result = await runOperation(button, () => invoke(CONTROL_COMMANDS.recover, { action }));
    byId("recovery-result").textContent = result.message;
    await refreshState(null);
  }

  function bindActions() {
    byId("shortcut-form").addEventListener("submit", (event) => {
      event.preventDefault();
      void saveShortcuts(event.submitter, byId("shortcuts-enabled").checked).catch(() => {});
    });
    const handlers = {
      "check-update": (button) => checkUpdate(button),
      "export-diagnostics": (button) => exportDiagnostics(button),
      "hide-overlay": (button) => recover(button, RECOVERY_ACTIONS.hideOverlay),
      "install-update": (button) => installUpdate(button),
      "recover-overlay": (button) => recover(button, RECOVERY_ACTIONS.recoverOverlay),
      "recover-voice-mini": (button) => recover(button, RECOVERY_ACTIONS.recoverVoiceMini),
      "refresh-state": (button) => refreshState(button),
      "request-notification": (button) => requestNotification(button),
      "reset-main-window": (button) => recover(button, RECOVERY_ACTIONS.resetMainWindow),
      "reset-shortcuts": (button) => saveShortcuts(button, false),
    };
    for (const button of actionButtons()) {
      const handler = handlers[button.dataset.action];
      if (!handler || button.type === "submit") continue;
      button.addEventListener("click", () => void handler(button).catch(() => {}));
    }
    for (const button of document.querySelectorAll("[data-section-target]")) {
      button.addEventListener("click", () => {
        byId(button.dataset.sectionTarget)?.scrollIntoView({ block: "start" });
      });
    }
  }

  window.whisprDesktopControlSelectSection = (section) => {
    const allowed = new Set([
      "overview",
      "shortcuts",
      "diagnostics",
      "updates",
      "permissions",
      "recovery",
    ]);
    if (allowed.has(section)) byId(section)?.scrollIntoView({ block: "start" });
  };

  bindActions();
  void refreshState(null).catch(() => {});
})();
