import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

const outDir = process.argv[2];
const htmlPath = process.argv[3];
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 3 });
await page.goto(`file:///${htmlPath.replace(/\\/g, "/")}`);
await page.waitForTimeout(2500);

for (const anchor of ["4a", "4b", "4c"]) {
  // The phone frame is the second child of the .dv-opt block (first is the label).
  const frame = page.locator(`[id="${anchor}"] > div`).nth(1);
  await frame.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  const file = path.join(outDir, `${anchor}-reference.png`);
  await frame.screenshot({ path: file });
  const box = await frame.boundingBox();
  console.log(`${anchor}: ${file} (${box.width}x${box.height})`);
}

await browser.close();
