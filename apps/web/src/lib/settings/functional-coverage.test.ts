import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  UPDATES_UNAVAILABLE_ROWS,
  ACCOUNT_UNAVAILABLE_ROWS,
  APPEARANCE_UNAVAILABLE_ROWS,
  AV_UNAVAILABLE_ROWS,
  DESKTOP_UNAVAILABLE_ROWS,
  NOTIFICATION_UNAVAILABLE_ROWS,
} from "@/lib/settings/availability";
import { walkSettingsRows } from "@/lib/settings/tree";

type EvidenceKind = "informational" | "platform" | "runtime" | "unavailable";

type FunctionalEvidence = {
  readonly kind: EvidenceKind;
  readonly occurrence: string;
  readonly probe: string;
};

/** Literal ürün envanteri; anahtar listeleri ağaçtan türetilmez. */
const FUNCTIONAL_EVIDENCE: FunctionalEvidence[] = [];

function register(scope: string, kind: EvidenceKind, probe: string, keys: string): void {
  for (const key of keys.trim().split(/\s+/u)) {
    FUNCTIONAL_EVIDENCE.push({ kind, occurrence: `${scope}/${key}`, probe });
  }
}

// Hesabım — gerçek action/service/consumer, read-only blok veya açık unavailable.
register("account/profile", "runtime", "account-profile", "hero pn pu pp");
register("account/profile", "runtime", "profile-details-action", "pbio ps px");
register("account/account", "runtime", "account-contact", "ae ap");
register("account/account", "runtime", "account-security", "apw cn");
register("account/privacy", "runtime", "account-bridge", "g1 g2 g3 g4 g5 g6 g7 g9");
register("account/security", "runtime", "account-security", "s1 s4 o2");
register("account/security", "unavailable", "account-disabled", "s2");
register("account/security", "informational", "account-read-model", "s3 o1");
register("account/badges", "informational", "account-read-model", "r1");
register("account/data", "runtime", "account-data", "d1 d3");

// Ses ve Video — cihaz API'si, voice-store consumer'ı veya açık unavailable.
register("av/audio", "platform", "media-device", "i1 u1");
register("av/audio", "informational", "media-meter", "i3");
register("av/audio", "runtime", "self-monitor", "i4");
register("av/audio", "runtime", "master-output-livekit", "u3");
register("av/audio", "runtime", "av-bridge", "i5 i6 u2 p4 p5 p7");
register("av/camera", "platform", "media-device", "k1 k4");
register("av/camera", "runtime", "camera-preview", "k2");
register("av/camera", "unavailable", "av-disabled", "k3");
// Ekran paylaşımı K4 — `e8` (kare hızı) ve `e9` (mod) da av-bridge üzerinden voice-store'a yazar.
register("av/screen-share", "runtime", "screen-share", "e1 e2 e3 e8 e9");
register("av/screen-share", "platform", "screen-share-capture", "e4 e5");
register("av/screen-share", "platform", "screen-share-session", "e7");

// Görünüm — uygulama kabuğu/tema consumer'ı, read-only önizleme veya açık unavailable.
register("appearance/theme", "runtime", "theme-selection", "t1 t2");
register("appearance/text", "runtime", "appearance-consumer", "m1 m2 m3 m4");
register("appearance/language", "runtime", "appearance-bridge", "l1 l2 l3 l4");
register("appearance/text", "informational", "appearance-preview", "m5");
register("appearance/media", "runtime", "message-media-preferences", "v1 v2 v3 v4 v7");
register("appearance/layout", "runtime", "appearance-layout", "y1 y2 y3 y4 y5 y6");
register("appearance/accessibility", "runtime", "text-scale", "x4");
register("appearance/accessibility", "runtime", "appearance-document", "x2 x3");

// Bildirimler — merkezi policy/producer, browser izni, read model veya açık unavailable.
register("notifications/general", "runtime", "notification-policy", "b1 nd2 na6 nq1 nqx");
register("notifications/general", "platform", "notification-permission", "na5");
register("notifications/general", "unavailable", "notification-disabled", "ns1");
register("notifications/surfaces", "informational", "notification-summary", "ns0");
register("notifications/surfaces", "runtime", "notification-policy", "na1 na2 nd1 nd2 nd3 na6");
register("notifications/surfaces", "platform", "notification-permission", "na5");
register("notifications/surfaces", "unavailable", "notification-disabled", "na3 nd4");
register(
  "notifications/types",
  "runtime",
  "notification-policy",
  "nt1 nt2 nt3 nt4 nt5 nt6 nt7 nt8 nt9 nt10 nt11 nt12 nt13 nt14 nt15 nt16",
);
register("notifications/quiet-hours", "runtime", "notification-policy", "nq1 nq2 nq3 nq4 nq5");
register("notifications/sounds", "unavailable", "notification-disabled", "ns1 ns2 ns3 ns4 ns5");
register("notifications/panel", "unavailable", "notification-disabled", "np1 np2 np3 np4 np5");
register("notifications/exceptions", "runtime", "notification-exceptions", "ne0");
register("notifications/exceptions", "unavailable", "notification-disabled", "ne1");

// Desktop/Tauri — native runtime consumer'ı, durum bloğu veya açık unavailable.
register("desktop/app", "platform", "desktop-control", "w1 w2 w8");
register("desktop/app", "platform", "desktop-runtime", "w4 w5 w6 w7");
register("desktop/shortcuts", "platform", "desktop-shortcuts", "q1 q2");
register("desktop/overlay", "platform", "desktop-runtime", "z1 z2 z3 z4 z5 z6");
register("desktop/overlay", "unavailable", "desktop-disabled", "z7 z8");
register("desktop/permissions", "platform", "desktop-permissions", "j1");
register("updates/updates", "unavailable", "desktop-disabled", "h4");
register("updates/updates", "platform", "desktop-control", "h1 n4");
register("updates/updates", "runtime", "release-channel", "h2");
register("updates/updates", "informational", "desktop-diagnostics", "n3");

// Hakkında — salt okunur build bilgisi/bağlantılar veya açık unavailable.
register("about/about", "informational", "about-blocks", "o1 o6");
register("updates/updates", "informational", "about-blocks", "o2 o4");
register("updates/updates", "runtime", "release-history", "o5");

const TREE_ROWS = [...walkSettingsRows()];

describe("Ayarlar — exhaustive fonksiyonel kanıt", () => {
  it("ürün satırları ve g9 kanıtsız kalmıyor", () => {
    const actual = [
      ...TREE_ROWS.map(({ section, tab, row }) => `${section.key}/${tab.key}/${row.key}`),
      "account/privacy/g9",
    ].sort();
    const covered = FUNCTIONAL_EVIDENCE.map((entry) => entry.occurrence).sort();

    assert.deepEqual(covered, actual, "FUNCTIONAL_EVIDENCE_MISSING");
  });

  it("aynı occurrence iki farklı kanıt sınıfına yazılmıyor", () => {
    const occurrences = FUNCTIONAL_EVIDENCE.map((entry) => entry.occurrence);

    assert.equal(new Set(occurrences).size, occurrences.length);
    assert.ok(FUNCTIONAL_EVIDENCE.every((entry) => entry.probe.length > 0));
  });

  it("unavailable sınıfı production disabled sözleşmeleriyle birebir", () => {
    const fixedBySection: Readonly<Record<string, Readonly<Record<string, true>>>> = {
      updates: UPDATES_UNAVAILABLE_ROWS,
      account: ACCOUNT_UNAVAILABLE_ROWS,
      appearance: APPEARANCE_UNAVAILABLE_ROWS,
      av: AV_UNAVAILABLE_ROWS,
      desktop: DESKTOP_UNAVAILABLE_ROWS,
      notifications: NOTIFICATION_UNAVAILABLE_ROWS,
    };
    const production = TREE_ROWS.filter(
      ({ section, row }) => fixedBySection[section.key]?.[row.key] === true,
    )
      .map(({ section, tab, row }) => `${section.key}/${tab.key}/${row.key}`)
      .sort();
    const classified = FUNCTIONAL_EVIDENCE.filter((entry) => entry.kind === "unavailable")
      .map((entry) => entry.occurrence)
      .sort();

    assert.deepEqual(classified, production);
  });

  it("dört kanıt sınıfı da gerçek envanterde kullanılıyor", () => {
    assert.deepEqual([...new Set(FUNCTIONAL_EVIDENCE.map((entry) => entry.kind))].sort(), [
      "informational",
      "platform",
      "runtime",
      "unavailable",
    ]);
  });
});
