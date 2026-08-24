import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MENTION_SETTINGS_DEFAULTS, type MentionSettings } from "@wizards/types";

import {
  MentionSettingsForm,
  buildMentionSettingsPatch,
  isMentionSettingsDirty,
} from "@/components/mentions/mention-settings-modal";
import { MentionSettingsRow } from "@/components/mentions/mention-settings-row";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { getMessagesForLocale } from "@/lib/locale";

/**
 * Ş8 — bildirim ayarları modalı (SPEC §7, K6).
 *
 * Yama kurma mantığı saf ve ayrı test ediliyor: "yalnız değişen alan gönderilir" kuralı bir
 * tıklama dizisi değil, iki nesnenin farkı.
 *
 * Çizim testleri `MentionSettingsForm`u doğrudan sürüyor: `Modal` gövdeye portallanıyor ve
 * `document` olmayan bir ortamda `null` döndürüyor, yani kabuğun içinden hiçbir şey
 * doğrulanamazdı.
 */

const BASE: MentionSettings = {
  ...MENTION_SETTINGS_DEFAULTS,
  quietHours: { enabled: false, from: null, timeZone: null, to: null },
};

const noop = () => {};

function render(draft: MentionSettings | null = BASE, overrides: Record<string, unknown> = {}) {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
      <MentionSettingsForm
        confirmingClose={false}
        dirty={false}
        draft={draft}
        onCancel={noop}
        onDesktopChange={noop}
        onQuietApply={noop}
        onQuietCancel={noop}
        onQuietDraftChange={noop}
        onQuietEdit={noop}
        onSave={noop}
        onToggle={noop}
        quietDraft={{ from: "23:00", to: "08:00" }}
        quietEditing={false}
        saveError={null}
        saving={false}
        {...overrides}
      />
    </LocaleProvider>,
  );
}

describe("buildMentionSettingsPatch", () => {
  it("hiçbir şey değişmediyse boş yama", () => {
    assert.deepEqual(buildMentionSettingsPatch(BASE, BASE), {});
    assert.equal(isMentionSettingsDirty(BASE, BASE), false);
  });

  it("yalnız değişen anahtarı taşır", () => {
    const draft = { ...BASE, threadReplies: true };

    assert.deepEqual(buildMentionSettingsPatch(BASE, draft), { threadReplies: true });
    assert.equal(isMentionSettingsDirty(BASE, draft), true);
  });

  it("masaüstü kipi ayrı bir alan", () => {
    assert.deepEqual(buildMentionSettingsPatch(BASE, { ...BASE, desktop: "off" }), {
      desktop: "off",
    });
  });

  it("sessiz saatlerin yalnız değişen parçası gider", () => {
    const draft: MentionSettings = {
      ...BASE,
      quietHours: { enabled: true, from: "23:00", timeZone: null, to: "08:00" },
    };

    assert.deepEqual(buildMentionSettingsPatch(BASE, draft), {
      quietHours: { enabled: true, from: "23:00", to: "08:00" },
    });
  });

  it("dokunulmamış sessiz saat alanı yamada yok", () => {
    const base: MentionSettings = {
      ...BASE,
      quietHours: { enabled: true, from: "23:00", timeZone: "Europe/Istanbul", to: "08:00" },
    };
    const draft: MentionSettings = { ...base, quietHours: { ...base.quietHours, to: "09:00" } };

    assert.deepEqual(buildMentionSettingsPatch(base, draft), { quietHours: { to: "09:00" } });
  });

  it("dört anahtarın hepsi ayrı ayrı algılanır", () => {
    for (const key of ["me", "role", "everyone", "threadReplies"] as const) {
      const draft = { ...BASE, [key]: !BASE[key] };
      assert.deepEqual(buildMentionSettingsPatch(BASE, draft), { [key]: !BASE[key] });
    }
  });
});

describe("MentionSettingsModal — çizim", () => {
  it("dört anahtar satırı ve masaüstü segmenti çizilir", () => {
    const markup = render();

    for (const label of [
      "Bana özel bahsetmeler",
      "Rol bahsetmeleri",
      "@herkes ve @burada",
      "Thread yanıtları",
      "Masaüstü bildirimi",
    ]) {
      assert.ok(markup.includes(label), label);
    }
    assert.equal(markup.match(/role="switch"/g)?.length, 4);
  });

  it("varsayılanlar SPEC'teki gibi: thread kapalı, masaüstü Sadece bahsetmeler", () => {
    const markup = render();

    // `Thread yanıtları` kapalı başlar; kalan üçü açık. Sayım yalnız anahtarlara bakıyor —
    // segment düğmeleri de `role="radio"` ile `aria-checked` taşıyor.
    assert.equal(markup.match(/aria-checked="true"[^>]*role="switch"/g)?.length, 3);
    assert.equal(markup.match(/aria-checked="false"[^>]*role="switch"/g)?.length, 1);
    assert.ok(markup.includes("Sadece bahsetmeler"));
  });

  it("sessiz saatler kapalıyken şerit kapalı metnini yazar ve alt satır çizilmez", () => {
    const markup = render();

    assert.ok(markup.includes("Sessiz saatler kapalı"));
    assert.ok(!markup.includes("bahsetmeler sayaçta birikir"));
    assert.ok(markup.includes("Düzenle"));
  });

  it("sessiz saatler açıkken aralık yazılır", () => {
    const markup = render({
      ...BASE,
      quietHours: { enabled: true, from: "23:00", timeZone: null, to: "08:00" },
    });

    assert.ok(markup.includes("Sessiz saatler açık"));
    assert.ok(markup.includes("23:00 – 08:00 · bahsetmeler sayaçta birikir"));
  });

  it("yüklenene kadar anahtarlar iskelet, hiçbiri tıklanamaz", () => {
    const markup = render(null);

    assert.ok(!markup.includes('role="switch"'));
    assert.ok(markup.includes("animate-pulse"));
  });

  it("altlıkta not, İptal ve Kaydet var; Kaydet temiz formda kapalı", () => {
    const markup = render();

    assert.ok(markup.includes("Kanal bazlı ayarlar kanal menüsünden yönetilir"));
    assert.ok(markup.includes("İptal"));
    assert.ok(markup.includes("Kaydet"));
    assert.ok(markup.includes('data-testid="mention-settings-save"'));
    // Temiz formda kaydedilecek bir şey yok.
    assert.ok(markup.includes("disabled"));
  });
});

describe("MentionSettingsRow", () => {
  it("başlık ve alt metin anahtara bağlanır — ikinci bir aria-label yazılmaz", () => {
    const markup = renderToStaticMarkup(
      <MentionSettingsRow
        checked
        onChange={() => {}}
        subtitle="Adın veya kullanıcı adın yazıldığında"
        testId="row"
        title="Bana özel bahsetmeler"
      />,
    );

    assert.ok(markup.includes("aria-labelledby"));
    assert.ok(markup.includes("aria-describedby"));
    assert.ok(!markup.includes("aria-label="));
    assert.ok(markup.includes('role="switch"'));
  });
});
