export function normalizeWorkspaceLabel(value: string, maxLength = 48) {
  const normalized = value
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\p{M} _-]/gu, "");

  if (!/[\p{L}\p{N}]/u.test(normalized)) {
    return "";
  }

  return Array.from(normalized).slice(0, maxLength).join("").trim();
}
