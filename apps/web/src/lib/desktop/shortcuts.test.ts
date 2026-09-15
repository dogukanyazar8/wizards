import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_DESKTOP_SHORTCUT_ASSIGNMENTS,
  DESKTOP_SHORTCUT_ACTIONS,
  captureDesktopShortcut,
  countDesktopShortcutConflicts,
  fromDesktopShortcutCapsules,
  isReservedDesktopShortcut,
  isValidDesktopShortcut,
  mergeDesktopShortcutStatus,
  sanitizeDesktopShortcutAssignments,
  toDesktopShortcutAssignments,
  toDesktopShortcutCapsules,
  type DesktopShortcutBridgeEntry,
} from "./shortcuts";

/** Ş10 · K7 — beş eylem, çakışma gerçek kayıttan. */

function keyEvent(overrides: Partial<Parameters<typeof captureDesktopShortcut>[0]>) {
  return captureDesktopShortcut({
    altKey: false,
    code: "",
    ctrlKey: false,
    key: "",
    metaKey: false,
    shiftKey: false,
    ...overrides,
  });
}

describe("masaüstü kısayol sözleşmesi", () => {
  it("beş eylem tasarımın sırasında", () => {
    assert.deepEqual(
      [...DESKTOP_SHORTCUT_ACTIONS],
      ["toggleMute", "toggleDeafen", "pushToTalk", "hideOverlay", "moderationConsole"],
    );
  });

  it("varsayılanlar beş geçerli Windows kombinasyonu", () => {
    assert.deepEqual(
      DESKTOP_SHORTCUT_ACTIONS.map((action) =>
        toDesktopShortcutCapsules(DEFAULT_DESKTOP_SHORTCUT_ASSIGNMENTS[action], "windows").join(
          "+",
        ),
      ),
      ["Alt+M", "Alt+D", "Alt+V", "Alt+H", "Alt+Shift+K"],
    );
  });

  it("değiştiricileri platform dilinde gösterir", () => {
    assert.deepEqual(toDesktopShortcutCapsules("Control+Alt+Shift+Meta+K", "windows"), [
      "Ctrl",
      "Alt",
      "Shift",
      "Win",
      "K",
    ]);
    assert.deepEqual(toDesktopShortcutCapsules("Control+Alt+Shift+Meta+K", "macos"), [
      "⌃",
      "⌥",
      "⇧",
      "⌘",
      "K",
    ]);
    assert.deepEqual(toDesktopShortcutCapsules("Control+Alt+Shift+Meta+K", "linux"), [
      "Ctrl",
      "Alt",
      "Shift",
      "Super",
      "K",
    ]);
  });

  it("kapsül ve hızlandırıcı birbirinin tersi", () => {
    for (const action of DESKTOP_SHORTCUT_ACTIONS) {
      const accelerator = DEFAULT_DESKTOP_SHORTCUT_ASSIGNMENTS[action];

      assert.equal(
        fromDesktopShortcutCapsules(toDesktopShortcutCapsules(accelerator)),
        accelerator,
      );
    }
  });

  it("CmdOrCtrl on macOS means Command while literal Control stays Control", () => {
    assert.deepEqual(toDesktopShortcutCapsules("CmdOrCtrl+Alt+1", "macos"), ["⌘", "⌥", "1"]);
    assert.deepEqual(toDesktopShortcutCapsules("Control+Alt+1", "macos"), ["⌃", "⌥", "1"]);
    assert.deepEqual(toDesktopShortcutCapsules("CmdOrCtrl+Alt+1", "windows"), ["Ctrl", "Alt", "1"]);
    assert.deepEqual(toDesktopShortcutCapsules("Alt+Shift+K"), ["Alt", "Shift", "K"]);
    assert.deepEqual(toDesktopShortcutCapsules("Meta+1", null), ["Meta", "1"]);
  });

  it("tanınmayan parça olduğu gibi kalır", () => {
    assert.deepEqual(toDesktopShortcutCapsules("Hyper+K"), ["Hyper", "K"]);
  });
});

describe("kısayol doğrulaması", () => {
  it("`+space` ile biten her kombinasyon rezerve", () => {
    assert.ok(isReservedDesktopShortcut("Alt+Space"));
    assert.ok(isReservedDesktopShortcut("CmdOrCtrl+Shift+Space"));
    assert.ok(isReservedDesktopShortcut("Alt+F4"));
    assert.ok(isReservedDesktopShortcut("Control+Shift+V"));
    assert.ok(isReservedDesktopShortcut("Meta+Shift+S"));
    assert.ok(!isReservedDesktopShortcut("Alt+M"));
  });

  it("değiştiricisiz tuş yalnız F13–F24 için geçerli", () => {
    assert.ok(isValidDesktopShortcut("F13"));
    assert.ok(!isValidDesktopShortcut("M"));
    assert.ok(!isValidDesktopShortcut("F5"));
  });

  it("boş, çok uzun ve rezerve kombinasyonlar geçersiz", () => {
    assert.ok(!isValidDesktopShortcut(""));
    assert.ok(!isValidDesktopShortcut(`Alt+${"K".repeat(80)}`));
    assert.ok(!isValidDesktopShortcut("Alt+Space"));
    assert.ok(!isValidDesktopShortcut("Alt+"));
  });

  it("tanınmayan değiştirici geçersiz", () => {
    assert.ok(!isValidDesktopShortcut("Hyper+K"));
    assert.ok(isValidDesktopShortcut("Control+Alt+Shift+K"));
  });
});

describe("tuş yakalama", () => {
  it("`Esc` iptal eder", () => {
    assert.deepEqual(keyEvent({ code: "Escape", key: "Escape" }), { kind: "cancel" });
  });

  it("tek başına değiştirici henüz bir kombinasyon değil", () => {
    assert.deepEqual(keyEvent({ altKey: true, code: "AltLeft", key: "Alt" }), { kind: "pending" });
  });

  it("`event.code` okunur — `⌥M` macOS'ta `µ` üretir", () => {
    assert.deepEqual(keyEvent({ altKey: true, code: "KeyM", key: "µ" }), {
      accelerator: "Alt+M",
      kind: "captured",
    });
  });

  it("değiştirici sırası sabit: Control · Alt · Shift · Meta", () => {
    assert.deepEqual(
      keyEvent({
        altKey: true,
        code: "KeyK",
        ctrlKey: true,
        key: "k",
        metaKey: true,
        shiftKey: true,
      }),
      { accelerator: "Control+Alt+Shift+Meta+K", kind: "captured" },
    );
  });
});

describe("çakışma birleştirme", () => {
  const bridge: DesktopShortcutBridgeEntry[] = [
    { action: "toggleMute", conflict: false, keys: ["Alt", "M"], registered: true },
    { action: "toggleDeafen", conflict: false, keys: ["Alt", "D"], registered: true },
    { action: "pushToTalk", conflict: false, keys: ["Alt", "V"], registered: true },
    { action: "hideGameOverlay", conflict: true, keys: ["Alt", "H"], registered: false },
    {
      action: "toggleAdminConsole",
      conflict: false,
      keys: ["Alt", "Shift", "K"],
      registered: true,
    },
  ];

  it("kabuk etiketi sözleşme eylemine çevrilir", () => {
    const merged = mergeDesktopShortcutStatus(
      DEFAULT_DESKTOP_SHORTCUT_ASSIGNMENTS,
      bridge,
      true,
      "windows",
    );

    assert.deepEqual(
      merged.map((shortcut) => [shortcut.action, shortcut.conflict]),
      [
        ["toggleMute", false],
        ["toggleDeafen", false],
        ["pushToTalk", false],
        ["hideOverlay", true],
        ["moderationConsole", false],
      ],
    );
  });

  it("çakışma sayısı gerçek kayıttan; sabit 1 yok", () => {
    assert.equal(
      countDesktopShortcutConflicts(
        mergeDesktopShortcutStatus(DEFAULT_DESKTOP_SHORTCUT_ASSIGNMENTS, bridge, true),
      ),
      1,
    );
  });

  it("kabuk anahtarları eski hesap atamalarından üstündür", () => {
    const merged = mergeDesktopShortcutStatus(
      { ...DEFAULT_DESKTOP_SHORTCUT_ASSIGNMENTS, toggleMute: "Alt+M" },
      [
        {
          action: "toggleMute",
          conflict: false,
          keys: ["Control", "Shift", "M"],
          registered: true,
        },
      ],
      true,
      "windows",
    );

    assert.deepEqual(merged[0]?.keys, ["Ctrl", "Shift", "M"]);
  });

  it("köprü yoksa hiçbir satır çakışmalı değil", () => {
    const merged = mergeDesktopShortcutStatus(DEFAULT_DESKTOP_SHORTCUT_ASSIGNMENTS, null, true);

    assert.equal(countDesktopShortcutConflicts(merged), 0);
    assert.equal(merged.length, 5);
  });

  it("anahtar kapalıyken kayıt denemesi yok, çakışma da yok", () => {
    assert.equal(
      countDesktopShortcutConflicts(
        mergeDesktopShortcutStatus(DEFAULT_DESKTOP_SHORTCUT_ASSIGNMENTS, bridge, false),
      ),
      0,
    );
  });

  it("köprü bir satırı hiç bildirmezse o satır çakışmalı sayılmaz", () => {
    const merged = mergeDesktopShortcutStatus(
      DEFAULT_DESKTOP_SHORTCUT_ASSIGNMENTS,
      [bridge[0] as DesktopShortcutBridgeEntry],
      true,
    );

    assert.equal(countDesktopShortcutConflicts(merged), 0);
  });
});

describe("atamaların saklanması (SPEC_DEVIATIONS #11)", () => {
  it("tanınmayan anahtar atılır, eksik eylem varsayılana döner", () => {
    assert.deepEqual(
      sanitizeDesktopShortcutAssignments({ toggleMute: "Control+Alt+1", nope: "Alt+Z" }),
      { ...DEFAULT_DESKTOP_SHORTCUT_ASSIGNMENTS, toggleMute: "Control+Alt+1" },
    );
  });

  it("geçersiz kombinasyon varsayılana döner", () => {
    assert.equal(
      sanitizeDesktopShortcutAssignments({ toggleMute: "Alt+Space" }).toggleMute,
      DEFAULT_DESKTOP_SHORTCUT_ASSIGNMENTS.toggleMute,
    );
  });

  it("JSON olmayan değer beş varsayılanı verir", () => {
    assert.deepEqual(
      sanitizeDesktopShortcutAssignments(null),
      DEFAULT_DESKTOP_SHORTCUT_ASSIGNMENTS,
    );
    assert.deepEqual(sanitizeDesktopShortcutAssignments("x"), DEFAULT_DESKTOP_SHORTCUT_ASSIGNMENTS);
  });

  it("sözleşme satırları atamalara geri çevrilir", () => {
    assert.deepEqual(
      toDesktopShortcutAssignments([
        { action: "toggleMute", conflict: false, keys: ["⌃", "⌥", "1"] },
        { action: "hideOverlay", conflict: true, keys: ["⌥", "H"] },
      ]),
      {
        ...DEFAULT_DESKTOP_SHORTCUT_ASSIGNMENTS,
        hideOverlay: "Alt+H",
        toggleMute: "Control+Alt+1",
      },
    );
  });
});
