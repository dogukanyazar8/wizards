import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";
import { build } from "esbuild";

test("channel and DM pin controls open the actual list, paginate, jump, and unpin safely", async () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const mocks = {
    "next/navigation": "export const useRouter = () => ({push() {}});",
    "@/hooks/use-socket":
      "const socket = {on(){},off(){},emit(){}}; export const useSocket = () => socket;",
    "@/hooks/use-typing": "export const useTyping = () => ({typingUsers: []});",
    "@/hooks/use-app-shortcut-label": 'export const useAppShortcutLabel = () => "Ctrl+F";',
    "@/hooks/use-responsive-layout":
      "export const useResponsiveLayout = () => ({viewportWidth:1400}); export const useBodyScrollLock = () => {};",
    "@/hooks/use-right-panel-visibility":
      "export const useRightPanelVisibility = () => ({isOpen:false,setOpen(){}});",
    "@/hooks/use-conversation-rows": "export const useConversationRows = () => ({rows:[]});",
    "@/hooks/use-poll": "export const usePoll = () => ({});",
    "@/hooks/use-messages":
      'export const getMessagesQueryKey = (mode,id) => ["messages",mode,id]; export const appendMessage = () => {}; export const OPTIMISTIC_MESSAGE_PREFIX = "optimistic-";',
    "@/components/providers/dm-call-provider":
      "export const useDMCallActions = () => ({endCall(){},startCall(){}});",
    "@/store/dm-call-store":
      "export const useDMCallStore = selector => selector({session:null,isMinimized:false});",
    "@/lib/store":
      "export const useAppStore = selector => selector({setMobileSidebarOpen(){},openChannelNotificationsModal(){}});",
    "@/lib/servers/right-panel-store":
      'export const useServerRightPanelContent = () => "members"; export const setServerRightPanelContent = () => {};',
    "@/lib/workspace/client": `
      export const workspaceQueryKeys = {server:id=>["server",id],pinnedMessages:id=>["pins",id]};
      export async function fetchWorkspaceServer(){return {};}
      export async function fetchChannelNotificationSettings(){return {level:"all"};}
      export async function fetchChannelPinnedMessagesPage(id,cursor){
        window.pages = [...(window.pages ?? []),cursor];
        if(window.failLoad) throw new Error("load failed");
        return {messages:window.channelPins.slice(cursor ? 1 : 0,cursor ? 2 : 1), nextCursor:!cursor && window.channelPins.length > 1 ? {pinnedAt:"2026-09-16T00:00:00.000Z",messageId:"one"} : null};
      }
      export async function unpinChannelMessageRequest(channelId,messageId){
        window.unpins = [...(window.unpins ?? []),{channelId,messageId}];
        if(window.failUnpin) throw new Error("unpin failed");
        window.channelPins = window.channelPins.filter(p=>p.id !== messageId);
        return {};
      }
    `,
    "@/lib/messages/screen-client": `
      export class MessagesClientError extends Error {}
      export async function fetchConversationPins(){return window.dmPins;}
      export async function unpinDmMessage(id,messageId){window.dmUnpins = [...(window.dmUnpins ?? []),messageId]; return window.dmPins.filter(p=>p.messageId !== messageId);}
      export async function pinDmMessage(){return [];}
      export async function createPoll(){}
      export async function fetchPollVoters(){return [];}
      export async function forwardDmMessage(){}
    `,
  };
  const inertComponents = {
    "./message-list": ["MessageList"],
    "./message-input": ["MessageInput"],
    "./message-search-panel": ["MessageSearchPanel"],
    "./thread-panel": ["ThreadPanel"],
    "./typing-indicator": ["TypingIndicator"],
    "@/components/messages/conversation-toast": ["ConversationToastStrip"],
    "@/components/messages/message-poll": ["MessagePoll"],
    "@/components/messages/messages-search-panel": ["MessagesSearchPanel"],
    "@/components/messages/poll-composer": ["PollComposer"],
    "@/components/messages/poll-voters-sheet": ["PollVotersSheet"],
    "@/components/messages/forward-message-sheet": ["ForwardMessageSheet"],
    "@/components/shell/server-member-panel": ["ServerMemberPanel"],
    "@/components/dm/dm-conversation": ["DmComposer", "DmMessageSurface"],
    "@/components/dm/dm-call-view": ["DmCallView"],
  };
  for (const [path, names] of Object.entries(inertComponents)) {
    mocks[path] = names
      .map((name) => `export const ${name} = ({children}) => children ?? null;`)
      .join("\n");
  }
  const bundle = await build({
    absWorkingDir: root,
    bundle: true,
    write: false,
    platform: "browser",
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"development"', "process.env": "{}" },
    plugins: [
      {
        name: "pin-dependencies",
        setup(builder) {
          builder.onResolve({ filter: /.*/ }, ({ path }) =>
            Object.hasOwn(mocks, path) ? { path, namespace: "pin-test" } : undefined,
          );
          builder.onLoad({ filter: /.*/, namespace: "pin-test" }, ({ path }) => ({
            contents: mocks[path],
            loader: "js",
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
      import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
      import {LocaleProvider} from "@/components/providers/locale-provider";
      import {getMessagesForLocale} from "@/lib/locale";
      import {ChatArea} from "@/components/chat/chat-area";
      const root = createRoot(document.getElementById("root"));
      window.mountChat = (mode = "channel", canModerate = true) => {
        const client = new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
        window.channelPins = ["one","two"].map(id=>({id,channelId:"channel-1",content:id,author:{displayName:"Ada"},createdAt:"2026-09-16T00:00:00.000Z",pinnedAt:"2026-09-16T00:00:00.000Z"}));
        window.dmPins = [{messageId:"dm-one",authorName:"DM author",excerpt:"DM pin",pinnedAt:"2026-09-16T00:00:00.000Z",removable:true}];
        root.render(<QueryClientProvider client={client}><LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
          <ChatArea key={mode+canModerate} conversationId="channel-1" mode={mode} canModerate={canModerate} currentUserId="viewer" currentUserDisplayName="Viewer" currentUserUsername="viewer" uploadthingEnabled={false}/>
        </LocaleProvider></QueryClientProvider>);
      };
    `,
    },
  });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("https://pins.invalid/", (route) =>
      route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' }),
    );
    await page.goto("https://pins.invalid/");
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.evaluate(() => window.mountChat());
    await page.getByTestId("pinned-strip-see-all").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId("pinned-list-row")).toHaveCount(1);
    await dialog.getByRole("button", { name: "Daha fazla sonuç yükle" }).click();
    await expect(dialog.getByTestId("pinned-list-row")).toHaveCount(2);
    await dialog.getByTestId("pinned-list-jump").last().click();
    await expect(dialog).toHaveCount(0);
    assert.equal(new URL(page.url()).searchParams.get("message"), "two");
    await page.getByTestId("server-channel-pins").click();
    await expect(dialog).toBeVisible();
    await page.evaluate(() => {
      window.failUnpin = true;
    });
    await dialog.getByTestId("pinned-list-unpin").first().click();
    await expect(dialog.getByRole("alert")).toContainText("Sabitleme güncellenemedi");
    await expect(dialog.getByTestId("pinned-list-row")).toHaveCount(2);
    await page.evaluate(() => {
      window.failUnpin = false;
    });
    await dialog.getByTestId("pinned-list-unpin").first().click();
    await expect(dialog.getByTestId("pinned-list-row")).toHaveCount(1);
    await page.evaluate(() => window.mountChat("channel", false));
    await page.getByTestId("pinned-strip-see-all").click();
    await expect(dialog.getByTestId("pinned-list-unpin")).toHaveCount(0);
    await page.evaluate(() => window.mountChat("dm"));
    await page.getByTestId("pinned-strip-see-all").click();
    await expect(dialog).toContainText("DM pin");
    await dialog.getByTestId("pinned-list-unpin").click();
    await expect(dialog.getByTestId("pinned-list-empty")).toBeVisible();
    assert.deepEqual(await page.evaluate(() => window.dmUnpins), ["dm-one"]);
    assert.deepEqual(await page.evaluate(() => window.unpins), [
      { channelId: "channel-1", messageId: "one" },
      { channelId: "channel-1", messageId: "one" },
    ]);
    await page.evaluate(() => {
      window.failLoad = true;
      window.mountChat("channel");
    });
    await page.getByTestId("server-channel-pins").click();
    await expect(dialog.getByRole("alert")).toContainText("Sabitlenen mesajlar yüklenemedi");
    await expect(dialog.getByTestId("pinned-list-empty")).toHaveCount(0);
    await page.evaluate(() => {
      window.failLoad = false;
    });
    await dialog.getByRole("button", { name: "Tekrar dene" }).click();
    await expect(dialog.getByTestId("pinned-list-row")).toHaveCount(1);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
