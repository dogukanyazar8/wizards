import {
  DEFAULT_DESKTOP_SHORTCUTS,
  captureDesktopShortcut,
  validateDesktopShortcutAssignments,
} from "./shortcut-editor.mjs";

(() => {
  "use strict";

  const CONTROL_COMMANDS = Object.freeze({
    checkUpdate: "desktop_control_check_for_updates",
    exportDiagnostics: "export_desktop_diagnostics_bundle",
    getState: "get_desktop_control_state",
    installUpdate: "desktop_control_install_update",
    recover: "desktop_control_recover",
    requestNotification: "desktop_control_request_notification_permission",
    resolveMediaPermission: "resolve_desktop_media_permission",
    saveAppSettings: "desktop_control_set_app_settings",
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
  const shortcutFields = Object.freeze({
    hideGameOverlay: "hide-game-overlay",
    pushToTalk: "push-to-talk",
    toggleAdminConsole: "toggle-admin-console",
    toggleDeafen: "toggle-deafen",
    toggleMute: "toggle-mute",
  });
  const shortcutMessages = Object.freeze({
    duplicate: "Already assigned to another action.",
    invalid: "Use a modifier plus a key, or F13–F24.",
    osRefused: "Operating system refused this combination.",
    reserved: "Reserved by the operating system.",
  });
  let activeMediaPermissionPrompt = null;

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

  function setShortcutStatus(action, message, tone = "neutral") {
    const output = byId(`${shortcutFields[action]}-status`);
    output.textContent = message;
    output.dataset.tone = tone;
  }

  function shortcutAssignments() {
    return Object.fromEntries(
      Object.entries(shortcutFields).map(([action, id]) => [action, byId(id).value.trim()]),
    );
  }

  function shortcutEntries(shortcuts) {
    if (Array.isArray(shortcuts?.entries)) return shortcuts.entries;
    return (shortcuts?.registered ?? []).map((entry) => ({
      action: entry.action,
      conflict: false,
      keys: entry.shortcut.split("+").filter(Boolean),
      reason: null,
      registered: true,
    }));
  }

  function renderShortcuts(shortcuts) {
    byId("shortcuts-enabled").checked = Boolean(shortcuts?.enabled);
    const entries = new Map(shortcutEntries(shortcuts).map((entry) => [entry.action, entry]));
    for (const [action, id] of Object.entries(shortcutFields)) {
      const entry = entries.get(action);
      byId(id).value = entry?.keys?.join("+") ?? DEFAULT_DESKTOP_SHORTCUTS[action] ?? "";
      if (entry?.reason) {
        setShortcutStatus(
          action,
          shortcutMessages[entry.reason] ?? "Shortcut unavailable.",
          "error",
        );
      } else if (entry?.registered) {
        setShortcutStatus(action, "Active", "success");
      } else {
        setShortcutStatus(action, shortcuts?.enabled ? "Not assigned" : "Disabled");
      }
    }
  }

  function renderAppSettings(settings) {
    byId("launch-on-startup").checked = Boolean(settings?.launchOnStartup);
    byId("close-action").value = settings?.closeAction === "quit" ? "quit" : "tray";
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
    renderAppSettings(state.application);
    renderShortcuts(state.shortcuts);
    renderPermissions(state.permissions);
    if (state.mediaPermissionPrompt) {
      showMediaPermissionPrompt(state.mediaPermissionPrompt);
    }
    updateInstallButton();
  }

  function showMediaPermissionPrompt(prompt) {
    if (
      !prompt ||
      !["camera", "microphone"].includes(prompt.kind) ||
      typeof prompt.requestId !== "string" ||
      !/^media-permission-[1-9][0-9]*$/.test(prompt.requestId)
    ) {
      return;
    }

    activeMediaPermissionPrompt = prompt;
    const isCamera = prompt.kind === "camera";
    byId("media-permission-icon").textContent = isCamera ? "●" : "◉";
    byId("media-permission-title").textContent = isCamera
      ? "Allow Whispr to use your camera?"
      : "Allow Whispr to use your microphone?";
    byId("media-permission-description").textContent = isCamera
      ? "Used for video calls and camera preview. Whispr starts the camera only after an action you take."
      : "Used for voice channels, calls, and microphone testing. Whispr starts listening only after an action you take.";
    byId("media-permission-result").textContent = "";

    const dialog = byId("media-permission-dialog");
    if (!dialog.open) dialog.showModal();
    byId("media-permission-deny").focus();
  }

  async function resolveMediaPermission(allowed) {
    const prompt = activeMediaPermissionPrompt;
    if (!prompt) return;

    const allowButton = byId("media-permission-allow");
    const denyButton = byId("media-permission-deny");
    allowButton.disabled = true;
    denyButton.disabled = true;
    byId("media-permission-result").textContent = "Applying your choice…";

    try {
      const result = await invoke(CONTROL_COMMANDS.resolveMediaPermission, {
        allowed,
        requestId: prompt.requestId,
      });
      activeMediaPermissionPrompt = null;
      byId("media-permission-dialog").close();
      setGlobalStatus(result.message, allowed ? "success" : "neutral");
    } catch (error) {
      byId("media-permission-result").textContent = formatError(error);
    } finally {
      allowButton.disabled = false;
      denyButton.disabled = false;
    }
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
    const assignments = shortcutAssignments();
    return {
      hideGameOverlay: assignments.hideGameOverlay || null,
      pushToTalk: assignments.pushToTalk || null,
      shortcutsEnabled: enabled,
      toggleAdminConsole: assignments.toggleAdminConsole || null,
      toggleDeafen: assignments.toggleDeafen || null,
      toggleMute: assignments.toggleMute || null,
    };
  }

  function validateShortcutForm(enabled) {
    const assignments = shortcutAssignments();
    const errors = validateDesktopShortcutAssignments(assignments);
    for (const action of Object.keys(shortcutFields)) setShortcutStatus(action, "");
    for (const [action, reason] of Object.entries(errors)) {
      setShortcutStatus(action, shortcutMessages[reason] ?? "Shortcut unavailable.", "error");
    }
    if (enabled && !Object.values(assignments).some(Boolean)) {
      setGlobalStatus("Assign at least one shortcut before enabling.", "error");
      return false;
    }
    if (Object.keys(errors).length > 0) {
      setGlobalStatus("Fix shortcut conflicts before saving.", "error");
      return false;
    }
    return true;
  }

  async function saveShortcuts(button, enabled) {
    if (!validateShortcutForm(enabled)) return;
    let status;
    try {
      status = await runOperation(button, () =>
        invoke(CONTROL_COMMANDS.saveShortcuts, { config: shortcutConfig(enabled) }),
      );
    } catch (error) {
      const refusedAction = formatError(error).match(
        /Desktop shortcut (\w+) was refused by the operating system/u,
      )?.[1];
      if (refusedAction && shortcutFields[refusedAction]) {
        setShortcutStatus(
          refusedAction,
          "Operating system refused this combination; previous shortcuts remain active.",
          "error",
        );
      }
      throw error;
    }
    currentState.shortcuts = status;
    renderShortcuts(status);
    byId("shortcut-summary").textContent = status.enabled
      ? `${status.registered.length} active`
      : "Disabled";
  }

  async function saveAppSettings(button) {
    const application = await runOperation(button, () =>
      invoke(CONTROL_COMMANDS.saveAppSettings, {
        settings: {
          closeAction: byId("close-action").value === "quit" ? "quit" : "tray",
          launchOnStartup: byId("launch-on-startup").checked,
        },
      }),
    );
    currentState.application = application;
    renderAppSettings(application);
    setGlobalStatus("Application settings saved.", "success");
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
    byId("media-permission-allow").addEventListener("click", () => {
      void resolveMediaPermission(true);
    });
    byId("media-permission-deny").addEventListener("click", () => {
      void resolveMediaPermission(false);
    });
    byId("media-permission-dialog").addEventListener("cancel", (event) => {
      event.preventDefault();
      void resolveMediaPermission(false);
    });
    byId("app-settings-form").addEventListener("submit", (event) => {
      event.preventDefault();
      void saveAppSettings(event.submitter).catch(() => {});
    });
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
      "reset-shortcuts": (button) => {
        for (const [action, id] of Object.entries(shortcutFields)) {
          byId(id).value = DEFAULT_DESKTOP_SHORTCUTS[action];
        }
        byId("shortcuts-enabled").checked = false;
        return saveShortcuts(button, false);
      },
      "save-app-settings": (button) => saveAppSettings(button),
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
    for (const [action, id] of Object.entries(shortcutFields)) {
      const input = byId(id);
      let valueBeforeCapture = input.value;
      input.addEventListener("focus", () => {
        valueBeforeCapture = input.value;
        setShortcutStatus(action, "Press a shortcut; Escape cancels.");
      });
      input.addEventListener("keydown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const result = captureDesktopShortcut(event);
        if (result.kind === "pending") return;
        if (result.kind === "cancel") input.value = valueBeforeCapture;
        if (result.kind === "clear") input.value = "";
        if (result.kind === "captured") input.value = result.accelerator;
        input.blur();
        validateShortcutForm(byId("shortcuts-enabled").checked);
      });
    }
  }

  window.whisprDesktopControlSelectSection = (section) => {
    const allowed = new Set([
      "overview",
      "app",
      "shortcuts",
      "diagnostics",
      "updates",
      "permissions",
      "recovery",
    ]);
    if (allowed.has(section)) byId(section)?.scrollIntoView({ block: "start" });
  };

  window.whisprDesktopControlRefreshState = () => {
    void refreshState(null).catch(() => {});
  };

  window.whisprDesktopControlCancelMediaPermission = () => {
    if (activeMediaPermissionPrompt) void resolveMediaPermission(false);
  };

  bindActions();
  void refreshState(null).catch(() => {});
})();
