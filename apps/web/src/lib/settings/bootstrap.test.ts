import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getSettingsBootstrapPayload } from "./bootstrap";

const user = {
  avatarUrl: null,
  displayName: "Ada",
  email: "ada@example.com",
  emailVerified: true,
  id: "user-1",
  status: "ONLINE" as const,
  twoFactorEnabled: false,
  username: "ada",
};

describe("settings bootstrap", () => {
  it("memoizes process-static package and contributor reads", async () => {
    let contributorReads = 0;
    let packageReads = 0;
    const dependencies = {
      readContributors: async () => {
        contributorReads += 1;
        return ["Grace", "Ada"];
      },
      readPackageVersion: async () => {
        packageReads += 1;
        return "1.2.3";
      },
      readPreferredReleaseChannel: async () => null,
    };

    await getSettingsBootstrapPayload({ locale: "en", user }, dependencies);
    await getSettingsBootstrapPayload({ locale: "tr", user }, dependencies);

    assert.equal(contributorReads, 1);
    assert.equal(packageReads, 1);
  });
});

describe("settings bootstrap — Hakkında (Ş10)", () => {
  /**
   * Katkıcı listesi süreç ömrü boyunca memoize ediliyor (`getStaticBuildInfo`), bu yüzden
   * `featuredContributor` burada bağımlılık enjekte edilerek sınanamaz — ilk testin listesi
   * kazanır. Rol türetmesinin kendisi saf bir fonksiyon ve kendi testinde duruyor
   * (`contributors-block.test.tsx`). Buradaki tek iddia memoize **edilmeyen** alan üzerine.
   */
  it("kullanıcının seçtiği kanal build'in kanalından ayrı taşınır", async () => {
    const payload = await getSettingsBootstrapPayload(
      { locale: "tr", user },
      {
        readContributors: async () => ["Grace"],
        readPackageVersion: async () => "2.4.1",
        readPreferredReleaseChannel: async () => "UAT",
      },
    );

    assert.equal(payload.preferredReleaseChannel, "UAT");
    assert.notEqual(payload.preferredReleaseChannel, payload.buildInfo.releaseChannel);
  });

  it("kanal seçilmemişse `null` döner — `stable` varsayılmaz", async () => {
    const payload = await getSettingsBootstrapPayload(
      { locale: "tr", user },
      {
        readContributors: async () => ["Grace"],
        readPackageVersion: async () => "2.4.1",
        readPreferredReleaseChannel: async () => null,
      },
    );

    assert.equal(payload.preferredReleaseChannel, null);
  });
});
