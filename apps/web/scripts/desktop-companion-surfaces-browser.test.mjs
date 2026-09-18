import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";
import { build } from "esbuild";

// Run the actual React coordinator, stores, snapshots and IPC bridge. Only the
// server, voice connection and native OS boundary are replaced in this browser.
const root = fileURLToPath(new URL("../", import.meta.url));
const fixtures = {
  "next/navigation": "const router = {push(){},back(){}}; export const useRouter = () => router;",
  "@/hooks/use-socket":
    "const socket = {connected:true,on(){},off(){}}; export const useSocket = () => socket;",
  "@/components/providers/locale-provider":
    'const locale = {locale:"en",t:key=>key}; export const useI18n = () => locale;',
  "@/lib/notifications/client":
    'export const fetchUnreadCount = async()=>0; export const notificationsQueryKeys = {root:["notifications"],unreadCount:["unread"]};',
  "@/lib/settings/client":
    'export const fetchLayoutSettings = async()=>({desktopNotifications:false}); export const fetchMentionSettings = async()=>({}); export const settingsQueryKeys = {layout:["layout"],mentions:["mentions"]};',
  "@/lib/desktop/performance": "export const recordDesktopPerformanceMetric = () => {};",
  "@/lib/store": `
    const state = {desktopStreamerModeEnabled:false, desktopStreamerModeProcessDetectionEnabled:false,
      desktopRichPresenceEnabled:false,setDesktopStreamerModeDetected(){}};
    export const useAppStore = selector => selector(state);
  `,
  "@/components/providers/voice-provider": `
    import {create} from "zustand";
    export const useVoiceConnection = create(()=>({activeChannelId:null,connectionState:"connected",
      isDeafened:false,isMuted:false,isScreenSharing:false,participants:[],
      leaveChannel(){},startPushToTalk(){},stopPushToTalk(){},toggleDeafen(){},toggleMute(){}}));
  `,
  "@tauri-apps/api/window": `
    export const getCurrentWindow = () => ({
      isFocused:async()=>window.mainFocused,
      onFocusChanged:async callback=>{window.nativeFocusChanged=callback;return ()=>{};}
    });
  `,
  "@tauri-apps/api/event": "export const listen = async()=>()=>{};",
  "@tauri-apps/api/core": `
    export async function invoke(command,args){
      window.commands.push({command,args});
      switch(command){
        case "get_desktop_main_window_focused": return window.mainFocused;
        case "get_desktop_foreground_process_name": return window.foregroundProcess;
        case "get_desktop_voice_shortcut_status": return {enabled:false,registered:[]};
        case "set_desktop_activity_status": return true;
        case "set_desktop_game_overlay_visible":
        case "set_desktop_voice_mini_visible": {
          const key = command.includes("game_overlay") ? "gameOverlay" : "voiceMini";
          if(window.failNextShow === key && args.visible){
            window.failNextShow = null;
            throw new Error("Native creation failed");
          }
          if(window.holdNextShow === key && args.visible){
            window.holdNextShow = null;
            await new Promise((resolve,reject)=>{
              window.rejectPendingShow = ()=>reject(new Error("Late native creation failure"));
            });
          }
          window.surfaces[key] = {...window.surfaces[key],exists:args.visible,visible:args.visible};
          return args.visible;
        }
        case "refresh_desktop_companion_surfaces": return structuredClone(window.surfaces);
        case "publish_desktop_voice_mini_snapshot":
        case "publish_desktop_game_overlay_snapshot": return {version:1,delivered:true};
        default: throw new Error("Unexpected native command: "+command);
      }
    }
  `,
};

const bundle = build({
  absWorkingDir: root,
  bundle: true,
  write: false,
  platform: "browser",
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"development"', "process.env": "{}" },
  plugins: [
    {
      name: "companion-boundaries",
      setup(builder) {
        builder.onResolve({ filter: /.*/ }, ({ path }) =>
          Object.hasOwn(fixtures, path) ? { path, namespace: "companion-test" } : undefined,
        );
        builder.onLoad({ filter: /.*/, namespace: "companion-test" }, ({ path }) => ({
          contents: fixtures[path],
          loader: "js",
          resolveDir: root,
        }));
      },
    },
  ],
  stdin: {
    resolveDir: root,
    loader: "tsx",
    contents: `
      import React from "react";
      import {createRoot} from "react-dom/client";
      import {flushSync} from "react-dom";
      import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
      import {DesktopExperience} from "@/components/desktop/desktop-experience";
      import {useVoiceStore} from "@/store/voice-store";
      import {useVoiceConnection} from "@/components/providers/voice-provider";
      window.__WHISPR_DESKTOP__ = {shell:"desktop",platform:"tauri"};
      window.commands = [];
      window.mainFocused = true;
      window.foregroundProcess = "notepad.exe";
      const surface = {exists:false,visible:false,minimized:false,width:400,height:240,x:0,y:0};
      window.surfaces = {gameOverlay:{...surface},voiceMini:{...surface}};
      Object.defineProperty(document,"hasFocus",{value:()=>window.mainFocused});
      window.setFocus = focused => {
        window.mainFocused = focused;
        window.nativeFocusChanged?.({payload:focused});
        window.dispatchEvent(new Event(focused ? "focus" : "blur"));
      };
      window.setVoice = value => flushSync(()=>useVoiceConnection.setState(value));
      window.setPreferences = value => flushSync(()=>useVoiceStore.setState(value));
      const client = new QueryClient({defaultOptions:{queries:{retry:false}}});
      const reactRoot = createRoot(document.getElementById("root"));
      window.unmount = ()=>flushSync(()=>reactRoot.unmount());
      flushSync(()=>reactRoot.render(<QueryClientProvider client={client}><DesktopExperience/></QueryClientProvider>));
    `,
  },
});

async function withCoordinator(run) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("https://companions.invalid/**", (route) =>
      route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' }),
    );
    await page.goto("https://companions.invalid/");
    await page.clock.install();
    await page.addScriptTag({ content: (await bundle).outputFiles[0].text });
    await run(page);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
}

async function expectSurfaces(page, gameOverlay, voiceMini) {
  await expect
    .poll(() =>
      page.evaluate(() => [window.surfaces.gameOverlay.visible, window.surfaces.voiceMini.visible]),
    )
    .toEqual([gameOverlay, voiceMini]);
}

async function enableInVoice(page, focused = true) {
  await page.evaluate((focused) => {
    window.setFocus(focused);
    window.setPreferences({ desktopGameOverlayEnabled: true, desktopVoiceMiniEnabled: true });
    window.setVoice({ activeChannelId: "voice-1" });
  }, focused);
}

test("enabled companions follow the voice session and settings regardless of main-window focus", async () => {
  await withCoordinator(async (page) => {
    await page.evaluate(() =>
      window.setPreferences({ desktopGameOverlayEnabled: true, desktopVoiceMiniEnabled: true }),
    );
    await expectSurfaces(page, false, false);
    await enableInVoice(page);
    await expectSurfaces(page, true, true);
    await page.evaluate(() => window.setFocus(false));
    await expectSurfaces(page, true, true);
    await page.evaluate(() => window.setFocus(true));
    await expectSurfaces(page, true, true);
    await page.evaluate(() => window.setPreferences({ desktopGameOverlayEnabled: false }));
    await expectSurfaces(page, false, true);
    await page.evaluate(() =>
      window.setPreferences({ desktopGameOverlayEnabled: true, desktopVoiceMiniEnabled: false }),
    );
    await expectSurfaces(page, true, false);
    await page.evaluate(() => window.setVoice({ activeChannelId: null }));
    await expectSurfaces(page, false, false);
  });
});

test("participant updates publish fresh snapshots without restarting native surface refresh", async () => {
  await withCoordinator(async (page) => {
    await enableInVoice(page, false);
    await expectSurfaces(page, true, true);
    const refreshCount = () =>
      page.evaluate(
        () =>
          window.commands.filter((c) => c.command === "refresh_desktop_companion_surfaces").length,
      );
    const before = await refreshCount();
    for (let i = 1; i <= 10; i++) {
      await page.evaluate(
        (i) =>
          window.setVoice({
            participants: [
              {
                userId: "local",
                username: "test",
                displayName: "Speaker " + i,
                avatarUrl: null,
                isLocal: true,
                isMuted: false,
                isDeafened: false,
                isSpeaking: true,
                audioLevel: i / 10,
              },
            ],
          }),
        i,
      );
    }
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            window.commands.findLast((c) => c.command === "publish_desktop_voice_mini_snapshot")
              ?.args.snapshot.participants[0]?.displayName,
        ),
      )
      .toBe("Speaker 10");
    assert.equal(
      await refreshCount(),
      before,
      "audio/participant updates must not refresh native windows",
    );
    await page.clock.runFor(5_000);
    await expect.poll(refreshCount).toBe(before + 1);
  });
});

test("game detection filters other apps but does not suppress companions over Whispr", async () => {
  await withCoordinator(async (page) => {
    await page.evaluate(() =>
      window.setPreferences({ desktopGameOverlayProcessDetectionEnabled: true }),
    );
    await enableInVoice(page);
    await expectSurfaces(page, true, true);
    await page.evaluate(() => window.setFocus(false));
    await expectSurfaces(page, false, true);
    await page.evaluate(() => {
      window.foregroundProcess = "osu!.exe";
    });
    await page.clock.runFor(2_000);
    await expectSurfaces(page, true, true);
    await page.evaluate(() =>
      window.setPreferences({
        desktopGameOverlayGameSettings: {
          "osu!.exe": {
            enabled: false,
            anchor: "top-left",
            size: "normal",
            speakingOnly: false,
          },
        },
      }),
    );
    await expectSurfaces(page, false, true);
    await page.evaluate(() => window.setFocus(true));
    await expectSurfaces(page, true, true);
  });
});

test("native show failures recover and an offline/resume transition does not strand enabled companions", async () => {
  await withCoordinator(async (page) => {
    await page.evaluate(() => {
      window.failNextShow = "voiceMini";
    });
    await enableInVoice(page, false);
    await expect.poll(() => page.evaluate(() => window.failNextShow)).toBe(null);
    await page.clock.runFor(5_000);
    await expectSurfaces(page, true, true);
    await page.evaluate(() => {
      window.dispatchEvent(new Event("offline"));
      window.dispatchEvent(new Event("online"));
    });
    await expectSurfaces(page, true, true);
    await page.clock.fastForward(60_000);
    await expectSurfaces(page, true, true);
    await page.evaluate(() => window.unmount());
    await expectSurfaces(page, false, false);
  });
});

test("a late Voice Mini failure cannot overwrite a newer toggle", async () => {
  await withCoordinator(async (page) => {
    await page.evaluate(() => {
      window.holdNextShow = "voiceMini";
    });
    await enableInVoice(page);
    await expect.poll(() => page.evaluate(() => typeof window.rejectPendingShow)).toBe("function");
    await page.evaluate(() => window.setPreferences({ desktopVoiceMiniEnabled: false }));
    await expectSurfaces(page, true, false);
    await page.evaluate(() => window.rejectPendingShow());
    await page.evaluate(() => window.setPreferences({ desktopVoiceMiniEnabled: true }));
    await expectSurfaces(page, true, true);
  });
});

test("a failed overlay opening recovers on the bounded health check", async () => {
  await withCoordinator(async (page) => {
    await page.evaluate(() => {
      window.failNextShow = "gameOverlay";
    });
    await enableInVoice(page);
    await expect.poll(() => page.evaluate(() => window.failNextShow)).toBe(null);
    await page.clock.runFor(5_000);
    await expectSurfaces(page, true, true);
  });
});

test("unmount cancels a native overlay repair even before it reports visibility", async () => {
  await withCoordinator(async (page) => {
    await page.evaluate(() => {
      window.failNextShow = "gameOverlay";
    });
    await enableInVoice(page);
    await expect.poll(() => page.evaluate(() => window.failNextShow)).toBe(null);
    await page.evaluate(() => {
      window.holdNextShow = "gameOverlay";
    });
    await page.clock.runFor(5_000);
    await expect.poll(() => page.evaluate(() => typeof window.rejectPendingShow)).toBe("function");
    await page.evaluate(() => window.unmount());
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            window.commands.findLast((c) => c.command === "set_desktop_game_overlay_visible")?.args
              .visible,
        ),
      )
      .toBe(false);
    await page.evaluate(() => window.rejectPendingShow());
    await expectSurfaces(page, false, false);
  });
});
