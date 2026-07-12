import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = join(process.cwd(), "src");
const read = (...parts: string[]) => readFileSync(join(root, ...parts), "utf8");

test("two-factor secrets stay ephemeral and out of logging and clipboard surfaces", () => {
  const source = read("account", "mobile-two-factor-screen.tsx");
  assert.match(source, /mobile-2fa-setup-start/);
  assert.match(source, /mobile-2fa-confirm/);
  assert.match(source, /mobile-2fa-disable-password/);
  assert.doesNotMatch(source, /AsyncStorage|SecureStore|Clipboard|console\./);
});

test("GIF selection uses the in-house sheet, FlashList, and server-created attachment flow", () => {
  const picker = read("media", "mobile-gif-picker.tsx");
  const feature = read("app", "features", "use-mobile-messaging-feature.ts");
  assert.match(picker, /BottomSheet/);
  assert.match(picker, /FlashList/);
  assert.match(feature, /createMobileGiphyAttachment/);
  assert.match(feature, /attachments: \[input\]/);
});

test("link previews never fetch arbitrary message URLs from the device", () => {
  const client = read("messages", "mobile-link-preview-client.ts");
  const card = read("messages", "mobile-link-preview-card.tsx");
  assert.match(client, /\/api\/v1\/mobile\/link-preview/);
  assert.doesNotMatch(client, /\bfetch\s*\(/);
  assert.match(card, /mobileQueryKeys\.linkPreview\(messageId\)/);
  assert.doesNotMatch(card, /linkPreview\(url\)/);
});

test("DM details and settings information architecture expose stable automation IDs", () => {
  const details = read("dm", "mobile-dm-details-screen.tsx");
  const settings = read("app", "screens", "settings-screen.tsx");
  assert.match(details, /FlashList/);
  assert.match(details, /mobile-dm-details-participant/);
  for (const id of [
    "account",
    "security",
    "appearance",
    "notifications",
    "language",
    "about",
    "developer",
  ]) {
    assert.match(settings, new RegExp(`${id}:`));
  }
  assert.match(settings, /mobile-settings-open-2fa/);
});
