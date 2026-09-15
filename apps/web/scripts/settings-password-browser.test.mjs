import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";

// Real settings shell, row renderer, custom blocks and account forms. Routing,
// profile hero and server actions are isolated; no database or real credentials.
async function createFixture(page) {
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
        import { SettingsWindow } from "@/components/settings/settings-window";
        import { SettingsWindowLoading } from "@/components/settings/settings-window-loading";
        import { AppUpdateNotifier } from "@/components/app/app-update-notifier";
        import { appUpdateQueryOptions } from "@/lib/app-update-query";
        import { WHISPR_BUILD_ID } from "@/lib/app-version";
        import { nativeSettingsClient } from "@/lib/desktop/settings-client";
        import { SettingsHeader } from "@/components/settings/settings-header";
        import { PasswordBlock } from "@/components/settings/risky/password-block";
        import { ContactBlock } from "@/components/settings/sections/account/contact-block";
        import { SettingsTabBody } from "@/components/settings/rows/render-settings-tab";
        import { AvAudioTab } from "@/components/settings/sections/av/audio-tab";
        import { AvScreenShareTab } from "@/components/settings/sections/av/screen-share-tab";
        import { VoiceStateContext } from "@/components/providers/voice-context";
        import { useVoiceStore } from "@/store/voice-store";
        import { SettingsRowRuntimeContext } from "@/lib/settings/use-setting-value";
        import { SETTINGS_TREE } from "@/lib/settings/tree";
        import { APP_SHORTCUT_IDS, resolveAppShortcut } from "@/lib/shortcuts/catalog";
        window.addEventListener("keydown", event => resolveAppShortcut(APP_SHORTCUT_IDS, event));
        window.settingsRoutes = SETTINGS_TREE.flatMap(section => section.tabs.map(tab => ({section:section.key,tab:tab.key})));
        const contact = {phone:null,hasPassword:true,googleAvailable:false,twoFactorEnabled:false};
        function section(input) {
          if(input.section.key === "av" && input.tab.key === "audio") return <AvAudioTab tab={input.tab}/>;
          if(input.section.key === "av" && input.tab.key === "screen-share") return <AvScreenShareTab tab={input.tab}/>;
          const runtime = {
            data:{email:"a".repeat(64)+"@"+"b".repeat(63)+".test",phone:"+905•••••4218"},disabledRows:{},openRisky:input.openRisky,openSelect:input.openSelect,
            setOpenRisky: key => input.toggleRisky(key ?? input.openRisky),
            onAction(){},onJump(){},onNavigate(){},onSoundPreview(){},setOpenSelect:key => input.toggleSelect(key ?? input.openSelect),
            riskyBodies: {
              apw: <PasswordBlock email="account@example.test" onClose={() => input.toggleRisky("password")} />,
              ...Object.fromEntries(["email","phone"].map(kind => [kind === "email" ? "ae" : "ap",
                <ContactBlock key={kind} kind={kind} email="account@example.test" contact={contact}
                  onClose={() => input.toggleRisky(kind)} onPhoneSaved={value => window.savedPhone = value} />])),
            },
          };
          return <SettingsRowRuntimeContext.Provider value={runtime}>
            <SettingsTabBody tab={input.tab} />
          </SettingsRowRuntimeContext.Provider>;
        }
        const root = createRoot(document.getElementById("root"));
        const queryClient = new QueryClient({defaultOptions:{queries:{retry:false}}});
        window.mountLoadingSettings = () => root.render(
          <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
            <SettingsWindowLoading />
          </LocaleProvider>
        );
        window.mountUpdateNotifier = (desktop, hasUpdate = true) => {
          if (desktop) window.__WHISPR_DESKTOP__ = {shell:"desktop",features:{updater:true}};
          else delete window.__WHISPR_DESKTOP__;
          window.nativeUpdateChecks = 0;
          nativeSettingsClient.check = async () => {
            window.nativeUpdateChecks++;
            return {enabled:true,available:false};
          };
          const updateClient = new QueryClient({defaultOptions:{queries:{retry:false}}});
          updateClient.setQueryData(appUpdateQueryOptions(false).queryKey, {
            enabled:true,available:hasUpdate,checkedAt:Date.now(),webVersion:{
              buildId:hasUpdate?"fixture-new-build":WHISPR_BUILD_ID,version:"99.0.0",notes:[],
            },
          });
          window.updateClient = updateClient;
          root.render(<QueryClientProvider key={desktop+":"+hasUpdate} client={updateClient}>
            <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
              <AppUpdateNotifier />
            </LocaleProvider>
          </QueryClientProvider>);
        };
        window.mountHeader = state => root.render(<LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
          <SettingsHeader titleId="test-header" titleKey="settings.section.av.label" leadKey="settings.section.av.lead" saveState={state} onClose={() => {}} onRetrySave={() => window.retries = (window.retries ?? 0) + 1}/>
        </LocaleProvider>);
        window.mountSettings = (route = {section:"account",tab:"account"}, mode = "modal") => root.render(
          <React.StrictMode><QueryClientProvider client={queryClient}><LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
            <VoiceStateContext.Provider value={window.fixtureVoice ?? null}>
            <SettingsWindow key={mode + route.section + route.tab} account={{avatarUrl:null,username:"account",displayName:"Account",status:"ONLINE"}} mode={mode}
              route={route} renderSection={section} />
            </VoiceStateContext.Provider>
          </LocaleProvider></QueryClientProvider></React.StrictMode>
        );
        window.mountShareScenario = ({active=false, connected=true, status="idle", error=null} = {}) => {
          useVoiceStore.setState({sessionId:connected?"test-session":null,isScreenSharing:active});
          window.fixtureVoice = {
            connectionState:connected?"connected":"disconnected", screenShareStatus:status, screenShareError:error,
            room:{localParticipant:{getTrackPublication:()=>active?{track:{mediaStreamTrack:{label:"Sunum – "+"çok uzun kaynak başlığı ".repeat(20)}}}:null}},
            toggleScreenShare:async()=>{(window.shareCalls??=[]).push("start");},
            stopScreenShare:async()=>{(window.shareCalls??=[]).push("stop");},
            switchScreenShareSource:async()=>{(window.shareCalls??=[]).push("switch");},
          };
          window.mountSettings({section:"av",tab:"screen-share"});
        };
        window.mountSettings();
      `,
    },
    plugins: [
      {
        name: "isolated-router",
        setup(builder) {
          builder.onResolve(
            { filter: /^@\/components\/settings\/blocks\/profile-hero-card$/ },
            () => ({
              path: "custom",
              namespace: "contact-fixture",
            }),
          );
          builder.onResolve({ filter: /^@\/lib\/account\/contact-actions$/ }, () => ({
            path: "actions",
            namespace: "contact-fixture",
          }));
          builder.onLoad({ filter: /.*/, namespace: "contact-fixture" }, ({ path }) => ({
            contents:
              path === "custom"
                ? "export const ProfileHeroCard = () => null;"
                : `
            export const saveAccountPhoneAction = async value => {
              if(window.delayPhone) await new Promise(resolve => window.finishPhone = resolve);
              return {success:true,phone:"+905•••••4218"};
            };
            export const requestAccountEmailChangeAction = async () => ({success:true,id:"test-challenge",method:"code",googleToken:null});
            export const confirmAccountEmailChangeAction = async () => ({success:false,error:"INVALID_CODE"});
            export const sendGoogleAccountEmailCodeAction = async () => ({success:true});
          `,
          }));
          builder.onResolve({ filter: /^@\/lib\/appearance\/actions$/ }, () => ({
            path: "appearance-actions",
            namespace: "appearance-fixture",
          }));
          builder.onLoad({ filter: /.*/, namespace: "appearance-fixture" }, () => ({
            contents: "export const updateThemePreferenceAction = async () => ({success:true});",
          }));
          builder.onResolve({ filter: /^next\/navigation$/ }, () => ({
            path: "router",
            namespace: "test",
          }));
          builder.onLoad({ filter: /.*/, namespace: "test" }, () => ({
            contents: `const router = { push(){}, replace(){}, back(){ window.backCalls = (window.backCalls ?? 0)+1; } };
            const params = new URLSearchParams();
            export const useRouter = () => router;
            export const usePathname = () => null;
            export const useSearchParams = () => params;`,
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
      body: '<html><body><div id="root"></div></body></html>',
    }),
  );
  await page.goto("https://settings.invalid");
  const cssPath = fileURLToPath(new URL("../src/app/globals.css", import.meta.url));
  const css = await postcss([tailwind()]).process(await readFile(cssPath, "utf8"), {
    from: cssPath,
  });
  await page.addStyleTag({ content: css.css });
  await page.addStyleTag({
    content: "body {font-family: Arial, sans-serif; --font-display: Georgia, serif;}",
  });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page
    .getByTestId("setting-risky-apw")
    .waitFor({ timeout: 5000 })
    .catch((cause) => {
      throw new Error(`Settings fixture failed: ${errors.join("; ")}`, { cause });
    });
  return errors;
}

test("desktop hides the web update card and web polling while native checks remain active", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors = await createFixture(page);
    await page.evaluate(() => window.mountUpdateNotifier(true));
    await page.waitForFunction(() => window.nativeUpdateChecks === 1);
    assert.equal(
      await page.getByRole("heading", { name: "Yeni bir Whispr sürümü hazır" }).count(),
      0,
    );
    assert.equal(
      await page.evaluate(() =>
        window.updateClient
          .getQueryCache()
          .find({ queryKey: ["app-update", "web"] })
          .getObserversCount(),
      ),
      0,
    );

    await page.evaluate(() => window.mountUpdateNotifier(false));
    await page.getByRole("heading", { name: "Yeni bir Whispr sürümü hazır" }).waitFor();
    assert.equal(
      await page.evaluate(() =>
        window.updateClient
          .getQueryCache()
          .find({ queryKey: ["app-update", "web"] })
          .getObserversCount(),
      ),
      1,
    );
    await page.getByRole("button", { name: "Daha sonra" }).click();
    await page
      .getByRole("heading", { name: "Yeni bir Whispr sürümü hazır" })
      .waitFor({ state: "hidden" });
    await page.evaluate(() => window.mountUpdateNotifier(false, false));
    await page.waitForFunction(
      () =>
        window.updateClient
          .getQueryCache()
          .find({ queryKey: ["app-update", "web"] })
          .getObserversCount() === 1,
    );
    assert.equal(
      await page.getByRole("heading", { name: "Yeni bir Whispr sürümü hazır" }).count(),
      0,
    );
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test("pending settings route has a viewport-bounded, keyboard-dismissible window", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
    const errors = await createFixture(page);
    await page.evaluate(() => {
      document.documentElement.style.setProperty("--app-viewport-top", "28px");
      window.mountLoadingSettings();
    });
    await page.getByTestId("settings-window-loading").waitFor();
    const dialog = page.getByRole("dialog", { name: "Ayarlar" });
    const bounds = await dialog.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 960);
    assert.ok(bounds.y >= 28 && bounds.y + bounds.height <= 640);
    assert.equal(await page.getByRole("status").getAttribute("aria-busy"), "true");
    await page.getByRole("button", { name: "Kapat", exact: true }).click();
    assert.equal(await page.evaluate(() => window.backCalls), 1);
    await page.keyboard.press("Escape");
    assert.equal(await page.evaluate(() => window.backCalls), 2);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test("save status uses valid colored capsules without overflowing a narrow header", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors = await createFixture(page);
    for (const [width, fontSize] of [
      [320, 16],
      [320, 20],
      [390, 20],
      [1280, 16],
    ]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(
        (size) => (document.documentElement.style.fontSize = `${size}px`),
        fontSize,
      );
      const colors = [];
      for (const [state, token] of [
        ["saving", "--info-readable"],
        ["saved", "--success-readable"],
        ["error", "--danger-readable"],
      ]) {
        await page.evaluate((state) => window.mountHeader(state), state);
        const status = page.locator(`[data-save-state="${state}"]`);
        await status.waitFor();
        const appearance = await status.evaluate((el, token) => {
          const capsule = el.firstElementChild;
          const probe = document.createElement("span");
          probe.style.color = `var(${token})`;
          document.body.append(probe);
          const expected = getComputedStyle(probe).color;
          probe.remove();
          const style = getComputedStyle(capsule);
          const rect = capsule.getBoundingClientRect();
          return {
            color: style.color,
            expected,
            background: style.backgroundColor,
            contained:
              rect.left >= 0 &&
              rect.right <= innerWidth &&
              capsule.scrollWidth <= capsule.clientWidth + 1,
          };
        }, token);
        assert.equal(appearance.color, appearance.expected);
        assert.notEqual(appearance.background, "rgba(0, 0, 0, 0)");
        assert.ok(appearance.contained, `${width}/${fontSize} ${state}`);
        colors.push(appearance.color);
      }
      assert.equal(new Set(colors).size, 3);
      await page.getByTestId("settings-save-indicator").getByRole("button").click();
    }
    assert.equal(await page.evaluate(() => window.retries), 4);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test("screen share settings expose real controls, persisted behavior and contained source details", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors = await createFixture(page);
    await page.evaluate(() => window.mountShareScenario({ connected: false }));
    const start = page.getByRole("button", { name: "Paylaşımı başlat", exact: true });
    await start.waitFor();
    assert.equal(await start.isDisabled(), true);
    await page.evaluate(() => window.mountShareScenario());
    await page.getByRole("button", { name: "Paylaşımı başlat", exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.shareCalls), ["start"]);
    await page.getByTestId("setting-toggle-e4").click();
    await page.waitForFunction(
      () =>
        JSON.parse(localStorage.getItem("wizards-voice"))?.state.screenShareExcludeSelfWindow ===
        false,
    );
    await page.evaluate(() => window.mountShareScenario({ active: true }));
    const change = page.getByRole("button", { name: "Kaynak değiştir", exact: true });
    await change.click();
    await page.getByTestId("setting-toggle-e5").click();
    await page.locator('[data-testid="setting-actions-e7-1"]:disabled').waitFor();
    assert.deepEqual(await page.evaluate(() => window.shareCalls), ["start", "switch"]);
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(
        await page
          .locator('[data-setting-row="e7"]')
          .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
        true,
      );
    }
    await page.getByRole("button", { name: "Paylaşımı durdur", exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.shareCalls), ["start", "switch", "stop"]);
    await page.getByRole("button", { name: "Varsayılanlara dön", exact: true }).click();
    await page.waitForFunction(() => {
      const state = JSON.parse(localStorage.getItem("wizards-voice"))?.state;
      return (
        state?.screenShareExcludeSelfWindow === true &&
        state.screenShareAllowSourceSwitch === true &&
        state.screenShareAudioEnabled === false &&
        state.screenShareVolume === 100
      );
    });
    await page.evaluate(() => window.mountShareScenario({ active: true, status: "switching" }));
    await page.getByText("Kaynak seçiliyor", { exact: true }).waitFor();
    assert.equal(await change.isDisabled(), true);
    assert.equal(
      await page.getByRole("button", { name: "Paylaşımı durdur", exact: true }).isDisabled(),
      false,
    );
    await page.evaluate(() => window.mountShareScenario({ error: "Paylaşım başlatılamadı" }));
    await page.getByRole("alert").filter({ hasText: "Paylaşım başlatılamadı" }).waitFor();
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test("audio settings play a local microphone preview and stop it when leaving", async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  });
  try {
    const page = await browser.newPage();
    const errors = await createFixture(page);
    await page.evaluate(() => {
      const NativeAudio = window.Audio;
      window.Audio = class extends NativeAudio {
        constructor(...args) {
          super(...args);
          window.previewAudio = this;
        }
      };
      const capture = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      window.testStreams = [];
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        const stream = await capture(constraints);
        window.testStreams.push(stream);
        return stream;
      };
      window.mountSettings({ section: "av", tab: "audio" });
    });
    const toggle = page.getByTestId("setting-toggle-i4");
    await toggle.waitFor();
    assert.equal(await toggle.getAttribute("aria-disabled"), "true");
    assert.equal(await toggle.getAttribute("aria-checked"), "false");
    await toggle.evaluate((el) => el.click());
    assert.equal(await page.evaluate(() => window.testStreams.length), 0);
    const testButton = page.getByTestId("setting-actions-i3");
    await testButton.click();
    await page.locator('[data-testid="setting-toggle-i4"]:not([aria-disabled])').waitFor();
    assert.equal(await page.locator('[data-setting-row^="p"]').count(), 3);
    await toggle.click();
    await page.waitForFunction(() => window.previewAudio?.paused === false);
    assert.equal(
      await page.getByTestId("settings-self-monitor-status").innerText(),
      "Mikrofonun seçili ses çıkışında çalıyor.",
    );
    await page.evaluate(() => {
      window.previousPreviewTracks = window.previewAudio.srcObject.getTracks();
      document
        .querySelector('[data-testid="setting-select-p7"]')
        .scrollIntoView({ block: "center" });
    });
    // Finish scrolling before opening: the menu intentionally closes on scroll.
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    await page.getByTestId("setting-select-p7").click();
    await page.getByRole("option", { name: "Kapalı", exact: true }).click();
    await page.waitForFunction(() => {
      const preferences = JSON.parse(localStorage.getItem("wizards-voice"))?.state.audioPreferences;
      return (
        preferences?.krispNoiseCancellation === false &&
        preferences.noiseSuppression === false &&
        preferences.voiceIsolation === false
      );
    });
    await page.waitForFunction(
      () =>
        window.previousPreviewTracks.every((track) => track.readyState === "ended") &&
        window.previewAudio.paused === false,
    );
    await page.getByTestId("setting-select-p7").click();
    await page.getByRole("option", { name: "Krisp (Önerilen)", exact: true }).click();
    await page.waitForFunction(() => {
      const preferences = JSON.parse(localStorage.getItem("wizards-voice"))?.state.audioPreferences;
      return (
        preferences?.krispNoiseCancellation === true &&
        preferences.enhancedNoiseFilterMode === "krisp_only"
      );
    });
    await page.waitForFunction(
      () => window.previewAudio?.srcObject && window.previewAudio.paused === false,
    );
    await testButton.click();
    await page
      .locator('[data-testid="setting-toggle-i4"][aria-disabled="true"][aria-checked="false"]')
      .waitFor();
    assert.equal(
      await page.evaluate(
        () => window.previewAudio.paused && window.previewAudio.srcObject === null,
      ),
      true,
    );
    assert.equal(
      await page.evaluate(() =>
        window.testStreams.every((stream) =>
          stream.getTracks().every((track) => track.readyState === "ended"),
        ),
      ),
      true,
    );
    await testButton.click();
    await page.locator('[data-testid="setting-toggle-i4"]:not([aria-disabled])').waitFor();
    assert.equal(await toggle.getAttribute("aria-checked"), "false");
    assert.equal(await page.evaluate(() => window.previewAudio.paused), true);
    await toggle.click();
    await page.waitForFunction(() => window.previewAudio?.paused === false);
    await page.evaluate(() => {
      window.previewTracks = window.previewAudio.srcObject.getTracks();
      window.mountSettings({ section: "av", tab: "camera" });
    });
    await toggle.waitFor({ state: "detached" });
    assert.equal(
      await page.evaluate(() =>
        window.previewTracks.every((track) => track.readyState === "ended"),
      ),
      true,
    );
    assert.equal(
      await page.evaluate(
        () => window.previewAudio.paused && window.previewAudio.srcObject === null,
      ),
      true,
    );
    await page.evaluate(() => window.mountSettings({ section: "av", tab: "audio" }));
    await toggle.waitFor();
    assert.equal(await toggle.getAttribute("aria-checked"), "false");
    await page.evaluate(() => {
      navigator.mediaDevices.getUserMedia = async () => {
        throw new DOMException("denied", "NotAllowedError");
      };
    });
    await testButton.click();
    await page.getByTestId("settings-mic-status").filter({ hasText: "Mikrofon izni" }).waitFor();
    assert.equal(await toggle.getAttribute("aria-disabled"), "true");
    assert.equal(await toggle.getAttribute("aria-checked"), "false");
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test("security events keep long device details readable and dates aligned", async () => {
  const browser = await chromium.launch({
    headless: true,
    ignoreDefaultArgs: ["--hide-scrollbars"],
  });
  try {
    const page = await browser.newPage();
    const errors = await createFixture(page);
    const events = [
      {
        id: "failed-long",
        kind: "failedLogin",
        createdAt: "2026-09-11T08:00:00Z",
        location: "İstanbul, Türkiye",
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 " +
          "LongDeviceIdentifier".repeat(12),
      },
      {
        id: "failed-short",
        kind: "failedLogin",
        createdAt: "2026-09-10T08:00:00Z",
        location: "Ankara",
        userAgent: "Firefox",
      },
      {
        id: "no-details",
        kind: "passwordChanged",
        createdAt: "2026-09-09T08:00:00Z",
        location: null,
        userAgent: null,
      },
    ];
    await page.route("**/api/v1/users/me/security-events", (route) =>
      route.fulfill({ json: { events } }),
    );
    await page.evaluate(() => window.mountSettings({ section: "account", tab: "security" }));
    await page.getByTestId("settings-security-event-failed-long").waitFor();
    for (const [width, fontSize] of [
      [320, 16],
      [390, 16],
      [720, 16],
      [900, 16],
      [1280, 16],
      [320, 20],
      [900, 20],
    ]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(
        (size) => (document.documentElement.style.fontSize = `${size}px`),
        fontSize,
      );
      const layout = await page.getByTestId("settings-block-s3").evaluate((list) => {
        return Array.from(list.children).map((row) => {
          const title = row.querySelector("[data-security-event-title]");
          const details = row.querySelector("[data-security-event-details]");
          const date = row.querySelector("time");
          const rect = row.getBoundingClientRect();
          const titleRect = title?.getBoundingClientRect();
          const detailRect = details?.getBoundingClientRect();
          return {
            title: title?.textContent,
            details: details?.textContent ?? null,
            readable:
              !details ||
              (getComputedStyle(details).whiteSpace !== "nowrap" &&
                details.scrollWidth <= details.clientWidth + 1 &&
                details.scrollHeight <= details.clientHeight + 1),
            detailsBelow: !details || detailRect.top >= titleRect.bottom - 1,
            dateRight: date?.getBoundingClientRect().right,
            dateTime: date?.dateTime,
            contained:
              row.scrollWidth <= row.clientWidth + 1 &&
              (!detailRect || (detailRect.left >= rect.left && detailRect.right <= rect.right)),
          };
        });
      });
      assert.equal(layout[0].title, "Başarısız giriş denemesi");
      assert.equal(layout[0].details, `${events[0].userAgent} · ${events[0].location}`);
      assert.equal(layout[2].details, null);
      for (const row of layout) {
        assert.ok(
          row.readable && row.detailsBelow && row.contained,
          `${width}/${fontSize}: event details must be visible without overflow`,
        );
        assert.equal(row.dateRight, layout[0].dateRight);
        assert.ok(row.dateTime);
      }
      const body = await page
        .getByTestId("settings-window-body")
        .evaluate((el) => [el.clientWidth, el.scrollWidth]);
      assert.ok(body[1] <= body[0] + 1, `${width}/${fontSize}: body overflow`);
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test("inline account forms share one panel; background autofill cannot activate search", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors = await createFixture(page);
    const assertFieldTypography = async (rowKey) => {
      const typography = await page.locator(`[data-setting-row="${rowKey}"]`).evaluate((row) => {
        const read = (element) => {
          const style = getComputedStyle(element);
          return [
            style.fontFamily,
            style.fontSize,
            style.fontWeight,
            style.lineHeight,
            style.letterSpacing,
            style.textTransform,
          ];
        };
        return {
          title: read(row.querySelector('span[id$="-label"]')),
          label: read(row.querySelector("label[for]")),
        };
      });
      assert.deepEqual(typography.label, typography.title);
    };
    const trigger = page.getByTestId("setting-risky-apw");
    const current = page.getByTestId("settings-password-current");
    const search = page.getByTestId("settings-search-input");
    await trigger.waitFor({ timeout: 5_000 }).catch((cause) => {
      throw new Error(`Settings fixture failed: ${errors.join("; ")}`, { cause });
    });
    const emailTrigger = page.getByTestId("setting-actions-ae-0");
    const phoneTrigger = page.getByTestId("setting-actions-ap-0");
    const value = page.getByTestId("settings-contact-value");
    await emailTrigger.click();
    await assertFieldTypography("ae");
    assert.equal(
      await page.locator('[data-setting-row="ae"]').getByTestId("settings-contact-value").count(),
      1,
    );
    assert.equal(await page.getByRole("dialog").count(), 1);
    await value.fill("new@example.test");
    await page.getByTestId("settings-contact-password").fill("Example-current-123");
    await page.getByTestId("settings-contact-submit").click();
    await page.getByTestId("settings-contact-code").waitFor();
    assert.equal(
      await page.locator('[data-setting-row="ae"]').getByTestId("settings-contact-code").count(),
      1,
    );
    await phoneTrigger.click();
    await assertFieldTypography("ap");
    assert.equal(await page.getByTestId("settings-contact-code").count(), 0);
    assert.equal(
      await page.locator('[data-setting-row="ap"]').getByTestId("settings-contact-value").count(),
      1,
    );
    await value.fill("+90 532 123 42 18");
    await page.getByTestId("settings-contact-submit").click();
    await value.waitFor({ state: "detached" });
    assert.equal(await page.evaluate(() => window.savedPhone), "+905•••••4218");
    assert.equal(await phoneTrigger.evaluate((button) => button === document.activeElement), true);
    await phoneTrigger.click();
    await value.fill("+90 532 123 42 18");
    await page.evaluate(() => {
      window.delayPhone = true;
    });
    await page.getByTestId("settings-contact-submit").click();
    await trigger.click();
    await current.waitFor();
    await assertFieldTypography("apw");
    await page.evaluate(() => window.dispatchEvent(new Event("keydown")));
    await page.evaluate(() => window.finishPhone());
    assert.equal(await current.isVisible(), true);
    assert.equal(await value.count(), 0);
    await page.keyboard.press("Escape");
    await trigger.click();
    await current.waitFor();
    assert.equal(await current.evaluate((input) => input === document.activeElement), true);
    assert.equal(
      await current.evaluate((input) => input.form?.dataset.testid),
      "settings-password-form",
    );
    assert.equal(await search.evaluate((input) => input.form?.getAttribute("role")), "search");
    assert.equal(
      await page.locator('form [autocomplete="username"]').inputValue(),
      "account@example.test",
    );

    // Reproduce a password manager writing into an unfocused preceding input.
    // Use the native setter so React receives the same input event as autofill.
    await search.evaluate((input) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setter.call(input, "account@example.test");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    // Longer than SettingsWindow's search debounce: catch the delayed unmount.
    await page.waitForTimeout(600);
    assert.equal(await search.inputValue(), "");
    assert.equal(await current.isVisible(), true);
    await current.fill("Example-current-123");
    await page.getByTestId("settings-password-next").fill("Example-next-123");
    await page.getByTestId("settings-password-confirm").fill("Example-next-123");
    assert.equal(await page.getByTestId("settings-password-submit").isEnabled(), true);
    await page.getByTestId("settings-password-cancel").click();
    assert.equal(await current.count(), 0);
    await trigger.click();
    await current.waitFor();
    assert.equal(await current.inputValue(), "");
    await page.keyboard.press("Escape");
    assert.equal(await current.count(), 0);
    await trigger.click();
    await current.waitFor();
    await search.fill("parola");
    await page.waitForTimeout(600);
    assert.equal(await search.inputValue(), "parola");
    assert.equal(await current.count(), 0);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test("settings layout stays contained across every tab, viewport and expanded account form", async (t) => {
  const browser = await chromium.launch({
    headless: true,
    ignoreDefaultArgs: ["--hide-scrollbars"],
  });
  try {
    const page = await browser.newPage();
    const errors = await createFixture(page);
    // Classic scrollbars reproduce Windows WebView/browser width consumption.
    await page.addStyleTag({ content: "::-webkit-scrollbar {width:14px;height:8px;}" });
    const routes = await page.evaluate(() => window.settingsRoutes);
    t.diagnostic(
      `${routes.length} tabs; 12 viewport/text-size combinations; classic scrollbars; real application CSS`,
    );
    const failures = [];
    const settle = () =>
      page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
    const geometry = () =>
      page.evaluate(() => {
        const body = document.querySelector('[data-testid="settings-window-body"]');
        const content = body.firstElementChild;
        const bounds = (element) => {
          const rect = element.getBoundingClientRect();
          return [rect.x, rect.width];
        };
        return [
          bounds(document.querySelector('[data-testid="settings-window"]')),
          bounds(body),
          bounds(content),
          ...Array.from(document.querySelectorAll('[role="tab"]')).map(bounds),
        ];
      });
    const checkOverflow = async (label) => {
      const overflow = await page.evaluate(() => {
        const body = document.querySelector('[data-testid="settings-window-body"]');
        const result = [];
        for (const row of body.querySelectorAll("[data-setting-row]")) {
          if (row.scrollWidth > row.clientWidth + 1)
            result.push(`row ${row.dataset.settingRow} ${row.scrollWidth}/${row.clientWidth}`);
          const control = row.querySelector("[data-setting-control]");
          if (control) {
            const box = row.getBoundingClientRect();
            const padding = parseFloat(getComputedStyle(row).paddingLeft);
            for (const child of control.children) {
              const rect = child.getBoundingClientRect();
              if (
                rect.width &&
                (rect.left < box.left + padding - 1 || rect.right > box.right - padding + 1)
              )
                result.push(`control ${row.dataset.settingRow}`);
            }
          }
        }
        if (document.documentElement.scrollWidth > innerWidth + 1) result.push("viewport");
        if (body.scrollWidth > body.clientWidth + 1) {
          result.push(`body ${body.scrollWidth}/${body.clientWidth}`);
          const rect = body.getBoundingClientRect();
          for (const el of body.querySelectorAll(
            "[data-setting-row],input,button,[data-setting-control]",
          )) {
            const box = el.getBoundingClientRect();
            if (
              box.width &&
              (box.right > rect.left + body.clientWidth + 1 || box.left < rect.left - 1)
            ) {
              result.push(
                el.getAttribute("data-testid") ?? el.getAttribute("data-setting-row") ?? el.tagName,
              );
            }
          }
        }
        const tabs = document.querySelector('[role="tablist"]');
        if (
          tabs &&
          tabs.scrollWidth > tabs.clientWidth + 1 &&
          getComputedStyle(tabs).overflowX !== "auto"
        )
          result.push("unscrollable tabs");
        return result;
      });
      if (overflow.length) failures.push(`${label}: ${overflow.join(", ")}`);
    };
    for (const [width, fontSize] of [
      [320, 16],
      [390, 16],
      [720, 16],
      [768, 16],
      [900, 16],
      [1024, 16],
      [1280, 16],
      [1440, 16],
      [320, 20],
      [390, 20],
      [900, 20],
      [1280, 20],
    ]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(
        (size) => (document.documentElement.style.fontSize = `${size}px`),
        fontSize,
      );
      for (const route of routes) {
        await page.evaluate((route) => window.mountSettings(route), route);
        await settle();
        await checkOverflow(`${width}/${fontSize} ${route.section}/${route.tab}`);
      }
      await page.evaluate(() => window.mountSettings());
      await settle();
      for (const [trigger, field] of [
        ["setting-actions-ae-0", "settings-contact-value"],
        ["setting-actions-ap-0", "settings-contact-value"],
        ["setting-risky-apw", "settings-password-current"],
      ]) {
        const before = await geometry();
        await page.getByTestId(trigger).click();
        await page.getByTestId(field).waitFor();
        await settle();
        const after = await geometry();
        if (JSON.stringify(before) !== JSON.stringify(after))
          failures.push(`${width}/${fontSize} ${trigger}: horizontal geometry changed`);
        await checkOverflow(`${width}/${fontSize} ${trigger}`);
        await page.keyboard.press("Escape");
        await settle();
      }
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(() => window.mountSettings({ section: "notifications", tab: "general" }));
    await settle();
    const tabGeometry = await geometry();
    await page.locator("#settings-tab-surfaces").click();
    await settle();
    if (JSON.stringify(tabGeometry) !== JSON.stringify(await geometry()))
      failures.push("selecting a tab shifted horizontal geometry");
    await page.setViewportSize({ width: 320, height: 700 });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "20px";
      window.mountSettings({ section: "account", tab: "privacy" }, "page");
    });
    await settle();
    await page.getByTestId("setting-select-g1").click();
    await page.getByRole("listbox").waitFor();
    await checkOverflow("320/20 page open select menu");
    const menuBounds = await page.getByRole("listbox").boundingBox();
    assert.ok(
      menuBounds.x >= 0 && menuBounds.x + menuBounds.width <= 320,
      "select menu must fit viewport",
    );
    await page.keyboard.press("Escape");
    // A short tab gaining a scrollbar must keep its centered content at the same x.
    await page.setViewportSize({ width: 900, height: 1000 });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "16px";
      window.mountSettings({ section: "account", tab: "account" }, "page");
    });
    await settle();
    const before = await geometry();
    await page
      .getByTestId("settings-window-body")
      .evaluate((body) => (body.firstElementChild.style.minHeight = `${body.clientHeight + 1}px`));
    const after = await geometry();
    if (JSON.stringify(before) !== JSON.stringify(after))
      failures.push("scrollbar appearance shifted centered content");
    assert.deepEqual(errors, []);
    assert.deepEqual(failures, []);
  } finally {
    await browser.close();
  }
});
