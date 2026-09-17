import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { build } from "esbuild";
import { chromium, expect } from "@playwright/test";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";

test("native saves use the settings header and registered games preserve failed drafts", async () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const bundle = await build({
    absWorkingDir: root,
    bundle: true,
    write: false,
    platform: "browser",
    format: "esm",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"development"', "process.env": "{}" },
    stdin: {
      resolveDir: root,
      loader: "tsx",
      contents: `
      import React,{useMemo,useState} from "react";
      import {createRoot} from "react-dom/client";
      import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
      import {LocaleProvider} from "@/components/providers/locale-provider";
      import {getMessagesForLocale} from "@/lib/locale";
      import {SettingsHeader} from "@/components/settings/settings-header";
      import {SettingsStoreReportProvider,useReportSettingsStore} from "@/components/settings/settings-ladder";
      import {SettingsValueStore} from "@/lib/settings/use-setting-value";
      import {NativeDesktopSettingsProvider} from "@/components/settings/sections/desktop/native-settings-context";
      import {DesktopNativeRow} from "@/components/settings/sections/desktop/native-settings-rows";
      import {NATIVE_DESKTOP_SETTINGS_KEY,nativeSettingsClient} from "@/lib/desktop/settings-client";
      import {findSettingsTab} from "@/lib/settings/tree";
      const client=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:Infinity}}});
      const data={application:{launchOnStartup:false,closeAction:"tray",gameDetectionEnabled:true,registeredGames:[{id:"one",executable:"game.exe",label:"Game"}]},shortcuts:{enabled:false,entries:[]},platform:{os:"windows",arch:"x86_64",family:"windows"},updater:{enabled:false,available:false,currentVersion:"1.0.0",latestVersion:null}};
      client.setQueryData(NATIVE_DESKTOP_SETTINGS_KEY,data);
      window.calls=[];
      nativeSettingsClient.application=async settings=>{
        window.calls.push(settings);
        if(window.delay) await new Promise(resolve=>window.finish=resolve);
        if(window.fail) throw new Error("private native error");
        return {...settings,registeredGames:settings.registeredGames.map((g,i)=>({...g,id:g.id||"new-"+i}))};
      };
      nativeSettingsClient.runningApplications=async()=>{
        if(window.failRead) throw new Error("private process error");
        return window.empty ? [] : [{executable:"game.exe",displayName:"Already added"},{executable:"second.exe",displayName:"Second game"}];
      };
      const store=new SettingsValueStore({values:{w4:false},write:async()=>{
        await new Promise(resolve=>window.finishStore=resolve);
        if(window.failStore)throw new Error("store failure");
      }});
      window.store=store;
      function Content(){useReportSettingsStore(store);return <NativeDesktopSettingsProvider>
        {findSettingsTab("desktop","app").groups.flatMap(g=>g.rows).filter(r=>["w1","w8"].includes(r.key)).map(r=><DesktopNativeRow key={r.key} row={r} divider={false}/>)}
      </NativeDesktopSettingsProvider>}
      function Fixture(){const [status,setStatus]=useState("idle");const [retry,setRetry]=useState(null);const [open,setOpen]=useState(true);
        const report=useMemo(()=>({onStatus:setStatus,onRetry:value=>setRetry(()=>value),onDirtyKeys(){}}),[]);
        return <><SettingsHeader titleId="title" titleKey="settings.title" saveState={status} onRetrySave={retry} onClose={()=>setOpen(false)}/>
          <SettingsStoreReportProvider value={report}><main>{open&&<Content/>}</main></SettingsStoreReportProvider></>;
      }
      createRoot(document.getElementById("root")).render(<React.StrictMode><QueryClientProvider client={client}><LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}><Fixture/></LocaleProvider></QueryClientProvider></React.StrictMode>);
    `,
    },
  });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 860, height: 900 } });
    page.setDefaultTimeout(5000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", (route) =>
      route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' }),
    );
    await page.goto("https://settings.invalid");
    const cssPath = join(root, "src/app/globals.css");
    const css = await postcss([tailwind()]).process(await readFile(cssPath, "utf8"), {
      from: cssPath,
    });
    const font = await readFile(join(root, "src/app/fonts/outfit-latin.woff2"));
    await page.addStyleTag({
      content:
        css.css +
        `@font-face{font-family:Outfit;src:url(data:font/woff2;base64,${font.toString("base64")})}body{font-family:Outfit,sans-serif}main{padding:24px}#root{max-width:800px;margin:auto}`,
    });
    await page.addScriptTag({ content: bundle.outputFiles[0].text, type: "module" });
    const indicator = page.getByTestId("settings-save-indicator");
    await expect(indicator).toHaveAttribute("data-save-state", "idle");
    await page.getByRole("button", { name: "Oyununu göremiyor musun? Ekle" }).click();
    await expect(page.getByRole("dialog")).toContainText("Second game");
    await expect(indicator).toHaveAttribute("data-save-state", "idle");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.evaluate(() => (window.delay = true));
    await page.getByTestId("setting-toggle-w1").click();
    await expect(indicator).toHaveAttribute("data-save-state", "saving");
    await expect(page.locator("main")).not.toContainText("Kaydediliyor");
    await page.evaluate(() => {
      window.store.setValue("w4", true);
      window.store.flush();
    });
    await page.waitForFunction(() => typeof window.finishStore === "function");
    await page.evaluate(() => {
      window.delay = false;
      window.finish();
    });
    await expect(page.getByTestId("setting-toggle-w1")).toBeEnabled();
    await expect(indicator).toHaveAttribute("data-save-state", "saving");
    await page.evaluate(() => window.finishStore());
    await expect(indicator).toHaveAttribute("data-save-state", "saved");
    await expect(page.locator("main")).not.toContainText("Kaydedildi");
    await page.evaluate(() => (window.fail = true));
    const name = page.getByRole("textbox", { name: "Oyun adı" });
    await name.fill("Renamed game");
    await page.getByRole("button", { name: "Kaydet", exact: true }).click();
    await expect(indicator).toHaveAttribute("data-save-state", "error");
    await expect(name).toHaveValue("Renamed game");
    await expect(page.locator("body")).not.toContainText("private native error");
    await page.evaluate(() => (window.fail = false));
    await page.getByRole("button", { name: "Kaydet", exact: true }).click();
    await expect(indicator).toHaveAttribute("data-save-state", "saved");
    const add = page.getByRole("button", { name: "Oyununu göremiyor musun? Ekle" });
    await add.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).not.toContainText("Already added");
    await expect(indicator).toHaveAttribute("data-save-state", "saved");
    await page.evaluate(() => (window.fail = true));
    await dialog.getByRole("button", { name: "Second game", exact: true }).click();
    await expect(indicator).toHaveAttribute("data-save-state", "error");
    await expect(dialog).toBeVisible();
    await page.evaluate(() => (window.fail = false));
    await dialog.getByRole("button", { name: "Second game", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "Oyun adı" })).toHaveCount(2);
    await expect(indicator).toHaveAttribute("data-save-state", "saved");
    await page.getByRole("textbox", { name: "Oyun adı" }).first().fill("   ");
    await expect(page.getByRole("button", { name: "Kaydet", exact: true })).toBeDisabled();
    await page.getByRole("textbox", { name: "Oyun adı" }).first().fill("Renamed game");
    await page.evaluate(() => {
      window.empty = true;
    });
    await add.click();
    await expect(dialog).toContainText("Eklenebilecek açık uygulama yok");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await page.evaluate(() => {
      window.empty = false;
      window.failRead = true;
    });
    await add.click();
    await expect(dialog).toContainText("Açık uygulamalar okunamadı");
    await expect(indicator).toHaveAttribute("data-save-state", "saved");
    await page.evaluate(() => (window.failRead = false));
    await dialog.getByRole("button", { name: "Yeniden dene" }).click();
    await expect(dialog).toContainText("Eklenebilecek açık uygulama yok");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    // A failed value-store write exposes its own retry, never a stale native operation.
    await page.evaluate(() => {
      window.failStore = true;
      window.store.setValue("w4", false);
      window.store.flush();
    });
    await expect(indicator).toHaveAttribute("data-save-state", "saving");
    await page.evaluate(() => window.finishStore());
    await expect(indicator).toHaveAttribute("data-save-state", "error");
    await page.evaluate(() => {
      window.failStore = false;
      window.finishStore = null;
    });
    await indicator.getByRole("button").click();
    await page.waitForFunction(() => typeof window.finishStore === "function");
    await expect(indicator).toHaveAttribute("data-save-state", "saving");
    await page.evaluate(() => window.finishStore());
    await expect(indicator).toHaveAttribute("data-save-state", "saved");
    for (const theme of ["light", "dark"]) {
      await page.evaluate((theme) => {
        document.documentElement.className = `theme-${theme}`;
        document.documentElement.dataset.theme = theme;
      }, theme);
      await page.evaluate(() => document.fonts.ready);
      const metrics = await page.getByTestId("registered-games").evaluate((node) => {
        const field = node.querySelector("input");
        const button = node.querySelector("button");
        return {
          fieldFont: getComputedStyle(field).fontFamily,
          buttonFont: getComputedStyle(button).fontFamily,
          width: node.scrollWidth,
          clientWidth: node.clientWidth,
        };
      });
      assert.equal(metrics.fieldFont, metrics.buttonFont);
      assert.ok(metrics.width <= metrics.clientWidth);
      if (process.env.SETTINGS_SAVE_SCREENSHOT_DIR) {
        await mkdir(process.env.SETTINGS_SAVE_SCREENSHOT_DIR, { recursive: true });
        await page.screenshot({
          path: join(process.env.SETTINGS_SAVE_SCREENSHOT_DIR, `desktop-settings-${theme}.png`),
        });
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.evaluate(() => (window.delay = true));
    await page.getByTestId("setting-toggle-w1").click();
    await expect(indicator).toHaveAttribute("data-save-state", "saving");
    await page.getByRole("button", { name: "Kapat", exact: true }).click();
    await expect(indicator).toHaveAttribute("data-save-state", "idle");
    await page.evaluate(() => window.finish());
    await expect(indicator).toHaveAttribute("data-save-state", "idle");
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test("theme and profile image writes report real server outcomes in the header", async () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const bundle = await build({
    absWorkingDir: root,
    bundle: true,
    write: false,
    platform: "browser",
    format: "esm",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"development"', "process.env": "{}" },
    stdin: {
      resolveDir: root,
      loader: "tsx",
      contents: `
      import React,{useMemo,useState} from "react";
      import {createRoot} from "react-dom/client";
      import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
      import {ThemeProvider} from "next-themes";
      import {LocaleProvider} from "@/components/providers/locale-provider";
      import {getMessagesForLocale} from "@/lib/locale";
      import {SettingsHeader} from "@/components/settings/settings-header";
      import {SettingsStoreReportProvider} from "@/components/settings/settings-ladder";
      import {useThemeSelection} from "@/components/settings/blocks/simple-theme-block";
      import {ProfileBannerField} from "@/components/settings/profile-banner-field";
      import {ProfileAvatarField} from "@/components/settings/profile-avatar-field";
      const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
      window.banner={bannerUrl:"https://fixture.invalid/banner.png",bannerColor:null,bannerOffsetX:0.5,bannerOffsetY:0.5};
      window.account={id:"fixture",username:"fixture",displayName:"Fixture",avatarUrl:"https://fixture.invalid/avatar.png"};
      window.action=async(name)=>{
        if(name==="getAccountBannerAction")return {success:true,banner:window.banner};
        await new Promise(resolve=>window.finish=resolve);
        if(window.fail)return {success:false,error:"settings.account.banner.errors.save"};
        if(name==="updateAccountBannerAction")window.banner={...window.banner,bannerUrl:null};
        return {success:true,banner:window.banner,user:{...window.account,avatarUrl:null}};
      };
      function Fields(){const {select}=useThemeSelection();const [account,setAccount]=useState(window.account);return <main>
        <button onClick={()=>select("theme-dark")}>Theme</button>
        <ProfileBannerField accountId="fixture" uploadthingEnabled/>
        <ProfileAvatarField account={account} onAvatarUpdated={setAccount} uploadthingEnabled/>
      </main>;}
      function Fixture(){const [status,setStatus]=useState("idle");const report=useMemo(()=>({onStatus:setStatus,onRetry(){},onDirtyKeys(){}}),[]);return <>
        <SettingsHeader titleId="title" titleKey="settings.title" saveState={status} onClose={()=>{}}/>
        <SettingsStoreReportProvider value={report}><Fields/></SettingsStoreReportProvider></>;}
      createRoot(document.getElementById("root")).render(<QueryClientProvider client={client}><ThemeProvider><LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}><Fixture/></LocaleProvider></ThemeProvider></QueryClientProvider>);
    `,
    },
    plugins: [
      {
        name: "isolated-server-actions",
        setup(builder) {
          builder.onResolve(
            {
              filter:
                /^@\/lib\/(account\/(actions|banner-actions)|appearance\/actions|uploadthing)$/,
            },
            ({ path }) => ({ path, namespace: "fixture" }),
          );
          builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({
            contents: path.endsWith("uploadthing")
              ? "export const useUploadThing=()=>({startUpload:async()=>[]});"
              : (path.endsWith("banner-actions")
                  ? [
                      "getAccountBannerAction",
                      "updateAccountBannerAction",
                      "claimAccountBannerAction",
                    ]
                  : path.includes("appearance")
                    ? ["updateThemePreferenceAction"]
                    : ["updateAccountAvatarAction"]
                )
                  .map(
                    (name) => `export const ${name}=(...args)=>window.action("${name}",...args);`,
                  )
                  .join("\n"),
          }));
        },
      },
    ],
  });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(5000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", (route) =>
      route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' }),
    );
    await page.goto("https://settings.invalid");
    await page.addScriptTag({ content: bundle.outputFiles[0].text, type: "module" });
    const indicator = page.getByTestId("settings-save-indicator");
    for (const control of [
      page.getByRole("button", { name: "Theme", exact: true }),
      page.getByTestId("settings-hero-remove-banner"),
      page.getByTestId("profile-avatar-clear"),
    ]) {
      await page.evaluate(() => {
        window.fail = true;
        window.finish = null;
      });
      await control.click();
      await expect(indicator).toHaveAttribute("data-save-state", "saving");
      await page.waitForFunction(() => typeof window.finish === "function");
      await page.evaluate(() => window.finish());
      await expect(indicator).toHaveAttribute("data-save-state", "error");
      await page.evaluate(() => {
        window.fail = false;
        window.finish = null;
      });
      await control.click();
      await expect(indicator).toHaveAttribute("data-save-state", "saving");
      await page.waitForFunction(() => typeof window.finish === "function");
      await page.evaluate(() => window.finish());
      await expect(indicator).toHaveAttribute("data-save-state", "saved");
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
