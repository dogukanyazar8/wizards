import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium, expect } from "@playwright/test";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";

// Render production components and CSS without an app server, credentials or writes.
async function fixture(page) {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const bundle = await build({
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
      import { createRoot } from "react-dom/client";
      import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
      import { LocaleProvider } from "@/components/providers/locale-provider";
      import { getMessagesForLocale } from "@/lib/locale";
      import { Modal } from "@/components/ui/modal";
      import { ServerModalShell } from "@/components/servers/modals/server-modal-shell";
      import { CreateChannelModal } from "@/components/servers/modals/create-channel-modal";
      import { createChannelAdvancedSettings } from "@/components/servers/modals/channel-form-model";
      import { CreateServerModal } from "@/components/servers/modals/create-server-modal";
      import { CreateEventModal } from "@/components/servers/modals/create-event-modal";
      import { EventCreateModal } from "@/components/events/event-create-modal";
      import { GroupCreateDialog } from "@/components/dm/group-create-dialog";
      import { ServerSettingsOverlay } from "@/components/shell/server-settings/server-settings-overlay";
      import { MemberRolesDialog } from "@/components/shell/server-settings/sections/member-roles-dialog";
      import { ConversationHeader } from "@/components/messages/conversation-header";
      import { MessagesSidePanel } from "@/components/messages/messages-side-panel";
      import { UserProfilePopover } from "@/components/shared/user-profile-popover";
      import { ContextMenu, ContextMenuItem } from "@/components/ui/context-menu";
      const noop = () => {};
      const detail = {categories:[],ungroupedChannels:[],invites:[],members:[],roles:[],
        memberPage:{items:[],nextCursor:null,totalCount:1},
        server:{id:"test",name:"Test server",shortName:"TST",description:"Test description",iconUrl:null,iconColor:"primary",
          isOwner:true,memberCount:1,canManage:true,availableRtcRegions:[],visibility:"PRIVATE",viewerPermissions:[],tags:[],type:"COMMUNITY",isPublic:false,discoverable:false}};
      const queryClient = new QueryClient({defaultOptions:{queries:{retry:false}}});
      const root = createRoot(document.getElementById("root"));
      const tall = <div style={{height:1400}}>Long content<button style={{display:"block",marginTop:1300}}>Last field</button></div>;
      window.mount = (kind, locale = "tr") => root.render(<QueryClientProvider client={queryClient}>
        <LocaleProvider key={locale} initialLocale={locale} initialMessages={getMessagesForLocale(locale)}>
        <React.Fragment key={kind}>
        {kind === "modal" && <Modal open onClose={noop} title="Dialog">{tall}</Modal>}
        {kind === "shell" && <ServerModalShell open onClose={noop} title="Dialog" description="Description" closeLabel="Close" icon={null} width="channel" footer={<button data-testid="footer">Save</button>}>{tall}</ServerModalShell>}
        {kind === "channel" && <CreateChannelModal open onClose={noop} advancedSettings={createChannelAdvancedSettings()} allowedRoleIds={[]} categoryId={null} name="Test" onAdvancedSettingsChange={noop} onAllowedRoleIdsChange={noop} onCategoryChange={noop} onNameChange={noop} onPresetChange={noop} onSubmit={noop} onTopicChange={noop} onTypeChange={noop} permissionsEditable preset="PUBLIC" serverDetail={detail} topic="" type="TEXT" mode="create" canSubmit pending={false}/>}
        {kind === "server" && <CreateServerModal open onClose={noop} onNavigate={noop} uploadthingEnabled={false}/>}
        {kind === "event" && <CreateEventModal open onClose={noop} detail={detail}/>}
        {kind === "event-page" && <EventCreateModal onClose={noop} serverDetail={detail}/>}
        {kind === "group" && <GroupCreateDialog open onClose={noop} onSubmit={noop} friends={[]}/>}
        {kind === "user-profile" && <div style={{position:"fixed",right:10,bottom:10}}><UserProfilePopover userId="self" currentUserId="self"><span>Open profile</span></UserProfilePopover></div>}
        {kind === "settings" && <ServerSettingsOverlay open canManage detail={detail} uploadthingEnabled={false}/>}
        {kind.startsWith("member-roles") && <MemberRolesDialog
          member={{id:"member",displayName:"Whispr Test 01",roles:[]}}
          roles={Array.from({length:kind.includes("long")?30:2},(_,i)=>({id:"role-"+i,name:i===0?"Admin":i===1?"Moderatör":"UzunRolAdı".repeat(12)+i,color:i===0?0x5966f3:0x2bab74,position:i+1,permissions:[],isDefault:false,managed:false}))}
          isOwner submitting={kind.includes("pending")} error={kind.includes("error")?"Değişiklikler kaydedilemedi.":null}
          onCancel={()=>window.cancelled=true} onSubmit={ids=>window.submittedRoles=ids}/>
        }
        {kind === "profile" && <div style={{display:"flex",height:500}}><div style={{flex:1,minWidth:0}}><ConversationHeader variant="group" name="Test group" memberCount={4} onlineCount={2} onOpenSearch={noop} onOpenPins={noop} onStartVideoCall={noop} onStartVoiceCall={noop}/></div><MessagesSidePanel title="Grup profili" onClose={noop} variant="profile"><p>Profile</p></MessagesSidePanel></div>}
        {kind === "menu" && <ContextMenu open onClose={noop} position={{x:innerWidth-2,y:innerHeight-2}} label="Server" testId="menu" className="w-64">{Array.from({length:14},(_,i)=><ContextMenuItem key={i}>Action {i}</ContextMenuItem>)}</ContextMenu>}
        </React.Fragment></LocaleProvider></QueryClientProvider>);
    `,
    },
    plugins: [
      {
        name: "isolated-services",
        setup(builder) {
          builder.onResolve({ filter: /^@\/lib\/uploadthing$/ }, () => ({
            path: "upload",
            namespace: "upload-fixture",
          }));
          builder.onLoad({ filter: /.*/, namespace: "upload-fixture" }, () => ({
            contents:
              "export const useUploadThing=()=>({isUploading:false,startUpload:async()=>[]});",
          }));
          builder.onResolve({ filter: /^next\/navigation$/ }, () => ({
            path: "router",
            namespace: "fixture",
          }));
          builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
            contents:
              'export const useRouter=()=>({push(){},replace(){}}); export const usePathname=()=>"/channels/test";',
          }));
        },
      },
    ],
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        events: [],
        members: [],
        items: [],
        displayName: "Test",
        username: "test",
        createdAt: "2026-01-01",
        bio: "Long profile description ".repeat(60),
      }),
    }),
  );
  await page.goto("https://overlay.invalid");
  await page.setContent('<html><body><div id="root"></div></body></html>');
  const cssPath = `${root}/src/app/globals.css`;
  const css = await postcss([tailwind()]).process(await readFile(cssPath, "utf8"), {
    from: cssPath,
  });
  await page.addStyleTag({ content: css.css });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  return errors;
}

test("member roles selection preserves choices through search and supports keyboard saving", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 714, height: 463 } });
    const errors = await fixture(page);
    await page.evaluate(() => window.mount("member-roles"));
    const search = page.getByRole("searchbox");
    const save = page.getByRole("button", { name: "Kaydet", exact: true });
    await expect(search).toBeFocused();
    await expect(save).toBeDisabled();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("checkbox", { name: "Admin", exact: true })).toBeFocused();
    await page.keyboard.press("Space");
    await expect(page.getByRole("status")).toHaveText("1 rol seçili");
    await search.fill("Moderatör");
    await page.getByText("Moderatör", { exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("2 rol seçili");
    await search.fill("no matching role");
    await expect(page.getByRole("checkbox")).toHaveCount(0);
    await search.fill("");
    await expect(page.getByRole("checkbox", { name: "Admin", exact: true })).toBeChecked();
    await save.click();
    assert.deepEqual(await page.evaluate(() => window.submittedRoles), ["role-0", "role-1"]);
    if (process.env.OVERLAY_SCREENSHOTS === "1") {
      const directory = fileURLToPath(new URL("../test-results/overlay-layout/", import.meta.url));
      await mkdir(directory, { recursive: true });
      await page.screenshot({ path: `${directory}/member-roles.png` });
    }
    await page.evaluate(() => window.mount("member-roles-pending"));
    await expect(page.getByRole("checkbox").first()).toBeDisabled();
    await expect(save).toBeDisabled();
    await page.keyboard.press("Escape");
    assert.equal(await page.evaluate(() => window.cancelled), undefined);
    await page.evaluate(() => window.mount("member-roles-error"));
    await expect(page.getByRole("alert")).toHaveText("Değişiklikler kaydedilemedi.");
    await expect(search).toBeFocused();
    await page.keyboard.press("Escape");
    assert.equal(await page.evaluate(() => window.cancelled), true);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test("member roles keeps padded footer visible with long lists and narrow desktop windows", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors = await fixture(page);
    for (const [width, height, fontSize, desktop] of [
      [1280, 720, 16, true],
      [960, 640, 20.8, true],
      [390, 640, 16, false],
      [714, 463, 16, false],
    ]) {
      await page.setViewportSize({ width, height });
      await page.evaluate(
        ({ fontSize, desktop }) => {
          document.documentElement.style.fontSize = `${fontSize}px`;
          document.documentElement.classList.toggle("whispr-desktop-chrome", desktop);
          window.mount("member-roles-long");
        },
        { fontSize, desktop },
      );
      const save = page.getByRole("button", { name: "Kaydet", exact: true });
      await expect(save).toBeInViewport();
      await expect
        .poll(async () =>
          page.getByRole("dialog").evaluate((node) => {
            const card = node.getBoundingClientRect();
            const button = [...node.querySelectorAll("button")].find(
              (button) => button.textContent === "Kaydet",
            );
            const rect = button.getBoundingClientRect();
            return (
              card.right <= innerWidth &&
              card.bottom <= innerHeight &&
              card.top >= 0 &&
              card.right - rect.right >= 16 &&
              card.bottom - rect.bottom >= 10 &&
              node.scrollWidth <= node.clientWidth
            );
          }),
        )
        .toBe(true);
      await page.getByRole("checkbox").last().scrollIntoViewIfNeeded();
      await expect(save).toBeInViewport();
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test("dialogs fit web and desktop viewport, including large text and short windows", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors = await fixture(page);
    const failures = [];
    for (const desktop of [false, true])
      for (const [width, height, fontSize] of [
        [1920, 1080, 16],
        [1280, 720, 16],
        [960, 640, 20.8],
        [390, 640, 16],
        [1920, 1080, 23.4],
        [2560, 1440, 24],
        [3840, 2160, 32],
      ]) {
        await page.setViewportSize({ width, height });
        await page.evaluate(
          ({ desktop, fontSize }) => {
            document.documentElement.classList.toggle("whispr-desktop-chrome", desktop);
            document.documentElement.style.fontSize = fontSize + "px";
          },
          { desktop, fontSize },
        );
        for (const kind of [
          "modal",
          "shell",
          "channel",
          "server",
          "event",
          "event-page",
          "group",
          "settings",
          "menu",
        ]) {
          await page.evaluate((kind) => window.mount(kind), kind);
          await page.waitForTimeout(300);
          assert.deepEqual(errors, [], `mount ${kind}: ${errors.join("; ")}`);
          const card = page
            .locator(
              kind === "settings"
                ? '[data-server-single-column="shell"]'
                : kind === "menu"
                  ? '[role="menu"]'
                  : '[role="dialog"]',
            )
            .first();
          await card.waitFor({ timeout: 5000 });
          await page.waitForTimeout(250); // Finish the production entry transition before measuring.
          const result = await card.evaluate((node) => {
            const r = node.getBoundingClientRect();
            return {
              x: r.x,
              y: r.y,
              right: r.right,
              bottom: r.bottom,
              client: node.clientWidth,
              scroll: node.scrollWidth,
            };
          });
          if (
            result.x < -1 ||
            result.y < (desktop ? 38 : 0) - 1 ||
            result.right > width + 1 ||
            result.bottom > height + 1 ||
            result.scroll > result.client + 1
          )
            failures.push({ kind, desktop, width, height, fontSize, ...result });
          if (kind === "shell" || kind === "channel") {
            const button = page.getByTestId(kind === "shell" ? "footer" : "channel-submit-button");
            const box = await button.boundingBox();
            if (!box || box.y + box.height > result.bottom + 1)
              failures.push({ kind, desktop, width, height, fontSize, footer: box });
          }
          if (kind === "settings") {
            const bodyHeight = await page
              .getByTestId("server-settings-body")
              .evaluate((node) => node.clientHeight);
            if (bodyHeight < 120)
              failures.push({ kind, desktop, width, height, fontSize, bodyHeight });
          }
          if (["server", "event", "event-page", "group", "channel", "settings"].includes(kind)) {
            const fields = card.locator('input:not([type="hidden"]):visible, textarea:visible');
            for (const field of [fields.first(), fields.last()]) {
              if (!(await field.count())) continue;
              await field.evaluate((node) => node.scrollIntoView({ block: "nearest" }));
              const reachable = await field.evaluate((node) => {
                const r = node.getBoundingClientRect();
                return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === node;
              });
              if (!reachable)
                failures.push({
                  kind,
                  desktop,
                  width,
                  height,
                  fontSize,
                  unreachableField: await field.getAttribute("data-testid"),
                });
            }
          }
          if (
            process.env.OVERLAY_SCREENSHOTS === "1" &&
            desktop &&
            width === 960 &&
            kind === "settings"
          ) {
            const directory = fileURLToPath(
              new URL("../test-results/overlay-layout/", import.meta.url),
            );
            await mkdir(directory, { recursive: true });
            await page.screenshot({ path: `${directory}/server-settings-960.png` });
          }
        }
      }
    assert.deepEqual(errors, []);
    assert.deepEqual(failures, []);
  } finally {
    await browser.close();
  }
});

test("group profile and conversation header separators align", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    const errors = await fixture(page);
    for (const fontSize of [16, 20.8, 24, 32]) {
      await page.evaluate((size) => {
        document.documentElement.style.fontSize = size + "px";
        window.mount("profile");
      }, fontSize);
      await page.getByTestId("conversation-header").waitFor();
      const bottom = await page
        .getByTestId("conversation-header")
        .evaluate((node) => node.getBoundingClientRect().bottom);
      const profileBottom = await page
        .locator("[data-messages-side-panel] > div")
        .first()
        .evaluate((node) => node.getBoundingClientRect().bottom);
      assert.ok(
        Math.abs(bottom - profileBottom) < 1,
        JSON.stringify({ fontSize, bottom, profileBottom }),
      );
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test("open context menu follows resize and text scaling without losing keyboard navigation", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    const errors = await fixture(page);
    await page.evaluate(() => window.mount("menu"));
    const menu = page.getByTestId("menu");
    await menu.waitFor();
    await page.keyboard.press("ArrowDown");
    assert.equal(await page.locator(":focus").textContent(), "Action 1");
    for (const width of [600, 1000, 390, 1200]) {
      await page.setViewportSize({ width, height: 640 });
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "20.8px";
      });
      await page.waitForTimeout(200);
      const box = await menu.boundingBox();
      assert.ok(
        box && box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= 640,
        JSON.stringify({ width, box }),
      );
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test("long user profiles remain scrollable and inside the desktop viewport", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
    const errors = await fixture(page);
    await page.evaluate(() => {
      document.documentElement.classList.add("whispr-desktop-chrome");
      document.documentElement.style.fontSize = "20.8px";
      window.mount("user-profile");
    });
    await page.getByRole("button", { name: "Open profile" }).click();
    const card = page.getByTestId("user-profile-popover");
    await card.waitFor();
    for (const width of [960, 390, 1280]) {
      await page.setViewportSize({ width, height: 640 });
      await page.waitForTimeout(250);
      const box = await card.boundingBox();
      assert.ok(
        box && box.x >= 0 && box.y >= 38 && box.x + box.width <= width && box.y + box.height <= 640,
        JSON.stringify({ width, box }),
      );
      assert.equal(await card.evaluate((node) => getComputedStyle(node).overflowY), "auto");
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test("event creation translates fields, exposes every duration and submits selected local date/time", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      timezoneId: "Europe/Istanbul",
      viewport: { width: 720, height: 1000 },
    });
    await page.clock.install({ time: new Date("2026-09-16T09:00:00Z") });
    const errors = await fixture(page);
    await page.evaluate(() => window.mount("event-page"));
    await page.getByTestId("events-create-title").fill("Takvim kontrolü");
    await expect(page.getByRole("dialog")).not.toContainText("server.modal.event");
    await page.getByTestId("events-datetime-field").click();
    await expect(page.getByRole("grid")).toBeVisible();
    await expect(page.getByRole("dialog")).not.toContainText("server.modal.event");
    await page.getByRole("button", { name: "Sonraki ay", exact: true }).click();
    await page.getByTestId("events-calendar-day-2026-10-17").click();
    await page.getByLabel("Saat", { exact: true }).selectOption("14");
    await page.getByLabel("Dakika", { exact: true }).selectOption("35");
    await page.getByRole("button", { name: "Tamam", exact: true }).click();
    await expect(page.getByTestId("events-datetime-field")).toBeFocused();
    await expect(page.getByTestId("events-datetime-field")).toContainText("17 Ekim · 14:35");

    for (const width of [720, 360]) {
      await page.setViewportSize({ width, height: 1000 });
      const group = page.getByTestId("events-duration-options");
      for (const duration of [30, 45, 60, 90, 120]) {
        const option = page.getByTestId(`events-duration-${duration}`);
        const bounds = await group.boundingBox();
        const button = await option.boundingBox();
        assert.ok(
          bounds &&
            button &&
            button.x >= bounds.x &&
            button.x + button.width <= bounds.x + bounds.width + 1,
          `${duration} minutes must be visible at ${width}px without horizontal scrolling`,
        );
        await option.click();
        await expect(option).toHaveAttribute("aria-checked", "true");
      }
    }
    await page.keyboard.press("Home");
    await expect(page.getByTestId("events-duration-30")).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("events-duration-45")).toHaveAttribute("aria-checked", "true");
    await page.getByTestId("events-duration-120").click();
    let submitted;
    await page.route("**/api/v1/events", async (route) => {
      submitted = route.request().postDataJSON();
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({ error: "Forbidden" }),
      });
    });
    await page.getByTestId("events-create-submit").click();
    await expect(page.getByTestId("events-create-error")).toBeVisible();
    assert.equal(submitted.durationMinutes, 120);
    assert.equal(submitted.startsAt, "2026-10-17T11:35:00.000Z");
    assert.equal(submitted.title, "Takvim kontrolü");
    // A failed request must keep the user's selections for a retry.
    await expect(page.getByTestId("events-datetime-field")).toContainText("17 Ekim · 14:35");
    await expect(page.getByTestId("events-duration-120")).toHaveAttribute("aria-checked", "true");
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test("event calendar handles leap days, year boundaries, keyboard selection and English labels", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      timezoneId: "Europe/Istanbul",
      viewport: { width: 720, height: 1100 },
    });
    await page.clock.install({ time: new Date("2028-01-31T09:00:00Z") });
    const errors = await fixture(page);
    await page.evaluate(() => {
      localStorage.setItem("wizards.locale", "en");
      window.mount("event-page", "en");
    });
    await page.getByTestId("events-datetime-field").click();
    await expect(page.getByTestId("events-calendar-day-2028-01-31")).toBeFocused();
    await page.keyboard.press("PageDown");
    await expect(page.getByTestId("events-calendar-day-2028-02-29")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("events-calendar-day-2028-02-29")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.keyboard.press("PageUp");
    await page.getByTestId("events-calendar-day-2028-01-01").click();
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByTestId("events-calendar-day-2027-12-31")).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("events-calendar-day-2028-01-01")).toBeFocused();
    await page.getByLabel("Hour", { exact: true }).selectOption("23");
    await page.getByLabel("Minute", { exact: true }).selectOption("09");
    await expect(page.getByRole("dialog")).not.toContainText(
      /server\.modal\.event|events\.create\./,
    );
    if (process.env.OVERLAY_SCREENSHOTS === "1") {
      const directory = fileURLToPath(new URL("../test-results/overlay-layout/", import.meta.url));
      await mkdir(directory, { recursive: true });
      await page.setViewportSize({ width: 720, height: 1400 });
      await page.screenshot({ path: `${directory}/event-create-calendar.png` });
    }
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await expect(page.getByTestId("events-datetime-field")).toContainText("23:09");
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test("event creation rejects nonexistent local time during daylight saving transition", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      timezoneId: "America/New_York",
      viewport: { width: 720, height: 1000 },
    });
    await page.clock.install({ time: new Date("2027-03-13T17:00:00Z") });
    const errors = await fixture(page);
    await page.evaluate(() => window.mount("event-page"));
    await page.getByTestId("events-create-title").fill("DST test");
    await page.getByTestId("events-datetime-field").click();
    await page.getByTestId("events-calendar-day-2027-03-14").click();
    await page.getByLabel("Saat", { exact: true }).selectOption("02");
    await page.getByLabel("Dakika", { exact: true }).selectOption("30");
    await page.getByRole("button", { name: "Tamam", exact: true }).click();
    let posts = 0;
    page.on("request", (request) => {
      if (request.method() === "POST") posts++;
    });
    await page.getByTestId("events-create-submit").click();
    await expect(page.getByTestId("events-datetime-field")).toHaveAttribute("aria-invalid", "true");
    assert.equal(posts, 0);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
