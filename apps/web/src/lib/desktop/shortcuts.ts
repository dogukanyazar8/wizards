"use client";

import { DesktopShortcutSchema, type DesktopShortcut } from "@wizards/types";
import { formatShortcutParts } from "@wizards/ui/platform-keyboard.mjs";

import { isWhisprDesktopRuntime } from "@/lib/desktop/runtime";
import { isApplicationShortcutAccelerator } from "@/lib/shortcuts/reserved";

/** Sözleşmenin kendi eylem birleşimi; `@wizards/types` yalnız satırın tamamını adlandırıyor. */
export type DesktopShortcutAction = DesktopShortcut["action"];

/**
 * Masaüstü kısayol sözleşmesi — Ayarlar paketi Dalga 3 / Ş10, K7.
 *
 * Beş eylem, tek yerde. Ekran hangi kombinasyonun kayıtlı olduğunu **tahmin etmez**: kayıt
 * denemesini Rust yapar ve sonucunu satır satır geri verir. Bir kombinasyonun "boşta" olup
 * olmadığını yalnız işletim sistemi bilir; istemcide tutulan bir "alınmış kısayollar" tablosu
 * ilk üçüncü parti uygulamada yalan söylerdi.
 *
 * ## Üç ayrı ad alanı
 *
 * 1. **Sözleşme eylemi** (`@wizards/types` `DesktopShortcutSchema`): `hideOverlay`,
 *    `moderationConsole`.
 * 2. **Kabuk etiketi** (Rust `DesktopShortcutAction::label`): `hideGameOverlay`,
 *    `toggleAdminConsole`. Eski web sürümü bu etiketleri okuyor, o yüzden kıpırdamaz.
 * 3. **Hızlandırıcı** (`Alt+Shift+K`): Rust'ın ayrıştırdığı metin. Ekran bunu platformun
 *    klavye diliyle çizer; Windows'ta `Alt`, macOS'ta `⌥` gösterir.
 *
 * Çeviri **burada** yapılır. Üç adın üçünü de bilen ikinci bir dosya, üçünden birini
 * değiştirdiğinde sessizce eskiyecek bir dosyadır.
 */

/** SPEC §5.5 — satır sırası tasarımın sırasıdır. */
export const DESKTOP_SHORTCUT_ACTIONS = [
  "toggleMute",
  "toggleDeafen",
  "pushToTalk",
  "hideOverlay",
  "moderationConsole",
] as const satisfies readonly DesktopShortcutAction[];

export type DesktopShortcutAssignments = Readonly<Record<DesktopShortcutAction, string>>;

/**
 * Cihaz ilk açıldığında gösterilen geçerli, kapalı varsayılanlar. `Alt+Space` bütün desteklenen
 * kabuklarda rezerve; bas-konuş mevcut voice-store sözleşmesiyle aynı `Alt+V` değerini kullanır.
 */
export const DEFAULT_DESKTOP_SHORTCUT_ASSIGNMENTS: DesktopShortcutAssignments = {
  hideOverlay: "Alt+H",
  moderationConsole: "Alt+Shift+K",
  pushToTalk: "Alt+V",
  toggleDeafen: "Alt+D",
  toggleMute: "Alt+M",
};

/** Sözleşme eylemi → kabuk etiketi. */
const BRIDGE_LABEL_BY_ACTION: Readonly<Record<DesktopShortcutAction, string>> = {
  hideOverlay: "hideGameOverlay",
  moderationConsole: "toggleAdminConsole",
  pushToTalk: "pushToTalk",
  toggleDeafen: "toggleDeafen",
  toggleMute: "toggleMute",
};

/** Kabuk yapılandırmasının alan adları (`DesktopShortcutConfig`, camelCase serde). */
const BRIDGE_CONFIG_FIELD_BY_ACTION: Readonly<Record<DesktopShortcutAction, string>> = {
  hideOverlay: "hideGameOverlay",
  moderationConsole: "toggleAdminConsole",
  pushToTalk: "pushToTalk",
  toggleDeafen: "toggleDeafen",
  toggleMute: "toggleMute",
};

/**
 * Değiştirici adlarının glifleri. Anahtarlar küçük harfe indirgenmiş hâlleriyle aranır, çünkü
 * `CmdOrCtrl`, `cmdorctrl` ve `CommandOrControl` aynı şeyi söyler.
 */
const MODIFIER_ALIASES: Readonly<Record<string, "alt" | "control" | "meta" | "shift">> = {
  alt: "alt",
  cmd: "meta",
  cmdorctrl: "control",
  command: "meta",
  commandorcontrol: "control",
  control: "control",
  ctrl: "control",
  meta: "meta",
  option: "alt",
  shift: "shift",
  super: "meta",
};

/** Rust `MAX_DESKTOP_SHORTCUT_LENGTH` ile aynı sınır. */
const MAX_ACCELERATOR_LENGTH = 64;

/**
 * Rust `is_reserved_desktop_shortcut` ile **aynı** liste.
 *
 * TODO(Ş13): `store/voice-store.ts` üçüncü bir kopya taşıyor (`isReservedDesktopVoiceShortcut`).
 * Üç liste tek kaynağa indirilmeli; bu şeritte store dosyası sahiplenilmiş değil.
 */
const RESERVED_ACCELERATORS: ReadonlySet<string> = new Set([
  "alt+escape",
  "alt+f4",
  "alt+space",
  "alt+tab",
  "cmdorctrl+space",
  "control+space",
  "ctrl+alt+delete",
  "ctrl+space",
  "meta+space",
  "super+space",
]);

const MODIFIER_KEYS: ReadonlySet<string> = new Set(["Alt", "Control", "Meta", "Shift"]);

/** Rust `is_dedicated_function_key` — değiştiricisiz kabul edilen tek tuş ailesi. */
const DEDICATED_FUNCTION_KEYS: ReadonlySet<string> = new Set([
  "F13",
  "F14",
  "F15",
  "F16",
  "F17",
  "F18",
  "F19",
  "F20",
  "F21",
  "F22",
  "F23",
  "F24",
]);

function normalizeAccelerator(value: string): string {
  return value.replace(/\s+/gu, "").toLowerCase();
}

export function isReservedDesktopShortcut(value: string): boolean {
  const normalized = normalizeAccelerator(value);

  return (
    RESERVED_ACCELERATORS.has(normalized) ||
    normalized.endsWith("+space") ||
    isApplicationShortcutAccelerator(normalized)
  );
}

/**
 * Kabuğun kabul edeceği bir hızlandırıcı mı?
 *
 * Kabuk yine de kendi kontrolünü yapar — bu kopya kullanıcıya **kaydetmeden önce** cevap
 * verebilmek için var, kabuğun kontrolünün yerine geçmek için değil.
 */
export function isValidDesktopShortcut(value: string): boolean {
  const trimmed = value.trim();

  if (
    trimmed.length === 0 ||
    trimmed.length > MAX_ACCELERATOR_LENGTH ||
    /[\0\r\n]/u.test(trimmed) ||
    isReservedDesktopShortcut(trimmed)
  ) {
    return false;
  }

  const parts = trimmed.split("+").map((part) => part.trim());

  if (parts.some((part) => part.length === 0)) {
    return false;
  }

  const key = parts[parts.length - 1] ?? "";

  if (parts.length === 1) {
    return DEDICATED_FUNCTION_KEYS.has(key);
  }

  return parts.slice(0, -1).every((part) => part.toLowerCase() in MODIFIER_ALIASES);
}

/**
 * `Alt+Shift+K` → `["⌥", "⇧", "K"]`.
 *
 * Tanınmayan bir parça **olduğu gibi** kalır: uydurma bir glif, kullanıcının bastığı tuşu
 * gizlemek olurdu.
 */
export function toDesktopShortcutCapsules(
  accelerator: string,
  platform: string | null = null,
): string[] {
  return formatShortcutParts(accelerator, platform);
}

/**
 * Tuş yakalama — `Esc` iptaldir, tek başına bir değiştirici henüz bir kombinasyon değildir.
 *
 * `event.key` yerine `event.code` okunur: `⌥M` macOS'ta `µ` üretir ve `key` ile yakalanan
 * kısayol kullanıcının bastığı tuş değil, klavye düzeninin ürettiği karakter olurdu.
 */
export type DesktopShortcutCaptureResult =
  | { readonly kind: "cancel" }
  | { readonly kind: "pending" }
  | { readonly accelerator: string; readonly kind: "captured" };

export function captureDesktopShortcut(event: {
  readonly altKey: boolean;
  readonly code: string;
  readonly ctrlKey: boolean;
  readonly key: string;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
}): DesktopShortcutCaptureResult {
  if (event.key === "Escape") {
    return { kind: "cancel" };
  }

  if (MODIFIER_KEYS.has(event.key)) {
    return { kind: "pending" };
  }

  const key = toAcceleratorKey(event.code, event.key);

  if (!key) {
    return { kind: "pending" };
  }

  const parts: string[] = [];

  if (event.ctrlKey) parts.push("Control");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  if (event.metaKey) parts.push("Meta");

  parts.push(key);

  return { accelerator: parts.join("+"), kind: "captured" };
}

function toAcceleratorKey(code: string, key: string): string | null {
  if (/^Key[A-Z]$/u.test(code)) {
    return code.slice(3);
  }

  if (/^Digit[0-9]$/u.test(code)) {
    return code.slice(5);
  }

  if (/^F([1-9]|1[0-9]|2[0-4])$/u.test(code)) {
    return code;
  }

  if (code === "Space") {
    return "Space";
  }

  if (key.length === 1) {
    return key.toUpperCase();
  }

  return null;
}

/** Kabuğun `get_desktop_shortcut_status` satırı. */
export type DesktopShortcutBridgeEntry = {
  readonly action: string;
  readonly conflict: boolean;
  readonly keys: readonly string[];
  readonly reason?: "duplicate" | "invalid" | "osRefused" | "reserved" | null;
  readonly registered: boolean;
};

export type DesktopShortcutNativeStatus = {
  readonly enabled: boolean;
  readonly entries: readonly DesktopShortcutBridgeEntry[];
};

/**
 * Atamalar + kabuk cevabı → beş satır.
 *
 * Kabuk cevabı yoksa (web, ya da köprü sustuysa) hiçbir satır çakışmalı **değildir**: çakışma
 * bir kayıt denemesinin sonucudur ve deneme yapılmadıysa iddia edilemez. Anahtar kapalıyken de
 * aynısı geçerli — kayıt yok, çakışma da yok.
 */
export function mergeDesktopShortcutStatus(
  assignments: DesktopShortcutAssignments,
  bridgeEntries: readonly DesktopShortcutBridgeEntry[] | null,
  enabled: boolean,
  platform: string | null = null,
): DesktopShortcut[] {
  const byLabel = new Map<string, DesktopShortcutBridgeEntry>();

  for (const entry of bridgeEntries ?? []) {
    byLabel.set(entry.action, entry);
  }

  return DESKTOP_SHORTCUT_ACTIONS.map((action) => {
    const bridge = byLabel.get(BRIDGE_LABEL_BY_ACTION[action]);
    const accelerator = bridge
      ? bridge.keys.join("+")
      : (assignments[action] ?? DEFAULT_DESKTOP_SHORTCUT_ASSIGNMENTS[action]);

    return {
      action,
      conflict: enabled && bridgeEntries !== null ? (bridge?.conflict ?? false) : false,
      keys: toDesktopShortcutCapsules(accelerator, platform),
    } satisfies DesktopShortcut;
  });
}

export function countDesktopShortcutConflicts(shortcuts: readonly DesktopShortcut[]): number {
  return shortcuts.filter((shortcut) => shortcut.conflict).length;
}

/**
 * Sunucudan gelen JSON kolonu → atamalar (SPEC_DEVIATIONS #11).
 *
 * Kolon serbest biçimli JSON, o yüzden okuma **sorgulamaz, doğrular**: tanınmayan anahtar
 * atılır, geçersiz kombinasyon varsayılana döner. Doğrulanmamış bir dize doğrudan kabuğa
 * gitseydi, kayıt hatası bir çakışma gibi görünürdü.
 */
export function sanitizeDesktopShortcutAssignments(value: unknown): DesktopShortcutAssignments {
  const source =
    typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  const assignments: Record<string, string> = {};

  for (const action of DESKTOP_SHORTCUT_ACTIONS) {
    const raw = source[action];
    const candidate = typeof raw === "string" ? raw.trim() : "";

    assignments[action] = isValidDesktopShortcut(candidate)
      ? candidate
      : DEFAULT_DESKTOP_SHORTCUT_ASSIGNMENTS[action];
  }

  return assignments as DesktopShortcutAssignments;
}

/** Sözleşme satırları → kolonda saklanan atamalar. */
export function toDesktopShortcutAssignments(
  shortcuts: readonly DesktopShortcut[],
  fallback: DesktopShortcutAssignments = DEFAULT_DESKTOP_SHORTCUT_ASSIGNMENTS,
): DesktopShortcutAssignments {
  const assignments: Record<string, string> = { ...fallback };

  for (const shortcut of shortcuts) {
    const parsed = DesktopShortcutSchema.safeParse(shortcut);

    if (!parsed.success) {
      continue;
    }

    assignments[parsed.data.action] = fromDesktopShortcutCapsules(parsed.data.keys);
  }

  return sanitizeDesktopShortcutAssignments(assignments);
}

const ACCELERATOR_BY_GLYPH: ReadonlyMap<string, string> = new Map([
  ["⌃", "Control"],
  ["⌘", "Meta"],
  ["⌥", "Alt"],
  ["⇧", "Shift"],
  ["Ctrl", "Control"],
  ["Super", "Meta"],
  ["Win", "Meta"],
]);

export function fromDesktopShortcutCapsules(keys: readonly string[]): string {
  return keys
    .map((key) => ACCELERATOR_BY_GLYPH.get(key) ?? key)
    .filter((key) => key.length > 0)
    .join("+");
}

/** Native device assignments preserve explicitly unassigned shortcuts. */
export function nativeDesktopShortcutAssignments(
  status: DesktopShortcutNativeStatus,
): DesktopShortcutAssignments {
  return Object.fromEntries(
    DESKTOP_SHORTCUT_ACTIONS.map((action) => [
      action,
      status.entries
        .find((entry) => entry.action === BRIDGE_LABEL_BY_ACTION[action])
        ?.keys.join("+") ?? DEFAULT_DESKTOP_SHORTCUT_ASSIGNMENTS[action],
    ]),
  ) as DesktopShortcutAssignments;
}

export function desktopShortcutDraftError(
  assignments: DesktopShortcutAssignments,
  platform: string,
): "invalid" | "duplicate" | null {
  const seen = new Set<string>();
  for (const value of Object.values(assignments)) {
    if (!value) continue;
    if (!isValidDesktopShortcut(value)) return "invalid";
    const normalized = toDesktopShortcutCapsules(value, platform)
      .map((key) => key.toLowerCase())
      .sort()
      .join("+");
    if (seen.has(normalized)) return "duplicate";
    seen.add(normalized);
  }
  return null;
}

export function toDesktopShortcutConfig(assignments: DesktopShortcutAssignments, enabled: boolean) {
  const config: Record<string, unknown> = { shortcutsEnabled: enabled };

  for (const action of DESKTOP_SHORTCUT_ACTIONS) {
    config[BRIDGE_CONFIG_FIELD_BY_ACTION[action]] = assignments[action];
  }

  return config;
}

async function invokeDesktopShortcutCommand<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T | null> {
  if (!isWhisprDesktopRuntime()) {
    return null;
  }

  try {
    const { invoke } = await import("@tauri-apps/api/core");

    return await invoke<T>(command, args);
  } catch {
    // Köprü susarsa ekran "doğrulanamadı" durumunda kalır; uydurma bir başarı yazılmaz.
    return null;
  }
}

/** K7 — çakışma durumu **saklanmaz**, her açılışta gerçek kayıttan okunur. */
export async function readDesktopShortcutStatus(): Promise<DesktopShortcutNativeStatus | null> {
  const status = await invokeDesktopShortcutCommand<{
    readonly enabled: boolean;
    readonly entries?: readonly DesktopShortcutBridgeEntry[];
    readonly registered?: readonly { action: string; shortcut: string }[];
  }>("get_desktop_voice_shortcut_status");

  if (!status) {
    return null;
  }

  return {
    enabled: status.enabled,
    entries:
      status.entries ??
      (status.registered ?? []).map((entry) => ({
        action: entry.action,
        conflict: false,
        keys: entry.shortcut.split("+").filter(Boolean),
        reason: null,
        registered: true,
      })),
  };
}

export function writeDesktopShortcutStatus(
  assignments: DesktopShortcutAssignments,
  enabled: boolean,
): Promise<DesktopShortcutBridgeEntry[] | null> {
  return invokeDesktopShortcutCommand<DesktopShortcutBridgeEntry[]>("configure_desktop_shortcuts", {
    config: toDesktopShortcutConfig(assignments, enabled),
  });
}

/**
 * Sunucudaki atamalar — `SPEC_DEVIATIONS` #11'in ucu.
 *
 * Cihaz başına değil hesaba bağlı: kullanıcı ikinci makinesinde aynı kombinasyonları bulur.
 * Çakışma bu yoldan **hiç geçmez**; o her makinede ayrı ve her açılışta yeniden ölçülür.
 */
export const DESKTOP_SHORTCUTS_ENDPOINT = "/api/v1/users/me/desktop-shortcuts";

export async function fetchDesktopShortcutAssignments(): Promise<DesktopShortcutAssignments> {
  const response = await fetch(DESKTOP_SHORTCUTS_ENDPOINT);

  if (!response.ok) {
    throw new Error(`Desktop shortcut assignments could not be read: ${response.status}`);
  }

  const payload = (await response.json()) as { shortcuts?: unknown };

  return sanitizeDesktopShortcutAssignments(payload.shortcuts);
}

export async function saveDesktopShortcutAssignments(
  assignments: DesktopShortcutAssignments,
): Promise<DesktopShortcutAssignments> {
  const response = await fetch(DESKTOP_SHORTCUTS_ENDPOINT, {
    body: JSON.stringify({ shortcuts: assignments }),
    headers: { "content-type": "application/json" },
    method: "PATCH",
  });

  if (!response.ok) {
    throw new Error(`Desktop shortcut assignments could not be saved: ${response.status}`);
  }

  const payload = (await response.json()) as { shortcuts?: unknown };

  return sanitizeDesktopShortcutAssignments(payload.shortcuts);
}
