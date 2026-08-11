import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { mobileGroupChatMetrics } from "../src/design/mobile-group-chat-metrics";
import { redesignGroupChatDark, redesignGroupChatLight } from "../src/design/palette";
import { darkTheme, lightTheme } from "../src/design/themes";
import { mobileCopy } from "../src/locale/mobile-copy";
import { parseMobileDeepLink } from "../src/deep-link/mobile-deep-links";
import { resolveMobileRoutePathIntent } from "../src/navigation/mobile-linking";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

function collectLeafPaths(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return [prefix];
  }

  return Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) =>
    collectLeafPaths(entry, prefix ? `${prefix}.${key}` : key),
  );
}

describe("theme.groupChat (§B1)", () => {
  it("exists in both themes with the same key set", () => {
    assert.deepEqual(
      collectLeafPaths(darkTheme.groupChat).sort(),
      collectLeafPaths(lightTheme.groupChat).sort(),
    );
  });

  it("covers the forty sub-groups the handoff measures", () => {
    assert.equal(Object.keys(lightTheme.groupChat).length >= 40, true);
  });

  /**
   * `theme.groupChat` is a shallow merge of the metric block over the colour
   * block, so a name that appears in both silently loses one of them — a ring
   * *width* and a ring *colour* called `tileRing` end up as one value. This is
   * the guard that makes that impossible to reintroduce.
   */
  it("keeps metric and colour names disjoint in every sub-group", () => {
    const metrics = mobileGroupChatMetrics as unknown as Record<string, Record<string, unknown>>;
    const collisions = Object.entries(
      redesignGroupChatLight as unknown as Record<string, Record<string, unknown>>,
    ).flatMap(([group, colors]) =>
      Object.keys(colors)
        .filter((token) => token in (metrics[group] ?? {}))
        .map((token) => `${group}.${token}`),
    );

    assert.deepEqual(collisions, []);
  });

  it("declares the same colour tokens in both palette blocks", () => {
    assert.deepEqual(
      collectLeafPaths(redesignGroupChatDark).sort(),
      collectLeafPaths(redesignGroupChatLight).sort(),
    );
  });

  it("carries the measurements straight off the handoff", () => {
    // HTML 57-62, 66-71, 154-158, 303-312, 333-340, 446-448.
    assert.equal(lightTheme.groupChat.filterChip.height, 30);
    assert.equal(lightTheme.groupChat.filterChip.radius, 11);
    assert.equal(lightTheme.groupChat.groupRow.pairSize, 46);
    assert.equal(lightTheme.groupChat.groupRow.tileSize, 30);
    assert.equal(lightTheme.groupChat.groupRow.tileRing, 2.5);
    assert.equal(lightTheme.groupChat.groupRow.hairlineInset, 79);
    assert.equal(lightTheme.groupChat.stepBar.height, 3);
    assert.equal(lightTheme.groupChat.incomingBubble.radius, 18);
    assert.equal(lightTheme.groupChat.incomingBubble.tailRadius, 7);
    assert.equal(lightTheme.groupChat.incomingBubble.bodyLineHeightRatio, 1.42);
    assert.equal(lightTheme.groupChat.outgoingBubble.blockPaddingLeft, 38);
    assert.equal(lightTheme.groupChat.toggle.width, 44);
    assert.equal(lightTheme.groupChat.toggle.thumb, 20);
    assert.equal(lightTheme.groupChat.identityAvatar.size, 72);
    assert.equal(lightTheme.groupChat.infoIdentity.avatarSize, 80);
  });

  it("keeps every measurement identical across themes — only colour moves", () => {
    for (const [group, tokens] of Object.entries(lightTheme.groupChat)) {
      for (const [token, value] of Object.entries(tokens as Record<string, unknown>)) {
        if (typeof value !== "number") {
          continue;
        }

        assert.equal(
          (darkTheme.groupChat as Record<string, Record<string, unknown>>)[group]?.[token],
          value,
          `${group}.${token}`,
        );
      }
    }
  });

  it("derives dark from §0.2's mapping table", () => {
    assert.equal(lightTheme.groupChat.surfaces.screen, "#F6F7FB");
    assert.equal(darkTheme.groupChat.surfaces.screen, "#12141F");
    assert.equal(darkTheme.groupChat.surfaces.card, "#1B1E2C");
    assert.equal(darkTheme.groupChat.incomingBubble.bg, "#1E2235");
    assert.equal(darkTheme.groupChat.composer.fieldBg, "rgba(255,255,255,.07)");
    assert.equal(darkTheme.groupChat.settingsCard.divider, "rgba(255,255,255,.07)");
    assert.equal(darkTheme.groupChat.rowTyping.text, "#4ADE80");
  });

  it("leaves the outgoing bubble and the sender palette alone on dark (identity, not chrome)", () => {
    assert.deepEqual(darkTheme.groupChat.outgoingBubble, lightTheme.groupChat.outgoingBubble);
    assert.deepEqual(
      darkTheme.groupChat.colorSwatch.options,
      lightTheme.groupChat.colorSwatch.options,
    );
  });

  it("answers the two tokens the mapping table had no row for", () => {
    // Decided with the user (03 §F): an ink chip would vanish against `#1B1E2C`,
    // so the active filter chip takes the brand fill.
    assert.equal(lightTheme.groupChat.filterChip.activeBg, "#1E2235");
    assert.equal(darkTheme.groupChat.filterChip.activeBg, "#4F46E5");
    assert.equal(lightTheme.groupChat.rowBadges.mutedBg, "#C9CDE3");
    assert.equal(darkTheme.groupChat.rowBadges.mutedBg, "rgba(255,255,255,.18)");
  });

  it("flattens the neutral lift on dark and keeps the two brand-tinted ones", () => {
    assert.equal(darkTheme.elevation.groupChatCameraButton.shadowOpacity, 0);
    assert.equal(darkTheme.elevation.groupChatPrimaryAction.shadowOpacity, 0.3);
    assert.equal(lightTheme.elevation.groupChatPrimaryAction.shadowRadius, 18);
    assert.equal(lightTheme.elevation.groupChatComposerAction.shadowRadius, 14);
  });
});

describe("group copy (§B2)", () => {
  const groupKeys = Object.keys(mobileCopy.tr).filter(
    (key) => key.startsWith("group") || key.startsWith("messages"),
  );

  it("has an English value for every Turkish group key", () => {
    for (const key of groupKeys) {
      assert.ok(key in mobileCopy.en, `${key} missing from the English table`);
    }
  });

  it("never ships an untranslated English value", () => {
    for (const key of groupKeys) {
      const turkish = mobileCopy.tr[key as keyof typeof mobileCopy.tr];
      const english = mobileCopy.en[key as keyof typeof mobileCopy.en];
      if (typeof turkish !== "string" || typeof english !== "string") {
        continue;
      }

      // Numbers, punctuation and role chips legitimately match; a whole sentence
      // that matches is a copy-paste.
      if (turkish.length > 24) {
        assert.notEqual(english, turkish, `${key} is the Turkish string`);
      }
    }
  });

  it("uses the same placeholders in both languages", () => {
    for (const key of groupKeys) {
      const turkish = mobileCopy.tr[key as keyof typeof mobileCopy.tr];
      const english = mobileCopy.en[key as keyof typeof mobileCopy.en];
      if (typeof turkish !== "string" || typeof english !== "string") {
        continue;
      }

      assert.deepEqual(
        [...turkish.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort(),
        [...english.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort(),
        key,
      );
    }
  });

  it("keeps emoji out of every interface label (§0.5)", () => {
    for (const key of groupKeys) {
      const value = mobileCopy.tr[key as keyof typeof mobileCopy.tr];
      if (typeof value === "string") {
        assert.equal(/\p{Extended_Pictographic}/u.test(value), false, key);
      }
    }
  });

  it("writes the uppercase section heads out rather than leaning on textTransform", () => {
    assert.equal(mobileCopy.tr.groupSettingsNotifications, "BİLDİRİMLER");
    assert.equal(mobileCopy.tr.groupSettingsPermissions, "İZİNLER");
    assert.equal(mobileCopy.tr.messagesPinnedSection, "SABİTLENEN");
  });
});

describe("group routes and the /g/<code> link (§B6)", () => {
  const webUrl = "https://whispr.team";

  it("resolves a group invite path to its own route", () => {
    assert.deepEqual(resolveMobileRoutePathIntent("/g/ABCDEFGHJKLM"), {
      name: "GroupInvitePreview",
      params: { code: "ABCDEFGHJKLM" },
      type: "route",
    });
  });

  it("accepts the link through the deep-link gate", () => {
    assert.deepEqual(parseMobileDeepLink("whispr://g/ABCDEFGHJKLM", { webUrl }), {
      intent: { path: "/g/ABCDEFGHJKLM", type: "route" },
      ok: true,
    });
  });

  it("leaves the server invite on its own prefix", () => {
    // `/invite/<code>` is claimed earlier as a command intent; adding `/g` must
    // not have changed that, or one of the two links opens the wrong screen.
    assert.deepEqual(parseMobileDeepLink("whispr://invite/ABC_def-123", { webUrl }), {
      intent: { autoAccept: false, code: "ABC_def-123", type: "invite" },
      ok: true,
    });
  });

  it("does not widen `/g` into a neighbouring prefix", () => {
    assert.equal(parseMobileDeepLink("whispr://games/abc", { webUrl }).ok, false);
  });

  /**
   * Faz 5. Faz 3 registered these four against placeholders so the params and
   * the deep link could land early; this is the assertion that says the
   * placeholders are gone and the real containers took their place.
   */
  it("registers the four destinations against their real containers", () => {
    const navigator = read("../src/navigation/mobile-navigator.tsx");

    for (const [route, container] of [
      ["GroupInfo", "GroupInfoScreenContainer"],
      ["GroupSettings", "GroupSettingsScreenContainer"],
      ["GroupMembers", "GroupMembersScreenContainer"],
      ["GroupInvitePreview", "GroupInvitePreviewScreenContainer"],
    ] as const) {
      assert.match(navigator, new RegExp(`name="${route}"`), route);
      assert.match(navigator, new RegExp(`component=\\{${container}\\}`), container);
    }

    // The placeholder module and the older single `GroupDetails` route died with
    // them; a stray reference here means a screen is still pointing at nothing.
    assert.doesNotMatch(navigator, /mobile-group-route-placeholders/);
    assert.doesNotMatch(navigator, /name="GroupDetails"/);
  });
});
