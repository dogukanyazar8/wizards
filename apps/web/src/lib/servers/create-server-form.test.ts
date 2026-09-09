import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SERVER_METRICS } from "@/lib/servers/metrics";
import {
  CREATE_SERVER_ACCESS_OPTIONS,
  CREATE_SERVER_DEFAULT_ACCESS,
  CREATE_SERVER_DEFAULT_DELETED_NOTICE_MINUTES,
  CREATE_SERVER_DEFAULT_MESSAGE_LIMIT,
  CREATE_SERVER_DELETED_NOTICE_MINUTES,
  CREATE_SERVER_INITIAL_STATE,
  CREATE_SERVER_MESSAGE_LIMITS,
  buildCreateServerBody,
  createServerAccessLabelKey,
  deriveCreateServerShortName,
  isCounterWarning,
  isCreateServerDirty,
  isCreateServerNameValid,
  isCreateServerShortNameValid,
  isDiscoveryTagBlockActive,
  resolveCreateServerBadgeTone,
  resolveCreateServerMediaSummary,
  resolveCreateServerShortNameView,
  resolveCreateServerVisibility,
  selectCreateServerFooterNote,
  shouldConfirmCreateServerClose,
  type CreateServerFormState,
} from "@/lib/servers/create-server-form";

function state(patch: Partial<CreateServerFormState> = {}): CreateServerFormState {
  return { ...CREATE_SERVER_INITIAL_STATE, ...patch };
}

describe("sunucu oluşturma formu — SPEC-SUNUCU §7", () => {
  it("üç anahtarı açık, erişimi Keşfet'te listelensin ile doğurur", () => {
    assert.equal(CREATE_SERVER_INITIAL_STATE.allowGifs, true);
    assert.equal(CREATE_SERVER_INITIAL_STATE.allowFileUploads, true);
    assert.equal(CREATE_SERVER_INITIAL_STATE.allowMemberAdds, true);
    assert.equal(CREATE_SERVER_INITIAL_STATE.access, "discover");
    assert.equal(CREATE_SERVER_DEFAULT_ACCESS, "discover");
  });

  it("dokunulmamış veya başlangıç değerlerine döndürülmüş formu temiz sayar", () => {
    assert.equal(isCreateServerDirty(state()), false);
    assert.equal(isCreateServerDirty(state({ name: CREATE_SERVER_INITIAL_STATE.name })), false);
  });

  it("kullanıcının değiştirebildiği her form alanını kirli sayar", () => {
    const changedStates: CreateServerFormState[] = [
      state({ access: "private" }),
      state({ allowFileUploads: false }),
      state({ allowGifs: false }),
      state({ allowMemberAdds: false }),
      state({ deletedMessageNoticeMinutes: 15 }),
      state({ description: "Topluluk" }),
      state({ iconColor: "primary" }),
      state({ iconUrl: "https://cdn.example.com/server.png" }),
      state({ messageCharacterLimit: 250 }),
      state({ name: "Whispr" }),
      state({ shortName: "WHS" }),
      state({ tags: ["oyun"] }),
    ];

    for (const changed of changedStates) {
      assert.equal(isCreateServerDirty(changed), true);
    }
  });

  it("temiz formu doğrudan kapatır; değişiklik veya süren ikon yüklemesi için onay ister", () => {
    assert.equal(shouldConfirmCreateServerClose(state(), false), false);
    assert.equal(shouldConfirmCreateServerClose(state({ name: "Whispr" }), false), true);
    assert.equal(shouldConfirmCreateServerClose(state(), true), true);
  });

  it("üç erişim seçeneğini iki boole'ye birebir çevirir (§7.4)", () => {
    assert.deepEqual(CREATE_SERVER_ACCESS_OPTIONS, ["public", "private", "discover"]);
    assert.deepEqual(resolveCreateServerVisibility("private"), {
      discoverable: false,
      isPublic: false,
    });
    assert.deepEqual(resolveCreateServerVisibility("public"), {
      discoverable: false,
      isPublic: true,
    });
    assert.deepEqual(resolveCreateServerVisibility("discover"), {
      discoverable: true,
      isPublic: true,
    });
  });

  it("her erişim seçeneğinin rozet tonu ve etiket anahtarı ayrı (§7 önizleme)", () => {
    assert.equal(resolveCreateServerBadgeTone("private"), null);
    assert.equal(resolveCreateServerBadgeTone("public"), "success");
    assert.equal(resolveCreateServerBadgeTone("discover"), "primary");

    for (const access of CREATE_SERVER_ACCESS_OPTIONS) {
      assert.equal(createServerAccessLabelKey(access), `server.create.badge.${access}`);
    }
  });

  it("kısa adı addan tam üç karakter türetir", () => {
    assert.equal(deriveCreateServerShortName("Whispr Topluluğu"), "WHI");
    assert.equal(deriveCreateServerShortName("  Whispr   Topluluğu  Ekibi "), "WHI");
    assert.equal(deriveCreateServerShortName("Whispr"), "WHI");
    assert.equal(deriveCreateServerShortName(""), "WHS");
    assert.equal(deriveCreateServerShortName("   "), "WHS");
  });

  it("türetmede Türkçe küçük i'yi İ'ye çevirir", () => {
    // `toUpperCase()` "istanbul" için "ISTANBUL" üretir; ray'de görünen harf İ olmalı.
    assert.equal(deriveCreateServerShortName("istanbul kulüp"), "İST");
  });

  it("BMP dışı bir kısa ad karakterini yarım vekile bölmez", () => {
    assert.equal(deriveCreateServerShortName("🎮 Oyun"), "OYU");
  });

  it("kullanıcı yazdığı anda otomatik türetmeyi bırakır", () => {
    assert.equal(resolveCreateServerShortNameView("", "Whispr Topluluğu"), "WHI");
    assert.equal(resolveCreateServerShortNameView("wzr", "Whispr Topluluğu"), "WZR");
  });

  it("kullanıcı kısa adı tam üç karakter girmek zorunda", () => {
    assert.equal(isCreateServerShortNameValid(""), false);
    assert.equal(isCreateServerShortNameValid("WZ"), false);
    assert.equal(isCreateServerShortNameValid("WZR"), true);
    assert.equal(isCreateServerShortNameValid("WZRD"), false);
  });

  it("ad iki karakterden kısayken düğmeyi pasif bırakır (§7 ayak)", () => {
    assert.equal(isCreateServerNameValid(""), false);
    assert.equal(isCreateServerNameValid(" a "), false);
    assert.equal(isCreateServerNameValid("ab"), true);
  });

  it("ayak notu ad geçersizken uyarı, geçerliyken üç parçalı özet döner", () => {
    assert.deepEqual(selectCreateServerFooterNote(state({ name: "a" })), { kind: "warning" });

    assert.deepEqual(
      selectCreateServerFooterNote(
        state({ access: "public", name: "  Whispr Topluluğu  ", shortName: "WHI" }),
      ),
      {
        accessLabelKey: "server.create.badge.public",
        kind: "summary",
        name: "Whispr Topluluğu",
        shortName: "WHI",
      },
    );
  });

  it("medya özetinin dört hâli (§7 önizleme özet kartı)", () => {
    assert.equal(
      resolveCreateServerMediaSummary({ allowFileUploads: true, allowGifs: true }),
      "both",
    );
    assert.equal(
      resolveCreateServerMediaSummary({ allowFileUploads: false, allowGifs: true }),
      "gifs",
    );
    assert.equal(
      resolveCreateServerMediaSummary({ allowFileUploads: true, allowGifs: false }),
      "files",
    );
    assert.equal(
      resolveCreateServerMediaSummary({ allowFileUploads: false, allowGifs: false }),
      "none",
    );
  });

  it("keşif etiketi bloğu yalnız Keşfet'te listelensin seçiliyken etkin (§7.5)", () => {
    assert.equal(isDiscoveryTagBlockActive("discover"), true);
    assert.equal(isDiscoveryTagBlockActive("public"), false);
    assert.equal(isDiscoveryTagBlockActive("private"), false);
  });

  it("gelişmiş seçenekleri SPEC'in listesiyle birebir (§7.7)", () => {
    assert.deepEqual([...CREATE_SERVER_MESSAGE_LIMITS], [2000, 250, 40000]);
    assert.deepEqual([...CREATE_SERVER_DELETED_NOTICE_MINUTES], [5, 15, 30, 60, 180, 360, 1440]);
    assert.equal(CREATE_SERVER_DEFAULT_MESSAGE_LIMIT, 2000);
    assert.equal(CREATE_SERVER_DEFAULT_DELETED_NOTICE_MINUTES, 60);
  });

  it("sayaç sınırın %85'inde warning'e döner (00 §6)", () => {
    const ratio = SERVER_METRICS.modal.counterWarnRatio;

    assert.equal(isCounterWarning(53, 64, ratio), false);
    assert.equal(isCounterWarning(55, 64, ratio), true);
    assert.equal(isCounterWarning(64, 64, ratio), true);
  });

  it("gövdeyi kurarken kırpar, seçilmemiş ikon rengini hiç göndermez", () => {
    const body = buildCreateServerBody(
      state({ description: "  Tek cümle  ", name: "  Whispr  ", shortName: "  " }),
    );

    assert.equal(body.name, "Whispr");
    assert.equal(body.description, "Tek cümle");
    assert.equal("iconColor" in body, false);
    assert.equal(body.shortName, "");
    assert.equal(body.isPublic, true);
    assert.equal(body.discoverable, true);
  });

  it("boş açıklamayı null gönderir, seçilen rengi ve kısa adı taşır", () => {
    const body = buildCreateServerBody(
      state({ iconColor: "accent2", name: "Whispr", shortName: "WZR" }),
    );

    assert.equal(body.description, null);
    assert.equal(body.iconColor, "accent2");
    assert.equal(body.shortName, "WZR");
  });

  /**
   * Blok soluklaşmışken seçili kalmış etiketleri yazmak, kullanıcının kapattığı bir
   * listelemeyi sessizce beslerdi (§7.5).
   */
  it("Keşfet dışı bir erişimde etiketleri göndermez", () => {
    assert.deepEqual(
      buildCreateServerBody(state({ access: "discover", name: "Whispr", tags: ["oyun"] })).tags,
      ["oyun"],
    );
    assert.deepEqual(
      buildCreateServerBody(state({ access: "public", name: "Whispr", tags: ["oyun"] })).tags,
      [],
    );
    assert.deepEqual(
      buildCreateServerBody(state({ access: "private", name: "Whispr", tags: ["oyun"] })).tags,
      [],
    );
  });

  it("gelişmiş bloğun iki değerini her zaman gövdeye koyar", () => {
    const body = buildCreateServerBody(
      state({ deletedMessageNoticeMinutes: 180, messageCharacterLimit: 250, name: "Whispr" }),
    );

    assert.equal(body.messageCharacterLimit, 250);
    assert.equal(body.deletedMessageNoticeMinutes, 180);
  });
});
