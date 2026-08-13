export type MobileAccountExportState =
  | { startedAt: string; status: "downloading" }
  | { startedAt: string; status: "interrupted" }
  | { fileUri: string; startedAt: string; status: "ready" }
  | { startedAt: string; status: "error" };

export interface MobileAccountExportStorage {
  getItem(key: string): Promise<string | null>;
  removeItem?(key: string): Promise<void>;
  setItem(key: string, value: string): Promise<void>;
}

function key(userId: string) {
  return `whispr:account-export:${userId}`;
}

function parse(value: string | null): MobileAccountExportState | null {
  if (!value || value.length > 2048) return null;
  try {
    const item = JSON.parse(value) as Partial<MobileAccountExportState>;
    if (typeof item.startedAt !== "string" || Number.isNaN(Date.parse(item.startedAt))) return null;
    if (item.status === "downloading" || item.status === "interrupted" || item.status === "error") {
      return { startedAt: item.startedAt, status: item.status };
    }
    if (
      item.status === "ready" &&
      typeof item.fileUri === "string" &&
      item.fileUri.startsWith("file://")
    ) {
      return { fileUri: item.fileUri, startedAt: item.startedAt, status: "ready" };
    }
  } catch {
    // Corrupt or legacy state is ignored; no account data lives in this marker.
  }
  return null;
}

export async function writeMobileAccountExportState(
  storage: MobileAccountExportStorage,
  userId: string,
  state: MobileAccountExportState,
) {
  await storage.setItem(key(userId), JSON.stringify(state));
}

export async function clearMobileAccountExportState(
  storage: MobileAccountExportStorage,
  userId: string,
) {
  if (!storage.removeItem) return;
  await storage.removeItem(key(userId));
}

export async function readMobileAccountExportState(
  storage: MobileAccountExportStorage,
  userId: string,
) {
  const state = parse(await storage.getItem(key(userId)));
  if (state?.status !== "downloading") return state;
  const interrupted = { startedAt: state.startedAt, status: "interrupted" as const };
  await writeMobileAccountExportState(storage, userId, interrupted);
  return interrupted;
}
