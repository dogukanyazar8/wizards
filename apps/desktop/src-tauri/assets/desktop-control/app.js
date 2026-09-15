// Network-free consent surface. All desktop settings live in the main application.
(() => {
  "use strict";
  const byId = (id) => document.getElementById(id);
  let activePrompt = null;
  let saving = false;
  let refreshing = false;
  let refreshQueued = false;
  async function invoke(command, args) {
    const bridge = window.__TAURI_INTERNALS__?.invoke;
    if (typeof bridge !== "function") throw new Error("Trusted desktop IPC is unavailable.");
    return bridge(command, args);
  }
  async function refreshState() {
    if (refreshing || saving) {
      refreshQueued = true;
      return;
    }
    refreshing = true;
    byId("retry").hidden = true;
    try {
      const state = await invoke("get_desktop_control_state");
      const prompt = state.mediaPermissionPrompt;
      if (
        !prompt ||
        !["camera", "microphone"].includes(prompt.kind) ||
        !/^media-permission-[1-9][0-9]*$/.test(prompt.requestId)
      ) {
        byId("global-status").textContent =
          "Bekleyen cihaz erişimi isteği yok. Bu pencereyi kapatabilirsin.";
        return;
      }
      activePrompt = prompt;
      const camera = prompt.kind === "camera";
      byId("camera-icon").toggleAttribute("hidden", !camera);
      byId("microphone-icon").toggleAttribute("hidden", camera);
      byId("media-permission-title").textContent = camera
        ? "Whispr kameranızı kullanabilsin mi?"
        : "Whispr mikrofonunuzu kullanabilsin mi?";
      byId("media-permission-description").textContent = camera
        ? "Görüntülü aramalar ve kamera önizlemesi için kullanılır. Kamera, siz bu özellikleri başlattığınızda açılır."
        : "Ses kanalları, aramalar ve mikrofon testi için kullanılır. Mikrofon, siz bu özellikleri başlattığınızda açılır.";
      byId("media-permission-result").textContent = "";
      const dialog = byId("media-permission-dialog");
      if (!dialog.open) dialog.showModal();
      byId("media-permission-deny").focus();
    } catch {
      byId("global-status").textContent = "Cihaz erişimi isteği okunamadı. Yeniden dene.";
      byId("retry").hidden = false;
    } finally {
      refreshing = false;
      if (refreshQueued) {
        refreshQueued = false;
        void refreshState();
      }
    }
  }
  async function resolveMediaPermission(allowed) {
    if (!activePrompt || saving) return;
    saving = true;
    byId("media-permission-allow").disabled = true;
    byId("media-permission-deny").disabled = true;
    byId("media-permission-result").textContent = "Tercihiniz uygulanıyor…";
    try {
      await invoke("resolve_desktop_media_permission", {
        allowed,
        requestId: activePrompt.requestId,
      });
      activePrompt = null;
      byId("media-permission-dialog").close();
      byId("global-status").textContent =
        "Cihaz erişimi tercihi kaydedildi. Bu pencereyi kapatabilirsin.";
    } catch {
      byId("media-permission-result").textContent =
        "Tercih uygulanamadı. Yeniden dene veya pencereyi kapat.";
    } finally {
      saving = false;
      byId("media-permission-allow").disabled = false;
      byId("media-permission-deny").disabled = false;
      if (refreshQueued) {
        refreshQueued = false;
        void refreshState();
      }
    }
  }
  byId("retry").addEventListener("click", () => void refreshState());
  byId("media-permission-allow").addEventListener("click", () => void resolveMediaPermission(true));
  byId("media-permission-deny").addEventListener("click", () => void resolveMediaPermission(false));
  byId("media-permission-dialog").addEventListener("cancel", (event) => {
    event.preventDefault();
    void resolveMediaPermission(false);
  });
  window.whisprDesktopControlRefreshState = () => void refreshState();
  window.whisprDesktopControlCancelMediaPermission = () => void resolveMediaPermission(false);
  void refreshState();
})();
