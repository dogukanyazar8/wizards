---
type: "query"
date: "2026-08-24T21:14:59.590652+00:00"
question: "Seçilemeyen kanal özellikleri kodda herhangi bir şekilde var mı? NSFW, kanal ikonu/emoji, codec/sample-rate, video çözünürlüğü, kullanıcı bazlı erişim, rateLimitPerUser, arşiv, position, ses slow mode, metin medya ayarları."
contributor: "graphify"
outcome: "useful"
source_nodes: ["ChannelPermissionOverrideRecord", "CHANNEL_SLOW_MODE_DELAYS", "workspace/permissions.ts", "channel-service.ts", "channel-advanced-settings.tsx"]
---

# Q: Seçilemeyen kanal özellikleri kodda herhangi bir şekilde var mı? NSFW, kanal ikonu/emoji, codec/sample-rate, video çözünürlüğü, kullanıcı bazlı erişim, rateLimitPerUser, arşiv, position, ses slow mode, metin medya ayarları.

## Answer

Expanded via graph vocab: [nsfw, age, icon, emoji, codec, sample, resolution, permission, rate, archive, position, slow]. Current source result: NSFW historical only; forward migration removed Channel.isNsfw, Server.isNsfw, UserSettings.nsfwAllowed and current schema test asserts absence. Channel icon/emoji has no Channel field; only type-derived presentation icons and message emoji/reactions. Video codec exists as internal runtime policy: web camera/screen share VP9; mobile H264 with VP8 camera fallback, mobile screen share H264. No channel-selectable codec or audio sample-rate field. Resolution exists as fixed camera tiers and separately selectable screen-share quality, not channel creation. USER permission overrides are supported by DB and resolver, but current create/settings contract exposes allowedRoleIds only and mutation writes ROLE overrides; no in-app USER writer found. rateLimitPerUser exists only in Prisma/baseline migration, with no runtime/API/UI consumer; active slow mode uses slowModeDelay and Redis separately. archived/archiveTimestamp/autoArchiveDuration also exist only in Prisma/migrations, no current runtime/API/UI consumer found. position is real: creation appends automatically; post-create reorder schema/API/UI updates it. Voice slow mode and text media fields exist structurally but type contracts/services reject wrong type; consumers are TEXT message slow mode and VOICE LiveKit only. Static source/schema evidence; runtime/live DB not checked.

## Outcome

- Signal: useful

## Source Nodes

- ChannelPermissionOverrideRecord
- CHANNEL_SLOW_MODE_DELAYS
- workspace/permissions.ts
- channel-service.ts
- channel-advanced-settings.tsx