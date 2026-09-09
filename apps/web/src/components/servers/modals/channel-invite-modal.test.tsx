import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { LocaleProvider } from "@/components/providers/locale-provider";
import {
  ChannelInviteModalView,
  type ChannelInviteModalViewProps,
  type ChannelInviteTab,
} from "@/components/servers/modals/channel-invite-modal";
import { getMessagesForLocale } from "@/lib/locale";
import {
  SERVER_INVITE_INITIAL_STATE,
  type InviteFriendCandidate,
  type ServerInviteFormState,
} from "@/lib/servers/invite-form";
import { SERVER_METRICS, pxToRem } from "@/lib/servers/metrics";

/** Ş9 — davet bağlantısı penceresi (SPEC-SUNUCU §6.3). */
const MESSAGES = getMessagesForLocale("tr");

const copy = (key: string): string => MESSAGES[key] ?? "";

const FRIENDS: readonly InviteFriendCandidate[] = [
  { avatarUrl: null, displayName: "Ayşe Kaya", id: "f1", username: "aysek" },
  { avatarUrl: null, displayName: "Mert Demir", id: "f2", username: "mertd" },
];

function render(overrides: Partial<ChannelInviteModalViewProps> = {}): string {
  const props: ChannelInviteModalViewProps = {
    activeTab: "link" as ChannelInviteTab,
    copied: false,
    friendQuery: "",
    friends: FRIENDS,
    inviteCode: "mobile-test-9fd2",
    inviteUrl: "https://whispr.app/invite/mobile-test-9fd2",
    invitedFriendIds: new Set<string>(),
    onChangeTab: () => {},
    onClose: () => {},
    onCopy: () => {},
    onFriendQueryChange: () => {},
    onInviteFriend: () => {},
    onSelectDuration: () => {},
    onSelectUseLimit: () => {},
    open: true,
    pendingFriendId: null,
    server: { channelName: "karsilama", serverName: "Mobile Test" },
    state: SERVER_INVITE_INITIAL_STATE as ServerInviteFormState,
    ...overrides,
  };

  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={MESSAGES}>
      <ChannelInviteModalView {...props} />
    </LocaleProvider>,
  );
}

describe("channel invite modal", () => {
  it("bağlantı satırı monospace ve `https://` olmadan yazılır", () => {
    const html = render();

    assert.match(html, /whispr\.app\/invite\/mobile-test-9fd2/u);
    assert.equal(html.includes("https://whispr.app"), false);
    // Monospace artık `font-mono` yardımcı sınıfından; satır içi yığın yok (Ş14 token denetimi).
    assert.match(html, /font-mono/u);
  });

  it("`Kopyala` düğmesi var, kopyalayınca metni değişir", () => {
    assert.match(render(), new RegExp(copy("server.modal.invite.copy"), "u"));
    assert.match(render({ copied: true }), new RegExp(copy("server.modal.invite.copied"), "u"));
  });

  it("iki kart yalnız SÜRE ve KULLANIM — ROL alanı yok", () => {
    const html = render();

    assert.match(html, /data-testid="server-invite-card-duration"/u);
    assert.match(html, /data-testid="server-invite-card-uses"/u);
    assert.equal(/\bROL\b/u.test(html), false);
    assert.equal(html.toLocaleLowerCase("tr").includes(">rol<"), false);
  });

  it("varsayılanlar SPEC §6.3'ün `7 gün` ve `Sınırsız` değerleri", () => {
    const html = render();

    assert.match(html, new RegExp(copy("server.modal.invite.duration.7d"), "u"));
    assert.match(html, new RegExp(copy("server.modal.invite.uses.unlimited"), "u"));
  });

  it("kartlar chevron taşır ve kapalıyken çip grubu çizilmez", () => {
    const html = render();

    assert.match(html, /m6 9 6 6 6-6/u);
    assert.equal(html.includes('data-testid="server-invite-duration-group"'), false);
  });

  it("QR bloğu canvas olarak çizilir ve erişilebilir etiket taşır", () => {
    const html = render();

    assert.match(html, /data-testid="server-invite-qr"/u);
    assert.match(html, /role="img"/u);
    assert.match(html, new RegExp(copy("server.modal.invite.qr.label"), "u"));
  });

  it("bilgi kutusu kopyalanmadan önce 'kopyalandı' demez", () => {
    const ready = render();
    const copied = render({ copied: true });

    assert.match(ready, /Bağlantı hazır · 7 gün sonra kendiliğinden sona erer\./u);
    assert.match(copied, /Bağlantı kopyalandı · 7 gün sonra kendiliğinden sona erer\./u);
  });

  it("süresiz davette sona erme cümlesi kurulmaz", () => {
    const html = render({
      copied: true,
      state: { durationId: "never", useLimitId: "unlimited" },
    });

    assert.match(html, new RegExp(copy("server.modal.invite.notice.never"), "u"));
    assert.equal(html.includes("sona erer"), false);
  });

  it("bilgi kutusu success tonunda (§6.3)", () => {
    const html = render();
    const { inviteModal } = SERVER_METRICS;

    assert.match(
      html,
      new RegExp(`hsl\\(var\\(--success\\)/${inviteModal.infoBackgroundAlpha}\\)`, "u"),
    );
    assert.match(html, new RegExp(`border-radius:${pxToRem(inviteModal.infoRadius)}`, "u"));
  });

  it("arkadaş sekmesinde liste ve arama var", () => {
    const html = render({ activeTab: "friends" });

    assert.match(html, /data-testid="server-invite-friend-search"/u);
    assert.match(html, /data-testid="server-invite-friend-f1"/u);
    assert.match(html, /@aysek/u);
    assert.match(html, new RegExp(copy("server.modal.invite.friends.send"), "u"));
  });

  it("davet gönderilen satır `Gönderildi` durumuna geçer ve pasifleşir", () => {
    const html = render({ activeTab: "friends", invitedFriendIds: new Set(["f1"]) });

    assert.match(html, new RegExp(copy("server.modal.invite.friends.sent"), "u"));
    assert.match(html, /data-testid="server-invite-friend-f1"[^>]*disabled/u);
    assert.equal(/data-testid="server-invite-friend-f2"[^>]*disabled/u.test(html), false);
  });

  it("eşleşen arkadaş yoksa boş durum yazılır", () => {
    const html = render({ activeTab: "friends", friends: [] });

    assert.match(html, /data-testid="server-invite-friends-empty"/u);
    assert.match(html, new RegExp(copy("server.modal.invite.friends.empty"), "u"));
  });

  it("bağlantı henüz üretilmemişken kopyalama pasif", () => {
    const html = render({ inviteCode: null, inviteUrl: null });

    assert.match(html, /data-testid="server-invite-copy"[^>]*disabled/u);
    assert.match(html, new RegExp(copy("server.modal.invite.link.pending"), "u"));
  });
});
