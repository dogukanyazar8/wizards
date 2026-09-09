import type { AccountSettingsState } from "@/lib/account/actions";
import type { WhisprReleaseNote } from "@/lib/app-version";

export type SettingsBootstrapPayload = {
  buildInfo: {
    buildId: string;
    buildTime: string;
    contributors: string[];
    developerName: string;
    /**
     * Ş10 — Hakkında'nın katkıcı satırlarının `Öne çıkan katkıcı` rolü. `Contributor` tablosunda
     * rol kolonu yok; rol bu addan ve `developerName`den **türetilir** (`resolveContributorRole`).
     * `null` "öne çıkan katkıcı yok" demektir, "bilinmiyor" değil.
     */
    featuredContributor: string | null;
    lastUpdated: string;
    notes: WhisprReleaseNote[];
    releaseChannel: string;
    version: string;
  };
  initialAccount: AccountSettingsState;
  /**
   * Ş10 — kullanıcının seçtiği güncelleme akışı (`User.preferredReleaseChannel`), çalışan
   * build'in kanalı **değil**. `null` = hiç seçilmemiş.
   */
  preferredReleaseChannel: string | null;
  uploadthingEnabled: boolean;
};
