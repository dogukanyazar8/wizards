import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium, expect } from "@playwright/test";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = fileURLToPath(
  new URL("../../../output/playwright/discover-cards/", import.meta.url),
);
const bundle = build({
  absWorkingDir: root,
  bundle: true,
  write: false,
  platform: "browser",
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"development"', "process.env": "{}" },
  stdin: {
    resolveDir: root,
    loader: "tsx",
    contents: `
      import React from "react";
      import {createRoot} from "react-dom/client";
      import {DiscoverServerCard} from "@/components/discover/discover-server-card";
      import {DiscoverGrid} from "@/components/discover/discover-grid";
      import {buildDiscoverResponsiveCss} from "@/components/discover/discover-responsive";
      import {ServerIcon} from "@/components/shell/server-icon";
      import {ServerProfilePanel} from "@/components/discover/server-profile-panel";
      import {LocaleProvider} from "@/components/providers/locale-provider";
      import {getMessagesForLocale} from "@/lib/locale";
      const root = createRoot(document.getElementById("root"));
      window.actions = [];
      function Fixture({servers,panelOpen}) {
        const [selectedId,setSelectedId] = React.useState(panelOpen ? servers[0].id : null);
        const active = servers.find(server=>server.id===selectedId);
        const renderPanel = (server,onClose) => <ServerProfilePanel currentUserId="viewer" isError={false} isLoading={false}
          isMembershipPending={false} onJoin={()=>{}} onLeave={()=>{}} onRequestClose={onClose} onRetry={()=>{}}
          panelServerId={server.id} placeholderCategory={server.category} placeholderInitials={server.initials}
          placeholderName={server.name} profile={{...server, serverId:server.id, shortName:server.initials,
            createdAt:"2026-01-01T00:00:00Z", channels:[], mutualFriends:[], admins:[],
            channelCount:2, voiceRoomCount:1, mutualFriendCount:0, hasMoreChannels:false,
            inviteAddress:null, type:"COMMUNITY", accessLevel:"public"}}/>;
        return (
        <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
          <style>{buildDiscoverResponsiveCss()}</style>
          <aside aria-label="Sunucu barı" style={{width:74, flexShrink:0}}>
            {servers.map(server => <ServerIcon key={server.id} fallback={server.name}
              label={server.name} labelPreview={server.initials} iconColor={server.iconColor}
              iconUrl={server.iconUrl} testId={"rail-"+server.id} onClick={()=>{}}/>) }
          </aside>
          <main style={{minWidth:0, flex:1}}>
            <h1 style={{fontFamily:"var(--font-display)",fontSize:"1.375rem",fontWeight:600,marginBottom:16}}>Toplulukları keşfet</h1>
            <DiscoverGrid cardSize="medium" lane="servers" panelOpen={selectedId!==null}>
              {servers.map((server,index) => <DiscoverServerCard key={server.id} server={server}
                selected={server.id===selectedId} onOpen={s=>{window.actions.push(["open",s.id]);setSelectedId(s.id)}}
                onPreview={s=>{window.actions.push(["preview",s.id]);setSelectedId(s.id)}}
                onToggleJoin={s=>window.actions.push(["join",s.id])}/>) }
            </DiscoverGrid>
          </main>
          {active ? <div data-testid="visible-profile" style={{display:"contents"}}>{renderPanel(active,()=>setSelectedId(null))}</div> : null}
          <div hidden>{servers.map(server => <div key={server.id} data-profile={server.id}>
            {renderPanel(server,()=>{})}
          </div>)}</div>
        </LocaleProvider>
      );
      }
      window.mount = (servers, panelOpen = false) => root.render(<Fixture key={String(panelOpen)} servers={servers} panelOpen={panelOpen}/>);
    `,
  },
});
const cssPath = fileURLToPath(new URL("../src/app/globals.css", import.meta.url));
const css = readFile(cssPath, "utf8").then((content) =>
  postcss([tailwind()]).process(content, { from: cssPath }),
);
const font = readFile(new URL("../src/app/fonts/outfit-latin.woff2", import.meta.url));
const icon = readFile(new URL("../public/app-icons/whispr.png", import.meta.url));
const base = {
  category: "oyun",
  description: "Turnuvalar, ortak yayınlar ve birlikte oyun oynamak için buluşma noktası.",
  featured: false,
  iconColor: null,
  iconUrl: null,
  initials: "OYU",
  joined: false,
  languages: ["tr"],
  memberCount: 48200,
  onlineCount: 3910,
  tags: ["Turnuva", "Sohbet"],
};
const servers = [
  { ...base, id: "one", name: "Oyun Kulübü Türkiye" },
  {
    ...base,
    id: "two",
    name: "İzmir Tasarım Topluluğu",
    initials: "izı",
    iconColor: "accent2",
    joined: true,
    description: "Tasarım, ürün ve yaratıcı fikirler üzerine.",
    tags: ["Tasarım"],
  },
  {
    ...base,
    id: "three",
    name: "Whispr Topluluğu",
    initials: "WHI",
    iconUrl: "https://cards.invalid/icon.png",
    description: "Birlikte üret, paylaş, yeni insanlarla tanış.",
    tags: [],
  },
  {
    ...base,
    id: "four",
    name: "Çok Uzun Bir Sunucu İsmi İle Topluluk Başlığı",
    initials: "ABC",
    iconColor: "warning",
    description: "Uzun açıklamalar kart düzenini bozmamalı. ".repeat(16),
    tags: ["ÇokUzunEtiket".repeat(10), "Kodlama"],
  },
  {
    ...base,
    id: "five",
    name: "Yeni Topluluk",
    initials: "YEN",
    description: "",
    tags: [],
    memberCount: 1,
    onlineCount: 0,
  },
  {
    ...base,
    id: "six",
    name: "Müzik Odası",
    initials: "MÜZ",
    iconColor: "success",
    joined: true,
    description: "Yeni sesler keşfet, sevdiğin parçaları paylaş.",
    tags: ["Müzik", "Canlı yayın"],
  },
];

async function fixture(page, theme) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/font.woff2")
      return route.fulfill({ contentType: "font/woff2", body: await font });
    if (url.pathname === "/icon.png")
      return route.fulfill({ contentType: "image/png", body: await icon });
    if (url.pathname !== "/") return route.abort();
    return route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html lang="tr" class="theme-${theme}" data-theme="${theme}"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root" style="display:flex;gap:16px;padding:16px;max-width:1040px;margin:auto"></div></body></html>`,
    });
  });
  await page.goto("https://cards.invalid");
  await page.addStyleTag({ content: (await css).css });
  await page.addStyleTag({
    content:
      '@font-face{font-family:Outfit;src:url(/font.woff2);font-weight:100 900} :root{--font-sans:Outfit;--font-display:Outfit} @media(max-width:600px){aside[aria-label="Sunucu barı"]{display:none}}',
  });
  await page.addScriptTag({ content: (await bundle).outputFiles[0].text });
  assert.deepEqual(errors, []);
  await page.evaluate((servers) => window.mount(servers), servers);
  await expect(page.getByTestId("discover-server-card")).toHaveCount(6);
  await page.evaluate(() => document.fonts.ready);
  assert.equal(
    await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme),
    theme,
  );
  await expect(page.locator('[data-testid="discover-server-card-icon"] img')).toBeVisible();
  return errors;
}

for (const theme of ["light", "dark"]) {
  test(`${theme}: opening and closing profile reflows cards to available width`, async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({
        viewport: { width: 1500, height: 900 },
        reducedMotion: "reduce",
      });
      const errors = await fixture(page, theme);
      const grid = page.locator('[data-testid="discover-grid"] [data-layout="grid"]');
      const columns = () =>
        grid.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);
      assert.equal(await columns(), 3);
      await page.getByTestId("discover-server-card-open").first().click();
      await expect(page.getByTestId("visible-profile")).toBeVisible();
      assert.equal(await columns(), 2);
      const placement = await page.evaluate(() => {
        const grid = document
          .querySelector('[data-testid="discover-grid"]')
          .getBoundingClientRect();
        const panel = document
          .querySelector('[data-testid="visible-profile"] aside')
          .getBoundingClientRect();
        return { gridRight: grid.right, panelLeft: panel.left };
      });
      assert.ok(placement.gridRight <= placement.panelLeft);
      // A narrower container fits one column naturally while the panel stays on the right.
      await page.evaluate(() => (document.getElementById("root").style.maxWidth = "800px"));
      assert.equal(await columns(), 1);
      const dimensions = await grid.evaluate((el) => ({
        width: el.clientWidth,
        scroll: el.scrollWidth,
      }));
      assert.ok(dimensions.scroll <= dimensions.width);
      await page.evaluate(() => (document.getElementById("root").style.maxWidth = "1040px"));
      assert.equal(await columns(), 2);
      await mkdir(output, { recursive: true });
      await page.screenshot({ path: `${output}/${theme}-profile-grid.png`, fullPage: true });
      await page.getByTestId("visible-profile").locator("header button").click();
      await expect(page.getByTestId("visible-profile")).toHaveCount(0);
      assert.equal(await columns(), 3);
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  });

  test(`${theme}: profile icon appearance, card alignment and keyboard actions`, async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({
        viewport: { width: 1200, height: 900 },
        reducedMotion: "reduce",
      });
      const errors = await fixture(page, theme);
      for (let index = 0; index < servers.length; index++) {
        const identity = await page.evaluate(
          ({ id, index }) => {
            const profile = document.querySelector(
              '[data-profile="' + id + '"] [data-testid="server-profile-tile"]',
            );
            const card = document.querySelectorAll('[data-testid="discover-server-card-icon"]')[
              index
            ].firstElementChild;
            const styles = (element) => {
              const s = getComputedStyle(element);
              const properties = ["borderRadius", "width", "height"];
              if (!element.querySelector("img") && !s.backgroundImage.includes("url("))
                properties.push("backgroundColor", "color", "fontSize", "fontWeight", "lineHeight");

              return {
                text: element.textContent,

                styles: Object.fromEntries(properties.map((key) => [key, s[key]])),
              };
            };
            return {
              profile: styles(profile),
              card: styles(card),
              backing: getComputedStyle(card.parentElement).backgroundColor,
            };
          },
          { id: servers[index].id, index },
        );
        assert.deepEqual(identity.card, identity.profile);
        assert.match(identity.backing, /^rgb\(/);
      }
      const cards = page.getByTestId("discover-server-card");
      const footerTops = await cards.evaluateAll((elements) =>
        elements.map((el) => el.querySelector("[aria-pressed]").getBoundingClientRect().top),
      );
      assert.equal(footerTops[0], footerTops[1]);
      assert.equal(footerTops[1], footerTops[2]);
      assert.equal(footerTops[3], footerTops[4]);
      assert.equal(footerTops[4], footerTops[5]);
      const first = cards.first();
      await expect(first).toHaveCSS("transition-property", "none");
      const idleBorder = await first.evaluate((el) => getComputedStyle(el).borderColor);
      await first.hover();
      assert.notEqual(await first.evaluate((el) => getComputedStyle(el).borderColor), idleBorder);
      await first.getByTestId("discover-server-card-open").focus();
      await page.keyboard.press("Enter");
      await expect(page.getByTestId("visible-profile")).toBeVisible();
      // Opening the panel focuses its close control. Resume the card's tab order.
      await first.getByTestId("discover-server-card-open").focus();
      await page.keyboard.press("Tab");
      await expect(first.getByRole("button", { name: "Katıl", exact: true })).toBeFocused();
      await page.keyboard.press("Space");
      await page.keyboard.press("Tab");
      await expect(first.getByRole("button", { name: "Önizle", exact: true })).toBeFocused();
      await page.keyboard.press("Enter");
      // The stretched card link must not steal footer clicks.
      await first.getByRole("button", { name: "Önizle", exact: true }).click();
      assert.deepEqual(await page.evaluate(() => window.actions), [
        ["open", "one"],
        ["join", "one"],
        ["preview", "one"],
        ["preview", "one"],
      ]);
      await expect(cards.nth(1).getByRole("button", { name: "Katıldın" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      assert.deepEqual(errors, []);
      await page.getByRole("heading", { name: "Toplulukları keşfet" }).click();
      await mkdir(output, { recursive: true });
      await page.screenshot({ path: `${output}/${theme}-desktop.png`, fullPage: true });
    } finally {
      await browser.close();
    }
  });

  test(`${theme}: long content fits narrow screens and scaled text`, async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({
        viewport: { width: 390, height: 844 },
        reducedMotion: "reduce",
      });
      const errors = await fixture(page, theme);
      for (const fontSize of [16, 18]) {
        await page.evaluate(
          (size) => (document.documentElement.style.fontSize = size + "px"),
          fontSize,
        );
        const measurements = await page
          .getByTestId("discover-server-card")
          .evaluateAll((elements) =>
            elements.map((el) => ({
              width: el.clientWidth,
              scroll: el.scrollWidth,
              right: el.getBoundingClientRect().right,
              descriptionHeight: el.querySelector("p")?.getBoundingClientRect().height ?? 0,
              lineHeight: el.querySelector("p")
                ? parseFloat(getComputedStyle(el.querySelector("p")).lineHeight)
                : 0,
            })),
          );
        for (const measure of measurements) {
          assert.ok(measure.scroll <= measure.width + 1);
          assert.ok(measure.right <= 390);
          assert.ok(measure.descriptionHeight <= measure.lineHeight * 3 + 1);
        }
      }
      // Constrain the available feed width: a single column should be a space decision.
      await page.setViewportSize({ width: 1500, height: 900 });
      await page.evaluate((servers) => window.mount(servers, true), servers);
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "16px";
        document.getElementById("root").style.maxWidth = "800px";
      });
      const cards = page.getByTestId("discover-server-card");
      await expect(cards.nth(4).locator("p")).toHaveCount(0);
      const emptyHeight = (await cards.nth(4).boundingBox()).height;
      const shortHeight = (await cards.nth(2).boundingBox()).height;
      assert.ok(emptyHeight < 190, `empty card: ${emptyHeight}px`);
      assert.ok(shortHeight < 215, `short card: ${shortHeight}px`);
      assert.ok(shortHeight > emptyHeight);
      await page.screenshot({ path: `${output}/${theme}-single-column.png`, fullPage: true });
      await page.evaluate((servers) => window.mount(servers, false), servers);
      await page.setViewportSize({ width: 390, height: 844 });
      assert.deepEqual(errors, []);
      await mkdir(output, { recursive: true });
      await page.screenshot({ path: `${output}/${theme}-mobile.png`, fullPage: true });
    } finally {
      await browser.close();
    }
  });
}
