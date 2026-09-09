import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { areMessageItemPropsEqual, type MessageItemProps } from "./message-item";
import { mentionsUser } from "@/lib/messages/message-blocks";

/**
 * Mesaj satırının SPEC §5.3 / §5.4 sözleşmesi.
 *
 * `MessageItem` `useSocket`, `useQueryClient`, `useI18n` ve
 * `useAccountPreferenceRuntime` istiyor; dördünün sahtesini kurmak asıl
 * doğrulanacak şeyi — hangi yüzey hangi koşulda çiziliyor — sahte kurulumunun
 * altında bırakırdı. Bu yüzden yüzeyler **kaynakta**, saf mantık kendi
 * modülünde, davranışın kendisi Dalga 3'ün tarayıcı testinde sınanıyor.
 */

const SOURCE = readFileSync(fileURLToPath(new URL("./message-item.tsx", import.meta.url)), "utf8");
const LIST = readFileSync(fileURLToPath(new URL("./message-list.tsx", import.meta.url)), "utf8");
const TOOLBAR = readFileSync(
  fileURLToPath(new URL("./message-toolbar.tsx", import.meta.url)),
  "utf8",
);

describe("satır eylem şeridi (SPEC §5.3)", () => {
  /**
   * `--act` yoğunluk tercihinden gelir. Yalnız `group-hover` olsaydı şerit
   * klavyeyle **hiç** erişilemezdi: tepki, yanıt ve sabitle fareye bağlı kalırdı.
   */
  it("görünürlük --act değişkeninden gelir ve klavye odağını kapsar", () => {
    assert.match(SOURCE, /opacity-\[var\(--act,0\)\]/);
    assert.match(SOURCE, /md:group-focus-within:opacity-100/);
  });

  it("şerit SPEC'in beş düğmesini taşır", () => {
    for (const id of [
      "message-action-react",
      "message-action-reply",
      "message-action-thread",
      "message-action-pin",
      "message-action-more",
    ]) {
      assert.ok(TOOLBAR.includes(`data-testid="${id}"`), id);
    }
  });

  it("ortak satır çift tıklamayı güvenli yanıt denetimine bağlar", () => {
    assert.match(SOURCE, /onDoubleClick=\{handleMessageDoubleClick\}/u);
    assert.match(SOURCE, /shouldReplyFromMessageDoubleClick\(/u);
  });

  it("odaktaki satır R ile yanıt, + ile tepki açar", () => {
    assert.match(
      SOURCE,
      /resolveAppShortcut\(\["message\.reply", "message\.addReaction"\], event\)/u,
    );
    assert.match(SOURCE, /onKeyDown=\{handleMessageKeyDown\}/u);
    assert.ok(SOURCE.includes("tabIndex={0}"));
    assert.ok(TOOLBAR.includes('data-message-shortcut-action="react"'));
  });

  it("bestekârın yukarı kısayolu için yalnız sahibinde gizli düzenleme hedefi taşır", () => {
    assert.match(
      SOURCE,
      /\{isOwner && !isOptimistic && !isFailed \? \(\s*<button\s*aria-hidden="true"\s*data-message-shortcut-action="edit"\s*hidden/u,
    );
  });

  it("sabitle ile daha fazla arasında dikey ayraç taşır", () => {
    assert.ok(TOOLBAR.includes('data-testid="message-action-separator"'));
  });

  it("açılan menüyü dikey eksende kırpmaz", () => {
    assert.match(SOURCE, /overflow-x-clip/);
    assert.doesNotMatch(SOURCE, /overflow-x-hidden/);
  });
});

describe("tarih ayracı sanal satır akışı", () => {
  it("mesajın üzerine yapışmaz; ölçülen satırın normal akışında kalır", () => {
    assert.match(LIST, /relative flex items-center uppercase text-app-soft/u);
    assert.doesNotMatch(LIST, /sticky top-2 z-10 flex items-center uppercase text-app-soft/u);
  });
});

describe("... menüsü (SPEC §5.3)", () => {
  it("beş satırı da taşır", () => {
    for (const id of [
      "message-menu-copy-text",
      "message-menu-edit",
      "message-menu-forward",
      "message-menu-copy-link",
      "message-menu-delete",
    ]) {
      assert.ok(TOOLBAR.includes(`data-testid="${id}"`), id);
    }
  });

  /**
   * Pasif bir `Düzenle`, kullanıcıya yapamayacağı bir şeyi göstermekten başka bir
   * şey demez; yetkisiz satır çizilmez.
   */
  it("Düzenle yalnız kendi mesajında, Sil kendi mesajında ya da yetkilide", () => {
    assert.match(TOOLBAR, /\{isOwner \? \(\s*<button\s*\n\s*className=\{itemClassName\}/);
    assert.match(TOOLBAR, /\{isOwner \|\| canModerate \? \(/);
  });

  it("ilet satırı geri çağrı yoksa çizilmez", () => {
    assert.match(TOOLBAR, /\{onForward \? \(/);
  });

  it("menü genişliği sözlükten gelir", () => {
    assert.match(TOOLBAR, /width: pxToRem\(menuMetrics\.menuWidth\)/);
  });
});

describe("grup satırı (SPEC §5.4)", () => {
  it("rol çipi yalnız OWNER/ADMIN için", () => {
    assert.match(SOURCE, /authorRole === "OWNER" \|\| authorRole === "ADMIN"/);
    assert.ok(SOURCE.includes('data-testid="message-role-chip"'));
  });

  it("bahsetme şeridi mentionsMe ile çizilir", () => {
    assert.match(SOURCE, /data-mentions-me=\{mentionsMe \? "true" : undefined\}/);
    assert.match(SOURCE, /mentionStripeWidth/);
  });

  it("anket yuvası çizilir ama satır anketi bilmez", () => {
    assert.ok(SOURCE.includes('data-testid="message-poll-slot"'));
    // Satır anket durumunu, oy isteğini veya aboneliğini taşımaz. Çağrı
    // biçimiyle aranıyor: aynı adlar açıklama yorumlarında da geçiyor ve düz
    // arama kendi yorumunu ihlal sanardı.
    assert.doesNotMatch(SOURCE, /castPollVote\(|usePoll\(|socket\.on\("poll:updated"/);
  });

  it("thread şeridi kimlikle panel açar", () => {
    assert.match(SOURCE, /onOpenThread \? onOpenThread\(message\.id\) : onThread\(message\)/);
  });
});

describe("eski markdown anketi", () => {
  it("geriye dönük ayrıştırıcı @deprecated olarak duruyor", () => {
    assert.match(SOURCE, /@deprecated[\s\S]{0,900}function parsePollBlock/);
    assert.ok(SOURCE.includes("function parsePollBlock"));
  });
});

describe("bahsetme türetimi", () => {
  it("kullanıcı adını büyük/küçük harften bağımsız yakalar", () => {
    assert.equal(mentionsUser("selam @Ada bak", "ada"), true);
    assert.equal(mentionsUser("selam @adalet bak", "ada"), false);
  });

  /** Kod örneğindeki `@ada` bir bahsetme değildir; kenara şerit çekmemeli. */
  it("kod bloğundaki bahsetmeyi saymaz", () => {
    const fence = "```";

    assert.equal(mentionsUser(`${fence}\nselam @ada\n${fence}`, "ada"), false);
  });

  it("kullanıcı adı yoksa false", () => {
    assert.equal(mentionsUser("selam @ada", null), false);
    assert.equal(mentionsUser("selam @ada", "   "), false);
  });
});

describe("memo karşılaştırması", () => {
  const stable = () => undefined;

  function makeProps(): MessageItemProps {
    return {
      canModerate: false,
      currentUserId: "viewer-1",
      isGrouped: false,
      message: {
        attachments: [],
        author: {
          avatarUrl: null,
          customStatus: null,
          displayName: "Ada",
          id: "author-1",
          status: "ONLINE",
          username: "ada",
        },
        channelId: "channel-1",
        content: "Merhaba",
        createdAt: "2026-08-20T10:00:00.000Z",
        deletedAt: null,
        editedAt: null,
        id: "message-1",
        reactions: [],
        type: "DEFAULT",
      },
      mode: "dm",
      onReact: stable,
      onRemoveOptimistic: stable,
      onReply: stable,
      onRetry: stable,
      onThread: stable,
    };
  }

  /**
   * Yeni alanlar karşılaştırmaya girmeseydi, rol çipi ya da anket kartı değişip
   * satır olduğu gibi kalırdı — memo'nun sessiz bayatlaması.
   */
  it("yeni alanlar karşılaştırmaya dâhil", () => {
    for (const patch of [
      { authorRole: "ADMIN" } as const,
      { currentUsername: "ada" } as const,
      { onOpenThread: stable } as const,
      { onTogglePin: stable } as const,
      { onForward: stable } as const,
    ]) {
      assert.equal(
        areMessageItemPropsEqual(makeProps(), { ...makeProps(), ...patch }),
        false,
        Object.keys(patch)[0],
      );
    }
  });

  it("değişmemiş prop kümesi eşit sayılır", () => {
    const props = makeProps();

    assert.equal(areMessageItemPropsEqual(props, { ...props }), true);
  });
});

/**
 * Sanal satırın `transform`ı her satırı ayrı bir yığın bağlamı yapar. Menü
 * satırın içinde `z-30` olsa bile yalnız o bağlamda yükselir; sonraki satırlar
 * DOM sırasıyla üstüne boyanır ve `Metni kopyala`/`Düzenle` tıklaması menüye
 * değil altta kalan mesaja düşerdi — odak arkadaki satıra kayardı.
 */
describe("açık menünün yığın sırası (SPEC §5.3)", () => {
  it("satır menü açıkken kendini imliyor", () => {
    assert.ok(SOURCE.includes('data-actions-open={actionsOpen ? "true" : undefined}'));
  });

  it("sanal satır sarmalayıcısı imli satırı kardeşlerinin üstüne alıyor", () => {
    assert.ok(LIST.includes("has-[[data-actions-open]]:z-30"));
  });
});

/**
 * Alt eylem çubuğu `fixed`; transform'lu sanal satırın içinde kalsaydı ekranın
 * altına değil **satırın** altına otururdu — transform'lu ata `fixed` için
 * içeren blok olur.
 */
describe("mobil eylem çubuğunun çıpası (SPEC §5.3)", () => {
  it("çubuk gövdeye portallanıyor", () => {
    assert.ok(SOURCE.includes('import { createPortal } from "react-dom";'));
    assert.match(
      SOURCE,
      /\? createPortal\(\s*<div\s*className="fixed inset-x-3 bottom-\[max\(0\.75rem,env\(safe-area-inset-bottom\)\)\] z-\[90\]/u,
    );
  });
});
