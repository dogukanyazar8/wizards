---
type: "query"
date: "2026-08-27T08:29:10.682755+00:00"
question: "Ses odasına katılan kullanıcının kullanıcı adının alt kısmı neden kesik görünüyor?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["voice-channel-view.tsx", "ServerVoiceTile", "server-voice-surface.tsx"]
---

# Q: Ses odasına katılan kullanıcının kullanıcı adının alt kısmı neden kesik görünüyor?

## Answer

Expanded from original query via vocab: [voice, voiceroom, channel, participant, participants, presentation, primitives, overflow, username, surface, view, card]. server-voice-surface.tsx ServerVoiceTile içindeki server-voice-tile-name yanlışlıkla DISPLAY_FONT yani Outfit kullanıyor; referans Sunucu.dc.html:525-528 bu adı var(--w-body) yani Figtree ile çiziyor. truncate overflow hidden ve line-height 1 ile yanlış fontun alt glif payını kırpıyor. En küçük çözüm ad satırından DISPLAY_FONT override'ını kaldırmak; rol rozeti display fontunda kalmalı.

## Outcome

- Signal: useful

## Source Nodes

- voice-channel-view.tsx
- ServerVoiceTile
- server-voice-surface.tsx