const elements = {
  acceptanceDialog: document.querySelector("#acceptance-dialog"),
  acceptanceError: document.querySelector("#acceptance-error"),
  acceptanceForm: document.querySelector("#acceptance-form"),
  acceptanceImpact: document.querySelector("#acceptance-impact"),
  acceptanceInput: document.querySelector("#acceptance-input"),
  acceptanceLabel: document.querySelector("#acceptance-label"),
  acceptanceTarget: document.querySelector("#acceptance-target"),
  acceptanceTitle: document.querySelector("#acceptance-title"),
  acceptanceWarning: document.querySelector("#acceptance-warning"),
  cancelDialog: document.querySelector("#cancel-dialog"),
  cancelRun: document.querySelector("#cancel-run"),
  closeDialog: document.querySelector("#close-dialog"),
  completionCopy: document.querySelector("#completion-copy"),
  completionPanel: document.querySelector("#completion-panel"),
  copyLog: document.querySelector("#copy-log"),
  exportJson: document.querySelector("#export-json"),
  exportMarkdown: document.querySelector("#export-markdown"),
  followLog: document.querySelector("#follow-log"),
  heroStateDot: document.querySelector("#hero-state-dot"),
  heroStateText: document.querySelector("#hero-state-text"),
  historyList: document.querySelector("#history-list"),
  issueCount: document.querySelector("#issue-count"),
  issueFilterBlocked: document.querySelector("#issue-filter-blocked"),
  issueFilterFail: document.querySelector("#issue-filter-fail"),
  issueList: document.querySelector("#issue-list"),
  issuesPanel: document.querySelector("#issues-panel"),
  logFilter: document.querySelector("#log-filter"),
  logOutput: document.querySelector("#log-output"),
  profileCount: document.querySelector("#profile-count"),
  profileGrid: document.querySelector("#profile-grid"),
  profileTemplate: document.querySelector("#profile-template"),
  readinessBadge: document.querySelector("#readiness-badge"),
  rerunFailed: document.querySelector("#rerun-failed"),
  runAcceptance: document.querySelector("#run-acceptance"),
  runSafe: document.querySelector("#run-safe"),
  statusAnnouncer: document.querySelector("#status-announcer"),
  summaryBlocked: document.querySelector("#summary-blocked"),
  summaryFail: document.querySelector("#summary-fail"),
  summaryPass: document.querySelector("#summary-pass"),
  summaryRemaining: document.querySelector("#summary-remaining"),
  summaryTotal: document.querySelector("#summary-total"),
  themeSelect: document.querySelector("#theme-select"),
};

const STATUS_COPY = Object.freeze({
  NOT_RUN: "Çalışmadı",
  QUEUED: "Bekliyor",
  RUNNING: "Çalışıyor",
  PASS: "Geçti",
  FAIL: "Başarısız",
  BLOCKED: "Engellendi",
  SKIP: "Atlandı",
  CANCELLED: "İptal",
});

const state = {
  bootstrap: null,
  currentRun: null,
  currentRunReplayable: true,
  eventSource: null,
  issueFilter: "FAIL",
  logs: [],
  pendingAcceptance: null,
  refreshTimer: null,
};

function announce(message) {
  elements.statusAnnouncer.textContent = message;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : "Beklenmeyen lokal dashboard hatası.";
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers);
  if (options.method && options.method !== "GET") {
    headers.set("content-type", "application/json");
    headers.set("x-whispr-quality-token", state.bootstrap.token);
  }
  const response = await fetch(path, { ...options, headers });
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json") ? await response.json() : null;
  if (!response.ok) {
    throw new Error(body?.error?.message ?? `İstek başarısız: ${response.status}`);
  }
  return body;
}

function profileState(profileId) {
  return state.currentRun?.profiles.find((profile) => profile.id === profileId) ?? null;
}

function durationText(profile) {
  if (!profile?.startedAt) return "—";
  const end = profile.completedAt ? Date.parse(profile.completedAt) : Date.now();
  const duration = Math.max(0, end - Date.parse(profile.startedAt));
  return duration < 1_000 ? `${duration} ms` : `${(duration / 1_000).toFixed(1)} sn`;
}

function renderProfiles() {
  const fragment = document.createDocumentFragment();
  const catalog = state.bootstrap.catalog;
  for (const profileId of catalog.profileOrder ?? Object.keys(catalog.profiles)) {
    const profile = catalog.profiles[profileId];
    const runProfile = profileState(profileId);
    const status = runProfile?.status ?? "NOT_RUN";
    const card = elements.profileTemplate.content.firstElementChild.cloneNode(true);
    card.dataset.profileId = profileId;
    card.dataset.status = status;
    card.querySelector("h3").textContent = profileId;
    card.querySelector(".profile-description").textContent = profile.description;
    card.querySelector(".profile-impact").textContent = `Etki: ${profile.estimatedImpact}`;
    card.querySelector(".profile-preconditions").textContent =
      `${profile.preconditions.length} önkoşul`;
    card.querySelector(".profile-steps").textContent = `${profile.steps.length} adım`;
    card.querySelector(".profile-duration").textContent = durationText(runProfile);
    card.querySelector(".profile-exit").textContent =
      runProfile?.exitCode === null || runProfile?.exitCode === undefined
        ? "exit —"
        : `exit ${runProfile.exitCode}`;
    const statusPill = card.querySelector(".status-pill");
    statusPill.dataset.status = status;
    statusPill.textContent = STATUS_COPY[status] ?? status;
    const button = card.querySelector(".profile-run");
    button.dataset.profileId = profileId;
    button.disabled = state.currentRun?.status === "RUNNING";
    if (profile.destructive || profile.requiresApproval) {
      button.textContent = "Onaylayarak Çalıştır";
    }
    fragment.append(card);
  }
  elements.profileGrid.replaceChildren(fragment);
  elements.profileCount.textContent = `${Object.keys(catalog.profiles).length} profil`;
}

function renderSummary() {
  const profiles = state.currentRun?.profiles ?? [];
  const counts = { PASS: 0, FAIL: 0, BLOCKED: 0, remaining: 0 };
  for (const profile of profiles) {
    if (Object.hasOwn(counts, profile.status)) counts[profile.status] += 1;
    else counts.remaining += 1;
  }
  elements.summaryTotal.textContent = String(profiles.length);
  elements.summaryPass.textContent = String(counts.PASS);
  elements.summaryFail.textContent = String(counts.FAIL);
  elements.summaryBlocked.textContent = String(counts.BLOCKED);
  elements.summaryRemaining.textContent = String(counts.remaining);
}

function appendIssueField(container, label, value, className = "") {
  if (value === null || value === undefined || value === "") return;
  const group = document.createElement("div");
  group.className = className ? `issue-field ${className}` : "issue-field";
  const title = document.createElement("span");
  title.className = "issue-field-label";
  title.textContent = label;
  const content = document.createElement("p");
  content.textContent = String(value);
  group.append(title, content);
  container.append(group);
}

function issueSourceLabel(source) {
  const column = source.column ? `:${source.column}` : "";
  return `${source.path}:${source.line}${column}`;
}

function createCopyButton(value, label) {
  const button = document.createElement("button");
  button.className = "issue-copy";
  button.type = "button";
  button.dataset.copyValue = value;
  button.textContent = label;
  return button;
}

function renderIssues() {
  const issues = (state.currentRun?.profiles ?? []).flatMap((profile) =>
    (profile.issues ?? []).map((issue) => ({ ...issue, profileId: profile.id })),
  );
  const visible = issues.filter((issue) => issue.status === state.issueFilter);
  const tabs = [elements.issueFilterFail, elements.issueFilterBlocked];
  for (const tab of tabs) {
    const selected = tab.dataset.issueStatus === state.issueFilter;
    tab.classList.toggle("is-active", selected);
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
  const selectedTab =
    state.issueFilter === "FAIL" ? elements.issueFilterFail : elements.issueFilterBlocked;
  elements.issueList.setAttribute("aria-labelledby", selectedTab.id);
  elements.issueCount.textContent = `${visible.length} sorun`;

  if (visible.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state issue-empty";
    empty.textContent =
      state.issueFilter === "FAIL" ? "Başarısız kontrol yok." : "Engellenmiş kontrol yok.";
    elements.issueList.replaceChildren(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const issue of visible) {
    const card = document.createElement("article");
    card.className = "issue-card";
    card.dataset.status = issue.status;

    const heading = document.createElement("div");
    heading.className = "issue-card-heading";
    const identity = document.createElement("div");
    const profile = document.createElement("strong");
    profile.textContent = issue.profileId;
    const step = document.createElement("small");
    step.textContent = issue.stepId ? `Adım: ${issue.stepId}` : "Profil sonucu";
    identity.append(profile, step);
    const pill = document.createElement("span");
    pill.className = "status-pill";
    pill.dataset.status = issue.status;
    pill.textContent = STATUS_COPY[issue.status] ?? issue.status;
    heading.append(identity, pill);
    card.append(heading);

    appendIssueField(card, "Neden", issue.reason, "issue-reason");
    if (issue.exitCode !== null && issue.exitCode !== undefined) {
      appendIssueField(card, "Çıkış kodu", issue.exitCode, "issue-meta");
    }
    if (issue.command) {
      const command = document.createElement("div");
      command.className = "issue-field issue-command";
      const label = document.createElement("span");
      label.className = "issue-field-label";
      label.textContent = "Komut";
      const row = document.createElement("div");
      const code = document.createElement("code");
      code.textContent = issue.command;
      row.append(code, createCopyButton(issue.command, "Kopyala"));
      command.append(label, row);
      card.append(command);
    }
    appendIssueField(card, "Sonraki adım", issue.nextAction, "issue-next-action");

    const sources = document.createElement("div");
    sources.className = "issue-field issue-sources";
    const sourcesLabel = document.createElement("span");
    sourcesLabel.className = "issue-field-label";
    sourcesLabel.textContent = "Kaynaklar";
    const sourceList = document.createElement("div");
    sourceList.className = "issue-source-list";
    if ((issue.sources ?? []).length === 0) {
      const unavailable = document.createElement("span");
      unavailable.className = "issue-source-unavailable";
      unavailable.textContent = "Doğrulanmış dosya konumu bulunamadı.";
      sourceList.append(unavailable);
    } else {
      for (const source of issue.sources) {
        const sourceLabel = issueSourceLabel(source);
        const sourceButton = createCopyButton(sourceLabel, sourceLabel);
        sourceButton.classList.add("issue-source");
        sourceButton.title = "Kaynak konumunu kopyala";
        sourceList.append(sourceButton);
      }
    }
    sources.append(sourcesLabel, sourceList);
    card.append(sources);

    if ((issue.excerpt ?? []).length > 0) {
      const evidence = document.createElement("details");
      evidence.className = "issue-evidence";
      const summary = document.createElement("summary");
      summary.textContent = `Kanıt çıktısı (${issue.excerpt.length} satır)`;
      const output = document.createElement("pre");
      output.textContent = issue.excerpt.join("\n");
      evidence.append(summary, output);
      card.append(evidence);
    }
    fragment.append(card);
  }
  elements.issueList.replaceChildren(fragment);
}

function renderRun() {
  const run = state.currentRun;
  const active = run?.status === "RUNNING";
  const status = run?.status ?? "NOT_RUN";
  elements.heroStateDot.dataset.status = status;
  elements.heroStateText.textContent = active
    ? "Kontroller çalışıyor"
    : run
      ? (STATUS_COPY[status] ?? status)
      : "Çalışma yok";
  elements.runSafe.disabled = active;
  elements.runAcceptance.disabled = active || !state.bootstrap.acceptanceTarget.ready;
  elements.cancelRun.disabled = !active;
  elements.rerunFailed.disabled =
    active ||
    !state.currentRunReplayable ||
    !run?.profiles.some((profile) => ["FAIL", "BLOCKED"].includes(profile.status));
  elements.rerunFailed.title =
    run && !state.currentRunReplayable
      ? "Geçmiş çalışma yalnızca kanıt olarak görüntülenebilir."
      : "Başarısız veya engellenmiş profilleri yeniden çalıştır.";
  elements.completionPanel.hidden = !run || active;
  if (run && !active) {
    const summary = run.summary ?? {};
    const evidenceWarning = run.evidenceWarnings?.length
      ? ` Kanıt uyarısı: ${run.evidenceWarnings.join(" ")}`
      : "";
    elements.completionCopy.textContent = `${STATUS_COPY[run.status] ?? run.status}. ${summary.pass ?? 0} geçti, ${summary.fail ?? 0} başarısız, ${summary.blocked ?? 0} engellendi.${evidenceWarning}`;
    elements.exportJson.href = `/api/runs/${run.id}/export.json`;
    elements.exportMarkdown.href = `/api/runs/${run.id}/export.md`;
  }
  renderSummary();
  renderProfiles();
  renderIssues();
}

function renderHistory() {
  const recent = state.bootstrap.recentRuns ?? [];
  if (recent.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty-state";
    empty.textContent = "Henüz sonuç yok.";
    elements.historyList.replaceChildren(empty);
    return;
  }
  const fragment = document.createDocumentFragment();
  for (const run of recent.slice(0, 30)) {
    const item = document.createElement("li");
    item.className = "history-item";
    const button = document.createElement("button");
    button.className = "history-button";
    button.type = "button";
    button.dataset.runId = run.id;
    button.setAttribute(
      "aria-label",
      `${run.requestId ?? run.kind ?? "Lokal çalışma"} sonucunu aç`,
    );
    const pill = document.createElement("span");
    pill.className = "status-pill";
    pill.dataset.status = run.status;
    pill.textContent = STATUS_COPY[run.status] ?? run.status;
    const copy = document.createElement("span");
    const title = document.createElement("strong");
    title.textContent = run.requestId ?? run.kind ?? "Lokal çalışma";
    const date = document.createElement("small");
    date.textContent = new Date(run.completedAt ?? run.startedAt).toLocaleString("tr-TR");
    copy.append(title, date);
    button.append(pill, copy);
    item.append(button);
    fragment.append(item);
  }
  elements.historyList.replaceChildren(fragment);
}

function syncLogFilters() {
  const selected = elements.logFilter.value;
  const profiles = [...new Set(state.logs.map((entry) => entry.profileId).filter(Boolean))];
  const options = [new Option("Tümü", "all"), ...profiles.map((id) => new Option(id, id))];
  elements.logFilter.replaceChildren(...options);
  elements.logFilter.value = profiles.includes(selected) ? selected : "all";
}

function renderLogs() {
  syncLogFilters();
  const filter = elements.logFilter.value;
  const visible = state.logs
    .filter((entry) => filter === "all" || entry.profileId === filter)
    .slice(-1_000);
  if (visible.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Seçili profil için çıktı yok.";
    elements.logOutput.replaceChildren(empty);
    return;
  }
  const fragment = document.createDocumentFragment();
  for (const entry of visible) {
    const line = document.createElement("div");
    line.className = "log-line";
    const profile = document.createElement("span");
    profile.className = "log-profile";
    profile.textContent = entry.profileId ?? "sistem";
    const text = document.createElement("span");
    text.textContent = entry.line;
    line.append(profile, text);
    fragment.append(line);
  }
  elements.logOutput.replaceChildren(fragment);
  if (elements.followLog.checked) {
    elements.logOutput.scrollTop = elements.logOutput.scrollHeight;
  }
}

async function refreshRun(runId) {
  const body = await api(`/api/runs/${runId}`);
  state.currentRun = body.run;
  state.currentRunReplayable = body.replayable !== false;
  renderRun();
  if (state.currentRun.status !== "RUNNING") {
    state.eventSource?.close();
    const bootstrap = await api("/api/bootstrap");
    state.bootstrap.recentRuns = bootstrap.recentRuns;
    renderHistory();
  }
}

function scheduleRunRefresh(runId) {
  clearTimeout(state.refreshTimer);
  state.refreshTimer = setTimeout(() => {
    refreshRun(runId).catch((error) => announce(errorMessage(error)));
  }, 25);
}

function subscribeToRun(runId) {
  state.eventSource?.close();
  const source = new EventSource(`/api/runs/${runId}/events`);
  state.eventSource = source;
  source.addEventListener("quality", (message) => {
    const event = JSON.parse(message.data);
    if (event.type === "log") {
      state.logs.push({ profileId: event.profileId, line: event.line });
      if (state.logs.length > 5_000) state.logs.splice(0, state.logs.length - 5_000);
      renderLogs();
    }
    if (
      event.source === "runner" &&
      ["precondition.completed", "step.started", "step.completed"].includes(event.type)
    ) {
      const details = [event.type, event.stepId, event.status];
      if (event.command) details.push(`Komut: ${event.command}`);
      if (event.nextAction) details.push(`Sonraki: ${event.nextAction}`);
      state.logs.push({ profileId: event.profileId, line: details.filter(Boolean).join(" · ") });
      if (state.logs.length > 5_000) state.logs.splice(0, state.logs.length - 5_000);
      renderLogs();
    }
    if (event.type === "profile.started" || event.type === "profile.completed") {
      scheduleRunRefresh(runId);
    }
    if (event.type === "run.completed") {
      announce(`Çalışma tamamlandı: ${STATUS_COPY[event.status] ?? event.status}.`);
      scheduleRunRefresh(runId);
    }
  });
  source.addEventListener("error", () => {
    if (state.currentRun?.status === "RUNNING") {
      announce("Canlı bağlantı yeniden kuruluyor.");
    }
  });
}

async function startRun(request) {
  const response = await api("/api/runs", {
    method: "POST",
    body: JSON.stringify(request),
  });
  state.logs = [];
  state.currentRunReplayable = true;
  state.currentRun = {
    id: response.runId,
    status: "RUNNING",
    profiles: [],
    summary: {},
  };
  renderLogs();
  renderRun();
  subscribeToRun(response.runId);
  await refreshRun(response.runId);
  announce("Lokal kalite çalışması başladı.");
}

function closeAcceptanceDialog() {
  elements.acceptanceDialog.close();
  elements.acceptanceError.textContent = "";
  elements.acceptanceInput.value = "";
  state.pendingAcceptance = null;
}

function openAcceptanceDialog(kind, request) {
  state.pendingAcceptance = { kind, request };
  elements.acceptanceError.textContent = "";
  elements.acceptanceInput.value = "";
  if (kind === "fullAcceptance") {
    const target = state.bootstrap.acceptanceTarget;
    elements.acceptanceTitle.textContent = "Tam Kabul Testleri";
    elements.acceptanceWarning.textContent = "Lokal E2E verisi sıfırlanacak.";
    elements.acceptanceImpact.textContent =
      "Doğrulanan loopback E2E veritabanı sıfırlanır. Playwright çalışır. Tam suite seçildiyse Android release APK ayrıca derlenir.";
    elements.acceptanceTarget.textContent = target.ready ? target.display : target.nextAction;
    elements.acceptanceLabel.textContent = "Devam etmek için veritabanı adını yaz";
    elements.acceptanceInput.placeholder = target.databaseName ?? "wizards_e2e";
  } else {
    elements.acceptanceTitle.textContent = "Android Release APK";
    elements.acceptanceWarning.textContent = "Managed Android build alanı değişebilir.";
    elements.acceptanceImpact.textContent =
      "APK yalnız derlenir; cihaza kurulmaz, Metro başlatılmaz, release yayımlanmaz.";
    elements.acceptanceTarget.textContent = "Android UAT managed build root";
    elements.acceptanceLabel.textContent = "Devam etmek için MOBILE RELEASE yaz";
    elements.acceptanceInput.placeholder = "MOBILE RELEASE";
  }
  elements.acceptanceDialog.showModal();
  elements.acceptanceInput.focus();
}

async function submitAcceptance() {
  const pending = state.pendingAcceptance;
  if (!pending) return;
  const confirmation = elements.acceptanceInput.value.trim();
  const body =
    pending.kind === "fullAcceptance"
      ? { kind: "fullAcceptance", databaseName: confirmation }
      : { kind: "mobileRelease", confirmation };
  const approval = await api("/api/acceptance/confirm", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const request = { ...pending.request, capability: approval.capability };
  closeAcceptanceDialog();
  await startRun(request);
}

function applyTheme(value) {
  const systemDark = matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = value === "dark" || (value === "system" && systemDark);
  document.documentElement.classList.toggle("theme-dark", dark);
  document.documentElement.classList.toggle("theme-light", !dark);
  elements.themeSelect.value = value;
  localStorage.setItem("whispr-quality-theme", value);
}

async function initialize() {
  const preferredTheme = localStorage.getItem("whispr-quality-theme") ?? "system";
  applyTheme(["system", "dark", "light"].includes(preferredTheme) ? preferredTheme : "system");
  state.bootstrap = await api("/api/bootstrap");
  elements.readinessBadge.dataset.state = state.bootstrap.acceptanceTarget.ready
    ? "ready"
    : "blocked";
  elements.readinessBadge.textContent = state.bootstrap.acceptanceTarget.ready
    ? "Bağımlılıklar hazır"
    : "E2E yapılandırması eksik";
  state.currentRun = state.bootstrap.activeRun;
  state.currentRunReplayable = true;
  renderHistory();
  renderRun();
  if (state.currentRun?.status === "RUNNING") {
    subscribeToRun(state.currentRun.id);
  }
}

function selectIssueFilter(status, { focus = false } = {}) {
  state.issueFilter = status;
  renderIssues();
  if (focus) {
    const target = status === "FAIL" ? elements.issueFilterFail : elements.issueFilterBlocked;
    target.focus();
  }
}

async function openHistoryRun(runId) {
  state.eventSource?.close();
  state.logs = [];
  renderLogs();
  const body = await api(`/api/runs/${encodeURIComponent(runId)}`);
  state.currentRun = body.run;
  state.currentRunReplayable = body.replayable !== false;
  renderRun();
  elements.issuesPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  announce("Geçmiş çalışma sonucu açıldı.");
}

elements.runSafe.addEventListener("click", () => {
  startRun({ kind: "suite", id: "safeAll" }).catch((error) => announce(errorMessage(error)));
});
elements.runAcceptance.addEventListener("click", () => {
  openAcceptanceDialog("fullAcceptance", { kind: "suite", id: "fullAcceptance" });
});
elements.rerunFailed.addEventListener("click", () => {
  if (!state.currentRun) return;
  startRun({ kind: "failedOnly", sourceRunId: state.currentRun.id }).catch((error) =>
    announce(errorMessage(error)),
  );
});
elements.cancelRun.addEventListener("click", () => {
  if (!state.currentRun) return;
  api(`/api/runs/${state.currentRun.id}/cancel`, { method: "POST", body: "{}" })
    .then(() => announce("Durdurma istendi."))
    .catch((error) => announce(errorMessage(error)));
});
elements.profileGrid.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-profile-id]");
  if (!button) return;
  const profileId = button.dataset.profileId;
  if (profileId === "E2EFull") {
    openAcceptanceDialog("fullAcceptance", { kind: "profile", id: profileId });
  } else if (profileId === "MobileRelease") {
    openAcceptanceDialog("mobileRelease", { kind: "profile", id: profileId });
  } else {
    startRun({ kind: "profile", id: profileId }).catch((error) => announce(errorMessage(error)));
  }
});
elements.acceptanceForm.addEventListener("submit", (event) => {
  event.preventDefault();
  submitAcceptance().catch((error) => {
    elements.acceptanceError.textContent = errorMessage(error);
  });
});
elements.closeDialog.addEventListener("click", closeAcceptanceDialog);
elements.cancelDialog.addEventListener("click", closeAcceptanceDialog);
elements.acceptanceDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeAcceptanceDialog();
});
elements.logFilter.addEventListener("change", renderLogs);
elements.followLog.addEventListener("change", renderLogs);
elements.copyLog.addEventListener("click", () => {
  const filter = elements.logFilter.value;
  const output = state.logs
    .filter((entry) => filter === "all" || entry.profileId === filter)
    .map((entry) => `[${entry.profileId ?? "sistem"}] ${entry.line}`)
    .join("\n");
  navigator.clipboard
    .writeText(output)
    .then(() => announce("Günlük panoya kopyalandı."))
    .catch(() => announce("Günlük panoya kopyalanamadı."));
});
elements.themeSelect.addEventListener("change", () => applyTheme(elements.themeSelect.value));
for (const tab of [elements.issueFilterFail, elements.issueFilterBlocked]) {
  tab.addEventListener("click", () => selectIssueFilter(tab.dataset.issueStatus));
  tab.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    selectIssueFilter(tab.dataset.issueStatus === "FAIL" ? "BLOCKED" : "FAIL", { focus: true });
  });
}
elements.issueList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-copy-value]");
  if (!button) return;
  navigator.clipboard
    .writeText(button.dataset.copyValue)
    .then(() => announce("Kaynak bilgisi panoya kopyalandı."))
    .catch(() => announce("Kaynak bilgisi panoya kopyalanamadı."));
});
elements.historyList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-run-id]");
  if (!button) return;
  openHistoryRun(button.dataset.runId).catch((error) => announce(errorMessage(error)));
});

initialize().catch((error) => {
  elements.readinessBadge.dataset.state = "blocked";
  elements.readinessBadge.textContent = "Başlatma hatası";
  announce(errorMessage(error));
});
