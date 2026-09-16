import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium, expect } from "@playwright/test";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";

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
      import {createRoot} from "react-dom/client";
      import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
      import {LocaleProvider} from "@/components/providers/locale-provider";
      import {FocusModalitySync} from "@/components/providers/focus-modality-sync";
      import {getMessagesForLocale} from "@/lib/locale";
      import {ChatComposer} from "@/components/chat/message-input";
      import {Input} from "@/components/ui/input";
      import {Textarea} from "@/components/ui/textarea";
      import {SettingInput} from "@/components/settings/rows/setting-input";
      import {SettingTextarea} from "@/components/settings/rows/setting-textarea";
      import {MemberRolesDialog} from "@/components/shell/server-settings/sections/member-roles-dialog";
      const client = new QueryClient({defaultOptions:{queries:{retry:false}}});
      const root = createRoot(document.getElementById("root"));
      window.unmount = () => root.unmount();
      const noop = () => {};
      window.mount = (kind="channel") => root.render(<QueryClientProvider client={client}>
        <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
          <FocusModalitySync/>
          <button id="before">Before</button>
          {kind === "fields" ? <div style={{display:"grid",gap:24,padding:24}}>
            <Input aria-label="Shared input"/><Textarea aria-label="Shared textarea"/>
            <SettingInput value="" onChange={noop} testId="setting-input"/>
            <SettingTextarea value="" onChange={noop} maxLength={190} testId="setting-textarea"/>
            <div style={{"--auth-focus-border":"1px","--auth-focus-ring":"3px","--auth-focus-alpha":0.2,"--auth-error-ring-alpha":0.2,"--auth-error-tint":0.1}}>
              <input aria-label="Auth input" className="auth-input"/>
              <input aria-label="Invalid input" className="auth-input" aria-invalid="true"/>
            </div>
            <input aria-label="App input" className="app-input"/>
            <div role="textbox" aria-label="Rich editor" contentEditable suppressContentEditableWarning className="focus-visible:ring-2"/>
          </div> : kind === "roles" ? <MemberRolesDialog member={{displayName:"Test",roles:[]}} roles={[{id:"r",name:"Member",color:0x5966f3,permissions:[],position:1,managed:false,isDefault:false}]} isOwner submitting={false} error={null} onCancel={noop} onSubmit={noop}/>
            : <ChatComposer key={kind} conversationId="test" conversationName="welcome-chat" mode={kind==="dm"?"dm":"channel"} variant={kind==="thread"?"thread":"default"} replyTo={null} uploadthingEnabled={false} onCancelReply={noop} onSend={(content)=>window.sent=content}/>
          }
          <button id="after" className="focus-visible:ring-2">After</button>
        </LocaleProvider></QueryClientProvider>);
      window.mount();
    `,
    },
    plugins: [
      {
        name: "isolated-services",
        setup(builder) {
          builder.onResolve(
            { filter: /^@\/(hooks\/use-typing|lib\/uploadthing)$/ },
            ({ path }) => ({ path, namespace: "fixture" }),
          );
          builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({
            contents: path.includes("use-typing")
              ? "export const useTyping=()=>({startTyping(){},stopTyping(){}});"
              : "export const useUploadThing=()=>({isUploading:false,startUpload:async()=>[]});",
          }));
        },
      },
    ],
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<html data-strong-focus="true"><body><div id="root"></div></body></html>',
    }),
  );
  await page.goto("https://focus.invalid");
  const cssPath = `${root}/src/app/globals.css`;
  const css = await postcss([tailwind()]).process(await readFile(cssPath, "utf8"), {
    from: cssPath,
  });
  await page.addStyleTag({ content: css.css });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  return errors;
}

const focusStyle = (locator) =>
  locator.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      outline: style.outlineStyle,
      ring: style.getPropertyValue("--tw-ring-shadow").trim(),
      shadow: style.boxShadow,
    };
  });

test("composer pointer focus has no outer outline; keyboard focus stays visible", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors = await fixture(page);
    for (const kind of ["channel", "dm", "thread"]) {
      await page.evaluate((kind) => window.mount(kind), kind);
      const input = page.getByTestId(kind === "thread" ? "thread-message-input" : "message-input");
      const surface = page.getByTestId("message-composer-input-row");
      await input.click();
      await expect(input).toBeFocused();
      assert.equal((await focusStyle(surface)).outline, "none", kind);
      await page.keyboard.type("message");
      await page.keyboard.press("ArrowLeft");
      assert.equal((await focusStyle(surface)).outline, "none", `${kind} while typing`);
      await page.keyboard.press("Shift+Tab");
      await page.keyboard.press("Tab");
      await expect(input).toBeFocused();
      assert.equal((await focusStyle(surface)).outline, "solid", `${kind} keyboard`);
      await page.keyboard.press("Enter");
      assert.equal(await page.evaluate(() => window.sent), "message");
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test("shared fields and composite controls keep pointer focus quiet and keyboard rings visible", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors = await fixture(page);
    await page.evaluate(() => window.mount("fields"));
    for (const theme of ["theme-light", "theme-dark"]) {
      for (const strong of ["true", "false"]) {
        await page.evaluate(
          ({ theme, strong }) => {
            document.documentElement.className = theme;
            document.documentElement.dataset.strongFocus = strong;
          },
          { theme, strong },
        );
        const inputs = [
          page.getByRole("textbox", { name: "Shared input", exact: true }),
          page.getByRole("textbox", { name: "Shared textarea", exact: true }),
          page.getByTestId("setting-input"),
          page.getByTestId("setting-textarea"),
          page.getByRole("textbox", { name: "Rich editor", exact: true }),
        ];
        for (const input of inputs) {
          const surface =
            (await input.getAttribute("data-testid")) === "setting-input"
              ? input.locator("..")
              : input;
          await input.click();
          await expect(input).toBeFocused();
          await expect.poll(async () => (await focusStyle(surface)).ring).toBe("0 0 #0000");
          assert.equal((await focusStyle(surface)).outline, "none");
          await page.keyboard.press("Shift+Tab");
          await page.keyboard.press("Tab");
          await expect(input).toBeFocused();
          assert.notEqual(
            (await focusStyle(surface)).ring,
            "0 0 #0000",
            `${theme}/${strong}: keyboard ring`,
          );
        }
        for (const name of ["Auth input", "Invalid input", "App input"]) {
          const input = page.getByRole("textbox", { name, exact: true });
          const border = await input.evaluate((node) => getComputedStyle(node).borderColor);
          await input.click();
          await expect.poll(async () => (await focusStyle(input)).shadow).toBe("none");
          if (name === "Invalid input")
            assert.equal(
              await input.evaluate((node) => getComputedStyle(node).borderColor),
              border,
            );
          await page.keyboard.press("Shift+Tab");
          await page.keyboard.press("Tab");
          await expect.poll(async () => (await focusStyle(input)).shadow).not.toBe("none");
        }
      }
    }
    await page.evaluate(() => window.mount("roles"));
    const checkbox = page.getByRole("checkbox", { name: "Member", exact: true });
    const row = checkbox.locator("..");
    await page.getByText("Member", { exact: true }).click();
    await expect(checkbox).toBeChecked();
    assert.equal((await focusStyle(row)).ring, "0 0 #0000");
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await expect(checkbox).toBeFocused();
    assert.notEqual((await focusStyle(row)).ring, "0 0 #0000");
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test("touch editing stays quiet; Tab restores focus indication; forced colors stay accessible", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ hasTouch: true, viewport: { width: 390, height: 844 } });
    const errors = await fixture(page);
    const input = page.getByTestId("message-input");
    const surface = page.getByTestId("message-composer-input-row");
    await input.tap();
    await page.keyboard.type("Hello");
    await page.keyboard.press("ArrowLeft");
    assert.equal((await focusStyle(surface)).outline, "none");
    await page.keyboard.press("Shift");
    assert.equal(
      await page.evaluate(() => document.documentElement.dataset.focusModality),
      "pointer",
    );
    await page.keyboard.press("Tab");
    assert.equal(
      await page.evaluate(() => document.documentElement.dataset.focusModality),
      "keyboard",
    );
    await page.emulateMedia({ forcedColors: "active" });
    await page.keyboard.press("Shift+Tab");
    await expect(input).toBeFocused();
    assert.equal((await focusStyle(surface)).outline, "solid");
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test("focus modality ignores pointer movement and removes document listeners on unmount", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors = await fixture(page);
    await page.getByTestId("message-input").click();
    await page.keyboard.press("Tab");
    await page.mouse.move(10, 10);
    assert.equal(
      await page.evaluate(() => document.documentElement.dataset.focusModality),
      "keyboard",
    );
    await page.evaluate(() => window.unmount());
    await page.mouse.click(10, 10);
    await page.keyboard.press("Tab");
    assert.equal(
      await page.evaluate(() => document.documentElement.dataset.focusModality),
      undefined,
    );
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
