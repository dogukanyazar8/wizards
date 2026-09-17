import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { LocaleProvider } from "@/components/providers/locale-provider";
import type { VoiceParticipantViewModel } from "@/components/providers/voice-provider";
import { getMessagesForLocale } from "@/lib/locale";
import { TR_MESSAGES } from "@/lib/locale/messages/tr";
import { SERVER_METRICS, pxToRem } from "@/lib/servers/metrics";
import { selectVoiceSubtitle } from "@/lib/servers/voice-presentation";
import {
  ServerScreenShareStage,
  ServerScreenShareStripCard,
  ServerVoiceControls,
  ServerVoiceDisconnectedState,
  ServerVoiceEmptyState,
  ServerVoiceGrid,
  ServerVoiceHeader,
  ServerVoiceTile,
} from "./server-voice-surface";

/**
 * Ş7 — SPEC-SUNUCU §5'in sunum katmanı.
 *
 * Test **ölçünün kendisini** değil, ölçünün sözlükten geldiğini doğrular. Sözlük ↔ referans
 * HTML eşitliği `lib/servers/parity.test.ts` işidir.
 *
 * **K5 kanıtı burada değil**: `lib/voice/*` dosyalarına dokunulmadığı `git status` ile ve
 * `video-quality` · `video-subscription` · `screen-share` · `participant-view-model` ·
 * `krisp-quality` testlerinin yeşilliğiyle raporda kayıtlı.
 */

const MESSAGES = getMessagesForLocale("tr");
const here = dirname(fileURLToPath(import.meta.url));
const { screenShare, voiceControls, voiceGrid, voiceHeader } = SERVER_METRICS;

function render(node: React.ReactElement): string {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={TR_MESSAGES}>
      {node}
    </LocaleProvider>,
  );
}

function participant(
  overrides: Partial<VoiceParticipantViewModel> = {},
): VoiceParticipantViewModel {
  return {
    audioLevel: 0,
    avatarUrl: null,
    cameraPublication: null,
    cameraTrack: null,
    displayName: "Selin Aksoy",
    isCameraEnabled: false,
    isDeafened: false,
    isLocal: false,
    isMuted: false,
    isSpeaking: false,
    userId: "u-selin",
    username: "selin",
    ...overrides,
  };
}

describe("§5.1 ses kanalı başlığı", () => {
  const subtitle = selectVoiceSubtitle({
    cameraCount: 0,
    connectedAtMs: 0,
    nowMs: 12 * 60_000,
    participantCount: 4,
    sharerName: null,
  });

  function renderHeader(overrides: Partial<React.ComponentProps<typeof ServerVoiceHeader>> = {}) {
    return render(
      <ServerVoiceHeader
        categoryName="LOBBY"
        channelName="Genel Sohbet"
        krispActive
        krispLabel={MESSAGES["server.voice.header.krispActive"] ?? ""}
        latency={{ ms: null, tier: "good" }}
        membersActive={false}
        onOpenMembers={() => undefined}
        subtitle={subtitle}
        {...overrides}
      />,
    );
  }

  it("hoparlör ikonu success, ad ve kategori çipi yerinde", () => {
    const html = renderHeader();

    assert.match(html, /data-testid="server-voice-channel"/u);
    assert.match(html, /Genel Sohbet/u);
    assert.match(html, /data-testid="server-voice-category-chip"/u);
    assert.match(html, /LOBBY/u);
    assert.ok(html.includes("hsl(var(--success))"));
  });

  it("alt satır §5.1'in üç biçiminden birini yazar", () => {
    assert.match(renderHeader(), /4 katılımcı · 12 dakikadır bağlı/u);

    const camera = renderHeader({
      subtitle: selectVoiceSubtitle({
        cameraCount: 2,
        connectedAtMs: 0,
        nowMs: 12 * 60_000,
        participantCount: 4,
        sharerName: null,
      }),
    });

    assert.match(camera, /2 kamera açık · 4 katılımcı · 12 dakikadır bağlı/u);

    const share = renderHeader({
      subtitle: selectVoiceSubtitle({
        cameraCount: 2,
        connectedAtMs: 0,
        nowMs: 12 * 60_000,
        participantCount: 4,
        sharerName: "Doğukan",
      }),
    });

    assert.match(share, /Doğukan ekran paylaşıyor · 4 katılımcı/u);
  });

  it("Krisp çipi gerçek durumu taşır", () => {
    assert.match(renderHeader(), /data-krisp-active="true"/u);
    assert.match(
      renderHeader({
        krispActive: false,
        krispLabel: MESSAGES["server.voice.header.krispInactive"] ?? "",
      }),
      /data-krisp-active="false"/u,
    );
  });

  it("gecikme çipi dört çubuk çizer ve kademeyi taşır", () => {
    const html = renderHeader();

    assert.match(html, /data-latency-tier="good"/u);

    for (const height of voiceHeader.latencyBarHeights) {
      assert.ok(html.includes(`height:${pxToRem(height)}`), String(height));
    }
  });

  it("kalite bilinmiyorken çip hiç çizilmez (TODO(api): RTT alanı yok)", () => {
    assert.doesNotMatch(renderHeader({ latency: null }), /server-voice-latency-chip/u);
  });

  it("`Üyeler` düğmesi `aria-pressed` taşır", () => {
    assert.match(renderHeader({ membersActive: true }), /aria-pressed="true"/u);
  });

  it("hiçbir renk sabiti taşımaz", () => {
    const html = renderHeader();

    assert.doesNotMatch(html, /#[0-9a-fA-F]{3,8}/u);
    assert.doesNotMatch(html, /rgba?\(/u);
  });
});

describe("§5.2 katılımcı kartı", () => {
  it("katılımcı adı gövde fontunu devralır; dar satırda alt glifler kırpılmaz", () => {
    const html = render(
      <ServerVoiceTile
        cameraSlot={null}
        participant={participant({ displayName: "Doğukan Yazar" })}
        roleBadge="owner"
      />,
    );
    const nameTag = html.match(/<span[^>]*data-testid="server-voice-tile-name"[^>]*>/u)?.[0];

    assert.ok(nameTag);
    assert.doesNotMatch(nameTag, /font-family:/u);
  });

  it("konuşanda halka, glow ve dalga; ekran okuyucuya cümle", () => {
    const html = render(
      <ServerVoiceTile
        cameraSlot={null}
        participant={participant({ isSpeaking: true })}
        roleBadge="owner"
      />,
    );

    assert.match(html, /data-speaking="true"/u);
    assert.ok(html.includes(`hsl(var(--success)/${voiceGrid.cardSpeakingBorderAlpha})`));
    assert.ok(html.includes(`hsl(var(--success)/${voiceGrid.cardSpeakingGlowAlpha})`));
    assert.match(html, /data-testid="server-voice-wave"/u);
    // §12 — halka tek ipucu olamaz.
    assert.match(html, /Selin Aksoy konuşuyor/u);
  });

  it("dalga `wbar` sınıfını kullanır ve gecikmeyi sözlükten alır", () => {
    const html = render(
      <ServerVoiceTile
        cameraSlot={null}
        participant={participant({ isSpeaking: true })}
        roleBadge={null}
      />,
    );

    assert.match(html, /class="voice-wave-bar"/u);
    assert.ok(html.includes(`--wbar-duration:${voiceGrid.waveDurationMs}ms`));
    assert.ok(html.includes(`--wbar-delay:${voiceGrid.waveStaggerMs}ms`));
  });

  it("konuşmuyorken üç durum metninden birini yazar", () => {
    const listening = render(
      <ServerVoiceTile cameraSlot={null} participant={participant()} roleBadge={null} />,
    );
    const muted = render(
      <ServerVoiceTile
        cameraSlot={null}
        participant={participant({ isMuted: true })}
        roleBadge={null}
      />,
    );
    const deafened = render(
      <ServerVoiceTile
        cameraSlot={null}
        participant={participant({ isDeafened: true })}
        roleBadge={null}
      />,
    );

    assert.ok(listening.includes(MESSAGES["server.voice.tile.listeningShort"] ?? ""));
    assert.ok(muted.includes(MESSAGES["server.voice.tile.mutedShort"] ?? ""));
    assert.ok(deafened.includes(MESSAGES["server.voice.tile.deafenedShort"] ?? ""));
    // Susan kartta dalga hiç çizilmez — animasyon karesi harcanmaz (PROMPT §11).
    assert.doesNotMatch(listening, /voice-wave-bar/u);
  });

  it("susturulmuş/sağır rozetini sağ üstte danger tonunda çizer", () => {
    const html = render(
      <ServerVoiceTile
        cameraSlot={null}
        participant={participant({ isMuted: true })}
        roleBadge={null}
      />,
    );

    assert.match(html, /data-testid="server-voice-status-badge"/u);
    assert.ok(html.includes(`hsl(var(--danger)/${voiceGrid.statusBadgeBackgroundAlpha})`));
    assert.ok(html.includes(`right:${pxToRem(voiceGrid.statusBadgeInset)}`));
  });

  it("`SEN` çipi yalnız yerel katılımcıda", () => {
    assert.match(
      render(
        <ServerVoiceTile
          cameraSlot={null}
          participant={participant({ isLocal: true })}
          roleBadge={null}
        />,
      ),
      /data-testid="server-voice-self-chip"/u,
    );
    assert.doesNotMatch(
      render(<ServerVoiceTile cameraSlot={null} participant={participant()} roleBadge={null} />),
      /server-voice-self-chip/u,
    );
  });

  it("rol rozeti iki tondan birini alır", () => {
    assert.match(
      render(<ServerVoiceTile cameraSlot={null} participant={participant()} roleBadge="owner" />),
      /data-testid="server-voice-role-owner"/u,
    );
    assert.match(
      render(<ServerVoiceTile cameraSlot={null} participant={participant()} roleBadge="admin" />),
      /data-testid="server-voice-role-admin"/u,
    );
  });

  it("kamera açıkken akış yoksa yer tutucu çizilir, `<video>` mount edilmez", () => {
    const html = render(
      <ServerVoiceTile
        cameraSlot={null}
        participant={participant({ isCameraEnabled: true })}
        roleBadge={null}
      />,
    );

    assert.match(html, /data-camera="true"/u);
    assert.match(html, /data-testid="server-voice-camera-placeholder"/u);
    assert.doesNotMatch(html, /<video/u);
    // Sol altta ad + (konuşuyorsa) dalga çipi.
    assert.match(html, /data-testid="server-voice-camera-badge"/u);
  });

  it("gerçek akış verildiğinde yer tutucu değil akış çizilir", () => {
    const html = render(
      <ServerVoiceTile
        cameraSlot={<video data-testid="fake-camera" />}
        participant={participant({ isCameraEnabled: true })}
        roleBadge={null}
      />,
    );

    assert.match(html, /data-testid="server-voice-camera-slot"/u);
    assert.doesNotMatch(html, /server-voice-camera-placeholder/u);
  });

  it("uzak katılımcıda ses düzeyi kontrolü korunur, yerelde çizilmez", () => {
    const remote = render(
      <ServerVoiceTile
        cameraSlot={null}
        participant={participant()}
        roleBadge={null}
        volume={{ onReset: () => undefined, onSet: () => undefined, value: 80 }}
      />,
    );

    assert.match(remote, /data-testid="server-voice-tile-volume"/u);
    // Durağan kompozisyon SPEC'teki gibi: kontrol yalnız hover/odakta beliriyor.
    assert.match(remote, /opacity-0/u);
    assert.doesNotMatch(
      render(
        <ServerVoiceTile
          cameraSlot={null}
          participant={participant({ isLocal: true })}
          roleBadge={null}
        />,
      ),
      /server-voice-tile-volume/u,
    );
  });

  it("kart ölçüsünü sözlükten alır — 16/11, r20, 2px", () => {
    const html = render(
      <ServerVoiceTile cameraSlot={null} participant={participant()} roleBadge={null} />,
    );

    assert.ok(
      html.includes(`aspect-ratio:${voiceGrid.cardAspectWidth} / ${voiceGrid.cardAspectHeight}`),
    );
    assert.ok(html.includes(`border-radius:${pxToRem(voiceGrid.cardRadius)}`));
    assert.ok(html.includes(`width:${pxToRem(voiceGrid.avatarSize)}`));
  });
});

describe("§5.2 ızgara", () => {
  it("ekrana sığan eşit kartlarla dört katılımcıyı iki kolona yerleştirir", () => {
    const html = render(
      <ServerVoiceGrid participantCount={4}>
        <span />
      </ServerVoiceGrid>,
    );

    assert.match(html, /data-columns="2"/u);
    assert.match(html, /data-layout="fit"/u);
    assert.ok(html.includes(`gap:${pxToRem(voiceGrid.gap)}`));
    assert.match(html, /class="[^"]*flex-1/u);
  });
});

describe("§5.3 ekran paylaşımı sahnesi", () => {
  function renderStage(
    overrides: Partial<React.ComponentProps<typeof ServerScreenShareStage>> = {},
  ) {
    return render(
      <ServerScreenShareStage
        fps={30}
        onToggleFullscreen={() => undefined}
        resolutionLabel="1080p"
        sharerAvatarUrl={null}
        sharerName="Doğukan Yazar"
        strip={<ServerScreenShareStripCard participant={participant({ isSpeaking: true })} />}
        videoSlot={null}
        {...overrides}
      />,
    );
  }

  it("sahne `2px primary/.55` çerçeveli ve çapraz şeritli", () => {
    const html = renderStage();

    assert.match(html, /data-testid="server-voice-share-stage"/u);
    assert.ok(html.includes(`hsl(var(--primary)/${screenShare.stageBorderAlpha})`));
    assert.match(html, /repeating-linear-gradient\(135deg/u);
  });

  it("paylaşan pilini, `CANLI` çipini ve meta çipini çizer", () => {
    const html = renderStage();

    assert.match(html, /Doğukan Yazar ekranını paylaşıyor/u);
    assert.match(html, /data-testid="server-voice-share-live"/u);
    assert.ok(html.includes(MESSAGES["server.voice.share.live"] ?? ""));
    assert.match(html, /1080p · 30 fps/u);
    assert.match(html, /data-testid="server-voice-share-fullscreen"/u);
  });

  it("yerel paylaşım kalitesini sağ üstte ayarlar seçicisiyle değiştirir", () => {
    const html = renderStage({
      qualityControl: {
        disabled: false,
        onChange: () => undefined,
        options: [
          { id: "h720fps60", label: "720p · 60 fps" },
          { id: "h1080fps60", label: "1080p · 60 fps" },
        ],
        selectedId: "h1080fps60",
      },
    });

    assert.match(html, /data-testid="server-voice-share-quality"/u);
    assert.match(html, /aria-haspopup="listbox"/u);
    assert.match(html, /1080p · 60 fps/u);
    assert.doesNotMatch(html, /<select/u);
  });

  it("ekran paylaşımı sürerken kamera akışını PiP olarak gösterir", () => {
    const html = renderStage({
      cameraName: "Ada",
      cameraSlot: <video data-testid="camera-stream" />,
    });

    assert.match(html, /data-testid="server-voice-share-camera-pip"/u);
    assert.match(html, /data-testid="camera-stream"/u);
    assert.match(html, /Ada/u);
  });

  it("akış yokken yer tutucu çizilir, `<video>` mount edilmez", () => {
    const html = renderStage();

    assert.match(html, /data-testid="server-voice-share-placeholder"/u);
    assert.doesNotMatch(html, /<video/u);
  });

  it("altta yatay şerit; konuşan kartta success çerçeve", () => {
    const html = renderStage();

    assert.match(html, /data-testid="server-voice-share-strip"/u);
    assert.match(html, /data-testid="server-voice-strip-card"[^>]*|data-speaking="true"/u);
    assert.ok(html.includes(`width:${pxToRem(screenShare.stripCardWidth)}`));
  });
});

describe("§5.4 kontrol çubuğu", () => {
  function renderControls(
    overrides: Partial<React.ComponentProps<typeof ServerVoiceControls>> = {},
  ) {
    return render(
      <ServerVoiceControls
        cameraBusy={false}
        isCameraEnabled={false}
        isDeafened={false}
        isMuted={false}
        isScreenSharing={false}
        onLeave={() => undefined}
        onToggleCamera={() => undefined}
        onToggleDeafen={() => undefined}
        onToggleMute={() => undefined}
        onToggleScreenShare={() => undefined}
        {...overrides}
      />,
    );
  }

  it("dört düğme + ayarlar + Ayrıl", () => {
    const html = renderControls();

    for (const testId of [
      "server-voice-control-mic",
      "server-voice-control-speaker",
      "server-voice-control-share",
      "server-voice-control-camera",
      "server-voice-control-settings",
      "server-voice-control-leave",
    ]) {
      assert.ok(html.includes(`data-testid="${testId}"`), testId);
    }

    assert.ok(html.includes(`height:${pxToRem(voiceControls.buttonHeight)}`));
    assert.ok(html.includes(`border-radius:${pxToRem(voiceControls.buttonRadius)}`));
  });

  it("ayarlar doğrudan ses sekmesine giden ön yüklemeli bir bağlantıdır", () => {
    const html = renderControls();
    assert.match(
      html,
      /<a[^>]*data-testid="server-voice-control-settings"[^>]*href="\/settings\/av\/audio"/u,
    );
    const controls = readFileSync(join(here, "server-voice-surface.tsx"), "utf8");
    assert.match(controls, /href=\{buildSettingsHref\("av", "audio"\)\}\s+prefetch=\{true\}/u);
  });

  it("kapalı mikrofon ve hoparlör danger tonuna geçer", () => {
    const html = renderControls({ isDeafened: true, isMuted: true });

    assert.match(
      html,
      /data-testid="server-voice-control-mic"[\s\S]{0,400}?data-tone="danger"|data-tone="danger"[\s\S]{0,400}?server-voice-control-mic/u,
    );
    assert.equal((html.match(/data-tone="danger"/gu) ?? []).length, 2);
  });

  it("açık ekran paylaşımı ve kamera primary tonuna geçer", () => {
    const html = renderControls({ isCameraEnabled: true, isScreenSharing: true });

    assert.equal((html.match(/data-tone="primary"/gu) ?? []).length, 2);
  });

  it("her düğme `aria-pressed` ve erişilebilir ad taşır (§12)", () => {
    const html = renderControls();

    assert.equal((html.match(/aria-pressed=/gu) ?? []).length, 4);
    assert.ok(html.includes(`aria-label="${MESSAGES["server.voice.controls.settings"]}"`));
  });

  it("`Ayrıl` danger dolgu ve gölge taşır", () => {
    const html = renderControls();

    assert.ok(html.includes("background:hsl(var(--danger))"));
    assert.ok(html.includes(`${pxToRem(voiceControls.leaveShadow.spread)} hsl(var(--danger))`));
  });

  it("kamera meşgulken düğme pasif", () => {
    assert.match(renderControls({ cameraBusy: true }), /disabled=""/u);
  });

  it("kamera ikonu referans HTML yolunu kullanır", () => {
    const html = renderControls();

    assert.match(html, /M2\.5 6h13a2\.5 2\.5 0 0 1 2\.5 2\.5v7a2\.5 2\.5 0 0 1-2\.5 2\.5h-13/u);
    assert.match(html, /M15\.5 11l6-3\.5v9l-6-3\.5z/u);
  });
});

describe("§6 boş durum", () => {
  it("kart ızgarası yerine tek blok çizer", () => {
    const html = render(<ServerVoiceEmptyState />);

    assert.match(html, /data-testid="server-voice-empty"/u);
    assert.doesNotMatch(html, /server-voice-tile/u);
    assert.ok(html.includes(MESSAGES["server.voice.empty.title"] ?? ""));
  });
});

describe("`voice-channel-view` Ş7'ye devretti", () => {
  const source = readFileSync(join(here, "..", "voice-channel-view.tsx"), "utf8");

  it("SPEC yüzeylerini kullanıyor", () => {
    for (const name of [
      "ServerVoiceHeader",
      "ServerVoiceGrid",
      "ServerVoiceTile",
      "ServerScreenShareStage",
      "ServerVoiceControls",
      "ServerVoiceEmptyState",
    ]) {
      assert.ok(source.includes(`<${name}`), name);
    }
  });

  it("eski paylaşılan yüzeyler artık burada çizilmiyor", () => {
    // `dm-call-view.tsx` onları kullanmaya devam ediyor; sunucu kanalı kendi dilini taşıyor.
    assert.equal(source.includes("<VoiceParticipantTile"), false);
    assert.equal(source.includes("<VoiceControlBar"), false);
    assert.equal(source.includes("<VoiceEmptyState"), false);
    // §4.2 sağ panelin işi (Ş5); ikinci bir katılımcı listesi kalmadı.
    assert.equal(source.includes("VoiceParticipantsSidebar"), false);
  });

  it("K5 — kablolama `lib/voice`ten geliyor, yeniden yazılmadı", () => {
    assert.match(source, /ParticipantCameraVideo/u);
    assert.match(source, /ScreenShareVideo/u);
    assert.match(source, /renderGridParticipants/u);
    assert.match(source, /from "@\/lib\/voice\/screen-share"/u);
  });

  it("ayarlar düğmesi doğrudan Ses ve Video / Ses sekmesini açar", () => {
    assert.doesNotMatch(source, /onOpenSettings=|router\.push/u);
    assert.doesNotMatch(source, /VoiceSettingsModal/u);
  });

  it("eski tam ekran paylaşım panelini sahne kontrolüne iç içe yerleştirmez", () => {
    assert.doesNotMatch(source, /ScreenShareStagePanel/u);
    assert.doesNotMatch(source, /extraControls=/u);
  });
});

it("compact and speaker modes keep all participant cards", () => {
  for (const layout of ["compact", "speaker"] as const) {
    const html = render(
      <ServerVoiceGrid participantCount={3} layout={layout} featuredIndex={1}>
        {["a", "b", "c"].map((id) => (
          <span key={id} data-person={id} />
        ))}
      </ServerVoiceGrid>,
    );
    assert.equal((html.match(/data-person=/g) ?? []).length, 3);
    assert.ok(html.includes(`data-layout="${layout}"`));
    if (layout === "speaker") assert.equal((html.match(/data-featured="true"/g) ?? []).length, 1);
  }
});
it("the leave state uses shared typography and preserves the reconnect action", () => {
  const html = render(<ServerVoiceDisconnectedState onReconnect={() => undefined} />);
  assert.ok(html.includes("var(--font-display)"));
  assert.ok(html.includes("Bu ses kanalından ayrıldın"));
  assert.ok(html.includes(MESSAGES["voice.view.reconnectAction"] ?? ""));
  assert.ok(html.includes("hsl(var(--primary))"));
});

it("screen viewer counts and Go Live labels render from explicit metadata", () => {
  const stage = (
    viewerCount: number,
    isLocalShare = false,
    stream?: { kind: "game"; gameId: null; label: string | null },
  ) =>
    render(
      <ServerScreenShareStage
        fps={30}
        onToggleFullscreen={() => undefined}
        resolutionLabel="1080p"
        sharerAvatarUrl={null}
        sharerName="Alice"
        strip={null}
        videoSlot={null}
        viewerCount={viewerCount}
        isLocalShare={isLocalShare}
        stream={stream}
      />,
    );
  assert.doesNotMatch(stage(0), /voice-stage-viewer-count/);
  assert.match(stage(0, true), /voice-stage-viewer-count/);
  assert.match(stage(1), /voice-stage-viewer-count/);
  assert.match(stage(5), /voice-stage-viewer-count/);
  assert.match(stage(1, false, { kind: "game", gameId: null, label: "Test Game" }), /Test Game/);
  assert.match(stage(1, false, { kind: "game", gameId: null, label: null }), /oyun/);
});
