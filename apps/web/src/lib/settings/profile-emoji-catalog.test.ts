import assert from "node:assert/strict";
import { it } from "node:test";
import data, { type EmojiMartData } from "@emoji-mart/data";
import { buildProfileEmojiCatalog, normalizeEmojiQuery } from "./profile-emoji-index";

it("retains the complete catalog, including whole skin-tone and ZWJ variants", () => {
  const entries = buildProfileEmojiCatalog(data as unknown as EmojiMartData);
  assert.equal(new Set(entries.map((entry) => entry.native)).size, entries.length);
  assert.ok(entries.some((entry) => entry.native === "👩🏽‍💻"));
  assert.ok(
    entries.some(
      (entry) => entry.native === "😀" && entry.keywords.includes(normalizeEmojiQuery("grinning")),
    ),
  );
  assert.ok(entries.length > 3000);
});
