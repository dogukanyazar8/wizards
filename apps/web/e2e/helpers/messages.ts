import type { Page } from "@playwright/test";
import { expect } from "../fixtures/test";
import { visibleTestId } from "./navigation";

export async function sendComposerMessage(page: Page, content: string): Promise<void> {
  const input = visibleTestId(page, "message-input");
  const sendButton = visibleTestId(page, "message-send-button");

  await expect(input).toBeVisible();
  await expect(input).toBeEnabled({ timeout: 15_000 });
  await input.fill("");
  await input.click();
  await page.keyboard.type(content, { delay: 1 });
  await expect(input).toHaveValue(content);
  await expect(sendButton).toBeEnabled({ timeout: 15_000 });
  await sendButton.click();
}
