import { MobileLegalDocumentParamsSchema, MobileLegalDocumentResponseSchema } from "@wizards/types";

import { jsonError } from "@/lib/api";
import { requireMobileApiUserId } from "@/lib/auth/api";
import {
  LEGAL_DOCUMENTS,
  getLegalDocumentLastUpdated,
  readLegalDocumentText,
  toLegalDocumentBlocks,
} from "@/lib/legal/legal-documents";

export type MobileLegalDocumentRouteContext = {
  params: Promise<Record<string, string>>;
};

export type MobileLegalDocumentRouteDependencies = {
  authenticate(request: Request): Promise<string>;
  readDocument: typeof readLegalDocumentText;
};

const defaultDependencies: MobileLegalDocumentRouteDependencies = {
  authenticate: (request) => requireMobileApiUserId(request),
  readDocument: readLegalDocumentText,
};

/**
 * Authenticated even though the text itself is public: the in-app reader is only
 * reachable from Settings, and keeping every mobile route behind the same guard
 * is worth more than saving a token on a document the web already serves openly
 * at `/privacy`, `/terms` and `/cookies`.
 */
export async function mobileLegalDocumentRoute(
  request: Request,
  context: MobileLegalDocumentRouteContext,
  dependencies: MobileLegalDocumentRouteDependencies = defaultDependencies,
) {
  try {
    await dependencies.authenticate(request);
    const { legalDocument } = MobileLegalDocumentParamsSchema.parse(await context.params);
    const config = LEGAL_DOCUMENTS[legalDocument];
    const documentText = await dependencies.readDocument(legalDocument);

    return Response.json(
      MobileLegalDocumentResponseSchema.parse({
        badge: config.badge,
        blocks: toLegalDocumentBlocks(documentText),
        description: config.description,
        id: legalDocument,
        lastUpdated: getLegalDocumentLastUpdated(documentText.split(/\r?\n/)),
        title: config.title,
      }),
      { headers: { "Cache-Control": "public, max-age=3600" } },
    );
  } catch (error) {
    return jsonError(error);
  }
}
