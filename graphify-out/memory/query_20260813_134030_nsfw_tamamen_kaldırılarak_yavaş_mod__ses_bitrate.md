---
type: "query"
date: "2026-08-13T13:40:30.175855+00:00"
question: "NSFW tamamen kaldırılarak yavaş mod, ses bitrate, kullanıcı limiti, RTC bölgesi ve video kalitesini gerçek özellik yapan üç aşamalı geliştirme planı"
contributor: "graphify"
outcome: "useful"
source_nodes: ["channel-service.ts", "server-service.ts", "capacity.ts", "livekit/server.ts", "workspace-modals.tsx"]
---

# Q: NSFW tamamen kaldırılarak yavaş mod, ses bitrate, kullanıcı limiti, RTC bölgesi ve video kalitesini gerçek özellik yapan üç aşamalı geliştirme planı

## Answer

Expanded from graph vocab: channel, create, update, slow, limit, rtc, region, video, quality, voice, schema, service. Plan: 1 contracts/data: drop three NSFW columns through forward migration, extend strict type-specific channel schemas and detail projections. 2 runtime: Redis-backed server-side slow mode, per-channel voice capacity, LiveKit token media policy, allowlisted RTC endpoint mapping, web/mobile enforcement. 3 web UX and rollout: advanced settings component for create/edit, accessibility/localization, targeted tests, typecheck, E2E, real LiveKit UAT. Preserve current defaults; no arbitrary RTC URLs or fake region choices.

## Outcome

- Signal: useful

## Source Nodes

- channel-service.ts
- server-service.ts
- capacity.ts
- livekit/server.ts
- workspace-modals.tsx