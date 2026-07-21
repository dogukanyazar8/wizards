# Mobile Notifications Header Simplification (1d) — Design

Date: 2026-07-21 · Status: approved (user picked variant A) · Scope: `apps/mobile` only

## Problem

The 1d Bildirimler screen's top section repeats the same information three times
(description line, "Seni bekleyen X okunmamış güncelleme var" summary sentence,
unread badge on the segment) and uses a long text pill for the mark-all-read
action. The user finds it crowded and tiring.

## Decision (variant A — Slack/Discord pattern)

Single-row header + filter segment, nothing else:

- **Header row:** `Bildirimler` title (existing `notificationsTitle`, 26/800)
  on the left; two 40px icon buttons on the right, both reusing the existing
  `notificationsHeaderIconButton` surface (card bg, subtle border, radius 14):
  1. Mark all read — Ionicons `checkmark-done-outline`, accent color; keeps
     testID `mobile-notifications-mark-all-read` and disabled state
     (`opacity.notificationMarkAllReadDisabled`) when `unreadCount === 0` or
     the mutation is pending.
  2. Notification settings — unchanged (`options-outline`,
     `mobile-notifications-open-settings`).
- **Deleted:** description line (`notificationsDescription`), unread summary
  sentence (`mobile-notifications-summary` + `getMobileNotificationsSummaryLabel`),
  text-pill mark-all-read styles. Unused copy keys removed from tr+en:
  `notificationsDescription`, `notificationsUnreadSummaryOne`,
  `notificationsUnreadSummaryMany`, `notificationsAllCaughtUp`.
- **Unchanged:** filter segment (unread count lives ONLY in its badge, which
  gains testID `mobile-notifications-unread-badge`), permission card, sync
  banner, feed, footer "Tümünü temizle", clear-confirm sheet.

## Tests

`notifications-screen-1d.test.tsx`: summary-text assertions become badge
assertions (badge shows count; absent when caught up); mark-all-read press test
unchanged. No maestro/contract testIDs are affected besides the added badge ID.
