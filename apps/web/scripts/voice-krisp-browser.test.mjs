import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";
import { build } from "esbuild";

const root = fileURLToPath(new URL("../", import.meta.url));
const sdkPath = JSON.stringify(fileURLToPath(import.meta.resolve("livekit-client")));
const fixtures = {
  "livekit-client": `
    export * from ${sdkPath};
    import {Room as BaseRoom} from ${sdkPath};
    export class Room extends BaseRoom {
      constructor(options){super(options);window.patchRoom(this);}
    }
  `,
  "next/navigation": "const router={push(){}};export const useRouter=()=>router;",
  "@/hooks/use-toast": "const toast={show(){}};export const useToast=()=>toast;",
  "@/hooks/use-go-live-candidate":
    "const state={candidate:null,missingCount:0};export const useGoLiveCandidate=()=>state;",
  "@/hooks/use-screen-share-4k-flag": "export const useScreenShare4kFlag=()=>false;",
  "@/hooks/use-screen-share-health": "export const useScreenShareHealthSampler=()=>{};",
  "@/components/providers/locale-provider":
    "const locale={t:key=>key};export const useI18n=()=>locale;",
  "@/components/voice/voice-audio-renderer": "export const VoiceAudioRenderer=()=>null;",
  "@/components/voice/voice-invite-toasts": "export const VoiceInviteToasts=()=>null;",
  "@/lib/voice/use-voice-audio-levels": "export const useVoiceAudioLevels=()=>{};",
  "@/lib/voice/use-voice-heartbeat":
    "const heartbeat={startHeartbeat(){},stopHeartbeat(){}};export const useVoiceHeartbeat=()=>heartbeat;",
  "@/lib/socket/client":
    "const socket={on(){},off(){},emit(){}};export const getSocket=()=>socket;",
  "@/lib/voice/client": `
    export const fetchLiveKitToken=async()=>({url:'wss://test.livekit.cloud',token:'test',mediaPolicy:{videoQualityMode:'auto',audioBitrate:64000}});
    export const upsertVoiceState=async()=>({participants:[]});
    export const deleteVoiceState=async()=>{};
    export const sendVoiceHeartbeat=async()=>{};
    export const voiceQueryKeys={root:['voice'],state:()=>['voice','state']};
  `,
  "@livekit/krisp-noise-filter": `
    export const isKrispNoiseFilterSupported=()=>true;
    export function KrispNoiseFilter(){
      let enabled=false;
      return {
        name:'livekit-noise-filter',
        async init() {
          window.processorInitializations++;
          window.nativeSuppression=false;
        },
        async restart(){},
        async destroy(){enabled=false;},
        async setEnabled(value){enabled=value && window.allowKrisp;return enabled;},
        isEnabled(){return enabled;},
      };
    }
  `,
};

const bundle = await build({
  absWorkingDir: root,
  bundle: true,
  write: false,
  platform: "browser",
  format: "iife",
  jsx: "automatic",
  define: {
    "process.env.NODE_ENV": '"development"',
    "process.env.NEXT_PUBLIC_LIVEKIT_URL": '"wss://test.livekit.cloud"',
    "process.env": "{}",
  },
  plugins: [
    {
      name: "voice-boundaries",
      setup(builder) {
        builder.onResolve({ filter: /.*/ }, ({ path }) =>
          Object.hasOwn(fixtures, path) ? { path, namespace: "fixture" } : undefined,
        );
        builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({
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
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
    import {Room,LocalAudioTrack,Track,ConnectionState} from 'livekit-client';
    import {LiveVoiceProvider} from '@/components/providers/live-voice-provider';
    import {useVoiceState} from '@/components/providers/voice-context';
    import {useVoiceStore} from '@/store/voice-store';
    import {getKrispStatus} from '@/lib/voice/krisp-status';
    window.allowKrisp=false;
    window.processorInitializations=0;
    window.captureOptions=[];
    window.__WHISPR_DESKTOP__={shell:'desktop',platform:'tauri'};
    // Keep the real Room, participant and LocalAudioTrack implementations. Replace transport
    // and capture with a synthetic microphone; no network or licensed Krisp service is used.
    window.patchRoom=(room)=>{room.connect=async function(){
      window.testRoom=this;
      this.state=ConnectionState.Connected;
      this.localParticipant.setMicrophoneEnabled=async (enabled,options)=>{
        let publication=this.localParticipant.getTrackPublication(Track.Source.Microphone);
        if(publication){publication.isMuted=!enabled;return publication;}
        if(!enabled)return;
        const context=new AudioContext();
        await context.resume();
        const destination=context.createMediaStreamDestination();
        const track=new LocalAudioTrack(destination.stream.getAudioTracks()[0],{},true,context);
        track.source=Track.Source.Microphone;
        track.restartTrack=async options=>{window.captureOptions.push(options);window.nativeSuppression=options.noiseSuppression;};
        publication={track,source:Track.Source.Microphone,isMuted:false,trackSid:'mic',kind:'audio'};
        this.localParticipant.trackPublications.set('mic',publication);
        this.localParticipant.audioTrackPublications.set('mic',publication);
        return publication;
      };
      this.emit('connectionStateChanged',this.state);
    };room.startAudio=async()=>{};room.disconnect=async()=>{};};
    Object.defineProperty(navigator,'mediaDevices',{value:{getUserMedia:async()=>{},getSupportedConstraints:()=>({})}});
    function ReadState(){
      const voice=useVoiceState();
      window.voice=voice;
      return <output>{JSON.stringify({
        active:voice.isKrispNoiseCancellationActive,
        availability:voice.krispAvailability,
        muted:voice.isMuted,
        error:voice.errorMessage,
        label:getKrispStatus({...voice,isConnected:voice.connectionState==='connected'}).labelKey,
      })}</output>;
    }
    window.start=async(layered)=>{
      useVoiceStore.getState().setMuted(false);
      useVoiceStore.getState().setAudioPreferences({krispNoiseCancellation:true,noiseSuppression:true,voiceIsolation:false,
        enhancedNoiseFilterMode:layered?'layered':'krisp_only'});
      await window.voice.joinDirectCall({conversationId:'call'});
    };
    createRoot(document.getElementById('root')).render(
      <QueryClientProvider client={new QueryClient()}>
        <LiveVoiceProvider currentUser={{id:'local',username:'local',displayName:'Local'}}><ReadState/></LiveVoiceProvider>
      </QueryClientProvider>
    );
  `,
  },
});

for (const layered of [true, false]) {
  test(`failed Krisp activation restores native capture (${layered ? "layered" : "Krisp-only"})`, async () => {
    const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
    try {
      const page = await browser.newPage();
      page.on("console", (message) => {
        if (message.type() === "error") console.error(message.text());
      });
      await page.route("**/*", (route) => route.abort());
      await page.route("https://voice.test/", (route) =>
        route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' }),
      );
      await page.goto("https://voice.test/");
      await page.addScriptTag({ content: bundle.outputFiles[0].text });
      await expect(page.locator("output")).toBeVisible();
      await page.evaluate((value) => window.start(value), layered);
      await expect(page.locator("output")).toContainText('"availability":"unavailable"');
      await expect
        .poll(() => page.evaluate(() => window.captureOptions.at(-1)?.noiseSuppression))
        .toBe(true);
      assert.equal(await page.evaluate(() => window.nativeSuppression), true);
      assert.equal(
        await page.evaluate(() =>
          window.testRoom.localParticipant.getTrackPublication("microphone").track.getProcessor(),
        ),
        undefined,
      );
      await expect(page.locator("output")).toContainText('"muted":false');
      await expect(page.locator("output")).toContainText("server.voice.header.krispUnavailable");
      await page.evaluate(() => {
        window.allowKrisp = true;
        return window.voice.retryKrispNoiseCancellation();
      });
      await expect(page.locator("output")).toContainText('"active":true');
      await expect(page.locator("output")).toContainText("server.voice.header.krispActive");
      await page.evaluate(() => window.voice.toggleMute());
      await expect(page.locator("output")).toContainText("server.voice.header.krispPaused");
      await page.evaluate(() => window.voice.toggleMute());
      await expect(page.locator("output")).toContainText('"active":true');
      await page.evaluate(() => window.voice.setAudioPreference("krispNoiseCancellation", false));
      await expect(page.locator("output")).toContainText("server.voice.header.krispInactive");
      await expect
        .poll(() =>
          page.evaluate(() =>
            Boolean(
              window.testRoom.localParticipant
                .getTrackPublication("microphone")
                .track.getProcessor(),
            ),
          ),
        )
        .toBe(false);
    } finally {
      await browser.close();
    }
  });
}
