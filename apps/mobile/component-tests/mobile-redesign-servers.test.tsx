import React from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, jest } from "@jest/globals";
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

    expect(styles.mobileWorkspaceHeader).toMatchObject({
      borderRadius: 22,
      elevation: theme.elevation.headerCard.elevation,
      gap: 12,
      minHeight: 64,
      paddingHorizontal: 14,
      paddingVertical: 10,
      shadowRadius: theme.elevation.headerCard.shadowRadius,
    });
    expect(styles.mobileWorkspaceChannelIcon).toMatchObject({
      borderRadius: 12,
      height: 36,
      width: 36,
    });
    expect(styles.mobileWorkspaceChannelRow).toMatchObject({
      borderRadius: 16,
      gap: 12,
      minHeight: 58,
      paddingHorizontal: 12,
      paddingVertical: 11,
    });
    expect(styles.mobileWorkspaceChannelName).toMatchObject({
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: 15,
      includeFontPadding: false,
      lineHeight: 18,
    });
    expect(styles.mobileWorkspaceChannelNameActive).toMatchObject({
      fontFamily: theme.typography.fontFamilyBold,
    });
    expect(styles.mobileWorkspaceChannelMeta).toMatchObject({
      color: canonical.secondary,
      fontFamily: theme.typography.fontFamily,
      fontSize: 12,
      includeFontPadding: false,
      lineHeight: 15,
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
      fontSize: 12,
      includeFontPadding: false,
      lineHeight: 15,
    });
    expect(styles.mobileWorkspaceTitle).toMatchObject({
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: 17,
      includeFontPadding: false,
      lineHeight: 22,
    });
    expect(styles.mobileWorkspaceSectionTitle).toMatchObject({
      color: canonical.faint,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 11.5,
      includeFontPadding: false,
      lineHeight: 14,
    });
    expect(styles.mobileWorkspaceSectionTitleRail).toMatchObject({
      color: canonical.faint,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 11,
      includeFontPadding: false,
      letterSpacing: 1.32,
      lineHeight: 14,
    });
    expect(styles.mobileWorkspaceChannelNameRail).toMatchObject({
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: 14.5,
      includeFontPadding: false,
      lineHeight: 18,
    });
    expect(styles.mobileWorkspaceChannelNameRailActive).toMatchObject({
      fontFamily: theme.typography.fontFamilyBold,
    });
    expect(styles.mobileWorkspaceChannelHashRail).toMatchObject({
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: 15,
      includeFontPadding: false,
      lineHeight: 18,
    });
    expect(styles.mobileWorkspaceMeta).toMatchObject({
      color: canonical.secondary,
      fontFamily: theme.typography.fontFamily,
      fontSize: 12.5,
      includeFontPadding: false,
      lineHeight: 16,
    });
    expect(styles.mobileWorkspaceSearchBox).toMatchObject({
      minHeight: 42,
      paddingHorizontal: 16,
    });
    expect(styles.mobileWorkspaceSearchInput).toMatchObject({
      color: theme.text.primary,
      fontFamily: theme.typography.fontFamily,
      fontSize: 14.5,
      includeFontPadding: false,
      lineHeight: 20,
    });
    expect(styles.mobileWorkspaceUnreadDot).toMatchObject({
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 11,
      includeFontPadding: false,
      lineHeight: 22,
    });
    expect(styles.channelMentionBadge).toMatchObject({
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 11,
      includeFontPadding: false,
      lineHeight: 22,
    });
    expect(styles.mobileWorkspaceSectionHeader).toMatchObject({
      paddingBottom: 4,
      paddingTop: 8,
    });
    expect(styles.mobileWorkspaceSectionList).toMatchObject({ paddingTop: 14 });
    expect(styles.mobileServerRailBadge).toMatchObject({
      backgroundColor: theme.status.dangerAction,
      borderColor: theme.surface.card,
      borderRadius: 999,
      borderWidth: 2,
      fontSize: 9.5,
      minWidth: 18,
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

  it("renders the 1h rail variant as the handoff's compact channel row", async () => {
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
        text: "This preview must not render in 1h",
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

    expect(view.queryByTestId("mobile-workspace-text-channel-icon")).toBeNull();
    expect(view.queryByText("Ada: This preview must not render in 1h")).toBeNull();
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
          fontSize: 14.5,
          includeFontPadding: false,
          lineHeight: 18,
        }),
        expect.objectContaining({
          color: lightTheme.accent.strong,
          fontFamily: lightTheme.typography.fontFamilyBold,
        }),
      ]),
    );
  });

  it("uses the handoff's custom invite and 16px category-chevron icons", () => {
    const workspaceBrowser = readFileSync(
      resolve(__dirname, "../src/app/screens/workspace-browser.tsx"),
      "utf8",
    );
    const channelSections = readFileSync(
      resolve(__dirname, "../src/app/screens/workspace-channel-section-list.tsx"),
      "utf8",
    );

    expect(workspaceBrowser).toContain('name="invite-user"');
    expect(workspaceBrowser).toContain("color={theme.accent.default}");
    expect(channelSections).toContain("size={16}");
  });

  it("renders each rail badge from that server's live unread count", () => {
    const workspaceBrowser = readFileSync(
      resolve(__dirname, "../src/app/screens/workspace-browser.tsx"),
      "utf8",
    );

    expect(workspaceBrowser).toContain("const unreadCount = server.unreadCount;");
  });
});
