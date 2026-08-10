import React from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent } from "@testing-library/react-native";
import type { MobileWorkspaceChannelSummary } from "@wizards/types";
import { createMobileAppShellStyles } from "../src/app/mobile-app-shell";
import { createHomeScreenStyles } from "../src/app/screens/home-screen.styles";
import { AvatarMark } from "../src/app/components/ui-atoms";
import { WorkspaceChannelCompactRow } from "../src/app/screens/workspace-channel-section-list";
import { redesignDark, redesignLight } from "../src/design/palette";
import { darkTheme, lightTheme } from "../src/design/themes";
import { renderWithMobileTheme as render } from "./render-with-mobile-theme";

describe("1a compact servers redesign", () => {
  it.each([
    ["light", lightTheme],
    ["dark", darkTheme],
  ] as const)("uses the canonical %s header and channel-row geometry", (_scheme, theme) => {
    const styles = createHomeScreenStyles(theme);
    const canonical = theme.dark
      ? {
          faint: redesignDark.canonicalTextFaint,
          secondary: redesignDark.textSecondary,
          successText: redesignDark.success,
        }
      : {
          faint: redesignLight.canonicalTextFaint,
          secondary: redesignLight.canonicalTextSecondary,
          successText: redesignLight.canonicalSuccessText,
        };

    // 1b server pill.
    expect(styles.mobileWorkspaceHeader).toMatchObject({
      borderRadius: 18,
      elevation: theme.elevation.headerCard.elevation,
      gap: 10,
      minHeight: 54,
      paddingLeft: 8,
      paddingRight: 12,
      paddingVertical: 8,
      shadowRadius: theme.elevation.headerCard.shadowRadius,
    });
    // 1a keeps the title bare on the screen background — no card, no padding.
    expect(styles.mobileWorkspaceHeaderRail).toMatchObject({
      flex: 1,
      flexDirection: "row",
      gap: 7,
      minHeight: 44,
    });
    expect(styles.mobileWorkspaceHeaderRail).not.toHaveProperty("backgroundColor");
    // 6a: the two header buttons come from theme.workspace, one geometry per layout.
    expect(styles.mobileWorkspaceHeaderIconButton).toMatchObject({
      backgroundColor: theme.workspace.headerIconButton.bg,
      borderColor: theme.workspace.headerIconButton.border,
      borderRadius: theme.workspace.headerIconButton.radius,
      height: theme.workspace.headerIconButton.size,
      width: theme.workspace.headerIconButton.size,
    });
    expect(styles.mobileWorkspaceHeaderIconButtonCompact).toMatchObject({
      borderRadius: theme.workspace.headerIconButtonCompact.radius,
      height: theme.workspace.headerIconButtonCompact.size,
      width: theme.workspace.headerIconButtonCompact.size,
    });
    // The deleted header entries took their styles with them.
    expect(styles).not.toHaveProperty("mobileWorkspaceCompactAddButton");
    expect(styles).not.toHaveProperty("mobileWorkspaceCreateButton");
    expect(styles).not.toHaveProperty("mobileWorkspaceSectionAddButton");
    // 6a/6b filter strip and the labelled create pill.
    expect(styles.mobileWorkspaceFilterTrack).toMatchObject({
      backgroundColor: theme.workspace.filterTrack.bg,
      borderRadius: theme.workspace.filterTrack.radius,
      padding: theme.workspace.filterTrack.padding,
    });
    expect(styles.mobileWorkspaceFilterSegmentActive).toMatchObject({
      backgroundColor: theme.workspace.filterSegmentActive.bg,
    });
    expect(styles.mobileWorkspaceFab).toMatchObject({
      borderRadius: theme.workspace.fab.radius,
      height: theme.workspace.fab.height,
      paddingHorizontal: theme.workspace.fab.paddingHorizontal,
    });
    expect(styles.mobileWorkspaceFabAnchorCompact).toMatchObject({
      bottom: theme.workspace.fabCompact.bottom,
      right: theme.workspace.fabCompact.right,
    });
    expect(styles.mobileWorkspaceChannelIcon).toMatchObject({
      borderRadius: 11,
      height: 32,
      width: 32,
    });
    expect(styles.mobileWorkspaceChannelIconRail).toMatchObject({
      borderRadius: 10,
      height: 30,
      width: 30,
    });
    expect(styles.mobileWorkspaceChannelRow).toMatchObject({
      borderRadius: 14,
      gap: 10,
      minHeight: 50,
      paddingHorizontal: 10,
      paddingVertical: 9,
    });
    expect(styles.mobileWorkspaceChannelRowRail).toMatchObject({
      borderRadius: 14,
      gap: 10,
      minHeight: 46,
      paddingHorizontal: 10,
      paddingVertical: 8,
    });
    expect(styles.mobileWorkspaceChannelName).toMatchObject({
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: 14.5,
      includeFontPadding: false,
      lineHeight: 18,
    });
    expect(styles.mobileWorkspaceChannelNameActive).toMatchObject({
      fontFamily: theme.typography.fontFamilyExtraBold,
    });
    expect(styles.mobileWorkspaceChannelNameStrong).toMatchObject({
      color: theme.text.primary,
      fontFamily: theme.typography.fontFamilyExtraBold,
    });
    expect(styles.mobileWorkspaceChannelNameMuted).toMatchObject({
      color: canonical.secondary,
      fontFamily: theme.typography.fontFamilySemiBold,
    });
    expect(styles.mobileWorkspaceChannelMeta).toMatchObject({
      color: canonical.secondary,
      fontFamily: theme.typography.fontFamily,
      fontSize: 11.5,
      includeFontPadding: false,
      lineHeight: 15,
    });
    expect(styles.mobileWorkspaceChannelMetaMentionToken).toMatchObject({
      color: theme.accent.default,
      fontFamily: theme.typography.fontFamilyBold,
    });
    expect(styles.mobileWorkspaceChannelTimestamp).toMatchObject({
      color: theme.text.visualPlaceholder,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: 10.5,
      includeFontPadding: false,
      lineHeight: 14,
    });
    expect(styles.mobileWorkspaceChannelHash).toMatchObject({
      color: canonical.faint,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: 16,
      includeFontPadding: false,
      lineHeight: 20,
    });
    expect(styles.mobileWorkspaceChannelHashActive).toMatchObject({
      color: theme.accent.default,
    });
    expect(styles.mobileWorkspaceVoicePresenceText).toMatchObject({
      color: canonical.successText,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: 11,
      includeFontPadding: false,
      lineHeight: 15,
    });
    expect(styles.mobileWorkspaceTitle).toMatchObject({
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: 18,
      includeFontPadding: false,
      lineHeight: 24,
    });
    // Category labels: 10.5px extra-bold with the handoff's .12em tracking.
    expect(styles.mobileWorkspaceSectionTitle).toMatchObject({
      color: canonical.faint,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: 10.5,
      includeFontPadding: false,
      letterSpacing: 1.26,
      lineHeight: 14,
    });
    expect(styles.mobileWorkspaceSectionTitleRail).toMatchObject({
      color: canonical.faint,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: 10.5,
      includeFontPadding: false,
      letterSpacing: 1.26,
      lineHeight: 14,
    });
    expect(styles.mobileWorkspaceChannelNameRail).toMatchObject({
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: 14,
      includeFontPadding: false,
      lineHeight: 18,
    });
    expect(styles.mobileWorkspaceChannelNameRailActive).toMatchObject({
      fontFamily: theme.typography.fontFamilyExtraBold,
    });
    expect(styles.mobileWorkspaceChannelHashRail).toMatchObject({
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: 15,
      includeFontPadding: false,
      lineHeight: 18,
    });
    expect(styles.mobileWorkspaceMeta).toMatchObject({
      color: canonical.secondary,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: 11.5,
      includeFontPadding: false,
      lineHeight: 15,
    });
    expect(styles.mobileWorkspaceTitleCompact).toMatchObject({ fontSize: 15 });
    expect(styles.mobileWorkspaceSearchBox).toMatchObject({
      borderRadius: 15,
      minHeight: 44,
      paddingHorizontal: 14,
    });
    expect(styles.mobileWorkspaceSearchInput).toMatchObject({
      color: theme.text.primary,
      fontFamily: theme.typography.fontFamily,
      fontSize: 13.5,
      includeFontPadding: false,
      lineHeight: 18,
    });
    // Row badges: 18px pills, mention red outranks unread primary.
    expect(styles.mobileWorkspaceUnreadDot).toMatchObject({
      backgroundColor: theme.accent.action,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: 10,
      includeFontPadding: false,
      lineHeight: 18,
      minWidth: 18,
    });
    expect(styles.mobileWorkspaceChannelMentionBadge).toMatchObject({
      backgroundColor: theme.mention.badge,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: 10,
      includeFontPadding: false,
      lineHeight: 18,
      minWidth: 18,
    });
    expect(styles.mobileWorkspaceSectionHeader).toMatchObject({
      paddingBottom: 4,
      paddingTop: 8,
    });
    expect(styles.mobileWorkspaceSectionList).toMatchObject({ gap: 2 });
    // 6a B1: 62px rail, 42px avatars, 11px apart.
    expect(styles.mobileServerRail).toMatchObject({ width: theme.workspace.railWidth });
    // The rail scrolls, so a member of many servers can still reach the add (+).
    expect(styles.mobileServerRailScroll).toMatchObject({
      flex: 1,
      width: theme.workspace.railWidth,
    });
    // 42px avatar inside a 50px slot: the active ring is a 2px bg gap + 2px primary.
    expect(styles.mobileServerRailItem).toMatchObject({ height: 50, width: 50 });
    expect(styles.mobileServerRailItemActive).toMatchObject({
      backgroundColor: theme.workspace.railActiveRing.inner,
      borderColor: theme.workspace.railActiveRing.outer,
      borderWidth: theme.workspace.railActiveRing.outerWidth,
    });
    expect(styles.mobileServerRailActiveIndicator).toMatchObject({
      backgroundColor: theme.workspace.railActiveBar.color,
      height: theme.workspace.railActiveBar.height,
      width: theme.workspace.railActiveBar.width,
    });
    expect(styles.mobileServerRailAvatarWrap).toMatchObject({
      height: theme.workspace.railAvatarSize,
      width: theme.workspace.railAvatarSize,
    });
    expect(styles.mobileServerRailList).toMatchObject({ gap: theme.workspace.railGap });
    // The (+) keeps the dashed "create" marker and the 44px avatar footprint, but sits
    // on the accent tint inside a 52px slot so it lines up with the server avatars.
    expect(styles.mobileServerRailAddButton).toMatchObject({
      backgroundColor: theme.accent.soft,
      borderColor: theme.accent.default,
      borderStyle: "dashed",
      borderWidth: 2,
      height: theme.workspace.railAvatarSize,
      width: theme.workspace.railAvatarSize,
    });
    expect(styles.mobileServerRailAddSlot).toMatchObject({ height: 50, width: 50 });
    // The action zone is pinned under the scroller, split off by a hairline divider.
    expect(styles.mobileServerRailFooter).toMatchObject({ alignItems: "center", gap: 10 });
    expect(styles.mobileServerRailDivider).toMatchObject({
      backgroundColor: theme.workspace.railDivider.color,
      height: theme.workspace.railDivider.height,
      width: theme.workspace.railDivider.width,
    });
    expect(styles.mobileWorkspaceFabAnchor).toMatchObject({
      bottom: theme.workspace.fab.bottom,
      position: "absolute",
      right: theme.workspace.fab.right,
    });
    expect(styles.mobileServerRailBadge).toMatchObject({
      backgroundColor: theme.mention.badge,
      borderColor: theme.surface.base,
      borderRadius: 999,
      borderWidth: 2,
      fontSize: 9.5,
      minWidth: 17,
    });

    expect(createMobileAppShellStyles(theme).shellSignedIn).toEqual({
      paddingHorizontal: 0,
      paddingTop: 0,
    });
  });

  it("renders the canonical normal and selected text-channel icon states", async () => {
    const channel = {
      categoryId: "category-lobby",
      categoryName: "Lobby",
      id: "channel-design",
      lastMessage: null,
      locked: false,
      mentionCount: 0,
      name: "design",
      position: 0,
      readOnly: false,
      topic: null,
      type: "TEXT",
      unreadCount: 0,
    } as MobileWorkspaceChannelSummary;

    const normal = await render(
      <WorkspaceChannelCompactRow
        channel={channel}
        isSelected={false}
        onOpenChannel={jest.fn()}
        voiceState={null}
      />,
    );
    const selected = await render(
      <WorkspaceChannelCompactRow
        channel={channel}
        isSelected
        onOpenChannel={jest.fn()}
        voiceState={null}
      />,
    );

    expect(normal.getByTestId("mobile-workspace-text-channel-icon").props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          backgroundColor: redesignLight.card,
          borderColor: redesignLight.border,
          borderWidth: 1,
        }),
      ]),
    );
    expect(normal.getByTestId("mobile-workspace-text-channel-hash").props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ color: redesignLight.canonicalTextFaint }),
      ]),
    );
    expect(selected.getByTestId("mobile-workspace-text-channel-icon").props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          backgroundColor: redesignLight.card,
          borderWidth: 0,
        }),
      ]),
    );
    expect(selected.getByTestId("mobile-workspace-text-channel-hash").props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ color: redesignLight.primary })]),
    );
  });

  it("renders a selected text-channel preview from the real last-message payload", async () => {
    const channel = {
      categoryId: "category-lobby",
      categoryName: "Lobby",
      id: "channel-welcome",
      lastMessage: {
        author: {
          avatarUrl: null,
          displayName: "Ada",
          id: "user-ada",
          username: "ada",
        },
        createdAt: "2026-07-16T10:00:00.000Z",
        id: "message-1",
        text: "Gerçek zamanlı mesaj önizlemesi",
      },
      locked: false,
      mentionCount: 3,
      name: "welcome-chat",
      position: 0,
      readOnly: false,
      topic: null,
      type: "TEXT",
      unreadCount: 3,
    } as MobileWorkspaceChannelSummary;

    const view = await render(
      <WorkspaceChannelCompactRow
        channel={channel}
        isSelected
        onOpenChannel={jest.fn()}
        voiceState={null}
      />,
    );

    expect(view.getByText("Ada: Gerçek zamanlı mesaj önizlemesi")).toBeTruthy();
  });

  it("renders the compact 1a server initial with the handoff's 15px extra-bold Jakarta role", async () => {
    const view = await render(
      <AvatarMark
        {...({
          fallbackTextStyle: {
            fontFamily: lightTheme.typography.fontFamilyExtraBold,
            fontSize: 15,
            includeFontPadding: false,
            lineHeight: 18,
          },
        } as never)}
        avatarBorderRadius={15}
        avatarBorderWidth={0}
        imageUrl={null}
        label="UA"
        size="regular"
      />,
    );

    expect(view.getByText("UA").props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fontFamily: lightTheme.typography.fontFamilyExtraBold,
          fontSize: 15,
          includeFontPadding: false,
          lineHeight: 18,
        }),
      ]),
    );
  });

  it("renders the 1a rail row with the same icon box, preview and timestamp as 1b", async () => {
    const channel = {
      categoryId: "category-lobby",
      categoryName: "Lobby",
      id: "channel-welcome",
      lastMessage: {
        author: {
          avatarUrl: null,
          displayName: "Ada",
          id: "user-ada",
          username: "ada",
        },
        createdAt: "2026-07-16T10:00:00.000Z",
        id: "message-1",
        text: "Rail rows carry the preview too",
      },
      locked: false,
      mentionCount: 0,
      name: "welcome-chat",
      position: 0,
      readOnly: false,
      topic: null,
      type: "TEXT",
      unreadCount: 3,
    } as MobileWorkspaceChannelSummary;

    const view = await render(
      <WorkspaceChannelCompactRow
        {...({ layout: "rail" } as never)}
        channel={channel}
        isSelected
        onOpenChannel={jest.fn()}
        voiceState={null}
      />,
    );

    expect(view.getByTestId("mobile-workspace-text-channel-icon").props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ borderRadius: 10, height: 30, width: 30 }),
      ]),
    );
    expect(view.getByTestId("mobile-workspace-channel-preview")).toBeTruthy();
    expect(view.getByTestId("mobile-workspace-channel-time").props.children).toBeTruthy();
    expect(view.getByTestId("mobile-workspace-text-channel-hash").props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fontSize: 15,
          fontFamily: lightTheme.typography.fontFamilyExtraBold,
          includeFontPadding: false,
          lineHeight: 18,
        }),
        expect.objectContaining({ color: redesignLight.primary }),
      ]),
    );
    expect(view.getByText("welcome-chat").props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fontFamily: lightTheme.typography.fontFamilySemiBold,
          fontSize: 14,
          includeFontPadding: false,
          lineHeight: 18,
        }),
        expect.objectContaining({
          color: lightTheme.accent.strong,
          fontFamily: lightTheme.typography.fontFamilyExtraBold,
        }),
      ]),
    );
  });

  it("highlights the @mention inside a preview and keeps a read row faint", async () => {
    const mentioned = {
      categoryId: "category-paycore",
      categoryName: "Paycore",
      id: "channel-development",
      lastMessage: {
        author: { avatarUrl: null, displayName: "DY", id: "user-dy", username: "dogukanyazar" },
        createdAt: "2026-07-16T10:41:00.000Z",
        id: "message-2",
        text: "@dogukanyazar build hazır mı?",
      },
      locked: false,
      mentionCount: 1,
      name: "development",
      position: 0,
      readOnly: false,
      topic: null,
      type: "TEXT",
      unreadCount: 1,
    } as MobileWorkspaceChannelSummary;

    const view = await render(
      <WorkspaceChannelCompactRow
        channel={mentioned}
        isSelected={false}
        onOpenChannel={jest.fn()}
        voiceState={null}
      />,
    );

    expect(view.getByText("@dogukanyazar").props.style).toEqual(
      expect.objectContaining({
        color: lightTheme.accent.default,
        fontFamily: lightTheme.typography.fontFamilyBold,
      }),
    );
    expect(view.getByText("@1")).toBeTruthy();
    expect(view.getByText("development").props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          color: lightTheme.text.primary,
          fontFamily: lightTheme.typography.fontFamilyExtraBold,
        }),
      ]),
    );

    const read = await render(
      <WorkspaceChannelCompactRow
        channel={{ ...mentioned, mentionCount: 0, name: "test", unreadCount: 0 }}
        isSelected={false}
        onOpenChannel={jest.fn()}
        voiceState={null}
      />,
    );

    expect(read.getByText("test").props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          color: redesignLight.canonicalTextSecondary,
          fontFamily: lightTheme.typography.fontFamilySemiBold,
        }),
      ]),
    );
    expect(read.getByTestId("mobile-workspace-channel-preview").props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ color: redesignLight.canonicalPlaceholder }),
      ]),
    );
  });

  it("connects straight to the room from the live voice row's Katıl pill", async () => {
    const voiceChannel = {
      categoryId: "category-lobby",
      categoryName: "Lobby",
      id: "channel-live",
      lastMessage: null,
      locked: false,
      mentionCount: 0,
      name: "live-room",
      position: 0,
      readOnly: false,
      topic: null,
      type: "VOICE",
      unreadCount: 0,
    } as MobileWorkspaceChannelSummary;
    const onOpenChannel = jest.fn();

    const view = await render(
      <WorkspaceChannelCompactRow
        channel={voiceChannel}
        isSelected={false}
        onOpenChannel={onOpenChannel}
        voiceState={
          {
            channelId: "channel-live",
            participants: [
              {
                avatarUrl: null,
                displayName: "Ayşegül",
                muted: false,
                userId: "user-1",
                username: "aysegul_dev",
              },
              {
                avatarUrl: null,
                displayName: null,
                muted: false,
                userId: "user-2",
                username: "dogukanyazar",
              },
            ],
          } as never
        }
      />,
    );

    // 1b spells the participants out; 1a shows a count with stacked avatars.
    expect(view.getByText("Canlı · Ayşegül, dogukanyazar")).toBeTruthy();
    await fireEvent.press(view.getByTestId("mobile-workspace-voice-join-channel-live"));
    expect(onOpenChannel).toHaveBeenCalledWith(voiceChannel);
  });

  it("keeps the 11px category chevron and drops every category create entry", () => {
    const channelSections = readFileSync(
      resolve(__dirname, "../src/app/screens/workspace-channel-section-list.tsx"),
      "utf8",
    );

    expect(channelSections).toContain("size={11}");
    // Acceptance 14/16: the per-category (+) is gone from the code, not hidden.
    // The old testID is not spelled out even here — a repo-wide search for it
    // has to come back empty.
    expect(channelSections).not.toMatch(/section-create/);
    expect(channelSections).not.toContain("onCreateInSection");
  });

  // Acceptance 5: an unauthorised member has no create entry at all — the FAB
  // is not rendered, rather than rendered disabled.
  it("renders the create pill only for a channel manager", () => {
    const workspaceBrowser = readFileSync(
      resolve(__dirname, "../src/app/screens/workspace-browser.tsx"),
      "utf8",
    );

    expect(workspaceBrowser).toMatch(
      /\{canManageChannels && servers\.length > 0 \? \(\s*<MobileWorkspaceCreateFab/,
    );
    expect(workspaceBrowser).not.toContain("mobile-workspace-create-open");
  });

  it("renders each rail badge from that server's live unread and mention counts", () => {
    const workspaceBrowser = readFileSync(
      resolve(__dirname, "../src/app/screens/workspace-browser.tsx"),
      "utf8",
    );

    // A mention shows the red count badge; a plain unread shows the primary dot.
    expect(workspaceBrowser).toContain("const badge = getMobileServerBadge(server);");
    expect(workspaceBrowser).toContain("styles.mobileServerRailUnreadDot");
  });
});
