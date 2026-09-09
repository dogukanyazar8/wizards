# Web/Desktop Interaction Parity Design

**Date:** 2026-08-26

## Scope

- Whispr Web and the Tauri desktop WebView.
- Server text-channel messaging parity with the existing DM/group messaging system.
- Double-click reply across DM, group DM, and server text channels.
- Server-channel advanced-search selector parity with the account visibility selector.
- Category empty-state copy and stable channel-creation modal geometry.
- Channel-name policy: 1–48 characters; Unicode letters/numbers, spaces, `_`, and `-`; preserve case and spaces.
- Server voice-room control/stage parity with `design_handoff/app_new/design_handoff_sunucu/design/Sunucu-referans.html`.
- Collapsible server role permission groups with safe group selection.
- Consistent pointer cursors for semantic interactive elements.

## Global Constraints

- Preserve unrelated dirty-worktree changes. No reset, stash, clean, broad refactor, commit, push, deploy, migration, or dependency change.
- Reuse current API, permission, realtime, settings, LiveKit, and design-token contracts.
- Do not make DM-only calls/group-management controls appear in server channels.
- Do not weaken channel permissions to obtain visual or functional parity.
- Do not add new persistence for presentation-only expanded/collapsed state.
- TR and EN copy stay aligned.
- Source HTML is the voice-room measurement and icon authority.

## Messaging

- `ChatArea`, `MessageList`, `MessageItem`, and `MessageInput` remain the shared core.
- Server-channel mode uses the same message row, action menu, reaction, attachment, reply, edit/delete, thread, typing, composer, pin, poll, forward, and search presentation wherever the existing backend contract supports that action.
- Server-only header, member/role mentions, channel permissions, message limit, read-only state, channel pins/search endpoints, and moderation remain mode-specific adapters.
- DM/group call and details controls remain DM/group-only.
- If an action has no server-channel backend contract, it is not faked in UI; the gap is reported separately.

## Double-click Reply

- A double-click on a normal message body calls the existing `onReply(message)` chain.
- It does not fire for deleted/system/optimistic/editing messages.
- It does not fire from `a`, `button`, `input`, `textarea`, `select`, or `[contenteditable]` descendants.
- It does not fire while the user has a non-collapsed text selection.
- Existing keyboard and toolbar Reply actions remain unchanged.

## Search Selectors

- Advanced author, channel, and date-range choices use the same listbox geometry, tokens, focus, Escape, arrow-key, type-ahead, selected mark, and responsive behavior as `SettingSelect`.
- The change is presentation-only. Existing search endpoint and permission semantics remain unchanged.

## Category and Channel Creation

- Empty category drop copy is `Kanalları buraya sürükleyip bırakabilirsin`; EN is equivalent.
- Create-channel modal outer height and footer position do not change when channel type changes.
- The variable advanced-settings region scrolls inside the stable modal body.
- Channel names preserve case and internal spaces. Leading/trailing whitespace is removed and repeated whitespace is collapsed by the existing normalizer.
- UI help text describes the real accepted set; it never claims spaces become hyphens.

## Server Voice Room

- Header: `display:flex`, `align-items:center`, `gap:12px`, `padding:14px 20px`.
- Stage: `padding:16px 20px 4px`, `gap:11px`; active share uses one main stage plus a horizontal participant strip.
- Controls render after the stage with `gap:7px`, `padding:14px 20px 18px`, wrapping as needed.
- Control buttons are 44px high with 15px radius; the settings button is 44×44.
- Camera SVG uses the reference `rect` plus `m15.5 11 6-3.5v9l-6-3.5z` path.
- The top-right quality control is a real accessible popover built from the existing screen-share quality options.
- A new share starts from the persisted Settings preference; changing in-room quality uses the existing LiveKit/store flow.
- The settings control opens `/settings/av/audio` through the existing settings navigation path.

## Role Permissions

- All four groups start expanded and can be collapsed independently for the lifetime of the overlay.
- Each group header has an accessible tri-state select-all control.
- Select-all modifies only visible, editable, real permission keys in that group.
- `alwaysOn` rows remain selected and disabled.
- Owner-only rows remain hidden from non-owners and are never changed by their group control.
- Unknown/non-rendered permission keys remain preserved in the role payload.
- Read-only/protected roles disable group selection.

## Cursor Policy

- Enabled semantic actions (`button`, links with `href`, interactive listbox/options, and explicit button roles) use `cursor: pointer` from one base-layer rule.
- Disabled actions retain `not-allowed` or their existing waiting state.
- Real drag handles keep `grab`/`grabbing`.
- Server rail icons use `pointer` at rest and `grabbing` only during an active reorder.
- Non-interactive containers do not receive pointer cursors.

## Verification

- Every behavior change follows test-first RED → GREEN.
- Focused component/pure-contract tests run before Web typecheck and lint.
- Browser/Tauri visual acceptance is separate evidence; unavailable runtime acceptance is reported as `ENV BLOCKED`, never inferred from tests.
- `graphify update .` runs after source changes; graph update failures remain separate from code/test status.
