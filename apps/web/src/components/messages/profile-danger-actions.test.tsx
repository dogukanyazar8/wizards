import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  DANGER_ACTION_KINDS,
  ProfileDangerActions,
  dangerConfirmCopy,
  resolveDangerActions,
  type DangerActionKind,
} from "@/components/messages/profile-danger-actions";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { getMessagesForLocale } from "@/lib/locale";
import { MESSAGES_METRICS, pxToRem } from "@/lib/messages/metrics";

const { profilePanel } = MESSAGES_METRICS;

function render(overrides: Partial<React.ComponentProps<typeof ProfileDangerActions>> = {}) {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
      <ProfileDangerActions
        actions={resolveDangerActions({ variant: "dm" })}
        onRun={() => undefined}
        subjectName="Selin Aksoy"
        {...overrides}
      />
    </LocaleProvider>,
  );
}

function kinds(input: Parameters<typeof resolveDangerActions>[0]): DangerActionKind[] {
  return resolveDangerActions(input).map((action) => action.kind);
}

describe("yetki — yetkisi olmayan satır çizilmez (SPEC §15.5.3)", () => {
  it("DM: engelle + bildir", () => {
    assert.deepEqual(kinds({ variant: "dm" }), ["block", "report"]);
  });

  it("grup sahibi: geçmiş + ayrıl + sil", () => {
    assert.deepEqual(kinds({ variant: "group", viewerRole: "OWNER" }), [
      "clearHistory",
      "leaveGroup",
      "deleteGroup",
    ]);
  });

  it("`Grubu sil` ADMIN için çizilmez — Ş2 kararı, uçta 403", () => {
    const admin = kinds({ variant: "group", viewerRole: "ADMIN" });

    assert.deepEqual(admin, ["clearHistory", "leaveGroup"]);
    assert.ok(!admin.includes("deleteGroup"));

    const markup = render({
      actions: resolveDangerActions({ variant: "group", viewerRole: "ADMIN" }),
    });

    assert.ok(!markup.includes("Grubu sil"));
    assert.ok(!markup.includes('data-testid="profile-danger-deleteGroup"'));
  });

  it("üye yalnız ayrılabilir", () => {
    assert.deepEqual(kinds({ variant: "group", viewerRole: "MEMBER" }), ["leaveGroup"]);
  });

  it("rol henüz bilinmiyorsa yönetici satırı çizilmez", () => {
    assert.deepEqual(kinds({ variant: "group" }), ["leaveGroup"]);
  });

  it("gizlenen satır pasif buton bırakmaz", () => {
    const markup = render({
      actions: resolveDangerActions({ variant: "group", viewerRole: "MEMBER" }),
    });

    assert.equal(
      markup.match(
        /data-testid="profile-danger-(?:block|clearHistory|deleteGroup|leaveGroup|report)"/gu,
      )?.length,
      1,
    );
    assert.ok(!markup.includes("disabled"));
  });
});

describe("satır görünümü (§15.5.3 / dc.html L1240–L1270)", () => {
  it("danger satırı kırmızı zemin + kırmızı kenar, nötr satır kart zemini", () => {
    const markup = render();

    assert.ok(markup.includes("background:hsl(var(--danger)/0.08)"));
    assert.ok(markup.includes("border-color:hsl(var(--danger)/0.35)"));
    assert.ok(markup.includes("background:hsl(var(--surface-card))"));
    assert.ok(markup.includes("border-color:hsl(var(--border)/0.7)"));
  });

  it("ölçüler sözlükten okunur", () => {
    const markup = render();

    assert.ok(markup.includes(`border-radius:${pxToRem(profilePanel.dangerRadius)}`));
    assert.ok(markup.includes(`padding:${pxToRem(profilePanel.dangerPadding)}`));
    assert.ok(markup.includes(`gap:${pxToRem(profilePanel.dangerListGap)}`));
    assert.ok(markup.includes(`width:${pxToRem(profilePanel.dangerIconSize)}`));
  });

  it("SPEC metinleri", () => {
    const markup = render();

    assert.ok(markup.includes("Kullanıcıyı engelle"));
    assert.ok(markup.includes("Bildir"));
  });

  it("boş listede hiç kutu çizilmez", () => {
    assert.equal(render({ actions: [] }), "");
  });
});

describe("onay — her yıkıcı eylem onay ister", () => {
  it("beş eylemin beşinin de onay metni var", () => {
    assert.equal(DANGER_ACTION_KINDS.length, 5);

    const dictionary = getMessagesForLocale("tr");

    for (const kind of DANGER_ACTION_KINDS) {
      const copy = dangerConfirmCopy(kind);

      assert.ok(copy.actionKey.length > 0, kind);
      assert.ok(dictionary[copy.actionKey], `${kind}: ${copy.actionKey} sözlükte yok`);

      for (const bodyKey of copy.bodyKeys) {
        assert.ok(dictionary[bodyKey], `${kind}: ${bodyKey} sözlükte yok`);
      }

      if (copy.titleKey) {
        assert.ok(dictionary[copy.titleKey], `${kind}: ${copy.titleKey} sözlükte yok`);
      }
    }
  });

  it("engelleme mevcut `friends.confirm.block.*` metnini kullanır", () => {
    const copy = dangerConfirmCopy("block");

    assert.equal(copy.titleKey, "friends.confirm.block.title");
    assert.deepEqual(
      [...copy.bodyKeys],
      ["friends.confirm.block.description", "friends.confirm.block.safety"],
    );
    assert.equal(copy.actionKey, "friends.confirm.block.action");
  });

  it("`Grubu sil` onayı satır etiketiyle sorulur ve gövdesi özne adıdır", () => {
    const copy = dangerConfirmCopy("deleteGroup");

    assert.equal(copy.titleKey, null);
    assert.equal(copy.actionKey, "messages.profile.danger.deleteGroup");
  });

  it("satıra tıklamadan hiçbir eylem koşmaz — ilk çizimde onay gövdesi yok", () => {
    let ran = 0;
    const markup = renderToStaticMarkup(
      <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
        <ProfileDangerActions
          actions={resolveDangerActions({ variant: "group", viewerRole: "OWNER" })}
          onRun={() => {
            ran += 1;
          }}
          subjectName="Sürüm 2.4 Ekibi"
        />
      </LocaleProvider>,
    );

    assert.equal(ran, 0);
    assert.ok(!markup.includes('data-testid="profile-danger-confirm"'));
    assert.ok(!markup.includes('data-testid="profile-danger-submit"'));
  });

  it("koşan eylemin satırı bekler", () => {
    const markup = render({ busyKind: "block" });

    assert.match(markup, /data-testid="profile-danger-block"[^>]*disabled=""/u);
  });
});
