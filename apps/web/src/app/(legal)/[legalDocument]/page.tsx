import { readFile } from "node:fs/promises";
import path from "node:path";
import { ArrowLeft, CalendarDays, FileText, Mail, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

const LEGAL_DOCUMENTS = {
  cookies: {
    badge: "Çerez ve tercih yönetimi",
    description:
      "Whispr’in oturum, güvenlik, tercih ve performans amaçlı kullandığı teknolojiler.",
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
    description:
      "Whispr’i kullanırken geçerli olan hesap, hizmet ve topluluk kurallarını açıklar.",
    fileName: "terms.txt",
    title: "Kullanım Şartları",
  },
} as const;

type LegalDocumentId = keyof typeof LEGAL_DOCUMENTS;

type LegalDocumentPageProps = {
  params: Promise<{
    legalDocument: string;
  }>;
};

function isLegalDocumentId(value: string): value is LegalDocumentId {
  return Object.prototype.hasOwnProperty.call(LEGAL_DOCUMENTS, value);
}

async function readLegalDocument(documentId: LegalDocumentId) {
  const documentPath = path.join(
    process.cwd(),
    "public",
    "legal",
    LEGAL_DOCUMENTS[documentId].fileName,
  );

  return readFile(documentPath, "utf8");
}

function getLineKind(line: string) {
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

function renderLegalLine(line: string, index: number) {
  const trimmed = line.trim();
  const kind = getLineKind(line);

  if (kind === "spacer") {
    return <div className="legal-reference-spacer" key={`line-${index}`} aria-hidden="true" />;
  }

  if (kind === "heading") {
    return <h2 key={`line-${index}`}>{trimmed}</h2>;
  }

  if (kind === "subheading") {
    return <h3 key={`line-${index}`}>{trimmed}</h3>;
  }

  if (kind === "bullet") {
    return (
      <p className="legal-reference-bullet" key={`line-${index}`}>
        <span aria-hidden="true" />
        {trimmed.slice(2)}
      </p>
    );
  }

  if (kind === "meta") {
    return (
      <p className="legal-reference-meta-line" key={`line-${index}`}>
        {trimmed}
      </p>
    );
  }

  return <p key={`line-${index}`}>{trimmed}</p>;
}

export function generateStaticParams() {
  return Object.keys(LEGAL_DOCUMENTS).map((legalDocument) => ({ legalDocument }));
}

export async function generateMetadata({ params }: LegalDocumentPageProps) {
  const { legalDocument } = await params;

  if (!isLegalDocumentId(legalDocument)) {
    return {
      title: "Whispr Legal",
    };
  }

  return {
    title: `${LEGAL_DOCUMENTS[legalDocument].title} | Whispr`,
  };
}

export default async function LegalDocumentPage({ params }: LegalDocumentPageProps) {
  const { legalDocument } = await params;

  if (!isLegalDocumentId(legalDocument)) {
    notFound();
  }

  const documentConfig = LEGAL_DOCUMENTS[legalDocument];
  const documentText = await readLegalDocument(legalDocument);
  const documentLines = documentText.split(/\r?\n/);
  const contentLines = documentLines.slice(1);
  const lastUpdated =
    documentLines.find((line) => line.startsWith("Son Güncelleme Tarihi:"))?.split(":")[1]?.trim() ??
    "08.05.2026";

  return (
    <main className="legal-reference-page">
      <div className="legal-reference-shell">
        <header className="legal-reference-topbar">
          <Link className="whispr-brand-logo" href="/login">
            <span aria-hidden="true" className="whispr-logo-icon whispr-logo-icon-animated">
              {[17, 25, 34, 24, 18].map((height, index) => (
                <span
                  className="whispr-logo-bar"
                  key={`${height}-${index}`}
                  style={{ animationDelay: `${index * 0.13}s`, height }}
                />
              ))}
            </span>
            <span className="whispr-logo-wordmark">Whispr</span>
          </Link>

          <nav className="legal-reference-nav" aria-label="Yasal belgeler">
            <Link aria-current={legalDocument === "privacy" ? "page" : undefined} href="/privacy">
              Gizlilik
            </Link>
            <Link aria-current={legalDocument === "terms" ? "page" : undefined} href="/terms">
              Şartlar
            </Link>
            <Link aria-current={legalDocument === "cookies" ? "page" : undefined} href="/cookies">
              Çerezler
            </Link>
          </nav>
        </header>

        <Link className="legal-reference-back" href="/login">
          <ArrowLeft className="h-4 w-4" />
          Giriş ekranına dön
        </Link>

        <section className="legal-reference-hero-card">
          <div>
            <p className="legal-reference-badge">
              <ShieldCheck className="h-4 w-4" />
              {documentConfig.badge}
            </p>
            <h1>{documentConfig.title}</h1>
            <p>{documentConfig.description}</p>
          </div>

          <div className="legal-reference-meta-grid" aria-label="Belge özeti">
            <div>
              <CalendarDays className="h-5 w-5" />
              <span>Son güncelleme</span>
              <strong>{lastUpdated}</strong>
            </div>
            <div>
              <Mail className="h-5 w-5" />
              <span>İletişim</span>
              <strong>support@whispr.team</strong>
            </div>
            <div>
              <FileText className="h-5 w-5" />
              <span>Belge türü</span>
              <strong>Whispr resmi metni</strong>
            </div>
          </div>
        </section>

        <article className="legal-reference-content-card">
          <div className="legal-reference-content">{contentLines.map(renderLegalLine)}</div>
        </article>
      </div>
    </main>
  );
}
