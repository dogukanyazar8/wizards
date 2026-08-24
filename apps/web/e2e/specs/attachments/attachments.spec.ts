import { Buffer } from "node:buffer";
import type { Page } from "@playwright/test";
import { test, expect } from "../../fixtures/test";
import { loginAs } from "../../helpers/auth";
import {
  getE2EDMConversationId,
  getE2EServerRoute,
  getE2EAttachmentNotification,
  getLatestE2EAttachmentByFilename,
  processE2EAttachmentScanWithEicarDetector,
  setE2EAttachmentScanStatus,
  setE2EServerMediaSettings,
} from "../../helpers/db";
import { sendComposerMessage } from "../../helpers/messages";
import {
  gotoDmConversationRoute,
  gotoTextChannelRoute,
  visibleTestId,
} from "../../helpers/navigation";

const ONE_BY_ONE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
const EICAR_TEST_FILE = [
  "X5O!P%@AP[4\\PZX54(P^)7CC)7}$",
  "EICAR-STANDARD-ANTIVIRUS-TEST-FILE",
  "!$H+H*",
].join("");

function messageByText(page: Page, content: string) {
  return page.getByTestId("message-item").filter({ hasText: content }).last();
}

async function sendMessage(page: Page, content: string): Promise<void> {
  await sendComposerMessage(page, content);
}

function attachmentDraftByFilename(page: Page, filename: string) {
  return page.locator(`[data-testid="attachment-draft"][data-filename="${filename}"]`);
}

function fileAttachmentByFilename(page: Page, filename: string) {
  return page.locator(`[data-testid="message-file-attachment"][data-filename="${filename}"]`);
}

function unavailableAttachmentByFilename(page: Page, filename: string) {
  return page.locator(
    `[data-testid="message-attachment-unavailable"][data-filename="${filename}"]`,
  );
}

async function expectAttachmentUrlAbsent(page: Page, attachmentUrl: string): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate((url) => {
        const nodes = Array.from(document.querySelectorAll("[href], [src]"));
        return nodes.some((node) => {
          const href = node.getAttribute("href");
          const src = node.getAttribute("src");
          return href === url || src === url;
        });
      }, attachmentUrl),
    )
    .toBe(false);
}

async function waitForReadyAttachmentDraft(page: Page, filename: string): Promise<void> {
  const draft = attachmentDraftByFilename(page, filename);

  await expect(draft).toBeVisible({ timeout: 10_000 });
  await expect(draft).toHaveAttribute("data-status", "ready", { timeout: 10_000 });
}

async function pasteImageIntoComposer(page: Page, filename: string): Promise<void> {
  const input = visibleTestId(page, "message-input");

  await input.focus();
  await input.evaluate(
    (element, payload) => {
      const binary = window.atob(payload.base64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }

      const file = new File([bytes], payload.filename, { type: "image/png" });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      const event = new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: dataTransfer,
      });
      element.dispatchEvent(event);
    },
    {
      base64: ONE_BY_ONE_PNG_BASE64,
      filename,
    },
  );
}

async function openServerSettings(page: Page, serverId: string): Promise<void> {
  await page.getByTestId(`server-rail-server-${serverId}`).click({ button: "right" });
  await expect(page.getByTestId("server-context-settings")).toBeVisible({ timeout: 10_000 });
  await page.getByTestId("server-context-settings").click();
  await expect(page.getByTestId("server-settings-overlay")).toBeVisible({ timeout: 10_000 });
}

test.describe("uploads, GIFs, and attachments", () => {
  test.beforeEach(async () => {
    await setE2EServerMediaSettings({ allowFileUploads: true, allowGifs: true });
  });

  test("user can paste an image into a server message and open it in the lightbox", async ({
    page,
  }) => {
    const { serverId, textChannelId } = await getE2EServerRoute();
    const filename = `pasted-image-${Date.now()}.png`;
    const content = `Pasted image attachment ${Date.now()}`;

    await loginAs(page, "alice");
    await gotoTextChannelRoute(page, serverId, textChannelId);
    await pasteImageIntoComposer(page, filename);
    await waitForReadyAttachmentDraft(page, filename);
    await sendMessage(page, content);

    const message = messageByText(page, content);
    await expect(message).toBeVisible({ timeout: 10_000 });
    const imageAttachment = message.getByTestId("message-image-attachment").first();
    await expect(imageAttachment).toBeVisible({ timeout: 10_000 });

    await imageAttachment.click();
    const lightbox = page.getByTestId("image-lightbox");
    await expect(lightbox).toBeVisible({ timeout: 10_000 });
    await expect(lightbox.getByTestId("image-lightbox-zoom-in")).toBeVisible({
      timeout: 10_000,
    });
    await lightbox.getByTestId("image-lightbox-zoom-in").click();
    await page.keyboard.press("Escape");
    await expect(lightbox).toBeHidden({ timeout: 10_000 });
  });

  test("user can upload a file in a DM", async ({ page }) => {
    const conversationId = await getE2EDMConversationId();
    const filename = `dm-notes-${Date.now()}.txt`;
    const content = `DM file attachment ${Date.now()}`;

    await loginAs(page, "alice");
    await gotoDmConversationRoute(page, conversationId);
    await page.getByTestId("message-file-input").setInputFiles({
      buffer: Buffer.from("Whispr E2E file attachment"),
      mimeType: "text/plain",
      name: filename,
    });
    await waitForReadyAttachmentDraft(page, filename);
    await sendMessage(page, content);

    const message = messageByText(page, content);
    await expect(message).toBeVisible({ timeout: 10_000 });
    await expect(
      message.getByTestId("message-file-attachment").filter({ hasText: filename }),
    ).toBeVisible({
      timeout: 10_000,
    });
  });

  test("user can send a GIF when server GIFs are enabled", async ({ page }) => {
    const { serverId, textChannelId } = await getE2EServerRoute();
    const content = `GIF attachment ${Date.now()}`;

    await loginAs(page, "alice");
    await gotoTextChannelRoute(page, serverId, textChannelId);
    await page.getByTestId("gif-picker-button").click();
    await expect(page.getByTestId("gif-picker")).toBeVisible({ timeout: 10_000 });
    await page.getByTestId("gif-option").first().click();
    await expect(page.getByTestId("attachment-draft").first()).toHaveAttribute(
      "data-status",
      "ready",
      { timeout: 10_000 },
    );
    await sendMessage(page, content);

    const message = messageByText(page, content);
    await expect(message).toBeVisible({ timeout: 10_000 });
    await expect(
      message.locator('[data-testid="message-image-attachment"][data-content-type="image/gif"]'),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("server media settings disable GIFs and file uploads without a manual reload", async ({
    page,
  }) => {
    const { serverId, textChannelId } = await getE2EServerRoute();

    await loginAs(page, "alice");
    await gotoTextChannelRoute(page, serverId, textChannelId);
    await expect(page.getByTestId("gif-picker-button")).toBeEnabled();
    await expect(page.getByTestId("message-file-button")).toBeEnabled();

    await openServerSettings(page, serverId);
    await page.getByTestId("server-media-gifs-toggle").click();
    await page.getByTestId("server-media-files-toggle").click();
    await page.getByTestId("server-settings-save-overview").click();
    await expect(page.getByTestId("server-settings-overview-saved")).toBeVisible({
      timeout: 10_000,
    });
    await page.getByTestId("server-settings-close-button").click();

    await expect(page.getByTestId("server-settings-overlay")).toBeHidden({ timeout: 10_000 });
    await expect(page.getByTestId("gif-picker-button")).toBeDisabled({ timeout: 10_000 });
    await expect(page.getByTestId("message-file-button")).toBeDisabled({ timeout: 10_000 });
  });

  test("pending attachment scans keep uploader URLs visible and hide them from other viewers", async ({
    page,
  }) => {
    const { serverId, textChannelId } = await getE2EServerRoute();
    const filename = `pending-scan-${Date.now()}.txt`;
    const content = `Pending scan attachment ${Date.now()}`;

    await loginAs(page, "alice");
    await gotoTextChannelRoute(page, serverId, textChannelId);
    await page.getByTestId("message-file-input").setInputFiles({
      buffer: Buffer.from("pending scan e2e attachment"),
      mimeType: "text/plain",
      name: filename,
    });
    await waitForReadyAttachmentDraft(page, filename);
    await sendMessage(page, content);

    const attachment = await getLatestE2EAttachmentByFilename(filename);
    await setE2EAttachmentScanStatus(attachment.id, "PENDING");

    await page.reload();
    await gotoTextChannelRoute(page, serverId, textChannelId);
    await expect(messageByText(page, content)).toBeVisible({ timeout: 10_000 });
    await expect(fileAttachmentByFilename(page, filename)).toBeVisible({ timeout: 10_000 });
    await expect(fileAttachmentByFilename(page, filename)).toHaveAttribute("href", attachment.url);

    await loginAs(page, "bob");
    await gotoTextChannelRoute(page, serverId, textChannelId);
    await expect(messageByText(page, content)).toBeVisible({ timeout: 10_000 });
    await expect(fileAttachmentByFilename(page, filename)).toHaveCount(0);
    const unavailableAttachment = unavailableAttachmentByFilename(page, filename);
    await expect(unavailableAttachment).toBeVisible({ timeout: 10_000 });
    await expect(unavailableAttachment).toContainText(/Scanning|Taranıyor/i);
    await expectAttachmentUrlAbsent(page, attachment.url);
  });

  test("EICAR attachments are marked infected, hidden from everyone, and notify the uploader", async ({
    page,
  }) => {
    const { serverId, textChannelId } = await getE2EServerRoute();
    const filename = `eicar-${Date.now()}.txt`;
    const content = `EICAR scan attachment ${Date.now()}`;

    await loginAs(page, "alice");
    await gotoTextChannelRoute(page, serverId, textChannelId);
    await page.getByTestId("message-file-input").setInputFiles({
      buffer: Buffer.from(EICAR_TEST_FILE),
      mimeType: "text/plain",
      name: filename,
    });
    await waitForReadyAttachmentDraft(page, filename);
    await sendMessage(page, content);

    const attachment = await getLatestE2EAttachmentByFilename(filename);
    await setE2EAttachmentScanStatus(attachment.id, "PENDING");
    await processE2EAttachmentScanWithEicarDetector(attachment.id);
    await expect
      .poll(async () => (await getLatestE2EAttachmentByFilename(filename)).scanStatus)
      .toBe("INFECTED");
    await expect
      .poll(() => getE2EAttachmentNotification("alice", attachment.id))
      .toMatchObject({
        body: expect.stringContaining(filename),
        title: "Attachment removed",
      });

    await page.reload();
    await gotoTextChannelRoute(page, serverId, textChannelId);
    await expect(messageByText(page, content)).toBeVisible({ timeout: 10_000 });
    await expect(fileAttachmentByFilename(page, filename)).toHaveCount(0);
    const aliceUnavailableAttachment = unavailableAttachmentByFilename(page, filename);
    await expect(aliceUnavailableAttachment).toBeVisible({ timeout: 10_000 });
    await expect(aliceUnavailableAttachment).toContainText(/Blocked|Engellendi/i);
    await expectAttachmentUrlAbsent(page, attachment.url);
    // TODO(faz4): bildirim zili Faz 2'de kullanıcı ayağından kaldırıldı (SPEC §2.5), yeni yeri ana
    // alanın üst çubuğu. Aşağıdaki üç satır Faz 4 zili oraya koyunca aynen geri açılacak; testin
    // geri kalanı (ek kaldırıldı, URL erişilemez) bozulmadan koşmaya devam ediyor.
    // await page.getByTestId("notification-bell-button").click();
    // await expect(page.getByTestId("notification-popup")).toBeVisible({ timeout: 10_000 });
    // await expect(page.getByTestId("notification-item").filter({ hasText: filename })).toBeVisible({
    //   timeout: 10_000,
    // });

    await loginAs(page, "bob");
    await gotoTextChannelRoute(page, serverId, textChannelId);
    await expect(messageByText(page, content)).toBeVisible({ timeout: 10_000 });
    await expect(fileAttachmentByFilename(page, filename)).toHaveCount(0);
    const bobUnavailableAttachment = unavailableAttachmentByFilename(page, filename);
    await expect(bobUnavailableAttachment).toBeVisible({ timeout: 10_000 });
    await expect(bobUnavailableAttachment).toContainText(/Blocked|Engellendi/i);
    await expectAttachmentUrlAbsent(page, attachment.url);
  });
});
