import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HOME_METRICS } from "@/lib/home/metrics";
import {
  MESSAGES_METRICS,
  NAV_PANEL_ADJUSTMENTS,
  SPEC_DEVIATIONS,
  hairline,
  pxToEm,
  pxToRem,
} from "./metrics";

/**
 * Gölge geometrisinde `offsetY` pozitif, `spread` negatiftir ve `alpha` bir kesirdir. Sözlüğün
 * geri kalanında sıfır ya da negatif bir ölçü yazım hatasıdır — bu iki dal onun istisnası.
 */
const SIGNED_ROOTS = new Set(["shadow"]);
const SIGNED_LEAVES = new Set([
  "hoverBarOffsetTop",
  "resultHoverLift",
  "rowPresenceDotOffset",
  "presenceDotOffset",
  /** §16 "zaten üye" yığını binişiktir; negatif margin ölçünün kendisidir. */
  "memberStackOverlap",
]);

type MetricPath = { path: string; value: number };

function collectNumbers(value: unknown, path: string, into: MetricPath[]): void {
  if (typeof value === "number") {
    into.push({ path, value });
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      collectNumbers(entry, `${path}[${index}]`, into);
    });
    return;
  }

  if (typeof value === "object" && value !== null) {
    for (const [key, entry] of Object.entries(value)) {
      collectNumbers(entry, path === "" ? key : `${path}.${key}`, into);
    }
  }
}

function collectStrings(value: unknown, path: string, into: { path: string; value: string }[]) {
  if (typeof value === "string") {
    into.push({ path, value });
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      collectStrings(entry, `${path}[${index}]`, into);
    });
    return;
  }

  if (typeof value === "object" && value !== null) {
    for (const [key, entry] of Object.entries(value)) {
      collectStrings(entry, path === "" ? key : `${path}.${key}`, into);
    }
  }
}

describe("messages metrics — dönüşümler", () => {
  it("tasarım pikselini rem'e çevirir", () => {
    assert.equal(pxToRem(276), "17.25rem");
    assert.equal(pxToRem(340), "21.25rem");
    assert.equal(pxToRem(228), "14.25rem");
    assert.equal(pxToRem(13.5), "0.84375rem");
  });

  it("ikon boyutunu satırın font boyutuna göre em'e çevirir", () => {
    // 17px ikon, 14.5px'lik bir satırda: 17/14.5 ≈ 1.172414em.
    assert.equal(pxToEm(17, 14.5), "1.172414em");
    assert.equal(pxToEm(16), "1em");
  });

  it("hairline fiziksel tabanı korur", () => {
    assert.equal(hairline(), "max(1px, 0.0625rem)");
  });
});

describe("messages metrics — sözlük sözleşmesi", () => {
  it("renk taşımaz", () => {
    const strings: { path: string; value: string }[] = [];
    collectStrings(MESSAGES_METRICS, "", strings);

    const colorLike = strings.filter(({ value }) =>
      /#[0-9a-f]{3,8}\b|\bhsl\(|\brgba?\(|\boklch\(/i.test(value),
    );

    assert.deepEqual(
      colorLike.map(({ path }) => path),
      [],
      "Ölçü sözlüğü renk taşımaz; tonu tüketici hsl(var(--token)) ile verir.",
    );
  });

  it("ölçüleri pozitiftir", () => {
    const numbers: MetricPath[] = [];
    collectNumbers(MESSAGES_METRICS, "", numbers);

    const invalid = numbers.filter(({ path, value }) => {
      const [root] = path.split(".");
      const leaf = path.split(".").at(-1) ?? "";

      if (SIGNED_ROOTS.has(root ?? "") || SIGNED_LEAVES.has(leaf)) {
        return !Number.isFinite(value);
      }

      return !Number.isFinite(value) || value <= 0;
    });

    assert.deepEqual(
      invalid.map(({ path, value }) => `${path}=${value}`),
      [],
    );
  });

  it("kolon genişlikleri asgari kabukta toplamı taşırmaz", () => {
    const { layout } = MESSAGES_METRICS;
    const leftColumns = HOME_METRICS.rail.width + HOME_METRICS.panel.width + layout.railWidth;

    // Kullanıcı ayağı genişletmesi: 74 + 280 + 276 = 630; 1360'ta ana alana 730 kalır.
    assert.equal(leftColumns, 630);
    assert.equal(HOME_METRICS.shell.minWidth - leftColumns, layout.mainMinWidth);
    assert.equal(layout.mainMinWidth - layout.sidePanelWidth, layout.mainMinWidthWithPanel);
  });

  it("ray ve sağ panel genişliği düzen sözlüğüyle aynı sayıdır", () => {
    assert.equal(MESSAGES_METRICS.rail.width, MESSAGES_METRICS.layout.railWidth);
    assert.equal(MESSAGES_METRICS.sidePanel.width, MESSAGES_METRICS.layout.sidePanelWidth);
  });

  it("kırılım eşikleri asgari kabuğun altındadır", () => {
    const { layout } = MESSAGES_METRICS;
    assert.ok(layout.sidePanelOverlayBelow < HOME_METRICS.shell.minWidth);
    assert.ok(layout.railDrawerBelow < layout.sidePanelOverlayBelow);
  });
});

describe("messages metrics — §15 profil paneli", () => {
  /**
   * Panel thread/arama ile aynı yuvayı paylaşır ama **daha dardır**. Tek sabit sanıp
   * `sidePanel.width`'i 330'a çekmek thread ve arama panelini de daraltır; bu test o hatayı
   * sözlük seviyesinde yakalar.
   */
  it("profil paneli thread/arama panelinden dardır ve ayrı kayıttır", () => {
    const { sidePanel } = MESSAGES_METRICS;

    assert.equal(sidePanel.profileWidth, 330);
    assert.equal(sidePanel.width, 340);
    assert.notEqual(sidePanel.profileWidth, sidePanel.width);
  });

  it("profil paneli asgari kabukta ana alanı boğmaz", () => {
    const { layout, sidePanel } = MESSAGES_METRICS;

    // Profil 330 olduğu için ana alana 340'lık panelden 10px fazla kalır.
    assert.equal(
      layout.mainMinWidth - sidePanel.profileWidth,
      layout.mainMinWidthWithPanel + (sidePanel.width - sidePanel.profileWidth),
    );
  });

  it("kimlik bloğunun presence halkası içten dışa büyür", () => {
    const { profilePanel } = MESSAGES_METRICS;
    assert.ok(profilePanel.dmRingOuterWidth > profilePanel.dmRingInnerWidth);
  });

  it("anahtar topuzu iki uçta da rayın içinde kalır", () => {
    const { profilePanel: p } = MESSAGES_METRICS;

    assert.equal(p.switchKnobOffsetOff, p.switchKnobTop);
    assert.equal(p.switchKnobOffsetOn + p.switchKnobSize + p.switchKnobTop, p.switchWidth);
    assert.equal(p.switchKnobSize + p.switchKnobTop * 2, p.switchHeight);
  });

  it("gizlilik satırı ikon ve kontrol kolonunu aynı hizada tutacak kadar yüksektir", () => {
    const { profilePanel: p } = MESSAGES_METRICS;
    const contentHeight = Math.max(p.privacyTileSize, p.switchHeight) + p.privacyRowPaddingY * 2;

    assert.ok(p.privacyRowMinHeight >= contentHeight);
  });

  it("medya ızgarası `+N` örtüsünü son karoda taşır", () => {
    const { profilePanel: p } = MESSAGES_METRICS;

    // 3 kolon × 2 satır = 6 karo; örtü altıncıdadır.
    assert.equal(p.mediaOverlayIndex, p.mediaColumns * 2);
  });

  /**
   * §15.1 aksiyon satırı — Ş11 parity kapısı.
   *
   * `Mesajlar.dc.html` birincil düğmenin ikonunu 15, üç ikon-only düğmenin ikonunu
   * **16** çiziyor (L971/L973/L975 ve L991/L993/L995). Tek bir `actionIconSize` ikisini
   * birden yönetseydi ya dolu düğmenin ikonu şişerdi ya kutuların ikonu küçük kalırdı;
   * fark 1px olduğu için de gözle değil ancak burada yakalanır.
   */
  it("ikon-only aksiyon düğmesi birincil düğmeden büyük ikon taşır", () => {
    const { profilePanel: p } = MESSAGES_METRICS;

    assert.equal(p.actionIconSize, 15);
    assert.equal(p.actionIconButtonIconSize, 16);
    assert.ok(p.actionIconButtonIconSize > p.actionIconSize);
  });

  /** İkon 36px kutunun içinde kalmalı; taşarsa kutunun yarıçapı ikonu kırpar. */
  it("ikon-only düğmenin ikonu kendi kutusuna sığar", () => {
    const { profilePanel: p } = MESSAGES_METRICS;

    assert.ok(p.actionIconButtonIconSize < p.actionIconButtonSize);
    assert.equal(p.actionIconButtonSize, p.actionHeight);
  });

  /**
   * Ş11 parity kapısı: sözlük, `dc.html`in üç ikon ölçüsünü birebir taşımalı.
   * Üçü de bir tur boyunca sözlükte HTML'den **farklı** durdu (rapor 08 §5.7,
   * 09 §5.1, 10 §5.9); bu test o üçünü aynı anda kilitler.
   */
  it("raptiye, medya karosu ve tehlike ikonu HTML değerini taşır", () => {
    const { profilePanel: p } = MESSAGES_METRICS;

    assert.equal(p.pinIconSize, 13);
    assert.equal(p.mediaTileIconSize, 18);
    assert.equal(p.dangerIconSize, 16);
  });
});

describe("messages metrics — §16 üye ekle modalı", () => {
  it("grup modalıyla aynı kabuk ölçülerini paylaşır", () => {
    const { inviteModal, groupModal } = MESSAGES_METRICS;

    assert.equal(inviteModal.width, groupModal.width);
    assert.equal(inviteModal.radius, groupModal.radius);
    assert.equal(inviteModal.headerPaddingTop, groupModal.headerPaddingTop);
    assert.equal(inviteModal.headerPaddingX, groupModal.headerPaddingX);
    assert.equal(inviteModal.headerTileSize, groupModal.headerTileSize);
  });

  it("zaten-üye yığını binişiktir", () => {
    const { inviteModal } = MESSAGES_METRICS;

    assert.ok(inviteModal.memberStackOverlap < 0);
    assert.ok(Math.abs(inviteModal.memberStackOverlap) < inviteModal.memberStackAvatarSize);
  });

  it("onay kutusu aday satırının avatarından küçüktür", () => {
    const { inviteModal } = MESSAGES_METRICS;
    assert.ok(inviteModal.checkboxSize < inviteModal.rowAvatarSize);
  });
});

describe("messages metrics — §17 menüler ve toast", () => {
  it("grup menüsü DM menüsünden geniştir", () => {
    const { moreMenu } = MESSAGES_METRICS;

    assert.equal(moreMenu.dmWidth, 254);
    assert.equal(moreMenu.groupWidth, 262);
    assert.ok(moreMenu.groupWidth > moreMenu.dmWidth);
  });

  it("alt menü girintisi satır ikonunu ve boşluğunu aşar", () => {
    const { moreMenu } = MESSAGES_METRICS;

    // 36 = 9 (satır padding) + 16 (ikon) + 11 (gap).
    assert.equal(
      moreMenu.submenuIndent,
      moreMenu.rowPaddingX + moreMenu.rowIconSize + moreMenu.rowGap,
    );
  });

  it("toast SPEC'in 4–6 sn aralığında kapanır", () => {
    const { toast } = MESSAGES_METRICS;

    assert.ok(toast.autoCloseMs >= 4000);
    assert.ok(toast.autoCloseMs <= 6000);
  });
});

function readMetricPath(path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (node, key) =>
        typeof node === "object" && node !== null
          ? (node as Record<string, unknown>)[key]
          : undefined,
      MESSAGES_METRICS,
    );
}

describe("messages metrics — SPEC sapma kaydı", () => {
  it("her sapma gerçekten bir sapmadır", () => {
    assert.ok(SPEC_DEVIATIONS.length > 0);

    for (const deviation of SPEC_DEVIATIONS) {
      assert.notEqual(deviation.html, deviation.spec, `${deviation.field} sapma değil`);
    }
  });

  /**
   * Kaydın asıl işi bu: biri sözlüğü "SPEC'e uydurmak" için değiştirirse test kırılır ve
   * otoritenin HTML olduğunu hatırlatır. Kayıt böylece belge değil, **koruma** olur.
   */
  it("sözlük her sapan alanda HTML değerini taşır", () => {
    for (const deviation of SPEC_DEVIATIONS) {
      const actual = readMetricPath(deviation.field);

      assert.notEqual(actual, undefined, `${deviation.field} sözlükte yok`);
      assert.equal(
        actual,
        deviation.html,
        `${deviation.field} HTML değerinden (${deviation.html}) saptı`,
      );
    }
  });

  it("aynı alan iki kez kaydedilmez", () => {
    const fields = SPEC_DEVIATIONS.map((deviation) => deviation.field);
    assert.equal(new Set(fields).size, fields.length);
  });
});

describe("gezinme paneli ayarları", () => {
  it("HOME_METRICS.panel ortak genişlik ve sıkı iç ölçüleri taşır", () => {
    assert.equal(HOME_METRICS.panel.width, NAV_PANEL_ADJUSTMENTS.width.to);
    assert.equal(HOME_METRICS.panel.headerPaddingX, NAV_PANEL_ADJUSTMENTS.headerPaddingX.to);
    assert.equal(HOME_METRICS.panel.navPaddingX, NAV_PANEL_ADJUSTMENTS.navPaddingX.to);
    assert.equal(HOME_METRICS.panel.rowPaddingX, NAV_PANEL_ADJUSTMENTS.rowPaddingX.to);
    assert.equal(HOME_METRICS.panel.sectionPaddingX, NAV_PANEL_ADJUSTMENTS.sectionPaddingX.to);
    assert.equal(
      HOME_METRICS.panel.serverListPaddingX,
      NAV_PANEL_ADJUSTMENTS.serverListPaddingX.to,
    );
    assert.equal(HOME_METRICS.panel.serverRowPaddingX, NAV_PANEL_ADJUSTMENTS.serverRowPaddingX.to);
    assert.equal(
      HOME_METRICS.panel.serverNameFontSize,
      NAV_PANEL_ADJUSTMENTS.serverNameFontSize.to,
    );
  });

  it("etkinlik ekranının gün paneli nav paneline bağlı kalır", () => {
    // Bağ bilerek kurulmuştu ("ikinci bir genişlik uydurulmadı"); daralma onu da kapsar.
    assert.equal(HOME_METRICS.sideScreens.dayPanelWidth, HOME_METRICS.panel.width);
  });
});
