import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isTypingTarget, moveMentionCursor, resolveMentionShortcut } from "./keyboard";

/**
 * Ş5 — akış kısayolları (SPEC §9, PROMPT §5).
 *
 * Kısayolların tamamı **tek harf**. Tek harfli kısayolun tek gerçek riski, kullanıcı yazarken
 * tetiklenmesidir; bu modülün yarısı o riski kapatan iki fonksiyondan ibaret.
 */

function press(
  key: string,
  modifiers: Partial<Record<"alt" | "ctrl" | "meta" | "shift", boolean>> = {},
) {
  return {
    altKey: modifiers.alt ?? false,
    ctrlKey: modifiers.ctrl ?? false,
    key,
    metaKey: modifiers.meta ?? false,
    shiftKey: modifiers.shift ?? false,
  };
}

describe("resolveMentionShortcut", () => {
  it("J ve ↓ sonraki karta gider", () => {
    assert.equal(resolveMentionShortcut(press("j")), "next");
    assert.equal(resolveMentionShortcut(press("J", { shift: true })), "next");
    assert.equal(resolveMentionShortcut(press("ArrowDown")), "next");
  });

  it("K ve ↑ önceki karta gider", () => {
    assert.equal(resolveMentionShortcut(press("k")), "previous");
    assert.equal(resolveMentionShortcut(press("ArrowUp")), "previous");
  });

  it("R yanıtlar, E okundu durumunu çevirir, Esc kapatır", () => {
    assert.equal(resolveMentionShortcut(press("r")), "reply");
    assert.equal(resolveMentionShortcut(press("e")), "toggleRead");
    assert.equal(resolveMentionShortcut(press("Escape")), "close");
  });

  it("Ctrl/Meta/Alt ile birlikte hiçbir şey tetiklenmez", () => {
    // `Ctrl+R` sayfayı yeniler, `Cmd+E` tarayıcı kısayolu. Bunları çalmak, ekranın
    // dışındaki bir sözleşmeyi bozmak demek.
    assert.equal(resolveMentionShortcut(press("r", { ctrl: true })), null);
    assert.equal(resolveMentionShortcut(press("e", { meta: true })), null);
    assert.equal(resolveMentionShortcut(press("j", { alt: true })), null);
  });

  it("tanınmayan tuş sessizce geçer", () => {
    assert.equal(resolveMentionShortcut(press("a")), null);
    assert.equal(resolveMentionShortcut(press("Enter")), null);
  });
});

describe("isTypingTarget", () => {
  it("input, textarea ve select yazma yüzeyidir", () => {
    assert.equal(isTypingTarget({ tagName: "INPUT" }), true);
    assert.equal(isTypingTarget({ tagName: "TEXTAREA" }), true);
    assert.equal(isTypingTarget({ tagName: "SELECT" }), true);
  });

  it("contenteditable de yazma yüzeyidir", () => {
    assert.equal(isTypingTarget({ isContentEditable: true, tagName: "DIV" }), true);
  });

  it("akış konteyneri ve butonlar yazma yüzeyi değildir", () => {
    assert.equal(isTypingTarget({ tagName: "DIV" }), false);
    assert.equal(isTypingTarget({ tagName: "BUTTON" }), false);
    assert.equal(isTypingTarget(null), false);
  });
});

describe("moveMentionCursor", () => {
  const ids = ["a", "b", "c"];

  it("imleç yokken ilk karttan başlar", () => {
    assert.equal(moveMentionCursor(ids, null, 1), "a");
  });

  it("imleç yokken yukarı basmak son karta gider", () => {
    assert.equal(moveMentionCursor(ids, null, -1), "c");
  });

  it("komşu karta geçer", () => {
    assert.equal(moveMentionCursor(ids, "a", 1), "b");
    assert.equal(moveMentionCursor(ids, "c", -1), "b");
  });

  it("uçlarda durur, başa sarmaz", () => {
    // Sarmak, kullanıcının 40 kart aşağıdayken bir tuşla listenin başına fırlaması demek.
    assert.equal(moveMentionCursor(ids, "c", 1), "c");
    assert.equal(moveMentionCursor(ids, "a", -1), "a");
  });

  it("listeden düşmüş imleç ilk karta toparlanır", () => {
    // `Listeden kaldır` imlecin üstündeki kartı akıştan düşürebilir.
    assert.equal(moveMentionCursor(ids, "silinmis", 1), "a");
  });

  it("boş listede imleç yok", () => {
    assert.equal(moveMentionCursor([], null, 1), null);
    assert.equal(moveMentionCursor([], "a", -1), null);
  });
});
