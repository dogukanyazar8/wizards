import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "@playwright/test";
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
      window.mount = (kind) => root.render(<QueryClientProvider client={queryClient}>
        <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
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
