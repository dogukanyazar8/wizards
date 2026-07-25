import { readFile } from "node:fs/promises";
import path from "node:path";

import type { MobileLegalDocumentBlock, MobileLegalDocumentId } from "@wizards/types";

export const LEGAL_DOCUMENTS = {
  cookies: {
    badge: "Çerez ve tercih yönetimi",
    description: "Whispr’in oturum, güvenlik, tercih ve performans amaçlı kullandığı teknolojiler.",
    fileName: "cookies.txt",
    title: "Çerez Politikası",
  },
  privacy: {
    badge: "Kişisel veri güvenliği",
    description:
      "Whispr’de kişisel verilerin nasıl işlendiğini, saklandığını ve korunduğunu açıklar.",
    fileName: "privacy.txt",
    title: "Gizlilik Politikası",
  },
  terms: {
    badge: "Hizmet kullanım koşulları",
    description: "Whispr’i kullanırken geçerli olan hesap, hizmet ve topluluk kurallarını açıklar.",
    fileName: "terms.txt",
    title: "Kullanım Şartları",
  },
} as const satisfies Record<
  MobileLegalDocumentId,
  { badge: string; description: string; fileName: string; title: string }
>;

export type LegalDocumentId = keyof typeof LEGAL_DOCUMENTS;

export function isLegalDocumentId(value: string): value is LegalDocumentId {
  return Object.prototype.hasOwnProperty.call(LEGAL_DOCUMENTS, value);
}

export function readLegalDocumentText(documentId: LegalDocumentId): Promise<string> {
  return readFile(
    path.join(process.cwd(), "public", "legal", LEGAL_DOCUMENTS[documentId].fileName),
    "utf8",
  );
}

/**
 * The documents are plain text with a light convention: `1.` starts a section,
 * `1.1.` a subsection, `- ` a bullet, and a handful of `Label:` lines carry the
 * document metadata. Classifying a line is shared so the web page and the mobile
 * renderer can never drift into two different readings of the same file.
 */
export function getLegalLineKind(line: string): MobileLegalDocumentBlock["kind"] | "spacer" {
  const trimmed = line.trim();

  if (!trimmed) {
    return "spacer";
  }

  if (/^\d+\.\d+\./.test(trimmed)) {
    return "subheading";
  }

  if (/^\d+\./.test(trimmed)) {
    return "heading";
  }

  if (trimmed.startsWith("- ")) {
    return "bullet";
  }

  if (/^(Son Güncelleme Tarihi|Proje \/ Hizmet|Planlanan Ticari Unvan|İletişim):/.test(trimmed)) {
    return "meta";
  }

  return "paragraph";
}

export function getLegalDocumentLastUpdated(lines: readonly string[]): string | null {
  return (
    lines
      .find((line) => line.startsWith("Son Güncelleme Tarihi:"))
      ?.split(":")[1]
      ?.trim() ?? null
  );
}

/**
 * Blocks for a structured client. Spacers are dropped — a renderer that owns its
 * own spacing does not want blank paragraphs — and the first line is skipped
 * because it repeats the document title the client already shows.
 */
export function toLegalDocumentBlocks(documentText: string): MobileLegalDocumentBlock[] {
  return documentText
    .split(/\r?\n/)
    .slice(1)
    .map((line) => ({ kind: getLegalLineKind(line), text: line.trim() }))
    .filter(
      (block): block is MobileLegalDocumentBlock =>
        block.kind !== "spacer" && block.text.length > 0,
    )
    .map((block) => (block.kind === "bullet" ? { ...block, text: block.text.slice(2) } : block));
}
