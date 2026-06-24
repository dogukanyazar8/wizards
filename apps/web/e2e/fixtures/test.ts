import { expect, test as base } from "@playwright/test";
import { attachE2EPageDiagnostics } from "../helpers/diagnostics";

export const test = base.extend({
  page: async ({ page }, runPage, testInfo) => {
    const diagnostics = attachE2EPageDiagnostics(page, testInfo, "browser");

    try {
      await runPage(page);
    } finally {
      await diagnostics.attachIfFailed();
      diagnostics.dispose();
    }
  },
});
export { expect };

